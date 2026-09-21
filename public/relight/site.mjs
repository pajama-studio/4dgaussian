const key='pajama-math-language';
let stored;try{stored=localStorage.getItem(key);}catch{}
const requested=new URL(location.href).searchParams.get('lang');
function language(next){
 document.documentElement.lang=next==='zh'?'zh-CN':'en';
 for(const node of document.querySelectorAll('[data-copy]'))node.hidden=node.dataset.copy!==next;
 for(const node of document.querySelectorAll('[data-language]'))node.setAttribute('aria-pressed',String(node.dataset.language===next));
 for(const option of document.querySelectorAll('option[data-en]'))option.textContent=option.dataset[next];
 for(const a of document.querySelectorAll('a[href]')){
  if(a.getAttribute('href').startsWith('#'))continue;
  const url=new URL(a.href,location.href);
  if(url.origin===location.origin&&/^\/(math|learn|build|relight)\//.test(url.pathname)){url.searchParams.set('lang',next);a.href=url.pathname+url.search+url.hash;}
 }
 const url=new URL(location.href);url.searchParams.set('lang',next);history.replaceState(null,'',url);
 try{localStorage.setItem(key,next);}catch{}
 document.dispatchEvent(new CustomEvent('relight-language'));
}
for(const button of document.querySelectorAll('[data-language]'))button.onclick=()=>language(button.dataset.language);
for(const button of document.querySelectorAll('[data-copy-code]'))button.onclick=async()=>{
 try{await navigator.clipboard.writeText(document.getElementById(button.dataset.copyCode).textContent);button.textContent=document.documentElement.lang==='en'?'Copied':'已复制';}
 catch{button.textContent=document.documentElement.lang==='en'?'Select the code to copy':'请选中代码复制';}
};
const syllabus=document.getElementById('relight-syllabus');if(syllabus&&matchMedia('(min-width:1101px)').matches)syllabus.open=true;
language(['en','zh'].includes(requested)?requested:stored==='zh'?'zh':'en');
