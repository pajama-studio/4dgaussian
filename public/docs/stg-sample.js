import initWasm, { GaussianRenderer } from "/pkg/pajama_gaussian_lab.js?v=relight-1";

const DATA_URL = "/data/n3d-sear-steak-stg-lite.ply.gz";
const LOOP_SECONDS = 10;
const EMPTY_CAMERA = new Float32Array();
const $ = selector => document.querySelector(selector);

function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height };
}

async function downloadAsset(setStatus) {
  if (!("DecompressionStream" in window)) throw new Error("This browser cannot decompress the STG fixture");
  setStatus("Downloading the published STG-Lite fixture…");
  const response = await fetch(DATA_URL);
  if (!response.ok || !response.body) throw new Error("STG fixture request failed (" + response.status + ")");
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// The sample accepts one representation: the actual STG-Lite checkpoint.
export async function mountStgSample() {
  const stage = $("#stg-sample-stage");
  if (!stage) return;
  const canvas = $("#stg-sample-canvas");
  const loading = $("#lab-loading");
  const badge = $("#lab-render-badge");
  const timeInput = $("#demo-time");
  const distanceInput = $("#demo-depth");
  const playButton = $("#demo-play");
  const resetButton = $("#demo-reset");
  const controls = [timeInput, distanceInput, playButton, resetButton];
  controls.forEach(control => { control.disabled = true; });
  if (!navigator.gpu) throw new Error("WebGPU is required to render this STG-Lite model");
  const setStatus = message => { loading.querySelector("span").textContent = message; };
  const bytes = await downloadAsset(setStatus);
  setStatus("Building the WebGPU STG-Lite scene…");
  await initWasm({ module_or_path: "/pkg/pajama_gaussian_lab_bg.wasm?v=relight-1" });
  const renderer = await GaussianRenderer.create(canvas, bytes);

  let yaw = 0, pitch = 0.03, distance = 17.2, time = 5;
  let playing = false, pointer = null, lastFrame = performance.now();
  const updateTime = () => {
    timeInput.value = time.toFixed(2);
    $("#demo-time-output").textContent = time.toFixed(2) + " s";
    playButton.textContent = playing ? "Pause time" : "Play time";
    playButton.setAttribute("aria-pressed", String(playing));
  };
  const updateDistance = () => {
    distanceInput.value = String(distance);
    $("#demo-depth-output").textContent = distance.toFixed(1);
  };
  timeInput.addEventListener("input", () => {
    time = Number(timeInput.value); playing = false; updateTime();
  });
  distanceInput.addEventListener("input", () => {
    distance = Number(distanceInput.value); updateDistance();
  });
  playButton.addEventListener("click", () => { playing = !playing; updateTime(); });
  resetButton.addEventListener("click", () => {
    yaw = 0; pitch = 0.03; distance = 17.2; updateDistance();
  });
  stage.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    pointer = [event.clientX, event.clientY]; stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener("pointermove", event => {
    if (!pointer) return;
    yaw -= (event.clientX - pointer[0]) * 0.004;
    pitch = Math.max(-0.5, Math.min(0.65, pitch + (event.clientY - pointer[1]) * 0.003));
    pointer = [event.clientX, event.clientY];
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) stage.addEventListener(type, () => { pointer = null; });
  stage.addEventListener("wheel", event => {
    event.preventDefault();
    distance = Math.max(9, Math.min(34, distance + event.deltaY * 0.014)); updateDistance();
  }, { passive: false });
  canvas.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") { yaw = 0; pitch = 0.03; distance = 17.2; updateDistance(); }
    if (event.key === "ArrowLeft") yaw -= 0.08;
    if (event.key === "ArrowRight") yaw += 0.08;
    if (event.key === "ArrowUp") pitch = Math.min(0.65, pitch + 0.05);
    if (event.key === "ArrowDown") pitch = Math.max(-0.5, pitch - 0.05);
  });

  window.__stgSampleState = {
    ready: false,
    assetLoaded: true,
    representation: "stg-lite",
    get yaw() { return yaw; },
    get visibleSplats() { return renderer.visible; },
    webGpu: true
  };
  const frame = now => {
    const delta = Math.min(0.08, (now - lastFrame) / 1000);
    lastFrame = now;
    if (playing && !document.hidden) { time = (time + delta) % LOOP_SECONDS; updateTime(); }
    try {
      const { width, height } = resizeCanvas(canvas);
      renderer.render(time, yaw, pitch, distance, width, height, EMPTY_CAMERA);
      badge.textContent = "WebGPU · STG-Lite · " + renderer.visible.toLocaleString() + " visible splats";
      if (!window.__stgSampleState.ready) {
        window.__stgSampleState.ready = true;
        controls.forEach(control => { control.disabled = false; });
        loading.hidden = true;
      }
    } catch (error) {
      console.error("STG sample render failed", error);
      window.__stgSampleState.ready = false;
      playing = false; updateTime();
      controls.forEach(control => { control.disabled = true; });
      badge.textContent = "STG renderer error · " + (error.message || String(error));
      loading.hidden = false;
      loading.querySelector("i").hidden = true;
      setStatus("STG sample failed. Reload to recreate the GPU resources.");
      return;
    }
    requestAnimationFrame(frame);
  };
  frame(performance.now());
}
