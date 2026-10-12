import { _electron, expect, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';

export { expect };
export type { Locator };
export const ELECTRON_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = path.resolve(ELECTRON_ROOT, '..');
export const MAIN = path.join(ELECTRON_ROOT, 'dist/main.js');
export const ELECTRON_BIN = electronPath as unknown as string;

import { live, tempDir, until } from '../test/proc.js';

export { tempDir };   // one temp-dir helper for unit and e2e tests (Task 7)

const launched: ElectronApplication[] = [];

/** True while a live process holds the profile's Chromium singleton lock, or any process still runs with it as --user-data-dir. */
function profileBusy(profile: string): boolean {
  try {
    const holder = Number(fs.readlinkSync(path.join(profile, 'SingletonLock')).split('-').pop());
    if (holder && live(holder)) return true;
  } catch { /* no lock */ }
  return fs.readdirSync('/proc').some((entry) => {
    if (!/^\d+$/.test(entry) || !live(Number(entry))) return false;
    try {
      return fs.readFileSync(`/proc/${entry}/cmdline`, 'utf8').split('\0').includes(`--user-data-dir=${profile}`);
    } catch {
      return false;
    }
  });
}

/** Always a throwaway --profile unless one is passed back in to test a restart; a reused profile waits for its previous instance to be fully gone. */
export async function launchNoema(args: string[], options: { env?: Record<string, string>; profile?: string } = {}): Promise<{ app: ElectronApplication; window: Page; profile: string }> {
  if (!fs.existsSync(MAIN)) throw new Error('Run npm --prefix electron run build first');
  const profile = options.profile ?? tempDir('noema-electron-profile-');
  if (options.profile) await until(() => !profileBusy(profile), 30_000);
  const env = Object.fromEntries(Object.entries({ ...process.env, ...options.env }).filter((entry): entry is [string, string] => entry[1] !== undefined));
  // Chromium switches go before the app path; Noema's own arguments follow it (cli.ts userArgv).
  // chromiumSandbox: Playwright otherwise adds --no-sandbox (spec §6.3: never); needs scripts/link-sandbox.mjs.
  const app = await _electron.launch({
    executablePath: ELECTRON_BIN,
    chromiumSandbox: true,
    args: ['--ozone-platform=wayland', '--use-fake-device-for-media-stream', MAIN, '--profile', profile, ...args],
    env,
  });
  launched.push(app);
  app.on('close', () => { const at = launched.indexOf(app); if (at >= 0) launched.splice(at, 1); });   // a closed app has no process() to kill
  const window = await app.firstWindow();
  return { app, window, profile };
}

/** After each test: any app still running is killed; an owned service then stops through its lease. */
export async function killAll(): Promise<void> {
  for (const app of launched.splice(0)) {
    const child = app.process();
    if (child.exitCode !== null || child.signalCode !== null) continue;
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGKILL');
    await exited;
  }
}

export async function waitConnected(page: Page): Promise<void> {
  await page.getByText('Server connected', { exact: true }).first().waitFor({ timeout: 45_000 });
}

export function windowCount(app: ElectronApplication): Promise<number> {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
}

export async function stubOpenExternal(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ shell }) => {
    const g = globalThis as typeof globalThis & { __opened?: string[] };
    g.__opened = [];
    shell.openExternal = async (url: string) => {
      g.__opened!.push(url);
    };
  });
}

export function openedExternal(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(() => (globalThis as typeof globalThis & { __opened?: string[] }).__opened ?? []);
}

/** Replaces dialog.showMessageBox in the main process; answers are consumed in order (spec §6.3: tests stub it). */
export async function stubMessageBox(app: ElectronApplication, responses: number[]): Promise<void> {
  await app.evaluate(({ dialog }, queue) => {
    const g = globalThis as typeof globalThis & { __messageBoxes?: string[] };
    g.__messageBoxes = g.__messageBoxes ?? [];
    const answers = [...queue];
    dialog.showMessageBox = (async (...args: unknown[]) => {
      const options = (args.length > 1 ? args[1] : args[0]) as { message: string; cancelId?: number };
      g.__messageBoxes!.push(options.message);
      return { response: answers.length > 0 ? answers.shift()! : options.cancelId ?? 0, checkboxChecked: false };
    }) as typeof dialog.showMessageBox;
  }, responses);
}

export function messageBoxes(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(() => (globalThis as typeof globalThis & { __messageBoxes?: string[] }).__messageBoxes ?? []);
}
