import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { shBasis, unitDirection, directionFromAngles, sampleSH, blankCoefficients,
  presetCoefficients, sphereSamples, projectColor, targetColor } from '../public/math/sh.mjs';
import { viewPreset, viewFrame, projectView, orbitView } from '../public/math/sh-view.mjs';

// Independent associated-Legendre recurrence, not the evaluator's Cartesian
// polynomials. It verifies normalization, signs, ordering, and all 16 terms.
const factorial=n=>n<2?1:n*factorial(n-1);
function legendre(l,m,z) {
  let pmm=1;
  for(let k=1;k<=m;k++) pmm*=-(2*k-1)*Math.sqrt(Math.max(0,1-z*z));
  if(l===m) return pmm;
  let before=pmm,current=z*(2*m+1)*pmm;
  for(let k=m+2;k<=l;k++) [before,current]=[current,((2*k-1)*z*current-(k+m-1)*before)/(k-m)];
  return current;
}
function independent(v) {
  const [x,y,z]=unitDirection(v),phi=Math.atan2(y,x),result=[];
  for(let l=0;l<=3;l++) for(let m=-l;m<=l;m++) {
    const a=Math.abs(m),N=Math.sqrt((2*l+1)/(4*Math.PI)*factorial(l-a)/factorial(l+a));
    result.push(N*legendre(l,a,z)*(m===0?1:Math.sqrt(2)*(m<0?Math.sin(a*phi):Math.cos(a*phi))));
  }
  return result;
}
const close=(a,b,eps=1e-11)=>assert.ok(Math.abs(a-b)<=eps,`${a} != ${b}`);
// Independent geometric invariants for the display camera, including pole views.
const closeVector=(a,b)=>a.forEach((x,i)=>close(x,b[i]));
closeVector(projectView([1,0,0],viewFrame(viewPreset('front'))),[1,0,0]);
closeVector(projectView([0,-1,0],viewFrame(viewPreset('front'))),[0,0,1]);
closeVector(projectView([1,0,0],viewFrame(viewPreset('side'))),[0,0,1]);
closeVector(projectView([0,1,0],viewFrame(viewPreset('top'))),[0,1,0]);
closeVector(projectView([0,0,1],viewFrame(viewPreset('top'))),[0,0,1]);
closeVector(projectView(unitDirection([3,-4,2.4]),viewFrame(viewPreset())),[0,0,1]);
for(const name of ['reset','front','side','top']) {
  const state=viewPreset(name);orbitView(state,913,-628);
  const frame=viewFrame(state);
  for(const v of [[2,-3,4],[0,0,1],[-4,.2,1]])close(Math.hypot(...projectView(v,frame)),Math.hypot(...v));
  closeVector(projectView(frame.eye,frame),[0,0,1]);
  close(state.zoom,1);
}
const turn=viewPreset();orbitView(turn,Math.PI*200,0);close(turn.yaw,viewPreset().yaw);
const cases=[[1,0,0],[0,1,0],[0,0,1],[0,0,-1],[2,-2,1],...sphereSamples(137)];
let recurrenceError=0;
for(const v of cases) {
  const expected=independent(v),actual=shBasis(v),opposite=shBasis(v.map(x=>-x));
  actual.forEach((value,k)=>{
    recurrenceError=Math.max(recurrenceError,Math.abs(value-expected[k]));close(value,expected[k]);
    close(opposite[k],(-1)**Math.floor(Math.sqrt(k))*value);
  });
  for(let L=0;L<=3;L++) assert.equal(shBasis(v,L).length,(L+1)**2);
}
assert.throws(()=>shBasis([0,0,0]),RangeError);
assert.throws(()=>shBasis([Infinity,0,1]),RangeError);
assert.throws(()=>shBasis([1,0,0],4),RangeError);
assert.throws(()=>shBasis([1,0,0],1.5),RangeError);
assert.throws(()=>sampleSH([[0,0,0]],[0,0,1],3),RangeError);
close(Math.hypot(...directionFromAngles(0.8,1.2)),1);

const N=32768,gram=Array.from({length:16},()=>Array(16).fill(0));
for(const v of sphereSamples(N)) {
  const b=shBasis(v);
  for(let i=0;i<16;i++) for(let j=0;j<=i;j++) gram[i][j]+=b[i]*b[j]*4*Math.PI/N;
}
let orthogonalityError=0;
for(let i=0;i<16;i++) for(let j=0;j<=i;j++) {
  const error=Math.abs(gram[i][j]-(i===j?1:0));orthogonalityError=Math.max(orthogonalityError,error);
  assert.ok(error<0.00001,'Spherical orthonormality: '+i+','+j+' error '+error);
}
const constant=blankCoefficients([0.8,0.4,0.2]);
for(const v of cases) sampleSH(constant,v).shaderColor.forEach((x,i)=>close(x,[0.8,0.4,0.2][i]));
const example=blankCoefficients();example[0][0]=0.4;example[2][0]=0.6;
close(sampleSH(example,[0,0,1],1).shaderColor[0],0.9059994238509032,1e-8);
const extremes=sampleSH(blankCoefficients([1.8,-0.4,0.5]),[0,0,1]);
close(extremes.shaderColor[0],1.8);close(extremes.display[0],1);close(extremes.shaderColor[1],0);
const a=presetCoefficients('mixed'),v=unitDirection([2,-2,1]),base=sampleSH(a,v,3);
base.raw.forEach((x,ch)=>close(x,base.contributions.reduce((s,c)=>s+c[ch],0)));
// Changing one channel's coefficient must not leak into the other channels.
// Include excluded terms: keeping their coefficients must not affect low-degree sums.
for(let L=0;L<=3;L++) for(let ch=0;ch<3;ch++) for(const k of [0,2,6,15]) {
  const before=sampleSH(a,v,L),changed=structuredClone(a),delta=0.125;
  changed[k][ch]+=delta;
  const after=sampleSH(changed,v,L);
  assert.deepEqual(after.basis,before.basis);
  for(let other=0;other<3;other++) {
    const expected=other===ch&&k<before.basis.length?delta*before.basis[k]:0;
    close(after.raw[other]-before.raw[other],expected);
    if(other!==ch) {
      close(after.shifted[other],before.shifted[other]);
      close(after.display[other],before.display[other]);
    }
  }
}
let gradientError=0;
for(let k=0;k<16;k++) {
  const plus=structuredClone(a),minus=structuredClone(a),h=1e-5;
  plus[k][0]+=h;minus[k][0]-=h;
  const loss=coeff=>0.5*(sampleSH(coeff,v).shifted[0]-0.8)**2;
  const numeric=(loss(plus)-loss(minus))/(2*h),analytic=(base.shifted[0]-0.8)*base.basis[k];
  gradientError=Math.max(gradientError,Math.abs(numeric-analytic));close(numeric,analytic,1e-9);
}
const projected=projectColor(()=>[0.8,0.4,0.2],3,32768);
projected[0].forEach((x,ch)=>close(x,constant[0][ch],1e-10));
projected.slice(1).flat().forEach(x=>close(x,0,0.00001));
const known=projectColor(v=>sampleSH(a,v).shifted,3,32768);
known.flat().forEach((x,i)=>close(x,a.flat()[i],0.00001));
const fit=projectColor(),rmse=[];
for(let L=0;L<=3;L++) {
  let sum=0;for(const v of sphereSamples(2048)) {
    const c=sampleSH(fit,v,L).shifted,target=targetColor(v);
    sum+=c.reduce((s,x,ch)=>s+(x-target[ch])**2,0);
  }
  rmse.push(Math.sqrt(sum/(2048*3)));
}
for(let L=1;L<=3;L++) assert.ok(rmse[L]<rmse[L-1]);
const report={status:'pass',recurrenceCases:cases.length,recurrenceError,orthogonalitySamples:N,
  orthogonalityError,gradientError,reconstructionRMSE:rmse,
  note:'Independent Legendre recurrence, numerical sphere integrals, known-function coefficient recovery, finite differences; browser visuals checked separately.'};
await mkdir(new URL('../artifacts/math/',import.meta.url),{recursive:true});
await writeFile(new URL('../artifacts/math/sh-checks.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log('PASS: SH degrees 0–3 against independent Legendre recurrence; 136 Gram entries; parity/poles/DC/clipping; coefficient recovery and 16 gradients.');
console.log(JSON.stringify(report));
