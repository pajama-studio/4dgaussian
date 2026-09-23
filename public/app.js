import init, { GaussianRenderer } from "/pkg/pajama_gaussian_lab.js?v=stream-2";
import { mountSegmentedVideo } from "/stream-player.js";
import { mountInspector } from "/inspector.mjs";

const DATA_URL = "/data/n3d-sear-steak-stg-lite.ply.gz";
const CAMERA_URL = "/data/n3d-sear-steak-reference-cameras.json";
const LOOP_SECONDS = 50 / 30; // Released checkpoint: 50 training frames, not the full 300-frame source video.
const canvas = document.querySelector("#gaussian-canvas");
const wrap = document.querySelector("#canvas-wrap");
const status = document.querySelector("#runtime-status");
const fallback = document.querySelector("#fallback");
const timeline = document.querySelector("#timeline");
const playButton = document.querySelector("#play");
const timecode = document.querySelector("#timecode");
const adapter = document.querySelector("#adapter");
const loadState = document.querySelector("#load-state");
const viewState = document.querySelector("#view-state");
const cameraMode = document.querySelector("#camera-mode");
const playbackRate = document.querySelector("#playback-rate");
const referenceVideo = document.querySelector("#reference-video");
const compareToggle = document.querySelector("#compare-toggle");
const flamesVideo = document.querySelector("#flames-video");
const workbench = document.querySelector("#workbench");
const stgPane = document.querySelector("#stg-pane");
const flamesPane = document.querySelector("#flames-pane");
const sceneKicker = document.querySelector("#scene-kicker");
const sceneTitle = document.querySelector("#scene-title");
const sceneSummary = document.querySelector("#scene-summary");
mountSegmentedVideo(
  flamesVideo,
  document.querySelector("#flames-stream-status"),
  document.querySelector("#flames-stream-start"),
);
const metrics = {
  fps: document.querySelector("#fps"),
  visible: document.querySelector("#visible"),
  prepare: document.querySelector("#prepare"),
  sort: document.querySelector("#sort"),
  gpu: document.querySelector("#gpu-render"),
  upload: document.querySelector("#upload"),
};

let renderer;
let playing = true;
let time = 0;
let lastFrame = performance.now();
let frameWindow = [];
let lastSubmittedFrames = -1;
let yaw = 0;
let pitch = 0.03;
let distance = 17.2;
let dragging = false;
let pointer = [0, 0];
let pointerStart = [0, 0];
let pointerMoved = false;
let comparing = false;
let activeScene = "stg";
let stgLoadState = "Loading…";
const emptyCamera = new Float32Array();
const referenceCameras = new Map();
function pausePlayback() {
  playing=false;referenceVideo.pause();playButton.textContent="▶";playButton.ariaLabel="Play";
}
const inspector = mountInspector({
  panel:document.querySelector('#gaussian-inspector'),canvas,
  overlay:document.querySelector('#selection-overlay'),getRenderer:()=>renderer,
  pause:pausePlayback,seek:value=>{time=value*LOOP_SECONDS;pausePlayback();timeline.value=time;},workbench,
});

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 1.35);
  const rect = wrap.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = seconds % 60;
  return `${minutes}:${rest.toFixed(3).padStart(6, "0")}`;
}

function updateMetrics(now) {
  if (renderer.submittedFrames !== lastSubmittedFrames) frameWindow.push(now);
  lastSubmittedFrames = renderer.submittedFrames;
  while (frameWindow.length && now - frameWindow[0] > 1000) frameWindow.shift();
  metrics.fps.textContent = frameWindow.length.toString();
  metrics.visible.textContent = renderer.visible.toLocaleString();
  metrics.prepare.textContent = `${renderer.prepareMs.toFixed(2)} ms`;
  metrics.sort.textContent = `${renderer.sortMs.toFixed(2)} ms`;
  const gpuRenderMs = renderer.gpuRenderMs;
  metrics.gpu.textContent = renderer.gpuTimingSupported
    ? (gpuRenderMs >= 0 ? `${gpuRenderMs.toFixed(2)} ms` : "pending")
    : "timing unavailable";
  metrics.gpu.title = renderer.gpuTimingSupported
    ? "GPU render-pass time from WebGPU timestamp queries"
    : "The WebGPU adapter did not expose the optional timestamp-query feature; rendering remains active";
  metrics.upload.textContent = `${(renderer.uploadBytes / 1048576).toFixed(2)} MiB`;
  window.__gaussianMetrics = {
    at: now,
    fps: frameWindow.length,
    source: renderer.sourceCount,
    visible: renderer.visible,
    prepareMs: renderer.prepareMs,
    sortMs: renderer.sortMs,
    gpuRenderMs,
    gpuTimingSupported: renderer.gpuTimingSupported,
    uploadBytes: renderer.uploadBytes,
    dataset: "STG-Lite / N3DV sear_steak",
    camera: cameraMode.value,
    comparison: comparing,
    playbackRate: Number(playbackRate.value),
    referenceTime: comparing ? referenceVideo.currentTime : null,
    activeScene,
  };
}

function showLoadState() {
  loadState.textContent = activeScene === "stg"
    ? stgLoadState
    : "2.03 MiB segmented derivative · 9 fragments";
}

function selectScene(scene) {
  if (scene !== "stg" && scene !== "flames") return;
  activeScene = scene;
  workbench.dataset.scene = scene;
  stgPane.hidden = scene !== "stg";
  flamesPane.hidden = scene !== "flames";
  for (const button of document.querySelectorAll(".scene-card[data-scene]")) {
    const selected = button.dataset.scene === scene;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", selected.toString());
  }
  if (scene === "stg") {
    sceneKicker.textContent = "Live reconstruction";
    sceneTitle.textContent = "Sear steak · STG-Lite";
    sceneSummary.textContent = "Official pretrained model · calibrated camera comparison";
    flamesVideo.pause();
    if (comparing && playing) referenceVideo.play().catch(() => {});
    frameWindow = [];
  } else {
    sceneKicker.textContent = "Streamed source fixture";
    sceneTitle.textContent = "02 Flames · camera 0001";
    sceneSummary.textContent = "Motion-rich source video · matching 4D model not loaded";
    referenceVideo.pause();
    if (flamesVideo.src && !flamesVideo.ended) flamesVideo.play().catch(() => {});
  }
  showLoadState();
  window.__gaussianScene = scene;
  inspector.scene(scene === "stg");
}

function activeCamera() {
  return referenceCameras.get(cameraMode.value) || emptyCamera;
}

function setCameraMode(value) {
  cameraMode.value = referenceCameras.has(value) ? value : "orbit";
  viewState.textContent = cameraMode.value === "orbit" ? "Novel orbit" : `${cameraMode.value} · calibrated`;
}

function setComparison(active) {
  comparing = Boolean(active);
  if (comparing) setCameraMode("cam00");
  wrap.classList.toggle("compare-active", comparing);
  compareToggle.setAttribute("aria-pressed", comparing.toString());
  compareToggle.textContent = comparing ? "Hide RGB" : "Compare RGB";

  if (!comparing) {
    referenceVideo.pause();
    return;
  }

  if (referenceVideo.readyState >= HTMLMediaElement.HAVE_METADATA) {
    referenceVideo.currentTime = Math.min(time, Math.max(0, referenceVideo.duration - 0.001));
  }
  if (playing) referenceVideo.play().catch(() => {});
}

function cameraRecordToGpu(camera) {
  const rotation = camera.rotation;
  const forward = [rotation[0][2], rotation[1][2], rotation[2][2]];
  const up = [-rotation[0][1], -rotation[1][1], -rotation[2][1]];
  const fovY = 2 * Math.atan(camera.height / (2 * camera.fy));
  return new Float32Array([
    ...camera.position,
    ...forward,
    ...up,
    fovY,
    camera.width,
    camera.height,
  ]);
}

function frame(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  if (activeScene !== "stg") {
    requestAnimationFrame(frame);
    return;
  }
  if (playing) {
    if (comparing && referenceVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !referenceVideo.paused) {
      if (referenceVideo.currentTime >= LOOP_SECONDS) referenceVideo.currentTime = 0;
      time = referenceVideo.currentTime;
    } else {
      time = (time + dt * Number(playbackRate.value)) % LOOP_SECONDS;
    }
  }
  timeline.value = time.toFixed(3);
  timecode.textContent = formatTime(time);
  resize();
  try {
    renderer.render(Math.min(time / LOOP_SECONDS, 1 - 1e-7) * 10, yaw, pitch, distance, canvas.width, canvas.height, activeCamera());
    updateMetrics(now);
    inspector.onFrame(now);
  } catch (error) {
    console.error(error);
    status.textContent = "Render error — inspect console";
  }
  requestAnimationFrame(frame);
}

async function loadResearchAsset() {
  if (!("DecompressionStream" in window)) {
    throw new Error("This browser does not support streaming gzip decompression");
  }
  status.textContent = "Downloading research model…";
  stgLoadState = "Downloading 10 MiB STG-Lite fixture";
  showLoadState();
  const response = await fetch(DATA_URL);
  if (!response.ok || !response.body) {
    throw new Error(`Research asset request failed (${response.status})`);
  }
  const compressedBytes = Number(response.headers.get("content-length") || 0);
  const decompressedStream = response.body.pipeThrough(new DecompressionStream("gzip"));
  const plyBuffer = await new Response(decompressedStream).arrayBuffer();
  stgLoadState = `${(compressedBytes / 1048576).toFixed(1)} MiB compressed · ${(plyBuffer.byteLength / 1048576).toFixed(1)} MiB decoded PLY`;
  showLoadState();
  return new Uint8Array(plyBuffer);
}

async function loadReferenceCameras() {
  const response = await fetch(CAMERA_URL);
  if (!response.ok) throw new Error(`Reference-camera request failed (${response.status})`);
  const fixture = await response.json();
  if (fixture.schema !== "pajama.stg.reference-cameras.v1" || !Array.isArray(fixture.cameras)) {
    throw new Error("Reference-camera fixture has an unexpected schema");
  }
  for (const camera of fixture.cameras) {
    referenceCameras.set(camera.name, cameraRecordToGpu(camera));
    const option = document.createElement("option");
    option.value = camera.name;
    option.textContent = `${camera.name} · calibrated`;
    cameraMode.append(option);
  }
}

timeline.addEventListener("input", () => {
  time = Number(timeline.value);
  playing = false;
  referenceVideo.pause();
  if (referenceVideo.readyState >= HTMLMediaElement.HAVE_METADATA) referenceVideo.currentTime = time;
  playButton.textContent = "▶";
  playButton.ariaLabel = "Play";
});
playButton.addEventListener("click", () => {
  playing = !playing;
  playButton.textContent = playing ? "Ⅱ" : "▶";
  playButton.ariaLabel = playing ? "Pause playback" : "Play";
  if (comparing) {
    if (playing) referenceVideo.play().catch(() => {});
    else referenceVideo.pause();
  }
});
document.querySelector("#reset-camera").addEventListener("click", () => {
  yaw = 0;
  pitch = 0.03;
  distance = 17.2;
  setCameraMode("cam00");
});
cameraMode.addEventListener("change", () => {
  setCameraMode(cameraMode.value);
  if (cameraMode.value !== "cam00") setComparison(false);
});
compareToggle.addEventListener("click", () => setComparison(!comparing));
playbackRate.addEventListener("change", () => {
  referenceVideo.playbackRate = Number(playbackRate.value);
});
for (const button of document.querySelectorAll(".scene-card[data-scene]")) {
  button.addEventListener("click", () => selectScene(button.dataset.scene));
}
referenceVideo.addEventListener("loadedmetadata", () => {
  referenceVideo.playbackRate = Number(playbackRate.value);
  if (comparing) referenceVideo.currentTime = Math.min(time, Math.max(0, referenceVideo.duration - 0.001));
});
wrap.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || event.target.closest('button,select,input,a,.metrics-panel,.scene-badge')) return;
  dragging = true;
  pointer = [event.clientX, event.clientY];
  pointerStart = [...pointer];
  pointerMoved = false;
  wrap.setPointerCapture(event.pointerId);
});
wrap.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  if (!pointerMoved) {
    if (Math.hypot(event.clientX-pointerStart[0],event.clientY-pointerStart[1]) < 4) return;
    pointerMoved=true;
    setComparison(false);
    setCameraMode("orbit");
  }
  yaw -= (event.clientX - pointer[0]) * 0.004;
  pitch = Math.max(-0.5, Math.min(0.65, pitch + (event.clientY - pointer[1]) * 0.003));
  pointer = [event.clientX, event.clientY];
});
wrap.addEventListener("pointerup", event => {
  if (!dragging) return;
  dragging=false;
  if (!pointerMoved && inspector.enabled) {
    // Disable the RGB overlay before selecting the rendered splat at this pixel.
    setComparison(false);
    const rect=canvas.getBoundingClientRect();
    inspector.pickAt((event.clientX-rect.left)*canvas.width/rect.width,(event.clientY-rect.top)*canvas.height/rect.height);
  }
});
wrap.addEventListener("pointercancel", () => { dragging = false; });
wrap.addEventListener("wheel", (event) => {
  event.preventDefault();
  setComparison(false);
  setCameraMode("orbit");
  distance = Math.max(9, Math.min(34, distance + event.deltaY * 0.014));
}, { passive: false });

async function start() {
  if (!navigator.gpu) throw new Error("This browser does not expose WebGPU");
  await init({module_or_path:"/pkg/pajama_gaussian_lab_bg.wasm?v=stream-2"});
  resize();
  const [plyData] = await Promise.all([loadResearchAsset(), loadReferenceCameras()]);
  status.textContent = "Building GPU-resident scene…";
  renderer = await GaussianRenderer.create(canvas, plyData);
  inspector.ready(renderer.sourceCount);
  setCameraMode("cam00");
  const timingLabel = renderer.gpuTimingSupported ? "GPU pass timer active" : "GPU pass timer unavailable · rendering active";
  adapter.textContent = `${renderer.adapterName || "Browser WebGPU adapter"} · ${renderer.sourceCount.toLocaleString()} learned splats · ${timingLabel}`;
  status.textContent = "Research model active";
  selectScene(activeScene);
  requestAnimationFrame((now) => {
    lastFrame = now;
    frame(now);
  });
}

start().catch((error) => {
  console.error(error);
  status.textContent = "Viewer unavailable";
  fallback.hidden = false;
  fallback.querySelector("p").textContent = error.message;
});
