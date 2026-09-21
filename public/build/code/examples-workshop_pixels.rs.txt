//! Focused native GPU image checks. This is not a frame-rate benchmark.
use pajama_gaussian_lab::workshop::{Frame, WorkshopPass};
use std::{error::Error, fs};

fn main() -> Result<(), Box<dyn Error>> {
    pollster::block_on(run())
}

async fn run() -> Result<(), Box<dyn Error>> {
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
    let (width, height) = (256_u32, 192_u32);
    let extent = wgpu::Extent3d {
        width,
        height,
        depth_or_array_layers: 1,
    };
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("workshop-pixel-target"),
        size: extent,
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let target = texture.create_view(&Default::default());
    let stride = (width * 4).div_ceil(256) * 256;
    let readback = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("workshop-readback"),
        size: u64::from(stride * height),
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });
    let mut renderer = WorkshopPass::new(&device, wgpu::TextureFormat::Rgba8Unorm);
    let mut cases: Vec<(String, Frame)> = (0..=6)
        .map(|stage| {
            (
                format!("stage-{stage}"),
                Frame {
                    stage,
                    ..Frame::default()
                },
            )
        })
        .collect();
    cases.extend([
        (
            "reverse".into(),
            Frame {
                stage: 4,
                reverse_order: true,
                ..Frame::default()
            },
        ),
        (
            "orbit".into(),
            Frame {
                stage: 5,
                yaw: 0.8,
                ..Frame::default()
            },
        ),
        (
            "time-early".into(),
            Frame {
                stage: 6,
                time: 0.1,
                ..Frame::default()
            },
        ),
        (
            "time-late".into(),
            Frame {
                stage: 6,
                time: 0.9,
                ..Frame::default()
            },
        ),
    ]);
    fs::create_dir_all("artifacts/workshop")?;
    let mut images = std::collections::BTreeMap::new();
    let mut reports = Vec::new();
    for (name, frame) in cases {
        let count = renderer.prepare(&queue, frame, [width, height])?;
        let mut encoder = device.create_command_encoder(&Default::default());
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("workshop-pixel-test"),
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
            renderer.draw(&mut pass);
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
        let mut rgba = Vec::new();
        for row in mapped.chunks_exact(stride as usize) {
            rgba.extend_from_slice(&row[..(width * 4) as usize]);
        }
        drop(mapped);
        readback.unmap();
        let colored = rgba
            .chunks_exact(4)
            .filter(|p| p[..3].iter().any(|v| *v > 3))
            .count();
        assert!(
            if frame.stage == 0 {
                colored == 0 && count == 0
            } else {
                colored > 100
            },
            "{name}: unexpected coverage"
        );
        let center = rgba[((height / 2 * width + width / 2) * 4) as usize..][..4].to_vec();
        let mut png = png::Encoder::new(
            fs::File::create(format!("artifacts/workshop/{name}.png"))?,
            width,
            height,
        );
        png.set_color(png::ColorType::Rgba);
        png.set_depth(png::BitDepth::Eight);
        png.write_header()?.write_image_data(&rgba)?;
        reports.push(serde_json::json!({"name":name,"instances":count,"colored_pixels":colored,"center_rgba":center}));
        images.insert(name, rgba);
    }
    let pixel = |name: &str, x: u32, y: u32| -> &[u8] {
        &images[name][((y * width + x) * 4) as usize..][..4]
    };
    let center = |name: &str| pixel(name, width / 2, height / 2);
    assert_eq!(
        &center("stage-2")[..3],
        &[255, 115, 20],
        "Solid quad must use the uploaded RGB"
    );
    assert!(
        center("stage-3")[0] > pixel("stage-3", width / 2 + 45, height / 2)[0] + 60,
        "Gaussian must fall off away from center"
    );
    for (name, expected) in [
        ("stage-4", [127.5, 15.9375, 63.75]),
        ("reverse", [63.75, 31.875, 127.5]),
    ] {
        for (actual, expected) in center(name)[..3].iter().zip(expected) {
            assert!(
                (*actual as f32 - expected).abs() <= 2.0,
                "{name}: alpha reference mismatch"
            );
        }
    }
    let changed = |a: &str, b: &str| {
        images[a]
            .iter()
            .zip(&images[b])
            .filter(|(a, b)| a.abs_diff(**b) > 2)
            .count()
    };
    assert!(
        changed("stage-5", "orbit") > 500,
        "Camera must change the projected footprint"
    );
    assert!(
        changed("time-early", "time-late") > 500,
        "Time must change the rendered scene"
    );
    let report = serde_json::json!({
        "schema":"pajama.workshop.pixel-check.v1", "adapter":info.name, "backend":format!("{:?}",info.backend),
        "resolution":[width,height], "claims":["clear", "triangle coverage", "storage RGB", "Gaussian falloff", "premultiplied alpha order", "camera changes pixels", "time changes pixels"],
        "cases":reports, "passed":true, "note":"Offscreen correctness checks, not a throughput benchmark or all-platform validation."
    });
    fs::write(
        "artifacts/workshop/report.json",
        serde_json::to_string_pretty(&report)?,
    )?;
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}
