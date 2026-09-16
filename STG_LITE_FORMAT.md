# STG-Lite data and rendering contract

This note records the exact public contract implemented by the browser viewer. It was checked against the official `scene/ourslite.py`, `renderer/__init__.py`, and `submodules/forward_lite/cuda_rasterizer/forward.cu` files in the SpacetimeGaussians repository on 2026-09-15.

## Binary PLY record

The selected model is binary little-endian. Every vertex is exactly 32 contiguous `float32` values (128 bytes), in this order:

| Offset | PLY fields | Stored value | Runtime meaning |
| --- | --- | --- | --- |
| 0–2 | `x y z` | base mean | `μ(t)` begins at this position |
| 3 | `trbf_center` | normalized center time | `dt = t - center` |
| 4 | `trbf_scale` | log temporal scale | `σt = exp(trbf_scale)` |
| 5–7 | `nx ny nz` | zero/unused normal fields | retained for PLY compatibility |
| 8–10 | `motion_0..2` | linear xyz | `motion_linear × dt` |
| 11–13 | `motion_3..5` | quadratic xyz | `motion_quadratic × dt²` |
| 14–16 | `motion_6..8` | cubic xyz | `motion_cubic × dt³` |
| 17–19 | `f_dc_0..2` | precomputed view-independent RGB | used directly by the Lite renderer |
| 20 | `opacity` | opacity logit | `sigmoid(opacity)` |
| 21–23 | `scale_0..2` | anisotropic log scale | `exp(scale)` |
| 24–27 | `rot_0..3` | quaternion `w x y z` | base covariance orientation |
| 28–31 | `omega_0..3` | quaternion-rate coefficients | `normalize(rot + dt × omega)` |

The Rust parser validates the field names and order, not just the record byte count. This prevents another 32-float PLY from being silently interpreted as STG-Lite.

## Temporal evaluation

For normalized timestamp `t`:

```text
dt = t - trbf_center
mean(t) = mean₀ + motion₁·dt + motion₂·dt² + motion₃·dt³
temporal_weight(t) = exp(-(dt / exp(trbf_scale))²)
alpha_base(t) = sigmoid(opacity) · temporal_weight(t)
rotation(t) = normalize(rotation₀ + dt·omega)
scale = exp(log_scale)
```

The source `cam00.mp4` contains 300 frames at 30 FPS (ten seconds). The UI maps that video clock to the model's normalized timestamp as `t = seconds / 10`.

## Covariance and rasterization

The reference rasterizer constructs `M = S·R` and `Σ = MᵀM`. The browser forms the same covariance from the three scaled rows of the quaternion rotation matrix. The homogeneous perspective derivative projects those axes into pixels; their outer products sum to the 2D covariance. A 0.3 diagonal low-pass term matches the reference footprint floor.

The browser eigendecomposes the 2D covariance to create a three-sigma quad. The fragment shader evaluates the Gaussian exponent, applies the same `alpha < 1/255` rejection and `alpha ≤ 0.99` cap, and uses premultiplied back-to-front composition. The reference CUDA implementation sorts tile-local splat lists; this viewer currently uses one global camera-depth order.

## Camera fixture

The official `cameras.json` contains camera-to-world positions/rotations and pixel focal lengths. The checked-in fixture retains five unique cameras. Its rotation follows OpenCV camera axes: +x right, +y down, +z forward. The browser derives vertical FOV from `2·atan(height/(2·fy))` and fits the original 4:3 calibrated viewport inside the display surface.

These cameras establish pose/projection correctness. The viewer also contains a 960 × 720 delivery transcode of the official `cam00.mp4` and can place it over the calibrated render on the same clock. The source dataset convention holds `cam00` out for testing, but the selected checkpoint is explicitly named `allcam`; the wipe is therefore an alignment/debugging comparison, not a held-out score.

## Deliberate differences

- The source CUDA renderer uses tile binning and tile-local ordering; the browser baseline uses global CPU ordering.
- The Lite model has direct view-independent RGB. The full STG model's learned feature decoder is outside this fixture and is not claimed.
- The browser expands covariance through vertex/fragment rasterization rather than the reference CUDA tile rasterizer.
- No training, reconstruction, numerical PSNR/SSIM evaluation, or proprietary Peripheral representation is included.

## Primary sources

- Official model implementation: https://github.com/oppo-us-research/SpacetimeGaussians/blob/main/thirdparty/gaussian_splatting/scene/ourslite.py
- Official Lite renderer setup: https://github.com/oppo-us-research/SpacetimeGaussians/blob/main/thirdparty/gaussian_splatting/renderer/__init__.py
- Official CUDA preprocessing/covariance/compositing: https://github.com/oppo-us-research/SpacetimeGaussians/blob/main/thirdparty/gaussian_splatting/submodules/forward_lite/cuda_rasterizer/forward.cu
- Paper: https://openaccess.thecvf.com/content/CVPR2024/html/Li_Spacetime_Gaussian_Feature_Splatting_for_Real-Time_Dynamic_View_Synthesis_CVPR_2024_paper.html
