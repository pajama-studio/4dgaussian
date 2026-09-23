import initWasm,{GaussianRenderer} from '/pkg/pajama_gaussian_lab.js?v=stream-2';
import {WorkerStream} from './worker-client.mjs';
import {planWindow,covers,upcoming} from './policy.mjs';
import {OrbitCamera,bindOrbit} from './orbit.mjs';
const $=s=>document.querySelector(s),canvas=$('#scene');
const mib=b=>(b/1048576).toFixed(2)+' MiB';
let language=new URLSearchParams(location.search).get('lang')==='zh'?'zh':'en';
const tr=(en,zh)=>language==='zh'?zh:en;
let stream,manifest,renderer,rig,camera,focus,active,pending,measurement;
let shown=0,playing=false,busy=false,generation=0,requestSerial=0,prefetchFailed=false;
let counters={replacements:0,bufferEvents:0,bufferMs:0,mediaSeconds:0},waitingSince=null;
function setPlaying(value){playing=value;$('#play').textContent=value?tr('Pause','暂停'):tr('Play','播放');}
function viewChanged(){
  if(!rig)return;camera=rig.value();
  $('#view-state').textContent=rig.changed?`${tr('Orbit','自由视角')} · ${Math.round(rig.yaw*180/Math.PI)}° / ${Math.round(rig.pitch*180/Math.PI)}° · ${rig.distance.toFixed(2)}`:tr('Calibrated view','标定视角');
}
function translate(){document.documentElement.lang=language;document.querySelectorAll('[data-en]').forEach(e=>e.textContent=e.dataset[language]);setPlaying(playing);viewChanged();}
$('#language').onclick=()=>{language=language==='en'?'zh':'en';translate();};translate();
bindOrbit(canvas,()=>rig,viewChanged,()=>!measurement);
$('#reset-view').onclick=()=>{rig?.reset();viewChanged();};
$('#camera').onchange=()=>{rig=new OrbitCamera(manifest.cameras[Number($('#camera').value)],focus);viewChanged();};
function updateDelivery(window){
  $('#network').textContent=mib(window.stats.networkBytes);
  $('#cache').textContent=mib(window.stats.cacheBytes)+' / 64 MiB';
  $('#reuse').textContent=`${window.stats.cacheHits} / ${window.stats.selectedChunks}`;
}
function finishWaiting(){if(waitingSince!==null){counters.bufferMs+=performance.now()-waitingSince;waitingSince=null;}}
function install(window,plan,time,alreadyUploaded=false){
  const started=performance.now();
  if(window.ply&&!alreadyUploaded){renderer.replaceSource(window.ply);counters.replacements++;}
  if(!rig){focus=window.focus;rig=new OrbitCamera(manifest.cameras[Number($('#camera').value)],focus);viewChanged();}
  active={...plan,key:window.key};shown=time;finishWaiting();updateDelivery(window);
  $('#seek').textContent=(window.stats.seekMs+performance.now()-started).toFixed(0)+' ms';
  $('#delivery').textContent=plan.mode==='resident'?tr('Whole clip fits budget','整段可装入预算'):tr('Prefetched time windows','按时间窗口预取');
  $('#status').textContent=`${tr('Resident interval','驻留区间')} ${plan.start.toFixed(3)}–${plan.end.toFixed(3)} s · ${renderer.sourceCount.toLocaleString()} Gaussians`;
  $('#buffer').textContent=plan.mode==='resident'?tr('Ready · no window rebuilds during playback','就绪 · 播放期间无需重建窗口'):tr('Ready','就绪');
}
async function seek(time){
  const owner=stream,ticket=generation,serial=++requestSerial;
  pending=null;prefetchFailed=false;busy=true;owner.cancel();
  try{
    const plan=planWindow(manifest,time),window=await owner.window(plan.start,plan.end,active?.key);
    if(ticket!==generation||serial!==requestSerial)return;
    let created=false;
    if(!renderer){const next=await GaussianRenderer.create(canvas,window.ply);if(ticket!==generation||serial!==requestSerial){next.free();return;}renderer=next;created=true;}
    install(window,plan,time,created);
  }catch(error){if(ticket===generation&&serial===requestSerial&&error.name!=='AbortError'){setPlaying(false);$('#status').textContent=error.message;}}
  finally{if(ticket===generation&&serial===requestSerial){busy=false;finishWaiting();}}
}
function prefetch(){
  const plan=upcoming(manifest,active);if(!plan)return;
  const owner=stream,ticket=generation,serial=++requestSerial;pending={plan};
  $('#buffer').textContent=tr('Preparing next window in background…','正在后台准备下一窗口…');
  owner.window(plan.start,plan.end,active.key).then(window=>{
    if(ticket!==generation||serial!==requestSerial)return;
    pending={plan,window};updateDelivery(window);$('#buffer').textContent=tr('Next window ready','下一窗口已就绪');
  }).catch(error=>{
    if(ticket!==generation||serial!==requestSerial)return;
    pending=null;prefetchFailed=true;if(error.name!=='AbortError')$('#buffer').textContent=error.message;
  });
}
$('#load').onclick=async()=>{
  const ticket=++generation;++requestSerial;setPlaying(false);stream?.dispose();
  active=null;pending=null;rig=null;busy=true;shown=0;finishWaiting();
  counters={replacements:0,bufferEvents:0,bufferMs:0,mediaSeconds:0};
  for(const id of ['load','play','time','camera','reset-view','idle-test','playback-test'])$('#'+id).disabled=true;
  $('#status').textContent=tr('Loading manifest…','正在加载清单…');$('#buffer').textContent='—';
  try{
    await initWasm({module_or_path:'/pkg/pajama_gaussian_lab_bg.wasm?v=stream-2'});
    const next=new WorkerStream($('#dataset').value,p=>{if(ticket===generation){const message=`${p.completed}/${p.total} chunks · ${mib(p.received)}`;if(active)$('#buffer').textContent=message;else $('#status').textContent=message;}});
    stream=next;manifest=await next.open();if(ticket!==generation)return;
    $('#time').max=String(manifest.durationSeconds);$('#time').value=0;
    $('#camera').replaceChildren(...manifest.cameras.map((c,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=c.name??c.img_name??`Camera ${i}`;return o;}));
    await seek(0);
    if(ticket===generation&&active)for(const id of ['play','time','camera','reset-view','idle-test','playback-test'])$('#'+id).disabled=false;
  }catch(error){if(error.name!=='AbortError')$('#status').textContent=error.message;}
  finally{if(ticket===generation){busy=false;$('#load').disabled=false;}}
};
$('#time').oninput=()=>{
  const time=Number($('#time').value);setPlaying(false);++requestSerial;pending=null;stream.cancel();finishWaiting();
  if(covers(active,time)){shown=time;busy=false;}else seek(time);
};
$('#play').onclick=()=>{prefetchFailed=false;setPlaying(!playing);};

let renderWidth=960,renderHeight=720,last=performance.now(),meter=0;
function resize(){renderWidth=Math.max(1,Math.round(canvas.clientWidth*Math.min(1.35,devicePixelRatio)));renderHeight=Math.round(renderWidth*.75);if(canvas.width!==renderWidth||canvas.height!==renderHeight){canvas.width=renderWidth;canvas.height=renderHeight;}}
new ResizeObserver(resize).observe(canvas);window.addEventListener('resize',resize);resize();
function frame(now){
  const dt=Math.min(.25,(now-last)/1000);last=now;
  if(renderer&&manifest&&active){
    if(playing&&!document.hidden){
      const next=(shown+dt)%manifest.durationSeconds;
      if(!busy&&covers(active,next)){shown=next;counters.mediaSeconds+=dt;}
      else if(!busy&&pending?.window&&covers(pending.plan,next)){const ready=pending;pending=null;install(ready.window,ready.plan,next);counters.mediaSeconds+=dt;}
      else{
        if(waitingSince===null){waitingSince=performance.now();counters.bufferEvents++;}
        if(!busy&&!pending)seek(next);
      }
      if(!busy&&!pending&&!prefetchFailed&&active.mode!=='resident'&&active.end-shown<Math.max(1,(active.end-active.start)/2))prefetch();
    }
    try{renderer.render(Math.min(shown/manifest.durationSeconds,1-1e-7)*10,0,0,17,renderWidth,renderHeight,camera);}catch(error){setPlaying(false);$('#status').textContent=error.message;}
    if(now-meter>100){
      meter=now;$('#clock').textContent=shown.toFixed(3)+' s';$('#time').value=shown;
      $('#submitted').textContent=String(renderer.submittedFrames);$('#cpu').textContent=renderer.prepareMs.toFixed(2)+' ms';
      $('#gpu').textContent=renderer.gpuRenderMs>=0?renderer.gpuRenderMs.toFixed(3)+' ms':tr('Unavailable','不可用');
      $('#visible').textContent=`${renderer.visible.toLocaleString()} / ${renderer.sourceCount.toLocaleString()}`;$('#upload').textContent=mib(renderer.uploadBytes);
    }
    measureFrame(now);
  }
  requestAnimationFrame(frame);
}requestAnimationFrame(frame);

function lockControls(locked){for(const id of ['load','dataset','time','play','camera','reset-view','idle-test','playback-test'])$('#'+id).disabled=locked;}
function measureFrame(now){
  const m=measurement;if(!m||m.kind!=='playback')return;
  if(document.hidden)m.hidden=true;
  if(now<m.warmupEnd)return;
  if(!m.start){m.start=now;m.last=now;m.frames=renderer.submittedFrames;m.before={...counters};return;}
  m.intervals.push(now-m.last);m.last=now;
  if(now-m.start<6000)return;
  const sorted=m.intervals.slice().sort((a,b)=>a-b),quantile=p=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))];
  const result={schema:'pajama.playback-evidence.v1',scene:stream.id,mode:active.mode,windowMs:now-m.start,submittedFrames:renderer.submittedFrames-m.frames,frameIntervalP50Ms:quantile(.5),frameIntervalP95Ms:quantile(.95),framesOver50Ms:m.intervals.filter(x=>x>50).length,bufferEvents:counters.bufferEvents-m.before.bufferEvents,bufferMs:counters.bufferMs-m.before.bufferMs,sourceReplacements:counters.replacements-m.before.replacements,mediaAdvancedSeconds:counters.mediaSeconds-m.before.mediaSeconds,residentCount:renderer.sourceCount,canvasPixels:[renderWidth,renderHeight],hiddenDuringMeasurement:!!m.hidden};
  $('#playback-result').textContent=JSON.stringify(result,null,2);measurement=null;setPlaying(false);lockControls(false);
}
$('#playback-test').onclick=()=>{if(!renderer||busy)return;canvas.scrollIntoView({block:'center',behavior:'instant'});measurement={kind:'playback',warmupEnd:performance.now()+1000,intervals:[]};lockControls(true);$('#playback-result').textContent=tr('1 s warmup, then 6 s of actual playback…','预热 1 秒，然后测量实际播放 6 秒…');setPlaying(true);};
$('#idle-test').onclick=async()=>{
  if(!renderer||busy)return;measurement={kind:'idle'};setPlaying(false);lockControls(true);
  try{
    $('#idle-result').textContent='Measuring continuous redraw…';renderer.setRenderOnDemand(false);
    const begin=renderer.submittedFrames;await new Promise(r=>setTimeout(r,2000));const continuous=renderer.submittedFrames-begin;
    $('#idle-result').textContent='Measuring render on demand…';renderer.setRenderOnDemand(true);
    const middle=renderer.submittedFrames;await new Promise(r=>setTimeout(r,2000));
    $('#idle-result').textContent=JSON.stringify({schema:'pajama.idle-evidence.v1',scene:stream.id,windowMs:2000,continuousGpuFrames:continuous,onDemandGpuFrames:renderer.submittedFrames-middle,visible:renderer.visible,sourceCount:renderer.sourceCount},null,2);
  }finally{renderer.setRenderOnDemand(true);measurement=null;lockControls(false);}
};
$('#query').onsubmit=async e=>{e.preventDefault();const url=`/api/gaussians/${$('#dataset').value}/range?start=${encodeURIComponent($('#start').value)}&end=${encodeURIComponent($('#end').value)}`;$('#query-link').href=url;try{const r=await fetch(url);$('#query-result').textContent=r.ok?JSON.stringify(await r.json(),null,2):`HTTP ${r.status}: ${await r.text()}`;}catch(e){$('#query-result').textContent=e.message;}};
fetch('./report.json').then(r=>r.ok?r.json():null).then(report=>{if(!report)return;const table=document.createElement('table');const head=document.createElement('tr');for(const t of ['Iteration','Change','Evidence','Decision']){const h=document.createElement('th');h.textContent=t;head.append(h);}table.append(head);for(const row of report.iterations){const tr=document.createElement('tr');for(const t of [row.iteration,row.change,row.evidence,row.decision]){const td=document.createElement('td');td.textContent=String(t);tr.append(td);}table.append(tr);}$('#results').append(table);}).catch(()=>{});
