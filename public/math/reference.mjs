// Teaching examples for OTHER representations. Not called by the STG-Lite pass.
// Inputs use ordinary arrays and double precision; no model/checkpoint loader.
function normalize(v) {
  const length = Math.hypot(...v);
  if (!(length > 0)) throw new Error('Cannot normalize a zero vector');
  return v.map(x => x / length);
}

export function decodeDeformation(base, deltaPosition, deltaLogScale, deltaQuaternion) {
  // Example choice of heads; not a claim about every deformation implementation.
  return {
    position: base.position.map((v, i) => v + deltaPosition[i]),
    scale: base.logScale.map((v, i) => Math.exp(v + deltaLogScale[i])),
    quaternion: normalize(base.quaternion.map((v, i) => v + deltaQuaternion[i])),
  };
}

export function condition4D(meanSpace, meanTime, A, b, c, time) {
  if (!(c > 0)) throw new Error('Time variance must be positive');
  // Caller supplies a positive-definite joint covariance.
  const dt = time - meanTime;
  return {
    mean: meanSpace.map((v, i) => v + b[i] * dt / c),
    covariance: A.map((row, i) => row.map((v, j) => v - b[i] * b[j] / c)),
    timeWeight: Math.exp(-0.5 * dt * dt / c),
  };
}

export function evaluateSH1(coefficients, direction) {
  // Four RGB coefficients, Graphdeco real-SH signs/order. Raw sum, no +0.5/clamp.
  const [x, y, z] = normalize(direction);
  const c0 = 1 / Math.sqrt(4 * Math.PI);
  const c1 = Math.sqrt(3 / (4 * Math.PI));
  const basis = [c0, -c1 * y, c1 * z, -c1 * x];
  return [0, 1, 2].map(channel =>
    basis.reduce((sum, value, index) => sum + value * coefficients[index][channel], 0));
}

export function compositeFeatures(alphas, features, background) {
  // Near to far; any feature dimension, including ordinary RGB.
  const result = background.map(() => 0);
  let transmittance = 1;
  for (let i = 0; i < alphas.length; i++) {
    for (let d = 0; d < result.length; d++) {
      result[d] += transmittance * alphas[i] * features[i][d];
    }
    transmittance *= 1 - alphas[i];
  }
  return result.map((v, d) => v + transmittance * background[d]);
}
