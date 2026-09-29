//! cargo run --release --example gpu_driven_bench -- model.ply[.gz] cameras.json output-dir
//! Same records, full-f32 sorting, camera/time sequence, resolution and shader.
//! Timing excludes image/order readbacks; serialized latency is NOT display FPS.
use flate2::read::GzDecoder;
use glam::{Mat4, Vec3};
use pajama_gaussian_lab::{stg_pass::StgPass, stg_prepare::StgPreparation};
use std::{error::Error, fs, io::Read, path::PathBuf, time::Instant};
type Result<T> = std::result::Result<T, Box<dyn Error>>;

fn read_buffer(device: &wgpu::Device, buffer: &wgpu::Buffer) -> Result<Vec<u8>> {
    let (send, recv) = std::sync::mpsc::channel();
    buffer.slice(..).map_async(wgpu::MapMode::Read, move |r| {
        let _ = send.send(r);
    });
    device.poll(wgpu::PollType::wait_indefinitely())?;
    recv.recv()??;
    let data = buffer.slice(..).get_mapped_range()?.to_vec();
    buffer.unmap();
    Ok(data)
}
fn quantiles(samples: &[f64]) -> serde_json::Value {
    let mut sorted = samples.to_vec();
    sorted.sort_by(f64::total_cmp);
    serde_json::json!({"p50":sorted[sorted.len()/2],"p95":sorted[sorted.len()*95/100],"samples":samples})
}
fn camera(c: &serde_json::Value, width: u32) -> (Mat4, Mat4, u32) {
    let v = |x: &serde_json::Value| x.as_f64().unwrap() as f32;
    let eye = Vec3::new(
        v(&c["position"][0]),
        v(&c["position"][1]),
        v(&c["position"][2]),
    );
    let col = |i| {
        Vec3::new(
            v(&c["rotation"][0][i]),
            v(&c["rotation"][1][i]),
            v(&c["rotation"][2][i]),
        )
    };
    let h = v(&c["height"]);
    let w = v(&c["width"]);
    let height = (width as f32 * h / w).round() as u32;
    (
        Mat4::look_at_rh(eye, eye + col(2), -col(1)),
        Mat4::perspective_rh(
            2.0 * (h / (2.0 * v(&c["fy"]))).atan(),
            width as f32 / height as f32,
            0.05,
            180.0,
        ),
        height,
    )
}
fn main() -> Result<()> {
    pollster::block_on(run())
}
async fn run() -> Result<()> {
    let args: Vec<_> = std::env::args().collect();
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
            .unwrap_or("artifacts/gpu-driven-sear"),
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
    let cameras_list = if fixture.is_array() {
        fixture.as_array().unwrap()
    } else {
        fixture["cameras"].as_array().unwrap()
    };
    let width = 1280;
    let (_, _, height) = camera(&cameras_list[0], width);
    let cases: Vec<_> = [0, cameras_list.len() / 2, cameras_list.len() - 1]
        .into_iter()
        .flat_map(|id| {
            let (view, projection, _) = camera(&cameras_list[id], width);
            [0.0, 0.333, 0.667, 1.0]
                .into_iter()
                .map(move |time| (id, time, view, projection))
        })
        .collect();
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
    let info = adapter.get_info();
    let (device, queue) = adapter
        .request_device(&wgpu::DeviceDescriptor {
            required_features: wgpu::Features::TIMESTAMP_QUERY,
            ..Default::default()
        })
        .await?;
    let format = wgpu::TextureFormat::Rgba8Unorm;
    let mut variants = [
        StgPass::new(&device, &ply, format, None)?,
        StgPass::new_gpu(&device, &ply, format, None)?,
    ];
    let mut reference = StgPreparation::from_ply_adaptive(&ply)?;
    let count = reference.len();
    let payload_offset = ply.windows(11).position(|x| x == b"end_header\n").unwrap() + 11;
    let buffer = |name, size, usage| {
        device.create_buffer(&wgpu::BufferDescriptor {
            label: Some(name),
            size,
            usage,
            mapped_at_creation: false,
        })
    };
    let read_usage = wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ;
    let queries = device.create_query_set(&wgpu::QuerySetDescriptor {
        label: Some("complete-frame-timing"),
        ty: wgpu::QueryType::Timestamp,
        count: 4,
    });
    let resolve = buffer(
        "timestamps",
        32,
        wgpu::BufferUsages::QUERY_RESOLVE | wgpu::BufferUsages::COPY_SRC,
    );
    let times = buffer("time-readback", 32, read_usage);
    let args_read = buffer("args-readback", 16, read_usage);
    let keys_read = buffer("keys-readback", count as u64 * 8, read_usage);
    let extent = wgpu::Extent3d {
        width,
        height,
        depth_or_array_layers: 1,
    };
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("same-resolution-target"),
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
    let pixels_read = buffer("pixels-readback", stride as u64 * height as u64, read_usage);
    let mut images = Vec::<Vec<u8>>::new();
    let mut accuracy = Vec::new();
    let mut cpu = [Vec::new(), Vec::new()];
    let mut gpu = cpu.clone();
    let mut raster = cpu.clone();
    let mut wall = cpu.clone();
    for round in 0..9 {
        for offset in 0..2 {
            let variant = (round + offset) % 2;
            for (index, &(camera_id, time, view, projection)) in cases.iter().enumerate() {
                let splats = &mut variants[variant];
                let start = Instant::now();
                let stats = splats.prepare(
                    &queue,
                    time,
                    view.to_cols_array_2d(),
                    projection.to_cols_array_2d(),
                    [width, height],
                )?;
                let mut encoder = device.create_command_encoder(&Default::default());
                splats.encode_prepare(&queue, &mut encoder, Some((&queries, 0, 1)));
                {
                    let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                        label: Some("same-splat-shader"),
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
                            beginning_of_pass_write_index: Some(2),
                            end_of_pass_write_index: Some(3),
                        }),
                        occlusion_query_set: None,
                        multiview_mask: None,
                    });
                    splats.draw(&mut pass);
                }
                encoder.resolve_query_set(
                    &queries,
                    if variant == 1 { 0..4 } else { 2..4 },
                    &resolve,
                    0,
                );
                encoder.copy_buffer_to_buffer(
                    &resolve,
                    0,
                    &times,
                    0,
                    if variant == 1 { 32 } else { 16 },
                );
                let encode_ms = start.elapsed().as_secs_f64() * 1000.0;
                queue.submit([encoder.finish()]);
                // Wait for completion, including a fixed small timestamp copy. No pixels or ID list in this interval.
                device.poll(wgpu::PollType::wait_indefinitely())?;
                let wall_ms = start.elapsed().as_secs_f64() * 1000.0;
                let td = read_buffer(&device, &times)?;
                let ts: Vec<_> = td
                    .chunks_exact(8)
                    .map(|b| u64::from_le_bytes(b.try_into().unwrap()))
                    .collect();
                let factor = queue.get_timestamp_period() as f64 / 1e6;
                let raster_ms = if variant == 1 {
                    (ts[3] - ts[2]) as f64 * factor
                } else {
                    (ts[1] - ts[0]) as f64 * factor
                };
                let total_ms = if variant == 1 {
                    (ts[3] - ts[0]) as f64 * factor
                } else {
                    raster_ms
                };
                if round >= 2 {
                    cpu[variant].push(encode_ms);
                    gpu[variant].push(total_ms);
                    raster[variant].push(raster_ms);
                    wall[variant].push(wall_ms);
                }
                if round == 0 {
                    let mut encoder = device.create_command_encoder(&Default::default());
                    encoder.copy_texture_to_buffer(
                        wgpu::TexelCopyTextureInfo {
                            texture: &texture,
                            mip_level: 0,
                            origin: wgpu::Origin3d::ZERO,
                            aspect: wgpu::TextureAspect::All,
                        },
                        wgpu::TexelCopyBufferInfo {
                            buffer: &pixels_read,
                            layout: wgpu::TexelCopyBufferLayout {
                                offset: 0,
                                bytes_per_row: Some(stride),
                                rows_per_image: Some(height),
                            },
                        },
                        extent,
                    );
                    if let Some(g) = &splats.gpu {
                        encoder.copy_buffer_to_buffer(&g.indirect, 0, &args_read, 0, 16);
                        encoder.copy_buffer_to_buffer(&g.keys, 0, &keys_read, 0, count as u64 * 8);
                    }
                    queue.submit([encoder.finish()]);
                    let padded = read_buffer(&device, &pixels_read)?;
                    let rgba: Vec<u8> = padded
                        .chunks_exact(stride as usize)
                        .flat_map(|r| r[..width as usize * 4].iter().copied())
                        .collect();
                    if variant == 0 {
                        images.push(rgba.clone());
                    } else {
                        let draw = read_buffer(&device, &args_read)?;
                        let visible = u32::from_le_bytes(draw[4..8].try_into().unwrap()) as usize;
                        let bytes = read_buffer(&device, &keys_read)?;
                        let pairs: Vec<_> = bytes
                            .chunks_exact(8)
                            .map(|b| {
                                (
                                    u32::from_le_bytes(b[..4].try_into().unwrap()),
                                    u32::from_le_bytes(b[4..].try_into().unwrap()),
                                )
                            })
                            .collect();
                        if pairs.windows(2).any(|p| p[0] > p[1]) {
                            return Err("GPU sort is not stable / ordered".into());
                        }
                        let mut all_ids: Vec<_> = pairs.iter().map(|x| x.1).collect();
                        all_ids.sort_unstable();
                        if all_ids.iter().enumerate().any(|(i, &id)| i as u32 != id) {
                            return Err("GPU sort lost/duplicated an ID".into());
                        }
                        if visible != pairs.iter().filter(|x| x.0 != u32::MAX).count() {
                            return Err("Indirect count disagrees with culled keys".into());
                        }
                        let cpu_ids = reference.prepare(time, view, projection, 9);
                        let mut expected = cpu_ids.to_vec();
                        expected.sort_unstable();
                        let mut actual: Vec<_> = pairs[..visible].iter().map(|x| x.1).collect();
                        actual.sort_unstable();
                        let matching_set = expected == actual;
                        // CPU exp() and WGSL exp() have different rounding. Do not
                        // hide differing IDs: only a tight temporal-threshold band
                        // is permitted, and every such ID/value is in the report.
                        let differing: Vec<_> = expected
                            .iter()
                            .filter(|id| actual.binary_search(id).is_err())
                            .chain(
                                actual
                                    .iter()
                                    .filter(|id| expected.binary_search(id).is_err()),
                            )
                            .copied()
                            .collect();
                        let boundaries: Vec<_> = differing.iter().map(|&id| {
                            let field = |i:usize| { let offset=payload_offset+id as usize*128+i*4; f32::from_le_bytes(ply[offset..offset+4].try_into().unwrap()) };
                            let ratio=(time-field(3))/field(4).exp().max(1e-6);
                            let alpha=(1.0/(1.0+(-field(20)).exp()))*(-ratio*ratio).exp();
                            serde_json::json!({"id":id,"cpuOpacity":alpha,"cutoff":1.0f32/255.0,"cpuVisible":expected.binary_search(&id).is_ok(),"within16UlpCutoffBand":(alpha-1.0/255.0).abs()<=16.0*f32::EPSILON*(1.0/255.0)})
                        }).collect();
                        let only_threshold_rounding = boundaries
                            .iter()
                            .all(|x| x["within16UlpCutoffBand"] == true);
                        if !matching_set {
                            println!(
                                "CPU-only IDs: {:?}; GPU-only IDs: {:?}",
                                expected
                                    .iter()
                                    .filter(|id| actual.binary_search(id).is_err())
                                    .collect::<Vec<_>>(),
                                actual
                                    .iter()
                                    .filter(|id| expected.binary_search(id).is_err())
                                    .collect::<Vec<_>>()
                            );
                        }
                        let order_mismatches = cpu_ids
                            .iter()
                            .zip(&pairs)
                            .filter(|(id, p)| **id != p.1)
                            .count();
                        let base = &images[index];
                        let mse = rgba
                            .iter()
                            .zip(base)
                            .map(|(&a, &b)| (a as f64 - b as f64).powi(2))
                            .sum::<f64>()
                            / rgba.len() as f64;
                        let max = rgba
                            .iter()
                            .zip(base)
                            .map(|(&a, &b)| a.abs_diff(b))
                            .max()
                            .unwrap();
                        let changed = rgba
                            .chunks_exact(4)
                            .zip(base.chunks_exact(4))
                            .filter(|(a, b)| a != b)
                            .count();
                        accuracy.push(serde_json::json!({"camera":camera_id,"normalizedTime":time,"cpuVisible":cpu_ids.len(),"gpuVisible":visible,"sameVisibleSet":matching_set,"thresholdRounding":boundaries,"orderMismatches":order_mismatches,"stableSort":true,"allSourceIdsPreserved":true,"rmse8bit":mse.sqrt(),"max8bit":max,"changedPixels":changed}));
                        println!("case {index}: visible {visible}, same set {matching_set}, order {order_mismatches}, RMSE {:.5}, max {max}",mse.sqrt());
                        if !only_threshold_rounding || mse.sqrt() > 0.25 {
                            return Err("Culling/image equivalence failed".into());
                        }
                    }
                    if index % 4 == 1 {
                        let mut png = png::Encoder::new(
                            fs::File::create(output.join(format!("v{variant}-case{index}.png")))?,
                            width,
                            height,
                        );
                        png.set_color(png::ColorType::Rgba);
                        png.set_depth(png::BitDepth::Eight);
                        png.write_header()?.write_image_data(&rgba)?;
                    }
                }
                let _ = stats;
            }
        }
        println!("Round {round} complete");
    }
    let results:Vec<_> = (0..2).map(|i|serde_json::json!({"variant":if i==0 {"optimized-cpu-v9"} else {"gpu-cull-radix-indirect"},"cpuPrepareAndEncodeMs":quantiles(&cpu[i]),"gpuCullSortRenderMs":quantiles(&gpu[i]),"gpuRasterOnlyMs":quantiles(&raster[i]),"serializedFrameMs":quantiles(&wall[i])})).collect();
    for r in &results {
        println!(
            "{}: CPU {} ms, GPU {} ms, serialized {} ms",
            r["variant"],
            r["cpuPrepareAndEncodeMs"]["p50"],
            r["gpuCullSortRenderMs"]["p50"],
            r["serializedFrameMs"]["p50"]
        );
    }
    fs::write(
        output.join("report.json"),
        serde_json::to_string_pretty(
            &serde_json::json!({"schema":"pajama.gpu-driven-evidence.v1","adapter":info.name,"backend":format!("{:?}",info.backend),"model":model,"cameraFixture":cameras,"sourceCount":count,"width":width,"height":height,"method":"2 warmup + 7 measured rounds x 12 frames per variant, rotating A/B order. 3 calibrated cameras x 4 times including endpoints. Same records/shader/full-f32 depth keys. GPU timestamp includes cull, all sort passes and render. Serialized CPU-to-completion time excludes correctness readbacks; not display FPS. No frame pipelining in this latency test.","results":results,"accuracy":accuracy}),
        )?,
    )?;
    Ok(())
}
