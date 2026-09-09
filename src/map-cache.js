const CACHE_NAME='airfield-layouts-v1';
export const MAP_FRESH_MS=30*24*60*60*1000;
const MAX_AGE_MS=180*24*60*60*1000,MAX_MAPS=24;

// Cache Storage persists in the device's browser profile across reloads.
// It is optional: privacy settings, eviction, and quota failures must not
// prevent a network or bundled layout from loading.
export function createMapCache({storage=()=>globalThis.caches,origin=()=>globalThis.location?.origin,clock=Date.now}={}){
 const key=id=>new URL(`/__airfield_layouts/${encodeURIComponent(id)}`,origin()).href;
 return {
  async read(id){
   try{
    const cache=await storage()?.open(CACHE_NAME);if(!cache)return null;
    const response=await cache.match(key(id));if(!response)return null;
    const entry=await response.json();
    if(!Number.isFinite(entry.savedAt)||entry.savedAt>clock()||clock()-entry.savedAt>MAX_AGE_MS||!Array.isArray(entry.data?.elements)){
     await cache.delete(key(id));return null;
    }
    return entry;
   }catch{return null;}
  },
  async write(id,data){
   try{
    const cache=await storage()?.open(CACHE_NAME);if(!cache)return;
    await cache.delete(key(id));
    await cache.put(key(id),new Response(JSON.stringify({savedAt:clock(),data}),{headers:{'Content-Type':'application/json'}}));
    const keys=await cache.keys();
    for(const request of keys.slice(0,Math.max(0,keys.length-MAX_MAPS)))await cache.delete(request);
   }catch{/* Storage may be unavailable or full. */}
  },
 };
}
