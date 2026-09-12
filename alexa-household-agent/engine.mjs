// Original goal-directed planner. All adapters use synthetic household data.
export const seed = () => ({version:1, revision:0, budget:12, people:2, deadline:1140,
  pantry:['rice','beans','tomato'], unavailable:[], outage:false, goals:[], events:[], last:null});
const recipes = [
 {name:'Tomato rice bowls',minutes:25,ingredients:['rice','beans','tomato'],cost:0},
 {name:'Vegetable pasta',minutes:20,ingredients:['pasta','tomato','spinach'],cost:6},
 {name:'Chickpea wraps',minutes:10,ingredients:['wraps','chickpeas','yogurt'],cost:9}
];
export const clock = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
export function validate(s) {
 if(!s || s.version!==1 || !Number.isInteger(s.revision) || s.revision<0 || !Number.isFinite(s.budget) || s.budget<0 || s.budget>100 || !Number.isInteger(s.deadline) || s.deadline<1080 || s.deadline>1320 || !Number.isInteger(s.people) || s.people<1 || s.people>6 || !Array.isArray(s.pantry) || !Array.isArray(s.unavailable) || typeof s.outage!=='boolean' || !Array.isArray(s.events) || !Array.isArray(s.goals)) throw Error('Invalid household state');
 const strings = a => a.length<=50 && a.every(x=>typeof x==='string' && x.length<=100);
 const step = e => e && typeof e.text==='string' && e.text.length<500 && typeof e.owner==='string' && typeof e.time==='string';
 if(!strings(s.pantry) || !strings(s.unavailable) || !strings(s.goals) || s.events.length>100 || !s.events.every(step)) throw Error('Invalid saved items');
 if(s.last!==null && (!s.last || !['ready','retry','blocked'].includes(s.last.status) || !['dinner','shopping','morning'].includes(s.last.goal) || typeof s.last.title!=='string' || typeof s.last.summary!=='string' || !Array.isArray(s.last.steps) || !s.last.steps.every(step) || !Array.isArray(s.last.trace) || !s.last.trace.every(t=>t && typeof t.tool==='string' && typeof t.detail==='string'))) throw Error('Invalid saved plan');
 return s;
}
export function plan(input, goal) {
 const s=structuredClone(validate(input));
 if(!['dinner','morning','shopping'].includes(goal)) throw Error('Choose dinner, morning, or shopping');
 // Dinner and shopping share one meal decision. Retire both before a replan,
 // including blocked plans and outages, so stale shopping or dinner cannot survive.
 const replaced=goal==='morning'?['morning']:['dinner','shopping'];
 s.events=s.events.filter(e=>!replaced.includes(e.goal));
 s.goals=s.goals.filter(g=>!replaced.includes(g));
 const trace=[]; const call=(tool,detail)=>trace.push({tool,detail});
 call('calendar.read','Synthetic calendar: pickup 18:00–18:30; work ends 17:30.');
 call('pantry.read',`Available: ${s.pantry.join(', ') || 'none'}.`);
 const candidates=recipes.map(r=>({...r,missing:r.ingredients.filter(i=>!s.pantry.includes(i))}))
 .map(r=>({...r,price:r.missing.length*3*Math.ceil(s.people/2)}));
 call('planner.search',`Compared ${candidates.length} meals against time, budget, and stock.`);
 // Pickup is a fixed obligation. A shopping trip adds 20 minutes before cooking.
 const feasible=candidates.filter(r=>r.price<=s.budget && !r.missing.some(i=>s.unavailable.includes(i)) && 1110+(r.missing.length?20:0)+r.minutes<=s.deadline)
 .sort((a,b)=>a.price-b.price || a.minutes-b.minutes);
 let result={goal,status:'ready',title:'',summary:'',steps:[],trace,missing:[],cost:0};
 if(goal==='morning') {
  call('weather.read','Synthetic forecast: rain at 08:00.');
  result.title='A calmer school morning'; result.summary='Leave at 07:40. Rain adds ten minutes to the journey.';
  result.steps=[{time:'07:00',text:'Pack lunches and water bottles',owner:'Adult A'},{time:'07:25',text:'Check bags, raincoats, and keys',owner:'Adult B'},{time:'07:40',text:'Leave for the 08:15 school start',owner:'Adult A'}];
 } else if(!feasible.length) {
  result.status='blocked';result.title='This evening needs a change';result.summary='No meal fits your time, budget, and stock. Raise the budget or move dinner later.';
  call('planner.abstain','No feasible plan. No reminders or shopping items created.');
 } else {
  const meal=feasible[0]; result.title=goal==='shopping'?'Buy only what is missing':meal.name;
  result.missing=meal.missing;result.cost=meal.price;
  result.summary=goal==='shopping'?(meal.missing.length?`Draft list: ${meal.missing.join(', ')}. Estimated cost $${meal.price}.`:'Your pantry already covers this meal. Nothing to buy.'):`Dinner at ${clock(s.deadline)} for ${s.people}. Estimated extra cost $${meal.price}.`;
  call('stock.check',meal.missing.length?`In synthetic stock: ${meal.missing.join(', ')}.`:'All ingredients are already in the pantry.');
  if(goal==='dinner') result.steps.push({time:'18:00',text:'Collect the children; home at 18:30',owner:'Adult A'});
  if(meal.missing.length) result.steps.push({time:'18:30',text:`Draft shopping list: ${meal.missing.join(', ')}`,owner:'Adult B'});
  if(goal==='dinner') result.steps.push({time:clock(s.deadline-meal.minutes),text:`Prepare ${meal.name.toLowerCase()}`,owner:'Adult B'},{time:clock(s.deadline),text:'Dinner together',owner:'Everyone'});
 }
 if(result.status==='ready') {
  call('reminders.write',s.outage?'Synthetic reminder service unavailable; checkpoint retained.':'Saved in this browser only; no real reminders sent.');
  if(s.outage){result.status='retry';result.summary+=' Reminder service failed. Retry after restoring it.';}
  else {
   // Stable identifiers make repeated goals and retries replace, not duplicate.
   s.events=s.events.filter(e=>e.goal!==goal);
   s.events.push(...result.steps.map((e,i)=>({...e,goal,id:`${goal}:${i}`})));
   s.goals=[...new Set([...s.goals,goal])];
  }
 }
 s.revision++;s.last=result;return s;
}
export function load(storage) {
 try {const raw=storage.getItem('household-relay-v1');return raw?validate(JSON.parse(raw)):seed();}
 catch{return seed();}
}
export function checkSnapshot(storage,expectedSnapshot) {
 if(expectedSnapshot!==undefined && storage.getItem('household-relay-v1')!==expectedSnapshot) {
  const error=Error('Another tab changed the saved plan. Refresh to load it before saving or resetting.');
  error.code='STATE_CONFLICT';throw error;
 }
}
export function save(storage,state,expectedSnapshot) {
 validate(state);checkSnapshot(storage,expectedSnapshot);
 const snapshot=JSON.stringify(state);storage.setItem('household-relay-v1',snapshot);return snapshot;
}
