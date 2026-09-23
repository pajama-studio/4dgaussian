export class TemporalStream {
  constructor(id, {budgetBytes=64*1024*1024, onProgress=()=>{}}={}) {
    this.id=id; this.budget=budgetBytes; this.progress=onProgress;
    this.cache=new Map(); this.cacheBytes=0; this.networkBytes=0; this.requests=0; this.generation=0;
  }
  async open() {
    const r=await fetch(`/api/gaussians/${this.id}/manifest`);
    if (!r.ok) throw Error(`Manifest: HTTP ${r.status}`);
    this.manifest=await r.json();
    if(this.manifest.schema!=='pajama.stg.stream.v1')throw Error('Unsupported stream format');
    return this.manifest;
  }
  cancel() { this.generation++; this.controller?.abort(); }
  async window(start,end) {
    this.cancel(); const generation=this.generation;
    const controller=new AbortController();this.controller=controller;
    const signal=controller.signal;
    const started=performance.now();
    const response=await fetch(`/api/gaussians/${this.id}/range?start=${start}&end=${end}`,{signal});
    if(!response.ok)throw Error(`Time range: HTTP ${response.status}`);
    const range=await response.json();
    const needed=new Set(range.chunks.map(c=>c.name));
    const decoded=range.chunks.reduce((n,c)=>n+c.decodedBytes,0);
    if(decoded>this.budget)throw Error('This time window exceeds the decoded residency budget');
    // Reserve space for all missing active objects; keep recently used inactive
    // chunks until memory pressure requires eviction (important when seeking back).
    const missingBytes=range.chunks.filter(c=>!this.cache.has(c.name)).reduce((n,c)=>n+c.decodedBytes,0);
    for(const [name,bytes] of this.cache){
      if(this.cacheBytes+missingBytes<=this.budget)break;
      if(!needed.has(name)){this.cache.delete(name);this.cacheBytes-=bytes.byteLength;}
    }
    let cursor=0,completed=0,hits=0,received=0;
    const worker=async()=>{
      while(cursor<range.chunks.length){
        const chunk=range.chunks[cursor++];
        if(this.cache.has(chunk.name)){const cached=this.cache.get(chunk.name);this.cache.delete(chunk.name);this.cache.set(chunk.name,cached);hits++;completed++;continue;}
        const r=await fetch(chunk.url,{signal});
        if(!r.ok)throw Error(`Chunk: HTTP ${r.status}`);
        const compressed=await r.arrayBuffer();
        if(compressed.byteLength!==chunk.bytes)throw Error('Truncated chunk');
        const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',compressed)),b=>b.toString(16).padStart(2,'0')).join('');
        if(digest!==chunk.sha256)throw Error('Chunk checksum mismatch');
        const bytes=new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
        if(bytes.length!==chunk.decodedBytes || bytes.length!==chunk.count*132)throw Error('Invalid decoded chunk size');
        if(generation!==this.generation || signal.aborted)throw new DOMException('Superseded seek','AbortError');
        this.cache.set(chunk.name,bytes);this.cacheBytes+=bytes.byteLength;
        this.networkBytes+=compressed.byteLength;this.requests++;received+=compressed.byteLength;completed++;
        this.progress({completed,total:range.chunks.length,received,cacheBytes:this.cacheBytes});
      }
    };
    try { await Promise.all(Array.from({length:Math.min(4,range.chunks.length)},worker)); }
    catch(error) { controller.abort(); throw error; }
    if(generation!==this.generation)throw new DOMException('Superseded seek','AbortError');
    const rows=range.chunks.map(c=>this.cache.get(c.name));
    const ply=assemble(rows,this.manifest.headerTemplate,this.manifest.sourceCount);
    return {ply,start,end,generation,stats:{seekMs:performance.now()-started,received,cacheHits:hits,selectedChunks:range.chunks.length,cacheBytes:this.cacheBytes,requests:this.requests,networkBytes:this.networkBytes}};
  }
}

// Merge by original source ID so streaming preserves global equal-depth ordering.
export function assemble(chunks,headerTemplate,sourceCount) {
  const count=chunks.reduce((n,b)=>n+b.length/132,0);
  const rows=new Uint8Array(count*132);let offset=0;
  for(const chunk of chunks){if(chunk.length%132)throw Error('Misaligned chunk');rows.set(chunk,offset);offset+=chunk.length;}
  const view=new DataView(rows.buffer);
  const order=Uint32Array.from({length:count},(_,i)=>i);
  order.sort((a,b)=>view.getUint32(a*132,true)-view.getUint32(b*132,true));
  const header=new TextEncoder().encode(headerTemplate.replace('COUNT',String(count)));
  const ply=new Uint8Array(header.length+count*128);ply.set(header);
  let last=-1;
  for(let i=0;i<count;i++){
    const row=order[i],id=view.getUint32(row*132,true);
    if(id<=last || id>=sourceCount)throw Error('Duplicate or invalid original Gaussian ID');last=id;
    ply.set(rows.subarray(row*132+4,row*132+132),header.length+i*128);
  }
  return ply;
}
