async () => {
 const p=window.PocketIntermission,q=id=>document.getElementById(id),r={};
 const originalFetch=window.fetch, originalTimeout=window.setTimeout;
 let timeout; const settle=()=>new Promise(resolve=>originalTimeout(resolve,30));
 const visible=()=>!q('draft').hidden, text=()=>q('draft-body').textContent;
 const lead=()=>q('draft').querySelector('.draft-lead').textContent;
 const first='TEST: The robot returned the lost star. Everyone made it home.';
 try {
 q('try-demo').click(); q('cancel').click();r.noPriorStaysHidden=!visible();
 let id=p.begin({mode:'live'});p.complete(id,first);const liveLead=lead();
 q('try-demo').click();r.pendingHidesOld=!visible();q('cancel').click();
 r.cancelRestores=visible()&&text()===first;r.cancelProvenance=lead()===liveLead;
 id=p.begin({mode:'live'});p.fail(id,'TEST failure');r.failureRestores=visible()&&text()===first;
 window.setTimeout=(fn,ms,...args)=>{if(ms===60000){timeout=fn;return 0;}return originalTimeout(fn,ms,...args)};
 id=p.begin({mode:'live'});timeout();window.setTimeout=originalTimeout;r.timeoutRestores=visible()&&text()===first;
 const old=p.begin({mode:'live'});id=p.begin({mode:'live'});p.cancel(id);
 r.staleIgnored=p.complete(old,'STALE')===false&&visible()&&text()===first;
 q('again').click();r.againKeepsStory=visible()&&text()===first;
 q('story-prompt').value='TEST next story';
 for(const [name,data] of [['empty',{text:''}],['missing',{}],['whitespace',{text:'   '}],['object',{text:{bad:true}}]]) {
  window.fetch=async()=>new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
  q('generate-live').click();await settle();
  r[name+'ResponseRecovers']=visible()&&text()===first&&!q('banner').hidden&&q('pending-panel').hidden;
 }
 window.fetch=async()=>new Response(JSON.stringify({text:'TEST replacement completed.'}),{status:200,headers:{'content-type':'application/json'}});
 q('generate-live').click();await settle();r.replacement=visible()&&text()==='TEST replacement completed.';
 q('try-demo').click();q('finish-demo').click();const demoText=text(), demoLead=lead();
 id=p.begin({mode:'live'});p.cancel(id);r.demoProvenance=visible()&&text()===demoText&&lead()===demoLead&&/fixed/i.test(demoLead);
 return {results:r,passed:Object.values(r).filter(Boolean).length,total:Object.keys(r).length};
 } finally {window.fetch=originalFetch;window.setTimeout=originalTimeout;}
}
