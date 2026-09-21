// This lab shades known synthetic surfels. It does not infer materials from RGB.
struct Globals {
    vp: mat4x4<f32>,
    eye: vec4<f32>,
    light: vec4<f32>, // toward light, perpendicular incident irradiance
    material: vec4<f32>, // perceptual roughness, metallic, mode, unused
    viewport: vec4<f32>, // width, height, sRGB attachment flag, unused
};
struct Splat {
    center: vec4<f32>, // xyz, opacity
    u: vec4<f32>, v: vec4<f32>, w: vec4<f32>, // transformed covariance axes
    normal: vec4<f32>, base: vec4<f32>, // linear RGB, NOT observed RGB
};
@group(0) @binding(0) var<uniform> g: Globals;
@group(0) @binding(1) var<storage, read> splats: array<Splat>;
struct Out {
    @builtin(position) clip: vec4<f32>,
    @location(0) local: vec2<f32>,
    @location(1) @interpolate(flat) radiance: vec3<f32>,
    @location(2) @interpolate(flat) opacity: f32,
};

// ANCHOR: brdf
fn masking(cosine: f32, a2: f32) -> f32 {
    return 2.0 * cosine / max(cosine + sqrt(a2 + (1.0-a2)*cosine*cosine), 1e-6);
}
fn shade(s: Splat) -> vec3<f32> {
    let n = normalize(s.normal.xyz);
    let v = normalize(g.eye.xyz - s.center.xyz);
    let l = g.light.xyz;
    let mode = u32(g.material.z);
    if mode == 3u { return n * 0.5 + 0.5; }
    if mode == 4u { return s.base.xyz; }
    let nl = max(dot(n,l), 0.0);
    let nv = max(dot(n,v), 0.0);
    if nl <= 0.0 || nv <= 0.0 { return vec3(0.0); }
    let h = normalize(l+v);
    let nh = max(dot(n,h), 0.0);
    let vh = max(dot(v,h), 0.0);
    let a = g.material.x * g.material.x;
    let a2 = a*a;
    let denominator = nh*nh*(a2-1.0)+1.0;
    let d = a2 / (3.14159265359 * denominator * denominator);
    let f0 = mix(vec3(0.04), s.base.xyz, g.material.y);
    let fresnel = f0 + (1.0-f0)*pow(1.0-vh, 5.0);
    let geometry = masking(nl,a2)*masking(nv,a2);
    let specular = d*fresnel*geometry / max(4.0*nl*nv, 1e-6);
    let diffuse = (1.0-fresnel)*(1.0-g.material.y)*s.base.xyz/3.14159265359;
    var brdf = diffuse+specular;
    if mode == 1u { brdf = diffuse; }
    if mode == 2u { brdf = specular; }
    // One white distant light, no occlusion, no indirect illumination.
    return brdf * nl * g.light.w;
}
// END: brdf

fn axis_projection(center: vec4<f32>, axis: vec3<f32>) -> vec2<f32> {
    let delta = g.vp*vec4(axis,0.0);
    return (delta.xy*center.w-center.xy*delta.w)/(center.w*center.w)*g.viewport.xy*0.5;
}
@vertex fn vs_main(@builtin(vertex_index) vi: u32, @builtin(instance_index) si: u32) -> Out {
    let s = splats[si];
    let corners = array<vec2<f32>,6>(vec2(-1.,-1.),vec2(1.,-1.),vec2(-1.,1.),vec2(-1.,1.),vec2(1.,-1.),vec2(1.,1.));
    let q = corners[vi];
    let center = g.vp*vec4(s.center.xyz,1.0);
    let x = axis_projection(center,s.u.xyz);
    let y = axis_projection(center,s.v.xyz);
    let z = axis_projection(center,s.w.xyz);
    let a = x.x*x.x+y.x*y.x+z.x*z.x+0.3;
    let b = x.x*x.y+y.x*y.y+z.x*z.y;
    let c = x.y*x.y+y.y*y.y+z.y*z.y+0.3;
    let delta = sqrt(max((a-c)*(a-c)+4.0*b*b,0.0));
    let major = max((a+c+delta)*0.5,0.1);
    let minor = max((a+c-delta)*0.5,0.1);
    var axis = vec2(1.,0.);
    if abs(b)>1e-5 { axis=normalize(vec2(b,major-a)); }
    else if c>a { axis=vec2(0.,1.); }
    let offset = 3.0*(q.x*sqrt(major)*axis+q.y*sqrt(minor)*vec2(-axis.y,axis.x));
    var out: Out;
    out.clip = center+vec4(offset*2.0/g.viewport.xy*center.w,0.0,0.0);
    out.local = q*3.0;
    out.radiance = shade(s);
    out.opacity = s.center.w;
    if dot(s.normal.xyz,g.eye.xyz-s.center.xyz)<=0.0 { out.opacity=0.0; }
    return out;
}
// ANCHOR: composite
@fragment fn fs_main(input: Out) -> @location(0) vec4<f32> {
    let alpha = min(0.99,input.opacity*exp(-0.5*dot(input.local,input.local)));
    if alpha < 1.0/255.0 { discard; }
    // Premultiplied linear radiance into RGBA16Float, far to near.
    return vec4(input.radiance*alpha,alpha);
}
// END: composite

@group(1) @binding(0) var hdr: texture_2d<f32>;
@vertex fn vs_display(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let p = array<vec2<f32>,3>(vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));
    return vec4(p[i],0.,1.);
}
// ANCHOR: display
@fragment fn fs_display(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> {
    let sample = textureLoad(hdr,vec2<i32>(p.xy),0);
    var linear = sample.rgb + (1.0-sample.a)*vec3(0.006,0.008,0.014);
    if g.material.z < 3.0 { linear = linear/(1.0+linear); }
    // sRGB attachments encode automatically. UNORM canvases need this once.
    if g.viewport.z < 0.5 {
        linear = select(1.055*pow(linear,vec3(1.0/2.4))-0.055,12.92*linear,linear<=vec3(0.0031308));
    }
    return vec4(linear,1.0);
}
// END: display
