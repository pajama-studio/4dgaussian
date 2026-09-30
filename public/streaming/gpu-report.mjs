let language=new URLSearchParams(location.search).get('lang')==='zh'?'zh':'en',report;
function draw(){
  document.documentElement.lang=language;
  document.querySelectorAll('[data-en]').forEach(e=>e.textContent=e.dataset[language]);
  document.querySelectorAll('a[href^="/build/cross-platform/"]').forEach(a=>a.href='/build/cross-platform/?lang='+language);
  if(!report)return;
  const container=document.querySelector('#native-results');container.replaceChildren();
  const table=document.createElement('table'),head=document.createElement('tr');
  for(const title of language==='zh'?['场景','CPU 路径 p50 / p95','GPU 路径 p50 / p95','p50 降幅','CPU 工作 p50','图像误差 / 数据']:['Scene','CPU path p50 / p95','GPU path p50 / p95','p50 reduction','CPU work p50','Image error / data']){const th=document.createElement('th');th.textContent=title;head.append(th);}table.append(head);
  for(const s of report.scenes){
    const row=document.createElement('tr');
    const texts=[`${s.scene} · ${s.sourceCount.toLocaleString()}`,`${s.cpuPathFrameMs.toFixed(3)} / ${s.cpuPathP95Ms.toFixed(3)} ms`,`${s.gpuPathFrameMs.toFixed(3)} / ${s.gpuPathP95Ms.toFixed(3)} ms`,s.frameReductionPercent.toFixed(1)+'%',`${s.cpuPrepareMs.toFixed(3)} → ${s.gpuPathCpuPrepareMs.toFixed(3)} ms`,`RMSE ≤ ${s.maxRmse8bit.toFixed(4)} / 255 · max ${s.maxChannelDifference8bit}`];
    for(const text of texts){const td=document.createElement('td');td.textContent=text;row.append(td);}
    const a=document.createElement('a');a.href=s.report;a.textContent=' JSON';row.lastChild.append(a);table.append(row);
  }
  container.append(table);
}
document.querySelector('#language').onclick=()=>{language=language==='en'?'zh':'en';draw();};draw();
fetch('./evidence/gpu-driven-summary.json').then(r=>{if(!r.ok)throw Error('Evidence unavailable');return r.json();}).then(r=>{report=r;draw();}).catch(e=>document.querySelector('#native-results').textContent=e.message);
