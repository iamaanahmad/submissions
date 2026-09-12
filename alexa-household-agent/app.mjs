import {plan,load,save,checkSnapshot} from './engine.mjs';
const $=id=>document.getElementById(id);
let storage;try{storage=window.localStorage;}catch{storage={getItem:()=>null,setItem:()=>{throw Error('Browser storage is unavailable')},removeItem:()=>{}};}
let savedSnapshot=null;
let state=load({getItem:key=>(savedSnapshot=storage.getItem(key))});
let persisted=true;
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
function run(goal){try{
 const next={...state,budget:Number($('budget').value),deadline:Number($('deadline').value),people:Number($('people').value),outage:$('outage').checked,pantry:[...document.querySelectorAll('[name=pantry]:checked')].map(i=>i.value)};
 state=plan(next,goal);persisted=false;
 try{savedSnapshot=save(storage,state,savedSnapshot);persisted=true;$('saved').textContent=`${state.events.length} simulated steps saved · refresh to resume`;}
 catch(error){
  $('saved').textContent=error.code==='STATE_CONFLICT'?'Another tab changed the saved plan. Your preview is not saved. Refresh to load the saved plan.':'Storage unavailable. This preview lasts only in this tab. Refresh may restore an older plan.';
  for(const t of state.last.trace)if(t.tool==='reminders.write')t.detail=state.outage?'Reminder service unavailable; preview retained only in this tab.':'Simulated steps remain only in this tab. No real reminders sent.';
 }
 render();
 }catch(e){$('saved').textContent=`Cannot make this plan: ${e.message}`;}}
$('planner').addEventListener('submit',e=>{e.preventDefault();run($('goal').value)});
$('retry').addEventListener('click',()=>run(state.last.goal));
$('reset').addEventListener('click',()=>{try{checkSnapshot(storage,savedSnapshot);storage.removeItem('household-relay-v1');location.reload()}catch(error){$('saved').textContent=error.code==='STATE_CONFLICT'?error.message:'Could not clear browser storage. The current plan is unchanged.';}});
restore();render();
