# Third-party research asset notices

## Spacetime Gaussian Feature Splatting model

This directory contains a gzip-compressed copy of the official `n3d_sear_steak_lite_allcam` pretrained STG-Lite point cloud published by the authors of:

> Zhan Li, Zhang Chen, Zhong Li, and Yi Xu. “Spacetime Gaussian Feature Splatting for Real-Time Dynamic View Synthesis.” CVPR 2024.

- Official implementation: https://github.com/oppo-us-research/SpacetimeGaussians
- Official pretrained model: https://huggingface.co/stack93/spacetimegaussians
- Paper: https://openaccess.thecvf.com/content/CVPR2024/html/Li_Spacetime_Gaussian_Feature_Splatting_for_Real-Time_Dynamic_View_Synthesis_CVPR_2024_paper.html

The implementation states that it is subject to the Gaussian-Splatting use limitation: non-commercial research and evaluation only. This demo uses the model only as a clearly attributed research/evaluation fixture. The renderer in this repository is an independent Rust/wgpu implementation and does not include the authors’ CUDA or SIBR viewer code.

Local license copies: [`SPACETIME_GAUSSIANS_LICENSE.md`](SPACETIME_GAUSSIANS_LICENSE.md) and [`GAUSSIAN_SPLATTING_LICENSE.md`](GAUSSIAN_SPLATTING_LICENSE.md).

## Neural 3D Video source dataset

The `sear_steak` capture comes from the Neural 3D Video dataset released with:

> Tianye Li et al. “Neural 3D Video Synthesis from Multi-view Video.” CVPR 2022.

- Dataset repository: https://github.com/facebookresearch/Neural_3D_Video
- Project page: https://neural-3d-video.github.io/
- Dataset license: Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)

The source capture and this derived pretrained representation must not be used for commercial purposes without the appropriate permission.

## Local artifact

- File: `n3d-sear-steak-stg-lite.ply.gz`
- Uncompressed format: binary little-endian PLY, 108,317 vertices, 32 float fields per vertex
- Compressed SHA-256: `d898dbd9e9c397b8495d24df84331c3cb85d2b31ab32d7b621477b0714c51f00`
- Retrieved from the official Hugging Face repository on 2026-09-15

## Reference-camera fixture

- File: `n3d-sear-steak-reference-cameras.json`
- Contents: five unique camera records selected from the official model archive's `cameras.json`; numeric values are unchanged
- Local schema: `pajama.stg.reference-cameras.v1`
- SHA-256: `5a42f161266cdbffd0f75c69ae0936904bcdcb887c42c6fdf09a8c9c7fb3abba`
- Purpose: validate camera-to-world/OpenCV-axis handling and preserve a calibrated 4:3 projection path

## RGB reference fixture

- File: `n3d-sear-steak-cam00-reference-960x720.mp4`
- Source: `sear_steak/cam00.mp4` inside the official Neural 3D Video `sear_steak.zip` v1.0 release
- Official release: https://github.com/facebookresearch/Neural_3D_Video/releases/tag/v1.0
- Original stream: H.264, 2704 × 2028, 30 FPS, 300 frames, 10.0 seconds
- Browser derivative: H.264, 960 × 720, 30 FPS, 300 frames, 10.0 seconds; resolution/bitrate transcode only
- SHA-256: `e8dfe9bae74c40b877de095283b3d820703937d6a16cc0023e696418887afaa7`
- License: the source dataset remains CC BY-NC 4.0

The Neural 3D Video dataset convention designates `cam00` as its test camera. The displayed STG checkpoint is explicitly named `n3d_sear_steak_lite_allcam`, however, so this side-by-side view is an alignment/debugging aid and is **not** reported as a held-out evaluation.

## 02_Flames segmented source preview

- Source scene: `02_Flames` from *Immersive Light Field Video with a Layered Mesh Representation* (Broxton et al., ACM TOG 2020)
- Official dataset repository and calibration documentation: https://github.com/augmentedperception/deepview_video_dataset
- Source member: `02_Flames/camera_0001.mp4`
- Original stream: H.264, 2560 × 1920, 29.97 FPS, 500 frames, 16.683 seconds, 125,313,686 bytes
- Browser derivative: H.264 Main, 960 × 720, 29.97 FPS, split into a Media Source initialization segment and nine approximately two-second fMP4 media fragments
- Purpose: a motion-rich source preview and delivery experiment for a future second STG fixture

The page labels this video as a source-only preview. It is not presented as the output of the active `sear_steak` renderer. The separately downloaded official `immersive_02_Flames_ud_lite_allcam` PLY reports 332,865 vertices; that checkpoint has not been shipped in this version.
