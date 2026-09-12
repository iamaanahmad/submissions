import test from 'node:test';
import assert from 'node:assert/strict';
import {withStorageLock,seed,plan,save,load,checkSnapshot} from './engine.mjs';

function coordinator(){
 let held=false;
 return {async request(name,options,callback){
  assert.equal(name,'household-relay-v1');
  assert.deepEqual(options,{mode:'exclusive',ifAvailable:true});
  if(held)return callback(null);
  held=true;try{return await callback({name});}finally{held=false;}
 }};
}
function memory(){let raw=null;return {getItem:()=>raw,setItem:(_,v)=>{raw=v;},removeItem:()=>{raw=null;}};}

test('overlapping save and reset cannot erase the first writer',async()=>{
 const locks=coordinator(),storage=memory();
 let release;const hold=new Promise(resolve=>{release=resolve;});
 const first=withStorageLock(locks,async()=>{await hold;return save(storage,plan(seed(),'morning'),null);});
 await assert.rejects(withStorageLock(locks,()=>save(storage,plan(seed(),'dinner'),null)),{code:'STATE_BUSY'});
 await assert.rejects(withStorageLock(locks,()=>storage.removeItem('household-relay-v1')),{code:'STATE_BUSY'});
 release();const snapshot=await first;
 assert.deepEqual(load(storage).goals,['morning']);
 await assert.rejects(withStorageLock(locks,()=>save(storage,plan(seed(),'dinner'),null)),{code:'STATE_CONFLICT'});
 await withStorageLock(locks,()=>save(storage,plan(load(storage),'dinner'),snapshot));
 assert.deepEqual(load(storage).goals,['morning','dinner']);
});

test('reset wins safely and stale save cannot restore removed plans',async()=>{
 const locks=coordinator(),storage=memory();
 const snapshot=save(storage,plan(seed(),'morning'),null);
 await withStorageLock(locks,()=>{checkSnapshot(storage,snapshot);storage.removeItem('household-relay-v1');});
 await assert.rejects(withStorageLock(locks,()=>save(storage,plan(seed(),'dinner'),snapshot)),{code:'STATE_CONFLICT'});
 assert.equal(storage.getItem(),null);
});

test('failed storage writes release the lock for recovery',async()=>{
 const locks=coordinator();
 await assert.rejects(withStorageLock(locks,()=>{throw Error('quota');}),/quota/);
 assert.equal(await withStorageLock(locks,()=>42),42);
});

test('missing or denied lock access never invokes a mutation',async()=>{
 let writes=0;
 for(const locks of [undefined,{}, {request:async()=>{throw Error('denied');}}]){
  await assert.rejects(withStorageLock(locks,()=>{writes++;}));
 }
 assert.equal(writes,0);
});
