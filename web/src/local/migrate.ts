import { S } from '../strings';
import { DB_NAME, LocalStoreError, openDb } from './db';

export const LEGACY_DB_NAME = 'noema-local-v1';
const STORES = ['kv', 'outbox'] as const;
type Store = (typeof STORES)[number];
type Records = Record<Store, { keys: IDBValidKey[]; values: unknown[] }>;

const failure = () => new LocalStoreError('migrate', S.migrationFailed);

function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject((event.target as IDBRequest | null)?.error ?? tx.error ?? failure());
    tx.onabort = () => reject(tx.error ?? failure());
  });
}

function openLegacy(): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DB_NAME);
    let absent = false;
    request.onupgradeneeded = () => {
      absent = true;
      request.transaction?.abort();
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => (absent ? resolve(null) : reject(request.error ?? failure()));
  });
}

function readAll(db: IDBDatabase): Promise<Records> {
  const tx = db.transaction([...STORES], 'readonly');
  const requests = STORES.map((store) => ({ store, keys: tx.objectStore(store).getAllKeys(), values: tx.objectStore(store).getAll() }));
  return committed(tx).then(() => Object.fromEntries(requests.map(({ store, keys, values }) => [store, { keys: keys.result, values: values.result }])) as Records);
}

function copyMissing(target: IDBDatabase, legacy: Records): Promise<number> {
  const tx = target.transaction([...STORES], 'readwrite');
  let copied = 0;
  let thrown: unknown;
  for (const store of STORES) {
    const objectStore = tx.objectStore(store);
    const existing = objectStore.getAllKeys();
    existing.onsuccess = () => {
      try {
        const present = new Set(existing.result.map(String));
        legacy[store].keys.forEach((key, index) => {
          if (present.has(String(key))) return;
          if (store === 'kv') objectStore.add(legacy.kv.values[index], key);
          else objectStore.add(legacy.outbox.values[index]);
          copied += 1;
        });
      } catch (error) {
        thrown = error;
        tx.abort();
      }
    };
  }
  return committed(tx).then(
    () => copied,
    (error: unknown) => {
      throw thrown ?? error;
    },
  );
}

function deleteLegacy(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(LEGACY_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? failure());
    request.onblocked = () => reject(new LocalStoreError('blocked', S.closeOtherTabs));
  });
}

async function migrate(): Promise<number> {
  const legacy = await openLegacy();
  if (legacy === null) return 0;
  let copied: number;
  try {
    copied = await copyMissing(await openDb(), await readAll(legacy));
  } finally {
    legacy.close();
  }
  await deleteLegacy();
  return copied;
}

export async function migrateLocalDb(): Promise<number> {
  try {
    return await migrate();
  } catch (error) {
    if (error instanceof LocalStoreError) throw error;
    console.error('local data migration failed', error);
    throw failure();
  }
}
