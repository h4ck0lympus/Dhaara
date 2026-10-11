import type { Page } from '@playwright/test';
import { S } from '../src/strings';
import { loseAck } from './faults';
import { expect, PNG_1PX, putOutboxItem, readLocalDb, seedLocalDb, test, type SeedDraft } from './fixtures';
import { E2E_TOKEN, type NoemaServer } from './server';

// public/app.js wrote these shapes; v1 outbox items carry no `error` key until a rejection.
const QUEUED: SeedDraft = { id: '6f1c2b8e-3d4a-4c5b-9e6f-7a8b9c0d1e2f', raw: 'Queued by the old UI', task_id: '', files: [{ name: 'heap.png', type: 'image/png', base64: PNG_1PX }] };

type NoteRow = { id: string; folder: string; processing: string };
type NoteBody = NoteRow & { raw: string; attachments: { id: string; name: string; mime: string; size: number }[] };

const notes = (noema: NoemaServer) => noema.api<NoteRow[]>('GET', '/api/search');
const outboxIds = async (page: Page) => (await readLocalDb(page)).outbox.map((item) => item.id);

async function openApp(page: Page, noema: NoemaServer): Promise<void> {
  await page.goto(noema.origin + '/');
  await expect(page.locator('#root [data-quiet]').first()).toBeVisible();
}

test('Upgrade: a v1 outbox item and drafts upload exactly once with the original id', async ({ page, noema }) => {
  const draft: SeedDraft = { id: 'draft-v1-0001', raw: 'still typing', task_id: '', files: [] };
  const taskDraft = { id: 'task-draft-v1-01', raw: 'Review cleanup', fields: { project: 'CTF' }, pending: null };
  await seedLocalDb(page, noema.origin, { draft, taskDraft, outbox: [QUEUED] });
  await openApp(page, noema);
  await expect.poll(async () => (await notes(noema)).map((note) => note.id)).toEqual([QUEUED.id]);
  await expect.poll(() => outboxIds(page)).toEqual([]);
  await page.reload();
  await expect(page.locator('#root [data-quiet]').first()).toBeVisible();
  expect((await notes(noema)).map((note) => note.id)).toEqual([QUEUED.id]);
  const local = await readLocalDb(page);
  expect(local.draft).toEqual({ ...draft, files: [] }); // drafts stay on the device; Save is the only notebook boundary
  expect(local.taskDraft).toEqual(taskDraft);
});

test('Reconnect flushes queued capture to real server', async ({ page, noema }) => {
  await openApp(page, noema); // first boot creates the stores and installs the service worker, so the shell opens while the server is down
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
  await noema.kill();
  await page.reload();
  await expect(page.locator('#root [data-quiet]').first()).toBeVisible();
  await putOutboxItem(page, QUEUED);
  await noema.restart();
  await page.reload();
  await expect.poll(async () => (await notes(noema)).map((note) => note.id)).toEqual([QUEUED.id]);
  await expect.poll(() => outboxIds(page)).toEqual([]);
});

test('Reconnect receives matching real server acknowledgment', async ({ page, noema }) => {
  await seedLocalDb(page, noema.origin, { outbox: [QUEUED] });
  const acknowledged = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/captures');
  await openApp(page, noema);
  const response = await acknowledged;
  expect(response.status()).toBe(201);
  const note = (await response.json()) as NoteBody;
  expect(note).toMatchObject({ id: QUEUED.id, raw: QUEUED.raw });
  await expect(page.getByText(S.savedTo(note.folder, note.processing), { exact: true })).toBeVisible();
});

test('Reconnect delivers one original note and exact attachment bytes', async ({ page, noema }) => {
  await seedLocalDb(page, noema.origin, { outbox: [QUEUED] });
  await openApp(page, noema);
  await expect.poll(() => outboxIds(page)).toEqual([]);
  const note = await noema.api<NoteBody>('GET', `/api/notes/${QUEUED.id}`);
  expect(note).toMatchObject({ raw: QUEUED.raw, attachments: [{ name: 'heap.png', mime: 'image/png', size: 68 }] });
  const bytes = await (await fetch(`${noema.origin}/api/attachments/${note.attachments[0].id}`, { headers: { Authorization: `Bearer ${E2E_TOKEN}` } })).arrayBuffer();
  expect(Buffer.from(bytes).toString('base64')).toBe(PNG_1PX);
  expect((await notes(noema)).length).toBe(1);
});

test('Lost server acknowledgment retains queued capture ID', async ({ page, noema }) => {
  await loseAck(page, '/api/captures', 100); // every acknowledgement on this page is lost, however often the app retries
  await seedLocalDb(page, noema.origin, { outbox: [QUEUED] });
  await openApp(page, noema);
  await expect.poll(async () => (await notes(noema)).map((note) => note.id)).toEqual([QUEUED.id]); // the server stored it
  expect(await outboxIds(page)).toEqual([QUEUED.id]); // the page never saw the acknowledgement, so the item stays queued
  expect((await notes(noema)).length).toBe(1); // replays with the same capture_id never duplicate the note
});

test('Browser/server restart retries lost acknowledgment without duplicate notes', async ({ page, noema }) => {
  await loseAck(page, '/api/captures', 100);
  await seedLocalDb(page, noema.origin, { outbox: [QUEUED] });
  await openApp(page, noema);
  await expect.poll(async () => (await notes(noema)).length).toBe(1);
  expect(await outboxIds(page)).toEqual([QUEUED.id]);
  await noema.restart();
  const fresh = await page.context().newPage(); // loseAck is per page: this page sees real acknowledgements
  await openApp(fresh, noema);
  await expect.poll(() => outboxIds(fresh)).toEqual([]);
  expect((await notes(noema)).map((note) => note.id)).toEqual([QUEUED.id]);
});
