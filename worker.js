import { streamApi } from './stream-api.mjs';
export default {
  async fetch(request, env) {
    const stream = await streamApi(request, env);
    if (stream) return stream;
    const response = await env.ASSETS.fetch(request);
    const secured = new Response(response.body, response);
    const pathname = new URL(request.url).pathname;
    const immutable = pathname.startsWith("/pkg/") || pathname.startsWith("/data/");
    secured.headers.set("Cache-Control", immutable ? "public, max-age=31536000, immutable" : "no-cache");
    secured.headers.set("X-Content-Type-Options", "nosniff");
    secured.headers.set("X-Frame-Options", "DENY");
    secured.headers.set("Referrer-Policy", "no-referrer");
    secured.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    return secured;
  },
};
