import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { parse } from 'parse5';
import { lessons } from './learn/course.mjs';
import { kernel,cameraSample,composite,scalarGradient,duplication,resizeSample,memoryBudget } from '../public/learn/models.mjs';
const root=new URL('../public/',import.meta.url),close=(a,b,tol=1e-10)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
const walk=(node,fn)=>{fn(node);for(const child of node.childNodes??[])walk(child,fn);};
const attr=(n,k)=>n.attrs?.find(a=>a.name===k)?.value;
const textOf=node=>node.nodeName==='#text'?node.value:(node.childNodes??[]).map(textOf).join('');
const idsByPage=new Map();
async function page(path){if(idsByPage.has(path))return idsByPage.get(path);const dom=parse(await readFile(new URL(path,root),'utf8')),ids=new Set();walk(dom,n=>{const id=attr(n,'id');if(id){assert.ok(!ids.has(id),`Duplicate ${id} in ${path}`);ids.add(id);}});const result={ids,dom};idsByPage.set(path,result);return result;}
assert.equal(lessons.length,12);assert.equal(new Set(lessons.map(l=>l.id)).size,12);
for(const l of lessons){
 assert.ok(l.steps.length>=5&&l.quizzes.length&&l.code.length);
 const bilingual=[l.title,l.goal,l.hook,l.worked,l.pitfall,l.task,...l.steps.flatMap(s=>[s.title,s.body]),...l.quizzes.flatMap(q=>[q.question,...q.choices,...q.feedback])];
 for(const p of bilingual){assert.ok(p.en?.trim()&&p.zh?.trim(),`Missing bilingual content ${l.id}`);assert.ok(!/\p{Script=Han}/u.test(p.en),`Chinese in English ${l.id}`);}
 for(const q of l.quizzes){assert.ok(q.answer>=0&&q.answer<q.choices.length);assert.equal(q.choices.length,q.feedback.length);}
}
const paths=['learn/index.html',...lessons.map(l=>'learn/'+l.id+'/index.html')];let links=0,pairs=0;
for(const path of paths){const {dom}=await page(path),pending=[];
 walk(dom,n=>{
  if(attr(n,'data-copy')){pairs++;if(attr(n,'data-copy')==='zh')assert.ok(n.attrs.some(a=>a.name==='hidden'));if(attr(n,'data-copy')==='en')assert.ok(!/\p{Script=Han}/u.test(textOf(n)),path);}
  const href=attr(n,'href')??attr(n,'src');if(!href||!href.startsWith('/'))return;
  pending.push((async()=>{const url=new URL(href,'https://local.test');let file=url.pathname.slice(1);if(!file||file.endsWith('/'))file+='index.html';assert.ok((await stat(new URL(file,root))).isFile(),`Missing ${href}`);if(url.hash&&file.endsWith('.html'))assert.ok((await page(file)).ids.has(decodeURIComponent(url.hash.slice(1))),`Missing anchor ${href}`);links++;})());
 });await Promise.all(pending);
}
close(kernel(0,2),1);close(kernel(2,2),Math.exp(-.5));close(kernel(2,1),Math.exp(-2));
close(cameraSample(0,10,100).width,Math.sqrt(4.3));close(cameraSample(1,10,100).u,74);
for(const a of [0,.2,.5,1])for(const b of [0,.4,.9,1])for(const reverse of [false,true]){
 const r=composite(a,b,reverse);r.color.forEach((v,i)=>close(v,r.over[i]));close(r.weights.reduce((s,w)=>s+w.weight,0)+r.remaining,1);
}
for(const beta of [-4,-1,0,1,4]){const r=scalarGradient(beta);close(r.gradient,r.finite,1e-8);assert.ok(r.nextLoss<=r.loss+1e-12);}
close(scalarGradient(0).gradient,-.08);close(duplication(.5).unchanged,.75);close(duplication(.5).halved,.4375);
for(const a of [0,.1,.5,.9,1])close(1-(1-duplication(a).child)**2,a);
close(resizeSample(.5).actual,230);close(resizeSample(.5,true).actual,260);close(memoryBudget(108317,1,60).records,13864576);
console.log(`PASS: 12 bilingual lessons, 60 explanatory steps, ${pairs} localized fragments, ${links} local links/assets, alpha traversal equivalence, perspective, finite-difference gradient, duplication and byte-budget arithmetic.`);
