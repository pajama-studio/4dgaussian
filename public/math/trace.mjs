// Executable single-pixel lesson: STG-Lite fields -> time -> ellipse -> pixel ->
// ordered over -> MSE -> analytic gradient -> SGD -> the same 32-float PLY.
// Independent CPU arithmetic, not a WebGPU renderer or the official STG trainer.
export const properties = (
  'x y z trbf_center trbf_scale nx ny nz ' +
  'motion_0 motion_1 motion_2 motion_3 motion_4 motion_5 motion_6 motion_7 motion_8 ' +
  'f_dc_0 f_dc_1 f_dc_2 opacity scale_0 scale_1 scale_2 ' +
  'rot_0 rot_1 rot_2 rot_3 omega_0 omega_1 omega_2 omega_3'
).split(' ');
export const camera = { focal: 100, width: 128, height: 96, cx: 64, cy: 48 };
export const background = [0.04, 0.05, 0.08];
export const target = [0.45, 0.18, 0.22];
export const defaults = { time: 0.5, pixel: [74.5, 68.5], rate: 0.5 };
export const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
export const transpose = a => a[0].map((_, j) => a.map(row => row[j]));
export const multiply = (a, b) => a.map(row => transpose(b).map(col => dot(row, col)));
const outer = a => a.map(v => a.map(w => v * w));
const matrixVector = (a, v) => a.map(row => dot(row, v));
const sigmoid = v => 1 / (1 + Math.exp(-v));
const plus = (a, b) => a.map((v, i) => v + b[i]);
const scaled = (a, s) => a.map(v => v * s);

export function initialRecords() {
  const a = Array(32).fill(0), b = Array(32).fill(0);
  for (const row of [a, b]) {
    row[3] = 0.5; row[4] = Math.log(0.55);
    row.splice(21, 3, ...[0.20, 0.12, 0.10].map(Math.log));
    row[24] = 1;
  }
  a.splice(0, 3, 1, 2, 10);
  a.splice(8, 9, 2, 0, 0, 0, 4, 0, 0, 0, 8);
  a.splice(17, 3, 0.9, 0.2, 0.1); a[20] = Math.log(4);
  // Thirty degrees around Z, with a small four-dimensional coefficient velocity.
  a.splice(24, 4, Math.cos(Math.PI / 12), 0, 0, Math.sin(Math.PI / 12));
  a[31] = 0.2;
  b.splice(0, 3, 1.12, 2.04, 11);
  b.splice(8, 3, -0.2, 0.1, 0);
  b.splice(17, 3, 0.1, 0.3, 0.9); b[20] = 0;
  return [a, b];
}

export function evaluateRecord(row, time, pixel) {
  const dt = time - row[3], rho = Math.max(Math.exp(row[4]), 1e-6);
  const temporal = Math.exp(-((dt / rho) ** 2));
  const mean = row.slice(0, 3).map((v, i) =>
    v + row[8 + i] * dt + row[11 + i] * dt ** 2 + row[14 + i] * dt ** 3);
  const u = row.slice(24, 28).map((v, i) => v + dt * row[28 + i]);
  const norm = Math.hypot(...u);
  if (!(norm > 0)) throw new Error('Undefined quaternion');
  const q = u.map(v => v / norm), [w, x, y, z] = q;
  const scales = row.slice(21, 24).map(Math.exp);
  // Columns of the active, right-handed rotation, exactly as splat.wgsl axes.
  const axes = [
    [1 - 2 * (y*y + z*z), 2 * (x*y + w*z), 2 * (x*z - w*y)],
    [2 * (x*y - w*z), 1 - 2 * (x*x + z*z), 2 * (y*z + w*x)],
    [2 * (x*z + w*y), 2 * (y*z - w*x), 1 - 2 * (x*x + y*y)],
  ].map((axis, i) => scaled(axis, scales[i]));
  const sigma = axes.map(outer).reduce((a, b) => a.map((row, i) => plus(row, b[i])));
  const [mx, my, mz] = mean, f = camera.focal;
  if (!(mz > 0)) throw new Error('Teaching camera requires positive depth');
  const uv = [f * mx / mz + camera.cx, f * my / mz + camera.cy];
  const J = [[f / mz, 0, -f * mx / mz ** 2], [0, f / mz, -f * my / mz ** 2]];
  const projectedAxes = axes.map(axis => matrixVector(J, axis));
  const covariance = multiply(multiply(J, sigma), transpose(J))
    .map((row, i) => row.map((v, j) => v + (i === j ? 0.3 : 0)));
  const [[a, b], [, c]] = covariance, determinant = a*c - b*b;
  const inverse = [[c / determinant, -b / determinant], [-b / determinant, a / determinant]];
  const delta = pixel.map((v, i) => v - uv[i]);
  const qd = matrixVector(inverse, delta);
  const radiusSquared = dot(delta, qd), spatial = Math.exp(-0.5 * radiusSquared);
  const baseOpacity = sigmoid(row[20]), rawAlpha = baseOpacity * temporal * spatial;
  const discriminant = Math.sqrt((a-c)**2 + 4*b*b);
  const eigenvalues = [(a+c+discriminant)/2, (a+c-discriminant)/2];
  let major = [1, 0];
  if (Math.abs(b) > 1e-5) {
    major = [b, Math.max(0.1, eigenvalues[0])-a];
    major = scaled(major, 1 / Math.hypot(...major));
  } else if (c > a) major = [0, 1];
  const minor = [-major[1], major[0]];
  const deviations = eigenvalues.map(v => Math.min(Math.sqrt(Math.max(0.1, v)), 192));
  // Teaching coordinates are downwards; simultaneous Y reflection leaves r² unchanged.
  const local = [dot(delta, major) / deviations[0], dot(delta, minor) / deviations[1]];
  const covered = local.every(v => Math.abs(v) <= 3);
  const capped = Math.min(0.99, rawAlpha);
  const alpha = covered && capped >= 1/255 ? capped : 0;
  return { dt, rho, temporal, mean, q, scales, axes, sigma, J, projectedAxes, uv,
    covariance, determinant, inverse, delta, qd, radiusSquared, spatial,
    baseOpacity, rawAlpha, eigenvalues, local, covered, alpha,
    branch: !covered ? 'quad 外：不产生片元' : capped < 1/255 ? 'alpha 低于阈值：丢弃' :
      rawAlpha >= 0.99 ? 'alpha 上限生效' : '光滑区间',
    color: row.slice(17, 20).map(v => Math.max(0, Math.min(1, v))) };
}

export function forward(records, time = defaults.time, pixel = defaults.pixel, options = {}) {
  const expected = options.target ?? target;
  const splats = records.map((row, id) => ({ id, ...evaluateRecord(row, time, pixel) }))
    .sort((a, b) => a.mean[2] - b.mean[2]);
  let remaining = 1, color = [0, 0, 0];
  for (const splat of splats) {
    splat.transmittance = remaining;
    splat.contribution = scaled(splat.color, remaining * splat.alpha);
    color = plus(color, splat.contribution);
    remaining *= 1 - splat.alpha;
  }
  color = plus(color, scaled(background, remaining));
  const error = color.map((v, i) => v - expected[i]);
  return { splats, remaining, color, target: [...expected], loss: dot(error, error) / 3 };
}

export function gradient(records, parameter, time = defaults.time, pixel = defaults.pixel, options = {}) {
  // Differentiate record A, while holding the visibility/sort branches fixed.
  // Supported fields: base mean x/y/z or opacity logit. Scales/rotation remain fixed.
  if (![0, 1, 2, 20].includes(parameter)) throw new Error('Unsupported teaching parameter');
  const result = forward(records, time, pixel, options);
  const index = result.splats.findIndex(s => s.id === 0), s = result.splats[index];
  let tail = [...background];
  for (let j = result.splats.length - 1; j > index; j--) {
    const layer = result.splats[j];
    tail = plus(scaled(layer.color, layer.alpha), scaled(tail, 1-layer.alpha));
  }
  const colorSlope = scaled(s.color.map((v, i) => v - tail[i]), s.transmittance);
  const lossColorSlope = result.color.map((v, i) => 2 * (v-result.target[i]) / 3);
  const lossAlphaSlope = dot(lossColorSlope, colorSlope);
  let meanPath = 0, covariancePath = 0, opacityPath = 0;
  if (s.branch === '光滑区间') {
    if (parameter === 20) opacityPath = s.alpha * (1-s.baseOpacity);
    else {
      const [x, y, z] = s.mean, f = camera.focal;
      const dJ = parameter === 0 ? [[0, 0, -f/z**2], [0, 0, 0]] :
        parameter === 1 ? [[0, 0, 0], [0, 0, -f/z**2]] :
        [[-f/z**2, 0, 2*f*x/z**3], [0, -f/z**2, 2*f*y/z**3]];
      const left = multiply(multiply(dJ, s.sigma), transpose(s.J));
      const right = multiply(multiply(s.J, s.sigma), transpose(dJ));
      const dC = left.map((row, i) => plus(row, right[i]));
      meanPath = s.alpha * dot(s.qd, s.J.map(row => row[parameter]));
      covariancePath = s.alpha / 2 * dot(s.qd, matrixVector(dC, s.qd));
    }
  }
  const alphaSlope = meanPath + covariancePath + opacityPath;
  const analytic = lossAlphaSlope * alphaSlope;
  const finite = (options.finite === false ? [] : [1e-4, 1e-5, 1e-6]).map(h => {
    const plusRecords = records.map(row => [...row]), minusRecords = records.map(row => [...row]);
    plusRecords[0][parameter] += h; minusRecords[0][parameter] -= h;
    const value = (forward(plusRecords, time, pixel, options).loss - forward(minusRecords, time, pixel, options).loss) / (2*h);
    return { h, value, error: Math.abs(value-analytic) };
  });
  return { result, tail, colorSlope, lossColorSlope, lossAlphaSlope, meanPath, covariancePath,
    opacityPath, alphaSlope, analytic, finite };
}

export function encodePly(records) {
  const header = new TextEncoder().encode(
    'ply\nformat binary_little_endian 1.0\nelement vertex ' + records.length + '\n' +
    properties.map(name => 'property float ' + name + '\n').join('') + 'end_header\n');
  const output = new Uint8Array(header.length + records.length * 32 * 4);
  output.set(header);
  const view = new DataView(output.buffer);
  records.forEach((row, i) => row.forEach((value, j) =>
    view.setFloat32(header.length + (i * 32 + j) * 4, value, true)));
  return output;
}
