// Same temporal threshold and center-frustum policy as stg_prepare.rs.
// This is instance culling, not occlusion or conservative ellipse culling.
struct Params { vp: mat4x4<f32>, depth_row: vec4<f32>, scene: vec4<f32> };
struct Splat { a: vec4<f32>, b: vec4<f32>, c: vec4<f32>, d: vec4<f32>, e: vec4<f32>, f: vec4<f32>, g: vec4<f32>, h: vec4<f32> };
struct Draw { vertices: u32, count: atomic<u32>, first: u32, base: u32 };
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage, read> source: array<Splat>;
@group(0) @binding(2) var<storage, read_write> keys: array<vec2<u32>>;
@group(0) @binding(3) var<storage, read_write> draw: Draw;
var<workgroup> visible: atomic<u32>;

@compute @workgroup_size(128)
fn cull(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_index) lane: u32) {
  if (lane == 0u) { atomicStore(&visible, 0u); }
  workgroupBarrier();
  let id = gid.x;
  if (id < arrayLength(&source)) {
    let s = source[id];
    let dt = p.scene.x - s.a.w;
    let dt2 = dt * dt;
    let center = s.a.xyz + s.c.xyz * dt + vec3<f32>(s.c.w, s.d.xy) * dt2 + vec3<f32>(s.d.zw, s.e.x) * (dt2 * dt);
    let ratio = dt / max(exp(s.b.x), 0.000001);
    let opacity = (1.0 / (1.0 + exp(-s.f.x))) * exp(-(ratio * ratio));
    let clip = p.vp * vec4<f32>(center, 1.0);
    let ndc = clip.xyz / clip.w;
    var key = 0xffffffffu; // Invisible instances sort after every finite depth.
    if (opacity >= 0.003921568627 && clip.w > 0.0 && abs(ndc.x) <= 1.35 && abs(ndc.y) <= 1.35 && ndc.z >= 0.0 && ndc.z <= 1.0) {
      let depth = dot(p.depth_row, vec4<f32>(center, 1.0));
      let bits = bitcast<u32>(depth);
      key = ~(bits ^ select(0x80000000u, 0xffffffffu, (bits >> 31u) != 0u));
      atomicAdd(&visible, 1u);
    }
    keys[id] = vec2<u32>(key, id);
  }
  workgroupBarrier();
  if (lane == 0u) { atomicAdd(&draw.count, atomicLoad(&visible)); }
}
