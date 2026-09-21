import { mkdir, writeFile, copyFile, cp, readFile, readdir } from 'node:fs/promises';
import { sections, references } from './math/content.mjs';
import { esc, math } from './math/notation.mjs';
import { formula } from './math/lesson-format.mjs';
import { foundations } from './math/foundations.mjs';
import { geometryLessons } from './math/lessons-geometry.mjs';
import { screenLessons } from './math/lessons-screen.mjs';
import { timeLessons } from './math/lessons-time.mjs';
import { familyLessons } from './math/lessons-families.mjs';
import { trainingLessons } from './math/lessons-training.mjs';
import { buildSources } from './math/source-map.mjs';
import { traceContent } from './math/trace-content.mjs';
import { buildTrainingContent } from './math/training-content.mjs';
import { languageUI } from './math/language-ui.mjs';
import { buildTranslations } from './math/i18n-build.mjs';

const root = new URL('../', import.meta.url);
const output = new URL('public/math/', root);
await mkdir(output, { recursive: true });
const excerpts = await buildSources(root, output);
const trainingContent = buildTrainingContent(excerpts);
const lessons = { ...geometryLessons, ...screenLessons, ...timeLessons, ...familyLessons, ...trainingLessons };
const equations = sections.flatMap(section => section.blocks.filter(block => typeof block === 'object'));
if (equations.length !== 39 || new Set(equations.map(e => e.id)).size !== 39 ||
    Object.keys(lessons).length !== 39) throw new Error('Expected exactly 39 unique, explained formulas');
const foundationNames = {
  vectors: 'A 向量', matrices: 'B 矩阵', exp: 'C 指数', statistics: 'D 方差',
  derivatives: 'E 导数', chain: 'F 链式法则', quadratic: 'G 配方', integral: 'H 积分',
};
const link = ({ href, label }) => '<a href="' + esc(href) + '"' +
  (href.startsWith('https://') ? ' target="_blank" rel="noreferrer"' : '') + '>' + esc(label) + ' ↗</a>';
function renderLesson(id) {
  const lesson = lessons[id];
  if (!lesson || lesson.steps.length < 4 || !lesson.code.length || !lesson.example[1]) {
    throw new Error('Incomplete derivation: ' + id);
  }
  return '<details class="derivation" id="derive-' + id + '"' + (id === 'kernel' ? ' open' : '') +
    '><summary><span>从零推导</span><small>' + lesson.steps.length + ' 步 · 数字算例 · 源码 · 自测</small></summary><div class="derivation-body">' +
    '<div class="lesson-heading"><span class="lesson-kind">' + esc(lesson.kind) + '</span><p>' + esc(lesson.goal) + '</p></div>' +
    '<div class="prerequisites"><span>用到的小工具</span>' + lesson.prerequisites.map(id => {
      if (!foundationNames[id]) throw new Error('Missing prerequisite: ' + id);
      return '<a href="#base-' + id + '">' + foundationNames[id] + '</a>';
    }).join('') + '</div>' +
    '<ol class="derivation-steps">' + lesson.steps.map(step =>
      '<li><h4>' + esc(step.title) + '</h4><p>' + esc(step.why) + '</p>' +
      (step.source ? formula(step.source) : '') + '</li>').join('') + '</ol>' +
    '<div class="worked"><span>代入数字，亲手核对</span><p>' + esc(lesson.example[0]) + '</p>' + formula(lesson.example[1]) + '</div>' +
    '<div class="code-connections"><h4>这一步在代码里在哪里？</h4>' + lesson.code.map(code => {
      const ref = excerpts[code.id];
      if (!ref) throw new Error('Missing source mapping: ' + code.id);
      return '<div class="code-bridge"><p>' + esc(code.explanation) + '</p><p class="symbol-code">' + esc(code.symbols) + '</p><a class="source-location" href="' +
        ref.href + '" target="_blank" rel="noreferrer">' + esc(ref.path) + ' · L' + ref.first + '–' + ref.last +
        ' ↗</a><pre tabindex="0" aria-label="实际源码片段"><code>' + esc(ref.text) + '</code></pre></div>';
    }).join('') + '</div><aside class="note"><strong>边界与易错点</strong><p>' + esc(lesson.pitfall) + '</p></aside>' +
    '<details class="checkpoint"><summary>停下来想一想：' + esc(lesson.question) + '</summary><p>' + esc(lesson.answer) +
    '</p></details><a class="trace-jump" href="#pixel-lab">带着这条公式，查看完整像素算例 →</a></div></details>';
}
function renderSection(section) {
  let count = 0;
  const content = section.blocks.map(block => {
    if (typeof block === 'string') return block;
    count++;
    const label = Number(section.number) + '.' + count;
    return '<figure class="equation" id="eq-' + block.id + '"><figcaption><span class="eq-number">(' + label + ')</span><span>' +
      esc(block.title) + '</span><button type="button" class="copy-equation" data-latex="' + esc(block.latex) + '" aria-label="复制 ' +
      esc(block.title) + ' 的 LaTeX">复制 LaTeX</button></figcaption><div class="equation-scroll" tabindex="0" role="region" aria-label="' +
      esc(block.title) + '，较长公式可横向滚动">' + math(block.body, true) + '</div>' +
      (block.note ? '<p class="equation-note">' + esc(block.note) + '</p>' : '') + renderLesson(block.id) + '</figure>';
  }).join('\n');
  return '<section class="math-section" id="' + section.id + '"><div class="section-heading"><span class="section-number">' +
    section.number + '</span><div><p class="eyebrow">' + section.eyebrow + '</p><h2>' + section.title + '</h2></div><span class="priority">' +
    section.priority + '</span></div><p class="section-intro">' + section.intro + '</p>' + content +
    '<div class="section-refs"><span>原始资料</span>' + section.refs.map(link).join('') + '</div></section>';
}
const toc = '<a href="#foundations"><span>A–H</span>先补基础数学</a><a href="#pixel-lab"><span>LAB</span>一个像素的完整旅程</a><a href="#sh-lab"><span>SH</span>球谐图案与颜色</a>' +
  sections.map(section => '<a href="#' + section.id + '"><span>' + section.number + '</span>' + section.label + '</a>').join('');
const controls = '<div class="lesson-controls"><label for="jump-equation">按公式跳转</label><select id="jump-equation"><option value="">选择要推导的公式…</option>' +
  equations.map((e, i) => '<option value="eq-' + e.id + '">' + String(i+1).padStart(2,'0') + ' · ' + esc(e.title) + '</option>').join('') +
  '</select><button type="button" id="expand-lessons">展开全部推导</button><button type="button" id="collapse-lessons">收起全部推导</button></div>';
const html = '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<meta name="description" content="从初中数学出发，逐步推导 39 组 4D Gaussian 公式，打通 PyTorch 训练、PLY 参数、Rust/wgpu 与 WGSL 渲染。"><meta name="robots" content="noindex,nofollow">' +
  '<title>4D Gaussian 数学手册 · 从推导到代码</title><link rel="icon" href="/pajama-mark.svg"><link rel="stylesheet" href="/math/vendor/katex.min.css"><link rel="stylesheet" href="/math/math.css">' +
  '<script type="module" src="/math/math.js"></script><script type="module" src="/math/trace-ui.mjs"></script><script type="module" src="/math/sh-ui.mjs"></script><script type="module" src="/math/training-ui.mjs"></script><link rel="stylesheet" href="/math/training.css"></head><body id="top">' +
  '<a class="skip-link" href="#foundations">跳到基础数学</a><div class="reading-progress" id="reading-progress"></div>' +
  '<header class="math-topbar"><a class="brand" href="/"><img src="/pajama-mark.svg" alt="" width="34" height="34"><span><strong>Pajama Studio</strong><small>Gaussian Research Lab</small></span></a>' +
  '<nav aria-label="主导航"><a href="/learn/">Zero to Hero</a><a href="/">Viewer</a><a href="/docs/">Field Guide</a><button id="print-math" type="button">打印 / 存为 PDF</button>' + languageUI + '</nav></header>' +
  '<div class="math-layout"><aside class="math-toc"><span class="toc-caption">MATH FIELD NOTES</span><nav aria-label="章节目录">' + toc +
  '</nav><a class="toc-sources" href="#sources">论文与原始资料 ↗</a><div class="toc-footnote"><span class="green-dot"></span>不跳步，从数字到像素<br><small>推导 → 算例 → 真实源码</small></div></aside><main id="main">' +
  '<section class="math-hero"><p class="eyebrow"><span class="green-dot"></span> FROM FIRST PRINCIPLES TO RUNNING CODE</p><h1>每一步，<br>都能<span class="hero-accent">算出来。</span></h1><p class="hero-en">4D Gaussian Splatting / Mathematics & Implementation</p>' +
  '<p class="hero-lede">从分数、平方和方程开始，走完一颗 Gaussian 的旅程。<br>读懂它如何随时间移动，变成像素，再从误差中学会改变。</p>' +
  '<p class="course-entry"><a href="/learn/">Zero to Hero · 12 lessons · 从零到实战 →</a></p>' +
  '<p class="course-entry"><a href="/build/">构建跨平台 Viewer · 12 篇工程博客 + 8 个 GPU 实验 →</a></p>' +
  '<p class="course-entry"><a href="/relight/">Gaussian Relighting · 光照、材质与动态形变 →</a></p>' +
  '<div class="hero-meta"><span>39 组公式，逐条推导</span><span>8 个基础工具</span><span>可运行像素实验</span><span>2026.09.18</span></div>' +
  '<div class="hero-flow"><a href="#foundations"><small>01 / 补基础</small><strong>为什么</strong></a><span>→</span><a href="#gaussian"><small>02 / 逐步推</small><strong>怎么算</strong></a><span>→</span><a href="#pixel-lab"><small>03 / 看数字</small><strong>跑一遍</strong></a><span>→</span><a href="#training"><small>04 / 对源码</small><strong>连起来</strong></a></div>' +
  '<p class="lesson-guide">建议第一次按“基础 → 01–05 → 08 → 像素实验”阅读；06–07 用于比较其他表示。每个公式的“从零推导”可展开，源码链接对应本次部署的文件快照。打印会自动包含完整推导与答案。</p>' + controls + '</section>' +
  foundations + sections.map(renderSection).join('\n') + traceContent.replace('<!-- TRAINING LAB -->',trainingContent) +
  '<section id="sources" class="math-section sources-section"><p class="eyebrow">PRIMARY SOURCES</p><h2>与论文、与源码一起读。</h2>' +
  '<p class="section-intro">推导采用统一符号；模型选择、数学恒等式和实现近似分别标明。其他方法的教学函数与当前 STG-Lite 渲染器明确区分。</p><div class="source-list">' +
  references.map(link).join('') + '</div><p class="colophon">主公式使用 MathML；逐步推导在构建时排版为 KaTeX HTML + 可访问 MathML。字体和样式均由本站提供，无外部 CDN。源码快照的 SHA-256 可在 <a href="/math/source-manifest.json">指纹清单</a>核对。</p></section>' +
  '<footer><span>Pajama Studio / Research Notes</span><a href="#top" id="back-top">回到顶部 ↑</a></footer></main></div><p class="copy-status" id="copy-status" role="status" aria-live="polite"></p></body></html>\n';
await mkdir(new URL('vendor/', output), { recursive: true });
await copyFile(new URL('node_modules/katex/dist/katex.min.css', root), new URL('vendor/katex.min.css', output));
await copyFile(new URL('node_modules/katex/LICENSE', root), new URL('vendor/KATEX-LICENSE.txt', output));
await cp(new URL('node_modules/katex/dist/fonts/', root), new URL('vendor/fonts/', output), { recursive: true });
await writeFile(new URL('index.html', output), html);
await writeFile(new URL('equations.json', output), JSON.stringify(equations.map(({ id, title, latex }) => ({ id, title, latex })), null, 2) + '\n');
await writeFile(new URL('lessons.json', output), JSON.stringify(lessons, null, 2) + '\n');
const sourcePages = await Promise.all((await readdir(new URL('code/',output))).filter(name => name.endsWith('.html')).map(name => readFile(new URL('code/'+name,output),'utf8')));
const translated = await buildTranslations(html + sourcePages.join('\n'), output);
console.log('Bilingual coverage: ' + translated + ' Chinese messages have complete English translations.');
console.log('Built /math/: 39 complete lessons, ' + Object.values(lessons).reduce((n, l) => n+l.steps.length, 0) + ' steps, 8 foundations, source snapshots and pixel lab.');
