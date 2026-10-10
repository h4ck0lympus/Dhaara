import { app, BrowserWindow, ipcMain, session } from 'electron';
import { createServer } from 'node:http';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname, join, resolve, extname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DemoSchema } from '../../frontend/src/model.js';
import { proxyCompanion } from '../companion/proxy.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const runId=process.env.NOEMA_RUN_ID;
if(runId&&!/^[a-zA-Z0-9_-]{1,80}$/.test(runId))throw Error('Invalid isolated evidence namespace');
const profile=runId?join(root,'.demo/evidence',runId,'b'):join(root,'.demo/b');
app.setPath('userData',profile);
if(!app.requestSingleInstanceLock()){app.quit();process.exit(0);}
const origin='http://127.0.0.1:8792';
const params=new URLSearchParams({host:'B',fixture:process.env.NOEMA_FIXTURE||'populated',screen:process.env.NOEMA_SCREEN||'Now'});
if(process.env.NOEMA_PANEL==='open')params.set('panel','open');
const csp="default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
const mime:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.otf':'font/otf','.ttf':'font/ttf'};
let window:BrowserWindow;
const staticRoot=join(root,'dist');
const server=createServer(async(req,res)=>{try{if(req.headers.host!=='127.0.0.1:8792'){res.writeHead(403).end();return;}if(await proxyCompanion(req,res,origin))return;if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}const path=decodeURIComponent(new URL(req.url||'/',origin).pathname);const target=resolve(staticRoot,'.'+(path==='/'?'/index.html':path));if(isAbsolute(relative(staticRoot,target))||relative(staticRoot,target).startsWith('..')){res.writeHead(403).end();return;}const body=await readFile(target);res.writeHead(200,{'Content-Type':mime[extname(target)]||'application/octet-stream','Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}).end(req.method==='HEAD'?undefined:body);}catch{res.writeHead(404).end();}});
server.on('error',()=>{console.error('Demo port 8792 unavailable. No existing endpoint was reused.');app.quit();});
function trusted(event:Electron.IpcMainInvokeEvent){if(!window||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||new URL(event.senderFrame.url).origin!==origin)throw Error('Demo bridge denied');}
const allowedFixtures=['populated','empty','waiting','review','offline'];
if(!allowedFixtures.includes(params.get('fixture')!))throw Error('Unknown fixture');
function storageFor(event:Electron.IpcMainInvokeEvent){const name=new URL(event.senderFrame!.url).searchParams.get('fixture')||'populated';if(!allowedFixtures.includes(name))throw Error('Unknown demo fixture');return join(profile,`demo-${name}.json`);}
let writes=Promise.resolve();
app.whenReady().then(async()=>{
session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
session.defaultSession.setPermissionCheckHandler(()=>false);
session.defaultSession.webRequest.onBeforeRequest({urls:['<all_urls>']},(details,callback)=>{let allowed=false;try{const url=new URL(details.url);allowed=url.origin===origin||url.protocol==='data:'||details.url.startsWith('blob:'+origin+'/');}catch{}callback({cancel:!allowed});});
ipcMain.handle('demo:load',async event=>{trusted(event);const storage=storageFor(event);await writes;try{return DemoSchema.parse(JSON.parse(await readFile(storage,'utf8')));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw Error('Demo storage cannot be read');}});
ipcMain.handle('demo:save',async(event,value:unknown)=>{trusted(event);const storage=storageFor(event);if(JSON.stringify(value).length>12_000_000)throw Error('Demo payload too large');const data=DemoSchema.parse(value);const next=writes.catch(()=>{}).then(async()=>{await mkdir(profile,{recursive:true,mode:0o700});await writeFile(storage+'.tmp',JSON.stringify(data),{mode:0o600});await rename(storage+'.tmp',storage);});writes=next;await next;});
ipcMain.handle('demo:info',event=>{trusted(event);return {host:'B',engine:'Chromium',version:process.versions.chrome};});
await new Promise<void>(resolve=>server.listen(8792,'127.0.0.1',resolve));
window=new BrowserWindow({title:'Noema · B · isolated demo',width:Number(process.env.NOEMA_WIDTH)||1158,height:Number(process.env.NOEMA_HEIGHT)||816,useContentSize:true,autoHideMenuBar:true,backgroundColor:'#101419',webPreferences:{preload:join(dirname(fileURLToPath(import.meta.url)),'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,devTools:false}});
window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
window.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin||new URL(url).username||new URL(url).password)event.preventDefault();});
window.webContents.on('will-attach-webview',event=>event.preventDefault());
session.defaultSession.on('will-download',event=>event.preventDefault());
let reporting=false;
async function reportWindow(){if(reporting||window.isDestroyed()||!process.env.NOEMA_COMPANION_SECRET)return;reporting=true;try{await fetch('http://127.0.0.1:8795/window',{method:'POST',headers:{'X-Noema-Companion':process.env.NOEMA_COMPANION_SECRET,'Content-Type':'application/json'},body:JSON.stringify({focused:window.isFocused(),visible:window.isVisible()&&!window.isMinimized(),bounds:window.getContentBounds()}),signal:AbortSignal.timeout(1000)});}catch{}finally{reporting=false;}}
window.on('focus',()=>void reportWindow());
window.on('blur',()=>void reportWindow());
window.on('move',()=>void reportWindow());
window.on('resize',()=>void reportWindow());
window.on('minimize',()=>void reportWindow());
window.on('restore',()=>void reportWindow());
window.on('show',()=>void reportWindow());
window.on('hide',()=>void reportWindow());
const presenceTimer=setInterval(()=>void reportWindow(),2000);window.on('closed',()=>clearInterval(presenceTimer));
let approved=false;
window.on('close',event=>{if(approved)return;event.preventDefault();window.webContents.executeJavaScript('window.noemaNativeClose ? window.noemaNativeClose() : false').then(ok=>{if(ok){approved=true;window.close();}}).catch(()=>console.error('Demo checkpoint failed; window retained.'));});
window.webContents.on('did-finish-load',()=>console.log(JSON.stringify({host:'B',electron:process.versions.electron,chromium:process.versions.chrome,node:process.versions.node,viewport:window.getContentSize(),scale:window.webContents.getZoomFactor(),sandbox:true,fixture:params.get('fixture')})));
await window.loadURL(origin+'/?'+params);window.setTitle('Noema · B · isolated demo');
app.on('window-all-closed',()=>{server.close();app.quit();});

}).catch(error=>{console.error('Isolated Electron startup failed:',error.message);server.close();app.quit();});
