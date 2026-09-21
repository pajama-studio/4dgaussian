import init,{WorkshopRenderer} from '/pkg/pajama_gaussian_lab.js?v=relight-1';
const $=id=>document.getElementById(id),canvas=$('relight-view');
const ids=['azimuth','elevation','intensity','roughness','metallic','time','yaw'];
const defaults={azimuth:-.6,elevation:.5,intensity:3,roughness:.4,metallic:0,time:0,yaw:0};
const state={...defaults,mode:0,wrong:false};
const zh=()=>document.documentElement.lang==='zh-CN';
const say=(en,cn)=>zh()?cn:en;
let renderer,ready=false,failed=false,dirty=true,scheduled=false,playing=false,last=0,presented=0,preset='light',adapter='';
const lessons={
 light:['Keep the camera still and move Azimuth. Then select Base color: illumination disappears from this material-only view. Return to Combined to see the light again.','相机不动，调整光源方位角。再选基础色：材质视图不包含光照。切回合成结果，重新看到光照变化。','02-count-the-light'],
 material:['At metallic = 1, Diffuse only is black and Specular only contains the entire reflected response. Change roughness to spread or concentrate the highlight.','金属度为 1 时，仅漫反射是黑色；仅镜面反射包含全部反射响应。改变粗糙度，观察高光变宽或集中。','03-a-moving-highlight'],
 deform:['Pause at time 0.25, where the shape is stretched. Toggle the wrong normal transform, then inspect World normals. Positions stay fixed but normals, shading and backface rejection can change.','在形变较强的时间 0.25 暂停。切换错误法线变换，再查看世界法线。点的位置保持不动，法线、着色与背面剔除却可能改变。','07-moving-normals']
};
function copy(){
 canvas.setAttribute('aria-label',say('Gaussian relighting viewport. Drag horizontally or use left/right arrow keys to orbit. Home resets the camera.','Gaussian 重打光视图。水平拖拽或使用左右方向键绕转，Home 重置相机。'));
 const note=lessons[preset];$('experiment-note').textContent=note[zh()?1:0];
 $('explain-link').href='/relight/'+note[2]+'/?lang='+(zh()?'zh':'en');
 $('play').textContent=say(playing?'Pause deformation':'Play deformation',playing?'暂停形变':'播放形变');
 $('play').setAttribute('aria-pressed',String(playing));
 $('normal-warning').textContent=state.wrong?say('Intentional error active: using A·n instead of inverse-transpose.','已启用故意错误：使用 A·n，而非逆转置。'):say('Normals use inverse-transpose of the current deformation.','法线使用当前形变的逆转置。');
 $('mode-note').textContent=state.mode===3?say('Normals: RGB encodes (n + 1)/2, then display conversion. These colors are directions, not the material.','法线：RGB 编码 (n + 1)/2，再做显示转换。这些颜色代表方向，不是材质。'):state.mode===4?say('Base color: light-independent linear material values, sRGB encoded for display. No tone mapping in this debug mode.','基础色：与光照无关的线性材质值，显示时编码为 sRGB。此调试模式不做色调映射。'):say('Linear reflected light is alpha-composited, tone-mapped, then sRGB encoded. Diffuse/specular screenshots do not add up directly after nonlinear display mapping.','线性反射光先 alpha 合成，再色调映射、编码 sRGB。由于非线性显示映射，漫反射和镜面反射的截图不能直接相加。');
 if(ready&&!failed)$('gpu-status').textContent=say('Ready','就绪')+' · '+adapter+' · 1,536 surfels · '+canvas.width+' × '+canvas.height+' · '+presented+say(' frames',' 帧');
 if(failed)$('gpu-status').textContent=say('GPU unavailable. See recovery options below.','GPU 不可用，请查看下方恢复选项。');
 for(const b of document.querySelectorAll('[data-preset]'))b.setAttribute('aria-pressed',String(b.dataset.preset===preset));
}
function sync(){for(const id of ids){$(id).value=state[id];$(id+'-value').value=Number(state[id]).toFixed(id==='time'?3:2);}$('mode').value=state.mode;$('wrong-normals').checked=state.wrong;copy();}
function request(){dirty=true;if(!scheduled&&ready&&!failed){scheduled=true;requestAnimationFrame(draw);}}
function error(e){failed=true;playing=false;$('recovery').hidden=false;copy();console.error('Relighting lab:',e);}
function draw(now){
 scheduled=false;if(failed||!ready)return;
 if(playing){if(last)state.time=(state.time+Math.min((now-last)/1000,.1)/10)%1;dirty=true;sync();}last=now;
 if(dirty){
  try{
   const shown=renderer.renderRelight(state.azimuth,state.elevation,state.intensity,state.roughness,state.metallic,state.time,state.yaw,state.mode,state.wrong);
   dirty=!shown;if(shown)presented++;copy();
  }catch(e){error(e);return;}
 }
 if(playing||dirty){scheduled=true;requestAnimationFrame(draw);}
}
function resize(){
 if(!renderer)return;
 const box=canvas.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,1.5);
 const w=Math.max(1,Math.min(1600,Math.round(box.width*ratio))),h=Math.max(1,Math.min(1200,Math.round(box.height*ratio)));
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;renderer.resize(w,h);request();}
}
for(const id of ids)$(id).addEventListener('input',()=>{state[id]=Number($(id).value);if(id==='time'){playing=false;last=0;}sync();request();});
$('mode').onchange=()=>{state.mode=Number($('mode').value);copy();request();};
$('wrong-normals').onchange=()=>{state.wrong=$('wrong-normals').checked;copy();request();};
$('play').onclick=()=>{playing=!playing;last=0;copy();request();};
function setPreset(name){
 Object.assign(state,defaults,{mode:0,wrong:false});playing=false;last=0;preset=name;
 if(name==='material'){state.metallic=1;state.roughness=.25;}
 if(name==='deform'){state.time=.25;state.roughness=.55;}
 sync();request();
}
for(const b of document.querySelectorAll('[data-preset]'))b.onclick=()=>setPreset(b.dataset.preset);
$('reset').onclick=()=>setPreset('light');
$('retry').onclick=()=>location.reload();
let drag=null;
canvas.onpointerdown=e=>{if(e.button!==0)return;drag={x:e.clientX,yaw:state.yaw};canvas.setPointerCapture(e.pointerId);};
canvas.onpointermove=e=>{if(!drag)return;state.yaw=Math.max(-3.14,Math.min(3.14,drag.yaw+(e.clientX-drag.x)*.008));sync();request();};
canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=()=>{drag=null;};
canvas.onkeydown=e=>{
 if(!['ArrowLeft','ArrowRight','Home'].includes(e.key))return;e.preventDefault();
 state.yaw=e.key==='Home'?0:Math.max(-3.14,Math.min(3.14,state.yaw+(e.key==='ArrowLeft'?-.1:.1)));sync();request();
};
document.addEventListener('visibilitychange',()=>{if(document.hidden){playing=false;last=0;copy();}});
document.addEventListener('relight-language',copy);
const lesson=Number(new URL(location.href).searchParams.get('lesson'));
setPreset(lesson===3?'material':lesson===7?'deform':'light');
try{
 if(!navigator.gpu)throw Error('This browser does not expose WebGPU');
 await init({module_or_path:'/pkg/pajama_gaussian_lab_bg.wasm?v=relight-1'});
 renderer=await WorkshopRenderer.create(canvas);adapter=renderer.adapter().replace(/·\s*$/,'').trim();ready=true;
 resize();new ResizeObserver(resize).observe(canvas);window.addEventListener('resize',resize);request();copy();
}catch(e){error(e);}
