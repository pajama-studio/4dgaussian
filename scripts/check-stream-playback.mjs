import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {assemble} from '../public/streaming/loader.mjs';
import {OrbitCamera} from '../public/streaming/orbit.mjs';
import {planWindow,covers,upcoming,CACHE_BYTES} from '../public/streaming/policy.mjs';
const manifests=await Promise.all(['sear-steak-v1b','flames-v1b'].map(async dir=>({dir,m:JSON.parse(await readFile(`artifacts/streaming/${dir}/manifest.json`,'utf8'))})));
const approx=(a,b,tolerance=1e-5)=>assert(Math.abs(a-b)<tolerance,`${a} != ${b}`);
for(const {m} of manifests){
  assert.equal(planWindow(m,0).mode,'resident');assert.equal(upcoming(m,planWindow(m,0)),null);
  for(const c of m.cameras){
    const forward=c.rotation.map(r=>r[2]),center=c.position.map((x,i)=>x+forward[i]*10),orbit=new OrbitCamera(c,center);
    const initial=orbit.value();for(let i=0;i<3;i++)approx(initial[i],c.position[i]);
    orbit.rotate(.5,.2);assert.notDeepEqual(orbit.value(),initial);
    orbit.pan(.1,-.1);orbit.zoom(-.2);const view=orbit.value();
    const f=Array.from(view.slice(3,6)),u=Array.from(view.slice(6,9));approx(Math.hypot(...f),1);approx(Math.hypot(...u),1);approx(f.reduce((n,v,i)=>n+v*u[i],0),0);
    orbit.rotate(0,100);orbit.zoom(-100);assert(orbit.value().every(Number.isFinite));assert(orbit.distance>=orbit.baseDistance*.025);
    orbit.reset();assert.deepEqual(orbit.value(),initial);
  }
}
const long={durationSeconds:200,chunks:Array.from({length:40},(_,i)=>({start:i*5,end:(i+1)*5,decodedBytes:8*1024*1024}))};
for(let t=0;t<=200;t+=.25){const w=planWindow(long,t);assert(covers(w,t));assert.equal(w.mode,'windowed');assert(long.chunks.filter(c=>c.start<=w.end&&c.end>=w.start).reduce((n,c)=>n+c.decodedBytes,0)<=CACHE_BYTES);const next=upcoming(long,w);assert(next.end>w.end||next.start===0);}
assert.throws(()=>planWindow({durationSeconds:10,chunks:[{start:0,end:10,decodedBytes:CACHE_BYTES+1}]},0),/budget/);

// Retain the former comparator assembly here as an independent byte-order oracle.
function reference(chunks,headerTemplate){
  const count=chunks.reduce((n,b)=>n+b.length/132,0),rows=new Uint8Array(count*132);let offset=0;
  for(const c of chunks){rows.set(c,offset);offset+=c.length;}
  const v=new DataView(rows.buffer),order=Uint32Array.from({length:count},(_,i)=>i);
  order.sort((a,b)=>v.getUint32(a*132,true)-v.getUint32(b*132,true));
  const h=new TextEncoder().encode(headerTemplate.replace('COUNT',count)),ply=new Uint8Array(h.length+count*128);ply.set(h);
  for(let i=0;i<count;i++)ply.set(rows.subarray(order[i]*132+4,order[i]*132+132),h.length+i*128);
  return ply;
}
const results=[];
for(const {dir,m} of manifests){
  const chunks=await Promise.all(m.chunks.map(async c=>gunzipSync(await readFile(`artifacts/streaming/${dir}/${c.name}`))));
  const expected=reference(chunks,m.headerTemplate);assert.deepEqual(assemble(chunks,m.headerTemplate,m.sourceCount),expected);
  const samples=[[],[]];
  for(let round=0;round<9;round++)for(const variant of (round%2?[1,0]:[0,1])){
    const start=performance.now();const result=variant?assemble(chunks,m.headerTemplate,m.sourceCount):reference(chunks,m.headerTemplate);
    const elapsed=performance.now()-start;assert.equal(result.length,expected.length);if(round>=2)samples[variant].push(elapsed);
  }
  const median=a=>a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)];
  results.push({scene:m.id,records:m.retainedCount,referenceP50Ms:median(samples[0]),linearP50Ms:median(samples[1]),samplesMs:samples,byteIdentical:true});
  assert.throws(()=>assemble([chunks[0],chunks[0]],m.headerTemplate,m.sourceCount),/Duplicate/);
}
await writeFile('artifacts/streaming/assembly-improvement.json',JSON.stringify({note:'Node CPU assembly only; two warmups + seven rotated rounds, same real records, not a browser FPS claim.',results},null,2));
console.log(JSON.stringify({status:'pass',checks:['calibrated camera identity','orbit pan zoom orthonormality and reset','bounded long-scene windows and loop prefetch','byte-identical real-data assembly','duplicate rejection'],results:results.map(({samplesMs,...r})=>r)},null,2));
