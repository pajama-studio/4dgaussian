// Portable stable 4-bit LSD radix sort. No subgroups, float quantization,
// global spin locks or cross-workgroup forward-progress assumptions.
// Input starts in source-ID order; stable passes preserve exact-depth ties.
struct Params { count: u32, groups: u32, shift: u32, unused: u32 };
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage, read> input_keys: array<vec2<u32>>;
@group(0) @binding(2) var<storage, read_write> output_keys: array<vec2<u32>>;
@group(0) @binding(3) var<storage, read_write> scratch: array<u32>;
@group(0) @binding(4) var<storage, read_write> indices: array<u32>;
var<workgroup> counts: array<atomic<u32>, 16>;
var<workgroup> scan: array<u32, 256>;
var<workgroup> masks: array<atomic<u32>, 64>;

@compute @workgroup_size(128)
fn histogram(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_index) lane: u32, @builtin(workgroup_id) group: vec3<u32>) {
  if (lane < 16u) { atomicStore(&counts[lane], 0u); }
  workgroupBarrier();
  if (gid.x < p.count) { atomicAdd(&counts[(input_keys[gid.x].x >> p.shift) & 15u], 1u); }
  workgroupBarrier();
  if (lane < 16u) { scratch[lane * p.groups + group.x] = atomicLoad(&counts[lane]); }
}

// One workgroup per digit scans all group histograms in 256-entry tiles.
// Dispatch boundaries supply the global memory ordering.
@compute @workgroup_size(256)
fn prefix(@builtin(local_invocation_index) lane: u32, @builtin(workgroup_id) group: vec3<u32>) {
  var carry = 0u;
  for (var start = 0u; start < p.groups; start += 256u) {
    let i = start + lane;
    var value = 0u;
    if (i < p.groups) { value = scratch[group.x * p.groups + i]; }
    scan[lane] = value;
    workgroupBarrier();
    for (var step = 1u; step < 256u; step *= 2u) {
      var left = 0u;
      if (lane >= step) { left = scan[lane - step]; }
      workgroupBarrier();
      scan[lane] += left;
      workgroupBarrier();
    }
    if (i < p.groups) { scratch[16u * p.groups + group.x * p.groups + i] = carry + scan[lane] - value; }
    carry += scan[255];
    workgroupBarrier();
  }
  if (lane == 0u) { scratch[32u * p.groups + group.x] = carry; }
}

@compute @workgroup_size(128)
fn scatter(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_index) lane: u32, @builtin(workgroup_id) group: vec3<u32>) {
  if (lane < 64u) { atomicStore(&masks[lane], 0u); }
  workgroupBarrier();
  var pair = vec2<u32>(0xffffffffu);
  var digit = 15u;
  if (gid.x < p.count) {
    pair = input_keys[gid.x];
    digit = (pair.x >> p.shift) & 15u;
    atomicOr(&masks[digit * 4u + lane / 32u], 1u << (lane % 32u));
  }
  workgroupBarrier();
  if (gid.x < p.count) {
    var rank = 0u;
    for (var word = 0u; word < lane / 32u; word++) { rank += countOneBits(atomicLoad(&masks[digit * 4u + word])); }
    rank += countOneBits(atomicLoad(&masks[digit * 4u + lane / 32u]) & ((1u << (lane % 32u)) - 1u));
    var base = 0u;
    for (var d = 0u; d < digit; d++) { base += scratch[32u * p.groups + d]; }
    let destination = base + scratch[16u * p.groups + digit * p.groups + group.x] + rank;
    output_keys[destination] = pair;
    if (p.shift == 28u) { indices[destination] = pair.y; }
  }
}
