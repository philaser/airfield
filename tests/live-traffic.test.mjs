import test from 'node:test';
import assert from 'node:assert/strict';
import {liveFlights,projectPosition,nearAirport} from '../src/live-traffic.js';
import {createTrafficService,retryDelay,MAX_STALE_MS} from '../server/traffic.mjs';
const airport={id:'TEST',lat:0,lon:0};
const base={hex:'abc123',alt_baro:'ground',type:'adsb_icao',lat:0,lon:0,seen_pos:1,t:'A320',gs:0};
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
 const service=createTrafficService({airports:[airport],contact:'test@example.com',clock:()=>now,fetcher:async()=>{calls++;await wait;return new Response(JSON.stringify({ac:[],now}));}});
 const first=service.get('TEST'),second=service.get('TEST');release();
 const [a,b]=await Promise.all([first,second]);assert.equal(calls,1);assert.deepEqual(a,b);
 await service.get('TEST');assert.equal(calls,1);now+=31000;await service.get('TEST');assert.equal(calls,2);
});
test('rate limit preserves last known data, honors Retry-After globally, expires snapshots',async()=>{
 let now=1800000000000,calls=0;
 const service=createTrafficService({airports:[airport,{...airport,id:'OTHER'}],contact:'test@example.com',clock:()=>now,fetcher:async()=>++calls===1?new Response(JSON.stringify({ac:[base],now})):new Response('',{status:429,headers:{'Retry-After':'120'}})});
 await service.get('TEST');now+=31000;
 const limited=await service.get('TEST');assert.equal(limited.state,'stale');assert.equal(limited.snapshot.ac.length,1);assert.equal(limited.retryAt,now+120000);
 assert.equal((await service.get('OTHER')).state,'unavailable');assert.equal(calls,2);
 now+=MAX_STALE_MS;assert.equal((await service.get('TEST')).snapshot,null);
});
test('rejects unknown airports, invalid source snapshots and unauthenticated setup',async()=>{
 let calls=0;const service=createTrafficService({airports:[airport],fetcher:()=>{calls++;}});
 await assert.rejects(service.get('INVALID'));assert.equal((await service.get('TEST')).snapshot,null);assert.equal(calls,0);
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
test('public feed cache refreshes at ten seconds and still coalesces earlier reads',async()=>{
 let now=1800000000000,calls=0;
 const service=createTrafficService({airports:[airport],contact:'test@example.com',clock:()=>now,fetcher:async()=>{calls++;return new Response(JSON.stringify({ac:[],now}));}});
 await service.get('TEST');now+=9999;await service.get('TEST');assert.equal(calls,1);now+=1;await service.get('TEST');assert.equal(calls,2);
});
