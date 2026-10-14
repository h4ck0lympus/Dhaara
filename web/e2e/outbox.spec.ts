import type { Page } from '@playwright/test';
import { DB_NAME } from '../src/local/db';
import { LEGACY_DB_NAME } from '../src/local/migrate';
import { S } from '../src/strings';
import { failFetch, loseAck } from './faults';
import { expect, gotoApp, PNG_1PX, putOutboxItem, readLocalDb, seedLocalDb, test, type SeedDraft } from './fixtures';
import { E2E_TOKEN, type DharaServer } from './server';

// public/app.js wrote these shapes; v1 outbox items carry no `error` key until a rejection.
const QUEUED: SeedDraft = { id: '6f1c2b8e-3d4a-4c5b-9e6f-7a8b9c0d1e2f', raw: 'Queued by the old UI', task_id: '', files: [{ name: 'heap.png', type: 'image/png', base64: PNG_1PX }] };

type NoteRow = { id: string; folder: string; processing: string };
type NoteBody = NoteRow & { raw: string; attachments: { id: string; name: string; mime: string; size: number }[] };

const notes = (dhara: DharaServer) => dhara.api<NoteRow[]>('GET', '/api/search');
const outboxIds = async (page: Page) => (await readLocalDb(page)).outbox.map((item) => item.id);

async function openApp(page: Page, dhara: DharaServer): Promise<void> {
  await page.goto(dhara.origin + '/');
  await expect(page.locator('#root [data-quiet]').first()).toBeVisible();
}

test('Upgrade: a v1 outbox item and drafts upload exactly once with the original id', async ({ page, dhara }) => {
  const draft: SeedDraft = { id: 'draft-v1-0001', raw: 'still typing', task_id: '', files: [] };
  const taskDraft = { id: 'task-draft-v1-01', raw: 'Review cleanup', fields: { project: 'CTF' }, pending: null };
  await seedLocalDb(page, dhara.origin, { draft, taskDraft, outbox: [QUEUED] });
  await openApp(page, dhara);
  await expect.poll(async () => (await notes(dhara)).map((note) => note.id)).toEqual([QUEUED.id]);
  await expect.poll(() => outboxIds(page)).toEqual([]);
  await page.reload();
  await expect(page.locator('#root [data-quiet]').first()).toBeVisible();
  expect((await notes(dhara)).map((note) => note.id)).toEqual([QUEUED.id]);
  const local = await readLocalDb(page);
  expect(local.draft).toEqual({ ...draft, files: [] }); // drafts stay on the device; Save is the only notebook boundary
  expect(local.taskDraft).toEqual(taskDraft);
});

test('Upgrade from the pre-rename build: a queued capture in the old database is moved and uploads once with its id', async ({ page, dhara }) => {
  const draft: SeedDraft = { id: 'draft-legacy-0001', raw: 'still typing', task_id: '', files: [] };
  await seedLocalDb(page, dhara.origin, { draft, outbox: [QUEUED] }, LEGACY_DB_NAME);
  await openApp(page, dhara);
  await expect.poll(async () => (await notes(dhara)).map((note) => note.id)).toEqual([QUEUED.id]);
  await expect.poll(() => outboxIds(page)).toEqual([]);
  await expect.poll(() => page.evaluate(async () => (await indexedDB.databases()).map((info) => info.name))).toEqual([DB_NAME]);
  expect((await readLocalDb(page)).draft).toEqual({ ...draft, files: [] });
  await page.reload();
  await expect(page.locator('#root [data-quiet]').first()).toBeVisible();
  expect((await notes(dhara)).map((note) => note.id)).toEqual([QUEUED.id]);   // uploaded exactly once, original capture_id
});

test('Reconnect flushes queued capture to real server', async ({ page, dhara }) => {
  await openApp(page, dhara); // first boot creates the stores and installs the service worker, so the shell opens while the server is down
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
  await dhara.kill();
  await page.reload();
  await expect(page.locator('#root [data-quiet]').first()).toBeVisible();
  await putOutboxItem(page, QUEUED);
  await dhara.restart();
  await page.reload();
  await expect.poll(async () => (await notes(dhara)).map((note) => note.id)).toEqual([QUEUED.id]);
  await expect.poll(() => outboxIds(page)).toEqual([]);
});

test('Reconnect receives matching real server acknowledgment', async ({ page, dhara }) => {
  await seedLocalDb(page, dhara.origin, { outbox: [QUEUED] });
  const acknowledged = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/captures');
  await openApp(page, dhara);
  const response = await acknowledged;
  expect(response.status()).toBe(201);
  const note = (await response.json()) as NoteBody;
  expect(note).toMatchObject({ id: QUEUED.id, raw: QUEUED.raw });
  await expect(page.getByText(S.savedTo(note.folder, note.processing), { exact: true })).toBeVisible();
});

test('Reconnect delivers one original note and exact attachment bytes', async ({ page, dhara }) => {
  await seedLocalDb(page, dhara.origin, { outbox: [QUEUED] });
  await openApp(page, dhara);
  await expect.poll(() => outboxIds(page)).toEqual([]);
  const note = await dhara.api<NoteBody>('GET', `/api/notes/${QUEUED.id}`);
  expect(note).toMatchObject({ raw: QUEUED.raw, attachments: [{ name: 'heap.png', mime: 'image/png', size: 68 }] });
  const bytes = await (await fetch(`${dhara.origin}/api/attachments/${note.attachments[0].id}`, { headers: { Authorization: `Bearer ${E2E_TOKEN}` } })).arrayBuffer();
  expect(Buffer.from(bytes).toString('base64')).toBe(PNG_1PX);
  expect((await notes(dhara)).length).toBe(1);
});

test('Lost server acknowledgment retains queued capture ID', async ({ page, dhara }) => {
  await loseAck(page, '/api/captures', 100); // every acknowledgement on this page is lost, however often the app retries
  await seedLocalDb(page, dhara.origin, { outbox: [QUEUED] });
  await openApp(page, dhara);
  await expect.poll(async () => (await notes(dhara)).map((note) => note.id)).toEqual([QUEUED.id]); // the server stored it
  expect(await outboxIds(page)).toEqual([QUEUED.id]); // the page never saw the acknowledgement, so the item stays queued
  expect((await notes(dhara)).length).toBe(1); // replays with the same capture_id never duplicate the note
});

test('Browser/server restart retries lost acknowledgment without duplicate notes', async ({ page, dhara }) => {
  await loseAck(page, '/api/captures', 100);
  await seedLocalDb(page, dhara.origin, { outbox: [QUEUED] });
  await openApp(page, dhara);
  await expect.poll(async () => (await notes(dhara)).length).toBe(1);
  expect(await outboxIds(page)).toEqual([QUEUED.id]);
  await dhara.restart();
  const fresh = await page.context().newPage(); // loseAck is per page: this page sees real acknowledgements
  await openApp(fresh, dhara);
  await expect.poll(() => outboxIds(fresh)).toEqual([]);
  expect((await notes(dhara)).map((note) => note.id)).toEqual([QUEUED.id]);
});

const editor = (page: Page) => page.getByLabel('Rough learning note');
const outboxDialog = (page: Page) => page.getByRole('dialog', { name: S.outboxTitle });

test.describe('Outbox dialog', () => {
  test('Outbox lists queued captures; Open a copy asks before replacing a draft; Discard asks first', async ({ page, dhara }) => {
    // Every upload attempt in this test fails, so queued-0001 stays queued through every flush trigger.
    await failFetch(page, { path: /\/api\/captures$/, method: 'POST', times: 100, fault: { status: 503, body: '{"detail":"Service busy"}', contentType: 'application/json' } });
    await seedLocalDb(page, dhara.origin, {
      draft: { id: 'draft-0001', raw: 'Unsaved current draft', task_id: '', files: [] },
      outbox: [
        { id: 'queued-0001', raw: 'Queued thought about heaps', task_id: '', files: [{ name: 'heap.png', type: 'image/png', base64: PNG_1PX }] },
        { id: 'queued-0002', raw: 'Rejected capture', task_id: '', files: [], error: 'Supported attachments: PNG, JPEG, WebP images.' },
      ],
    });
    await gotoApp(page, dhara, '#/capture');
    await page.getByRole('button', { name: S.outboxCount(2) }).click();
    const dialog = outboxDialog(page);
    await expect(dialog.getByText(S.outboxHelp)).toBeVisible();
    const first = dialog.getByRole('listitem').filter({ hasText: 'Queued thought about heaps' });
    await expect(first.getByText(S.attachmentsCount(1))).toBeVisible();
    await expect(dialog.getByRole('listitem').filter({ hasText: 'Rejected capture' }).getByRole('alert')).toContainText('Supported attachments');

    page.once('dialog', (prompt) => { expect(prompt.message()).toBe(S.confirmReplaceDraft); void prompt.dismiss(); });
    await first.getByRole('button', { name: S.openCopy }).click();
    await expect(dialog).toBeVisible();
    await expect(editor(page)).toHaveValue('Unsaved current draft');

    page.once('dialog', (prompt) => void prompt.accept());
    await first.getByRole('button', { name: S.openCopy }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/#\/capture$/);
    await expect(editor(page)).toHaveValue('Queued thought about heaps');
    await expect(page.getByRole('img', { name: 'heap.png' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: S.openedCopy })).toBeVisible();
    const local = await readLocalDb(page);
    expect(local.outbox.map((item) => item.id).sort()).toEqual(['queued-0001', 'queued-0002']);
    expect((local.draft as { id: string }).id).not.toBe('queued-0001');

    await page.getByRole('button', { name: S.outboxCount(2) }).click();
    const rejected = outboxDialog(page).getByRole('listitem').filter({ hasText: 'Rejected capture' });
    page.once('dialog', (prompt) => { expect(prompt.message()).toBe(S.confirmDiscard); void prompt.accept(); });
    await rejected.getByRole('button', { name: S.discard }).click();
    await expect(rejected).toHaveCount(0);
    expect((await readLocalDb(page)).outbox.map((item) => item.id)).toEqual(['queued-0001']);
  });

  test('Retry clears a stored error and uploads the capture', async ({ page, dhara }) => {
    await seedLocalDb(page, dhara.origin, { outbox: [{ id: 'retry-capture-01', raw: 'Retry me', task_id: '', files: [], error: 'Temporary rejection' }] });
    await gotoApp(page, dhara, '#/capture');
    await page.getByRole('button', { name: S.outboxCount(1) }).click();
    const dialog = outboxDialog(page);
    await dialog.getByRole('button', { name: S.retry }).click();
    await expect(dialog.getByText(S.outboxEmpty)).toBeVisible();
    expect((await dhara.api<{ raw: string }>('GET', '/api/notes/retry-capture-01')).raw).toBe('Retry me');
  });

  test('An unreadable queued record is listed with Discard only', async ({ page, dhara }) => {
    await seedLocalDb(page, dhara.origin, {});
    await page.evaluate(() => new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('dhara-local-v1', 1);
      request.onsuccess = () => {
        const tx = request.result.transaction('outbox', 'readwrite');
        tx.objectStore('outbox').put({ id: 'broken-0001', raw: 42 });
        tx.oncomplete = () => { request.result.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    }));
    await gotoApp(page, dhara, '#/capture');
    await page.getByRole('button', { name: S.outboxCount(1) }).click();
    const item = outboxDialog(page).getByRole('listitem');
    await expect(item).toContainText('This queued item cannot be read.');
    await expect(item.getByRole('button')).toHaveCount(1);
    page.once('dialog', (prompt) => void prompt.accept());
    await item.getByRole('button', { name: S.discard }).click();
    await expect(outboxDialog(page).getByText(S.outboxEmpty)).toBeVisible();
  });
});
