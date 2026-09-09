import {createReadStream, readFileSync} from 'node:fs';
import {realpath, stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {extname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createTrafficService, trafficMiddleware} from './traffic.mjs';

export const DEFAULT_CONTACT='https://github.com/philaser/airfield';

const CONTENT_TYPES=new Map([
 ['.css','text/css; charset=utf-8'],
 ['.html','text/html; charset=utf-8'],
 ['.ico','image/x-icon'],
 ['.jpeg','image/jpeg'],
 ['.jpg','image/jpeg'],
 ['.js','text/javascript; charset=utf-8'],
 ['.json','application/json; charset=utf-8'],
 ['.png','image/png'],
 ['.svg','image/svg+xml; charset=utf-8'],
 ['.txt','text/plain; charset=utf-8'],
 ['.webp','image/webp'],
 ['.woff','font/woff'],
 ['.woff2','font/woff2'],
]);

function send(req,res,status,body,headers={}){
 const content=Buffer.from(body);
 res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Content-Length':content.byteLength,'X-Content-Type-Options':'nosniff',...headers});
 res.end(req.method==='HEAD'?undefined:content);
}

function requestPath(req){
 const target=req.url||'/';
 const end=target.indexOf('?');
 const raw=end===-1?target:target.slice(0,end);
 if(!raw.startsWith('/'))throw new Error('Invalid request target');
 const pathname=decodeURIComponent(raw);
 if(pathname.includes('\0')||pathname.includes('\\'))throw new Error('Invalid path');
 return pathname;
}

async function serveStatic(req,res,pathname,clientDir){
 if(req.method!=='GET'&&req.method!=='HEAD')return send(req,res,405,'Method not allowed\n',{'Allow':'GET, HEAD'});
 const requested=pathname==='/'?'/index.html':pathname;
 const segments=requested.split('/').filter(Boolean);
 if(segments.some(segment=>segment==='..'||segment.startsWith('.')))return send(req,res,404,'Not found\n');

 try{
  const root=await realpath(clientDir);
  const file=await realpath(resolve(root,`.${requested}`));
  if(!file.startsWith(`${root}${sep}`))return send(req,res,404,'Not found\n');
  const details=await stat(file);
  if(!details.isFile())return send(req,res,404,'Not found\n');
  res.writeHead(200,{
   'Content-Type':CONTENT_TYPES.get(extname(file).toLowerCase())||'application/octet-stream',
   'Content-Length':details.size,
   'X-Content-Type-Options':'nosniff',
  });
  if(req.method==='HEAD')return res.end();
  const stream=createReadStream(file);
  stream.on('error',()=>res.destroy());
  stream.pipe(res);
 }catch{
  send(req,res,404,'Not found\n');
 }
}

export function createAirfieldServer({
 clientDir=fileURLToPath(new URL('../dist/client/',import.meta.url)),
 airportsPath=fileURLToPath(new URL('../public/data/airports.json',import.meta.url)),
 cachePath=fileURLToPath(new URL('../.cache/traffic-cache.json',import.meta.url)),
 contact=process.env.AIRFIELD_CONTACT||DEFAULT_CONTACT,
 trafficService,
}={}){
 const service=trafficService||createTrafficService({airports:JSON.parse(readFileSync(airportsPath,'utf8')),cachePath,contact});
 const traffic=trafficMiddleware(service);
 return createServer((req,res)=>{
  Promise.resolve(traffic(req,res,async()=>{
   let pathname;
   try{pathname=requestPath(req);}catch{return send(req,res,400,'Bad request\n');}
   if(pathname==='/healthz')return send(req,res,200,'ok\n',{'Cache-Control':'no-store'});
   return serveStatic(req,res,pathname,resolve(clientDir));
  })).catch(()=>{
   if(!res.headersSent)send(req,res,500,'Internal server error\n');
   else res.destroy();
  });
 });
}

export function startAirfieldServer({port=Number(process.env.PORT||10000),host='0.0.0.0'}={}){
 if(!Number.isInteger(port)||port<0||port>65535)throw new Error('PORT must be an integer between 0 and 65535');
 const server=createAirfieldServer();
 let shuttingDown=false;
 const shutdown=signal=>{
  if(shuttingDown)return;
  shuttingDown=true;
  console.log(`Received ${signal}; closing HTTP server.`);
  server.close(error=>{
   if(error){console.error(error);process.exitCode=1;}
  });
  setTimeout(()=>server.closeAllConnections(),10_000).unref();
 };
 process.once('SIGINT',shutdown);
 process.once('SIGTERM',shutdown);
 server.on('close',()=>{
  process.removeListener('SIGINT',shutdown);
  process.removeListener('SIGTERM',shutdown);
 });
 server.listen(port,host,()=>console.log(`Airfield listening on http://${host}:${server.address().port}`));
 return server;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))startAirfieldServer();
