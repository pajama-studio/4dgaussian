import { srgbEncode, over, cutoffNeighbor } from './lab-math.mjs';

let language = new URLSearchParams(location.search).get('lang') === 'zh' ? 'zh' : 'en';
const $ = selector => document.querySelector(selector);
const tr = (en, zh) => language === 'zh' ? zh : en;
const symptoms = {
  brightness: [['color','blend','validation'], ['Start with attachment/view format and the RGB convention. Then compare raw offscreen pixels before browser/display color management.', '先查附件／视图格式与 RGB 约定，再比较原始离屏像素，最后检查浏览器／显示器色彩管理。']],
  halos: [['blend','sort','color'], ['Check premultiplied alpha and draw order. Hold the visible-ID sequence fixed, then compare overlap colors.', '检查预乘 alpha 与绘制顺序。固定可见 ID 顺序，再比较叠加颜色。']],
  missing: [['domain','precision','time'], ['Check negative-base pow first. Then inspect opacity near the cutoff and verify the actual rendered time and resident records.', '先检查负底数 pow，再看门限附近的透明度，核对实际渲染时间与驻留记录。']],
  flicker: [['sort','precision','synchronization'], ['Freeze the camera/time; compare depth bits and ID order. Repeat the exact frame to distinguish sensitivity from a race.', '固定相机／时间，比较深度位与 ID 顺序。重复同一帧，区分数值敏感与竞态。']],
  geometry: [['camera','layout','capabilities'], ['Use one known Gaussian. Inspect matrices, quaternion order, projected axes and backing-pixel viewport before changing backend-specific signs.', '使用一个已知 Gaussian，先查矩阵、四元数顺序、投影轴与实际像素 viewport，再考虑后端差异。']],
  random: [['layout','synchronization','capabilities'], ['Verify uploaded bytes and bounds, then synchronization and enabled limits/features. Capture validation errors and reduce the failing fixture.', '先验证上传字节与边界，再查同步和已启用的 limits／features。记录 validation error，并缩小失败样本。']],
  playback: [['time','validation','sort'], ['Pause at an exact normalized time with all records resident. Only after static parity, reintroduce async streaming and presentation timing.', '在精确归一化时间暂停并让记录全部驻留。静态一致后，再加入异步 streaming 与显示时序。']],
};

function renderDiagnosis() {
  const [ids, copy] = symptoms[$('#symptom').value];
  const p = document.createElement('p'); p.textContent = tr(...copy);
  const links = document.createElement('div'); links.className = 'diagnosis-links';
  for (const id of ids) {
    const a = document.createElement('a'); a.href = '#'+id;
    a.textContent = $('#'+id+' h2').textContent; links.append(a);
  }
  $('#diagnosis').replaceChildren(p, links);
}

function drawColor() {
  const value = Number($('#linear-value').value);
  for (const [id, v] of [['raw',value], ['srgb',srgbEncode(value)], ['double',srgbEncode(srgbEncode(value))]]) {
    $('#'+id+'-swatch').style.backgroundColor = `rgb(${v*255} ${v*255} ${v*255})`;
    $('#'+id+'-value').textContent = `${v.toFixed(3)} · ${Math.round(v*255)} / 255`;
  }
  $('#linear-value').setAttribute('aria-valuetext', value.toFixed(2));
}

function drawOverlap() {
  const opacity = Number($('#blend-alpha').value);
  const red = [1,0,0], blue = [0,0,1];
  for (const [id,front,back] of [['red',red,blue], ['blue',blue,red]]) {
    const canvas = $('#'+id+'-front'), ctx = canvas.getContext('2d');
    canvas.setAttribute('aria-label', id==='red' ? tr('Red Gaussian in front','红色 Gaussian 在前') : tr('Blue Gaussian in front','蓝色 Gaussian 在前'));
    if (ctx) {
      const {width:w,height:h} = canvas, data = ctx.createImageData(w,h);
      for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
        const dx=(x+.5-w/2)/(w*.21), dy=(y+.5-h/2)/(h*.22);
        // Shared center, different covariance axes; both center alphas equal opacity.
        const a=opacity*Math.exp(-.5*(dx*dx*.55+dy*dy*1.6));
        const b=opacity*Math.exp(-.5*(dx*dx*1.6+dy*dy*.55));
        const color=id==='red'?over(front,a,back,b):over(front,b,back,a);
        const index=(y*w+x)*4;
        for (let c=0;c<3;c++) data.data[index+c]=Math.round(srgbEncode(color[c])*255);
        data.data[index+3]=255;
      }
      ctx.putImageData(data,0,0);
    }
    const center = over(front,opacity,back,opacity);
    $('#'+id+'-result').textContent = tr('Center linear RGB: ','中心线性 RGB：')+center.map(v=>v.toFixed(3)).join(', ');
  }
  $('#blend-alpha').setAttribute('aria-valuetext',opacity.toFixed(2));
}

function drawThreshold() {
  const offset=Number($('#ulp-offset').value), result=cutoffNeighbor(offset);
  $('#cutoff-value').textContent=result.cutoff.toPrecision(12);
  $('#opacity-value').textContent=result.value.toPrecision(12);
  $('#threshold-result').textContent=`${offset>0?'+':''}${offset} ULP · `+(result.keep?tr('KEEP · opacity ≥ cutoff','保留 · 透明度 ≥ 门限'):tr('CULL · opacity < cutoff','剔除 · 透明度 < 门限'));
  $('#threshold-result').dataset.keep=String(result.keep);
  $('#ulp-offset').setAttribute('aria-valuetext',`${offset} ULP`);
}

function translate(updateUrl=false) {
  document.documentElement.lang=language;
  document.title=tr('Cross-platform Gaussian rendering · Gaussian Lab','跨平台 Gaussian 渲染差异 · Gaussian Lab');
  // Only trusted, build-time bilingual HTML from this document is inserted.
  document.querySelectorAll('[data-doc-i18n]').forEach(el=>{ el.innerHTML=el.dataset[language]; });
  document.querySelectorAll('[data-language]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.language===language)));
  document.querySelectorAll('[data-lang-link]').forEach(el=>{const url=new URL(el.href);url.searchParams.set('lang',language);el.href=url.pathname+url.search+url.hash;});
  if(updateUrl){const url=new URL(location.href);url.searchParams.set('lang',language);history.replaceState(null,'',url);}
  renderDiagnosis(); drawColor(); drawOverlap(); drawThreshold();
}

document.querySelectorAll('[data-language]').forEach(button=>button.addEventListener('click',()=>{language=button.dataset.language;translate(true);}));
$('#symptom').addEventListener('change',renderDiagnosis);
$('#linear-value').addEventListener('input',drawColor);
$('#blend-alpha').addEventListener('input',drawOverlap);
$('#ulp-offset').addEventListener('input',drawThreshold);
addEventListener('popstate',()=>{language=new URLSearchParams(location.search).get('lang')==='zh'?'zh':'en';translate();});
let printDetails=[];
addEventListener('beforeprint',()=>{printDetails=[...document.querySelectorAll('main details')].map(e=>[e,e.open]);printDetails.forEach(([e])=>e.open=true);});
addEventListener('afterprint',()=>printDetails.forEach(([e,open])=>e.open=open));
translate();
