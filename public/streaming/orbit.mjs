const add=(a,b)=>a.map((x,i)=>x+b[i]),scale=(a,s)=>a.map(x=>x*s);
const dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>scale(a,1/Math.max(1e-12,Math.hypot(...a)));
export class OrbitCamera {
  constructor(record,center){this.record=record;this.center=center;this.reset();}
  reset(){
    const c=this.record,r=c.rotation;
    this.forward=norm([r[0][2],r[1][2],r[2][2]]);
    this.baseUp=norm([-r[0][1],-r[1][1],-r[2][1]]);
    this.right=norm(cross(this.forward,this.baseUp));
    this.baseDistance=Math.max(.1,dot(add(this.center,scale(c.position,-1)),this.forward));
    this.distance=this.baseDistance;this.target=add(c.position,scale(this.forward,this.distance));
    this.yaw=0;this.pitch=0;this.changed=false;return this;
  }
  rotate(dx,dy){this.yaw+=dx;this.pitch=Math.max(-1.52,Math.min(1.52,this.pitch+dy));this.changed=true;}
  zoom(delta){this.distance=Math.max(this.baseDistance*.025,Math.min(this.baseDistance*30,this.distance*Math.exp(delta)));this.changed=true;}
  pan(dx,dy){const v=this.value(),f=Array.from(v.slice(3,6)),up=Array.from(v.slice(6,9)),right=norm(cross(f,up));this.target=add(this.target,add(scale(right,dx*this.distance),scale(up,dy*this.distance)));this.changed=true;}
  value(){
    const c=this.record,cp=Math.cos(this.pitch);
    const f=norm(add(add(scale(this.forward,cp*Math.cos(this.yaw)),scale(this.right,cp*Math.sin(this.yaw))),scale(this.baseUp,Math.sin(this.pitch))));
    const up=norm(cross(norm(cross(f,this.baseUp)),f));
    return new Float32Array([...add(this.target,scale(f,-this.distance)),...f,...up,2*Math.atan(c.height/(2*c.fy)),c.width,c.height]);
  }
}
export function bindOrbit(canvas,getCamera,onChange,enabled=()=>true){
  const pointers=new Map();let gesture;
  function snapshot(){const p=[...pointers.values()];return p.length>1?{x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2,d:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)}:null;}
  canvas.addEventListener('pointerdown',e=>{if(!enabled()||!getCamera())return;canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,pan:e.button!==0||e.shiftKey});gesture=snapshot();canvas.classList.add('dragging');});
  canvas.addEventListener('pointermove',e=>{
    const old=pointers.get(e.pointerId),camera=getCamera();if(!old||!camera||!enabled())return;
    pointers.set(e.pointerId,{...old,x:e.clientX,y:e.clientY});
    if(pointers.size>1){const next=snapshot();if(gesture){camera.pan(-(next.x-gesture.x)/canvas.clientHeight,(next.y-gesture.y)/canvas.clientHeight);if(gesture.d>2&&next.d>2)camera.zoom(Math.log(gesture.d/next.d));}gesture=next;}
    else if(old.pan)camera.pan(-(e.clientX-old.x)/canvas.clientHeight,(e.clientY-old.y)/canvas.clientHeight);
    else camera.rotate(-(e.clientX-old.x)*.006,(e.clientY-old.y)*.006);
    onChange();
  });
  const end=e=>{pointers.delete(e.pointerId);gesture=snapshot();if(!pointers.size)canvas.classList.remove('dragging');};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,end);
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('wheel',e=>{if(!enabled()||!getCamera())return;e.preventDefault();getCamera().zoom(Math.max(-.5,Math.min(.5,e.deltaY*.001)));onChange();},{passive:false});
  canvas.addEventListener('keydown',e=>{
    const c=getCamera();if(!enabled()||!c)return;
    if(e.key==='ArrowLeft')c.rotate(.08,0);else if(e.key==='ArrowRight')c.rotate(-.08,0);else if(e.key==='ArrowUp')c.rotate(0,-.08);else if(e.key==='ArrowDown')c.rotate(0,.08);else if(e.key==='+'||e.key==='=')c.zoom(-.12);else if(e.key==='-')c.zoom(.12);else if(e.key==='Home')c.reset();else return;
    e.preventDefault();onChange();
  });
}
