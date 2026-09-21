import initWasm, { GaussianRenderer } from "/pkg/pajama_gaussian_lab.js?v=relight-1";

const DATA_URL = "/data/n3d-sear-steak-stg-lite.ply.gz";
const TARGET = [0, 3.5, 14];
const LOOP_SECONDS = 10;
const EMPTY_CAMERA = new Float32Array();

const representation = {
  point: {
    kicker: "Same bytes · point contract",
    title: "Point-cloud rasterization",
    description: "The camera projects the asset’s actual XYZ centers as circular point primitives. A depth buffer resolves visibility; Gaussian scale, rotation, opacity, and temporal motion are deliberately ignored.",
    legend: "Actual base centers · GL_POINTS · depth tested",
    facts: [["Stored", "108,317 base centers + direct RGB"], ["Per frame", "Transform · clip · depth test"], ["Renderer", "WebGL2 GL_POINTS"]],
    steps: ["Decode centers", "Transform", "Project", "Depth test", "Shade points"]
  },
  nerf: {
    kicker: "3D procedural field analogue",
    title: "Ray-marched volume rendering",
    description: "Every pixel launches a 3D camera ray and samples a continuous density-and-color function. This is a real GPU volume integration, but the field is procedural—not a trained NeRF checkpoint.",
    legend: "3D camera rays · 80 field samples · front-to-back integration",
    facts: [["Field", "Procedural σ(x), c(x,d)"], ["Per pixel", "Ray · sample · transmittance integrate"], ["Boundary", "Not a trained NeRF asset"]],
    steps: ["Generate ray", "Enter bounds", "Query field", "Integrate samples", "Write pixel"]
  },
  gaussian: {
    kicker: "Same asset · frozen temporal state",
    title: "Static Gaussian rendering",
    description: "The actual anisotropic Gaussian renderer evaluates one frozen time slice of the STG checkpoint. Covariance, opacity, color, ordering, and splat blending remain active; only time is held constant.",
    legend: "Frozen STG slice · covariance projection · sorted alpha compositing",
    facts: [["Asset", "Published STG-Lite checkpoint"], ["Frozen at", "5.00 seconds"], ["Boundary", "A static slice, not a separate 3DGS model"]],
    steps: ["Freeze time", "Project covariance", "Cull and sort", "Evaluate splat", "Alpha composite"]
  },
  stg: {
    kicker: "Actual dynamic checkpoint",
    title: "Spacetime Gaussian rendering",
    description: "The renderer evaluates temporal support, cubic center motion, and quaternion velocity before the ordinary Gaussian pipeline. Move time to see learned primitives enter, leave, and move through the scene.",
    legend: "STG-Lite · evaluate t · temporal cull · project · sort · blend",
    facts: [["Asset", "108,317 learned spacetime splats"], ["Per frame", "Evaluate t before projecting"], ["Renderer", "Rust/WASM + WebGPU"]],
    steps: ["Evaluate time", "Temporal cull", "Project covariance", "Depth sort", "Alpha composite"]
  }
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compilation failed: ${message}`);
  }
  return shader;
}

function program(gl, vertex, fragment) {
  const result = gl.createProgram();
  gl.attachShader(result, compile(gl, gl.VERTEX_SHADER, vertex));
  gl.attachShader(result, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(result);
  if (!gl.getProgramParameter(result, gl.LINK_STATUS)) {
    throw new Error(`Shader link failed: ${gl.getProgramInfoLog(result)}`);
  }
  return result;
}

function resizeCanvas(canvas, maxDpr = 1.5) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  const changed = canvas.width !== width || canvas.height !== height;
  if (changed) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height, changed };
}

function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function subtract(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function scale(a, value) { return [a[0] * value, a[1] * value, a[2] * value]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function normalize(a) {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
}

function orbitCamera(yaw, pitch, distance) {
  const orbit = [Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
  const eye = add(TARGET, scale(orbit, distance));
  const forward = normalize(subtract(TARGET, eye));
  const right = normalize(cross(forward, [0, -1, 0]));
  const up = normalize(cross(right, forward));
  return { eye, forward, right, up };
}

function parseStgCenters(bytes) {
  const preview = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 8192)));
  const marker = "end_header\n";
  const markerIndex = preview.indexOf(marker);
  if (markerIndex < 0) throw new Error("PLY header terminator is missing");
  const header = preview.slice(0, markerIndex + marker.length);
  const countMatch = header.match(/element vertex (\d+)/);
  if (!countMatch) throw new Error("PLY vertex count is missing");
  const count = Number(countMatch[1]);
  const recordBytes = 32 * 4;
  const offset = new TextEncoder().encode(header).byteLength;
  if (offset + count * recordBytes > bytes.byteLength) throw new Error("PLY payload is shorter than its declared vertex table");
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, count * recordBytes);
  const interleaved = new Float32Array(count * 6);
  for (let index = 0; index < count; index += 1) {
    const base = index * recordBytes;
    const target = index * 6;
    interleaved[target] = view.getFloat32(base, true);
    interleaved[target + 1] = view.getFloat32(base + 4, true);
    interleaved[target + 2] = view.getFloat32(base + 8, true);
    interleaved[target + 3] = Math.max(0, Math.min(1, view.getFloat32(base + 17 * 4, true)));
    interleaved[target + 4] = Math.max(0, Math.min(1, view.getFloat32(base + 18 * 4, true)));
    interleaved[target + 5] = Math.max(0, Math.min(1, view.getFloat32(base + 19 * 4, true)));
  }
  return { count, interleaved };
}

class PointCloudRenderer {
  constructor(canvas, asset) {
    this.canvas = canvas;
    this.count = asset.count;
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL2 is unavailable");
    this.gl = gl;
    this.program = program(gl, `#version 300 es
      precision highp float;
      layout(location=0) in vec3 aPosition;
      layout(location=1) in vec3 aColor;
      uniform vec3 uEye;
      uniform vec3 uRight;
      uniform vec3 uUp;
      uniform vec3 uForward;
      uniform float uAspect;
      uniform float uTanHalfFov;
      out vec3 vColor;
      out float vDepth;
      void main() {
        vec3 relative = aPosition - uEye;
        float z = dot(relative, uForward);
        float x = dot(relative, uRight);
        float y = dot(relative, uUp);
        float nearPlane = 0.05;
        float farPlane = 180.0;
        gl_Position = vec4(x / (uTanHalfFov * uAspect), y / uTanHalfFov, ((farPlane + nearPlane) * z - 2.0 * farPlane * nearPlane) / (farPlane - nearPlane), z);
        gl_PointSize = clamp(40.0 / max(z, 0.01), 1.15, 4.2);
        vColor = aColor;
        vDepth = z;
      }`, `#version 300 es
      precision highp float;
      in vec3 vColor;
      in float vDepth;
      out vec4 outColor;
      void main() {
        vec2 point = gl_PointCoord * 2.0 - 1.0;
        float radius2 = dot(point, point);
        if (radius2 > 1.0) discard;
        float edge = 1.0 - smoothstep(0.55, 1.0, radius2);
        vec3 color = pow(max(vColor, vec3(0.0)), vec3(0.82));
        color *= mix(1.05, 0.62, clamp((vDepth - 8.0) / 28.0, 0.0, 1.0));
        outColor = vec4(color * edge, 1.0);
      }`);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, asset.interleaved, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindVertexArray(null);
    this.uniforms = Object.fromEntries(["uEye", "uRight", "uUp", "uForward", "uAspect", "uTanHalfFov"].map(name => [name, gl.getUniformLocation(this.program, name)]));
  }

  render(camera) {
    const { width, height } = resizeCanvas(this.canvas);
    const gl = this.gl;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0.018, 0.018, 0.027, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.useProgram(this.program);
    gl.uniform3fv(this.uniforms.uEye, camera.eye);
    gl.uniform3fv(this.uniforms.uRight, camera.right);
    gl.uniform3fv(this.uniforms.uUp, camera.up);
    gl.uniform3fv(this.uniforms.uForward, camera.forward);
    gl.uniform1f(this.uniforms.uAspect, width / height);
    gl.uniform1f(this.uniforms.uTanHalfFov, Math.tan(69.5 * Math.PI / 360));
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.POINTS, 0, this.count);
    gl.bindVertexArray(null);
  }
}

class NeuralFieldRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL2 is unavailable");
    this.gl = gl;
    this.program = program(gl, `#version 300 es
      precision highp float;
      const vec2 POSITIONS[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
      void main() { gl_Position = vec4(POSITIONS[gl_VertexID], 0.0, 1.0); }
    `, `#version 300 es
      precision highp float;
      uniform vec2 uResolution;
      uniform vec3 uEye;
      uniform vec3 uRight;
      uniform vec3 uUp;
      uniform vec3 uForward;
      uniform float uTime;
      out vec4 outColor;

      float gaussian(vec3 p, vec3 center, vec3 scale) {
        vec3 q = (p - center) / scale;
        return exp(-dot(q, q));
      }

      vec4 field(vec3 world, vec3 rayDirection) {
        vec3 p = world - vec3(0.0, 3.5, 14.0);
        float phase = uTime * 0.6283185;
        vec3 c1 = vec3(sin(phase) * 0.7, 0.1, cos(phase) * 0.35);
        vec3 c2 = vec3(-1.25, -0.45 + sin(phase * 1.7) * 0.25, 0.55);
        vec3 c3 = vec3(1.35, 0.65, -0.4 + cos(phase) * 0.3);
        float d1 = gaussian(p, c1, vec3(2.55, 1.2, 1.65));
        float d2 = gaussian(p, c2, vec3(1.0, 1.75, 1.05));
        float d3 = gaussian(p, c3, vec3(1.15, 0.85, 1.65));
        float ribbon = exp(-abs(length(p.xz * vec2(0.72, 1.0)) - 2.0) * 4.5) * exp(-p.y * p.y * 1.6) * 0.38;
        float density = max(0.0, d1 * 1.8 + d2 * 1.25 + d3 * 1.35 + ribbon - 0.18) * 1.35;
        vec3 purple = vec3(0.54, 0.24, 0.92);
        vec3 coral = vec3(1.0, 0.31, 0.18);
        vec3 lime = vec3(0.62, 0.92, 0.16);
        vec3 color = mix(purple, coral, clamp(d2 / max(density, 0.001), 0.0, 1.0));
        color = mix(color, lime, clamp((d3 + ribbon) / max(density, 0.001), 0.0, 0.72));
        float viewTerm = pow(clamp(dot(normalize(p + vec3(0.01)), -rayDirection), 0.0, 1.0), 4.0);
        color += vec3(0.16, 0.12, 0.24) * viewTerm;
        return vec4(color, density);
      }

      bool sphereInterval(vec3 origin, vec3 direction, vec3 center, float radius, out float t0, out float t1) {
        vec3 oc = origin - center;
        float b = dot(oc, direction);
        float c = dot(oc, oc) - radius * radius;
        float h = b * b - c;
        if (h < 0.0) return false;
        h = sqrt(h);
        t0 = max(0.0, -b - h);
        t1 = -b + h;
        return t1 > t0;
      }

      void main() {
        vec2 pixel = (gl_FragCoord.xy * 2.0 - uResolution) / uResolution.y;
        float tanHalfFov = tan(radians(69.5) * 0.5);
        vec3 rayDirection = normalize(uForward + pixel.x * tanHalfFov * uRight + pixel.y * tanHalfFov * uUp);
        vec3 background = mix(vec3(0.012,0.012,0.02), vec3(0.035,0.025,0.065), max(0.0, rayDirection.y) * 0.55);
        float t0;
        float t1;
        if (!sphereInterval(uEye, rayDirection, vec3(0.0,3.5,14.0), 4.5, t0, t1)) {
          outColor = vec4(pow(background, vec3(0.4545)), 1.0);
          return;
        }
        float stepLength = (t1 - t0) / 80.0;
        vec3 accumulated = vec3(0.0);
        float transmittance = 1.0;
        for (int index = 0; index < 80; index++) {
          float t = t0 + (float(index) + 0.5) * stepLength;
          vec4 sampleValue = field(uEye + rayDirection * t, rayDirection);
          float alpha = 1.0 - exp(-sampleValue.a * stepLength * 1.7);
          accumulated += transmittance * alpha * sampleValue.rgb;
          transmittance *= 1.0 - alpha;
          if (transmittance < 0.008) break;
        }
        vec3 color = accumulated + background * transmittance;
        color = color / (color + vec3(0.72));
        outColor = vec4(pow(max(color, vec3(0.0)), vec3(0.4545)), 1.0);
      }
    `);
    this.vao = gl.createVertexArray();
    this.uniforms = Object.fromEntries(["uResolution", "uEye", "uRight", "uUp", "uForward", "uTime"].map(name => [name, gl.getUniformLocation(this.program, name)]));
  }

  render(camera, time) {
    const { width, height } = resizeCanvas(this.canvas, 1.25);
    const gl = this.gl;
    gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.uResolution, width, height);
    gl.uniform3fv(this.uniforms.uEye, camera.eye);
    gl.uniform3fv(this.uniforms.uRight, camera.right);
    gl.uniform3fv(this.uniforms.uUp, camera.up);
    gl.uniform3fv(this.uniforms.uForward, camera.forward);
    gl.uniform1f(this.uniforms.uTime, time);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }
}

async function downloadAsset(setStatus) {
  if (!("DecompressionStream" in window)) throw new Error("This browser cannot stream-decompress the research fixture");
  setStatus("Downloading the published STG-Lite fixture…");
  const response = await fetch(DATA_URL);
  if (!response.ok || !response.body) throw new Error(`STG fixture request failed (${response.status})`);
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function mountRepresentation3D() {
  const stage = $("#representation-stage");
  if (!stage) return;
  const pointCanvas = $("#point-cloud-canvas");
  const nerfCanvas = $("#nerf-volume-canvas");
  const gaussianCanvas = $("#gaussian-lab-canvas");
  const loading = $("#lab-loading");
  const loadingText = loading.querySelector("span");
  const badge = $("#lab-render-badge");
  const timeInput = $("#demo-time");
  const distanceInput = $("#demo-depth");
  const playButton = $("#demo-play");
  const timeControl = $("#demo-time-control");
  let active = "point";
  let yaw = 0;
  let pitch = 0.03;
  let distance = 17.2;
  let time = 5;
  let playing = false;
  let pointer = null;
  let pointRenderer;
  let neuralRenderer;
  let gaussianRenderer;
  let webGpuError = "";
  let lastFrame = performance.now();

  const setStatus = message => { loadingText.textContent = message; };
  const updateCopy = () => {
    const data = representation[active];
    $("#rep-kicker").textContent = data.kicker;
    $("#rep-title").textContent = data.title;
    $("#rep-description").textContent = data.description;
    $("#stage-legend").textContent = data.legend;
    $("#rep-facts").innerHTML = data.facts.map(([key, value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`).join("");
    $("#pipeline-steps").innerHTML = data.steps.map((step, index) => `<li><b>${String(index + 1).padStart(2, "0")}</b><span>${step}</span></li>`).join("");
    $$('[data-representation]').forEach(button => button.setAttribute("aria-selected", String(button.dataset.representation === active)));
    pointCanvas.hidden = active !== "point";
    nerfCanvas.hidden = active !== "nerf";
    gaussianCanvas.hidden = active !== "gaussian" && active !== "stg";
    const temporal = active === "nerf" || active === "stg";
    timeInput.disabled = !temporal;
    playButton.disabled = !temporal;
    timeControl.classList.toggle("is-static", !temporal);
    if (!temporal) playing = false;
    playButton.textContent = playing ? "Pause time" : "Play time";
    playButton.setAttribute("aria-pressed", String(playing));
    if (active === "point") badge.textContent = `WebGL2 · actual ${pointRenderer?.count?.toLocaleString() || "108,317"} base centers`;
    if (active === "nerf") badge.textContent = "WebGL2 raymarch · procedural field · not a trained checkpoint";
    if (active === "gaussian") badge.textContent = gaussianRenderer ? `WebGPU · frozen STG slice · ${gaussianRenderer.visible.toLocaleString()} visible` : `WebGPU unavailable · ${webGpuError}`;
    if (active === "stg") badge.textContent = gaussianRenderer ? `WebGPU · actual STG-Lite · ${gaussianRenderer.visible.toLocaleString()} visible` : `WebGPU unavailable · ${webGpuError}`;
  };

  $$('[data-representation]').forEach(button => button.addEventListener("click", () => {
    active = button.dataset.representation;
    updateCopy();
  }));
  timeInput.addEventListener("input", () => {
    time = Number(timeInput.value);
    playing = false;
    updateCopy();
  });
  distanceInput.addEventListener("input", () => {
    distance = Number(distanceInput.value);
    $("#demo-depth-output").textContent = distance.toFixed(1);
  });
  playButton.addEventListener("click", () => {
    if (playButton.disabled) return;
    playing = !playing;
    updateCopy();
  });
  $("#demo-reset").addEventListener("click", () => {
    yaw = 0;
    pitch = 0.03;
    distance = 17.2;
    distanceInput.value = String(distance);
    $("#demo-depth-output").textContent = distance.toFixed(1);
  });
  stage.addEventListener("pointerdown", event => {
    pointer = [event.clientX, event.clientY];
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener("pointermove", event => {
    if (!pointer) return;
    yaw -= (event.clientX - pointer[0]) * 0.004;
    pitch = Math.max(-0.5, Math.min(0.65, pitch + (event.clientY - pointer[1]) * 0.003));
    pointer = [event.clientX, event.clientY];
  });
  stage.addEventListener("pointerup", () => { pointer = null; });
  stage.addEventListener("pointercancel", () => { pointer = null; });
  stage.addEventListener("wheel", event => {
    event.preventDefault();
    distance = Math.max(9, Math.min(34, distance + event.deltaY * 0.014));
    distanceInput.value = String(distance);
    $("#demo-depth-output").textContent = distance.toFixed(1);
  }, { passive: false });

  neuralRenderer = new NeuralFieldRenderer(nerfCanvas);
  const bytes = await downloadAsset(setStatus);
  setStatus("Decoding 108,317 base centers…");
  pointRenderer = new PointCloudRenderer(pointCanvas, parseStgCenters(bytes));

  if (navigator.gpu) {
    try {
      setStatus("Building the WebGPU Gaussian scene…");
      await initWasm({ module_or_path: "/pkg/pajama_gaussian_lab_bg.wasm?v=relight-1" });
      gaussianRenderer = await GaussianRenderer.create(gaussianCanvas, bytes);
    } catch (error) {
      console.warn("Gaussian lab WebGPU path unavailable", error);
      webGpuError = error.message || "initialization failed";
    }
  } else {
    webGpuError = "browser does not expose WebGPU";
  }

  loading.hidden = true;
  window.__representation3D = {
    ready: true,
    assetLoaded: true,
    pointCount: pointRenderer.count,
    get activeMode() { return active; },
    get yaw() { return yaw; },
    get visibleSplats() { return gaussianRenderer?.visible || 0; },
    webGpu: Boolean(gaussianRenderer)
  };
  updateCopy();

  const frame = now => {
    const delta = Math.min(0.08, (now - lastFrame) / 1000);
    lastFrame = now;
    if (playing) {
      time = (time + delta) % LOOP_SECONDS;
      timeInput.value = time.toFixed(2);
    }
    $("#demo-time-output").textContent = active === "gaussian" ? "Frozen 5.00 s" : `${time.toFixed(2)} s`;
    const camera = orbitCamera(yaw, pitch, distance);
    try {
      if (active === "point") pointRenderer.render(camera);
      if (active === "nerf") neuralRenderer.render(camera, time);
      if ((active === "gaussian" || active === "stg") && gaussianRenderer) {
        const { width, height } = resizeCanvas(gaussianCanvas);
        gaussianRenderer.render(active === "gaussian" ? 5 : time, yaw, pitch, distance, width, height, EMPTY_CAMERA);
        badge.textContent = active === "gaussian"
          ? `WebGPU · frozen STG slice · ${gaussianRenderer.visible.toLocaleString()} visible`
          : `WebGPU · actual STG-Lite · ${gaussianRenderer.visible.toLocaleString()} visible`;
      }
    } catch (error) {
      console.error("Representation lab render failed", error);
      badge.textContent = `Renderer error · ${error.message}`;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
