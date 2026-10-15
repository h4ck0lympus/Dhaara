import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { DB_NAME } from '../src/local/db';
import { S } from '../src/strings';
import { startDhara, type DharaServer } from './server';

export { expect };

export const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3l0AAAAASUVORK5CYII=';

export type SeedDraft = { id: string; raw: string; task_id: string; files: { name: string; type: string; base64: string }[]; error?: string };
export type LocalDbSnapshot = { draft: unknown; taskDraft: unknown; outbox: { id: string; raw: string; error?: string; fileCount: number }[] };

export async function guardContext(context: BrowserContext): Promise<() => void> {
  const violations: string[] = [];
  const errors: string[] = [];
  await context.exposeFunction('__dharaReportCsp', (violation: string) => {
    violations.push(violation);
  });
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const report = (window as unknown as { __dharaReportCsp(v: string): void }).__dharaReportCsp;
      report(`${event.effectiveDirective} blocked ${event.blockedURI} at ${event.sourceFile}:${event.lineNumber}`);
    });
  });
  context.on('weberror', (webError) => errors.push(webError.error().message));
  return () => {
    expect(violations, 'CSP violations').toEqual([]);
    expect(errors, 'uncaught page errors').toEqual([]);
  };
}

export const test = base.extend<{ dhara: DharaServer; guards: void }>({
  dhara: async ({}, use) => {
    const dhara = await startDhara();
    await use(dhara);
    await dhara.stop();
  },
  guards: [
    async ({ context }, use) => {
      const assertClean = await guardContext(context);
      await use();
      assertClean();
    },
    { auto: true },
  ],
});

export async function gotoApp(page: Page, dhara: DharaServer, hash = '#/overview'): Promise<void> {
  await page.goto(`${dhara.origin}/${hash}`);
  await expect(page.getByText(S.connected, { exact: true })).toBeVisible({ timeout: 30_000 });
}

export function openLocalDb(name = 'dhara-local-v1'): Promise<IDBDatabase> {
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

function inLocalDb<A, R>(page: Page, body: (open: typeof openLocalDb, arg: A) => Promise<R>, arg: A): Promise<R> {
  return page.evaluate(`(${body})(${openLocalDb}, ${JSON.stringify(arg)})`) as Promise<R>;
}

type Seed = { draft?: SeedDraft; taskDraft?: unknown; outbox?: SeedDraft[] };

export async function seedLocalDb(page: Page, origin: string, seed: Seed, dbName = DB_NAME): Promise<void> {
  await page.goto(origin + '/api/health');
  await inLocalDb(
    page,
    async (open, { seed, dbName }: { seed: Seed; dbName: string }) => {
      const toRecord = (item: SeedDraft) => ({
        id: item.id,
        raw: item.raw,
        task_id: item.task_id,
        files: item.files.map((file) => ({ name: file.name, blob: new Blob([Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))], { type: file.type }) })),
        ...(item.error === undefined ? {} : { error: item.error }),
      });
      const db = await open(dbName);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['kv', 'outbox'], 'readwrite');
        if (seed.draft) tx.objectStore('kv').put(toRecord(seed.draft), 'draft');
        if (seed.taskDraft !== undefined) tx.objectStore('kv').put(seed.taskDraft, 'task-draft');
        for (const item of seed.outbox ?? []) tx.objectStore('outbox').put(toRecord(item));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    { seed, dbName },
  );
}

export async function putOutboxItem(page: Page, item: SeedDraft): Promise<void> {
  await inLocalDb(
    page,
    async (open, item: SeedDraft) => {
      const db = await open();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('outbox', 'readwrite');
        tx.objectStore('outbox').put({ id: item.id, raw: item.raw, task_id: item.task_id, files: [] });
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    item,
  );
}

export async function readLocalDb(page: Page): Promise<LocalDbSnapshot> {
  return inLocalDb(
    page,
    async (open) => {
      type Stored = { id: string; raw: string; task_id: string; files: { name: string; blob: Blob }[]; error?: string };
      const db = await open();
      const read = <T>(store: 'kv' | 'outbox', query: (s: IDBObjectStore) => IDBRequest<T>) =>
        new Promise<T>((resolve, reject) => {
          const request = query(db.transaction(store, 'readonly').objectStore(store));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const rawDraft = (await read('kv', (s) => s.get('draft'))) as Stored | undefined;
      const taskDraft = (await read('kv', (s) => s.get('task-draft'))) ?? null;
      const items = (await read('outbox', (s) => s.getAll())) as Stored[];
      db.close();
      const draft = rawDraft ? { ...rawDraft, files: rawDraft.files.map((file) => ({ name: file.name, type: file.blob.type, size: file.blob.size })) } : null;
      return {
        draft,
        taskDraft,
        outbox: items.map((item) => ({ id: item.id, raw: item.raw, ...(item.error === undefined ? {} : { error: item.error }), fileCount: item.files.length })),
      };
    },
    undefined,
  );
}

export async function expectFontsLoaded(page: Page): Promise<void> {
  const fonts = ['16px Inter', '500 16px Inter', '16px Display', 'italic 16px Display'];
  const loaded = await page.evaluate(async (list) => {
    await Promise.all(list.map((font) => document.fonts.load(font)));
    return list.every((font) => document.fonts.check(font));
  }, fonts);
  expect(loaded).toBe(true);
  const fontPaths = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => new URL(entry.name).pathname).filter((path) => path.endsWith('.otf')),
  );
  expect(fontPaths).toHaveLength(4);
  for (const path of fontPaths) expect(path).toMatch(/^\/assets\/.+-[A-Za-z0-9_-]{8}\.otf$/);
}

export async function refetch(page: Page): Promise<void> {
  const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/state' && r.ok());
  await page.evaluate(() => window.dispatchEvent(new Event('dhara:service-up')));
  await response;
}

export async function goOffline(page: Page, context: BrowserContext): Promise<void> {
  await context.setOffline(true);
  await expect(page.locator('.offline-banner')).toBeVisible();
}
