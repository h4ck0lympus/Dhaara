import type {IncomingMessage,ServerResponse} from 'node:http';
export async function proxyCompanion(req:IncomingMessage,res:ServerResponse,origin:string):Promise<boolean>{
 const path=new URL(req.url||'/',origin).pathname;
 if(!path.startsWith('/api/companion/'))return false;
 const route=path.slice('/api/companion'.length);
 const secret=process.env.NOEMA_COMPANION_SECRET;
 if(!secret){res.writeHead(503,{'Content-Type':'application/json'}).end('{"error":"Desktop companion is not connected"}');return true;}
 if(req.headers['x-noema-ui']!=='1'||(req.headers.origin&&req.headers.origin!==origin)||!['/state','/snapshot','/settings'].includes(route)){
  res.writeHead(403).end('{}');return true;
 }
 if(req.method!=='GET'&&req.method!=='POST'){res.writeHead(405).end('{}');return true;}
 try{
  let body='';if(req.method==='POST')for await(const chunk of req){body+=chunk;if(body.length>12_000_000)throw Error('Large payload');}
  const response=await fetch('http://127.0.0.1:8795'+route,{method:req.method,headers:{'X-Noema-Companion':secret,'Content-Type':'application/json'},body:body||undefined,signal:AbortSignal.timeout(3000)});
  res.writeHead(response.status,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(await response.text());
 }catch{res.writeHead(503,{'Content-Type':'application/json'}).end('{"error":"Desktop companion is unavailable"}');}
 return true;
}
