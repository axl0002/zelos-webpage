export class LabError extends Error{}
export async function labRequest(path:string,signal:AbortSignal,body?:unknown){
 const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener("abort",abort,{once:true});if(signal.aborted)controller.abort();let timedOut=false;
 let interrupted!:()=>void;const stopped=new Promise<never>((_,reject)=>{interrupted=()=>reject(new Error("Request aborted"));controller.signal.addEventListener("abort",interrupted,{once:true});if(controller.signal.aborted)interrupted();});
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},60000);
 try{return await Promise.race([stopped,(async()=>{const r=await fetch("/admin/api/scoring-lab"+path,{signal:controller.signal,cache:"no-store",...(body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})});const v=await r.json();if(!r.ok)throw new LabError(typeof v?.error==="string"?v.error:"The scoring lab could not finish. Try again.");return v;})()]);}
 catch(error){if(timedOut)throw new LabError("The request timed out. Refresh library and comparison history before retrying; a save may have finished.");throw error;}
 finally{clearTimeout(timer);signal.removeEventListener("abort",abort);controller.signal.removeEventListener("abort",interrupted);}
}
