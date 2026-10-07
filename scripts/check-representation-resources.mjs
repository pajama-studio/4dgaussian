import { writeFile, mkdir } from 'node:fs/promises';
import { modelBase, appearanceViewer, scenes } from './representations-content.mjs';
const probes = [appearanceViewer,...scenes.flatMap(scene=>['sh','sv','nasg','nasgabor','neural'].map(mode=>`${modelBase}/${mode}/${scene}.ngsplat`))];
const resources=[];
// Sequential requests avoid hammering the model host. HEAD never downloads model bodies.
for(const url of probes) {
  let item;
  try {
    const response=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(20000)});
    item={url,status:response.status,ok:response.ok,bytes:Number(response.headers.get('content-length'))||null,contentType:response.headers.get('content-type'),framing:response.headers.get('x-frame-options'),csp:response.headers.get('content-security-policy')};
  } catch(error) {item={url,ok:false,error:error.message};}
  resources.push(item);console.log(`${item.ok?'OK':'FAIL'} ${url.split('/').slice(-2).join('/')} ${item.status||item.error} ${item.bytes||''}`);
}
const result={checkedAt:new Date().toISOString(),method:'HTTP HEAD with redirects. No model bodies downloaded by this check.',scope:'Availability only. This does not prove valid model contents, image quality, browser compatibility, or performance.',resources};
await mkdir(new URL('../public/representations/',import.meta.url),{recursive:true});
await writeFile(new URL('../public/representations/resource-checks.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
if(resources.some(r=>!r.ok)) process.exitCode=1;
