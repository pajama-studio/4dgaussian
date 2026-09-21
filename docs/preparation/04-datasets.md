# 数据与预训练模型选型

核对日期 2026-09-16。这里区分**训练数据**（图像/视频/标定）、**训练代码**和**预训练模型**；“公开研究资源”不等于一套通用开源 4D 文件，也不等于可商用。

| 优先级 | 资源与一手入口 | 最适合的练习 | 与当前 STG-Lite 的关系 / 限制 |
| --- | --- | --- | --- |
| 1 | [STG 作者模型库](https://huggingface.co/stack93/spacetimegaussians/tree/main) | 先把真实 learned model 的 rendering 跑通 | `n3d_sear_steak_lite_allcam.zip` 约 16.1 MB；本仓库已含其 108,317 点 PLY 派生 gzip |
| 1 | [Neural 3D Video / DyNeRF](https://github.com/facebookresearch/Neural_3D_Video)；[release](https://github.com/facebookresearch/Neural_3D_Video/releases/tag/v1.0) | 多视图动态重建、相机与 held-out 检查 | 视频+poses；STG 官方支持。资料为 CC BY-NC 4.0；默认 cam00 测试，allcam 模型不满足此划分 |
| 2 | [Dynamic 3D Gaussians](https://github.com/JonathonLuiten/Dynamic3DGaussians)；[项目页](https://dynamic3dgaussians.github.io/) | 人体/物体运动、持续 tracking、轨迹可视化 | 官方提供 data/output 下载链接；时间序列与文件布局不同，需要新 importer。代码与数据条款分别核查 |
| 2 | [Google Immersive / DeepView Video](https://github.com/augmentedperception/deepview_video_dataset) | 大运动、火焰、鱼眼、多机位与较大资产 | 每场景含多机位视频和标定；需要鱼眼处理。官方 `Flames` Lite 模型约 46.6 MB archive、332,865 点，超过当前 160k 上限 |
| 3 | [D-NeRF 官方项目](https://github.com/albertpumarola/D-NeRF)；[HUST 4DGS 数据说明](https://github.com/hustvl/4DGaussians#data-preparation) | 合成数据上的 deformation 学习、控制变量 | 适合先理解时间模型；不是 STG-Lite 格式，合成场景表现不能代替真实多相机/体育场景验证 |
| 3 | [HyperNeRF 官方数据](https://github.com/google/hypernerf#datasets) | 非刚性、拓扑变化与更困难的单机位动态理解 | 标定/时间复杂度更高；不建议作为 12 天准备的第一条训练链路 |

**推荐顺序：** 已有 `sear_steak` 渲染 → 自有合成训练练习 → N3DV 一个短区间真实训练 → 需要人体运动时选择 Dynamic 3D Gaussians → 最后才扩展 Flames 与其他 deformation 格式。

## 已经下载/已有的数据

- `public/data/n3d-sear-steak-stg-lite.ply.gz`：10,764,919 bytes；解压后 source payload 为 13,864,576 bytes；128 bytes/点。
- `public/data/n3d-sear-steak-reference-cameras.json`：五个 camera-to-world 标定机位。
- `public/data/n3d-sear-steak-cam00-reference-960x720.mp4`：浏览器转码参考视频，不能替代原始训练图。
- `artifacts/research/n3d_sear_steak_lite_allcam.zip`：本次取得的官方完整模型包；包含 PLY、`cameras.json`、`cfg_args` 和初始化点云，没有执行其中任何模型代码。
- `artifacts/toy-training/model.ply`：本次实际优化得到的 5 splat 教学模型；无真实采集人物素材。

本次没有下载完整的多 GB 视频数据，也没有在本地训练真实 N3DV 模型。当前仓库的第三方说明位于 [THIRD_PARTY_NOTICES](../../public/data/THIRD_PARTY_NOTICES.md)。官方 STG 的顶层 MIT 与其 Gaussian Splatting 子目录的研究用途许可应分开理解，不能仅看到根目录 LICENSE 就认定全部模型、数据和依赖可商用。

## 一个数据集是否值得投入

先看五件事：是否有可获取的原始数据与相机；时间同步/帧映射是否明确；是否有官方训练/推理与 checkpoint；格式是否与你的 runtime 匹配；代码、权重、原始图像是否各有可满足的许可。随后只下载一个场景做 smoke，不先收集几十个模型。

针对体育场景还应测试高速动作、细结构、运动模糊、遮挡和多人交叉；厨房场景跑通不足以证明这些问题已解决。没有体育数据时可以用公开的人体运动数据测试部分问题，但应明确覆盖范围。
