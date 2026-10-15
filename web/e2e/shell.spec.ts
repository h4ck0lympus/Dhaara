import { failFetch } from './faults';
import { expect, gotoApp, seedLocalDb, test } from './fixtures';

test.use({ viewport: { width: 1440, height: 960 } });

test('Navigation shows Home, Notes and Tasks with matching accessible names', async ({ page, dhara }) => {
  await gotoApp(page, dhara);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link')).toHaveText(['Home', 'Notes', 'Tasks']);
  await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('link', { name: 'Tasks' }).click();
  await expect(page).toHaveURL(/#\/plan$/);
  await expect(nav.getByRole('link', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 1, name: 'Tasks' })).toBeVisible();
  await nav.getByRole('link', { name: 'Notes' }).click();
  await expect(page).toHaveURL(/#\/notes$/);
  await expect(page.getByRole('complementary', { name: 'Folders' })).toBeVisible();
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/notes$/);
});

test('n opens New task only outside fields; / focuses search; Ctrl+K opens capture on Home', async ({ page, dhara }) => {
  await gotoApp(page, dhara, '#/plan');
  await page.keyboard.press('n');
  const add = page.getByRole('dialog', { name: 'Add task' });
  await expect(add).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(add).toHaveCount(0);
  await page.evaluate(() => { const probe = document.createElement('input'); probe.id = 'probe'; probe.setAttribute('aria-label', 'Probe'); document.body.append(probe); });
  await page.locator('#probe').focus();
  await page.keyboard.press('n');
  await page.keyboard.press('/');
  await expect(page.locator('#probe')).toHaveValue('n/');
  await expect(add).toHaveCount(0);
  await page.locator('#probe').blur();
  await page.keyboard.press('/');
  await expect(page.getByRole('searchbox', { name: 'Search notes' })).toBeFocused();
  await page.keyboard.type('heap');
  await expect(page).toHaveURL(/#\/notes\?q=heap$/);
  await page.keyboard.press('Control+k');
  await expect(page).toHaveURL(/#\/overview$/);
  await expect(page.getByLabel('Rough learning note')).toBeFocused();
});

test('the theme follows the workspace setting, including System', async ({ page, dhara }) => {
  await gotoApp(page, dhara, '#/settings');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  const appearance = page.getByRole('group', { name: 'Appearance' });
  await appearance.getByRole('button', { name: 'Light' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(246, 245, 242)');
  await expect.poll(async () => (await dhara.api<{ settings: { theme: string } }>('GET', '/api/state')).settings.theme).toBe('light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await appearance.getByRole('button', { name: 'System' }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
});

test('the status line reports offline in words and recovers', async ({ page, dhara, context }) => {
  await gotoApp(page, dhara);
  await context.setOffline(true);
  await expect(page.locator('#connection-label')).toHaveText('Offline · local drafts');
  await expect(page.locator('.offline-banner')).toContainText('Server disconnected.');
  await context.setOffline(false);
  await expect(page.locator('#connection-label')).toHaveText('Server connected');
  await expect(page.locator('.offline-banner')).toHaveCount(0);
});

test('queued captures show in the shell as "on this device"', async ({ page, dhara }) => {
  await seedLocalDb(page, dhara.origin, { outbox: [{ id: '0f8fad5b-d9cb-469f-a165-70867728950e', raw: 'Queued thought', task_id: '', files: [] }] });
  await failFetch(page, { path: '/api/captures', fault: { status: 503, body: '{"detail":"Injected outage"}', contentType: 'application/json' } });
  await gotoApp(page, dhara);
  await expect(page.getByRole('button', { name: '1 capture on this device' })).toBeVisible();
});

test('the greeting uses the display name and omits an empty one', async ({ page, dhara }) => {
  await gotoApp(page, dhara);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Good (morning|afternoon|evening)\.$/);
  await dhara.api('PATCH', '/api/settings', { display_name: 'vishal' });
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Good (morning|afternoon|evening), vishal\.$/);
});

test('Every control is keyboard reachable with a visible focus ring', async ({ page, dhara }) => {
  await dhara.api('POST', '/api/tasks', { title: 'Read the ownership chapter' });
  await gotoApp(page, dhara);
  const seen = new Set<string>();
  const readFocused = () => page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const style = getComputedStyle(el.closest('.site-search') ?? el);
    return { name: el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.textContent?.trim() || el.tagName, ring: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2 };
  });
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press('Tab');
    const focused = await readFocused();
    if (!focused) continue;
    await expect.poll(async () => (await readFocused())?.ring ?? false, { message: `visible focus ring on ${focused.name}` }).toBe(true);
    seen.add(focused.name);
  }
  for (const name of ['Home', 'Notes', 'Tasks', 'Search notes…  /', 'Notifications', 'Complete Read the ownership chapter', 'Read the ownership chapter', 'See all →', 'Settings']) expect(seen.has(name), name).toBe(true);
  expect([...seen].some(name => name.startsWith('Capture a thought…')), 'Capture a thought…').toBe(true);
});

test('Open desktop panel becomes a modal on resize; narrow dialog traps Tab and Escape closes', async ({ page, dhara }) => {
  await page.setViewportSize({ width: 1546, height: 835 });
  await gotoApp(page, dhara, '#/plan');
  await page.getByRole('button', { name: /New task/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Add task' });
  expect(await dialog.evaluate(d => d.matches(':modal'))).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await dialog.evaluate(d => d.matches(':modal'))).toBe(true);
  for (let i = 0; i < 14; i += 1) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(d => document.activeElement === document.body || d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
