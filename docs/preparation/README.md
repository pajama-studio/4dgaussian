# 4D Gaussian：从训练到 Viewer 的准备手册

核对日期：2026-09-16。面向 Peripheral **Software Engineer – Viewer**，以当前 Rust / wgpu 项目为实操主线。用户已确认先不修改独立的 `engine` 仓库；**9 月 28 日前准备好，9 月 27 日完成最终演练**。团队问题列表后续到达，再按题目调整优先级。

这套材料的目标是让你能亲自解释并验证：数据如何变成可学习的场景、优化如何产生动态 Gaussian、参数如何导出、GPU 如何把它画成像素、系统如何把它稳定交付给用户。

## 阅读顺序

| 文档 | 解决的问题 |
| --- | --- |
| [09 GS 推导课程路线](09-courses.md) | Coursera、KAIST、CMU、作者教程怎么选；每章对应什么公式和代码 |
| [01 职位与准备安排](01-role-and-plan.md) | 职位到底考什么；先学哪些；如何展示自己做过的工作 |
| [02 端到端原理与源码地图](02-end-to-end.md) | 从采集、标定、训练到 STG 数学与 GPU 渲染 |
| [03 训练与复现实操](03-training-runbook.md) | 已跑通的教学闭环；真实 N3DV/STG 训练步骤；导出契约 |
| [04 数据集与预训练模型](04-datasets.md) | 哪些适合入门、人体运动、困难场景；下载、格式与许可 |
| [05 图形学复习与面试练习](05-graphics-review.md) | 传统 3D 管线、GPU、混合、颜色、性能、流式传输与移动端 |
| [06 自研引擎接入与上线验收](06-engine-and-readiness.md) | 当前 `StgPass` 怎么接；以后接入 Pajama Engine 的具体位置 |
| [07 本次验证与待解决事项](07-validation.md) | 哪些实际跑过；证据在哪里；哪些还只是方案 |
| [08 团队问题映射表](08-question-tracker.md) | 收到问题列表后逐题连接答案、推导、源码和证据 |

## 今天就运行

在仓库根目录执行（PowerShell；Python 实验需要本机已有的 PyTorch、NumPy）：

```powershell
npm ci
npx playwright install chromium
npm run check
npm run dev
```

打开命令打印的本地地址。另开终端：

```powershell
python scripts/inspect_stg.py public/data/n3d-sear-steak-stg-lite.ply.gz --output artifacts/model-report.json
cargo run --example native_smoke
cargo run --example mini_compute
python scripts/train_toy_stg.py
cargo run --example native_smoke -- artifacts/toy-training/model.ply artifacts/toy-training/cameras.json artifacts/toy-training/native
```

`artifacts/native/frame-0.png` 至 `frame-2.png` 是官方场景的原生 GPU 输出；`artifacts/toy-training/native/` 是你本机这次优化得到的教学模型输出。两者不能混称为“自己训练的真实场景”。生成物在 `.gitignore` 下；可通过命令重建。

## 先记住的六件事

1. **4D Gaussian 不是统一格式。** 本项目实现 STG-Lite；HUST 4DGS 的 deformation network、Dynamic 3D Gaussians 的逐时刻轨迹都需要各自的运行时。
2. **训练与渲染是两套工作负载。** 推理只需前向计算；训练还需梯度、中间状态、优化器与密度控制。
3. **相机和时间是资产的一部分。** PLY 的字段正确，不代表坐标、时间、颜色正确。
4. **Viewer 岗位的核心是跨平台交付。** 训练是理解数据来源的基础，流式传输、交互、性能和移动端同样需要作品证据。
5. **现有 10 秒是播放器映射，不是已确认的模型采集时长。** 预训练包每机位约 50 条相机记录，时间来源仍待确认，见审计。
6. **公开可下载不等于允许商用。** 当前 N3DV 研究资产带非商业条款；商业上线需替换为有相应权利的数据或取得授权。

## 完成标准

你能不看稿画出完整流程；手推一次 Gaussian 投影和 alpha 合成；从真实相机与时间元数据解释一个像素错误；在固定场景做一次有质量对照的性能实验；展示训练导出→GPU 出图的日志；诚实区分已验证、待验证和设计建议。

项目已有的英文 [field guide](../../public/docs/index.html)、[STG 字段契约](../../STG_LITE_FORMAT.md) 和 [性能记录](../../PERFORMANCE.md) 继续保留。本目录增加中文学习路线与本次审计，不把历史记录当成本机新测量。
