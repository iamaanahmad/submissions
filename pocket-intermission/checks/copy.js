async () => {
 const q=id=>document.getElementById(id), sleep=()=>new Promise(r=>setTimeout(r,120));
 const clip=Object.getOwnPropertyDescriptor(navigator,'clipboard'), exec=document.execCommand;
 const results={};
 const p=window.PocketIntermission;
 const id=p.begin({mode:'demo'});p.complete(id,'TEST clipboard draft.');
 const count=()=>document.querySelectorAll('textarea').length;
 const baseline=count();
 try {
  for(const mode of ['async','fallback','false','throw']) {
   let value='', fallbackCalls=0;
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async t=>{if(mode!=='async')throw Error('TEST denied');value=t}}});
   document.execCommand=()=>{fallbackCalls++;if(mode==='throw')throw Error('TEST fallback denied');if(mode==='fallback'){value=document.activeElement.value;return true}return false};
   q('banner').hidden=true;q('announcer').textContent='Old success copied.';
   q('copy-draft').click();await sleep();
   results[mode]=mode==='async'||mode==='fallback'
    ? value==='TEST clipboard draft.'&&q('announcer').textContent==='Draft copied.'&&(mode!=='async'||fallbackCalls===0)
    : !q('banner').hidden&&q('banner').textContent.includes('Could not copy')&&!q('announcer').textContent.includes('copied.');
   results[mode+'Cleanup']=count()===baseline;
  }
  return results;
 } finally {document.execCommand=exec;if(clip)Object.defineProperty(navigator,'clipboard',clip);else delete navigator.clipboard;}
}
