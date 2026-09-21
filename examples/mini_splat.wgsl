// Teaching compute rasterizer: one invocation owns one pixel, no triangle pass.
// Inputs must already be sorted back-to-front. Complexity is O(pixels*splats).
struct Splat {
  mean_sigma: vec4<f32>, // camera-space xyz (+Z forward), world-space sigma
  rgb_alpha: vec4<f32>,
};
@group(0) @binding(0) var<storage, read> splats: array<Splat>;
@group(0) @binding(1) var output: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let size = textureDimensions(output);
  if any(id.xy >= size) { return; }
  let pixel = vec2<f32>(id.xy) + 0.5;
  let focal = 0.8 * f32(size.x);
  var color = vec3<f32>(0.0);
  for (var i = 0u; i < arrayLength(&splats); i++) {
    let s = splats[i];
    let p = s.mean_sigma.xyz;
    if p.z <= 0.05 { continue; }
    let center = focal * p.xy / p.z + vec2<f32>(size) * 0.5;
    // Isotropic world covariance projected through the perspective Jacobian.
    let jx = vec3<f32>(focal/p.z, 0.0, -focal*p.x/(p.z*p.z));
    let jy = vec3<f32>(0.0, focal/p.z, -focal*p.y/(p.z*p.z));
    let variance = s.mean_sigma.w * s.mean_sigma.w;
    let a = variance * dot(jx, jx) + 0.3;
    let b = variance * dot(jx, jy);
    let c = variance * dot(jy, jy) + 0.3;
    let d = pixel - center;
    let power = -0.5 * (c*d.x*d.x - 2.0*b*d.x*d.y + a*d.y*d.y) / (a*c-b*b);
    let alpha = min(0.99, s.rgb_alpha.a * exp(power));
    if alpha < 1.0/255.0 { continue; }
    color = s.rgb_alpha.rgb * alpha + color * (1.0-alpha);
  }
  textureStore(output, vec2<i32>(id.xy), vec4<f32>(color, 1.0));
}
