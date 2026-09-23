// Records are stored once. Temporal bounds conservatively include the renderer's
// 1/255 alpha test; overlapping queries reuse the same content-addressed objects.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const [input, camerasPath, output, id, durationText, provenance] = process.argv.slice(2);
const duration = Number(durationText);
if (!input || !/^[a-z0-9-]+$/.test(id ?? '') || !Number.isFinite(duration) || !(duration > 0)) throw Error('Usage: pack-stg-stream model cameras output id durationSeconds provenanceURL');
const raw = await readFile(input);
const ply = raw[0] === 31 && raw[1] === 139 ? gunzipSync(raw) : raw;
const offset = ply.indexOf('end_header\n') + 11;
const header = ply.subarray(0, offset).toString();
const count = Number(header.match(/element vertex (\d+)/)?.[1]);
const expected = ['x','y','z','trbf_center','trbf_scale','nx','ny','nz',...Array.from({length:9},(_,i)=>`motion_${i}`),...Array.from({length:3},(_,i)=>`f_dc_${i}`),'opacity',...Array.from({length:3},(_,i)=>`scale_${i}`),...Array.from({length:4},(_,i)=>`rot_${i}`),...Array.from({length:4},(_,i)=>`omega_${i}`)];
const properties = [...header.matchAll(/^property float (\S+)$/gm)].map(m=>m[1]);
if (offset < 11 || !header.includes('format binary_little_endian 1.0') || !Number.isSafeInteger(count) || count < 1 || count > 4000000 || properties.join(',') !== expected.join(',') || ply.length !== offset + count * 128) throw Error('Expected exact STG-Lite records');
const hash = b => createHash('sha256').update(b).digest('hex');
const modelSha256 = hash(ply);
const groups = new Map(); const bins = 32;
let discarded = 0;
for (let i = 0; i < count; i++) {
  const row = ply.subarray(offset+i*128, offset+(i+1)*128);
  for(let field=0;field<32;field++)if(!Number.isFinite(row.readFloatLE(field*4)))throw Error(`Non-finite field in record ${i}`);
  const center = row.readFloatLE(12), scale = Math.max(1e-6, Math.exp(row.readFloatLE(16)));
  const alpha = 1 / (1+Math.exp(-row.readFloatLE(80)));
  // Double precision packer vs f32 renderer: retain a margin in both opacity and time.
  const cut = (1 / 255) * (1-1e-5);
  if (alpha < cut) { discarded++; continue; }
  const radius = scale * Math.sqrt(Math.max(0,Math.log(alpha/cut))) + 1e-5;
  const start = Math.max(0,center-radius), end = Math.min(1,center+radius);
  if (start > end) { discarded++; continue; }
  let lo = Math.min(bins-1,Math.max(0,Math.floor(start*bins))), hi = Math.min(bins,Math.max(lo+1,Math.ceil(end*bins)));
  // One enclosing dyadic interval per primitive avoids hundreds of tiny groups.
  let span = 1;
  while (Math.floor(lo/span) !== Math.floor((hi-1)/span)) span *= 2;
  lo = Math.floor(lo/span)*span; hi = lo+span;
  const key = `${lo}:${hi}`;
  if (!groups.has(key)) groups.set(key,[]);
  groups.get(key).push(i);
}
await mkdir(output,{recursive:true});
const chunks = [];
for (const [key, ids] of groups) {
  const [lo,hi] = key.split(':').map(Number);
  for (let start = 0; start < ids.length; start += 8192) {
    const subset = ids.slice(start,start+8192), bytes = Buffer.alloc(subset.length*132);
    subset.forEach((sourceId,i) => {
      bytes.writeUInt32LE(sourceId,i*132);
      ply.copy(bytes,i*132+4,offset+sourceId*128,offset+(sourceId+1)*128);
    });
    const compressed = gzipSync(bytes,{level:9,mtime:0}), sha256 = hash(compressed);
    const name = `${sha256}.stg.gz`;
    await writeFile(`${output}/${name}`,compressed);
    chunks.push({name,sha256,start:lo/bins*duration,end:hi/bins*duration,count:subset.length,bytes:compressed.length,decodedBytes:bytes.length});
  }
}
chunks.sort((a,b)=>a.start-b.start || a.end-b.end || a.name.localeCompare(b.name));
const camerasJson = JSON.parse(await readFile(camerasPath,'utf8'));
const cameraList = Array.isArray(camerasJson) ? camerasJson : camerasJson.cameras;
const seen = new Set();
const cameras = cameraList.filter(c=>{const key=JSON.stringify(c.position);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,8);
const manifest = {schema:'pajama.stg.stream.v1',id,representation:'stg-lite-32f',recordBytes:132,headerTemplate:header.replace(/element vertex \d+/,'element vertex COUNT'),durationSeconds:duration,timeMapping:'normalized model time = seconds / durationSeconds',sourceCount:count,retainedCount:count-discarded,modelSha256,provenance,license:'Research / non-commercial evaluation only. See /data/THIRD_PARTY_NOTICES.md.',cameras,chunks};
await writeFile(`${output}/manifest.json`,JSON.stringify(manifest,null,2));
console.log(JSON.stringify({id,count,discarded,modelSha256,chunkCount:chunks.length,totalBytes:chunks.reduce((n,c)=>n+c.bytes,0),firstWindowBytes:chunks.filter(c=>c.start<=duration/32 && c.end>=0).reduce((n,c)=>n+c.bytes,0)},null,2));
