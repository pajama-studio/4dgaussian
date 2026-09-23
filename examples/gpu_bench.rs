//! cargo run --release --example gpu_bench -- model.ply[.gz] cameras.json output-dir
//! Paired render-pass timestamps and image comparisons; not presentation FPS.
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
    let width = 1280_u32;
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
        .request_device(&wgpu::DeviceDescriptor {
            required_features: wgpu::Features::TIMESTAMP_QUERY,
            ..Default::default()
        })
        .await?;
    let format = wgpu::TextureFormat::Rgba8Unorm;
    let mut variants: Vec<_> = (0..3)
        .map(|gpu| StgPass::with_options(&device, &ply, format, None, 4, gpu).unwrap())
        .collect();
    let queries = device.create_query_set(&wgpu::QuerySetDescriptor {
        label: Some("paired-timestamps"),
        ty: wgpu::QueryType::Timestamp,
        count: 2,
    });
    let resolve = device.create_buffer(&wgpu::BufferDescriptor {
        label: None,
        size: 16,
        usage: wgpu::BufferUsages::QUERY_RESOLVE | wgpu::BufferUsages::COPY_SRC,
        mapped_at_creation: false,
    });
    let times = device.create_buffer(&wgpu::BufferDescriptor {
        label: None,
        size: 16,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });
    let mut timings = vec![Vec::new(); 3];
    let mut baseline_images: Vec<Vec<u8>> = Vec::new();
    let mut errors = Vec::new();
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
    for round in 0..9 {
        for step in 0..3 {
            let variant = (round + step) % 3;
            let splats = &mut variants[variant];
            for index in 0..12 {
                let time = [0.1_f32, 0.5, 0.9][index % 3];
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
                        timestamp_writes: Some(wgpu::RenderPassTimestampWrites {
                            query_set: &queries,
                            beginning_of_pass_write_index: Some(0),
                            end_of_pass_write_index: Some(1),
                        }),
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
                encoder.resolve_query_set(&queries, 0..2, &resolve, 0);
                encoder.copy_buffer_to_buffer(&resolve, 0, &times, 0, 16);
                queue.submit([encoder.finish()]);
                let (ts, tr) = std::sync::mpsc::channel();
                times.slice(..).map_async(wgpu::MapMode::Read, move |r| {
                    let _ = ts.send(r);
                });
                let (send, receive) = std::sync::mpsc::channel();
                readback
                    .slice(..)
                    .map_async(wgpu::MapMode::Read, move |result| {
                        let _ = send.send(result);
                    });
                device.poll(wgpu::PollType::wait_indefinitely())?;
                receive.recv()??;
                tr.recv()??;
                let timestamp_data = times.slice(..).get_mapped_range()?;
                let begin = u64::from_le_bytes(timestamp_data[0..8].try_into().unwrap());
                let end = u64::from_le_bytes(timestamp_data[8..16].try_into().unwrap());
                if round >= 2 {
                    timings[variant]
                        .push((end - begin) as f64 * queue.get_timestamp_period() as f64 / 1e6);
                }
                drop(timestamp_data);
                times.unmap();
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
                if round == 0 && index < 3 {
                    if variant == 0 {
                        baseline_images.push(rgba.clone());
                    } else {
                        let base = &baseline_images[index];
                        let mse = rgba
                            .iter()
                            .zip(base)
                            .map(|(&a, &b)| ((a as f64) - (b as f64)).powi(2))
                            .sum::<f64>()
                            / rgba.len() as f64;
                        let max = rgba
                            .iter()
                            .zip(base)
                            .map(|(&a, &b)| a.abs_diff(b))
                            .max()
                            .unwrap();
                        errors.push(serde_json::json!({"variant":variant,"time":time,"rmse8bit":mse.sqrt(),"max8bit":max,"visible":stats.visible_count}));
                        if mse.sqrt() > 0.25 {
                            return Err(format!(
                                "Image regression: variant {variant} RMSE {}",
                                mse.sqrt()
                            )
                            .into());
                        }
                    }
                    let filename = output.join(format!("v{variant}-t{index}.png"));
                    let mut png = png::Encoder::new(fs::File::create(filename)?, width, height);
                    png.set_color(png::ColorType::Rgba);
                    png.set_depth(png::BitDepth::Eight);
                    png.write_header()?.write_image_data(&rgba)?;
                }
                let _ = prepare_ms;
            }
        }
    }
    for (variant, samples) in timings.iter().enumerate() {
        let mut sorted = samples.clone();
        sorted.sort_by(f64::total_cmp);
        reports.push(serde_json::json!({"variant":variant,"p50GpuMs":sorted[sorted.len()/2],"p95GpuMs":sorted[sorted.len()*95/100],"samplesMs":samples}));
        println!(
            "v{variant}: GPU p50 {:.5}, p95 {:.5}",
            sorted[sorted.len() / 2],
            sorted[sorted.len() * 95 / 100]
        );
    }
    let report = serde_json::json!({
        "adapter": info.name, "backend": format!("{:?}", info.backend),
        "model": model, "cameraFixture": cameras, "width": width, "height": height,
        "scope": "paired GPU render-pass timestamps; 2 warmup + 7 rounds x 12 frames; synchronous readback outside query; rotated variant order; not presentation FPS", "results": reports, "imageErrors":errors,
    });
    let report = serde_json::to_string_pretty(&report)?;
    fs::write(output.join("report.json"), &report)?;
    println!("Report: {}", output.display());
    Ok(())
}
