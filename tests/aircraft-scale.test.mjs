import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {svgPathBbox} from 'svg-path-bbox';
const models=JSON.parse(fs.readFileSync(new URL('../src/aircraft-models.json',import.meta.url)));
test('silhouette bounds exclude padding, so published dimensions describe the visible aircraft',()=>{for(const m of Object.values(models)){const [x,y,x2,y2]=svgPathBbox(m.path);const actual=[x,y,x2-x,y2-y];actual.forEach((v,i)=>assert(Math.abs(v-m.bounds[i])<1e-8));}});
test('short-haul A320 remains physically smaller than A380 against the same airport scale',()=>{assert.equal(models.A320.wingspan,35.8);assert.equal(models.A388.wingspan,79.8);assert.equal(models.B77W.length,73.9);assert.equal(models.B772.length,63.7);assert(models.A388.wingspan/models.A320.wingspan>2.2);assert(models.A388.length/models.A320.length>1.9);});
test('regional jets and helicopter rotor envelopes preserve their model-specific metre scale',()=>{
 assert.equal(models.E75L.length,31.68);assert.equal(models.E75L.wingspan,28.65);
 assert(models.E75L.wingspan>models.E75S.wingspan);assert.equal(models.E75L.length,models.E75S.length);
 assert.equal(models.EC35.kind,'helicopter');assert.equal(models.EC35.wingspan,10.4);assert.equal(models.EC35.length,12.26);
 assert.equal(models.AS50.wingspan,10.69);assert(models.AS50.length<models.CRJ9.length);
 for(const code of ['A321','A21N','A319','B739','B38M','B763','B764','B788','A332','A333','A339','BCS1','BCS3','CRJ9','E75L'])assert(models[code],code);
});
test('newly observed 747, 757 and A350-900 types have calibrated footprints',()=>{
 assert.equal(models.B744.wingspan,64.4);assert.equal(models.B744.length,70.7);
 assert.equal(models.B752.length,47.3);assert.equal(models.A359.length,66.8);
 assert(models.B748.length>models.B744.length);
});
