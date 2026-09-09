// Race the whole operation, including response bodies, instead of relying on
// browser-specific AbortSignal.timeout/any support or fetch cancellation alone.
export async function withDeadline(run,{signal,timeoutMs}={}){
 const controller=new AbortController();let timer,onAbort;
 const interrupted=new Promise((_,reject)=>{
  const stop=reason=>{controller.abort(reason);reject(reason);};
  onAbort=()=>stop(signal.reason||new DOMException('Request cancelled','AbortError'));
  if(signal?.aborted){onAbort();return;}
  signal?.addEventListener('abort',onAbort,{once:true});
  timer=setTimeout(()=>stop(new DOMException('Request timed out','TimeoutError')),timeoutMs);
 });
 try{
  return await Promise.race([Promise.resolve().then(()=>{if(controller.signal.aborted)throw controller.signal.reason;return run(controller.signal);}),interrupted]);
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);}
}
