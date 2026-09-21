import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { initialRecords, evaluateRecord, gradient, forward, encodePly, properties } from '../public/math/trace.mjs';
import { condition4D, evaluateSH1, compositeFeatures, decodeDeformation } from '../public/math/reference.mjs';
const results = [];
const flat = value => Array.isArray(value) ? value.flat(Infinity) : [value];
function close(name, actual, expected, tolerance = 2e-6) {
  const a=flat(actual), b=flat(expected);
  assert.equal(a.length,b.length,name);
  const error=Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
  assert.ok(Number.isFinite(error) && error<tolerance, name+': '+error);
  results.push({ name, error, tolerance });
}
const records=initialRecords(), cases=[];
for (const time of [0.35,0.5,0.65]) {
  const center=evaluateRecord(records[0],time,[0,0]).uv;
  const pixel=center.map(v=>v+0.5);
  for (const parameter of [0,1,2,20]) {
    const g=gradient(records,parameter,time,pixel);
    for (const f of g.finite) close('complete gradient t='+time+' parameter='+parameter+' h='+f.h, g.analytic,f.value);
    cases.push({records,time,pixel,parameter,color:g.result.color,loss:g.result.loss,gradient:g.analytic});
  }
  const s=evaluateRecord(records[0],time,pixel);
  close('Mahalanobis equals interpolated local norm t='+time,
    s.radiusSquared,s.local.reduce((sum,v)=>sum+v*v,0),1e-10);
  const projected=s.projectedAxes;
  close('sum of projected axis outer products t='+time,
    [[projected.reduce((v,d)=>v+d[0]**2,0)+0.3,projected.reduce((v,d)=>v+d[0]*d[1],0)],
      [projected.reduce((v,d)=>v+d[0]*d[1],0),projected.reduce((v,d)=>v+d[1]**2,0)+0.3]],
    s.covariance,1e-12);
  // Verify homogeneous projection independently, including the WebGPU Y reflection.
  const [x,y,z]=s.mean, W=128,H=96,f=100;
  const clip=[2*f*x/W,-2*f*y/H,z]; // hx,hy,hw for centered perspective
  const homogeneous=s.axes.map(([ax,ay,az])=> {
    const delta=[2*f*ax/W,-2*f*ay/H,az];
    return [(delta[0]*z-clip[0]*az)/z**2*W/2,
      -(delta[1]*z-clip[1]*az)/z**2*H/2];
  });
  close('homogeneous derivative with Y convention t='+time,homogeneous,s.projectedAxes,1e-12);
}
const before=forward(records).loss;
const stepped=records.map(row=>[...row]);
stepped[0][20]-=0.5*gradient(records,20).analytic;
assert.ok(forward(stepped).loss<before,'Default teaching SGD step should reduce loss');
const atCenter=condition4D([0,0,0],0,[[2,0,0],[0,1,0],[0,0,1]],[1,0,0],1,2);
close('conditional center',atCenter.mean,[2,0,0]);
close('conditional covariance',atCenter.covariance,[[1,0,0],[0,1,0],[0,0,1]]);
close('conditional temporal factor',atCenter.timeWeight,Math.exp(-2));
close('feature compositing',compositeFeatures([0.5,0.5],[[1,2],[3,0]],[0,0]),[1.25,1]);
close('SH DC coefficient',evaluateSH1([[Math.sqrt(4*Math.PI),0,0],[0,0,0],[0,0,0],[0,0,0]],[0,0,1]),[1,0,0]);
close('SH first-order sign',evaluateSH1([[0,0,0],[0,0,0],[0,0,0],[1,0,0]],[1,0,0]),[-Math.sqrt(3/(4*Math.PI)),0,0]);
close('deformation log-scale domain',decodeDeformation({position:[0,0,0],logScale:[Math.log(2),0,0],quaternion:[1,0,0,0]},[1,2,3],[Math.log(1.5),0,0],[0,0,0,0]).scale,[3,1,1]);
// PLY roundtrip: exact field order, little endian and the expected float32 rounding.
const ply=encodePly(records), marker=new TextEncoder().encode('end_header\n');
const headerEnd=Buffer.from(ply).indexOf(marker)+marker.length;
const header=new TextDecoder().decode(ply.slice(0,headerEnd));
assert.deepEqual([...header.matchAll(/property float (.+)/g)].map(m=>m[1]),properties);
assert.equal(ply.length-headerEnd,2*128);
const view=new DataView(ply.buffer);
records.forEach((row,i)=>row.forEach((v,j)=>assert.equal(view.getFloat32(headerEnd+(i*32+j)*4,true),Math.fround(v))));
const html=await readFile(new URL('../public/math/index.html',import.meta.url),'utf8');
const lessons=JSON.parse(await readFile(new URL('../public/math/lessons.json',import.meta.url),'utf8'));
assert.equal(Object.keys(lessons).length,39);
for (const [id,lesson] of Object.entries(lessons)) {
  assert.ok(html.includes('id="derive-'+id+'"'),'Missing lesson '+id);
  assert.ok(lesson.steps.length>=4 && lesson.steps.every(step=>step.source && step.why),'Every step needs mathematics and explanation: '+id);
  assert.ok(lesson.code.length && lesson.answer && lesson.pitfall,'Missing bridge/self-test: '+id);
}
const manifest=JSON.parse(await readFile(new URL('../public/math/source-manifest.json',import.meta.url),'utf8'));
for (const file of manifest.files) {
  const bytes=await readFile(new URL('../'+file.path,import.meta.url));
  close('source digest '+file.path,+(createHash('sha256').update(bytes).digest('hex')===file.sha256),1);
}
for (const excerpt of Object.values(manifest.excerpts)) {
  const [path,anchor]=excerpt.href.split('#');
  const sourceHtml=await readFile(new URL('../public'+path,import.meta.url),'utf8');
  assert.ok(sourceHtml.includes('id="'+anchor+'"'),'Source anchor exists');
}
await mkdir(new URL('../artifacts/math/',import.meta.url),{recursive:true});
await writeFile(new URL('../artifacts/math/trace-cases.json',import.meta.url),JSON.stringify(cases,null,2));
await writeFile(new URL('../artifacts/math/two-splats.ply',import.meta.url),ply);
await writeFile(new URL('../artifacts/math/cameras.json',import.meta.url),JSON.stringify({cameras:[{
  position:[0,0,0],rotation:[[1,0,0],[0,1,0],[0,0,1]],width:128,height:96,fx:100,fy:100,
}]}));
await writeFile(new URL('../artifacts/math/trace-checks.json',import.meta.url),JSON.stringify({status:'pass',results,plyBytes:ply.length,steps:Object.values(lessons).reduce((s,l)=>s+l.steps.length,0),sgd:{before,after:forward(stepped).loss}},null,2));
console.log('PASS: '+results.length+' numeric/source checks; 39 complete lessons; little-endian PLY roundtrip; SGD loss '+before+' -> '+forward(stepped).loss);
