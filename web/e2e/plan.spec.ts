// web/e2e/plan.spec.ts
import type { Page } from '@playwright/test';
import { expect, gotoApp, test } from './fixtures';
import { agentRun, serverState, task } from './nowSeed';
import type { NoemaServer } from './server';

type Task = { id: string; title: string; status: string; priority: string; version: number };
const getTask = (noema: NoemaServer, id: string) => noema.api<Task>('GET', `/api/tasks/${id}`);
const rows = (page: Page) => page.locator('.plan-list .task-row');
const view = (page: Page, label: string) => page.getByRole('group', { name: 'Task views' }).getByRole('button', { name: label, exact: true });
const priority = (page: Page, title: string) => page.getByRole('combobox', { name: `Priority for ${title}` });
async function setPriority(page: Page, title: string, value: 'auto' | 'high' | 'medium' | 'low') {
  await priority(page, title).selectOption(value);
  await expect(page.locator('.toast-layer')).toContainText('Priority updated.');
}

test.use({ viewport: { width: 1440, height: 960 } });

test('Needs you, Running, Available now and All filter the task list', async ({ page, noema }) => {
  await task(noema, 'Available todo');
  await task(noema, 'Parked idea', { status: 'parked' });
  await task(noema, 'Finished', { status: 'done' });
  await task(noema, 'Review the fix', { status: 'review' });
  await agentRun(noema, await task(noema, 'Agent task'));
  await gotoApp(page, noema, '#/plan');
  await expect(view(page, 'Open')).toHaveAttribute('aria-pressed', 'true');
  await expect(rows(page)).toHaveCount(3);
  await expect(page.locator('.plan-list')).not.toContainText('Parked idea');
  await view(page, 'Needs you').click();
  await expect(rows(page)).toHaveText([/Review the fix/]);
  await view(page, 'Running').click();
  await expect(rows(page)).toHaveText([/Agent task/]);
  await view(page, 'Available now').click();
  await expect(rows(page)).toHaveCount(2);
  await view(page, 'Parked').click();
  await expect(rows(page)).toHaveText([/Parked idea/]);
  await view(page, 'Completed').click();
  await expect(rows(page)).toHaveText([/Finished/]);
  await view(page, 'All').click();
  await expect(rows(page)).toHaveCount(5);
});

test('Plan rows show task, project, state and priority; due date and estimate only when known', async ({ page, noema }) => {
  await task(noema, 'Bare task', { project: 'Learning' });
  await task(noema, 'Dated task', { project: 'Work', due_at: '2030-01-02T09:30:00+00:00', estimate_minutes: 25 });
  await gotoApp(page, noema, '#/plan');
  const bare = rows(page).filter({ hasText: 'Bare task' });
  await expect(bare.locator('.task-title small')).toHaveText('Learning · To do');
  await expect(bare.getByRole('combobox', { name: 'Priority for Bare task' })).toBeVisible();
  const dated = rows(page).filter({ hasText: 'Dated task' });
  await expect(dated.locator('.task-title small')).toContainText('Work · To do');
  await expect(dated.locator('.task-title small')).toContainText('Due ');
  await expect(dated.locator('.task-title small')).toContainText('25 min · your estimate');
  await expect(bare.locator('.task-title small')).not.toContainText(/Due |min/);
});

test('Priority is editable in place and shows its source and reason', async ({ page, noema }) => {
  await task(noema, 'Read the chapter');
  await gotoApp(page, noema, '#/plan');
  const select = priority(page, 'Read the chapter');
  await expect(select.locator('option:checked')).toHaveText('medium · Auto · rules');
  await select.focus();
  await expect(page.getByRole('tooltip')).toHaveText('No explicit urgency; neutral default.');
  await setPriority(page, 'Read the chapter', 'high');
  await expect(select.locator('option:checked')).toHaveText('high · Set by you');
});

test('Manual priority control persists', async ({ page, noema }) => {
  const t = await task(noema, 'Read the chapter');
  await gotoApp(page, noema, '#/plan');
  await setPriority(page, 'Read the chapter', 'low');
  await expect.poll(async () => (await getTask(noema, t.id)).priority).toBe('low');
  expect((await serverState(noema)).tasks[0]).toMatchObject({ priority: 'low' });
});

test('Manual priority persists after reload', async ({ page, noema }) => {
  await task(noema, 'Practice LeetCode');
  await gotoApp(page, noema, '#/plan');
  await setPriority(page, 'Practice LeetCode', 'high');
  await page.reload();
  await expect(priority(page, 'Practice LeetCode').locator('option:checked')).toHaveText('high · Set by you');
});

test('complete and reopen confirm with a toast; parked is not done', async ({ page, noema }) => {
  const t = await task(noema, 'Check duplicate handling');
  await gotoApp(page, noema, '#/plan');
  await page.getByRole('button', { name: 'Complete Check duplicate handling' }).click();
  await expect(page.locator('.toast-layer')).toContainText('Task completed.');
  await expect.poll(async () => (await getTask(noema, t.id)).status).toBe('done');
  await expect(rows(page)).toHaveCount(0);
  await view(page, 'Completed').click();
  await page.getByRole('button', { name: 'Reopen Check duplicate handling' }).click();
  await expect(page.locator('.toast-layer')).toContainText('Task reopened.');
  await expect.poll(async () => (await getTask(noema, t.id)).status).toBe('todo');
  await view(page, 'Parked').click();
  await expect(rows(page)).toHaveCount(0);
});

test('Review result opens the result or session link', async ({ page, noema }) => {
  const t = await task(noema, 'Review the cleanup result');
  await agentRun(noema, t, 'completed', 'https://agent.example/result');
  await gotoApp(page, noema, '#/plan');
  const link = page.getByRole('link', { name: 'Review result ↗' });
  await expect(link).toHaveAttribute('href', 'https://agent.example/result');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.getByRole('button', { name: 'Complete Review the cleanup result' })).toHaveCount(0);
  expect((await getTask(noema, t.id)).status).not.toBe('done');
});

test('a long unbroken title never scrolls the page sideways at 390 px', async ({ page, noema }) => {
  await task(noema, 'x'.repeat(220));
  await gotoApp(page, noema, '#/plan');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
