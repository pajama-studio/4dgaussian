import { formula as F, para as P } from './lesson-format.mjs';
const card = (id, title, html) => '<details class="foundation" id="base-' + id + '"><summary>' + title + '</summary><div>' + html + '</div></details>';

export const foundations = '<section class="math-section" id="foundations"><p class="eyebrow">START WITH SCHOOL MATH</p><h2>先补 8 个工具，每次只多走一步。</h2>' +
 P('只预设你会四则运算、分数、平方和解简单方程。向量、矩阵、指数、导数都在这里引入。后面的“定义 / 模型选择”不是从某条物理定律必然推出的；“恒等式”可以代数证明；“近似”会写出适用范围。') +
 card('vectors', 'A · 向量、点积、长度：一串数怎样参加运算？',
 P('向量先当作一列数。位置 (3,4) 表示向右 3、向上 4；相加就是每项相加。粗体表示整列，普通字母表示一个数。点积把对应项相乘再相加；勾股定理给出长度。转置 T 只把列改成行，不改变数值。') +
 F("\\mathbf a=\\begin{bmatrix}3\\\\4\\end{bmatrix},\\quad \\mathbf b=\\begin{bmatrix}2\\\\-1\\end{bmatrix},\\quad \\mathbf a+\\mathbf b=\\begin{bmatrix}5\\\\3\\end{bmatrix},\\quad \\mathbf a^T\\mathbf b=3\\cdot2+4(-1)=2") +
 F("\\|\\mathbf a\\|=\\sqrt{3^2+4^2}=5,\\qquad \\widehat{\\mathbf a}=\\frac{\\mathbf a}{5}=(0.6,0.8)^T") +
 P('“归一化”在这里指除以长度，结果长度为 1；不是把每个坐标都变成 1。分母为 0 时没有方向，不能归一化。外积则保留所有两两乘积，产出一张表：') +
 F("\\mathbf a\\mathbf a^T=\\begin{bmatrix}3\\cdot3&3\\cdot4\\\\4\\cdot3&4\\cdot4\\end{bmatrix}=\\begin{bmatrix}9&12\\\\12&16\\end{bmatrix}") +
 P('求和符号 ∑ 就是把指定范围内的项全部加起来；连乘符号 ∏ 则把它们全部乘起来。')) +
 card('matrices', 'B · 矩阵：把很多条一次方程装进表格',
 P('矩阵乘列向量，就是每一行与这列做一次点积。2×3 表示 2 行 3 列；把 3 个输入变成 2 个输出。矩阵乘法 AB 表示先做 B 再做 A，一般不能交换。') +
 F("\\begin{bmatrix}2&1\\\\0&3\\end{bmatrix}\\begin{bmatrix}4\\\\5\\end{bmatrix}=\\begin{bmatrix}2\\cdot4+1\\cdot5\\\\0\\cdot4+3\\cdot5\\end{bmatrix}=\\begin{bmatrix}13\\\\15\\end{bmatrix}") +
 F("(AB)_{ij}=\\sum_k A_{ik}B_{kj},\\quad I=\\begin{bmatrix}1&0\\\\0&1\\end{bmatrix},\\quad A^{-1}A=I,\\quad (AB)^T=B^TA^T") +
 P('I 是原样输出的单位矩阵；逆矩阵是撤销一次变换。不可撤销（例如把某一维压成 0）就没有逆矩阵。旋转保持长度，因此逆旋转等于转置。diag 表示只在对角线上放数，其余为 0。') +
 F("R^TR=I\\ \\Longrightarrow\\ R^{-1}=R^T,\\qquad \\operatorname{diag}(2,3)=\\begin{bmatrix}2&0\\\\0&3\\end{bmatrix}")) +
 card('exp', 'C · 指数与对数：从反复相乘到连续增长',
 P('2³ 是 2 连乘 3 次；2⁻³ 是它的倒数；2^(1/2) 是 √2。把“份数”继续细分，可以定义任意实数指数。e≈2.71828 是特殊的底数：它的增长率恰好等于自己。ln 是指数的反操作，可用计算器。') +
 F("e^0=1,\\quad e^{a+b}=e^ae^b,\\quad e^{-a}=\\frac1{e^a},\\quad \\ln(e^a)=a,\\quad \\ln(ab)=\\ln a+\\ln b\\ (a,b>0)") +
 P('指数永远为正。负平方放在指数上，离 0 越远就越接近 0，这就是 Gaussian 的形状。ln 在正数范围单调递增，所以不等式两边取 ln 不会改变方向。') +
 F("e^{-x^2/2}:\\quad x=0\\Rightarrow1,\\quad x=1\\Rightarrow0.60653,\\quad x=2\\Rightarrow0.13534") +
 P('为什么 e 的导数还是 e？从 e=lim(1+1/n)ⁿ 引入的实数指数有 lim(h→0)(eʰ−1)/h=1。这个极限是这里新增的基础事实；结合指数乘法规则，就能推出后面使用的导数。')) +
 card('statistics', 'D · 均值、方差与协方差：用“平均乘积”描述形状',
 P('平均值就是总和除以个数。方差是“偏离平均值的距离的平方”的平均，不是平均距离。E 读作期望，这里先理解为大量样本的平均；Cov 是协方差。我们描述分布，分母用 N；样本无偏估计的 N−1 是另一个问题。') +
 F("\\mu=\\frac1N\\sum_{n=1}^N x_n,\\quad \\operatorname{Var}(X)=\\frac1N\\sum_n(x_n-\\mu)^2,\\quad \\Sigma_{ij}=\\mathbb E[(X_i-\\mu_i)(X_j-\\mu_j)]") +
 P('样本 (1,2)、(3,6) 的均值为 (2,4)。偏移为 (−1,−2)、(1,2)，两张外积表相同：') +
 F("\\Sigma=\\frac12\\left(\\begin{bmatrix}1&2\\\\2&4\\end{bmatrix}+\\begin{bmatrix}1&2\\\\2&4\\end{bmatrix}\\right)=\\begin{bmatrix}1&2\\\\2&4\\end{bmatrix}") +
 P('对角元素是各轴方差；非对角元素表示两个方向是否一起偏大。这里两点共线，所以矩阵不可逆。GS 用三个正尺度和旋转构造有厚度的椭球。“正定”就是任意非零方向上的方差都大于 0。')) +
 card('derivatives', 'E · 导数与偏导：从两点之间的斜率开始',
 P('汽车走了 Δ路程、用了 Δ时间，比值就是平均速度。把间隔 h 越缩越小，得到某一刻的变化率，记作 df/dx。不是令 h=0 后除以 0，而是观察 h 接近 0 时的比值。') +
 F("\\frac{(x+h)^2-x^2}{h}=\\frac{2xh+h^2}{h}=2x+h\\ \\xrightarrow{h\\to0}\\ 2x") +
 F("\\frac{(x+h)^3-x^3}{h}=3x^2+3xh+h^2\\to3x^2,\\qquad \\frac{e^{x+h}-e^x}{h}=e^x\\frac{e^h-1}{h}\\to e^x") +
 P('偏导数 ∂ 是“先锁住其他输入，只改一个”。函数有多个输出时，把每个输出对每个输入的偏导排成表，叫 Jacobian。函数只有一个输出时，各偏导组成的列叫梯度 ∇。') +
 F("f(x,y)=x^2+3y:\\quad \\frac{\\partial f}{\\partial x}=2x,\\quad\\frac{\\partial f}{\\partial y}=3,\\quad \\nabla f=(2x,3)^T") +
 P('乘法法则来自 (f+Δf)(g+Δg) 展开，除以 h 后 ΔfΔg/h 趋于 0。用它对 g·(1/g)=1 求导，得到倒数法则；再组合成商法则：') +
 F("(fg)^{\\prime}=f^{\\prime}g+fg^{\\prime},\\qquad (g^{-1})^{\\prime}=-\\frac{g^{\\prime}}{g^2},\\qquad \\left(\\frac fg\\right)^{\\prime}=\\frac{f^{\\prime}g-fg^{\\prime}}{g^2}")) +
 card('chain', 'F · 链式法则、反向传播与一步更新',
 P('输入多 0.01，让中间量多约 0.03；中间量每多 1 又让输出多约 5。总变化就是 3×5×0.01。这叫链式法则：沿一条路线相乘，多条路线相加。') +
 F("u=x^2,\\quad y=e^u:\\qquad \\frac{dy}{dx}=\\frac{dy}{du}\\frac{du}{dx}=e^{x^2}\\cdot2x") +
 F("L=L(a(x),b(x)):\\qquad \\frac{dL}{dx}=\\frac{\\partial L}{\\partial a}\\frac{da}{dx}+\\frac{\\partial L}{\\partial b}\\frac{db}{dx}") +
 P('“反向”是从最终误差向输入传斜率。一个量被使用两次，两条路的贡献都要加。若梯度为正，减小参数能在足够小的步长下减小误差：') +
 F("L=(\\theta-3)^2,\\quad L^{\\prime}=2(\\theta-3),\\quad \\theta=1,\\ \\eta=0.1:\\quad \\theta_{\\rm new}=1-0.1(-4)=1.4") +
 P('η 是学习率。PyTorch 的 backward 负责算梯度；optimizer.step 才修改参数。上面是 SGD，项目教学训练器使用带历史平均和自适应步长的 Adam，两者不是同一个更新式。')) +
 card('quadratic', 'G · 配方与求根：条件高斯和椭圆共用的代数',
 P('把一次项吸收进平方，叫配方。直接展开右侧可以验证；这也是后面消掉时空交叉项的办法。') +
 F("x^2+2bx+c=(x+b)^2+c-b^2") +
 P('解 λ²−sλ+p=0：先把常数移到右边，两边加 (s/2)²，再开平方；平方根有正负两支。') +
 F("\\lambda^2-s\\lambda=-p\\ \\Longrightarrow\\ \\left(\\lambda-\\frac s2\\right)^2=\\frac{s^2-4p}{4}\\ \\Longrightarrow\\ \\lambda=\\frac{s\\pm\\sqrt{s^2-4p}}2") +
 P('矩阵版本也是逐项乘开。不要因为出现粗体就放弃手算：2×2 逆矩阵只需要解两组二元一次方程。')) +
 card('integral', 'H · 积分与球面：把很多小块加起来',
 P('路程可以用很多小段“速度×时间”相加；小段无限细时，和的极限记作积分。积分号右侧的 ds 提醒我们每块的宽度是什么，单位不能丢。') +
 F("\\int_a^b f(s)\\,ds=\\lim_{N\\to\\infty}\\sum_{j=0}^{N-1}f(a+j\\Delta s)\\Delta s,\\qquad \\Delta s=\\frac{b-a}{N}") +
 P('球谐还会用单位球面。方向 v=(x,y,z) 满足 x²+y²+z²=1；经纬角的正弦、余弦可理解为单位圆上点的两个坐标。球面上的“平均”按小面积加权。单位球面积为 4π；由面积元素 sinθ·dθ·dφ 积分得到。') +
 F("\\mathbf v=(\\sin\\theta\\cos\\phi,\\sin\\theta\\sin\\phi,\\cos\\theta),\\qquad \\int_{S^2}1\\,d\\Omega=\\int_0^{2\\pi}\\int_0^\\pi\\sin\\theta\\,d\\theta\\,d\\phi=4\\pi") +
 P('最后一个积分用 cos 的导数是 −sin：内层等于 [−cosθ] 从 0 到 π 的差，即 2。完整三角函数理论不是 GS 上手的前置门槛；知道它表示方向、能计算基函数，就可以先跑通颜色求和。')) +
 '</section>';
