import { app,BrowserWindow,ipcMain,screen,session } from 'electron';
import { dirname,join,resolve,relative,isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import {corner,clampPet,motionFrame,type Rect} from './motion.mjs';
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
let stopping=false,reduced=false,manual=false,anchor='',target:Rect|null=null;
let motion:ReturnType<typeof setInterval>|undefined;
let drag:{cursor:{x:number;y:number};bounds:Rect;started:number;timer:ReturnType<typeof setInterval>;moved:boolean}|null=null;
let placementContext:Awaited<ReturnType<typeof nativeProvider.read>>=null;
let reading:ReturnType<typeof nativeProvider.read>|null=null;

const nativeProvider=providerFor();
const provider={...nativeProvider,async read(){const pending=reading||nativeProvider.read();reading=pending;let context;try{context=await pending;}finally{if(reading===pending)reading=null;}placementContext=context;if(context?.bounds&&!context.monitor){const b=context.bounds;context.monitor='Monitor '+screen.getDisplayNearestPoint({x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)}).id;}return context;}};
const hub=new CompanionHub(profile,provider,()=>{if(pet&&!pet.isDestroyed())update();});
const server=hubServer(hub,port,secret);
function display(){
 const bounds=placementContext?.bounds;
 return screen.getDisplayNearestPoint(bounds?{x:Math.round(bounds.x+bounds.width/2),y:Math.round(bounds.y+bounds.height/2)}:screen.getCursorScreenPoint());
}
function moveTo(next:Rect,animate=true){
 if(target&&JSON.stringify(target)===JSON.stringify(next))return;
 clearInterval(motion);target=next;
 const start=pet.getBounds(),began=Date.now();
 if(reduced||!animate){pet.setBounds(next);return;}
 motion=setInterval(()=>{if(pet.isDestroyed()){clearInterval(motion);return;}const progress=Math.min(1,(Date.now()-began)/720);pet.setBounds(motionFrame(start,next,progress));if(progress===1)clearInterval(motion);},1000/30);
}
function place(){
 if(!pet||pet.isDestroyed()||drag||popover&&!popover.isDestroyed())return;
 const presence=hub.hostWindow;
 const inside=presence?.focused&&presence.visible&&presence.bounds;
 const area=inside?presence.bounds!:display().workArea;
 const nextAnchor=inside?'app':`${display().id}:${placementContext?.workspace||''}`;
 if(anchor!==nextAnchor){manual=false;anchor=nextAnchor;}
 if(!manual)moveTo(corner(area,hub.state.size));
 else moveTo(clampPet({...pet.getBounds(),width:hub.state.size,height:hub.state.size},screen.getDisplayMatching(pet.getBounds()).workArea));
}
function positionPopover(){if(!popover||popover.isDestroyed())return;const bounds=pet.getBounds(),area=screen.getDisplayMatching(bounds).workArea;const p=clampPet({x:bounds.x+bounds.width-300,y:bounds.y-430,width:300,height:420},area);popover.setPosition(p.x,p.y);}
function update(){
 if(hub.state.mode==='Hidden'){pet.hide();popover?.hide();}
 else {place();pet.showInactive();}
 pet.webContents.send('companion:changed',hub.state);popover?.webContents.send('companion:changed',hub.state);
}
function endDrag(){if(!drag)return false;const moved=drag.moved;clearInterval(drag.timer);drag=null;manual=moved||manual;return moved;}
function beginDrag(){
 endDrag();clearInterval(motion);target=null;
 const cursor=screen.getCursorScreenPoint(),bounds=pet.getBounds();
 drag={cursor,bounds,started:Date.now(),moved:false,timer:setInterval(()=>{
  if(!drag)return;if(Date.now()-drag.started>30000){endDrag();return;}
  const now=screen.getCursorScreenPoint(),dx=now.x-drag.cursor.x,dy=now.y-drag.cursor.y;
  if(Math.hypot(dx,dy)>4)drag.moved=true;
  if(drag.moved)pet.setBounds(clampPet({...drag.bounds,x:drag.bounds.x+dx,y:drag.bounds.y+dy},screen.getDisplayNearestPoint(now).workArea));
 },16)};
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
 popover=new BrowserWindow({title:'Noema companion controls',width:300,height:420,frame:false,transparent:true,alwaysOnTop:true,skipTaskbar:true,resizable:false,show:false,backgroundColor:'#00000000',webPreferences:{preload:join(dirname(fileURLToPath(import.meta.url)),'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,devTools:false}});
 secure(popover);popover.on('closed',()=>{popover=null;place();});positionPopover();
 await popover.loadFile(join(root,'dist/companion.html'),{query:{view:'controls'}});popover.setTitle('Noema companion controls');popover.show();setTimeout(positionPopover,100);
}
app.whenReady().then(async()=>{
 session.defaultSession.setPermissionRequestHandler((_w,_p,callback)=>callback(false));session.defaultSession.setPermissionCheckHandler(()=>false);
 session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{let allow=false;try{const u=new URL(details.url);allow=(u.protocol==='file:'&&(()=>{const path=relative(join(root,'dist'),fileURLToPath(u));return !isAbsolute(path)&&!path.startsWith('..');})())||u.protocol==='data:';}catch{}callback({cancel:!allow});});
 await hub.load();
 pet=new BrowserWindow({title:'Noema desktop companion',width:hub.state.size,height:hub.state.size,frame:false,transparent:true,alwaysOnTop:true,skipTaskbar:true,resizable:false,focusable:false,show:false,backgroundColor:'#00000000',webPreferences:{preload:join(dirname(fileURLToPath(import.meta.url)),'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,devTools:false}});
 secure(pet);pet.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
 ipcMain.handle('companion:drag-start',event=>{trusted(event);beginDrag();});
 ipcMain.handle('companion:drag-end',event=>{trusted(event);return endDrag();});
 ipcMain.handle('companion:resize',async(event,value)=>{trusted(event);const state=await hub.resize(value);target=null;pet.setSize(state.size,state.size);place();positionPopover();return state;});
 ipcMain.handle('companion:follow',event=>{trusted(event);manual=false;target=null;popover?.close();place();});
 ipcMain.handle('companion:motion',(event,value)=>{trusted(event);if(typeof value!=='boolean')throw Error('Invalid motion preference');reduced=value;if(reduced&&target){clearInterval(motion);pet.setBounds(target);}});
 ipcMain.handle('companion:state',event=>{trusted(event);return hub.state;});
 ipcMain.handle('companion:settings',(event,value)=>{trusted(event);return hub.settings(value);});
 ipcMain.handle('companion:toggle',event=>{trusted(event);return openPopover();});
 ipcMain.handle('companion:close',event=>{trusted(event);popover?.close();});
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 await pet.loadFile(join(root,'dist/companion.html'));moveTo(corner(display().workArea,hub.state.size),false);place();pet.showInactive();
 const timer=setInterval(()=>{void hub.step();},2500);
 let placementBusy=false;
 const placementTimer=setInterval(async()=>{if(placementBusy||drag||popover)return;placementBusy=true;try{if(!hub.hostWindow?.focused||!hub.hostWindow.visible)await provider.read();place();}catch{place();}finally{placementBusy=false;}},750);
 screen.on('display-metrics-changed',place);screen.on('display-removed',place);
 app.on('before-quit',()=>{stopping=true;clearInterval(timer);clearInterval(placementTimer);clearInterval(motion);endDrag();hub.provider.dispose?.();server.close();});
 pet.on('closed',()=>{if(!stopping)app.quit();});
 console.log(JSON.stringify({companion:'ready',host,port,provider:hub.provider.id,separateWindow:true,observing:false}));
}).catch(error=>{console.error('Companion unavailable:',error.message);server.close();app.quit();});
