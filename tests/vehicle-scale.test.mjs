import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {VehicleMarker} from '../src/VehicleMarker.js';
test('vehicle footprint stays constant in map metres across zoom levels',()=>{
 const render=size=>renderToStaticMarkup(createElement(VehicleMarker,{size}));
 assert.equal(render(100),render(10));
 const rect=render(100);
 assert.match(rect,/width="2.5"/);
 assert.match(rect,/height="6"/);
});
