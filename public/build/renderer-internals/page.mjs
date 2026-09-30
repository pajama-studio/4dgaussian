const data = JSON.parse(document.querySelector('#trace-data').textContent);
const $ = s => document.querySelector(s);
const esc = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
let language, route, step;
const tr = b => b[language];

function readLocation() {
  const params = new URLSearchParams(location.search);
  language = params.get('lang') === 'zh' ? 'zh' : 'en';
  route = data.routes.find(r => r.id === params.get('route')) || data.routes[0];
  const n = Number(params.get('step') || 1);
  step = Number.isInteger(n) ? Math.max(0,Math.min(route.stages.length-1,n-1)) : 0;
}

function saveLocation() {
  const url = new URL(location.href);
  url.searchParams.set('lang',language);
  url.searchParams.set('route',route.id);
  url.searchParams.set('step',String(step+1));
  history.replaceState(null,'',url);
}

function renderTrace() {
  const s = route.stages[step];
  $('#route-select').value = route.id;
  $('#step-progress').textContent = `${step+1} / ${route.stages.length} · ${tr(s.title)}`;
  $('#prev-step').disabled = step === 0;
  $('#next-step').disabled = step === route.stages.length-1;
  $('#step-nav').replaceChildren(...route.stages.map((item,i) => {
    const button = document.createElement('button');
    button.type='button';
    button.textContent = `${String(i+1).padStart(2,'0')} · ${tr(item.title)}`;
    button.setAttribute('aria-current', i === step ? 'step' : 'false');
    button.addEventListener('click',()=>{step=i; saveLocation(); renderTrace(); $('#step-nav button[aria-current="step"]').focus({preventScroll:true});});
    return button;
  }));
  $('#trace-card').innerHTML = `<article class="stage"><div class="stage-top"><span class="step-number">${String(step+1).padStart(2,'0')}</span><h3>${esc(tr(s.title))}</h3><span class="place ${s.place}">${esc(tr(data.places[s.place]))}</span></div><dl class="io"><div><dt>${language==='zh'?'输入':'Input'}</dt><dd>${esc(tr(s.input))}</dd></div><div><dt>${language==='zh'?'输出':'Output'}</dt><dd>${esc(tr(s.output))}</dd></div></dl><p>${esc(tr(s.body))}</p><div class="source-links">${s.refs.map(key=>{const ref=data.sources[key];return `<a href="${ref.url}">${esc(ref.label)} ↗</a>`;}).join('')}</div></article>`;
}

function translate() {
  document.documentElement.lang=language;
  document.title=language==='zh'?'读懂 Spark 与 PlayCanvas · GS 渲染全流程':'Inside Spark & PlayCanvas · Gaussian rendering end to end';
  document.querySelectorAll('[data-doc-i18n]').forEach(el=>{el.innerHTML=el.dataset[language];});
  document.querySelectorAll('[data-language]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.language===language)));
  document.querySelectorAll('[data-lang-link]').forEach(el=>{const u=new URL(el.href);u.searchParams.set('lang',language);el.href=u.pathname+u.search+u.hash;});
  $('.internals-toc').setAttribute('aria-label',language==='zh'?'本页目录':'On this page');
  $('.skip-link').textContent=language==='zh'?'跳到正文':'Skip to content';
  renderTrace();
}

$('#route-select').addEventListener('change',e=>{route=data.routes.find(r=>r.id===e.target.value);step=0;saveLocation();renderTrace();});
$('#prev-step').addEventListener('click',()=>{if(step>0){step--;saveLocation();renderTrace();}});
$('#next-step').addEventListener('click',()=>{if(step<route.stages.length-1){step++;saveLocation();renderTrace();}});
document.querySelectorAll('[data-language]').forEach(button=>button.addEventListener('click',()=>{language=button.dataset.language;saveLocation();translate();}));
function revealHash() {
  const target=document.getElementById(location.hash.slice(1));
  if(target?.matches('details')) target.open=true;
}
addEventListener('hashchange',revealHash);
addEventListener('popstate',()=>{readLocation();translate();revealHash();});
readLocation();
translate();
$('.trace-controls').hidden=false;
revealHash();
