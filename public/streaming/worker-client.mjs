export class WorkerStream {
  constructor(id,onProgress=()=>{}){
    this.id=id;this.serial=0;this.pending=new Map();
    this.worker=new Worker(new URL('./stream-worker.mjs',import.meta.url),{type:'module'});
    this.worker.onmessage=({data})=>{
      if(data.type==='progress'){onProgress(data.progress);return;}
      const job=this.pending.get(data.id);if(!job)return;this.pending.delete(data.id);
      if(data.error){const error=new Error(data.error.message);error.name=data.error.name;job.reject(error);}else job.resolve(data.result);
    };
    this.worker.onerror=event=>{for(const job of this.pending.values())job.reject(new Error(event.message||'Streaming worker failed'));this.pending.clear();};
  }
  request(type,args={}){return new Promise((resolve,reject)=>{const id=++this.serial;this.pending.set(id,{resolve,reject});this.worker.postMessage({id,type,...args});});}
  open(){return this.request('open',{scene:this.id});}
  window(start,end,residentKey=''){return this.request('window',{start,end,residentKey});}
  cancel(){this.worker.postMessage({type:'cancel'});}
  dispose(){this.worker.terminate();for(const p of this.pending.values())p.reject(new DOMException('Scene replaced','AbortError'));this.pending.clear();}
}
