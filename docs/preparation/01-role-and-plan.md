# 职位拆解与准备安排

## 职位事实

已直接读取用户给出的 [Dover 原始职位页](https://app.dover.com/apply/Peripheral/2433296a-d0ca-4098-b659-5a80a10ab982/)，核对日期 2026-09-16；[投资方职位转载](https://jobs.khoslaventures.com/companies/peripheral-labs/jobs/92242383-software-engineer-viewer) 与之对应。

职位标题是 **Software Engineer – Viewer**，正文描述 Junior Fullstack Software Engineer。重点是共享引擎上的 web / mobile / native 观看体验，空间与视频数据的传输，以及从数据到像素的性能。它要求至少一种图形 API 实践，**没有要求所有人同时精通 CUDA、Metal、Vulkan、DirectX**；这些 API 的模型与职责也并不相同。

职位另外明确要求加拿大合法工作资格、愿意到多伦多现场工作，并写明目前不提供移民担保。这是招聘条件摘要，不是对你个人资格的判断。

## 能力—证据矩阵

| 优先级 | JD 关注点 | 你需要能解释 | 当前项目能提供的证据 / 缺口 |
| --- | --- | --- | --- |
| P0 | 引擎实践 | 生命周期、资源所有权、相机、帧循环、设备丢失 | Rust/wgpu viewer；新增独立 `StgPass` 与 D3D12 smoke |
| P0 | 3D 几何与渲染 | 坐标变换、投影、mesh、point cloud、Gaussian 的不同 | 用实际相机 JSON 与 WGSL 走一次数据到像素 |
| P0 | 至少一种 GPU API | buffer、binding、pipeline、command、pass、同步 | WebGPU / wgpu；原生 D3D12 经由 wgpu，不等于手写 D3D12 |
| P0 | 数据传输与优化 | 首帧、随机 seek、压缩、取消、缓存、显存预算 | 现有视频分片可演示；Gaussian 模型仍是整文件 gzip，模型分片待做 |
| P0 | 全链路性能 | 区分网络、解码、上传、CPU sort、GPU raster、presentation | CPU 与 GPU 时间分开记录；要补固定镜头、固定设备、质量对照 |
| P0 | 跨端 UX | orbit/pan/zoom、时间轴、触控、加载反馈、错误恢复 | 浏览器交互已有；响应式页面不等于原生移动端经验 |
| P1 | 和 Reconstruction 团队协作 | 版本化字段、时间、标定、decoder、质量指标 | STG 导出契约、50/300 帧疑点、allcam 数据划分审计 |
| P1 | 快速比较方案 | 为什么试 A/B、用什么指标淘汰一个方案 | 可比较 CPU/GPU preprocessing、gzip/量化、不同 LOD；不要只谈理论 |
| P1 | 移动开发 | 生命周期、后台恢复、功耗、内存、触控 | 当前尚无 iOS/Android 真机结果，这是明确缺口 |
| P2 | 开源贡献、设计协作 | 如何复现问题、评审取舍、给非技术用户解释 | 本仓库变更与验证记录；可整理成小而完整的 PR |

职位提到点云和 mesh，并不证明公司内部使用某一种 4DGS。本项目是你研究相邻技术与 Viewer 工程能力的作品，不是 Peripheral 技术的复刻。

## 9 月 16–27 日的 12 天安排

用户已确认 **9 月 28 日之前准备好**，团队之后会发问题列表。目标是 27 日完成演示与模拟问答。先按每天约 2–3 小时有效学习安排；训练/下载可后台进行。基础水平尚未确认，第一天用下面的自测定位薄弱项，不默认你是初学者。

| 时间 | 学习与实操 | 当天/阶段产物 |
| --- | --- | --- |
| 9/16 | 跑 viewer / native / inspector；30 分钟基础自测 | 数据→GPU→像素图；三个时间点输出 |
| 9/17 | 相机矩阵、COLMAP、内外参、深度与屏幕坐标 | 手算已知点投影；解释一处转置/轴向错误 |
| 9/18 | 传统 raster pipeline、透视插值、depth/blend | 画管线；手算 alpha；解释透明物为何不写普通 depth |
| 9/19 | 3DGS/STG 参数与投影协方差；源码走读 | 推导 `Σ2D`；标注 `sample/vs_main/fs_main` |
| 9/20 | 教学训练→PLY→wgpu；官方环境可行性检查 | 训练日志、导出与 GPU 图片；真实训练依赖清单 |
| 9/21 | N3DV 时间/相机/划分；若环境就绪做真实短训练 | 数据契约与 time manifest；可选真实训练 smoke |
| 9/22 | CPU/GPU profiling 与一次小型优化实验 | 固定场景 p50/p95、差分图、是否采纳的理由 |
| 9/23 | 空间数据 streaming、缓存、seek、压缩 | manifest 与状态机；受限网络下首帧/seek 记录 |
| 9/24 | 引擎接入、颜色/HDR、mesh 遮挡、TAA | `StgPass` 接口讲解；接入图与风险定位 |
| 9/25 | 移动端约束与 Viewer UX；处理团队问题列表 | 真机记录（有设备时）；每题对应源码/实验 |
| 9/26 | 第一轮模拟面试，补最薄弱的 3 项 | 10 分钟演示 + 30 分钟口述；修订答案 |
| 9/27 | 最终复现、演示备份、第二轮问答 | 一页证据表、命令、截图/录屏；停止大改 |

真实研究训练耗时由预处理、场景规模、依赖和硬件决定；不承诺在此日期达到论文质量。官方旧依赖排障先设半天投入上限，超过后记录问题并保持 Viewer 主线推进。真实训练、原生移动实现、完整模型 streaming 不能全部挤占 P0 复习。

团队问题列表到达当天，使用 [问题映射表](08-question-tracker.md)：逐题分类为概念/推导/代码/系统设计/经验；标出红黄绿与需要的证据。优先替换计划中较低优先级的选修内容，保留 26–27 日模拟与复现时间。

如果最后只剩 72 小时：保留原生/浏览器演示和教学闭环，复习相机/投影/混合/性能/网络五个 P0 模块，再演练团队问题列表。优先保证能解释与复现，不要临时声称掌握多个未实践的后端。

## 10 分钟作品讲解

1. **1 分钟问题定义**：我希望把动态重建数据变成可交互的 Viewer；用户需要自由视点与时间控制。
2. **2 分钟数据契约**：为什么选 STG-Lite、32 float 字段是什么、为什么另一个 4DGS 文件不能直接载入。
3. **2 分钟渲染**：时间求值→投影协方差→排序→premultiplied alpha；展示 WGSL 中对应位置。
4. **2 分钟工程取舍**：CPU baseline、GPU 常驻数据、index-only 上传；用测量说明下一步优化。
5. **2 分钟实证**：官方研究场景渲染与自己训练的合成小例子分别展示；指出真实训练尚未完成的部分。
6. **1 分钟下一步**：时间元数据、held-out 验证、模型分片、移动端；选择一个最有价值的下一实验。

英文表述模板（只按实际完成情况使用）：

> I built a Rust/wgpu viewer for the public STG-Lite representation and validated native GPU rendering. I also ran a small synthetic differentiable training-to-rendering experiment. The pretrained real scene comes from the paper authors. My focus is the data contract, temporal evaluation, compositing, and reproducible performance evidence.

## 建议反问团队

- Reconstruction 实际输出什么 representation、decoder 和版本契约？
- 共享引擎共享的是数据语义、核心算法、shader，还是平台 UI 也共享？
- 首要用户是研究人员、转播操作员、分析师还是消费者？各自最重要的质量指标是什么？
- 当前最长延迟在重建、打包、传输、解码、上传还是渲染？
- 移动端目标设备与内存/功耗预算是什么？
- 新 renderer 或压缩方案用哪些测试场景、参考图和回归门槛验收？

这些问题来自职位与你的工程分析；它们不是对公司私有架构的断言。
