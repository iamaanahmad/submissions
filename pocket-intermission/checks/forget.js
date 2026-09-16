async () => {
 const q=id=>document.getElementById(id), wait=()=>new Promise(r=>setTimeout(r,80));
 const original=Storage.prototype.setItem, results={};
 const seeds='pocket-intermission:seeds', work='pocket-intermission:work:v1';
 const id=PocketIntermission.begin({mode:'demo'});PocketIntermission.cancel(id);
 q('new-round').click();
 [...document.querySelectorAll('#words button')].slice(0,3).forEach(b=>b.click());
 q('seed').value='TEST deletion recovery';q('seed').dispatchEvent(new Event('input'));
 q('seed-form').requestSubmit();await wait();
 const saved=localStorage.getItem(seeds), context=sessionStorage.getItem(work);
 try {
  Storage.prototype.setItem=function(k,v){if(this===localStorage)throw new DOMException('TEST blocked','SecurityError');return original.call(this,k,v)};
  q('clear-seeds').click();await wait();
  results.failedDeleteKeepsSeeds=localStorage.getItem(seeds)===saved&&q('seed-list').textContent.includes('TEST deletion recovery');
  results.failedDeleteKeepsContext=sessionStorage.getItem(work)===context&&JSON.parse(context).lastPromptSeed.includes('TEST deletion recovery');
  results.failedDeleteExplained=!q('banner').hidden&&q('banner').textContent.includes('Could not forget seeds');
  results.noFalseSuccess=!q('announcer').textContent.includes('forgotten');
 } finally {Storage.prototype.setItem=original;}
 q('clear-seeds').click();await wait();
 results.retryDeletes=JSON.parse(localStorage.getItem(seeds)).length===0&&!q('seed-list').textContent.includes('TEST deletion recovery')&&q('announcer').textContent==='Seeds forgotten.';
 results.retryClearsContextAndError=JSON.parse(sessionStorage.getItem(work)).lastPromptSeed===''&&q('banner').hidden;
 q('banner').textContent='TEST unrelated warning';q('banner').hidden=false;
 q('clear-seeds').click();await wait();
 results.unrelatedWarningPreserved=!q('banner').hidden&&q('banner').textContent==='TEST unrelated warning';
 return results;
}
