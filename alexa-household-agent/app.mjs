import {plan,load,save,checkSnapshot,withStorageLock} from './engine.mjs';
const $=id=>document.getElementById(id);
let storage;try{storage=window.localStorage;}catch{storage={getItem:()=>null,setItem:()=>{throw Error('Browser storage is unavailable')},removeItem:()=>{}};}
let savedSnapshot=null;
let state=load({getItem:key=>(savedSnapshot=storage.getItem(key))});
let persisted=true;
let working=false;
function storageWarning(error){
 if(error.code==='STATE_CONFLICT')return 'Another tab changed the saved plan. Your preview is not saved. Refresh to load the saved plan.';
 if(error.code==='STATE_BUSY'||error.code==='STORAGE_LOCK_UNAVAILABLE')return `${error.message} This preview is not saved.`;
 return 'Storage unavailable. This preview lasts only in this tab. Refresh may restore an older plan.';
}
function restore(){if(state.last)$('goal').value=state.last.goal;for(const k of ['budget','deadline','people'])$(k).value=state[k];$('outage').checked=state.outage;document.querySelectorAll('[name=pantry]').forEach(i=>i.checked=state.pantry.includes(i.value));}
function render(){
 $('revision').textContent=`Revision ${state.revision}`;
 const r=state.last;if(!r)return;
 $('status').textContent={ready:'Plan saved on this device',retry:'Saved checkpoint · retry needed',blocked:'Needs your attention'}[r.status];
 if(!persisted)$('status').textContent=r.status==='blocked'?'Needs your attention · not saved':'Preview only · not saved';
 $('title').textContent=r.title;$('summary').textContent=r.summary;$('steps').replaceChildren();$('trace').replaceChildren();
 for(const s of r.steps){const li=document.createElement('li'),time=document.createElement('time'),div=document.createElement('div'),strong=document.createElement('strong'),p=document.createElement('p');time.textContent=s.time;strong.textContent=s.text;p.textContent=s.owner;div.append(strong,p);li.append(time,div);$('steps').append(li);}
 for(const t of r.trace){const li=document.createElement('li');li.textContent=`${t.tool}: ${t.detail}`;$('trace').append(li);}
 $('retry').hidden=r.status!=='retry';$('retry').textContent=persisted?'Retry saved plan':'Retry this preview';
}
async function run(goal){if(working)return;working=true;try{
 const next={...state,budget:Number($('budget').value),deadline:Number($('deadline').value),people:Number($('people').value),outage:$('outage').checked,pantry:[...document.querySelectorAll('[name=pantry]:checked')].map(i=>i.value)};
 state=plan(next,goal);persisted=false;
 try{savedSnapshot=await withStorageLock(navigator.locks,()=>save(storage,state,savedSnapshot));persisted=true;$('saved').textContent=`${state.events.length} simulated steps saved · refresh to resume`;}
 catch(error){
  $('saved').textContent=storageWarning(error);
  for(const t of state.last.trace)if(t.tool==='reminders.write')t.detail=state.outage?'Reminder service unavailable; preview retained only in this tab.':'Simulated steps remain only in this tab. No real reminders sent.';
 }
 render();
 }catch(e){$('saved').textContent=`Cannot make this plan: ${e.message}`;}finally{working=false;}}
$('planner').addEventListener('submit',e=>{e.preventDefault();run($('goal').value)});
$('retry').addEventListener('click',()=>run(state.last.goal));
$('reset').addEventListener('click',async()=>{if(working)return;working=true;try{await withStorageLock(navigator.locks,()=>{checkSnapshot(storage,savedSnapshot);storage.removeItem('household-relay-v1');});location.reload()}catch(error){$('saved').textContent=['STATE_CONFLICT','STATE_BUSY','STORAGE_LOCK_UNAVAILABLE'].includes(error.code)?error.message:'Could not clear browser storage. The current plan is unchanged.';}finally{working=false;}});
restore();render();
