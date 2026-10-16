import { app, BrowserWindow, dialog, ipcMain, Menu, session, WebContentsView, type IpcMainEvent } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { helpText, parseArgs, userArgv, type CliOptions } from './cli.js';
import { installCloseHandler } from './close.js';
import { createCompanion, showInMainWindow } from './companion.js';
import { ManagedService, managedPort, prepareWorkspace, type LifecycleError } from './lifecycle.js';
import { installNavigationGuards } from './navigation.js';
import { installPermissions, PERMISSION_PROMPTS } from './permissions.js';
import { adoptLegacyProfile, dataHome, legacyProfile, prepareProfile, resolveProfile } from './profile.js';
import { IPC_STARTUP_CANCEL, IPC_STARTUP_RETRY, IPC_STARTUP_STATUS, SERVICE_DOWN, SERVICE_UP, STARTUP_TEXT, type StartupStatus } from './protocol.js';

const DIST = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(DIST, '../..');
const STARTUP_PAGE = path.resolve(DIST, '../static/startup.html');
const SANDBOXED = { sandbox: true, contextIsolation: true, nodeIntegration: false, devTools: !app.isPackaged } as const;

app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
Menu.setApplicationMenu(null);

const OVERLAY_STRIP_HEIGHT = 96;

type ShellState = 'starting' | 'loaded' | 'crashed' | 'stopping';

let mainWindow: BrowserWindow | null = null;
let companionWindow: BrowserWindow | null = null;

function startCompanion(options: CliOptions): void {
  if (!options.companion || (companionWindow !== null && !companionWindow.isDestroyed())) return;
  companionWindow = createCompanion(options.server, { preload: path.join(DIST, 'companion-preload.cjs'), webviewTag: false, ...SANDBOXED },
    (route) => showInMainWindow(mainWindow, route));
}

function exitWith(code: 0 | 2, message: string): never {
  (code === 0 ? process.stdout : process.stderr).write(`${message}\n`);
  process.exit(code);
}

function readOptions(): { options: CliOptions; profile: string } {
  try {
    const packaged = app.isPackaged ? { resourcesPath: process.resourcesPath, dataHome: dataHome(process.env) } : null;
    const options = parseArgs(userArgv(process.argv, process.defaultApp === true), process.cwd(), REPO_ROOT, process.env, packaged);
    if (options === 'help') exitWith(0, helpText(packaged));
    const resolved = resolveProfile(options.profile, process.env, process.cwd());
    const profile = options.profile === null ? adoptLegacyProfile(resolved, legacyProfile(process.env), (line) => process.stderr.write(`${line}\n`)) : resolved;   // rename-shim: adopts the pre-rename profile directory once
    prepareProfile(profile);
    return { options, profile };
  } catch (error) {
    exitWith(2, `Dhara: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function createWindow(origin: string, onApproved: () => void): BrowserWindow {
  const win = new BrowserWindow({
    title: 'Dhara',
    width: 1200,
    height: 800,
    minWidth: 380,
    minHeight: 540,
    backgroundColor: '#101110',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(DIST, 'preload.cjs'), webviewTag: false, ...SANDBOXED },
  });
  installNavigationGuards(win.webContents, origin);
  installPermissions(session.defaultSession, origin, async (kind) => (await dialog.showMessageBox(win, {
    type: 'question', message: PERMISSION_PROMPTS[kind], buttons: ['Allow', 'Deny'], defaultId: 1, cancelId: 1,
  })).response === 0);
  installCloseHandler(win, origin, onApproved);
  return win;
}

function dispatchPageEvent(win: BrowserWindow, name: string): void {
  if (!win.isDestroyed()) void win.webContents.executeJavaScript(`window.dispatchEvent(new Event('${name}'))`).catch(() => undefined);
}

function fitOverlay(win: BrowserWindow, view: WebContentsView, mode: StartupStatus['mode']): void {
  const { width, height } = win.getContentBounds();
  const strip = mode === 'overlay' ? Math.min(OVERLAY_STRIP_HEIGHT, height) : height;
  view.setBounds({ x: 0, y: height - strip, width, height: strip });
}

function createOverlay(win: BrowserWindow, current: () => StartupStatus): WebContentsView {
  const view = new WebContentsView({ webPreferences: { preload: path.join(DIST, 'startup-preload.cjs'), ...SANDBOXED } });
  view.setBackgroundColor('#101110');
  view.webContents.on('will-navigate', (event) => event.preventDefault());
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  view.webContents.on('did-finish-load', () => view.webContents.send(IPC_STARTUP_STATUS, current()));
  win.contentView.on('bounds-changed', () => fitOverlay(win, view, current().mode));
  fitOverlay(win, view, current().mode);
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
    win.webContents.once('did-finish-load', () => startCompanion(options));
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
    fitOverlay(win, overlay, status.mode);
    overlay.webContents.send(IPC_STARTUP_STATUS, status);
  };
  const hide = () => {
    if (win !== null && !win.isDestroyed() && overlay !== null && win.contentView.children.includes(overlay)) win.contentView.removeChildView(overlay);
  };

  const onCrashed = (error: LifecycleError) => {
    if (state !== 'loaded' || win === null) return;
    state = 'crashed';
    dispatchPageEvent(win, SERVICE_DOWN);
    show({ text: error.message, busy: false, mode: 'overlay' });
  };

  const ownService = (): ManagedService => {
    if (service !== null) return service;
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

  const retry = (): Promise<void> => {
    attempt ??= (async () => {
      show({ text: STARTUP_TEXT.starting, busy: true, mode: mode() });
      try {
        await ownService().start();
        if (state === 'stopping' || win === null || win.isDestroyed()) return;
        hide();
        if (state === 'starting') void win.loadURL(origin).catch(() => undefined);
        else dispatchPageEvent(win, SERVICE_UP);
        state = 'loaded';
        startCompanion(options);
      } catch (error) {
        if (state !== 'stopping') show({ text: error instanceof Error ? error.message : String(error), busy: false, mode: mode() });
      }
    })().finally(() => {
      attempt = null;
    });
    return attempt;
  };

  const stopAndQuit = async () => {
    await service?.cancel();
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
      show({ text: STARTUP_TEXT.cancelling, busy: true, mode: 'startup' });
      void stopAndQuit();
    } else if (state === 'crashed') {
      win?.close();
    }
  });

  void app.whenReady().then(() => {
    const created = createWindow(origin, onApproved);
    win = created;
    mainWindow = created;
    void created.loadURL('about:blank').catch(() => undefined);
    void retry();
  });
}

const { options, profile } = readOptions();
app.setPath('userData', profile);
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
} else {
  app.on('second-instance', () => {
    if (mainWindow === null || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.on('window-all-closed', () => undefined);
  if (options.manageService && options.dataDir !== null) runManaged(options, options.dataDir);
  else runExternal(options);
}
