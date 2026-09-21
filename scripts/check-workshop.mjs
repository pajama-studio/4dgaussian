import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parse } from 'parse5';
import { posts, milestones } from './build/posts.mjs';
const root = new URL('../public/',import.meta.url), cache = new Map();
const attr = (n,k)=>n.attrs?.find(a=>a.name===k)?.value;
const walk = (n,f)=>{f(n);for(const c of n.childNodes??[])walk(c,f);};
const text = n=>n.nodeName==='#text'?n.value:(n.childNodes??[]).map(text).join('');
async function page(file) {
 if(cache.has(file)) return cache.get(file);
 const dom=parse(await readFile(new URL(file,root),'utf8')),ids=new Set();
 walk(dom,n=>{const id=attr(n,'id');if(id){assert.ok(!ids.has(id),`Duplicate ID ${file}:${id}`);ids.add(id);}});
 const value={dom,ids};cache.set(file,value);return value;
}
assert.equal(posts.length,12);assert.equal(milestones.length,8);
for(const post of posts) {
 assert.equal(post.sections.length,4);assert.ok(post.commands&&post.code.length);
 for(const pair of [post.title,post.goal,post.intro,post.task,post.answer,post.expected,...post.sections.flatMap(s=>[s.title,...s.paragraphs])]) {
  assert.ok(pair.en?.trim()&&pair.zh?.trim(),`Missing translation ${post.id}`);
  assert.ok(!/\p{Script=Han}/u.test(pair.en),`Chinese in English ${post.id}`);
 }
}
const files=['build/index.html','build/lab/index.html',...posts.map(p=>`build/${p.id}/index.html`)];
let links=0,copyCount=0;
for(const file of files) {
 const {dom}=await page(file),jobs=[];
 walk(dom,n=>{
  if(attr(n,'data-copy')) {copyCount++;if(attr(n,'data-copy')==='zh')assert.ok(n.attrs.some(a=>a.name==='hidden'));else assert.ok(!/\p{Script=Han}/u.test(text(n)),file);}
  const href=attr(n,'href')??attr(n,'src');if(!href||(!href.startsWith('/')&&!href.startsWith('#')))return;
  jobs.push((async()=>{
   const url=new URL(href,'https://local.test/'+file);let target=url.pathname.slice(1);if(!target||target.endsWith('/'))target+='index.html';
   assert.ok((await stat(new URL(target,root))).isFile(),`Missing file ${href}`);
   if(url.hash&&target.endsWith('.html'))assert.ok((await page(target)).ids.has(decodeURIComponent(url.hash.slice(1))),`Missing anchor ${href} in ${file}`);
   links++;
  })());
 });await Promise.all(jobs);
}
const manifest=JSON.parse(await readFile(new URL('build/manifest.json',root),'utf8'));
for(const source of manifest.sources) {
 const original=(await readFile(new URL('../'+source.file,root),'utf8')).replaceAll('\r\n','\n');
 assert.equal(source.sha256,createHash('sha256').update(original).digest('hex'));
 assert.equal(await readFile(new URL(`build/code/${source.slug}.txt`,root),'utf8'),original);
}
console.log(`PASS: 12 bilingual build chapters, 48 sections, 8 milestone mappings, ${copyCount} localized fragments, ${links} links/assets and ${manifest.sources.length} exact source snapshots.`);
