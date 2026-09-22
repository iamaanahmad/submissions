// Register in a Sanity Studio schema.types array.
const text=(name,title)=>({name,title,type:'string',validation:r=>r.required()});
const ref=(name,to)=>({name,type:'reference',to:[{type:to}],validation:r=>r.required()});
export const schemaTypes=[
{name:'prop',title:'Prop',type:'document',fields:[text('title','Name'),{name:'kind',type:'string',options:{list:['umbrella','lantern','letter']},validation:r=>r.required()},{name:'resetMinutes',title:'Reset minutes',type:'number',validation:r=>r.required().min(0).max(60)},{name:'notes',type:'text'}]},
{name:'scene',title:'Scene',type:'document',fields:[text('title','Scene name'),{name:'order',type:'number',validation:r=>r.required().integer().min(1)}]},
{name:'cue',title:'Cue and handoff',type:'document',fields:[text('title','Cue name'),ref('scene','scene'),ref('prop','prop'),{name:'start',title:'Start minute',type:'number',validation:r=>r.required().min(0).max(239)},{name:'end',title:'End minute',type:'number',validation:r=>r.required().min(1).max(240).custom((end,ctx)=>end>ctx.document.start||'End must follow start')},text('crew','Crew member'),{name:'location',type:'string',options:{list:['Stage left','Stage right','Upstage']},validation:r=>r.required()},{name:'confirmed',title:'Handoff confirmed',type:'boolean',initialValue:false}]},
{name:'production',title:'Production',type:'document',fields:[text('title','Production name'),{name:'subtitle',type:'string'},{name:'description',type:'text'},{name:'status',type:'string',options:{list:['draft','rehearsal','ready']}},{name:'cues',type:'array',of:[{type:'reference',to:[{type:'cue'}]}],validation:r=>r.required().min(1).unique()}]}
];
