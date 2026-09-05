import test from 'node:test';import assert from 'node:assert/strict';
import {createMotionBuffer,canSmooth} from '../src/traffic-motion.js';
const report=(t,x,angle=90,speed=20)=>({id:'test',observedAt:t,position:{x,y:0,angle},speed,headingKnown:true});
test('plays a ten-second delayed measured segment and never extrapolates',()=>{
 const b=createMotionBuffer();b.ingest([report(100000,0)]);b.ingest([report(110000,100)]);
 assert.equal(b.sample('test',115000).x,50);assert.equal(b.sample('test',120000).x,100);assert.equal(b.sample('test',999999).x,100);
});
test('stale gaps, unknown headings, sharp turns, and teleports are not interpolated',()=>{
 for(const f of [report(140000,100),{...report(110000,100),headingKnown:false},report(110000,100,180),report(110000,3000)]){
  const b=createMotionBuffer();b.ingest([report(100000,0)]);b.ingest([f]);assert.equal(b.sample('test',115000).x,0);
 }
});
test('does not smooth a shortcut across a terminal',()=>{
 const building={tags:{aeroway:'terminal'},closed:true,points:[[40,-10],[60,-10],[60,10],[40,10],[40,-10]]};
 assert.equal(canSmooth({x:0,y:0,time:100000,angle:90,speed:20,headingKnown:true},{x:100,y:0,time:110000,angle:90,speed:20,headingKnown:true},[building]),false);
});
test('stationary noise does not create movement; reports are deduplicated and removed tracks expire',()=>{
 const b=createMotionBuffer();b.ingest([report(100000,0,0,0)]);b.ingest([report(110000,3,0,0)]);b.ingest([report(110000,500,0,0)]);
 assert.equal(b.sample('test',130000).x,0);b.ingest([]);assert.equal(b.sample('test',140000),null);
});
test('heading interpolation follows the shortest turn through north',()=>{
 const b=createMotionBuffer();b.ingest([report(100000,0,355)]);b.ingest([report(110000,50,5)]);assert.equal(b.sample('test',115000).angle,360);
});
