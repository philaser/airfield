#!/usr/bin/env node
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {mapFeatures} from '../src/data.js';
import {selectAirportBoundaryGeometry} from './airport-boundary-geometry.mjs';

const root=new URL('../',import.meta.url);
const args=process.argv.slice(2),option=name=>{
 const value=args[args.indexOf(name)+1];
 if(!value||value.startsWith('--'))throw new Error(`Missing value for ${name}`);
 return value;
};
const targets=JSON.parse(await readFile(new URL('scripts/airport-bundle-targets.json',root),'utf8'));
const directory=JSON.parse(await readFile(new URL('public/data/airports.json',root),'utf8'));
const only=args.includes('--only')?new Set(option('--only').split(',')):null;
if(only)for(const id of only)if(!targets.airports.some(a=>a.id===id))throw new Error(`Unknown bundle target ${id}`);
const limit=args.includes('--limit')?Number(option('--limit')):Infinity;
if(args.includes('--limit')&&(!Number.isSafeInteger(limit)||limit<1))throw new Error('--limit must be a positive integer');
const selected=targets.airports.filter(a=>!only||only.has(a.id)).slice(0,limit);
const reportPath=args.includes('--report')?option('--report'):null;
const endpoints=args.includes('--endpoint')?[option('--endpoint')]:['https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter'];
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const results=[];
async function saveReport(){
 if(!reportPath)return;
 const url=new URL(reportPath,root);
 await mkdir(new URL('.',url),{recursive:true});
 await writeFile(url,JSON.stringify(results,null,2));
}

function validate(data,airport){
 if(data.remark||!Array.isArray(data.elements)||!Number.isFinite(Date.parse(data.osm3s?.timestamp_osm_base)))throw new Error('Incomplete or undated OSM response');
 const features=mapFeatures(data,airport);
 if(!features.some(f=>f.tags.aeroway==='runway')||!features.some(f=>['taxiway','terminal','apron','hangar'].includes(f.tags.aeroway)))throw new Error('Detailed airport geometry not available');
 if(!features.every(f=>f.points.every(p=>p.every(Number.isFinite)&&Math.hypot(...p)<30000)))throw new Error('Geometry extends beyond the expected airport vicinity');
 return features.length;
}

for(const target of selected){
 const airport=directory.find(a=>a.id===target.id);if(!airport)throw new Error(`Unknown airport ${target.id}`);
 const file=new URL(`public/data/${airport.id}.json`,root);
 try{
  const body=await readFile(file,'utf8'),data=JSON.parse(body);const features=validate(data,airport);
  results.push({id:airport.id,status:'existing',features,bytes:Buffer.byteLength(body),gzipBytes:gzipSync(body).length});
  console.log(JSON.stringify(results.at(-1)));await saveReport();continue;
 }catch{/* Missing or invalid existing snapshot: retrieve it. */}
 const latSpan=20000/111320,lonSpan=latSpan/Math.cos(airport.lat*Math.PI/180);
 const bbox=[airport.lat-latSpan,airport.lon-lonSpan,airport.lat+latSpan,airport.lon+lonSpan].join(',');
 const query=args.includes('--boundary')?`[out:json][timeout:10][maxsize:67108864];nwr(${bbox})["aeroway"];out geom;`:`[out:json][timeout:10][maxsize:67108864];nwr(${bbox})["aeroway"="aerodrome"]["icao"="${airport.id}"];map_to_area->.a;(way(area.a)["aeroway"~"^(runway|taxiway|terminal|apron|hangar|parking_position)$"];relation(area.a)["aeroway"="terminal"];);out geom;`;
 let saved=false,lastError;
 for(const endpoint of endpoints){
  await wait(2000);
  try{
   const response=await fetch(endpoint,{method:'POST',body:new URLSearchParams({data:query}),headers:{'User-Agent':'Airfield/0.1 (https://github.com/philaser/airfield)'},signal:AbortSignal.timeout(20000)});
   if(!response.ok){
    if(response.status===429){const seconds=Number(response.headers.get('retry-after'));console.log(`${airport.id}: rate limited; waiting before retry`);await wait(Math.max(15000,Number.isFinite(seconds)?seconds*1000:0));}
    throw new Error(`HTTP ${response.status}`);
   }
   const raw=await response.json();
   const data=args.includes('--boundary')?selectAirportBoundaryGeometry(raw,airport,{bbox:bbox.split(',').map(Number)}):raw;
   if(!data)throw new Error('Airport boundary could not be verified');
   const features=validate(data,airport),body=JSON.stringify(data);
   await writeFile(new URL(`${file.href}.tmp`),body);await rename(new URL(`${file.href}.tmp`),fileURLToPath(file));
   results.push({id:airport.id,status:'saved',features,bytes:Buffer.byteLength(body),gzipBytes:gzipSync(body).length,source:endpoint,snapshotAt:data.osm3s.timestamp_osm_base});
   saved=true;break;
  }catch(error){lastError=`${endpoint}: ${error.message}`;console.log(`${airport.id}: ${lastError}`);}
 }
 if(!saved)results.push({id:airport.id,status:'failed',error:lastError});
 console.log(JSON.stringify(results.at(-1)));
 await saveReport();
}
console.log(JSON.stringify({selected:selected.length,saved:results.filter(r=>r.status!=='failed').length,failed:results.filter(r=>r.status==='failed').length,bytes:results.reduce((n,r)=>n+(r.bytes||0),0),gzipBytes:results.reduce((n,r)=>n+(r.gzipBytes||0),0)}));
if(results.some(r=>r.status==='failed'))process.exitCode=1;
else if(!only&&!args.includes('--limit')&&selected.length===200){
 // Keep the original Accra snapshot even when it is outside the major-airport selection.
 const ids=[...new Set([...selected.map(a=>a.id),'EGLL','DGAA'])].sort();
 for(const id of ids){
  const airport=directory.find(a=>a.id===id);
  validate(JSON.parse(await readFile(new URL(`public/data/${id}.json`,root),'utf8')),airport);
 }
 await writeFile(new URL('src/bundled-airports.js',root),`// Generated by scripts/bundle-airport-maps.mjs; maps are fetched individually.\nexport const bundledAirports = ${JSON.stringify(ids)};\n`);
}
