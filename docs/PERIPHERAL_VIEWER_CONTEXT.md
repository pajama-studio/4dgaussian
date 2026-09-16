# Peripheral Viewer — technology research and evidence boundary

Updated: 2026-09-15

## Executive conclusion

Peripheral is not accurately described as a point-cloud company. Its public language is **spatial intelligence, neural rendering, volumetric video, and photorealistic 3D/4D reconstruction from multi-camera video**. Point clouds and meshes appear in the Viewer job as examples of spatial data the product may need to handle; they do not establish the core production representation.

Peripheral's own hiring material makes Gaussian Splatting highly relevant: a Reconstruction opening asks for expertise in multi-view geometry, structure from motion, NeRFs, 3D/4D Gaussian Splatting, and modern feed-forward reconstruction. It does **not** say which representation, temporal model, renderer, or compression format is currently deployed. The honest position is therefore:

> Peripheral publicly works in the problem space where 3D/4D Gaussians are a candidate technology. Its production representation and renderer are proprietary/unknown.

## Evidence matrix

| Confidence | Claim | Public evidence | What it does not prove |
| --- | --- | --- | --- |
| Known | Peripheral transforms multi-camera sports video into navigable photorealistic reconstructions and spatial data. | Company description and public company updates. | Exact camera topology, calibration method, representation, latency, or quality. |
| Known | The Viewer must run across web, mobile, and native and handle spatial/video delivery. | Current Software Engineer — Viewer posting. | That one source language, shader set, or GPU API is shared everywhere. |
| Known | Their reconstruction research values multi-view geometry, temporal/feed-forward methods, NeRFs, and 3D/4D Gaussian Splatting. | Peripheral Reconstruction hiring material. | That a particular Gaussian method is in production. Hiring requirements describe a search space and desired expertise. |
| Known | Viewer and Reconstruction are separate collaborating concerns. | The Viewer posting explicitly says the role collaborates with Reconstruction to understand data formats and outputs. | The organization or API boundary between those teams. |
| Inference | A renderer-facing intermediate representation likely insulates the Viewer from changing research outputs. | The reconstruction search space is broad while the Viewer must support several platforms. | The actual internal schema or ownership. This is a design hypothesis to ask about. |
| Unknown | Current neural representation, temporal encoding, splat sorter, codec, chunking strategy, quality metrics, and backend ownership. | No public product-facing source names them. | Any claim that the live product is specifically 3DGS, 4DGS, STG, NeRF, a mesh pipeline, or a hybrid. |

## Likely end-to-end system — explicitly an inference

This is a useful interview model, not a description of Peripheral's internal architecture.

1. **Capture** — synchronized multi-camera RGB/video plus capture metadata.
2. **Calibration and priors** — intrinsics/extrinsics, time alignment, keypoint matching, depth/surface estimates, segmentation, and possibly pose priors.
3. **Reconstruction** — a learned feed-forward and/or optimized multi-view temporal model produces photorealistic scene content and spatial/pose outputs.
4. **Packaging** — convert research output into a versioned viewer-facing representation; segment it by time and possibly space/LOD; attach camera and pose metadata.
5. **Delivery** — stream spatial and conventional video data with cancellation, cache policy, progressive quality, and bounded memory.
6. **Viewer** — evaluate the scene at time `t`, select visible content, decode/upload it, rasterize for the platform, and expose replay/camera/analysis UX.
7. **Observability** — measure time-to-first-frame, seek latency, network bytes, decode and upload time, GPU residency, CPU/GPU frame time, dropped frames, and visual-quality regressions.

The Viewer role is mainly stages 4–7, with enough understanding of stages 1–3 to define good data contracts and report reconstruction outputs that are hard to visualize.

## What “4D Gaussian” can mean

The term is not a single file format or renderer.

| Family | Temporal model | Viewer consequence | Main trade-off |
| --- | --- | --- | --- |
| Per-frame 3DGS sequence | Independent Gaussian set per frame | Load/swap/interpolate frames; simple mental model | High storage and weak temporal consistency; should be called a sequence, not a holistic 4D representation |
| Canonical Gaussians + deformation field | A canonical 3D set deformed at timestamp `t` | Evaluate a learned field, then project/sort/splat | Compact continuity, but adds model execution and variant-specific runtime requirements |
| Spacetime Gaussians | Per-Gaussian temporal opacity and parametric motion/rotation, potentially learned features | Evaluate temporal attributes in preprocess, then use the common splat pipeline | Viewer-friendly explicit motion, but representation and decoder still need standardization |
| Other neural/geometry hybrid | NeRF, mesh, feature planes, tracked geometry, or combinations | Renderer-facing abstraction matters more than the research label | Different quality, latency, editability, and platform constraints |

The CVPR 2024 **4D Gaussian Splatting** paper uses canonical 3D Gaussians, decomposed 4D neural voxels, and a lightweight MLP to predict deformation at a timestamp. The CVPR 2024 **Spacetime Gaussian Feature Splatting** paper instead gives Gaussians temporal opacity and parametric motion/rotation plus learned features. These are different runtime contracts.

## Prototype decision

The deployed study at `https://gaussian.pajama.studio` now renders the official CVPR 2024 STG-Lite `n3d_sear_steak_lite_allcam` pretrained model. It contains 108,317 learned Spacetime Gaussians reconstructed by the paper authors from the 21-camera Neural 3D Video capture. The model and source data are used only as attributed, non-commercial research/evaluation fixtures.

Implemented independently in Rust/wgpu/WGSL:

- strict parsing of the public 32-float STG-Lite PLY schema;
- one-time GPU residency for the original 13.2 MiB source records;
- cubic motion, temporal RBF opacity, quaternion evolution, and log-scale evaluation;
- projection of the learned anisotropic covariance through the homogeneous perspective Jacobian;
- five official camera-to-world poses and focal lengths, with calibrated 4:3 viewport fitting;
- a synchronized 50/50 wipe against the official ten-second `cam00.mp4` RGB source;
- fixed-frame diagnostic comparisons at 1, 5, and 9 seconds (30.96–31.64 dB PSNR; 0.9396–0.9413 SSIM), explicitly not presented as held-out benchmark results;
- conservative temporal/frustum rejection and CPU global back-to-front ordering;
- an index-only per-frame upload of about 0.36 MiB in the measured view;
- Gaussian footprint evaluation and premultiplied alpha compositing;
- capability-gated GPU render-pass timestamps with a three-slot asynchronous readback ring;
- play/pause, scrubbing, novel-view orbit/zoom, and live measurements.

Not implemented, and therefore not claimed:

- reconstruction or training from video;
- compatibility with Peripheral data or knowledge of its production representation;
- the full STG model's feature decoder (the selected Lite format supplies direct view-independent RGB);
- numerical PSNR/SSIM validation (the selected checkpoint is named `allcam`, so its `cam00` comparison is not claimed as held out);
- GPU preprocessing/radix sort;
- production chunking, compression, LOD, native mobile, CUDA, or Metal backends.

This is stronger evidence than the original procedural baseline because it exercises learned geometry, temporal support, anisotropy, real reconstruction artifacts, and a six-figure splat count. It remains a viewer experiment, not a reconstruction project or prior production credential.

## Optimization plan and acceptance gates

1. **Measured CPU baseline.** Keep CPU cull/sort and index upload while they fit the representative budget. The calibrated-camera 300-frame local run measured 5.6 ms p50 preparation and 1.6 ms p50 sort at roughly 86k–90k visible splats.
2. **Fidelity validation.** The official `cam00` RGB video now shares a clock and calibrated view with the renderer, providing a direct visual alignment check. Before reporting PSNR/SSIM, reproduce the reference rasterizer more closely and select a checkpoint/evaluation split that supports the claim; this `allcam` checkpoint is not a held-out result.
3. **GPU timing.** Implemented: optional pass timestamps resolve asynchronously. The local 180-frame profile measured 2.946 ms p50 and 3.043 ms p95 for the splat render pass, while CPU preparation measured 5.5/5.8 ms.
4. **GPU preprocess and radix sort.** Move temporal evaluation, culling, key generation, compaction, and sorting to compute only when fixed-view traces beat the baseline without changing order-sensitive output. The timing split shows why this must be evaluated as a complete preprocess path rather than a sort-only rewrite.
5. **Chunking and compression.** Measure startup latency, bytes, decode time, visual error, and GPU memory together. Smaller files are not automatically faster or visually acceptable.
6. **Cross-platform validation.** Run identical fixtures on browser WebGPU and native Metal/Vulkan/D3D through wgpu. Track correctness separately from throughput.
7. **Comparative baseline.** Compare against a research web renderer such as WebSplatter rather than treating one implementation as the state of the art.

## High-value interview questions

1. What representation reaches the Viewer today, and how stable is that contract as Reconstruction changes?
2. Does “shared rendering engine” mean shared Rust/C++ core, shared scene semantics and shader generation, or only equivalent product behavior?
3. Are CUDA and Metal rasterization backends for the same representation, preprocessing paths, or separate products?
4. What dominates current user-visible latency: reconstruction, packaging, network, decode, GPU upload, sort/rasterization, or conventional video synchronization?
5. Which users set the first quality bar: reconstruction researchers, broadcast operators, analysts, or browser consumers?
6. What test scenes and metrics decide whether a new representation or compression method is actually better?

## Sources

- Peripheral Software Engineer — Viewer: https://jobs.khoslaventures.com/companies/peripheral-labs/jobs/92242383-software-engineer-viewer
- Peripheral Machine Learning Engineer — Reconstruction: https://jobs.khoslaventures.com/companies/peripheral-labs/jobs/66659242-machine-learning-engineer-reconstruction
- Peripheral company page and current public product statements: https://www.linkedin.com/company/peripheral-inc
- 4D Gaussian Splatting for Real-Time Dynamic Scene Rendering, CVPR 2024: https://openaccess.thecvf.com/content/CVPR2024/html/Wu_4D_Gaussian_Splatting_for_Real-Time_Dynamic_Scene_Rendering_CVPR_2024_paper.html
- Spacetime Gaussian Feature Splatting for Real-Time Dynamic View Synthesis, CVPR 2024: https://openaccess.thecvf.com/content/CVPR2024/html/Li_Spacetime_Gaussian_Feature_Splatting_for_Real-Time_Dynamic_View_Synthesis_CVPR_2024_paper.html
- Official SpacetimeGaussians implementation and pretrained models: https://github.com/oppo-us-research/SpacetimeGaussians
- Neural 3D Video dataset and capture metadata: https://github.com/facebookresearch/Neural_3D_Video
- WebSplatter research browser renderer and benchmark: https://websplatter.github.io/
- wgpu documentation: https://wgpu.rs/doc/wgpu/
- Rust/wgpu 3DGS implementation used as a comparison, not copied into this prototype: https://github.com/LioQing/wgpu-3dgs-viewer
- Rust/wgpu STG-Lite implementation used as a comparison, not copied into this prototype: https://github.com/abist-co-ltd/wgpu-gs-viewer
