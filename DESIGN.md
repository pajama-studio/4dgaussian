# Technical design

## Goal

Test a browser viewer against published dynamic-scene data rather than a procedural proxy. The current fixture is the official STG-Lite `n3d_sear_steak_lite_allcam` pretrained model: 108,317 learned Spacetime Gaussians reconstructed from the Neural 3D Video multi-camera capture.

This is a viewer and profiling experiment. It does not train or reconstruct the model, claim compatibility with Peripheral's proprietary data, or imply prior production 4DGS experience.

## Runtime and data contract

The page streams a 10.3 MiB gzip asset, decompresses it to a 13.2 MiB binary little-endian PLY, and passes the bytes to Rust/WASM. The parser rejects files that do not match the 32-float STG-Lite schema. Each 128-byte record contains:

- mean position;
- temporal center and log scale;
- three cubic-translation coefficient vectors;
- RGB feature and opacity logit;
- anisotropic log scale;
- quaternion rotation and quaternion velocity.

Rust creates the wgpu WebGPU surface, validates and uploads the original PLY payload once as a GPU storage buffer, allocates a dynamic depth-order index buffer, and exposes `render(t, camera, size)` to the browser.

A second, versioned fixture contains five unique entries from the official `cameras.json`. Each retains camera-to-world rotation/position, source resolution, and focal lengths. The browser can switch between those calibrated 4:3 views and a deliberately uncalibrated novel-view orbit.

A 960 × 720 browser derivative of the official ten-second `cam00.mp4` supplies an RGB reference. Comparison mode uses the media element as the playback clock, selects the matching calibrated camera, and clips the reference to the left half of the viewer. Moving to another camera or novel orbit disables comparison.

Playback speed is shared by the renderer timeline and the media clock. In comparison mode the native video `currentTime` remains authoritative; outside comparison the animation delta is multiplied by the same selected rate.

The page also contains an isolated `02_Flames` source preview. It uses Media Source Extensions with one initialization segment and nine two-second fMP4 fragments. Loading requires an explicit user action, three fragments are prefetched around the playhead, and subsequent fragments are requested on demand. This tests delivery behavior without implying that the active renderer contains the corresponding scene. The official Flames PLY reports 332,865 splats, above the current 160,000-splat safety limit.

The v0.7 workbench treats the STG render and Flames source as mutually exclusive player panes. A scene controller updates selection state, title, evidence summary and asset status. While the Flames pane is selected, the requestAnimationFrame loop stays alive but skips resize, temporal preparation, sorting and rendering; source RGB for the comparison is paused. Switching back resumes the existing GPU-resident scene without rebuilding it. This prevents a hidden renderer from contaminating video delivery or power measurements.

## Frame pipeline

1. Map the ten-second UI loop to the model's normalized time domain and choose either an official calibrated camera or the novel-view orbit.
2. On CPU, evaluate cubic position and temporal RBF opacity for visibility and depth ordering.
3. Reject temporally inactive or conservatively off-frustum splats.
4. Sort visible source indices back-to-front using camera-space depth.
5. Upload only the ordered `u32` source indices; learned attributes remain GPU-resident.
6. In WGSL, independently evaluate cubic motion, quaternion evolution, log scale, sigmoid opacity, and temporal opacity.
7. Build three scaled, rotated covariance axes. Use the exact first-order derivative of homogeneous perspective division to project each axis into screen space; sum their outer products to obtain the 2D covariance.
8. Eigendecompose the 2D covariance, expand a three-sigma quad, evaluate the Gaussian kernel, and composite with premultiplied back-to-front alpha.
9. When the adapter exposes `timestamp-query`, write timestamps at render-pass boundaries, resolve them, and asynchronously read one of three staging buffers. A device without the feature follows the same render path without GPU timing.

The CPU/GPU temporal evaluation is intentionally duplicated. The CPU copy supplies ordering and culling; the GPU reads the canonical source records and supplies raster attributes. A production compute path would remove this duplication.

## Correctness boundaries

- Implemented: the public STG-Lite temporal parameterization, anisotropic covariance projection, Gaussian alpha, and global depth ordering.
- Implemented: the Lite model's `f_dc` channels are direct, view-independent RGB, matching the official `get_features` path. The full STG model's learned appearance decoder is a different format and is not claimed here.
- Baseline: CPU visibility and global unstable sort are easy to inspect but will not scale to millions of splats.
- Implemented: optional pass-level GPU timestamp queries. Readback is ring-buffered and asynchronous; reported GPU time excludes CPU preparation, command submission, presentation, and video compositing.
- Implemented: a synchronized `cam00` RGB wipe for visual alignment/debugging. Because the selected checkpoint is named `allcam`, this is not represented as a held-out evaluation.
- Not implemented: model training, reconstruction, benchmark-grade numerical fidelity, the full model's feature decoder, GPU radix sort, spatial/temporal **model** chunks, native mobile, CUDA, or Metal backends. The separate source-video preview does not change this model-delivery boundary.

## Profiling contract

The live page reports source/visible counts, total CPU preparation, sort-only CPU time, timestamp-query render-pass time when available, per-frame order-buffer bytes, and presentation-rate FPS. The checked-in performance ledger records environment, method, sample count, and percentile data. GPU time is deliberately labelled as render-pass time rather than end-to-end frame time.

## Provenance

The fixture and source capture are third-party non-commercial research assets. Attribution, checksums, and license copies live in `public/data`. The Rust/wgpu renderer is independent and does not embed the authors' CUDA or SIBR viewer code.
