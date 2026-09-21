//! Surface-independent STG-Lite pass. The host owns the device, attachments,
//! camera, playback clock, submission and presentation. Time is normalized;
//! this API never guesses the capture duration from a PLY file.
use crate::{parse_stg_ply, CameraUniform, ResearchSplat};
use glam::Mat4;
use wgpu::util::DeviceExt;

#[derive(Clone, Copy, Debug)]
pub struct PreparedFrame {
    pub source_count: usize,
    pub visible_count: usize,
    pub index_upload_bytes: usize,
}

pub struct StgPass {
    pipeline: wgpu::RenderPipeline,
    bind_group: wgpu::BindGroup,
    camera_buffer: wgpu::Buffer,
    index_buffer: wgpu::Buffer,
    source: Vec<ResearchSplat>,
    ordered: Vec<(f32, u32)>,
    indices: Vec<u32>,
}

impl StgPass {
    /// `depth` must match the host attachment. Gaussian depth writes are always
    /// disabled. Choose LessEqual for conventional Z or GreaterEqual for reverse Z.
    /// Colors retain the baseline's learned RGB convention; the host must decide
    /// how to convert that convention before compositing into an HDR scene.
    pub fn new(
        device: &wgpu::Device,
        ply: &[u8],
        color_format: wgpu::TextureFormat,
        depth: Option<(wgpu::TextureFormat, wgpu::CompareFunction)>,
    ) -> Result<Self, String> {
        let parsed = parse_stg_ply(ply)?;
        let payload = &ply[parsed.payload_offset..parsed.payload_end];
        if payload.len() as u64 > u64::from(device.limits().max_storage_buffer_binding_size) {
            return Err("STG source exceeds the device storage binding limit".into());
        }
        let camera_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("stg-host-camera"),
            contents: bytemuck::bytes_of(&<CameraUniform as bytemuck::Zeroable>::zeroed()),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let source_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("stg-host-source"),
            contents: payload,
            usage: wgpu::BufferUsages::STORAGE,
        });
        let count = parsed.source.len();
        let index_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("stg-host-order"),
            size: (count * 4) as u64,
            usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("stg-host-layout"),
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
            label: Some("stg-host-bindings"),
            layout: &layout,
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
            label: Some("stg-shared-wgsl"),
            source: wgpu::ShaderSource::Wgsl(include_str!("splat.wgsl").into()),
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("stg-host-pipeline-layout"),
            bind_group_layouts: &[Some(&layout)],
            immediate_size: 0,
        });
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("stg-host-pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                compilation_options: Default::default(),
                buffers: &[Some(wgpu::VertexBufferLayout {
                    array_stride: 4,
                    step_mode: wgpu::VertexStepMode::Instance,
                    attributes: &[wgpu::VertexAttribute {
                        format: wgpu::VertexFormat::Uint32,
                        offset: 0,
                        shader_location: 0,
                    }],
                })],
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                compilation_options: Default::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format: color_format,
                    blend: Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: depth.map(|(format, depth_compare)| wgpu::DepthStencilState {
                format,
                depth_write_enabled: Some(false),
                depth_compare: Some(depth_compare),
                stencil: Default::default(),
                bias: Default::default(),
            }),
            multisample: Default::default(),
            multiview_mask: None,
            cache: None,
        });
        Ok(Self {
            pipeline,
            bind_group,
            camera_buffer,
            index_buffer,
            source: parsed.source,
            ordered: Vec::with_capacity(count),
            indices: Vec::with_capacity(count),
        })
    }

    /// Matrices are column-major (WebGPU clip Z in 0..1, RH view forward -Z).
    /// Set the render pass viewport to the same pixel dimensions before draw.
    /// Submit each prepared frame before preparing another using these buffers.
    pub fn prepare(
        &mut self,
        queue: &wgpu::Queue,
        normalized_time: f32,
        view_columns: [[f32; 4]; 4],
        projection_columns: [[f32; 4]; 4],
        viewport: [u32; 2],
    ) -> Result<PreparedFrame, String> {
        if !normalized_time.is_finite()
            || !(0.0..=1.0).contains(&normalized_time)
            || viewport.contains(&0)
            || view_columns
                .iter()
                .chain(&projection_columns)
                .flatten()
                .any(|x| !x.is_finite())
        {
            return Err("Invalid time, viewport or camera matrix".into());
        }
        let view = Mat4::from_cols_array_2d(&view_columns);
        let view_projection = Mat4::from_cols_array_2d(&projection_columns) * view;
        self.ordered.clear();
        for (index, source) in self.source.iter().enumerate() {
            let (center, opacity) = source.sample(normalized_time);
            if opacity < 1.0 / 255.0 {
                continue;
            }
            let clip = view_projection * center.extend(1.0);
            if clip.w <= 0.0 {
                continue;
            }
            let ndc = clip.truncate() / clip.w;
            // Matches the browser baseline's center-margin heuristic. This is
            // not a mathematically conservative bound for arbitrarily big splats.
            if ndc.x.abs() > 1.35 || ndc.y.abs() > 1.35 || !(0.0..=1.0).contains(&ndc.z) {
                continue;
            }
            self.ordered
                .push((-(view * center.extend(1.0)).z, index as u32));
        }
        self.ordered
            .sort_unstable_by(|a, b| b.0.total_cmp(&a.0).then(a.1.cmp(&b.1)));
        self.indices.clear();
        self.indices
            .extend(self.ordered.iter().map(|entry| entry.1));
        let [width, height] = viewport.map(|v| v as f32);
        let camera = CameraUniform {
            view_proj: view_projection.to_cols_array_2d(),
            viewport: [width, height, width.recip(), height.recip()],
            scene: [normalized_time, 0.0, 0.0, 0.0],
        };
        queue.write_buffer(&self.camera_buffer, 0, bytemuck::bytes_of(&camera));
        if !self.indices.is_empty() {
            queue.write_buffer(&self.index_buffer, 0, bytemuck::cast_slice(&self.indices));
        }
        Ok(PreparedFrame {
            source_count: self.source.len(),
            visible_count: self.indices.len(),
            index_upload_bytes: self.indices.len() * 4,
        })
    }

    pub fn draw(&self, pass: &mut wgpu::RenderPass<'_>) {
        pass.set_pipeline(&self.pipeline);
        pass.set_bind_group(0, &self.bind_group, &[]);
        pass.set_vertex_buffer(0, self.index_buffer.slice(..));
        pass.draw(0..6, 0..self.indices.len() as u32);
    }
}
