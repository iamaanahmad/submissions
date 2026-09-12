import test from 'node:test';import assert from 'node:assert/strict';import {seed,plan,load,save,checkSnapshot} from './engine.mjs';
test('dinner respects pickup and uses pantry without spending',()=>{const s=plan(seed(),'dinner');assert.equal(s.last.status,'ready');assert.equal(s.last.cost,0);assert.equal(s.last.title,'Tomato rice bowls');assert.deepEqual(s.last.steps.map(x=>x.time),['18:00','18:35','19:00']);});
test('impossible deadline abstains without writing reminders',()=>{const s=plan({...seed(),deadline:1110},'dinner');assert.equal(s.last.status,'blocked');assert.equal(s.events.length,0);});
test('empty pantry chooses the fastest equal-cost feasible meal',()=>{const s=plan({...seed(),pantry:[]},'dinner');assert.equal(s.last.title,'Chickpea wraps');assert.equal(s.last.cost,9);});
test('zero budget and empty pantry abstain',()=>assert.equal(plan({...seed(),pantry:[],budget:0},'dinner').last.status,'blocked'));
test('stock failure selects another feasible candidate',()=>{const s=plan({...seed(),pantry:[],unavailable:['wraps'],deadline:1200},'dinner');assert.equal(s.last.title,'Vegetable pasta');});
test('household size scales cost',()=>assert.equal(plan({...seed(),pantry:[],people:4,budget:12},'dinner').last.status,'blocked'));
test('morning uses synthetic rain and sets departure',()=>{const s=plan(seed(),'morning');assert.equal(s.events.at(-1).time,'07:40');assert.ok(s.last.trace.some(t=>t.tool==='weather.read'));});
test('shopping does not create unnecessary purchases',()=>{const s=plan(seed(),'shopping');assert.equal(s.last.steps.length,0);assert.equal(s.last.cost,0);});
test('outage leaves checkpoint, recovery commits exactly once',()=>{let s=plan({...seed(),outage:true},'dinner');assert.equal(s.events.length,0);assert.equal(s.last.status,'retry');s=plan({...s,outage:false},s.last.goal);assert.equal(s.events.length,3);s=plan(s,'dinner');assert.equal(s.events.length,3);});
test('separate goals survive replanning',()=>{let s=plan(plan(seed(),'dinner'),'morning');s=plan(s,'dinner');assert.equal(s.events.length,6);assert.equal(new Set(s.events.map(e=>e.id)).size,6);});
test('input is not mutated',()=>{const s=seed();plan(s,'dinner');assert.equal(s.revision,0);assert.equal(s.last,null);});
test('persisted state resumes exactly',()=>{const memory=new Map();const storage={setItem:(k,v)=>memory.set(k,v),getItem:k=>memory.get(k)};const s=plan(seed(),'dinner');save(storage,s);assert.deepEqual(load(storage),s);});
test('corrupt and invalid storage safely reset',()=>{for(const data of ['{broken','null','{}','{"version":1}'])assert.deepEqual(load({getItem:()=>data}),seed());});
test('invalid parameters and unknown goals rejected',()=>{for(const budget of [-1,NaN,Infinity,101])assert.throws(()=>plan({...seed(),budget},'dinner'));assert.throws(()=>plan(seed(),'send money'));});
test('storage quota failure is surfaced',()=>assert.throws(()=>save({setItem:()=>{throw Error('quota');}},seed()),/quota/));
test('malformed saved result resets rather than breaking the page',()=>assert.deepEqual(load({getItem:()=>JSON.stringify({...seed(),last:{status:'ready'}})}),seed()));
test('blocked replan removes stale reminders for that goal',()=>{let s=plan(seed(),'dinner');s=plan({...s,budget:0,pantry:[]},'dinner');assert.equal(s.events.length,0);});
test('constraint sweep: every accepted dinner fits budget and deadline',()=>{let checked=0;for(const deadline of [1110,1140,1170,1200])for(const budget of [0,3,6,9,12,24])for(const people of [2,4,6])for(const pantry of [[],['rice','beans','tomato']]){const s=plan({...seed(),deadline,budget,people,pantry},'dinner');if(s.last.status==='ready'){assert.ok(s.last.cost<=budget);const times=s.last.steps.map(e=>e.time);assert.equal(times.at(-1),`${Math.floor(deadline/60)}:${String(deadline%60).padStart(2,'0')}`);assert.ok(times.every((t,i)=>i===0 || times[i-1]<=t));}else assert.equal(s.events.length,0);checked++;}assert.equal(checked,144);});

test('new dinner retires the previous shopping list while preserving morning',()=>{
 let s=plan(plan({...seed(),pantry:[]},'morning'),'shopping');
 assert.ok(s.events.some(e=>e.goal==='shopping'));
 s=plan({...s,pantry:seed().pantry,budget:0},'dinner');
 assert.equal(s.last.cost,0);
 assert.equal(s.events.filter(e=>e.goal==='shopping').length,0);
 assert.equal(s.events.filter(e=>e.goal==='morning').length,3);
 assert.deepEqual(s.goals,['morning','dinner']);
});
test('shopping replacement clears dinner on success, refusal, and outage',()=>{
 for(const variant of [{budget:12,outage:false},{budget:0,outage:false},{budget:12,outage:true}]){
  let s=plan(seed(),'dinner');
  s=plan({...s,pantry:[],...variant},'shopping');
  assert.equal(s.events.filter(e=>e.goal==='dinner').length,0);
  assert.ok(!s.goals.includes('dinner'));
  if(s.last.status==='retry'){
   s=plan({...s,outage:false},'shopping');
   s=plan(s,'shopping');
   assert.equal(s.events.length,1);
   assert.equal(s.events[0].goal,'shopping');
  }
 }
});
test('blocked dinner clears a prior shopping checkpoint across persistence',()=>{
 let s=plan({...seed(),pantry:[]},'shopping');
 s=plan({...s,budget:0},'dinner');
 assert.equal(s.last.status,'blocked');
 let raw;save({setItem:(_,v)=>{raw=v;}},s);
 const restored=load({getItem:()=>raw});
 assert.deepEqual(restored.events,[]);
 assert.deepEqual(restored.goals,[]);
});

test('stale tabs cannot overwrite another tab, even after repeated attempts',()=>{
 let raw=null;
 const storage={getItem:()=>raw,setItem:(_,value)=>{raw=value;}};
 const first=plan(seed(),'morning');
 const current=save(storage,first,null);
 let stale=plan(seed(),'dinner');
 for(let i=0;i<3;i++){
  assert.throws(()=>save(storage,stale,null),{code:'STATE_CONFLICT'});
  assert.equal(raw,current);
  assert.throws(()=>checkSnapshot(storage,null),{code:'STATE_CONFLICT'});
  stale=plan(stale,'dinner');
 }
 const refreshed=plan(load(storage),'dinner');
 save(storage,refreshed,current);
 assert.deepEqual(load(storage).goals,['morning','dinner']);
});

test('a reset in another tab cannot resurrect the old saved plan',()=>{
 let raw=null;
 const storage={getItem:()=>raw,setItem:(_,value)=>{raw=value;}};
 const first=plan(seed(),'morning');
 const snapshot=save(storage,first,null);
 raw=null;
 assert.throws(()=>save(storage,plan(first,'dinner'),snapshot),{code:'STATE_CONFLICT'});
 assert.equal(raw,null);
});

test('same-revision replacements are detected by content, not just revision',()=>{
 let raw=null;
 const storage={getItem:()=>raw,setItem:(_,value)=>{raw=value;}};
 const first=plan(seed(),'morning');
 const snapshot=save(storage,first,null);
 raw=JSON.stringify(plan(seed(),'dinner'));
 const changed=raw;
 assert.throws(()=>save(storage,plan(first,'morning'),snapshot),{code:'STATE_CONFLICT'});
 assert.equal(raw,changed);
});
