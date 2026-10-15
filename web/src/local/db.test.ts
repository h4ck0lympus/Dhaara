import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { S } from '../strings';

type Db = typeof import('./db');
let db: Db;

beforeEach(async () => {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory() as unknown as typeof globalThis.indexedDB;
  db = await import('./db');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const blob = (text: string, type = 'image/png') => new Blob([text], { type });

describe('openDb', () => {
  it('opens dhara-local-v1 version 1 with the public/app.js stores and caches the connection', async () => {
    const first = await db.openDb();
    expect(first.name).toBe('dhara-local-v1');
    expect(first.version).toBe(1);
    expect([...first.objectStoreNames].sort()).toEqual(['kv', 'outbox']);
    expect(first.transaction('outbox').objectStore('outbox').keyPath).toBe('id');
    expect(await db.openDb()).toBe(first);
  });

  it('Failed database open can retry in the same page without reloading', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    await expect(db.openDb()).rejects.toThrow('The operation is insecure.');
    await expect(db.openDb()).resolves.toMatchObject({ name: 'dhara-local-v1' });
  });

  it('reports a blocked open as "Close other Dhara tabs"', async () => {
    const request = {} as IDBOpenDBRequest;
    vi.spyOn(indexedDB, 'open').mockReturnValueOnce(request);
    const opening = db.openDb();
    request.onblocked!.call(request, new Event('blocked') as IDBVersionChangeEvent);
    await expect(opening).rejects.toMatchObject({ name: 'LocalStoreError', code: 'blocked', message: S.closeOtherTabs });
  });

  it('closes on versionchange and forgets the cached connection', async () => {
    const first = await db.openDb();
    const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('dhara-local-v1', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('blocked: the old connection did not close'));
    });
    upgraded.close();
    await expect(db.openDb()).rejects.toMatchObject({ code: 'open-failed' });
    expect(() => first.transaction('kv')).toThrow();
  });
});

describe('transaction', () => {
  it('resolves on complete with the request result', async () => {
    await db.kvPut('snapshot', { tasks: [] });
    expect(await db.kvGet('snapshot')).toEqual({ tasks: [] });
    expect(await db.kvGet('draft')).toBeUndefined();
  });

  it('rolls back every write when run() throws', async () => {
    const boom = new Error('boom');
    await expect(
      db.transaction(['kv', 'outbox'], 'readwrite', (tx) => {
        tx.objectStore('kv').put('kept?', 'snapshot');
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(await db.kvGet('snapshot')).toBeUndefined();
  });

  it('rejects a duplicate outbox.add with ConstraintError and rolls back the other store', async () => {
    const item = { id: 'capture-0001', raw: 'first', task_id: '', files: [] };
    await db.outboxPut(item);
    const error = await db
      .transaction(['kv', 'outbox'], 'readwrite', (tx) => {
        tx.objectStore('kv').put({ id: 'next', raw: '', task_id: '', files: [] }, 'draft');
        tx.objectStore('outbox').add({ ...item, raw: 'second' });
      })
      .then(
        () => null,
        (reason: unknown) => reason,
      );
    expect(error).toMatchObject({ name: 'ConstraintError' });
    expect(await db.kvGet('draft')).toBeUndefined();
    expect(await db.outboxGet('capture-0001')).toMatchObject({ raw: 'first' });
  });

  it('keeps outbox records in key order and stores Blobs', async () => {
    await db.outboxPut({ id: 'b', raw: 'b', task_id: '', files: [] });
    await db.outboxPut({ id: 'a', raw: 'a', task_id: 'task-1', files: [{ name: 'heap.png', blob: blob('png') }], error: '' });
    const items = await db.outboxAll();
    expect(items.map((item) => (item as { id: string }).id)).toEqual(['a', 'b']);
    expect(db.isOutboxItem(items[0])).toBe(true);
    await db.outboxDelete('a');
    expect(await db.outboxAll()).toHaveLength(1);
  });

  it('notifies outbox listeners only after a committed outbox write', async () => {
    const listener = vi.fn();
    const off = db.onOutboxWrite(listener);
    await db.kvPut('snapshot', {});
    await db.outboxAll();
    expect(listener).not.toHaveBeenCalled();
    await db.outboxPut({ id: 'x', raw: '', task_id: '', files: [] });
    expect(listener).toHaveBeenCalledTimes(1);
    await db.transaction(['kv', 'outbox'], 'readwrite', () => {
      throw new Error('aborted');
    }).catch(() => {});
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    await db.outboxDelete('x');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('outbox listeners', () => {
  it('a throwing listener does not stop later listeners or fail the write', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const later = vi.fn();
    db.onOutboxWrite(() => {
      throw new Error('boom');
    });
    db.onOutboxWrite(later);
    await db.outboxPut({ id: 'x', raw: '', task_id: '', files: [] });
    expect(later).toHaveBeenCalledTimes(1);
  });
});

describe('record guards', () => {
  it('accept the shapes public/app.js stores, including v1 items without error', () => {
    const file = { name: 'heap.png', blob: blob('png') };
    expect(db.isDraft({ id: 'd', raw: '', task_id: '', files: [file] })).toBe(true);
    expect(db.isOutboxItem({ id: 'o', raw: 'x', task_id: 't', files: [] })).toBe(true);
    expect(db.isOutboxItem({ id: 'o', raw: 'x', task_id: 't', files: [], error: 'Request failed (400)' })).toBe(true);
    expect(db.isTaskDraft({ id: 't', raw: 'r', fields: {}, pending: null })).toBe(true);
    expect(db.isTaskDraft({ id: 't', raw: 'r', fields: { project: 'CTF' }, pending: { capture_id: 't', raw: 'r', local_day: '2026-10-09', details: {} } })).toBe(true);
  });

  it('reject malformed records instead of guessing', () => {
    for (const value of [null, 'draft', [], { id: 'd', raw: '', task_id: null, files: [] }, { id: 'd', raw: '', task_id: '', files: [{ name: 'x', blob: 'not a blob' }] }]) {
      expect(db.isDraft(value), JSON.stringify(value)).toBe(false);
    }
    expect(db.isOutboxItem({ id: 'o', raw: '', task_id: '', files: [], error: 5 })).toBe(false);
    expect(db.isTaskDraft({ id: 't', raw: 'r', fields: {}, pending: { capture_id: 't' } })).toBe(false);
  });
});

describe('uid', () => {
  it('uses randomUUID, or 32 random hex characters where randomUUID is unavailable (plain-HTTP LAN)', () => {
    expect(db.uid()).toMatch(/^[0-9a-f-]{36}$/);
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: (array: Uint8Array) => real.getRandomValues(array) });
    expect(db.uid()).toMatch(/^[0-9a-f]{32}$/);
  });
});
