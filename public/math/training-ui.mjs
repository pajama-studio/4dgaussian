import {TrainingSession,trainingSpec,trainingParameters,trainingNames} from './training.mjs';
import {gradient} from './trace.mjs';
import {t} from './i18n.mjs';

const root=document.querySelector('#training-lab');
if(root) {
  const $=id=>document.getElementById(id), session=new TrainingSession(5);
  const {width,height,left,top}=trainingSpec;
  let frameIndex=1,pixelIndex=66,timer=null,running=null,fastTarget=0,failed=false;
  let focused=new URL(location.href).searchParams.get('view')==='training';
  document.body.classList.toggle('training-focus',focused);
  const fmt=x=>Math.abs(x)>0&&Math.abs(x)<0.00001?x.toExponential(4):x.toFixed(6);
  const vector=v=>'['+v.map(x=>Array.isArray(x)?vector(x):fmt(x)).join(', ')+']';
  const color=v=>'rgb('+v.map(x=>Math.max(0,Math.min(1,x))*255).join(',')+')';
  function stop() { clearTimeout(timer);timer=null;running=null; }
  function placeholder(canvas,key) {
    const ctx=canvas.getContext('2d');ctx.fillStyle='#111117';ctx.fillRect(0,0,canvas.width,canvas.height);
    $(canvas.id+'-note').textContent=t(key);
  }
  function drawPatch(canvas,values,error=false) {
    const ctx=canvas.getContext('2d'),sx=canvas.width/width,sy=canvas.height/height;
    values.forEach((v,i)=>{
      const intensity=error?Math.min(1,Math.sqrt(v)/0.25):0;
      ctx.fillStyle=error?color([intensity,intensity*0.32,intensity*0.65]):color(v);
      ctx.fillRect(i%width*sx,Math.floor(i/width)*sy,sx,sy);
    });
    const x=pixelIndex%width*sx,y=Math.floor(pixelIndex/width)*sy;
    ctx.strokeStyle='#000';ctx.lineWidth=5;ctx.strokeRect(x+2,y+2,sx-4,sy-4);
    ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.strokeRect(x+2,y+2,sx-4,sy-4);
  }
  function drawEllipses(canvas,pixel) {
    const ctx=canvas.getContext('2d'),sx=canvas.width/width,sy=canvas.height/height;
    ctx.fillStyle='#111117';ctx.fillRect(0,0,canvas.width,canvas.height);
    for(const s of pixel.splats) {
      const [[a,b],[,c]]=s.covariance,angle=.5*Math.atan2(2*b,a-c);
      ctx.save();ctx.translate((s.uv[0]-left)*sx,(s.uv[1]-top)*sy);
      ctx.scale(sx,sy);ctx.rotate(angle);ctx.strokeStyle=s.id===0?'#fda778':'#82a9ff';ctx.lineWidth=.12;
      ctx.beginPath();ctx.ellipse(0,0,3*Math.sqrt(s.eigenvalues[0]),3*Math.sqrt(s.eigenvalues[1]),0,0,2*Math.PI);ctx.stroke();
      ctx.restore();ctx.fillStyle=s.id===0?'#fda778':'#82a9ff';ctx.font='16px sans-serif';ctx.textAlign='left';
      ctx.fillText(s.id===0?'A':'B',(s.uv[0]-left)*sx,(s.uv[1]-top)*sy);
    }
  }
  function drawHistory() {
    const canvas=$('train-loss-chart'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
    const values=session.history,max=Math.max(...values,1e-12)*1.1;
    ctx.clearRect(0,0,w,h);ctx.strokeStyle='#726881';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(76,20);ctx.lineTo(76,h-35);ctx.lineTo(w-16,h-35);ctx.stroke();
    ctx.fillStyle='#c4bad0';ctx.font='13px monospace';ctx.textAlign='right';ctx.fillText(max.toExponential(2),70,25);ctx.fillText('0',70,h-32);
    ctx.textAlign='left';ctx.fillText('0',76,h-12);ctx.textAlign='right';ctx.fillText(String(session.iteration),w-16,h-12);
    ctx.strokeStyle='#c4db22';ctx.lineWidth=3;ctx.beginPath();
    values.forEach((v,i)=>{const x=76+i/Math.max(1,values.length-1)*(w-92),y=h-35-v/max*(h-55);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.stroke();
    if(values.length===1){ctx.fillStyle='#c4db22';ctx.beginPath();ctx.arc(76,h-35-values[0]/max*(h-55),4,0,Math.PI*2);ctx.fill();}
  }
  function render() {
    const trace=session.prepare(),stage=session.stage,frame=session.data[frameIndex];
    const current=stage===7?trace.after:trace.before,sample=frame.samples[pixelIndex],pixel=current.frames[frameIndex][pixelIndex];
    const a=pixel.splats.find(s=>s.id===0);
    root.querySelectorAll('[data-training-stage]').forEach(node=>{node.hidden=Number(node.dataset.trainingStage)!==stage;});
    root.querySelectorAll('[data-stage-chip]').forEach(node=>{
      node.classList.toggle('complete',Number(node.dataset.stageChip)<stage);
      if(Number(node.dataset.stageChip)===stage)node.setAttribute('aria-current','step');else node.removeAttribute('aria-current');
    });
    const capped=session.iteration>=500&&stage===7;
    $('train-next').textContent=t(stage===7?'开始下一轮 →':'下一小步 →');
    $('train-play').textContent=t(running?'暂停':'播放本轮');
    $('train-prev').disabled=stage===0;$('train-next').disabled=Boolean(running)||capped;
    $('train-fast').disabled=Boolean(running)||capped;$('train-rate').disabled=Boolean(running);
    $('train-play').disabled=capped&&!running;
    $('train-focus').textContent=t(focused?'返回手册布局':'全宽训练视图');
    $('train-focus').setAttribute('aria-pressed',String(focused));
    let state=t(running==='fast'?'自动训练中；可随时暂停':stage===7?'本轮已更新一次':'参数尚未更新');
    if(capped)state=t('已达到 500 轮；重置可重新观察');
    if(stage===7&&trace.after.loss>trace.before.loss)state+=' '+t('这一步损失上升，可回退或降低学习率。');
    $('train-status').setAttribute('aria-live',running==='fast'?'off':'polite');
    $('train-status').textContent=failed?t('计算遇到问题；已暂停。请重置训练。'):t('第 {iteration} 轮 · 小步 {stage}/8 · {state}',{iteration:session.iteration+(stage===7?0:1),stage:stage+1,state});
    drawPatch($('train-target'),frame.samples.map(s=>s.target));
    $('train-prediction-note').hidden=stage>=2;$('train-error-note').hidden=stage>=4;
    if(stage<2)placeholder($('train-prediction'),'第 3 小步显示屏幕椭圆');
    else if(stage===2)drawEllipses($('train-prediction'),pixel);
    else drawPatch($('train-prediction'),current.frames[frameIndex].map(p=>p.color));
    if(stage<4)placeholder($('train-error'),'第 5 小步显示误差');
    else drawPatch($('train-error'),current.frames[frameIndex].map(p=>p.loss),true);
    $('train-before').textContent=stage>=4?trace.before.loss.toFixed(8):'—';
    $('train-after').textContent=stage===7?trace.after.loss.toFixed(8):'—';
    $('train-iteration').textContent=session.iteration;
    $('train-parameters').replaceChildren(...trainingParameters.map((field,j)=>{
      const row=document.createElement('tr');
      [trainingNames[j],fmt(trace.beforeRecords[0][field]),stage>=5?fmt(trace.before.gradients[j]):'—',stage>=6?fmt(-trace.rate*trace.before.gradients[j]):'—',stage>=6?fmt(trace.afterRecords[0][field]):'—'].forEach((value,i)=>{
        const cell=document.createElement(i?'td':'th');cell.textContent=value;if(!i)cell.scope='row';row.append(cell);
      });return row;
    }));
    const messages=[t('像素 p = {pixel}，t = {time}',{pixel:vector(sample.pixel),time:frame.time})];
    if(stage>=1)messages.push(t('A 的 Δt = {dt}；μ(t) = {mean}；基础 opacity = {opacity}',{dt:fmt(a.dt),mean:vector(a.mean),opacity:fmt(a.baseOpacity)}));
    if(stage>=2)messages.push(t('A 的屏幕中心 = {uv}；C = {covariance}',{uv:vector(a.uv),covariance:vector(a.covariance)}));
    if(stage>=3)messages.push(t('近→远 {order}；A 的 alpha = {alpha}，T = {transmittance}',{order:pixel.splats.map(s=>s.id===0?'A':'B').join(' → '),alpha:fmt(a.alpha),transmittance:fmt(a.transmittance)}));
    if(stage>=4)messages.push(t('预测 {prediction}；目标 {target}；本像素 MSE = {loss}',{prediction:vector(pixel.color),target:vector(sample.target),loss:fmt(pixel.loss)}));
    if(stage>=5) {
      const g=gradient(trace.beforeRecords,0,frame.time,sample.pixel,{target:sample.target,finite:false});
      messages.push(t('此像素更新前：∂Lₙ/∂α = {lossAlpha}；∂α/∂μ₀x = {alphaMean}；相乘 = {meanGradient}',{lossAlpha:fmt(g.lossAlphaSlope),alphaMean:fmt(g.alphaSlope),meanGradient:fmt(g.analytic)}));
      messages.push(t('均值路径 {meanPath} + 协方差路径 {covariancePath} = {alphaMean}',{meanPath:fmt(g.meanPath),covariancePath:fmt(g.covariancePath),alphaMean:fmt(g.alphaSlope)}));
      messages.push(t('运动梯度再乘 Δt = {dt}；表格是全部 360 像素的平均，不是只用这个像素。',{dt:fmt(a.dt)}));
    }
    $('train-pixel-detail').replaceChildren(...messages.map(message=>{const p=document.createElement('p');p.textContent=message;return p;}));
    drawHistory();$('train-loss-summary').textContent=t('初始 {initial} → 当前 {current}；共 {count} 次更新',{initial:session.history[0].toFixed(8),current:session.history.at(-1).toFixed(8),count:session.iteration});
  }
  function safeRender() {try{render();}catch(error){stop();failed=true;$('train-status').textContent=t('计算遇到问题；已暂停。请重置训练。');console.error(error);}}
  function advance() { session.next();safeRender(); }
  function tick() {
    if(!running)return;
    try {
      if(running==='fast') {
        if(session.stage===7)session.next();
        while(session.stage<7)session.next();
        if(session.iteration>=fastTarget)stop();
      } else {
        session.next();if(session.stage===7)stop();
      }
      safeRender();if(running)timer=setTimeout(tick,running==='fast'?80:1600);
    }catch(error){stop();failed=true;safeRender();console.error(error);}
  }
  $('train-next').addEventListener('click',()=>{stop();advance();});
  $('train-focus').addEventListener('click',()=>{
    focused=!focused;document.body.classList.toggle('training-focus',focused);
    const url=new URL(location.href);if(focused)url.searchParams.set('view','training');else url.searchParams.delete('view');
    url.hash='training-lab';history.replaceState(null,'',url);safeRender();root.scrollIntoView({block:'start'});
  });
  $('train-prev').addEventListener('click',()=>{stop();session.previous();safeRender();});
  $('train-play').addEventListener('click',()=>{
    if(running){stop();safeRender();return;}
    if(session.stage===7)session.next();running='stages';safeRender();timer=setTimeout(tick,1600);
  });
  $('train-fast').addEventListener('click',()=>{stop();running='fast';fastTarget=Math.min(500,session.iteration+50);safeRender();timer=setTimeout(tick,80);});
  $('train-reset').addEventListener('click',()=>{stop();failed=false;session.reset();safeRender();});
  $('train-rate').addEventListener('change',()=>{stop();session.rate=Number($('train-rate').value);session.pending=null;session.stage=0;safeRender();});
  $('train-frame').addEventListener('change',()=>{frameIndex=Number($('train-frame').value);safeRender();});
  $('train-pixel').addEventListener('change',()=>{
    const n=Number($('train-pixel').value);pixelIndex=Number.isFinite(n)?Math.max(0,Math.min(width*height-1,Math.round(n))):66;
    $('train-pixel').value=pixelIndex;safeRender();
  });
  for(const id of ['train-target','train-prediction','train-error'])$(id).addEventListener('click',event=>{
    const box=event.currentTarget.getBoundingClientRect();
    const x=Math.max(0,Math.min(width-1,Math.floor((event.clientX-box.left)/box.width*width)));
    const y=Math.max(0,Math.min(height-1,Math.floor((event.clientY-box.top)/box.height*height)));
    pixelIndex=y*width+x;$('train-pixel').value=pixelIndex;safeRender();
  });
  addEventListener('math:languagechange',safeRender);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();safeRender();}});
  safeRender();
}
