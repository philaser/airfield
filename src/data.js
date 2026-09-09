import {bundledAirports} from './bundled-airports.js';
import {withDeadline} from './request-deadline.js';
import {createMapCache,MAP_FRESH_MS} from './map-cache.js';
export const DEFAULT = {id:'EGLL',code:'LHR',name:'London Heathrow Airport',city:'London',country:'GB',lat:51.4706,lon:-0.461941,type:'large_airport',timezone:'Europe/London'};
export const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function searchAirports(airports, query) {
 const q=normalize(query.trim());
 if(!q) return ['EGLL','KJFK','DGAA','EHAM','WSSS','OMDB'].map(id=>airports.find(a=>a.id===id)).filter(Boolean);
 return airports.map(a=>({a,s:a.code.toLowerCase()===q?100:a.id.toLowerCase()===q?95:normalize(a.keywords||'').split(/[,;]\s*/).includes(q)?90:a.code.toLowerCase().startsWith(q)?80:a.id.toLowerCase().startsWith(q)?75:normalize(a.city).startsWith(q)?60:normalize(a.name).includes(q)?40:normalize(a.city+' '+a.country).includes(q)?20:0})).filter(x=>x.s).sort((a,b)=>b.s-a.s+((b.a.type==='large_airport')-(a.a.type==='large_airport'))*8).slice(0,9).map(x=>x.a);
}
const mapKinds=['runway','taxiway','terminal','apron','hangar','parking_position'];
const hasGeometry=data=>data.elements?.some(e=>mapKinds.includes(e.tags?.aeroway)&&(e.geometry?.length>1||e.members?.some(m=>m.geometry?.length>1)));
export function nearbyGeometry(data,airport){
 const facilities=(data.elements||[]).filter(e=>['aerodrome','heliport'].includes(e.tags?.aeroway));
 // Without a mapped boundary, reject ambiguous clusters rather than merge airfields.
 if(facilities.length!==1)return null;
 const facility=facilities[0],tags=facility.tags;
 const matches=['icao','iata','ref','faa','local_ref'].some(k=>tags[k]&&[airport.id,airport.code].includes(tags[k]))||normalize(tags.name||'')===normalize(airport.name);
 if(!matches)return null;
 const result={...data,elements:data.elements.filter(e=>mapKinds.includes(e.tags?.aeroway)),airfieldDiscovery:'Verified airport vicinity'};
 return hasGeometry(result)?result:null;
}
export function isLocalGeometry(data,airport){
 try{return !data?.remark&&hasGeometry(data)&&mapFeatures(data,airport).every(f=>f.points.every(p=>p.every(Number.isFinite)&&Math.hypot(...p)<30000));}catch{return false;}
}
export function createGeometryLoader({cache=createMapCache(),timeoutMs=15000,requestTimeoutMs=6000,fetcher=(...args)=>fetch(...args),bundled=bundledAirports}={}) {
 const memory=new Map(),refreshing=new Set();
 const valid=isLocalGeometry;
 const json=(url,signal)=>withDeadline(async requestSignal=>{
  const response=await fetcher(url,{signal:requestSignal});
  if(!response.ok)throw new Error(`Map service returned ${response.status}`);
  return response.json();
 },{signal,timeoutMs:requestTimeoutMs});
 const remember=(id,data)=>{const entry={savedAt:Date.now(),data};memory.delete(id);memory.set(id,entry);if(memory.size>24)memory.delete(memory.keys().next().value);void cache.write(id,data).catch(()=>{});return data;};
 async function load(airport,signal,refresh=false){
  if(!refresh&&bundled.includes(airport.id)){
   try{const data=await json(`/data/${airport.id}.json`,signal);if(valid(data,airport))return remember(airport.id,data);}catch(e){if(signal.aborted)throw e;}
  }
  const id=airport.id.replace(/[^A-Z0-9_-]/gi,'');
  const query=`[out:json][timeout:5];nwr["aeroway"="aerodrome"]["icao"="${id}"];map_to_area->.a;(way(area.a)["aeroway"~"^(runway|taxiway|terminal|apron|hangar|parking_position)$"];relation(area.a)["aeroway"="terminal"];);out geom;`;
  let checkedNearby=false;
  for(const endpoint of ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter']){
   try{
    const data=await json(`${endpoint}?data=${encodeURIComponent(query)}`,signal);
    if(valid(data,airport))return remember(airport.id,data);
    if(data?.remark)continue; // A timed-out partial result is not a complete layout.
    const nearby=`[out:json][timeout:5];nwr(around:1800,${airport.lat},${airport.lon})["aeroway"];out geom;`;
    const discovery=await json(`${endpoint}?data=${encodeURIComponent(nearby)}`,signal);
    if(!discovery?.remark){checkedNearby=true;const matched=nearbyGeometry(discovery,airport);if(matched&&valid(matched,airport))return remember(airport.id,matched);}
   }catch(e){if(signal.aborted)throw e;}
  }
  const error=new Error(checkedNearby?'No verified outline available':'Map service unavailable');error.code=checkedNearby?'NO_OUTLINE':'MAP_SERVICE_UNAVAILABLE';throw error;
 }
 return async function getGeometry(airport,signal){
  try{
   return await withDeadline(async activeSignal=>{
    const session=memory.get(airport.id);
    const cached=session||await withDeadline(()=>cache.read(airport.id),{signal:activeSignal,timeoutMs:500}).catch(()=>null);
    if(activeSignal.aborted)throw activeSignal.reason;
    if(cached&&valid(cached.data,airport)){
     const stale=Date.now()-cached.savedAt>MAP_FRESH_MS;
     if(stale&&!refreshing.has(airport.id)){
      refreshing.add(airport.id);
      void withDeadline(s=>load(airport,s,true),{timeoutMs}).catch(()=>{}).finally(()=>refreshing.delete(airport.id));
     }
     return {...cached.data,airfieldCache:{source:session?'session':'device',savedAt:cached.savedAt,stale}};
    }
    return load(airport,activeSignal);
   },{signal,timeoutMs});
  }catch(error){
   if(signal?.aborted)throw error;
   if(['NO_OUTLINE','MAP_SERVICE_UNAVAILABLE'].includes(error.code))throw error;
   const failure=new Error('Map service unavailable',{cause:error});failure.code='MAP_SERVICE_UNAVAILABLE';throw failure;
  }
 };
}
export const getGeometry=createGeometryLoader();
export function mapFeatures(data,airport) {
 const project=p=>[((p.lon-airport.lon+540)%360-180)*111320*Math.cos(airport.lat*Math.PI/180),-(p.lat-airport.lat)*111320];
 return (data?.elements||[]).flatMap(e=>{
  const geoms=e.geometry?[e.geometry]:(e.members||[]).filter(m=>m.geometry).map(m=>m.geometry);
  return geoms.filter(g=>g.length>1).map((g,i)=>({id:e.id+'-'+i,tags:e.tags||{},points:g.map(project),closed:g[0].lat===g.at(-1).lat&&g[0].lon===g.at(-1).lon}));
 });
}
export function mapBounds(features) {
 const points=features.flatMap(f=>f.points);
 if(!points.length)return [-2000,-1200,4000,2400];
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);const minX=Math.min(...xs),minY=Math.min(...ys),w=Math.max(500,Math.max(...xs)-minX),h=Math.max(500,Math.max(...ys)-minY);
 return [minX-w*.12,minY-h*.28,w*1.24,h*1.56];
}
