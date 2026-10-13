import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { _electron, test, expect, type Page } from '@playwright/test';
import { CLOSE_TIMEOUT_MS, NOT_RESPONDING } from '../src/protocol.js';
import { startNoema, type NoemaServer } from '../../web/e2e/server.js';
import { ELECTRON_BIN, MAIN, closeWindow, killAll, launchNoema, messageBoxes, openCapture, readDraft, stubMessageBox, tempDir, waitConnected, windowCount } from './fixtures.js';

// Verbatim from web/src/strings.ts (contract §5): S.closeSaveInFlight and S.closeDraftFailed.
const CLOSE_SAVE_IN_FLIGHT = 'A capture save is still finishing. Try closing again shortly.';
const CLOSE_DRAFT_FAILED = 'Local draft saving failed. Close anyway and risk losing this draft? Cancel to keep it open and retry.';

let noema: NoemaServer;
test.beforeEach(async () => { noema = await startNoema(); });
test.afterEach(async () => { await killAll(); await noema.stop(); });

async function openApp(profile?: string) {
  const launched = await launchNoema(['--server', noema.origin], { profile });
  await waitConnected(launched.window);
  return launched;
}

async function stubConfirm(page: Page, answer: boolean): Promise<void> {
  await page.evaluate((value) => {
    const w = window as typeof window & { __confirms?: string[] };
    w.__confirms = [];
    window.confirm = (message?: string) => {
      w.__confirms!.push(String(message));
      return value;
    };
  }, answer);
}

const confirms = (page: Page) => page.evaluate(() => (window as typeof window & { __confirms?: string[] }).__confirms ?? []);

test('the checkpoint persists a draft typed just before closing (scenario.js draft stage)', async () => {
  const first = await openApp();
  const editor = await openCapture(first.window);
  await editor.fill('Typed right before close.');   // inside the 350 ms debounce
  const closed = first.app.waitForEvent('close');
  await closeWindow(first.app);
  await closed;
  const second = await openApp(first.profile);
  expect((await readDraft(second.window))?.raw).toBe('Typed right before close.');
  await expect(await openCapture(second.window)).toHaveValue('Typed right before close.');
});

test('a capture save in flight keeps the window open with a toast and no not-responding dialog', async () => {
  const { app, window } = await openApp();
  await stubMessageBox(app, []);
  const editor = await openCapture(window);
  await editor.fill('Save in flight');
  await expect.poll(async () => (await readDraft(window))?.raw).toBe('Save in flight');
  // A second connection holds a readwrite transaction on 'outbox', so Save's ['kv','outbox'] transaction waits.
  await window.evaluate(() => new Promise<void>((resolve, reject) => {
    const w = window as typeof window & { __holdOutbox?: boolean };
    w.__holdOutbox = true;
    const open = indexedDB.open('noema-local-v1', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const store = open.result.transaction('outbox', 'readwrite').objectStore('outbox');
      const spin = () => {
        if (w.__holdOutbox) store.count().onsuccess = spin;
        else open.result.close();
      };
      spin();
      resolve();
    };
  }));
  await window.getByRole('button', { name: 'Save note' }).click();
  await closeWindow(app);
  await expect(window.getByText(CLOSE_SAVE_IN_FLIGHT)).toBeVisible();
  // The page answered (by refusing): the renderer is responsive, so no native dialog may follow.
  await window.waitForTimeout(CLOSE_TIMEOUT_MS + 1_000);
  expect(await messageBoxes(app)).toEqual([]);
  expect(await windowCount(app)).toBe(1);
  await window.evaluate(() => { (window as typeof window & { __holdOutbox?: boolean }).__holdOutbox = false; });
  await expect.poll(async () => (await readDraft(window))?.raw).toBe('');   // the save committed
  const closed = app.waitForEvent('close');
  await closeWindow(app);
  await closed;
});

test('a failed draft write asks before closing and keeps the window when declined', async () => {
  const { app, window } = await openApp();
  const editor = await openCapture(window);
  await window.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (key === 'draft') throw new DOMException('Injected draft failure', 'QuotaExceededError');
      return put.call(this, value, key);
    };
  });
  await editor.fill('Draft that cannot be stored');
  await stubConfirm(window, false);
  await closeWindow(app);
  await expect.poll(() => confirms(window)).toEqual([CLOSE_DRAFT_FAILED]);
  expect(await windowCount(app)).toBe(1);
  await expect(editor).toHaveValue('Draft that cannot be stored');
  await stubConfirm(window, true);
  const closed = app.waitForEvent('close');
  await closeWindow(app);
  await closed;
});

test('a hung renderer gets Force close / Keep open after 10 s', async () => {
  const { app, window } = await openApp();
  await stubMessageBox(app, [1, 0]);   // first Keep open, then Force close
  // Hang the renderer for 30 s; the request script cannot run, so executeJavaScript never settles.
  await window.evaluate(() => {
    setTimeout(() => {
      const end = Date.now() + 30_000;
      while (Date.now() < end) { /* an unresponsive renderer */ }
    }, 0);
  });
  await closeWindow(app);
  await expect.poll(() => messageBoxes(app), { timeout: 20_000 }).toEqual([NOT_RESPONDING]);
  expect(await windowCount(app)).toBe(1);   // Keep open
  const closed = app.waitForEvent('close');
  await closeWindow(app);   // still hung: 10 s later the second prompt answers Force close
  await closed;
});

test('Keep open stays open after the hung renderer recovers', async () => {
  const { app, window } = await openApp();
  await stubMessageBox(app, [1]);
  await window.evaluate(() => {
    setTimeout(() => {
      const end = Date.now() + 14_000;
      while (Date.now() < end) { /* hangs past the 10 s prompt, then recovers */ }
    }, 0);
  });
  await closeWindow(app);
  await expect.poll(() => messageBoxes(app), { timeout: 20_000 }).toEqual([NOT_RESPONDING]);
  await window.waitForTimeout(9_000);   // the loop has ended and the queued checkpoint request has run
  expect(await windowCount(app)).toBe(1);
  await expect(window.getByText('Server connected', { exact: true }).first()).toBeVisible();
});

test('a failed task-draft write asks before closing and keeps the window when declined', async () => {
  const { app, window } = await openApp();
  await window.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (key === 'task-draft') throw new DOMException('Injected task draft failure', 'QuotaExceededError');
      return put.call(this, value, key);
    };
  });
  await window.evaluate(() => { location.hash = '#/plan'; });
  await window.locator('.page-heading').getByRole('button', { name: 'Add task' }).click();
  const input = window.locator('#task-input');
  await input.fill('Task that cannot be stored');
  await stubConfirm(window, false);
  await closeWindow(app);
  await expect.poll(() => confirms(window)).toEqual([CLOSE_DRAFT_FAILED]);
  expect(await windowCount(app)).toBe(1);
  await expect(input).toHaveValue('Task that cannot be stored');
  await stubConfirm(window, true);
  const closed = app.waitForEvent('close');
  await closeWindow(app);
  await closed;
});

test('closing before the page finished loading closes at once without a checkpoint', async () => {
  const sockets: net.Socket[] = [];
  // Commits a document but never finishes it: the page is still loading, so launch can attach yet did-finish-load never fires.
  const silent = net.createServer((socket) => {
    sockets.push(socket);
    socket.on('error', () => undefined);
    socket.write('HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nTransfer-Encoding: chunked\r\n\r\n8\r\n<html>\r\n\r\n');
  });
  await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = silent.address() as net.AddressInfo;
    // No firstWindow() (it needs a committed page): launch directly and watch the window from the main process.
    const profile = tempDir('noema-electron-profile-');
    const app = await _electron.launch({
      executablePath: ELECTRON_BIN,
      chromiumSandbox: true,
      args: ['--ozone-platform=wayland', MAIN, '--profile', profile, '--server', `http://127.0.0.1:${port}`],
    });
    const child = app.process();
    try {
      await stubMessageBox(app, []);
      await expect.poll(() => windowCount(app)).toBe(1);
      await expect.poll(() => sockets.length).toBeGreaterThan(0);   // the load is in flight
      const closed = app.waitForEvent('close');
      const started = Date.now();
      await closeWindow(app);
      await closed;
      expect(Date.now() - started).toBeLessThan(5_000);   // no checkpoint request and no 10 s wait
      const idb = path.join(profile, 'IndexedDB');   // storage untouched: the page never opened a database
      expect(fs.existsSync(idb) ? fs.readdirSync(idb).filter((name) => name.includes('127.0.0.1')) : []).toEqual([]);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  } finally {
    for (const socket of sockets) socket.destroy();
    silent.close();
  }
});

test('a loaded page that never set the ready flag closes without a checkpoint request', async () => {
  const first = await openApp();
  await first.window.evaluate(() => {
    delete (window as typeof window & { __noemaCheckpointCloseReady?: true }).__noemaCheckpointCloseReady;
    window.addEventListener('noema:checkpoint-close', () => localStorage.setItem('noema-test-checkpoint', 'dispatched'), { capture: true });
  });
  const closed = first.app.waitForEvent('close');
  await closeWindow(first.app);
  await closed;
  const second = await openApp(first.profile);
  expect(await second.window.evaluate(() => localStorage.getItem('noema-test-checkpoint'))).toBeNull();
});
