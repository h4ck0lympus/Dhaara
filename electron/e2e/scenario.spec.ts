import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { MESSAGES } from '../src/lifecycle.js';
import { admin, live } from '../test/proc.js';
import { closeWindow, killAll, launchNoema, openCapture, outboxIds, readDraft, tempDir, waitConnected, windowCount } from './fixtures.js';
import { appPage, managedSetup, ownedServices, servicePid, startupPage, type Managed } from './managed.js';

// desktop/qa/scenario.js:20: a 1×1 PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3l0AAAAASUVORK5CYII=';
const PNG_BYTES = [...Buffer.from(PNG, 'base64')];
const DRAFT = 'Webview restart draft: original learning notes.';
const DRAFT_FINAL = `${DRAFT} Immediate close checkpoint.`;
const RETAINED = 'Synthetic retained draft after checkpoint failure';
const OFFLINE_CAPTURE = 'Synthetic explicitly queued offline capture';
const CRASH_DRAFT = 'Synthetic draft retained across backend crash';
const TASK_DRAFT = 'Unfinished native task draft';
// Verbatim from web/src/strings.ts (contract §5).
const CLOSE_DRAFT_FAILED = 'Local draft saving failed. Close anyway and risk losing this draft? Cancel to keep it open and retry.';
const CAPTURE_SAVED_OFFLINE = 'Capture saved on this device. It will upload when connected.';

type Note = { id: string; raw: string; attachments: unknown[] };
type State = { notes: { id: string }[]; tasks: { id: string; priority: string; original_input: string | null }[]; focus: { pinned: boolean; task_id: string } | null };

test.describe.configure({ mode: 'serial' });

let m: Managed;
let profile: string;
test.beforeAll(async () => {
  m = await managedSetup();
  profile = tempDir('noema-scenario-profile-');
});
test.afterEach(killAll);

const api = <T = any>(apiPath: string, init?: { method?: string; body?: unknown }) => admin<T>(m.dataDir, m.port, apiPath, init);

async function open(): Promise<{ app: ElectronApplication; page: Page }> {
  const { app } = await launchNoema(m.args, { env: m.env, profile });
  const page = await appPage(app, m.origin);
  await waitConnected(page);
  return { app, page };
}

async function closeAndWait(app: ElectronApplication): Promise<void> {
  const closed = app.waitForEvent('close');
  await closeWindow(app);
  await closed;
}

function taskDraftRaw(page: Page): Promise<string | null> {
  return page.evaluate(() => new Promise<string | null>((resolve, reject) => {
    const open = indexedDB.open('noema-local-v1', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('kv', 'readonly');
      const request = tx.objectStore('kv').get('task-draft');
      tx.oncomplete = () => {
        open.result.close();
        resolve((request.result as { raw?: string } | undefined)?.raw ?? null);
      };
      tx.onabort = () => {
        open.result.close();
        reject(tx.error);
      };
    };
  }));
}

async function openAddTask(page: Page) {
  await page.evaluate(() => { location.hash = '#/plan'; });
  await page.locator('.page-heading').getByRole('button', { name: 'Add task' }).click();
  return page.getByRole('dialog', { name: 'Add task' }).locator('#task-input');
}

test('draft: text and a pasted image stay on this device; an edit made just before close is checkpointed', async () => {
  const { app, page } = await open();
  const editor = await openCapture(page);
  await editor.fill(DRAFT);
  await expect.poll(async () => (await readDraft(page))?.raw).toBe(DRAFT);
  await editor.evaluate((element, base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'webview-qa.png', { type: 'image/png' }));
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, PNG);
  await expect.poll(async () => (await readDraft(page))?.files.length).toBe(1);
  expect((await readDraft(page))!.files[0].bytes).toEqual(PNG_BYTES);
  expect((await api<State>('/state')).notes).toEqual([]);   // nothing ingested before explicit Save
  await editor.fill(DRAFT_FINAL);   // no debounce wait: the close checkpoint must persist this edit
  await closeAndWait(app);
});

test('recover: the exact text and Blob bytes survive the restart; Save commits once', async () => {
  const { app, page } = await open();
  const editor = await openCapture(page);
  await expect(editor).toHaveValue(DRAFT_FINAL);
  expect((await readDraft(page))?.files.map((file) => [file.name, file.bytes])).toEqual([['webview-qa.png', PNG_BYTES]]);
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect.poll(async () => (await api<State>('/state')).notes.length).toBe(1);
  await expect.poll(() => outboxIds(page)).toEqual([]);
  expect((await readDraft(page))?.raw).toBe('');
  const [summary] = (await api<State>('/state')).notes;
  const note = await api<Note>(`/notes/${summary.id}`);
  expect(note.raw).toBe(DRAFT_FINAL);
  expect(note.attachments).toHaveLength(1);
  const task = await api<{ id: string }>('/tasks', { method: 'POST', body: { title: 'Webview QA task', priority: 'low' } });
  await api('/focus', { method: 'POST', body: { task_id: task.id, pinned: true } });
  await closeAndWait(app);
});

test('verify: a restart neither duplicates the capture nor loses focus, manual priority or the original', async () => {
  const { app, page } = await open();
  const draft = await readDraft(page);
  expect([draft?.raw, draft?.files.length]).toEqual(['', 0]);
  const state = await api<State>('/state');
  expect(state.notes).toHaveLength(1);
  expect(state.focus?.pinned).toBe(true);
  expect(state.tasks[0].priority).toBe('low');
  expect((await api<Note>(`/notes/${state.notes[0].id}`)).raw).toBe(DRAFT_FINAL);
  await closeAndWait(app);
});

test('checkpoint-failure: a declined close-anyway prompt keeps the editor and the service', async () => {
  const { app, page } = await open();
  const editor = await openCapture(page);
  await editor.fill(RETAINED);
  await expect.poll(async () => (await readDraft(page))?.raw).toBe(RETAINED);
  // Explicit fault injection (scenario.js:145-151), not a claim of physical storage failure.
  await page.evaluate(() => {
    const w = window as typeof window & { __restore?: () => void; __confirms?: string[] };
    const transaction = IDBDatabase.prototype.transaction;
    const confirm = window.confirm;
    w.__confirms = [];
    IDBDatabase.prototype.transaction = function (this: IDBDatabase, names: string | string[], mode?: IDBTransactionMode, options?: IDBTransactionOptions) {
      if (mode === 'readwrite') throw new DOMException('Synthetic write failure', 'QuotaExceededError');
      return transaction.call(this, names, mode, options);
    };
    window.confirm = (message?: string) => {
      w.__confirms!.push(String(message));
      return false;
    };
    w.__restore = () => {
      IDBDatabase.prototype.transaction = transaction;
      window.confirm = confirm;
    };
  });
  await closeWindow(app);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __confirms?: string[] }).__confirms)).toEqual([CLOSE_DRAFT_FAILED]);
  expect(await windowCount(app)).toBe(1);
  await expect(editor).toHaveValue(RETAINED);
  expect((await api<State>('/state')).notes).toHaveLength(1);   // no duplicate capture
  await page.evaluate(() => (window as typeof window & { __restore?: () => void }).__restore!());
  await closeAndWait(app);   // the real checkpoint now succeeds
});

test('checkpoint-recover: the retained draft returns and is not ingested', async () => {
  const { app, page } = await open();
  await expect(await openCapture(page)).toHaveValue(RETAINED);
  expect((await api<State>('/state')).notes).toHaveLength(1);
  await closeAndWait(app);
});

test('crash: service-down keeps the page; offline Save queues; repeated Retry gives one service, service-up without reload and one flush', async () => {
  const { app, page } = await open();
  const editor = await openCapture(page);
  await page.evaluate(() => { (window as typeof window & { __noReload?: number }).__noReload = 1; });
  const firstPid = await servicePid(m.origin);
  process.kill(firstPid, 'SIGKILL');   // the exact owned child, never a process-name match
  const overlay = await startupPage(app);
  await expect(overlay.locator('#status')).toHaveText(MESSAGES.crashed);
  await expect(page.getByText('Offline · local drafts', { exact: true }).first()).toBeVisible();
  await editor.fill(OFFLINE_CAPTURE);
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByText(CAPTURE_SAVED_OFFLINE)).toBeVisible();
  await expect.poll(async () => (await outboxIds(page)).length).toBe(1);
  await expect.poll(async () => (await readDraft(page))?.raw).toBe('');
  await editor.fill(CRASH_DRAFT);   // the editor stays usable while the backend is down
  await expect.poll(async () => (await readDraft(page))?.raw).toBe(CRASH_DRAFT);
  expect((await api<State>('/state').catch(() => null))).toBeNull();   // nothing restarted by itself
  await overlay.locator('#retry').click();
  // Bypass the disabled button: main itself must serialise these into the one attempt.
  await overlay.evaluate(() => {
    const startup = (window as unknown as { noemaStartup: { retry(): void } }).noemaStartup;
    for (let i = 0; i < 3; i += 1) startup.retry();
  });
  await waitConnected(page);
  expect(await page.evaluate(() => (window as typeof window & { __noReload?: number }).__noReload)).toBe(1);   // service-up, no reload
  await expect(editor).toHaveValue(CRASH_DRAFT);
  const secondPid = await servicePid(m.origin);
  expect(secondPid).not.toBe(firstPid);
  expect(live(firstPid)).toBe(false);
  expect(ownedServices(app.process().pid!)).toEqual([secondPid]);   // one spawn for four Retry requests
  await expect.poll(async () => (await outboxIds(page)).length).toBe(0);
  const notes = (await api<State>('/state')).notes;
  expect(notes).toHaveLength(2);   // the queued capture uploaded once; the unsaved draft was never ingested
  const raws = await Promise.all(notes.map(async (note) => (await api<Note>(`/notes/${note.id}`)).raw));
  expect(raws).toContain(OFFLINE_CAPTURE);
  expect(raws).not.toContain(CRASH_DRAFT);
  await closeAndWait(app);
});

test('kill: SIGKILL of Electron closes the lease and the owned service stops', async () => {
  const { app } = await open();
  const pid = await servicePid(m.origin);
  app.process().kill('SIGKILL');
  await expect.poll(() => live(pid), { timeout: 15_000 }).toBe(false);
});

test('task draft: an unfinished Add task input is checkpointed on close', async () => {
  const { app, page } = await open();
  const input = await openAddTask(page);
  await input.fill(TASK_DRAFT);   // no wait: Close must finish the pending task checkpoint (scenario.js:72)
  await closeAndWait(app);
});

test('task-checkpoint-failure: a failed task checkpoint keeps the window, the service and the committed task draft', async () => {
  const { app, page } = await open();
  expect(await taskDraftRaw(page)).toBe(TASK_DRAFT);
  await page.evaluate(() => {
    const w = window as typeof window & { __restorePut?: () => void };
    const put = IDBObjectStore.prototype.put;
    const confirm = window.confirm;
    (w as typeof w & { __confirms?: string[] }).__confirms = [];
    window.confirm = (message?: string) => {
      (w as typeof w & { __confirms?: string[] }).__confirms!.push(String(message));
      return false;
    };
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (key === 'task-draft') throw new DOMException('Injected task checkpoint failure', 'QuotaExceededError');
      return put.call(this, value, key);
    };
    w.__restorePut = () => { IDBObjectStore.prototype.put = put; window.confirm = confirm; };
  });
  await closeWindow(app);
  // The page now asks (like a capture failure) instead of toasting; declining keeps the window open.
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __confirms?: string[] }).__confirms)).toEqual([CLOSE_DRAFT_FAILED]);
  expect(await windowCount(app)).toBe(1);
  expect(await taskDraftRaw(page)).toBe(TASK_DRAFT);
  expect((await api<State>('/state')).tasks.some((task) => task.original_input === TASK_DRAFT)).toBe(false);
  // scenario.js:83 restores the store; a normal close then stops the service, so the next launch never races its lock.
  await page.evaluate(() => (window as typeof window & { __restorePut?: () => void }).__restorePut!());
  await closeAndWait(app);
});

test('task-recover: Add task reopens the exact input and never auto-submits', async () => {
  const { app, page } = await open();
  await expect(await openAddTask(page)).toHaveValue(TASK_DRAFT);
  expect((await api<State>('/state')).tasks.some((task) => task.original_input === TASK_DRAFT)).toBe(false);
  await closeAndWait(app);
});
