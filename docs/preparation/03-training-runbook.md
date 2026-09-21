# 训练、导出与运行：两条明确分开的路线

## A. 已实测的教学闭环

本机：Windows、RTX 4090 24 GB、PyTorch `2.7.1+cu118`。这条路线使用自己生成的 18 张 64×48 多视图/多时刻图像，优化 5 个 Gaussian 的均值、线性运动、颜色、不透明度；尺度、旋转、时间核与点数固定。它没有 SfM、densification 或真实视频重建，适合在半小时内理解和改代码。

```powershell
python scripts/train_toy_stg.py
python scripts/inspect_stg.py artifacts/toy-training/model.ply
cargo run --example native_smoke -- artifacts/toy-training/model.ply artifacts/toy-training/cameras.json artifacts/toy-training/native
```

本次 400 步训练把 MSE 从约 `1.85e-3` 降到 `1.95e-8`。这是同一数学生成器的小型合成任务；高分不能代表真实场景泛化，也不是 CUDA 与 wgpu 的像素一致性指标。最后一个命令验证导出的参数真的能被 Rust 解析并在 GPU 上产生动态画面。

读代码顺序：`render()` → teacher 图像 → `nn.Parameter` → Adam → loss/backward/step → 写 32 float PLY。手动把运动学习率设为零或去掉 temporal 权重，观察图像误差和动态行为变化，再解释原因。

## B. 官方 STG-Lite 真实场景路线（本次未执行训练）

已审阅的官方源码为 [SpacetimeGaussians commit 427abfc](https://github.com/oppo-us-research/SpacetimeGaussians/tree/427abfc58309a4a5213843dd673fb22c4529306c)。[官方 README](https://github.com/oppo-us-research/SpacetimeGaussians) 提供环境、数据预处理和训练/测试步骤。以下把关键步骤与当前源码对齐；依赖安装和真实训练仍需单独验证。

### 1. 环境先过关

官方历史环境是 Ubuntu 20.04，`script/setup.sh` 包含 Python 3.7、PyTorch 1.12.1、CUDA runtime 11.6，并分开建立训练与 COLMAP 预处理环境。不要把它视为能无改动运行在所有新 GPU/编译器上的保证。

本机 Windows 已有 **nvcc 12.8**，但 PyTorch 编译版本是 **CUDA 11.8**；WSL Ubuntu 中只确认了 Python，没有在 PATH 中找到 conda/nvcc/COLMAP/FFmpeg。`torch.cuda.is_available()` 为真只说明能执行 CUDA 算子，不证明官方 C++/CUDA 扩展能编译。

优先使用隔离的 Linux/WSL 环境或固定镜像；核对 Python、PyTorch、CUDA toolkit、宿主编译器与目标 GPU 架构的组合，先编译并运行 rasterizer 小测试。不要为了复现旧脚本卸载系统显卡驱动。

```bash
git clone --recursive https://github.com/oppo-us-research/SpacetimeGaussians.git
cd SpacetimeGaussians
git checkout 427abfc58309a4a5213843dd673fb22c4529306c
git submodule update --init --recursive
# 按 script/setup.sh 分阶段建立环境，逐个检查扩展，而不是忽略错误继续训练。
python -c 'import torch; print(torch.__version__, torch.version.cuda, torch.cuda.is_available())'
nvcc --version
colmap -h
```

至少验证 Lite 的训练 rasterizer、forward-only Lite rasterizer、simple-knn，以及初始化路径需要的依赖。官方文档对 N3DV 说明了 24 GB 训练显存需求；4090 容量属于这一档，但屏幕占用、分辨率、图像驻留和点数都会影响实际余量。

### 2. 数据与预处理

从 [N3DV 官方 release](https://github.com/facebookresearch/Neural_3D_Video/releases/tag/v1.0) 选 `sear_steak`。先保留原始视频和 `poses_bounds.npy`。视频文件按有效相机顺序对应位姿；不能在某机位缺失时仍按编号硬拼数组。

```bash
# 在官方源码根目录、预处理环境中执行；路径用你的实际数据目录。
python script/pre_n3d.py --videopath /data/Neural3D/sear_steak
```

预期得到 `colmap_0`、`colmap_1` …，其中包含训练 loader 要求的图像与稀疏模型。这个脚本默认预处理 300 帧；训练配置用 50 帧不意味着预处理也只做 50 帧。预处理会写出大量帧与 COLMAP 工作目录，应在数据工作副本中运行。

验收：抽查各机位相同 frame index；检查去畸变后边缘；确认内参跟缩放后的图像匹配；投影稀疏点到图片；核对 `cam00` 的训练/测试划分。不要直到 loss 不收敛才回头看相机。

### 3. 先短训练验证链路

当前真实参数名是 `--configpath`，README 中的 `--config` 依赖 argparse 的前缀缩写；使用完整名字更明确。配置覆盖逻辑会把“等于默认值的 CLI 参数”当成未覆盖，建议把实验参数写进独立 JSON，保存实际解析日志。

在官方源码目录运行下面的 Python，创建低成本诊断配置：

```python
import json
from pathlib import Path
c = json.loads(Path("configs/n3d_lite/sear_steak.json").read_text())
c.update(duration=10, resolution=8, iterations=300, emsstart=10000)
Path("configs/sear_steak_smoke.json").write_text(json.dumps(c, indent=2))
```

```bash
python train.py --eval --configpath configs/sear_steak_smoke.json \
  --model_path log/sear_steak_smoke \
  --source_path /data/Neural3D/sear_steak/colmap_0 \
  --save_iterations 300
```

以上是**待执行的诊断命令**：参数名已经核对源码，不表示本机已跑过。300 iterations 的目标是验证读取、前向、反向、保存，不是训练出可展示质量。

### 4. 基线训练与评估

```bash
python train.py --eval --configpath configs/n3d_lite/sear_steak.json \
  --model_path log/sear_steak_lite_eval \
  --source_path /data/Neural3D/sear_steak/colmap_0

python test.py --eval --skip_train --valloader colmapvalid \
  --configpath configs/n3d_lite/sear_steak.json \
  --model_path log/sear_steak_lite_eval \
  --source_path /data/Neural3D/sear_steak/colmap_0
```

官方 `sear_steak` Lite 配置含 `duration=50`、`resolution=2`、`model=ours_lite`。配置中的 `test_iteration=25000` 是测试 checkpoint 的选择；训练总迭代数要看实际解析出来的 `iterations`，不要把两者混为一谈。

记录：源码/submodule hash、完整参数、seed、相机划分、分辨率、帧区间、GPU、峰值显存、训练耗时、点数、loss、测试图与指标。先渲染训练视角定位模型能否拟合，再评估没有用于训练的机位。与官方 forward renderer 对齐相机、时刻、分辨率和背景，才适合检查自研 renderer 的数值差异。

### 5. 推理导出契约

官方 `point_cloud/iteration_*/point_cloud.ply` 是 Lite 推理的主要输入。先运行本仓库 `inspect_stg.py`；只有格式匹配、字段有限、资产大小在预算内才上传 GPU。当前上限 160,000 splats；超过时应明确拒绝或设计新预算，不能静默截断。

额外保存下面的信息（这是**建议的 manifest**，现有浏览器尚未自动消费它）：

```json
{
  "schema": "pajama.stg.asset.v1",
  "representation": "stg-lite-32f-le",
  "model": "point_cloud.ply",
  "sourceFps": 30,
  "startFrame": 0,
  "frameCount": 50,
  "timeConvention": "normalized=(frame-startFrame)/frameCount",
  "cameraConvention": "OpenCV camera-to-world; column-vector math",
  "colorConvention": "direct learned RGB; training image transfer must be recorded",
  "trainingCameraSplit": "record actual loader output",
  "sourceCommit": "record actual commit",
  "modelSha256": "compute from exported bytes"
}
```

官方 loader 使用 `t=(frame-start)/duration`。如果 50 帧是 30 fps，则 nominal 时段为 `50/30` 秒，最后训练帧位于 `49/50`，不是 `t=1`。如果进行了抽帧或变速，必须保存映射，不能简单套这个换算。

当前 pretrained allcam 包没有时长字段；相机记录提示 50 帧，但不能仅凭重复数宣称已确定时长。新增 native API 直接收 normalized time，避免把演示播放速度误当真实时间。真实训练产物在浏览器中替换使用之前，还需把浏览器硬编码的 10 秒时钟改成明确的资产时间契约。

## 失败排查

| 症状 | 先检查 |
| --- | --- |
| CUDA 扩展编译失败 | PyTorch CUDA 与 nvcc、编译器、子模块、目标架构 |
| OOM | 图像驻留、resolution、duration、batch、densification 点数；先缩短诊断实验 |
| 静态也模糊 | 相机/焦距/畸变/颜色；不要先怪 motion 表达 |
| 动态重影 | 同步、时间 normalization、camera/time 采样、正则与可见性 |
| 导入后全黑 | 相机前向、clip z、opacity activation、quaternion、GPU binding |
| 形状正确但颜色错误 | direct RGB vs SH、sRGB vs linear、预乘 alpha、背景 |
| 官方图正确而自研错误 | 用同一 checkpoint/camera/timestamp 对比，再逐级禁用 cull/cap/排序优化 |
