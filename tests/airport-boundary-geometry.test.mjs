import test from 'node:test';
import assert from 'node:assert/strict';
import {selectAirportBoundaryGeometry} from '../scripts/airport-boundary-geometry.mjs';

const square=(west=0,south=0,east=10,north=10)=>[
 {lat:south,lon:west},{lat:south,lon:east},{lat:north,lon:east},{lat:north,lon:west},{lat:south,lon:west},
];
const airport={id:'TEST',code:'TST'};
const boundary={type:'way',id:1,tags:{aeroway:'aerodrome',icao:'TEST'},geometry:square()};
const feature=(id,kind,geometry)=>({type:'way',id,tags:{aeroway:kind},geometry});

test('selects only allowed geometry with a vertex inside or on the verified boundary',()=>{
 const inside=feature(2,'runway',[{lat:5,lon:-1},{lat:5,lon:5}]);
 const edge=feature(3,'taxiway',[{lat:4,lon:10},{lat:6,lon:12}]);
 const outside=feature(4,'apron',square(20,20,21,21));
 const node={type:'node',id:5,tags:{aeroway:'parking_position'},lat:5,lon:5};
 const nearby={type:'way',id:6,tags:{aeroway:'aerodrome',icao:'NEAR'},geometry:square(20,20,30,30)};
 const data={version:.6,osm3s:{timestamp_osm_base:'now'},elements:[boundary,nearby,inside,edge,outside,node]};
 const result=selectAirportBoundaryGeometry(data,airport);
 assert.deepEqual(result.elements.map(({id})=>id),[2,3]);
 assert.equal(result.version,.6);assert.deepEqual(result.osm3s,data.osm3s);
 assert.equal(result.airfieldDiscovery,'Verified airport boundary');
});

test('fails closed for missing, mismatched, ambiguous, open, or non-finite boundaries',()=>{
 const cases=[
  [],
  [{...boundary,tags:{aeroway:'aerodrome',icao:'OTHER'}}],
  [boundary,{...boundary,id:7,tags:{aeroway:'aerodrome',iata:'TST'}}],
  [{...boundary,geometry:square().slice(0,-1)}],
  [{...boundary,geometry:[...square().slice(0,-2),{lat:NaN,lon:0},square()[0]]}],
 ];
 for(const elements of cases)assert.equal(selectAirportBoundaryGeometry({elements},airport),null);
});

test('accepts IATA identity and preserves complete selected relation geometry',()=>{
 const terminal={type:'relation',id:8,tags:{aeroway:'terminal'},members:[
  {type:'way',ref:80,geometry:square(2,2,3,3)},
  {type:'way',ref:81,geometry:square(20,20,21,21)},
 ]};
 const result=selectAirportBoundaryGeometry({generator:'fixture',elements:[{...boundary,tags:{aeroway:'aerodrome',iata:'TST'}},terminal]},airport,'Exact airport polygon');
 assert.equal(result.elements[0].members.length,2);assert.equal(result.elements[0].members[0].ref,80);
 assert.equal(result.airfieldDiscovery,'Exact airport polygon');assert.equal(result.generator,'fixture');
});

test('requires the complete boundary to fit a supplied fetched bbox',()=>{
 const data={elements:[boundary,feature(12,'runway',[{lat:5,lon:2},{lat:5,lon:8}])]};
 assert(selectAirportBoundaryGeometry(data,airport,{bbox:{south:-1,west:-1,north:11,east:11}}));
 assert.equal(selectAirportBoundaryGeometry(data,airport,{bbox:{south:1,west:1,north:9,east:9}}),null);
 assert.equal(selectAirportBoundaryGeometry(data,airport,{bbox:{south:1,west:1,north:1,east:9}}),null);
});

test('stitches a safely connected relation outer ring and rejects incomplete rings',()=>{
 const members=[
  {type:'way',role:'outer',geometry:[{lat:0,lon:0},{lat:0,lon:10}]},
  {type:'way',role:'outer',geometry:[{lat:10,lon:10},{lat:0,lon:10}]},
  {type:'way',role:'outer',geometry:[{lat:10,lon:10},{lat:10,lon:0}]},
  {type:'way',role:'outer',geometry:[{lat:10,lon:0},{lat:0,lon:0}]},
 ];
 const relation={type:'relation',id:9,tags:{aeroway:'aerodrome',icao:'TEST'},members};
 const runway=feature(10,'runway',[{lat:5,lon:1},{lat:5,lon:9}]);
 assert.deepEqual(selectAirportBoundaryGeometry({elements:[relation,runway]},airport).elements.map(({id})=>id),[10]);
 assert.equal(selectAirportBoundaryGeometry({elements:[{...relation,members:members.slice(0,-1)},runway]},airport),null);
 assert.equal(selectAirportBoundaryGeometry({elements:[{...relation,members:[...members,{type:'way',role:'inner',ref:99}]},runway]},airport),null);
});

test('relation holes exclude geometry and incomplete feature relations fail closed',()=>{
 const hole={type:'way',role:'inner',geometry:square(3,3,7,7)};
 const relation={type:'relation',id:90,tags:boundary.tags,members:[{type:'way',role:'outer',geometry:square()},hole]};
 const insideHole=feature(91,'apron',square(4,4,5,5));
 const runway=feature(92,'runway',[{lat:1,lon:1},{lat:2,lon:2}]);
 assert.deepEqual(selectAirportBoundaryGeometry({elements:[relation,insideHole,runway]},airport).elements.map(e=>e.id),[92]);
 const partial={type:'relation',id:93,tags:{aeroway:'terminal'},members:[{type:'way',ref:1,geometry:square(1,1,2,2)},{type:'way',ref:2}]};
 assert.equal(selectAirportBoundaryGeometry({elements:[boundary,partial]},airport),null);
});

test('an incomplete relation outside the airport does not block its complete layout',()=>{
 const runway=feature(94,'runway',[{lat:1,lon:1},{lat:2,lon:2}]);
 const outside={type:'relation',id:95,tags:{aeroway:'terminal'},members:[{type:'way',geometry:square(20,20,21,21)},{type:'way',ref:9}]};
 assert.deepEqual(selectAirportBoundaryGeometry({elements:[boundary,runway,outside]},airport).elements.map(e=>e.id),[94]);
});

test('keeps separate airport parcels and rejects an incomplete parcel',()=>{
 const relation={type:'relation',id:100,tags:boundary.tags,members:[
  {type:'way',role:'outer',geometry:square()},
  {type:'way',role:'outer',geometry:square(20,20,25,25)},
 ]};
 const runway=feature(101,'runway',[{lat:1,lon:1},{lat:2,lon:2}]);
 const apron=feature(102,'apron',square(21,21,22,22));
 const outside=feature(103,'apron',square(15,15,16,16));
 assert.deepEqual(selectAirportBoundaryGeometry({elements:[relation,runway,apron,outside]},airport).elements.map(e=>e.id),[101,102]);
 relation.members[1].geometry=relation.members[1].geometry.slice(0,-1);
 assert.equal(selectAirportBoundaryGeometry({elements:[relation,runway]},airport),null);
});
