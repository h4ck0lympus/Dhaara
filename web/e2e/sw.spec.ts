import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { expect, expectFontsLoaded, guardContext, PNG_1PX, test } from './fixtures';
import { getFreePort, REPO, startDhara, WEB_DIST } from './server';

const ROUTES = ['#/overview', '#/capture', '#/notes', '#/note/offline-check', '#/plan'];

function readPrecache(dist: string): { cache: string; urls: string[] } {
  const header = readFileSync(join(dist, 'sw.js'), 'utf8').split('\n', 1)[0];
  const match = /^const CACHE="(dhara-shell-[0-9a-f]{12})";const PRECACHE=(\[.*\]);$/.exec(header);
  if (!match) throw new Error(`${dist}/sw.js has no precache header; run npm --prefix web run build`);
  return { cache: match[1], urls: JSON.parse(match[2]) as string[] };
}

function copyDist(): string {
  const dist = mkdtempSync(join(tmpdir(), 'dhara-dist-'));
  cpSync(WEB_DIST, dist, { recursive: true });
  return dist;
}

async function waitForController(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
}

async function shellVisible(page: Page): Promise<void> {
  await expect(page.locator('#root [data-quiet]').first()).toBeVisible();
}

function serveV1(port: number): Promise<Server> {
  const files: Record<string, [string | Buffer, string]> = {
    '/': ['<!doctype html><title>Dhara v1</title><main data-quiet><h1>v1</h1></main><script type="module" src="/static/app.js"></script>', 'text/html'],
    '/sw.js': [readFileSync(join(REPO, 'web/e2e/v1/sw.js')), 'application/javascript'],
    '/static/app.js': ["navigator.serviceWorker.register('/sw.js');", 'application/javascript'],
    '/static/styles.css': ['', 'text/css'],
    '/static/icon.svg': ['<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml'],
    '/static/cat.png': [Buffer.from(PNG_1PX, 'base64'), 'image/png'],
    '/static/manifest.webmanifest': ['{}', 'application/manifest+json'],
  };
  const server = createServer((request, response) => {
    const file = files[new URL(request.url ?? '/', 'http://v1.invalid').pathname];
    if (!file) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-cache' }).end(file[0]);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

test('Real loopback navigation and native service worker control', async ({ page, dhara }) => {
  const { cache, urls } = readPrecache(WEB_DIST);
  expect(urls).toEqual(expect.arrayContaining(['/', '/manifest.webmanifest', '/icon.svg']));
  expect(urls.some((url) => /^\/assets\/.+\.js$/.test(url))).toBe(true);
  expect(urls.some((url) => /^\/assets\/.+\.css$/.test(url))).toBe(true);
  expect(urls.filter((url) => url.endsWith('.otf'))).toHaveLength(4);
  expect(urls).not.toContain('/sw.js');
  expect(urls).not.toContain('/index.html');
  await page.goto(dhara.origin + '/');
  await waitForController(page);
  expect(await page.evaluate(() => caches.keys())).toEqual([cache]);
  const cached = await page.evaluate(async (name) => (await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname).sort(), cache);
  expect(cached).toEqual([...urls].sort());
});

test('offline cold boot serves every route, every precached file and loaded fonts', async ({ dhara }, testInfo) => {
  const { urls } = readPrecache(WEB_DIST);
  const profile = testInfo.outputPath('profile');
  const warm = await chromium.launchPersistentContext(profile);
  const warmClean = await guardContext(warm);
  const first = await warm.newPage();
  await first.goto(dhara.origin + '/');
  await waitForController(first);
  warmClean();
  await warm.close();
  await dhara.kill();

  const cold = await chromium.launchPersistentContext(profile);
  const coldClean = await guardContext(cold);
  try {
    for (const hash of ROUTES) {
      const page = await cold.newPage();
      await page.goto(`${dhara.origin}/${hash}`);
      await shellVisible(page);
      await page.close();
    }
    const page = await cold.newPage();
    await page.goto(dhara.origin + '/');
    await shellVisible(page);
    await expectFontsLoaded(page); // before the fetch loop below, which adds its own resource entries
    const assets = urls.filter((url) => url.startsWith('/assets/')); // every precached JS, CSS and font file
    const statuses = await page.evaluate(async (list) => Promise.all(list.map(async (url) => (await fetch(url)).status)), assets);
    expect(statuses).toEqual(assets.map(() => 200));
    const api = await page.evaluate(async () => {
      try {
        await fetch('/api/health');
        return 'answered';
      } catch {
        return 'network-error';
      }
    });
    expect(api).toBe('network-error'); // /api/ is never answered from the cache
    coldClean();
  } finally {
    await cold.close();
  }
});

test('a 5xx navigation falls back to the cached shell', async ({ page }) => {
  const dist = copyDist();
  const dhara = await startDhara({ distDir: dist });
  try {
    await page.goto(dhara.origin + '/');
    await waitForController(page);
    rmSync(join(dist, 'index.html'));
    expect(await page.evaluate(async () => (await fetch('/')).status)).toBe(503); // non-navigation fetches pass through
    const response = await page.reload();
    expect(response?.status()).toBe(200);
    await shellVisible(page);
  } finally {
    await dhara.stop();
    rmSync(dist, { recursive: true, force: true });
  }
});

test('two consecutive builds purge the older shell cache', async ({ page }) => {
  const dist = copyDist();
  const dhara = await startDhara({ distDir: dist });
  try {
    const before = readPrecache(dist);
    await page.goto(dhara.origin + '/');
    await waitForController(page);
    expect(await page.evaluate(() => caches.keys())).toEqual([before.cache]);

    writeFileSync(join(dist, 'assets', 'extra-AbCd1234.js'), 'export const build = 2;');
    copyFileSync(join(REPO, 'web/public/sw.js'), join(dist, 'sw.js'));
    execFileSync(process.execPath, ['scripts/sw-precache.mjs', dist], { cwd: join(REPO, 'web') });
    const after = readPrecache(dist);
    expect(after.cache).not.toBe(before.cache);

    await page.reload();
    await expect.poll(() => page.evaluate(() => caches.keys()), { timeout: 20_000 }).toEqual([after.cache]);
  } finally {
    await dhara.stop();
    rmSync(dist, { recursive: true, force: true });
  }
});

test('takes over a page controlled by the v1 service worker and deletes noema-shell-v1', async ({ page }) => {   // rename-shim: the v1 worker's cache name
  const { cache } = readPrecache(WEB_DIST);
  const port = await getFreePort();
  const v1 = await serveV1(port);
  let v1Open = true;
  const closeV1 = () =>
    new Promise<void>((resolve) => {
      v1.closeAllConnections();
      v1.close(() => resolve());
    });
  try {
    await page.goto(`http://127.0.0.1:${port}/`);
    await waitForController(page);
    await expect.poll(() => page.evaluate(() => caches.keys())).toContain('noema-shell-v1');   // rename-shim: the v1 worker's cache name
    await page.evaluate(() => caches.open('dhara-shell-stale'));   // an older build of the renamed worker is purged too
    await closeV1();
    v1Open = false;

    const dhara = await startDhara({ port });
    try {
      await page.reload();
      await expect.poll(() => page.evaluate(() => caches.keys()), { timeout: 20_000 }).toEqual([cache]);
      await page.reload();
      await shellVisible(page);
      expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(`${dhara.origin}/sw.js`);
    } finally {
      await dhara.stop();
    }
  } finally {
    if (v1Open) await closeV1();
  }
});
