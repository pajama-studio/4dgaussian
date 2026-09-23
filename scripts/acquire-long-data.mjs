// Pinned author-published TRAINING data. This does not manufacture a 4DGS model.
import {mkdir,writeFile,stat,rename,createReadStream,createWriteStream} from 'node:fs';
import {promisify} from 'node:util';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import path from 'node:path';
const revision='17d0f77ec65516102806d038d83bcc0583ea0aab',repo='turandai/4DGV_DeskGames';
const root=path.resolve('artifacts/datasets/4dgv-cube');
const entries=await (await fetch(`https://huggingface.co/api/datasets/${repo}/tree/${revision}/cube?recursive=true`)).json();
const files=entries.filter(f=>f.type==='file'&&(/cube\/videos\/cam\d+\.mp4$/.test(f.path)||/cube\/colmap\/sparse\/0\/(cameras|images|points3D)\.bin$/.test(f.path)));
const manifest={repo,revision,representation:'Training RGB videos + calibrated COLMAP data; no dynamic Gaussian checkpoint',files:files.map(f=>({path:f.path,size:f.size,sha256:f.lfs?.oid??null,url:`https://huggingface.co/datasets/${repo}/resolve/${revision}/${f.path}`}))};
await promisify(mkdir)(root,{recursive:true});await promisify(writeFile)(path.join(root,'acquisition.json'),JSON.stringify(manifest,null,2));
console.log(`${files.length} files; ${(files.reduce((s,f)=>s+f.size,0)/1e9).toFixed(3)} GB; ${root}`);
if(!process.argv.includes('--download')){console.log('Manifest only. Add --download to acquire the pinned files, with resume and SHA-256 verification.');process.exit(0);}
async function sha(file){const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');}
const results=[];let cursor=0;
await Promise.all(Array.from({length:2},async()=>{
 while(cursor<manifest.files.length){const f=manifest.files[cursor++];const dest=path.join(root,f.path);await promisify(mkdir)(path.dirname(dest),{recursive:true});
  const existing=await promisify(stat)(dest).catch(()=>null);
  if(existing?.size===f.size&&(!f.sha256||await sha(dest)===f.sha256)){results.push({...f,status:'verified-existing'});continue;}
  const temporary=dest+'.part';let size=(await promisify(stat)(temporary).catch(()=>null))?.size??0;
  if(size>f.size)throw Error('Partial file larger than pinned source');
  if(size<f.size){const response=await fetch(f.url,{headers:size?{Range:`bytes=${size}-`}:{}});if(!response.ok)throw Error(`Download HTTP ${response.status}`);if(size&&response.status!==206)throw Error('Resume not honored');await pipeline(Readable.fromWeb(response.body),createWriteStream(temporary,{flags:size?'a':'w'}));}
  if((await promisify(stat)(temporary)).size!==f.size)throw Error(`Length mismatch: ${f.path}`);
  const digest=await sha(temporary);if(f.sha256&&digest!==f.sha256)throw Error(`Checksum mismatch: ${f.path}`);
  await promisify(rename)(temporary,dest);results.push({...f,sha256:digest,status:'verified'});console.log(`Verified ${results.length}/${manifest.files.length}: ${f.path}`);
 }
}));
await promisify(writeFile)(path.join(root,'verified.json'),JSON.stringify({repo,revision,files:results},null,2));
console.log('Acquisition complete. These are training inputs, not renderer benchmark frames.');
