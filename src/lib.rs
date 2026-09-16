#![cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]

use bytemuck::{Pod, Zeroable};
use glam::{Mat4, Vec3};
use std::cmp::Ordering;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering as AtomicOrdering};
use std::sync::Arc;
use wasm_bindgen::prelude::*;
use web_time::Instant;
#[cfg(target_arch = "wasm32")]
use wgpu::util::DeviceExt;

const LOOP_SECONDS: f32 = 10.0;
const FLOATS_PER_SPLAT: usize = 32;
const BYTES_PER_SPLAT: usize = FLOATS_PER_SPLAT * std::mem::size_of::<f32>();
const MAX_SPLATS: usize = 160_000;
const GPU_TIMESTAMP_BYTES: u64 = 2 * std::mem::size_of::<u64>() as u64;
const GPU_TIMESTAMP_READBACK_SLOTS: usize = 3;
const SCENE_TARGET: Vec3 = Vec3::new(0.0, 3.5, 14.0);
const STG_PROPERTIES: [&str; FLOATS_PER_SPLAT] = [
    "x",
    "y",
    "z",
    "trbf_center",
    "trbf_scale",
    "nx",
    "ny",
    "nz",
    "motion_0",
    "motion_1",
    "motion_2",
    "motion_3",
    "motion_4",
    "motion_5",
    "motion_6",
    "motion_7",
    "motion_8",
    "f_dc_0",
    "f_dc_1",
    "f_dc_2",
    "opacity",
    "scale_0",
    "scale_1",
    "scale_2",
    "rot_0",
    "rot_1",
    "rot_2",
    "rot_3",
    "omega_0",
    "omega_1",
    "omega_2",
    "omega_3",
];

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct CameraUniform {
    view_proj: [[f32; 4]; 4],
    viewport: [f32; 4],
    scene: [f32; 4],
}

#[derive(Clone, Copy)]
struct ResearchSplat {
    base: Vec3,
    temporal_center: f32,
    temporal_scale: f32,
    motion_linear: Vec3,
    motion_quadratic: Vec3,
    motion_cubic: Vec3,
    opacity_logit: f32,
}

impl ResearchSplat {
    fn sample(self, time: f32) -> (Vec3, f32) {
        let dt = time - self.temporal_center;
        let dt2 = dt * dt;
        let position = self.base
            + self.motion_linear * dt
            + self.motion_quadratic * dt2
            + self.motion_cubic * (dt2 * dt);
        let temporal = (-(dt / self.temporal_scale).powi(2)).exp();
        (position, sigmoid(self.opacity_logit) * temporal)
    }
}

#[derive(Default)]
struct FrameTelemetry {
    prepare_ms: f64,
    sort_ms: f64,
    visible: u32,
    upload_bytes: u32,
}

struct TimestampReadback {
    buffer: wgpu::Buffer,
    pending: Arc<AtomicBool>,
}

struct GpuTimer {
    query_set: wgpu::QuerySet,
    resolve_buffer: wgpu::Buffer,
    readbacks: Vec<TimestampReadback>,
    next_readback: usize,
    latest_ms_bits: Arc<AtomicU64>,
    timestamp_period_ns: f64,
}

impl GpuTimer {
    fn new(device: &wgpu::Device, queue: &wgpu::Queue) -> Self {
        let query_set = device.create_query_set(&wgpu::QuerySetDescriptor {
            label: Some("stg-render-timestamps"),
            ty: wgpu::QueryType::Timestamp,
            count: 2,
        });
        let resolve_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("stg-timestamp-resolve"),
            size: GPU_TIMESTAMP_BYTES,
            usage: wgpu::BufferUsages::QUERY_RESOLVE | wgpu::BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        });
        let readbacks = (0..GPU_TIMESTAMP_READBACK_SLOTS)
            .map(|_| TimestampReadback {
                buffer: device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some("stg-timestamp-readback"),
                    size: GPU_TIMESTAMP_BYTES,
                    usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
                    mapped_at_creation: false,
                }),
                pending: Arc::new(AtomicBool::new(false)),
            })
            .collect();
        Self {
            query_set,
            resolve_buffer,
            readbacks,
            next_readback: 0,
            latest_ms_bits: Arc::new(AtomicU64::new((-1.0_f64).to_bits())),
            timestamp_period_ns: queue.get_timestamp_period() as f64,
        }
    }

    fn reserve_readback(&mut self) -> Option<(wgpu::Buffer, Arc<AtomicBool>)> {
        for _ in 0..self.readbacks.len() {
            let index = self.next_readback;
            self.next_readback = (self.next_readback + 1) % self.readbacks.len();
            let readback = &self.readbacks[index];
            if !readback.pending.load(AtomicOrdering::Relaxed) {
                readback.pending.store(true, AtomicOrdering::Relaxed);
                return Some((readback.buffer.clone(), readback.pending.clone()));
            }
        }
        None
    }
}

#[wasm_bindgen]
pub struct GaussianRenderer {
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    pipeline: wgpu::RenderPipeline,
    bind_group: wgpu::BindGroup,
    camera_buffer: wgpu::Buffer,
    index_buffer: wgpu::Buffer,
    source: Vec<ResearchSplat>,
    frame: Vec<(f32, u32)>,
    sorted_indices: Vec<u32>,
    telemetry: FrameTelemetry,
    adapter_name: String,
    gpu_timer: Option<GpuTimer>,
}

#[wasm_bindgen]
impl GaussianRenderer {
    #[wasm_bindgen(js_name = create)]
    #[cfg(target_arch = "wasm32")]
    pub async fn create(
        canvas: web_sys::HtmlCanvasElement,
        ply_data: js_sys::Uint8Array,
    ) -> Result<GaussianRenderer, JsValue> {
        console_error_panic_hook::set_once();
        let ply_bytes = ply_data.to_vec();
        let parsed = parse_stg_ply(&ply_bytes).map_err(js_error)?;
        if parsed.source.len() > MAX_SPLATS {
            return Err(JsValue::from_str(
                "STG asset exceeds the renderer's declared splat budget",
            ));
        }

        let width = canvas.width().max(1);
        let height = canvas.height().max(1);
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::new_without_display_handle());
        let surface = instance
            .create_surface(wgpu::SurfaceTarget::Canvas(canvas))
            .map_err(js_error)?;
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: Some(&surface),
                force_fallback_adapter: false,
                apply_limit_buckets: false,
            })
            .await
            .map_err(js_error)?;
        let adapter_name = adapter.get_info().name;
        let timestamp_query_supported =
            adapter.features().contains(wgpu::Features::TIMESTAMP_QUERY);
        let mut device_descriptor = wgpu::DeviceDescriptor::default();
        if timestamp_query_supported {
            device_descriptor.required_features = wgpu::Features::TIMESTAMP_QUERY;
        }
        let (device, queue) = adapter
            .request_device(&device_descriptor)
            .await
            .map_err(js_error)?;
        let caps = surface.get_capabilities(&adapter);
        let format = caps
            .formats
            .iter()
            .copied()
            .find(wgpu::TextureFormat::is_srgb)
            .or_else(|| caps.formats.first().copied())
            .ok_or_else(|| JsValue::from_str("WebGPU surface exposes no usable format"))?;
        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            color_space: wgpu::SurfaceColorSpace::Auto,
            width,
            height,
            present_mode: wgpu::PresentMode::Fifo,
            alpha_mode: caps.alpha_modes[0],
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        };
        surface.configure(&device, &config);

        let camera_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("stg-camera"),
            contents: bytemuck::bytes_of(&CameraUniform::zeroed()),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let source_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("stg-source-records"),
            contents: &ply_bytes[parsed.payload_offset..parsed.payload_end],
            usage: wgpu::BufferUsages::STORAGE,
        });
        let index_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("stg-depth-order"),
            size: (MAX_SPLATS * std::mem::size_of::<u32>()) as u64,
            usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("stg-render-layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("stg-render-bind-group"),
            layout: &bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: camera_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: source_buffer.as_entire_binding(),
                },
            ],
        });
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("stg-ewa-shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("splat.wgsl").into()),
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("stg-pipeline-layout"),
            bind_group_layouts: &[Some(&bind_group_layout)],
            immediate_size: 0,
        });
        let vertex_layout = wgpu::VertexBufferLayout {
            array_stride: std::mem::size_of::<u32>() as u64,
            step_mode: wgpu::VertexStepMode::Instance,
            attributes: &[wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Uint32,
                offset: 0,
                shader_location: 0,
            }],
        };
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("stg-alpha-pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                compilation_options: Default::default(),
                buffers: &[Some(vertex_layout)],
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                compilation_options: Default::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format,
                    blend: Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                cull_mode: None,
                ..Default::default()
            },
            depth_stencil: None,
            multisample: Default::default(),
            multiview_mask: None,
            cache: None,
        });

        let source_count = parsed.source.len();
        let gpu_timer = timestamp_query_supported.then(|| GpuTimer::new(&device, &queue));
        Ok(Self {
            surface,
            device,
            queue,
            config,
            pipeline,
            bind_group,
            camera_buffer,
            index_buffer,
            source: parsed.source,
            frame: Vec::with_capacity(source_count),
            sorted_indices: Vec::with_capacity(source_count),
            telemetry: FrameTelemetry::default(),
            adapter_name,
            gpu_timer,
        })
    }

    pub fn render(
        &mut self,
        time_seconds: f32,
        yaw: f32,
        pitch: f32,
        distance: f32,
        width: u32,
        height: u32,
        calibrated_camera: js_sys::Float32Array,
    ) -> Result<(), JsValue> {
        let prepare_started = Instant::now();
        let width = width.max(1);
        let height = height.max(1);
        if self.config.width != width || self.config.height != height {
            self.config.width = width;
            self.config.height = height;
            self.surface.configure(&self.device, &self.config);
        }

        let (view, projection, viewport) = if calibrated_camera.length() >= 12 {
            let value = |index| calibrated_camera.get_index(index);
            let eye = Vec3::new(value(0), value(1), value(2));
            let mut forward = Vec3::new(value(3), value(4), value(5)).normalize_or_zero();
            let mut up = Vec3::new(value(6), value(7), value(8)).normalize_or_zero();
            if forward.length_squared() < 0.5 {
                forward = Vec3::Z;
            }
            if up.length_squared() < 0.5 {
                up = Vec3::NEG_Y;
            }
            let capture_aspect = (value(10) / value(11).max(1.0)).clamp(0.5, 3.0);
            let surface_aspect = width as f32 / height as f32;
            let viewport = if surface_aspect > capture_aspect {
                let viewport_width = height as f32 * capture_aspect;
                [
                    (width as f32 - viewport_width) * 0.5,
                    0.0,
                    viewport_width,
                    height as f32,
                ]
            } else {
                let viewport_height = width as f32 / capture_aspect;
                [
                    0.0,
                    (height as f32 - viewport_height) * 0.5,
                    width as f32,
                    viewport_height,
                ]
            };
            (
                Mat4::look_at_rh(eye, eye + forward, up),
                Mat4::perspective_rh(value(9).clamp(0.2, 2.6), capture_aspect, 0.05, 180.0),
                viewport,
            )
        } else {
            let pitch = pitch.clamp(-0.55, 0.7);
            let distance = distance.clamp(9.0, 34.0);
            let orbit = Vec3::new(
                yaw.sin() * pitch.cos(),
                -pitch.sin(),
                -yaw.cos() * pitch.cos(),
            );
            let eye = SCENE_TARGET + orbit * distance;
            (
                Mat4::look_at_rh(eye, SCENE_TARGET, Vec3::NEG_Y),
                Mat4::perspective_rh(
                    69.5_f32.to_radians(),
                    width as f32 / height as f32,
                    0.05,
                    180.0,
                ),
                [0.0, 0.0, width as f32, height as f32],
            )
        };
        let view_proj = projection * view;
        let normalized_time = time_seconds.rem_euclid(LOOP_SECONDS) / LOOP_SECONDS;

        self.frame.clear();
        for (index, source) in self.source.iter().enumerate() {
            let (center, opacity) = source.sample(normalized_time);
            if opacity < 1.0 / 255.0 {
                continue;
            }
            let clip = view_proj * center.extend(1.0);
            if clip.w <= 0.0 {
                continue;
            }
            let ndc = clip.truncate() / clip.w;
            if ndc.x.abs() > 1.35 || ndc.y.abs() > 1.35 || ndc.z < 0.0 || ndc.z > 1.0 {
                continue;
            }
            let depth = -(view * center.extend(1.0)).z;
            self.frame.push((depth, index as u32));
        }
        let sort_started = Instant::now();
        self.frame
            .sort_unstable_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(Ordering::Equal));
        self.telemetry.sort_ms = sort_started.elapsed().as_secs_f64() * 1000.0;

        let camera = CameraUniform {
            view_proj: view_proj.to_cols_array_2d(),
            viewport: [
                viewport[2],
                viewport[3],
                1.0 / viewport[2],
                1.0 / viewport[3],
            ],
            scene: [normalized_time, 0.0, 0.0, 0.0],
        };
        self.queue
            .write_buffer(&self.camera_buffer, 0, bytemuck::bytes_of(&camera));
        self.sorted_indices.clear();
        self.sorted_indices
            .extend(self.frame.iter().map(|(_, index)| *index));
        self.queue.write_buffer(
            &self.index_buffer,
            0,
            bytemuck::cast_slice(&self.sorted_indices),
        );
        self.telemetry.visible = self.sorted_indices.len() as u32;
        self.telemetry.upload_bytes =
            (self.sorted_indices.len() * std::mem::size_of::<u32>()) as u32;
        self.telemetry.prepare_ms = prepare_started.elapsed().as_secs_f64() * 1000.0;

        let frame = match self.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(frame)
            | wgpu::CurrentSurfaceTexture::Suboptimal(frame) => frame,
            wgpu::CurrentSurfaceTexture::Outdated | wgpu::CurrentSurfaceTexture::Lost => {
                self.surface.configure(&self.device, &self.config);
                return Ok(());
            }
            wgpu::CurrentSurfaceTexture::Timeout | wgpu::CurrentSurfaceTexture::Occluded => {
                return Ok(())
            }
            wgpu::CurrentSurfaceTexture::Validation => {
                return Err(JsValue::from_str("WebGPU surface validation failed"))
            }
        };
        let view = frame.texture.create_view(&Default::default());
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("stg-frame"),
            });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("stg-splats"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: 0.0,
                            g: 0.0,
                            b: 0.0,
                            a: 1.0,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: self.gpu_timer.as_ref().map(|timer| {
                    wgpu::RenderPassTimestampWrites {
                        query_set: &timer.query_set,
                        beginning_of_pass_write_index: Some(0),
                        end_of_pass_write_index: Some(1),
                    }
                }),
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &self.bind_group, &[]);
            pass.set_vertex_buffer(0, self.index_buffer.slice(..));
            pass.set_viewport(viewport[0], viewport[1], viewport[2], viewport[3], 0.0, 1.0);
            pass.draw(0..6, 0..self.telemetry.visible);
        }
        let mut timestamp_readback = None;
        if let Some(timer) = self.gpu_timer.as_mut() {
            if let Some((buffer, pending)) = timer.reserve_readback() {
                encoder.resolve_query_set(&timer.query_set, 0..2, &timer.resolve_buffer, 0);
                encoder.copy_buffer_to_buffer(
                    &timer.resolve_buffer,
                    0,
                    &buffer,
                    0,
                    GPU_TIMESTAMP_BYTES,
                );
                timestamp_readback = Some((
                    buffer,
                    pending,
                    timer.latest_ms_bits.clone(),
                    timer.timestamp_period_ns,
                ));
            }
        }
        self.queue.submit([encoder.finish()]);
        if let Some((buffer, pending, latest_ms_bits, timestamp_period_ns)) = timestamp_readback {
            let callback_buffer = buffer.clone();
            buffer
                .slice(..GPU_TIMESTAMP_BYTES)
                .map_async(wgpu::MapMode::Read, move |result| {
                    if result.is_ok() {
                        let mapped_result = callback_buffer
                            .slice(..GPU_TIMESTAMP_BYTES)
                            .get_mapped_range();
                        if let Ok(mapped) = mapped_result {
                            let begin = u64::from_le_bytes(mapped[0..8].try_into().unwrap());
                            let end = u64::from_le_bytes(mapped[8..16].try_into().unwrap());
                            if end >= begin {
                                let elapsed_ms =
                                    (end - begin) as f64 * timestamp_period_ns / 1_000_000.0;
                                latest_ms_bits.store(elapsed_ms.to_bits(), AtomicOrdering::Relaxed);
                            }
                            drop(mapped);
                        }
                        callback_buffer.unmap();
                    }
                    pending.store(false, AtomicOrdering::Relaxed);
                });
        }
        self.queue.present(frame);
        Ok(())
    }

    #[wasm_bindgen(getter, js_name = prepareMs)]
    pub fn prepare_ms(&self) -> f64 {
        self.telemetry.prepare_ms
    }

    #[wasm_bindgen(getter, js_name = sortMs)]
    pub fn sort_ms(&self) -> f64 {
        self.telemetry.sort_ms
    }

    #[wasm_bindgen(getter)]
    pub fn visible(&self) -> u32 {
        self.telemetry.visible
    }

    #[wasm_bindgen(getter, js_name = uploadBytes)]
    pub fn upload_bytes(&self) -> u32 {
        self.telemetry.upload_bytes
    }

    #[wasm_bindgen(getter, js_name = gpuRenderMs)]
    pub fn gpu_render_ms(&self) -> f64 {
        self.gpu_timer
            .as_ref()
            .map(|timer| f64::from_bits(timer.latest_ms_bits.load(AtomicOrdering::Relaxed)))
            .unwrap_or(-1.0)
    }

    #[wasm_bindgen(getter, js_name = gpuTimingSupported)]
    pub fn gpu_timing_supported(&self) -> bool {
        self.gpu_timer.is_some()
    }

    #[wasm_bindgen(getter, js_name = adapterName)]
    pub fn adapter_name(&self) -> String {
        self.adapter_name.clone()
    }

    #[wasm_bindgen(getter, js_name = sourceCount)]
    pub fn source_count(&self) -> u32 {
        self.source.len() as u32
    }
}

struct ParsedPly {
    source: Vec<ResearchSplat>,
    payload_offset: usize,
    payload_end: usize,
}

fn parse_stg_ply(bytes: &[u8]) -> Result<ParsedPly, String> {
    const END_HEADER: &[u8] = b"end_header\n";
    let header_start = bytes
        .windows(END_HEADER.len())
        .position(|window| window == END_HEADER)
        .ok_or_else(|| "PLY header is missing end_header".to_string())?;
    let payload_offset = header_start + END_HEADER.len();
    let header = std::str::from_utf8(&bytes[..payload_offset])
        .map_err(|_| "PLY header is not UTF-8".to_string())?;
    if !header.contains("format binary_little_endian 1.0") {
        return Err("Expected a binary little-endian PLY".to_string());
    }
    let count = header
        .lines()
        .find_map(|line| line.strip_prefix("element vertex "))
        .ok_or_else(|| "PLY vertex count is missing".to_string())?
        .parse::<usize>()
        .map_err(|_| "PLY vertex count is invalid".to_string())?;
    let properties: Vec<_> = header
        .lines()
        .filter_map(|line| line.strip_prefix("property float "))
        .collect();
    if properties.len() != FLOATS_PER_SPLAT {
        return Err(format!(
            "Expected the 32-field STG-Lite layout, found {} fields",
            properties.len()
        ));
    }
    for (index, (actual, expected)) in properties.iter().zip(STG_PROPERTIES).enumerate() {
        if *actual != expected {
            return Err(format!(
                "STG-Lite field {index} must be {expected}, found {actual}"
            ));
        }
    }
    let payload_end = payload_offset
        .checked_add(count * BYTES_PER_SPLAT)
        .ok_or_else(|| "PLY payload length overflowed".to_string())?;
    if payload_end > bytes.len() {
        return Err("PLY payload is truncated".to_string());
    }

    let payload = &bytes[payload_offset..payload_end];
    let mut source = Vec::with_capacity(count);
    for record in payload.chunks_exact(BYTES_PER_SPLAT) {
        let value = |index: usize| {
            let offset = index * 4;
            f32::from_le_bytes(record[offset..offset + 4].try_into().unwrap())
        };
        source.push(ResearchSplat {
            base: Vec3::new(value(0), value(1), value(2)),
            temporal_center: value(3),
            temporal_scale: value(4).exp().max(1e-6),
            motion_linear: Vec3::new(value(8), value(9), value(10)),
            motion_quadratic: Vec3::new(value(11), value(12), value(13)),
            motion_cubic: Vec3::new(value(14), value(15), value(16)),
            opacity_logit: value(20),
        });
    }
    Ok(ParsedPly {
        source,
        payload_offset,
        payload_end,
    })
}

fn sigmoid(value: f32) -> f32 {
    1.0 / (1.0 + (-value).exp())
}

fn js_error(error: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_ply() -> Vec<u8> {
        let mut bytes = b"ply\nformat binary_little_endian 1.0\nelement vertex 1\n".to_vec();
        for property in STG_PROPERTIES {
            bytes.extend_from_slice(format!("property float {property}\n").as_bytes());
        }
        bytes.extend_from_slice(b"end_header\n");
        let mut values = [0.0_f32; FLOATS_PER_SPLAT];
        values[0] = 1.0;
        values[1] = 2.0;
        values[2] = 3.0;
        values[4] = 0.0;
        values[8] = 2.0;
        values[20] = 0.0;
        for value in values {
            bytes.extend_from_slice(&value.to_le_bytes());
        }
        bytes
    }

    #[test]
    fn parses_the_official_stg_lite_record_shape() {
        let parsed = parse_stg_ply(&fixture_ply()).unwrap();
        assert_eq!(parsed.source.len(), 1);
        let (position, opacity) = parsed.source[0].sample(0.5);
        assert_eq!(position, Vec3::new(2.0, 2.0, 3.0));
        assert!(opacity > 0.38 && opacity < 0.40);
    }

    #[test]
    fn rejects_an_unrelated_ply_layout() {
        let bytes = b"ply\nformat binary_little_endian 1.0\nelement vertex 0\nend_header\n";
        assert!(parse_stg_ply(bytes).is_err());
    }

    #[test]
    fn rejects_a_reordered_stg_layout() {
        let mut bytes = fixture_ply();
        let x = bytes
            .windows(b"property float x\n".len())
            .position(|window| window == b"property float x\n")
            .unwrap();
        bytes[x + "property float ".len()] = b'q';
        assert!(parse_stg_ply(&bytes).is_err());
    }
}
