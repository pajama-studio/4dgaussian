//! cargo run --example workshop -- 6
//! 0..7 choose a milestone; arrows orbit; Space pauses; Home resets; Escape exits.
//! --smoke creates a hidden window and presents all eight stages, then exits.
#[cfg(target_arch = "wasm32")]
fn main() {}

#[cfg(not(target_arch = "wasm32"))]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    desktop::run()
}

#[cfg(not(target_arch = "wasm32"))]
mod desktop {
    use flate2::read::GzDecoder;
    use pajama_gaussian_lab::{workshop::Frame, workshop_surface::WorkshopSurface};
    use std::{io::Read, sync::Arc, time::Instant};
    use winit::{
        application::ApplicationHandler,
        event::{ElementState, WindowEvent},
        event_loop::{ActiveEventLoop, EventLoop},
        keyboard::{Key, NamedKey},
        window::{Window, WindowId},
    };

    struct App {
        window: Option<Arc<Window>>,
        gpu: Option<WorkshopSurface>,
        frame: Frame,
        last: Instant,
        playing: bool,
        smoke: bool,
        presented: u32,
        smoke_attempts: u32,
        error: Option<String>,
    }
    impl App {
        fn load_model(&mut self) -> Result<(), String> {
            let raw = std::fs::read("public/data/n3d-sear-steak-stg-lite.ply.gz")
                .map_err(|e| e.to_string())?;
            let mut ply = Vec::new();
            GzDecoder::new(raw.as_slice())
                .read_to_end(&mut ply)
                .map_err(|e| e.to_string())?;
            let gpu = self.gpu.as_mut().ok_or("GPU not initialized")?;
            gpu.pass.load_model(&gpu.device, &ply)
        }
        fn fail(&mut self, event_loop: &ActiveEventLoop, error: String) {
            eprintln!("{error}");
            self.error = Some(error);
            event_loop.exit();
        }
    }
    impl ApplicationHandler for App {
        fn about_to_wait(&mut self, event_loop: &ActiveEventLoop) {
            if !self.smoke || self.presented >= 8 {
                return;
            }
            self.smoke_attempts += 1;
            if self.smoke_attempts > 600 {
                self.fail(
                    event_loop,
                    "Hidden surface did not present all stages within the smoke budget".into(),
                );
                return;
            }
            // Hidden windows need not receive OS redraw events. Drive only this
            // test's frame callback explicitly, with a bounded retry interval.
            if let Some(window) = &self.window {
                let id = window.id();
                self.window_event(event_loop, id, WindowEvent::RedrawRequested);
            }
            event_loop.set_control_flow(winit::event_loop::ControlFlow::WaitUntil(
                Instant::now() + std::time::Duration::from_millis(16),
            ));
        }
        // ANCHOR: native-create
        fn resumed(&mut self, event_loop: &ActiveEventLoop) {
            if self.window.is_some() {
                return;
            }
            let attributes = Window::default_attributes()
                .with_title("4DGS Workshop · 0–7 stages · arrows orbit · Space pause · Home reset")
                .with_inner_size(winit::dpi::LogicalSize::new(960, 640))
                .with_visible(!self.smoke);
            let window = match event_loop.create_window(attributes) {
                Ok(window) => Arc::new(window),
                Err(e) => {
                    self.fail(event_loop, e.to_string());
                    return;
                }
            };
            let mut descriptor = wgpu::InstanceDescriptor::new_without_display_handle();
            if cfg!(target_os = "windows") {
                descriptor.backends = wgpu::Backends::DX12;
            }
            let instance = wgpu::Instance::new(descriptor);
            let surface = match instance.create_surface(window.clone()) {
                Ok(surface) => surface,
                Err(e) => {
                    self.fail(event_loop, e.to_string());
                    return;
                }
            };
            let size = window.inner_size();
            // Blocking is confined to desktop startup. The browser host awaits.
            self.gpu = match pollster::block_on(WorkshopSurface::new(
                instance,
                surface,
                size.width,
                size.height,
            )) {
                Ok(gpu) => {
                    println!("{}", gpu.adapter_label);
                    Some(gpu)
                }
                Err(e) => {
                    self.fail(event_loop, e);
                    return;
                }
            };
            self.window = Some(window);
            if self.frame.stage == 7 || self.smoke {
                if let Err(e) = self.load_model() {
                    self.fail(event_loop, e);
                    return;
                }
            }
            self.last = Instant::now();
            self.window.as_ref().unwrap().request_redraw();
        }
        // END: native-create
        fn suspended(&mut self, _: &ActiveEventLoop) {
            self.gpu = None;
            self.window = None;
        }
        // ANCHOR: native-events
        fn window_event(&mut self, event_loop: &ActiveEventLoop, id: WindowId, event: WindowEvent) {
            let Some(window) = self.window.clone() else {
                return;
            };
            if id != window.id() {
                return;
            }
            match event {
                WindowEvent::CloseRequested => event_loop.exit(),
                WindowEvent::Resized(size) => {
                    if let Some(gpu) = &mut self.gpu {
                        gpu.resize(size.width, size.height);
                    }
                    window.request_redraw();
                }
                WindowEvent::KeyboardInput { event, .. }
                    if event.state == ElementState::Pressed =>
                {
                    match event.logical_key {
                        Key::Named(NamedKey::Escape) => event_loop.exit(),
                        Key::Named(NamedKey::Space) => self.playing = !self.playing,
                        Key::Named(NamedKey::ArrowLeft) => self.frame.yaw -= 0.15,
                        Key::Named(NamedKey::ArrowRight) => self.frame.yaw += 0.15,
                        Key::Named(NamedKey::ArrowUp) => {
                            self.frame.pitch = (self.frame.pitch + 0.1).min(1.4)
                        }
                        Key::Named(NamedKey::ArrowDown) => {
                            self.frame.pitch = (self.frame.pitch - 0.1).max(-1.4)
                        }
                        Key::Named(NamedKey::Home) => {
                            self.frame = Frame {
                                stage: self.frame.stage,
                                ..Frame::default()
                            }
                        }
                        Key::Character(text) => {
                            if let Ok(stage @ 0..=7) = text.parse::<u32>() {
                                if stage == 7 {
                                    if let Err(e) = self.load_model() {
                                        self.fail(event_loop, e);
                                        return;
                                    }
                                }
                                self.frame.stage = stage;
                            }
                        }
                        _ => {}
                    }
                    window.request_redraw();
                }
                WindowEvent::RedrawRequested => {
                    if self.smoke && self.presented >= 8 {
                        return;
                    }
                    let now = Instant::now();
                    let dt = now.duration_since(self.last).as_secs_f32().min(0.1);
                    self.last = now;
                    if self.playing {
                        self.frame.time = (self.frame.time + dt / 10.0).fract();
                    }
                    let size = window.inner_size();
                    if size.width == 0 || size.height == 0 {
                        return;
                    }
                    if let Some(gpu) = &mut self.gpu {
                        match gpu.render(self.frame) {
                            Ok(Some(count)) if self.smoke => {
                                println!("presented stage={} visible={count}", self.frame.stage);
                                self.presented += 1;
                                if self.presented == 8 {
                                    event_loop.exit();
                                    return;
                                }
                                self.frame.stage = self.presented;
                            }
                            Ok(_) => {}
                            Err(e) => {
                                self.fail(event_loop, e);
                                return;
                            }
                        }
                    }
                    if self.playing || self.smoke {
                        window.request_redraw();
                    }
                }
                _ => {}
            }
        }
        // END: native-events
    }
    pub fn run() -> Result<(), Box<dyn std::error::Error>> {
        let args: Vec<_> = std::env::args().skip(1).collect();
        let smoke = args.iter().any(|s| s == "--smoke");
        let stage = if smoke {
            0
        } else {
            args.first().map(|s| s.parse()).transpose()?.unwrap_or(6)
        };
        if stage > 7 {
            return Err("Stage must be 0..7".into());
        }
        let mut app = App {
            window: None,
            gpu: None,
            frame: Frame {
                stage,
                ..Frame::default()
            },
            last: Instant::now(),
            playing: !smoke,
            smoke,
            presented: 0,
            smoke_attempts: 0,
            error: None,
        };
        EventLoop::new()?.run_app(&mut app)?;
        if let Some(error) = app.error {
            return Err(error.into());
        }
        Ok(())
    }
}
