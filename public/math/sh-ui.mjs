import { shBasis, unitDirection, directionFromAngles, presetCoefficients, sampleSH,
  projectColor, targetColor, sphereSamples } from './sh.mjs';
import { t } from './i18n.mjs';
import { viewPreset, viewFrame, projectView, orbitView } from './sh-view.mjs';

const root = document.querySelector('#sh-lab');
if (root) {
  const $ = id => document.getElementById(id);
  const defaultView=viewPreset(), mainView=viewPreset(), fitView=viewPreset();
  const vertices=[], faces=[];
  const lat=32, lon=64;
  for(let i=0;i<=lat;i++) for(let j=0;j<=lon;j++) {
    const v=directionFromAngles(j/lon*2*Math.PI,i/lat*Math.PI);
    vertices.push({v,basis:shBasis(v)});
  }
  for(let i=0;i<lat;i++) for(let j=0;j<lon;j++) {
    const a=i*(lon+1)+j,b=a+lon+1;
    for(const ids of [[a,b,a+1],[a+1,b,b+1]]) {
      const v=unitDirection([0,1,2].map(ch=>ids.reduce((s,k)=>s+vertices[k].v[ch],0)));
      faces.push({ids,v,basis:shBasis(v)});
    }
  }
  const maxima=Array.from({length:16},(_,k)=>Math.max(...vertices.map(p=>Math.abs(p.basis[k]))));
  let coefficients=presetCoefficients('mixed'), selected=6, degree=3, mode='lobes';
  let direction=directionFromAngles(-Math.PI/4,45*Math.PI/180);
  const fmt = v => (Math.abs(v)<0.0000005?0:v).toFixed(6);
  const rgb = values => '['+values.map(fmt).join(', ')+']';
  const clamp = x => Math.min(1,Math.max(0,x));
  const colorAt = (basis,a,L) => [0,1,2].map(ch=>clamp(
    basis.slice(0,(L+1)**2).reduce((sum,value,k)=>sum+value*a[k][ch],0.5)));
  const mainColors=new Map();
  let channelMode='tinted';

  function drawPlot(canvas,{basisIndex=null,color=null,shape='sphere',marker=null,axes=false,camera=defaultView}={}) {
    const frame=viewFrame(camera),view=v=>projectView(v,frame);
    const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,scale=Math.min(w,h)*0.37*camera.zoom;
    const center=[w/2,h/2];
    ctx.clearRect(0,0,w,h);
    const positions=vertices.map(p=>{
      const radius=shape==='lobes'?Math.abs(p.basis[basisIndex])/maxima[basisIndex]:1;
      const projected=view(p.v);
      return [center[0]+projected[0]*scale*radius,center[1]-projected[1]*scale*radius,projected[2]*radius];
    });
    const order=faces.map(face=>({face,depth:face.ids.reduce((s,k)=>s+positions[k][2],0)/3})).sort((a,b)=>a.depth-b.depth);
    for(const {face} of order) {
      // Back faces are unnecessary for a convex sphere. Lobes are nonconvex.
      const facing=view(face.v)[2];
      if(shape==='sphere'&&facing<-0.03) continue;
      let c;
      if(color) c=color(face.basis,face.v).map(v=>Math.round(clamp(v)*255));
      else {
        const value=face.basis[basisIndex]/maxima[basisIndex];
        const base=value>=0?[243,170,93]:[90,162,246];
        const mix=Math.min(1,Math.abs(value)*2.0);
        const light=0.78+0.22*Math.max(0,facing);
        c=base.map((v,ch)=>Math.round((mix*v+(1-mix)*[104,100,112][ch])*light));
      }
      ctx.fillStyle='rgb('+c.join(',')+')';
      ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=0.65;
      ctx.beginPath();face.ids.forEach((k,i)=>i?ctx.lineTo(...positions[k].slice(0,2)):ctx.moveTo(...positions[k].slice(0,2)));
      ctx.closePath();ctx.fill();ctx.stroke();
    }
    if(axes) {
      ctx.font='13px ui-monospace, monospace';ctx.textAlign='center';ctx.lineWidth=1;
      [[1,0,0],[0,1,0],[0,0,1]].forEach((axis,i)=>{
        const p=view(axis),x=center[0]+p[0]*scale*1.2,y=center[1]-p[1]*scale*1.2;
        ctx.strokeStyle='#ded4ef66';ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(...center);ctx.lineTo(x,y);ctx.stroke();ctx.setLineDash([]);
        ctx.fillStyle='#ede5f6';ctx.fillText(['+x','+y','+z'][i],x,y-6);
      });
    }
    if(marker) {
      const p=view(marker),radius=shape==='lobes'?Math.abs(shBasis(marker)[basisIndex])/maxima[basisIndex]:1;
      const x=center[0]+p[0]*scale*radius,y=center[1]-p[1]*scale*radius;
      ctx.lineWidth=2;ctx.strokeStyle='#fff';ctx.fillStyle='#151018';ctx.setLineDash(p[2]<0?[3,3]:[]);
      ctx.beginPath();ctx.arc(x,y,6,0,2*Math.PI);ctx.fill();ctx.stroke();ctx.setLineDash([]);
    }
  }

  function drawGallery() {
    root.querySelectorAll('[data-basis]').forEach(button=>{
      const k=Number(button.dataset.basis);
      drawPlot(button.querySelector('canvas'),{basisIndex:k,shape:mode});
    });
  }
  function updateSelectedControls() {
    for(let ch=0;ch<3;ch++) $('sh-a-'+ch).value=coefficients[selected][ch];
    root.querySelectorAll('[data-formula]').forEach(node=>{node.hidden=Number(node.dataset.formula)!==selected;});
    root.querySelectorAll('[data-basis]').forEach(node=>{
      node.setAttribute('aria-pressed',String(Number(node.dataset.basis)===selected));
      node.classList.toggle('sh-muted-basis',Number(node.dataset.basis)>=(degree+1)**2);
    });
  }
  function renderNumbers() {
    const l=Math.floor(Math.sqrt(selected)),m=selected-l*l-l;
    const selectedValue=shBasis(direction)[selected],result=sampleSH(coefficients,direction,degree);
    $('sh-selected-caption').textContent=t('选中 k = {k} · ℓ = {l}, m = {m} · Y(v) = {value}',{k:selected,l,m,value:fmt(selectedValue)});
    $('sh-coefficient-title').textContent=t('编辑 k = {k} 的三个系数',{k:selected});
    $('sh-inactive').textContent=t(selected>=(degree+1)**2?'该项高于当前最高阶，保留系数但暂不参与颜色求和。':'该项正在参与求和。试着只改变一个通道，再观察贡献表。');
    $('sh-direction').textContent=t('单位方向 v = {direction}；长度 = {length}',{direction:rgb(direction),length:fmt(Math.hypot(...direction))});
    $('sh-phi-value').textContent=$('sh-phi').value+'°';$('sh-theta-value').textContent=$('sh-theta').value+'°';
    for(let ch=0;ch<3;ch++) $('sh-a-value-'+ch).textContent=coefficients[selected][ch].toFixed(2);
    $('sh-swatch').style.background='rgb('+result.display.map(v=>v*255).join(',')+')';
    $('sh-channel-swatch').style.background=$('sh-swatch').style.background;
    $('sh-channel-count').textContent=t('L = {degree}：{count} 个共享基函数 × 3 个通道 = {total} 个独立系数。',{
      degree,count:result.basis.length,total:result.basis.length*3,
    });
    for(let ch=0;ch<3;ch++) {
      $('sh-channel-value-'+ch).textContent=['R','G','B'][ch]+' = '+result.display[ch].toFixed(3);
      $('sh-channel-steps-'+ch).textContent=t('SH 求和 {raw}；加 0.5 → {shifted}；显示 → {display}',{
        raw:result.raw[ch].toFixed(3),shifted:result.shifted[ch].toFixed(3),display:result.display[ch].toFixed(3),
      });
    }
    $('sh-combined-value').textContent='['+result.display.map(value=>value.toFixed(3)).join(', ')+']';
    $('sh-result-text').replaceChildren(...[
      ['纯 SH 求和',result.raw],['加 0.5 后',result.shifted],['仅下界 clamp',result.shaderColor],['屏幕显示 0–1',result.display],
    ].map(([label,values])=>{
      const row=document.createElement('p'),span=document.createElement('span'),code=document.createElement('code');
      span.textContent=t(label);code.textContent=rgb(values);row.append(span,code);return row;
    }));
    $('sh-contribution-body').replaceChildren(...result.basis.map((value,k)=>{
      const row=document.createElement('tr'),l=Math.floor(Math.sqrt(k));
      if(k===selected) row.className='sh-current-row';
      [k+' / ('+l+','+(k-l*l-l)+')',fmt(value),rgb(coefficients[k]),rgb(result.contributions[k])].forEach(text=>{
        const cell=document.createElement('td');cell.textContent=text;row.append(cell);
      });
      return row;
    }));
  }
  function drawMain() {
    drawPlot($('sh-selected-canvas'),{basisIndex:selected,shape:mode,marker:direction,axes:true,camera:mainView});
    drawPlot($('sh-color-canvas'),{color:basis=>mainColors.get(basis),marker:direction,axes:true,camera:mainView});
    for(let ch=0;ch<3;ch++) drawPlot($('sh-channel-'+ch),{
      color:basis=>[0,1,2].map(component=>channelMode==='grayscale'||component===ch?mainColors.get(basis)[ch]:0),
      marker:direction,axes:true,camera:mainView,
    });
  }
  function bindView(prefix,canvases,state,redraw) {
    const controls=$(prefix+'-view-controls'),zoom=$(prefix+'-view-zoom');
    let pending=false;
    function status() {
      $(prefix+'-view-status').textContent=t('图示视角：方位 {yaw}° · 仰角 {pitch}° · 缩放 {zoom}×',{
        yaw:Math.round(state.yaw*180/Math.PI),pitch:Math.round(state.pitch*180/Math.PI),zoom:state.zoom.toFixed(2),
      });
    }
    function changed() {
      zoom.value=state.zoom;status();
      if(pending)return;pending=true;
      requestAnimationFrame(()=>{pending=false;redraw();});
    }
    controls.querySelectorAll('[data-view-preset]').forEach(button=>button.addEventListener('click',()=>{
      Object.assign(state,viewPreset(button.dataset.viewPreset));changed();
    }));
    zoom.addEventListener('input',()=>{state.zoom=Number(zoom.value);changed();});
    let pointerId=null,last=[0,0];
    for(const canvas of canvases) {
      canvas.addEventListener('pointerdown',event=>{
        if(event.button!==0||pointerId!==null)return;
        event.preventDefault();pointerId=event.pointerId;last=[event.clientX,event.clientY];
        canvas.focus({preventScroll:true});canvas.setPointerCapture(pointerId);canvas.classList.add('is-orbiting');
      });
      canvas.addEventListener('pointermove',event=>{
        if(event.pointerId!==pointerId)return;
        orbitView(state,event.clientX-last[0],event.clientY-last[1]);last=[event.clientX,event.clientY];changed();
      });
      for(const eventName of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(eventName,event=>{
        if(event.pointerId===pointerId){pointerId=null;canvas.classList.remove('is-orbiting');}
      });
      canvas.addEventListener('keydown',event=>{
        if(event.ctrlKey||event.metaKey||event.altKey)return;
        const arrows={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]};
        if(arrows[event.key])orbitView(state,...arrows[event.key]);
        else if(event.key==='Home')Object.assign(state,viewPreset());
        else if(['+','=','-'].includes(event.key))state.zoom=Math.max(.6,Math.min(1.5,state.zoom+(event.key==='-'?-.05:.05)));
        else return;
        event.preventDefault();changed();
      });
    }
    addEventListener('math:languagechange',status);status();
  }
  let scheduled=false,galleryDirty=false;
  function update({gallery=false}={}) {
    renderNumbers();galleryDirty ||= gallery;
    // Reuse the identical directional RGB samples in all four channel plots.
    // Orbiting changes only projection; it does not recompute these samples.
    for(const face of faces)mainColors.set(face.basis,colorAt(face.basis,coefficients,degree));
    if(scheduled) return;scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;if(galleryDirty){drawGallery();galleryDirty=false;}drawMain();});
  }
  root.querySelectorAll('[data-basis]').forEach(button=>button.addEventListener('click',()=>{
    selected=Number(button.dataset.basis);updateSelectedControls();update();
  }));
  $('sh-shape').addEventListener('change',()=>{mode=$('sh-shape').value;update({gallery:true});});
  $('sh-degree').addEventListener('change',()=>{degree=Number($('sh-degree').value);updateSelectedControls();update();});
  $('sh-preset').addEventListener('change',()=>{
    const name=$('sh-preset').value;coefficients=presetCoefficients(name);
    degree={dc:0,first:1,second:2,mixed:3}[name];$('sh-degree').value=degree;
    selected=Math.min(selected,(degree+1)**2-1);updateSelectedControls();update();
  });
  function anglesChanged() {
    direction=directionFromAngles(Number($('sh-phi').value)*Math.PI/180,Number($('sh-theta').value)*Math.PI/180);update();
  }
  ['sh-phi','sh-theta'].forEach(id=>$(id).addEventListener('input',anglesChanged));
  $('sh-reverse').addEventListener('click',()=>{
    const phi=Number($('sh-phi').value);$('sh-phi').value=phi>0?phi-180:phi+180;
    $('sh-theta').value=180-Number($('sh-theta').value);anglesChanged();
  });
  for(let ch=0;ch<3;ch++) $('sh-a-'+ch).addEventListener('input',()=>{
    coefficients[selected][ch]=Number($('sh-a-'+ch).value);$('sh-preset').value='custom';update();
  });
  $('sh-zero').addEventListener('click',()=>{
    coefficients[selected]=[0,0,0];$('sh-preset').value='custom';updateSelectedControls();update();
  });
  addEventListener('math:languagechange',renderNumbers);
  $('sh-channel-mode').addEventListener('change',()=>{channelMode=$('sh-channel-mode').value;drawMain();});
  bindView('sh',[$('sh-selected-canvas'),$('sh-channel-0'),$('sh-channel-1'),$('sh-channel-2'),$('sh-color-canvas')],mainView,drawMain);
  updateSelectedControls();update({gallery:true});

  // Compute the projection only when its visual comparison approaches the view.
  let reconstructionDrawn=false,fit=null;
  function drawReconstruction() {
    if(!fit)return;
    drawPlot($('sh-reconstruction-target'),{color:(_,v)=>targetColor(v),camera:fitView});
    for(let L=0;L<=3;L++)drawPlot($('sh-reconstruction-'+L),{color:basis=>colorAt(basis,fit,L),camera:fitView});
  }
  function reconstruction() {
    if(reconstructionDrawn) return;
    reconstructionDrawn=true;
    fit=projectColor();const samples=sphereSamples(2048);
    for(let L=0;L<=3;L++) {
      let error=0;
      for(const v of samples) {
        const predicted=sampleSH(fit,v,L).shifted,truth=targetColor(v);
        for(let ch=0;ch<3;ch++) error+=(predicted[ch]-truth[ch])**2;
      }
      $('sh-error-'+L).textContent='RMSE '+Math.sqrt(error/(samples.length*3)).toFixed(5);
    }
    drawReconstruction();
  }
  bindView('sh-fit',[$('sh-reconstruction-target'),...[0,1,2,3].map(L=>$('sh-reconstruction-'+L))],fitView,drawReconstruction);
  const observer=new IntersectionObserver(entries=>{
    if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();reconstruction();}
  },{rootMargin:'500px'});
  observer.observe($('sh-reconstruction'));
  addEventListener('beforeprint',reconstruction);
}
