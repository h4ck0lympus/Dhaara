import { DemoSchema, CompanionStateSchema, fixture, type Demo, type Fixture } from './model';
export interface DemoBridge { load(): Promise<unknown>; save(data: Demo): Promise<void>; info(): Promise<{ host:string; engine:string; version:string }> }
declare global { interface Window { noemaDemo?: DemoBridge; noemaExperimentReady?: boolean; noemaNativeClose?: () => Promise<boolean> } }
const params = new URLSearchParams(location.search);
export const host = params.get('host') || 'Browser';
export const fixtureName = (['populated','empty','waiting','review','offline'].includes(params.get('fixture') || '') ? params.get('fixture') : 'populated') as Fixture;
const key = `noema-ui-ab-v1-${host}-${fixtureName}`;
export const adapter: DemoBridge = window.noemaDemo || {
  async load() { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; },
  async save(data) { localStorage.setItem(key,JSON.stringify(DemoSchema.parse(data))); },
  async info() { return {host, engine:host === 'A' ? 'System WebKit' : 'Browser preview',version:navigator.userAgent}; }
};
export async function loadDemo(): Promise<Demo> { const saved=await adapter.load(); return saved == null ? fixture(fixtureName) : DemoSchema.parse(saved); }
export async function companionRequest(route:'state'|'snapshot'|'settings',payload?:unknown){
 const response=await fetch('/api/companion/'+route,{method:payload===undefined?'GET':'POST',headers:{'X-Noema-UI':'1','Content-Type':'application/json'},body:payload===undefined?undefined:JSON.stringify(payload)});
 if(!response.ok)throw Error('Desktop companion is not connected');
 return CompanionStateSchema.parse(await response.json());
}
export function publishCompanion(data:Demo){
 // The observer only needs task records and companion mode. Never send note captures or attachments.
 return companionRequest('snapshot',{...data,notes:[],draft:{id:'',raw:''},capture:{id:'',raw:'',images:[]}});
}
