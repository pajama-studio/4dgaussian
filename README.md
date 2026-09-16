# Spacetime Gaussian Research Viewer

An independent Rust/WASM, wgpu, and WGSL browser renderer for the official CVPR 2024 Spacetime Gaussian STG-Lite `sear_steak` model.

- Live viewer: https://gaussian.pajama.studio
- Repository: https://github.com/pajama-studio/4dgaussian

The demo uses 108,317 learned Gaussians from the 21-camera Neural 3D Video capture. It implements temporal opacity, cubic motion, quaternion evolution, anisotropic screen-space covariance, CPU visibility/global ordering, and premultiplied Gaussian compositing. The source records stay GPU-resident; each frame uploads only ordered 32-bit indices. A comparison mode synchronizes the calibrated `cam00` render with the official RGB video at selectable playback rates. Feature-gated GPU timestamp queries measure the raster pass through an asynchronous three-slot readback ring.

An explicitly source-only `02_Flames` preview tests on-demand Media Source delivery with nine two-second fMP4 fragments. It is kept separate from the active reconstruction: the matching official model has 332,865 splats and remains a candidate for the progressive model-delivery/GPU-preprocess stage.

The v0.8 interface is a two-column workbench: the left side selects the live 4D fixture or segmented source preview, and the right side owns the active player. Selecting the source preview suspends STG rendering rather than consuming GPU time behind a hidden canvas. The checked-in Pajama Studio mark is reused for the favicon, header and footer.

Long-form technical material lives at `/docs/` instead of competing with the player. The all-English field guide separates containers, schemas, semantics, rendering contracts, and delivery contracts across point clouds, NeRF, 3DGS, and dynamic Gaussian methods. It includes interactive representation, alpha-order, PLY-contract, and memory-budget labs; every technical chapter links primary papers, official specifications, or official implementations next to the claims it supports.

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

- This project loads a pretrained research model; it does not reconstruct or train one.
- It is not Peripheral technology and makes no claim about Peripheral's private representation.
- The fMP4 preview is a bounded video-delivery experiment, not a production model-streaming architecture or proof of native mobile/CUDA/Metal experience.
- The source dataset designates `cam00` as a test camera, but this checkpoint is named `allcam`; the RGB wipe is an alignment aid, not a held-out evaluation.
- The model and source capture are non-commercial research/evaluation assets. See [`public/data/THIRD_PARTY_NOTICES.md`](public/data/THIRD_PARTY_NOTICES.md).

See [`STG_LITE_FORMAT.md`](STG_LITE_FORMAT.md) for the checked field/activation/camera contract, [`DESIGN.md`](DESIGN.md) for the renderer architecture, [`PERFORMANCE.md`](PERFORMANCE.md) for reproducible measurements and next gates, [`RENDERER_COMPARISON.md`](RENDERER_COMPARISON.md) for the bounded Spark/PlayCanvas comparison, and [`RESEARCH_FIXTURES.md`](RESEARCH_FIXTURES.md) for the evaluated research datasets/demos and selection rationale.

The public research context that motivated the prototype is preserved in [`docs/PERIPHERAL_VIEWER_CONTEXT.md`](docs/PERIPHERAL_VIEWER_CONTEXT.md). It distinguishes public evidence from inference and does not claim knowledge of any company's private renderer or data format.
