const {spawn}=require('node:child_process');
const {mkdtemp,readFile,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function connect(url){
 const ws=new WebSocket(url);
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=()=>reject(Error('Browser connection failed'));});
 let next=0;const pending=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);const entry=pending.get(m.id);if(entry){pending.delete(m.id);clearTimeout(entry.timer);m.error?entry.reject(Error(m.error.message)):entry.resolve(m.result);}};
 const call=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++next;const timer=setTimeout(()=>{pending.delete(id);reject(Error(`Browser timeout: ${method}`));},20000);
  pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));
 });
 const close=()=>{for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(Error('Browser closed'));}pending.clear();ws.close();};
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 return {call,evaluate,close};
}
async function launch(){
 const profile=await mkdtemp(path.join(tmpdir(),'pocket-judge-'));
 const binary=process.env.CHROME_BIN||'google-chrome';
 const args=['--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','about:blank'];
 // Only needed in some disposable containers; do not use for ordinary browsing.
 if(process.env.POCKET_NO_SANDBOX==='1')args.unshift('--no-sandbox');
 const child=spawn(binary,args,{stdio:'ignore'});
 let launchError,connection,closed=false;
 child.on('error',e=>{launchError=e;});
 const close=async()=>{
  if(closed)return;closed=true;connection?.close();
  child.kill('SIGTERM');
  for(let i=0;i<30&&child.exitCode===null&&child.signalCode===null;i++)await sleep(100);
  if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
  await sleep(200);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
 };
 try{
  let port;
  for(let i=0;i<100;i++){
   if(launchError)throw Error(`Cannot start Chrome. Set CHROME_BIN to its executable. ${launchError.code}`);
   if(child.exitCode!==null)throw Error('Chrome exited before startup. Check installation and sandbox support.');
   try{port=Number((await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}catch{}
   await sleep(100);
  }
  if(!port)throw Error('Chrome startup timed out');
  const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(5000)})).json();
  const page=pages.find(p=>p.type==='page');if(!page)throw Error('No isolated test page');
  connection=await connect(page.webSocketDebuggerUrl);
  return {connection,close};
 }catch(e){await close();throw e;}
}
module.exports={launch};
