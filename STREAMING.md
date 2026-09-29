# Temporal streaming and measured optimization

Live: <https://4dgaussian.pajama.studio/streaming/>. Research: <https://4dgaussian.pajama.studio/streaming/research.html>.

## What is implemented

Rust/wgpu renders two author-published STG-Lite checkpoints: Sear (108,317 source Gaussians) and Flames (332,865). Cloudflare Workers addresses their records by a **time interval in seconds** and streams immutable R2 objects. The browser verifies compressed SHA-256, decodes with four concurrent requests, assembles records in original-ID order, then atomically replaces the GPU-resident source on the existing device. All active records share one depth sort; chunks are not independently alpha-blended.

The decoded chunk cache has a 64 MiB budget; inactive objects remain reusable until LRU eviction is needed to admit a new window. This is **not total application RAM**: merge buffers, Rust source/caches, inspection copies, the old and new GPU buffers during replacement, and frame attachments also consume memory. The viewer now keeps the complete checkpoint resident when its decoded records fit the budget, avoiding repeated uploads of the same short scene. Larger manifests use bounded windows planned in seconds and prepare the next one before the boundary. Fetch, decompression, hashing, linear ID assembly and focus estimation run in a module Web Worker; PLY buffers are transferred to the main thread. GPU source replacement still runs on the main thread for a changed large-scene window, so general large-scene seamless playback and GPU suballocation remain unproven. High-duration background primitives are present in most windows, so these short fixtures offer limited bandwidth savings. No quality-reducing spatial LOD is enabled.

The checkpoints cover the first **50 frames**, about **1.67 seconds**, of longer source videos. DeskGames Cube is separately acquired **200-second training input**. A trained 200-second or million-Gaussian sequence has not been benchmarked. See [the concrete training plan](docs/preparation/long-sequence-training.md).

## Camera controls and playback follow-up

The streaming canvas supports mouse/touch orbit, scroll/pinch zoom, Shift/right-drag or two-finger pan, arrow keys, and Home/reset. The initial and reset camera preserve the selected calibration. The orbit pivot lies along its forward ray at the opacity-weighted scene depth; changing camera presets resets the orbit.

The previous streamer rebuilt its resident source approximately every 0.2 seconds on these short checkpoints. It even repeated CPU PLY assembly on cache hits. The new resident policy avoids those transitions for both published fixtures. The page includes a **Measure 6 s playback** button reporting actual frame intervals, buffering, source replacements and media-clock advance after a one-second warmup. Results are local browser measurements, not universal FPS claims. [Published playback evidence](public/streaming/evidence/playback-followup.json): both scenes submitted 360 frames in approximately 6.003 seconds at 1179×884; p95 frame interval 16.8 ms; zero >50 ms intervals, buffering events or source replacements. [Same-record assembly A/B](public/streaming/evidence/assembly-improvement.json): Sear 31.22→13.72 ms and Flames 105.92→41.93 ms on Node, with byte-identical output.

`node scripts/check-stream-playback.mjs` checks calibration preservation, orbit/reset invariants, synthetic long-manifest window budgets, and byte-identical assembly on both real fixtures. The former comparator-based assembly is retained only as a test oracle.

## GPU culling, stable sorting and indirect drawing

The browser streaming player, home viewer and STG docs sample now enable the GPU path by default; home and streaming controls retain the CPU baseline. Native hosts opt in with `StgPass::new_gpu`, then call `encode_prepare` before opening the render pass. `StgPass::new` preserves the existing CPU host contract. `GaussianRenderer.setGpuDriven` switches the browser path and invalidates preparation. Picking still evaluates the CPU reference on demand when the user clicks, not every playback frame.

`src/gpu_cull.wgsl` evaluates cubic motion, temporal opacity and the existing center-frustum policy. Invisible entries get a sentinel. `src/gpu_radix.wgsl` performs eight stable 4-bit radix passes with workgroup histograms, tiled prefix scans and shared bit masks. All 32 depth bits are retained. Sorting places visible entries first and writes a packed 4-byte source-ID stream. A GPU atomic count drives `draw_indirect`. The renderer uploads only small uniforms/draw reset data instead of the per-frame visible-ID list; an optional asynchronous 16-byte count copy serves UI telemetry only. There are no subgroups, GPU spin locks or CPU readback dependencies in drawing. Extra GPU working buffers cost about 21 bytes per source record. Sorting still processes invisible sentinels; it is not a visibility-sized sort or occlusion culling.

Native RTX 4090 / DX12, 1280×960, **the already optimized CPU v9** versus GPU preparation:

| Real checkpoint | CPU path → GPU path serialized frame p50 | Reduction | CPU preparation + encoding p50 |
| --- | --- | --- | --- |
| Sear, 108,317 records | 3.621 → 1.511 ms | 58.3% | 2.351 → 0.053 ms |
| Flames, 332,865 records | 9.514 → 1.705 ms | 82.1% | 8.087 → 0.054 ms |

Two warmup + seven measured rounds × 12 frames, rotating backend order: three calibrated cameras × four normalized times (including 0 and 1). GPU timestamps include culling, all sort passes and rendering. Serialized CPU-to-completion latency includes a fixed small timestamp copy but excludes image/order correctness readbacks, networking and display refresh; **not browser FPS or pipelined throughput**. Full raw samples, p95, source/model hashes and 24 image comparisons: [Sear](public/streaming/evidence/gpu-driven-sear.json), [Flames](public/streaming/evidence/gpu-driven-flames.json). Website explanation: `/streaming/gpu-driven.html`. Browser **Compare CPU / GPU on this device** runs three rotated paired rounds, 24 warmup + 96 fixed-time frames per backend per round; browser GPU telemetry may lag/repeat and is explicitly labeled asynchronous.

Quality is measured rather than assumed bit-identical. Every source ID survives exactly once in sorted keys; the sort is stable for equal GPU depth keys. All Sear visible sets match. In one Flames camera/time, GPU exp rounding retains ID 324748 at the 1/255 opacity threshold; the report retains its CPU opacity and the 16-ULP cutoff-band check. Non-threshold visible-set differences fail validation. GPU/CPU arithmetic can reorder nearly equal depths; maximum image RMSE is 0.04253 on the 0–255 scale, maximum individual channel difference is 7 (Sear), 2 (Flames). The image acceptance gate is RMSE ≤0.25. These are finite image regressions, not pixel-exact equivalence for every scene. `gpu_prepare_check` passes 18 synthetic hardware cases covering all-visible/all-hidden/mixed records, exact-depth ties, 128-lane tails, multi-tile prefix scans and unchanged-frame caching. Metal/mobile/iGPU correctness and performance remain unmeasured.

```sh
cargo run --release --example gpu_prepare_check
cargo run --release --example gpu_driven_bench -- public/data/n3d-sear-steak-stg-lite.ply.gz public/data/n3d-sear-steak-reference-cameras.json artifacts/gpu-driven-sear
cargo run --release --example gpu_driven_bench -- artifacts/streaming/flames.ply artifacts/streaming/flames-cameras.json artifacts/gpu-driven-flames
node scripts/build-gpu-report.mjs
```

## Ten measured changes

The machine was Windows, Threadripper 3990X, RTX 4090 (24,564 MiB), driver 591.86, 128 GiB system RAM. Native CPU benchmark uses release `opt-level=s`, two warmup rounds followed by seven recorded rounds of 48 frames, rotating variant order. Workloads are playback, camera-only motion at fixed time, and an unchanged frame. Every variant must match baseline visible ID order. Raw samples and p95 are published under `public/streaming/evidence/`.

| Change | Flames measured evidence | Scope |
| --- | --- | --- |
| 1. Cache opacity sigmoid | 13.571 → 12.508 ms | CPU playback preparation |
| 2. Conservative temporal rejection | 12.508 → 11.434 ms | CPU playback preparation |
| 3. Full-f32 stable radix sort | 11.482 → 8.983 ms | CPU playback preparation; intervening bucket experiment retained for the A/B |
| 4. Cache unchanged prepared frame | 8.900 → <0.001 ms | Paused CPU preparation only |
| 5. Cache temporal samples during camera motion | 8.897 → 5.688 ms | Camera-only workload; initial eager cache writes hurt playback |
| 6. Skip exp inside a guaranteed-visible interval | 9.595 → 8.703 ms | CPU playback; still use the exact test near the boundary |
| 7. Three radix passes (11/11/10 bits) | 8.703 → 8.382 ms | CPU playback; no depth quantization |
| 8. Fill position cache only after time repeats | 8.382 → 8.121 ms | Removes iteration 5's eager playback writes |
| 9. Avoid an unselective temporal index | 70.40 → 0 MiB index payload; 8.121 → 8.003 ms | Memory versus the candidate index, **not** 70 MiB saved versus the original renderer |
| 10. Submit only after render-state invalidation | 120 → 1 submissions in two 2-second windows | Actual browser idle A/B; no moving-frame FPS claim |

Overall playback preparation: **Sear 4.696 → 2.243 ms (52.2% lower), Flames 13.571 → 8.003 ms (41.0% lower)**. Sear p95: 4.813 → 2.424 ms; Flames p95: 13.814 → 8.187 ms. The adaptive index decision primarily saves candidate memory; Sear v9→v10 slightly regressed (2.212→2.243 ms). Individual changes are not ten independent end-to-end FPS gains, and reductions must not be added together.

Rejected experiments remain in the report. Always allocating 64 temporal buckets did not reliably help these high-coverage scenes. GPU opacity/scale preactivation and a four-vertex triangle strip produced approximately 0.65 ms render-pass medians without a stable improvement; neither was enabled in production. GPU measurements use 1280×960 render-pass timestamps, with readback outside the query. They exclude CPU work and presentation.

## Correctness and limitations

- Baseline and optimized visible-ID order match at 48 evaluated times for all CPU variants. Stable radix preserves full f32 ordering and original-ID depth ties.
- Temporal coverage checks include **all source rows, including discarded records**, at 201 times. A conservative floating-point margin prevents near-threshold drops.
- Full-source baseline versus streamed production rendering has **maximum pixel difference 0** at normalized times 0.1, 0.5 and 0.9, on both fixtures and the calibrated first camera. This is a finite regression sample, not proof for every scene/view/time.
- Unchanged native preparation uploads zero order-index bytes. Browser invalidation includes time, view, projection, viewport, canvas size, and source replacement. Paused inspection must retain the last presented frame.
- The original center-based frustum margin is retained. GPU culling/sorting and portable prefix scans are implemented above; exact ellipse-extent culling and spatial/temporal LOD remain future work.
- `GaussianRenderer.render` retains its legacy 10-second normalized-time API. Hosts explicitly map real checkpoint seconds to that API; an exact slider endpoint is clamped just below normalized 1 to avoid wrapping to the beginning.

## Server contract

```text
GET /api/gaussians/flames-v1/manifest
GET /api/gaussians/flames-v1/range?start=0.4&end=0.6
GET /api/gaussians/flames-v1/<sha256>.stg.gz
Range: bytes=0-31
```

Times must satisfy `0 <= start <= end <= durationSeconds`; closed intersection includes both sides at an exact boundary. The range response contains URLs, compressed/decoded sizes, count, SHA-256, and interval for each selected object. Chunk requests support GET/HEAD, single HTTP byte ranges (206), ETag/If-None-Match (304), If-Range, and unsatisfiable ranges (416). Arbitrary buckets, keys and proxy URLs are not accepted.

Each decoded record is `u32 original_id` followed by the exact **32 little-endian STG-Lite float fields** (132 bytes). Each primitive is stored once in its smallest enclosing dyadic temporal interval among 32 bins, split into objects of at most 8,192 records. The manifest includes the original PLY header template, count, source hash, calibrated cameras and duration. This is our format, not Spark RAD or PlayCanvas SOG. It does not yet describe multiple checkpoints with independent local clocks.

`wrangler.jsonc` binds `GAUSSIAN_STREAMS` to `pajama-gaussian-streams`. Upload all chunks before publishing the manifest. Keep scene IDs versioned when the model, time mapping or camera contract changes.

## Reproduce

Acquire the official model archives from <https://huggingface.co/stack93/spacetimegaussians>. Sear's compressed PLY and cameras are already in `public/data/`. Extract the Flames Lite PLY and cameras to `artifacts/streaming/flames.ply` and `artifacts/streaming/flames-cameras.json`; confirm the uncompressed source SHA against the published report. Do not substitute the full feature/MLP model for Lite.

```sh
node scripts/acquire-long-data.mjs --download
node scripts/probe-long-sequence.mjs
node scripts/inspect-long-data.mjs

node scripts/pack-stg-stream.mjs public/data/n3d-sear-steak-stg-lite.ply.gz public/data/n3d-sear-steak-reference-cameras.json artifacts/streaming/sear-steak-v1b sear-steak-v1 1.6666666666666667 https://huggingface.co/stack93/spacetimegaussians
node scripts/pack-stg-stream.mjs artifacts/streaming/flames.ply artifacts/streaming/flames-cameras.json artifacts/streaming/flames-v1b flames-v1 1.6683333333333334 https://huggingface.co/stack93/spacetimegaussians
node scripts/check-stream.mjs artifacts/streaming/sear-steak-v1b
node scripts/check-stream.mjs artifacts/streaming/flames-v1b

cargo run --release --locked --example prepare_bench -- public/data/n3d-sear-steak-stg-lite.ply.gz public/data/n3d-sear-steak-reference-cameras.json artifacts/streaming/cpu-sear-final.json
cargo run --release --locked --example prepare_bench -- artifacts/streaming/flames.ply artifacts/streaming/flames-cameras.json artifacts/streaming/cpu-flames-final.json
cargo run --release --locked --example gpu_bench -- artifacts/streaming/flames.ply artifacts/streaming/flames-cameras.json artifacts/streaming/gpu-flames
cargo run --release --locked --example stream_pixels -- public/data/n3d-sear-steak-stg-lite.ply.gz public/data/n3d-sear-steak-reference-cameras.json artifacts/streaming/pixels-sear sear-steak-v1
cargo run --release --locked --example stream_pixels -- artifacts/streaming/flames.ply artifacts/streaming/flames-cameras.json artifacts/streaming/pixels-flames flames-v1
```

For idle evidence, load Flames in the browser lab and click **Measure idle rendering**; save the displayed JSON to `artifacts/streaming/idle-browser.json`. Keep the measured tab active and avoid resizing/changing cameras during the two windows. Then:

```sh
node scripts/build-stream-report.mjs
node scripts/upload-stg-stream.mjs artifacts/streaming/sear-steak-v1b
node scripts/upload-stg-stream.mjs artifacts/streaming/flames-v1b
npm run check
npx wrangler deploy
```

Source models are research/non-commercial fixtures. See [asset notices](public/data/THIRD_PARTY_NOTICES.md). The acquired 4 GB of training videos and binary calibration remain local under ignored `artifacts/`; only metadata and checksums are published.
