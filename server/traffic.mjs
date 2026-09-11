import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';

export const FRESH_MS=3_000, MAX_STALE_MS=10*60_000;
export function retryDelay(value,now){
 const seconds=Number(value);
 return Math.max(60_000,Number.isFinite(seconds)&&value!==null?seconds*1000:(Date.parse(value)-now)||60_000);
}

function openSkyUrls(airport){
 const latDelta=10/60,lonDelta=Math.min(180,latDelta/Math.max(.001,Math.cos(airport.lat*Math.PI/180)));
 const min=airport.lon-lonDelta,max=airport.lon+lonDelta;
 const ranges=min < -180?[[min+360,180],[-180,max]]:max > 180?[[min,180],[-180,max-360]]:[[min,max]];
 return ranges.map(([west,east])=>`https://opensky-network.org/api/states/all?lamin=${Math.max(-90,airport.lat-latDelta)}&lomin=${west}&lamax=${Math.min(90,airport.lat+latDelta)}&lomax=${east}&extended=1`);
}
function normalize(body,source){
 if(source!=='OpenSky'){
  if(!Array.isArray(body.ac)||!Number.isFinite(body.now))throw new Error('Invalid snapshot.');
  return {ac:body.ac,sourceTime:body.now<1e12?body.now*1000:body.now};
 }
 if(!Number.isFinite(body.time)||(body.states!==null&&!Array.isArray(body.states)))throw new Error('Invalid snapshot.');
 const categories={2:'A1',3:'A2',4:'A3',5:'A4',6:'A5',7:'A6',8:'A7',16:'C1',17:'C2',18:'C3',19:'C4',20:'C5'};
 const ac=(body.states||[]).filter(Array.isArray).map(s=>({
  hex:s[0],flight:s[1],lon:s[5],lat:s[6],alt_baro:s[8]===true?'ground':Number.isFinite(s[7])?s[7]*3.28084:undefined,
  seen_pos:Number.isFinite(s[3])?body.time-s[3]:undefined,
  gs:Number.isFinite(s[9])?s[9]*1.9438444924406:undefined,track:Number.isFinite(s[10])?s[10]:undefined,
  category:categories[s[17]],type:({0:'adsb_icao',1:'asterix',2:'mlat',3:'flarm'})[s[16]],
 }));
 return {ac,sourceTime:body.time*1000};
}
function hasGround(snapshot){
 return snapshot.ac.some(a=>a&&a.hex&&a.alt_baro==='ground'&&a.t!=='TWR'&&!['C3','C4','C5'].includes(a.category)&&Number.isFinite(a.lat)&&Math.abs(a.lat)<=90&&Number.isFinite(a.lon)&&Math.abs(a.lon)<=180&&Number.isFinite(a.seen_pos)&&a.seen_pos>=0&&a.seen_pos<=60);
}

function mergeSnapshots(previous,incoming,now){
 const reports=new Map();
 for(const snapshot of [previous,incoming]){
  if(!snapshot)continue;
  for(const a of snapshot.ac){
   if(!Number.isFinite(a.seen_pos)||!Number.isFinite(a.lat)||!Number.isFinite(a.lon)||Math.abs(a.lat)>90||Math.abs(a.lon)>180)continue;
   const time=snapshot.sourceTime-a.seen_pos*1000;
   if(!a.hex||!Number.isFinite(time)||time>now||now-time>60000)continue;
   const old=reports.get(a.hex);
   if(old&&time<=old.time)continue;
   if(old&&a.alt_baro==='ground'&&old.ac.alt_baro==='ground'){
    const metres=Math.hypot((a.lat-old.ac.lat)*111320,((a.lon-old.ac.lon+540)%360-180)*111320*Math.cos(a.lat*Math.PI/180));
    const speed=Math.max(Number.isFinite(a.gs)?a.gs:100,Number.isFinite(old.ac.gs)?old.ac.gs:100);
    if(metres>Math.max(100,speed*.514444*(time-old.time)/1000*3+30))continue;
   }
   const ac={...a,source:a.source||snapshot.source||'ADSB.lol'};
   for(const key of ['r','t','flight','category'])if(!ac[key]&&old?.ac[key])ac[key]=old.ac[key];
   reports.set(a.hex,{ac,time});
  }
 }
 const ac=[...reports.values()].map(({ac,time})=>({...ac,seen_pos:(now-time)/1000}));
 const sources=[...new Set(ac.map(a=>a.source))];
 return {...incoming,source:sources.length>1?'Mixed':sources[0]||incoming.source,sourceTime:now,ac};
}

// Cooldowns belong to each provider, so one unavailable feed cannot block another.
export function createTrafficService({airports,fetcher=fetch,clock=Date.now,cachePath,contact}={}){
 const cache=new Map(),pending=new Map(),turns=new Map();
 const providers=[
  {source:'ADSB.lol',interval:6000,urls:a=>[`https://api.adsb.lol/v2/point/${a.lat}/${a.lon}/10`]},
  {source:'adsb.fi',interval:6000,urls:a=>[`https://opendata.adsb.fi/api/v3/lat/${a.lat}/lon/${a.lon}/dist/10`]},
  {source:'OpenSky',interval:240000,urls:openSkyUrls},
 ].map(p=>({...p,nextRequestAt:0,failures:0,cache:new Map()}));
 const ready=cachePath?readFile(cachePath,'utf8').then(s=>{for(const [id,snapshot] of JSON.parse(s)){if(clock()-snapshot.fetchedAt<MAX_STALE_MS)cache.set(id,snapshot);}}).catch(()=>{}):Promise.resolve();
 const persist=async()=>{if(!cachePath)return;try{await mkdir(dirname(cachePath),{recursive:true});await writeFile(cachePath,JSON.stringify([...cache]));}catch{}};
 function result(snapshot,message=null){
  const usable=snapshot&&clock()-snapshot.fetchedAt<MAX_STALE_MS;
  const next=Math.min(...providers.filter(p=>contact||p.source!=='ADSB.lol').map(p=>p.nextRequestAt));
  return {source:usable?(snapshot.source||'ADSB.lol'):null,snapshot:usable?snapshot:null,state:usable?(clock()-snapshot.fetchedAt<FRESH_MS?'current':'stale'):'unavailable',message,retryAt:Math.max(clock()+FRESH_MS,next)};
 }
 function remember(map,id,snapshot){map.delete(id);map.set(id,snapshot);while(map.size>24)map.delete(map.keys().next().value);}
 async function get(id){
  await ready;
  const airport=airports.find(a=>a.id===id);if(!airport)throw new Error('Unknown airport');
  const previous=cache.get(id);
  if(previous&&clock()-previous.fetchedAt<FRESH_MS)return result(previous);
  if(pending.has(id))return pending.get(id);
  const request=(async()=>{
   let first=null,staleGround=null;const errors=[];
   const turn=turns.get(id)||0;remember(turns,id,1-turn);
   const ordered=turn?[providers[1],providers[0],providers[2]]:providers;
   for(const provider of ordered){
    if(provider.source==='ADSB.lol'&&!contact)continue;
    let snapshot=provider.cache.get(id);
    if(clock()>=provider.nextRequestAt){
     const urls=provider.urls(airport);
     provider.nextRequestAt=clock()+provider.interval*urls.length;
     try{
      const parts=[];
      for(const url of urls){
       const headers=provider.source==='ADSB.lol'?{'User-Agent':`Airfield/0.1 (${contact})`}:{};
       const r=await fetcher(url,{headers,signal:AbortSignal.timeout(15000)});
       if(!r.ok){
        const delay=r.status===429?retryDelay(r.headers.get('X-Rate-Limit-Retry-After-Seconds')??r.headers.get('retry-after'),clock()):[401,403].includes(r.status)?3600000:Math.min(300000,30000*2**provider.failures);
        provider.nextRequestAt=Math.max(provider.nextRequestAt,clock()+delay);
        throw new Error(r.status===429?'Rate limited.':[401,403].includes(r.status)?'Access declined.':'Temporarily unavailable.');
       }
       const part=normalize(await r.json(),provider.source);
       if(Math.abs(clock()-part.sourceTime)>120000)throw new Error('Outdated snapshot.');
       parts.push(part);
      }
      // Keep individual observation ages correct if a bounding box crosses the date line.
      const sourceTime=Math.max(...parts.map(p=>p.sourceTime));
      snapshot={source:provider.source,sourceTime,fetchedAt:clock(),ac:parts.flatMap(p=>p.ac.map(a=>({...a,seen_pos:Number.isFinite(a.seen_pos)?a.seen_pos+(sourceTime-p.sourceTime)/1000:a.seen_pos})))};
      provider.failures=0;remember(provider.cache,id,snapshot);
     }catch(e){
      provider.failures++;provider.nextRequestAt=Math.max(provider.nextRequestAt,clock()+Math.min(300000,30000*2**(provider.failures-1)));
      errors.push(`${provider.source}: ${e.name==='TimeoutError'?'Timed out.':e.message}`);
     }
    }
    if(!snapshot||clock()-snapshot.fetchedAt>=MAX_STALE_MS)continue;
    const fresh=clock()-snapshot.fetchedAt<FRESH_MS;
    if(fresh&&hasGround(snapshot)){first=snapshot;staleGround=null;break;}
    if(!first&&fresh)first=snapshot;
    if(!staleGround&&hasGround(snapshot))staleGround=snapshot;
   }
   const selected=staleGround||first||previous;
   const chosen=selected?mergeSnapshots(previous,selected,clock()):null;
   if(chosen){remember(cache,id,chosen);await persist();}
   return result(chosen,errors.length?errors.join(' '):null);
  })();
  pending.set(id,request);
  try{return await request;}finally{pending.delete(id);}
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
