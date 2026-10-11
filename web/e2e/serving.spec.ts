import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, expectFontsLoaded, test } from './fixtures';
import { startNoema, WEB_DIST } from './server';

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
  const inherited = process.env.NOEMA_MODEL;
  process.env.NOEMA_MODEL = 'inherited-model-must-be-stripped';
  const noema = await startNoema().finally(() => {
    if (inherited === undefined) delete process.env.NOEMA_MODEL;
    else process.env.NOEMA_MODEL = inherited;
  });
  try {
    const state = await noema.api<StateBody>('GET', '/api/state');
    expect(state.capabilities).toMatchObject({ organizer: false, speech: false, screen_pixels: false });
    expect(state.settings).toMatchObject({ observation_enabled: false, motion: false, display_name: '' });
  } finally {
    await noema.stop();
  }
});
