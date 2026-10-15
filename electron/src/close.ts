import { dialog, ipcMain, type BrowserWindow, type IpcMainEvent } from 'electron';
import { sameOrigin } from './origin.js';
import { CHECKPOINT_CLOSE, CHECKPOINT_FAILED, CLOSE_APPROVED, CLOSE_TIMEOUT_MS, IPC_PAGE, NOT_RESPONDING } from './protocol.js';

const REQUEST_CHECKPOINT = `window.__dharaCheckpointCloseReady===true ? (setTimeout(() => window.dispatchEvent(new Event('${CHECKPOINT_CLOSE}'))), true) : false`;

export function installCloseHandler(win: BrowserWindow, origin: string, onApproved: () => void): void {
  const contents = win.webContents;
  let loaded = false;
  let gone = false;
  let requested = false;
  let approved = false;
  let asking = false;
  let timer: NodeJS.Timeout | undefined;

  const approve = () => {
    if (approved) return;
    approved = true;
    clearTimeout(timer);
    onApproved();
  };
  const notResponding = async () => {
    if (approved || asking || win.isDestroyed()) return;
    asking = true;
    try {
      const { response } = await dialog.showMessageBox(win, {
        type: 'warning', message: NOT_RESPONDING, buttons: ['Force close', 'Keep open'], defaultId: 1, cancelId: 1,
      });
      if (response === 0) approve();
      else requested = false;
    } finally {
      asking = false;
    }
  };
  const onPageMessage = (event: IpcMainEvent, message: unknown) => {
    if (message !== CLOSE_APPROVED || !requested || event.sender !== contents) return;
    const frame = event.senderFrame;
    if (!frame || frame !== contents.mainFrame || !sameOrigin(origin, frame.url)) return;
    approve();
  };

  contents.on('did-finish-load', () => { loaded = true; });
  contents.on('render-process-gone', () => {
    gone = true;
    if (requested) approve();
  });
  ipcMain.on(IPC_PAGE, onPageMessage);
  win.once('closed', () => {
    clearTimeout(timer);
    ipcMain.removeListener(IPC_PAGE, onPageMessage);
  });
  win.on('close', (event) => {
    if (approved) return;
    event.preventDefault();
    if (!loaded || gone || contents.isCrashed() || contents.isLoadingMainFrame()) {
      approve();
      return;
    }
    requested = true;
    clearTimeout(timer);
    timer = setTimeout(() => void notResponding(), CLOSE_TIMEOUT_MS);
    contents.executeJavaScript(REQUEST_CHECKPOINT).then((ready: unknown) => {
      clearTimeout(timer);
      if (!requested) return;
      if (ready !== true) approve();
    }, () => {
      clearTimeout(timer);
      if (gone || contents.isCrashed()) approve();
      else {
        requested = false;
        void dialog.showMessageBox(win, { type: 'warning', message: CHECKPOINT_FAILED, buttons: ['OK'] }).catch(() => undefined);
      }
    });
  });
}
