import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import { getFreePort } from '../../web/e2e/server.js';
import { live } from '../test/proc.js';
import { ELECTRON_BIN, MAIN, REPO_ROOT, tempDir } from './fixtures.js';

export const FAKE = path.join(REPO_ROOT, 'electron/test/fixtures/fake_service.py');

export type Managed = { dataDir: string; port: number; origin: string; args: string[]; env: Record<string, string> };

export async function managedSetup(): Promise<Managed> {
  const port = await getFreePort();
  const dataDir = path.join(tempDir('dhara-managed-'), 'data');
  const origin = `http://127.0.0.1:${port}`;
  return {
    dataDir,
    port,
    origin,
    args: ['--manage-service', '--data-dir', dataDir, '--server', origin],
    env: { DHARA_ELECTRON_TEST: '1', DHARA_ELECTRON_TEST_PORT: String(port) },
  };
}

async function pageWhere(app: ElectronApplication, matches: (url: string) => boolean, timeout = 45_000): Promise<Page> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const page = app.windows().find((candidate) => matches(candidate.url()));
    if (page) return page;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('No matching Electron page');
}

export const startupPage = (app: ElectronApplication) => pageWhere(app, (url) => url.startsWith('file://') && url.endsWith('/static/startup.html'));
export const appPage = (app: ElectronApplication, origin: string) => pageWhere(app, (url) => url.startsWith(`${origin}/`));

export function mainUrl(app: ElectronApplication): Promise<string> {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.getURL() ?? '');
}

export async function servicePid(origin: string): Promise<number> {
  return ((await (await fetch(`${origin}/api/desktop-instance`)).json()) as { pid: number }).pid;
}

export function ownedServices(electronPid: number): number[] {
  const children = fs.readdirSync(`/proc/${electronPid}/task`).flatMap((tid) => {
    try {
      return fs.readFileSync(`/proc/${electronPid}/task/${tid}/children`, 'utf8').split(' ').filter(Boolean).map(Number);
    } catch {
      return [];
    }
  });
  return children.filter((pid) => {
    try {
      return live(pid) && fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').includes('--desktop-managed');
    } catch {
      return false;
    }
  });
}

export function runElectron(args: string[], env: Record<string, string> = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(ELECTRON_BIN, [MAIN, ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    const timer = setTimeout(() => child.kill('SIGKILL'), 30_000);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

export function overlayBounds(app: ElectronApplication) {
  return app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return { content: win.getContentBounds(), views: win.contentView.children.map((view) => view.getBounds()) };
  });
}
