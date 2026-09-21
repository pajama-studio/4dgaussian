import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { sections } from './math/content.mjs';

// Independent numerical checks of the mathematical identities, not a GPU test.
const results = [];
const flat = x => Array.isArray(x) ? x.flatMap(flat) : [x];
function close(label, actual, expected, tolerance = 1e-7) {
  const a = flat(actual), e = flat(expected);
  assert.equal(a.length, e.length, label);
  const error = Math.max(...a.map((v, i) => Math.abs(v - e[i])));
  assert.ok(Number.isFinite(error) && error < tolerance, `${label}: ${error}`);
  results.push({ label, maxAbsoluteError: error, tolerance });
}
const add = (a, b) => a.map((v, i) => v + b[i]);
const scale = (a, s) => a.map(v => v * s);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const tr = a => a[0].map((_, j) => a.map(row => row[j]));
const mul = (a, b) => a.map(row => tr(b).map(col => dot(row, col)));
const mv = (a, x) => a.map(row => dot(row, x));
const outer = (a, b) => a.map(x => b.map(y => x * y));
const eye = n => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => +(i === j)));
const matrixSubtract = (a, b) => a.map((row, i) => row.map((v, j) => v - b[i][j]));
function inverse(a) {
  const n = a.length, augmented = a.map((row, i) => [...row, ...eye(n)[i]]);
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let r = k + 1; r < n; r++) if (Math.abs(augmented[r][k]) > Math.abs(augmented[pivot][k])) pivot = r;
    [augmented[k], augmented[pivot]] = [augmented[pivot], augmented[k]];
    const diagonal = augmented[k][k];
    assert.ok(Math.abs(diagonal) > 1e-12);
    augmented[k] = augmented[k].map(v => v / diagonal);
    for (let r = 0; r < n; r++) if (r !== k) {
      const factor = augmented[r][k];
      augmented[r] = augmented[r].map((v, j) => v - factor * augmented[k][j]);
    }
  }
  return augmented.map(row => row.slice(n));
}
function finiteJacobian(fn, x, step) {
  return tr(x.map((_, k) => {
    const a = [...x], b = [...x]; a[k] += step; b[k] -= step;
    return fn(a).map((v, j) => (v - fn(b)[j]) / (2 * step));
  }));
}
function finiteCheck(label, fn, x, expected) {
  for (const step of [1e-4, 1e-5, 1e-6]) close(`${label} h=${step}`, finiteJacobian(fn, x, step), expected, 2e-6);
}

const projection = ([x, y, z]) => [100 * x / z, 100 * y / z];
const J = [[10, 0, -1], [0, 10, -2]];
finiteCheck('pinhole Jacobian', projection, [1, 2, 10], J);
const covariance = mul(mul(J, [[1, 0, 0], [0, 4, 0], [0, 0, 9]]), tr(J));
close('worked projected covariance', covariance.map((row, i) => row.map((v, j) => v + (i === j ? 0.3 : 0))), [[109.3, 18], [18, 436.3]]);

const A = [[2, 0, 0], [0, 1, 0], [0, 0, 1]], b = [1, 0, 0], c = 1;
const conditional = matrixSubtract(A, outer(b, b));
close('Schur complement', conditional, eye(3));
const sigma4 = [...A.map((row, i) => [...row, b[i]]), [...b, c]];
const z = [0.9, -0.2, 0.7, 0.4], d = add(z.slice(0, 3), scale(b, -z[3] / c));
close('joint versus conditional quadratic form', dot(z, mv(inverse(sigma4), z)), dot(d, mv(inverse(conditional), d)) + z[3] ** 2 / c);

const C = [[1.4, 0.3], [0.3, 0.8]], Q = inverse(C), pixel = [0.7, -0.2], mean = [0.2, 0.1], beta = 0.4;
const sigmoid = x => 1 / (1 + Math.exp(-x));
const alpha = (mu, cov, logit) => {
  const delta = add(pixel, scale(mu, -1));
  return sigmoid(logit) * Math.exp(-dot(delta, mv(inverse(cov), delta)) / 2);
};
const currentAlpha = alpha(mean, C, beta), qd = mv(Q, add(pixel, scale(mean, -1)));
finiteCheck('projected mean gradient', mu => [alpha(mu, C, beta)], mean, [scale(qd, currentAlpha)]);
finiteCheck('independent symmetric covariance entries', ([a, b, c]) => [alpha(mean, [[a, b], [b, c]], beta)], [1.4, 0.3, 0.8], [[currentAlpha / 2 * qd[0] ** 2, currentAlpha * qd[0] * qd[1], currentAlpha / 2 * qd[1] ** 2]]);
finiteCheck('opacity logit gradient', ([logit]) => [alpha(mean, C, logit)], [beta], [[currentAlpha * (1 - sigmoid(beta))]]);

const colors = [[1, 0, 0], [0, 0, 1], [0.2, 0.7, 0.1]], background = [0.13, 0.23, 0.31], alphas = [0.2, 0.4, 0.3];
const composite = (as, cs, bg) => as.reduceRight((tail, a, index) => add(scale(cs[index], a), scale(tail, 1 - a)), bg);
close('ordered two layer example', composite([0.5, 0.5], colors.slice(0, 2), [0, 0, 0]), [0.5, 0, 0.25]);
const alphaGrad = tr(alphas.map((_, index) => {
  const T = alphas.slice(0, index).reduce((value, a) => value * (1 - a), 1);
  const tail = composite(alphas.slice(index + 1), colors.slice(index + 1), background);
  return scale(add(colors[index], scale(tail, -1)), T);
}));
finiteCheck('compositing alpha gradient including background', as => composite(as, colors, background), alphas, alphaGrad);

const time = 0.61, center = 0.43, logWidth = Math.log(0.3), delta = time - center;
const weight = (t, ell) => Math.exp(-(((t - center) / Math.exp(ell)) ** 2));
const w = weight(time, logWidth), rho2 = Math.exp(logWidth) ** 2;
finiteCheck('STG temporal derivative and log-width derivative', ([t, ell]) => [weight(t, ell)], [time, logWidth], [[-2 * delta / rho2 * w, 2 * delta ** 2 / rho2 * w]]);
const normalize = u => scale(u, 1 / Math.hypot(...u));
const u = [1.1, 0.2, -0.3, 0.4], q = normalize(u), normalJac = matrixSubtract(eye(4), outer(q, q)).map(row => scale(row, 1 / Math.hypot(...u)));
finiteCheck('quaternion normalization Jacobian', normalize, u, normalJac);

const html = await readFile(new URL('../public/math/index.html', import.meta.url), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, 'Unique HTML ids');
for (const [, anchor] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(anchor), 'Missing anchor: ' + anchor);
const equations = sections.flatMap(section => section.blocks.filter(block => typeof block === 'object'));
assert.equal(equations.length, 39);
assert.equal([...html.matchAll(/class="copy-equation"/g)].length, equations.length);
const saved = JSON.parse(await readFile(new URL('../public/math/equations.json', import.meta.url), 'utf8'));
assert.deepEqual(saved, equations.map(({ id, title, latex }) => ({ id, title, latex })));
assert.ok(!/<(?:script|link)[^>]+(?:src|href)="https?:/i.test(html), 'Math page must not require a CDN');
const report = { status: 'pass', equations: equations.length, numericChecks: results, visualReview: 'Not performed by this numerical and structural check.' };
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
await writeFile(new URL('../artifacts/math-checks.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(`PASS: ${results.length} numerical checks, 39 equation sources, all local anchors. Browser visual review not run.`);
