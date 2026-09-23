import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {streamApi,selectChunks,byteRange} from '../stream-api.mjs';
import {assemble,TemporalStream} from '../public/streaming/loader.mjs';
const directory=process.argv[2]??'artifacts/streaming/flames-v1b';
const manifest=JSON.parse(await readFile(`${directory}/manifest.json`,'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const objects=new Map();const decoded=new Map();
objects.set(`${manifest.id}/manifest.json`,Buffer.from(JSON.stringify(manifest)));
for(const c of manifest.chunks){const b=await readFile(`${directory}/${c.name}`);assert.equal(hash(b),c.sha256);assert.equal(b.length,c.bytes);const raw=gunzipSync(b);assert.equal(raw.length,c.decodedBytes);objects.set(`${manifest.id}/${c.name}`,b);decoded.set(c.name,raw);}
const meta=(key)=>{const b=objects.get(key);return b?{size:b.length,httpEtag:`"${hash(b)}"`}:null;};
const env={GAUSSIAN_STREAMS:{async head(k){return meta(k);},async get(k,options){const b=objects.get(k);if(!b)return null;const data=options?.range?b.subarray(options.range.offset,options.range.offset+options.range.length):b;return {...meta(k),body:new Blob([data]).stream(),json:async()=>JSON.parse(data)};}}};
const request=(tail,init)=>new Request(`https://example.test/api/gaussians/${manifest.id}/${tail}`,init);
let r=await streamApi(request('range?start=0&end=0'),env);assert.equal(r.status,200);assert((await r.json()).chunks.length>0);
for(const q of ['start=-1&end=1','start=0&end=Infinity','start=1&end=0','start=0','start=&end=1','start=0&end=999'])assert.equal((await streamApi(request(`range?${q}`),env)).status,400);
assert.equal((await streamApi(request('manifest',{method:'POST'}),env)).status,405);
const chunk=manifest.chunks[0],original=objects.get(`${manifest.id}/${chunk.name}`);
for(const header of ['bytes=0-31','bytes=-17','bytes=31-']){r=await streamApi(request(chunk.name,{headers:{Range:header}}),env);assert.equal(r.status,206);const range=byteRange(header,original.length);assert.deepEqual(Buffer.from(await r.arrayBuffer()),original.subarray(range.offset,range.offset+range.length));}
assert.equal((await streamApi(request(chunk.name,{headers:{Range:`bytes=${original.length}-`}}),env)).status,416);
r=await streamApi(request(chunk.name,{method:'HEAD'}),env);assert.equal(r.headers.get('content-length'),String(original.length));assert.equal((await r.arrayBuffer()).byteLength,0);
assert.equal((await streamApi(request(chunk.name,{headers:{'If-None-Match':meta(`${manifest.id}/${chunk.name}`).httpEtag}}),env)).status,304);
assert.equal((await streamApi(request(chunk.name,{headers:{Range:'bytes=0-7','If-Range':'"outdated"'}}),env)).status,200);
assert.throws(()=>byteRange('bytes=0-1,3-4',100));
const allRows=Array.from(decoded.values());
const indexed=[];for(const b of allRows){for(let offset=0;offset<b.length;offset+=132)indexed.push({id:b.readUInt32LE(offset),bytes:b.subarray(offset+4,offset+132)});}
assert.equal(new Set(indexed.map(r=>r.id)).size,indexed.length);
const sourcePath=process.argv[3]??(manifest.id==='flames-v1'?'artifacts/streaming/flames.ply':'public/data/n3d-sear-steak-stg-lite.ply.gz');
const rawSource=await readFile(sourcePath),source=rawSource[0]===31&&rawSource[1]===139?gunzipSync(rawSource):rawSource;
assert.equal(hash(source),manifest.modelSha256);
const sourceOffset=source.indexOf('end_header\n')+11;
assert.equal(source.length-sourceOffset,manifest.sourceCount*128);
// Include discarded records too: none may become visible at a tested timestamp.
const coverageRows=Array.from({length:manifest.sourceCount},(_,id)=>({id,bytes:source.subarray(sourceOffset+id*128,sourceOffset+(id+1)*128)}));
// Verify exact coverage of the baseline f32 threshold at dense, off-grid times.
const f=Math.fround,threshold=f(1/255);let checked=0;
for(let step=0;step<=200;step++){
  const t=f(step/200),selected=selectChunks(manifest,t*manifest.durationSeconds,t*manifest.durationSeconds);
  const ids=new Set();for(const c of selected){const b=decoded.get(c.name);for(let i=0;i<b.length;i+=132)ids.add(b.readUInt32LE(i));}
  for(const row of coverageRows){const b=row.bytes,dt=f(t-b.readFloatLE(12)),scale=f(Math.max(1e-6,f(Math.exp(b.readFloatLE(16))))),ratio=f(dt/scale),a=f(f(1/f(1+f(Math.exp(-b.readFloatLE(80)))))*f(Math.exp(-f(ratio*ratio))));if(a>=threshold)assert(ids.has(row.id),`Time index missed ${row.id} at ${t}`);checked++;}
}
await mkdir('artifacts/streaming/window-validation',{recursive:true});
for(const [i,t] of [0.1,0.5,0.9].entries()){const chunks=selectChunks(manifest,t*manifest.durationSeconds,t*manifest.durationSeconds);const ply=assemble(chunks.map(c=>decoded.get(c.name)),manifest.headerTemplate,manifest.sourceCount);await writeFile(`artifacts/streaming/window-validation/${manifest.id}-${i}.ply`,ply);}
// Exercise the real client against the streaming handler: revisit cache hits,
// memory-pressure eviction, and stale-request cancellation are observable behavior.
const originalFetch=globalThis.fetch;
try{
  globalThis.fetch=async(url,init={})=>{init.signal?.throwIfAborted();return streamApi(new Request(new URL(url,'https://example.test'),init),env);};
  const client=new TemporalStream(manifest.id);await client.open();
  const a=await client.window(0,manifest.durationSeconds/8);
  await client.window(manifest.durationSeconds*.8,manifest.durationSeconds*.9);
  const revisit=await client.window(0,manifest.durationSeconds/8);
  assert.equal(revisit.stats.received,0);assert.deepEqual(revisit.ply,a.ply);assert(client.cacheBytes<=client.budget);
  const windows=[0,.2,.4,.6,.8].map(t=>[t*manifest.durationSeconds,Math.min(1,t+.125)*manifest.durationSeconds]);
  const cap=Math.max(...windows.map(([a,b])=>selectChunks(manifest,a,b).reduce((n,c)=>n+c.decodedBytes,0)));
  const bounded=new TemporalStream(manifest.id,{budgetBytes:cap});await bounded.open();
  for(const [a,b] of windows){await bounded.window(a,b);assert(bounded.cacheBytes<=cap);}
  const stale=client.window(0,.1);client.cancel();await assert.rejects(stale,e=>e.name==='AbortError');
}finally{globalThis.fetch=originalFetch;}
console.log(`PASS ${manifest.id}: ${manifest.chunks.length} checksummed chunks; ${checked.toLocaleString()} temporal coverage checks; HTTP ranges, 304, 416, HEAD, invalid inputs, unique source IDs`);
