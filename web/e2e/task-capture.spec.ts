import { chromium, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSql } from './db';
import { failFetch, loseAck } from './faults';
import { expect, gotoApp, readLocalDb, test } from './fixtures';
import { TASK_EDIT_FIELDS } from '../src/domain/tasks';
import { E2E_TOKEN, type DharaServer } from './server';

type Task = { id: string; title: string; project: string; priority: string; status: string; version: number; planned_on: string | null; due_at: string | null;
  not_before: string | null; original_input: string | null; interpretation: { method?: string; explanation?: string } };
type State = { tasks: Task[]; reminders: unknown[]; focus: { task_id: string; pinned: boolean } | null; capabilities: { organizer: boolean } };
const state = (dhara: DharaServer) => dhara.api<State>('GET', '/api/state');
const taskCount = async (dhara: DharaServer) => (await state(dhara)).tasks.length;
const byOriginal = async (dhara: DharaServer, raw: string) => (await state(dhara)).tasks.find(t => t.original_input === raw);
const addTaskDialog = (page: Page) => page.getByRole('dialog', { name: 'Add task' });
const rawInput = (page: Page) => addTaskDialog(page).getByLabel('What do you need to do?');
const detailsSummary = (page: Page) => addTaskDialog(page).locator('#task-details summary');
async function openAddTask(page: Page) {
  await page.locator('.page-heading').getByRole('button', { name: 'Add task' }).click();
  await expect(addTaskDialog(page)).toBeVisible();
  return addTaskDialog(page);
}
async function addWithKeyboard(page: Page, raw: string) {
  await rawInput(page).fill(raw);
  await rawInput(page).press('Control+Enter');
  await expect(addTaskDialog(page)).toHaveCount(0);
}
async function breakTaskDraftStorage(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __put?: typeof IDBObjectStore.prototype.put };
    w.__put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (key === 'task-draft') throw new DOMException('Injected quota failure', 'QuotaExceededError');
      return w.__put!.call(this, value, key);
    };
  });
}
async function repairTaskDraftStorage(page: Page) {
  await page.evaluate(() => { IDBObjectStore.prototype.put = (window as unknown as { __put: typeof IDBObjectStore.prototype.put }).__put; });
}
async function submitWithBrokenDraftStorage(page: Page, raw: string) {
  const dialog = await openAddTask(page);
  await rawInput(page).fill(raw);
  await breakTaskDraftStorage(page);
  await dialog.getByRole('button', { name: 'Add task' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Draft storage failed. Task not added; keep this dialog open and retry.');
  return dialog;
}
async function submitWithServerTrigger(page: Page, dhara: DharaServer, raw: string) {
  runSql(dhara.dataDir, "CREATE TRIGGER ui_fail BEFORE INSERT ON task_captures BEGIN SELECT RAISE(ABORT, 'Injected fixture failure'); END");
  const dialog = await openAddTask(page);
  await rawInput(page).fill(raw);
  await dialog.getByRole('button', { name: 'Add task' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Not confirmed added');
  return dialog;
}
async function submitWithLostAck(page: Page, raw: string) {
  const dialog = await openAddTask(page);
  await rawInput(page).fill(raw);
  await dialog.getByRole('button', { name: 'Add task' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Not confirmed added');
  return dialog;
}
async function submitOffline(page: Page, raw: string) {
  const dialog = await openAddTask(page);
  await rawInput(page).fill(raw);
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      if (String(input) === '/api/task-captures') { window.fetch = original; throw new TypeError('Injected offline transport'); }
      return original(input, init);
    };
  });
  await dialog.getByRole('button', { name: 'Add task' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Not confirmed added');
  return dialog;
}

test.use({ viewport: { width: 1200, height: 900 } });

test('One multiline input; no unsupported voice button or mandatory details', async ({ page, dhara }) => {
  await gotoApp(page, dhara, '#/plan');
  const dialog = await openAddTask(page);
  await expect(rawInput(page)).toBeFocused();
  await expect(dialog.locator('input:visible, select:visible')).toHaveCount(0);
  await expect(dialog.locator('textarea:visible')).toHaveCount(1);
  await expect(dialog.locator('#task-details')).not.toHaveAttribute('open', '');
  await expect(dialog.getByRole('button', { name: /record|voice|microphone/i })).toHaveCount(0);
});

for (const width of [1200, 390]) {
  const viewport = { width, height: width === 390 ? 844 : 900 };
  test(`${width}px layout has no horizontal overflow`, async ({ page, dhara }) => {
    await page.setViewportSize(viewport);
    await gotoApp(page, dhara, '#/plan');
    const dialog = await openAddTask(page);
    await rawInput(page).fill('Review the cleanup path');
    expect(await dialog.evaluate(d => d.scrollWidth <= d.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`${width}px Details is keyboard reachable`, async ({ page, dhara }) => {
    await page.setViewportSize(viewport);
    await gotoApp(page, dhara, '#/plan');
    await openAddTask(page);
    await expect(rawInput(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(detailsSummary(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(addTaskDialog(page).locator('#task-details')).toHaveAttribute('open', '');
  });
}

test('Ordinary Enter inserts a newline, never submits', async ({ page, dhara }) => {
  await gotoApp(page, dhara, '#/plan');
  await openAddTask(page);
  await rawInput(page).fill('Review the cleanup path');
  await rawInput(page).press('End');
  await rawInput(page).press('Enter');
  await expect(rawInput(page)).toHaveValue('Review the cleanup path\n');
  await expect(addTaskDialog(page)).toBeVisible();
  expect(await taskCount(dhara)).toBe(0);
});

test('Opening and closing Details preserves input and chosen workflow', async ({ page, dhara }) => {
  await gotoApp(page, dhara, '#/plan');
  const dialog = await openAddTask(page);
  await rawInput(page).fill('Review the cleanup path');
  await detailsSummary(page).click();
  await dialog.getByLabel('Workflow · optional').fill('Explicit fixture workflow');
  await detailsSummary(page).click();
  await expect(rawInput(page)).toHaveValue('Review the cleanup path');
  await detailsSummary(page).click();
  await expect(dialog.getByLabel('Workflow · optional')).toHaveValue('Explicit fixture workflow');
});

test('Keyboard submit durably creates one task without a model', async ({ page, dhara }) => {
  await gotoApp(page, dhara, '#/plan');
  const dialog = await openAddTask(page);
  await rawInput(page).fill('Review the cleanup path');
  await detailsSummary(page).click();
  await dialog.getByLabel('Workflow · optional').fill('Explicit fixture workflow');
  await rawInput(page).press('Control+Enter');
  await expect(addTaskDialog(page)).toHaveCount(0);
  const current = await state(dhara);
  expect(current.capabilities.organizer).toBe(false);
  expect(current.tasks).toHaveLength(1);
  expect(current.tasks[0]).toMatchObject({ original_input: 'Review the cleanup path', project: 'Explicit fixture workflow' });
  expect(current.focus).toBeNull();
});

test('Compact confirmation includes Edit and does not open full editor', async ({ page, dhara }) => {
  await gotoApp(page, dhara, '#/plan');
  await openAddTask(page);
  await addWithKeyboard(page, 'Review the cleanup path');
  await expect(page.locator('.toast-layer')).toContainText('Task added.');
  await expect(page.locator('.toast-layer').getByRole('button', { name: 'Edit' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/plan$/);
});

test('Planned day is separate from deadline/reminder/availability', async ({ page, dhara }) => {
  await gotoApp(page, dhara, '#/plan');
  await openAddTask(page);
  await addWithKeyboard(page, 'Review another cleanup tomorrow');
  const planned = await byOriginal(dhara, 'Review another cleanup tomorrow');
  expect(planned?.planned_on).not.toBeNull();
  expect(planned?.due_at).toBeNull();
  expect(planned?.not_before).toBeNull();
  expect((await state(dhara)).reminders).toHaveLength(0);
});

test('Accidental dismissal and reload recover task draft and details', async ({ page, dhara }) => {
  await gotoApp(page, dhara, '#/plan');
  const dialog = await openAddTask(page);
  await rawInput(page).fill('Maybe review Atlas next Friday; not confirmed');
  await detailsSummary(page).click();
  await dialog.getByLabel('Priority').selectOption('low');
  await rawInput(page).press('Escape');
  await expect(addTaskDialog(page)).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#connection-label')).toHaveText('Server connected');
  const again = await openAddTask(page);
  await expect(rawInput(page)).toHaveValue('Maybe review Atlas next Friday; not confirmed');
  await detailsSummary(page).click();
  await expect(again.getByLabel('Priority')).toHaveValue('low');
  expect(await taskCount(dhara)).toBe(0);
});

test('Task draft survives close and reload; initially focused; Enter inserts newline', async ({ page, dhara }) => {
  await gotoApp(page, dhara, '#/plan');
  const dialog = await openAddTask(page);
  await expect(rawInput(page)).toBeFocused();
  await rawInput(page).fill('leetcode by tonight');
  await rawInput(page).press('Enter');
  await expect(rawInput(page)).toHaveValue(/\n$/);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(addTaskDialog(page)).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#connection-label')).toHaveText('Server connected');
  await openAddTask(page);
  await expect(rawInput(page)).toBeFocused();
  await expect(rawInput(page)).toHaveValue('leetcode by tonight\n');
});

test('Actual browser-profile restart recovers task draft', async ({ dhara }) => {
  const profile = await mkdtemp(join(tmpdir(), 'dhara-task-profile-'));
  try {
    let context = await chromium.launchPersistentContext(profile, { viewport: { width: 1200, height: 900 } });
    let page = context.pages()[0] ?? await context.newPage();
    await gotoApp(page, dhara, '#/plan');
    await openAddTask(page);
    await rawInput(page).fill('Draft that survives a restart');
    await addTaskDialog(page).getByRole('button', { name: 'Close', exact: true }).click();
    await expect(addTaskDialog(page)).toHaveCount(0);
    await context.close();
    context = await chromium.launchPersistentContext(profile, { viewport: { width: 1200, height: 900 } });
    page = context.pages()[0] ?? await context.newPage();
    await gotoApp(page, dhara, '#/plan');
    await openAddTask(page);
    await expect(rawInput(page)).toHaveValue('Draft that survives a restart');
    expect(await taskCount(dhara)).toBe(0);
    await context.close();
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
});

test('Ambiguous workflow/date save without interview or fabricated fields', async ({ page, dhara }) => {
  await gotoApp(page, dhara, '#/plan');
  const dialog = await openAddTask(page);
  await rawInput(page).fill('Maybe review Atlas next Friday; not confirmed');
  await detailsSummary(page).click();
  await dialog.getByLabel('Priority').selectOption('low');
  await rawInput(page).press('Control+Enter');
  await expect(addTaskDialog(page)).toHaveCount(0);
  const uncertain = await byOriginal(dhara, 'Maybe review Atlas next Friday; not confirmed');
  expect(uncertain).toMatchObject({ planned_on: null, due_at: null, not_before: null, project: 'Unassigned', priority: 'low' });
  await expect(page.locator('.toast-layer')).toContainText('Task added. Date wording kept; correct it in Edit if needed.');
});

test('Unsupported input saved with honest unavailable interpretation', async ({ page, dhara }) => {
  await gotoApp(page, dhara, '#/plan');
  await openAddTask(page);
  await addWithKeyboard(page, 'Compare memory layouts');
  const saved = await byOriginal(dhara, 'Compare memory layouts');
  expect(saved).toMatchObject({ title: 'Compare memory layouts', project: 'Unassigned', planned_on: null, due_at: null });
  expect(saved?.interpretation).toMatchObject({ method: 'limited-rules', explanation: '' });
  await expect(page.locator('.toast-layer')).toHaveText(/^Task added\./);
});

test('Repeated submit does not duplicate task', async ({ page, dhara }) => {
  await gotoApp(page, dhara, '#/plan');
  const dialog = await openAddTask(page);
  await rawInput(page).fill('Idempotent example');
  await dialog.locator('form').evaluate((form: HTMLFormElement) => { form.requestSubmit(); form.requestSubmit(); });
  await expect(addTaskDialog(page)).toHaveCount(0);
  expect(await taskCount(dhara)).toBe(1);
});

test('Create task form persists to real SQLite', async ({ page, dhara }) => {
  await gotoApp(page, dhara, '#/plan');
  await openAddTask(page);
  await addWithKeyboard(page, 'Persist me across a restart');
  await dhara.restart();
  expect((await byOriginal(dhara, 'Persist me across a restart'))?.title).toBe('Persist me across a restart');
});

test('Add a task opens an implemented form and persists explicit intent', async ({ page, dhara }) => {
  await gotoApp(page, dhara);
  await page.getByRole('button', { name: '+ Task', exact: true }).click();
  await page.getByLabel('What do you need to do?').fill('Explicitly chosen task');
  await page.getByLabel('What do you need to do?').press('Control+Enter');
  await expect(page.locator('.inline-task')).toHaveCount(0);
  expect((await state(dhara)).tasks.map(t => t.title)).toEqual(['Explicitly chosen task']);
});

test('Injected storage failure retains input, blocks dismissal and makes no task', async ({ page, dhara }) => {
  await gotoApp(page, dhara, '#/plan');
  const dialog = await submitWithBrokenDraftStorage(page, 'Retain this on local storage failure');
  await expect(rawInput(page)).toHaveValue('Retain this on local storage failure');
  await expect(rawInput(page)).toBeEnabled();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog.locator('#task-draft-status')).toContainText('Draft not stored');
  await rawInput(page).press('Escape');
  await expect(addTaskDialog(page)).toBeVisible();
  expect(await taskCount(dhara)).toBe(0);
});

test('Local storage retry adds exactly once', async ({ page, dhara }) => {
  await gotoApp(page, dhara, '#/plan');
  const dialog = await submitWithBrokenDraftStorage(page, 'Retain this on local storage failure');
  await repairTaskDraftStorage(page);
  await dialog.getByRole('button', { name: 'Add task' }).click();
  await expect(addTaskDialog(page)).toHaveCount(0);
  expect(await taskCount(dhara)).toBe(1);
});

test('Failed submission reports an inline error, retains wording and refuses unsafe close', async ({ page, dhara }) => {
  await gotoApp(page, dhara, '#/plan');
  const dialog = await submitWithBrokenDraftStorage(page, 'Preserve on failure, with more text');
  await expect(rawInput(page)).toHaveValue('Preserve on failure, with more text');
  const box = (await dialog.boundingBox())!;
  await page.mouse.click(Math.max(2, box.x - 10), Math.max(2, box.y - 10));
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(addTaskDialog(page)).toBeVisible();
  await expect(rawInput(page)).toHaveValue('Preserve on failure, with more text');
});

test('Server storage failure shows no false success and rolls back task', async ({ page, dhara }) => {
  await gotoApp(page, dhara, '#/plan');
  await submitWithServerTrigger(page, dhara, 'Retain on database failure');
  await expect(rawInput(page)).toBeDisabled();
  await expect(rawInput(page)).toHaveValue('Retain on database failure');
  await expect(page.locator('.toast-layer')).not.toContainText('Task added.');
  expect(await taskCount(dhara)).toBe(0);
});

test('Server storage retry adds once', async ({ page, dhara }) => {
  await gotoApp(page, dhara, '#/plan');
  const dialog = await submitWithServerTrigger(page, dhara, 'Retain on database failure');
  runSql(dhara.dataDir, 'DROP TRIGGER ui_fail');
  await dialog.getByRole('button', { name: 'Retry add task' }).click();
  await expect(addTaskDialog(page)).toHaveCount(0);
  expect(await taskCount(dhara)).toBe(1);
});

test('Lost acknowledgement is unconfirmed, not a success', async ({ page, dhara }) => {
  await loseAck(page, '/api/task-captures', 1);
  await gotoApp(page, dhara, '#/plan');
  await submitWithLostAck(page, 'Retried submission must not duplicate');
  await expect(addTaskDialog(page)).toBeVisible();
  await expect(addTaskDialog(page).getByRole('button', { name: 'Retry add task' })).toBeVisible();
  expect(await taskCount(dhara)).toBe(1);
});

test('Retry after actual commit returns same task, never duplicates', async ({ page, dhara }) => {
  await loseAck(page, '/api/task-captures', 1);
  await gotoApp(page, dhara, '#/plan');
  const dialog = await submitWithLostAck(page, 'Retried submission must not duplicate');
  const committed = (await state(dhara)).tasks[0].id;
  await dialog.getByRole('button', { name: 'Retry add task' }).click();
  await expect(addTaskDialog(page)).toHaveCount(0);
  expect((await state(dhara)).tasks.map(t => t.id)).toEqual([committed]);
});

test('Injected generic HTTP 200 cannot falsely acknowledge a task', async ({ page, dhara }) => {
  await failFetch(page, { path: '/api/task-captures', times: 1, fault: { status: 200, body: '{}', contentType: 'application/json' } });
  await gotoApp(page, dhara, '#/plan');
  const dialog = await openAddTask(page);
  await rawInput(page).fill('Generic success is not a task acknowledgement');
  await dialog.getByRole('button', { name: 'Add task' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Not confirmed added');
  expect(await taskCount(dhara)).toBe(0);
  await dialog.getByRole('button', { name: 'Retry add task' }).click();
  await expect(addTaskDialog(page)).toHaveCount(0);
  expect(await taskCount(dhara)).toBe(1);
});

test('Disconnected task saving retains draft, no task/outbox success', async ({ page, dhara }) => {
  await gotoApp(page, dhara, '#/plan');
  await submitOffline(page, 'Disconnected task draft, not a queued task');
  await expect(rawInput(page)).toHaveValue('Disconnected task draft, not a queued task');
  expect(await taskCount(dhara)).toBe(0);
  expect((await readLocalDb(page)).outbox).toHaveLength(0);
  await expect(page.getByRole('button', { name: /captures? on this device/ })).toHaveCount(0);
});

test('Disconnected draft retry after reload uses durable capture identity', async ({ page, dhara }) => {
  await gotoApp(page, dhara, '#/plan');
  const dialog = await submitOffline(page, 'Disconnected task draft, not a queued task');
  type Pending = { capture_id: string; raw: string; local_day: string; details: Record<string, unknown> };
  const pending = ((await readLocalDb(page)).taskDraft as { pending: Pending }).pending;
  expect(pending.raw).toBe('Disconnected task draft, not a queued task');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(addTaskDialog(page)).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#connection-label')).toHaveText('Server connected');
  const again = await openAddTask(page);
  await expect(rawInput(page)).toHaveValue('Disconnected task draft, not a queued task');
  await expect(again.locator('#task-draft-status')).toHaveText('Previous save is unconfirmed. Retry the same attempt; this draft is not an offline task queue.');
  await again.getByRole('button', { name: 'Retry add task' }).click();
  await expect(addTaskDialog(page)).toHaveCount(0);
  const tasks = (await state(dhara)).tasks;
  expect(tasks).toHaveLength(1);
  expect((await dhara.api<Task>('POST', '/api/task-captures', pending)).id).toBe(tasks[0].id);
  expect(await taskCount(dhara)).toBe(1);
});

test('a 401 unfreezes the input and Unlock stacks over Add task without discarding it', async ({ page, dhara }) => {
  await failFetch(page, { path: '/api/task-captures', times: 1, fault: { status: 401, body: '{"detail":"Unlock Dhara to continue"}', contentType: 'application/json' } });
  await gotoApp(page, dhara, '#/plan');
  const dialog = await openAddTask(page);
  await rawInput(page).fill('Add after unlocking');
  await dialog.getByRole('button', { name: 'Add task' }).click();
  const unlock = page.getByRole('dialog', { name: 'Unlock Dhara' });
  await expect(unlock).toBeVisible();
  await unlock.getByLabel('Access token').fill(E2E_TOKEN);
  await unlock.getByRole('button', { name: 'Unlock' }).click();
  await expect(unlock).toHaveCount(0);
  await expect(addTaskDialog(page)).toBeVisible();
  await expect(rawInput(page)).toBeEnabled();
  await expect(rawInput(page)).toHaveValue('Add after unlocking');
  await expect(dialog.getByRole('alert')).toHaveText('Not confirmed added. Your input is preserved. Unlock Dhara to continue');
  await dialog.getByRole('button', { name: 'Add task' }).click();
  await expect(addTaskDialog(page)).toHaveCount(0);
  expect(await taskCount(dhara)).toBe(1);
});

test('Confirmation Edit opens the saved task even when post-save snapshot failed', async ({ page, dhara }) => {
  await gotoApp(page, dhara, '#/plan');
  await openAddTask(page);
  await rawInput(page).fill('Edit the acknowledged task despite failed refresh');
  await page.evaluate(() => {
    const original = window.fetch;
    let failNextState = false;
    window.fetch = async (input, init) => {
      if (String(input).startsWith('/api/state') && failNextState) {
        failNextState = false;
        return new Response('{"detail":"Injected outage"}', { status: 503, headers: { 'Content-Type': 'application/json' } });
      }
      const response = await original(input, init);
      if (String(input) === '/api/task-captures') failNextState = true;
      return response;
    };
  });
  await addTaskDialog(page).getByRole('button', { name: 'Add task' }).click();
  await expect(addTaskDialog(page)).toHaveCount(0);
  await page.locator('.toast-layer').getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit the acknowledged task despite failed refresh' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Add task' })).toHaveCount(0);
});

async function fullyPopulated(dhara: DharaServer) {
  const saved = await dhara.api<Task>('POST', '/api/task-captures', { capture_id: crypto.randomUUID(), raw: 'Review the cleanup path', local_day: '2026-10-10', details: {} });
  const dependency = await dhara.api<Task>('POST', '/api/tasks', { title: 'Fixture prerequisite' });
  const changed = await dhara.api<Record<string, unknown>>('PUT', `/api/tasks/${saved.id}`, {
    title: saved.title, project: saved.project, detail: 'Retain context', next_action: 'Read saved release order', status: 'todo', priority: 'low',
    due_at: '2026-11-20T17:22:33+00:00', not_before: '2026-10-01T11:23:45+00:00', planned_on: '2026-11-18', estimate_minutes: 25,
    dependencies: [dependency.id], session_url: 'https://example.test/task', expected_version: saved.version,
  });
  return { saved, changed };
}
async function openEditor(page: Page, title: string) {
  await page.locator('.plan-list').getByRole('button', { name: new RegExp('^' + title) }).click();
  await page.getByRole('dialog', { name: title }).getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit task' });
  await expect(editor).toBeVisible();
  return editor;
}

test('Existing task Details starts collapsed', async ({ page, dhara }) => {
  await fullyPopulated(dhara);
  await gotoApp(page, dhara, '#/plan');
  const editor = await openEditor(page, 'Review the cleanup path');
  await expect(editor.locator('#task-details')).not.toHaveAttribute('open', '');
  await expect(editor.getByLabel('Title', { exact: true })).toBeFocused();
});

test('Collapsed editor preserves every hidden field, exact timestamps and original', async ({ page, dhara }) => {
  const { saved, changed } = await fullyPopulated(dhara);
  await gotoApp(page, dhara, '#/plan');
  const editor = await openEditor(page, 'Review the cleanup path');
  await editor.getByLabel('Title', { exact: true }).fill('Manual correction, not an inference');
  await editor.locator('#task-details summary').click();
  await editor.locator('#task-details summary').click();
  await editor.getByRole('button', { name: 'Save task' }).click();
  await expect(page.locator('.toast-layer')).toContainText('Task saved.');
  const updated = await dhara.api<Record<string, unknown>>('GET', `/api/tasks/${saved.id}`);
  for (const key of TASK_EDIT_FIELDS.filter(k => k !== 'title')) expect(updated[key], key).toEqual(changed[key]);
  expect(updated.title).toBe('Manual correction, not an inference');
  expect(updated.original_input).toBe(saved.original_input);
});

test('Task save never replaces pinned focus', async ({ page, dhara }) => {
  const { saved } = await fullyPopulated(dhara);
  await dhara.api('POST', '/api/focus', { task_id: saved.id, pinned: true });
  const pin = (await state(dhara)).focus;
  await gotoApp(page, dhara, '#/plan');
  const editor = await openEditor(page, 'Review the cleanup path');
  await editor.getByLabel('Title', { exact: true }).fill('Renamed while pinned');
  await editor.getByRole('button', { name: 'Save task' }).click();
  await expect(page.locator('.toast-layer')).toContainText('Task saved.');
  expect((await state(dhara)).focus).toEqual(pin);
  await page.keyboard.press('Escape');
  await openAddTask(page);
  await rawInput(page).fill('A new task while pinned');
  await rawInput(page).press('Control+Enter');
  await expect(addTaskDialog(page)).toHaveCount(0);
  expect((await state(dhara)).focus).toEqual(pin);
});
