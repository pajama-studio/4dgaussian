import { mountStgSample } from "/docs/stg-sample.js";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function canvasContext(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

function clearStage(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#08080a";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(255,255,255,.045)";
  ctx.lineWidth = 1;
  for (let x = 20; x < width; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }
  for (let y = 20; y < height; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }
}

const contracts = {
  point: {
    header: `ply\nformat binary_little_endian 1.0\nelement vertex N\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header`,
    container: "Binary little-endian PLY",
    schema: "XYZ positions plus byte RGB",
    semantics: "Scene units and coordinate convention must come from dataset metadata",
    renderer: "Point, point-sprite, or surfel rasterization with depth testing",
    outcome: "Appropriate for a center-sample view. Point size and depth rules still remain application choices."
  },
  gs: {
    header: `ply\nformat binary_little_endian 1.0\nelement vertex N\nproperty float x ... z\nproperty float f_dc_0 ... f_dc_2\nproperty float f_rest_0 ... f_rest_44\nproperty float opacity\nproperty float scale_0 ... scale_2\nproperty float rot_0 ... rot_3\nend_header`,
    container: "Binary PLY used as a research checkpoint",
    schema: "Mean, SH appearance, opacity parameter, log scale, quaternion",
    semantics: "Typically exp(scale), sigmoid(opacity), method-defined SH ordering, normalized quaternion",
    renderer: "Project 3D covariance, evaluate SH, order/bin translucent splats, alpha composite",
    outcome: "The centers appear, but shape, opacity activation, view-dependent color, and Gaussian compositing are lost. This is only a debug view."
  },
  stg: {
    header: `ply\nformat binary_little_endian 1.0\nelement vertex N\nproperty float x y z\nproperty float trbf_center\nproperty float trbf_scale\nproperty float nx ny nz\nproperty float motion_0 ... motion_8\nproperty float f_dc_0 ... f_dc_2\nproperty float opacity\nproperty float scale_0 ... scale_2\nproperty float rot_0 ... rot_3\nproperty float omega_0 ... omega_3\nend_header`,
    container: "Binary PLY with one strict 32-float record",
    schema: "Static Gaussian fields plus temporal support, cubic motion, and quaternion-rate fields",
    semantics: "Polynomial μ(t), temporal RBF opacity, exp(scale), sigmoid(opacity), normalize(q + dt·ω)",
    renderer: "Evaluate the STG-Lite time contract, then project, order, splat, and composite",
    outcome: "You only see base centers and discard time, anisotropic shape, opacity, and motion. It is not a dynamic render."
  },
  flipbook: {
    header: `frame_0000.ply\nframe_0001.ply\nframe_0002.ply\n...\n\n# Each file may contain a static GS schema.\n# Time lives in filename/order/manifest,\n# not necessarily inside each PLY record.`,
    container: "A sequence or manifest of separate PLY assets",
    schema: "One static schema per frame; temporal identity may be absent",
    semantics: "Frame index, frame rate, and interpolation policy live outside the individual PLY",
    renderer: "Load or swap frame assets, then run the static Gaussian renderer",
    outcome: "One selected frame can be shown as points, but there is no Gaussian appearance and no temporal playback without the external sequence contract."
  }
};

function renderContract() {
  const data = contracts[$("#contract-preset").value];
  $("#contract-header").textContent = data.header;
  $("#contract-container").textContent = data.container;
  $("#contract-schema").textContent = data.schema;
  $("#contract-semantics").textContent = data.semantics;
  $("#contract-renderer").textContent = data.renderer;
  $("#contract-outcome").textContent = "";
}
$("#contract-preset")?.addEventListener("change", renderContract);
$("#wrong-contract")?.addEventListener("click", () => { $("#contract-outcome").textContent = contracts[$("#contract-preset").value].outcome; });

let purpleFront = true;
function blend(front, back, background = [8, 8, 10]) {
  const outAlpha = front.a + back.a * (1 - front.a);
  const premult = front.rgb.map((value, index) => value * front.a + back.rgb[index] * back.a * (1 - front.a) + background[index] * (1 - outAlpha));
  return premult.map(value => Math.round(value));
}
function drawBlendLab() {
  const canvas = $("#blend-canvas");
  if (!canvas) return;
  const { ctx, width, height } = canvasContext(canvas);
  clearStage(ctx, width, height);
  const alphaA = Number($("#alpha-a").value);
  const alphaB = Number($("#alpha-b").value);
  const purple = { name: "Purple", rgb: [168, 121, 232], a: alphaA, css: `rgba(168,121,232,${alphaA})` };
  const lime = { name: "Lime", rgb: [196, 219, 34], a: alphaB, css: `rgba(196,219,34,${alphaB})` };
  const front = purpleFront ? purple : lime;
  const back = purpleFront ? lime : purple;
  const drawEllipse = primitive => {
    ctx.fillStyle = primitive.css;
    ctx.beginPath();
    const isPurple = primitive.name === "Purple";
    ctx.ellipse(width * (isPurple ? .44 : .58), height * .5, width * .24, height * .29, isPurple ? -.22 : .22, 0, Math.PI * 2);
    ctx.fill();
  };
  drawEllipse(back); drawEllipse(front);
  ctx.fillStyle = "rgba(255,255,255,.68)"; ctx.font = "10px ui-monospace, monospace";
  ctx.fillText("BACK", 18, 28); ctx.fillText(back.name.toUpperCase(), 18, 44);
  ctx.fillText("FRONT", width - 80, 28); ctx.fillText(front.name.toUpperCase(), width - 80, 44);
  const result = blend(front, back);
  $("#alpha-a-out").textContent = alphaA.toFixed(2);
  $("#alpha-b-out").textContent = alphaB.toFixed(2);
  $("#front-name").textContent = front.name;
  $("#blend-result").textContent = `rgb(${result.join(", ")})`;
}
$("#alpha-a")?.addEventListener("input", drawBlendLab);
$("#alpha-b")?.addEventListener("input", drawBlendLab);
$("#swap-order")?.addEventListener("click", () => { purpleFront = !purpleFront; drawBlendLab(); });

const bridgeContent = {
  training: {
    nerf: ["Sample camera rays", "Query Fθ(x,d) → σ,c", "Volume integrate", "Photometric loss", "Backpropagate θ"],
    gaussian: ["Seed means from SfM points", "Project Gaussian covariance", "Sort and alpha composite", "Photometric loss", "Update / densify / prune"],
    nerfNote: "At training time, the rendered pixel is differentiable with respect to network or feature-grid parameters.",
    gaussianNote: "At training time, differentiable splatting updates position, covariance, opacity, and appearance; adaptive density control changes the primitive set.",
    conclusion: "Both methods compare rendered pixels with captured pixels and differentiate through the renderer. Their central difference is the optimized scene representation and the rendering operator—not the supervision signal."
  },
  runtime: {
    nerf: ["Load weights / feature grid", "Generate camera rays", "Skip empty space", "Query many samples", "Integrate each pixel"],
    gaussian: ["Load explicit primitives", "Frustum cull", "Project covariance", "Bin / sort splats", "Alpha composite"],
    nerfNote: "Runtime cost is driven by pixels × surviving field samples × field-query cost; accelerated NeRF families change the data structure and query path.",
    gaussianNote: "Runtime cost is driven by visible primitives, sorting or tiling, projected footprint, overdraw, and attribute bandwidth.",
    conclusion: "Training makes either representation render captured views correctly. Deployment then removes the loss and optimizer: NeRF keeps ray integration, while 3DGS keeps explicit projection, ordering, and splatting."
  }
};

function renderBridge(mode) {
  const content = bridgeContent[mode];
  $("#nerf-bridge-steps").innerHTML = content.nerf.map(step => "<li>" + step + "</li>").join("");
  $("#gaussian-bridge-steps").innerHTML = content.gaussian.map(step => "<li>" + step + "</li>").join("");
  $("#nerf-bridge-note").textContent = content.nerfNote;
  $("#gaussian-bridge-note").textContent = content.gaussianNote;
  $("#bridge-conclusion p").textContent = content.conclusion;
  $$("[data-bridge]").forEach(button => button.setAttribute("aria-selected", String(button.dataset.bridge === mode)));
  requestAnimationFrame(() => $$(".bridge-lanes li").forEach((item, index) => item.classList.toggle("is-emphasis", index === 3 || index === 8)));
}
$$('[data-bridge]').forEach(button => button.addEventListener("click", () => renderBridge(button.dataset.bridge)));

const dynamicFamilies = {
  flipbook: {
    kicker: "Discrete-frame asset sequence",
    title: "Gaussian flipbook",
    description: "Playback selects or interpolates independently reconstructed splat sets. This is operationally simple and lets every frame use different primitives, but the representation itself provides no cross-frame identity.",
    time: "In the frame or file index",
    identity: "Not guaranteed across frames",
    runtime: "Fetch/decode the current frame, upload or swap buffers, then splat",
    delivery: "High repeated payload; chunk, prefetch, cache, and budget seek latency"
  },
  persistent: {
    kicker: "Persistent primitive trajectories",
    title: "Dynamic 3D Gaussians",
    description: "The published method lets Gaussians move and rotate over time while color, opacity, and size persist. Local-rigidity regularization encourages each primitive to track the same physical region through the sequence.",
    time: "Per-timestep position and rotation",
    identity: "The same Gaussian is preserved through time",
    runtime: "Select/evaluate current transforms, update visibility, then splat",
    delivery: "Base attributes plus time-varying trajectories or frame states"
  },
  deformation: {
    kicker: "Canonical scene plus a time field",
    title: "4D-GS and Deformable 3DGS",
    description: "Canonical Gaussians remain the explicit scene state. A time-conditioned representation predicts deformation before rasterization: 4D-GS uses decomposed 4D neural voxels and a lightweight MLP, while Deformable 3DGS learns a deformation field for canonical Gaussians.",
    time: "In a learned encoder or deformation field queried by position and t",
    identity: "Canonical Gaussian identity is the reference",
    runtime: "Evaluate the field, apply offsets, recompute visibility, then splat",
    delivery: "Canonical splats plus field weights/configuration; not a static PLY alone"
  },
  spacetime: {
    kicker: "Per-Gaussian time model",
    title: "Spacetime Gaussians (STG)",
    description: "Each Gaussian carries temporal opacity, parametric motion/rotation, and time-dependent features. Evaluate those functions at t, remove inactive primitives, then use a Gaussian splat pipeline.",
    time: "Inside every primitive's temporal parameters",
    identity: "Short-lived primitives persist over their temporal support",
    runtime: "Evaluate support, trajectory, rotation, features; then cull and splat",
    delivery: "One richer record per primitive; stream by space and temporal support"
  }
};

function renderDynamicFamily(name) {
  const family = dynamicFamilies[name];
  if (!family) return;
  $("#dynamic-family-kicker").textContent = family.kicker;
  $("#dynamic-family-title").textContent = family.title;
  $("#dynamic-family-description").textContent = family.description;
  $("#dynamic-family-time").textContent = family.time;
  $("#dynamic-family-identity").textContent = family.identity;
  $("#dynamic-family-runtime").textContent = family.runtime;
  $("#dynamic-family-delivery").textContent = family.delivery;
  $$('[data-dynamic-method]').forEach(button => button.setAttribute("aria-selected", String(button.dataset.dynamicMethod === name)));
}
$$('[data-dynamic-method]').forEach(button => button.addEventListener("click", () => renderDynamicFamily(button.dataset.dynamicMethod)));

function formatBytes(bytes) {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GiB`;
  return `${(bytes / 1048576).toFixed(1)} MiB`;
}
function updateMemoryBudget() {
  const count = Number($("#primitive-count").value);
  const bytes = Number($("#bytes-per-primitive").value);
  const attributes = count * bytes;
  const indices = count * 4;
  const keys = count * 4;
  $("#count-out").textContent = count >= 1000000 ? `${(count / 1000000).toFixed(1)}M` : `${Math.round(count / 1000)}k`;
  $("#attribute-memory").textContent = formatBytes(attributes);
  $("#index-memory").textContent = formatBytes(indices);
  $("#key-memory").textContent = formatBytes(keys);
  $("#total-memory").textContent = formatBytes(attributes + indices + keys);
}
$("#primitive-count")?.addEventListener("input", updateMemoryBudget);
$("#bytes-per-primitive")?.addEventListener("change", updateMemoryBudget);

$("#print-guide")?.addEventListener("click", () => window.print());

const sections = $$(".doc-section[id]");
const tocLinks = $$(".toc a[href^='#']");
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    tocLinks.forEach(link => link.classList.toggle("is-active", link.getAttribute("href") === `#${visible.target.id}`));
  }, { rootMargin: "-18% 0px -65% 0px", threshold: [0, .1, .3] });
  sections.forEach(section => observer.observe(section));
}

const resizeObserver = new ResizeObserver(drawBlendLab);
if ($("#blend-canvas")) resizeObserver.observe($("#blend-canvas").parentElement);

renderBridge("training");
renderDynamicFamily("spacetime");
renderContract();
drawBlendLab();
updateMemoryBudget();
mountStgSample().catch(error => {
  console.error(error);
  const loading = $("#lab-loading");
  if (loading) {
    loading.querySelector("i").hidden = true;
    loading.querySelector("span").textContent = "STG sample unavailable: " + (error.message || String(error));
  }
  $("#lab-render-badge").textContent = "STG unavailable";
});
