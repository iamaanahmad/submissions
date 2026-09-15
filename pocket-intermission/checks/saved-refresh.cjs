// Same-tab saved-seed context; uses only mocked AI and a disposable browser.
module.exports=async({c,reload,injectReload})=>{
 const ev=c.evaluate, result={};
 const key='pocket-intermission:work:v1';
 const mock="window.sent=[];window.copied='';window.fetch=async(u,o)=>{window.sent.push(JSON.parse(o.body).prompt);return new Response(JSON.stringify({text:'TEST mocked story'}),{status:200})};navigator.clipboard.writeText=async t=>{window.copied=t};";
 const {identifier}=await c.call('Page.addScriptToEvaluateOnNewDocument',{source:mock});
 const seed='TEST saved lighthouse seed';
 const save=async()=>{await injectReload('sessionStorage.clear();localStorage.clear()');await ev(`(()=>{const q=id=>document.getElementById(id);q('story-prompt').value='TEST story';q('story-prompt').dispatchEvent(new Event('input'));q('try-demo').click();[...document.querySelectorAll('#words button')].slice(0,3).forEach(b=>b.click());q('seed').value='${seed}';q('seed').dispatchEvent(new Event('input'));q('seed-form').requestSubmit()})()`);};
 const generate=async()=>{await ev("document.getElementById('generate-live').click()");return ev('window.sent.at(-1)')};
 try {
 await save();await reload();
 result.reloadNoRequest=await ev('window.sent.length===0');
 await ev("document.getElementById('copy-prompt').click()");
 result.copySavedAfterReload=(await ev('window.copied')).includes(seed);
 result.generateSavedAfterReload=(await generate()).includes(seed);
 await ev("document.getElementById('seed').value='TEST edited idea';document.getElementById('seed').dispatchEvent(new Event('input'))");await reload();
 const edited=await generate();result.editOverridesSaved=edited.includes('TEST edited idea')&&!edited.includes(seed);
 await save();await ev("document.getElementById('new-round').click()");await reload();result.newRoundClearsSaved=!(await generate()).includes(seed);
 await save();await ev("document.getElementById('clear-seeds').click()");await reload();result.clearRemovesSaved=!(await generate()).includes(seed);
 await save();const good=JSON.parse(await ev(`sessionStorage.getItem('${key}')`));delete good.lastPromptSeed;
 await injectReload(`sessionStorage.clear();sessionStorage.setItem('${key}',${JSON.stringify(JSON.stringify(good))})`);
 result.legacyWorkLoads=await ev("document.getElementById('story-prompt').value==='TEST story'&&document.querySelectorAll('#words [aria-pressed=true]').length===3");
 for(const [name,value] of [['wrongType',{text:seed}],['oversized','x'.repeat(401)]]){
 await injectReload(`sessionStorage.clear();sessionStorage.setItem('${key}',${JSON.stringify(JSON.stringify({...good,lastPromptSeed:value}))})`);
 result[name+'Ignored']=await ev("document.getElementById('story-prompt').value==='TEST story'")&&!(await generate()).includes(typeof value==='string'?value:seed);
 }
 return result;
 }finally{await c.call('Page.removeScriptToEvaluateOnNewDocument',{identifier});await injectReload('sessionStorage.clear();localStorage.clear()');}
};
