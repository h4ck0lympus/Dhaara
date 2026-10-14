import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory() as unknown as typeof globalThis.indexedDB; // fake-indexeddb's class is structurally, not nominally, the DOM type
});

function openV1(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('dhara-local-v1', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('kv');
      request.result.createObjectStore('outbox', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function addOutbox(db: IDBDatabase, ids: string[]): Promise<string> {
  return new Promise((resolve) => {
    const tx = db.transaction('outbox', 'readwrite');
    for (const id of ids) tx.objectStore('outbox').add({ id, raw: '', task_id: '', files: [] });
    tx.oncomplete = () => resolve('complete');
    tx.onabort = () => resolve('abort:' + (tx.error?.name ?? 'none'));
  });
}

describe('Vitest IndexedDB environment (contract §9)', () => {
  it('opens dhara-local-v1 version 1 with the public/app.js stores', async () => {
    const db = await openV1();
    expect([...db.objectStoreNames].sort()).toEqual(['kv', 'outbox']);
    expect(db.transaction('outbox').objectStore('outbox').keyPath).toBe('id');
    db.close();
  });

  it('starts every test with an empty database', async () => {
    const db = await openV1();
    expect(await addOutbox(db, ['same-id'])).toBe('complete');
    db.close();
  });

  it('aborts a transaction whose outbox.add reuses an id', async () => {
    const db = await openV1();
    expect(await addOutbox(db, ['same-id'])).toBe('complete'); // proves the previous test's record is gone
    expect(await addOutbox(db, ['other-id', 'same-id'])).toBe('abort:ConstraintError');
    db.close();
  });
});
