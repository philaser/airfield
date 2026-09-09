import test from 'node:test';
import assert from 'node:assert/strict';
import {clampMapZoom,mapScreenTransform,screenToMapPoint,zoomAroundPoint} from '../src/map-gestures.js';

const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} should equal ${expected}`);
const closePoint=(actual,expected)=>{close(actual[0],expected[0]);close(actual[1],expected[1]);};
const bounds=[100,200,800,400];
const rect={left:20,top:30,width:400,height:400};

test('converts screen points through xMidYMid meet letterboxing',()=>{
 const transform=mapScreenTransform(bounds,1,[0,0],rect);
 assert.equal(transform.scale,.5);
 assert.equal(transform.offsetY,100);
 closePoint(screenToMapPoint({bounds,zoom:1,pan:[0,0],rect,client:[120,180]}),[300,300]);
});

test('keeps an off-centre pinch midpoint anchored while scaling and translating',()=>{
 const startClient=[140,190],nextClient=[175,215];
 const anchor=screenToMapPoint({bounds,zoom:1.5,pan:[17,-9],rect,client:startClient});
 const next=zoomAroundPoint({bounds,zoom:1.5,pan:[17,-9],rect,client:startClient,nextZoom:3.75,nextClient});
 closePoint(screenToMapPoint({bounds,zoom:next.zoom,pan:next.pan,rect,client:nextClient}),anchor);
});

test('clamps pinch zoom to the supported range while preserving its anchor',()=>{
 assert.equal(clampMapZoom(.2),1);assert.equal(clampMapZoom(40),12);
 for(const requested of [.2,40]){
  const client=[300,240],anchor=screenToMapPoint({bounds,zoom:2,pan:[0,0],rect,client});
  const next=zoomAroundPoint({bounds,zoom:2,pan:[0,0],rect,client,nextZoom:requested});
  closePoint(screenToMapPoint({bounds,zoom:next.zoom,pan:next.pan,rect,client}),anchor);
 }
});
