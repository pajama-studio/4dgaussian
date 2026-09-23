import { fields,decodeProjection,decodeHits,recordColor,appearanceCoefficients,viewingDirection,sourceSnapshot } from './inspector-data.mjs';
import { shBasis,sampleSH,directionFromAngles } from './math/sh.mjs';
import { drawSH,drawGeometry,drawTemporal,drawSelection } from './inspector-viz.mjs';

export const copy={
  title:['一颗 Gaussian，拆开看','One Gaussian, inside out'],close:['关闭检查器','Close inspector'],
  hint:['点击场景选点；拖动仍可旋转。选点会暂停播放。','Click the scene to pick; drag to orbit. Picking pauses playback.'],
  loading:['等待模型和第一帧…','Waiting for the model and first frame…'],empty:['选择一颗点，查看真实记录、时间变化和方向颜色。','Select a splat to inspect its record, motion, and directional color.'],
  center:['选择画面中心的点','Pick at screen center'],pickid:['按 ID 选择','Select ID'],idlabel:['点 ID（从 0 开始）','Splat ID (zero based)'],
  nohit:['这里没有可见贡献。换个位置点击，或按 ID 选择。','No visible contribution here. Click elsewhere or select by ID.'],
  invalid:['请输入范围内的整数 ID。','Enter an integer ID within the valid range.'],
  picked:['已选中 GS #{id} · 模型共有 {count} 颗点','Selected GS #{id} · {count} splats in the model'],
  overlap:['重叠候选（按 T × α 排序）','Overlapping candidates (ranked by T × α)'],
  hits:['该像素命中 {total} 颗点，列出贡献权重最大的 {shown} 颗。候选权重固定在点击时刻。','This pixel hits {total} splats; showing the {shown} largest contribution weights. Weights refer to the picked frame.'],
  picknote:['选点用同一相机、时间、排序与屏幕高斯核做 CPU 求值；阈值附近可能与 GPU 浮点结果略有差异。ID 始终是原始 PLY 行号。','Picking evaluates the same camera, time, order, and screen Gaussian on the CPU; near thresholds it can differ slightly from GPU floating point. IDs always refer to original PLY rows.'],
  active:['当前帧参与渲染','Submitted in this frame'],inactive:['当前帧未提交：可能因时间或视锥裁剪','Not submitted: temporal or view-frustum culling may apply'],
  degenerate:['当前状态无法投影（如零长度四元数）；原始参数仍可查看。','This state cannot be projected (for example, a zero quaternion); raw parameters remain available.'],
  raw:['全部 32 个原始参数','All 32 stored parameters'],property:['PLY 字段','PLY field'],value:['存储值','Stored value'],
  rbase:['位置 / 时间 / 未使用的法线','Position / time / unused normals'],rmotion:['运动多项式：线性 → 二次 → 三次','Motion polynomial: linear → quadratic → cubic'],
  rcolor:['直接 RGB / opacity logit','Direct RGB / opacity logit'],rshape:['log-scale / 四元数 wxyz','Log-scale / quaternion wxyz'],romega:['四元数变化系数 wxyz','Quaternion change coefficients wxyz'],
  rawnote:['这里展示文件中的原始 float32。log-scale 要取 exp，opacity 要取 sigmoid；nx/ny/nz 当前不参与渲染。omega 是四元数分量的时间系数，不是直接的角速度向量。','These are the file’s raw float32 values. Apply exp to log-scales and sigmoid to opacity; nx/ny/nz are unused here. Omega contains quaternion-component time coefficients, not a direct angular-velocity vector.'],
  temporal:['01 · 当前时刻发生了什么？','01 · What happens at this time?'],time:['归一化时间 t','Normalized time t'],dt:['时间差 Δt','Time offset Δt'],rho:['时间宽度 ρ = exp(log ρ)','Temporal width ρ = exp(log ρ)'],
  gate:['时间权重 w(t)','Temporal weight w(t)'],opacity:['有效 opacity = sigmoid(β) × w','Effective opacity = sigmoid(β) × w'],
  baseopacity:['基础 opacity = sigmoid(β)','Base opacity = sigmoid(β)'],seek:['跳到它的时间中心 τ','Go to its temporal center τ'],
  timehint:['横轴是模型时间 0–1，曲线是时间权重；亮线跟随当前帧。播放器按已核实的片段时长换算秒数；PLY 本身不含时长。','The horizontal axis is model time 0–1; the curve is temporal weight and the bright line tracks the frame. The player maps seconds using the verified checkpoint duration; the PLY itself contains no duration.'],
  geometry:['02 · 几何：从椭球到屏幕','02 · Geometry: ellipsoid to screen'],mean:['当前世界位置 μ(t)','Current world position μ(t)'],scales:['三轴尺度 exp(log s)','Axis scales exp(log s)'],
  quat:['当前单位四元数 wxyz','Current unit quaternion wxyz'],sigma:['世界协方差 Σ','World covariance Σ'],screen:['屏幕中心（像素）','Screen center (pixels)'],
  covariance:['屏幕协方差 (a,b,c)，y 向上','Screen covariance (a,b,c), Y up'],radii:['屏幕主 / 次轴 σ（像素）','Screen major / minor σ (pixels)'],
  geometryhint:['放大显示的 1σ 椭球：保留轴比例与世界朝向，最长轴统一缩放。场景上的亮色轮廓分别是 1σ 和 3σ；不是模型新增的几何。','Magnified 1σ ellipsoid: axis ratios and world orientation are preserved, with a normalized longest axis. Scene outlines show 1σ and 3σ guides; they are not added model geometry.'],
  appearance:['03 · 颜色与 3D 球谐分解','03 · Color and 3D SH decomposition'],mode:['外观模式','Appearance mode'],actual:['真实 RGB → 等价 DC','Real RGB → equivalent DC'],teaching:['教学 SH：添加高阶变化','Teaching SH: add higher degrees'],
  actualnote:['此 STG-Lite 文件没有训练得到的 SH 系数。下面仅将当前 RGB 换算成等价 DC：(RGB − 0.5) / 0.28209479。高阶项未存储，因此实际颜色不随视角变化。','This STG-Lite file has no learned SH coefficients. Below, current RGB is converted to equivalent DC: (RGB − 0.5) / 0.28209479. Higher degrees are not stored, so the actual color is view independent.'],
  teachingnote:['教学模式：以选中点的 RGB 为 DC，额外系数由示例生成或手动调整。它们不是模型学到的参数，只改变右侧实验，场景仍渲染原始数据。','Teaching mode: the selected RGB supplies DC; extra coefficients are synthetic or manually adjusted. They are not learned model parameters and affect only this experiment. The scene continues to render the original data.'],
  sourcecolor:['该点的真实 RGB','This splat’s actual RGB'],previewcolor:['当前实验颜色','Current experiment color'],
  colorhint:['这是单层 RGB；场景像素还经过透明度合成和输出色彩空间转换。','This is a single layer’s RGB; scene pixels also undergo alpha compositing and output color conversion.'],
  follow:['方向跟随场景相机','Follow scene camera direction'],phi:['实验方位角 φ','Experiment azimuth φ'],theta:['实验极角 θ','Experiment polar angle θ'],
  direction:['相机 → 中心的单位方向 v','Unit direction v: camera → center'],labdirection:['独立实验方向 v','Independent experiment direction v'],
  basis:['选择一个基函数','Select a basis function'],degree:['最高阶 L','Maximum degree L'],
  basisplot:['基函数图案：橙正 / 蓝负','Basis pattern: orange + / blue −'],colorplot:['系数加权后的方向颜色','Directional color from weighted coefficients'],
  plotnote:['瓣的半径表示 |Y|；每张基图各自缩放。它们是球面函数，不是 Gaussian 的形状。白点是输入方向，虚线点位于背面。','Lobe radius represents |Y|; each basis plot is scaled independently. These are spherical functions, not Gaussian shapes. The white marker is the input direction; dashed markers lie on the back.'],
  gallery:['查看全部 16 个基图案','Show all 16 basis patterns'],coefficients:['所选基的 RGB 系数','RGB coefficients for selected basis'],
  readonly:['真实模式下的 DC 是推算值，只读；高阶未存储。切到教学模式可调系数。','Equivalent DC is derived and read-only; higher degrees are not stored. Switch to teaching mode to edit coefficients.'],
  excluded:['所选基超过当前最高阶，暂不参与颜色求和。','The selected basis exceeds the maximum degree and does not contribute.'],
  activecoefficient:['调整一个通道，看该项 aY 如何改变颜色。','Adjust one channel to see how its aY contribution changes color.'],
  rawsum:['SH 原始求和','Raw SH sum'],shifted:['加 0.5','After +0.5'],clamped:['下界 clamp 后','After lower clamp'],display:['显示到 0–1','Display clipped to 0–1'],
  contributions:['逐项拆解：系数 × 基函数 = RGB 贡献','Every term: coefficient × basis = RGB contribution'],stored:['RGB 系数 a','RGB coefficients a'],basisvalue:['Y(v)','Y(v)'],contribution:['RGB 贡献 aY','RGB contribution aY'],
  absent:['未存储','Not stored'],derived:['推算 DC','Derived DC'],synthetic:['教学值','Synthetic'],reset:['重置教学系数','Reset teaching coefficients'],
  export:['下载这颗点的 JSON','Download this splat as JSON'],learn:['打开球谐公式与推导 →','Open the SH formulas and derivation →'],
  selectbasis:['选择基 k = {k}','Select basis k = {k}'],ready:['{count} 颗真实 Gaussian · 点击左侧场景开始','{count} real Gaussians · click the scene to begin'],
  offscene:['此场景是 RGB 视频，没有可选 Gaussian。切回 Sear steak。','This scene is RGB video with no selectable Gaussians. Switch back to Sear steak.'],
  show:['检查 Gaussian','Inspect a Gaussian'],hide:['关闭点检查','Close splat inspector'],
  navtime:['时间','Time'],navshape:['形状','Shape'],navraw:['参数','Record'],navsh:['SH 颜色','SH color'],
  rotate:['拖动 3D 图可旋转；聚焦后也可用方向键。旋转图示不改变模型或输入方向。','Drag a 3D plot to rotate it, or focus it and use arrow keys. Plot rotation does not change the model or input direction.'],
  geometryaria:['Gaussian 椭球，可拖动旋转','Gaussian ellipsoid, drag to rotate'],basisaria:['球谐基图案，可拖动旋转','SH basis pattern, drag to rotate'],coloraria:['方向颜色球，可拖动旋转','Directional color sphere, drag to rotate'],
  actualbadge:['真实 RGB · DC 为推算值','Real RGB · derived DC'],teachingbadge:['教学 SH · 合成系数','Teaching SH · synthetic coefficients'],
};

export function mountInspector({panel,canvas,overlay,getRenderer,pause,seek,workbench}) {
  let language='en';try{language=localStorage.getItem('pajama-math-language')||'en';}catch{}
  if(!['zh','en'].includes(language))language='en';
  const t=(key,values={})=>copy[key][language==='en'?1:0].replace(/\{(\w+)\}/g,(_,k)=>values[k]??'{'+k+'}');
  const label=key=>'<span data-insp="'+key+'">'+t(key)+'</span>';
  const summary=(id,key,body,open=true)=>'<details id="'+id+'"'+(open?' open':'')+'><summary>'+label(key)+'</summary><div class="inspector-section">'+body+'</div></details>';
  const $=id=>panel.querySelector('#'+id);
  const number=x=>Math.abs(x)>=1e5||(Math.abs(x)>0&&Math.abs(x)<1e-4)?x.toExponential(4):Number(x.toPrecision(7)).toString();
  const vec=a=>'['+a.map(number).join(', ')+']';
  const swatch=rgb=>'rgb('+rgb.map(v=>Math.round(Math.max(0,Math.min(1,v))*255)).join(',')+')';
  panel.innerHTML='<header class="inspector-heading"><div><small>GAUSSIAN INSPECTOR</small><h2>'+label('title')+'</h2></div><div class="inspector-language"><button type="button" data-insp-lang="en">English</button><button type="button" data-insp-lang="zh">中文</button></div><button id="inspector-close" type="button" aria-label="Close inspector">×</button></header>'+
    '<p data-insp="hint" class="inspector-hint">'+t('hint')+'</p><p id="inspect-status" role="status"></p>'+
    '<div class="inspector-pick-tools"><button id="inspect-center" type="button">'+label('center')+'</button><div><label for="inspect-id">'+label('idlabel')+'</label><input id="inspect-id" type="number" min="0" step="1" value="0"><button id="inspect-go" type="button">'+label('pickid')+'</button></div></div>'+
    '<div id="inspect-candidates" hidden><label for="inspect-candidate">'+label('overlap')+'</label><select id="inspect-candidate"></select><p id="inspect-hit-note"></p></div>'+
    '<p id="inspect-empty" data-insp="empty">'+t('empty')+'</p><div id="inspect-body" hidden><div class="inspector-identity"><strong id="inspect-selected">—</strong><span id="inspect-visibility"></span></div>'+
    summary('inspect-time-section','temporal','<canvas id="inspect-time-plot" width="640" height="132" role="img" aria-label="Temporal Gaussian weight"></canvas><dl id="inspect-time-values"></dl><button id="inspect-seek" type="button">'+label('seek')+'</button><p class="inspector-note" data-insp="timehint">'+t('timehint')+'</p>')+
    summary('inspect-geometry-section','geometry','<canvas id="inspect-geometry" width="620" height="340" role="img" aria-label="Magnified Gaussian ellipsoid"></canvas><p class="inspector-note" data-insp="geometryhint">'+t('geometryhint')+'</p><dl id="inspect-geometry-values"></dl>',false)+
    summary('inspect-raw-section','raw','<p class="inspector-note" data-insp="rawnote">'+t('rawnote')+'</p><table class="inspector-raw"><thead><tr><th>'+label('property')+'</th><th>'+label('value')+'</th></tr></thead><tbody id="inspect-raw"></tbody></table>',false)+
    summary('inspect-appearance-section','appearance','<label for="inspect-mode">'+label('mode')+'</label><select id="inspect-mode"><option value="actual" data-insp="actual">'+t('actual')+'</option><option value="teaching" data-insp="teaching">'+t('teaching')+'</option></select><p id="inspect-format-note" class="inspector-format-note"></p>'+
      '<div class="inspector-colors"><div><i id="inspect-original-color"></i>'+label('sourcecolor')+'<code id="inspect-original-rgb"></code></div><div><i id="inspect-result-color"></i>'+label('previewcolor')+'<code id="inspect-result-rgb"></code></div></div>'+
      '<p class="inspector-note" data-insp="colorhint">'+t('colorhint')+'</p><label class="inspector-follow"><input id="inspect-follow" type="checkbox" checked>'+label('follow')+'</label>'+
      '<div class="inspector-angle-grid"><label for="inspect-phi">'+label('phi')+'<output id="inspect-phi-out"></output><input type="range" id="inspect-phi" min="-180" max="180" value="0" step="1"></label><label for="inspect-theta">'+label('theta')+'<output id="inspect-theta-out"></output><input type="range" id="inspect-theta" min="0" max="180" value="90" step="1"></label></div><p id="inspect-direction" class="inspector-numeric"></p>'+
      '<div class="inspector-two"><label for="inspect-basis">'+label('basis')+'<select id="inspect-basis">'+Array.from({length:16},(_,k)=>{const l=Math.floor(Math.sqrt(k));return '<option value="'+k+'">k '+k+' · Y('+l+','+(k-l*l-l)+')</option>';}).join('')+'</select></label><label for="inspect-degree">'+label('degree')+'<select id="inspect-degree">'+[0,1,2,3].map(l=>'<option value="'+l+'">L = '+l+' / '+(l+1)**2+' RGB</option>').join('')+'</select></label></div>'+
      '<div class="inspector-sh-plots"><figure><canvas id="inspect-basis-plot" width="330" height="290" role="img" aria-label="Selected spherical harmonic basis"></canvas><figcaption>'+label('basisplot')+'</figcaption></figure><figure><canvas id="inspect-color-plot" width="330" height="290" role="img" aria-label="Directional RGB appearance"></canvas><figcaption>'+label('colorplot')+'</figcaption></figure></div><p class="inspector-note" data-insp="plotnote">'+t('plotnote')+'</p><p id="inspect-basis-value" class="inspector-numeric"></p>'+
      '<details id="inspect-gallery"><summary>'+label('gallery')+'</summary><div class="inspector-basis-gallery">'+Array.from({length:16},(_,k)=>'<button type="button" data-insp-basis="'+k+'" aria-label="'+t('selectbasis',{k})+'"><canvas width="160" height="130" aria-hidden="true"></canvas><span>k '+k+'</span></button>').join('')+'</div></details>'+
      '<div class="inspector-coefficients"><h3>'+label('coefficients')+'</h3>'+['R','G','B'].map((ch,i)=>'<label for="inspect-coeff-'+i+'">'+ch+'<output id="inspect-coeff-out-'+i+'"></output><input id="inspect-coeff-'+i+'" type="range" min="-2" max="2" step="0.01" value="0"></label>').join('')+'<p id="inspect-coefficient-note" class="inspector-note"></p><button id="inspect-reset" type="button">'+label('reset')+'</button></div>'+
      '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi mathvariant="bold">c</mi><mo>(</mo><mi mathvariant="bold">v</mi><mo>)</mo><mo>=</mo><mo>∑</mo><msub><mi mathvariant="bold">a</mi><mi>k</mi></msub><msub><mi>Y</mi><mi>k</mi></msub><mo>(</mo><mi mathvariant="bold">v</mi><mo>)</mo><mo>+</mo><mn>0.5</mn></mrow></math><dl id="inspect-color-values"></dl>'+
      '<details id="inspect-contributions"><summary>'+label('contributions')+'</summary><div class="inspector-table-scroll"><table><thead><tr><th>k</th><th>'+label('stored')+'</th><th>'+label('basisvalue')+'</th><th>'+label('contribution')+'</th></tr></thead><tbody id="inspect-terms"></tbody></table></div></details>')+
    '<div class="inspector-actions"><button id="inspect-export" type="button">'+label('export')+'</button><a href="/math/#sh-lab" target="_blank" rel="noreferrer" data-insp="learn">'+t('learn')+'</a></div></div><p class="inspector-note" data-insp="picknote">'+t('picknote')+'</p>';

  const shortcuts=document.createElement('nav');shortcuts.className='inspector-shortcuts';shortcuts.hidden=true;
  shortcuts.innerHTML=[['time','navtime'],['geometry','navshape'],['raw','navraw'],['appearance','navsh']].map(([id,key])=>'<button type="button" data-insp-jump="'+id+'">'+label(key)+'</button>').join('');
  panel.querySelector('.inspector-heading').append(shortcuts);
  const stickyState=document.createElement('div');stickyState.className='inspector-sticky-state';stickyState.hidden=true;
  panel.querySelector('.inspector-heading').append(stickyState);
  const rotationHint=document.createElement('p');rotationHint.className='inspector-note';rotationHint.dataset.insp='rotate';rotationHint.textContent=t('rotate');
  panel.querySelector('.inspector-sh-plots').after(rotationHint);
  let enabled=new URL(location.href).searchParams.get('inspect')==='1',count=0,id=null,row=null,state=null;
  let selectedBasis=0,degree=0,mode='actual',coefficients=null,picked=null,direction=[0,0,1],lastUpdate=-Infinity,galleryDrawn=false,isStg=true;
  let statusKey='loading',statusValues={};
  const geometryOrbit=[0,0],shOrbit=[0,0];
  const setStatus=(key,values={})=>{statusKey=key;statusValues=values;$('inspect-status').textContent=t(key,values);};
  const button=document.querySelector('#inspect-toggle');
  function translate() {
    panel.lang=language==='en'?'en':'zh-CN';
    panel.querySelectorAll('[data-insp]').forEach(node=>{node.textContent=t(node.dataset.insp);});
    panel.querySelectorAll('[data-insp-lang]').forEach(node=>node.setAttribute('aria-pressed',String(node.dataset.inspLang===language)));
    panel.querySelectorAll('[data-insp-basis]').forEach(node=>node.setAttribute('aria-label',t('selectbasis',{k:node.dataset.inspBasis})));
    $('inspector-close').ariaLabel=t('close');
    for(const [id,key] of [['inspect-geometry','geometryaria'],['inspect-basis-plot','basisaria'],['inspect-color-plot','coloraria']])$(id).ariaLabel=t(key);
    button.textContent=t(enabled?'hide':'show');setStatus(statusKey,statusValues);
    if(row){renderRaw();updateReadouts();}updateHits();
  }
  function setEnabled(value) {
    enabled=value;panel.hidden=!enabled;overlay.hidden=!enabled||!isStg;
    workbench.dataset.inspect=String(enabled);button.setAttribute('aria-pressed',String(enabled));button.textContent=t(enabled?'hide':'show');
    const url=new URL(location.href);if(enabled)url.searchParams.set('inspect','1');else url.searchParams.delete('inspect');history.replaceState(null,'',url);
    lastUpdate=-Infinity;
    if(enabled)requestAnimationFrame(()=>workbench.scrollIntoView({block:'start',behavior:'instant'}));
  }
  function dl(target,entries) {
    target.replaceChildren(...entries.flatMap(([key,value])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=t(key);dd.textContent=Array.isArray(value)?vec(value):value;return [dt,dd];}));
  }
  function renderRaw() {
    const groups={0:'rbase',8:'rmotion',17:'rcolor',21:'rshape',28:'romega'};
    $('inspect-raw').replaceChildren(...fields.flatMap((field,i)=>{
      const rows=[];if(groups[i]){const tr=document.createElement('tr'),th=document.createElement('th');th.colSpan=2;th.textContent=t(groups[i]);tr.className='raw-group';tr.append(th);rows.push(tr);}
      const tr=document.createElement('tr'),th=document.createElement('th'),td=document.createElement('td');th.scope='row';th.textContent=field;td.textContent=number(row[i]);tr.append(th,td);rows.push(tr);return rows;
    }));
  }
  function syncCoefficients() {
    for(let ch=0;ch<3;ch++) {$('inspect-coeff-'+ch).value=coefficients[selectedBasis][ch];$('inspect-coeff-'+ch).disabled=mode==='actual';}
    $('inspect-degree').disabled=mode==='actual';$('inspect-degree').value=degree;$('inspect-reset').disabled=mode==='actual';
    $('inspect-basis').value=selectedBasis;
    panel.querySelectorAll('[data-insp-basis]').forEach(node=>node.setAttribute('aria-pressed',String(Number(node.dataset.inspBasis)===selectedBasis)));
  }
  function updateHits() {
    $('inspect-candidates').hidden=!picked?.hits.length;
    if(!picked?.hits.length)return;
    $('inspect-hit-note').textContent=t('hits',{total:picked.total,shown:picked.hits.length});
    $('inspect-candidate').replaceChildren(...picked.hits.map(hit=>{const option=document.createElement('option');option.value=hit.id;option.textContent='#'+hit.id+' · Tα '+number(hit.weight)+' · α '+number(hit.alpha);return option;}));
    if(id!==null)$('inspect-candidate').value=id;
  }
  function updateReadouts() {
    if(!row)return;
    $('inspect-selected').textContent='GS #'+id;$('inspect-visibility').textContent=t(state?(state.visible?'active':'inactive'):'degenerate');
    $('inspect-visibility').dataset.visible=String(Boolean(state?.visible));
    $('inspect-format-note').textContent=t(mode==='actual'?'actualnote':'teachingnote');
    panel.dataset.appearance=mode;
    stickyState.hidden=false;stickyState.textContent='GS #'+id+' · '+t(mode==='actual'?'actualbadge':'teachingbadge');
    const original=recordColor(row);$('inspect-original-color').style.background=swatch(original);$('inspect-original-rgb').textContent=vec(original);
    if(state) {
      dl($('inspect-time-values'),[['time',number(state.time)],['dt',number(state.time-row[3])],['rho',number(state.rho)],['gate',number(state.temporal)],['baseopacity',number(state.baseOpacity)],['opacity',number(state.opacity)]]);
      dl($('inspect-geometry-values'),[['mean',state.mean],['scales',state.scales],['quat',state.quaternion],['sigma',state.covariance.map(vec).join('\n')],['screen',state.uv],['covariance',state.screenCovariance],['radii',state.sigmas]]);
      if($('inspect-follow').checked) {
        direction=viewingDirection(state);$('inspect-phi').value=Math.atan2(direction[1],direction[0])*180/Math.PI;$('inspect-theta').value=Math.acos(Math.max(-1,Math.min(1,direction[2])))*180/Math.PI;
      }
    } else { $('inspect-time-values').textContent='—';$('inspect-geometry-values').textContent='—'; }
    for(const angle of ['phi','theta']) {$('inspect-'+angle).disabled=$('inspect-follow').checked;$('inspect-'+angle+'-out').textContent=$('inspect-'+angle).value+'°';}
    $('inspect-direction').textContent=t($('inspect-follow').checked?'direction':'labdirection')+' = '+vec(direction);
    const result=sampleSH(coefficients,direction,degree),basis=shBasis(direction),l=Math.floor(Math.sqrt(selectedBasis));
    $('inspect-basis-value').textContent='Y('+l+','+(selectedBasis-l*l-l)+') = '+number(basis[selectedBasis]);
    $('inspect-result-color').style.background=swatch(result.display);$('inspect-result-rgb').textContent=vec(result.display);
    $('inspect-coefficient-note').textContent=t(mode==='actual'?'readonly':selectedBasis>=(degree+1)**2?'excluded':'activecoefficient');
    for(let ch=0;ch<3;ch++)$('inspect-coeff-out-'+ch).textContent=mode==='actual'&&selectedBasis>0?t('absent'):number(coefficients[selectedBasis][ch]);
    dl($('inspect-color-values'),[['rawsum',result.raw],['shifted',result.shifted],['clamped',result.shaderColor],['display',result.display]]);
    $('inspect-terms').replaceChildren(...basis.map((y,k)=>{
      const tr=document.createElement('tr');if(k===selectedBasis)tr.className='current-term';
      const active=k<(degree+1)**2;
      [k+'',mode==='actual'&&k>0?t('absent'):vec(coefficients[k]),number(y),active?vec(coefficients[k].map(a=>a*y)):'—'].forEach(value=>{const td=document.createElement('td');td.textContent=value;tr.append(td);});return tr;
    }));
  }
  function renderPlots() {
    if(!row)return;
    if(state){drawGeometry($('inspect-geometry'),state,recordColor(row),geometryOrbit);drawTemporal($('inspect-time-plot'),row,state.time);}
    drawSH($('inspect-basis-plot'),{basisIndex:selectedBasis,direction,orbit:shOrbit});drawSH($('inspect-color-plot'),{coefficients,degree,direction,orbit:shOrbit});
  }
  function select(next) {
    const renderer=getRenderer();if(!renderer)return;
    if(!Number.isInteger(next)||next<0||next>=count){setStatus('invalid');return;}
    const record=Array.from(renderer.splatRecord(next));if(record.length!==32)return;
    pause();id=next;row=record;state=decodeProjection(renderer.inspectSplat(id));mode='actual';degree=0;selectedBasis=0;
    coefficients=appearanceCoefficients(row);$('inspect-id').value=id;$('inspect-mode').value=mode;syncCoefficients();
    $('inspect-body').hidden=false;$('inspect-empty').hidden=true;shortcuts.hidden=false;renderRaw();updateReadouts();renderPlots();updateHits();
    setStatus('picked',{id,count});lastUpdate=-Infinity;
  }
  function pickAt(x,y) {
    if(!enabled||!isStg||!getRenderer())return;
    pause();picked=decodeHits(getRenderer().pickSplats(Math.floor(x)+0.5,Math.floor(y)+0.5));updateHits();
    if(picked.hits.length)select(picked.hits[0].id);else setStatus('nohit');
  }
  function onFrame(now) {
    if(!enabled||!isStg||id===null)return;
    state=decodeProjection(getRenderer().inspectSplat(id));drawSelection(overlay,state,id,canvas.width,canvas.height);
    if(now-lastUpdate<160)return;lastUpdate=now;updateReadouts();renderPlots();
  }
  button.addEventListener('click',()=>setEnabled(!enabled));$('inspector-close').addEventListener('click',()=>setEnabled(false));
  panel.querySelectorAll('[data-insp-jump]').forEach(button=>button.addEventListener('click',()=>{
    const section=$('inspect-'+button.dataset.inspJump+'-section');section.open=true;
    if(innerWidth>1000)panel.scrollTo({top:panel.scrollTop+section.getBoundingClientRect().top-panel.getBoundingClientRect().top-panel.querySelector('.inspector-heading').offsetHeight-15,behavior:'smooth'});
    else section.scrollIntoView({behavior:'smooth',block:'start'});
  }));
  for(const id of ['inspect-geometry','inspect-basis-plot','inspect-color-plot']) {
    const plot=$(id),orbit=id==='inspect-geometry'?geometryOrbit:shOrbit;plot.tabIndex=0;
    let dragging=false,start=[0,0];
    plot.addEventListener('pointerdown',event=>{if(event.button!==0)return;dragging=true;start=[event.clientX,event.clientY];plot.setPointerCapture(event.pointerId);});
    plot.addEventListener('pointermove',event=>{if(!dragging)return;orbit[0]+=(event.clientX-start[0])*.012;orbit[1]+=(event.clientY-start[1])*.012;start=[event.clientX,event.clientY];renderPlots();});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])plot.addEventListener(event,()=>{dragging=false;});
    plot.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();
      orbit[event.key==='ArrowLeft'||event.key==='ArrowRight'?0:1]+=event.key==='ArrowLeft'||event.key==='ArrowUp'?-.15:.15;renderPlots();
    });
  }
  $('inspect-center').addEventListener('click',()=>pickAt(canvas.width/2,canvas.height/2));
  const selectId=()=>{picked=null;updateHits();const value=$('inspect-id').value;select(value.trim()===''?NaN:Number(value));};
  $('inspect-go').addEventListener('click',selectId);$('inspect-id').addEventListener('keydown',event=>{if(event.key==='Enter')selectId();});
  $('inspect-candidate').addEventListener('change',()=>select(Number($('inspect-candidate').value)));
  $('inspect-seek').addEventListener('click',()=>{if(row)seek(Math.max(0,Math.min(0.999999,row[3])));});
  panel.querySelectorAll('[data-insp-lang]').forEach(node=>node.addEventListener('click',()=>{language=node.dataset.inspLang;try{localStorage.setItem('pajama-math-language',language);}catch{}translate();}));
  $('inspect-mode').addEventListener('change',()=>{
    mode=$('inspect-mode').value;degree=mode==='teaching'?3:0;coefficients=appearanceCoefficients(row,mode==='teaching');selectedBasis=mode==='teaching'?2:0;syncCoefficients();updateReadouts();renderPlots();
  });
  $('inspect-basis').addEventListener('change',()=>{selectedBasis=Number($('inspect-basis').value);syncCoefficients();updateReadouts();renderPlots();});
  $('inspect-degree').addEventListener('change',()=>{degree=Number($('inspect-degree').value);updateReadouts();renderPlots();});
  $('inspect-follow').addEventListener('change',()=>{updateReadouts();renderPlots();});
  for(const angle of ['phi','theta'])$('inspect-'+angle).addEventListener('input',()=>{direction=directionFromAngles(Number($('inspect-phi').value)*Math.PI/180,Number($('inspect-theta').value)*Math.PI/180);updateReadouts();renderPlots();});
  for(let ch=0;ch<3;ch++)$('inspect-coeff-'+ch).addEventListener('input',()=>{coefficients[selectedBasis][ch]=Number($('inspect-coeff-'+ch).value);updateReadouts();renderPlots();});
  $('inspect-reset').addEventListener('click',()=>{coefficients=appearanceCoefficients(row,true);syncCoefficients();updateReadouts();renderPlots();});
  $('inspect-gallery').addEventListener('toggle',()=>{if($('inspect-gallery').open&&!galleryDrawn){panel.querySelectorAll('[data-insp-basis]').forEach(node=>drawSH(node.querySelector('canvas'),{basisIndex:Number(node.dataset.inspBasis)}));galleryDrawn=true;}});
  panel.querySelectorAll('[data-insp-basis]').forEach(node=>node.addEventListener('click',()=>{selectedBasis=Number(node.dataset.inspBasis);syncCoefficients();updateReadouts();renderPlots();}));
  $('inspect-export').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify(sourceSnapshot(id,row,state,mode,coefficients,degree,direction),null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='gaussian-'+id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  setEnabled(enabled);translate();
  return {get enabled(){return enabled;},pickAt,onFrame,
    ready(total){count=total;$('inspect-id').max=count-1;setStatus('ready',{count});if(enabled)workbench.scrollIntoView({block:'start',behavior:'instant'});},
    scene(active){isStg=active;overlay.hidden=!enabled||!isStg;panel.classList.toggle('inspector-offscene',!isStg);setStatus(active?(id===null?'ready':'picked'):'offscene',{count,id});},
  };
}
