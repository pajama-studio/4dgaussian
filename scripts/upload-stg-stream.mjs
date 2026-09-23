import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
const [directory,mode='remote']=process.argv.slice(2);
if(!directory||!['remote','local'].includes(mode))throw Error('Usage: upload-stg-stream directory [remote|local]');
const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));
async function upload(name){
  const args=['node_modules/wrangler/bin/wrangler.js','r2','object','put',`pajama-gaussian-streams/${manifest.id}/${name}`,'--file',path.join(directory,name),`--${mode}`,'--content-type',name.endsWith('.json')?'application/json':'application/octet-stream'];
  for(let attempt=0;attempt<3;attempt++){
    const result=await new Promise(resolve=>{const child=spawn(process.execPath,args,{windowsHide:true});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('close',code=>resolve({code,output}));child.on('error',e=>resolve({code:1,output:e.message}));});
    if(result.code===0)return;
    if(attempt===2)throw Error(`Upload ${name}: ${result.output}`);
  }
}
let cursor=0,done=0;
await Promise.all(Array.from({length:4},async()=>{while(cursor<manifest.chunks.length){const c=manifest.chunks[cursor++];await upload(c.name);done++;if(done%20===0)console.log(`${manifest.id}: ${done}/${manifest.chunks.length}`);}}));
// Publish the index only after every immutable object exists.
await upload('manifest.json');
console.log(`Published ${manifest.id}: ${done} chunks, ${mode}`);
