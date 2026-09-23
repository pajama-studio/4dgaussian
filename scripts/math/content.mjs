import { row as r, id as i, num as n, op as o, txt, sub as s, sup as p, frac as f, par, norm, fn, matrix as mat, align, sum, prod, integral, exp, sqrt, eq, plus, minus, trans as T, inv, partial, derivative, math, accent } from './notation.mjs';

import { shContent } from './sh-content.mjs';

const b = name => i(name, true);
const at = (x, t = i('t')) => r(x, par(t));
const sq = x => p(x, n(2));
const neg = x => r(minus, x);
const half = f(n(1), n(2));
const comma = o(',');
const mu = b('μ'), S = b('Σ'), R = b('R'), I = b('I'), J = b('J');
const x = i('x'), y = i('y'), z = i('z'), t = i('t'), dt = r(i('Δ'), t);
const fx = s(i('f'), x), fy = s(i('f'), y), mu2 = s(mu, txt('2D')), Sc = s(S, i('c')), C = b('C'), Q = b('Q'), d = b('d');
const idx = i('i'), j = i('j'), k = i('k'), N = i('N');
const ai = s(i('α'), idx), Ti = s(i('T'), idx), ci = s(b('c'), idx);
const rho = i('ρ'), tau = i('τ'), beta = i('β'), q = b('q'), h = b('h');
const ptxt = text => '<p>' + text + '</p>';
const aside = (title, text) => '<aside class="note"><strong>' + title + '</strong><p>' + text + '</p></aside>';
const E = (id, title, latex, body, note = '') => ({ id, title, latex, body, note });
const m = value => math(value);
const src = (href, label) => ({ href, label });
const gs = src('https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/', '3DGS · Kerbl et al., 2023');
const stg = src('https://arxiv.org/html/2312.16812v2#S4.SS1', 'STG · §4.1');
const shader = src('/math/code/src-splat.wgsl.html', '本次部署源码 · splat.wgsl');
const four = src('https://arxiv.org/html/2310.10642v3#S3.SS2', 'Native 4DGS · Yang et al., 2024');
const deform = src('https://arxiv.org/html/2310.08528v3#S4.SS2', 'Deformation 4D-GS · Wu et al., 2024');

export const sections = [
{
  id: 'notation', number: '00', label: '符号与学习顺序', eyebrow: 'READ THIS FIRST', title: '先约定符号，再推公式。', priority: '基础',
  intro: '空间用三维列向量，时间用独立的标量。先理解共同的投影与合成，再选择具体动态表示。',
  blocks: [
    '<div class="symbol-grid">' + [
      [m(at(mu)), '世界坐标中的 Gaussian 中心，3×1'],
      [m(at(S)), '空间协方差，3×3；单位是长度平方'],
      [m(C), '屏幕协方差，2×2；单位是像素平方'],
      [m(r(t, comma, tau, comma, rho)), '归一化时间、时间中心、时间核宽度'],
      [m(r(ai, comma, Ti)), '像素处 alpha、到达该层前的透射率'],
      [m(r(R, comma, J)), '旋转/线性变换、投影 Jacobian'],
    ].map(([symbol, text]) => '<div><span>' + symbol + '</span><p>' + text + '</p></div>').join('') + '</div>',
    '<ol class="reading-path"><li>参数与协方差</li><li>相机与投影</li><li>椭圆与合成</li><li>时间与运动</li><li>损失与梯度</li></ol>',
    aside('“4DGS”是方法族', 'STG-Lite 用时间核与运动多项式；形变网络预测随时间变化的三维参数；原生四维高斯对联合时空分布做条件化。下文分别标注，不能把三者的参数文件或公式直接互换。'),
  ], refs: [stg, deform, four]
},
{
  id: 'gaussian', number: '01', label: '高斯、尺度与旋转', eyebrow: 'THE PRIMITIVE', title: '用协方差描述一个椭球。', priority: '必会',
  intro: '中心决定位置，协方差决定形状与方向，不透明度决定该基函数对图像的贡献。',
  blocks: [
    E('kernel', '三维 Gaussian 核', 'G(\\mathbf{x})=\\exp\\!\\left[-\\frac12(\\mathbf{x}-\\boldsymbol\\mu)^T\\boldsymbol\\Sigma^{-1}(\\mathbf{x}-\\boldsymbol\\mu)\\right]',
      r(at(i('G'), b('x')), eq, exp(neg(r(half, T(par(r(b('x'), minus, mu))), inv(S), par(r(b('x'), minus, mu)))))),
      '这里是未归一化的核，不是概率密度。Splat 的 opacity 单独学习，不能额外乘概率密度归一化系数后仍期待相同亮度。'),
    E('activation', '存储参数 → 有效参数', 's_k=e^{\\ell_k},\\qquad o=\\operatorname{sigmoid}(\\beta)=\\frac1{1+e^{-\\beta}}',
      align([[s(i('s'), k), eq, exp(s(i('ℓ'), k))], [i('o'), eq, r(fn('sigmoid', beta), eq, f(n(1), r(n(1), plus, exp(neg(beta)))))]]),
      'log-scale 保证理论尺度为正；sigmoid 将基准 opacity 映射到 0–1。实际实现仍需防止溢出与下溢。'),
    E('covariance', '协方差的安全参数化', '\\boldsymbol\\Sigma=\\mathbf R\\operatorname{diag}(s_1^2,s_2^2,s_3^2)\\mathbf R^T=\\sum_{k=1}^{3}\\mathbf a_k\\mathbf a_k^T,\\quad\\mathbf a_k=s_k\\mathbf r_k',
      align([[S, eq, r(R, fn('diag', r(sq(s(i('s'), n(1))), comma, sq(s(i('s'), n(2))), comma, sq(s(i('s'), n(3))))), T(R))],
        [S, eq, sum(r(k, eq, n(1)), n(3), r(s(b('a'), k), T(s(b('a'), k))))],
        [s(b('a'), k), eq, r(s(i('s'), k), s(b('r'), k))]]),
      'rₖ 是旋转矩阵的第 k 列。正尺度时 Σ 正定；轴向量外积求和与矩阵乘法等价，适合直接写进 shader。'),
    E('quaternion', '单位四元数与旋转矩阵', '\\hat q=(w,x,y,z),\\quad\\|\\hat q\\|=1,\\quad R(\\hat q)=\\begin{bmatrix}1-2(y^2+z^2)&2(xy-wz)&2(xz+wy)\\\\2(xy+wz)&1-2(x^2+z^2)&2(yz-wx)\\\\2(xz-wy)&2(yz+wx)&1-2(x^2+y^2)\\end{bmatrix}',
      r(at(R, q), eq, mat([
        [r(n(1), minus, n(2), par(r(sq(y), plus, sq(z)))), r(n(2), par(r(x,y,minus,i('w'),z))), r(n(2),par(r(x,z,plus,i('w'),y)))],
        [r(n(2),par(r(x,y,plus,i('w'),z))), r(n(1),minus,n(2),par(r(sq(x),plus,sq(z)))), r(n(2),par(r(y,z,minus,i('w'),x)))],
        [r(n(2),par(r(x,z,minus,i('w'),y))), r(n(2),par(r(y,z,plus,i('w'),x))), r(n(1),minus,n(2),par(r(sq(x),plus,sq(y))))]
      ])),
      '这里采用 q=(w,x,y,z)、右手系、主动旋转与列向量，且 ‖q‖=1。内存中的行/列布局和参考实现可能采用转置约定；最终应比较轴向量和 Σ，而非只比较名为 R 的数组。'),
    aside('代码对应', 'src/splat.wgsl → quaternion、axis0/1/2。当前 renderer 通过三个轴的外积构建协方差；不要仅因注释里的转置就改变矩阵。'),
  ], refs: [gs, shader]
},
{
  id: 'projection', number: '02', label: '相机、Jacobian 与投影', eyebrow: 'WORLD → CAMERA → PIXELS', title: '把三维不确定性投影到屏幕。', priority: '必推',
  intro: '本节推导采用 OpenCV 风格相机轴：x 向右、y 向下、z 向前。与 wgpu 的视图和裁剪空间衔接时，需要显式处理轴向和投影约定。',
  blocks: [
    E('camera', '世界 → 相机', '\\mathbf x_c=\\mathbf R_{cw}\\mathbf x_w+\\mathbf t_{cw},\\qquad \\mathbf C_w=-\\mathbf R_{cw}^{T}\\mathbf t_{cw}',
      align([[s(b('x'), i('c')), eq, r(s(R, txt('cw')), s(b('x'),i('w')), plus, s(b('t'),txt('cw')))],
        [s(b('C'),i('w')), eq, neg(r(T(s(R,txt('cw'))),s(b('t'),txt('cw'))))]]),
      '下标 cw 明确表示 world→camera。相机中心不是平移项 t；camera→world 位姿需要先求逆。'),
    E('pinhole', '针孔投影', '\\pi(x,y,z)=\\begin{bmatrix}f_xx/z+c_x\\\\f_yy/z+c_y\\end{bmatrix},\\qquad z>0',
      r(fn('π',r(x,comma,y,comma,z)),eq,mat([[r(f(r(fx,x),z),plus,s(i('c'),x))],[r(f(r(fy,y),z),plus,s(i('c'),y))]]),o(','),z,o('>'),n(0)),
      'fx、fy 是像素单位焦距；cx、cy 是主点。此处忽略镜头畸变，标定与缩放后的图像内参必须一致。'),
    E('jacobian', '对投影求偏导', '\\mathbf J=\\frac{\\partial\\pi}{\\partial\\mathbf x_c}=\\begin{bmatrix}f_x/z&0&-f_xx/z^2\\\\0&f_y/z&-f_yy/z^2\\end{bmatrix}',
      r(J,eq,partial(i('π'),s(b('x'),i('c'))),eq,mat([[f(fx,z),n(0),neg(f(r(fx,x),sq(z)))],[n(0),f(fy,z),neg(f(r(fy,y),sq(z)))]]))),
    E('covariance-proof', '先证明线性变换的协方差', '\\mathbf Y=\\mathbf A\\mathbf X+\\mathbf b\\ \\Longrightarrow\\ \\operatorname{Cov}(\\mathbf Y)=\\mathbb E[\\mathbf A(\\mathbf X-\\boldsymbol\\mu)(\\mathbf X-\\boldsymbol\\mu)^T\\mathbf A^T]=\\mathbf A\\boldsymbol\\Sigma\\mathbf A^T',
      align([[b('Y'),eq,r(b('A'),b('X'),plus,b('b'))],[fn('Cov',b('Y')),eq,r(b('A'),S,T(b('A')))]]),
      '由 Y−E[Y]=A(X−μ)，再对外积取期望得到。平移消去，因此不影响协方差。'),
    E('projected-covariance', '一阶线性化与屏幕协方差', '\\pi(\\mathbf X)\\approx\\pi(\\boldsymbol\\mu_c)+\\mathbf J(\\mathbf X-\\boldsymbol\\mu_c),\\quad \\mathbf C=\\mathbf J\\mathbf R_{cw}\\boldsymbol\\Sigma\\mathbf R_{cw}^T\\mathbf J^T+\\varepsilon\\mathbf I_2',
      align([[fn('π',b('X')),o('≈'),r(fn('π',s(mu,i('c'))),plus,J,par(r(b('X'),minus,s(mu,i('c')))))],
        [Sc,eq,r(s(R,txt('cw')),S,T(s(R,txt('cw'))))],
        [C,eq,r(J,Sc,T(J),plus,i('ε'),s(I,n(2)))]]),
      'J 在 Gaussian 中心处求值。ε 是像素方差；当前 shader 使用 0.3。透视是非线性的，所以这是一阶近似，不是任意透视变换都精确保留 Gaussian。'),
    E('homogeneous-derivative', '与 WGSL 对齐的齐次坐标导数', 'D\\!\\left(\\frac{\\mathbf h_{xy}}{h_w}\\right)[\\delta\\mathbf h]=\\frac{\\delta\\mathbf h_{xy}h_w-\\mathbf h_{xy}\\delta h_w}{h_w^2}',
      r(fn('D',f(s(h,txt('xy')),s(h,i('w')))),par(r(i('δ'),h)),eq,f(r(i('δ'),s(h,txt('xy')),s(h,i('w')),minus,s(h,txt('xy')),i('δ'),s(h,i('w'))),sq(s(h,i('w'))))),
      'h=PV[μ,1]ᵀ，δh=PV[aₖ,0]ᵀ。将导数按 viewport 尺寸换成像素，再对三条投影轴做外积求和。这个形式把视图坐标的符号差异包含在 P、V 中。'),
    '<div class="worked"><span>手算检查</span><p>fx=fy=100，中心为 (1,2,10)，Σc=diag(1,4,9)：</p>' +
      m(r(J,eq,mat([[n(10),n(0),n(-1)],[n(0),n(10),n(-2)]]))) +
      m(r(C,eq,mat([[n(109.3),n(18)],[n(18),n(436.3)]]))) +
      '<p>非零的交叉项来自离轴投影。即使三维协方差是对角矩阵，投影椭圆也可能发生旋转。</p></div>',
  ], refs: [gs, shader, src('https://colmap.github.io/format.html#images-txt', 'COLMAP · 相机坐标约定')]
},
{
  id: 'ellipse', number: '03', label: '屏幕椭圆与覆盖', eyebrow: 'THE SCREEN FOOTPRINT', title: '从协方差到一个像素的权重。', priority: '必会',
  intro: '协方差告诉我们形状；逆协方差定义到中心的“加权距离”。',
  blocks: [
    E('conic', '2×2 协方差的逆', '\\mathbf C=\\begin{bmatrix}a&b\\\\b&c\\end{bmatrix},\\quad \\mathbf Q=\\mathbf C^{-1}=\\frac1{ac-b^2}\\begin{bmatrix}c&-b\\\\-b&a\\end{bmatrix}',
      align([[C,eq,mat([[i('a'),i('b')],[i('b'),i('c')]])],[Q,eq,r(inv(C),eq,f(n(1),r(i('a'),i('c'),minus,sq(i('b')))),mat([[i('c'),neg(i('b'))],[neg(i('b')),i('a')]]))]]),
      '正定要求 a>0、ac−b²>0。接近奇异时，逆矩阵会放大误差；需要与 renderer 一致的滤波和数值下限。'),
    E('pixel-weight', 'Mahalanobis 距离与像素 alpha', '\\mathbf d=\\mathbf p-\\boldsymbol\\mu_{2D},\\quad r^2=\\mathbf d^T\\mathbf Q\\mathbf d,\\quad\\alpha(\\mathbf p,t)=o(t)e^{-r^2/2}',
      align([[d,eq,r(b('p'),minus,mu2)],[sq(i('r')),eq,r(T(d),Q,d)],[at(i('α'),r(b('p'),comma,t)),eq,r(at(i('o')),exp(neg(f(sq(i('r')),n(2)))))] ]),
      '空间核指数含 1/2。当前 fragment shader 另做 alpha≤0.99 和 alpha<1/255 的丢弃；以下训练推导先忽略这些分段操作。'),
    E('eigenvalues', '椭圆主轴与标准差', '\\lambda_\\pm=\\frac{a+c\\pm\\sqrt{(a-c)^2+4b^2}}2,\\qquad r_\\pm=k\\sqrt{\\lambda_\\pm}',
      align([[s(i('λ'),o('±')),eq,f(r(i('a'),plus,i('c'),o('±'),sqrt(r(sq(par(r(i('a'),minus,i('c')))),plus,n(4),sq(i('b'))))),n(2))],
        [s(i('r'),o('±')),eq,r(k,sqrt(s(i('λ'),o('±'))))]]),
      '特征向量是主轴方向，√λ 是对应方向的像素标准差。k=3 给出常用的 3σ 覆盖；当前实现对 sigma 额外设了 192px 上限。'),
    E('support', '由 alpha 阈值推覆盖范围', 'o(t)e^{-r^2/2}\\ge\\alpha_{\\min}\\ \\Longrightarrow\\ r^2\\le2\\log\\frac{o(t)}{\\alpha_{\\min}}',
      r(sq(i('r')),o('≤'),n(2),fn('log',f(at(i('o')),s(i('α'),txt('min'))))),
      '仅在 o(t)≥αmin 时有非空范围。固定 3σ quad 与阈值支持集不完全相同；“Gaussian 理论无限支持”与有限 GPU footprint 需要区分。'),
  ], refs: [gs, shader]
},
{
  id: 'compositing', number: '04', label: 'Alpha 与体渲染', eyebrow: 'ORDER MATTERS', title: '为什么透明度必须按顺序合成。', priority: '必推',
  intro: '下式按近→远排列。颜色与 alpha 的贡献受前面所有层的透射率影响。',
  blocks: [
    E('transmittance', '前向透射率', 'T_i=\\prod_{j<i}(1-\\alpha_j),\\qquad T_1=1',
      r(Ti,eq,prod(r(j,o('<'),idx),txt(''),par(r(n(1),minus,s(i('α'),j)))),comma,s(i('T'),n(1)),eq,n(1))),
    E('composite', '最终像素颜色，包含背景', '\\mathbf C_{pixel}=\\sum_{i=1}^{N}T_i\\alpha_i\\mathbf c_i+T_{N+1}\\mathbf c_{bg}',
      r(s(b('C'),txt('pixel')),eq,sum(r(idx,eq,n(1)),N,r(Ti,ai,ci)),plus,s(i('T'),r(N,plus,n(1))),s(b('c'),txt('bg')))),
    E('premultiplied', '远→近的预乘 over 操作', '\\widetilde{\\mathbf c}_{out}=\\alpha_s\\mathbf c_s+(1-\\alpha_s)\\widetilde{\\mathbf c}_{dst}',
      r(s(accent(b('c'), '~'),txt('out')),eq,s(i('α'),i('s')),s(b('c'),i('s')),plus,par(r(n(1),minus,s(i('α'),i('s')))),s(accent(b('c'), '~'),txt('dst'))),
      'graphics pipeline 使用远→近顺序时，shader 输出 RGB×alpha，再配置 premultiplied blending。重复乘 SrcAlpha 会让颜色额外变暗。'),
    '<div class="blend-demo"><div class="blend-swatch red-front"><span>红在前</span><strong>(0.50, 0, 0.25)</strong></div><div class="blend-swatch blue-front"><span>蓝在前</span><strong>(0.25, 0, 0.50)</strong></div></div>' +
      ptxt('红、蓝两层 alpha 都为 0.5，背景为黑。交换顺序改变结果，所以普通 atomic-add 不能代替有序透明合成。'),
    E('volume-bridge', '与体渲染的联系', 'T(s)=\\exp\\!\\left[-\\int_{s_0}^{s}\\sigma(u)\\,du\\right],\\qquad\\alpha_i=1-e^{-\\sigma_i\\Delta s_i}',
      align([[at(i('T'),i('s')),eq,exp(neg(integral(s(i('s'),n(0)),i('s'),r(at(i('σ'),i('u')),i('d'),i('u')))))],
        [ai,eq,r(n(1),minus,exp(neg(r(s(i('σ'),idx),o('Δ'),s(i('s'),idx)))))]]),
      '第二式来自分段恒定密度的射线积分，帮助理解 transmittance。3DGS 通常直接学习 opacity 并评估投影核，不能把它说成对每个三维 Gaussian 都做了精确物理射线积分。'),
    aside('排序边界', '全局中心深度与 tile 内排序可以使用相同的中心深度 key。Tile 分桶降低遍历成本，但不会自动解决相交 Gaussian 的精确逐像素遮挡。'),
  ], refs: [gs, src('https://www.matthewtancik.com/nerf', 'NeRF · 体渲染背景')]
},
{
  id: 'stg', number: '05', label: 'STG 的时间与运动', eyebrow: 'THIS VIEWER · STG-LITE', title: '让位置、旋转和可见性随时间变化。', priority: '项目核心',
  intro: '下面采用本项目 PLY/WGSL 的实际参数化。归一化时间 t 不自动等于物理秒。',
  blocks: [
    E('time-domain', '物理秒与模型时间', 't=\\frac{s-s_0}{D},\\qquad \\Delta t=t-\\tau',
      align([[t,eq,f(r(i('s'),minus,s(i('s'),n(0))),i('D'))],[dt,eq,r(t,minus,tau)]]),
      'D 是有来源的时间尺度。例如 loader 使用 frame/N 时，通常需与 N/fps 对齐，而不是擅自换成最后一帧时间。当前研究模型 PLY 不携带 fps/时长；已追溯官方 50 帧训练配置，Sear 播放器采用 D=50/30 秒。'),
    E('temporal-rbf', 'STG-Lite 的时间核', '\\rho=e^{\\ell_\\tau},\\quad w(t)=\\exp\\!\\left[-\\left(\\frac{t-\\tau}{\\rho}\\right)^2\\right],\\quad o(t)=\\operatorname{sigmoid}(\\beta)w(t)',
      align([[rho,eq,exp(s(i('ℓ'),tau))],[at(i('w')),eq,exp(neg(sq(par(f(dt,rho)))))],[at(i('o')),eq,r(fn('sigmoid',beta),at(i('w')))]]),
      '注意指数没有 1/2。若用标准 Gaussian 的标准差 σt 表示同一核，则 σt=ρ/√2。论文写 exp(−sτ·Δt²)，这里 sτ=ρ⁻²；代码对 ρ 还有最小值保护。'),
    E('trajectory', '三次运动轨迹', '\\boldsymbol\\mu(t)=\\boldsymbol\\mu_0+\\mathbf m_1\\Delta t+\\mathbf m_2\\Delta t^2+\\mathbf m_3\\Delta t^3',
      r(at(mu),eq,s(mu,n(0)),plus,s(b('m'),n(1)),dt,plus,s(b('m'),n(2)),sq(dt),plus,s(b('m'),n(3)),p(dt,n(3)))),
    E('velocity', '速度取决于时间单位', '\\frac{d\\boldsymbol\\mu}{dt}=\\mathbf m_1+2\\mathbf m_2\\Delta t+3\\mathbf m_3\\Delta t^2,\\qquad\\frac{d\\boldsymbol\\mu}{ds}=\\frac1D\\frac{d\\boldsymbol\\mu}{dt}',
      align([[derivative(mu,t),eq,r(s(b('m'),n(1)),plus,n(2),s(b('m'),n(2)),dt,plus,n(3),s(b('m'),n(3)),sq(dt))],
        [derivative(mu,i('s')),eq,r(f(n(1),i('D')),derivative(mu,t))]]),
      'm₁ 是相对模型时间的系数；只有空间单位与 D 都明确后，才能解释为米/秒。改变归一化规则时，多项式系数也必须对应变换。'),
    E('rotation-time', '四元数的一阶时间模型', '\\mathbf u(t)=\\mathbf q_0+\\Delta t\\boldsymbol\\omega,\\qquad \\mathbf q(t)=\\frac{\\mathbf u(t)}{\\|\\mathbf u(t)\\|}',
      align([[at(b('u')),eq,r(s(q,n(0)),plus,dt,b('ω'))],[at(q),eq,f(at(b('u')),norm(at(b('u'))))]]),
      'q₀ 与 ω 均为四维系数，且需 u(t)≠0。这里 ω 不是刚体公式中的三维角速度；该模型也不是一般意义上的 SLERP。'),
    E('normalization-gradient', '归一化的 Jacobian', '\\frac{\\partial\\mathbf q}{\\partial\\mathbf u}=\\frac{\\mathbf I_4-\\mathbf q\\mathbf q^T}{\\|\\mathbf u\\|},\\qquad\\frac{d\\mathbf q}{dt}=\\frac{\\mathbf I_4-\\mathbf q\\mathbf q^T}{\\|\\mathbf u\\|}\\boldsymbol\\omega',
      align([[partial(q,b('u')),eq,f(r(s(I,n(4)),minus,q,T(q)),norm(b('u')))],
        [derivative(q,t),eq,r(partial(q,b('u')),b('ω'))]]),
      '归一化会去掉沿 q 自身方向的变化分量；分母接近零时梯度不稳定。不要跳过零范数与有限值检查。'),
    '<div class="time-lab" id="time-lab"><div class="lab-copy"><span class="eyebrow">动一下，观察公式</span><h3>同一条轨迹，不同的时间权重</h3><p>这是二维示意：标记沿三次轨迹移动，亮度随时间核变化；不是完整的训练或 rasterizer。</p><div class="lab-controls"><label>时间 t <output id="time-value">0.50</output><input id="time-slider" type="range" min="0" max="1" step="0.01" value="0.5"></label><label>宽度 ρ <output id="width-value">0.22</output><input id="width-slider" type="range" min="0.05" max="0.6" step="0.01" value="0.22"></label></div><p class="lab-result">时间权重 w(t) = <strong id="weight-value">1.0000</strong></p></div><svg id="time-plot" viewBox="0 0 520 290" role="img" aria-label="三次运动轨迹与时间权重示意"><defs><radialGradient id="splat-glow"><stop stop-color="#c4db22" stop-opacity=".85"/><stop offset="1" stop-color="#c4db22" stop-opacity="0"/></radialGradient></defs><path d="M30 250H495 M45 270V25" class="plot-axis"/><path id="motion-path" class="motion-path"/><circle id="motion-glow" r="35" fill="url(#splat-glow)"/><circle id="motion-dot" r="5" fill="#d5ec44"/><text x="468" y="278">x(t)</text><text x="13" y="25">y(t)</text><text x="62" y="278">τ = 0.5</text></svg></div>',
  ], refs: [stg, shader, src('https://github.com/oppo-us-research/SpacetimeGaussians/blob/main/thirdparty/gaussian_splatting/scene/ourslite.py', '官方 Lite 参数与激活')]
},
{
  id: 'families', number: '06', label: '形变网络与四维条件化', eyebrow: 'TWO OTHER FORMULATIONS', title: '“加上时间”，还有不同的数学方式。', priority: '理解差异',
  intro: '下面两种表示用于比较；当前 STG-Lite viewer 没有实现这两套 decoder。',
  blocks: [
    '<h3>形变网络：由规范空间预测动态参数</h3>',
    E('deformation', '参数形变的概念接口', '\\Delta\\mathcal G_i(t)=\\mathcal F_\\theta(\\mathcal G_i^0,t),\\qquad \\mathcal G_i(t)=\\operatorname{Decode}(\\mathcal G_i^0,\\Delta\\mathcal G_i(t))',
      align([[at(s(b('ΔG'),idx)),eq,at(s(b('F'),i('θ')),r(p(s(b('G'),idx),n(0)),comma,t))],
        [at(s(b('G'),idx)),eq,fn('Decode',r(p(s(b('G'),idx),n(0)),comma,at(s(b('ΔG'),idx))))]]),
      '这是方法族的接口表示。Wu et al. 使用时空特征编码与 deformation decoder；平移、尺度、旋转各 head 的增量域和激活规则必须按实现核对。'),
    '<h3>原生 4D Gaussian：联合分布 → 固定时刻的 3D 切片</h3>',
    E('four-dimensional', '四维联合协方差的分块', '\\mathbf z=\\begin{bmatrix}\\mathbf x\\\\t\\end{bmatrix},\\quad\\boldsymbol\\mu_4=\\begin{bmatrix}\\boldsymbol\\mu_x\\\\\\mu_t\\end{bmatrix},\\quad\\boldsymbol\\Sigma_4=\\begin{bmatrix}\\mathbf A&\\mathbf b\\\\\\mathbf b^T&c\\end{bmatrix}\\succ0',
      r(s(S,n(4)),eq,mat([[b('A'),b('b')],[T(b('b')),i('c')]]),o('≻'),n(0)),
      'z=[xᵀ,t]ᵀ；均值 μ₄=[μxᵀ,μt]ᵀ。A 为 3×3 空间块，b 为 3×1 时空交叉项，c>0 为时间方差。四维旋转不等于一个三维四元数。'),
    E('conditional', '条件 Gaussian：均值与 Schur 补', '\\boldsymbol\\mu_{x\\mid t}=\\boldsymbol\\mu_x+\\mathbf b c^{-1}(t-\\mu_t),\\qquad\\boldsymbol\\Sigma_{x\\mid t}=\\mathbf A-\\mathbf b c^{-1}\\mathbf b^T',
      align([[s(mu,txt('x|t')),eq,r(s(mu,x),plus,b('b'),inv(i('c')),par(r(t,minus,s(i('μ'),t))))],
        [s(S,txt('x|t')),eq,r(b('A'),minus,b('b'),inv(i('c')),T(b('b')))]]),
      '第一式让空间中心随时间线性移动；第二式是条件协方差，不是直接拿 A。对单个固定的联合 Gaussian，条件协方差不随 t 变化。'),
    E('four-factorization', '空间条件核 × 时间边缘核', 'G_4(\\mathbf x,t)=G_{x\\mid t}(\\mathbf x)\\,\\exp\\!\\left[-\\frac{(t-\\mu_t)^2}{2c}\\right]',
      r(at(s(i('G'),n(4)),r(b('x'),comma,t)),eq,at(s(i('G'),txt('x|t')),b('x')),exp(neg(f(sq(par(r(t,minus,s(i('μ'),t)))),r(n(2),i('c')))))),
      '对二次型配方即可得到。这里均指未归一化核；时间边缘项必须保留，决定该 primitive 在该时刻的权重。条件化后再走三维投影与合成。'),
    E('conditional-example', '一个可手算的条件化例子', '\\mathbf A=\\operatorname{diag}(2,1,1),\\quad\\mathbf b=(1,0,0)^T,\\quad c=1\\ \\Longrightarrow\\ \\boldsymbol\\Sigma_{x\\mid t}=\\mathbf I_3',
      r(b('A'),eq,fn('diag',r(n(2),comma,n(1),comma,n(1))),comma,b('b'),eq,T(par(r(n(1),comma,n(0),comma,n(0)))),comma,i('c'),eq,n(1),o('⇒'),s(S,txt('x|t')),eq,s(I,n(3))),
      '设 μ₄=0，条件中心是 (t,0,0)，时间权重是 exp(−t²/2)。时空相关性 b 编码了这个简单运动。'),
    aside('三种时间模型的区别', 'STG 的三次中心轨迹和旋转变化，不等于对单个四维 Gaussian 条件化得到的线性中心与恒定条件协方差。形变网络则额外依赖其特征场和网络权重。'),
  ], refs: [deform, four, src('https://arxiv.org/html/2310.10642v3#A2', 'Native 4DGS · 公式证明')]
},
{
  id: 'appearance', number: '07', label: '颜色、SH 与特征', eyebrow: 'APPEARANCE ≠ GEOMETRY', title: '几何决定覆盖，外观决定颜色。', priority: '理解',
  intro: '不同 Gaussian 方法存储的颜色信息不同。相同字段名不一定有相同激活方式。',
  blocks: [
    E('spherical-harmonics', '静态 3DGS 常用的方向外观', '\\mathbf c_i(\\mathbf v)=\\sum_{\\ell=0}^{L}\\sum_{m=-\\ell}^{\\ell}\\mathbf a_{i\\ell m}Y_{\\ell m}(\\mathbf v)',
      r(at(ci,b('v')),eq,sum(r(i('ℓ'),eq,n(0)),i('L'),sum(r(i('m'),eq,neg(i('ℓ'))),i('ℓ'),r(s(b('a'),r(idx,i('ℓ'),i('m'))),at(s(i('Y'),r(i('ℓ'),i('m'))),b('v')))))),
      'Yℓm 为球谐基，a 为 RGB 系数；v 必须是按实现约定的单位观察方向。不要把这条外观函数理解成可重光照的材质。'),
    shContent,
    E('feature-splatting', '先合成特征，再解码', '\\mathbf F(\\mathbf p,t)=\\sum_iT_i\\alpha_i\\mathbf f_i(t),\\qquad\\mathbf C=\\mathcal D_\\theta(\\mathbf F,\\text{view inputs})',
      align([[at(b('F'),r(b('p'),comma,t)),eq,sum(idx,txt(''),r(Ti,ai,at(s(b('f'),idx))))],
        [b('C'),eq,at(s(b('D'),i('θ')),r(b('F'),comma,txt('view inputs')))]]),
      '这是 STG 完整版特征渲染的概念式；特征组成与 decoder 输入要跟源码核对。当前 Lite 使用直接 RGB，没有在运行时调用这个 MLP。'),
    aside('本项目的字段约定', 'STG-Lite 的 f_dc_0..2 被直接作为 RGB 使用，当前 shader 再 clamp 到 0–1；不要套用静态 3DGS 的 SH DC 系数转换。颜色传递函数、HDR 和曝光也需要独立约定。'),
  ], refs: [gs, stg, shader]
},
{
  id: 'training', number: '08', label: '损失与反向传播', eyebrow: 'PIXEL ERROR → PARAMETERS', title: '渲染是前向过程，训练把误差传回来。', priority: '必推',
  intro: '先固定点集合、排序与可见性分支，理解局部梯度。完整训练还包含分段裁剪、离散的密度控制与具体实现的梯度路径。',
  blocks: [
    E('objective', '常见的 photometric 目标', '\\mathcal L=(1-\\lambda)\\frac{\\|\\widehat I-I\\|_1}{M}+\\lambda(1-\\operatorname{SSIM}(\\widehat I,I))+\\mathcal R(\\theta)',
      r(i('ℒ'),eq,par(r(n(1),minus,i('λ'))),f(s(norm(r(accent(i('I'), '^'),minus,i('I'))),n(1)),i('M')),plus,i('λ'),par(r(n(1),minus,fn('SSIM',r(accent(i('I'), '^'),comma,i('I'))))),plus,at(i('ℛ'),i('θ'))),
      'M 为参与 L1 平均的像素通道数；R 为方法特定的正则，可能为零。这是常见目标结构，不是所有 4DGS 共享的一套固定 loss。训练相机、时间采样与 mask 必须记录。'),
    E('mean-gradient', 'Gaussian 核对投影均值的梯度', '\\nabla_{\\boldsymbol\\mu_{2D}}\\alpha=\\alpha\\mathbf Q\\mathbf d',
      r(s(o('∇'),mu2),i('α'),eq,i('α'),Q,d),
      '推导：d=p−μ，∂(−½dᵀQd)/∂μ=Qd，再乘指数本身。这里固定协方差，忽略 clamp/cutoff。'),
    E('cov-gradient', '对屏幕协方差的梯度', '\\frac{\\partial\\alpha}{\\partial\\mathbf C}=\\frac\\alpha2\\mathbf Q\\mathbf d\\mathbf d^T\\mathbf Q',
      r(partial(i('α'),C),eq,f(i('α'),n(2)),Q,d,T(d),Q),
      '利用 d(C⁻¹)=−C⁻¹(dC)C⁻¹。这里固定投影中心且 C 对称；若只存独立的 (a,b,c)，交叉项 b 的导数要合并两个对称元素的贡献。'),
    E('opacity-gradient', '对 opacity logit 的梯度', '\\frac{\\partial\\alpha}{\\partial\\beta}=\\alpha\\,[1-\\operatorname{sigmoid}(\\beta)]',
      r(partial(i('α'),beta),eq,i('α'),par(r(n(1),minus,fn('sigmoid',beta))))),
    E('full-chain', '位置梯度不只有投影均值这一条路', '\\nabla_{\\boldsymbol\\mu_c}\\mathcal L=\\mathbf J^T\\nabla_{\\boldsymbol\\mu_{2D}}\\mathcal L+\\left(\\frac{\\partial\\operatorname{vec}\\mathbf C}{\\partial\\boldsymbol\\mu_c}\\right)^T\\nabla_{\\operatorname{vec}\\mathbf C}\\mathcal L',
      r(s(o('∇'),s(mu,i('c'))),i('ℒ'),eq,T(J),s(o('∇'),mu2),i('ℒ'),plus,T(par(partial(fn('vec',C),s(mu,i('c'))))),s(o('∇'),fn('vec',C)),i('ℒ')),
      '本式固定外观与 opacity，只展开投影均值和协方差两条路径。J 随三维位置变化，C=JΣcJᵀ 也随位置变化；只乘 Jᵀ 会漏掉后者。SH/decoder 若使用位置相关的观察方向，还需补外观路径。转回世界坐标的梯度要乘对应旋转的转置。'),
    E('composite-gradient', '合成对 alpha 与颜色的梯度', '\\frac{\\partial\\mathbf C}{\\partial\\alpha_i}=T_i(\\mathbf c_i-\\mathbf B_i),\\qquad\\frac{\\partial\\mathbf C}{\\partial\\mathbf c_i}=T_i\\alpha_i\\mathbf I_3',
      align([[partial(b('C'),ai),eq,r(Ti,par(r(ci,minus,s(b('B'),idx))))],
        [partial(b('C'),ci),eq,r(Ti,ai,s(I,n(3)))]]),
      'Bᵢ 是从第 i 层后面开始、按自身透射率合成的尾部颜色，包含背景。增加前景 alpha 会增加本层贡献，同时遮住后面颜色。此式假定排序固定。'),
    E('time-gradient', '时间核与运动系数的导数', '\\frac{dw}{dt}=-\\frac{2\\Delta t}{\\rho^2}w,\\qquad\\frac{\\partial w}{\\partial\\ell_\\tau}=\\frac{2\\Delta t^2}{\\rho^2}w,\\qquad\\frac{\\partial\\boldsymbol\\mu}{\\partial\\mathbf m_k}=\\Delta t^k\\mathbf I_3',
      align([[derivative(i('w'),t),eq,neg(r(f(r(n(2),dt),sq(rho)),i('w')))],
        [partial(i('w'),s(i('ℓ'),tau)),eq,r(f(r(n(2),sq(dt)),sq(rho)),i('w'))],
        [partial(mu,s(b('m'),k)),eq,r(p(dt,k),s(I,n(3)))]]),
      '这些是数学函数的局部导数。官方 STG 训练在部分时间路径上使用 detach；“纸面上可导”不等于实现对所有变量都传播该梯度。'),
    E('finite-difference', '用有限差分检验一个梯度', '\\frac{\\partial\\mathcal L}{\\partial\\theta_k}\\approx\\frac{\\mathcal L(\\theta+h\\mathbf e_k)-\\mathcal L(\\theta-h\\mathbf e_k)}{2h}',
      r(partial(i('ℒ'),s(i('θ'),k)),o('≈'),f(r(at(i('ℒ'),r(i('θ'),plus,i('h'),s(b('e'),k))),minus,at(i('ℒ'),r(i('θ'),minus,i('h'),s(b('e'),k)))),r(n(2),i('h')))),
      '选 float64 的小例子，避开深度交换、near plane、cutoff 和 clamp 边界；比较多个 h 的误差趋势。单一 h 恰好接近不能证明整个 backward 正确。'),
    aside('梯度不会自动增加 Gaussian', 'Clone、split、prune 会改变参数集合，是额外的离散密度控制；需要同时管理优化器状态。它不等同于固定维度上的一次 Adam 更新。'),
  ], refs: [gs, stg, src('https://github.com/learning3d/assignment4', 'CMU · 可微 GS 编程练习')]
},
{
  id: 'checklist', number: '09', label: '自测与源码地图', eyebrow: 'FROM EQUATIONS TO CODE', title: '会解释，也要能检查。', priority: '实践',
  intro: '建议先完成六个小练习，再沿同一顺序走读 renderer。',
  blocks: [
    '<ol class="exercise-list"><li><strong>投影。</strong>从 u=fx·x/z+cx 推出 J 的第一行，说出单位。</li><li><strong>协方差。</strong>从期望定义证明 Cov(AX+b)=AΣAᵀ，解释为什么透视需要近似。</li><li><strong>混合。</strong>手算红蓝两层各 0.5 alpha，解释前后顺序的差别。</li><li><strong>时间。</strong>把归一化轨迹改成秒，检查速度系数与时间核宽度。</li><li><strong>条件化。</strong>完成第 6 节的 Schur 补例子，说清它与 STG 三次轨迹的差异。</li><li><strong>梯度。</strong>固定排序，对 μ、C 或 opacity 做一次 finite difference。</li></ol>',
    '<div class="table-wrap"><table><thead><tr><th>阶段</th><th>当前仓库位置</th><th>核对什么</th></tr></thead><tbody>' +
    [
      ['参数读入','src/lib.rs · parse_stg_ply','字段、log-scale、logit、wxyz'],
      ['时间求值','ResearchSplat::sample / vs_main','CPU 与 GPU 的同一运动和时间核'],
      ['投影椭圆','projected_axis / vs_main','齐次导数、轴外积、像素单位'],
      ['像素合成','fs_main / blend state','指数、cutoff、预乘、排序'],
      ['原生宿主','src/stg_pass.rs','矩阵、viewport、时间契约'],
      ['教学训练','scripts/train_toy_stg.py','前向、loss、backward、导出'],
    ].map(cells=>'<tr>'+cells.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('') + '</tbody></table></div>',
    aside('先分清三种差异', '画面不对时先检查坐标、时间和颜色契约，再检查浮点与算法近似。公式正确也可能因转置、单位、排序或字段激活错误而得到错误图像。'),
  ], refs: [shader, src('https://github.com/pajama-studio/4dgaussian', '项目源码'), src('/docs/', '完整 Field Guide')]
}
];

export const references = [
  gs, stg, deform, four,
  src('https://github.com/oppo-us-research/SpacetimeGaussians', 'STG 官方实现与 Lite 分支'),
  src('https://colmap.github.io/format.html', 'COLMAP 相机与文件约定'),
  src('https://github.com/learning3d/assignment4', 'CMU Learning for 3D Vision · Assignment 4'),
  src('https://3dgstutorial.github.io/', '3DV 2024 · 3DGS 作者教程'),
  src('https://w3c.github.io/mathml-core/', 'MathML Core · 本页公式排版标准'),
  src('https://dlmf.nist.gov/14.30', 'NIST DLMF · 球谐定义与正交性'),
  src('https://dlmf.nist.gov/14.7', 'NIST DLMF · Legendre 多项式'),
  src('https://github.com/graphdeco-inria/gaussian-splatting/blob/main/utils/sh_utils.py', '3DGS 官方 SH 符号与系数顺序'),
  src('https://katex.org/docs/node', 'KaTeX · 构建时排版'),
];
