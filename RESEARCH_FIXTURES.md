# Research data and demo review

Reviewed 2026-09-15. Only author-maintained project pages, papers, code, and model repositories are treated as evidence.

| Candidate | What it tests | Public assets/demo | Decision |
| --- | --- | --- | --- |
| Spacetime Gaussian Feature Splatting (CVPR 2024) + Neural 3D Video | Dynamic novel-view rendering with explicit temporal opacity, cubic motion, quaternion evolution, and learned anisotropic Gaussians | Official code and pretrained STG-Lite models; calibrated 21-camera N3DV captures | **Selected.** The 16.1 MB model archive / 108,317-splat PLY was small enough for a browser fixture while exercising a real learned temporal representation. Non-commercial research/evaluation terms are preserved. |
| Dynamic 3D Gaussians (3DV 2024) | Persistent moving/rotating Gaussians, dense 6-DOF tracking, trajectory visualization, and editing | Official training data, pretrained models, Open3D visualizer, and result videos | Strong second fixture for tracking and trajectory UX. It uses a different time contract and is not interchangeable with STG; defer until a versioned loader exists. |
| WebSplatter (ACM Multimedia 2026) | Cross-device static 3DGS WebGPU rendering, wait-free radix sorting, compressed delivery, and fidelity against native CUDA | Interactive 341,294-splat / 5.05 MiB SPZ demo, code, paper, and an eleven-device benchmark | **Comparison baseline, not copied implementation.** It sets the right standard for the next renderer experiment: multiple architectures, deterministic progress, image metrics, and fixed-scene comparisons. |

## Why STG was chosen first

The interview target concerns time-varying reconstructed scenes and a viewer spanning delivery, rendering, and UX. STG-Lite exposes its temporal parameters directly in a compact PLY, so the browser can evaluate the representation without embedding a neural runtime. That makes the renderer boundary inspectable while avoiding a false claim that this project trained or inferred the scene.

## Sources

- STG paper: https://openaccess.thecvf.com/content/CVPR2024/html/Li_Spacetime_Gaussian_Feature_Splatting_for_Real-Time_Dynamic_View_Synthesis_CVPR_2024_paper.html
- STG official implementation/models: https://github.com/oppo-us-research/SpacetimeGaussians
- Neural 3D Video dataset: https://github.com/facebookresearch/Neural_3D_Video
- Dynamic 3D Gaussians official project: https://dynamic3dgaussians.github.io/
- Dynamic 3D Gaussians code/data: https://github.com/JonathonLuiten/Dynamic3DGaussians
- WebSplatter official project, paper, benchmark and demo: https://websplatter.github.io/
