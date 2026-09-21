# Spacetime Gaussian Research Viewer

An independent Rust/WASM, wgpu, and WGSL browser renderer for the official CVPR 2024 Spacetime Gaussian STG-Lite `sear_steak` model.

- Live viewer: https://gaussian.pajama.studio
- Repository: https://github.com/pajama-studio/4dgaussian

Start learning: [4DGS Zero to Hero](https://4dgaussian.pajama.studio/learn/) — 12 bilingual lessons, 60 explanatory steps, live arithmetic experiments and answer-specific feedback, from image formation through training/export to Rust/wgpu. The existing [math handbook](https://4dgaussian.pajama.studio/math/) supplies the full derivations and larger interactive labs. See [course implementation and validation](docs/preparation/zero-to-hero.md).

Chinese study materials: [GS courses and derivations](docs/preparation/09-courses.md), [end-to-end preparation handbook](docs/preparation/README.md), and [local validation / remaining work](docs/preparation/07-validation.md). The handbook includes a synthetic training/export experiment, a native wgpu host, and a small compute rasterizer with CPU pixel comparisons.

The demo uses 108,317 learned Gaussians from the 21-camera Neural 3D Video capture. It implements temporal opacity, cubic motion, quaternion evolution, anisotropic screen-space covariance, CPU visibility/global ordering, and premultiplied Gaussian compositing. The source records stay GPU-resident; each frame uploads only ordered 32-bit indices. A comparison mode synchronizes the calibrated `cam00` render with the official RGB video at selectable playback rates. Feature-gated GPU timestamp queries measure the raster pass through an asynchronous three-slot readback ring.

An explicitly source-only `02_Flames` preview tests on-demand Media Source delivery with nine two-second fMP4 fragments. It is kept separate from the active reconstruction: the matching official model has 332,865 splats and remains a candidate for the progressive model-delivery/GPU-preprocess stage.

The v0.8 interface is a two-column workbench: the left side selects the live 4D fixture or segmented source preview, and the right side owns the active player. Selecting the source preview suspends STG rendering rather than consuming GPU time behind a hidden canvas. The checked-in Pajama Studio mark is reused for the favicon, header and footer.

Long-form technical material lives at `/docs/` instead of competing with the player. The all-English field guide separates containers, schemas, semantics, rendering contracts, and delivery contracts across point clouds, NeRF, 3DGS, and dynamic Gaussian methods. It includes interactive representation, alpha-order, PLY-contract, and memory-budget labs; every technical chapter links primary papers, official specifications, or official implementations next to the claims it supports.

The bilingual [Gaussian inspector](https://4dgaussian.pajama.studio/?inspect=1#workbench) places a selected primitive beside the live scene. Click a pixel or enter a PLY row ID, inspect all 32 stored fields, track the same ID over time, rotate its magnified ellipsoid and SH plots, and export its record and evaluated state as JSON. Picking ranks CPU-evaluated `T × alpha` contributions in the current renderer's depth order, with the same projected footprint and clipping rules; it is not a GPU ID buffer. The source fixture stores direct RGB, so actual mode displays **derived equivalent DC**, while higher-degree SH edits are **synthetic teaching values** that do not modify the scene. See [the inspector implementation guide](docs/preparation/gaussian-inspector.md).

## Run

```sh
npm install
npm run dev
```

Open the Wrangler URL in a current Chrome-family browser with WebGPU and hardware acceleration.

## Verify

```sh
npm run check
npm run profile -- http://127.0.0.1:8787 300
npm run qa -- http://127.0.0.1:8787 /tmp/stg-comparison.png
npm run qa:docs -- http://127.0.0.1:8787
npm run capture:fidelity -- http://127.0.0.1:8787 5 /tmp/stg-render.png
```

`npm run check` runs Rust unit tests, checks the WASM target, rebuilds the browser module, validates JavaScript syntax, verifies the research fixture size, and checks that public evidence-boundary statements remain present.

## Evidence boundary

- The browser fixture is a pretrained research model; this project has not reconstructed or trained that real scene. A separate synthetic teaching experiment demonstrates training and export on five Gaussians.
- It is not Peripheral technology and makes no claim about Peripheral's private representation.
- The fMP4 preview is a bounded video-delivery experiment, not a production model-streaming architecture or proof of native mobile/CUDA/Metal experience.
- The source dataset designates `cam00` as a test camera, but this checkpoint is named `allcam`; the RGB wipe is an alignment aid, not a held-out evaluation.
- The model and source capture are non-commercial research/evaluation assets. See [`public/data/THIRD_PARTY_NOTICES.md`](public/data/THIRD_PARTY_NOTICES.md).

See [`STG_LITE_FORMAT.md`](STG_LITE_FORMAT.md) for the checked field/activation/camera contract, [`DESIGN.md`](DESIGN.md) for the renderer architecture, [`PERFORMANCE.md`](PERFORMANCE.md) for reproducible measurements and next gates, [`RENDERER_COMPARISON.md`](RENDERER_COMPARISON.md) for the bounded Spark/PlayCanvas comparison, and [`RESEARCH_FIXTURES.md`](RESEARCH_FIXTURES.md) for the evaluated research datasets/demos and selection rationale.

The public research context that motivated the prototype is preserved in [`docs/PERIPHERAL_VIEWER_CONTEXT.md`](docs/PERIPHERAL_VIEWER_CONTEXT.md). It distinguishes public evidence from inference and does not claim knowledge of any company's private renderer or data format.
