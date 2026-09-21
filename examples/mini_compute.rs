//! cargo run --example mini_compute
//! Deliberately tiny compute rasterizer with independent CPU pixel validation.
//! It teaches coverage and ordered blending; it has no GPU sorter or tile bins.
use bytemuck::{Pod, Zeroable};
use std::{error::Error, fs, path::Path};
use wgpu::util::DeviceExt;

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Splat {
    mean_sigma: [f32; 4],
    rgb_alpha: [f32; 4],
}

fn reference(splats: &[Splat], x: u32, y: u32, size: u32) -> [f32; 3] {
    let mut color = [0.0; 3];
    let focal = 0.8 * size as f32;
    for s in splats {
        let [px, py, z, sigma] = s.mean_sigma;
        if z <= 0.05 {
            continue;
        }
        let dx = x as f32 + 0.5 - (focal * px / z + size as f32 * 0.5);
        let dy = y as f32 + 0.5 - (focal * py / z + size as f32 * 0.5);
        let v = sigma * sigma * focal * focal / (z * z);
        let a = v * (1.0 + px * px / (z * z)) + 0.3;
        let b = v * px * py / (z * z);
        let c = v * (1.0 + py * py / (z * z)) + 0.3;
        let alpha = (s.rgb_alpha[3]
            * (-0.5 * (c * dx * dx - 2.0 * b * dx * dy + a * dy * dy) / (a * c - b * b)).exp())
        .min(0.99);
        if alpha < 1.0 / 255.0 {
            continue;
        }
        for channel in 0..3 {
            color[channel] = s.rgb_alpha[channel] * alpha + color[channel] * (1.0 - alpha);
        }
    }
    color
}

fn main() -> Result<(), Box<dyn Error>> {
    pollster::block_on(run())
}

async fn run() -> Result<(), Box<dyn Error>> {
    const SIZE: u32 = 128;
    let out = Path::new("artifacts/mini-compute");
    fs::create_dir_all(out)?;
    let mut desc = wgpu::InstanceDescriptor::new_without_display_handle();
    if cfg!(target_os = "windows") {
        desc.backends = wgpu::Backends::DX12;
    }
    let instance = wgpu::Instance::new(desc);
    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: None,
            force_fallback_adapter: false,
            apply_limit_buckets: false,
        })
        .await?;
    let (device, queue) = adapter
        .request_device(&wgpu::DeviceDescriptor::default())
        .await?;
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("mini-compute-splat"),
        source: wgpu::ShaderSource::Wgsl(include_str!("mini_splat.wgsl").into()),
    });
    let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
        label: Some("mini-compute"),
        layout: None,
        module: &shader,
        entry_point: Some("main"),
        compilation_options: Default::default(),
        cache: None,
    });
    let extent = wgpu::Extent3d {
        width: SIZE,
        height: SIZE,
        depth_or_array_layers: 1,
    };
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("mini-output"),
        size: extent,
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::STORAGE_BINDING | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let view = texture.create_view(&Default::default());
    let near = Splat {
        mean_sigma: [0.0, 0.0, 2.0, 0.2],
        rgb_alpha: [1.0, 0.0, 0.0, 0.5],
    };
    let far = Splat {
        mean_sigma: [0.0, 0.0, 3.0, 0.3],
        rgb_alpha: [0.0, 0.0, 1.0, 0.5],
    };
    let offset = Splat {
        mean_sigma: [0.4, -0.3, 2.5, 0.16],
        rgb_alpha: [0.0, 1.0, 0.0, 0.7],
    };
    let behind = Splat {
        mean_sigma: [0.0, 0.0, -1.0, 0.2],
        rgb_alpha: [1.0, 1.0, 1.0, 1.0],
    };
    let mut reports = Vec::new();
    let mut center_colors = Vec::new();
    for (name, records) in [
        ("correct-order", vec![far, near]),
        ("reversed-order", vec![near, far]),
        ("off-axis", vec![offset, behind]),
    ] {
        let source = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("mini-splats"),
            contents: bytemuck::cast_slice(&records),
            usage: wgpu::BufferUsages::STORAGE,
        });
        let bindings = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: None,
            layout: &pipeline.get_bind_group_layout(0),
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: source.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&view),
                },
            ],
        });
        let readback = device.create_buffer(&wgpu::BufferDescriptor {
            label: None,
            size: u64::from(SIZE * SIZE * 4),
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let mut commands = device.create_command_encoder(&Default::default());
        {
            let mut pass = commands.begin_compute_pass(&Default::default());
            pass.set_pipeline(&pipeline);
            pass.set_bind_group(0, &bindings, &[]);
            pass.dispatch_workgroups(SIZE.div_ceil(8), SIZE.div_ceil(8), 1);
        }
        commands.copy_texture_to_buffer(
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
                    bytes_per_row: Some(SIZE * 4),
                    rows_per_image: Some(SIZE),
                },
            },
            extent,
        );
        queue.submit([commands.finish()]);
        let (tx, rx) = std::sync::mpsc::channel();
        readback.slice(..).map_async(wgpu::MapMode::Read, move |r| {
            let _ = tx.send(r);
        });
        device.poll(wgpu::PollType::wait_indefinitely())?;
        rx.recv()??;
        let pixels = readback.slice(..).get_mapped_range()?.to_vec();
        readback.unmap();
        let mut max_error = 0.0_f32;
        for y in 0..SIZE {
            for x in 0..SIZE {
                let expected = reference(&records, x, y, SIZE);
                for c in 0..3 {
                    max_error = max_error.max(
                        (pixels[((y * SIZE + x) * 4) as usize + c] as f32 / 255.0 - expected[c])
                            .abs(),
                    );
                }
            }
        }
        if max_error > 1.1 / 255.0 {
            return Err(format!("CPU/GPU mismatch: {max_error}").into());
        }
        let center = &pixels[((SIZE / 2 * SIZE + SIZE / 2) * 4) as usize..][..3];
        center_colors.push(center.to_vec());
        let mut png = png::Encoder::new(
            fs::File::create(out.join(format!("{name}.png")))?,
            SIZE,
            SIZE,
        );
        png.set_color(png::ColorType::Rgba);
        png.set_depth(png::BitDepth::Eight);
        png.write_header()?.write_image_data(&pixels)?;
        reports.push(serde_json::json!({"case":name,"maxAbsoluteChannelError":max_error,"centerRgb8":center}));
    }
    if center_colors[0] == center_colors[1] {
        return Err("Order reversal had no effect".into());
    }
    let report = serde_json::json!({"adapter":adapter.get_info().name,"backend":format!("{:?}",adapter.get_info().backend),"cases":reports,
        "scope":"WGSL compute projection/coverage/compositing; CPU pixel oracle; no tile binning or GPU sorting"});
    fs::write(
        out.join("report.json"),
        serde_json::to_string_pretty(&report)?,
    )?;
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}
