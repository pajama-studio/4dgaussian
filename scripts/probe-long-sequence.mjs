// Read MP4 metadata via HTTP Range, without downloading/pretending to render RGB video.
import {writeFile,mkdir} from 'node:fs/promises';
const repo='turandai/4DGV_DeskGames';
const metadata=await (await fetch(`https://huggingface.co/api/datasets/${repo}`)).json();
const revision=metadata.sha;
if(!/^[a-f0-9]{40}$/.test(revision))throw Error('Missing immutable dataset revision');
const entries=await (await fetch(`https://huggingface.co/api/datasets/${repo}/tree/${revision}/cube/videos`)).json();
const url=`https://huggingface.co/datasets/${repo}/resolve/${revision}/cube/videos/cam00.mp4`;
const head=await fetch(url,{method:'HEAD'});const size=Number(head.headers.get('content-length'));
async function range(start,length){const r=await fetch(url,{headers:{Range:`bytes=${start}-${start+length-1}`}});if(r.status!==206)throw Error(`Range not supported: ${r.status}`);const b=Buffer.from(await r.arrayBuffer());if(b.length!==length)throw Error('Truncated range');return b;}
let moov;
for(let offset=0;offset<size;){const h=await range(offset,16);let length=h.readUInt32BE(0);const type=h.toString('ascii',4,8);if(length===1)length=Number(h.readBigUInt64BE(8));if(length<8||offset+length>size)throw Error('Invalid MP4 atom');if(type==='moov'){if(length>8*1024*1024)throw Error('Metadata exceeds bound');moov=await range(offset,length);break;}offset+=length;}
if(!moov)throw Error('No MP4 metadata');
function boxes(b,start=8,end=b.length){const result=[];for(let i=start;i+8<=end;){const n=b.readUInt32BE(i);if(n<8||i+n>end)throw Error('Invalid child atom');result.push({type:b.toString('ascii',i+4,i+8),bytes:b.subarray(i,i+n)});i+=n;}return result;}
let video;
for(const track of boxes(moov).filter(a=>a.type==='trak')){
  const mdia=boxes(track.bytes).find(a=>a.type==='mdia');if(!mdia)continue;
  const children=boxes(mdia.bytes),handler=children.find(a=>a.type==='hdlr');if(handler?.bytes.toString('ascii',16,20)!=='vide')continue;
  const mdhd=children.find(a=>a.type==='mdhd').bytes,version=mdhd[8];
  const timescale=mdhd.readUInt32BE(version===1?28:20),duration=version===1?Number(mdhd.readBigUInt64BE(32)):mdhd.readUInt32BE(24);
  const minf=children.find(a=>a.type==='minf'),stbl=boxes(minf.bytes).find(a=>a.type==='stbl'),stsz=boxes(stbl.bytes).find(a=>a.type==='stsz').bytes;
  const frames=stsz.readUInt32BE(16);video={frames,durationSeconds:duration/timescale,meanFps:frames/(duration/timescale)};
}
if(!video)throw Error('No video track');
const report={dataset:repo,revision,probeUrl:url,sourceFileBytes:size,...video,cameraCount:entries.length,cubeVideoBytes:entries.reduce((n,e)=>n+e.size,0),representation:'RGB multi-view training input, NOT a renderable 4D Gaussian checkpoint',license:'No license asserted by this probe; verify dataset terms before redistribution',project:'https://turandai.github.io/projects/4d_gaussian_video/'};
await mkdir('artifacts/streaming',{recursive:true});await writeFile('artifacts/streaming/long-sequence.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
