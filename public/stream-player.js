const STREAM = {
  codec: 'video/mp4; codecs="avc1.4d401f"',
  duration: 16.68335,
  segmentSeconds: 2,
  init: "/data/flames-stream/init.mp4",
  segments: Array.from({ length: 9 }, (_, index) =>
    `/data/flames-stream/segment-${String(index + 1).padStart(3, "0")}.m4s`
  ),
};

function appendBuffer(sourceBuffer, bytes) {
  return new Promise((resolve, reject) => {
    const done = () => {
      sourceBuffer.removeEventListener("error", failed);
      resolve();
    };
    const failed = () => {
      sourceBuffer.removeEventListener("updateend", done);
      reject(new Error("Media Source rejected a video fragment"));
    };
    sourceBuffer.addEventListener("updateend", done, { once: true });
    sourceBuffer.addEventListener("error", failed, { once: true });
    sourceBuffer.appendBuffer(bytes);
  });
}

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Stream fragment failed (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

export function mountSegmentedVideo(video, status, trigger) {
  if (!video || !status || !trigger) return;
  let started = false;
  let sourceBuffer;
  let mediaSource;
  let queue = Promise.resolve();
  const appended = new Set();

  function report(message, state = "loading") {
    status.textContent = message;
    status.dataset.state = state;
    window.__flamesStream = {
      state,
      appended: [...appended].sort((a, b) => a - b),
      duration: Number.isFinite(video.duration) ? video.duration : null,
      currentTime: video.currentTime,
    };
  }

  async function addSegment(index) {
    if (index < 0 || index >= STREAM.segments.length || appended.has(index)) return;
    report(`Fetching fragment ${index + 1}/${STREAM.segments.length}`);
    const bytes = await fetchBytes(STREAM.segments[index]);
    await appendBuffer(sourceBuffer, bytes);
    appended.add(index);
    report(`${appended.size}/${STREAM.segments.length} fragments buffered`, "ready");
  }

  function ensureAround(seconds) {
    if (!sourceBuffer) return queue;
    const first = Math.max(0, Math.min(STREAM.segments.length - 1, Math.floor(seconds / STREAM.segmentSeconds)));
    const wanted = [first, first + 1, first + 2].filter(index => index < STREAM.segments.length);
    queue = queue.then(async () => {
      for (const index of wanted) await addSegment(index);
      if (appended.size === STREAM.segments.length && mediaSource.readyState === "open") {
        mediaSource.endOfStream();
      }
    }).catch(error => {
      console.error(error);
      report(error.message, "error");
    });
    return queue;
  }

  async function start() {
    if (started) return;
    started = true;
    if (!("MediaSource" in window) || !MediaSource.isTypeSupported(STREAM.codec)) {
      report("Segmented H.264 playback is unavailable in this browser", "error");
      return;
    }
    report("Opening segmented stream");
    mediaSource = new MediaSource();
    video.src = URL.createObjectURL(mediaSource);
    await new Promise((resolve, reject) => {
      mediaSource.addEventListener("sourceopen", resolve, { once: true });
      mediaSource.addEventListener("sourceclose", () => reject(new Error("Media Source closed during setup")), { once: true });
    });
    sourceBuffer = mediaSource.addSourceBuffer(STREAM.codec);
    sourceBuffer.mode = "segments";
    await appendBuffer(sourceBuffer, await fetchBytes(STREAM.init));
    mediaSource.duration = STREAM.duration;
    await ensureAround(0);
    trigger.hidden = true;
    video.play().catch(() => {});
  }

  video.addEventListener("play", () => ensureAround(video.currentTime));
  video.addEventListener("timeupdate", () => {
    let bufferedEnd = 0;
    for (let index = 0; index < video.buffered.length; index += 1) {
      if (video.currentTime >= video.buffered.start(index) - 0.05 && video.currentTime <= video.buffered.end(index) + 0.05) {
        bufferedEnd = video.buffered.end(index);
        break;
      }
    }
    if (bufferedEnd - video.currentTime < 4.2) ensureAround(video.currentTime);
  });
  video.addEventListener("seeking", () => ensureAround(video.currentTime));

  trigger.addEventListener("click", () => {
    start().catch(error => report(error.message, "error"));
  });
}
