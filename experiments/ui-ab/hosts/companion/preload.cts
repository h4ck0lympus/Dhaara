import {contextBridge,ipcRenderer} from 'electron';
contextBridge.exposeInMainWorld('noemaCompanion',Object.freeze({
 dragStart:()=>ipcRenderer.invoke('companion:drag-start'),
 dragEnd:()=>ipcRenderer.invoke('companion:drag-end'),
 resize:(size:number)=>ipcRenderer.invoke('companion:resize',size),
 follow:()=>ipcRenderer.invoke('companion:follow'),
 motion:(reduced:boolean)=>ipcRenderer.invoke('companion:motion',reduced),
 state:()=>ipcRenderer.invoke('companion:state'),
 settings:(value:unknown)=>ipcRenderer.invoke('companion:settings',value),
 toggle:()=>ipcRenderer.invoke('companion:toggle'),
 close:()=>ipcRenderer.invoke('companion:close'),
 changed:(callback:(state:unknown)=>void)=>{const listener=(_event:unknown,value:unknown)=>callback(value);ipcRenderer.on('companion:changed',listener);return()=>ipcRenderer.removeListener('companion:changed',listener);}
}));
