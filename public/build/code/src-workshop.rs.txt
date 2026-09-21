//! Eight executable milestones. No window, DOM, file I/O or event loop here.
use bytemuck::{Pod, Zeroable};
use glam::{Mat4, Vec3};
use wgpu::util::DeviceExt;

// ANCHOR: layout
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Uniforms {
    view_projection: [[f32; 4]; 4], // bytes 0..64, column-major
    viewport_stage: [f32; 4],       // bytes 64..80: width, height, stage, padding
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Instance {
    center_alpha: [f32; 4], // bytes 0..16
    scale_pad: [f32; 4],    // bytes 16..32, activated standard deviations
    color_pad: [f32; 4],    // bytes 32..48, direct RGB (not SH coefficients)
}
// END: layout

#[derive(Clone, Copy, Debug)]
pub struct Frame {
    pub stage: u32,
    pub time: f32,
    pub yaw: f32,
    pub pitch: f32,
    pub distance: f32,
    pub reverse_order: bool,
}

impl Default for Frame {
    fn default() -> Self {
        Self {
            stage: 6,
            time: 0.5,
            yaw: 0.0,
            pitch: 0.15,
            distance: 5.0,
            reverse_order: false,
        }
    }
}

impl Frame {
    fn validate(self) -> Result<(), String> {
        if self.stage > 7
            || ![self.time, self.yaw, self.pitch, self.distance]
                .iter()
                .all(|x| x.is_finite())
            || !(0.0..=1.0).contains(&self.time)
            || !(1.5..=60.0).contains(&self.distance)
            || self.pitch.abs() > 1.4
        {
            return Err("Invalid workshop stage, normalized time or camera".into());
        }
        Ok(())
    }
}

// ANCHOR: camera
pub fn camera(frame: Frame, width: u32, height: u32) -> (Mat4, Mat4) {
    // The research capture uses a different world orientation from the toy scene.
    let (target, up, sign, distance) = if frame.stage == 7 {
        (
            Vec3::new(0.0, 3.5, 14.0),
            Vec3::NEG_Y,
            -1.0,
            frame.distance * 3.0,
        )
    } else {
        (Vec3::ZERO, Vec3::Y, 1.0, frame.distance)
    };
    let orbit = Vec3::new(
        frame.yaw.sin() * frame.pitch.cos(),
        frame.pitch.sin(),
        sign * frame.yaw.cos() * frame.pitch.cos(),
    );
    let view = Mat4::look_at_rh(target + orbit * distance, target, up);
    let projection = Mat4::perspective_rh(
        50_f32.to_radians(),
        width as f32 / height as f32,
        0.05,
        200.0,
    );
    (view, projection)
}
// END: camera

fn instances(frame: Frame, view: Mat4) -> Vec<Instance> {
    let make = |p: [f32; 3], a, scale: [f32; 3], rgb: [f32; 3]| Instance {
        center_alpha: [p[0], p[1], p[2], a],
        scale_pad: [scale[0], scale[1], scale[2], 0.0],
        color_pad: [rgb[0], rgb[1], rgb[2], 0.0],
    };
    let mut values = if frame.stage < 4 {
        vec![make(
            [0.0, 0.0, 0.0],
            0.8,
            [0.48, 0.22, 0.16],
            [1.0, 0.45, 0.08],
        )]
    } else {
        vec![
            make([0.0, 0.0, 0.5], 0.5, [0.45, 0.2, 0.15], [1.0, 0.0, 0.0]),
            make([0.0, 0.0, -0.5], 0.5, [0.2, 0.5, 0.2], [0.0, 0.25, 1.0]),
        ]
    };
    // ANCHOR: motion
    if frame.stage == 6 {
        let dt = frame.time - 0.5;
        values[0].center_alpha[0] += 2.5 * dt;
        values[0].center_alpha[1] += 1.5 * dt * dt;
        values[0].center_alpha[3] *= (-(dt / 0.45).powi(2)).exp();
        values[1].center_alpha[0] -= 1.5 * dt;
    }
    // Sorting happens AFTER evaluating the current time and camera.
    values.sort_by(|a, b| {
        let depth = |s: &Instance| -(view * Vec3::from_slice(&s.center_alpha[..3]).extend(1.0)).z;
        depth(b).total_cmp(&depth(a))
    });
    if frame.reverse_order {
        values.reverse();
    }
    // END: motion
    values
}

pub struct WorkshopPass {
    pipeline: wgpu::RenderPipeline,
    bindings: wgpu::BindGroup,
    uniforms: wgpu::Buffer,
    instances: wgpu::Buffer,
    stage: u32,
    count: u32,
    real: Option<crate::stg_pass::StgPass>,
    format: wgpu::TextureFormat,
}

impl WorkshopPass {
    pub fn new(device: &wgpu::Device, format: wgpu::TextureFormat) -> Self {
        // ANCHOR: buffers
        let uniforms = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("workshop-uniforms-80-bytes"),
            contents: bytemuck::bytes_of(&Uniforms::zeroed()),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let instances = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("workshop-instances-2-times-48-bytes"),
            size: 96,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("workshop-bindings"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
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
        let bindings = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("workshop-bind-group"),
            layout: &layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: uniforms.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: instances.as_entire_binding(),
                },
            ],
        });
        // END: buffers
        // ANCHOR: pipeline
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("workshop-shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("workshop.wgsl").into()),
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("workshop-pipeline-layout"),
            bind_group_layouts: &[Some(&layout)],
            immediate_size: 0,
        });
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("workshop-pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                compilation_options: Default::default(),
                buffers: &[],
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
            primitive: Default::default(),
            depth_stencil: None,
            multisample: Default::default(),
            multiview_mask: None,
            cache: None,
        });
        // END: pipeline
        Self {
            pipeline,
            bindings,
            uniforms,
            instances,
            stage: 0,
            count: 0,
            real: None,
            format,
        }
    }

    pub fn load_model(&mut self, device: &wgpu::Device, ply: &[u8]) -> Result<(), String> {
        self.real = Some(crate::stg_pass::StgPass::new(
            device,
            ply,
            self.format,
            None,
        )?);
        Ok(())
    }

    // ANCHOR: prepare
    pub fn prepare(
        &mut self,
        queue: &wgpu::Queue,
        frame: Frame,
        size: [u32; 2],
    ) -> Result<u32, String> {
        frame.validate()?;
        if size.contains(&0) {
            return Err("Cannot prepare a zero-sized target".into());
        }
        let (view, projection) = camera(frame, size[0], size[1]);
        self.stage = frame.stage;
        if frame.stage == 7 {
            let pass = self.real.as_mut().ok_or("Load the STG-Lite model first")?;
            self.count = pass
                .prepare(
                    queue,
                    frame.time,
                    view.to_cols_array_2d(),
                    projection.to_cols_array_2d(),
                    size,
                )?
                .visible_count as u32;
        } else {
            let data = instances(frame, view);
            self.count = data.len() as u32;
            queue.write_buffer(&self.instances, 0, bytemuck::cast_slice(&data));
            queue.write_buffer(
                &self.uniforms,
                0,
                bytemuck::bytes_of(&Uniforms {
                    view_projection: (projection * view).to_cols_array_2d(),
                    viewport_stage: [size[0] as f32, size[1] as f32, frame.stage as f32, 0.0],
                }),
            );
        }
        Ok(if frame.stage == 0 { 0 } else { self.count })
    }

    pub fn draw(&self, pass: &mut wgpu::RenderPass<'_>) {
        if self.stage == 0 {
            return;
        }
        if self.stage == 7 {
            if let Some(real) = &self.real {
                real.draw(pass);
            }
            return;
        }
        pass.set_pipeline(&self.pipeline);
        pass.set_bind_group(0, &self.bindings, &[]);
        pass.draw(0..if self.stage == 1 { 3 } else { 6 }, 0..self.count);
    }
    // END: prepare
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn host_shader_contract_and_invalid_input() {
        assert_eq!(std::mem::size_of::<Uniforms>(), 80);
        assert_eq!(std::mem::size_of::<Instance>(), 48);
        assert!(Frame {
            time: f32::NAN,
            ..Frame::default()
        }
        .validate()
        .is_err());
        assert!(Frame {
            stage: 8,
            ..Frame::default()
        }
        .validate()
        .is_err());
    }
    #[test]
    fn camera_and_time_change_the_ordered_scene() {
        let frame = Frame {
            stage: 6,
            ..Frame::default()
        };
        let (view, _) = camera(frame, 640, 480);
        let base = instances(frame, view);
        assert!(base[0].center_alpha[2] < base[1].center_alpha[2]);
        let moved = instances(Frame { time: 0.9, ..frame }, view);
        assert_ne!(base[1].center_alpha, moved[1].center_alpha);
        let reversed = instances(
            Frame {
                reverse_order: true,
                ..frame
            },
            view,
        );
        assert_eq!(base[0].center_alpha, reversed[1].center_alpha);
    }
}
