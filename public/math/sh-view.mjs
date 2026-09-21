// A display camera only. SH directions, basis values, and coefficients stay in
// the original world frame; rotating this camera never rotates those inputs.
export function viewPreset(name='reset') {
  const angles={reset:[Math.atan2(-4,3),Math.atan2(2.4,5)],front:[-Math.PI/2,0],side:[0,0],top:[-Math.PI/2,Math.PI/2]};
  const [yaw,pitch]=angles[name]||angles.reset;
  return {yaw,pitch,zoom:1};
}

export function viewFrame({yaw,pitch}) {
  const c=Math.cos(yaw),s=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  // This frame remains well defined at the poles, including the top preset.
  return {right:[-s,c,0],up:[-sp*c,-sp*s,cp],eye:[cp*c,cp*s,sp]};
}

export function projectView(v,frame) {
  return [frame.right,frame.up,frame.eye].map(axis=>axis.reduce((sum,x,i)=>sum+x*v[i],0));
}

export function orbitView(state,dx,dy) {
  state.yaw=((state.yaw-dx*.01+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
  state.pitch=Math.max(-Math.PI/2,Math.min(Math.PI/2,state.pitch+dy*.01));
}
