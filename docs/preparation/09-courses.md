# GS 公式与实现：按章节学习的课程路线

核对日期：2026-09-16。目标是 9 月 28 日前能推导、写代码和解释工程取舍。下面的学习时间是为本项目安排的投入预算，不是课程官方总时长，也不是完整结课承诺。

**建议主线：KAIST 的 GS 课堂 → CMU 的 Gaussian 作业 → 当前 Rust/WGSL 实现。** Jacobian、Taylor 展开或链式法则不熟时，穿插 Coursera 数学课；随后看作者教程中的动态场景部分，再回到 STG-Lite 的具体时间模型。

## 1. 真正包含 GS 的 Coursera 课程：用来建立概念

[Northeastern University — Machine Learning with Small Data Part 2](https://www.coursera.org/learn/machine-learning-with-small-data-part-2)，教师 Sarah Ostadabbas。

直接找 **Module 7，标题 “14 - 3D Gaussian Splatting”**。公开大纲列出 1 段约 6 分钟视频、6 篇阅读和 1 个测验，涉及各向同性/各向异性、方法、训练及与 NeRF 的比较。可选先读 Module 5 的 NeRF/体渲染内容。

它符合你偏好的分模块在线课程形式，但 GS 只是其中一章。按公开大纲判断，它更适合约 1–1.5 小时的概念预习；不要把这个短章节当成完整的 GS 推导与 rasterizer 编程课。没有登录购买或验证受限课内内容；可访问范围、证书与费用以你的账户页面为准。

## 2. KAIST CS580：最适合接着看课堂讲解

[CS580 Computer Graphics，Spring 2024，Minhyuk Sung](https://mhsung.github.io/kaist-cs580-spring-2024/) 是大学渲染课程，有按课组织的录像入口。

本次只选这两节：

- **Lecture 11：Neural Rendering / Volume Rendering** — [官方课程链接的录像](https://www.youtube.com/watch?v=5SQ9pJS3S5I)。先建立射线、透射率、图像重建损失之间的联系。
- **Lecture 12：Gaussian Splatting** — [官方课程链接的录像](https://www.youtube.com/watch?v=K0RRdHVU1bU)。带着 Gaussian 参数、投影、合成、优化四个问题看。

给自己 3–4 小时，包含暂停、笔记与手算。课程页还列出了旋转/四元数和传统管线课，卡在这些基础时再补。录像链接已核对；本次抓取 GS 的 SharePoint slides 跳转到了登录页，因此不保证讲义匿名可下载，也没有假称逐分钟审看完整录像。

看完应能画出自己的计算图：`3D 参数 → 2D footprint → alpha → pixel → loss → gradient`。这是本手册给你的学习任务，不是对该课逐项考核内容的承诺。

## 3. CMU 16-825：最贴合“公式必须能写出来”

[Learning for 3D Vision 课程](https://learning3d.github.io/)，[Fall 2025 存档](https://learning3d.github.io/fall25/)，[官方 Assignment 4](https://github.com/learning3d/assignment4)。

优先做 **Q1.1 与 Q1.2**：前者实现 3D/2D covariance、均值投影、Gaussian 求值、排序及 alpha/transmittance 合成；后者从带相机的图像优化一个简单 3D 场景。Q1.3 的 SH 可选，Q2 diffusion 留到面试后。

这条路线把数学直接变成函数，最接近你要的“真正理解”。它不是完整的 Coursera 服务：已确认公开作业和课程页，未确认整套录像均可匿名观看，也没有在线评分/证书承诺。[2026 秋季课表](https://learning3d.github.io/schedule.html) 把 GS 排在 10 月，晚于你的截止日，直接使用现有作业与往年材料。

安排 6–8 小时完成选定部分的学习和小实验；从零搭环境、完整作业与调参可能更久。PyTorch3D 等依赖应放进单独环境。若环境阻塞，先在本仓库的 `train_toy_stg.py` 与 `mini_splat.wgsl` 上验证同一组公式，不让安装问题耗尽准备时间。

## 4. 3DV 2024 作者教程：理解设计与动态扩展

[3D Gaussian Splatting Tutorial](https://3dgstutorial.github.io/)。这是一场半天专题教程，讲者包括 Georgios Kopanas、Bernhard Kerbl、Jonathon Luiten 和 Antoine Guédon。

按顺序学习 Part 1 Foundations 的 slides、Part 2 实践、Part 3 动态 Gaussian；Part 4 表面重建目前选修。官网明确提供 **Part 2–4 的录像**，不要误以为 Part 1 也有同站录像。

安排 2–3 小时选读/选看，重点记下参数为什么这样设计、训练和推理分别需要哪些状态、动态表示如何增加时间。Part 3 的 Dynamic 3D Gaussians 与当前 STG-Lite 不是同一个方法，不能直接互换文件或时间公式。

## 5. Coursera 数学课：专门补推导卡点

[Imperial College London — Mathematics for Machine Learning: Multivariate Calculus](https://www.coursera.org/learn/multivariate-calculus-machine-learning)。有分模块视频、练习和编程内容；它教数学基础，不是 GS 专题。

优先选：**Module 2 的多变量导数/Jacobian；Module 3 的链式法则与反向传播；Module 4 的 Taylor 展开与线性化**。需要时加 Module 5 的优化。安排 3–5 小时选学与手算，熟悉的内容可跳过，不用为了证书刷完整课程。

学习目标：解释为什么透视投影后使用局部近似 `Σscreen ≈ J Σcamera Jᵀ`，并把像素误差的梯度沿计算图传回 Gaussian 参数。

## 6. 两门按需补基础的课

| 资源 | 只学哪些部分 | 用途 |
| --- | --- | --- |
| [GAMES101，闫令琪，官方课程页](https://sites.cs.ucsb.edu/~lingqi/teaching/games101.html) | 第 2–6 讲；有余力补第 8–9 讲 | 中文讲解向量、MVP、三角形覆盖、深度与抗锯齿、插值；不是 GS 课程 |
| [University of Toronto — Visual Perception for Self-Driving Cars](https://www.coursera.org/learn/visual-perception-self-driving-cars) | “Basics of 3D Computer Vision” 中的针孔模型、投影几何与标定 | 理解相机内外参和多视图输入；暂不追自动驾驶检测/分割 |

GAMES101 官方页链接视频与可离线做的作业；它是历史公开课，不承诺当前有人批改。两个方向按你的自测结果选一个补缺，不必同时学完。

另一个更接近连续付费视频课的候选是 [3D Gaussian Splatting from Scratch — PyTorch-Only](https://www.3dgaussiansplattingcourse.com/)。提供方标示约 16 小时，覆盖 COLMAP、表示、可微渲染与优化。这里只核实了公开介绍，未购买/试看完整课程；付费内容质量和逐式推导深度没有实证，因此先以能核查的大学材料作为主线。

## 每条公式要接到哪里

下表是本项目的练习设计，不是各课程原有作业的逐字摘录。完整手算题和注意事项见 [图形学复习第 2 节](05-graphics-review.md)。

| 你要亲自推导 | 补课入口 | 本地代码/验收 |
| --- | --- | --- |
| `Σ3D = R diag(s²) Rᵀ`，为什么必须保持半正定 | CMU Q1.1；3DV Part 1 | `src/splat.wgsl` 的 quaternion/三个 covariance axes；解释 log-scale 激活 |
| 针孔投影及 `J = ∂(u,v)/∂(x,y,z)` | Coursera 微积分 Module 2；相机课 | 对比 `projected_axis()` 的齐次坐标求导；手算已知点 |
| 从 `Cov(AX+b)` 推到 `Σ2D≈J WΣ3D WᵀJᵀ` | 微积分 Module 4；CMU Q1.1 | `W` 是 world→camera 的 3×3 线性部分；说清一阶近似和单位 |
| `G(d)=exp(-½dᵀΣ2D⁻¹d)` 与椭圆主轴 | CMU Q1.1；KAIST GS 课 | `mini_splat.wgsl` / `fs_main`；不能误加概率密度归一化因子 |
| `Ti=∏j<i(1-αj)`，`C=Σ Ti αi ci` | KAIST 体渲染；CMU 合成部分 | 正序/反序红蓝两层，算出不同颜色并运行 `mini_compute` |
| `∂L/∂θ` 的链式法则和固定顺序下的梯度 | 微积分 Module 3；CMU Q1.2 | `train_toy_stg.py` 的 loss/backward/step；做一次非边界 finite difference |
| STG 时间核、三次运动、时间单位转换 | 作者动态教程建立背景；STG 论文/代码确定实际公式 | `ResearchSplat::sample` 与 WGSL；解释 normalized t 与秒不同 |

STG 的直接材料：[官方论文项目页](https://oppo-us-research.github.io/SpacetimeGaussians-website/)、[官方源码](https://github.com/oppo-us-research/SpacetimeGaussians)。先读本文档链接的 3DGS 课，再用 [端到端手册](02-end-to-end.md) 对齐 Lite 模型；没有找到一门已核实能替代这一步、同时覆盖本项目完整 4D 训练与 wgpu 接入的 MOOC。

## 嵌入 9/16–27 的安排

不要把下面内容叠加成另一套每日任务，它替换 [总计划](01-role-and-plan.md) 中对应的学习时段。

| 日期 | 课程/实践 | 当天必须留下的结果 |
| --- | --- | --- |
| 9/16–18 | GS 概览；按需补 GAMES101 相机/管线或 Coursera Jacobian | 一张坐标变换图、一页投影导数 |
| 9/19–20 | KAIST 11–12；CMU Q1.1 对照本地 shader | 协方差与 alpha 推导、GPU 红蓝排序图 |
| 9/21–22 | CMU Q1.2 思路；跑本地教学训练与导出 | loss 曲线数据、PLY、原生 GPU 图；讲清可微链路 |
| 9/23–24 | 3DV Part 2–3；读 STG 时间模型 | 比较三种动态表示；写时间/相机契约 |
| 9/25–27 | 只补团队题单暴露的薄弱点，留模拟问答时间 | 不看资料推公式；从代码定位一次错误 |

最低完成标准：不背论文原文，能从针孔相机推到 `JΣJᵀ`，手算两层合成，再解释 loss 如何改变 Gaussian。之后才扩展到密度控制、SH、完整 CUDA backward 和移动端优化。
