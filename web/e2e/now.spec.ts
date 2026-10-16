import type { Page } from '@playwright/test';
import { expect, gotoApp, test } from './fixtures';
import { KINDS, noHorizontalOverflow, openKind, serverState, task, agentRun, ageRun, note, ready, seed } from './nowSeed';

const fewMinutes = (page: Page) => page.getByRole('region', { name: 'If you have a few minutes' });
const homeTasks = (page: Page) => page.getByRole('region', { name: 'Today' });
const needsYou = (page: Page) => page.getByRole('region', { name: 'Needs you' });
const agentStrip = (page: Page) => page.getByRole('button', { name: /^Agents:/ });
const openAgents = (page: Page) => agentStrip(page).click();
const toTasks = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Tasks' }).click();

for (const kind of KINDS) {
  for (const [label, size] of [['desktop', { width: 1440, height: 960 }], ['mobile', { width: 390, height: 844 }]] as const) {
    test(`${kind} / ${label} has a usable bounded Home`, async ({ page, context, dhara }) => {
      await page.setViewportSize(size);
      await openKind(page, context, dhara, kind);
      expect(await noHorizontalOverflow(page)).toBe(true);
      await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link')).toHaveText(['Home', 'Notes', 'Tasks']);
      expect(await page.locator('.home-row').count()).toBeLessThanOrEqual(3);
      await expect(homeTasks(page)).toBeVisible();
      if (kind === 'disconnected') {
        await expect(agentStrip(page)).toHaveCount(0);
        await expect(fewMinutes(page)).toHaveCount(0);
        await expect(page.getByText('Last known · Selected by you', { exact: false })).toBeVisible();
      }
    });
  }
}

test('attention and stale status are honest and open the associated task', async ({ page, dhara }) => {
  const t = await task(dhara, 'Inspect parser result');
  const run = await agentRun(dhara, t);
  ageRun(dhara, run.id);
  await gotoApp(page, dhara);
  await expect(agentStrip(page)).toHaveAccessibleName('Agents: 1 need you, 0 working');
  await openAgents(page);
  await expect(needsYou(page)).toContainText('No recent updates · Check status');
  await expect(page.getByRole('list', { name: 'Agents working' })).toHaveCount(0);
  await needsYou(page).getByRole('button', { name: 'Open' }).click();
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

test('Empty workspace has no agent setup or all-complete claim', async ({ page, context, dhara }) => {
  await openKind(page, context, dhara, 'new');
  await expect(page.getByRole('button', { name: 'Set up agent reporting' })).toHaveCount(0);
  await expect(page.getByText('All tracked work')).toHaveCount(0);
  await note(dhara, 'Learning note: I am unsure about ownership. Not a commitment.');
  await page.reload();
  await ready(page, 'notes-only');
  expect((await serverState(dhara)).tasks).toHaveLength(0);
});

test('Inferred focus is separately labeled', async ({ page, context, dhara }) => {
  await openKind(page, context, dhara, 'available');
  const chosen = (await serverState(dhara)).tasks.find(t => t.title === 'Study allocator cleanup')!;
  await dhara.api('PATCH', '/api/settings', { observation_enabled: true });
  await dhara.api('POST', '/api/context/rules', { app: 'dhara-fixture', task_id: chosen.id });
  await dhara.api('POST', '/api/context', { app: 'dhara-fixture', title: 'Fixture window metadata' });
  await page.reload();
  await expect(page.getByRole('region', { name: 'Current focus' })).toContainText('Inferred from window metadata');
});

test('Observer metadata never overrides a pinned focus', async ({ page, context, dhara }) => {
  await openKind(page, context, dhara, 'available');
  const tasks = (await serverState(dhara)).tasks;
  const chosen = tasks.find(t => t.title === 'Study allocator cleanup')!;
  const pinned = tasks.find(t => t.title === 'Read the ownership chapter')!;
  await dhara.api('PATCH', '/api/settings', { observation_enabled: true });
  await dhara.api('POST', '/api/context/rules', { app: 'dhara-fixture', task_id: chosen.id });
  await dhara.api('POST', '/api/focus', { task_id: pinned.id, pinned: true });
  await dhara.api('POST', '/api/context', { app: 'dhara-fixture', title: 'Fixture window metadata' });
  await page.reload();
  await expect(page.getByRole('region', { name: 'Current focus' })).toContainText('Pinned by you');
  expect((await serverState(dhara)).focus).toMatchObject({ task_id: pinned.id, pinned: true });
});

test('Completed agent result is still a review task, not completed work', async ({ page, context, dhara }) => {
  await openKind(page, context, dhara, 'attention');
  const state = await serverState(dhara);
  expect(state.runs.some(r => r.status === 'review')).toBe(true);
  expect(state.tasks.every(t => t.status !== 'done')).toBe(true);
  await expect(page.getByRole('button', { name: /^Complete Review the cleanup result/ })).toHaveCount(0);
});

test('Empty, waiting, review and offline/unknown fixture states rendered', async ({ page, context, dhara }) => {
  await gotoApp(page, dhara);
  await ready(page, 'new');
  expect(await noHorizontalOverflow(page)).toBe(true);
  await seed(dhara, 'waiting');
  await page.reload();
  await ready(page, 'waiting');
  expect(await noHorizontalOverflow(page)).toBe(true);
  const waiting = (await serverState(dhara)).runs[0];
  await dhara.api('POST', `/api/runs/${waiting.id}/events`, { event_id: crypto.randomUUID(), seq: 2, kind: 'completed', message: 'Fixture result.' });
  await page.reload();
  await ready(page, 'attention');
  expect(await noHorizontalOverflow(page)).toBe(true);
  await openAgents(page);
  await expect(needsYou(page).getByText('A result is ready for your review.').first()).toBeVisible();
  await context.setOffline(true);
  await ready(page, 'disconnected');
  expect(await noHorizontalOverflow(page)).toBe(true);
});

test('Opening a task from Home cannot silently replace pinned focus', async ({ page, context, dhara }) => {
  await openKind(page, context, dhara, 'available');
  const pinned = (await serverState(dhara)).tasks.find(t => t.title === 'Read the ownership chapter')!;
  await dhara.api('POST', '/api/focus', { task_id: pinned.id, pinned: true });
  await page.reload();
  await expect(page.getByRole('region', { name: 'Current focus' })).toContainText(pinned.title);
  await page.getByRole('button', { name: 'Continue the two-pointer exercise', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Continue the two-pointer exercise' })).toBeVisible();
  expect((await serverState(dhara)).focus).toMatchObject({ task_id: pinned.id, pinned: true });
});

test('Declining explicit pinned replacement preserves focus', async ({ page, context, dhara }) => {
  await openKind(page, context, dhara, 'available');
  const pinned = (await serverState(dhara)).tasks.find(t => t.title === 'Read the ownership chapter')!;
  await dhara.api('POST', '/api/focus', { task_id: pinned.id, pinned: true });
  await page.reload();
  await page.getByRole('button', { name: 'Continue the two-pointer exercise', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Continue the two-pointer exercise' });
  page.once('dialog', d => { expect(d.message()).toBe('Replace your pinned focus with this task?'); void d.dismiss(); });
  await detail.getByRole('button', { name: 'Focus on this' }).click();
  await expect(detail).toBeVisible();
  expect((await serverState(dhara)).focus).toMatchObject({ task_id: pinned.id, pinned: true });
});

test('Human-attention action opens the real task/result details', async ({ page, context, dhara }) => {
  await openKind(page, context, dhara, 'attention');
  await openAgents(page);
  await needsYou(page).getByRole('button', { name: /Review the cleanup result/ }).click();
  await expect(page.getByRole('dialog', { name: 'Review the cleanup result' })).toContainText('Fixture command wrapper');
});

test('Keyboard task entry from Home reveals the new task without jumping the viewport', async ({ page, dhara }) => {
  await task(dhara, 'Read the ownership chapter');
  await gotoApp(page, dhara);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.keyboard.press('n');
  const add = page.getByRole('dialog', { name: 'Add task' });
  await add.getByLabel('What do you need to do?').fill('Check the cleanup path');
  await add.getByRole('button', { name: 'Add task' }).click();
  await expect(page.locator('.toast-layer')).toContainText('Task added.');
  await page.keyboard.press('Escape');
  await expect(add).toHaveCount(0);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await expect(fewMinutes(page)).toContainText('Check the cleanup path');
  await expect(homeTasks(page)).not.toContainText('Check the cleanup path');
});

test('Saved task is visible and reopenable from Home after reload; pin is preserved', async ({ page, dhara }) => {
  const pinned = await task(dhara, 'Study allocator cleanup');
  await dhara.api('POST', '/api/focus', { task_id: pinned.id, pinned: true });
  await gotoApp(page, dhara);
  await page.keyboard.press('n');
  const add = page.getByRole('dialog', { name: 'Add task' });
  await add.getByLabel('What do you need to do?').fill('Practice LeetCode');
  await add.getByLabel('What do you need to do?').press('Control+Enter');
  await expect(page.locator('.toast-layer')).toContainText('Task added.');
  await page.reload();
  await expect(fewMinutes(page).getByRole('button')).toHaveText(['Practice LeetCode']);
  await fewMinutes(page).getByRole('button', { name: 'Practice LeetCode', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Practice LeetCode' })).toContainText('Practice LeetCode');
  expect((await serverState(dhara)).focus).toMatchObject({ task_id: pinned.id, pinned: true });
  await expect(page.getByRole('region', { name: 'Current focus' })).toContainText('Pinned by you');
});

test('Agent setup creates a real task-scoped token', async ({ page, context, dhara }) => {
  await openKind(page, context, dhara, 'available');
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByText('Advanced: agent & observer tokens').click();
  await page.getByLabel('Label').fill('Isolated UI token');
  const first = (await serverState(dhara)).tasks[0];
  await page.getByLabel('Allowed tasks · agent tokens').selectOption([first.id]);
  await page.getByRole('button', { name: 'Create token' }).click();
  await expect(page.locator('.token-value')).toHaveText(/\S{20,}/);
  await expect.poll(async () => (await dhara.api<{ name: string; scope: string }[]>('GET', '/api/tokens')).map(t => [t.name, t.scope])).toEqual([['Isolated UI token', 'agent']]);
});

test('No duration, deadline or progress is fabricated', async ({ page, dhara }) => {
  await task(dhara, 'Work without estimates');
  await gotoApp(page, dhara);
  const row = fewMinutes(page).getByRole('button');
  await expect(row).toHaveText('Work without estimates');
  await expect(row.locator('small')).toHaveCount(0);
  await expect(homeTasks(page).locator('.task-row')).toHaveCount(0);
  await expect(page.getByText(/% done|progress/i)).toHaveCount(0);
});

test('Zero running agents does not erase a reported question', async ({ page, context, dhara }) => {
  await openKind(page, context, dhara, 'attention');
  await openAgents(page);
  await expect(page.getByRole('list', { name: 'Agents working' })).toHaveCount(0);
  await expect(needsYou(page)).toContainText('Answer the boundary-condition question');
});

test('All-complete state has no agent onboarding prompt', async ({ page, context, dhara }) => {
  await openKind(page, context, dhara, 'complete');
  expect((await serverState(dhara)).tasks.every(t => t.status === 'done')).toBe(true);
  await expect(fewMinutes(page)).toHaveCount(0);
  await expect(homeTasks(page).locator('.task-row')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Set up agent reporting' })).toHaveCount(0);
});

test('Home and Tasks separate focus, attention, open work and running reports', async ({ page, dhara }) => {
  const pinned = await task(dhara, 'Pinned work');
  await dhara.api('POST', '/api/focus', { task_id: pinned.id, pinned: true });
  await agentRun(dhara, await task(dhara, 'Review result'), 'completed');
  await agentRun(dhara, await task(dhara, 'Working agent'));
  await task(dhara, 'Next work');
  await gotoApp(page, dhara);
  await expect(page.getByRole('region', { name: 'Current focus' })).toContainText('Pinned by you');
  await expect(agentStrip(page)).toHaveAccessibleName('Agents: 1 need you, 1 working');
  await expect(fewMinutes(page)).toContainText('Next work');
  for (const list of await page.locator('.home-list').all()) await expect(list).not.toContainText('Pinned work');
  await openAgents(page);
  await expect(needsYou(page)).toContainText('Review result');
  await expect(page.getByRole('list', { name: 'Agents working' })).toContainText('Working agent');
  await toTasks(page);
  await expect(page.getByRole('region', { name: 'Needs you' })).toHaveCount(0);
});

test('Server restart retains manual priority, pinned focus and due reminder', async ({ page, dhara }) => {
  const t = await task(dhara, 'Revisit allocator');
  await gotoApp(page, dhara, '#/plan');
  await page.getByRole('button', { name: 'Revisit allocator', exact: true }).click();
  await page.getByRole('combobox', { name: 'Priority for Revisit allocator' }).selectOption('high');
  await expect(page.locator('.toast-layer')).toContainText('Priority updated.');
  await page.keyboard.press('Escape');
  await dhara.api('POST', '/api/focus', { task_id: t.id, pinned: true });
  await dhara.api('POST', '/api/reminders', { task_id: t.id, at: new Date(Date.now() - 60_000).toISOString() });
  await dhara.restart();
  await gotoApp(page, dhara);
  await expect(page.getByRole('region', { name: 'Current focus' })).toContainText('Pinned by you');
  await openAgents(page);
  await expect(needsYou(page)).toContainText('Revisit allocator');
  const state = await serverState(dhara);
  expect(state.tasks.find(task => task.id === t.id)?.priority).toBe('high');
  expect(state.reminders.map(r => r.state)).toEqual(['due']);
});

test('Disconnected cache has no currently actionable alternatives', async ({ page, context, dhara }) => {
  await openKind(page, context, dhara, 'disconnected');
  await expect(fewMinutes(page)).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Current focus' })).toContainText('Last known · Selected by you');
});

test('Disconnected cache does not claim available/completed/connected integrations', async ({ page, context, dhara }) => {
  await openKind(page, context, dhara, 'disconnected');
  await expect(page.locator('.app')).toHaveAttribute('data-connection', 'offline');
  await expect(agentStrip(page)).toHaveCount(0);
  await expect(needsYou(page)).toHaveCount(0);
  await toTasks(page);
  await expect(page.getByText(/^Last known · /)).toBeVisible();
  await expect(page.getByText('All tracked work is complete')).toHaveCount(0);
});

test('Real API-backed Home renders', async ({ page, dhara }) => {
  const t = await task(dhara, 'Read the ownership chapter', { next_action: 'Start at the borrowing section.' });
  await gotoApp(page, dhara);
  await fewMinutes(page).getByRole('button', { name: 'Read the ownership chapter', exact: true }).click();
  await expect(page.getByRole('dialog', { name: t.title })).toContainText('Start at the borrowing section.');
});

test('Agent and dependency waiting reasons are distinct and real', async ({ page, context, dhara }) => {
  await openKind(page, context, dhara, 'waiting');
  await openAgents(page);
  await expect(page.getByRole('list', { name: 'Agents working' })).toContainText('Trace ownership in the cleanup path');
  await toTasks(page);
  await page.locator('.task-board').getByRole('button', { name: 'Test the revised cleanup', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Test the revised cleanup' })).toContainText('Waiting on: Trace ownership');
});
