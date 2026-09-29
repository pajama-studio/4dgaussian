import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const entries=[['sear','artifacts/gpu-driven-sear/report.json'],['flames','artifacts/gpu-driven-flames/report.json']];
const files=['src/gpu_prepare.rs','src/gpu_cull.wgsl','src/gpu_radix.wgsl','src/stg_pass.rs','examples/gpu_driven_bench.rs','examples/gpu_prepare_check.rs'];
const sourceSha256={};for(const path of files)sourceSha256[path]=createHash('sha256').update(await readFile(path)).digest('hex');
await mkdir('public/streaming/evidence',{recursive:true});
const scenes=[];
for(const [scene,path] of entries){
  const report=JSON.parse(await readFile(path,'utf8'));
  const raw=await readFile(report.model),ply=raw[0]===31&&raw[1]===139?gunzipSync(raw):raw;
  report.modelSha256=createHash('sha256').update(ply).digest('hex');report.sourceSha256=sourceSha256;
  await writeFile(`public/streaming/evidence/gpu-driven-${scene}.json`,JSON.stringify(report,null,2)+'\n');
  const [cpu,gpu]=report.results;
  scenes.push({scene,sourceCount:report.sourceCount,adapter:report.adapter,backend:report.backend,resolution:[report.width,report.height],cpuPrepareMs:cpu.cpuPrepareAndEncodeMs.p50,gpuPathCpuPrepareMs:gpu.cpuPrepareAndEncodeMs.p50,cpuPathFrameMs:cpu.serializedFrameMs.p50,gpuPathFrameMs:gpu.serializedFrameMs.p50,cpuPathP95Ms:cpu.serializedFrameMs.p95,gpuPathP95Ms:gpu.serializedFrameMs.p95,frameReductionPercent:100*(1-gpu.serializedFrameMs.p50/cpu.serializedFrameMs.p50),gpuCullSortRenderMs:gpu.gpuCullSortRenderMs.p50,qualityCases:report.accuracy.length,maxRmse8bit:Math.max(...report.accuracy.map(x=>x.rmse8bit)),maxChannelDifference8bit:Math.max(...report.accuracy.map(x=>x.max8bit)),allVisibleSetsMatch:report.accuracy.every(x=>x.sameVisibleSet),report:`./evidence/gpu-driven-${scene}.json`});
}
await writeFile('public/streaming/evidence/gpu-driven-summary.json',JSON.stringify({createdAt:new Date().toISOString(),scope:'Native DX12, same real STG-Lite records and render shader. Serialized CPU-to-GPU-completion latency, not presentation FPS. Source hashes and every raw sample are in the scene reports.',scenes},null,2)+'\n');
console.log(JSON.stringify(scenes,null,2));
