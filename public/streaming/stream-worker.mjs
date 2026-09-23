import {TemporalStream,focusCenter} from './loader.mjs';
let stream;
self.onmessage=async({data:{id,type,scene,start,end,residentKey}})=>{
  if(type==='cancel'){stream?.cancel();return;}
  try{
    if(type==='open'){
      stream=new TemporalStream(scene,{onProgress:progress=>self.postMessage({type:'progress',progress})});
      self.postMessage({id,result:await stream.open()});
    }else if(type==='window'){
      const result=await stream.window(start,end,{residentKey});
      if(result.ply)result.focus=focusCenter(result.ply);
      self.postMessage({id,result},result.ply?[result.ply.buffer]:[]);
    }
  }catch(error){self.postMessage({id,error:{name:error.name,message:error.message}});}
};
