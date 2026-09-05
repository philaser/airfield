import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';

export const FRESH_MS=10_000, MAX_STALE_MS=10*60_000;
export function retryDelay(value,now){
 const seconds=Number(value);
 return Math.max(60_000,Number.isFinite(seconds)&&value!==null?seconds*1000:(Date.parse(value)-now)||60_000);
}

// A single shared cache and cooldown protects the public feed across browser tabs.
export function createTrafficService({airports,fetcher=fetch,clock=Date.now,cachePath,contact}={}){
 const cache=new Map(),pending=new Map();let nextRequestAt=0,failures=0;
 const ready=cachePath?readFile(cachePath,'utf8').then(s=>{for(const [id,snapshot] of JSON.parse(s)){if(clock()-snapshot.fetchedAt<MAX_STALE_MS)cache.set(id,snapshot);}}).catch(()=>{}):Promise.resolve();
 const persist=async()=>{if(!cachePath)return;try{await mkdir(dirname(cachePath),{recursive:true});await writeFile(cachePath,JSON.stringify([...cache]));}catch{}};
 function result(snapshot,error=null){
  const usable=snapshot&&clock()-snapshot.fetchedAt<MAX_STALE_MS;
  return {source:'ADSB.lol',snapshot:usable?snapshot:null,state:usable?(clock()-snapshot.fetchedAt<FRESH_MS?'current':'stale'):'unavailable',message:error,retryAt:Math.max(nextRequestAt,usable?snapshot.fetchedAt+FRESH_MS:0)};
 }
 async function get(id){
  await ready;
  const airport=airports.find(a=>a.id===id);if(!airport)throw new Error('Unknown airport');
  const snapshot=cache.get(id);
  if(snapshot&&clock()-snapshot.fetchedAt<FRESH_MS)return result(snapshot);
  if(!contact)return {...result(snapshot,'The public feed requires a project contact before connecting.'),retryAt:clock()+60000};
  if(pending.has(id))return pending.get(id);
  if(clock()<nextRequestAt)return result(snapshot,'Waiting before the next public-feed request.');
  nextRequestAt=clock()+5000;
  const request=(async()=>{
   try{
    const r=await fetcher(`https://api.adsb.lol/v2/point/${airport.lat}/${airport.lon}/10`,{headers:{'User-Agent':`Airfield/0.1 (${contact})`},signal:AbortSignal.timeout(15000)});
    if(!r.ok){
     const delay=r.status===429?retryDelay(r.headers.get('retry-after'),clock()):[401,403].includes(r.status)?3600000:Math.min(300_000,30_000*2**failures);
     nextRequestAt=Math.max(nextRequestAt,clock()+delay);throw new Error(r.status===429?'Public feed is rate limited. Retrying automatically.':[401,403].includes(r.status)?'Public feed declined access. Check the project contact.':'Public feed is temporarily unavailable.');
    }
    const body=await r.json();
    if(!Array.isArray(body.ac)||!Number.isFinite(body.now))throw new Error('Public feed returned an invalid snapshot.');
    const sourceTime=body.now<1e12?body.now*1000:body.now;
    if(Math.abs(clock()-sourceTime)>120_000)throw new Error('Public feed returned an outdated snapshot.');
    const fresh={ac:body.ac,sourceTime,fetchedAt:clock()};failures=0;cache.delete(id);cache.set(id,fresh);
    while(cache.size>24)cache.delete(cache.keys().next().value);
    await persist();return result(fresh);
   }catch(e){failures++;nextRequestAt=Math.max(nextRequestAt,clock()+Math.min(300_000,30_000*2**(failures-1)));return result(snapshot,e.name==='TimeoutError'?'Public feed timed out. Retrying automatically.':e.message);}
   finally{pending.delete(id);}
  })();pending.set(id,request);return request;
 }
 return {get};
}

export function trafficMiddleware(service){
 return async(req,res,next)=>{
  const url=new URL(req.url,'http://localhost');if(url.pathname!=='/api/traffic')return next();
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.statusCode=405;return res.end(JSON.stringify({error:'GET required'}));}
  try{res.end(JSON.stringify(await service.get(url.searchParams.get('airport'))));}
  catch{res.statusCode=400;res.end(JSON.stringify({error:'Unknown airport'}));}
 };
}
