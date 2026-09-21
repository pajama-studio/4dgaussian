import { shBasis, directionFromAngles, unitDirection } from './math/sh.mjs';
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const camera=unitDirection([3,-4,2.4]),right=[0.8,0.6,0];
const up=[-camera[2]*0.6,camera[2]*0.8,camera[0]*0.6-camera[1]*0.8];
const transform=v=>[dot(v,right),dot(v,up),dot(v,camera)];
function orbitTransform(view,[yaw,pitch]) {
  const [x,y,z]=view,c=Math.cos(yaw),s=Math.sin(yaw),c2=Math.cos(pitch),s2=Math.sin(pitch);
  const rx=c*x+s*z,rz=-s*x+c*z;
  return [rx,c2*y-s2*rz,s2*y+c2*rz];
}
const points=[],faces=[],lat=24,lon=48;
for(let i=0;i<=lat;i++) for(let j=0;j<=lon;j++) {
  const v=directionFromAngles(j/lon*2*Math.PI,i/lat*Math.PI);
  points.push({v,view:transform(v),basis:shBasis(v)});
}
for(let i=0;i<lat;i++) for(let j=0;j<lon;j++) {
  const a=i*(lon+1)+j,b=a+lon+1;
  for(const ids of [[a,b,a+1],[a+1,b,b+1]]) {
    const v=unitDirection([0,1,2].map(ch=>ids.reduce((sum,k)=>sum+points[k].v[ch],0)));
    faces.push({ids,v,basis:shBasis(v),view:transform(v)});
  }
}
const max=Array.from({length:16},(_,k)=>Math.max(...points.map(p=>Math.abs(p.basis[k]))));
const clip=v=>Math.max(0,Math.min(1,v));

export function drawSH(canvas,{basisIndex=null,coefficients=null,degree=3,direction=null,orbit=[0,0]}={}) {
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,s=Math.min(w,h)*0.39;
  ctx.clearRect(0,0,w,h);
  const positions=points.map(p=>{
    const r=basisIndex===null?1:Math.abs(p.basis[basisIndex])/max[basisIndex];
    const view=orbitTransform(p.view,orbit);
    return [w/2+s*r*view[0],h/2-s*r*view[1],r*view[2]];
  });
  const sorted=faces.map(f=>({f,z:f.ids.reduce((sum,k)=>sum+positions[k][2],0)})).sort((a,b)=>a.z-b.z);
  for(const {f} of sorted) {
    const faceDepth=orbitTransform(f.view,orbit)[2];
    if(basisIndex===null&&faceDepth<-0.03) continue;
    let rgb;
    if(coefficients) rgb=[0,1,2].map(ch=>255*clip(f.basis.slice(0,(degree+1)**2).reduce((v,y,k)=>v+y*coefficients[k][ch],0.5)));
    else {const value=f.basis[basisIndex]/max[basisIndex],base=value>=0?[243,170,93]:[90,162,246];
      const mix=Math.min(1,Math.abs(value)*2),light=0.8+0.2*Math.max(0,faceDepth);rgb=base.map(v=>(v*mix+100*(1-mix))*light);}
    ctx.fillStyle='rgb('+rgb.map(Math.round).join(',')+')';ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=0.6;
    ctx.beginPath();f.ids.forEach((k,i)=>i?ctx.lineTo(...positions[k].slice(0,2)):ctx.moveTo(...positions[k].slice(0,2)));ctx.closePath();ctx.fill();ctx.stroke();
  }
  if(direction) {
    const p=orbitTransform(transform(direction),orbit),r=basisIndex===null?1:Math.abs(shBasis(direction)[basisIndex])/max[basisIndex];
    ctx.setLineDash(p[2]<0?[3,3]:[]);ctx.strokeStyle='white';ctx.fillStyle='#100d14';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(w/2+s*r*p[0],h/2-s*r*p[1],4,0,2*Math.PI);ctx.fill();ctx.stroke();ctx.setLineDash([]);
  }
}

export function drawGeometry(canvas,state,color,orbit=[0,0]) {
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  ctx.clearRect(0,0,w,h);
  const maxScale=Math.max(...state.scales,1e-10),size=Math.min(w,h)*0.36;
  const project=v=>{const p=orbitTransform(transform(v),orbit);return [w/2+p[0]*size,h/2-p[1]*size];};
  const local=v=>[0,1,2].map(ch=>state.axes.reduce((s,axis,k)=>s+axis[ch]*v[k]/maxScale,0));
  // This isolated view normalizes the longest 1-sigma radius, retaining ratios
  // and world orientation. It is not the footprint in the scene viewport.
  ctx.strokeStyle='rgba('+color.map(v=>Math.round(v*255)).join(',')+',0.64)';ctx.lineWidth=1.2;
  for(let i=1;i<12;i++) {
    ctx.beginPath();for(let j=0;j<=64;j++){const p=project(local(directionFromAngles(j/64*2*Math.PI,i/12*Math.PI)));j?ctx.lineTo(...p):ctx.moveTo(...p);}ctx.stroke();
  }
  for(let j=0;j<12;j++) {
    ctx.beginPath();for(let i=0;i<=48;i++){const p=project(local(directionFromAngles(j/12*2*Math.PI,i/48*Math.PI)));i?ctx.lineTo(...p):ctx.moveTo(...p);}ctx.stroke();
  }
  const colors=['#f3aa5d','#c4db22','#9b93ff'];
  for(let i=0;i<3;i++) {
    const p=project(state.axes[i].map(v=>v/maxScale));ctx.strokeStyle=colors[i];ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(w/2,h/2);ctx.lineTo(...p);ctx.stroke();
    ctx.fillStyle=colors[i];ctx.font='12px monospace';ctx.fillText('s'+(i+1),p[0]+5,p[1]-5);
  }
}

export function drawTemporal(canvas,row,time) {
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,rho=Math.max(Math.exp(row[4]),1e-6);
  const y=t=>h-12-Math.exp(-(((t-row[3])/rho)**2))*(h-25);
  ctx.clearRect(0,0,w,h);ctx.strokeStyle='#73617f';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(8,h-12);ctx.lineTo(w-8,h-12);ctx.stroke();
  ctx.strokeStyle='#b78aef';ctx.lineWidth=2;ctx.beginPath();for(let i=0;i<=200;i++){const x=8+i/200*(w-16);i?ctx.lineTo(x,y(i/200)):ctx.moveTo(x,y(0));}ctx.stroke();
  const x=8+time*(w-16);ctx.strokeStyle='#c4db22';ctx.beginPath();ctx.moveTo(x,5);ctx.lineTo(x,h-7);ctx.stroke();ctx.fillStyle='#c4db22';ctx.beginPath();ctx.arc(x,y(time),3,0,2*Math.PI);ctx.fill();
}

export function drawSelection(canvas,state,id,sceneWidth,sceneHeight) {
  if(canvas.width!==sceneWidth||canvas.height!==sceneHeight){canvas.width=sceneWidth;canvas.height=sceneHeight;}
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
  if(!state?.visible) return;
  const [vx,vy,vw,vh]=state.viewport;
  ctx.save();ctx.beginPath();ctx.rect(vx,vy,vw,vh);ctx.clip();
  const [x,y]=state.uv,angle=-Math.atan2(state.major[1],state.major[0]);
  ctx.strokeStyle='#d7f531';ctx.lineWidth=Math.max(1.5,sceneWidth/canvas.clientWidth*1.4);
  for(const radius of [1,3]) {ctx.setLineDash(radius===3?[5,4]:[]);ctx.beginPath();ctx.ellipse(x,y,state.sigmas[0]*radius,state.sigmas[1]*radius,angle,0,2*Math.PI);ctx.stroke();}
  ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(x-6,y);ctx.lineTo(x+6,y);ctx.moveTo(x,y-6);ctx.lineTo(x,y+6);ctx.stroke();
  ctx.font='12px ui-monospace,monospace';const label='#'+id;const labelX=Math.max(vx+4,Math.min(x+12,vx+vw-80));const labelY=Math.max(vy+20,Math.min(y-12,vy+vh-5));
  ctx.fillStyle='#10100de6';ctx.fillRect(labelX-4,labelY-14,ctx.measureText(label).width+8,20);ctx.fillStyle='#eaff8a';ctx.fillText(label,labelX,labelY);ctx.restore();
}
