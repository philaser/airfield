import test from 'node:test';import assert from 'node:assert/strict';
import {resolveAircraftFamily} from '../src/aircraft-families.js';

const family=code=>resolveAircraftFamily(code).family;

test('Boeing generations share their intended family without conflating the 737 and 747',()=>{
 for(const code of ['B732','B738','B38M','B3XM','E737','P8'])assert.equal(family(code),'B738',code);
 for(const code of ['B741','B744','B748','BLCF'])assert.equal(family(code),'B744',code);
 assert.notEqual(family('B38M'),family('B748'));
 assert.equal(family('B753'),'B752');assert.equal(family('B764'),'B763');
 assert.equal(family('B77W'),'B772');assert.equal(family('B78X'),'B789');
});

test('Airbus and regional-airliner variants resolve to shared airframe families',()=>{
 for(const code of ['A318','A321','A19N','A21N'])assert.equal(family(code),'A320',code);
 for(const [code,expected] of [['A339','A332'],['A35K','A359'],['A388','A388'],['BCS1','BCS3'],['E75S','E75L'],['E295','E190'],['CRJ2','CRJ7'],['DH8A','DH8D'],['AT43','AT76']])assert.equal(family(code),expected,code);
});

test('business and military jets use honest generic silhouettes when no family shape exists',()=>{
 assert.deepEqual(resolveAircraftFamily(' C25A '),{family:'jet-small',label:'Small business jet'});
 assert.equal(family('C56X'),'jet-small');
 assert.equal(family('C680'),'jet-large');
 assert.equal(family('GLF6'),'jet-large');
 assert.equal(family('B712'),'jet-airliner');
 assert.equal(family('MD90'),'jet-airliner');
 assert.equal(family('C17'),'jet-heavy');
 assert.equal(family('A343'),'jet-heavy');
 assert.equal(family('MD11'),'jet-heavy');
 assert.equal(family('F16'),'fighter');
});

test('light aircraft, regional props and rotorcraft follow ICAO configuration data',()=>{
 assert.equal(family('C172'),'prop-single');
 assert.equal(family('PA34'),'prop-twin');
 assert.equal(family('C208'),'prop-single-large');
 assert.equal(family('PC12'),'prop-single-large');
 assert.equal(family('C130'),'prop-heavy');
 assert.equal(family('R44'),'helicopter');
 assert.equal(family('EC35'),'helicopter');
 assert.equal(family('GLID'),'glider');
 assert.equal(family('BALL'),'balloon');
});

test('missing, malformed and explicitly unknown designators remain renderable as unknown',()=>{
 for(const code of [undefined,null,'','NOPE','ZZZZ'])assert.deepEqual(resolveAircraftFamily(code),{family:'unknown',label:'Unknown aircraft'});
 assert.equal(family('toString'),'unknown');
 assert.equal(family('a20n'),'A320');
});
