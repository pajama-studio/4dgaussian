import { initialRecords, forward, evaluateRecord, properties } from '../math/trace.mjs';
import { TrainingSession, trainingSpec, trainingNames, trainingParameters } from '../math/training.mjs';
import { sampleSH, blankCoefficients, directionFromAngles } from '../math/sh.mjs';
import { kernel, cameraSample, composite, scalarGradient, duplication, resizeSample, memoryBudget, sigmoid } from './models.mjs';

const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const fmt=(n,d=4)=>Number(n).toFixed(d);
const rgb=c=>`rgb(${c.map(v=>Math.round(Math.max(0,Math.min(1,v))*255)).join(',')})`;
export function mountLab(kind,getLanguage){
 const controls=document.querySelector('#lab-controls'),visual=document.querySelector('#lab-visual'),values=document.querySelector('#lab-values'),note=document.querySelector('#lab-note');
 visual.className='lab-visual';
 const t=(en,zh)=>getLanguage()==='zh'?zh:en;
 const params={x:2,scale:2,opacity:.8,z:10,f:100,alphaA:.6,alphaB:.5,polar:0,red:.4,time:.5,rho:.55,ratio:.5,beta:0,rate:1,field:20,count:108317,visible:1,fps:60};
 if(kind==='camera')params.x=0;
 if(kind==='density')params.opacity=.5;
 let reverse=false,wrong=false,pipelineStage=0,frameIndex=1,timer=null,session;
 const stages=[['Stored record','存储记录'],['Evaluate time','时间求值'],['Project shape','投影形状'],['Evaluate pixel','像素求值'],['Composite','合成颜色'],['Measure loss','计算损失']];
 const sliders=(items)=>{controls.innerHTML=items.map(([key,en,zh,min,max,step])=>`<label for="lab-${key}"><span>${esc(t(en,zh))}</span><output id="out-${key}">${fmt(params[key],key==='count'?0:2)}</output><input id="lab-${key}" type="range" min="${min}" max="${max}" step="${step}" value="${params[key]}"></label>`).join('');items.forEach(([key])=>controls.querySelector(`#lab-${key}`).addEventListener('input',e=>{params[key]=Number(e.target.value);controls.querySelector(`#out-${key}`).textContent=fmt(params[key],key==='count'?0:2);draw();}));};
 const button=(id,label,fn)=>{const b=document.createElement('button');b.id=id;b.textContent=label;controls.append(b);b.addEventListener('click',fn);return b;};
 const metrics=entries=>{values.innerHTML='<dl>'+entries.map(([name,value])=>`<dt>${esc(name)}</dt><dd>${esc(value)}</dd>`).join('')+'</dl>';};
 const svg=(content)=>{visual.innerHTML=`<svg viewBox="0 0 400 220" role="img" aria-label="${esc(t('Experiment visualization; exact values follow below','实验图示，下方提供精确数值'))}">${content}</svg>`;};
 const graph=(fn,xmin,xmax,ymax,extra='')=>{
  const points=Array.from({length:201},(_,i)=>{const x=xmin+(xmax-xmin)*i/200;return `${30+340*i/200},${185-150*Math.min(1,Math.max(0,fn(x)/ymax))}`;}).join(' ');
  svg(`<path d="M30 20V185H375" fill="none" stroke="#665474"/><polyline points="${points}" fill="none" stroke="#d2ec4c" stroke-width="2.5"/><text x="30" y="208">${xmin}</text><text x="346" y="208">${xmax}</text><text x="7" y="38">${ymax}</text>${extra}`);
 };
 function setup(){
  if(kind==='kernel')sliders([['x','Offset x − μ','偏移 x − μ',-6,6,.1],['scale','Scale s','尺度 s',.3,3,.1],['opacity','Opacity o','不透明度 o',0,1,.01]]);
  if(kind==='camera')sliders([['x','Camera-space X','相机空间 X',-2,2,.1],['z','Depth Z','深度 Z',3,20,.1],['f','Focal length (pixels)','焦距（像素）',50,200,1]]);
  if(kind==='composite'){sliders([['alphaA','Red alpha','红色 alpha',0,1,.01],['alphaB','Blue alpha','蓝色 alpha',0,1,.01]]);button('lab-swap',t('Swap front and back','交换前后层'),()=>{reverse=!reverse;draw();});}
  if(kind==='sh')sliders([['polar','Polar angle θ (degrees)','极角 θ（度）',0,180,1],['red','Red coefficient a₂R','红系数 a₂R',-1,1,.01]]);
  if(kind==='time')sliders([['time','Normalized time t','归一化时间 t',0,1,.01],['rho','Time width ρ','时间宽度 ρ',.05,.8,.01]]);
  if(kind==='data'){sliders([['ratio','Image resize ratio','图像缩放比例',.25,1,.05]]);button('lab-wrong',t('Keep original focal: OFF','保留原焦距：关'),()=>{wrong=!wrong;draw();});}
  if(kind==='gradient'){sliders([['beta','Opacity logit β','不透明度 logit β',-5,5,.01],['rate','Learning rate η','学习率 η',.1,30,.1]]);button('lab-apply',t('Apply this step','应用这一步'),()=>{params.beta=scalarGradient(params.beta,params.rate).next;params.beta=Math.max(-5,Math.min(5,params.beta));setup();draw();});}
  if(kind==='density')sliders([['opacity','Original pixel alpha A','原像素 alpha A',0,1,.01]]);
  if(kind==='budget')sliders([['count','Total Gaussian count','Gaussian 总数',1000,1000000,1],['visible','Visible fraction','可见比例',0,1,.01],['fps','Frames per second','每秒帧数',24,144,1]]);
  if(kind==='record'){
   controls.innerHTML=`<label for="lab-field">${t('Select a stored field','选择存储字段')}</label><select id="lab-field">${properties.map((p,i)=>`<option value="${i}">${i} · ${p}</option>`).join('')}</select>`;
   controls.querySelector('select').value=params.field;controls.querySelector('select').addEventListener('change',e=>{params.field=Number(e.target.value);draw();});
  }
  if(kind==='pipeline'){
   controls.innerHTML=`<label for="lab-stage">${t('Follow one pixel through the pipeline','沿管线跟踪一个像素')}</label><select id="lab-stage">${stages.map((s,i)=>`<option value="${i}">${i+1} · ${esc(t(...s))}</option>`).join('')}</select>`;
   controls.querySelector('select').value=pipelineStage;controls.querySelector('select').addEventListener('change',e=>{pipelineStage=Number(e.target.value);draw();});
  }
  if(kind==='train'){
   session??=new TrainingSession(5);
   controls.innerHTML=`<label for="lab-frame">${t('Inspect timestamp (training uses all three)','查看时间（训练同时使用三个时间）')}</label><select id="lab-frame">${trainingSpec.times.map((time,i)=>`<option value="${i}">t = ${time}</option>`).join('')}</select><div class="buttons" id="train-buttons"></div>`;
   controls.querySelector('select').value=frameIndex;controls.querySelector('select').addEventListener('change',e=>{frameIndex=Number(e.target.value);draw();});
   const add=(id,label,fn)=>{const b=button(id,label,fn);controls.querySelector('#train-buttons').append(b);};
   add('course-train-step',t('Train 1 step','训练 1 步'),()=>{stop();advance();draw();});
   add('course-train-back',t('Undo last step','撤销最后一步'),()=>{stop();if(session.stage===7)session.previous();draw();});
   add('course-train-run',t('Train 50','训练 50 步'),()=>{if(timer){stop();draw();return;}let left=Math.min(50,500-session.iteration);if(!left)return;timer=setInterval(()=>{try{advance();if(--left<=0)stop();draw();}catch(error){stop();note.textContent=t('Training stopped: ','训练停止：')+error.message;}},80);draw();});
   add('course-train-reset',t('Reset','重置'),()=>{stop();session.reset();draw();});
  }
 }
 function advance(){if(session.iteration>=500)return;if(session.stage===7)session.next();while(session.stage<7)session.next();}
 function stop(){clearInterval(timer);timer=null;}
 function draw(){
  visual.innerHTML='';note.textContent='';
  if(kind==='kernel'){
   const weight=kernel(params.x,params.scale),alpha=weight*params.opacity;
   graph(x=>kernel(x,params.scale,params.opacity),-6,6,1,`<circle cx="${30+(params.x+6)/12*340}" cy="${185-alpha*150}" r="6" fill="#efb86c"/><text x="145" y="208">x − μ</text>`);
   metrics([['d = (x − μ) / s',fmt(params.x/params.scale)],['G = exp(−d²/2)',fmt(weight)],['α = oG',fmt(alpha)]]);
   note.textContent=t('One-dimensional slice, no depth or other layers. Curve height is opacity × Gaussian weight.','一维切片，不含深度与其他层。曲线高度是 opacity × 高斯权重。');
  }
  if(kind==='camera'){
   const p=cameraSample(params.x,params.z,params.f),screenX=30+p.u*340/128;
   svg(`<path d="M30 110H375M200 30V185" stroke="#665474"/><ellipse cx="${screenX}" cy="110" rx="${p.width*340/128}" ry="${Math.sqrt(.04*(params.f/params.z)**2+.3)*340/128}" fill="#d2ec4c88" stroke="#d2ec4c"/><circle cx="${screenX}" cy="110" r="3" fill="white"/><text x="32" y="205">u = 0</text><text x="280" y="205">u = 128</text><text x="185" y="25">cx = 64</text>`);
   metrics([['u = fX/Z + 64',fmt(p.u)+' px'],['Jₓ = f/Z',fmt(params.f/params.z)],['Jz = −fX/Z²',fmt(-params.f*params.x/params.z**2)],['Cxx',fmt(p.variance)+' px²'],[t('1σ horizontal radius','1σ 水平半径'),fmt(p.width)+' px']]);
   note.textContent=t('World-space sphere scale 0.2, Y = 0; ellipse shows 1σ, not a hard boundary. Fixed viewport; out-of-view centers can disappear.','世界球形尺度 0.2，Y = 0；椭圆表示 1σ，并非硬边界。视口固定，超出屏幕的中心可能不可见。');
  }
  if(kind==='composite'){
   const r=composite(params.alphaA,params.alphaB,reverse);
   visual.innerHTML=`<div class="color-swatches"><div class="color-chip" style="background:${rgb(r.color)}">RGB</div><div class="color-chip" style="background:${rgb(r.over)}">Over</div></div>`;
   metrics([[t('Front → back','前 → 后'),reverse?'B → A':'A → B'],...r.weights.map(w=>[w.id+' · Tα',fmt(w.weight)]),[t('Remaining background','剩余背景'),fmt(r.remaining)],['RGB',r.color.map(x=>fmt(x,3)).join(', ')],['Over RGB',r.over.map(x=>fmt(x,3)).join(', ')]]);
   note.textContent=t('Black background. RGB is front-to-back accumulation; Over draws the same layers back-to-front. No alpha cap in this arithmetic demonstration.','黑色背景。RGB 为前到后累积，Over 将相同层按后到前绘制。本算术示例不截断 alpha。');
  }
  if(kind==='sh'){
   const coeff=blankCoefficients();coeff[2][0]=params.red;
   const v=directionFromAngles(0,params.polar*Math.PI/180),r=sampleSH(coeff,v,1);
   svg(`<circle cx="200" cy="105" r="72" fill="#272131" stroke="#746282"/><path d="M200 24V186M128 105H272" stroke="#746282"/><path d="M200 105L${200+72*v[0]} ${105-72*v[2]}" stroke="#d2ec4c" stroke-width="3"/><circle cx="${200+72*v[0]}" cy="${105-72*v[2]}" r="6" fill="white"/><text x="208" y="23">+Z</text><text x="280" y="110">+X</text><text x="45" y="209">${esc(t('Direction slice at azimuth 0°','方位角 0° 的方向切片'))}</text>`);
   values.innerHTML=`<div class="color-swatches">${[0,1,2,3].map(c=>`<div class="color-chip" style="background:${rgb(c===3?r.display:r.display.map((x,j)=>j===c?x:0))}">${['R','G','B','RGB'][c]}</div>`).join('')}</div>`;
   values.innerHTML+='<dl>'+[['Y₂(v)',fmt(r.basis[2])],['a₂R × Y₂',fmt(r.contributions[2][0])],['R / G / B',r.shifted.map(x=>fmt(x)).join(' / ')]].map(([a,b])=>`<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')+'</dl>';
   note.textContent=t('Synthetic SH, baseline 0.5; only a₂R varies. The diagram is a 2D direction slice. Use the full lab for rotatable 3D basis and channel spheres.','合成 SH，基准值 0.5，只改变 a₂R。此图是二维方向切片；完整实验提供可旋转三维基函数与通道球面。');
  }
  if(kind==='time'){
   const row=initialRecords()[0];row[4]=Math.log(params.rho);const r=evaluateRecord(row,params.time,[74.5,68.5]);
   graph(x=>Math.exp(-(((x-.5)/params.rho)**2)),0,1,1,`<circle cx="${30+340*params.time}" cy="${185-150*r.temporal}" r="6" fill="#efb86c"/><text x="191" y="208">t</text>`);
   metrics([['Δt',fmt(r.dt)],['μ(t)',r.mean.map(x=>fmt(x,3)).join(', ')],['w(t)',fmt(r.temporal)],['o(t)',fmt(r.baseOpacity*r.temporal)],['u / v',r.uv.map(x=>fmt(x,3)).join(' / ')]]);
   note.textContent=t('The curve is the temporal multiplier; the numbers come from the existing A record with only its time width adjusted.','曲线是时间倍率，数字来自现有 A 记录，仅调整时间宽度。');
  }
  if(kind==='data'){
   const r=resizeSample(params.ratio,wrong);document.querySelector('#lab-wrong').textContent=wrong?t('Keep original focal: ON (wrong)','保留原焦距：开（错误）'):t('Keep original focal: OFF','保留原焦距：关');
   const w=800*params.ratio,h=600*params.ratio;
   svg(`<rect x="30" y="20" width="340" height="160" fill="none" stroke="#665474"/><path d="M${30+340*r.expected/w} 20V180" stroke="#d2ec4c" stroke-width="2"/><circle cx="${30+340*r.actual/w}" cy="100" r="7" fill="#efb86c"/><text x="38" y="205">${esc(t('Green = expected; gold = projected','绿线：预期；金点：投影'))}</text>`);
   metrics([[t('Image size','图像尺寸'),`${fmt(w,0)} × ${fmt(h,0)}`],['fx′',fmt(r.focal,1)],['cx′',fmt(r.principal,1)],[t('Expected u′','预期 u′'),fmt(r.expected,2)],[t('Actual u′','实际 u′'),fmt(r.actual,2)],[t('Pixel error','像素误差'),fmt(r.actual-r.expected,2)]]);
   note.textContent=t('No crop; X/Z = 0.1. The illustration is schematic, with horizontal position scaled to the resized width.','没有裁剪，X/Z = 0.1。示意图横向位置按缩放后的宽度换算。');
  }
  if(kind==='gradient'){
   const r=scalarGradient(params.beta,params.rate);
   graph(x=>scalarGradient(x).loss,-5,5,.36,`<circle cx="${30+(params.beta+5)/10*340}" cy="${185-r.loss/.36*150}" r="6" fill="#efb86c"/><text x="190" y="208">β</text>`);
   metrics([['α = sigmoid(β)',fmt(r.alpha)],['Ĉ = 0.8α',fmt(r.prediction)],['L = (Ĉ − 0.6)²',fmt(r.loss,6)],['∂L/∂β',fmt(r.gradient,7)],['Finite difference',fmt(r.finite,7)],['βnew',fmt(r.next,5)],['Lnew',fmt(r.nextLoss,6)]]);
   note.textContent=t('Scalar one-pixel model, spatial weight 1, black background, no clipping branch. Gold marks current β; this is not the full 3D position gradient.','单标量像素，空间权重 1、黑背景，无裁剪分支。金点标出当前 β；这不是完整三维位置梯度。');
  }
  if(kind==='density'){
   const r=duplication(params.opacity);
   svg([['Original','原始',params.opacity],['Duplicate','直接复制',r.unchanged],['Half each','各分一半',r.halved],['Correct at pixel','单像素修正',r.preserved]].map(([en,zh,a],i)=>`<text x="15" y="${35+i*48}">${esc(t(en,zh))}</text><rect x="150" y="${18+i*48}" width="${220*a}" height="24" fill="${i===0?'#efb86c':'#d2ec4c'}"/>`).join(''));
   metrics([[t('Original A','原 A'),fmt(params.opacity)],[t('Two unchanged layers','两层直接复制'),fmt(r.unchanged)],[t('Two half-alpha layers','两层 alpha 各减半'),fmt(r.halved)],[t('Required child alpha','单像素所需子 alpha'),fmt(r.child)],[t('Corrected pair alpha','修正后的合成 alpha'),fmt(1-(1-r.child)**2)]]);
   note.textContent=t('A compositing demonstration at one pixel, not a clone/split trainer. The correction is not a global footprint-preserving rule.','单像素合成示例，不是复制或分裂训练器。该修正不能作为整片覆盖保持不变的规则。');
  }
  if(kind==='budget'){
   const r=memoryBudget(params.count,params.visible,params.fps),m=x=>fmt(x/1048576,3)+' MiB';
   metrics([[t('Decoded records','解码记录'),m(r.records)],[t('Index upload / frame','每帧索引上传'),m(r.indices)],[t('Index upload / second','每秒索引上传'),m(r.perSecond)+'/s'],[t('All records / second (comparison)','重传全部记录 / 秒（对照）'),m(r.records*params.fps)+'/s']]);
   note.textContent=t('Arithmetic budget, not a measured benchmark. Includes 128-byte rows and 4-byte indices only; excludes sorting work, GPU layout overhead, targets and duplicate buffers.','算术预算，不是实测性能。只计 128 字节记录与 4 字节索引，不含排序工作、GPU 布局开销、目标与重复缓冲。');
  }
  if(kind==='record'){
   const row=initialRecords()[0],field=params.field,value=row[field];let decoded=value,meaning=t('Stored coefficient; consumed as part of its vector or polynomial.','存储系数，作为向量或多项式的一部分使用。');
   if(field===4||field>=21&&field<=23){decoded=Math.exp(value);meaning=t('Exponentiate this stored logarithm before use.','使用前对存储的对数取指数。');}
   if(field===20){decoded=sigmoid(value);meaning=t('Apply sigmoid to obtain base opacity.','使用 sigmoid 得到基准 opacity。');}
   if(field>=17&&field<=19)meaning=t('Already direct RGB in this contract. Do not apply SH DC decoding.','本契约中已经是直接 RGB，不要做 SH DC 解码。');
   if(field>=24)meaning=t('Part of a four-component quaternion expression; normalize the full evaluated quaternion, not each scalar.','属于四分量四元数表达式；归一化整个求值后的四元数，不能分别归一化单个标量。');
   metrics([[t('Property','属性'),properties[field]],[t('Byte offset within row','行内字节偏移'),field*4],[t('Stored f32 (shown before serialization)','存储值（此处为序列化前数值）'),fmt(value,6)],[t('Activated scalar, where applicable','适用时激活后的标量'),fmt(decoded,6)]]);
   note.textContent=meaning;
  }
  if(kind==='pipeline'){
   const records=initialRecords(),result=forward(records,.5,[74.5,68.5]),a=evaluateRecord(records[0],.5,[74.5,68.5]);
   const entries=[[[t('A center','A 中心'),records[0].slice(0,3).join(', ')],['β',fmt(records[0][20])],[t('Scale logs','尺度对数'),records[0].slice(21,24).map(x=>fmt(x)).join(', ')]],[['t / Δt','0.5 / '+fmt(a.dt)],['μ(t)',a.mean.map(x=>fmt(x)).join(', ')],['o(t)',fmt(a.baseOpacity*a.temporal)]],[['u / v',a.uv.map(x=>fmt(x)).join(', ')],['C',JSON.stringify(a.covariance.map(row=>row.map(x=>Number(fmt(x)))))]],[['pixel','74.5, 68.5'],['r²',fmt(a.radiusSquared)],['G',fmt(a.spatial)],['αA',fmt(a.alpha)]],[['RGB',result.color.map(x=>fmt(x)).join(', ')],['Tbg',fmt(result.remaining)]],[['RGB target',result.target.join(', ')],['RGB MSE',fmt(result.loss,7)]]];
   metrics(entries[pipelineStage]);
   visual.innerHTML=`<div class="color-swatches"><div class="color-chip" style="background:${rgb(result.color)}">${esc(t('Predicted pixel','预测像素'))}</div><div class="color-chip" style="background:${rgb(result.target)}">${esc(t('Target','目标'))}</div></div>`;
   note.textContent=t('Fixed A/B records and the existing single-pixel target; each stage reveals a different part of the same calculation.','固定 A/B 记录与已有单像素目标，每个阶段展示同一次计算的不同部分。');
  }
  if(kind==='train'){
   const committed=session.stage===7,trace=session.prepare(),current=committed?trace.after:trace.before,pixels=current.frames[frameIndex];
   visual.innerHTML=`<div class="training-images">${[[t('Target','目标'),'target'],[t('Prediction','预测'),'prediction'],[t('Error ×4','误差 ×4'),'error']].map(([label,id])=>`<figure><canvas id="course-${id}" width="12" height="10" role="img" aria-label="${esc(label)}"></canvas><figcaption>${esc(label)}</figcaption></figure>`).join('')}</div>`;
   for(const name of ['target','prediction','error']){
    const ctx=visual.querySelector('#course-'+name).getContext('2d'),img=ctx.createImageData(12,10);
    pixels.forEach((p,i)=>{const color=name==='target'?p.target:name==='prediction'?p.color:[Math.sqrt(p.loss)*4,Math.sqrt(p.loss)*1.28,Math.sqrt(p.loss)*2.6];color.forEach((v,c)=>img.data[i*4+c]=Math.round(Math.max(0,Math.min(1,v))*255));img.data[i*4+3]=255;});ctx.putImageData(img,0,0);
   }
   const plot=document.createElement('div'),history=session.history,max=Math.max(...history)*1.05;
   plot.innerHTML=`<svg viewBox="0 0 400 120" role="img" aria-label="${esc(t('Actual training loss history','实际训练损失历史'))}"><path d="M20 10V100H380" fill="none" stroke="#665474"/><polyline fill="none" stroke="#d2ec4c" stroke-width="2" points="${history.map((l,i)=>`${20+i/Math.max(1,history.length-1)*360},${100-l/max*85}`).join(' ')}"/><circle cx="${history.length===1?20:380}" cy="${100-history.at(-1)/max*85}" r="4" fill="#efb86c"/><text x="25" y="15">MSE ${fmt(max,5)}</text><text x="20" y="118">0</text><text x="343" y="118">${session.iteration}</text></svg>`;visual.append(plot);
   metrics([[t('Completed updates','完成更新次数'),session.iteration],['MSE',fmt(current.loss,8)],...trainingParameters.map((field,i)=>[trainingNames[i],fmt(session.records[0][field],6)])]);
   note.textContent=t('Live full-batch SGD, learning rate 5. Three timestamps train together. Error display uses pixel RMSE ×4; loss is batch MSE. Reload resets this experiment. Up to 500 updates.','实时全批量 SGD，学习率 5，三个时间一起训练。误差显示为像素 RMSE ×4，损失为批量 MSE。重新加载会重置实验，最多 500 次更新。');
   document.querySelector('#course-train-run').textContent=timer?t('Pause','暂停'):t('Train 50','训练 50 步');
   document.querySelector('#course-train-back').disabled=session.stage!==7;
   document.querySelector('#course-train-step').disabled=session.iteration>=500;
  }
 }
 setup();draw();
 document.addEventListener('learn:language',()=>{setup();draw();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();if(kind==='train')draw();}});
 window.addEventListener('pagehide',stop);
}
