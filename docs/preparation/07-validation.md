# 本次验证、证据与未完成项

日期：2026-09-16。基于仓库 commit `54dca8c5fe13715e369bb905d8c588d04b9c7273`，本次新增代码/文档尚未提交。只运行本地服务和测试，没有发布线上站点，也没有修改相邻 `engine` 仓库。

## 实际运行结果

| 验证 | 结果 | 复现入口 |
| --- | --- | --- |
| Rust/WASM/static | 4 个 Rust 测试通过；WASM check、release build 和项目静态检查通过 | `npm run check` |
| 真实预训练 STG 原生渲染 | RTX 4090 / D3D12；108,317 splats；t=0.1/0.5/0.9 三帧非空且变化 | `cargo run --example native_smoke` |
| 教学训练→导出 | PyTorch CUDA，18 张合成图像，5 splats，400 步；MSE `1.85246e-3 → 1.95105e-8` | `python scripts/train_toy_stg.py` |
| 教学模型→原生 GPU | 导出的 PLY 被 Rust 解析；三个时间点均可见、画面变化 | 见 [训练手册](03-training-runbook.md) |
| 自定义 compute raster | 正序、反序、离轴/后方点三个案例；所有像素与 CPU 参考误差小于 `1.1/255` | `cargo run --example mini_compute` |
| Viewer 浏览器交互 | 比较模式、2× 速率、视频分片、切换暂停/恢复、窄屏布局；无浏览器错误 | `npm run qa -- http://127.0.0.1:8787 artifacts/windows-comparison.png` |
| 公开 field guide | 14 章；交互、实际 splat 视图、三张论文图、窄屏布局通过 | `npm run qa:docs -- http://127.0.0.1:8787` |
| PLY inspector | 字段/大小/有限值/哈希核对；抽样时间的零四元数计数为 0 | `python scripts/inspect_stg.py public/data/n3d-sear-steak-stg-lite.ply.gz` |

浏览器脚本的 Windows 启动配置改为完整 Chromium 的 headless 模式，解决原 headless shell 的 WebGPU device 创建失败；Metal 启动选项只在 macOS 使用。QA 中“隐藏 renderer 不应继续工作”的采样移到场景切换完成后，消除点击前后多出一帧的竞态，仍保留原断言。

## 本机浏览器性能记录

Windows，NVIDIA RTX 4090，Chromium `153.0.8010.12`，1440×1000 viewport，DPR 1；同一 fixture 与默认启动场景，采样 300 次 requestAnimationFrame。完整原始结果在本地 `artifacts/windows-profile.json`。

| 指标 | p50 | p95 |
| --- | --- | --- |
| CPU prepare | 7.5 ms | 8.3 ms |
| CPU sort（已包含在 prepare 内） | 2.5 ms | 2.7 ms |
| GPU render pass timestamp | 0.5468 ms | 0.5509 ms |
| 应用记录的帧时间间隔 | 16.7 ms | 16.8 ms |

可见点数 84,569–90,049；最后一帧 index upload 为 338,276 bytes；无页面错误。

这些指标不能直接相加成端到端延迟；也不能用 `1000 / GPU pass ms` 宣称应用 FPS。timestamp 只测对应 GPU pass，RAF 受呈现节奏影响，脚本读取的异步 GPU 样本可能重复。它不是完整首帧/网络/解压基准，也不是每帧唯一 query 的统计。

原生 smoke 的 dev build CPU prepare 约 105–109 ms，并且每帧阻塞 readback；该数值只记录执行情况，不用于评价交互性能。没有把这组数据混入浏览器测量。

## 生成物

以下路径是本机可重建的生成物，位于忽略的 `artifacts/`，没有提交进仓库：

- 官方场景：[三帧报告](../../artifacts/native/report.json)、[中间帧](../../artifacts/native/frame-1.png)。
- 教学实验：[训练报告](../../artifacts/toy-training/training-report.json)、[原生输出报告](../../artifacts/toy-training/native/report.json)。
- Compute：[逐像素比较报告](../../artifacts/mini-compute/report.json)、[正序图](../../artifacts/mini-compute/correct-order.png)、[反序图](../../artifacts/mini-compute/reversed-order.png)。
- 浏览器：[profile](../../artifacts/windows-profile.json)、[QA](../../artifacts/windows-qa.json)、[比较截图](../../artifacts/windows-comparison.png)。
- 数据：[检查报告](../../artifacts/model-report.json)，官方源代码/模型包位于 `artifacts/research/`。

官方 fixture 的压缩字节数为 10,764,919；记录负载为 108,317×128 = 13,864,576 bytes，不含 PLY 头。存储文件 SHA-256：

```text
d898dbd9e9c397b8495d24df84331c3cb85d2b31ab32d7b621477b0714c51f00
```

## 关键审计：现有播放器时间尚不能证明模型真实时间

当前 viewer 把 10 秒参考视频映射到 normalized t=0–1。另行下载并检查了 [官方 allcam ZIP](https://huggingface.co/stack93/spacetimegaussians/resolve/main/n3d_sear_steak_lite_allcam.zip) 中的 `cameras.json` 与 `cfg_args`：

- `cameras.json` 共 1,052 条记录，21 个机位；cam00 有 52 条，其他各 50 条。
- 同一官方源码的 Lite `sear_steak` 配置使用 `duration=50`。
- ZIP 中 `cfg_args` 未提供 duration；PLY 本身也没有 fps、起始帧或采集秒数。

这提示应重新核对模型训练时间范围，但不足以单独证明该 checkpoint 的精确采集时段。本次没有把它武断改成 50/30 秒，也没有把所有 300 帧视频当成已验证的训练范围。必须追溯实际训练命令/元数据，或与官方 renderer 在可对应的帧上核对，再固定秒→normalized time 的契约。

因此，现有 RGB wipe 能验证播放器控制与相机对照的部分行为，**不能证明动作逐帧对应**。原有文档中的历史质量指标未在本次复测；不把它们用作新的时间正确性或 held-out 泛化结论。`allcam` checkpoint 与 N3DV 规定 cam00 为测试机位也不是同一件事。

## 仍待完成

1. **真实数据训练。** 已审阅官方训练代码和预训练包；尚未配置完隔离的官方 CUDA 扩展环境，也未从真实 N3DV 图像重新训练。合成教学任务不替代这一证据。
2. **相机/时间质量验收。** 需确认 checkpoint 时间范围、完整内参投影、数据划分，建立逐帧参考 renderer 对照。
3. **独立引擎集成。** `StgPass` 已在本仓库的 native host 工作，独立引擎 frame graph、opaque depth、HDR、TAA 尚未接入/测试。
4. **高性能 compute。** `mini_compute` 是 `O(pixels×splats)` 的学习例子，没有 tile binning、GPU radix sort、workgroup shared-memory 优化。
5. **模型 streaming。** 现有 MSE 实验传的是源视频；Gaussian 仍整文件加载，没有分块随机访问、LOD 或移动缓存预算证据。
6. **平台矩阵。** 本次有 Windows/Chromium/D3D12 实测；没有 iOS/Android 真机、手写 Metal/CUDA 后端或长时间功耗记录。
7. **生产可靠性。** 本次增加有限值、计数和 log-scale overflow 检查；这不是完整不可信资产验证器。仍需总解压预算、极端运动/四元数、取消、device loss 等针对性处理。

上述条目也是接下来可选择的实验任务，见 [上线验收](06-engine-and-readiness.md)。不因 smoke 通过就把整套系统标为生产就绪。
