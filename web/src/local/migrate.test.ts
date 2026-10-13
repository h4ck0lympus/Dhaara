import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { S } from '../strings';

type Db = typeof import('./db');
type Migrate = typeof import('./migrate');
let db: Db;
let migrate: Migrate;

beforeEach(async () => {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory() as unknown as typeof globalThis.indexedDB;
  db = await import('./db');
  migrate = await import('./migrate');
});
afterEach(() => {
  vi.restoreAllMocks();
});

const LEGACY = 'noema-local-v1';
const blob = (text: string) => new Blob([text], { type: 'image/png' });
const QUEUED = { id: '6f1c2b8e-3d4a-4c5b-9e6f-7a8b9c0d1e2f', raw: 'queued by the old UI', task_id: '', files: [{ name: 'heap.png', blob: blob('png-bytes') }] };
const DRAFT = { id: 'draft-0001', raw: 'still typing', task_id: 't1', files: [] };
const TASK_DRAFT = { id: 'task-draft-0001', raw: 'Review cleanup', fields: { project: 'CTF' }, pending: null };

// The same upgrade as public/app.js and db.ts: version 1, kv (out-of-line keys) and outbox (keyPath id).
function open(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('kv');
      request.result.createObjectStore('outbox', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function seedLegacy(records: { kv?: Record<string, unknown>; outbox?: unknown[] } = {}): Promise<void> {
  const legacy = await open(LEGACY);
  await new Promise<void>((resolve, reject) => {
    const tx = legacy.transaction(['kv', 'outbox'], 'readwrite');
    for (const [key, value] of Object.entries(records.kv ?? {})) tx.objectStore('kv').put(value, key);
    for (const item of records.outbox ?? []) tx.objectStore('outbox').put(item);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
  legacy.close();
}

const names = async () => (await indexedDB.databases()).map((info) => info.name ?? '').sort();

async function dump(name: string): Promise<{ kv: Record<string, unknown>; outbox: unknown[] }> {
  const handle = await open(name);
  const tx = handle.transaction(['kv', 'outbox'], 'readonly');
  const kvKeys = tx.objectStore('kv').getAllKeys();
  const kvValues = tx.objectStore('kv').getAll();
  const outbox = tx.objectStore('outbox').getAll();
  await new Promise<void>((resolve) => {
    tx.oncomplete = () => resolve();
  });
  handle.close();
  return { kv: Object.fromEntries(kvKeys.result.map((key, index) => [String(key), kvValues.result[index]])), outbox: outbox.result };
}

const raws = (items: unknown[]) => items.map((item) => (item as { raw: string }).raw).sort();

describe('migrateLocalDb (rename spec §4.4)', () => {
  it('is a no-op without a pre-rename database and creates nothing', async () => {
    expect(await migrate.migrateLocalDb()).toBe(0);
    expect(await names()).toEqual([]);
  });

  it('copies every kv entry and outbox record, Blobs and ids included, then deletes the old database', async () => {
    await seedLegacy({ kv: { draft: DRAFT, 'task-draft': TASK_DRAFT, snapshot: { tasks: [] } }, outbox: [QUEUED] });
    expect(await migrate.migrateLocalDb()).toBe(4);
    expect(await names()).toEqual([db.DB_NAME]);
    const moved = await dump(db.DB_NAME);
    expect(moved.kv).toEqual({ draft: DRAFT, 'task-draft': TASK_DRAFT, snapshot: { tasks: [] } });
    expect(moved.outbox).toHaveLength(1);
    const item = moved.outbox[0] as typeof QUEUED;
    expect(item).toMatchObject({ id: QUEUED.id, raw: QUEUED.raw, task_id: '' });
    expect(db.isOutboxItem(item)).toBe(true);
    expect(await item.files[0].blob.text()).toBe('png-bytes');
  });

  it('is a no-op on the second boot', async () => {
    await seedLegacy({ outbox: [QUEUED] });
    await migrate.migrateLocalDb();
    expect(await migrate.migrateLocalDb()).toBe(0);
    expect(await names()).toEqual([db.DB_NAME]);
    expect((await dump(db.DB_NAME)).outbox).toHaveLength(1);
  });

  it('leaves both databases intact when the copy fails part-way', async () => {
    await seedLegacy({ kv: { draft: DRAFT }, outbox: [QUEUED] });
    const add = IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'outbox') throw new DOMException('Injected storage failure', 'QuotaExceededError');
      return add.call(this, value, key);
    });
    await expect(migrate.migrateLocalDb()).rejects.toMatchObject({ name: 'LocalStoreError', code: 'migrate', message: S.migrationFailed });
    expect(await names()).toEqual([db.DB_NAME, LEGACY].sort());
    const legacy = await dump(LEGACY);
    expect(Object.keys(legacy.kv)).toEqual(['draft']);
    expect(raws(legacy.outbox)).toEqual([QUEUED.raw]);
    expect(await dump(db.DB_NAME)).toEqual({ kv: {}, outbox: [] });   // the aborted transaction wrote nothing
  });

  it('completes a half-done earlier run without duplicating or overwriting', async () => {
    await seedLegacy({ kv: { draft: DRAFT, snapshot: { tasks: ['old'] } }, outbox: [QUEUED, { ...QUEUED, id: 'second', raw: 'second' }] });
    await db.kvPut('draft', { ...DRAFT, raw: 'typed after the rename' });   // the new database already has this key
    await db.outboxPut({ ...QUEUED, raw: 'already copied' });
    expect(await migrate.migrateLocalDb()).toBe(2);   // snapshot and 'second'
    const moved = await dump(db.DB_NAME);
    expect((moved.kv.draft as typeof DRAFT).raw).toBe('typed after the rename');
    expect(moved.kv.snapshot).toEqual({ tasks: ['old'] });
    expect(raws(moved.outbox)).toEqual(['already copied', 'second']);
    expect(await names()).toEqual([db.DB_NAME]);
  });

  it('reports "Close other tabs" when another connection blocks the delete, and keeps the copied data', async () => {
    await seedLegacy({ outbox: [QUEUED] });
    const other = await open(LEGACY);   // another tab still holds the old database
    other.onversionchange = () => undefined;   // and ignores the request to close
    await expect(migrate.migrateLocalDb()).rejects.toMatchObject({ name: 'LocalStoreError', code: 'blocked', message: S.closeOtherTabs });
    expect((await dump(db.DB_NAME)).outbox).toHaveLength(1);
    other.close();   // the pending delete now completes
    await vi.waitFor(async () => expect(await names()).toEqual([db.DB_NAME]));
    expect(await migrate.migrateLocalDb()).toBe(0);
  });
});
