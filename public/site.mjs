// Shared navigation and reading controls. No rendering or model state lives here.
const $ = selector => document.querySelector(selector);
const main = $('main');
const header = $('body > header');
const text = (en, zh) => document.documentElement.lang.startsWith('zh') ? zh : en;
const titleText = node => {
  if (!node) return '';
  const copy = node.cloneNode(true);
  copy.querySelectorAll('[hidden],.katex,.copy-equation,.eq-number,.section-number').forEach(n => n.remove());
  return copy.textContent.replace(/\s+/g, ' ').trim();
};
const make = (tag, className, content) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
};
const button = (className, content) => {
  const node = make('button', className, content); node.type = 'button'; return node;
};
const localized = [];
function label(node, en, zh, attr) {
  localized.push(() => attr ? node.setAttribute(attr, text(en, zh)) : node.textContent = text(en, zh));
  localized.at(-1)(); return node;
}
const withLanguage = href => {
  const url = new URL(href, location.href);
  if (/^\/(math|learn|build|relight)\//.test(url.pathname)) url.searchParams.set('lang', document.documentElement.lang.startsWith('zh') ? 'zh' : 'en');
  return url.pathname + url.search + url.hash;
};

if (main && header) {
  document.body.classList.add('site-ready');
  const section = location.pathname.split('/')[1] || 'viewer';
  const names = { math:['Math notebook','数学手册'], docs:['Rendering field guide','渲染指南'], learn:['Learn 4D Gaussian Splatting','学习 4D Gaussian Splatting'], build:['Build a viewer','构建 Viewer'], relight:['Gaussian relighting','Gaussian 重打光'], viewer:['Live viewer','实时 Viewer'] };
  const explore = label(button('site-explore'), 'Explore', '目录');
  label(explore, 'Explore & search', '目录与搜索', 'aria-label');
  explore.setAttribute('aria-haspopup', 'dialog');
  explore.setAttribute('aria-controls', 'site-dialog');
  header.insertBefore(explore, header.children[1] || null);

  const dialog = make('dialog', 'site-dialog');
  dialog.id = 'site-dialog'; dialog.setAttribute('aria-labelledby', 'site-dialog-title');
  dialog.dataset.i18nDynamic = '';
  const dialogHead = make('div', 'site-dialog-head');
  const dialogTitle = label(make('h2'), 'Find your next step', '找到你的下一步'); dialogTitle.id = 'site-dialog-title';
  const close = label(button(''), 'Close', '关闭'); close.addEventListener('click', () => dialog.close());
  dialogHead.append(dialogTitle, close);
  const searchLabel = label(make('label'), 'Search lessons, experiments or this page', '搜索课程、实验或本页内容'); searchLabel.htmlFor = 'site-search';
  const search = make('input'); search.type = 'search'; search.id = 'site-search'; search.autocomplete = 'off';
  label(search, 'Try “SH”, “training”, “camera”…', '试试“球谐”“训练”“相机”…', 'placeholder');
  const count = make('p', 'site-result-count'); count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite');
  const results = make('ul', 'site-results');
  const help = label(make('p', 'site-dialog-help'), 'Type to filter · Tab to a result · Enter to open · Esc to close', '输入以筛选 · Tab 选择结果 · Enter 打开 · Esc 关闭');
  dialog.append(dialogHead, searchLabel, search, count, results, help); document.body.append(dialog);
  dialog.addEventListener('keydown', event => {
    if(event.key==='Escape') { event.preventDefault(); event.stopPropagation(); dialog.close(); }
  });
  let destinations = [], loadPromise;
  const fallback = [
    {href:'/learn/',en:'Start learning',zh:'从零学习'}, {href:'/build/',en:'Build a viewer',zh:'构建 Viewer'},
    {href:'/math/',en:'Math notebook',zh:'数学手册'}, {href:'/relight/',en:'Understand relighting',zh:'理解重打光'},
    {href:'/docs/',en:'Rendering field guide',zh:'渲染指南'}, {href:'/',en:'Explore the live viewer',zh:'探索实时 Viewer'}
  ];
  let headingNumber=0;
  function localEntries() {
    return [...main.querySelectorAll('h2,h3,.equation figcaption')].filter(n => !n.closest('[hidden]') || n.closest('[data-reader-section]')).map((n,i) => {
      if (!n.id) { do { headingNumber++; } while(document.getElementById('reading-heading-'+headingNumber)); n.id='reading-heading-'+headingNumber; }
      const anchor = n.closest('.equation[id]') || n;
      const name = titleText(n);
      return {href:location.pathname + location.search + '#' + anchor.id, en:name, zh:name, detail:text('On this page','本页内容'), detailZh:'本页内容'};
    }).filter(e => e.en);
  }
  function renderResults() {
    const terms = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const all = destinations.length ? destinations : fallback;
    const matches = terms.length ? [...all, ...localEntries()].filter(e => terms.every(q => [e.en,e.zh,e.detail,e.detailZh].join(' ').toLocaleLowerCase().includes(q))) : all.slice(0,6);
    const shown = matches.slice(0,40);
    results.replaceChildren(...shown.map(entry => {
      const li = make('li'), a = make('a'); a.href = withLanguage(entry.href);
      a.append(make('strong', '', text(entry.en, entry.zh)));
      if (entry.detail) a.append(make('small', '', text(entry.detail, entry.detailZh || entry.detail)));
      a.addEventListener('click', () => {
        dialog.close();
        const url = new URL(a.href);
        if (url.pathname === location.pathname && url.hash) requestAnimationFrame(() => revealTarget(url.hash));
      });
      li.append(a); return li;
    }));
    count.textContent = terms.length ? matches.length ? text(`${matches.length} results${matches.length>40?' · first 40 shown':''}`,`${matches.length} 个结果${matches.length>40?' · 显示前 40 个':''}`) : text('No results. Try a shorter term or clear the search.','没有找到。试试更短的关键词，或清空搜索。') : text('Choose what you want to do','选择你现在想做的事');
  }
  explore.addEventListener('click', () => {
    renderResults(); dialog.showModal(); search.focus();
    loadPromise ||= fetch('/site-map.json').then(r => { if (!r.ok) throw Error('Index unavailable'); return r.json(); }).then(entries => { destinations = entries; if (dialog.open) renderResults(); }).catch(() => {});
  });
  search.addEventListener('input', renderResults);

  // References and ancillary controls stay available without filling the first read.
  function fold(nodes, en, zh) {
    if (!nodes.length) return;
    const details = make('details', 'supplement');
    const summary = label(make('summary'), en, zh); summary.dataset.i18nDynamic = '';
    nodes[0].before(details); details.append(summary, ...nodes);
  }
  main.querySelectorAll('.section-refs,.refs,.references').forEach(node => fold([node], 'Sources & further reading', '来源与延伸阅读'));
  const hero = $('.math-hero') || $('.doc-hero');
  if (section === 'math') {
    fold([...main.querySelectorAll('.course-entry')], 'Related learning paths', '相关学习路线');
    fold([...main.querySelectorAll('.lesson-guide,.lesson-controls')], 'Reading tips & formula tools', '阅读提示与公式工具');
    const hints = [
      ['The first row is [fx/z, 0, −fx·x/z²]. Hold the other coordinates fixed for each derivative. Each entry converts a small world-space displacement into a displacement in pixels.', '第一行是 [fx/z, 0, −fx·x/z²]。每次只改变一个坐标，其余不动。每个元素把世界空间的小位移换成像素位移。'],
      ['Subtract the mean first: (AX+b) − E[AX+b] = A(X−E[X]). The outer product gives AΣAᵀ. Perspective divides by a changing depth, so a Jacobian gives only a local linear approximation.', '先减去均值：(AX+b) − E[AX+b] = A(X−E[X])。再做外积，得到 AΣAᵀ。透视除以会变化的深度，因此雅可比只能给出局部线性近似。'],
      ['On a black background, red in front gives RGB (0.5, 0, 0.25); blue in front gives (0.25, 0, 0.5). The front layer keeps its full weight. The back layer is multiplied by the remaining transmittance, 0.5.', '黑色背景上，红色在前得到 RGB (0.5, 0, 0.25)，蓝色在前得到 (0.25, 0, 0.5)。前层使用完整权重，后层还要乘剩余透射率 0.5。'],
      ['If normalized time s = t/T, replace every s by t/T. A coefficient of sᵏ becomes a coefficient divided by Tᵏ. Multiply temporal center and width by T to express them in seconds.', '若归一化时间 s = t/T，就把每个 s 替换为 t/T。sᵏ 的系数要除以 Tᵏ；时间中心和宽度要乘 T，才能改用秒。'],
      ['Conditioning a joint Gaussian shifts the spatial mean through the space–time cross-covariance and reduces its covariance by a Schur-complement term. STG-Lite instead evaluates explicitly learned polynomial motion; these are different model assumptions.', '对联合 Gaussian 做条件化，空间均值由时空交叉协方差决定如何偏移，空间协方差减去 Schur 补项。STG-Lite 则求值显式学习的多项式运动，两者的模型假设不同。'],
      ['Perturb one parameter in both directions and compare the central finite difference with the analytic gradient. Keep the sorted order fixed and avoid culling or clamp boundaries; repeat with several small step sizes to detect numerical error.', '只对一个参数做正负扰动，用中心差分和解析梯度比较。固定排序，避开剔除或 clamp 边界；尝试几个小步长，排除数值误差。'],
    ];
    const exercises=[...main.querySelectorAll('#checklist .exercise-list > li')];
    let reviewed=[];
    try {const saved=JSON.parse(localStorage.getItem('pajama-math-review-v1')); if(Array.isArray(saved)) reviewed=saved.filter(i=>Number.isInteger(i)&&i>=0&&i<hints.length);} catch {}
    if(exercises.length===hints.length) {
      const status=make('p','self-check-status');status.dataset.i18nDynamic='';status.setAttribute('role','status');
      exercises[0].parentElement.before(status);
      const paintChecks=()=> {
        status.textContent=text(`${reviewed.length} / 6 marked understood · your own checklist, saved on this device`,`${reviewed.length} / 6 项标记为已理解 · 个人自测清单，保存在本机`);
        exercises.forEach((item,i)=>{const b=item.querySelector('.self-check-mark');b.setAttribute('aria-pressed',String(reviewed.includes(i)));b.textContent=reviewed.includes(i)?text('Understood ✓ · undo','已理解 ✓ · 撤销'):text('I can explain this','我能解释这一项');});
      };
      exercises.forEach((item,i)=> {
        const panel=make('div','self-check');panel.dataset.i18nDynamic='';
        const details=make('details');details.append(label(make('summary'),'Check your reasoning','核对推理'),label(make('p'),...hints[i]));
        const b=button('self-check-mark');b.addEventListener('click',()=>{reviewed=reviewed.includes(i)?reviewed.filter(n=>n!==i):[...reviewed,i];try{localStorage.setItem('pajama-math-review-v1',JSON.stringify(reviewed));}catch{}paintChecks();});
        panel.append(details,b);item.append(panel);
      });
      localized.push(paintChecks);paintChecks();
    }
  }

  const bar = make('div', 'reader-bar'); bar.dataset.i18nDynamic = '';
  const readerLabel = label(make('span', 'reader-label'), ...(names[section] || names.viewer));
  const sizeButton = button(''); sizeButton.id = 'reader-size';
  const sizes = [16,18,20]; let size = 16;
  try { const stored = Number(localStorage.getItem('pajama-reading-size')); if (sizes.includes(stored)) size = stored; } catch {}
  function updateSize() {
    document.documentElement.style.setProperty('--reading-size',size+'px');
    sizeButton.textContent = text('Text','字号') + ' · ' + size;
    sizeButton.setAttribute('aria-label',text(`Text size ${size} pixels. Increase or cycle to 16.`,`字号 ${size} 像素，点击增大或循环回到 16。`));
  }
  sizeButton.addEventListener('click', () => { size = sizes[(sizes.indexOf(size)+1)%sizes.length]; updateSize(); try {localStorage.setItem('pajama-reading-size',size);} catch {} });
  updateSize();
  bar.append(readerLabel);

  const sections = [...main.querySelectorAll(':scope > .math-section[id],:scope > .doc-section[id]')];
  let current = sections[0], single = true;
  try { single = localStorage.getItem('pajama-reading-layout') !== 'all'; } catch {}
  const chooser = make('select'); chooser.id = 'reader-section';
  label(chooser,'Choose a section','选择章节','aria-label');
  const mode = button(''); mode.id = 'reader-mode';
  const pagination = make('nav','reader-pagination'); pagination.dataset.i18nDynamic = '';
  label(pagination,'Reading navigation','阅读导航','aria-label');
  const previous = button(''), next = button(''); pagination.append(previous,next);
  function targetFor(hash) { try {return document.getElementById(decodeURIComponent(hash.slice(1)));} catch {return null;} }
  function sectionFor(hash) { const target = targetFor(hash); return sections.find(s => s === target || s.contains(target)); }
  function sectionTitle(s) { return titleText(s?.querySelector('h2')) || s?.id || ''; }
  function updateSections() {
    if (!sections.length) return;
    const index = sections.indexOf(current);
    sections.forEach(s => { s.dataset.readerSection = ''; s.hidden = single && s !== current; });
    document.body.classList.toggle('reader-section',single && Boolean(location.hash));
    mode.textContent = single ? text('Show all sections','展开所有章节') : text('One section at a time','一次读一节');
    mode.setAttribute('aria-pressed', String(!single));
    chooser.replaceChildren(...sections.map((s,i) => { const option = make('option','',`${i+1} / ${sections.length} · ${sectionTitle(s)}`); option.value=s.id; return option; }));
    chooser.value = current.id;
    pagination.hidden = !single;
    previous.disabled = index===0; next.disabled = index===sections.length-1;
    previous.textContent = index>0 ? text('← Previous: ','← 上一节：')+sectionTitle(sections[index-1]) : text('First section','已是第一节');
    next.textContent = index<sections.length-1 ? text('Next: ','下一节：')+sectionTitle(sections[index+1])+' →' : text('You reached the end','已到末节');
    for(const a of document.querySelectorAll('.math-toc nav a,.toc nav a')) {
      a.classList.toggle('is-active',a.hash==='#'+current.id);
      if(a.hash==='#'+current.id) a.setAttribute('aria-current','location'); else a.removeAttribute('aria-current');
    }
  }
  function revealTarget(hash = location.hash) {
    const target = targetFor(hash); if (!target) return;
    const found = sectionFor(hash);
    if (found) { current=found; updateSections(); }
    const derivation=target.querySelector('.derivation'); if(derivation)derivation.open=true;
    for(let n=target; n && n!==main; n=n.parentElement) if(n.tagName==='DETAILS') n.open=true;
    requestAnimationFrame(() => { (single && target===current ? bar : target).scrollIntoView({block:'start',behavior:'instant'}); dispatchEvent(new Event('resize')); });
  }
  if (sections.length) {
    current = sectionFor(location.hash) || current;
    bar.append(chooser,mode,sizeButton); main.prepend(bar);
    const footer = main.querySelector(':scope > footer'); footer ? footer.before(pagination) : main.append(pagination);
    chooser.addEventListener('change',()=>{ location.hash=chooser.value; });
    mode.addEventListener('click',()=> { single=!single; try {localStorage.setItem('pajama-reading-layout',single?'single':'all');} catch {} updateSections(); revealTarget(location.hash || '#'+current.id); });
    previous.addEventListener('click',()=>{location.hash=sections[sections.indexOf(current)-1].id;});
    next.addEventListener('click',()=>{location.hash=sections[sections.indexOf(current)+1].id;});
    addEventListener('hashchange',()=>revealTarget());
    updateSections();
    if(hero) {
      const start=make('div','reader-start'); start.dataset.i18nDynamic='';
      const a=label(make('a'),'Start with the first section →','从第一节开始 →'); a.href='#'+sections[0].id;
      const hint=label(make('small'),'Or choose a topic from the section menu above.','也可以从上方菜单选择一个主题。');
      start.append(a,hint); hero.querySelector('.hero-lede,.lede')?.after(start);
    }
    if(location.hash) revealTarget();
  } else if (section!=='viewer' && !main.classList.contains('lab-shell')) {
    bar.append(sizeButton); main.prepend(bar);
    // Put actions beside the learning goal, especially on narrow screens.
    const goal = main.querySelector('.goal');
    if(goal) {
      const jumps=make('nav','reader-jumps'); jumps.dataset.i18nDynamic='';
      label(jumps,'Lesson actions','课程操作','aria-label');
      const links = [['#experiment','Try the experiment','动手实验'],['#run','Run this step','运行这一步'],['#source','Read the code','查看源码'],['#checkpoint','Check yourself','检查理解']];
      const checkpoint = main.querySelector('.checkpoint'); if(checkpoint&&!checkpoint.id) checkpoint.id='checkpoint';
      for(const [href,en,zh] of links) if($(href)) {const a=label(make('a'),en,zh);a.href=href;jumps.append(a);}
      const relightLab=main.querySelector('.milestone a[href*="/lab/"]');
      if(relightLab && !$('#run')) {const a=label(make('a'),'Try the experiment','动手实验');a.href=relightLab.href;jumps.prepend(a);}
      if(jumps.children.length) goal.after(jumps);
    }
  }
  let language = document.documentElement.lang;
  new MutationObserver(() => {
    if(language===document.documentElement.lang) return;
    language=document.documentElement.lang;
    // Existing translators finish their DOM updates before the observer runs.
    localized.forEach(paint=>paint()); updateSize(); updateSections();
    if(dialog.open)renderResults();
  }).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});

  // The math handbook already expands and restores all details for printing.
  if(section!=='math') {
    let printOpen=[];
    addEventListener('beforeprint',()=> { printOpen=[...document.querySelectorAll('.supplement')].map(n=>[n,n.open]); printOpen.forEach(([n])=>n.open=true); });
    addEventListener('afterprint',()=> {printOpen.forEach(([n,open])=>n.open=open);});
  }
}
