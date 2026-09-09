import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeometryLoader} from '../src/data.js';
import {createMapCache,MAP_FRESH_MS} from '../src/map-cache.js';
import {withDeadline} from '../src/request-deadline.js';

const layout={elements:[{id:1,tags:{aeroway:'runway'},geometry:[{lat:40,lon:-73},{lat:40.01,lon:-73.01}]}]};
const airport={id:'TEST',name:'Test Airport',lat:40,lon:-73};
const noCache={read:async()=>null,write:async()=>{}};
const never=()=>new Promise(()=>{});

test('map loading exits when fetch or the response body never settles',async()=>{
 for(const fetcher of [never,async()=>({ok:true,json:never})]){
  const get=createGeometryLoader({cache:noCache,fetcher,timeoutMs:50,requestTimeoutMs:30});
  const start=Date.now();
  await assert.rejects(get(airport,new AbortController().signal),{code:'MAP_SERVICE_UNAVAILABLE'});
  assert(Date.now()-start<500);
 }
});

test('a stalled disk cache cannot block a bundled layout',async()=>{
 const get=createGeometryLoader({cache:{read:never,write:async()=>{}},fetcher:async()=>({ok:true,json:async()=>layout}),bundled:['TEST'],timeoutMs:1000});
 assert.deepEqual(await get(airport),layout);
});

test('cancelling an airport request prevents fallback requests',async()=>{
 const controller=new AbortController();let requests=0;
 const get=createGeometryLoader({cache:noCache,fetcher:()=>{requests++;controller.abort();return never();},timeoutMs:100});
 await assert.rejects(get(airport,controller.signal),{name:'AbortError'});
 assert.equal(requests,1);
 await assert.rejects(withDeadline(never,{signal:controller.signal,timeoutMs:100}),{name:'AbortError'});
});

function diskFixture(){
 const entries=new Map();
 const key=request=>typeof request==='string'?request:request.url;
 const disk={match:async request=>entries.get(key(request))?.clone(),delete:async request=>entries.delete(key(request)),put:async(request,response)=>entries.set(key(request),response),keys:async()=>[...entries.keys()]};
 const options={storage:()=>({open:async()=>disk}),origin:()=> 'https://airfield.test'};
 return {options,entries};
}

test('a fresh loader reuses a saved layout without contacting Overpass',async()=>{
 const {options}=diskFixture();let requests=0;
 const cache=createMapCache(options);
 const get=createGeometryLoader({cache,fetcher:async()=>{requests++;return {ok:true,json:async()=>layout};}});
 await get(airport);
 // Persist the write before simulating a browser reload with fresh modules.
 await cache.write(airport.id,layout);
 const reloaded=createGeometryLoader({cache:createMapCache(options),fetcher:()=>{throw new Error('offline');}});
 const result=await reloaded(airport);
 assert.equal(requests,1);assert.deepEqual(result.elements,layout.elements);
 assert.equal(result.airfieldCache.source,'device');assert.equal(result.airfieldCache.stale,false);
});

test('old valid layout is immediate while a failed background refresh preserves it',async()=>{
 const {options}=diskFixture();
 await createMapCache({...options,clock:()=>Date.now()-MAP_FRESH_MS-1000}).write(airport.id,layout);
 const requests=[];
 const get=createGeometryLoader({cache:createMapCache(options),bundled:['TEST'],fetcher:async url=>{requests.push(url);throw new Error('offline');}});
 const result=await get(airport);
 assert.equal(result.airfieldCache.stale,true);assert.deepEqual(result.elements,layout.elements);
 assert(requests.every(url=>url.startsWith('https://overpass')));
 assert(requests.length>0); // Refresh the provider, not the same old bundled file.
});

test('device cache bounds storage and tolerates eviction or denied storage',async()=>{
 const {options,entries}=diskFixture();const cache=createMapCache(options);
 for(let n=0;n<26;n++)await cache.write(String(n),layout);
 assert.equal(entries.size,24);assert.equal(await cache.read('0'),null);
 const denied=createMapCache({storage:()=>{throw new Error('denied');}});
 assert.equal(await denied.read('TEST'),null);await denied.write('TEST',layout);
});

test('partial Overpass responses never become a cached complete layout',async()=>{
 let writes=0;
 const get=createGeometryLoader({cache:{read:async()=>null,write:async()=>{writes++;}},fetcher:async()=>({ok:true,json:async()=>({...layout,remark:'runtime error: Query timed out'})})});
 await assert.rejects(get(airport),{code:'MAP_SERVICE_UNAVAILABLE'});assert.equal(writes,0);
});

test('nonlocal geometry is rejected from device cache and network responses',async()=>{
 const distant={elements:[{...layout.elements[0],geometry:[{lat:41,lon:-73},{lat:41.01,lon:-73.01}]}]};
 let requests=0;
 const recovered=createGeometryLoader({cache:{read:async()=>({savedAt:Date.now(),data:distant}),write:async()=>{}},fetcher:async()=>{requests++;return {ok:true,json:async()=>layout};}});
 assert.deepEqual((await recovered(airport)).elements,layout.elements);
 assert.equal(requests,1);
 let writes=0;
 const rejected=createGeometryLoader({cache:{read:async()=>null,write:async()=>{writes++;}},fetcher:async()=>({ok:true,json:async()=>distant})});
 await assert.rejects(rejected(airport));
 assert.equal(writes,0);
});
