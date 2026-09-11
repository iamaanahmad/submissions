import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const files={'/':['index.html','text/html'],'/style.css':['style.css','text/css'],'/app.mjs':['app.mjs','text/javascript'],'/engine.mjs':['engine.mjs','text/javascript']};
createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
 if(!files[path]){res.writeHead(404);return res.end('Not found');}
 try {const [file,type]=files[path];const data=await readFile(new URL(file,import.meta.url));
 res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:data);
 }catch{res.writeHead(500);res.end('Unable to load application');}
}).listen(4173,'0.0.0.0',()=>console.log('Household Relay at http://localhost:4173'));
