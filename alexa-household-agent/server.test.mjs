import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer, request} from 'node:http';
import {once} from 'node:events';
import {handleRequest} from './server.mjs';

async function withServer(check) {
 const server=createServer(handleRequest);
 server.listen(0,'127.0.0.1');
 await once(server,'listening');
 const get=(path,method='GET')=>new Promise((resolve,reject)=>{
  const req=request({hostname:'127.0.0.1',port:server.address().port,path,method,agent:false},res=>{
   let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);
   res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));
  });
  req.setTimeout(3000,()=>req.destroy(Error('Request timed out')));
  req.on('error',reject);req.end();
 });
 try {await check(get);} finally {await new Promise(resolve=>server.close(resolve));}
}

test('malformed requests fail safely and the next visitor can load the app',()=>withServer(async get=>{
 for(const path of ['//[invalid','http://[broken']){
  assert.equal((await get(path)).status,400);
  const healthy=await get('/');
  assert.equal(healthy.status,200);
  assert.match(healthy.body,/Household Relay/);
 }
}));

test('only public browser assets are served, including inherited-property paths',()=>withServer(async get=>{
 for(const path of ['/constructor','/__proto__','/toString','/server.mjs','/README.md','/.env','/../README.md']){
  assert.equal((await get(path)).status,404,path);
 }
 for(const path of ['/','/style.css','/app.mjs','/engine.mjs']){
  const res=await get(path);
  assert.equal(res.status,200,path);
  assert.equal(res.headers['x-content-type-options'],'nosniff');
  assert.match(res.headers['content-security-policy'],/connect-src 'none'/);
 }
}));

test('HEAD returns headers without content and writes are rejected',()=>withServer(async get=>{
 const head=await get('/','HEAD');assert.equal(head.status,200);assert.equal(head.body,'');
 for(const method of ['POST','PUT','DELETE']) assert.equal((await get('/',method)).status,405);
 assert.equal((await get('/')).status,200);
}));
