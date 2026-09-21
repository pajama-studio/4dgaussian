import { formula as F } from './lesson-format.mjs';
export const traceContent = '<section class="math-section" id="pixel-lab"><p class="eyebrow">ONE RECORD → ONE PIXEL → ONE UPDATE</p><h2>从文件里的 32 个数，走到一次参数更新。</h2>' +
 '<!-- TRAINING LAB --><details class="foundation" id="single-pixel-reference"><summary>展开原有单像素实验与完整数值表</summary><div>' +
 '<p class="section-intro">这是可运行的双精度 CPU 教学算例。两颗 STG-Lite Gaussian、一个像素、已知相机、固定 RGB 目标。每次改动都会重新求时间、椭圆、覆盖、合成与梯度；它不是浏览器里的完整 GPU renderer。屏幕坐标向右、向下，深度向前。</p>' +
 '<div class="trace-controls"><label>模型时间 t <output id="trace-time-value">0.50</output><input id="trace-time" aria-label="模型时间 t" type="range" min="0" max="1" step="0.01" value="0.5"></label><label>像素横坐标 u <output id="trace-pixel-value">74.5</output><input id="trace-pixel" aria-label="像素横坐标 u" type="range" min="68.5" max="82.5" step="1" value="74.5"></label><label>对 A 的哪个参数求导？<select id="trace-parameter" aria-label="对 A 的哪个参数求导？"><option value="20">opacity logit β</option><option value="0">基准位置 μ₀x</option><option value="2">基准深度 μ₀z</option></select></label></div>' +
 '<p>相机 fx=fy=100，主点 (64,48)，画幅 128×96；像素纵坐标固定 68.5。世界到相机旋转为 I、平移为 0。背景 (0.04,0.05,0.08)，目标 (0.45,0.18,0.22)。更改时间和像素时目标保持固定，方便观察梯度；这不是一套多帧训练标签。</p>' +
 '<div class="trace-colors"><div><span>预测像素</span><i id="trace-swatch" aria-hidden="true"></i><output id="trace-color"></output></div><div><span>目标像素</span><i style="background:rgb(45% 18% 22%)" aria-hidden="true"></i><span>(0.45, 0.18, 0.22)</span></div><div><span>RGB MSE</span><strong id="trace-loss"></strong><span>对 3 个通道取平均</span></div></div>' +
 '<p class="trace-status" id="trace-message" role="status" aria-live="polite">正在计算初始例子…</p><div id="trace-output"></div>' +
 '<div class="trace-actions"><button type="button" id="trace-step">做一次 SGD 更新 · η=0.5</button><button type="button" id="trace-reset">恢复初始算例</button><button type="button" id="trace-download">下载当前 2 点 PLY</button></div>' +
 '<p>下载会把当前参数写成 <code>binary_little_endian</code>、32×float32 的真实 STG-Lite 记录；计算过程用 float64，导出时会有 float32 舍入。PLY 不含相机和时间单位，使用原生渲染器时仍需提供上面的相机约定。</p>' +
 '<details class="foundation"><summary>跟着一条数据记录检查内存布局与张量形状</summary><div>' +
 '<div class="table-wrap"><table><thead><tr><th>浮点索引 / 字节</th><th>PLY 字段</th><th>数学量</th><th>WGSL</th></tr></thead><tbody>' +
 [
 ['0–2 / 0–11','x,y,z','τ 时刻的 μ₀','r0.xyz'],
 ['3 / 12–15','trbf_center','τ','r0.w'],
 ['4 / 16–19','trbf_scale','ln ρ','r1.x'],
 ['5–7 / 20–31','nx,ny,nz','此模型布局占位，渲染不使用','r1.yzw'],
 ['8–16 / 32–67','motion_0..8','m₁,m₂,m₃，各 3 个数','r2,r3,r4.x 跨行重组'],
 ['17–19 / 68–79','f_dc_0..2','已激活的直接 RGB','r4.yzw'],
 ['20 / 80–83','opacity','β，未激活 logit','r5.x'],
 ['21–23 / 84–95','scale_0..2','ln s₁,ln s₂,ln s₃','r5.yzw'],
 ['24–27 / 96–111','rot_0..3','q₀，wxyz','r6'],
 ['28–31 / 112–127','omega_0..3','四维系数 ω','r7'],
 ].map(cells=>'<tr>'+cells.map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('') +
 '</tbody></table></div><p>一个记录 128 字节，恰好对应 8 个 vec4。CPU 只读取排序需要的中心、运动和 opacity；GPU storage buffer 保留整条记录，instance index 决定当前画哪条。</p>' +
 '<p>教学 PyTorch：B=相机/时间组合数，N=Gaussian 数。xyz: [B,N,3]；uv: [B,N,2]；J: [B,N,2,3]；C: [B,N,2,2]；delta: [B,N,H,W,2]；alpha/T: [B,N,H,W]；color: [B,N,3]；输出图像: [B,H,W,3]。None 增加可广播维度，sum(1) 沿 Gaussian 维合成。</p></div></details>' +
 '<details class="foundation"><summary>从教学算例继续到真正的训练 → 导出 → Rust/wgpu</summary><div><ol class="exercise-list"><li>用 <code>python scripts/train_toy_stg.py --steps 400 --device cuda</code> 跑合成多相机训练；无 CUDA 时使用 <code>--device cpu</code>。需要 torch 与 numpy。它学习 mean、linear motion、RGB logits、opacity logits，固定尺度、旋转和时间核。</li><li><code>loss.backward()</code> 把 RGB 误差经合成、Gaussian、相机和时间路径传给这四组参数。输出在 <code>artifacts/toy-training/</code>，其中 PLY 的 RGB 已 sigmoid，opacity 仍为 logit。</li><li>原生宿主读取 PLY，调用 <code>StgPass::prepare</code> 提供 V、P、viewport 和归一化 t；CPU 求值后从远到近排序，把索引传给 GPU。</li><li>每实例画 6 个顶点组成的 quad；vertex 算当前椭圆；fragment 求权重；固定混合单元做预乘 over。当前引擎没有反向传播 kernel，训练在 PyTorch 侧完成。</li><li>把真实拍摄数据接进来，还需相机标定/位姿、统一时间、初始化、训练采样、密度控制与评估。这个五点合成训练器没有包含这些步骤；完整路线见 <a href="/docs/">Field Guide</a>。</li></ol>' +
 '<p>实际优化器 Adam 把梯度 g 的历史平均 m 和平方平均 v 结合，使用每个参数自己的步长。它是优化算法的设计选择，不是 Gaussian 渲染公式的必然结论；本页按钮用 SGD 以便每个数字都能手算。</p>' +
 F("m_k=\\beta_1m_{k-1}+(1-\\beta_1)g_k,\\quad v_k=\\beta_2v_{k-1}+(1-\\beta_2)g_k^2") +
 F("\\widehat m_k=\\frac{m_k}{1-\\beta_1^k},\\quad \\widehat v_k=\\frac{v_k}{1-\\beta_2^k},\\quad \\theta_k=\\theta_{k-1}-\\eta\\frac{\\widehat m_k}{\\sqrt{\\widehat v_k}+\\epsilon}") +
 '<p>平方、开方、除法逐参数进行。若梯度恒为 g、m₀=0，展开递推是 (1−β₁)(1+β₁+…+β₁^(k−1))g=(1−β₁^k)g，所以除以 1−β₁^k 消掉从零开始的偏差；v 同理。这里 β₁、β₂ 是 Adam 的衰减系数，与 opacity logit β 无关。</p>' +
 '<p>下载并独立运行：<a href="/math/trace.mjs" download>像素前向与解析梯度</a> · <a href="/math/reference.mjs" download>其他方法的教学函数</a> · <a href="/math/code/scripts-train_toy_stg.py.html">完整 toy trainer</a> · <a href="/math/source-manifest.json">源码指纹</a>。</p></div></details></div></details></section>';
