import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, rm, symlink, writeFile} from 'node:fs/promises';
import {request} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createAirfieldServer} from '../server/index.mjs';

async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'airfield-server-'));
 const client=join(root,'client');
 await mkdir(join(client,'assets'),{recursive:true});
 await writeFile(join(client,'index.html'),'<!doctype html><title>Airfield</title>');
 await writeFile(join(client,'assets','app.css'),'body { color: navy; }');
 await writeFile(join(client,'.hidden'),'private');
 await writeFile(join(root,'secret.txt'),'outside');
 await symlink(join(root,'secret.txt'),join(client,'escape.txt'));
 const trafficService={async get(id){if(id!=='TEST')throw new Error('unknown');return {source:'test',state:'current'};}};
 const server=createAirfieldServer({clientDir:client,trafficService});
 server.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(async()=>{
  await new Promise(resolve=>server.close(resolve));
  await rm(root,{recursive:true,force:true});
 });
 return {port:server.address().port};
}

function get(port,path,{method='GET'}={}){
 return new Promise((resolve,reject)=>{
  const req=request({host:'127.0.0.1',port,path,method},res=>{
   const chunks=[];
   res.on('data',chunk=>chunks.push(chunk));
   res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString()}));
  });
  req.on('error',reject);
  req.end();
 });
}

test('serves built assets with content types and correct HEAD behavior',async t=>{
 const {port}=await fixture(t);
 const page=await get(port,'/');
 assert.equal(page.status,200);
 assert.match(page.headers['content-type'],/^text\/html/);
 assert.match(page.body,/Airfield/);

 const head=await get(port,'/assets/app.css',{method:'HEAD'});
 assert.equal(head.status,200);
 assert.match(head.headers['content-type'],/^text\/css/);
 assert.equal(head.headers['content-length'],String(Buffer.byteLength('body { color: navy; }')));
 assert.equal(head.body,'');

 const missing=await get(port,'/missing');
 assert.equal(missing.status,404);
 assert.equal(missing.body,'Not found\n');
});

test('routes health and traffic API requests',async t=>{
 const {port}=await fixture(t);
 const health=await get(port,'/healthz');
 assert.equal(health.status,200);
 assert.equal(health.headers['cache-control'],'no-store');
 assert.equal(health.body,'ok\n');

 const traffic=await get(port,'/api/traffic?airport=TEST');
 assert.equal(traffic.status,200);
 assert.deepEqual(JSON.parse(traffic.body),{source:'test',state:'current'});
 assert.equal(traffic.headers['cache-control'],'no-store');

 const unknown=await get(port,'/api/traffic?airport=UNKNOWN');
 assert.equal(unknown.status,400);
 assert.deepEqual(JSON.parse(unknown.body),{error:'Unknown airport'});
});

test('blocks traversal, dotfiles, symlink escapes, and unsupported methods',async t=>{
 const {port}=await fixture(t);
 for(const path of ['/%2e%2e/secret.txt','/%2Ehidden','/escape.txt']){
  const response=await get(port,path);
  assert.equal(response.status,404,path);
  assert.doesNotMatch(response.body,/outside|private/,path);
 }
 const post=await get(port,'/',{method:'POST'});
 assert.equal(post.status,405);
 assert.equal(post.headers.allow,'GET, HEAD');
});
