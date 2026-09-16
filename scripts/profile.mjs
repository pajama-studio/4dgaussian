import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:4175";
const frames = Number(process.argv[3] || 300);
const browser = await chromium.launch({ headless: true, args: ["--enable-unsafe-webgpu", "--use-angle=metal"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
page.on("pageerror", error => errors.push(error.message));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__gaussianMetrics?.visible > 0);
const samples = await page.evaluate(async count => {
  const values = [];
  for (let index = 0; index < count; index += 1) {
    await new Promise(resolve => requestAnimationFrame(resolve));
    values.push({ ...window.__gaussianMetrics });
  }
  return values;
}, frames);
await browser.close();

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

const prepare = samples.map(sample => sample.prepareMs);
const sort = samples.map(sample => sample.sortMs);
const gpuRender = samples.map(sample => sample.gpuRenderMs).filter(value => value >= 0);
const frameIntervals = samples.slice(1).map((sample, index) => sample.at - samples[index].at);
const report = {
  url,
  samples: samples.length,
  source: samples.at(-1).source,
  visible: { min: Math.min(...samples.map(s => s.visible)), max: Math.max(...samples.map(s => s.visible)) },
  prepareMs: { p50: percentile(prepare, 0.5), p95: percentile(prepare, 0.95), max: Math.max(...prepare) },
  sortMs: { p50: percentile(sort, 0.5), p95: percentile(sort, 0.95), max: Math.max(...sort) },
  gpuTimingSupported: samples.at(-1).gpuTimingSupported,
  gpuRenderMs: gpuRender.length ? {
    samples: gpuRender.length,
    p50: percentile(gpuRender, 0.5),
    p95: percentile(gpuRender, 0.95),
    max: Math.max(...gpuRender),
  } : null,
  presentedFrameIntervalMs: { p50: percentile(frameIntervals, 0.5), p95: percentile(frameIntervals, 0.95), max: Math.max(...frameIntervals) },
  uploadBytes: samples.at(-1).uploadBytes,
  errors,
};
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;
