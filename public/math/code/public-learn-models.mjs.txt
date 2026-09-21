// Pure arithmetic used by course controls and independent numerical checks.
export const sigmoid=x=>1/(1+Math.exp(-x));
export function kernel(x,scale,opacity=1){return opacity*Math.exp(-0.5*(x/scale)**2);}
export function cameraSample(x,z,f,scale=0.2){
 const u=64+f*x/z,j=[f/z,-f*x/(z*z)];
 return {u,variance:scale**2*(j[0]**2+j[1]**2)+0.3,width:Math.sqrt(scale**2*(j[0]**2+j[1]**2)+0.3)};
}
export function composite(a,b,reverse=false){
 const layers=reverse?[[b,[0,0,1],'B'],[a,[1,0,0],'A']]:[[a,[1,0,0],'A'],[b,[0,0,1],'B']];
 let remaining=1;const color=[0,0,0],weights=[];
 for(const [alpha,rgb,id] of layers){const weight=remaining*alpha;weights.push({id,weight});rgb.forEach((v,c)=>color[c]+=weight*v);remaining*=1-alpha;}
 const over=[0,0,0];for(const [alpha,rgb] of [...layers].reverse())rgb.forEach((v,c)=>over[c]=alpha*v+(1-alpha)*over[c]);
 return {color,over,weights,remaining};
}
export function scalarGradient(beta,rate=1){
 const c=.8,target=.6,alpha=sigmoid(beta),prediction=c*alpha,loss=(prediction-target)**2;
 const gradient=2*(prediction-target)*c*alpha*(1-alpha),next=beta-rate*gradient;
 const lossAt=x=>(c*sigmoid(x)-target)**2,epsilon=1e-4;
 return {alpha,prediction,loss,gradient,next,nextLoss:lossAt(next),finite:(lossAt(beta+epsilon)-lossAt(beta-epsilon))/(2*epsilon)};
}
export function duplication(alpha){return {unchanged:1-(1-alpha)**2,halved:1-(1-alpha/2)**2,child:1-Math.sqrt(1-alpha),preserved:alpha};}
export function resizeSample(r,wrong=false){return {focal:wrong?600:600*r,principal:400*r,expected:460*r,actual:(wrong?600:600*r)*.1+400*r};}
export function memoryBudget(count,visible,fps){return {records:count*128,indices:count*visible*4,perSecond:count*visible*4*fps};}
