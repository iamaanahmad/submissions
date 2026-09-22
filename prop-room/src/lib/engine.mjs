export function analyze(cues, props) {
  const byId = new Map(props.map(p => [p._id, p]));
  const issues = [];
  for (const cue of cues) {
    if (!byId.has(cue.propId)) issues.push({id:`missing-${cue._id}`, cueId:cue._id, type:'missing', message:'Choose an available prop.'});
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.end <= cue.start) issues.push({id:`time-${cue._id}`,cueId:cue._id,type:'time',message:'End time must follow start time.'});
  }
  for (const prop of props) {
    const bookings = cues.filter(c=>c.propId===prop._id && c.end>c.start).sort((a,b)=>a.start-b.start || a._id.localeCompare(b._id));
    for (let i=0;i<bookings.length;i++) for (let j=i+1;j<bookings.length;j++) {
      const a=bookings[i], b=bookings[j], gap=b.start-a.end;
      if(gap < prop.resetMinutes) issues.push({id:`${a._id}-${b._id}`,cueId:b._id,previousId:a._id,propId:prop._id,type:gap<0?'overlap':'reset',shortfall:prop.resetMinutes-gap,message:gap<0?`${prop.title} is still on stage for ${-gap} more min.`:`${prop.title} needs ${prop.resetMinutes} min to reset; only ${gap} min available.`});
    }
  }
  return issues;
}
export function alternatives(cue,cues,props) {
 const original=props.find(p=>p._id===cue.propId);
 if(!original)return [];
 return props.filter(p=>p._id!==cue.propId && p.kind===original.kind).filter(p=>!analyze(cues.map(c=>c._id===cue._id?{...c,propId:p._id}:c),props).some(i=>i.cueId===cue._id||i.previousId===cue._id));
}
export function readiness(cues,props){const issues=analyze(cues,props);return {issues,confirmed:cues.filter(c=>c.confirmed).length,ready:cues.length>0&&issues.length===0&&cues.every(c=>c.confirmed)};}
export function validateSaved(value,baseline){
 if(!value||value.version!==1||!Array.isArray(value.cues)||value.cues.length<1||value.cues.length>100)return null;
 const ids=new Set();
 for(const c of value.cues){if(!c||typeof c._id!=='string'||ids.has(c._id)||typeof c.title!=='string'||c.title.length>100||!baseline.props.some(p=>p._id===c.propId)||!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<0||c.end<=c.start||c.end>240||!baseline.scenes.some(s=>s._id===c.sceneId)||typeof c.crew!=='string'||c.crew.length>60||typeof c.location!=='string'||typeof c.confirmed!=='boolean')return null;ids.add(c._id);}
 return value.cues;
}
