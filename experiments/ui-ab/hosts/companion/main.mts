import { app,BrowserWindow,ipcMain,screen,session } from 'electron';
import { dirname,join,resolve,relative,isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import {providerFor} from './platform.mjs';
import { CompanionHub,hubServer } from './hub.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const host=process.env.NOEMA_COMPANION_HOST;
if(host!=='a'&&host!=='b')throw Error('Select an isolated host');
const runId=process.env.NOEMA_RUN_ID;
if(runId&&!/^[a-zA-Z0-9_-]{1,80}$/.test(runId))throw Error('Invalid profile');
const secret=process.env.NOEMA_COMPANION_SECRET;
if(!secret||secret.length<32)throw Error('Missing private companion session');
const profile=join(runId?join(root,'.demo/evidence',runId,host):join(root,'.demo',host),'companion');
app.setPath('userData',profile);
if(!app.requestSingleInstanceLock()){app.quit();process.exit(0);}
const port=host==='a'?8794:8795;
let pet:BrowserWindow,popover:BrowserWindow|null=null;
let stopping=false;
const nativeProvider=providerFor();
const provider={...nativeProvider,async read(){const context=await nativeProvider.read();if(context?.bounds&&!context.monitor){const b=context.bounds;context.monitor='Monitor '+screen.getDisplayNearestPoint({x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)}).id;}return context;}};
const hub=new CompanionHub(profile,provider,()=>{if(pet&&!pet.isDestroyed())update();});
const server=hubServer(hub,port,secret);
function display(){
 const bounds=hub.state.context?.bounds;
 return screen.getDisplayNearestPoint(bounds?{x:Math.round(bounds.x+bounds.width/2),y:Math.round(bounds.y+bounds.height/2)}:screen.getCursorScreenPoint());
}
function place(){const area=display().workArea;pet.setBounds({x:area.x+area.width-112,y:area.y+area.height-108,width:96,height:96});if(popover&&!popover.isDestroyed())popover.setPosition(area.x+area.width-320,area.y+area.height-476);}
function update(){
 if(hub.state.mode==='Hidden'){pet.hide();popover?.hide();}
 else {place();pet.showInactive();}
 pet.webContents.send('companion:changed',hub.state);popover?.webContents.send('companion:changed',hub.state);
}
function trusted(event:Electron.IpcMainInvokeEvent){
 const owner=[pet,popover].find(w=>w&&!w.isDestroyed()&&w.webContents===event.sender);
 if(!owner||event.senderFrame!==owner.webContents.mainFrame||!event.senderFrame.url.startsWith('file://'))throw Error('Companion bridge denied');
}
function secure(window:BrowserWindow){
 window.webContents.on('console-message',(_event,level,message)=>{if(level===3)console.error('Companion renderer:',message);});
 window.webContents.on('page-title-updated',event=>event.preventDefault());
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());window.webContents.on('will-attach-webview',event=>event.preventDefault());
}
async function openPopover(){
 if(popover&&!popover.isDestroyed()){popover.close();popover=null;return;}
 popover=new BrowserWindow({title:'Noema companion controls',width:300,height:360,frame:false,transparent:true,alwaysOnTop:true,skipTaskbar:true,resizable:false,show:false,backgroundColor:'#00000000',webPreferences:{preload:join(dirname(fileURLToPath(import.meta.url)),'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,devTools:false}});
 secure(popover);popover.on('closed',()=>popover=null);place();
 await popover.loadFile(join(root,'dist/companion.html'),{query:{view:'controls'}});popover.setTitle('Noema companion controls');popover.show();setTimeout(place,100);
}
app.whenReady().then(async()=>{
 session.defaultSession.setPermissionRequestHandler((_w,_p,callback)=>callback(false));session.defaultSession.setPermissionCheckHandler(()=>false);
 session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{let allow=false;try{const u=new URL(details.url);allow=(u.protocol==='file:'&&(()=>{const path=relative(join(root,'dist'),fileURLToPath(u));return !isAbsolute(path)&&!path.startsWith('..');})())||u.protocol==='data:';}catch{}callback({cancel:!allow});});
 await hub.load();
 pet=new BrowserWindow({title:'Noema desktop companion',width:96,height:96,frame:false,transparent:true,alwaysOnTop:true,skipTaskbar:true,resizable:false,focusable:false,show:false,backgroundColor:'#00000000',webPreferences:{preload:join(dirname(fileURLToPath(import.meta.url)),'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,devTools:false}});
 secure(pet);pet.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
 ipcMain.handle('companion:state',event=>{trusted(event);return hub.state;});
 ipcMain.handle('companion:settings',(event,value)=>{trusted(event);return hub.settings(value);});
 ipcMain.handle('companion:toggle',event=>{trusted(event);return openPopover();});
 ipcMain.handle('companion:close',event=>{trusted(event);popover?.close();});
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 await pet.loadFile(join(root,'dist/companion.html'));place();pet.showInactive();
 const timer=setInterval(()=>{void hub.step();},2500);
 screen.on('display-metrics-changed',place);screen.on('display-removed',place);
 app.on('before-quit',()=>{stopping=true;clearInterval(timer);hub.provider.dispose?.();server.close();});
 pet.on('closed',()=>{if(!stopping)app.quit();});
 console.log(JSON.stringify({companion:'ready',host,port,provider:hub.provider.id,separateWindow:true,observing:false}));
}).catch(error=>{console.error('Companion unavailable:',error.message);server.close();app.quit();});
