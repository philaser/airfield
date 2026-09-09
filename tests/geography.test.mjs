import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {searchAirports,mapFeatures,mapBounds,DEFAULT,getGeometry,nearbyGeometry} from '../src/data.js';
const airports=JSON.parse(fs.readFileSync(new URL('../public/data/airports.json',import.meta.url)));
const data=JSON.parse(fs.readFileSync(new URL('../public/data/EGLL.json',import.meta.url)));
test('initial map bounds include the whole airport, including outer aprons and taxiways',()=>{
 for(const id of ['EGLL','DGAA']){
  const airport=airports.find(a=>a.id===id);
  const features=mapFeatures(JSON.parse(fs.readFileSync(new URL(`../public/data/${id}.json`,import.meta.url))),airport);
  const [x,y,w,h]=mapBounds(features);
  for(const feature of features)for(const [px,py] of feature.points){
   assert(px>x&&px<x+w&&py>y&&py<y+h,`${id}: ${feature.tags.aeroway} ${feature.id} must fit with padding`);
  }
 }
});
test('worldwide search ranks IATA and ICAO exact matches and finds cities',()=>{
 assert.equal(searchAirports(airports,'LHR')[0].id,'EGLL');
 assert.equal(searchAirports(airports,'KJFK')[0].code,'JFK');
 assert.equal(searchAirports(airports,'Accra')[0].code,'ACC');
 assert.equal(searchAirports(airports,'zzzzzzairportdoesnotexist').length,0);
});
test('real Heathrow geometry contains its two named runways and finite geographic projections',()=>{
 const features=mapFeatures(data,DEFAULT);
 assert.deepEqual(features.filter(f=>f.tags.aeroway==='runway'&&f.tags.ref).map(f=>f.tags.ref).sort(),['09L/27R','09R/27L']);
 assert(features.every(f=>f.points.every(p=>p.every(Number.isFinite))));
 assert(features.some(f=>f.tags.aeroway==='terminal'));
 const b=mapBounds(features);assert(b[2]>4000&&b[2]<10000);assert(b[3]>2000&&b[3]<8000);
});
test('longitude wrapping preserves geometry at the date line',()=>{
 const [f]=mapFeatures({elements:[{id:1,geometry:[{lat:0,lon:179.99},{lat:0,lon:-179.99}]}]},{lat:0,lon:180});
 assert(Math.abs(f.points[1][0]-f.points[0][0])<2300);
});

test('detailed maps without a runway retain valid apron geometry',async t=>{
 const detail={elements:[{id:17,tags:{aeroway:'apron'},geometry:[{lat:0,lon:0},{lat:0,lon:.001}]}]};
 t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>detail}));
 assert.deepEqual(await getGeometry({id:'TEST-NO-RUNWAY',lat:0,lon:0},new AbortController().signal),detail);
});
test('Old Orchard point-only airport loads its actual runway and hangars',async t=>{
 const airport=airports.find(a=>a.id==='2NK9');
 const detail=JSON.parse(fs.readFileSync(new URL('./fixtures/old-orchard-osm.json',import.meta.url)));
 t.mock.method(globalThis,'fetch',async url=>({ok:true,json:async()=>decodeURIComponent(url).includes('around:')?detail:{elements:[]}}));
 const result=await getGeometry(airport,new AbortController().signal);
 assert.equal(result.elements.filter(e=>e.tags?.aeroway==='runway').length,1);
 assert.equal(result.elements.filter(e=>e.tags?.aeroway==='hangar').length,15);
});

test('nearby discovery rejects mismatched identities and neighboring airfields',()=>{
 const airport=airports.find(a=>a.id==='2NK9');
 const data=JSON.parse(fs.readFileSync(new URL('./fixtures/old-orchard-osm.json',import.meta.url)));
 assert.equal(nearbyGeometry(data,{...airport,name:'Different airport'}),null);
 assert.equal(nearbyGeometry({...data,elements:[...data.elements,{tags:{aeroway:'aerodrome',name:'Neighbor'}}]},airport),null);
});
test('Rose Field without an ICAO tag resolves by verified name and geographic vicinity',()=>{
 const airport=airports.find(a=>a.id==='2NK3');
 const data=JSON.parse(fs.readFileSync(new URL('./fixtures/rose-field-osm.json',import.meta.url)));
 const result=nearbyGeometry(data,airport);
 assert.equal(result.elements.filter(e=>e.tags?.aeroway==='runway').length,1);
});
test('former airport code finds its closed record',()=>{
 const found=searchAirports(airports,'2NK1')[0];
 assert.equal(found.id,'US-9898');assert.equal(found.type,'closed');
});
test('empty successful map lookup differs from a failed map service',async t=>{
 t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({elements:[]})}));
 await assert.rejects(getGeometry({id:'EMPTY-MAP',lat:0,lon:0,name:'Empty'},new AbortController().signal),{code:'NO_OUTLINE'});
 globalThis.fetch.mock.mockImplementation(async()=>{throw new Error('offline');});
 await assert.rejects(getGeometry({id:'FAILED-MAP',lat:0,lon:0},new AbortController().signal),{code:'MAP_SERVICE_UNAVAILABLE'});
});
