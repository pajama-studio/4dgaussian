# Gaussian relighting extension

Research checked 2026-09-21. Public entry: /relight/; executable browser lab: /relight/lab/.

## Delivered

- Eight bilingual lessons with 15 KaTeX/MathML equations, numerical examples, source excerpts and self-checks.
- Seven official research entries separating available code from paper-only/unverified releases; GAMES101/202, PBRT and Filament learning links.
- 1,536 authored Gaussian surfels on a deforming analytic ellipsoid, with known outward normals and linear base color.
- White directional light with independent azimuth/elevation/intensity; perceptual roughness and metallic controls; camera orbit and a ten-second deformation loop.
- Combined, diffuse, specular, world-normal and base-color views.
- Intentional incorrect normal transform toggle to compare A n with normalize(A^-T n).
- Shared Rust RelightPass: CPU deformation/sorting → WGSL per-surfel single-scattering GGX → premultiplied RGBA16Float → fullscreen Reinhard/sRGB. The pass accepts a device, queue, encoder, attachment and frame input; no window/DOM ownership.

## Source and data contracts

The 96-byte Splat is six aligned vec4 fields: center/opacity, three covariance axes, outward normal and base color. Roughness/metallic are uniforms for this single-material object. The full 128-byte Globals layout matches WGSL.

The directions n, l, v are outward normal, surface-to-light and surface-to-camera. Roughness r becomes GGX a=r²; distribution/masking use a²=r⁴. Base color is (0.55,0.14,0.045) in linear RGB. This is not captured radiance and not an appearance-SH coefficient.

The shape transform is nonsingular rotation × nonuniform scale. Tangent covariance axes transform by A; normals transform by A^-T. Backface culling uses the chosen normal. In the intentionally incorrect mode even backface classification can become wrong; primitive positions and covariance stay unchanged.

The STG-Lite research model continues to use its original direct-RGB renderer. Its normal-named slots are not verified material geometry. Relighting is not enabled on that asset.

## Validation

- npm run check: existing math/course/inspector checks; 8 new lessons, 15 MathML equations, local-link/translation validation, source SHA checks; Rust/native/WASM compilation.
- Rust unit tests: nonuniform normal/tangent orthogonality, deliberate wrong-transform failure, normal-incidence Lambert/Fresnel arithmetic, light linearity, backlight rejection, zero metal diffuse, ABI sizes and invalid inputs.
- cargo run --example relight_pixels: 13 native DX12 output images and assertions for light, roughness, material independence, metal diffuse, deformation normals and camera response.
- --srgb repeats with an sRGB attachment, exercising automatic encoding rather than explicit shader encoding.
- Browser: WebGPU startup; material presets, inspection mode, incorrect-normal toggle, playback/pause, language switching with state preservation; mobile viewport and article layout.
- GPU reports/images are written under ignored artifacts/relight/; public/relight/validation.json records the native UNORM run.

Windows/DX12 on RTX 4090 and browser/WebGPU are the validated paths. No macOS/Metal or Linux/Vulkan runtime claim. These are correctness checks, not benchmarks.

## Scope and next gates

This is surface approximation using thin 3D Gaussian footprints, not the perspective-correct 2DGS rasterizer. Each surfel gets constant shading, covariance projection uses a local Jacobian and 0.3-pixel variance floor, and center depth is globally sorted. Tiny highlights can undersample; roughness is bounded at 0.12. Gaussian transparency is a coverage approximation here, not refractive material transmission.

There is no cast-shadow map, environment lighting, interreflection, training optimizer, inferred material, model converter or full paper reproduction. The shape is convex. Backface culling does not solve arbitrary light visibility.

1. Reproduce a released static relightable method and agree on material/normal/lighting export conventions; match its reference under a fixed light.
2. Add diffuse lighting SH and prefiltered specular IBL, with numerical integration comparisons and color-space checks.
3. Add light visibility and a moving-blocker test.
4. Bind an imported dynamic asset consistently to normals/materials and validate temporal flicker.

Recent directions are intentionally separated: TranSplat transfers trained 2DGS under known source/target environment lighting; BecomingLit specializes in head avatars; BEAM concerns volumetric video; DR-GS drives reconstructed assets using simulation/animation deformation. Their inputs and runtime contracts are not interchangeable.
