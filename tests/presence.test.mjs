import test from 'node:test';import assert from 'node:assert/strict';
import {reconcilePresence,EXIT_MS} from '../src/presence.js';
test('updates existing identities in place without treating them as arrivals',()=>{
 const a=reconcilePresence([],[{id:'a',speed:2},{id:'b'}],0);
 const b=reconcilePresence(a,[{id:'b'},{id:'a',speed:8},{id:'c'}],10);
 assert.deepEqual(b.map(f=>f.id),['a','b','c']);assert.equal(b[0].speed,8);assert(b.every(f=>!f.exiting));
});
test('missing targets stay for their exit fade then expire',()=>{
 let a=reconcilePresence([],[{id:'a'}],0);a=reconcilePresence(a,[],10);
 assert.equal(a[0].exiting,true);assert.equal(a[0].removeAt,10+EXIT_MS);
 assert.equal(reconcilePresence(a,[],20)[0].removeAt,10+EXIT_MS);
 assert.equal(reconcilePresence(a,[],10+EXIT_MS).length,0);
});
test('a report returning during its exit cancels removal and refreshes data',()=>{
 let a=reconcilePresence([],[{id:'a',speed:2}],0);a=reconcilePresence(a,[],10);
 a=reconcilePresence(a,[{id:'a',speed:4}],20);assert.equal(a.length,1);assert.equal(a[0].exiting,false);assert.equal(a[0].removeAt,undefined);assert.equal(a[0].speed,4);
});
