// spec §8 "Refetch: an edit in progress survives a snapshot refetch."
import type { Page } from '@playwright/test';
import { TASK_EDIT_FIELDS } from '../src/domain/tasks';
import { expect, gotoApp, test } from './fixtures';
import { task } from './nowSeed';

async function refetchSnapshot(page: Page) {
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/state' && r.ok());
  await page.evaluate(() => window.dispatchEvent(new Event('noema:service-up')));
  await response;
}

test('an edit in progress survives a snapshot refetch', async ({ page, noema }) => {
  const t = await task(noema, 'Shared task');
  await gotoApp(page, noema, '#/plan');
  await page.getByRole('button', { name: /^Shared task/ }).click();
  await page.getByRole('dialog', { name: 'Shared task' }).getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit task' });
  await editor.getByLabel('Title', { exact: true }).fill('Half-typed title');
  const fresh = await noema.api<Record<string, unknown>>('GET', `/api/tasks/${t.id}`);
  await noema.api('PUT', `/api/tasks/${t.id}`, { ...Object.fromEntries(TASK_EDIT_FIELDS.map(k => [k, fresh[k]])), next_action: 'Changed on another device', expected_version: fresh.version });
  await refetchSnapshot(page);
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel('Title', { exact: true })).toHaveValue('Half-typed title');
});

test('Add task input survives a snapshot refetch', async ({ page, noema }) => {
  await gotoApp(page, noema, '#/plan');
  await page.locator('.page-heading').getByRole('button', { name: 'Add task' }).click();
  const add = page.getByRole('dialog', { name: 'Add task' });
  await add.getByLabel('What do you need to do?').fill('Half-typed task');
  await task(noema, 'Created elsewhere');
  await refetchSnapshot(page);
  await expect(page.locator('.plan-list')).toContainText('Created elsewhere');
  await expect(add.getByLabel('What do you need to do?')).toHaveValue('Half-typed task');
});
