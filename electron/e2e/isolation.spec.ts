import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { startDhara, type DharaServer } from '../../web/e2e/server.js';
import { killAll, launchDhara, openedExternal, stubOpenExternal, tempDir, waitConnected, windowCount } from './fixtures.js';

let dhara: DharaServer;
let app: ElectronApplication;
let window: Page;
let offServer: http.Server;
let offOrigin = '';
let offHits = 0;

test.beforeAll(async () => {
  offServer = http.createServer((_request, response) => {
    offHits += 1;
    response.setHeader('Content-Type', 'text/html');
    response.end('<p>off-origin</p>');
  });
  await new Promise<void>((resolve) => offServer.listen(0, '127.0.0.1', resolve));
  offOrigin = `http://127.0.0.1:${(offServer.address() as AddressInfo).port}`;
  dhara = await startDhara();
  ({ app, window } = await launchDhara(['--server', dhara.origin]));
  await waitConnected(window);
});

test.afterAll(async () => {
  await killAll();
  await dhara?.stop();
  offServer?.close();
});

test('no application menu exists, so no reload or devtools accelerator is registered', async () => {
  expect(await app.evaluate(({ Menu }) => Menu.getApplicationMenu())).toBeNull();
});

test.beforeEach(() => {
  offHits = 0;
});

async function backHome(): Promise<void> {
  await window.goto(`${dhara.origin}/#/overview`);
  await waitConnected(window);
}

test('off-origin, look-alike and credentialed navigations are blocked before any request', async () => {
  const lookAlike = dhara.origin.replace('127.0.0.1', 'localhost');
  const credentialed = dhara.origin.replace('http://', 'http://user@');
  for (const target of [`${offOrigin}/`, `${lookAlike}/`, `${credentialed}/`]) {
    await window.evaluate((url) => { location.href = url; }, target);
    await window.waitForTimeout(600);
    expect(new URL(window.url()).origin).toBe(dhara.origin);
  }
  expect(offHits).toBe(0);
});

test('a same-origin redirect to another origin is blocked', async () => {
  await app.context().route(`${dhara.origin}/redirect-probe`, (route) => route.fulfill({ status: 302, headers: { location: `${offOrigin}/` } }));
  await window.evaluate(() => { location.href = '/redirect-probe'; });
  await window.waitForTimeout(800);
  expect(offHits).toBe(0);
  expect(window.url().startsWith(offOrigin)).toBe(false);
  await app.context().unroute(`${dhara.origin}/redirect-probe`);
  await backHome();
});

test('subframe navigation off-origin and <webview> attach are blocked', async () => {
  const before = await app.evaluate(({ webContents }) => webContents.getAllWebContents().length);
  await app.context().route(`${dhara.origin}/frame-probe`, (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<iframe src="${offOrigin}/frame"></iframe><webview src="${offOrigin}/webview"></webview>`,
  }));
  await window.evaluate(() => { location.href = '/frame-probe'; });
  await window.waitForURL(`${dhara.origin}/frame-probe`);
  await window.waitForTimeout(800);
  expect(offHits).toBe(0);
  expect(window.frames().some((frame) => frame.url().startsWith(offOrigin))).toBe(false);
  expect(await app.evaluate(({ webContents }) => webContents.getAllWebContents().length)).toBe(before);
  await app.context().unroute(`${dhara.origin}/frame-probe`);
  await backHome();
});

test('popups never open in-app; only plain http(s) links reach the system browser', async () => {
  await stubOpenExternal(app);
  const targets = [`${offOrigin}/`, 'https://example.com/session', 'https://token@example.com/', 'javascript:alert(1)', 'file:///etc/passwd', 'mailto:a@b.c'];
  const results = await window.evaluate((urls) => urls.map((url) => window.open(url) === null), targets);
  expect(results.every(Boolean)).toBe(true);
  expect(await windowCount(app)).toBe(1);
  await expect.poll(() => openedExternal(app)).toEqual([`${offOrigin}/`, 'https://example.com/session']);
  expect(offHits).toBe(0);
});

test('export and same-origin blobs download; other schemes do not', async () => {
  const dir = tempDir('dhara-downloads-');
  await app.evaluate(({ session }, saveDir) => {
    const g = globalThis as typeof globalThis & { __downloads?: { url: string; state: string }[] };
    g.__downloads = [];
    session.defaultSession.on('will-download', (_event, item) => {
      const record = { url: item.getURL(), state: 'pending' };
      g.__downloads!.push(record);
      item.setSavePath(`${saveDir}/${g.__downloads!.length}-${item.getFilename()}`);
      item.once('done', (_done, state) => { record.state = state; });
    });
  }, dir);
  const records = () => app.evaluate(() => (globalThis as typeof globalThis & { __downloads?: { url: string; state: string }[] }).__downloads ?? []);
  await window.evaluate(() => {
    const anchor = document.createElement('a');
    anchor.href = '/api/export';
    anchor.download = '';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  });
  await window.evaluate(() => {
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(new Blob(['note'], { type: 'text/markdown' }));
    anchor.download = 'note.md';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  });
  await window.evaluate(() => {
    const anchor = document.createElement('a');
    anchor.href = 'data:text/plain,blocked';
    anchor.download = 'blocked.txt';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  });
  await expect.poll(async () => (await records()).find((item) => item.url.endsWith('/api/export'))?.state).toBe('completed');
  await expect.poll(async () => (await records()).find((item) => item.url.startsWith('blob:'))?.state).toBe('completed');
  await window.waitForTimeout(1500);
  expect((await records()).find((item) => item.url.startsWith('data:'))?.state ?? 'never-started').not.toBe('completed');
  expect(fs.readdirSync(dir).some((name) => name.endsWith('blocked.txt'))).toBe(false);
});
