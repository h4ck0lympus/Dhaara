import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('noemaDemo', Object.freeze({
 load: () => ipcRenderer.invoke('demo:load'),
 save: (data: unknown) => ipcRenderer.invoke('demo:save',data),
 info: () => ipcRenderer.invoke('demo:info')
}));
