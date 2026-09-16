import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8793";
const screenshot = process.argv[3] || "/tmp/stg-comparison.png";
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-unsafe-webgpu", "--use-angle=metal", "--autoplay-policy=no-user-gesture-required"],
});

async function collectErrors(page) {
  const errors = [];
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", error => errors.push(error.message));
  return errors;
}

const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const desktopErrors = await collectErrors(desktop);
await desktop.goto(url, { waitUntil: "domcontentloaded" });
await desktop.waitForFunction(() => window.__gaussianMetrics?.visible > 0, null, { timeout: 30_000 });
await desktop.locator("#compare-toggle").click();
await desktop.waitForFunction(() => window.__gaussianMetrics?.comparison === true);
await desktop.waitForTimeout(1200);
await desktop.screenshot({ path: screenshot });
const desktopState = await desktop.evaluate(() => {
  const video = document.querySelector("#reference-video");
  const metrics = window.__gaussianMetrics;
  return {
    metrics,
    camera: document.querySelector("#camera-mode").value,
    button: document.querySelector("#compare-toggle").textContent,
    pressed: document.querySelector("#compare-toggle").getAttribute("aria-pressed"),
    video: {
      currentTime: video.currentTime,
      duration: video.duration,
      paused: video.paused,
      readyState: video.readyState,
      renderedDeltaMs: Math.abs(video.currentTime - Number(document.querySelector("#timeline").value)) * 1000,
    },
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});
await desktop.locator("#playback-rate").selectOption("2");
const speedStart = await desktop.evaluate(() => ({
  wall: performance.now(),
  video: document.querySelector("#reference-video").currentTime,
}));
await desktop.waitForTimeout(1000);
const speedState = await desktop.evaluate(start => {
  const elapsedWall = (performance.now() - start.wall) / 1000;
  const current = document.querySelector("#reference-video").currentTime;
  return {
    selectedRate: Number(document.querySelector("#playback-rate").value),
    mediaRate: document.querySelector("#reference-video").playbackRate,
    effectiveRate: (current - start.video) / elapsedWall,
    renderedDeltaMs: Math.abs(current - Number(document.querySelector("#timeline").value)) * 1000,
  };
}, speedStart);

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
const mobileErrors = await collectErrors(mobile);
await mobile.goto(url, { waitUntil: "domcontentloaded" });
await mobile.waitForFunction(() => window.__gaussianMetrics?.visible > 0, null, { timeout: 30_000 });
await mobile.locator("#compare-toggle").click();
await mobile.waitForFunction(() => window.__gaussianMetrics?.comparison === true);
await mobile.waitForTimeout(300);
const mobileState = await mobile.evaluate(() => ({
  camera: document.querySelector("#camera-mode").value,
  comparison: window.__gaussianMetrics.comparison,
  cameraOptions: document.querySelector("#camera-mode").options.length,
  sceneCards: document.querySelectorAll(".scene-card[data-scene]").length,
  logoLoaded: document.querySelector(".brand img").naturalWidth > 0,
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
}));

const renderMetricBeforeFlames = await desktop.evaluate(() => window.__gaussianMetrics.at);
await desktop.locator('.scene-card[data-scene="flames"]').click();
await desktop.waitForFunction(() => window.__gaussianScene === "flames");
await desktop.locator("#flames-video").scrollIntoViewIfNeeded();
await desktop.locator("#flames-stream-start").click();
await desktop.waitForFunction(() => window.__flamesStream?.state === "ready", null, { timeout: 15_000 });
await desktop.locator("#flames-video").evaluate(video => video.play());
await desktop.waitForTimeout(1200);
const streamState = await desktop.evaluate(() => {
  const video = document.querySelector("#flames-video");
  return {
    telemetry: window.__flamesStream,
    paused: video.paused,
    readyState: video.readyState,
    currentTime: video.currentTime,
    rendererMetricAt: window.__gaussianMetrics.at,
    buffered: Array.from({ length: video.buffered.length }, (_, index) => [video.buffered.start(index), video.buffered.end(index)]),
  };
});
const previousMetricAt = await desktop.evaluate(() => window.__gaussianMetrics.at);
await desktop.locator('.scene-card[data-scene="stg"]').click();
await desktop.waitForFunction(previous => window.__gaussianScene === "stg" && window.__gaussianMetrics.at > previous, previousMetricAt);
const switchState = await desktop.evaluate(() => ({
  scene: window.__gaussianScene,
  stgVisible: !document.querySelector("#stg-pane").hidden,
  flamesHidden: document.querySelector("#flames-pane").hidden,
  flamesPaused: document.querySelector("#flames-video").paused,
  logoLoaded: document.querySelector(".brand img").naturalWidth > 0,
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
}));

await browser.close();

const report = {
  url,
  desktop: desktopState,
  desktopErrors,
  speed: speedState,
  mobile: mobileState,
  mobileErrors,
  stream: streamState,
  switch: switchState,
  screenshot,
};
console.log(JSON.stringify(report, null, 2));

if (
  desktopErrors.length ||
  mobileErrors.length ||
  desktopState.camera !== "cam00" ||
  !desktopState.metrics.comparison ||
  desktopState.video.paused ||
  desktopState.video.duration < 9.9 ||
  desktopState.video.renderedDeltaMs > 100 ||
  speedState.selectedRate !== 2 ||
  speedState.mediaRate !== 2 ||
  speedState.effectiveRate < 1.7 ||
  speedState.effectiveRate > 2.3 ||
  speedState.renderedDeltaMs > 100 ||
  (desktopState.metrics.gpuTimingSupported && !(desktopState.metrics.gpuRenderMs > 0)) ||
  desktopState.overflow !== 0 ||
  mobileState.overflow !== 0 ||
  mobileState.cameraOptions !== 6 ||
  mobileState.sceneCards !== 2 ||
  !mobileState.logoLoaded ||
  streamState.paused ||
  streamState.readyState < 3 ||
  streamState.currentTime < 0.8 ||
  streamState.telemetry.appended.length < 3 ||
  streamState.rendererMetricAt !== renderMetricBeforeFlames ||
  switchState.scene !== "stg" ||
  !switchState.stgVisible ||
  !switchState.flamesHidden ||
  !switchState.flamesPaused ||
  !switchState.logoLoaded ||
  switchState.overflow !== 0
) {
  process.exitCode = 1;
}
