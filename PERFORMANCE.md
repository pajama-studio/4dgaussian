# Performance ledger

These numbers describe one research fixture on one browser/device. They are not general 4DGS or cross-platform claims.

## Research fixture

- Model: official `n3d_sear_steak_lite_allcam` STG-Lite pretrained model.
- Source: Neural 3D Video `sear_steak`, a synchronized 21-camera capture.
- Source splats: 108,317.
- Network asset: 10.3 MiB gzip; decoded/GPU source payload: 13.2 MiB.
- Record: 32 little-endian floats / 128 bytes per splat.
- RGB reference: official `cam00.mp4`, delivered as a 960 × 720 / 30 FPS / 10-second browser transcode (0.46 MiB).

## 2026-09-15 local browser profile

- Environment: Playwright Chromium headless with WebGPU on the local Apple machine; 1440 × 1000 viewport; device scale 1.
- Method: select official calibrated `cam00`, wait for a visible WebGPU frame, then sample 300 consecutive `requestAnimationFrame` callbacks while the ten-second UI loop plays.
- Visible splats: 86,425–90,098.
- CPU preparation: p50 5.6 ms, p95 5.8 ms, max 5.9 ms.
- CPU sort: p50 1.6 ms, p95 1.8 ms, max 1.8 ms.
- Presented frame interval: p50 16.7 ms, p95 18.4 ms, max 18.7 ms.
- Last sampled order upload: 359,860 bytes (0.34 MiB).
- Browser/page errors: none.

The presented interval is VSync-limited and is not a renderer throughput ceiling. CPU preparation includes time evaluation, conservative culling, sorting, and index packing; it excludes GPU execution. Reproduce with `npm run profile -- <url> <frames>`.

Public v0.3 calibrated-camera smoke profile: 180 frames from `https://gaussian.pajama.studio`; 86,397–89,723 visible; prepare p50/p95 5.6/5.8 ms; sort p50/p95 1.6/1.7 ms; presented interval p50/p95 16.7/18.5 ms; no browser or page errors. A separate 390 × 844 public check loaded all five camera options with no page errors or horizontal overflow.

Public v0.4 profile after adding the RGB comparison path: 180 calibrated-camera render frames; 87,967–90,043 visible; prepare p50/p95 5.6/5.9 ms; sort p50/p95 1.6/1.8 ms; presented interval p50/p95 16.7/18.2 ms; no browser or page errors. Automated comparison QA loaded and played the official 10-second video, selected `cam00`, held the UI/video clock delta to 6.1 ms at the sampled frame, and found no desktop or 390 × 844 mobile overflow. This clock delta is a synchronization smoke check, not a guarantee for every device or a visual-fidelity score.

## Fixed-frame fidelity diagnostic

The public v0.4 canvas was paused at 1, 5, and 9 seconds in calibrated `cam00`. UI overlays were hidden, the fitted 4:3 render viewport was cropped and resampled to 960 × 720, and it was compared with frames 30, 150, and 270 from the browser RGB fixture using FFmpeg's `psnr` and `ssim` filters in `yuv444p`.

| Time | Source frame | PSNR average | SSIM all |
| --- | ---: | ---: | ---: |
| 1 s | 30 | 30.9822 dB | 0.941294 |
| 5 s | 150 | 31.6388 dB | 0.940250 |
| 9 s | 270 | 30.9574 dB | 0.939582 |

These values are useful as renderer regression diagnostics, not publication-quality benchmark results: the model checkpoint is named `allcam`; the reference is a delivery transcode rather than the pristine source frame; the browser screenshot introduces one viewport resample; and this implementation is not pixel-identical to the reference CUDA rasterizer. The checked-in `capture:fidelity` script makes the render capture reproducible, while the metric step deliberately remains documented rather than represented as a test gate.

## 2026-09-15 local timestamp-query profile

- Environment and view: same Playwright Chromium/Metal path and calibrated `cam00`, sampled for 180 presented frames after the asynchronous query ring produced results.
- Visible splats: 87,359–89,983.
- CPU preparation: p50 5.6 ms; p95 5.9 ms; max 5.9 ms.
- CPU sort subset: p50 1.6 ms; p95 1.8 ms; max 1.8 ms.
- GPU render pass: p50 2.936 ms; p95 3.046 ms; max 3.317 ms.
- Presented frame interval: p50 16.7 ms; p95 17.6 ms; max 17.7 ms.
- Browser/page errors: none.

The query begins and ends at render-pass boundaries, so it covers the splat draw and attachment operations but not JavaScript/Rust preparation, queue submission, swapchain presentation, the DOM video layer, or display scanout. Timestamp support is optional and reported as unavailable rather than estimated when an adapter does not expose it. On this fixture, total CPU preparation is already larger than the measured GPU render pass; a GPU experiment should therefore move evaluation, culling, compaction, key generation, and ordering as one pipeline rather than optimizing the 1.6 ms sort in isolation.

Public v0.5 confirmation: 180 frames from `https://gaussian.pajama.studio`; 89,569–90,098 visible; CPU prepare p50/p95 5.6/5.9 ms; CPU sort 1.6/1.8 ms; GPU render pass 2.954/3.064 ms; presented interval 16.7/18.6 ms; no browser/page errors. A separate public desktop/mobile comparison QA reported a 3.004 ms live GPU pass sample, 6.5 ms RGB/video timeline delta, six camera options, and zero horizontal overflow.

Local v0.6 delivery QA kept the alternate video idle until an explicit click, preserving a 61 FPS presentation sample in the active viewer. At 2×, the measured RGB effective playback rate was 2.0002× and the render/video clock delta was 26.5 ms. Starting the alternate preview requested its initialization data plus three of nine media fragments, produced a continuous 0–6.006 second buffered range, reached `HAVE_ENOUGH_DATA`, and advanced 1.218 seconds during the 1.2-second smoke window. Desktop and 390 × 844 layouts reported no horizontal overflow. These are delivery/synchronization smoke checks, not network-wide startup guarantees.

Public v0.6 confirmation at `https://gaussian.pajama.studio`: 61 FPS presentation sample before requesting the alternate stream; 2.0001× measured effective playback at the 2× setting; 25.3 ms render/video clock delta; three initial Flames fragments produced the same continuous 0–6.006 second buffer and advanced 1.215 seconds in the 1.2-second smoke window. No browser/page errors or desktop/mobile horizontal overflow were observed.

## 2026-09-16 v0.7 workbench profile

Local Playwright Chromium/Metal profile at 1440 × 1000, DPR 1, default calibrated camera, 300 presented frames after model initialization:

- Source splats: 108,317; visible range: 84,548–89,957.
- CPU preparation: p50 5.2 ms, p95 5.4 ms, max 5.6 ms.
- CPU sort subset: p50 1.5 ms, p95 1.6 ms, max 1.7 ms.
- GPU render pass: p50 2.040 ms, p95 2.184 ms, max 2.500 ms.
- Presented interval: p50 16.7 ms, p95 17.5 ms, max 17.7 ms.
- Last order upload: 345,584 bytes.
- Browser/page errors: none.

This is a new viewport/layout profile, not a renderer-only A/B against v0.6. The workbench allocates a smaller raster surface than the previous full-width viewer, so lower GPU pass time cannot be attributed to shader changes. End-to-end QA additionally verified two scene cards, the repository brand mark, 1.9998× effective playback at the 2× setting, a 13.2 ms video/timeline delta, three-fragment/6.006-second initial Flames buffering, suspension of STG metric updates while Flames is active, successful renderer resumption, and zero 1440px/390px horizontal overflow.

Public v0.7 confirmation at `https://gaussian.pajama.studio/?v=0.7.0`: 300 frames; 84,548–90,014 visible; CPU prepare p50/p95 5.2/5.6 ms; sort 1.5/1.6 ms; GPU pass 2.053/2.222 ms; presented interval 16.7/17.4 ms; no page errors. Public end-to-end QA measured 1.99998× effective playback, a 33.0 ms comparison clock delta, three-fragment/6.006-second initial Flames buffering, renderer suspension/resumption across scene switches, the repository logo, and zero desktop/mobile horizontal overflow.

## Decisions and gates

| Decision | Why | Evidence now | Revisit when |
| --- | --- | --- | --- |
| Use a published learned fixture | Procedural data cannot reveal learned scale, temporal support, reconstruction artifacts, or realistic count | The page renders 108,317 official STG-Lite Gaussians | A second representation or capture is needed for comparative conclusions |
| Keep 13.2 MiB source records GPU-resident | Per-frame attribute uploads would dominate bandwidth unnecessarily | Only 0.35–0.37 MiB of order indices cross per frame in the measured view | Streaming/LOD requires partial residency |
| Evaluate anisotropic covariance | Camera-facing billboards discard learned 3D rotation and scale | The shader projects three quaternion-oriented axes through the homogeneous perspective Jacobian | Ground-truth crops expose footprint or filtering errors |
| Preserve calibrated camera poses/intrinsics | Orbit controls alone cannot validate coordinate and projection conventions | Five official cameras produce distinct, coherent 4:3 views with no runtime errors | Ground-truth frames become available for image metrics |
| Synchronize the official `cam00` RGB source | A plausible reconstruction can still be spatially or temporally misaligned | Fixed 50/50 wipe shares the video clock with the calibrated render | Numerical comparison is defined with a checkpoint suitable for the claimed split |
| CPU temporal visibility + global depth sort | It is a simple, inspectable correctness baseline | p50 preparation 5.6 ms and sort 1.6 ms at ~87k–90k visible splats | A complete GPU preprocess pipeline beats it without changing fixed-frame output |
| Optional GPU timestamp queries | FPS alone hides CPU/GPU/VSync boundaries | Three asynchronous readbacks report a 2.936 ms p50 render pass on the local profile | Query support is absent, or finer compute/raster boundaries are required |
| Cap browser DPR at 1.35 | Prevent dense displays from silently multiplying raster cost | Applied in the viewer; no isolated A/B yet | A GPU-time trace and image-quality target justify a different cap |

## Next research experiments

1. Reproduce the reference rasterizer closely enough for an apples-to-apples image comparison, then report PSNR/SSIM and failure crops. The current checkpoint is named `allcam`, so the synchronized `cam00` view is not claimed as held-out evaluation.
2. Compare the CPU baseline with a complete WebGPU preprocess path—motion evaluation, culling, compaction, depth-key generation, and radix sorting—using identical frames and order-sensitive image diffs.
3. Split GPU timestamps around future compute and raster passes so the migration can be evaluated independently.
4. Add spatial and temporal chunks, progressive LOD, cancellation, and bounded residency; report startup, seek latency, bytes, decode, upload, and visual error together.
5. Run the same fixtures on browser WebGPU and native wgpu backends; keep correctness and throughput conclusions separate.
6. Compare against a research web baseline such as WebSplatter rather than claiming state of the art from a single implementation.
