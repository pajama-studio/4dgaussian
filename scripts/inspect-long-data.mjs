// Inspect all acquired MP4s and COLMAP metadata without decoding 126,000 images.
import {open,readFile,writeFile} from 'node:fs/promises';
const root='artifacts/datasets/4dgv-cube';
const verified=JSON.parse(await readFile(`${root}/verified.json`,'utf8'));
function boxes(b){const out=[];for(let p=8;p+8<=b.length;){const n=b.readUInt32BE(p);if(n<8||p+n>b.length)throw Error('Invalid MP4 child');out.push({type:b.toString('ascii',p+4,p+8),bytes:b.subarray(p,p+n)});p+=n;}return out;}
const videos=[];
for(const entry of verified.files.filter(f=>f.path.endsWith('.mp4'))){
  const file=await open(`${root}/${entry.path}`);let moov;
  try{for(let p=0;p<entry.size;){const h=Buffer.alloc(16);await file.read(h,0,16,p);let n=h.readUInt32BE(0);if(n===1)n=Number(h.readBigUInt64BE(8));if(n<8||p+n>entry.size)throw Error('Invalid MP4 atom');if(h.toString('ascii',4,8)==='moov'){if(n>8*1024*1024)throw Error('Metadata limit');moov=Buffer.alloc(n);await file.read(moov,0,n,p);break;}p+=n;}}finally{await file.close();}
  if(!moov)throw Error('Missing movie metadata');
  for(const track of boxes(moov).filter(b=>b.type==='trak')){
    const children=boxes(track.bytes),mdia=children.find(b=>b.type==='mdia');if(!mdia)continue;
    const md=boxes(mdia.bytes);if(md.find(b=>b.type==='hdlr')?.bytes.toString('ascii',16,20)!=='vide')continue;
    const tk=children.find(b=>b.type==='tkhd').bytes,clock=md.find(b=>b.type==='mdhd').bytes,v=clock[8];
    const scale=clock.readUInt32BE(v===1?28:20),duration=v===1?Number(clock.readBigUInt64BE(32)):clock.readUInt32BE(24);
    const stbl=boxes(md.find(b=>b.type==='minf').bytes).find(b=>b.type==='stbl'),samples=boxes(stbl.bytes).find(b=>b.type==='stsz').bytes;
    videos.push({path:entry.path,frames:samples.readUInt32BE(16),durationSeconds:duration/scale,width:tk.readUInt32BE(tk.length-8)/65536,height:tk.readUInt32BE(tk.length-4)/65536});
  }
}
if(videos.length!==21||videos.some(v=>v.frames!==6000||v.durationSeconds!==200))throw Error('Unexpected sequence length');
const c=await readFile(`${root}/cube/colmap/sparse/0/cameras.bin`);
if(c.readBigUInt64LE(0)!==1n||c.readInt32LE(12)!==1)throw Error('Expected one PINHOLE calibration');
const calibration={cameraId:c.readInt32LE(8),model:'PINHOLE',width:Number(c.readBigUInt64LE(16)),height:Number(c.readBigUInt64LE(24)),fx:c.readDoubleLE(32),fy:c.readDoubleLE(40),cx:c.readDoubleLE(48),cy:c.readDoubleLE(56)};
const images=await readFile(`${root}/cube/colmap/sparse/0/images.bin`);let p=8;const poses=[];
for(let i=0;i<Number(images.readBigUInt64LE(0));i++){const cameraId=images.readInt32LE(p+60);p+=64;const end=images.indexOf(0,p),name=images.toString('utf8',p,end);p=end+1;const points=Number(images.readBigUInt64LE(p));p+=8+points*24;poses.push({name,cameraId});}
if(p!==images.length||poses.length!==21)throw Error('Calibration parse mismatch');
const report={schema:'pajama.training-input-inspection.v1',revision:verified.revision,bytes:verified.files.reduce((n,f)=>n+f.size,0),verifiedFiles:verified.files.length,videos,calibration,poses,dimensionsMatch:videos.every(v=>v.width===calibration.width&&v.height===calibration.height),note:'Metadata checks only; pose-to-video correspondence, synchronization and reconstruction quality still require decoded-frame validation.'};
await writeFile('artifacts/streaming/long-input-inspection.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({videos:videos.length,frames:videos[0].frames,seconds:videos[0].durationSeconds,videoSize:[videos[0].width,videos[0].height],calibrationSize:[calibration.width,calibration.height],dimensionsMatch:report.dimensionsMatch,bytes:report.bytes}));
