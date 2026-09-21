// ANCHOR: layout
struct Uniforms { view_projection: mat4x4<f32>, viewport_stage: vec4<f32> };
struct Instance { center_alpha: vec4<f32>, scale_pad: vec4<f32>, color_pad: vec4<f32> };
@group(0) @binding(0) var<uniform> globals: Uniforms;
@group(0) @binding(1) var<storage, read> instances: array<Instance>;
struct Out {
    @builtin(position) clip: vec4<f32>,
    @location(0) local: vec2<f32>,
    @location(1) rgba: vec4<f32>,
};
// END: layout

fn corner(i: u32) -> vec2<f32> {
    let corners = array<vec2<f32>, 6>(vec2(-1., -1.), vec2(1., -1.), vec2(-1., 1.), vec2(-1., 1.), vec2(1., -1.), vec2(1., 1.));
    return corners[i];
}

// ANCHOR: jacobian
fn project_axis(center: vec4<f32>, axis: vec3<f32>) -> vec2<f32> {
    let delta = globals.view_projection * vec4(axis, 0.0);
    // Quotient rule for (clip.xy / clip.w), then NDC -> pixels.
    return (delta.xy * center.w - center.xy * delta.w) / (center.w * center.w) * globals.viewport_stage.xy * 0.5;
}
// END: jacobian

@vertex fn vs_main(@builtin(vertex_index) vertex: u32, @builtin(instance_index) index: u32) -> Out {
    let stage = u32(globals.viewport_stage.z);
    var out: Out;
    // ANCHOR: triangle
    if stage == 1u {
        let positions = array<vec2<f32>, 3>(vec2(-0.7, -0.6), vec2(0.7, -0.6), vec2(0.0, 0.7));
        let colors = array<vec3<f32>, 3>(vec3(1., 0., 0.), vec3(0., 1., 0.), vec3(0., 0., 1.));
        out.clip = vec4(positions[vertex], 0.5, 1.0);
        out.local = vec2(0.0);
        out.rgba = vec4(colors[vertex], 1.0);
        return out;
    }
    // END: triangle
    let splat = instances[index];
    let q = corner(vertex);
    out.local = q * 3.0;
    out.rgba = vec4(splat.color_pad.xyz, splat.center_alpha.w);
    if stage < 5u {
        out.clip = vec4(q * vec2(0.72, 0.62), 0.5, 1.0);
        return out;
    }
    // ANCHOR: covariance
    let center = globals.view_projection * vec4(splat.center_alpha.xyz, 1.0);
    let scale = splat.scale_pad.xyz;
    // Axis-aligned world ellipsoids here; the real pass also rotates these axes.
    let a0 = project_axis(center, vec3(scale.x, 0., 0.));
    let a1 = project_axis(center, vec3(0., scale.y, 0.));
    let a2 = project_axis(center, vec3(0., 0., scale.z));
    let a = a0.x*a0.x + a1.x*a1.x + a2.x*a2.x + 0.3;
    let b = a0.x*a0.y + a1.x*a1.y + a2.x*a2.y;
    let c = a0.y*a0.y + a1.y*a1.y + a2.y*a2.y + 0.3;
    let root = sqrt(max(0.0, (a-c)*(a-c) + 4.0*b*b));
    let large = max(0.1, 0.5*(a+c+root));
    let small = max(0.1, 0.5*(a+c-root));
    var axis = vec2(1.0, 0.0);
    if abs(b) > 0.00001 { axis = normalize(vec2(b, large-a)); }
    else if c > a { axis = vec2(0.0, 1.0); }
    let perpendicular = vec2(-axis.y, axis.x);
    let pixels = 3.0 * (q.x * sqrt(large) * axis + q.y * sqrt(small) * perpendicular);
    let ndc = pixels * 2.0 / globals.viewport_stage.xy;
    out.clip = center + vec4(ndc * center.w, 0.0, 0.0);
    // END: covariance
    return out;
}

// ANCHOR: fragment
@fragment fn fs_main(input: Out) -> @location(0) vec4<f32> {
    let stage = u32(globals.viewport_stage.z);
    if stage <= 2u { return vec4(input.rgba.rgb, 1.0); }
    let weight = exp(-0.5 * dot(input.local, input.local));
    let alpha = min(0.99, input.rgba.a * weight);
    if alpha < 1.0 / 255.0 { discard; }
    return vec4(input.rgba.rgb * alpha, alpha);
}
// END: fragment
