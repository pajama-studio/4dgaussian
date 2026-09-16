import { chromium } from "playwright";

const base = process.argv[2] || "http://127.0.0.1:8787";
const url = new URL("/docs/", base).toString();
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-unsafe-webgpu", "--use-angle=metal", "--autoplay-policy=no-user-gesture-required"],
});

function collectErrors(page) {
  const errors = [];
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", error => errors.push(error.message));
  return errors;
}

const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const desktopErrors = collectErrors(desktop);
await desktop.goto(url, { waitUntil: "domcontentloaded" });
await desktop.locator("#pipeline").scrollIntoViewIfNeeded();
await desktop.waitForFunction(() => window.__representation3D?.ready, null, { timeout: 30_000 });
const pointState = await desktop.evaluate(() => ({ ...window.__representation3D, activeMode: window.__representation3D.activeMode }));
await desktop.locator('[data-representation="nerf"]').click();
const nerfTitle = await desktop.locator("#rep-title").textContent();
await desktop.waitForTimeout(250);
await desktop.locator('[data-representation="gaussian"]').click();
await desktop.waitForTimeout(250);
const gaussianTitle = await desktop.locator("#rep-title").textContent();
await desktop.locator('[data-representation="stg"]').click();
await desktop.locator("#demo-time").fill("0.82");
const stgTitle = await desktop.locator("#rep-title").textContent();
const stageBox = await desktop.locator("#representation-stage").boundingBox();
const yawBefore = await desktop.evaluate(() => window.__representation3D.yaw);
await desktop.mouse.move(stageBox.x + stageBox.width * .55, stageBox.y + stageBox.height * .5);
await desktop.mouse.down();
await desktop.mouse.move(stageBox.x + stageBox.width * .68, stageBox.y + stageBox.height * .56, { steps: 5 });
await desktop.mouse.up();
await desktop.waitForTimeout(250);
const gpuState = await desktop.evaluate(() => ({ activeMode: window.__representation3D.activeMode, yaw: window.__representation3D.yaw, visibleSplats: window.__representation3D.visibleSplats, webGpu: window.__representation3D.webGpu }));

await desktop.locator("#contract").scrollIntoViewIfNeeded();
await desktop.locator("#contract-preset").selectOption("stg");
await desktop.locator("#wrong-contract").click();
const contractOutcome = await desktop.locator("#contract-outcome").textContent();

await desktop.locator("#gaussian").scrollIntoViewIfNeeded();
const blendBefore = await desktop.locator("#blend-result").textContent();
await desktop.locator("#swap-order").click();
const blendAfter = await desktop.locator("#blend-result").textContent();

await desktop.locator('[data-dynamic-method="deformation"]').click();
const dynamicExplorer = await desktop.evaluate(() => ({
  selected: document.querySelector('[data-dynamic-method][aria-selected="true"]')?.dataset.dynamicMethod,
  title: document.querySelector("#dynamic-family-title")?.textContent,
  familyRows: document.querySelectorAll(".dynamic-family-table tbody tr").length,
  coreTopics: document.querySelectorAll(".core-topic").length,
}));

await desktop.locator("#formats").scrollIntoViewIfNeeded();
await desktop.locator("#primitive-count").fill("10000000");
const memory = await desktop.locator("#total-memory").textContent();

await desktop.locator(".paper-figures").scrollIntoViewIfNeeded();
await desktop.waitForFunction(() => [...document.querySelectorAll(".paper-figures img")].every(image => image.complete));
const paperFigures = await desktop.evaluate(() => [...document.querySelectorAll(".paper-figures img")].map(image => ({ loaded: image.naturalWidth > 0, width: image.naturalWidth, height: image.naturalHeight })));
const faqState = await desktop.evaluate(() => ({ title: document.querySelector("#faq h2")?.textContent, mentionsInterview: /interview/i.test(document.body.innerText) }));

const desktopState = await desktop.evaluate(() => ({
  title: document.querySelector("h1")?.textContent.trim(),
  sections: document.querySelectorAll(".doc-section[id]").length,
  referenceGroups: document.querySelectorAll(".refs").length,
  externalReferences: document.querySelectorAll('.refs a[href^="http"], .sources-list a[href^="http"]').length,
  language: document.documentElement.lang,
  representationPixels: document.querySelector("#gaussian-lab-canvas").width * document.querySelector("#gaussian-lab-canvas").height,
  blendPixels: document.querySelector("#blend-canvas").width * document.querySelector("#blend-canvas").height,
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
}));
await desktop.locator("#mental-model").scrollIntoViewIfNeeded();
await desktop.screenshot({ path: "/tmp/gaussian-docs-desktop.png", fullPage: false });

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const mobileErrors = collectErrors(mobile);
await mobile.goto(url, { waitUntil: "domcontentloaded" });
await mobile.locator("#pipeline").scrollIntoViewIfNeeded();
await mobile.waitForFunction(() => window.__representation3D?.ready, null, { timeout: 30_000 });
await mobile.locator('[data-representation="gaussian"]').click();
await mobile.waitForTimeout(300);
const mobileState = await mobile.evaluate(() => ({
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  title: document.querySelector("#rep-title")?.textContent,
  canvasWidth: document.querySelector("#gaussian-lab-canvas")?.width,
  tocHidden: getComputedStyle(document.querySelector(".toc")).display === "none",
}));
await mobile.screenshot({ path: "/tmp/gaussian-docs-mobile.png", fullPage: false });

await browser.close();

const result = { url, desktop: desktopState, representation: { pointState, gaussianTitle, gpuState, yawBefore }, paperFigures, faqState, dynamicExplorer, interactive: { nerfTitle, stgTitle, contractOutcome, blendBefore, blendAfter, memory }, mobile: mobileState, desktopErrors, mobileErrors };
console.log(JSON.stringify(result, null, 2));

if (desktopErrors.length || mobileErrors.length) throw new Error("Field guide emitted browser errors");
if (desktopState.language !== "en" || desktopState.sections !== 14 || desktopState.referenceGroups < 10 || desktopState.externalReferences < 30) throw new Error("Field guide structure/reference coverage failed");
if (desktopState.overflow > 0 || mobileState.overflow > 0 || !mobileState.tocHidden) throw new Error("Field guide responsive layout failed");
if (pointState.pointCount !== 108317 || pointState.activeMode !== "point") throw new Error("Actual point-cloud asset did not initialize");
if (!nerfTitle.includes("Ray-marched") || !gaussianTitle.includes("Static Gaussian") || !stgTitle.includes("Spacetime") || !contractOutcome.includes("time")) throw new Error("Representation or contract interactions failed");
if (gpuState.activeMode !== "stg" || gpuState.yaw === yawBefore) throw new Error("3D orbit interaction failed");
if (gpuState.webGpu && gpuState.visibleSplats <= 0) throw new Error("WebGPU Gaussian path rendered no splats");
if (paperFigures.length !== 3 || paperFigures.some(figure => !figure.loaded)) throw new Error("Classic-paper figures failed to load");
if (faqState.title !== "FAQ" || faqState.mentionsInterview) throw new Error("Reader-facing FAQ still contains interview framing");
if (dynamicExplorer.selected !== "deformation" || !dynamicExplorer.title.includes("4D-GS") || dynamicExplorer.familyRows !== 4 || dynamicExplorer.coreTopics !== 2) throw new Error("3DGS/4DGS deep-dive structure or interaction failed");
if (blendBefore === blendAfter || !memory.includes("GiB")) throw new Error("Blend or payload interaction failed");
