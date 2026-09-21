# 4DGS 数学手册：推导与实现

公开页面：https://4dgaussian.pajama.studio/math/

本次内容：8 个基础数学工具、39 组核心公式、175 个逐步推导步骤，
每组均有数字算例、当前仓库源码片段、变量映射、适用条件与自测答案。
另有从 32-float STG-Lite 记录到像素、MSE、解析梯度、SGD 与 PLY 导出的交互实验。

阅读顺序：基础工具 → 01–05 → 08 → 像素实验。06–07 比较形变模型、原生四维条件高斯、
SH 与完整 STG 特征解码；这些方法的教学函数没有接入当前 STG-Lite renderer。

## 内容维护

- scripts/math/content.mjs：39 个主公式、章节和原始参考资料。
- scripts/math/foundations.mjs：基础数学工具。
- scripts/math/lessons-{geometry,screen,time,families,training}.mjs：逐式推导。
- scripts/math/source-map.mjs：从真实源文件抽取代码，输出有行号和 SHA-256 的快照。
- scripts/math/trace-content.mjs：像素实验文字与内存布局表。
- public/math/trace.mjs：可独立运行的 float64 前向、解析梯度与 binary PLY 导出。
- public/math/reference.mjs：其他表示的独立教学函数。
- public/math/trace-ui.mjs、math.js、math.css：页面交互与样式。

运行 npm run build:math 生成页面、源码快照和本地 KaTeX 字体。
主公式保留 native MathML；详细推导使用构建时 KaTeX HTML + semantic MathML；
不依赖外部 CDN 或浏览器端公式脚本。

## 中英文切换

顶部提供 中文 / English。支持 ?lang=zh 与 ?lang=en，保留章节 hash，
在允许本地存储时记住语言。直接更新文本节点，保留公式排版、展开状态、
实验参数和已经执行的 SGD 更新；源码中的代码保持原始内容。
源文件快照页面也有切换入口。页面打印使用当前语言。

- scripts/math/english-{lessons,screen,time,families,training}.mjs：39 组逐步推导的英文。
- scripts/math/english-static.json：基础、主公式旁注、章节、导航等文字；短键为中文文本的 SHA-256 前 12 位。
- scripts/math/english-dynamic.json：像素实验的动态表格、分支状态与更新提示。
- scripts/math/i18n-build.mjs：按原始中文生成英语词典，构建时拒绝遗漏与推导步骤数量不一致。
- public/math/i18n.mjs：语言、阅读位置与状态保留。
- scripts/check-math-i18n.mjs：检查完整覆盖、英文残留中文和动态插值参数。

npm run qa:math 会在 artifacts/math/bilingual-catalog.json 输出中文/英文/短键对照，
便于定位 english-static.json 中的文字。public/math/en.mjs 与 en.json 均为生成文件。

双语验收（2026-09-18）：8 个页面的 1112 条静态文字与 51 条动态文字检查通过。
线上 Chrome 英文正文无漏译；39 组推导均有英文；公式与代码内容指纹保持一致。
桌面与 390px 视口无页面横向溢出；真实屏幕点击切换时同一公式位置误差约 0.17px。
SGD 后切换语言，中间值、loss、时间、像素与展开状态保持不变。
无语言参数的新页面和源码页继承已保存的偏好；显式 lang 参数可覆盖偏好。
记录见 artifacts/math/bilingual-checks.json。

## 验证

~~~powershell
npm run build:math
npm run qa:math
python scripts/check-mathml.py
python scripts/check-math-trace.py
cargo run --example native_smoke -- artifacts/math/two-splats.ply artifacts/math/cameras.json artifacts/math/native
~~~

最后一个 Python 检查需要 PyTorch；JS 检查先生成它需要的 JSON 案例。
原生 smoke 依赖可用 GPU，不是性能基准或逐像素 GPU 精度证明。

2026-09-18 验证：

- 原有 25 项数学数值检查通过。
- 59 项新增数值/源码检查通过，覆盖完整位置梯度、投影等价、
  local 与二次型等价、源码指纹及 PLY 的 little-endian float32 往返。
- 12 个独立 PyTorch float64 前向/自动微分案例通过，最大差值约 8.33e-17。
- 284 个 MathML 表达式结构有效；39 组公式均有完整讲解。
- 一步默认 SGD：MSE 0.0220156710 → 0.0217924220。
- 下载格式对应的两点 PLY 在 RTX 4090 / DX12 / StgPass 上成功渲染 t=0.1、0.5、0.9。
- 全项目 Rust 测试、WASM 检查/构建和静态资源检查通过。
- 线上 Chrome：公式跳转、39 组展开/收起、像素时间控制、一步 SGD 和梯度显示通过。
  桌面与 390px 视口无页面级横向溢出；长公式和表格在局部容器横向滚动。

主要限制：像素实验使用固定双 Gaussian 和固定目标颜色，不是真实多帧训练任务；
其 SGD 按钮不等于教学训练器的 Adam。WGSL 只有前向渲染，没有训练 backward；
toy trainer 固定旋转/尺度/时间核，没有 SfM、densification 或真实场景训练流水线。

## 球谐可视化扩展（2026-09-18）

入口：/math/#sh-lab；推导：#sh-derivation；重建对比：#sh-reconstruction；代码桥接：#sh-code。

- 原有 39 组 / 175 步保留；SH 另补六章、19 个推导步骤，以及训练梯度、存储接口和完整 16 项查表。
- 0–3 阶共 16 个可点击基函数；球面着色与半径表示绝对值的瓣状图；颜色编码正负。
- 方位角、极角、方向取反、最高阶、RGB 系数与四个例子联动；逐项显示 aY 贡献。
- 分开显示 raw sum、+0.5、下界 clamp 和屏幕 0–1 显示，不把官方 CUDA 的 lower clamp 误写为双边截断。
- 4096 个近似等面积方向投影同一合成亮斑，独立 2048 个方向验证 L=0/1/2/3 的 RMSE。
- 推导说明面积权重、正交、DC、一阶归一化、二阶五个图案及常数、Rodrigues、实 SH 约定、投影和梯度。
- 明确当前 STG-Lite 存直接 RGB；新 SH JavaScript 是教学求值器，WGSL 是接口示意，未声称已改变引擎外观格式。

维护文件：scripts/math/sh-content.mjs（中英成对内容），public/math/sh.mjs（纯数学），
public/math/sh-ui.mjs（交互和 Canvas），scripts/check-math-sh.mjs（独立数值验证）。

数值检查：142 个方向与独立关联 Legendre 递推比较，最大误差 6.66e-16；
32768 个球面样本验证 136 个 Gram 矩阵元素，最大误差 2.26e-6；
16 个系数梯度与有限差分比较，最大误差 9.68e-13；已知 SH 颜色函数投影恢复系数通过。
亮斑重建 RMSE 依次约 0.11002、0.08794、0.06093、0.03689；这是函数拟合指标，不是场景训练结果。
记录：artifacts/math/sh-checks.json。

全项目 npm run check 通过；383 个 MathML 表达式结构检查通过；1249 条静态双语消息完整覆盖。
线上浏览器验证：DC 方向不变性、奇数阶方向取反、系数编辑、clamp 分层数值、
中英切换保留系数与展开状态、英文动态文本无中文残留、390px 视口无整页横向溢出。
桌面/手机的瓣状图、球面图、低阶重建与公式排版已目视检查，控制台无错误。

### 2026-09-18：多角度 3D 图示

数学页的两张主图支持鼠标/触控拖动、方向键旋转、缩放滑块与 +/−，以及 Home 重置；预设正面 −Y、侧面 +X、顶部 +Z。左右图共享观察视角。下方五张重建球使用另一组联动视角，便于同角度对比。

`public/math/sh-view.mjs` 只变换图示相机：三维网格顶点、深度排序、轴和标记重新投影，SH 的世界方向与系数保持原样。`sh-ui.mjs` 将相机重绘与 SH 求值分开；仅旋转视图不会重新拟合重建系数，也不会改变整个球面的 RMSE。

`npm run build:math` 和 `npm run qa:math` 通过，包括轴向预设、极点有限性、正交投影保持长度、整圈旋转，以及既有 SH 数值检查；1259 条静态消息和 207 条补充翻译通过双语检查。线上浏览器拖动 k=7 后两图与坐标轴改变视角，基函数读数、输入方向和颜色结果均保持一致；重建切侧面后四个 RMSE 不变。顶部预设、键盘旋转/缩放、英文无遗留中文正文、390×844 布局无横向溢出已验证，控制台无错误。触屏手势复用 Pointer Events，未另做实体触屏设备验证。

发布版本：`f7aa2c66-b55d-43b2-8245-8836da8d3ec3`。

### 2026-09-18：RGB 分通道与合成

`#sh-channels` 将三个独立求和的 R / G / B 方向球与 RGB 合成球并排显示，和基函数图共用图示相机及方向标记。单通道可切换原色遮罩或统一灰度；全部采用固定 0–1 显示范围，没有分别归一化或附加光照。四球复用同一组方向颜色样本，避免分图计算产生差异；旋转只重新投影。

每个通道列出当前标记方向的 SH 求和、加 0.5 后的值与屏幕截断值；合成球给出相同三个数值和色块。系数滑块位于四球下方。说明区区分了基函数的正负伪彩色、每个通道自己的系数、所有启用基的求和，以及官方下界 clamp 和本页显示上界截断。中英文同步，默认英文。

`npm run build:math`、`npm run qa:math` 和 Wrangler dry-run 通过；新增 48 组不同最高阶、通道及基索引的系数隔离检查，包括被最高阶排除的项。1276 条静态消息及 226 条补充双语消息覆盖通过。线上将 k=6 的 R 系数由 −0.21 调至 0.19，R 显示值由 0.591 变为 0.654，G=0.432、B=0.229 保持不变；输入方向不变。灰度切换、联动键盘旋转、Home 复位、语言切换保留数值均验证通过。390×844 手机视口使用两列，中英文均无整页横向溢出，英文实验区无残留中文正文，控制台无错误；未另做实体触屏设备测试。

发布版本：`a920af0a-f425-4223-aa5e-9735431a4f40`。

### 逐步训练实验

入口：`/math/?view=training#training-lab`。手册的 `#pixel-lab` 同样包含此训练器；原有单像素实验被收进独立展开区，仍保留原来的状态和 PLY 下载功能，与新训练器的参数状态分开。

八步：读取固定样本、时间求值、相机投影、覆盖/排序/合成、MSE、反向传播、SGD 候选更新、应用更新并再次渲染。只有进入第八步才提交一次参数更新；从第八步回退恢复精确快照，重放不会重复累加。支持播放一轮、暂停、训练 50 轮（最多 500 轮）、学习率切换、重置、按时间/像素检查、实际源码展开和全宽布局。

模型范围：两个 STG-Lite Gaussian，一台固定相机，时间 0.25/0.5/0.75，各 12×10 像素裁剪区域，总共 360 个 RGB 样本。固定目标由预设 teacher 生成；训练仅更新 A 的 μ₀x、m₁x、opacity logit β。B、颜色、尺度、旋转与其余运动/时间字段保持固定。使用实际 CPU 双精度前向、解析梯度和 full-batch SGD，没有密度控制、真实拍摄重建或 SH 训练。梯度遵循当前可见性/阈值/排序分支，学习率过大可能增加损失。

`public/math/training.mjs` 复用 `trace.mjs`，后者新增可选目标颜色及跳过有限差分的选项，保留原 API 默认行为。batch 位置梯度包含屏幕中心与协方差两条路径；运动梯度再乘 Δt，并对全部像素平均。前后目标、预测、RMSE 热图、参数表、像素链式法则和损失曲线均来自实际计算。热图固定 RMSE 0–0.25 显示范围，数值 MSE 不缩放。

验证：`npm run build:math`、`npm run qa:math`、Wrangler dry-run 通过。新增三参数 full-batch 有限差分、目标固定、精确解零损失、只修改选定字段、同时更新、回退/重放/重置测试。最大梯度误差 7.71e-13；默认 η=5，50 次更新的 MSE 从 0.0040305949225 降至 0.0017945732461。1333 条静态消息（10 个页面）及 252 条补充翻译通过检查。

线上确认：前七小步不修改参数，第八步仅提交一次；回退后损失和历史恢复，重放得到相同结果。连续 50 轮与 Node 结果相同；自动逐步播放/暂停、切换时间帧、中文切换保留已完成的 50 轮。390×844 中英文无整页横向溢出，手机上目标/预测并排、误差图在下一行。全宽/手册布局切换保留状态，英文实验区无残留中文正文，控制台无错误。修正初始 hash 定位在其他模块完成布局后再次解析；未做实体触屏设备测试。

发布版本：`f24ef311-d177-440c-b45f-eee907f079b2`。
