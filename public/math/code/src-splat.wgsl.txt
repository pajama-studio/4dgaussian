struct Camera {
  view_proj: mat4x4<f32>,
  viewport: vec4<f32>,
  scene: vec4<f32>,
};

// Exact 32-float row layout of the public STG-Lite PLY model.
struct SourceSplat {
  r0: vec4<f32>, // xyz, temporal center
  r1: vec4<f32>, // temporal log-scale, unused normal xyz
  r2: vec4<f32>, // linear motion xyz, quadratic x
  r3: vec4<f32>, // quadratic yz, cubic xy
  r4: vec4<f32>, // cubic z, RGB feature
  r5: vec4<f32>, // opacity logit, log scale xyz
  r6: vec4<f32>, // quaternion wxyz
  r7: vec4<f32>, // quaternion velocity wxyz
};

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<storage, read> splats: array<SourceSplat>;

struct VertexInput {
  @builtin(vertex_index) vertex_index: u32,
  @location(0) source_index: u32,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) local: vec2<f32>,
  @location(1) color_opacity: vec4<f32>,
};

fn quad_corner(index: u32) -> vec2<f32> {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0, -1.0), vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0), vec2<f32>( 1.0, -1.0), vec2<f32>( 1.0,  1.0)
  );
  return corners[index];
}

fn projected_axis(center_clip: vec4<f32>, axis: vec3<f32>) -> vec2<f32> {
  // Exact first-order derivative of ndc = clip.xy / clip.w along a world-space
  // covariance axis. This is the homogeneous form of the perspective Jacobian.
  let axis_clip = camera.view_proj * vec4<f32>(axis, 0.0);
  let w2 = max(center_clip.w * center_clip.w, 0.00000001);
  let ndc_derivative = (
    axis_clip.xy * center_clip.w - center_clip.xy * axis_clip.w
  ) / w2;
  return ndc_derivative * camera.viewport.xy * 0.5;
}

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  let splat = splats[input.source_index];
  let dt = camera.scene.x - splat.r0.w;
  let dt2 = dt * dt;
  let motion_linear = splat.r2.xyz;
  let motion_quadratic = vec3<f32>(splat.r2.w, splat.r3.x, splat.r3.y);
  let motion_cubic = vec3<f32>(splat.r3.z, splat.r3.w, splat.r4.x);
  let center = splat.r0.xyz
    + motion_linear * dt
    + motion_quadratic * dt2
    + motion_cubic * dt2 * dt;

  let temporal_scale = max(exp(splat.r1.x), 0.000001);
  let temporal_opacity = exp(-pow(dt / temporal_scale, 2.0));
  let opacity = (1.0 / (1.0 + exp(-splat.r5.x))) * temporal_opacity;
  let scales = exp(splat.r5.yzw);
  let quaternion = normalize(splat.r6 + dt * splat.r7);
  let w = quaternion.x;
  let x = quaternion.y;
  let y = quaternion.z;
  let z = quaternion.w;

  // Rows of GLM's column-major 3DGS quaternion matrix, scaled into covariance axes.
  // This yields Sigma = R^T S^2 R, matching the reference covariance construction.
  let axis0 = scales.x * vec3<f32>(
    1.0 - 2.0 * (y * y + z * z),
    2.0 * (x * y + w * z),
    2.0 * (x * z - w * y)
  );
  let axis1 = scales.y * vec3<f32>(
    2.0 * (x * y - w * z),
    1.0 - 2.0 * (x * x + z * z),
    2.0 * (y * z + w * x)
  );
  let axis2 = scales.z * vec3<f32>(
    2.0 * (x * z + w * y),
    2.0 * (y * z - w * x),
    1.0 - 2.0 * (x * x + y * y)
  );

  let center_clip = camera.view_proj * vec4<f32>(center, 1.0);
  let d0 = projected_axis(center_clip, axis0);
  let d1 = projected_axis(center_clip, axis1);
  let d2 = projected_axis(center_clip, axis2);

  // Project J W Sigma W^T J^T by summing the projected covariance axes.
  let cov_a = dot(vec3<f32>(d0.x, d1.x, d2.x), vec3<f32>(d0.x, d1.x, d2.x)) + 0.3;
  let cov_b = d0.x * d0.y + d1.x * d1.y + d2.x * d2.y;
  let cov_c = dot(vec3<f32>(d0.y, d1.y, d2.y), vec3<f32>(d0.y, d1.y, d2.y)) + 0.3;
  let discriminant = sqrt(max(0.0, (cov_a - cov_c) * (cov_a - cov_c) + 4.0 * cov_b * cov_b));
  let lambda_major = max(0.1, 0.5 * (cov_a + cov_c + discriminant));
  let lambda_minor = max(0.1, 0.5 * (cov_a + cov_c - discriminant));

  var major_axis = vec2<f32>(1.0, 0.0);
  if (abs(cov_b) > 0.00001) {
    major_axis = normalize(vec2<f32>(cov_b, lambda_major - cov_a));
  } else if (cov_c > cov_a) {
    major_axis = vec2<f32>(0.0, 1.0);
  }
  let minor_axis = vec2<f32>(-major_axis.y, major_axis.x);
  let corner = quad_corner(input.vertex_index);
  let sigma_major = min(sqrt(lambda_major), 192.0);
  let sigma_minor = min(sqrt(lambda_minor), 192.0);
  let pixel_offset = 3.0 * (
    major_axis * sigma_major * corner.x
    + minor_axis * sigma_minor * corner.y
  );
  let ndc_offset = pixel_offset * vec2<f32>(2.0 * camera.viewport.z, 2.0 * camera.viewport.w);

  var output: VertexOutput;
  output.position = center_clip + vec4<f32>(ndc_offset * center_clip.w, 0.0, 0.0);
  output.local = corner * 3.0;
  output.color_opacity = vec4<f32>(clamp(splat.r4.yzw, vec3<f32>(0.0), vec3<f32>(1.0)), opacity);
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  let power = -0.5 * dot(input.local, input.local);
  let alpha = min(0.99, input.color_opacity.a * exp(power));
  if (alpha < 0.0039215686) {
    discard;
  }
  return vec4<f32>(input.color_opacity.rgb * alpha, alpha);
}
