import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parse} from 'parse5';
import {chapters,papers,resources} from './relight-content.mjs';
const root=new URL('../public/',import.meta.url),cache=new Map();
const attr=(n,k)=>n.attrs?.find(a=>a.name===k)?.value;
const walk=(n,f)=>{f(n);for(const c of n.childNodes??[])walk(c,f);};
const text=n=>n.nodeName==='#text'?n.value:(n.childNodes??[]).map(text).join('');
async function page(file){
 if(cache.has(file))return cache.get(file);
 const dom=parse(await readFile(new URL(file,root),'utf8')),ids=new Set();
 walk(dom,n=>{const id=attr(n,'id');if(id){assert.ok(!ids.has(id),'Duplicate ID '+file+':'+id);ids.add(id);}});
 const p={dom,ids};cache.set(file,p);return p;
}
assert.equal(chapters.length,8);assert.equal(papers.length,7);assert.equal(resources.length,5);
for(const c of chapters)for(const b of [c.title,c.goal,c.task,c.answer,...c.sections.flatMap(s=>[s.title,...s.paragraphs])]){
 assert.ok(b.en.trim()&&b.zh.trim());assert.ok(!/\p{Script=Han}/u.test(b.en),'Chinese in English: '+c.id);
}
let links=0,formulas=0;
for(const file of ['relight/index.html','relight/lab/index.html',...chapters.map(c=>'relight/'+c.id+'/index.html')]){
 const {dom}=await page(file),jobs=[];
 walk(dom,n=>{
  if(n.tagName==='math')formulas++;
  if(attr(n,'data-copy')==='zh')assert.ok(n.attrs.some(a=>a.name==='hidden'));
  const url=attr(n,'href')??attr(n,'src');if(!url||(!url.startsWith('/')&&!url.startsWith('#')))return;
  jobs.push((async()=>{
   const u=new URL(url,'https://local.test/'+file);let target=u.pathname.slice(1);if(target.endsWith('/')||!target)target+='index.html';
   assert.ok((await stat(new URL(target,root))).isFile(),'Missing '+url);
   if(u.hash&&target.endsWith('.html'))assert.ok((await page(target)).ids.has(decodeURIComponent(u.hash.slice(1))),'Missing anchor '+url);
   links++;
  })());
 });await Promise.all(jobs);
}
assert.ok(formulas>=13);
const manifest=JSON.parse(await readFile(new URL('relight/manifest.json',root),'utf8'));
for(const s of manifest.sources){
 const raw=(await readFile(new URL('../'+s.file,root),'utf8')).replaceAll('\r\n','\n');
 assert.equal(s.sha256,createHash('sha256').update(raw).digest('hex'));
 assert.equal(await readFile(new URL('relight/code/'+s.slug+'.txt',root),'utf8'),raw);
}
const consumers=['app.js','docs/stg-sample.js','build/lab.mjs','relight/lab.mjs'];
for(const file of consumers){const raw=await readFile(new URL(file,root),'utf8');assert.ok(raw.includes('.js?v=stream-2')&&raw.includes('.wasm?v=stream-2'),'Mismatched wasm cache version '+file);}
console.log('PASS: 8 bilingual relighting lessons, '+formulas+' MathML equations, '+links+' internal links/assets, 6 matching source snapshots, shared WASM versions.');
