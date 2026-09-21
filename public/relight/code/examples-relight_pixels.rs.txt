//! Focused native GPU image checks. This is not a frame-rate benchmark.
use pajama_gaussian_lab::relight::{RelightFrame as Frame, RelightPass};
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
    let format = if std::env::args().any(|arg| arg == "--srgb") {
        wgpu::TextureFormat::Rgba8UnormSrgb
    } else {
        wgpu::TextureFormat::Rgba8Unorm
    };
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("relight-pixel-target"),
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
        label: Some("relight-readback"),
        size: u64::from(stride * height),
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });
    let mut renderer = RelightPass::new(&device, format);
    let base = Frame::default();
    let cases = [
        ("combined", base),
        (
            "light-right",
            Frame {
                azimuth: 1.0,
                ..base
            },
        ),
        (
            "dark",
            Frame {
                intensity: 0.0,
                ..base
            },
        ),
        ("diffuse", Frame { mode: 1, ..base }),
        (
            "metal-diffuse",
            Frame {
                mode: 1,
                metallic: 1.0,
                ..base
            },
        ),
        ("specular", Frame { mode: 2, ..base }),
        (
            "rough-specular",
            Frame {
                mode: 2,
                roughness: 0.9,
                ..base
            },
        ),
        ("albedo", Frame { mode: 4, ..base }),
        (
            "albedo-dark",
            Frame {
                mode: 4,
                intensity: 0.0,
                azimuth: 2.0,
                ..base
            },
        ),
        ("deform", Frame { time: 0.25, ..base }),
        (
            "bad-normals",
            Frame {
                time: 0.25,
                wrong_normals: true,
                ..base
            },
        ),
        ("orbit", Frame { yaw: 0.8, ..base }),
        ("normals", Frame { mode: 3, ..base }),
    ];
    fs::create_dir_all("artifacts/relight")?;
    let mut images = std::collections::BTreeMap::new();
    let mut reports = Vec::new();
    for (name, frame) in cases {
        let mut encoder = device.create_command_encoder(&Default::default());
        renderer.render(
            &device,
            &queue,
            &mut encoder,
            &target,
            [width, height],
            frame,
        )?;
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
        let center = rgba[((height / 2 * width + width / 2) * 4) as usize..][..4].to_vec();
        let mut png = png::Encoder::new(
            fs::File::create(format!("artifacts/relight/{name}.png"))?,
            width,
            height,
        );
        png.set_color(png::ColorType::Rgba);
        png.set_depth(png::BitDepth::Eight);
        png.write_header()?.write_image_data(&rgba)?;
        reports
            .push(serde_json::json!({"name":name,"colored_pixels":colored,"center_rgba":center}));
        images.insert(name, rgba);
    }
    let changed = |a: &str, b: &str| {
        images[a]
            .iter()
            .zip(&images[b])
            .filter(|(a, b)| a.abs_diff(**b) > 2)
            .count()
    };
    assert_eq!(
        images["albedo"], images["albedo-dark"],
        "Albedo must not contain light"
    );
    assert_eq!(
        images["dark"], images["metal-diffuse"],
        "Metal has zero diffuse term"
    );
    for (a, b) in [
        ("combined", "light-right"),
        ("combined", "dark"),
        ("specular", "rough-specular"),
        ("deform", "bad-normals"),
        ("combined", "orbit"),
    ] {
        assert!(
            changed(a, b) > 500,
            "{a}/{b}: insufficient image difference"
        );
    }
    let center = ((height / 2 * width + width / 2) * 4) as usize;
    for (channel, expected) in [195_u8, 104, 60].into_iter().enumerate() {
        assert!(
            images["albedo"][center + channel].abs_diff(expected) <= 1,
            "Base color must be sRGB encoded exactly once"
        );
    }
    assert!(images["combined"][center] > 80, "Expected a lit surface");
    let report = serde_json::json!({"schema":"pajama.relight.pixel-check.v1","adapter":info.name,"backend":format!("{:?}",info.backend),"resolution":[width,height],"passed":true,"cases":reports,"claims":["light changes radiance","roughness changes highlight","albedo independent of light","metal diffuse zero","normal transform changes shading","camera changes pixels"],"note":"Native offscreen checks; not all-platform certification or paper reproduction."});
    fs::write(
        "artifacts/relight/report.json",
        serde_json::to_string_pretty(&report)?,
    )?;
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}
