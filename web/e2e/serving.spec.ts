import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { expect, expectFontsLoaded, guardContext, test } from './fixtures';
import { E2E_TOKEN, startNoema, WEB_DIST } from './server';

type StateBody = {
  capabilities: { organizer: boolean; speech: boolean; screen_pixels: boolean };
  settings: { observation_enabled: boolean; motion: boolean; display_name: string };
};

test('serves the built shell with no inline script and no CSP violation', async ({ page, noema }) => {
  const response = await page.goto(noema.origin + '/');
  expect(response?.status()).toBe(200);
  expect(response?.headers()['content-security-policy']).toContain("script-src 'self'");
  await expect(page.locator('#root [data-quiet]').first()).toBeVisible();
  expect(await page.locator('script:not([src])').count()).toBe(0);
});

test('hashed assets are immutable, shell files revalidate and v1 paths are gone', async ({ request, noema }) => {
  const assets = readdirSync(join(WEB_DIST, 'assets'));
  expect(assets.length).toBeGreaterThan(0);
  for (const name of assets) {
    const response = await request.get(`${noema.origin}/assets/${name}`);
    expect(response.status(), name).toBe(200);
    expect(response.headers()['cache-control'], name).toBe('public, max-age=31536000, immutable');
  }
  for (const path of ['/', '/sw.js', '/manifest.webmanifest', '/icon.svg']) {
    const response = await request.get(noema.origin + path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()['cache-control'], path).toBe('no-cache');
  }
  expect((await request.get(noema.origin + '/sw.js')).headers()['service-worker-allowed']).toBe('/');
  const manifest = await (await request.get(noema.origin + '/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ id: '/', start_url: '/', scope: '/', icons: [{ src: '/icon.svg' }] });
  for (const path of ['/static/app.js', '/companion', '/index.html', '/assets/missing-AbCd1234.js']) {
    expect((await request.get(noema.origin + path)).status(), path).toBe(404);
  }
});

test('fonts load from content-hashed asset URLs', async ({ page, noema }) => {
  await page.goto(noema.origin + '/');
  await expectFontsLoaded(page);
});

test('base app runs with no model and capture disabled by default', async () => {
  const inherited = process.env.NOEMA_MODEL;   // rename-shim: an inherited legacy name must be stripped too
  process.env.NOEMA_MODEL = 'inherited-model-must-be-stripped';   // rename-shim: an inherited legacy name must be stripped too
  const noema = await startNoema().finally(() => {
    if (inherited === undefined) delete process.env.NOEMA_MODEL;   // rename-shim: an inherited legacy name must be stripped too
    else process.env.NOEMA_MODEL = inherited;   // rename-shim: an inherited legacy name must be stripped too
  });
  try {
    const state = await noema.api<StateBody>('GET', '/api/state');
    expect(state.capabilities).toMatchObject({ organizer: false, speech: false, screen_pixels: false });
    expect(state.settings).toMatchObject({ observation_enabled: false, motion: false, display_name: '' });
  } finally {
    await noema.stop();
  }
});

// A phone or tablet on the LAN: plain HTTP, a non-loopback Host and only the session cookie (spec §8 "Cookie-only access").
test('a non-loopback Host with only a valid cookie reaches the shell and the API', async () => {
  const noema = await startNoema({ env: { NOEMA_ALLOWED_HOSTS: 'noema.test' } });
  const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP noema.test 127.0.0.1'] });
  try {
    const origin = `http://noema.test:${noema.port}`;
    const context = await browser.newContext();
    await context.addCookies([{ name: 'noema_session', value: E2E_TOKEN, url: origin, httpOnly: true, sameSite: 'Strict' }]);
    const assertClean = await guardContext(context); // this context is outside the auto fixtures
    const page = await context.newPage();
    const sessionCalls: string[] = [];
    const stateStatuses: number[] = [];
    page.on('response', (response) => {
      const path = new URL(response.url()).pathname;
      if (path === '/api/session') sessionCalls.push(response.request().method());
      if (path === '/api/state') stateStatuses.push(response.status());
    });
    await page.goto(origin + '/');
    await expect(page.locator('#root [data-quiet]').first()).toBeVisible();
    expect(await page.evaluate(() => ({ secure: window.isSecureContext, worker: 'serviceWorker' in navigator }))).toEqual({ secure: false, worker: false });
    await expect.poll(() => stateStatuses[0]).toBe(200); // the app's own boot request used the cookie
    expect(stateStatuses).not.toContain(401);
    expect(sessionCalls).toEqual([]);
    assertClean();
  } finally {
    await browser.close();
    await noema.stop();
  }
});
