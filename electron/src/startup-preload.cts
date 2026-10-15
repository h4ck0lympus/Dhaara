import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

const IPC_STARTUP_RETRY = 'dhara:startup-retry';
const IPC_STARTUP_CANCEL = 'dhara:startup-cancel';
const IPC_STARTUP_STATUS = 'dhara:startup-status';
type StartupStatus = { text: string; busy: boolean; mode: 'startup' | 'overlay' };

contextBridge.exposeInMainWorld('dharaStartup', Object.freeze({
  retry(): void {
    ipcRenderer.send(IPC_STARTUP_RETRY);
  },
  cancel(): void {
    ipcRenderer.send(IPC_STARTUP_CANCEL);
  },
  onStatus(callback: (status: StartupStatus) => void): void {
    ipcRenderer.on(IPC_STARTUP_STATUS, (_event: IpcRendererEvent, status: StartupStatus) => callback(status));
  },
}));
