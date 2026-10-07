import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'parse5';
import { models, groups, access } from './representations-content.mjs';
const html=await readFile(new URL('../public/representations/index.html',import.meta.url),'utf8');
const ids=new Set(),domIds=new Set();let translations=0;
function visit(n) {
  const attrs=Object.fromEntries((n.attrs||[]).map(a=>[a.name,a.value]));
  if(attrs.id){assert(!domIds.has(attrs.id),`Duplicate DOM ID ${attrs.id}`);domIds.add(attrs.id);}
  if(attrs.id==='empty-results') assert(n.childNodes.some(c=>c.tagName==='span'),'Empty-state text escaped its hidden container');
  if(Object.hasOwn(attrs,'data-atlas-i18n')) { assert(attrs['data-en']&&attrs['data-zh'],'Missing translation');translations++; }
  for(const child of n.childNodes||[]) visit(child);
}
visit(parse(html));
for(const m of models) {
  assert(!ids.has(m.id));ids.add(m.id);assert(domIds.has(m.id));assert(groups[m.group]);assert(access[m.availability]);
  for(const k of ['title','summary','geometry','appearance','time','parameters','learn','exported','runtime','contract','asset','support']) assert(m[k].en&&m[k].zh,`${m.id}: ${k}`);
  for(const {url} of m.links) assert(url.startsWith('/')||new URL(url).protocol==='https:');
}
assert.equal(models.length,13);assert.equal(models.filter(m=>m.labAppearance).length,5);
assert(html.includes('not ports to our engine'));assert(html.includes('dummy appearance parameters'));
assert(html.includes('resource-checks.json'));assert(translations>150);
const json=JSON.parse(await readFile(new URL('../public/representations/catalog.json',import.meta.url),'utf8'));
assert.deepEqual(json.models,models,'Generated catalog is stale');
console.log(`Representation atlas: ${models.length} bilingual contracts, ${translations} translated elements, unique anchors and explicit evidence boundaries.`);
