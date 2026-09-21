# Build a cross-platform viewer: implementation and evidence

The `/build/` series complements `/learn/` (theory) and `/math/` (derivations).
It contains 12 bilingual engineering chapters, 48 explanatory sections, eight
executable GPU milestones, source snapshots, debugging exercises and local review
marks. English is the default; the existing shared language preference is honored.

## Implementation map

| File | Responsibility |
| --- | --- |
| `src/workshop.rs` | Surface-independent teaching pass, explicit 80-byte uniform / 48-byte instance layouts, camera, motion, ordering, delegation to `StgPass` |
| `src/workshop.wgsl` | Triangle, quad, Gaussian fragment, projected covariance and ellipse |
| `src/workshop_surface.rs` | Shared GPU setup, resize, acquire, submit and presentation |
| `src/workshop_web.rs` | Small WASM interface around the shared surface host |
| `examples/workshop.rs` | winit desktop host, stage keys, camera, playback and bounded hidden-window smoke |
| `examples/workshop_pixels.rs` | Offscreen GPU checks and PNG/JSON evidence |
| `public/build/lab.mjs` | Browser input, fetch/decompression, timing and readable status |
| `scripts/build/posts.mjs` | Bilingual engineering content and milestone mapping |
| `scripts/build-workshop.mjs` | Static pages, KaTeX, exact source excerpts and SHA-256 manifest |
| `scripts/check-workshop.mjs` | Content, localization, links/anchors and source integrity checks |

Milestones select modes in the complete reference implementation, not separate
historical commits. The chapters explain the additions and give editable source
blocks with their full context. Stage 7 uses the existing real-model pass and
pretrained fixture; the toy stages use synthetic records with direct RGB.

## Validation on 2026-09-21

- `npm run check`: passed, including existing math/SH/training/inspector checks,
  the 12-chapter site check, 10 Rust tests, native example compilation, WASM target
  compilation and release WASM build.
- `cargo run --locked --example workshop_pixels`: 11 image cases passed on
  NVIDIA GeForce RTX 4090 / D3D12. Checks cover clear, coverage, uploaded RGB,
  Gaussian falloff, alpha order, changed camera and changed time.
  Center RGB8 was `[127,16,64]` in correct order and `[64,32,127]` reversed,
  within two byte values of the analytic reference.
- `cargo run --locked --example workshop -- --smoke`: all stages 0–7 acquired,
  submitted and presented through a native hidden window, then exited. Stage 7
  reported 82,996 visible records at the default teaching camera/time.
- `cargo run --locked --example native_smoke`: the real STG-Lite fixture passed
  the existing known-camera tests at t = 0.1, 0.5, 0.9.
- `cargo run --locked --example mini_compute`: CPU/GPU pixel oracle passed;
  maximum absolute channel error across the three cases was about 0.00218.
- Browser WebGPU: clear, triangle, quad, falloff, alpha order, camera/time,
  research-model loading, playback/pause and state-preserving EN/ZH switching
  exercised through the actual UI. No warnings/errors in the observed log.
- Responsive checks: all 12 English posts at 390px, index and lab in Chinese at
  390px, expanded source scrolling, local review persistence and desktop layout.
  No document-level horizontal overflow in those checks. Review test marks were
  removed after testing; temporary viewport override was reset.

`artifacts/workshop/` contains the native PNGs and report. The native test uses
synchronous readback and a debug build, so its timings are not throughput claims.
The website's `validation.json` publishes the focused pixel-test results.

## Boundaries

- Windows/D3D12 and the browser/WebGPU path have runtime evidence. macOS/Metal
  and Linux/Vulkan still require their own runtime validation. CUDA is not a
  wgpu backend and has not been implemented here.
- This is a forward renderer, not a full differentiable trainer. The series
  links the existing real synthetic training lab and PyTorch capstone.
- The toy uses axis-aligned world covariances and uploads two small records per
  frame. The real pass handles the STG-Lite quaternion/motion contract and keeps
  source records resident.
- Current `StgPass` is single-sample and uses the baseline's center-depth ordering,
  center-margin visibility heuristic and footprint cap. Production integration
  must reconcile color space, depth convention, near-plane bounds and MSAA.
- Surface loss/outdated states are reconfigured. Full device-loss recovery is
  not implemented; the browser shows a failure/reload path.
- The existing Rust/wgpu engine integration boundary is documented; this change
  adds the standalone native host without modifying a separate engine repository.
