import test from 'node:test';
import assert from 'node:assert/strict';
import {LAST_AIRPORT_KEY,rememberAirport,resolveAirportSelection} from '../src/airport-selection.js';

const airports=[
 {id:'EGLL',code:'LHR',name:'London Heathrow Airport'},
 {id:'KJFK',code:'JFK',name:'John F Kennedy International Airport'},
 {id:'DGAA',code:'ACC',name:'Kotoka International Airport'},
];
function storage(value){return {getItem:key=>key===LAST_AIRPORT_KEY?value:null,setItem(key,next){this.written=[key,next];}};}

test('a valid URL airport has priority over the remembered airport',()=>{
 assert.equal(resolveAirportSelection(airports,'?airport=kjfk',storage('DGAA'),airports[0]).id,'KJFK');
 assert.equal(resolveAirportSelection(airports,'?airport=jfk',storage('DGAA'),airports[0]).id,'KJFK');
});

test('an absent or invalid URL falls back to the remembered airport, then the default',()=>{
 assert.equal(resolveAirportSelection(airports,'',storage('DGAA'),airports[0]).id,'DGAA');
 assert.equal(resolveAirportSelection(airports,'?airport=INVALID',storage('MISSING'),airports[0]).id,'EGLL');
});

test('selection remains usable when browser storage is unavailable',()=>{
 const hostile={getItem(){throw new Error('denied');},setItem(){throw new Error('denied');}};
 assert.equal(resolveAirportSelection(airports,'?airport=ACC',hostile,airports[0]).id,'DGAA');
 assert.equal(resolveAirportSelection(airports,'',hostile,airports[0]).id,'EGLL');
 assert.doesNotThrow(()=>rememberAirport(airports[1],hostile));
});
