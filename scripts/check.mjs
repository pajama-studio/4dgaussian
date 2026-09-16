import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

for (const file of ["public/index.html", "public/styles.css", "public/app.js", "public/stream-player.js", "public/docs/index.html", "public/docs/docs.css", "public/docs/docs.js", "public/docs/representation-3d.js", "src/lib.rs", "src/splat.wgsl"]) {
  const body = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  if (!body.trim()) throw new Error(`${file} is empty`);
}
const moduleCheck = spawnSync(process.execPath, ["--check", "public/app.js"], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
if (moduleCheck.status !== 0) throw new Error(moduleCheck.stderr || moduleCheck.stdout);
const streamModuleCheck = spawnSync(process.execPath, ["--check", "public/stream-player.js"], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
if (streamModuleCheck.status !== 0) throw new Error(streamModuleCheck.stderr || streamModuleCheck.stdout);
const docsModuleCheck = spawnSync(process.execPath, ["--check", "public/docs/docs.js"], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
if (docsModuleCheck.status !== 0) throw new Error(docsModuleCheck.stderr || docsModuleCheck.stdout);
const representationModuleCheck = spawnSync(process.execPath, ["--check", "public/docs/representation-3d.js"], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
if (representationModuleCheck.status !== 0) throw new Error(representationModuleCheck.stderr || representationModuleCheck.stdout);
const wasm = await readFile(new URL("../public/pkg/pajama_gaussian_lab_bg.wasm", import.meta.url));
if (wasm.length < 1000) throw new Error("WASM bundle is unexpectedly small");
const model = await readFile(new URL("../public/data/n3d-sear-steak-stg-lite.ply.gz", import.meta.url));
if (model.length < 10_000_000 || model.length > 11_000_000) {
  throw new Error(`STG research fixture has an unexpected size (${model.length} bytes)`);
}
const cameraFixture = JSON.parse(await readFile(new URL("../public/data/n3d-sear-steak-reference-cameras.json", import.meta.url), "utf8"));
if (cameraFixture.schema !== "pajama.stg.reference-cameras.v1" || cameraFixture.cameras?.length !== 5) {
  throw new Error("Calibrated-camera fixture failed schema/count validation");
}
for (const camera of cameraFixture.cameras) {
  if (camera.rotation?.length !== 3 || camera.rotation.some(row => row.length !== 3) || !(camera.fx > 0 && camera.fy > 0)) {
    throw new Error(`Calibrated camera ${camera.name || "<unnamed>"} is malformed`);
  }
}
const referenceVideo = await readFile(new URL("../public/data/n3d-sear-steak-cam00-reference-960x720.mp4", import.meta.url));
if (referenceVideo.length < 450_000 || referenceVideo.length > 550_000) {
  throw new Error(`RGB reference fixture has an unexpected size (${referenceVideo.length} bytes)`);
}
const streamInit = await readFile(new URL("../public/data/flames-stream/init.mp4", import.meta.url));
if (streamInit.length < 500) throw new Error("02_Flames Media Source init segment is unexpectedly small");
let streamBytes = streamInit.length;
for (let number = 1; number <= 9; number += 1) {
  const name = `segment-${String(number).padStart(3, "0")}.m4s`;
  const segment = await readFile(new URL(`../public/data/flames-stream/${name}`, import.meta.url));
  if (segment.length < 50_000) throw new Error(`${name} is unexpectedly small`);
  streamBytes += segment.length;
}
const logo = await readFile(new URL("../public/pajama-mark.svg", import.meta.url));
const searPoster = await readFile(new URL("../public/data/sear-steak-poster.jpg", import.meta.url));
if (logo.length < 2_000 || searPoster.length < 50_000) throw new Error("Brand or scene-selector artwork is missing");
const page = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
for (const statement of ["108,317 learned Gaussians", "Non-commercial research/evaluation demo", "Open the complete guide", "https://github.com/pajama-studio/4dgaussian", "/docs/"]) {
  if (!page.includes(statement)) throw new Error(`Required viewer statement is missing: ${statement}`);
}
const docs = await readFile(new URL("../public/docs/index.html", import.meta.url), "utf8");
for (const statement of ["A file format is not a rendering contract", "not evidence that I trained the model", "PlayCanvas / SuperSplat", "GPU timestamp query", "Primary and official sources", "NeRF and 3DGS solve the same inverse-rendering loop", "3D Gaussian Splatting, end to end", "4DGS: where time enters the representation", "Dynamic 3D Gaussians", "Stored values are not always runtime values"]) {
  if (!docs.includes(statement)) throw new Error(`Required field-guide statement is missing: ${statement}`);
}
if (/\p{Script=Han}/u.test(docs)) throw new Error("The public field guide must remain fully English");
if ((docs.match(/class="refs"/g) || []).length < 10) throw new Error("Technical field-guide sections need inline reference groups");
console.log(`STG research viewer static checks passed (${(wasm.length / 1048576).toFixed(2)} MiB WASM; ${(model.length / 1048576).toFixed(2)} MiB model; ${(referenceVideo.length / 1048576).toFixed(2)} MiB RGB reference; ${(streamBytes / 1048576).toFixed(2)} MiB segmented 02_Flames preview).`);
