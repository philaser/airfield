import test from 'node:test';
import assert from 'node:assert/strict';
import {svgPathBbox} from 'svg-path-bbox';
import {aircraftShape,shapeDescription,models} from '../src/aircraft-shape.js';
import {aircraftTypes} from '../src/aircraft-types.js';

test('every known type and unknown type resolves to a drawable silhouette',()=>{
 for(const code of [...Object.keys(aircraftTypes),'NOT-A-TYPE','',null,'constructor']){
  const shape=aircraftShape(code);
  assert(shape.path,`${code} has a path`);
  assert(shape.length>0&&shape.wingspan>0,`${code} has a positive footprint`);
  assert.equal(shape.bounds.length,4);
  assert(shape.bounds.every(Number.isFinite));
 }
});
test('all distinct family drawings fit their tight SVG bounds',()=>{
 const paths=new Map();
 for(const code of [...Object.keys(aircraftTypes),'']){const shape=aircraftShape(code);paths.set(shape.path,shape);}
 for(const shape of paths.values()){
  const [x,y,x2,y2]=svgPathBbox(shape.path);
  [x,y,x2-x,y2-y].forEach((v,i)=>assert(Math.abs(v-shape.bounds[i])<1e-7,shape.family));
 }
});
test('retains calibrated models and labels fallback footprints as approximate',()=>{
 assert.equal(aircraftShape('B744').path,models.B744.path);
 assert.equal(aircraftShape('B744').approximate,false);
 assert.equal(aircraftShape('C172').approximate,true);
 assert.match(shapeDescription({model:'C172'}),/approximate shape/);
 assert.doesNotMatch(shapeDescription({model:'C172'}),/nominal|\d+ m/);
 assert.equal(aircraftShape(null,'helicopter').kind,'helicopter');
 assert.match(shapeDescription({model:null}),/approximate shape/);
});
