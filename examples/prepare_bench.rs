//! Paired real-data CPU benchmark. All visible ID orders must equal variant 0.
use flate2::read::GzDecoder;
use glam::{Mat4, Vec3};
use pajama_gaussian_lab::stg_prepare::StgPreparation;
use std::{error::Error, fs, hint::black_box, io::Read, time::Instant};

fn main() -> Result<(), Box<dyn Error>> {
    let args: Vec<_> = std::env::args().collect();
    let model = args.get(1).ok_or("model path required")?;
    let cameras = args.get(2).ok_or("camera path required")?;
    let output = args.get(3).ok_or("report path required")?;
    let raw = fs::read(model)?;
    let mut ply = Vec::new();
    if raw.starts_with(&[31, 139]) {
        GzDecoder::new(&raw[..]).read_to_end(&mut ply)?;
    } else {
        ply = raw;
    }
    let json: serde_json::Value = serde_json::from_slice(&fs::read(cameras)?)?;
    let c = if json.is_array() {
        &json[0]
    } else {
        &json["cameras"][0]
    };
    let number = |v: &serde_json::Value| v.as_f64().unwrap() as f32;
    let eye = Vec3::new(
        number(&c["position"][0]),
        number(&c["position"][1]),
        number(&c["position"][2]),
    );
    let col = |i: usize| {
        Vec3::new(
            number(&c["rotation"][0][i]),
            number(&c["rotation"][1][i]),
            number(&c["rotation"][2][i]),
        )
    };
    let view = Mat4::look_at_rh(eye, eye + col(2), -col(1));
    let height = number(&c["height"]);
    let width = number(&c["width"]);
    let projection = Mat4::perspective_rh(
        2.0 * (height / (2.0 * number(&c["fy"]))).atan(),
        width / height,
        0.05,
        180.0,
    );
    let mut variants: Vec<_> = (0..11)
        .map(|v| {
            if v == 10 {
                StgPreparation::from_ply_adaptive(&ply).unwrap()
            } else {
                StgPreparation::from_ply(&ply).unwrap()
            }
        })
        .collect();
    let mut results = Vec::new();
    for workload in ["playback", "camera-only", "paused"] {
        let frame = |i: usize| {
            let t = if workload == "playback" {
                (i % 48) as f32 / 49.0 + 0.01
            } else {
                0.5
            };
            let v = if workload == "camera-only" {
                Mat4::from_rotation_y((i % 48) as f32 * 0.0005) * view
            } else {
                view
            };
            (t, v)
        };
        let mut samples = vec![Vec::new(); 11];
        let mut candidates = [0; 11];
        let mut visible = [0; 11];
        // Validate complete output order outside the timer, across all frames.
        for i in 0..48 {
            let (t, v) = frame(i);
            let baseline = variants[0].prepare(t, v, projection, 0).to_vec();
            for variant in 1..11 {
                let actual = variants[variant].prepare(t, v, projection, variant as u8);
                if actual != baseline {
                    let a: std::collections::HashSet<_> = actual.iter().collect();
                    let b: std::collections::HashSet<_> = baseline.iter().collect();
                    panic!("v{variant} frame {i} {workload}: lengths {}/{}; missing {:?}, extra {:?}; first {:?}", actual.len(), baseline.len(), b.difference(&a).take(8).collect::<Vec<_>>(), a.difference(&b).take(8).collect::<Vec<_>>(),actual.iter().zip(&baseline).enumerate().find(|(_, (a,b))|a!=b));
                }
            }
        }
        for round in 0..9 {
            // Rotate order to reduce monotonic temperature / frequency bias.
            for offset in 0..11 {
                let variant = (offset + round) % 11;
                for i in 0..48 {
                    let (t, v) = frame(i);
                    let start = Instant::now();
                    let count = black_box(variants[variant].prepare(
                        black_box(t),
                        black_box(v),
                        black_box(projection),
                        variant as u8,
                    ))
                    .len();
                    let elapsed = start.elapsed().as_secs_f64() * 1000.0;
                    if round > 1 {
                        samples[variant].push(elapsed);
                    }
                    visible[variant] = count;
                    candidates[variant] = variants[variant].candidates;
                }
            }
        }
        for (variant, values) in samples.iter().enumerate() {
            let mut sorted = values.clone();
            sorted.sort_by(f64::total_cmp);
            let result = serde_json::json!({"workload":workload,"variant":variant,"p50Ms":sorted[sorted.len()/2],"p95Ms":sorted[(sorted.len()*95)/100],"samplesMs":values,"visibleLast":visible[variant],"candidatesLast":candidates[variant],"exactIdOrder":true,"temporalIndexBytes":variants[variant].temporal_index_bytes()});
            println!(
                "{workload} v{variant}: {:.4} ms (p95 {:.4})",
                sorted[sorted.len() / 2],
                sorted[(sorted.len() * 95) / 100]
            );
            results.push(result);
        }
    }
    fs::write(
        output,
        serde_json::to_vec_pretty(
            &serde_json::json!({"model":model,"sourceCount":variants[0].len(),"camera":c,"profile":"release opt-level=s; CPU only; 2 warmup + 7 rounds x 48 frames; rotated variant order","results":results}),
        )?,
    )?;
    Ok(())
}
