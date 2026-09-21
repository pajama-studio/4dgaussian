import { parse } from 'parse5';
import { createHash } from 'node:crypto';
export const hasChinese = value => /\p{Script=Han}/u.test(value);
export function collectMessages(html) {
  const result = new Map();
  const add = text => {
    const value = text.trim();
    if (hasChinese(value)) result.set(value, { id: createHash('sha256').update(value).digest('hex').slice(0,12), zh: value });
  };
  function visit(node) {
    if (node.attrs?.some(a => a.name === 'data-language-ui')) return;
    for (const attribute of node.attrs || []) {
      if (['aria-label','title','placeholder','content'].includes(attribute.name)) add(attribute.value);
    }
    if (['script','style','math','pre','code'].includes(node.tagName) ||
        node.attrs?.some(a => a.name === 'class' && a.value.split(/\s+/).includes('katex'))) return;
    if (node.nodeName === '#text') add(node.value);
    for (const child of node.childNodes || []) visit(child);
  }
  visit(parse(html));
  return [...result.values()];
}
