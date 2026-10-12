import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HELP_TEXT, parseArgs, userArgv, type CliOptions } from './cli.js';
import { installNavigationGuards } from './navigation.js';
import { prepareProfile, resolveProfile } from './profile.js';

const DIST = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(DIST, '../..');

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

function createWindow(): BrowserWindow {
  return new BrowserWindow({
    title: 'Noema',
    width: 1200,
    height: 800,
    minWidth: 380,
    minHeight: 540,               // main.rs:160-164
    backgroundColor: '#101110',   // main.rs:173
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(DIST, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      devTools: !app.isPackaged,
    },
  });
}

function run(options: CliOptions): void {
  const origin = options.server;
  let win: BrowserWindow | null = null;
  app.on('second-instance', () => {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  void app.whenReady().then(() => {
    const window = createWindow();
    win = window;
    installNavigationGuards(window.webContents, origin);
    void window.loadURL(origin).catch(() => undefined);
  });
}

const { options, profile } = readOptions();
app.setPath('userData', profile);   // before the lock: Chromium's ProcessSingleton lives in userData (spec §6.3)
if (app.requestSingleInstanceLock()) run(options);
else app.exit(0);   // the first instance receives 'second-instance'; this one exits 0 without using its arguments
