// Teaching calculations only. These functions do not emulate a GPU backend.
export function srgbEncode(linear) {
  return linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
}

export function over(front, frontAlpha, back, backAlpha) {
  return front.map((channel, i) => channel * frontAlpha + back[i] * backAlpha * (1 - frontAlpha));
}

export function cutoffNeighbor(offset) {
  const buffer = new ArrayBuffer(4);
  const f32 = new Float32Array(buffer), u32 = new Uint32Array(buffer);
  f32[0] = 1 / 255;
  const cutoff = f32[0];
  // Positive, finite values near this cutoff have monotonically ordered bits.
  u32[0] += offset;
  return { cutoff, value: f32[0], keep: f32[0] >= cutoff };
}
