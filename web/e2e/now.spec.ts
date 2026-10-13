import { expect, gotoApp, test } from './fixtures';
import { KINDS, noHorizontalOverflow, openKind, serverState, task, agentRun, ageRun } from './nowSeed';

for (const kind of KINDS) {
  for (const [label, size] of [['desktop', { width: 1440, height: 960 }], ['mobile', { width: 390, height: 844 }]] as const) {
    test(`${kind} / ${label} has a usable bounded Overview`, async ({ page, context, dhara }) => {
      await page.setViewportSize(size);
      await openKind(page, context, dhara, kind);
      expect(await noHorizontalOverflow(page)).toBe(true);
      await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link')).toHaveText(['Overview', 'Tasks']);
      expect(await page.getByRole('region', { name: 'Available next' }).locator('.preview-row').count()).toBeLessThanOrEqual(3);
      expect(await page.getByRole('region', { name: 'Needs attention' }).locator('.preview-row').count()).toBeLessThanOrEqual(2);
      if (kind === 'disconnected') {
        await expect(page.getByRole('region', { name: 'Running' }).locator('.preview-row')).toHaveCount(0);
        await expect(page.getByRole('region', { name: 'Available next' }).locator('.preview-row')).toHaveCount(0);
        await expect(page.getByText('Last known · Selected by you')).toBeVisible();
      }
    });
  }
}

test('attention and stale status are honest and open the associated task', async ({ page, dhara }) => {
  const t = await task(dhara, 'Inspect parser result');
  const run = await agentRun(dhara, t);
  ageRun(dhara, run.id);
  await gotoApp(page, dhara);
  const attention = page.getByRole('region', { name: 'Needs attention' });
  await expect(attention).toContainText('No recent updates');
  await attention.getByRole('button', { name: /Inspect parser result/ }).click();
  await expect(page.getByRole('dialog', { name: 'Inspect parser result' })).toBeVisible();
  expect((await serverState(dhara)).tasks[0].status).not.toBe('done');
});

test('clearing a pinned focus requires confirmation', async ({ page, dhara }) => {
  const t = await task(dhara, 'Pinned work');
  await dhara.api('POST', '/api/focus', { task_id: t.id, pinned: true });
  await gotoApp(page, dhara);
  page.once('dialog', dialog => void dialog.dismiss());
  await page.getByRole('button', { name: 'Unpin & clear' }).click();
  expect((await serverState(dhara)).focus?.task_id).toBe(t.id);
  page.once('dialog', dialog => void dialog.accept());
  await page.getByRole('button', { name: 'Unpin & clear' }).click();
  await expect(page.getByText('Choose a task when you’re ready.')).toBeVisible();
});
