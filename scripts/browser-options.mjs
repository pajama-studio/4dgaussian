// Keep macOS's historical capture backend without forcing Metal on Windows/Linux.
export const browserOptions = {
  headless: true,
  // The Windows headless-shell build may lack usable DXC/DXIL libraries.
  // Full Chromium in headless mode includes the native WebGPU compiler runtime.
  ...(process.platform === "win32" ? { channel: "chromium" } : {}),
  args: [
    "--enable-unsafe-webgpu",
    "--enable-gpu",
    ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
    "--autoplay-policy=no-user-gesture-required",
  ],
};
