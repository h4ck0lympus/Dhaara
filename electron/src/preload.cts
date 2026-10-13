import { contextBridge, ipcRenderer } from 'electron';

// Sandboxed preloads cannot import ./protocol.js; test/preload.test.ts keeps these equal to protocol.ts.
const IPC_PAGE = 'dhara:ipc';
const CLOSE_APPROVED = 'dhara:close-approved';

contextBridge.exposeInMainWorld('ipc', Object.freeze({
  postMessage(message: unknown): void {
    if (message === CLOSE_APPROVED) ipcRenderer.send(IPC_PAGE, message);
  },
}));
