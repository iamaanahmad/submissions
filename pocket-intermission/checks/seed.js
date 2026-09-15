async () => {
 const q=s=>document.querySelector(s), all=s=>[...document.querySelectorAll(s)];
 const originalStorage=localStorage.getItem('pocket-intermission:seeds');
 const originalFetch=window.fetch, originalCopy=navigator.clipboard.writeText;
 const sent=[], copied=[], results={};
 window.fetch=async (u,o)=>{sent.push(JSON.parse(o.body).prompt);return new Response(JSON.stringify({text:'Mocked test story.'}),{status:200,headers:{'Content-Type':'application/json'}})};
 navigator.clipboard.writeText=async t=>{copied.push(t)};
 const type=(id,text)=>{q(id).value=text;q(id).dispatchEvent(new Event('input',{bubbles:true}))};
 const pick=()=>all('#words button').slice(0,3).forEach(b=>b.click());
 const generate=async()=>{q('#generate-live').click();await new Promise(r=>setTimeout(r,10));return sent.at(-1)};
 try {
 q('#try-demo').click();q('#new-round').click();pick();type('#seed','TEST FIRST SEED');q('#seed-form').requestSubmit();
 type('#story-prompt','Write a short story');
 results.savedFallback=(await generate()).includes('TEST FIRST SEED');
 q('#new-round').click();pick();type('#seed','TEST SECOND SEED');
 const second=await generate();results.currentSeedWins=second.includes('TEST SECOND SEED')&&!second.includes('TEST FIRST SEED');
 q('#copy-prompt').click();await new Promise(r=>setTimeout(r,10));results.copyCurrent=copied.at(-1).includes('TEST SECOND SEED')&&!copied.at(-1).includes('TEST FIRST SEED');
 type('#seed','');q('#new-round').click();const fresh=await generate();results.newRoundNoStale=!fresh.includes('TEST FIRST SEED')&&!fresh.includes('TEST SECOND SEED');
 const n=sent.length;all('#seed-list button').find(b=>b.textContent==='Reuse').click();
 results.reuseNoAutoSend=sent.length===n;results.reuseFillsPrompt=q('#story-prompt').value.includes('TEST FIRST SEED');
 results.reuseGeneration=(await generate()).includes('TEST FIRST SEED');
 type('#story-prompt','A new independent story');type('#seed','');q('#new-round').click();q('#clear-seeds').click();
 const cleared=await generate();results.clearNoStale=!cleared.includes('TEST FIRST SEED');
 const p=window.PocketIntermission;let id=p.begin({mode:'demo'});q('#new-round').click();pick();type('#seed','TEST RETRY SEED');
 const words=()=>all('#words [aria-pressed=true]').map(b=>b.textContent).join(',');const selected=words();
 p.cancel(id);results.cancelPreserves=words()===selected&&q('#seed').value==='TEST RETRY SEED'&&!q('#game').hidden;
 const old=id;id=p.begin({mode:'demo'});results.retryPreserves=words()===selected&&q('#seed').value==='TEST RETRY SEED';
 results.staleIgnored=p.complete(old,'STALE')===false;p.fail(id,'Injected failure');results.failurePreserves=words()===selected&&!q('#game').hidden;
 id=p.begin({mode:'demo'});p.complete(id,'Test completed.');results.completionPreserves=words()===selected&&!q('#game').hidden;
 return {results,passed:Object.values(results).filter(Boolean).length,total:Object.keys(results).length,sent};
 } finally {window.fetch=originalFetch;navigator.clipboard.writeText=originalCopy;if(originalStorage===null)localStorage.removeItem('pocket-intermission:seeds');else localStorage.setItem('pocket-intermission:seeds',originalStorage);}
}
