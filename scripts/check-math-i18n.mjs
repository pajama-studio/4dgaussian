import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { collectMessages, hasChinese } from './math/i18n-catalog.mjs';
import english from '../public/math/en.mjs';
import { shTranslations } from './math/sh-content.mjs';
import { trainingTranslations } from './math/training-content.mjs';

const root = new URL('../public/math/', import.meta.url);
const pages = ['index.html', ...(await readdir(new URL('code/',root)))
  .filter(name => name.endsWith('.html')).map(name => 'code/'+name)];
const catalog = new Map();
for (const page of pages) {
  for (const message of collectMessages(await readFile(new URL(page,root),'utf8'))) {
    const { id, zh } = message;
    assert.ok(english[zh], 'Missing translation in '+page+': '+zh);
    assert.ok(!hasChinese(english[zh]), 'Chinese prose in English mode: '+zh);
    if (catalog.has(id)) assert.equal(catalog.get(id).zh,zh,'Message hash collision');
    catalog.set(id,{id,zh,en:english[zh]});
  }
}
const dynamic = { ...JSON.parse(await readFile(new URL('math/english-dynamic.json',import.meta.url),'utf8')), ...shTranslations, ...trainingTranslations };
const placeholders = value => [...value.matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();
for (const [zh,en] of Object.entries(dynamic)) {
  assert.equal(english[zh],en,'Dynamic message missing from runtime dictionary');
  assert.deepEqual(placeholders(en),placeholders(zh),'Dynamic values lost in '+zh);
}
for (const [zh,en] of Object.entries(english)) {
  assert.ok(en.trim().length && !hasChinese(en),'Invalid English translation: '+zh);
}
const lessons = JSON.parse(await readFile(new URL('lessons.json',root),'utf8'));
assert.equal(Object.keys(lessons).length,39);
assert.equal(Object.values(lessons).reduce((total,lesson)=>total+lesson.steps.length,0),175);
await writeFile(new URL('../artifacts/math/bilingual-catalog.json',import.meta.url),JSON.stringify([...catalog.values()],null,2)+'\n');
console.log('PASS: '+catalog.size+' static messages across '+pages.length+' pages; '+Object.keys(dynamic).length+' supplemental catalog entries checked; 39 bilingual lessons / 175 steps; no untranslated English prose or missing placeholders.');
