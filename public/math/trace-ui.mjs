import { initialRecords, gradient, forward, encodePly, properties, defaults } from './trace.mjs';
import { t, localize } from './i18n.mjs';
const $ = selector => document.querySelector(selector);
let records = initialRecords();
let last;
let lastMessage = null;
const number = value => Math.abs(value) !== 0 && Math.abs(value) < 0.00001
  ? value.toExponential(5) : value.toFixed(6).replace(/\.?0+$/, '');
const flat = value => Array.isArray(value) ? '[' + value.map(flat).join(', ') + ']' : number(value);
const cell = value => Array.isArray(value) && Array.isArray(value[0])
  ? '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mo>[</mo><mtable class="matrix">' +
    value.map(row=>'<mtr>'+row.map(v=>'<mtd><mn>'+number(v)+'</mn></mtd>').join('')+'</mtr>').join('') +
    '</mtable><mo>]</mo></mrow></math>'
  : '<code>' + flat(value) + '</code>';
const row = (name, a, b) => '<tr><th scope="row">' + name + '</th><td>' + cell(a) + '</td><td>' + cell(b) + '</td></tr>';
const state = () => ({ time: Number($('#trace-time').value),
  pixel: [Number($('#trace-pixel').value), defaults.pixel[1]], parameter: Number($('#trace-parameter').value) });

function update(message = null) {
  lastMessage = message;
  const { time, pixel, parameter } = state();
  last = gradient(records, parameter, time, pixel);
  const { result } = last;
  const a = result.splats.find(s => s.id === 0), b = result.splats.find(s => s.id === 1);
  $('#trace-time-value').textContent = time.toFixed(2);
  $('#trace-pixel-value').textContent = pixel[0].toFixed(1);
  $('#trace-color').textContent = flat(result.color);
  $('#trace-swatch').style.background = 'rgb(' + result.color.map(v => (v*100)+'%').join(' ') + ')';
  $('#trace-loss').textContent = result.loss.toFixed(8);
  $('#trace-message').textContent = message
    ? t(message.key, message.values) + (message.increased ? ' ' + t('这一步损失上升，固定步长不保证每个状态下降，可恢复后检查分支。') : '')
    : t('A：{a}；B：{b}。近→远顺序：{order}。', {
      a: t(a.branch), b: t(b.branch),
      order: result.splats.map(s => s.id === 0 ? 'A' : 'B').join(' → '),
    });
  const fields = [
    ['01 · PLY μ₀ / r0.xyz', records[0].slice(0,3), records[1].slice(0,3)],
    ['原始 logit β / r5.x', records[0][20], records[1][20]],
    ['02 · 时间差 Δt', a.dt, b.dt],
    ['解码宽度 ρ = exp(ℓτ)', a.rho, b.rho],
    ['时间权重 w = exp(−(Δt/ρ)²)', a.temporal, b.temporal],
    ['基础 opacity = sigmoid(β)', a.baseOpacity, b.baseOpacity],
    ['03 · 当前中心 μ(t)', a.mean, b.mean],
    ['当前单位四元数 q(t) / wxyz', a.q, b.q],
    ['空间尺度 exp(ℓ)', a.scales, b.scales],
    ['三条协方差轴（每行列出一条轴）', a.axes, b.axes],
    ['04 · 屏幕中心 μ₂D', a.uv, b.uv],
    ['投影 Jacobian J', a.J, b.J],
    ['投影轴（每行列出一条轴）', a.projectedAxes, b.projectedAxes],
    ['05 · C = JΣJᵀ + 0.3I', a.covariance, b.covariance],
    ['Q = C⁻¹', a.inverse, b.inverse],
    ['06 · 像素偏移 d = p−μ₂D', a.delta, b.delta],
    ['椭圆局部坐标 local', a.local, b.local],
    ['r² = dᵀQd = dot(local,local)', a.radiusSquared, b.radiusSquared],
    ['空间核 exp(−r²/2)', a.spatial, b.spatial],
    ['裁剪之前的 alpha', a.rawAlpha, b.rawAlpha],
    ['07 · 覆盖/阈值/上限之后的 alpha', a.alpha, b.alpha],
    ['08 · 到达本层前的 Ti', a.transmittance, b.transmittance],
    ['本层贡献 Ti × alpha × RGB', a.contribution, b.contribution],
  ];
  const gradientRows = [
    ['09 · MSE 对 RGB 的导数', last.lossColorSlope],
    ['A 后面的尾部颜色 Bᵢ（含背景）', last.tail],
    ['像素对 alpha 的导数 Ti(ci−Bi)', last.colorSlope],
    ['loss 对 alpha 的导数（点积）', last.lossAlphaSlope],
    ['alpha 对所选参数：均值路径', last.meanPath],
    ['alpha 对所选参数：协方差路径', last.covariancePath],
    ['alpha 对所选参数：opacity 路径', last.opacityPath],
    ['三条路径相加', last.alphaSlope],
    ['10 · 最终 dL/dθ', last.analytic],
    [t('当前 θ =') + ' ' + properties[parameter], records[0][parameter]],
    ['若执行一步，θ − 0.5 × dL/dθ', records[0][parameter] - defaults.rate * last.analytic],
  ];
  const forwardOpen = $('.trace-forward')?.open ?? false;
  $('#trace-output').innerHTML =
    '<details class="trace-forward"><summary>展开 01–08：从原始字段到像素，每个中间值</summary><div class="table-wrap"><table><thead><tr><th>步骤 / 数学量</th><th>Gaussian A</th><th>Gaussian B</th></tr></thead><tbody>' +
    fields.map(([name,a,b]) => row(name,a,b)).join('') + '</tbody></table></div><p>' +
    t('剩余透射率 = {value}，再乘背景并加到两层贡献上，得到上面的预测像素。', { value: number(result.remaining) }) + '</p></details>' +
    '<div class="table-wrap"><table class="trace-gradients"><thead><tr><th>09–10 · 梯度怎样传回来</th><th>当前数值</th></tr></thead><tbody>' +
    gradientRows.map(([name, v]) => '<tr><th scope="row">' + name + '</th><td>' + cell(v) + '</td></tr>').join('') +
    '</tbody></table></div><div class="table-wrap"><table><thead><tr><th>有限差分步长 h</th><th>两次前向求出的梯度</th><th>与解析值的绝对误差</th></tr></thead><tbody>' +
    last.finite.map(v=>'<tr><td>'+v.h+'</td><td>'+number(v.value)+'</td><td>'+v.error.toExponential(3)+'</td></tr>').join('') +
    '</tbody></table></div><p>解析梯度来自<a href="#eq-full-chain">两条位置路径</a>与<a href="#eq-composite-gradient">遮挡梯度</a>；有限差分重新运行整个前向。若恰好跨越可见性边界，两者可能不一致，需单独检查分支。</p>';
  $('.trace-forward').open = forwardOpen;
  localize($('#trace-output'));
}
for (const selector of ['#trace-time', '#trace-pixel', '#trace-parameter']) {
  $(selector).addEventListener('input', () => update());
}
$('#trace-step').addEventListener('click', () => {
  const { parameter, time, pixel } = state();
  const old = records[0][parameter], before = last.result.loss;
  records[0][parameter] -= defaults.rate * last.analytic;
  const after = forward(records, time, pixel).loss;
  update({ key: '已更新 A 的 {parameter}：{old} → {next}；MSE {before} → {after}。',
    values: { parameter: properties[parameter], old: number(old), next: number(records[0][parameter]),
      before: before.toFixed(8), after: after.toFixed(8) }, increased: after > before });
});
$('#trace-reset').addEventListener('click', () => {
  records = initialRecords(); $('#trace-time').value = 0.5; $('#trace-pixel').value = 74.5;
  $('#trace-parameter').value = 20; update({ key: '已恢复初始两颗 Gaussian、时间和像素。' });
});
$('#trace-download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([encodePly(records)], { type: 'application/octet-stream' }));
  const a = document.createElement('a'); a.href = url; a.download = 'math-two-splats.ply'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('#trace-message').setAttribute('data-i18n-dynamic', '');
addEventListener('math:languagechange', () => update(lastMessage));
update();
