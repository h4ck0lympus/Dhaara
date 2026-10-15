import type { Page } from '@playwright/test';
import { runSql } from './db';
import { expect, gotoApp, refetch, test } from './fixtures';
import { serverState, task } from './nowSeed';
import type { DharaServer } from './server';

type Shown = { title: string; body?: string; tag?: string; icon?: string };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('dhara-notifications', '1');
    const shown: unknown[] = [];
    (window as unknown as { __shown: unknown[] }).__shown = shown;
    class FakeNotification {
      static permission = 'granted';
      static requestPermission = async () => 'granted';
      constructor(title: string, options: NotificationOptions = {}) { shown.push({ title, ...options }); }
    }
    Object.defineProperty(window, 'Notification', { value: FakeNotification, configurable: true, writable: true });
  });
});

const shown = (page: Page) => page.evaluate(() => (window as unknown as { __shown: Shown[] }).__shown);
async function dueReminder(dhara: DharaServer, title: string) {
  const t = await task(dhara, title);
  const reminder = await dhara.api<{ id: string }>('POST', '/api/reminders', { task_id: t.id, at: new Date(Date.now() - 60_000).toISOString() });
  return { t, reminder };
}

test('a due reminder notifies once per page session, tagged with its id and the hashed icon', async ({ page, dhara }) => {
  const { reminder } = await dueReminder(dhara, 'Revisit the allocator');
  await gotoApp(page, dhara);
  await expect.poll(async () => (await shown(page)).length).toBe(1);
  const [first] = await shown(page);
  expect(first).toMatchObject({ title: 'Dhara reminder', body: 'Revisit the allocator', tag: reminder.id });
  expect(first.icon).toMatch(/\/assets\/icon-[A-Za-z0-9_-]{8}\.svg$/);
  await refetch(page);
  await refetch(page);
  expect(await shown(page)).toHaveLength(1);
});

test('scheduled reminders never notify', async ({ page, dhara }) => {
  const t = await task(dhara, 'Later work');
  await dhara.api('POST', '/api/reminders', { task_id: t.id, at: '2030-01-02T09:30:00+00:00' });
  await gotoApp(page, dhara);
  await refetch(page);
  expect(await shown(page)).toHaveLength(0);
});

test('snoozing a reminder re-arms its notification', async ({ page, dhara }) => {
  const { reminder } = await dueReminder(dhara, 'Revisit the allocator');
  await gotoApp(page, dhara, '#/plan');
  await expect.poll(async () => (await shown(page)).length).toBe(1);
  await page.getByRole('button', { name: /^Revisit the allocator/ }).click();
  await page.getByRole('dialog', { name: 'Revisit the allocator' }).getByRole('button', { name: '+20 min' }).click();
  await expect(page.locator('.toast-layer')).toContainText('Reminder moved forward by 20 minutes.');
  runSql(dhara.dataDir, 'UPDATE reminders SET at=? WHERE id=?', [new Date(Date.now() - 60_000).toISOString(), reminder.id]);
  await refetch(page);
  await expect.poll(async () => (await shown(page)).length).toBe(2);
  expect((await serverState(dhara)).reminders.map(r => r.state)).toEqual(['due']);
});
