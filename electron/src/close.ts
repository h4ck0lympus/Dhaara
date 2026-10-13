import { dialog, ipcMain, type BrowserWindow, type IpcMainEvent } from 'electron';
import { sameOrigin } from './origin.js';
import { CHECKPOINT_CLOSE, CHECKPOINT_FAILED, CLOSE_APPROVED, CLOSE_TIMEOUT_MS, IPC_PAGE, NOT_RESPONDING } from './protocol.js';

// desktop/src/close.js:3-8: only a page that finished recovery may checkpoint. The event fires on a later task,
// so a page-side confirm() never holds this script open: the script settling means the renderer is responsive.
const REQUEST_CHECKPOINT = `window.__noemaCheckpointCloseReady===true ? (setTimeout(() => window.dispatchEvent(new Event('${CHECKPOINT_CLOSE}'))), true) : false`;

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
      else requested = false;   // Keep open withdraws the request: a late answer from the recovered renderer must not close
    } finally {
      asking = false;
    }
  };
  const onPageMessage = (event: IpcMainEvent, message: unknown) => {
    // Only an answer to a close request, from this window's main frame, at the trusted origin (spec §6.3 Preloads).
    if (message !== CLOSE_APPROVED || !requested || event.sender !== contents) return;
    const frame = event.senderFrame;
    if (!frame || frame !== contents.mainFrame || !sameOrigin(origin, frame.url)) return;
    approve();
  };

  contents.on('did-finish-load', () => { loaded = true; });
  contents.on('render-process-gone', () => {
    gone = true;
    if (requested) approve();   // the renderer is gone: close without touching storage
  });
  ipcMain.on(IPC_PAGE, onPageMessage);
  win.once('closed', () => {
    clearTimeout(timer);
    ipcMain.removeListener(IPC_PAGE, onPageMessage);
  });
  win.on('close', (event) => {
    if (approved) return;
    event.preventDefault();
    // Not finished loading (Electron's executeJavaScript would wait for the load), or no renderer: close at once.
    if (!loaded || gone || contents.isCrashed() || contents.isLoadingMainFrame()) {
      approve();
      return;
    }
    requested = true;
    clearTimeout(timer);
    timer = setTimeout(() => void notResponding(), CLOSE_TIMEOUT_MS);
    contents.executeJavaScript(REQUEST_CHECKPOINT).then((ready: unknown) => {
      // shortcut: a responsive page whose checkpoint never settles stays open until the next close; add a page 'refused' message if users hit it.
      clearTimeout(timer);   // the renderer answered; the page now decides
      if (!requested) return;   // the user chose Keep open meanwhile
      if (ready !== true) approve();   // no ready flag: the app never recovered its drafts, so do not touch storage
    }, () => {
      clearTimeout(timer);
      // Approve only when the renderer is really gone; a live page that failed the request keeps its unsaved work open.
      if (gone || contents.isCrashed()) approve();
      else {
        requested = false;
        void dialog.showMessageBox(win, { type: 'warning', message: CHECKPOINT_FAILED, buttons: ['OK'] }).catch(() => undefined);
      }
    });
  });
}
