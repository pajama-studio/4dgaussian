//! Surface-independent teaching renderer: known materials -> GGX -> splats -> HDR.
//! This is not an inverse renderer or a reproduction of a research method.
use bytemuck::{Pod, Zeroable};
use glam::{Mat3, Mat4, Vec3};
use wgpu::util::DeviceExt;

const COUNT: usize = 1536;
const BASE: Vec3 = Vec3::new(0.55, 0.14, 0.045); // linear, artist-authored
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Globals {
    vp: [[f32; 4]; 4],
    eye: [f32; 4],
    light: [f32; 4],
    material: [f32; 4],
    viewport: [f32; 4],
}
// ANCHOR: asset
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Splat {
    center: [f32; 4],
    u: [f32; 4],
    v: [f32; 4],
    w: [f32; 4],
    normal: [f32; 4],
    base: [f32; 4],
}
// END: asset

#[derive(Clone, Copy, Debug)]
pub struct RelightFrame {
    pub azimuth: f32,
    pub elevation: f32,
    pub intensity: f32,
    pub roughness: f32,
    pub metallic: f32,
    pub time: f32,
    pub yaw: f32,
    pub mode: u32, // combined, diffuse, specular, normals, base color
    pub wrong_normals: bool,
}
impl Default for RelightFrame {
    fn default() -> Self {
        Self {
            azimuth: -0.6,
            elevation: 0.5,
            intensity: 3.0,
            roughness: 0.4,
            metallic: 0.0,
            time: 0.0,
            yaw: 0.0,
            mode: 0,
            wrong_normals: false,
        }
    }
}
impl RelightFrame {
    pub fn validate(self) -> Result<(), String> {
        if ![
            self.azimuth,
            self.elevation,
            self.intensity,
            self.roughness,
            self.metallic,
            self.time,
            self.yaw,
        ]
        .iter()
        .all(|v| v.is_finite())
            || self.azimuth.abs() > std::f32::consts::TAU
            || self.elevation.abs() > 1.57
            || self.yaw.abs() > std::f32::consts::TAU
            || !(0.0..=12.0).contains(&self.intensity)
            || !(0.12..=1.0).contains(&self.roughness)
            || !(0.0..=1.0).contains(&self.metallic)
            || !(0.0..=1.0).contains(&self.time)
            || self.mode > 4
        {
            return Err("Invalid relighting parameter (roughness range: 0.12..1)".into());
        }
        Ok(())
    }
    pub fn light(self) -> Vec3 {
        Vec3::new(
            self.azimuth.sin() * self.elevation.cos(),
            self.elevation.sin(),
            self.azimuth.cos() * self.elevation.cos(),
        )
    }
    pub fn eye(self) -> Vec3 {
        Vec3::new(4.2 * self.yaw.sin(), 0.5, 4.2 * self.yaw.cos())
    }
    pub fn transform(self) -> Mat3 {
        let phase = self.time * std::f32::consts::TAU;
        Mat3::from_rotation_y(phase)
            * Mat3::from_diagonal(Vec3::new(
                1.0 + 0.4 * phase.sin(),
                1.15,
                0.85 - 0.2 * phase.sin(),
            ))
    }
}

// ANCHOR: deformation
fn surfel(n: Vec3, frame: RelightFrame) -> Splat {
    let a = frame.transform();
    let helper = if n.y.abs() < 0.9 { Vec3::Y } else { Vec3::X };
    let u = n.cross(helper).normalize() * 0.065;
    let v = n.cross(u).normalize() * 0.065;
    let normal_matrix = if frame.wrong_normals {
        a
    } else {
        a.inverse().transpose()
    };
    Splat {
        center: (a * n).extend(0.96).to_array(),
        u: (a * u).extend(0.0).to_array(),
        v: (a * v).extend(0.0).to_array(),
        w: (a * n * 0.008).extend(0.0).to_array(),
        normal: (normal_matrix * n).normalize().extend(0.0).to_array(),
        base: BASE.extend(0.0).to_array(),
    }
}
fn scene(frame: RelightFrame, view: Mat4) -> Vec<Splat> {
    let mut data: Vec<_> = (0..COUNT)
        .map(|i| {
            let y = 1.0 - 2.0 * (i as f32 + 0.5) / COUNT as f32;
            let phi = i as f32 * 2.3999632;
            let r = (1.0 - y * y).sqrt();
            surfel(Vec3::new(r * phi.cos(), y, r * phi.sin()), frame)
        })
        .collect();
    data.sort_by(|a, b| {
        let z = |s: &Splat| view.transform_point3(Vec3::from_slice(&s.center[..3])).z;
        z(a).total_cmp(&z(b)) // RH camera looks along -Z: far first
    });
    data
}
// END: deformation

/// CPU explanation of the same single-scattering model as shade() in WGSL.
/// Returns [diffuse reflected radiance, specular reflected radiance].
pub fn reference_brdf(n: Vec3, v: Vec3, l: Vec3, frame: RelightFrame) -> [Vec3; 2] {
    let nl = n.dot(l).max(0.0);
    let nv = n.dot(v).max(0.0);
    if nl <= 0.0 || nv <= 0.0 {
        return [Vec3::ZERO; 2];
    }
    let h = (l + v).normalize();
    let a2 = frame.roughness.powi(4);
    let d = a2 / (std::f32::consts::PI * (n.dot(h).max(0.0).powi(2) * (a2 - 1.0) + 1.0).powi(2));
    let f0 = Vec3::splat(0.04).lerp(BASE, frame.metallic);
    let f = f0 + (Vec3::ONE - f0) * (1.0 - v.dot(h).max(0.0)).powi(5);
    let g1 = |c: f32| 2.0 * c / (c + (a2 + (1.0 - a2) * c * c).sqrt()).max(1e-6);
    let fd = (Vec3::ONE - f) * (1.0 - frame.metallic) * BASE / std::f32::consts::PI;
    let fs = d * f * g1(nl) * g1(nv) / (4.0 * nl * nv).max(1e-6);
    [fd * nl * frame.intensity, fs * nl * frame.intensity]
}

pub struct RelightPass {
    splat_pipeline: wgpu::RenderPipeline,
    display_pipeline: wgpu::RenderPipeline,
    globals: wgpu::Buffer,
    splats: wgpu::Buffer,
    bindings: wgpu::BindGroup,
    hdr_layout: wgpu::BindGroupLayout,
    hdr: Option<(wgpu::TextureView, wgpu::BindGroup, [u32; 2])>,
    srgb: bool,
}
impl RelightPass {
    pub fn new(device: &wgpu::Device, format: wgpu::TextureFormat) -> Self {
        let globals = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("relight-globals"),
            contents: bytemuck::bytes_of(&Globals::zeroed()),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let splats = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("relight-known-surfels"),
            size: (COUNT * std::mem::size_of::<Splat>()) as u64,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("relight-layout"),
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
            label: None,
            layout: &layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: globals.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: splats.as_entire_binding(),
                },
            ],
        });
        let hdr_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: None,
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture {
                    sample_type: wgpu::TextureSampleType::Float { filterable: false },
                    view_dimension: wgpu::TextureViewDimension::D2,
                    multisampled: false,
                },
                count: None,
            }],
        });
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("relight-wgsl"),
            source: wgpu::ShaderSource::Wgsl(include_str!("relight.wgsl").into()),
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: None,
            bind_group_layouts: &[Some(&layout), Some(&hdr_layout)],
            immediate_size: 0,
        });
        let splat_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("relight-splat-layout"),
            bind_group_layouts: &[Some(&layout)],
            immediate_size: 0,
        });
        let pipeline = |vertex, fragment, format, blend, layout: &wgpu::PipelineLayout| {
            device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some(fragment),
                layout: Some(layout),
                vertex: wgpu::VertexState {
                    module: &shader,
                    entry_point: Some(vertex),
                    compilation_options: Default::default(),
                    buffers: &[],
                },
                fragment: Some(wgpu::FragmentState {
                    module: &shader,
                    entry_point: Some(fragment),
                    compilation_options: Default::default(),
                    targets: &[Some(wgpu::ColorTargetState {
                        format,
                        blend,
                        write_mask: wgpu::ColorWrites::ALL,
                    })],
                }),
                primitive: Default::default(),
                depth_stencil: None,
                multisample: Default::default(),
                multiview_mask: None,
                cache: None,
            })
        };
        let splat_pipeline = pipeline(
            "vs_main",
            "fs_main",
            wgpu::TextureFormat::Rgba16Float,
            Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING),
            &splat_layout,
        );
        let display_pipeline = pipeline("vs_display", "fs_display", format, None, &pipeline_layout);
        Self {
            splat_pipeline,
            display_pipeline,
            globals,
            splats,
            bindings,
            hdr_layout,
            hdr: None,
            srgb: format.is_srgb(),
        }
    }

    // ANCHOR: render
    pub fn render(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        target: &wgpu::TextureView,
        size: [u32; 2],
        frame: RelightFrame,
    ) -> Result<(), String> {
        frame.validate()?;
        if size.contains(&0)
            || size
                .iter()
                .any(|&v| v > device.limits().max_texture_dimension_2d)
        {
            return Err("Invalid relight target size".into());
        }
        if self.hdr.as_ref().is_none_or(|v| v.2 != size) {
            let texture = device.create_texture(&wgpu::TextureDescriptor {
                label: Some("linear-radiance"),
                size: wgpu::Extent3d {
                    width: size[0],
                    height: size[1],
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rgba16Float,
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT
                    | wgpu::TextureUsages::TEXTURE_BINDING,
                view_formats: &[],
            });
            let view = texture.create_view(&Default::default());
            let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: None,
                layout: &self.hdr_layout,
                entries: &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&view),
                }],
            });
            self.hdr = Some((view, bind, size));
        }
        let view = Mat4::look_at_rh(frame.eye(), Vec3::ZERO, Vec3::Y);
        let projection = Mat4::perspective_rh(
            45_f32.to_radians(),
            size[0] as f32 / size[1] as f32,
            0.05,
            50.0,
        );
        queue.write_buffer(
            &self.globals,
            0,
            bytemuck::bytes_of(&Globals {
                vp: (projection * view).to_cols_array_2d(),
                eye: frame.eye().extend(0.0).to_array(),
                light: frame.light().extend(frame.intensity).to_array(),
                material: [frame.roughness, frame.metallic, frame.mode as f32, 0.0],
                viewport: [
                    size[0] as f32,
                    size[1] as f32,
                    if self.srgb { 1.0 } else { 0.0 },
                    0.0,
                ],
            }),
        );
        queue.write_buffer(&self.splats, 0, bytemuck::cast_slice(&scene(frame, view)));
        let (hdr, texture_binding, _) = self.hdr.as_ref().unwrap();
        for (view, pipeline, display) in [
            (hdr, &self.splat_pipeline, false),
            (target, &self.display_pipeline, true),
        ] {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("relight-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(pipeline);
            pass.set_bind_group(0, &self.bindings, &[]);
            if display {
                pass.set_bind_group(1, texture_binding, &[]);
                pass.draw(0..3, 0..1);
            } else {
                pass.draw(0..6, 0..COUNT as u32);
            }
        }
        Ok(())
    }
    // END: render
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn nonuniform_deformation_preserves_normal_tangent_orthogonality() {
        let frame = RelightFrame {
            time: 0.25,
            ..Default::default()
        };
        let s = surfel(Vec3::ONE.normalize(), frame);
        let n = Vec3::from_slice(&s.normal[..3]);
        assert!(n.dot(Vec3::from_slice(&s.u[..3])).abs() < 1e-6);
        assert!(n.dot(Vec3::from_slice(&s.v[..3])).abs() < 1e-6);
        let bad = surfel(
            Vec3::ONE.normalize(),
            RelightFrame {
                wrong_normals: true,
                ..frame
            },
        );
        assert!(
            Vec3::from_slice(&bad.normal[..3])
                .dot(Vec3::from_slice(&bad.u[..3]))
                .abs()
                > 0.01
        );
    }
    #[test]
    fn brdf_light_and_material_invariants() {
        let f = RelightFrame::default();
        let [d, s] = reference_brdf(Vec3::Z, Vec3::Z, Vec3::Z, f);
        assert!((d.x - 0.96 * BASE.x / std::f32::consts::PI * f.intensity).abs() < 1e-6);
        assert!(s.min_element() > 0.0);
        assert_eq!(
            reference_brdf(Vec3::Z, Vec3::Z, Vec3::NEG_Z, f),
            [Vec3::ZERO; 2]
        );
        assert_eq!(
            reference_brdf(
                Vec3::Z,
                Vec3::Z,
                Vec3::Z,
                RelightFrame { metallic: 1.0, ..f }
            )[0],
            Vec3::ZERO
        );
        let doubled = reference_brdf(
            Vec3::Z,
            Vec3::Z,
            Vec3::Z,
            RelightFrame {
                intensity: f.intensity * 2.0,
                ..f
            },
        );
        assert!((doubled[1] - s * 2.0).length() < 1e-5);
        assert_eq!(std::mem::size_of::<Globals>(), 128);
        assert_eq!(std::mem::size_of::<Splat>(), 96);
        assert!(RelightFrame {
            roughness: 0.0,
            ..f
        }
        .validate()
        .is_err());
        assert!(RelightFrame {
            intensity: f32::NAN,
            ..f
        }
        .validate()
        .is_err());
    }
}
