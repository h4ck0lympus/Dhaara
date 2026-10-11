// web/e2e/shell.spec.ts
import { COPY } from '../src/copy';
import { failFetch } from './faults';
import { expect, gotoApp, seedLocalDb, test } from './fixtures';

test.use({ viewport: { width: 1440, height: 960 } });

test('Navigation shows Overview, Capture, Notes and Tasks with matching accessible names', async ({ page, noema }) => {
  await gotoApp(page, noema);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link')).toHaveText(['Overview', 'Capture', 'Notes', 'Tasks']);
  for (const name of ['Overview', 'Capture', 'Notes', 'Tasks']) await expect(nav.getByRole('link', { name, exact: true })).toHaveCount(1);
  await nav.getByRole('link', { name: 'Tasks' }).click();
  await expect(page).toHaveURL(/#\/plan$/);
  await expect(nav.getByRole('link', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 1, name: COPY.plan.title })).toBeVisible();
});

test('Desktop sidebar collapses to icons and stays collapsed after reload', async ({ page, noema }) => {
  await gotoApp(page, noema);
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  const sidebar = page.locator('.sidebar');
  await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
  expect((await sidebar.boundingBox())!.width).toBeLessThanOrEqual(65);
  await expect(page.getByRole('link', { name: 'Overview', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('#connection-label')).toHaveText('Server connected');
  await expect(page.locator('.sidebar')).toHaveAttribute('data-collapsed', 'true');
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(page.locator('.sidebar')).toHaveAttribute('data-collapsed', 'false');
});

test('n opens Capture only outside fields; Ctrl+K opens Notes', async ({ page, noema }) => {
  await gotoApp(page, noema);
  await page.keyboard.press('n');
  await expect(page).toHaveURL(/#\/capture$/);
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Overview' }).click();
  // Test-only probe field: typing in any field must not navigate.
  await page.evaluate(() => { const probe = document.createElement('input'); probe.id = 'probe'; probe.setAttribute('aria-label', 'Probe'); document.body.append(probe); });
  await page.locator('#probe').focus();
  await page.keyboard.press('n');
  await expect(page).toHaveURL(/#\/overview$/);
  await expect(page.locator('#probe')).toHaveValue('n');
  await page.locator('#probe').blur();
  await page.keyboard.press('Control+k');
  await expect(page).toHaveURL(/#\/notes$/);
});

test('the status line reports offline in words and recovers', async ({ page, noema, context }) => {
  await gotoApp(page, noema);
  await context.setOffline(true);
  await expect(page.locator('#connection-label')).toHaveText('Offline · local drafts');
  await expect(page.getByText('Status unavailable', { exact: true })).toBeVisible();
  await expect(page.locator('.offline-banner')).toContainText('Server disconnected.');
  await context.setOffline(false);
  await expect(page.locator('#connection-label')).toHaveText('Server connected');
  await expect(page.locator('.offline-banner')).toHaveCount(0);
});

test('queued captures show in the shell as "on this device"', async ({ page, noema }) => {
  await seedLocalDb(page, noema.origin, { outbox: [{ id: '0f8fad5b-d9cb-469f-a165-70867728950e', raw: 'Queued thought', task_id: '', files: [] }] });
  await failFetch(page, { path: '/api/captures', fault: { status: 503, body: '{"detail":"Injected outage"}', contentType: 'application/json' } });
  await gotoApp(page, noema);
  await expect(page.getByRole('button', { name: '1 capture on this device' })).toBeVisible();
});

test('the avatar shows the display-name initial and is hidden without a name', async ({ page, noema }) => {
  await gotoApp(page, noema);
  await expect(page.locator('.profile-button .avatar')).toHaveCount(0);
  await noema.api('PATCH', '/api/settings', { display_name: 'vishal' });
  await page.reload();
  await expect(page.locator('.profile-button .avatar')).toHaveText('V');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Good (morning|afternoon|evening), vishal\.$/);
});

test('Every control is keyboard reachable with a visible focus ring', async ({ page, noema }) => {
  await noema.api('POST', '/api/tasks', { title: 'Read the ownership chapter' });
  await gotoApp(page, noema);
  const seen = new Set<string>();
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      return { name: el.getAttribute('aria-label') || el.textContent?.trim() || el.tagName, ring: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2 };
    });
    if (!focused) continue;
    expect(focused.ring, `visible focus ring on ${focused.name}`).toBe(true);
    seen.add(focused.name);
  }
  for (const name of ['Collapse sidebar', 'Overview', 'Capture', 'Notes', 'Tasks', 'Settings', 'Available time', 'Start']) expect(seen.has(name), name).toBe(true);
});

test('Open desktop panel becomes a modal on resize; narrow dialog traps Tab and Escape closes', async ({ page, noema }) => {
  await page.setViewportSize({ width: 1546, height: 835 });
  await gotoApp(page, noema, '#/plan');
  await page.locator('.page-heading').getByRole('button', { name: 'Add task' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add task' });
  expect(await dialog.evaluate(d => d.matches(':modal'))).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await dialog.evaluate(d => d.matches(':modal'))).toBe(true);
  for (let i = 0; i < 14; i += 1) {
    await page.keyboard.press('Tab');
    // The background is inert: focus is inside the dialog or nowhere (headless has no browser chrome), never behind it.
    expect(await dialog.evaluate(d => document.activeElement === document.body || d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
