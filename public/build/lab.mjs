import init, { WorkshopRenderer } from '/pkg/pajama_gaussian_lab.js?v=workshop-1';

const byId = id => document.getElementById(id);
const canvas = byId('gpu-view');
const stage = byId('stage');
const slider = byId('time');
let renderer, playing = false, loaded = false, busy = false, failed = false;
let clock = 0.5, last = 0, yaw = 0, pitch = 0.15, distance = 5, frames = 0;
const language = () => document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';
const say = (en, zh) => language() === 'zh' ? zh : en;
const stages = JSON.parse(byId('milestone-data').textContent);
const initial = Number(new URL(location.href).searchParams.get('stage') ?? 0);
stage.value = String(Number.isInteger(initial) && initial >= 0 && initial <= 7 ? initial : 0);

function describe() {
  const n = Number(stage.value), data = stages[n];
  canvas.style.touchAction = n >= 5 ? 'none' : 'pan-y';
  canvas.setAttribute('aria-label', say('Interactive Gaussian viewer. Stage 5 onward: drag or use arrow keys to orbit; Home resets.', '可交互 Gaussian Viewer。阶段 5 起可拖动或使用方向键绕转，Home 重置。'));
  for (const [i, option] of [...stage.options].entries()) option.textContent = `${i} · ${stages[i].title[language()]}`;
  byId('stage-title').textContent = `${n} / 7 · ${data.title[language()]}`;
  byId('expected').textContent = data.expected[language()];
  byId('stage-blog').href = `/build/${data.post}/?lang=${language()}`;
  byId('source-stage').textContent = data.source;
  byId('source-stage').href = `/build/code/${data.source.replaceAll('/', '-')}.html`;
  byId('camera-controls').hidden = n < 5;
  byId('time-controls').hidden = n < 6;
  byId('reverse-label').hidden = n !== 4;
  byId('load-model').hidden = n !== 7 || loaded;
  byId('load-model').disabled = busy;
  byId('load-model').textContent = busy ? say('Loading model…', '正在加载模型…') : say('Load research model · 10.27 MiB', '加载研究模型 · 10.27 MiB');
  byId('play').textContent = playing ? say('Pause', '暂停') : say('Play · 10 s loop', '播放 · 10 秒循环');
  byId('previous-stage').disabled = n === 0;
  byId('next-stage').disabled = n === 7;
  if (!renderer && !failed) byId('gpu-status').textContent = say('Starting WebGPU…', '正在启动 WebGPU…');
  if (renderer && !failed) byId('gpu-status').textContent = n === 7 && !loaded ? say('Load the model to draw stage 7.', '加载模型后可绘制第 7 阶段。') : `${say('Ready', '已就绪')} · ${renderer.adapter()}`;
}

function changeStage() {
  playing = false; byId('reverse').checked = false;
  const url = new URL(location.href); url.searchParams.set('stage', stage.value); history.replaceState(null, '', url);
  describe();
}
stage.addEventListener('change', changeStage);
byId('previous-stage').onclick = () => { stage.value = String(Math.max(0, Number(stage.value) - 1)); changeStage(); };
byId('next-stage').onclick = () => { stage.value = String(Math.min(7, Number(stage.value) + 1)); changeStage(); };
slider.oninput = () => { clock = Number(slider.value); playing = false; describe(); };
byId('play').onclick = () => { playing = !playing; describe(); };
byId('reset-camera').onclick = () => { yaw = 0; pitch = 0.15; distance = 5; updateCameraControls(); };
for (const key of ['yaw', 'pitch', 'distance']) byId(key).oninput = () => {
  yaw = Number(byId('yaw').value); pitch = Number(byId('pitch').value); distance = Number(byId('distance').value);
};
function updateCameraControls() { byId('yaw').value = yaw; byId('pitch').value = pitch; byId('distance').value = distance; }
let drag;
canvas.onpointerdown = e => { if (Number(stage.value) < 5) return; drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); };
canvas.onpointermove = e => {
  if (!drag) return;
  yaw = Math.max(-3.14, Math.min(3.14, yaw + (e.clientX - drag.x) * 0.008));
  pitch = Math.max(-1.4, Math.min(1.4, pitch + (e.clientY - drag.y) * 0.008));
  drag = { x: e.clientX, y: e.clientY }; updateCameraControls();
};
canvas.onpointerup = canvas.onpointercancel = canvas.onlostpointercapture = () => { drag = null; };
canvas.onkeydown = e => {
  if (Number(stage.value) < 5) return;
  const actions = { ArrowLeft: () => yaw -= 0.1, ArrowRight: () => yaw += 0.1, ArrowUp: () => pitch += 0.1, ArrowDown: () => pitch -= 0.1, Home: () => { yaw = 0; pitch = 0.15; distance = 5; } };
  if (!actions[e.key]) return;
  e.preventDefault(); actions[e.key](); yaw = Math.max(-3.14, Math.min(3.14, yaw)); pitch = Math.max(-1.4, Math.min(1.4, pitch)); updateCameraControls();
};

function fatal(error) {
  failed = true; playing = false;
  byId('gpu-status').textContent = `${say('WebGPU stopped', 'WebGPU 已停止')}: ${error.message || error}`;
  byId('recovery').hidden = false;
  byId('play').disabled = true;
}
byId('reload-gpu').onclick = () => location.reload();
byId('load-model').onclick = async () => {
  if (!renderer || busy || loaded || failed) return;
  byId('model-error').textContent = '';
  busy = true; describe();
  try {
    const response = await fetch('/data/n3d-sear-steak-stg-lite.ply.gz');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!response.body || !globalThis.DecompressionStream) throw new Error(say('This browser cannot decompress gzip streams.', '此浏览器无法解压 gzip 数据流。'));
    const bytes = new Uint8Array(await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    renderer.loadModel(bytes); loaded = true;
  } catch (error) { byId('model-error').textContent = String(error.message || error); }
  finally { busy = false; describe(); }
};

// ANCHOR: browser-frame
function animate(now) {
  if (failed) return;
  const dt = last ? Math.min((now - last) / 1000, 0.1) : 0; last = now;
  if (!document.hidden && renderer) {
    // Physical pixels, capped for this lesson. CSS dimensions stay in CSS pixels.
    const bounds = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.min(2048, Math.round(bounds.width * dpr)));
    const height = Math.max(1, Math.min(2048, Math.round(bounds.height * dpr)));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width; canvas.height = height; renderer.resize(width, height);
    }
    if (playing) clock = (clock + dt / 10) % 1;
    slider.value = clock;
    const n = Number(stage.value);
    if (n !== 7 || loaded) {
      try {
        const count = renderer.render(n, clock, yaw, pitch, distance, byId('reverse').checked);
        if (count >= 0) { frames++; byId('draw-count').textContent = count.toLocaleString(); }
      } catch (error) { fatal(error); return; }
    } else {
      renderer.render(0, clock, yaw, pitch, distance, false);
      byId('draw-count').textContent = '—';
    }
    byId('time-value').textContent = clock.toFixed(3);
    byId('resolution').textContent = `${width} × ${height}`;
    byId('presented').textContent = frames.toLocaleString();
    byId('camera-value').textContent = `${yaw.toFixed(2)} / ${pitch.toFixed(2)} / ${distance.toFixed(1)}`;
  }
  requestAnimationFrame(animate);
}
// END: browser-frame
document.addEventListener('visibilitychange', () => { last = 0; });
document.addEventListener('build-language', describe);
describe();
try {
  if (!navigator.gpu) throw new Error(say('WebGPU is unavailable. Open this page in a WebGPU-capable browser or run the native example.', 'WebGPU 不可用。请使用支持 WebGPU 的浏览器，或运行桌面示例。'));
  await init({ module_or_path: '/pkg/pajama_gaussian_lab_bg.wasm?v=workshop-1' });
  renderer = await WorkshopRenderer.create(canvas);
  describe(); requestAnimationFrame(animate);
} catch (error) { fatal(error); }
window.addEventListener('pagehide', () => { playing = false; });
