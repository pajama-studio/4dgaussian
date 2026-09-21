//! Shared presentation policy. The hosts provide a surface and input; this type
//! owns the GPU resources. Offscreen callers can use WorkshopPass directly.
use crate::workshop::{Frame, WorkshopPass};

pub struct WorkshopSurface {
    surface: wgpu::Surface<'static>,
    pub device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    pub pass: WorkshopPass,
    pub adapter_label: String,
}

impl WorkshopSurface {
    // ANCHOR: init
    pub async fn new(
        instance: wgpu::Instance,
        surface: wgpu::Surface<'static>,
        width: u32,
        height: u32,
    ) -> Result<Self, String> {
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: Some(&surface),
                force_fallback_adapter: false,
                apply_limit_buckets: false,
            })
            .await
            .map_err(|e| e.to_string())?;
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor::default())
            .await
            .map_err(|e| e.to_string())?;
        let caps = surface.get_capabilities(&adapter);
        // Keep the educational RGB values in the same UNORM convention as the
        // research baseline. A production HDR renderer needs an explicit conversion.
        let format = caps
            .formats
            .iter()
            .copied()
            .find(|f| !f.is_srgb())
            .unwrap_or(caps.formats[0]);
        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            color_space: wgpu::SurfaceColorSpace::Auto,
            width: 1,
            height: 1,
            present_mode: wgpu::PresentMode::Fifo,
            alpha_mode: caps.alpha_modes[0],
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        };
        let pass = WorkshopPass::new(&device, format);
        let info = adapter.get_info();
        let adapter_label = format!("{:?} · {}", info.backend, info.name);
        let mut renderer = Self {
            surface,
            device,
            queue,
            config,
            pass,
            adapter_label,
        };
        renderer.resize(width.max(1), height.max(1));
        Ok(renderer)
    }
    // END: init

    pub fn resize(&mut self, width: u32, height: u32) {
        if width == 0 || height == 0 {
            return;
        }
        let limit = self.device.limits().max_texture_dimension_2d;
        self.config.width = width.min(limit);
        self.config.height = height.min(limit);
        self.surface.configure(&self.device, &self.config);
    }

    // ANCHOR: frame
    pub fn render(&mut self, input: Frame) -> Result<Option<u32>, String> {
        let frame = match self.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(frame)
            | wgpu::CurrentSurfaceTexture::Suboptimal(frame) => frame,
            wgpu::CurrentSurfaceTexture::Outdated | wgpu::CurrentSurfaceTexture::Lost => {
                self.surface.configure(&self.device, &self.config);
                return Ok(None);
            }
            wgpu::CurrentSurfaceTexture::Timeout | wgpu::CurrentSurfaceTexture::Occluded => {
                return Ok(None)
            }
            wgpu::CurrentSurfaceTexture::Validation => {
                return Err(
                    "Surface validation failed; reload to recreate the GPU resources".into(),
                )
            }
        };
        let count =
            self.pass
                .prepare(&self.queue, input, [self.config.width, self.config.height])?;
        let target = frame.texture.create_view(&Default::default());
        let mut encoder = self.device.create_command_encoder(&Default::default());
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("workshop-frame"),
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
            self.pass.draw(&mut pass);
        }
        self.queue.submit([encoder.finish()]);
        self.queue.present(frame);
        Ok(Some(count))
    }
    // END: frame
}
