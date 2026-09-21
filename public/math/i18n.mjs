import dictionary from './en.mjs';

const preferenceKey = 'pajama-math-language';
const excluded = 'script,style,math,pre,code,.katex,[data-language-ui],[data-i18n-dynamic]';
const attributeNames = ['aria-label', 'title', 'placeholder', 'content'];
const originals = new WeakMap();
const originalAttributes = new WeakMap();
let language = 'en';

export const getLanguage = () => language;
export function t(zh, values = {}) {
  const template = language === 'en' ? (dictionary[zh] ?? zh) : zh;
  return template.replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
}

function translateValue(value) {
  const middle = value.trim();
  return middle ? value.slice(0, value.indexOf(middle)) + t(middle) + value.slice(value.indexOf(middle) + middle.length) : value;
}

// Change text nodes only: MathML, code, event listeners, and open details survive.
export function localize(root = document.documentElement) {
  function visit(node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.matches('[data-language-ui],[data-i18n-dynamic]')) return;
      let saved = originalAttributes.get(node);
      if (!saved) { saved = new Map(); originalAttributes.set(node, saved); }
      for (const name of attributeNames) {
        if (!node.hasAttribute(name)) continue;
        const current = node.getAttribute(name);
        let entry = saved.get(name);
        if (!entry || current !== entry.last) entry = { zh: current };
        entry.last = translateValue(entry.zh);
        node.setAttribute(name, entry.last);
        saved.set(name, entry);
      }
      if (node.matches(excluded)) return;
    } else if (node.nodeType === Node.TEXT_NODE) {
      let entry = originals.get(node);
      if (!entry || node.data !== entry.last) entry = { zh: node.data };
      entry.last = translateValue(entry.zh);
      if (node.data !== entry.last) node.data = entry.last;
      originals.set(node, entry);
      return;
    }
    for (const child of node.childNodes) visit(child);
  }
  visit(root);
}

function readingAnchor() {
  if (scrollY < 5) return null;
  const edge = (document.querySelector('.math-topbar')?.getBoundingClientRect().bottom ?? 0) + 16;
  const candidates = [...document.querySelectorAll('main h1,main h2,main h3,main h4,main p,main summary,main tr,main figcaption,main .source-lines>code>span')];
  let next;
  for (const node of candidates) {
    // Closed <details> can retain nonzero cached layout rectangles in Chrome.
    // Only its direct summary is actually visible; ignore all folded content.
    let folded = false;
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      if (parent.localName === 'details' && !parent.open && node !== parent.querySelector(':scope > summary')) {
        folded = true; break;
      }
    }
    if (folded) continue;
    const rect = node.getBoundingClientRect();
    if (!rect.height || rect.bottom <= edge) continue;
    if (!next || rect.top < next.top) next = { node, top: rect.top };
    if (rect.top <= edge) { next = { node, top: rect.top }; break; }
  }
  if (next) {
    const scope = next.node.closest('[id]');
    next.scopeId = scope?.id;
    next.path = [];
    for (let node = next.node; scope && node !== scope; node = node.parentElement) {
      next.path.unshift([...node.parentElement.children].indexOf(node));
    }
  }
  return next;
}

export function setLanguage(next, { remember = true, preservePosition = true } = {}) {
  if (!['zh','en'].includes(next)) return;
  const anchor = preservePosition ? readingAnchor() : null;
  language = next;
  document.documentElement.lang = next === 'en' ? 'en' : 'zh-CN';
  localize();
  for (const button of document.querySelectorAll('[data-language]')) {
    button.setAttribute('aria-pressed', String(button.dataset.language === next));
  }
  if (remember) {
    try { localStorage.setItem(preferenceKey, next); } catch { /* Storage may be disabled. */ }
    const url = new URL(location.href);
    url.searchParams.set('lang', next);
    history.replaceState(history.state, '', url);
  }
  // Carry the explicit language to handbook/source pages even with storage blocked.
  for (const link of document.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href');
    if (href.startsWith('#') || link.hasAttribute('download')) continue;
    const url = new URL(href, location.href);
    if (url.origin !== location.origin || !/^(?:\/math\/(?:$|code\/.*\.html$)|\/(?:learn|build|relight)\/.*)$/.test(url.pathname)) continue;
    url.searchParams.set('lang', next);
    link.setAttribute('href', url.pathname + url.search + url.hash);
  }
  dispatchEvent(new CustomEvent('math:languagechange', { detail: { language: next } }));
  const restorePosition = () => {
    if (!anchor) return;
    // The pixel lab rebuilds its table text; resolve the same row in its new DOM.
    const node = anchor.node.isConnected ? anchor.node : anchor.path.reduce(
      (parent, index) => parent?.children[index], document.getElementById(anchor.scopeId));
    if (!node) return;
    const difference = node.getBoundingClientRect().top - anchor.top;
    if (Math.abs(difference) > 0.5) scrollBy({ top: difference, behavior: 'instant' });
  };
  // Flush the new layout and restore synchronously. Check once more after paint
  // for a dynamic table rebuilt by the language-change listener.
  restorePosition();
  if (anchor) requestAnimationFrame(restorePosition);
}

const requested = new URL(location.href).searchParams.get('lang');
let saved;
try { saved = localStorage.getItem(preferenceKey); } catch { /* Keep the English default. */ }
if (['zh','en'].includes(requested)) {
  try { localStorage.setItem(preferenceKey, requested); } catch { /* Query still works. */ }
}
setLanguage(['zh','en'].includes(requested) ? requested : ['zh','en'].includes(saved) ? saved : 'en',
  { remember: false, preservePosition: false });
for (const button of document.querySelectorAll('[data-language]')) {
  button.addEventListener('click', () => setLanguage(button.dataset.language));
}
