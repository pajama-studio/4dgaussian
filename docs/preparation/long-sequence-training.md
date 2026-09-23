# 从公开长视频到可流式播放的 4D Gaussian

## 已经拿到什么

作者发布的 [4DGV DeskGames](https://huggingface.co/datasets/turandai/4DGV_DeskGames) 中，Cube 有 21 个同步机位。已逐一读取 21 路 MP4 元数据：**6,000 帧、30 FPS、200 秒**。21 个视频和 3 个 COLMAP 标定文件共约 **4.063 GB**，全部已下载并完成大小及 SHA-256 校验。

- 本地：`artifacts/datasets/4dgv-cube/cube/`
- 下载脚本：`node scripts/acquire-long-data.mjs --download`，支持断点续传与校验。
- 清单：`artifacts/datasets/4dgv-cube/verified.json`
- 固定数据版本：`17d0f77ec65516102806d038d83bcc0583ea0aab`
- 实际标定：一个共享 PINHOLE 内参，2521×1418；fx=1840.136569、fy=1841.862131、cx=1260.5、cy=709。21 个图像外参引用 camera_id=1，名称形如 `20.png`、`19.png`；**文件顺序不是 cam00→cam20 的顺序**。

**已经检测到尺寸不匹配：全部视频为 2560×1440，但 COLMAP 内参为 2521×1418。** 可能涉及去畸变后的裁剪，当前没有证据证明只缩放内参即可。训练前必须找到原始标定/去畸变映射，或从原始视频重新标定、去畸变并验证重投影。可运行 `node scripts/inspect-long-data.mjs` 复核全部机位元数据与标定。

它是桌面场景，满足长时序，不是大城市；视频和静态初始化也不是训练好的动态 checkpoint。当前公开流式演示用的是另两份 50 帧 STG-Lite 模型。没有用循环短片或重复点云充当长、大数据。

## 先做 50 帧试验，而不是直接跑 200 秒

本机有 RTX 4090 / 24 GB、128 GiB RAM。官方 STG 训练路线需要 PyTorch、CUDA 扩展和训练环境，当前网站 Rust/WASM 环境本身不是训练器。先按 [官方 STG 安装与训练文档](https://github.com/oppo-us-research/SpacetimeGaussians#training) 单独建立 Linux/WSL2 环境，并固定仓库提交、CUDA、PyTorch 和扩展版本。具体训练是否装得下、每步耗时多少必须实测；尚未启动训练，不能给出虚构的预计完成时间。

1. **检查输入与相机。** 检查视频尺寸、帧率、帧数、时间戳是否同步。将 COLMAP 图像名 `N.png` 显式映射到 `camNN.mp4`；用首帧重投影验证映射，不能只因名字相似就认定正确。COLMAP 给 world-to-camera 的 quaternion/translation；相机中心为 `C = -Rᵀt`，renderer 使用的 camera-to-world 为逆变换。不要把两者直接互换。
2. **只解码第一批 50 帧。** FFmpeg 安装后，可对单机位运行 `ffmpeg -i cam00.mp4 -frames:v 50 -start_number 0 frames/cam00/%06d.png`；目录先创建，所有机位采用相同零起点和无插帧策略。若降分辨率，fx、fy、cx、cy 一起缩放。原视频与 COLMAP 内参尺寸不一致时先排查去畸变/裁剪，不能直接塞进训练器。全量解码会产生 126,000 张图，不要在试验前消耗大量空间。
3. **适配训练数据目录。** STG 原始 N3D/Immersive loader 有自己的路径、时间和相机约定；DeskGames 不能只改配置文件名就保证兼容。为每条样本保存 `camera_id、frame_id、timestamp、K、R、t、image_path`，把帧 0…49 映射到该训练器约定的归一化时间。保留 points3D 静态初始化；作者的 `init_quant` 不能当作已训练的运动/透明度参数。
4. **保留测试机位。** 训练使用 cam01…cam20，cam00 用于未参与训练的图像评估。检查初始化点云的来源；若官方 COLMAP 点包含测试相机信息，应披露这一点，严格 benchmark 则仅用训练相机重建初始化。
5. **训练 Lite 表示。** 选择 STG-Lite 的训练/导出路径。目标导出必须是 `x,y,z,trbf_center,trbf_scale,...motion_0…8,f_dc_0…2,opacity,scale_0…2,rot_0…3,omega_0…3` 共 32 float 字段。普通 3DGS PLY、4D rotor、TGH、包含九维特征与 MLP 的完整 STG 都不能直接冒充这一格式。
6. **记录一个可复现试验。** 保存训练配置/seed/提交、训练墙钟时间、迭代数、峰值显存、最终点数、checkpoint 大小。用相同分辨率、时间与色彩约定，对 cam00 全部 50 帧测 PSNR/SSIM；单列运动边缘、遮挡和火焰等区域。LPIPS 如采用须记录网络及版本。再比较官方 CUDA 渲染与 Rust/wgpu 输出，区分模型本身误差与我们渲染器误差。

每阶段都应有可检查的产物：`calibration-check.json`、图像/标定叠加图、训练配置、训练日志、checkpoint、held-out 报告、跨渲染器误差图。未通过前一个阶段，不把后面阶段写成“完成”。

## 扩展到 200 秒

先训练相邻的两个片段并查看接缝：模型时间归一化是否一致、静态背景是否闪烁、运动轨迹是否跳跃、颜色/曝光是否漂移。非重叠 50 帧分段共需要 120 段；如每段仍为 50 帧、步长 40 帧、重叠 10 帧，则需要约 150 段。全量耗时由**已测单段耗时 × 段数**估算，并加入解码、训练失败重试和评估成本。

两个独立模型一般没有相同的 Gaussian ID。不能直接把第 k 个点在相邻模型间做线性插值。接缝需要通过重叠区间训练约束、统一背景、颜色校准，或明确的图像/表示过渡策略处理，并测过渡区画质。无接缝验证不能称为一个连续训练的长模型。

长期 manifest 应增加：

```json
{
  "durationSeconds": 200,
  "segments": [{
    "startSeconds": 0,
    "endSeconds": 1.666666667,
    "localTime": "(seconds - startSeconds) / (endSeconds - startSeconds)",
    "manifestUrl": "versioned-segment-manifest.json",
    "cameraCalibrationId": "cube-calibration-v1"
  }]
}
```

上面是**下一版本的设计示意**，当前 API 不接受这个 schema。当前 v1 已实现单 checkpoint 内的时间分块。长版本还需要段级查找、跨段预取、取消过期请求、加载期间保留旧画面、缓存预算、原子 GPU 切换以及接缝处理。

最终用固定真实镜头轨迹验证：冷启动、随机 seek p50/p95、持续播放掉帧/缓冲次数、下载字节、峰值 CPU/GPU 内存、CPU 准备、GPU pass，以及逐帧画质。场景规模另记真实点数与空间范围，不能把“200 秒”写成“百万点大场景”。

## 为什么现在选择这条路线

[SelfCap / LongVolcap](https://zju3dv.github.io/longvolcap/) 更符合分钟级动态重建研究，但当前未取得其可用下载权限或匹配本渲染器的 checkpoint。DeskGames 的公开输入可以立刻下载和验证；其作者方法与 STG-Lite 不同，因此采用 STG-Lite 是为接入本项目而制定的训练方案，不是声称复现了 4DGV 作者的完整系统。

网站提供[中英文研究说明](https://4dgaussian.pajama.studio/streaming/research.html)、[实际 streaming 实验](https://4dgaussian.pajama.studio/streaming/)和[优化实测报告](https://4dgaussian.pajama.studio/streaming/report.json)。原始视频没有上传到公开网站；公开可下载不等于允许任意再分发或商用。
