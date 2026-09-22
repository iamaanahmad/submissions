import {writeFileSync} from 'node:fs';
const ref=id=>({_type:'reference',_ref:id});
const props=[
{_id:'prop-umbrella',_type:'prop',title:'Ivory umbrella',kind:'umbrella',resetMinutes:4,home:'Stage left · hook 02',note:'Dry canopy and fold before handoff.',color:'#d8cfab'},
{_id:'prop-umbrella-spare',_type:'prop',title:'Red umbrella',kind:'umbrella',resetMinutes:2,home:'Stage right · hook 04',note:'Spare. Same silhouette; different color.',color:'#b94632'},
{_id:'prop-lantern',_type:'prop',title:'Brass lantern',kind:'lantern',resetMinutes:2,home:'Stage right · shelf 01',note:'Battery light only. Check switch.',color:'#c19a48'},
{_id:'prop-lantern-spare',_type:'prop',title:'Tin lantern',kind:'lantern',resetMinutes:1,home:'Stage left · shelf 03',note:'Spare. Check light level in rehearsal.',color:'#8b9795'},
{_id:'prop-letter',_type:'prop',title:'Sealed letter',kind:'letter',resetMinutes:1,home:'Stage left · tray 01',note:'Replace paper seal after each use.',color:'#dfcabc'}];
const scenes=[{_id:'scene-platform',_type:'scene',title:'The platform',order:1},{_id:'scene-storm',_type:'scene',title:'The storm',order:2},{_id:'scene-return',_type:'scene',title:'The return',order:3}];
const rows=[['cue-01','Station arrival',8,16,'prop-umbrella','scene-platform','Mira','Stage left',true],['cue-02','A light in the rain',10,14,'prop-lantern','scene-platform','Dev','Stage right',true],['cue-03','The last train',17,25,'prop-umbrella','scene-storm','Mira','Stage right',false],['cue-04','Search the platform',19,27,'prop-lantern','scene-storm','Dev','Stage left',false],['cue-05','Someone came back',26,32,'prop-lantern','scene-return','Jo','Stage right',false],['cue-06','The unopened letter',29,34,'prop-letter','scene-return','Jo','Stage left',false]];
const cues=rows.map(([id,title,start,end,p,s,crew,location,confirmed])=>({_id:id,_type:'cue',title,start,end,prop:ref(p),scene:ref(s),crew,location,confirmed}));
const production={_id:'production-last-platform',_type:'production',title:'The last platform',subtitle:'An original rehearsal exercise',status:'draft',cues:cues.map(c=>({...ref(c._id),_key:c._id})),description:'A fictional three-scene performance. All names and timings are sample data.'};
const docs=[...props,...scenes,...cues,production];
writeFileSync(new URL('../public/seed.json',import.meta.url),JSON.stringify({production,props,scenes,cues:cues.map(c=>({...c,propId:c.prop._ref,sceneId:c.scene._ref}))},null,2));
writeFileSync(new URL('./seed.ndjson',import.meta.url),docs.map(d=>JSON.stringify(d)).join('\n')+'\n');
writeFileSync('/tmp/prop-room-mutations.json',JSON.stringify({mutations:docs.map(d=>({createIfNotExists:d}))}));
console.log(`Prepared ${docs.length} original sample documents.`);
