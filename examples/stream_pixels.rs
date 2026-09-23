//! cargo run --release --example stream_pixels -- model.ply[.gz] cameras.json output-dir scene-id
//! Full-source baseline versus streamed production pixel equivalence.
use flate2::read::GzDecoder;
use glam::{Mat4, Vec3};
use pajama_gaussian_lab::stg_pass::StgPass;
use std::{error::Error, fs, io::Read, path::PathBuf};

fn main() -> Result<(), Box<dyn Error>> {
    pollster::block_on(run())
}

async fn run() -> Result<(), Box<dyn Error>> {
    let args: Vec<String> = std::env::args().collect();
    let model = args
        .get(1)
        .map(String::as_str)
        .unwrap_or("public/data/n3d-sear-steak-stg-lite.ply.gz");
    let cameras = args
        .get(2)
        .map(String::as_str)
        .unwrap_or("public/data/n3d-sear-steak-reference-cameras.json");
    let output = PathBuf::from(
        args.get(3)
            .map(String::as_str)
            .unwrap_or("artifacts/native"),
    );
    fs::create_dir_all(&output)?;
    let raw = fs::read(model)?;
    let mut ply = Vec::new();
    if raw.starts_with(&[0x1f, 0x8b]) {
        GzDecoder::new(raw.as_slice()).read_to_end(&mut ply)?;
    } else {
        ply = raw;
    }
    let fixture: serde_json::Value = serde_json::from_slice(&fs::read(cameras)?)?;
    let camera = if fixture.is_array() {
        &fixture[0]
    } else {
        &fixture["cameras"][0]
    };
    let vector = |name: &str| -> Result<Vec3, Box<dyn Error>> {
        let value = |i: usize| -> Result<f32, Box<dyn Error>> {
            camera[name][i]
                .as_f64()
                .map(|v| v as f32)
                .ok_or_else(|| format!("Invalid camera {name}").into())
        };
        Ok(Vec3::new(value(0)?, value(1)?, value(2)?))
    };
    let eye = vector("position")?;
    let rotation = &camera["rotation"];
    let column = |c: usize| -> Result<Vec3, Box<dyn Error>> {
        let v = |r: usize| -> Result<f32, Box<dyn Error>> {
            rotation[r][c]
                .as_f64()
                .map(|v| v as f32)
                .ok_or_else(|| "Invalid camera rotation".into())
        };
        Ok(Vec3::new(v(0)?, v(1)?, v(2)?))
    };
    let view = Mat4::look_at_rh(eye, eye + column(2)?, -column(1)?);
    let camera_height = camera["height"].as_f64().ok_or("Missing camera height")? as f32;
    let camera_width = camera["width"].as_f64().ok_or("Missing camera width")? as f32;
    let fy = camera["fy"].as_f64().ok_or("Missing camera fy")? as f32;
    let width = 640_u32;
    let height = (width as f32 * camera_height / camera_width).round() as u32;
    let projection = Mat4::perspective_rh(
        2.0 * (camera_height / (2.0 * fy)).atan(),
        width as f32 / height as f32,
        0.05,
        180.0,
    );
    let mut descriptor = wgpu::InstanceDescriptor::new_without_display_handle();
    if cfg!(target_os = "windows") {
        descriptor.backends = wgpu::Backends::DX12;
    }
    let instance = wgpu::Instance::new(descriptor);
    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: None,
            force_fallback_adapter: false,
            apply_limit_buckets: false,
        })
        .await?;
    let info = adapter.get_info();
    let (device, queue) = adapter
        .request_device(&wgpu::DeviceDescriptor::default())
        .await?;
    let format = wgpu::TextureFormat::Rgba8Unorm;
    let id = args.get(4).ok_or("stream scene ID required")?;
    let mut baseline = StgPass::with_options(&device, &ply, format, None, 0, 0)?;
    let mut windows: Vec<_> = (0..3)
        .map(|i| {
            let bytes = fs::read(format!(
                "artifacts/streaming/window-validation/{id}-{i}.ply"
            ))
            .unwrap();
            StgPass::new(&device, &bytes, format, None).unwrap()
        })
        .collect();
    let mut reference: Vec<Vec<u8>> = Vec::new();
    let extent = wgpu::Extent3d {
        width,
        height,
        depth_or_array_layers: 1,
    };
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("stg-smoke-color"),
        size: extent,
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let target = texture.create_view(&Default::default());
    let stride = (width * 4).div_ceil(256) * 256;
    let readback = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("stg-smoke-readback"),
        size: u64::from(stride) * u64::from(height),
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });
    let mut reports = Vec::new();
    for mode in 0..2 {
        for (index, time) in [0.1_f32, 0.5, 0.9].into_iter().enumerate() {
            let splats = if mode == 0 {
                &mut baseline
            } else {
                &mut windows[index]
            };
            let started = std::time::Instant::now();
            let stats = splats.prepare(
                &queue,
                time,
                view.to_cols_array_2d(),
                projection.to_cols_array_2d(),
                [width, height],
            )?;
            let prepare_ms = started.elapsed().as_secs_f64() * 1000.0;
            let mut encoder = device.create_command_encoder(&Default::default());
            {
                let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("native-stg-smoke"),
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view: &target,
                        resolve_target: None,
                        depth_slice: None,
                        ops: wgpu::Operations {
                            load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                            store: wgpu::StoreOp::Store,
                        },
                    })],
                    depth_stencil_attachment: None,
                    timestamp_writes: None,
                    occlusion_query_set: None,
                    multiview_mask: None,
                });
                splats.draw(&mut pass);
            }
            encoder.copy_texture_to_buffer(
                wgpu::TexelCopyTextureInfo {
                    texture: &texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                wgpu::TexelCopyBufferInfo {
                    buffer: &readback,
                    layout: wgpu::TexelCopyBufferLayout {
                        offset: 0,
                        bytes_per_row: Some(stride),
                        rows_per_image: Some(height),
                    },
                },
                extent,
            );
            queue.submit([encoder.finish()]);
            let (send, receive) = std::sync::mpsc::channel();
            readback
                .slice(..)
                .map_async(wgpu::MapMode::Read, move |result| {
                    let _ = send.send(result);
                });
            device.poll(wgpu::PollType::wait_indefinitely())?;
            receive.recv()??;
            let mapped = readback.slice(..).get_mapped_range()?;
            let mut rgba = Vec::with_capacity((width * height * 4) as usize);
            for row in mapped.chunks_exact(stride as usize) {
                rgba.extend_from_slice(&row[..(width * 4) as usize]);
            }
            drop(mapped);
            readback.unmap();
            let colored = rgba
                .chunks_exact(4)
                .filter(|p| p[0] > 4 || p[1] > 4 || p[2] > 4)
                .count();
            if stats.visible_count == 0 || colored < 100 {
                return Err("Render is empty".into());
            }
            let max_error = if mode == 0 {
                reference.push(rgba.clone());
                0
            } else {
                rgba.iter()
                    .zip(&reference[index])
                    .map(|(a, b)| a.abs_diff(*b))
                    .max()
                    .unwrap()
            };
            if max_error != 0 {
                return Err(format!("Window pixel mismatch: time {time}, max {max_error}").into());
            }
            let again = splats.prepare(
                &queue,
                time,
                view.to_cols_array_2d(),
                projection.to_cols_array_2d(),
                [width, height],
            )?;
            if mode == 1 && again.index_upload_bytes != 0 {
                return Err("Unchanged frame uploaded indices".into());
            }
            let filename = output.join(format!("mode-{mode}-frame-{index}.png"));
            let mut encoder = png::Encoder::new(fs::File::create(filename)?, width, height);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            encoder.write_header()?.write_image_data(&rgba)?;
            reports.push(serde_json::json!({"streamed":mode==1,"time":time,"resident":stats.source_count,"visible":stats.visible_count,"maxPixelError":max_error,"prepareMsSmokeOnly":prepare_ms,"firstIndexUploadBytes":stats.index_upload_bytes,"repeatIndexUploadBytes":again.index_upload_bytes}));
        }
    }
    let report = serde_json::json!({
        "adapter": info.name, "backend": format!("{:?}", info.backend),
        "model": model, "cameraFixture": cameras, "width": width, "height": height,
        "scope": "native GPU smoke; synchronous readback; not a performance benchmark", "frames": reports,
    });
    let report = serde_json::to_string_pretty(&report)?;
    fs::write(output.join("report.json"), &report)?;
    println!(
        "Pixel equality and upload checks passed: {}",
        output.display()
    );
    Ok(())
}
