import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { fields, decodeProjection, decodeHits, appearanceCoefficients, recordColor, viewingDirection, sourceSnapshot } from '../public/inspector-data.mjs';
import { sampleSH } from '../public/math/sh.mjs';
import { copy } from '../public/inspector.mjs';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-12, `${a} != ${b}`);
const bytes=gunzipSync(await readFile(new URL('../public/data/n3d-sear-steak-stg-lite.ply.gz',import.meta.url)));
const headerEnd=bytes.indexOf('end_header\n')+'end_header\n'.length;
assert.ok(headerEnd>11);
const header=bytes.subarray(0,headerEnd).toString('ascii');
assert.deepEqual([...header.matchAll(/^property float (\S+)/gm)].map(m=>m[1]),fields);
const count=Number(header.match(/element vertex (\d+)/)[1]);
assert.equal(bytes.length-headerEnd,count*32*4);
const directions=[[1,0,0],[0,-1,0],[0,0,1],[3,4,-5]];
for(const id of [0,700,Math.floor(count/2),count-1]) {
  const row=Array.from({length:32},(_,i)=>bytes.readFloatLE(headerEnd+(id*32+i)*4));
  const original=[...row],rgb=recordColor(row),a=appearanceCoefficients(row);
  for(const direction of directions)sampleSH(a,direction,3).display.forEach((v,ch)=>close(v,rgb[ch]));
  assert.ok(a.slice(1).every(c=>c.every(v=>v===0)));
  const teaching=appearanceCoefficients(row,true);
  assert.deepEqual(teaching[0],a[0]);
  assert.ok(teaching.slice(1).some(c=>c.some(v=>v!==0)));
  assert.notDeepEqual(sampleSH(teaching,[0,0,1],3).raw,sampleSH(teaching,[0,0,-1],3).raw);
  assert.deepEqual(row,original);
  const snapshot=sourceSnapshot(id,row,null,'actual',a,0,[0,0,1]);
  assert.equal(Object.keys(snapshot.raw).length,32);
  assert.match(snapshot.appearance.mode,/derived/);
  assert.match(snapshot.appearance.sourceFormat,/no learned SH/);
  assert.equal(snapshot.raw.motion_3,row[11]);
}
// Explicit hand-constructed Rust ABI: rotated axes give Sigma_xy = 1.5.
const s=Math.SQRT1_2;
const packed=[.25,1,2,3,.4,.5,.8,.5,2,1,1,1,0,0,0,120,130,850.3,750,850.3,40,10,s,s,0,0,0,5,1,20,30,200,200,2*s,2*s,0,-s,s,0,0,0,1];
const state=decodeProjection(packed);
assert.equal(packed.length,42);assert.equal(state.time,.25);
close(state.covariance[0][0],2.5);close(state.covariance[0][1],1.5);
assert.deepEqual(state.quaternion,[1,0,0,0]);
assert.deepEqual(state.viewport,[20,30,200,200]);
viewingDirection(state).forEach((v,i)=>close(v,[1,2,3][i]/Math.sqrt(14)));
assert.equal(decodeProjection([]),null);
assert.equal(decodeProjection(packed.map((x,i)=>i===5?NaN:x)),null);
const picked=decodeHits([2,.25,120.5,130.5,7,.8,1,.8,4,9,.5,.2,.1,5]);
assert.equal(picked.hits[0].id,7);assert.equal(picked.hits[1].weight,.1);
assert.equal(picked.hits[1].transmittance,.2);assert.deepEqual(decodeHits([]).hits,[]);
assert.throws(()=>decodeHits([1,0,10,10,0]));
for(const [key,pair] of Object.entries(copy)) {
  assert.equal(pair.length,2,key);assert.ok(pair.every(v=>typeof v==='string'&&v.length),key);
  assert.ok(!/\p{Script=Han}/u.test(pair[1]),key+' English');
  assert.deepEqual(pair[0].match(/\{\w+\}/g),pair[1].match(/\{\w+\}/g),key+' placeholders');
}
console.log(`Inspector checks passed: actual ${count}-record PLY schema, RGB/DC identity, synthetic provenance, 42-float ABI, covariance, direction, hit decoding, ${Object.keys(copy).length} bilingual messages.`);
