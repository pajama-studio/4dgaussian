import initWasm,{GaussianRenderer} from '/pkg/pajama_gaussian_lab.js?v=stream-2';
import {TemporalStream} from './loader.mjs';
const $=s=>document.querySelector(s),canvas=$('#scene');
let stream,manifest,renderer,camera,active,requested=0,shown=0,playing=false,busy=false,generation=0,seekSequence=0;
const mib=b=>(b/1048576).toFixed(2)+' MiB';
let language=new URLSearchParams(location.search).get('lang')==='zh'?'zh':'en';
function translate(){document.documentElement.lang=language;document.querySelectorAll('[data-en]').forEach(e=>e.textContent=e.dataset[language]);}
$('#language').onclick=()=>{language=language==='en'?'zh':'en';translate();};translate();
function cameraRecord(c){const r=c.rotation;return new Float32Array([...c.position,r[0][2],r[1][2],r[2][2],-r[0][1],-r[1][1],-r[2][1],2*Math.atan(c.height/(2*c.fy)),c.width,c.height]);}
$('#load').onclick=async()=>{
  const ticket=++generation;$('#load').disabled=true;playing=false;stream?.cancel();active=null;busy=true;
  $('#play').disabled=$('#time').disabled=true;$('#status').textContent='Loading manifest…';
  try{
    await initWasm({module_or_path:'/pkg/pajama_gaussian_lab_bg.wasm?v=stream-2'});
    const next=new TemporalStream($('#dataset').value,{onProgress:p=>{if(ticket===generation)$('#status').textContent=`Loading ${p.completed}/${p.total} chunks · ${mib(p.received)}`;}});
    const info=await next.open();if(ticket!==generation)return;
    stream=next;manifest=info;$('#time').max=String(info.durationSeconds);$('#time').value=0;requested=shown=0;
    $('#camera').replaceChildren(...info.cameras.map((c,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=c.name??c.img_name??`Camera ${i}`;return o;}));
    $('#camera').disabled=false;camera=cameraRecord(info.cameras[0]);
    await seek(0);if(ticket!==generation)return;
    $('#play').disabled=$('#time').disabled=$('#idle-test').disabled=false;
  }catch(e){if(e.name!=='AbortError')$('#status').textContent=e.message;}finally{if(ticket===generation){busy=false;$('#load').disabled=false;}}
};
$('#camera').onchange=()=>{camera=cameraRecord(manifest.cameras[Number($('#camera').value)]);};
async function seek(time){
  const owner=stream,ticket=generation,seekTicket=++seekSequence;busy=true;
  const width=manifest.durationSeconds/16;
  const start=Math.floor(Math.min(time,manifest.durationSeconds-1e-8)/width)*width;
  const end=Math.min(manifest.durationSeconds,start+width*2);
  try{
    const window=await owner.window(start,end);
    if(ticket!==generation || owner!==stream || window.generation!==owner.generation)return;
    const started=performance.now();
    if(renderer)renderer.replaceSource(window.ply);else renderer=await GaussianRenderer.create(canvas,window.ply);
    if(ticket!==generation || window.generation!==owner.generation)return;
    active={start,end};shown=time;
    $('#network').textContent=mib(window.stats.networkBytes);
    $('#cache').textContent=mib(window.stats.cacheBytes)+' / 64 MiB';
    $('#seek').textContent=(window.stats.seekMs+performance.now()-started).toFixed(0)+' ms';
    $('#reuse').textContent=`${window.stats.cacheHits} / ${window.stats.selectedChunks}`;
    $('#status').textContent=`Resident interval ${start.toFixed(3)}–${end.toFixed(3)} s · ${renderer.sourceCount.toLocaleString()} Gaussians`;
  }catch(e){if(e.name!=='AbortError'){playing=false;$('#status').textContent=e.message;}}
  finally{if(ticket===generation&&owner===stream&&seekTicket===seekSequence)busy=false;}
}
$('#time').oninput=()=>{playing=false;requested=Number($('#time').value);$('#play').textContent='Play / 播放';if(active&&requested>=active.start&&requested<=active.end){stream.cancel();shown=requested;busy=false;}else seek(requested);};
$('#play').onclick=()=>{playing=!playing;$('#play').textContent=playing?'Pause / 暂停':'Play / 播放';};
let last=performance.now(),meter=0;
function frame(now){
  const dt=Math.min(.05,(now-last)/1000);last=now;
  if(renderer&&manifest&&active){
    if(playing&&!busy){requested=(shown+dt)%manifest.durationSeconds;if(requested>=active.start&&requested<=active.end)shown=requested;else seek(requested);$('#time').value=shown;}
    $('#clock').textContent=shown.toFixed(3)+' s';
    const rect=canvas.getBoundingClientRect(),w=Math.round(rect.width*Math.min(1.35,devicePixelRatio)),h=Math.round(w*.75);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    try{renderer.render(Math.min(shown/manifest.durationSeconds,1-1e-7)*10,0,0,17,w,h,camera);}catch(e){playing=false;$('#status').textContent=e.message;}
    if(now-meter>250){meter=now;$('#submitted').textContent=String(renderer.submittedFrames);$('#cpu').textContent=renderer.prepareMs.toFixed(2)+' ms';$('#gpu').textContent=renderer.gpuRenderMs>=0?renderer.gpuRenderMs.toFixed(3)+' ms':'Unavailable';$('#visible').textContent=`${renderer.visible.toLocaleString()} / ${renderer.sourceCount.toLocaleString()}`;$('#upload').textContent=mib(renderer.uploadBytes);}
  }
  requestAnimationFrame(frame);
}requestAnimationFrame(frame);
$('#query').onsubmit=async e=>{e.preventDefault();const url=`/api/gaussians/${$('#dataset').value}/range?start=${encodeURIComponent($('#start').value)}&end=${encodeURIComponent($('#end').value)}`;$('#query-link').href=url;try{const r=await fetch(url);$('#query-result').textContent=r.ok?JSON.stringify(await r.json(),null,2):`HTTP ${r.status}: ${await r.text()}`;}catch(e){$('#query-result').textContent=e.message;}};
fetch('./report.json').then(r=>r.ok?r.json():null).then(report=>{if(!report)return;const table=document.createElement('table');const head=document.createElement('tr');for(const t of ['Iteration','Change','Evidence','Decision']){const h=document.createElement('th');h.textContent=t;head.append(h);}table.append(head);for(const row of report.iterations){const tr=document.createElement('tr');for(const t of [row.iteration,row.change,row.evidence,row.decision]){const td=document.createElement('td');td.textContent=String(t);tr.append(td);}table.append(tr);}$('#results').append(table);}).catch(()=>{});

$('#idle-test').onclick=async()=>{
  if(!renderer||busy)return;
  playing=false;$('#idle-test').disabled=true;$('#play').disabled=true;$('#time').disabled=true;$('#load').disabled=true;$('#camera').disabled=true;
  try{
    $('#idle-result').textContent='Measuring continuous redraw…';renderer.setRenderOnDemand(false);
    const begin=renderer.submittedFrames;await new Promise(r=>setTimeout(r,2000));const continuous=renderer.submittedFrames-begin;
    $('#idle-result').textContent='Measuring render on demand…';renderer.setRenderOnDemand(true);
    const middle=renderer.submittedFrames;await new Promise(r=>setTimeout(r,2000));const demand=renderer.submittedFrames-middle;
    const report={schema:'pajama.idle-evidence.v1',scene:stream.id,windowMs:2000,continuousGpuFrames:continuous,onDemandGpuFrames:demand,visible:renderer.visible,sourceCount:renderer.sourceCount};
    $('#idle-result').textContent=JSON.stringify(report,null,2);
  }finally{renderer.setRenderOnDemand(true);for(const id of ['idle-test','play','time','load','camera'])$('#'+id).disabled=false;}
};
