import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile,writeFile,rename,mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { DemoSchema,CompanionStateSchema,type Demo } from '../../frontend/src/model.js';
import { matchTask,providerFor,type ActivityContext,type ActivityProvider } from './platform.mjs';
const Settings=z.object({observing:z.boolean().optional(),mode:z.enum(['Cat','Dot','Hidden']).optional()}).strict();
export type CompanionState={connected:boolean;observing:boolean;mode:'Cat'|'Dot'|'Hidden';provider:string;status:string;context:ActivityContext|null;taskId:string|null;activity:Record<string,{app:string;title:string;monitor:string;workspace:string;observedAt:string;seconds:number}>};
export class CompanionHub {
 demo:Demo|null=null;state:CompanionState;candidate='';previous='';lastSample=0;busy=false;
 constructor(public profile:string,public provider:ActivityProvider=providerFor(),public onChange:()=>void=()=>{}){
  this.state={connected:true,observing:false,mode:'Cat',provider:provider.id,status:'Observation paused',context:null,taskId:null,activity:{}};
 }
 async load(){try{const saved=JSON.parse(await readFile(join(this.profile,'activity.json'),'utf8'));this.state.activity=CompanionStateSchema.shape.activity.parse(saved.activity);}catch{} }
 async persist(){await mkdir(this.profile,{recursive:true,mode:0o700});await writeFile(join(this.profile,'activity.json.tmp'),JSON.stringify({activity:this.state.activity}),{mode:0o600});await rename(join(this.profile,'activity.json.tmp'),join(this.profile,'activity.json'));}
 snapshot(value:unknown){const next=DemoSchema.parse(value);if(!this.demo||this.demo.cat!==next.cat)this.state.mode=next.cat;this.demo=next;this.onChange();return this.state;}
 settings(value:unknown){const changes=Settings.parse(value);Object.assign(this.state,changes);if(!this.state.observing){this.state.context=null;this.state.taskId=null;this.state.status='Observation paused';this.candidate='';this.previous='';this.lastSample=0;}this.onChange();return this.state;}
 async step(){
  if(!this.state.observing||this.busy)return;
  this.busy=true;
  try{
   const context=await this.provider.read();
   if(!this.state.observing)return;
   if(!context){this.state.status='No focused window reported';this.state.context=null;this.state.taskId=null;this.candidate='';this.previous='';this.lastSample=0;return;}
   if(context.title.startsWith('Noema ·')||['Noema desktop companion','Noema companion controls'].includes(context.title)||context.app==='noema-ui-ab-wry'){this.state.taskId=null;this.state.status='Observing · Noema window excluded';this.candidate='';this.previous='';this.lastSample=0;return;}
   context.app=context.app.slice(0,160);context.title=context.title.slice(0,1000);context.monitor=context.monitor.slice(0,80);context.workspace=context.workspace.slice(0,80);
   const signature=JSON.stringify(context);
   if(signature!==this.candidate){this.candidate=signature;this.lastSample=0;this.state.status='Checking stable activity';return;}
   const now=Date.now();const taskId=matchTask(context,this.demo?.tasks||[]);
   this.state.context=context;this.state.taskId=taskId;this.state.status=taskId?'Task activity updated from window metadata':'Observing · no unique task match';
   if(taskId){const old=this.state.activity[taskId];const elapsed=this.previous===signature&&this.lastSample?Math.min(5,Math.floor((now-this.lastSample)/1000)):0;
    this.state.activity[taskId]={app:context.app,title:context.title,monitor:context.monitor,workspace:context.workspace,observedAt:new Date(now).toISOString(),seconds:Math.min(10_000_000,(old?.seconds||0)+elapsed)};
    await this.persist();
   }
   this.previous=signature;this.lastSample=now;
  }catch{this.state.status=`${this.provider.id} unavailable · observation not confirmed`;this.state.context=null;this.state.taskId=null;this.lastSample=0;}
  finally{this.busy=false;this.onChange();}
 }
}
export function hubServer(hub:CompanionHub,port:number,secret:string){
 return createServer(async(req:IncomingMessage,res:ServerResponse)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  if(req.headers.host!==`127.0.0.1:${port}`||req.headers['x-noema-companion']!==secret){res.writeHead(403).end('{}');return;}
  try{
   if(req.method==='GET'&&req.url==='/state'){res.end(JSON.stringify(hub.state));return;}
   if(req.method!=='POST'||!['/snapshot','/settings'].includes(req.url||'')){res.writeHead(404).end('{}');return;}
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>12_000_000)throw Error('Payload too large');}
   const data=JSON.parse(raw);
   res.end(JSON.stringify(req.url==='/snapshot'?hub.snapshot(data):hub.settings(data)));
  }catch{res.writeHead(400).end(JSON.stringify({error:'Invalid companion request'}));}
 });
}
