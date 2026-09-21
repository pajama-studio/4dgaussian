import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { esc } from './notation.mjs';
import { languageUI } from './language-ui.mjs';

// Excerpts are selected from the current checkout, not handwritten facsimiles.
const refs = {
  fragment: ['src/splat.wgsl', 'fn fs_main(', 'return vec4<f32>(input.color_opacity.rgb * alpha, alpha);'],
  activation: ['src/splat.wgsl', 'let temporal_scale =', 'let z = quaternion.w;'],
  axes: ['src/splat.wgsl', 'let axis0 =', 'let center_clip ='],
  covariance: ['src/splat.wgsl', 'let d0 =', 'let cov_c ='],
  'projected-axis': ['src/splat.wgsl', 'fn projected_axis(', 'return ndc_derivative * camera.viewport.xy * 0.5;'],
  ellipse: ['src/splat.wgsl', 'let discriminant =', 'let sigma_minor ='],
  quad: ['src/splat.wgsl', 'let pixel_offset =', 'return output;'],
  motion: ['src/splat.wgsl', 'let dt =', '+ motion_cubic * dt2 * dt;'],
  'cpu-sample': ['src/lib.rs', 'fn sample(self, time:', '(position, sigmoid(self.opacity_logit) * temporal)'],
  'browser-time': ['src/lib.rs', 'let normalized_time = time_seconds', 'self.frame.clear();'],
  'host-camera': ['src/stg_pass.rs', 'let view = Mat4::from_cols_array_2d', 'self.ordered.clear();'],
  blend: ['src/stg_pass.rs', 'blend: Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING)', 'depth_compare: Some(depth_compare),'],
  sort: ['src/stg_pass.rs', 'self.ordered\n', 'let [width, height] ='],
  'toy-project': ['scripts/train_toy_stg.py', '    dt = times[', '    covariance = covariance +'],
  'toy-kernel': ['scripts/train_toy_stg.py', '    ys, xs = torch.meshgrid', '    alpha = torch.where'],
  'toy-composite': ['scripts/train_toy_stg.py', '    order = z.argsort', '* color[:, :, None, None, :]).sum(1)'],
  'train-loop': ['scripts/train_toy_stg.py', '    optimizer = torch.optim.Adam', '        optimizer.step()'],
  export: ['scripts/train_toy_stg.py', '    rows = np.zeros', '    rows[:, 24] = 1'],
  'finite-check': ['scripts/check-math.mjs', 'function finiteJacobian', 'const projection ='],
  'deformation-demo': ['public/math/reference.mjs', 'export function decodeDeformation', 'export function condition4D'],
  'conditional-demo': ['public/math/reference.mjs', 'export function condition4D', 'export function evaluateSH1'],
  'sh-demo': ['public/math/reference.mjs', 'export function evaluateSH1', 'export function compositeFeatures'],
  'sh-basis-full': ['public/math/sh.mjs', 'export function shBasis', 'export function sampleSH'],
  'sh-color-full': ['public/math/sh.mjs', 'export function sampleSH', 'export function blankCoefficients'],
  'feature-demo': ['public/math/reference.mjs', 'export function compositeFeatures', 'return result.map'],
  'trace-gradient': ['public/math/trace.mjs', 'export function gradient', 'const finite ='],
  'trace-ply': ['public/math/trace.mjs', 'export function encodePly', 'return output;'],
  'trace-decode': ['public/math/trace.mjs', 'export function evaluateRecord', 'const sigma ='],
  'trace-project': ['public/math/trace.mjs', 'const [mx, my, mz] = mean', 'const inverse ='],
  'trace-forward': ['public/math/trace.mjs', 'export function forward', 'export function gradient'],
  'trace-loss': ['public/math/trace.mjs', 'const error = color.map', 'return { splats, remaining, color, target:'],
  'training-data': ['public/math/training.mjs', 'export function createTrainingData', 'export function evaluateTraining'],
  'training-batch': ['public/math/training.mjs', 'export function evaluateTraining', 'export function trainingIteration'],
  'training-step': ['public/math/training.mjs', 'export function trainingIteration', 'return {beforeRecords,before,afterRecords,after,rate};'],
};
export async function buildSources(root, output) {
  await mkdir(new URL('code/', output), { recursive: true });
  const sources = new Map(), excerpts = {};
  for (const path of new Set(Object.values(refs).map(r => r[0]))) {
    const bytes = await readFile(new URL(path, root));
    const text = bytes.toString('utf8');
    const lines = text.replaceAll('\r\n', '\n').split('\n');
    const name = path.replaceAll('/', '-');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    sources.set(path, { path, lines, name, sha256 });
    await writeFile(new URL('code/' + name + '.txt', output), bytes);
    const html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>' + esc(path) + ' · 数学源码</title><link rel="stylesheet" href="../math.css"><script type="module" src="../i18n.mjs"></script></head><body class="source-page"><main><div class="source-navigation"><a href="../">← 返回数学手册</a>' + languageUI + '</div><h1>' + esc(path) + '</h1><p>与本次数学页面一起发布的源码快照。SHA-256: <code>' + sha256 + '</code></p><p><a href="' + name + '.txt" download>下载原始文件</a> · <a href="../source-manifest.json">版本指纹清单</a></p><pre class="source-lines"><code>' + lines.map((line, i) => '<span id="L' + (i+1) + '"><a href="#L' + (i+1) + '" aria-label="Line ' + (i+1) + '">' + (i+1) + '</a>' + esc(line) + '</span>').join('\n') + '</code></pre></main></body></html>';
    await writeFile(new URL('code/' + name + '.html', output), html);
  }
  for (const [id, [path, start, end]] of Object.entries(refs)) {
    const source = sources.get(path);
    let first = source.lines.findIndex(line => line.includes(start.trimEnd()));
    if (id === 'sort') first = source.lines.findIndex(line => line.includes('.sort_unstable_by'));
    let last = source.lines.findIndex((line, i) => i >= first && line.includes(end));
    if (first < 0 || last < first) throw new Error('Source excerpt not found: ' + id);
    if (end.startsWith('export function') || end === 'const projection =') last--;
    excerpts[id] = { path, first: first+1, last: last+1, sha256: source.sha256,
      href: '/math/code/' + source.name + '.html#L' + (first+1),
      text: source.lines.slice(first, last+1).join('\n') };
  }
  await writeFile(new URL('source-manifest.json', output), JSON.stringify({
    note: 'Build-time working-tree snapshots; a hash is not a Git commit.',
    files: [...sources.values()].map(({ path, sha256, name }) =>
      ({ path, sha256, href: 'code/' + name + '.txt' })),
    excerpts: Object.fromEntries(Object.entries(excerpts).map(([id, { text, ...meta }]) => [id, meta])),
  }, null, 2) + '\n');
  return excerpts;
}
