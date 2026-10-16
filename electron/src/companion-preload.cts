import { contextBridge, ipcRenderer } from 'electron';

const IPC_COMPANION = 'dhara:companion';

contextBridge.exposeInMainWorld('dharaCompanion', Object.freeze({
  resize(open: unknown): void { if (typeof open === 'boolean') ipcRenderer.send(IPC_COMPANION, { type: 'resize', open }); },
  setVisible(visible: unknown): void { if (typeof visible === 'boolean') ipcRenderer.send(IPC_COMPANION, { type: 'visible', visible }); },
  openApp(path: unknown): void { if (typeof path === 'string') ipcRenderer.send(IPC_COMPANION, { type: 'open-app', path }); },
}));
