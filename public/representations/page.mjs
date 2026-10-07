const data = JSON.parse(document.querySelector('#atlas-data').textContent);
const $ = s => document.querySelector(s);
const all = s => [...document.querySelectorAll(s)];
const modelById = new Map(data.models.map(m => [m.id,m]));
const appearances = ['sh','sv','nasg','nasgabor','neural'];
const fields = [['geometry','Geometry','几何'],['appearance','Appearance','外观'],['time','Time','时间'],['parameters','Stored parameters','存储参数'],['exported','Export','导出'],['runtime','Runtime work','运行时工作'],['contract','Rendering contract','渲染约定'],['asset','Available assets','可用资产'],['support','Our engine','我们的引擎']];
let lang = 'en', selected = ['sh','stg-lite'], activePreview = null, previewState = 'idle';
const tr = o => o[lang];
const txt = (en,zh) => lang === 'zh' ? zh : en;
function node(tag,text,cls) { const el = document.createElement(tag); if(text) el.textContent=text; if(cls) el.className=cls; return el; }
function readLocation() {
  const p = new URLSearchParams(location.search);
  lang = p.get('lang') === 'zh' ? 'zh' : 'en';
  $('#scene-select').value = data.scenes.includes(p.get('scene')) ? p.get('scene') : data.scenes[0];
  $('#appearance-select').value = appearances.includes(p.get('appearance')) ? p.get('appearance') : 'sh';
  $('#group-select').value = Object.hasOwn(data.groups,p.get('layer')) ? p.get('layer') : 'all';
  $('#access-select').value = Object.hasOwn(data.access,p.get('access')) ? p.get('access') : 'all';
  $('#atlas-search').value = p.get('q') || '';
  const pair=(p.get('compare') || '').split(',').filter(x=>modelById.has(x));
  selected=pair.length===2 ? pair : ['sh','stg-lite'];
}
function saveLocation() {
  const u = new URL(location.href);
  u.searchParams.set('lang',lang);
  for(const [key,val,def] of [['scene',$('#scene-select').value,'chair'],['appearance',$('#appearance-select').value,'sh'],['layer',$('#group-select').value,'all'],['access',$('#access-select').value,'all'],['q',$('#atlas-search').value,''],['compare',selected.join(','),'sh,stg-lite']]) {
    if(val===def) u.searchParams.delete(key); else u.searchParams.set(key,val);
  }
  history.replaceState(null,'',u);
}
function translate() {
  document.documentElement.lang=lang;
  document.title=txt('GS Representation Atlas · Pajama Studio','GS 表征目录 · Pajama Studio');
  all('[data-atlas-i18n]').forEach(el=>{el.textContent=el.dataset[lang];});
  all('[data-language]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.language===lang)));
  $('.skip-link').textContent=txt('Skip to content','跳到正文');
  all('[data-lang-link]').forEach(a=>{const u=new URL(a.href);u.searchParams.set('lang',lang);a.href=u.pathname+u.search+u.hash;});
  updateWorkbench(); filter(); renderComparison(); updatePreviewStatus();
  const frame=$('#preview-mount iframe');if(frame) frame.title=txt('Interactive Gaussian model — external renderer','交互 Gaussian 模型 — 外部渲染器');
}
function modelUrl() { return `${data.modelBase}/${$('#appearance-select').value}/${$('#scene-select').value}.ngsplat`; }
function viewerUrl() {
  const u=new URL(data.appearanceViewer);
  u.searchParams.set('model',modelUrl());
  // Never pass an appearance override: the file's own header selects the decoder.
  return u.href;
}
function updateWorkbench() {
  const m=modelById.get($('#appearance-select').value);
  $('#appearance-info').replaceChildren(node('h3',tr(m.title)),node('p',tr(m.summary)),node('p',tr(m.runtime),'muted'));
  $('#model-file').textContent=`${$('#appearance-select').value}/${$('#scene-select').value}.ngsplat`;
  $('#open-viewer').href=viewerUrl();$('#model-download').href=modelUrl();
  const bytes=data.resourceSizes[modelUrl()];
  $('#download-size').textContent=bytes ? txt(`Download: ${(bytes/1048576).toFixed(1)} MiB · GPU memory will differ.`,`下载：${(bytes/1048576).toFixed(1)} MiB · 显存占用另计。`) : txt('Download size not verified.','尚未验证下载大小。');
  $('#load-preview').textContent=activePreview ? txt('Load selected model','加载所选模型') : txt('Load interactive preview','加载交互预览');
  updatePreviewStatus();
}
function updatePreviewStatus() {
  const changed=activePreview && activePreview !== viewerUrl();
  $('#preview-status').textContent=changed ? txt('Selection changed. Load it to replace the current preview.','选择已改变，加载后才会替换当前预览。') : previewState==='loading' ? txt('Opening the external viewer… Model download continues inside the preview.','正在打开外部 viewer……模型下载将在预览内继续。') : previewState==='loaded' ? txt('External viewer page opened. Its own loading status reports model progress.','外部 viewer 页面已打开；模型进度以预览内的状态为准。') : txt('Preview not loaded','尚未加载预览');
}
function stopPreview() {
  $('#preview-mount').replaceChildren();$('#preview-placeholder').hidden=false;$('#stop-preview').hidden=true;
  activePreview=null;previewState='idle';updateWorkbench();
}
$('#load-preview').addEventListener('click',()=>{
  const url=viewerUrl();
  const frame=document.createElement('iframe');
  frame.title=txt('Interactive Gaussian model — external renderer','交互 Gaussian 模型 — 外部渲染器');
  frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-pointer-lock allow-downloads');
  frame.allow='fullscreen';frame.referrerPolicy='no-referrer';frame.src=url;
  activePreview=url;previewState='loading';$('#preview-placeholder').hidden=true;$('#stop-preview').hidden=false;
  frame.addEventListener('load',()=>{if($('#preview-mount iframe')===frame){previewState='loaded';updatePreviewStatus();}});
  $('#preview-mount').replaceChildren(frame);updateWorkbench();
});
$('#stop-preview').addEventListener('click',stopPreview);
function filter() {
  const words=$('#atlas-search').value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const group=$('#group-select').value, availability=$('#access-select').value;
  let count=0;
  for(const m of data.models) {
    const haystack=[m.id,...['title','summary','geometry','appearance','time','parameters'].flatMap(k=>[m[k].en,m[k].zh])].join(' ').toLocaleLowerCase();
    const show=(group==='all'||m.group===group)&&(availability==='all'||m.availability===availability)&&words.every(w=>haystack.includes(w));
    document.getElementById(m.id).hidden=!show;if(show) count++;
  }
  $('#result-count').textContent=txt(`${count} of ${data.models.length} representations`,`${count}／${data.models.length} 种表征`);
  $('#empty-results').hidden=count!==0;
}
function renderComparison() {
  $('#compare-a').value=selected[0];$('#compare-b').value=selected[1];
  const columns=selected.map(id=>modelById.get(id));
  const table=node('table');const cap=node('caption',txt('Rendering contracts side by side','渲染约定并列对比'));table.append(cap);
  const head=node('thead'),hr=node('tr');
  for(const label of [txt('Property','属性'),...columns.map(m=>tr(m.title))]) {const th=node('th',label);th.scope='col';hr.append(th);}head.append(hr);table.append(head);
  const body=node('tbody');
  for(const [key,en,zh] of fields) {
    const row=node('tr'),th=node('th',txt(en,zh));th.scope='row';row.append(th,...columns.map(m=>node('td',tr(m[key]))));body.append(row);
  }
  table.append(body);$('#comparison').replaceChildren(table);
  all('[data-compare]').forEach(button=>{
    const chosen=selected.includes(button.dataset.compare);button.setAttribute('aria-pressed',String(chosen));
    button.textContent=chosen ? txt('In comparison','已加入对比') : txt('Compare','加入对比');
    button.setAttribute('aria-label',txt('Compare ','对比 ')+tr(modelById.get(button.dataset.compare).title));
  });
  $('#compare-status').textContent=columns.map(m=>tr(m.title)).join(' ↔ ');
}
function revealHash() {
  const m=modelById.get(location.hash.slice(1));if(!m) return;
  // A direct model link remains useful even with stale filters in its URL.
  $('#group-select').value='all';$('#access-select').value='all';$('#atlas-search').value='';filter();
  const card=document.getElementById(m.id);card.querySelector('details').open=true;
  requestAnimationFrame(()=>card.scrollIntoView({block:'start'}));
}
for(const id of ['scene-select','appearance-select']) $('#'+id).addEventListener('change',()=>{updateWorkbench();saveLocation();});
for(const id of ['group-select','access-select','atlas-search']) $('#'+id).addEventListener('input',()=>{filter();saveLocation();});
$('#filters').addEventListener('submit',e=>e.preventDefault());
$('#filters').addEventListener('reset',e=>{
  e.preventDefault();
  $('#atlas-search').value='';$('#group-select').value='all';$('#access-select').value='all';
  filter();saveLocation();
});
all('[data-language]').forEach(button=>button.addEventListener('click',()=>{lang=button.dataset.language;translate();saveLocation();}));
all('[data-appearance]').forEach(a=>a.addEventListener('click',()=>{$('#appearance-select').value=a.dataset.appearance;updateWorkbench();saveLocation();}));
all('[data-compare]').forEach(button=>button.addEventListener('click',()=>{
  if(!selected.includes(button.dataset.compare)) selected=[selected[1],button.dataset.compare];
  renderComparison();saveLocation();$('#compare').scrollIntoView({block:'start',behavior:'auto'});$('#compare-b').focus({preventScroll:true});
}));
for(const [i,id] of ['compare-a','compare-b'].entries()) $('#'+id).addEventListener('change',e=>{selected[i]=e.target.value;renderComparison();saveLocation();});
addEventListener('popstate',()=>{readLocation();translate();revealHash();});
addEventListener('hashchange',revealHash);
readLocation();translate();
$('#filters').hidden=false;$('#compare-controls').hidden=false;$('#load-preview').hidden=false;
all('[data-compare]').forEach(el=>el.hidden=false);
revealHash();
