import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {bundledAirports} from '../src/bundled-airports.js';
import {mapFeatures,mapBounds,createGeometryLoader} from '../src/data.js';
const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
test('the 200 selected airports have dated, detailed, geographically local bundled maps',async()=>{
 const targets=await json('../scripts/airport-bundle-targets.json');
 const directory=await json('../public/data/airports.json');
 assert.equal(targets.airports.length,200);
 assert.equal(new Set(targets.airports.map(a=>a.id)).size,200);
 for(const target of targets.airports)assert(bundledAirports.includes(target.id),target.id);
 for(const id of bundledAirports){
  const airport=directory.find(a=>a.id===id);
  assert(airport,id);
  assert.notEqual(airport.type,'closed',id);
  const data=await json(`../public/data/${id}.json`);
  assert(!data.remark,id);
  assert(Number.isFinite(Date.parse(data.osm3s?.timestamp_osm_base)),id);
  const features=mapFeatures(data,airport);
  assert(features.some(f=>f.tags.aeroway==='runway'),`${id}: runway`);
  assert(features.some(f=>['taxiway','terminal','apron','hangar'].includes(f.tags.aeroway)),`${id}: detail`);
  assert(features.every(f=>f.points.every(p=>p.every(Number.isFinite)&&Math.hypot(...p)<30000)),`${id}: vicinity`);
  assert(mapBounds(features).every(Number.isFinite),`${id}: map fit`);
 }
});

test('every selected layout is loaded from its own static file without an Overpass request',async()=>{
 const directory=await json('../public/data/airports.json');
 const requested=[];
 const load=createGeometryLoader({
  cache:{read:async()=>null,write:async()=>{}},
  fetcher:async url=>{
   requested.push(url);
   assert.match(url,/^\/data\/[A-Z0-9]+\.json$/);
   return {ok:true,json:()=>json(`../public${url}`)};
  },
 });
 for(const id of bundledAirports){
  await load(directory.find(a=>a.id===id));
  assert.equal(requested.at(-1),`/data/${id}.json`);
 }
 assert.equal(requested.length,bundledAirports.length);
});
