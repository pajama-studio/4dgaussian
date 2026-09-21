// Real, orthonormal SH. Ordering and signs follow Graphdeco's 3DGS convention.
// Independent educational evaluator; the STG-Lite renderer stores direct RGB.
export const SH_COUNT = 16;
export const C0 = 1 / Math.sqrt(4 * Math.PI);

export function unitDirection(direction) {
  const length = Math.hypot(...direction);
  if (direction.length !== 3 || !direction.every(Number.isFinite) || !(length > 0)) {
    throw new RangeError('A finite, nonzero 3D direction is required');
  }
  return direction.map(value => value / length);
}

export function directionFromAngles(azimuth, polar) {
  // Radians; theta is measured from +z, phi from +x towards +y.
  return [Math.sin(polar) * Math.cos(azimuth), Math.sin(polar) * Math.sin(azimuth), Math.cos(polar)];
}

export function shBasis(direction, degree = 3) {
  if (!Number.isInteger(degree) || degree < 0 || degree > 3) throw new RangeError('Degree must be 0..3');
  const [x, y, z] = unitDirection(direction);
  const pi = Math.PI, xx = x*x, yy = y*y, zz = z*z;
  const a = Math.sqrt(3 / (4*pi)), b = Math.sqrt(15 / (4*pi));
  const c = Math.sqrt(35 / (32*pi)), d = Math.sqrt(21 / (32*pi));
  const values = [
    C0,
    -a*y, a*z, -a*x,
    b*x*y, -b*y*z, Math.sqrt(5/(16*pi))*(2*zz-xx-yy),
    -b*x*z, Math.sqrt(15/(16*pi))*(xx-yy),
    -c*y*(3*xx-yy), Math.sqrt(105/(4*pi))*x*y*z,
    -d*y*(4*zz-xx-yy), Math.sqrt(7/(16*pi))*z*(2*zz-3*xx-3*yy),
    -d*x*(4*zz-xx-yy), Math.sqrt(105/(16*pi))*z*(xx-yy), -c*x*(xx-3*yy),
  ];
  return values.slice(0, (degree+1)**2);
}

export function sampleSH(coefficients, direction, degree = 3) {
  const basis = shBasis(direction, degree);
  if (coefficients.length < basis.length || coefficients.slice(0,basis.length).some(
    rgb => rgb.length !== 3 || !rgb.every(Number.isFinite))) throw new RangeError('Missing finite RGB coefficients');
  const contributions = basis.map((value,k) => coefficients[k].map(a => a*value));
  const raw = [0,1,2].map(ch => contributions.reduce((sum,rgb) => sum+rgb[ch],0));
  const shifted = raw.map(value => value+0.5);
  // Graphdeco's forward.cu clamps below zero; it does NOT clamp above one here.
  const shaderColor = shifted.map(value => Math.max(0,value));
  // A separate SDR display clipping step for this canvas demo (no tone mapping).
  const display = shaderColor.map(value => Math.min(1,value));
  return { basis, contributions, raw, shifted, shaderColor, display };
}

export function blankCoefficients(rgb = [0.5,0.5,0.5]) {
  const coefficients = Array.from({length:SH_COUNT}, () => [0,0,0]);
  coefficients[0] = rgb.map(value => (value-0.5)/C0);
  return coefficients;
}

export function presetCoefficients(name) {
  const a = blankCoefficients([0.52,0.39,0.26]);
  if (name === 'dc') return a;
  a[2] = [0.50,0.22,-0.28];
  a[3] = [-0.32,0.27,0.43];
  if (name === 'first') return a;
  a[4] = [0.32,-0.24,0.08];
  a[6] = [-0.21,0.15,0.36];
  if (name === 'second') return a;
  a[10] = [0.18,0.06,-0.24];
  a[15] = [0.22,-0.18,0.09];
  return a;
}

export function sphereSamples(count) {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('Positive sample count required');
  // Equal-area z strips, with a golden-angle rotation to avoid aligned columns.
  const golden = Math.PI*(3-Math.sqrt(5));
  return Array.from({length:count}, (_,i) => {
    const z = 1-2*(i+0.5)/count, radius = Math.sqrt(1-z*z), phi = i*golden;
    return [radius*Math.cos(phi), radius*Math.sin(phi), z];
  });
}

export function targetColor(direction) {
  const v = unitDirection(direction), axis = unitDirection([1,-1,1]);
  const cosine = v.reduce((sum,value,i) => sum+value*axis[i],0);
  const spot = Math.exp((cosine-1)/0.14);
  return [0.12+0.84*spot, 0.16+0.65*spot, 0.24+0.28*spot];
}

export function projectColor(target = targetColor, degree = 3, count = 4096) {
  const result = Array.from({length:(degree+1)**2}, () => [0,0,0]);
  for (const v of sphereSamples(count)) {
    const residual = target(v).map(value => value-0.5);
    shBasis(v,degree).forEach((basis,k) => {
      for (let ch=0;ch<3;ch++) result[k][ch] += residual[ch]*basis*4*Math.PI/count;
    });
  }
  return result;
}
