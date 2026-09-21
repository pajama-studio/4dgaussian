# 当前 Rust/wgpu 接入与后续引擎路线

按用户确认的范围，先在本仓库完成宿主无关的渲染入口；本次没有修改 `G:/pajama-studio/engine`。这里区分已经运行的 API 与之后的集成建议。

## 已实现：StgPass

[src/stg_pass.rs](../../src/stg_pass.rs) 复用已有 PLY 解析、CPU 时间求值和 [splat.wgsl](../../src/splat.wgsl)。宿主拥有 device/queue、attachment、相机、时钟、提交与呈现；pass 拥有自身 pipeline、binding、静态模型和动态排序索引。

```rust
// 片段；完整可运行宿主见 examples/native_smoke.rs。
let mut stg = StgPass::new(&device, &decoded_ply, color_format, None)?;
let stats = stg.prepare(
    &queue,
    normalized_time,
    view.to_cols_array_2d(),
    projection.to_cols_array_2d(),
    [width, height],
)?;
// 宿主创建 render pass，设置相同大小的 viewport，再调用：
stg.draw(&mut render_pass);
// 结束 pass 后由宿主 submit/present。
```

运行 `cargo run --example native_smoke` 会在本机 D3D12 上生成三个时间点的图像。这个路径证明库能够由原生离屏宿主调用；还没有把浏览器现有 `GaussianRenderer` 重构为同一个 pass，也没有接入独立引擎的帧图。

## 接口契约

| 输入/资源 | 当前约定 | 集成方责任 |
| --- | --- | --- |
| 模型 | 解压后的 binary little-endian STG-Lite PLY；32 个 float；上限 160k | 网络、解压、版本、字节预算与数据来源 |
| 时间 | 有限的 normalized t，范围 0–1 | 用资产元数据映射秒；不能从 PLY 猜测 10 秒 |
| 相机 | 列向量/列主序矩阵；RH view 朝 -Z；WebGPU clip Z 0–1 | 坐标变换、内参、单位、近远平面与 jitter |
| viewport | 非零像素宽高，shader 与 render pass 一致 | resize、DPR、scissor 与 attachment 尺寸 |
| color | 创建 pipeline 时指定格式；预乘 alpha；现有 learned RGB | 确定线性颜色/HDR 的转换位置 |
| depth | 可选格式与 compare；始终不写 depth | 与宿主常规 Z 或 reverse-Z 保持一致 |
| MSAA | 当前固定 sample count 1 | 多重采样接入前扩展 pipeline 与 attachment 契约 |
| queue | prepare 写入同一套 camera/index buffers | 一帧 submit 后再 prepare 下一帧；多视图要独立实例/缓冲或明确 offset |

本仓库和独立引擎目前都使用 wgpu 30；glam 版本不同，所以边界使用 `[[f32;4];4]`，避免暴露特定版本的 `Mat4`。这是适配层设计，不是长期跨版本二进制 ABI 保证。

`native_smoke` 的相机转换适配当前参考 fixture，使用 fy/aspect 构造居中的透视投影；它不是通用的任意 fx/fy、偏心主点和畸变相机适配器。实际产品应构建完整内参投影并用已知点与参考图验证。

## 以后接入 Pajama Engine 的位置

已阅读相邻引擎的 `docs/RENDERING.md`、`docs/RENDERING_ARCHITECTURE.md` 与渲染入口。它从 `RenderSnapshot` 提取场景，通过注册 pass、资源描述、graph compiler 和 executor 执行。建议沿现有边界接入：

1. **资产与实例。** 定义 Gaussian 资产版本、bounds、时间域、坐标/颜色约定；场景实例只保存 asset handle、transform、playback 状态。不要每帧把完整 PLY 塞进 snapshot。
2. **帧提取。** 在 `crates/pajama-render/src/snapshot.rs` 的体系内传入可见 Gaussian 实例及本帧/前帧时间。GPU 资源留在渲染线程，数据加载走有预算的异步队列。
3. **注册和验证。** 扩展 `pajama-world/src/render` 的 schema/topology/validation；把新 pass 的成本与阶段约束写清楚。
4. **图编译与资源。** 由 `pajama-render/src/pipeline/graph_compiler.rs`、`resource_registry.rs` 声明 HDR color、opaque depth，以及未来的 motion/reactive 读写关系。
5. **执行。** 在既有 executor 中调用 Gaussian pass；不要在呈现前临时插入一个绕过 graph 的 draw，也不改变引擎的权威 terrain/physics 数据。
6. **平台能力。** 通过 `capabilities.rs` 校验 storage binding、格式、compute/feature 限制与预算。共享场景语义、验收图和算法边界；各后端可选择适合自己的实现。

这些是待实施设计，并未注册一个真实的新引擎 pass。本次只读相邻仓库，保留了其原有未提交改动。

## 混合渲染的四个必答问题

**Opaque depth。** 初版可在 opaque 之后画 splat，读取/测试 opaque depth，关闭 splat depth writes。当前 quad 使用中心深度，是近似；Gaussian 与 mesh 相交时，整个体积的遮挡不能用一个中心深度精确表达。透明 mesh、水与 Gaussian 的联合排序还需另行设计。

**颜色与 HDR。** 模型 RGB 学自图像外观，既不是自动恢复的线性辐射度，也不是 PBR albedo。先以原始参考输出建立 baseline，再明确图像传递函数、线性化、曝光与 tonemap，防止双重 gamma。单独把 target 改成 RGBA16F 不等于已经正确接入 HDR。

**TAA。** 时间在变，splat 本身也在移动；只有相机 motion vectors 不够。可用前/当前 Gaussian 中心求近似 velocity，并结合透明度、覆盖变化与 reactive mask；求值中心不同不代表已解决形变/遮挡的全部 history 问题。先用无 jitter、无 TAA 的基线检查，再逐项启用。

**跨后端。** 当前 WGSL 通过 wgpu 在 WebGPU 和原生 D3D12 上运行。若未来写 CUDA/Metal compute 后端，先统一参数激活、投影、cutoff、排序 tie-break 与合成规则，再用相同输入/图像参考验收。不能把“wgpu 能选后端”描述为已经编写并验证多个平台专用 rasterizer。

## 演示准备与上线门槛

| 检查点 | 演示前 | 面向真实用户上线前 |
| --- | --- | --- |
| 可复现 | 固定仓库版本、命令、资产与三帧输出 | 版本化导出、checksum、回滚与监控 |
| 正确性 | 坐标/时间/混合能解释；不夸大 allcam 质量 | 确认真实时间映射、held-out cameras/frames；参考 renderer 对照 |
| 大文件 | 当前 108k fixture 能启动 | 下载/解压/解析/显存总预算、超时、损坏输入与设备丢失恢复 |
| 性能 | CPU、GPU、帧间隔分开讲 | 目标设备固定 workload 的 p50/p95、首帧、seek、功耗与热稳定 |
| 平台 | Windows GPU + Chromium 结果 | 目标浏览器与 iOS/Android 真机矩阵 |
| 交付 | 源视频分片实验可展示 | 模型分片、LOD、取消、缓存驱逐与时间边界连续性 |
| 使用权 | 研究演示明确标注来源 | 对实际产品数据和依赖确认相应授权 |

当前是研究与学习原型。已经验证的进展见 [验证记录](07-validation.md)；未完成项决定还不能把它称为生产上线完成。
