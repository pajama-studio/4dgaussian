import { writeFile } from 'node:fs/promises';
import { lessons } from './learn/course.mjs';
import { posts } from './build/posts.mjs';
import { chapters } from './relight-content.mjs';

const destinations = [
  { href: '/learn/', en: 'Start learning', zh: '从零学习', detail: '12 lessons · concepts, experiments and self-checks', detailZh: '12 节课程 · 原理、实验与自测', group: 'course' },
  { href: '/build/', en: 'Build a viewer', zh: '构建 Viewer', detail: 'Rust / wgpu · from a pixel to a moving scene', detailZh: 'Rust / wgpu · 从像素到动态场景', group: 'engineering' },
  { href: '/math/', en: 'Math notebook', zh: '数学手册', detail: 'Step-by-step derivations and live calculations', detailZh: '逐步推导与实时计算', group: 'math' },
  { href: '/relight/', en: 'Understand relighting', zh: '理解重打光', detail: 'Light, materials and a working GPU experiment', detailZh: '光照、材质与 GPU 实验', group: 'relighting' },
  { href: '/docs/', en: 'Rendering field guide', zh: '渲染指南', detail: 'Representations, data contracts and the pipeline', detailZh: '场景表示、数据约定与渲染管线 · 英文', group: 'reference' },
  { href: '/', en: 'Explore the live viewer', zh: '探索实时 Viewer', detail: 'Inspect a real STG-Lite model', detailZh: '观察真实 STG-Lite 模型 · 英文', group: 'viewer' },
];
const entries = [
  { href: '/streaming/', en: 'Temporal streaming & benchmarks', zh: '时序流式加载与性能实测', detail: 'Real STG chunks · time range API · Rust optimization evidence', detailZh: '真实 STG 分块、时间范围 API 与 Rust 优化证据', group: 'lab' },
  ...destinations,
  ...lessons.map(l => ({ href: `/learn/${l.id}/`, ...l.title, detail: 'Theory lesson ' + l.id.slice(0, 2), detailZh: '原理课 ' + l.id.slice(0, 2), keywords: [l.lab,l.goal.en,l.goal.zh].join(' '), group: 'course' })),
  ...posts.map(p => ({ href: `/build/${p.id}/`, ...p.title, detail: 'Engineering chapter ' + p.id.slice(0, 2), detailZh: '工程篇 ' + p.id.slice(0, 2), keywords: [p.goal.en,p.goal.zh].join(' '), group: 'engineering' })),
  ...chapters.map(c => ({ href: `/relight/${c.id}/`, ...c.title, detail: 'Relighting lesson', detailZh: '重打光课程', keywords: [c.goal.en,c.goal.zh].join(' '), group: 'relighting' })),
  { href: '/math/#pixel-lab', en: 'Follow one pixel', zh: '追踪一个像素', detail: 'Change inputs · inspect every intermediate value', detailZh: '改变输入，观察每一步的数值', group: 'lab' },
  { href: '/math/?view=training#training-lab', en: 'Training, step by step', zh: '逐步模拟训练', detail: 'Render → loss → gradient → update', detailZh: '渲染 → 损失 → 梯度 → 更新', group: 'lab' },
  { href: '/math/#sh-lab', en: 'Spherical harmonics in 3D', zh: '三维球谐函数', detail: 'SH · RGB channels · rotate the basis lobes', detailZh: 'SH · RGB 通道 · 旋转观察基函数', group: 'lab' },
  { href: '/build/lab/', en: 'GPU milestones', zh: 'GPU 里程碑', detail: 'Eight stages in the shared Rust/wgpu renderer', detailZh: '共享 Rust/wgpu 渲染器的八个阶段', group: 'lab' },
  { href: '/relight/lab/', en: 'Move the light', zh: '移动光源', detail: 'Material, light and normal experiments', detailZh: '材质、光源与法线实验', group: 'lab' },
];
await writeFile(new URL('../public/site-map.json', import.meta.url), JSON.stringify(entries, null, 2) + '\n');
console.log(`Built shared site navigation: ${entries.length} bilingual destinations.`);
