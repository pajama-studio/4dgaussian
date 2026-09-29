//! Hardware regression checks: cargo run --release --example gpu_prepare_check
//! Synthetic inputs exercise tails, exact ties, hidden points and cache reuse.
use glam::Mat4;
use pajama_gaussian_lab::gpu_prepare::GpuPreparation;
use wgpu::util::DeviceExt;

fn main() {
    pollster::block_on(run());
}
async fn run() {
    let mut descriptor = wgpu::InstanceDescriptor::new_without_display_handle();
    if cfg!(target_os = "windows") {
        descriptor.backends = wgpu::Backends::DX12;
    }
    let instance = wgpu::Instance::new(descriptor);
    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions::default())
        .await
        .unwrap();
    // No optional features: the actual sorting path must work on core WebGPU.
    let (device, queue) = adapter
        .request_device(&wgpu::DeviceDescriptor::default())
        .await
        .unwrap();
    let projection = Mat4::perspective_rh(1.0, 1.0, 0.05, 180.0);
    for count in [1usize, 127, 128, 129, 1025, 32769] {
        for mode in 0..3 {
            let mut rows = vec![[0f32; 32]; count];
            let mut expected = Vec::new();
            for (id, row) in rows.iter_mut().enumerate() {
                row[2] = -((id % 8 + 1) as f32);
                row[24] = 1.0;
                // Equal-depth groups are intentional; original IDs break ties.
                let hidden = mode == 1 || (mode == 2 && id % 3 == 0);
                if hidden {
                    match id % 3 {
                        0 => row[0] = 10000.0,
                        1 => row[2] = 2.0,
                        _ => row[20] = -30.0,
                    }
                } else {
                    expected.push((!(row[2].abs().to_bits() ^ 0x8000_0000), id as u32));
                }
            }
            expected.sort();
            let source = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("synthetic-tail-ties"),
                contents: bytemuck::cast_slice(&rows),
                usage: wgpu::BufferUsages::STORAGE,
            });
            let mut gpu = GpuPreparation::new(&device, &source, count as u32);
            let read = device.create_buffer(&wgpu::BufferDescriptor {
                label: None,
                size: 16 + count as u64 * 8,
                usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
            let mut encoder = device.create_command_encoder(&Default::default());
            assert!(gpu.encode(&queue, &mut encoder, 0.0, Mat4::IDENTITY, projection, None));
            encoder.copy_buffer_to_buffer(&gpu.indirect, 0, &read, 0, 16);
            encoder.copy_buffer_to_buffer(&gpu.keys, 0, &read, 16, count as u64 * 8);
            queue.submit([encoder.finish()]);
            let (send, recv) = std::sync::mpsc::channel();
            read.slice(..)
                .map_async(wgpu::MapMode::Read, move |r| send.send(r).unwrap());
            device.poll(wgpu::PollType::wait_indefinitely()).unwrap();
            recv.recv().unwrap().unwrap();
            let data = read.slice(..).get_mapped_range().unwrap();
            assert_eq!(u32::from_le_bytes(data[0..4].try_into().unwrap()), 6);
            assert_eq!(
                u32::from_le_bytes(data[4..8].try_into().unwrap()) as usize,
                expected.len()
            );
            let pairs: Vec<_> = data[16..]
                .chunks_exact(8)
                .map(|b| {
                    (
                        u32::from_le_bytes(b[..4].try_into().unwrap()),
                        u32::from_le_bytes(b[4..].try_into().unwrap()),
                    )
                })
                .collect();
            assert_eq!(
                &pairs[..expected.len()],
                expected.as_slice(),
                "count {count}, mode {mode}"
            );
            assert!(pairs.windows(2).all(|w| w[0] <= w[1]));
            let mut ids: Vec<_> = pairs.iter().map(|x| x.1).collect();
            ids.sort_unstable();
            assert_eq!(ids, (0..count as u32).collect::<Vec<_>>());
            drop(data);
            read.unmap();
            let mut encoder = device.create_command_encoder(&Default::default());
            assert!(!gpu.encode(&queue, &mut encoder, 0.0, Mat4::IDENTITY, projection, None));
            assert!(gpu.encode(&queue, &mut encoder, 0.25, Mat4::IDENTITY, projection, None));
            queue.submit([encoder.finish()]);
            device.poll(wgpu::PollType::wait_indefinitely()).unwrap();
            println!(
                "Passed count={count}, mode={mode}, visible={}",
                expected.len()
            );
        }
    }
    println!(
        "18 GPU culling/sort cases passed on {}",
        adapter.get_info().name
    );
}
