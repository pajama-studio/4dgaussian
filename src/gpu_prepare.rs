//! GPU instance culling, stable full-f32 depth sorting and indirect draw arguments.
//! No synchronous readback. Sort compacts visible records to the front, but still
//! processes all resident records; spatial/temporal LOD is a separate concern.
use glam::Mat4;
use std::sync::{
    atomic::{AtomicBool, AtomicU32, Ordering},
    Arc,
};
use wgpu::util::DeviceExt;

pub struct GpuPreparation {
    uniform: wgpu::Buffer,
    pub indices: wgpu::Buffer,
    pub indirect: wgpu::Buffer,
    /// Available for validation, never read back in the playback dependency chain.
    pub keys: wgpu::Buffer,
    cull: wgpu::ComputePipeline,
    histogram: wgpu::ComputePipeline,
    prefix: wgpu::ComputePipeline,
    scatter: wgpu::ComputePipeline,
    cull_group: wgpu::BindGroup,
    sort_groups: Vec<wgpu::BindGroup>,
    groups: u32,
    last_frame: Option<(f32, Mat4, Mat4)>,
    count_readback: wgpu::Buffer,
    count_pending: Arc<AtomicBool>,
    latest_count: Arc<AtomicU32>,
}

impl GpuPreparation {
    pub fn new(device: &wgpu::Device, source: &wgpu::Buffer, count: u32) -> Self {
        let buffer = |label, size, usage| {
            device.create_buffer(&wgpu::BufferDescriptor {
                label: Some(label),
                size,
                usage,
                mapped_at_creation: false,
            })
        };
        let storage = wgpu::BufferUsages::STORAGE;
        let uniform = buffer(
            "gpu-cull-camera",
            96,
            wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        );
        let keys = buffer(
            "gpu-keys-a",
            (count as u64 * 8).max(8),
            storage | wgpu::BufferUsages::COPY_SRC,
        );
        let alternate = buffer("gpu-keys-b", (count as u64 * 8).max(8), storage);
        let indices = buffer(
            "gpu-visible-order",
            (count as u64 * 4).max(4),
            storage | wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_SRC,
        );
        let indirect = buffer(
            "gpu-draw-args",
            16,
            storage
                | wgpu::BufferUsages::INDIRECT
                | wgpu::BufferUsages::COPY_DST
                | wgpu::BufferUsages::COPY_SRC,
        );
        let groups = count.div_ceil(128);
        let scratch = buffer("gpu-radix-prefix", (32 * groups as u64 + 16) * 4, storage);
        let pipeline =
            |module: &wgpu::ShaderModule, entry, layout: Option<&wgpu::PipelineLayout>| {
                device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
                    label: Some(entry),
                    layout,
                    module,
                    entry_point: Some(entry),
                    compilation_options: Default::default(),
                    cache: None,
                })
            };
        let cull_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("gpu-cull"),
            source: wgpu::ShaderSource::Wgsl(include_str!("gpu_cull.wgsl").into()),
        });
        let cull = pipeline(&cull_shader, "cull", None);
        let bind = |label, layout: &wgpu::BindGroupLayout, buffers: &[&wgpu::Buffer]| {
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some(label),
                layout,
                entries: &buffers
                    .iter()
                    .enumerate()
                    .map(|(i, b)| wgpu::BindGroupEntry {
                        binding: i as u32,
                        resource: b.as_entire_binding(),
                    })
                    .collect::<Vec<_>>(),
            })
        };
        let cull_group = bind(
            "gpu-cull-bindings",
            &cull.get_bind_group_layout(0),
            &[&uniform, source, &keys, &indirect],
        );
        let sort_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("gpu-stable-radix"),
            source: wgpu::ShaderSource::Wgsl(include_str!("gpu_radix.wgsl").into()),
        });
        // Explicit shared layout: histogram/prefix do not reference every binding.
        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("gpu-radix-layout"),
            entries: &(0..5)
                .map(|binding| wgpu::BindGroupLayoutEntry {
                    binding,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: if binding == 0 {
                            wgpu::BufferBindingType::Uniform
                        } else {
                            wgpu::BufferBindingType::Storage {
                                read_only: binding == 1,
                            }
                        },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                })
                .collect::<Vec<_>>(),
        });
        let pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("gpu-radix-pipeline-layout"),
            bind_group_layouts: &[Some(&layout)],
            immediate_size: 0,
        });
        let histogram = pipeline(&sort_shader, "histogram", Some(&pl));
        let prefix = pipeline(&sort_shader, "prefix", Some(&pl));
        let scatter = pipeline(&sort_shader, "scatter", Some(&pl));
        let sort_groups = (0..8)
            .map(|pass| {
                let params = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("gpu-radix-digit"),
                    contents: bytemuck::cast_slice(&[count, groups, pass * 4, 0]),
                    usage: wgpu::BufferUsages::UNIFORM,
                });
                let (a, b) = if pass % 2 == 0 {
                    (&keys, &alternate)
                } else {
                    (&alternate, &keys)
                };
                bind(
                    "gpu-radix-bindings",
                    &layout,
                    &[&params, a, b, &scratch, &indices],
                )
            })
            .collect();
        let count_readback = buffer(
            "gpu-count-telemetry",
            16,
            wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        );
        Self {
            uniform,
            indices,
            indirect,
            keys,
            cull,
            histogram,
            prefix,
            scatter,
            cull_group,
            sort_groups,
            groups,
            last_frame: None,
            count_readback,
            count_pending: Arc::new(AtomicBool::new(false)),
            latest_count: Arc::new(AtomicU32::new(0)),
        }
    }

    /// Encode before the render pass. Each update must be submitted before the next.
    /// Queries, when provided, enclose the entire cull + sort command range.
    pub fn encode(
        &mut self,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        time: f32,
        view: Mat4,
        projection: Mat4,
        queries: Option<(&wgpu::QuerySet, u32, u32)>,
    ) -> bool {
        let frame = (time, view, projection);
        if self.last_frame == Some(frame) {
            return false;
        }
        let mut data = Vec::from((projection * view).to_cols_array());
        data.extend_from_slice(&(-view.row(2)).to_array());
        data.extend_from_slice(&[time, 0.0, 0.0, 0.0]);
        queue.write_buffer(&self.uniform, 0, bytemuck::cast_slice(&data));
        queue.write_buffer(&self.indirect, 0, bytemuck::cast_slice(&[6u32, 0, 0, 0]));
        let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
            label: Some("gpu-cull-and-sort"),
            timestamp_writes: queries.map(|(query_set, begin, end)| {
                wgpu::ComputePassTimestampWrites {
                    query_set,
                    beginning_of_pass_write_index: Some(begin),
                    end_of_pass_write_index: Some(end),
                }
            }),
        });
        pass.set_pipeline(&self.cull);
        pass.set_bind_group(0, &self.cull_group, &[]);
        pass.dispatch_workgroups(self.groups, 1, 1);
        for bindings in &self.sort_groups {
            pass.set_bind_group(0, bindings, &[]);
            pass.set_pipeline(&self.histogram);
            pass.dispatch_workgroups(self.groups, 1, 1);
            pass.set_pipeline(&self.prefix);
            pass.dispatch_workgroups(16, 1, 1);
            pass.set_pipeline(&self.scatter);
            pass.dispatch_workgroups(self.groups, 1, 1);
        }
        self.last_frame = Some(frame);
        true
    }

    /// Optional 16-byte asynchronous telemetry. Drawing never waits on this value.
    pub fn count_copy(&self, encoder: &mut wgpu::CommandEncoder) -> bool {
        if self.count_pending.swap(true, Ordering::Relaxed) {
            return false;
        }
        encoder.copy_buffer_to_buffer(&self.indirect, 0, &self.count_readback, 0, 16);
        true
    }
    pub fn map_count(&self) {
        let buffer = self.count_readback.clone();
        let pending = self.count_pending.clone();
        let latest = self.latest_count.clone();
        self.count_readback
            .slice(..)
            .map_async(wgpu::MapMode::Read, move |r| {
                if r.is_ok() {
                    if let Ok(data) = buffer.slice(..).get_mapped_range() {
                        latest.store(
                            u32::from_le_bytes(data[4..8].try_into().unwrap()),
                            Ordering::Relaxed,
                        );
                    }
                    buffer.unmap();
                }
                pending.store(false, Ordering::Relaxed);
            });
    }
    pub fn visible(&self) -> u32 {
        self.latest_count.load(Ordering::Relaxed)
    }
}
