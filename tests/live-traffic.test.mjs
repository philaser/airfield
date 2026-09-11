import test from 'node:test';
import assert from 'node:assert/strict';
import {liveFlights,projectPosition,nearAirport} from '../src/live-traffic.js';
import {createTrafficService,retryDelay,MAX_STALE_MS} from '../server/traffic.mjs';
const airport={id:'TEST',lat:0,lon:0};
const base={hex:'abc123',alt_baro:'ground',type:'adsb_icao',lat:0,lon:0,seen_pos:1,t:'A320',gs:0};
const json=value=>new Response(JSON.stringify(value));
const provider=url=>url.includes('adsb.lol')?'ADSB.lol':url.includes('adsb.fi')?'adsb.fi':'OpenSky';
test('keeps real aircraft and vehicles; excludes towers, airborne and old or missing positions',()=>{
 const ac=[base,{...base,hex:'vehicle',type:'adsb_icao_nt',category:'C2',flight:' CAR1 ',gs:12},{...base,hex:'tower',t:'TWR'},{...base,hex:'obstacle',category:'C3'},{...base,hex:'airborne',alt_baro:1000},{...base,hex:'old',seen_pos:65},{...base,hex:'missing',lat:undefined},{...base,hex:'unknownage',seen_pos:undefined},base];
 const flights=liveFlights({ac,sourceTime:100000},airport,[]);
 assert.equal(flights.length,2);assert.equal(flights[0].number,'CAR1');assert.equal(flights[0].vehicle,true);assert.equal(flights[1].vehicle,false);assert.equal(flights[1].headingKnown,false);assert.equal(flights[1].observedAt,99000);
});
test('filters nearby airports and uses polygon interiors, handles longitude wrapping',()=>{
 const features=[{tags:{aeroway:'apron'},closed:true,points:[[-500,-500],[500,-500],[500,500],[-500,500],[-500,-500]]}];
 assert(nearAirport({x:0,y:0},features));assert(!nearAirport({x:800,y:0},features));
 assert(Math.abs(projectPosition(0,-179.99,{lat:0,lon:179.99}).x)<2300);
 assert.equal(liveFlights({ac:[{...base,lon:.1}],sourceTime:1},airport,features).length,0);
});
test('does not invent speed, orientation, registration, or model',()=>{
 const [flight]=liveFlights({ac:[{...base,gs:undefined,t:undefined,true_heading:undefined}],sourceTime:1},airport,[]);
 assert.equal(flight.speed,null);assert.equal(flight.status,'On ground');assert.equal(flight.model,null);assert.equal(flight.registration,'Not reported');assert.equal(flight.headingKnown,false);
});
test('deduplicates simultaneous requests and serves cached snapshots without extra calls',async()=>{
 let calls=0,now=1800000000000,release;
 const wait=new Promise(r=>release=r);
 const service=createTrafficService({airports:[airport],contact:'test@example.com',clock:()=>now,fetcher:async()=>{calls++;await wait;return json({ac:[base],now});}});
 const first=service.get('TEST'),second=service.get('TEST');release();
 const [a,b]=await Promise.all([first,second]);assert.equal(calls,1);assert.deepEqual(a,b);
 await service.get('TEST');assert.equal(calls,1);now+=31000;await service.get('TEST');assert.equal(calls,2);
});
test('rate limit preserves last known data, honors Retry-After globally, expires snapshots',async()=>{
 let now=1800000000000,calls=0;
 const service=createTrafficService({airports:[airport,{...airport,id:'OTHER'}],contact:'test@example.com',clock:()=>now,fetcher:async()=>++calls===1?json({ac:[base],now}):new Response('',{status:429,headers:{'Retry-After':'120'}})});
 await service.get('TEST');now+=31000;
 const limited=await service.get('TEST');assert.equal(limited.state,'stale');assert.equal(limited.snapshot.ac.length,1);assert.equal(limited.retryAt,now+120000);
 assert.equal(calls,4);assert.equal((await service.get('OTHER')).state,'unavailable');assert.equal(calls,4);
 now+=MAX_STALE_MS;assert.equal((await service.get('TEST')).snapshot,null);
});
test('rejects unknown airports and invalid source snapshots',async()=>{
 let calls=0;const service=createTrafficService({airports:[airport],fetcher:()=>{calls++;}});
 await assert.rejects(service.get('INVALID'));assert.equal(calls,0);assert.equal((await service.get('TEST')).snapshot,null);assert.equal(calls,2);
 const invalid=createTrafficService({airports:[airport],contact:'test@example.com',fetcher:async()=>new Response(JSON.stringify({ac:[],now:1}))});
 assert.equal((await invalid.get('TEST')).state,'unavailable');
});
test('Retry-After supports date and seconds without retry storms',()=>{
 const now=1800000000000;assert.equal(retryDelay('120',now),120000);assert.equal(retryDelay(new Date(now+180000).toUTCString(),now),180000);assert.equal(retryDelay(null,now),60000);
});
test('identifies helicopter type codes independently of emitter category and keeps vehicles distinct',()=>{
 const ac=[{...base,hex:'heli1',t:'EC35'},{...base,hex:'heli2',t:'R44'},{...base,hex:'heli3',t:undefined,category:'A7'},{...base,hex:'car',t:undefined,category:'C2',type:'adsb_icao_nt'}];
 const flights=liveFlights({ac,sourceTime:1},airport,[]);
 assert.equal(flights.filter(f=>f.kind==='helicopter').length,3);
 assert(flights.find(f=>f.id==='heli2').aircraft.includes('R-44'));
 assert.equal(flights.find(f=>f.id==='car').kind,'vehicle');
});
test('resolves model identity without fabricating a missing heading',()=>{
 const [f]=liveFlights({ac:[{...base,t:'A21N'}],sourceTime:1},airport,[]);
 assert.equal(f.aircraft,'Airbus A321neo');assert.equal(f.model,'A21N');assert.equal(f.headingKnown,false);
});
test('runway-only Schiphol geometry retains all six captured apron and runway reports',async()=>{
 const fs=await import('node:fs');const {mapFeatures}=await import('../src/data.js');
 const airports=JSON.parse(fs.readFileSync(new URL('../public/data/airports.json',import.meta.url)));
 const runways=JSON.parse(fs.readFileSync(new URL('../public/data/runways.json',import.meta.url)));
 const raw=JSON.parse(fs.readFileSync(new URL('./fixtures/schiphol-ground.json',import.meta.url)));
 const a=airports.find(a=>a.id==='EHAM');const flights=liveFlights({ac:raw.ac,sourceTime:raw.now},a,mapFeatures({elements:runways.EHAM},a));
 assert.equal(flights.length,6);assert.equal(flights.filter(f=>!f.vehicle).length,2);assert.equal(flights.filter(f=>f.vehicle).length,4);
});
test('public feed cache refreshes at three seconds and still coalesces earlier reads',async()=>{
 let now=1800000000000,calls=0;
 const service=createTrafficService({airports:[airport],contact:'test@example.com',clock:()=>now,fetcher:async()=>{calls++;return json({ac:[base],now});}});
 await service.get('TEST');now+=2999;await service.get('TEST');assert.equal(calls,1);now+=1;await service.get('TEST');assert.equal(calls,2);
});

test('alternates ADSB.lol and adsb.fi on three-second polls without dropping provider-specific aircraft',async()=>{
 let now=1800000000000;const calls=[];
 const service=createTrafficService({airports:[airport],contact:'test@example.com',clock:()=>now,fetcher:async url=>{
  const source=provider(url);calls.push(source);
  return json({ac:[{...base,hex:source==='ADSB.lol'?'lol123':'fi123'}],now});
 }});
 const first=await service.get('TEST');assert.equal(first.source,'ADSB.lol');
 now+=2999;await service.get('TEST');assert.deepEqual(calls,['ADSB.lol']);
 now+=1;const mixed=await service.get('TEST');
 assert.deepEqual(calls,['ADSB.lol','adsb.fi']);assert.equal(mixed.source,'Mixed');assert.deepEqual(mixed.snapshot.ac.map(a=>[a.hex,a.source]).sort(),[['fi123','adsb.fi'],['lol123','ADSB.lol']]);
 now+=3000;await service.get('TEST');assert.deepEqual(calls,['ADSB.lol','adsb.fi','ADSB.lol']);
 now+=3000;await service.get('TEST');assert.deepEqual(calls,['ADSB.lol','adsb.fi','ADSB.lol','adsb.fi']);
});

test('merges only newer aircraft observations, retains metadata, and expires reports older than sixty seconds',async()=>{
 let now=1800000000000;
 const service=createTrafficService({airports:[airport],contact:'test@example.com',clock:()=>now,fetcher:async url=>{
  const source=provider(url);
  if(source==='OpenSky')return json({time:now/1000,states:[]});
  if(now===1800000000000)return json({ac:[{...base,lat:0,lon:0,seen_pos:2,gs:10,track:20,r:'N123AB',t:'A320',flight:'KEEP1'}],now});
  if(now===1800000003000)return json({ac:[{...base,lat:.00009,lon:.00009,seen_pos:6,gs:99,track:99,r:undefined,t:undefined,flight:undefined}],now});
  if(now===1800000006000)return json({ac:[],now});
  if(now===1800000009000)return json({ac:[{...base,lat:.00001,lon:.00001,seen_pos:1,gs:20,track:30,r:undefined,t:undefined,flight:undefined}],now});
  return json({ac:[],now});
 }});
 const original=await service.get('TEST'),originalObserved=original.snapshot.sourceTime-original.snapshot.ac[0].seen_pos*1000;
 now+=3000;const older=await service.get('TEST'),olderAircraft=older.snapshot.ac.find(a=>a.hex===base.hex);
 assert.equal(older.snapshot.sourceTime-olderAircraft.seen_pos*1000,originalObserved);assert.equal(olderAircraft.lon,0);assert.equal(olderAircraft.gs,10);assert.equal(olderAircraft.track,20);
 now+=3000;const missing=await service.get('TEST');assert(missing.snapshot.ac.some(a=>a.hex===base.hex));
 now+=3000;const newer=await service.get('TEST'),updated=newer.snapshot.ac.find(a=>a.hex===base.hex);
 assert.equal(updated.lon,.00001);assert.equal(updated.lat,.00001);assert.equal(updated.gs,20);assert.equal(updated.track,30);assert.equal(updated.r,'N123AB');assert.equal(updated.t,'A320');assert.equal(updated.flight,'KEEP1');
 const updatedObserved=newer.snapshot.sourceTime-updated.seen_pos*1000;assert(updatedObserved>originalObserved);
 now=updatedObserved+60001;const expired=await service.get('TEST');assert(!expired.snapshot.ac.some(a=>a.hex===base.hex));
});

test('falls through provider errors and unusable reports, then records the winning source',async()=>{
 let now=1800000000000;const calls=[];
 const service=createTrafficService({airports:[airport],contact:'test@example.com',clock:()=>now,fetcher:async url=>{
  calls.push(provider(url));
  if(url.includes('adsb.lol'))return new Response('',{status:500});
  if(url.includes('adsb.fi'))return json({ac:[{...base,hex:'tower',t:'TWR'},{...base,hex:'old',seen_pos:61}],now});
  return json({time:now/1000,states:[['open123',' OPEN 1 ',null,now/1000-2,null,0,0,null,true,0,90,null,null,null,null,false,0,2]]});
 }});
 const result=await service.get('TEST');
 assert.deepEqual(calls,['ADSB.lol','adsb.fi','OpenSky']);
 assert.equal(result.state,'current');assert.equal(result.source,'OpenSky');assert.equal(result.snapshot.source,'OpenSky');
 assert.equal(result.snapshot.ac[0].hex,'open123');
});

test('stops at the first provider with a fresh usable ground report',async()=>{
 let now=1800000000000;const calls=[];
 const service=createTrafficService({airports:[airport],contact:'test@example.com',clock:()=>now,fetcher:async url=>{
  calls.push(provider(url));
  if(url.includes('adsb.lol'))return json({ac:[{...base,alt_baro:1200}],now});
  if(url.includes('adsb.fi'))return json({ac:[{...base,hex:'fi123'}],now});
  throw new Error('OpenSky should not be requested');
 }});
 const result=await service.get('TEST');
 assert.deepEqual(calls,['ADSB.lol','adsb.fi']);assert.equal(result.source,'adsb.fi');assert.equal(result.snapshot.source,'adsb.fi');assert.equal(result.snapshot.ac[0].hex,'fi123');
});

test('keeps the first successful current snapshot when no provider has usable ground traffic',async()=>{
 let now=1800000000000;const calls=[];
 const service=createTrafficService({airports:[airport],contact:'test@example.com',clock:()=>now,fetcher:async url=>{
  calls.push(provider(url));
  if(url.includes('adsb.lol'))return json({ac:[{...base,hex:'airborne',alt_baro:1000}],now});
  if(url.includes('adsb.fi'))return json({ac:[],now});
  return json({time:now/1000,states:[]});
 }});
 const result=await service.get('TEST');
 assert.deepEqual(calls,['ADSB.lol','adsb.fi','OpenSky']);assert.equal(result.source,'ADSB.lol');assert.equal(result.snapshot.source,'ADSB.lol');assert.equal(result.snapshot.ac[0].hex,'airborne');
});

test('uses adsb.fi and OpenSky without a project contact while skipping ADSB.lol',async()=>{
 let now=1800000000000;const calls=[];
 const service=createTrafficService({airports:[airport],clock:()=>now,fetcher:async url=>{
  calls.push(provider(url));
  if(url.includes('adsb.fi'))return new Response('',{status:503});
  return json({time:now/1000,states:[['open123',null,null,now/1000,null,0,0,null,true,0,0,null,null,null,null,false,0,2]]});
 }});
 const result=await service.get('TEST');
 assert.deepEqual(calls,['adsb.fi','OpenSky']);assert.equal(result.source,'OpenSky');assert.equal(result.snapshot.source,'OpenSky');
});

test('normalizes OpenSky ground state vectors without inventing missing values',async()=>{
 const now=1800000000000;
 const states=[
  ['abc123',' TEST123 ',null,now/1000-5,null,.01,.02,null,true,10,270,null,null,null,null,false,0,17],
  ['missing',null,null,now/1000,null,0,0,null,true,null,null,null,null,null,null,false,0,null]
 ];
 const service=createTrafficService({airports:[airport],clock:()=>now,fetcher:async url=>url.includes('adsb.fi')?new Response('',{status:503}):json({time:now/1000,states})});
 const result=await service.get('TEST'),[ground,missing]=result.snapshot.ac;
 assert.equal(result.source,'OpenSky');assert.equal(result.snapshot.source,'OpenSky');
 assert.equal(ground.hex,'abc123');assert.equal(ground.flight,' TEST123 ');assert.equal(ground.alt_baro,'ground');assert.equal(ground.lon,.01);assert.equal(ground.lat,.02);assert.equal(ground.seen_pos,5);assert(Math.abs(ground.gs-19.4384)<.0001);assert.equal(ground.track,270);assert.equal(ground.category,'C2');
 assert.equal(missing.lat,0);assert.equal(missing.lon,0);assert.equal(missing.seen_pos,0);assert.equal(missing.gs,undefined);assert.equal(missing.track,undefined);assert.equal(missing.t,undefined);assert.equal(missing.r,undefined);
});

test('tracks cooldowns per provider across airports, including refusals and OpenSky retry headers',async()=>{
 let now=1800000000000;const calls=[];
 const airports=[airport,{...airport,id:'OTHER'},{...airport,id:'THIRD'}];
 const service=createTrafficService({airports,contact:'test@example.com',clock:()=>now,fetcher:async url=>{
  const source=provider(url);calls.push(source);
  if(source==='ADSB.lol')return new Response('',{status:403});
  if(source==='adsb.fi')return new Response('',{status:500});
  return new Response('',{status:429,headers:{'X-Rate-Limit-Retry-After-Seconds':'300'}});
 }});
 await service.get('TEST');assert.deepEqual(calls,['ADSB.lol','adsb.fi','OpenSky']);
 await service.get('OTHER');assert.equal(calls.length,3);
 now+=30000;await service.get('OTHER');assert.deepEqual(calls,['ADSB.lol','adsb.fi','OpenSky','adsb.fi']);
 now+=270000;await service.get('THIRD');assert.deepEqual(calls,['ADSB.lol','adsb.fi','OpenSky','adsb.fi','adsb.fi','OpenSky']);
 now+=3300000;await service.get('THIRD');assert.deepEqual(calls.slice(-3),['adsb.fi','ADSB.lol','OpenSky']);
});

test('reuses cached OpenSky ground traffic during its cooldown without changing observation timestamps',async()=>{
 let now=1800000000000,fiCalls=0,openSkyCalls=0;
 const service=createTrafficService({airports:[airport],clock:()=>now,fetcher:async url=>{
  if(url.includes('adsb.fi'))return ++fiCalls===1?new Response('',{status:503}):json({ac:[],now});
  openSkyCalls++;return json({time:now/1000,states:[['open123',null,null,now/1000-1,null,0,0,null,true,0,0,null,null,null,null,false,0,2]]});
 }});
 const first=await service.get('TEST'),fetchedAt=first.snapshot.fetchedAt,aircraft=first.snapshot.ac[0],observedAt=first.snapshot.sourceTime-aircraft.seen_pos*1000;
 now+=10000;const second=await service.get('TEST');
 const retained=second.snapshot.ac[0];assert.equal(fiCalls,1);assert.equal(openSkyCalls,1);assert.equal(second.state,'stale');assert.equal(second.source,'OpenSky');assert.equal(second.snapshot.source,'OpenSky');assert.equal(second.snapshot.fetchedAt,fetchedAt);assert.equal(second.snapshot.sourceTime-retained.seen_pos*1000,observedAt);
});

test('splits OpenSky bounding boxes at the date line and combines both responses',async()=>{
 const now=1800000000000,dateLineAirport={id:'DATE',lat:0,lon:179.95};const urls=[];
 const service=createTrafficService({airports:[dateLineAirport],clock:()=>now,fetcher:async url=>{
  if(url.includes('adsb.fi'))return new Response('',{status:503});
  urls.push(url);return json({time:now/1000,states:urls.length===2?[['east123',null,null,now/1000,null,-179.95,0,null,true,0,0,null,null,null,null,false,0,2]]:[]});
 }});
 const result=await service.get('DATE');
 assert.equal(urls.length,2);assert(urls.every(url=>url.includes('extended=1')));assert(urls.some(url=>url.includes('lomax=180')));assert(urls.some(url=>url.includes('lomin=-180')));assert.equal(result.source,'OpenSky');assert.equal(result.snapshot.ac[0].hex,'east123');
});
