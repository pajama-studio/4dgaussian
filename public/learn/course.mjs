import { mountLab } from './labs.mjs';
const data=JSON.parse(document.querySelector('#course-data').textContent);
const languageKey='pajama-math-language',progressKey='pajama-learn-progress-v1';
let language='en',state={reviewed:[],steps:{},last:''},activeStep=0,allSteps=false;
try {const stored=JSON.parse(localStorage.getItem(progressKey));if(stored&&typeof stored==='object'){
 const valid=new Set(data.lessons.map(l=>l.id));
 state.reviewed=Array.isArray(stored.reviewed)?[...new Set(stored.reviewed.filter(id=>valid.has(id)))]:[];
 state.steps=stored.steps&&typeof stored.steps==='object'&&!Array.isArray(stored.steps)?stored.steps:{};
 state.last=valid.has(stored.last)?stored.last:'';
}}catch{/* Local progress is optional. */}
const text=(en,zh)=>language==='zh'?zh:en;
const save=()=>{try{localStorage.setItem(progressKey,JSON.stringify(state));}catch{document.querySelector('#review-note')?.replaceChildren(text('Storage is unavailable; progress lasts for this page only.','存储不可用，进度仅在当前页面有效。'));}};
function updateProgress(){
 document.querySelector('#progress-count').textContent=`${state.reviewed.length} / ${data.lessons.length}`;
 document.querySelector('#course-progress').value=state.reviewed.length;
 document.querySelectorAll('[data-lesson-link]').forEach(el=>el.classList.toggle('is-reviewed',state.reviewed.includes(el.dataset.lessonLink)));
 const button=document.querySelector('#mark-reviewed');if(button){const reviewed=state.reviewed.includes(data.current);button.setAttribute('aria-pressed',reviewed);button.textContent=reviewed?text('Reviewed ✓ · remove mark','已复习 ✓ · 取消标记'):text('Mark this lesson reviewed','标记本课已复习');}
 const resume=document.querySelector('#resume-course');if(resume&&state.last){const lesson=data.lessons.find(l=>l.id===state.last);resume.href=`/learn/${lesson.id}/?lang=${language}`;resume.textContent=text(`Continue lesson ${lesson.id.slice(0,2)} →`,`继续第 ${lesson.id.slice(0,2)} 课 →`);}
}
function renderSteps(focus=false){
 const panels=[...document.querySelectorAll('[data-step]')];if(!panels.length)return;
 panels.forEach((p,i)=>p.hidden=!allSteps&&i!==activeStep);
 document.querySelectorAll('[data-step-select]').forEach(b=>b.setAttribute('aria-pressed',Number(b.dataset.stepSelect)===activeStep));
 document.body.classList.toggle('read-all',allSteps);
 document.querySelector('#step-prev').disabled=activeStep===0||allSteps;
 document.querySelector('#step-next').disabled=activeStep===panels.length-1||allSteps;
 document.querySelector('#step-all').textContent=allSteps?text('Return to one step','返回分步阅读'):text('Read all steps','展开所有步骤');
 state.steps[data.current]=activeStep;save();
 if(focus)panels[activeStep].querySelector('h3').focus({preventScroll:true});
}
const feedback=new Map();
function paintFeedback(index){
 const field=document.querySelector(`[data-quiz="${index}"]`),choice=feedback.get(index),node=field.querySelector('.quiz-feedback'),q=data.quizzes[index];
 node.hidden=false;node.classList.toggle('correct',choice===q.answer);
 node.textContent=choice===null?text('Choose an answer first.','请先选择一个答案。'):(choice===q.answer?'':text('Try again. ','再想一想。 '))+q.feedback[choice][language];
}
function setLanguage(next,remember=true){
 language=['en','zh'].includes(next)?next:'en';
 const anchor=[...document.querySelectorAll('.step-panel:not([hidden]),.checkpoint,.lesson-hero')].find(n=>n.getBoundingClientRect().bottom>150);
 const top=anchor?.getBoundingClientRect().top;
 document.documentElement.lang=language==='zh'?'zh-CN':'en';
 document.querySelectorAll('[data-copy]').forEach(el=>el.hidden=el.dataset.copy!==language);
 document.querySelectorAll('[data-language]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.language===language));
 if(remember){try{localStorage.setItem(languageKey,language);}catch{}const url=new URL(location.href);url.searchParams.set('lang',language);history.replaceState(null,'',url);}
 document.querySelectorAll('a[href]').forEach(a=>{const u=new URL(a.href,location.href);if(u.origin===location.origin&&/^\/(learn|math|build|relight)\//.test(u.pathname)){u.searchParams.set('lang',language);a.href=u.pathname+u.search+u.hash;}});
 updateProgress();renderSteps();feedback.forEach((_,index)=>paintFeedback(index));
 document.dispatchEvent(new CustomEvent('learn:language',{detail:language}));
 if(remember&&anchor&&top!==undefined)scrollBy({top:anchor.getBoundingClientRect().top-top,behavior:'instant'});
}
const panels=document.querySelectorAll('[data-step]');
if(data.current){state.last=data.current;activeStep=Math.max(0,Math.min(panels.length-1,Number.isInteger(state.steps[data.current])?state.steps[data.current]:0));save();}
document.querySelectorAll('[data-step-select]').forEach(b=>b.addEventListener('click',()=>{activeStep=Number(b.dataset.stepSelect);allSteps=false;renderSteps(true);}));
document.querySelector('#step-next')?.addEventListener('click',()=>{activeStep++;renderSteps(true);});
document.querySelector('#step-prev')?.addEventListener('click',()=>{activeStep--;renderSteps(true);});
document.querySelector('#step-all')?.addEventListener('click',()=>{allSteps=!allSteps;renderSteps();});
document.querySelector('#mark-reviewed')?.addEventListener('click',()=>{state.reviewed=state.reviewed.includes(data.current)?state.reviewed.filter(id=>id!==data.current):[...state.reviewed,data.current];save();updateProgress();});
document.querySelectorAll('[data-quiz]').forEach(field=>{const index=Number(field.dataset.quiz);field.querySelector('.check-answer').addEventListener('click',()=>{const chosen=field.querySelector('input:checked');feedback.set(index,chosen?Number(chosen.value):null);paintFeedback(index);});field.addEventListener('change',()=>{feedback.delete(index);field.querySelector('.quiz-feedback').hidden=true;});});
document.querySelectorAll('[data-language]').forEach(b=>b.addEventListener('click',()=>setLanguage(b.dataset.language)));
let storedLanguage;try{storedLanguage=localStorage.getItem(languageKey);}catch{}
const requested=new URL(location.href).searchParams.get('lang');
setLanguage(['en','zh'].includes(requested)?requested:['en','zh'].includes(storedLanguage)?storedLanguage:'en',false);
if(['en','zh'].includes(requested)){try{localStorage.setItem(languageKey,requested);}catch{}}
if(document.querySelector('[data-lab]'))mountLab(document.querySelector('[data-lab]').dataset.lab,()=>language);
if(matchMedia('(min-width:1101px)').matches)document.querySelector('#syllabus').open=true;
