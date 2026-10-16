import { chromium, type Locator, type Page } from '@playwright/test';
import { COPY } from '../src/copy';
import { expect, gotoApp, test } from './fixtures';
import { E2E_TOKEN, startDhara } from './server';

test('the bare origin opens Overview', async ({ page, dhara }) => {
  await page.goto(dhara.origin + '/');
  await expect(page).toHaveURL(/#\/overview$/);
  await expect(page.locator('.app')).toHaveAttribute('data-connection', 'online');
});

test('loopback boot logs in automatically and never shows Unlock', async ({ page, dhara }) => {
  await gotoApp(page, dhara);
  await expect(page.getByRole('dialog', { name: 'Unlock Dhara' })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Good (morning|afternoon|evening)\.$/);
  await expect(page.getByRole('region', { name: 'Current focus' })).toBeVisible();
});

const LEGACY: [string, string, (page: Page) => Locator][] = [
  ['#plan', '#/plan', page => page.getByRole('heading', { level: 1, name: COPY.plan.title })],
  ['#capture', '#/capture', page => page.getByRole('heading', { level: 1, name: COPY.capture.title })],
  ['#notes', '#/notes', page => page.getByRole('complementary', { name: 'Folders' })],
  ['#note/abc', '#/notes?note=abc', page => page.getByRole('heading', { level: 1, name: 'Note unavailable' })],
  ['#settings', '#/settings', page => page.getByRole('heading', { level: 1, name: 'Settings' })],
];

for (const [legacy, modern, landmark] of LEGACY) {
  test(`legacy ${legacy} is rewritten on boot`, async ({ page, dhara }) => {
    await page.goto(dhara.origin + '/' + legacy);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(modern);
    await expect(landmark(page)).toBeVisible();
  });
}

test('legacy hashes are rewritten on every hashchange', async ({ page, dhara }) => {
  await gotoApp(page, dhara);
  await page.evaluate(() => { location.hash = '#plan'; });
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/plan');
  await expect(page.getByRole('heading', { level: 1, name: COPY.plan.title })).toBeVisible();
  await page.evaluate(() => { location.hash = '#overview'; });
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/overview');
});

test('a non-loopback host shows Unlock; a wrong token stays inline; the cookie alone skips Unlock later', async () => {
  const server = await startDhara({ env: { DHARA_ALLOWED_HOSTS: 'dhara.test' } });
  const origin = `http://dhara.test:${server.port}`;
  const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP dhara.test 127.0.0.1'] });
  try {
    const page = await browser.newPage();
    await page.goto(origin + '/#/overview');
    const unlock = page.getByRole('dialog', { name: 'Unlock Dhara' });
    await expect(unlock).toBeVisible();
    await expect(page.locator('.app')).toHaveAttribute('data-connection', 'offline');
    await unlock.getByLabel('Access token').fill('not-the-token-0123456789');
    await unlock.getByRole('button', { name: 'Unlock' }).click();
    await expect(unlock.getByRole('alert')).toHaveText('Invalid access token');
    await unlock.getByLabel('Access token').fill(E2E_TOKEN);
    await unlock.getByRole('button', { name: 'Unlock' }).click();
    await expect(unlock).toHaveCount(0);
    await expect(page.locator('.app')).toHaveAttribute('data-connection', 'online');
    await page.reload();
    await expect(page.locator('.app')).toHaveAttribute('data-connection', 'online');
    await expect(page.getByRole('dialog', { name: 'Unlock Dhara' })).toHaveCount(0);
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('a startup failure shows the fallback instead of a blank page (app.js:616)', async ({ page, dhara }) => {
  await page.addInitScript(() => { history.replaceState = () => { throw new Error('Injected startup failure'); }; });
  await page.goto(dhara.origin + '/#plan');
  await expect(page.getByText('Could not open the workspace. Check the server and reload.')).toBeVisible();
});

test('a lazily loaded route opens offline from the service-worker cache', async ({ page, dhara, context }) => {
  await gotoApp(page, dhara);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.locator('.app')).toHaveAttribute('data-connection', 'online');
  await context.setOffline(true);
  await page.evaluate(() => { location.hash = '#/note/x'; });
  await expect(page.getByRole('heading', { level: 1, name: 'Note unavailable' })).toBeVisible();
});
