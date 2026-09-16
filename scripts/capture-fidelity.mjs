import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8793";
const seconds = Number(process.argv[3] || 5);
const output = process.argv[4] || "/tmp/stg-render.png";
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-unsafe-webgpu", "--use-angle=metal"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", message => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", error => errors.push(error.message));

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__gaussianMetrics?.visible > 0, null, { timeout: 30_000 });
await page.selectOption("#camera-mode", "cam00");
await page.locator("#timeline").evaluate((input, value) => {
  input.value = value.toString();
  input.dispatchEvent(new Event("input", { bubbles: true }));
}, seconds);
await page.waitForFunction(value => Math.abs(Number(document.querySelector("#timeline").value) - value) < 0.001, seconds);
await page.waitForTimeout(250);
await page.addStyleTag({ content: ".overlay, .gesture-hint, .compare-label, .compare-divider { display: none !important; }" });
const canvas = page.locator("#gaussian-canvas");
await canvas.screenshot({ path: output });
const state = await page.evaluate(() => ({
  metrics: window.__gaussianMetrics,
  canvasCss: {
    width: document.querySelector("#gaussian-canvas").getBoundingClientRect().width,
    height: document.querySelector("#gaussian-canvas").getBoundingClientRect().height,
  },
  canvasPixels: {
    width: document.querySelector("#gaussian-canvas").width,
    height: document.querySelector("#gaussian-canvas").height,
  },
}));
await browser.close();

console.log(JSON.stringify({ url, seconds, output, state, errors }, null, 2));
if (errors.length || state.metrics.camera !== "cam00") process.exitCode = 1;
