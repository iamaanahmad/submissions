import {seed,plan,load,save} from './engine.mjs';
const $=id=>document.getElementById(id);
let storage;try{storage=window.localStorage;}catch{storage={getItem:()=>null,setItem:()=>{throw Error('Browser storage is unavailable')},removeItem:()=>{}};}
let state=load(storage);
function restore(){if(state.last)$('goal').value=state.last.goal;for(const k of ['budget','deadline','people'])$(k).value=state[k];$('outage').checked=state.outage;document.querySelectorAll('[name=pantry]').forEach(i=>i.checked=state.pantry.includes(i.value));}
function render(){
 $('revision').textContent=`Revision ${state.revision}`;
 const r=state.last;if(!r)return;
 $('status').textContent={ready:'Plan saved on this device',retry:'Saved checkpoint · retry needed',blocked:'Needs your attention'}[r.status];
 $('title').textContent=r.title;$('summary').textContent=r.summary;$('steps').replaceChildren();$('trace').replaceChildren();
 for(const s of r.steps){const li=document.createElement('li'),time=document.createElement('time'),div=document.createElement('div'),strong=document.createElement('strong'),p=document.createElement('p');time.textContent=s.time;strong.textContent=s.text;p.textContent=s.owner;div.append(strong,p);li.append(time,div);$('steps').append(li);}
 for(const t of r.trace){const li=document.createElement('li');li.textContent=`${t.tool}: ${t.detail}`;$('trace').append(li);}
 $('retry').hidden=r.status!=='retry';
}
function run(goal){try{
 const next={...state,budget:Number($('budget').value),deadline:Number($('deadline').value),people:Number($('people').value),outage:$('outage').checked,pantry:[...document.querySelectorAll('[name=pantry]:checked')].map(i=>i.value)};
 const planned=plan(next,goal);save(storage,planned);state=planned;$('saved').textContent=`${state.events.length} simulated steps saved · refresh to resume`;render();
 }catch(e){$('saved').textContent=`Plan not saved: ${e.message}`;}}
$('planner').addEventListener('submit',e=>{e.preventDefault();run($('goal').value)});
$('retry').addEventListener('click',()=>run(state.last.goal));
$('reset').addEventListener('click',()=>{storage.removeItem('household-relay-v1');location.reload()});
restore();render();
