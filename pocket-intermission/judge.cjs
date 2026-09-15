// Node 22+; no npm packages. Runs only against our public app in an isolated browser.
const fs=require('node:fs');
const {launch}=require('./isolated-browser.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await launch();
 const c=browser.connection;
 try {
  await c.call('Network.enable');
  await c.call('Network.setBlockedURLs',{urls:['*://*/api/story*']});
  await c.call('Page.navigate',{url:'https://pocket-intermission.vibe.commonsmade.com/'});
  for(let i=0;i<80;i++){
    if(await c.evaluate("typeof PocketIntermission==='object'"))break;
    await sleep(250);
    if(i===79)throw Error('Public app did not initialize');
  }
  await c.call("Page.enable");
  const ev=c.evaluate;
  const reload=async()=>{await c.call('Page.reload',{ignoreCache:true});for(let i=0;i<40;i++){await sleep(250);if(await c.evaluate("document.readyState==='complete'&&typeof PocketIntermission==='object'"))return;}throw Error('App did not initialize');};
  const injectReload=async(source)=>{const {identifier}=await c.call('Page.addScriptToEvaluateOnNewDocument',{source});await reload();await c.call('Page.removeScriptToEvaluateOnNewDocument',{identifier});};
  const work='pocket-intermission:work:v1';
  const result={};
    await c.call('Page.addScriptToEvaluateOnNewDocument',{source:"window.__storyCalls=0;const rawFetch=window.fetch;window.fetch=(...a)=>{if(String(a[0]).includes('api/story'))window.__storyCalls++;return rawFetch(...a)}"});
    await injectReload('sessionStorage.clear()');
    await ev(`(()=>{const p=document.getElementById('story-prompt');p.value='TEST prompt before game';p.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    result.promptInputSaved=await ev(`JSON.parse(sessionStorage.getItem('${work}')).prompt==='TEST prompt before game'`);
    await reload();
    result.promptOnlyRecovery=await ev(`document.getElementById('story-prompt').value==='TEST prompt before game'&&document.getElementById('game').hidden&&window.__storyCalls===0`);
    const before=await ev(`(()=>{const q=id=>document.getElementById(id);q('story-prompt').value='TEST lighthouse prompt';q('story-prompt').dispatchEvent(new Event('input',{bubbles:true}));q('try-demo').click();[...document.querySelectorAll('#words button')].slice(0,3).forEach(b=>b.click());q('seed').value='TEST map inside a lamp';q('seed').dispatchEvent(new Event('input',{bubbles:true}));return {words:[...document.querySelectorAll('#words button')].map(b=>b.textContent),chosen:[...document.querySelectorAll('#words [aria-pressed=true]')].map(b=>b.textContent)}})()`);
    await reload();
    const after=await ev(`(()=>{const q=id=>document.getElementById(id);return {prompt:q('story-prompt').value,seed:q('seed').value,words:[...document.querySelectorAll('#words button')].map(b=>b.textContent),chosen:[...document.querySelectorAll('#words [aria-pressed=true]')].map(b=>b.textContent),game:!q('game').hidden,pending:!q('pending-panel').hidden,calls:window.__storyCalls,saveEnabled:!q('save-seed-btn').disabled}})()`);
    result.observedRecovery=after;result.reloadPrompt=after.prompt==='TEST lighthouse prompt';result.reloadSeed=after.seed==='TEST map inside a lamp';
    result.reloadWords=JSON.stringify(before.words)===JSON.stringify(after.words);result.reloadChosen=JSON.stringify(before.chosen)===JSON.stringify(after.chosen);
    result.idleRecovery=after.game&&!after.pending&&after.calls===0&&after.saveEnabled;
    await ev("document.getElementById('new-round').click()");await reload();
    result.explicitReset=await ev("document.querySelectorAll('#words [aria-pressed=true]').length===0");
    const good=JSON.parse(await ev(`sessionStorage.getItem('${work}')`));
    const invalid=['{bad',JSON.stringify({...good,version:99}),JSON.stringify({...good,chosenWords:['invalid']}),JSON.stringify({...good,activeWords:['ember','ember']}),JSON.stringify({...good,prompt:'x'.repeat(100001)})];
    for(let i=0;i<invalid.length;i++){
      await injectReload(`sessionStorage.clear();sessionStorage.setItem('${work}',${JSON.stringify(invalid[i])})`);
      result['invalid'+i]=await ev(`document.getElementById('story-prompt').value===''&&!document.querySelector('#words [aria-pressed=true]')&&window.__storyCalls===0`);
    }
    await injectReload('sessionStorage.clear()');
    result.blockedWrites=await ev(`(()=>{const old=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('TEST quota','QuotaExceededError')};try{const q=id=>document.getElementById(id);q('story-prompt').value='TEST blocked';q('story-prompt').dispatchEvent(new Event('input',{bubbles:true}));q('try-demo').click();[...document.querySelectorAll('#words button')].slice(0,3).forEach(b=>b.click());q('seed').value='TEST still usable';q('seed').dispatchEvent(new Event('input',{bubbles:true}));return !q('save-seed-btn').disabled&&q('seed').value==='TEST still usable'&&!q('banner').hidden}finally{Storage.prototype.setItem=old}})()`);
    for(const [label,path] of [['story',require('path').join(__dirname,'checks/story.js')],['seed',require('path').join(__dirname,'checks/seed.js')]]){
      await injectReload('sessionStorage.clear()');
      result[label]=await ev('('+fs.readFileSync(path,'utf8')+')()');
    }

    result.savedRefresh=await require('./checks/saved-refresh.cjs')({c,reload,injectReload});
    const checks = Object.entries(result).filter(([,v])=>typeof v==='boolean');
    for(const group of ['story','seed']) {
      for(const [name,value] of Object.entries(result[group].results))checks.push([group+'.'+name,value]);
    }
    for(const [name,value] of Object.entries(result.savedRefresh))checks.push(['savedRefresh.'+name,value]);
    const failures=checks.filter(([,v])=>v!==true);
    for(const [name,value] of checks)console.log(`${value?'PASS':'FAIL'} ${name}`);
    console.log(`${checks.length-failures.length}/${checks.length} checks passed. AI endpoint blocked; responses mocked or offline.`);
    if(checks.length!==50 || failures.length)process.exitCode=1;
 } finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
