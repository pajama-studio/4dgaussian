export const CACHE_BYTES=64*1024*1024;
const selectedBytes=(m,start,end)=>m.chunks.filter(c=>c.start<=end&&c.end>=start).reduce((n,c)=>n+c.decodedBytes,0);
export function planWindow(m,time,budget=CACHE_BYTES) {
  const duration=m.durationSeconds;
  if(!Number.isFinite(time)||!Number.isFinite(duration)||duration<=0||time<0||time>duration)throw Error('Invalid playback time');
  if(selectedBytes(m,0,duration)<=budget)return {start:0,end:duration,mode:'resident'};
  // Use seconds, not one tiny fraction of a short clip. Reduce the window only
  // when the actual manifest says its records exceed the budget.
  let span=Math.min(duration,Math.max(2,duration/16));
  for(let attempt=0;attempt<24;attempt++,span/=2){
    const start=Math.floor(Math.min(time,duration-1e-10)/span)*span;
    const end=Math.min(duration,start+span*2);
    if(selectedBytes(m,start,end)<=budget)return {start,end,mode:'windowed'};
  }
  throw Error('The visible time slice exceeds the residency budget; this model needs smaller records or spatial LOD.');
}
export function covers(window,time){return !!window&&time>=window.start&&time<=window.end;}
export function upcoming(m,active,budget=CACHE_BYTES){
  if(active.mode==='resident')return null;
  const t=active.end>=m.durationSeconds-1e-9?0:Math.min(m.durationSeconds,active.end+1e-8);
  return planWindow(m,t,budget);
}
