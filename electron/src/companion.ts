import { BrowserWindow, ipcMain, screen, type IpcMainEvent } from 'electron';
import { companionBounds, COMPANION_TITLE, IPC_COMPANION, parseCompanionMessage } from './companion-protocol.js';
import { installNavigationGuards } from './navigation.js';
import { sameOrigin } from './origin.js';

type WebPreferences = NonNullable<ConstructorParameters<typeof BrowserWindow>[0]>['webPreferences'];

/** The desktop kitty: a small transparent always-on-top window showing the /companion route. */
export function createCompanion(origin: string, webPreferences: WebPreferences, onOpenApp: (path: string) => void): BrowserWindow {
  const workArea = screen.getPrimaryDisplay().workArea;
  const win = new BrowserWindow({
    title: COMPANION_TITLE, ...companionBounds(workArea, false), show: false, frame: false, transparent: true,
    backgroundColor: '#00000000', resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false, webPreferences,
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true);
  installNavigationGuards(win.webContents, origin);
  win.once('ready-to-show', () => win.showInactive());

  const onMessage = (event: IpcMainEvent, raw: unknown) => {
    if (win.isDestroyed() || event.sender !== win.webContents) return;
    const frame = event.senderFrame;
    if (!frame || frame !== win.webContents.mainFrame || !sameOrigin(origin, frame.url)) return;
    const message = parseCompanionMessage(raw);
    if (message === null) return;
    if (message.type === 'resize') {
      win.setBounds(companionBounds(screen.getDisplayMatching(win.getBounds()).workArea, message.open));
      if (message.open) win.focus();
    } else if (message.type === 'visible') {
      if (message.visible) win.showInactive();
      else win.hide();
    } else {
      onOpenApp(message.path);
    }
  };
  ipcMain.on(IPC_COMPANION, onMessage);
  win.once('closed', () => ipcMain.removeListener(IPC_COMPANION, onMessage));
  void win.loadURL(`${origin}/#/companion`).catch(() => undefined);
  return win;
}

/** Brings the main window forward on the given in-app route. */
export function showInMainWindow(win: BrowserWindow | null, path: string): void {
  if (win === null || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  void win.webContents.executeJavaScript(`location.hash = ${JSON.stringify(`#${path}`)}`).catch(() => undefined);
}
