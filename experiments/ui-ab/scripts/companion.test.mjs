import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CompanionHub,hubServer} from '../dist-host/hosts/companion/hub.mjs';
import {providerFor,matchTask} from '../dist-host/hosts/companion/platform.mjs';
import {fixture} from '../dist-host/frontend/src/model.js';
const context={app:'Browser',title:'LeetCode · Two Pointers',workspace:'2',monitor:'test',bounds:{x:0,y:0,width:800,height:600}};
test('Portable adapters select Windows, macOS, X11 and optional Sway; other Wayland is explicit',()=>{
 assert.equal(providerFor('win32',{}).id,'windows-foreground');assert.equal(providerFor('darwin',{}).id,'macos-frontmost');
 assert.equal(providerFor('linux',{DISPLAY:':99',XDG_SESSION_TYPE:'x11',SWAYSOCK:'other-session'}).id,'linux-x11');
 assert.equal(providerFor('linux',{WAYLAND_DISPLAY:'test',SWAYSOCK:'test'}).id,'linux-sway');
 assert.equal(providerFor('linux',{WAYLAND_DISPLAY:'test'}).id,'linux-wayland-unavailable');
});
test('Only explicit, unique, unfinished task matches are eligible',()=>{
 const tasks=fixture().tasks;assert.equal(matchTask(context,tasks),'practice');
 assert.equal(matchTask(context,[...tasks,{id:'ambiguous',status:'ready',activityMatch:'leetcode'}]),null);
 assert.equal(matchTask(context,tasks.map(t=>({...t,status:'complete'}))),null);
 assert.equal(matchTask(context,tasks.map(t=>({...t,activityMatch:undefined}))),null);
});
test('Paused observer reads nothing; stable samples update only activity, preserve pin and status; pauses break time continuity',async()=>{
 const profile=await mkdtemp(join(tmpdir(),'noema-companion-test-'));let reads=0;let current=context;
 const hub=new CompanionHub(profile,{id:'test',async read(){reads++;return {...current};}});const demo=fixture();hub.snapshot(demo);
 try{
  await hub.step();assert.equal(reads,0);hub.settings({observing:true});await hub.step();assert.deepEqual(hub.state.activity,{});
  await hub.step();assert.equal(hub.state.taskId,'practice');assert.equal(hub.demo.pin,'allocator');assert.equal(hub.demo.tasks.find(t=>t.id==='practice').status,'ready');
  hub.lastSample=Date.now()-60_000;await hub.step();assert.equal(hub.state.activity.practice.seconds,5,'Suspension cannot fabricate a minute of work');
  hub.settings({observing:false});assert.equal(hub.state.context,null);await hub.step();assert.equal(reads,3);
  const saved=JSON.parse(await readFile(join(profile,'activity.json'),'utf8'));assert.equal(saved.activity.practice.app,'Browser');
  const reopened=new CompanionHub(profile);await reopened.load();assert.deepEqual(reopened.state.activity,hub.state.activity);assert.equal(reopened.state.observing,false);
  current={...context,title:'Noema · B · isolated demo'};hub.settings({observing:true});await hub.step();assert.equal(hub.lastSample,0);
  current=context;await hub.step();await hub.step();assert.equal(hub.state.activity.practice.seconds,5);
  hub.settings({mode:'Dot'});hub.snapshot(demo);assert.equal(hub.state.mode,'Dot','An unrelated snapshot must preserve companion controls');
  hub.snapshot({...demo,cat:'Hidden'});assert.equal(hub.state.mode,'Hidden');
  await writeFile(join(profile,'activity.json'),'{"activity":{"bad":{"seconds":-1}}}');const corrupt=new CompanionHub(profile);await corrupt.load();assert.deepEqual(corrupt.state.activity,{});
 }finally{await rm(profile,{recursive:true,force:true});}
});
test('Private companion API rejects missing credentials and arbitrary settings',async()=>{
 const hub=new CompanionHub('/unused',{id:'test',async read(){throw Error('Should not observe');}});
 const server=hubServer(hub,0,'a-private-session');await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
 // Port validation is part of the server contract; use its actual ephemeral port.
 server.close();await new Promise(r=>server.once('close',r));const bound=hubServer(hub,port,'a-private-session');await new Promise(r=>bound.listen(port,'127.0.0.1',r));
 try{
  const url=`http://127.0.0.1:${port}`;assert.equal((await fetch(url+'/state')).status,403);
  const headers={'X-Noema-Companion':'a-private-session','Content-Type':'application/json'};
  assert.equal((await fetch(url+'/settings',{method:'POST',headers,body:JSON.stringify({shell:'id'})})).status,400);
  const response=await fetch(url+'/settings',{method:'POST',headers,body:JSON.stringify({mode:'Dot'})});assert.equal(response.status,200);assert.equal((await response.json()).mode,'Dot');
 }finally{await new Promise(r=>bound.close(r));}
});
test('Dock geometry handles negative monitor origins and travels continuously along a curved path',async()=>{
 const {corner,clampPet,motionFrame}=await import('../dist-host/hosts/companion/motion.mjs');
 const area={x:-1920,y:0,width:1920,height:1080};const end=corner(area,96);
 assert.deepEqual(end,{x:-112,y:968,width:96,height:96});
 assert.deepEqual(clampPet({x:-3000,y:1200,width:96,height:96},area),{x:-1920,y:984,width:96,height:96});
 const start={x:100,y:100,width:96,height:96};assert.deepEqual(motionFrame(start,end,0),start);assert.deepEqual(motionFrame(start,end,1),end);
 const middle=motionFrame(start,end,.5);assert.ok(middle.x<start.x&&middle.x>end.x);assert.ok(middle.y>start.y&&middle.y<end.y);
});
test('Size persists independently of task data; host presence accepts only bounded window geometry',async()=>{
 const profile=await mkdtemp(join(tmpdir(),'noema-appearance-'));const hub=new CompanionHub(profile,{id:'test',async read(){return null;}});
 try{
  await Promise.all([hub.resize(120),hub.resize(160)]);const restored=new CompanionHub(profile);await restored.load();assert.equal(restored.state.size,160);
  assert.deepEqual(hub.state.activity,{});await assert.rejects(hub.resize(1000));await assert.rejects(hub.resize('96'));
  hub.window({focused:true,visible:true,bounds:{x:-100,y:0,width:800,height:600}});assert.equal(hub.hostWindow.focused,true);
  assert.throws(()=>hub.window({focused:true,visible:true,bounds:{x:0,y:0,width:-1,height:10}}));
  assert.throws(()=>hub.window({focused:true,visible:true,bounds:null,command:'id'}));
 }finally{await rm(profile,{recursive:true,force:true});}
});
