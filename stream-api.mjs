const ROOT = '/api/gaussians/';
const manifestLimit = 2 * 1024 * 1024;
export const scenes = ['sear-steak-v1', 'flames-v1'];
export function selectChunks(manifest, start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end > manifest.durationSeconds) throw new RangeError('Use 0 <= start <= end <= durationSeconds');
  // Closed intervals intentionally retain both sides at an exact boundary.
  return manifest.chunks.filter(c => c.start <= end && c.end >= start);
}
export function byteRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new RangeError('One byte range is supported');
  let start, end;
  if (!match[1]) { const suffix = Number(match[2]); if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new RangeError('Invalid suffix'); start = Math.max(0,size-suffix); end=size-1; }
  else { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]),size-1) : size-1; }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) throw new RangeError('Unsatisfiable range');
  return {offset:start,length:end-start+1};
}
export async function streamApi(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(ROOT)) return null;
  if (!['GET','HEAD'].includes(request.method)) return new Response('GET or HEAD required',{status:405,headers:{Allow:'GET, HEAD'}});
  const [scene,resource,...extra] = url.pathname.slice(ROOT.length).split('/');
  if (!scenes.includes(scene) || extra.length) return new Response('Unknown scene',{status:404});
  if (!env.GAUSSIAN_STREAMS) return new Response('Streaming storage unavailable',{status:503});
  const key = `${scene}/${resource}`;
  if (resource === 'manifest' || resource === 'range') {
    const object = await env.GAUSSIAN_STREAMS.get(`${scene}/manifest.json`);
    if (!object) return new Response('Scene not published',{status:404});
    if (object.size > manifestLimit) return new Response('Manifest exceeds limit',{status:500});
    const manifest = await object.json();
    let response;
    if (resource === 'range') {
      if (!url.searchParams.has('start') || !url.searchParams.has('end') || !url.searchParams.get('start').trim() || !url.searchParams.get('end').trim()) return new Response('start and end seconds are required',{status:400});
      try {
        const start = Number(url.searchParams.get('start')), end = Number(url.searchParams.get('end'));
        const chunks = selectChunks(manifest,start,end).map(c=>({...c,url:`${ROOT}${scene}/${c.name}`}));
        response = {schema:manifest.schema,id:scene,start,end,durationSeconds:manifest.durationSeconds,modelSha256:manifest.modelSha256,chunks,bytes:chunks.reduce((n,c)=>n+c.bytes,0)};
      } catch (e) { if (e instanceof RangeError) return new Response(e.message,{status:400}); throw e; }
    } else response = manifest;
    return new Response(request.method==='HEAD'?null:JSON.stringify(response),{headers:{'Content-Type':'application/json','Cache-Control':'no-cache'}});
  }
  if (!/^[a-f0-9]{64}\.stg\.gz$/.test(resource ?? '')) return new Response('Unknown object',{status:404});
  const metadata = await env.GAUSSIAN_STREAMS.head(key);
  if (!metadata) return new Response('Chunk not found',{status:404});
  const headers = new Headers({'Content-Type':'application/octet-stream','ETag':metadata.httpEtag,'Accept-Ranges':'bytes','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});
  if (request.headers.get('If-None-Match')?.split(',').map(s=>s.trim()).some(s=>s==='*'||s===metadata.httpEtag||s===`W/${metadata.httpEtag}`)) return new Response(null,{status:304,headers});
  let range;
  try { range = request.headers.has('If-Range') && request.headers.get('If-Range')!==metadata.httpEtag ? null : byteRange(request.headers.get('Range'),metadata.size); }
  catch { headers.set('Content-Range',`bytes */${metadata.size}`); return new Response(null,{status:416,headers}); }
  const length = range?.length ?? metadata.size;
  headers.set('Content-Length',String(length));
  if (range) headers.set('Content-Range',`bytes ${range.offset}-${range.offset+range.length-1}/${metadata.size}`);
  if (request.method==='HEAD') return new Response(null,{status:range?206:200,headers});
  const object = await env.GAUSSIAN_STREAMS.get(key,range?{range}:undefined);
  if (!object) return new Response('Chunk not found',{status:404});
  return new Response(object.body,{status:range?206:200,headers});
}
