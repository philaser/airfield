import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {airportClock} from '../src/airport-time.js';
const airports=JSON.parse(readFileSync(new URL('../public/data/airports.json',import.meta.url)));
const clock=(id,date)=>airportClock(airports.find(a=>a.id===id),new Date(date)).time;
test('worldwide clocks cover airports outside the former whitelist and fractional offsets',()=>{
 for(const [id,expected] of [['VABB','17:30'],['VNKT','17:45'],['PHNL','02:00'],['DGAA','12:00'],['ZWWW','20:00']])assert.equal(clock(id,'2026-01-15T12:00:00Z'),expected,id);
});
test('local time follows northern and southern daylight saving transitions',()=>{
 assert.equal(clock('EGLL','2026-01-15T12:00:00Z'),'12:00');
 assert.equal(clock('EGLL','2026-07-15T12:00:00Z'),'13:00');
 assert.equal(clock('YMML','2026-01-15T12:00:00Z'),'23:00');
 assert.equal(clock('YMML','2026-07-15T12:00:00Z'),'22:00');
 assert.equal(clock('KJFK','2026-03-08T06:59:00Z'),'01:59');
 assert.equal(clock('KJFK','2026-03-08T07:00:00Z'),'03:00');
});
test('every record has an explicit resolution; ambiguous or unsupported zones never become UTC',()=>{
 assert(airports.filter(a=>a.timezone).length>=86011);
 assert(airports.every(a=>Object.hasOwn(a,'timezone')));
 for(const timezone of new Set(airports.map(a=>a.timezone).filter(Boolean)))assert.notEqual(airportClock({timezone}).time,'—',timezone);
 for(const airport of [{},{timezone:null},{timezone:'invalid/zone'}])assert.deepEqual(airportClock(airport),{time:'—',zone:null});
});
