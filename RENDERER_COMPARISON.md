# Renderer comparison (checked 2026-09-16)

## Conclusion

This viewer is not a stronger general-purpose Gaussian platform than Spark or PlayCanvas. Its defensible advantage is narrower: it implements the published STG-Lite temporal contract directly and packages calibrated source comparison plus explicit profiling into one reproducible research fixture.

Spark is the stronger choice for programmable Three.js splats, broad input formats, streaming/LOD, editing, animation, XR, and device reach. PlayCanvas is the stronger choice for a complete WebGPU/WebGL engine, SuperSplat editing/publishing, SOG conversion and streamed LOD, and integration with ordinary game/app content.

## Capability matrix

| Area | Pajama STG lab | Spark 2 | PlayCanvas / SuperSplat |
| --- | --- | --- | --- |
| Primary representation | The exact 32-float STG-Lite research record | General 3DGS objects and procedural splat generators | Standard 3DGS resources, especially SOG/streamed SOG |
| Continuous learned time | Direct temporal RBF opacity, cubic translation and quaternion evolution from one STG model | Arbitrary GPU modifiers and animation can vary splats over time, but no documented STG-Lite loader | Official example animates a sequence of PLY frames; the general 4D feature request remains open |
| Runtime | Rust/WASM, wgpu, WGSL, WebGPU | Three.js, GLSL and WebGL2 | PlayCanvas Engine with WebGPU and WebGL2 fallback |
| Validation in this demo | Official cameras, synchronized RGB wipe, clock delta, fixed-frame PSNR/SSIM diagnostic, CPU prepare/sort and optional GPU pass timestamps | Application-defined | Viewer MiniStats/debug support; application-specific source truth remains application-defined |
| Scale today | 108,317 source splats; whole 10.27 MiB compressed model; 160k safety cap | ReadableStream input, paged splat trees and LOD intended for very large files | Streamed SOG octree and LOD intended for scenes with tens of millions of Gaussians |
| Formats | One strict STG-Lite PLY contract | PLY/compressed PLY, SPZ, SPLAT, KSPLAT, SOG, ZIP, RAD and more | PLY/compressed PLY, SOG, Streamed SOG, SPZ, LCC/LCC2, KSPLAT, SPLAT and more through the ecosystem |
| Content tooling | None | Runtime editing, Dyno graph, skinning and Three.js integration | SuperSplat, splat-transform, viewer, Editor and engine integration |

This matrix compares documented capabilities, not frame rates. No same-scene, same-camera, same-resolution benchmark of the three renderers has been run.

## Where this implementation is stronger

1. **STG-Lite is native rather than approximated.** The shader evaluates the model's own time center/scale, polynomial motion and quaternion velocity. A static loader, a rigidly animated splat object, and a PLY flipbook are different contracts.
2. **The source observation is part of the UI.** The calibrated `cam00` render and RGB derivative share the media clock and can be wiped side by side. Camera conventions and temporal alignment are visible failures rather than assumptions.
3. **The performance boundary is explicit.** CPU preparation, the sort subset, order-index upload, presentation FPS, and the render pass (when timestamp queries exist) are reported separately.
4. **The parser fails closed.** The Rust loader accepts the checked STG-Lite field order instead of interpreting any PLY as compatible Gaussian data.

## Where it is weaker

- It has one supported research schema and one live model.
- It does not yet stream or progressively refine model data.
- Visibility and global sorting are CPU baselines.
- It has no editor, general content pipeline, WebGL fallback, WebXR support, scene ecosystem, or million-splat proof.
- Its diagnostic image scores use an `allcam` checkpoint and delivery transcode, so they are not held-out benchmark results.

## Is there a PlayCanvas version?

There is a mature official PlayCanvas Gaussian renderer and SuperSplat viewer. It is a strong option for ordinary 3DGS/SOG assets and large streamed scenes. PlayCanvas also publishes a flipbook helper that dynamically loads a numbered sequence of PLY frames. That is not the same as loading this STG-Lite PLY: the STG file stores continuous-time parameters per Gaussian and requires custom temporal evaluation before projection. The engine's public general-4D support request is still open, so an apples-to-apples PlayCanvas version would require a custom resource parser and shader path rather than a configuration switch.

## Why GPU pass timing can be unavailable

WebGPU defines features as optional capabilities that vary by implementation, hardware, driver and system software. `timestamp-query` is one of those optional feature names. It also exposes a high-precision GPU timer, so the specification discusses reduced precision and security/privacy constraints. The viewer checks `adapter.features` before device creation and requests timestamp support only when advertised. If it is absent, the same WebGPU render path runs without query sets; the UI reports `timing unavailable` instead of estimating a GPU duration from CPU wall time.

## Primary sources

- Spark overview and feature set: https://sparkjs.dev/docs/overview/
- Spark system design: https://sparkjs.dev/docs/system-design/
- Spark 2 streaming/LOD design: https://sparkjs.dev/docs/new-features-2.0/
- PlayCanvas Gaussian workflow: https://developer.playcanvas.com/user-manual/gaussian-splatting/
- PlayCanvas Streamed SOG specification: https://developer.playcanvas.com/user-manual/gaussian-splatting/formats/streamed-sog/
- PlayCanvas SuperSplat viewer: https://github.com/playcanvas/supersplat-viewer
- PlayCanvas PLY flipbook example: https://github.com/playcanvas/engine/blob/main/examples/src/examples/gaussian-splatting/flipbook.example.mjs
- PlayCanvas general 4D feature request: https://github.com/playcanvas/engine/issues/8158
- STG official implementation/models: https://github.com/oppo-us-research/SpacetimeGaussians
- WebGPU optional capabilities and `timestamp-query`: https://www.w3.org/TR/webgpu/#features
