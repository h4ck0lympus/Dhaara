// web/e2e/plan.spec.ts
import type { Page } from '@playwright/test';
import { expect, gotoApp, test } from './fixtures';
import { agentRun, changeElsewhere, serverState, task } from './nowSeed';
import { createNote } from './screenTest';
import type { DharaServer } from './server';

type Task = { id: string; title: string; status: string; priority: string; version: number };
const getTask = (dhara: DharaServer, id: string) => dhara.api<Task>('GET', `/api/tasks/${id}`);
const rows = (page: Page) => page.locator('.plan-list .task-row');
const view = (page: Page, label: string) => page.getByRole('group', { name: 'Task views' }).getByRole('button', { name: label, exact: true });
const priority = (page: Page, title: string) => page.getByRole('combobox', { name: `Priority for ${title}` });
async function setPriority(page: Page, title: string, value: 'auto' | 'high' | 'medium' | 'low') {
  await priority(page, title).selectOption(value);
  await expect(page.locator('.toast-layer')).toContainText('Priority updated.');
}

test.use({ viewport: { width: 1440, height: 960 } });

test('Needs you, Running, Available now and All filter the task list', async ({ page, dhara }) => {
  await task(dhara, 'Available todo');
  await task(dhara, 'Parked idea', { status: 'parked' });
  await task(dhara, 'Finished', { status: 'done' });
  await task(dhara, 'Review the fix', { status: 'review' });
  await agentRun(dhara, await task(dhara, 'Agent task'));
  await gotoApp(page, dhara, '#/plan');
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

test('Plan rows show task, project, state and priority; due date and estimate only when known', async ({ page, dhara }) => {
  await task(dhara, 'Bare task', { project: 'Learning' });
  await task(dhara, 'Dated task', { project: 'Work', due_at: '2030-01-02T09:30:00+00:00', estimate_minutes: 25 });
  await gotoApp(page, dhara, '#/plan');
  const bare = rows(page).filter({ hasText: 'Bare task' });
  await expect(bare.locator('.task-title small')).toHaveText('Learning · To do');
  await expect(bare.getByRole('combobox', { name: 'Priority for Bare task' })).toBeVisible();
  const dated = rows(page).filter({ hasText: 'Dated task' });
  await expect(dated.locator('.task-title small')).toContainText('Work · To do');
  await expect(dated.locator('.task-title small')).toContainText('Due ');
  await expect(dated.locator('.task-title small')).toContainText('25 min · your estimate');
  await expect(bare.locator('.task-title small')).not.toContainText(/Due |min/);
});

test('Priority is editable in place and shows its source and reason', async ({ page, dhara }) => {
  await task(dhara, 'Read the chapter');
  await gotoApp(page, dhara, '#/plan');
  const select = priority(page, 'Read the chapter');
  await expect(select.locator('option:checked')).toHaveText('medium · Auto · rules');
  await select.focus();
  await expect(page.getByRole('tooltip')).toHaveText('No explicit urgency; neutral default.');
  await setPriority(page, 'Read the chapter', 'high');
  await expect(select.locator('option:checked')).toHaveText('high · Set by you');
});

test('Manual priority control persists', async ({ page, dhara }) => {
  const t = await task(dhara, 'Read the chapter');
  await gotoApp(page, dhara, '#/plan');
  await setPriority(page, 'Read the chapter', 'low');
  await expect.poll(async () => (await getTask(dhara, t.id)).priority).toBe('low');
  expect((await serverState(dhara)).tasks[0]).toMatchObject({ priority: 'low' });
});

test('Manual priority persists after reload', async ({ page, dhara }) => {
  await task(dhara, 'Practice LeetCode');
  await gotoApp(page, dhara, '#/plan');
  await setPriority(page, 'Practice LeetCode', 'high');
  await page.reload();
  await expect(priority(page, 'Practice LeetCode').locator('option:checked')).toHaveText('high · Set by you');
});

test('complete and reopen confirm with a toast; parked is not done', async ({ page, dhara }) => {
  const t = await task(dhara, 'Check duplicate handling');
  await gotoApp(page, dhara, '#/plan');
  await page.getByRole('button', { name: 'Complete Check duplicate handling' }).click();
  await expect(page.locator('.toast-layer')).toContainText('Task completed.');
  await expect.poll(async () => (await getTask(dhara, t.id)).status).toBe('done');
  await expect(rows(page)).toHaveCount(0);
  await view(page, 'Completed').click();
  await page.getByRole('button', { name: 'Reopen Check duplicate handling' }).click();
  await expect(page.locator('.toast-layer')).toContainText('Task reopened.');
  await expect.poll(async () => (await getTask(dhara, t.id)).status).toBe('todo');
  await view(page, 'Parked').click();
  await expect(rows(page)).toHaveCount(0);
});

test('Review result opens the result or session link', async ({ page, dhara }) => {
  const t = await task(dhara, 'Review the cleanup result');
  await agentRun(dhara, t, 'completed', 'https://agent.example/result');
  await gotoApp(page, dhara, '#/plan');
  const link = page.getByRole('link', { name: 'Review result ↗' });
  await expect(link).toHaveAttribute('href', 'https://agent.example/result');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.getByRole('button', { name: 'Complete Review the cleanup result' })).toHaveCount(0);
  expect((await getTask(dhara, t.id)).status).not.toBe('done');
});

test('a long unbroken title never scrolls the page sideways at 390 px', async ({ page, dhara }) => {
  await task(dhara, 'x'.repeat(220));
  await gotoApp(page, dhara, '#/plan');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

// web/e2e/plan.spec.ts — append
test('Task detail shows the next action and source before the activity log', async ({ page, dhara }) => {
  const t = await task(dhara, 'Review the proposed fix', { next_action: 'Check cleanup first.', detail: 'The slot may still point at the chunk.' });
  await agentRun(dhara, t, 'needs_input');
  await gotoApp(page, dhara, '#/plan');
  await page.getByRole('button', { name: /^Review the proposed fix/ }).click();
  const detail = page.getByRole('dialog', { name: 'Review the proposed fix' });
  await expect(detail.getByText('Check cleanup first.')).toBeVisible();
  await expect(detail.getByText('The slot may still point at the chunk.')).toBeVisible();
  const order = await detail.evaluate(d => {
    const headings = [...d.querySelectorAll('h3')].map(x => x.textContent);
    return [headings.indexOf('Continue here'), headings.indexOf('Agent runs')];
  });
  expect(order[0]).toBeGreaterThanOrEqual(0);
  expect(order[0]).toBeLessThan(order[1]);
  await expect(detail).toContainText('Needs your input');
  await expect(detail).toContainText('No explicit urgency; neutral default.');
});

test('Escape closes the detail and focus returns to the row', async ({ page, dhara }) => {
  await task(dhara, 'Read the chapter');
  await gotoApp(page, dhara, '#/plan');
  const title = page.getByRole('button', { name: /^Read the chapter/ });
  await title.click();
  await expect(page.getByRole('dialog', { name: 'Read the chapter' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Read the chapter' })).toHaveCount(0);
  await expect(title).toBeFocused();
});

test('End tracking asks first; declining keeps the run', async ({ page, dhara }) => {
  const t = await task(dhara, 'Long agent job');
  const run = await agentRun(dhara, t);
  await gotoApp(page, dhara, '#/plan');
  await page.getByRole('button', { name: /^Long agent job/ }).click();
  const detail = page.getByRole('dialog', { name: 'Long agent job' });
  const runStatus = async () => (await serverState(dhara)).runs.find(r => r.id === run.id)?.status;
  page.once('dialog', d => { expect(d.message()).toBe('End tracking this run? This does not stop or kill the external agent process.'); void d.dismiss(); });
  await detail.getByRole('button', { name: 'End tracking' }).click();
  expect(await runStatus()).toBe('working');
  page.once('dialog', d => void d.accept());
  await detail.getByRole('button', { name: 'End tracking' }).click();
  await expect.poll(runStatus).toBe('cancelled');
});

test('reminders: add, snooze by 20 minutes, dismiss', async ({ page, dhara }) => {
  await task(dhara, 'Revisit the allocator');
  await gotoApp(page, dhara, '#/plan');
  await page.getByRole('button', { name: /^Revisit the allocator/ }).click();
  const detail = page.getByRole('dialog', { name: 'Revisit the allocator' });
  await detail.getByLabel('Reminder time').fill('2030-01-02T09:30');
  await detail.getByRole('button', { name: 'Add reminder' }).click();
  await expect(page.locator('.toast-layer')).toContainText('Reminder saved.');
  const reminders = async () => (await serverState(dhara)).reminders;
  await expect.poll(async () => (await reminders()).length).toBe(1);
  await expect(detail.getByText(/^scheduled · /)).toBeVisible();
  await detail.getByRole('button', { name: '+20 min' }).click();
  await expect(page.locator('.toast-layer')).toContainText('Reminder moved forward by 20 minutes.');
  await detail.getByRole('button', { name: 'Dismiss' }).click();
  await expect.poll(async () => (await reminders()).length).toBe(0);
});

test('Parked is distinct from done and can be unparked', async ({ page, dhara }) => {
  const t = await task(dhara, 'Someday idea');
  await gotoApp(page, dhara, '#/plan');
  await page.getByRole('button', { name: /^Someday idea/ }).click();
  const detail = page.getByRole('dialog', { name: 'Someday idea' });
  await detail.getByRole('button', { name: 'Park' }).click();
  await expect(page.locator('.toast-layer')).toContainText('Task parked.');
  await expect(detail.getByRole('button', { name: 'Unpark' })).toBeVisible();
  await page.keyboard.press('Escape');
  await view(page, 'Parked').click();
  await expect(rows(page)).toHaveText([/Someday idea/]);
  await view(page, 'Completed').click();
  await expect(rows(page)).toHaveCount(0);
  await view(page, 'Parked').click();
  await page.getByRole('button', { name: /^Someday idea/ }).click();
  await page.getByRole('dialog', { name: 'Someday idea' }).getByRole('button', { name: 'Unpark' }).click();
  await expect(page.locator('.toast-layer')).toContainText('Task unparked.');
  await expect.poll(async () => (await getTask(dhara, t.id)).status).toBe('todo');
});

test('Focus on this asks before replacing a pin', async ({ page, dhara }) => {
  const pinned = await task(dhara, 'Pinned work');
  const other = await task(dhara, 'Other work');
  await dhara.api('POST', '/api/focus', { task_id: pinned.id, pinned: true });
  await gotoApp(page, dhara, '#/plan');
  await page.getByRole('button', { name: /^Other work/ }).click();
  const detail = page.getByRole('dialog', { name: 'Other work' });
  page.once('dialog', d => void d.dismiss());
  await detail.getByRole('button', { name: 'Focus on this' }).click();
  expect((await serverState(dhara)).focus?.task_id).toBe(pinned.id);
  page.once('dialog', d => void d.accept());
  await detail.getByRole('button', { name: 'Focus on this' }).click();
  await expect(page).toHaveURL(/#\/overview$/);
  expect((await serverState(dhara)).focus).toMatchObject({ task_id: other.id, pinned: true });
});

test('session links open only http(s) URLs in a new tab without a referrer', async ({ page, dhara }) => {
  await task(dhara, 'Linked work', { session_url: 'https://example.test/session' });
  await gotoApp(page, dhara, '#/plan');
  await page.getByRole('button', { name: /^Linked work/ }).click();
  const link = page.getByRole('dialog', { name: 'Linked work' }).getByRole('link', { name: 'Open session ↗' });
  await expect(link).toHaveAttribute('href', 'https://example.test/session');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});

test('Startup task link opens existing dialog over Plan', async ({ page, dhara }) => {
  const t = await task(dhara, 'Synthetic linked task', { priority: 'low', next_action: 'Read the saved synthetic action.' });
  await page.goto(`${dhara.origin}/#task/${t.id}`);
  const dialog = page.getByRole('dialog', { name: 'Synthetic linked task' });
  await expect(dialog).toContainText('Read the saved synthetic action.');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/plan');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tasks');
});

test('Task link adds no main navigation/layout', async ({ page, dhara }) => {
  const t = await task(dhara, 'Synthetic linked task');
  await page.goto(`${dhara.origin}/#/task/${t.id}`);
  await expect(page.getByRole('dialog', { name: 'Synthetic linked task' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link')).toHaveCount(2);
  await expect(page.locator('.sidebar')).toHaveCount(1);
  await expect(page.locator('main.content')).toHaveCount(1);
});

test('Task-link navigation never changes pin or manual priority', async ({ page, dhara }) => {
  const t = await task(dhara, 'Synthetic linked task', { priority: 'low' });
  await dhara.api('POST', '/api/focus', { task_id: t.id, pinned: true });
  const before = await serverState(dhara);
  await gotoApp(page, dhara);
  for (const hash of [`#task/${t.id}`, `#/task/${t.id}`]) {
    await page.evaluate(h => { location.hash = h; }, hash);
    const dialog = page.getByRole('dialog', { name: 'Synthetic linked task' });
    await expect(dialog).toBeVisible();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/overview');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
  const after = await serverState(dhara);
  expect(after.focus).toEqual(before.focus);
  expect(after.tasks.find(x => x.id === t.id)?.priority).toBe('low');
});

test('Missing task has truthful error, no fake action', async ({ page, dhara }) => {
  await gotoApp(page, dhara);
  await page.evaluate(() => { location.hash = '#task/missing-synthetic-task'; });
  await expect(page.locator('.toast-layer')).toHaveText(/Task unavailable\./);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('about:blank'); // force a cold start, not a same-document hash change
  await page.goto(`${dhara.origin}/#/task/missing-synthetic-task`);
  await expect(page.locator('.toast-layer')).toHaveText(/Task unavailable\./);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a 409 conflict shows Reopen and never overwrites', async ({ page, dhara }) => {
  const t = await task(dhara, 'Shared task');
  await gotoApp(page, dhara, '#/plan');
  await page.getByRole('button', { name: /^Shared task/ }).click();
  await page.getByRole('dialog', { name: 'Shared task' }).getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit task' });
  await editor.getByLabel('Title', { exact: true }).fill('My stale edit');
  await changeElsewhere(dhara, t.id, { title: 'Changed elsewhere' });
  await editor.getByRole('button', { name: 'Save task' }).click();
  await expect(editor.getByRole('alert')).toHaveText('This task changed. Reopen it before saving.');
  expect((await getTask(dhara, t.id)).title).toBe('Changed elsewhere');
  page.once('dialog', async d => { expect(d.message()).toBe('Reopen discards your unsaved edits. Continue?'); await d.accept(); });
  await editor.getByRole('button', { name: 'Reopen' }).click();
  await expect(editor.getByLabel('Title', { exact: true })).toHaveValue('Changed elsewhere');
  await editor.getByLabel('Title', { exact: true }).fill('Merged by hand');
  await editor.getByRole('button', { name: 'Save task' }).click();
  await expect(page.locator('.toast-layer')).toContainText('Task saved.');
  expect((await getTask(dhara, t.id)).title).toBe('Merged by hand');
});

// The Python helper opens /#task/<id> in a running tab (spec §4.5). A link must never unmount the screen underneath.
const openLink = (page: Page, hash: string) => page.evaluate(h => { location.hash = h; }, hash);
const captureEditor = (page: Page) => page.getByLabel('Rough learning note');

async function taskLinkOverCapture(page: Page, dhara: DharaServer) {
  const t = await task(dhara, 'Synthetic linked task', { priority: 'low' });
  await gotoApp(page, dhara, '#/capture');
  await captureEditor(page).fill('Synthetic unsaved capture stays untouched.');
  await openLink(page, `#task/${t.id}`);
  const dialog = page.getByRole('dialog', { name: 'Synthetic linked task' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
}

async function taskLinkOverNoteEdit(page: Page, dhara: DharaServer) {
  const t = await task(dhara, 'Synthetic linked task');
  const note = await createNote(dhara, 'Synthetic saved note original.');
  await gotoApp(page, dhara, `#/note/${note.id}`);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Note', { exact: true }).fill('Synthetic unsaved note edit.');
  await openLink(page, `#task/${t.id}`);
  const dialog = page.getByRole('dialog', { name: 'Synthetic linked task' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  return note;
}

test('Task link preserves unsaved Capture and route', async ({ page, dhara }) => {
  await taskLinkOverCapture(page, dhara);
  await expect(captureEditor(page)).toHaveValue('Synthetic unsaved capture stays untouched.');
  expect(await page.evaluate(() => location.hash)).toBe('#/capture');
});

test('Opening task never ingests a learning-note draft', async ({ page, dhara }) => {
  await taskLinkOverCapture(page, dhara);
  expect((await serverState(dhara)).notes).toEqual([]);
});

test('Task link preserves note-edit text and route', async ({ page, dhara }) => {
  const note = await taskLinkOverNoteEdit(page, dhara);
  await expect(page.getByLabel('Note', { exact: true })).toHaveValue('Synthetic unsaved note edit.');
  expect(await page.evaluate(() => location.hash)).toBe(`#/note/${note.id}`);
});

test('Saved note original is unchanged', async ({ page, dhara }) => {
  const note = await taskLinkOverNoteEdit(page, dhara);
  expect((await dhara.api<{ raw: string }>('GET', `/api/notes/${note.id}`)).raw).toBe('Synthetic saved note original.');
});
