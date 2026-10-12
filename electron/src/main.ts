import { app, BrowserWindow, dialog, ipcMain, session, WebContentsView, type IpcMainEvent } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HELP_TEXT, parseArgs, userArgv, type CliOptions } from './cli.js';
import { installCloseHandler } from './close.js';
import { ManagedService, managedPort, prepareWorkspace, type LifecycleError } from './lifecycle.js';
import { installNavigationGuards } from './navigation.js';
import { installPermissions, PERMISSION_PROMPTS } from './permissions.js';
import { prepareProfile, resolveProfile } from './profile.js';
import { IPC_STARTUP_CANCEL, IPC_STARTUP_RETRY, IPC_STARTUP_STATUS, SERVICE_DOWN, SERVICE_UP, STARTUP_TEXT, type StartupStatus } from './protocol.js';

const DIST = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(DIST, '../..');
const STARTUP_PAGE = path.resolve(DIST, '../static/startup.html');
// spec §6.3 webPreferences; never --no-sandbox.
const SANDBOXED = { sandbox: true, contextIsolation: true, nodeIntegration: false, devTools: !app.isPackaged } as const;

type ShellState = 'starting' | 'loaded' | 'crashed' | 'stopping';

let mainWindow: BrowserWindow | null = null;

function exitWith(code: 0 | 2, message: string): never {
  (code === 0 ? process.stdout : process.stderr).write(`${message}\n`);
  process.exit(code);
}

function readOptions(): { options: CliOptions; profile: string } {
  try {
    const options = parseArgs(userArgv(process.argv, process.defaultApp === true), process.cwd(), REPO_ROOT, process.env);
    if (options === 'help') exitWith(0, HELP_TEXT);
    const profile = resolveProfile(options.profile, process.env, process.cwd());
    prepareProfile(profile);
    return { options, profile };
  } catch (error) {
    exitWith(2, `Noema: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function createWindow(origin: string, onApproved: () => void): BrowserWindow {
  const win = new BrowserWindow({
    title: 'Noema',
    width: 1200,
    height: 800,
    minWidth: 380,
    minHeight: 540,               // main.rs:160-164
    backgroundColor: '#101110',   // main.rs:173
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(DIST, 'preload.cjs'), webviewTag: false, ...SANDBOXED },
  });
  installNavigationGuards(win.webContents, origin);
  installPermissions(session.defaultSession, origin, async (kind) => (await dialog.showMessageBox(win, {
    type: 'question', message: PERMISSION_PROMPTS[kind], buttons: ['Allow', 'Deny'], defaultId: 1, cancelId: 1,
  })).response === 0);
  // onApproved calls win.destroy(), so beforeunload cannot cancel the close silently (spec §6.3).
  installCloseHandler(win, origin, onApproved);
  return win;
}

function dispatchPageEvent(win: BrowserWindow, name: string): void {
  if (!win.isDestroyed()) void win.webContents.executeJavaScript(`window.dispatchEvent(new Event('${name}'))`).catch(() => undefined);
}

/** The local startup/crash page: its own sandboxed view and preload, laid over the whole window (spec §6.4.6). */
function createOverlay(win: BrowserWindow, current: () => StartupStatus): WebContentsView {
  const view = new WebContentsView({ webPreferences: { preload: path.join(DIST, 'startup-preload.cjs'), ...SANDBOXED } });
  view.setBackgroundColor('#101110');
  view.webContents.on('will-navigate', (event) => event.preventDefault());
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  view.webContents.on('did-finish-load', () => view.webContents.send(IPC_STARTUP_STATUS, current()));
  const fit = () => {
    const { width, height } = win.getContentBounds();
    view.setBounds({ x: 0, y: 0, width, height });
  };
  win.on('resize', fit);
  fit();
  void view.webContents.loadFile(STARTUP_PAGE).catch(() => undefined);
  return view;
}

function runExternal(options: CliOptions): void {
  void app.whenReady().then(() => {
    const win = createWindow(options.server, () => {
      win.destroy();
      app.quit();
    });
    mainWindow = win;
    void win.loadURL(options.server).catch(() => undefined);
  });
}

function runManaged(options: CliOptions, dataDir: string): void {
  const origin = options.server;
  let state: ShellState = 'starting';
  let status: StartupStatus = { text: STARTUP_TEXT.starting, busy: true, mode: 'startup' };
  let win: BrowserWindow | null = null;
  let overlay: WebContentsView | null = null;
  let service: ManagedService | null = null;
  let attempt: Promise<void> | null = null;

  const mode = (): StartupStatus['mode'] => (state === 'starting' ? 'startup' : 'overlay');
  const show = (next: StartupStatus) => {
    status = next;
    if (win === null || win.isDestroyed()) return;
    overlay ??= createOverlay(win, () => status);
    if (!win.contentView.children.includes(overlay)) win.contentView.addChildView(overlay);
    overlay.webContents.send(IPC_STARTUP_STATUS, status);
  };
  const hide = () => {
    if (win !== null && !win.isDestroyed() && overlay !== null && win.contentView.children.includes(overlay)) win.contentView.removeChildView(overlay);
  };

  const onCrashed = (error: LifecycleError) => {
    if (state !== 'loaded' || win === null) return;
    state = 'crashed';
    dispatchPageEvent(win, SERVICE_DOWN);   // not 'offline': the page keeps its drafts and stays loaded
    show({ text: error.message, busy: false, mode: 'overlay' });
  };

  const ownService = (): ManagedService => {
    if (service !== null) return service;
    // Throws LifecycleError('workspace', …) with the service.rs wording; the overlay shows it with Retry.
    const created = new ManagedService({
      python: options.python,
      entryPoint: options.entryPoint,
      workspace: prepareWorkspace(dataDir, process.cwd()),
      port: managedPort(process.env),
      timeoutMs: options.startupTimeoutMs,
      env: process.env,
    });
    created.on('crashed', onCrashed);
    service = created;
    return created;
  };

  /** Serialised: a Retry during an attempt joins it; ManagedService never spawns while its group is alive. */
  const retry = (): Promise<void> => {
    attempt ??= (async () => {
      show({ text: STARTUP_TEXT.starting, busy: true, mode: mode() });
      try {
        await ownService().start();
        if (state === 'stopping' || win === null || win.isDestroyed()) return;
        hide();
        if (state === 'starting') void win.loadURL(origin).catch(() => undefined);   // identity verified: only now is the origin loaded
        else dispatchPageEvent(win, SERVICE_UP);   // no reload
        state = 'loaded';
      } catch (error) {
        if (state !== 'stopping') show({ text: error instanceof Error ? error.message : String(error), busy: false, mode: mode() });
      }
    })().finally(() => {
      attempt = null;
    });
    return attempt;
  };

  const stopAndQuit = async () => {
    await service?.cancel();   // aborts a start in progress; otherwise stdin → 5 s → TERM → 1 s → KILL (spec §6.4.6)
    if (win !== null && !win.isDestroyed()) win.destroy();
    app.quit();
  };
  const onApproved = () => {
    state = 'stopping';
    if (win !== null && !win.isDestroyed()) win.destroy();
    void stopAndQuit();
  };

  const fromOverlay = (event: IpcMainEvent) => overlay !== null && event.sender === overlay.webContents;
  ipcMain.on(IPC_STARTUP_RETRY, (event) => {
    if (fromOverlay(event) && (state === 'starting' || state === 'crashed')) void retry();
  });
  ipcMain.on(IPC_STARTUP_CANCEL, (event) => {
    if (!fromOverlay(event)) return;
    if (state === 'starting') {
      state = 'stopping';
      show({ text: STARTUP_TEXT.cancelling, busy: true, mode: 'startup' });   // no page has loaded: no checkpoint
      void stopAndQuit();
    } else if (state === 'crashed') {
      win?.close();   // Quit runs the checkpoint first
    }
  });

  void app.whenReady().then(() => {
    const created = createWindow(origin, onApproved);
    win = created;
    mainWindow = created;
    // A never-navigated window is reported as crashed by the CDP debugger (Playwright then drops it); give it a real, inert document.
    void created.loadURL('about:blank').catch(() => undefined);
    void retry();
  });
}

const { options, profile } = readOptions();
app.setPath('userData', profile);   // before the lock: Chromium's ProcessSingleton lives in userData (spec §6.3)
if (!app.requestSingleInstanceLock()) {
  app.exit(0);   // the first instance receives 'second-instance'; this one exits 0 without using its arguments
} else {
  app.on('second-instance', () => {
    if (mainWindow === null || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  // Quitting is explicit: after the window is destroyed an owned service may still be stopping.
  app.on('window-all-closed', () => undefined);
  if (options.manageService && options.dataDir !== null) runManaged(options, options.dataDir);
  else runExternal(options);
}
