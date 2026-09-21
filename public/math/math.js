import { localize } from './i18n.mjs';
const status = document.querySelector('#copy-status');
let statusTimer;
function announce(text) {
  status.textContent = text;
  localize(status);
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { status.textContent = ''; }, 2200);
}
document.querySelectorAll('.copy-equation').forEach(button => {
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.latex);
      announce('LaTeX 已复制');
    } catch {
      // Keep the exact source available without claiming a failed copy succeeded.
      const source = document.createElement('textarea');
      source.value = button.dataset.latex;
      source.setAttribute('aria-label', 'LaTeX 源码，可选择并复制');
      localize(source);
      source.style.cssText = 'display:block;width:100%;min-height:6em;background:#19131f;color:#eee;border:1px solid #79618e;padding:12px;font:12px monospace;';
      button.closest('figure').append(source);
      source.focus();
      source.select();
      announce('请复制已选中的 LaTeX');
    }
  });
});
document.querySelector('#print-math').addEventListener('click', () => window.print());
let printDetails = [];
addEventListener('beforeprint', () => {
  printDetails = [...document.querySelectorAll('details')].map(node => [node, node.open]);
  for (const [node] of printDetails) node.open = true;
});
addEventListener('afterprint', () => {
  for (const [node, open] of printDetails) node.open = open;
});
document.querySelector('#expand-lessons').addEventListener('click', () => {
  document.querySelectorAll('.derivation,.sh-chapter').forEach(node => { node.open = true; });
});
document.querySelector('#collapse-lessons').addEventListener('click', () => {
  document.querySelectorAll('.derivation,.sh-chapter').forEach(node => { node.open = false; });
});
function revealHash() {
  const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (!target) return;
  if (target.matches('details')) target.open = true;
  const lesson = target.querySelector('.derivation');
  if (lesson) lesson.open = true;
  let parent = target.parentElement;
  while (parent) {
    if (parent.matches('details')) parent.open = true;
    parent = parent.parentElement;
  }
  // Opening an earlier folded block can shift the target after native hash scroll.
  requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
}
document.querySelector('#jump-equation').addEventListener('change', event => {
  if (event.target.value) { location.hash = event.target.value; revealHash(); }
});
addEventListener('hashchange', revealHash);
if (location.hash) revealHash();
// Other deferred modules expand numeric readouts and initialize the trainer.
// Resolve the initial anchor after all of them have finished changing layout.
document.addEventListener('DOMContentLoaded',()=>{if(location.hash)revealHash();},{once:true});
document.querySelector('#back-top').addEventListener('click', event => {
  event.preventDefault();
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
});
const toc = [...document.querySelectorAll('.math-toc nav a')];
const chapters = [...document.querySelectorAll('main>section[id]')];
function updateReading() {
  const height = document.documentElement.scrollHeight - innerHeight;
  document.querySelector('#reading-progress').style.width = (height > 0 ? Math.min(100, scrollY / height * 100) : 0) + '%';
  const current = chapters.filter(section => section.getBoundingClientRect().top <= 160).at(-1);
  for (const link of toc) {
    if (current && link.hash === '#' + current.id) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}
let scheduled = false;
addEventListener('scroll', () => {
  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(() => { updateReading(); scheduled = false; });
  }
}, { passive: true });
addEventListener('resize', updateReading);
updateReading();

// Educational 2D trajectory only: mean(t), and the exact STG temporal exponent.
function point(t) {
  const dt = t - 0.5;
  return [265 + 340*dt + 140*dt*dt, 150 - 110*dt + 260*dt*dt*dt];
}
const path = Array.from({ length: 101 }, (_, index) => {
  const [x, y] = point(index / 100);
  return (index ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2);
}).join(' ');
document.querySelector('#motion-path').setAttribute('d', path);
function updateTimeLab() {
  const t = Number(document.querySelector('#time-slider').value);
  const rho = Number(document.querySelector('#width-slider').value);
  const weight = Math.exp(-(((t - 0.5) / rho) ** 2));
  const [x, y] = point(t);
  document.querySelector('#time-value').textContent = t.toFixed(2);
  document.querySelector('#width-value').textContent = rho.toFixed(2);
  document.querySelector('#weight-value').textContent = weight.toFixed(4);
  for (const id of ['motion-glow', 'motion-dot']) {
    const node = document.getElementById(id);
    node.setAttribute('cx', x);
    node.setAttribute('cy', y);
    node.setAttribute('opacity', weight.toFixed(6));
  }
}
document.querySelector('#time-slider').addEventListener('input', updateTimeLab);
document.querySelector('#width-slider').addEventListener('input', updateTimeLab);
updateTimeLab();
