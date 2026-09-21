const data = JSON.parse(document.getElementById('build-data').textContent);
const languageKey = 'pajama-math-language', progressKey = 'pajama-build-progress-v1';
let reviewed = [], remembered;
try { remembered = localStorage.getItem(languageKey); reviewed = JSON.parse(localStorage.getItem(progressKey) || '[]'); } catch {}
if (!Array.isArray(reviewed)) reviewed = [];
reviewed = reviewed.filter(id => data.posts.some(post => post.id === id));
const param = new URL(location.href).searchParams.get('lang');
let language = ['en', 'zh'].includes(param) ? param : remembered === 'zh' ? 'zh' : 'en';
function setLanguage(next) {
  language = next;
  document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
  for (const node of document.querySelectorAll('[data-copy]')) node.hidden = node.dataset.copy !== next;
  for (const node of document.querySelectorAll('[data-language]')) node.setAttribute('aria-pressed', String(node.dataset.language === next));
  for (const anchor of document.querySelectorAll('a[href]')) {
    if (anchor.getAttribute('href').startsWith('#')) continue;
    const url = new URL(anchor.href, location.href);
    if (url.origin === location.origin && /^\/(build|learn|math)\//.test(url.pathname)) { url.searchParams.set('lang', next); anchor.href = url.pathname + url.search + url.hash; }
  }
  const url = new URL(location.href); url.searchParams.set('lang', next); history.replaceState(null, '', url);
  try { localStorage.setItem(languageKey, next); } catch {}
  document.dispatchEvent(new CustomEvent('build-language'));
  updateProgress();
}
function updateProgress() {
  const progress = document.getElementById('build-progress'); if (progress) progress.value = reviewed.length;
  const count = document.getElementById('review-count'); if (count) count.textContent = `${reviewed.length} / ${data.posts.length}`;
  for (const node of document.querySelectorAll('[data-post]')) node.classList.toggle('reviewed', reviewed.includes(node.dataset.post));
  const button = document.getElementById('mark-reviewed');
  if (button) {
    const marked = reviewed.includes(data.current); button.setAttribute('aria-pressed', String(marked));
    button.textContent = language === 'zh' ? marked ? '已复习 ✓ · 点击撤销' : '我已运行并能解释这一步' : marked ? 'Reviewed ✓ · undo' : 'I ran this and can explain it';
  }
}
for (const button of document.querySelectorAll('[data-language]')) button.onclick = () => setLanguage(button.dataset.language);
document.getElementById('mark-reviewed')?.addEventListener('click', () => {
  reviewed = reviewed.includes(data.current) ? reviewed.filter(id => id !== data.current) : [...reviewed, data.current];
  try { localStorage.setItem(progressKey, JSON.stringify(reviewed)); } catch {}
  updateProgress();
});
for (const button of document.querySelectorAll('[data-copy-code]')) button.onclick = async () => {
  try { await navigator.clipboard.writeText(document.getElementById(button.dataset.copyCode).textContent); button.textContent = language === 'zh' ? '已复制' : 'Copied'; }
  catch { button.textContent = language === 'zh' ? '请选中下方代码复制' : 'Select the code below to copy'; }
};
const syllabus = document.getElementById('build-syllabus'); if (syllabus && matchMedia('(min-width:1101px)').matches) syllabus.open = true;
setLanguage(language);
