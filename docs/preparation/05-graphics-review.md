# Viewer 岗位的图形学恶补清单

目标不是背完一门图形学课，而是能从数据、数学、GPU 工作分工解释结果与故障。按 9/28 前准备的约束，P0 必须亲自推/写/讲；P1 以能解释取舍为准；P2 等团队问题列表决定是否加深。

## 0. “实现 rasterizer”有三个层次

1. 调用 API 的 graphics pipeline：triangle setup/coverage 由硬件做，你写 vertex/fragment shader、depth/blend 配置。当前 STG viewer 属于这一类的自定义 Gaussian 渲染。
2. 用 compute 自己定义 footprint、遍历与合成：不依赖 triangle coverage，自己处理像素归属、并发和排序。新增 `mini_compute` 展示这个层次。
3. 生产级算法：GPU preprocessing、scan、tile binning、排序、负载分配、early-out、跨架构优化以及质量回归。

JD 提到 CUDA，足以让第 2–3 层成为合理的准备重点；不证明他们的私有表示一定是 splat。CUDA 是通用并行计算平台，Metal/WebGPU/Vulkan/D3D 还包含图形功能；不能把它们看成语法不同但能力完全一样的 API。[CUDA 官方指南](https://docs.nvidia.com/cuda/cuda-programming-guide/index.html)、[Metal 官方说明](https://developer.apple.com/metal/)。

## 1. P0：传统三维管线

```text
vertex/index buffer
  → model transform → world → view transform → camera
  → projection → homogeneous clip coordinates
  → primitive assembly / clipping
  → perspective divide → NDC → viewport
  → triangle coverage / interpolated attributes
  → fragment shading → depth/stencil + blending → framebuffer
```

这是解释用的逻辑顺序，具体 GPU 可提前执行 depth 测试等操作。不要把 clip 与 perspective divide 顺序说反，也不要把 fragment 与最终显示像素严格一一对应。

必须掌握：

| 概念 | 能解释/推导到什么程度 | 常见追问 |
| --- | --- | --- |
| 齐次坐标 | 点 w=1、方向 w=0；平移不改变方向 | 为什么法线不能总乘模型矩阵？ |
| 模型与相机矩阵 | column-vector 下 `P*V*M*p`；相机 world transform 的逆才是 view | camera-to-world 怎样变成 world-to-camera？ |
| 正交/透视投影 | `u=fx*x/z+cx`；透视 w 为什么与深度有关 | 为什么近裁剪面不能随意接近 0？ |
| clipping | 在齐次空间处理 near plane 和 w；背后点不能直接除 w | 巨大/穿近平面的 splat 怎么办？ |
| NDC 与像素 | WebGPU z 范围 0–1；屏幕 y 向下与数学 y 可能不同 | OpenGL projection 矩阵为何会产生错误深度？ |
| triangle coverage | edge function、barycentric、统一边界规则 | 相邻三角形为什么不能有裂缝或重复覆盖？ |
| 透视插值 | `a = Σ(λi ai/wi) / Σ(λi/wi)` | 直接线性插值 UV 为什么扭曲？ |
| depth | opaque 常见 depth test + write；reverse-Z 的 clear/compare 要一起变 | 为什么透明物不能只靠普通 Z-buffer？ |
| anti-aliasing | 采样、低通、像素 footprint；MSAA/TAA 各解决什么 | 0.3 covariance floor 与 MSAA 是一回事吗？ |

法线是对切平面的约束，非均匀缩放下用逆转置，再归一化。Gaussian covariance 则按 `AΣAᵀ` 变换；两者目的不同，不能互换公式。

## 2. P0：必须亲手推的六组公式

**① 透视 Jacobian。** 对 `π(x,y,z)=(fx*x/z+cx, fy*y/z+cy)`，分别对 x,y,z 求偏导，得到

```text
J = [[fx/z, 0, -fx*x/z²],
     [0, fy/z, -fy*y/z²]]
```

检查单位：3D 坐标到像素的导数。数值小题：`fx=fy=100, p=(1,2,10)`，应得 `[[10,0,-1],[0,10,-2]]`。

**② Gaussian covariance 的线性传播。** 写 `X=μ+ε`，`E[ε]=0`，`Cov(ε)=Σ`。对于 `Y=A X+b`：`Y-E[Y]=Aε`，所以 `Cov(Y)=E[AεεᵀAᵀ]=AΣAᵀ`。平移 b 不进入 covariance。

非线性投影先在均值处 Taylor 展开：`π(X)≈π(μ)+J(X-μ)`，因此 `Σ2D≈JΣcameraJᵀ`。这解释了为什么透视投影只是局部 Gaussian 近似，而不是“任意透视变换都保持 Gaussian”。

小题：上一题 J，`Σcamera=diag(1,4,9)`，应得 `[[109,18],[18,436]]`；加 0.3I 后只变对角线。

**③ 椭圆与 conic。** 对 `Σ=[[a,b],[b,c]]`：`Σ⁻¹=1/(ac-b²)*[[c,-b],[-b,a]]`，`power=-0.5*dᵀΣ⁻¹d`。eigenvector 决定主轴方向，`sqrt(eigenvalue)` 决定 sigma；必须检查正定与数值下限。

3DGS 的 opacity kernel 通常不带概率密度的 `1/(2π√detΣ)` normalization；opacity 是另外学习的参数。不要直接把概率课的归一化密度代入现有 renderer 改变亮度。

**④ alpha/transmittance。** 近→远的 `Ti=∏j<i(1-αj)`；`C=Σ Ti αi ci + Tfinal Cbg`。远→近的 over 操作得到等价结果，前提是使用同样顺序和处理规则。推一遍红/蓝各 0.5 的例子，解释 early-out 为何通常配合近→远累积。

**⑤ 可微渲染最小链式法则。** 固定排序和 C、忽略 cutoff/clamp，令 `α=o exp(-0.5*dᵀC⁻¹d)`，`d=pixel-μ2D`，则列向量梯度 `∇μ2D α=α C⁻¹d`。沿投影均值这条路径，`∇μ3D α=Jᵀ∇μ2D α`。完整位置梯度还包括投影 covariance 随位置变化的路径，不能用这一个分支代替全部 backward。opacity logit l 使用 sigmoid 时，`∂α/∂l=α(1-sigmoid(l))`。用 finite difference 在非边界处验证方向与数量级。

排序、点数变化、剪裁都是离散操作；“可微 renderer”不意味着每个执行分支对所有参数都处处可微。训练是在实现定义的梯度路径上进行优化。

**⑥ 时间参数。** `μ(t)=μ0+m1dt+m2dt²+m3dt³`，对 normalized t 的速度是 `m1+2m2dt+3m3dt²`；如果真实时间 `s` 映射 `t=s/D`，则 `dμ/ds=(dμ/dt)/D`。模型的 normalized velocity 不等于 m/s。时间域变化时多项式系数也需一致变换。

## 3. P0：compute splat rasterizer 的并行设计

先运行：

```powershell
cargo run --example mini_compute
```

阅读 `examples/mini_splat.wgsl`：一个 invocation 负责一个像素，投影 camera-space Gaussian、求 covariance/conic、计算 alpha、按已排序列表合成。`mini_compute.rs` 对全部像素做独立 CPU 参考计算，并测试正序、反序、离轴投影与相机后方点。它使用 wgpu/WGSL，在本次实测中运行于原生 D3D12，不是新增网页演示。

这条教学算法复杂度约 `O(W*H*N)`；不能把 108k 点塞进去后声称是生产 renderer。下一层优化设计：

```text
temporal evaluation + project + bounds
 → count touched tiles per splat
 → exclusive scan to allocate disjoint ranges
 → emit (tile-id, depth-key, splat-id) pairs
 → sort by tile then depth
 → build tile ranges
 → each workgroup handles tile pixels
 → shared-memory batches + front-to-back alpha + early-out
```

必须能回答：

- 为什么一个 splat 一个线程向所有像素散射会竞争？alpha 合成不满足可交换性，普通 atomic-add 不能修复顺序。
- 为什么 prefix sum 有用？把不等长输出变成互不重叠的写入区间；全局计数增长仍要做容量检查。
- `workgroupBarrier` 能不能同步所有工作组？不能；跨工作组依赖通常要拆成 dispatch，并符合 API 的资源/执行顺序约束。
- SIMD/SIMT 中分支、寄存器、shared memory 如何影响 occupancy？不能只靠调大 workgroup 就断言更快。
- 为什么 tile 列表有时比原始点数据还大？一个大 footprint 会覆盖多个 tile，pair count 可能远大于 N。
- 怎样做 CPU/GPU 对照？同一 inputs、排序规则、epsilon、背景和格式，比较逐像素差异及失败案例，而不是只看 FPS。

## 4. P0：GPU 与 CPU 性能

`queue.submit()` 耗时不是 GPU 完成时间；CPU stopwatch、GPU timestamps、帧呈现间隔是三件事。GPU readback 会引入同步，本项目原生 smoke 故意阻塞读取以验证像素，不能用它报告交互 FPS。

1M 个 128-byte records 约 122 MiB；仅 u32 索引约 3.81 MiB。每帧上传完整属性与只上传索引的带宽相差 32 倍，但仍要算 CPU 求值、sort、驱动上传和 GPU overdraw。模型小不意味着 render pass 便宜：大 splat 与多层覆盖可能占满像素工作。

排障顺序：锁定相机/时间/分辨率 → 记录 p50/p95 → 分开测 CPU preprocess、sort、upload、GPU raster → 只改一项 → 检查图像和端到端延迟 → 判断是否保留。浏览器 60 FPS 可能仅代表 VSync 上限。

必须理解 AoS/SoA、GPU 数据对齐（尤其 WGSL `vec3`）、storage/uniform buffer、texture format、resource usage、staging/readback、buffer 常驻与 lifetime。查询 adapter features/limits，不能把 desktop optional feature 当成所有手机都有。

## 5. P0：交付、streaming 与 UX

状态机示例：`requested → downloading → decoded → uploading → resident → evicting`。seek 改变 request generation，旧请求的结果不能覆盖新时间点；取消下载不能保证服务器已停止发送，但客户端要正确丢弃无效结果并回收内存。

首帧包含网络、解码、parse、GPU upload 和首次 pipeline 初始化。gzip 很小但随机读取差；量化/LOD 可以降低带宽，却要同时测视觉误差和 decode 时间。按时间切块须说明时间核支持、跨块重复/共享属性与边界连续性，不能简单按 PLY 行号切片。

用户需要：加载进度含义明确、拖动时间轴反馈快、播放/暂停一致、orbit/zoom 不丢场景、空白/损坏数据有恢复路径。移动端还要处理触控冲突、orientation、后台恢复、device loss、GPU 内存峰值和持续运行后的热降频。390px 桌面浏览器仿真只能验证布局，不能证明手机性能。

## 6. P1 与 P2

P1：线性颜色与 sRGB 转换、premultiplied alpha、HDR/曝光/tonemap；opaque mesh + splat 的遮挡；TAA history 与 motion vectors；跨平台资源/能力抽象；SH 的方向依赖外观。STG-Lite 的 RGB 已含训练图像外观，不能不加说明地再套 PBR 灯光。

P2：Cook–Torrance 完整推导、复杂 shadow filtering、deferred/G-buffer 实现、path tracing、全套 CUDA/Metal 后端。知道基本目的和代价即可，除非团队题单明确要求。GS 的实时 rendering 不意味着它是物理正确的可重光照几何。

## 7. 30 分钟口述自测

每题给自己 0–2 分：0 说不清，1 只会概念，2 能画图/推导并指出代码或实验。优先补 0 分题。

1. 不用 Three.js，画一个 triangle、point、Gaussian 分别需要哪些步骤？
2. camera-to-world 的 rotation/position 如何构造 view？
3. 为什么 Gaussian 要投影 covariance，不能只投影中心再画固定圆？
4. 推出 J 与 `JΣJᵀ`，解释近似条件。
5. 为什么透明排序有必要；premultiplied 与 straight alpha 有什么差别？
6. 训练 loss 怎样改变位置？哪些操作不是处处可微？
7. 点云、3DGS、STG-Lite、deformation 4DGS 的资产边界是什么？
8. 一帧慢在 CPU 还是 GPU，要拿什么证据区分？
9. 从 CPU 全局排序迁到 GPU tile renderer，新增哪些 buffer/同步/容量问题？
10. 同一 WGSL 在桌面好、移动端差，应检查哪些方面？
11. 10 GB 动态场景怎样做首帧、seek、缓存和回收？
12. 为什么现有视频分片不等于已经完成模型 streaming？
13. 一个 allcam checkpoint 可以报 held-out camera PSNR 吗？
14. 随时间拖影可能来自训练、时钟还是 TAA，如何分层定位？
15. 你实现并验证了什么、哪些只是提案，能拿出什么可重复证据？
