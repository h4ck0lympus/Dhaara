import type { TaskEditable } from '../api/schemas';
import { S } from '../strings';

export const DB_NAME = 'dhara-local-v1';
export const DB_VERSION = 1;
export type StoredFile = { name: string; blob: Blob };
export type Draft = { id: string; raw: string; task_id: string; files: StoredFile[] };
export type OutboxItem = Draft & { error?: string };
export type TaskDraftPending = { capture_id: string; raw: string; local_day: string; details: Partial<TaskEditable> };
export type TaskDraft = { id: string; raw: string; fields: Partial<TaskEditable>; pending: TaskDraftPending | null };
export type KvValues = { draft: Draft; 'task-draft': TaskDraft; snapshot: unknown };
export type LocalErrorCode = 'blocked' | 'open-failed' | 'aborted' | 'migrate';
type StoreName = 'kv' | 'outbox';

export class LocalStoreError extends Error {
  constructor(
    readonly code: LocalErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LocalStoreError';
  }
}

let dbPromise: Promise<IDBDatabase> | undefined;

export function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('kv');
      request.result.createObjectStore('outbox', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = undefined;
      };
      resolve(db);
    };
    request.onerror = () => reject(new LocalStoreError('open-failed', request.error?.message || 'Local storage is unavailable'));
    request.onblocked = () => reject(new LocalStoreError('blocked', S.closeOtherTabs));
  }).catch((error: unknown) => {
    dbPromise = undefined;
    throw error;
  });
  return dbPromise;
}

const outboxWriteListeners = new Set<() => void>();

export function onOutboxWrite(listener: () => void): () => void {
  outboxWriteListeners.add(listener);
  return () => {
    outboxWriteListeners.delete(listener);
  };
}

export async function transaction<T>(
  stores: StoreName | StoreName[],
  mode: IDBTransactionMode,
  run: (tx: IDBTransaction) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDb();
  const names = Array.isArray(stores) ? stores : [stores];
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(names, mode);
    let result: T | undefined;
    const fail = (error: unknown) => reject(error ?? new LocalStoreError('aborted', 'Local save failed'));
    tx.oncomplete = () => {
      resolve(result);
      if (mode === 'readwrite' && names.includes('outbox')) for (const listener of [...outboxWriteListeners]) {
          try {
            listener();
          } catch (error) {
            console.error('outbox listener failed', error);
          }
        }
    };
    tx.onerror = (event) => fail((event.target as IDBRequest | null)?.error ?? tx.error);
    tx.onabort = () => fail(tx.error);
    try {
      const request = run(tx);
      if (request) {
        request.onsuccess = () => {
          result = request.result;
        };
      }
    } catch (error) {
      try {
        tx.abort();
      } catch {
      }
      reject(error);
    }
  });
}

export function kvGet<K extends keyof KvValues>(key: K): Promise<unknown> {
  return transaction<unknown>('kv', 'readonly', (tx) => tx.objectStore('kv').get(key));
}

export async function kvPut<K extends keyof KvValues>(key: K, value: KvValues[K]): Promise<void> {
  await transaction('kv', 'readwrite', (tx) => {
    tx.objectStore('kv').put(value, key);
  });
}

export async function outboxAll(): Promise<unknown[]> {
  return (await transaction<unknown[]>('outbox', 'readonly', (tx) => tx.objectStore('outbox').getAll())) ?? [];
}

export function outboxGet(id: string): Promise<unknown> {
  return transaction<unknown>('outbox', 'readonly', (tx) => tx.objectStore('outbox').get(id));
}

export async function outboxPut(item: OutboxItem): Promise<void> {
  await transaction('outbox', 'readwrite', (tx) => {
    tx.objectStore('outbox').put(item);
  });
}

export async function outboxDelete(id: string): Promise<void> {
  await transaction('outbox', 'readwrite', (tx) => {
    tx.objectStore('outbox').delete(id);
  });
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStoredFile = (v: unknown): v is StoredFile => isRecord(v) && typeof v.name === 'string' && v.blob instanceof Blob;

export function isDraft(v: unknown): v is Draft {
  return isRecord(v) && typeof v.id === 'string' && typeof v.raw === 'string' && typeof v.task_id === 'string' && Array.isArray(v.files) && v.files.every(isStoredFile);
}

export function isOutboxItem(v: unknown): v is OutboxItem {
  return isDraft(v) && ((v as OutboxItem).error === undefined || typeof (v as OutboxItem).error === 'string');
}

function isPending(v: unknown): v is TaskDraftPending {
  return isRecord(v) && typeof v.capture_id === 'string' && typeof v.raw === 'string' && typeof v.local_day === 'string' && isRecord(v.details);
}

export function isTaskDraft(v: unknown): v is TaskDraft {
  return isRecord(v) && typeof v.id === 'string' && typeof v.raw === 'string' && isRecord(v.fields) && (v.pending == null || isPending(v.pending));
}

export function uid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
