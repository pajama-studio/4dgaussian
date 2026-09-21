import { blankCoefficients, sampleSH } from './math/sh.mjs';

export const fields=('x y z trbf_center trbf_scale nx ny nz '+
  'motion_0 motion_1 motion_2 motion_3 motion_4 motion_5 motion_6 motion_7 motion_8 '+
  'f_dc_0 f_dc_1 f_dc_2 opacity scale_0 scale_1 scale_2 rot_0 rot_1 rot_2 rot_3 '+
  'omega_0 omega_1 omega_2 omega_3').split(' ');

// The 42-float ABI is emitted by SplatProjection::pack in src/inspection.rs.
export function decodeProjection(values) {
  const a=Array.from(values);
  if(a.length!==42||!a.every(Number.isFinite)) return null;
  const axes=[a.slice(33,36),a.slice(36,39),a.slice(39,42)];
  const covariance=Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>
    axes.reduce((sum,axis)=>sum+axis[i]*axis[j],0)));
  return {time:a[0],mean:a.slice(1,4),opacity:a[4],rho:a[5],temporal:a[6],baseOpacity:a[7],
    scales:a.slice(8,11),quaternion:a.slice(11,15),uv:a.slice(15,17),screenCovariance:a.slice(17,20),
    sigmas:a.slice(20,22),major:a.slice(22,24),eye:a.slice(24,27),depth:a[27],visible:a[28]===1,
    viewport:a.slice(29,33),axes,covariance};
}

export function decodeHits(values) {
  const a=Array.from(values);
  if(a.length<4) return {total:0,hits:[]};
  if((a.length-4)%5!==0||!a.every(Number.isFinite)) throw new Error('Invalid picking response');
  const hits=[];
  for(let i=4;i<a.length;i+=5) hits.push({id:a[i],alpha:a[i+1],transmittance:a[i+2],weight:a[i+3],depth:a[i+4]});
  return {total:a[0],time:a[1],pixel:a.slice(2,4),hits};
}

export function recordColor(row) {return row.slice(17,20).map(v=>Math.max(0,Math.min(1,v)));}
export function appearanceCoefficients(row, teaching=false) {
  const a=blankCoefficients(recordColor(row));
  // Explicitly synthetic higher-degree terms, never attributed to the checkpoint.
  if(teaching) {a[2]=[0.40,-0.18,0.12];a[3]=[-0.22,0.15,0.30];a[6]=[0.14,0.24,-0.18];a[10]=[0.12,-0.16,0.08];}
  return a;
}
export function viewingDirection(state) {
  const d=state.mean.map((v,i)=>v-state.eye[i]),n=Math.hypot(...d);
  return n>1e-8?d.map(v=>v/n):[0,0,1];
}
export function sourceSnapshot(id,row,state,mode,coefficients,degree,direction) {
  return {schema:'pajama.gaussian-inspection.v1',source:'N3DV sear_steak / STG-Lite',
    sourceIndex:id,raw:Object.fromEntries(fields.map((field,i)=>[field,row[i]])),evaluated:state,
    appearance:{sourceFormat:'direct RGB; no learned SH coefficients',
      mode:mode==='teaching'?'synthetic SH experiment; does not modify scene':'equivalent DC derived from clamped RGB',
      coefficients,degree,direction,color:sampleSH(coefficients,direction,degree)},
    timeContract:'Normalized model time; UI 10-second loop is the existing viewer convention, not metadata from the PLY.'};
}
