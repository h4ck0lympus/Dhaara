import {contextBridge,ipcRenderer} from 'electron';
contextBridge.exposeInMainWorld('noemaCompanion',Object.freeze({
 state:()=>ipcRenderer.invoke('companion:state'),
 settings:(value:unknown)=>ipcRenderer.invoke('companion:settings',value),
 toggle:()=>ipcRenderer.invoke('companion:toggle'),
 close:()=>ipcRenderer.invoke('companion:close'),
 changed:(callback:(state:unknown)=>void)=>{const listener=(_event:unknown,value:unknown)=>callback(value);ipcRenderer.on('companion:changed',listener);return()=>ipcRenderer.removeListener('companion:changed',listener);}
}));
