import { blockIdbOpen, delayIdbTransactions, failFetch, failIdbWrite, holdFetch, loseAck, stubIpc } from './faults';
import { expect, openLocalDb, PNG_1PX, readLocalDb, seedLocalDb, test, type SeedDraft } from './fixtures';

test('seedLocalDb writes v1-shaped records that readLocalDb reads back in key order', async ({ page, noema }) => {
  const png = { name: 'heap.png', type: 'image/png', base64: PNG_1PX };
  const outbox: SeedDraft[] = [
    { id: 'b-item', raw: 'second by key, v1 shape without error', task_id: '', files: [] },
    { id: 'a-item', raw: 'first by key', task_id: 'task-1', files: [png], error: '' },
    { id: 'c-item', raw: 'rejected earlier', task_id: '', files: [], error: 'Request failed (400)' },
  ];
  const taskDraft = { id: 'task-draft-1', raw: 'Review cleanup', fields: { project: 'CTF' }, pending: { capture_id: 'task-draft-1', raw: 'Review cleanup', local_day: '2026-10-09', details: { project: 'CTF' } } };
  await seedLocalDb(page, noema.origin, { draft: { id: 'draft-1', raw: 'unsaved thought', task_id: '', files: [png] }, taskDraft, outbox });
  const db = await readLocalDb(page);
  expect(db.outbox).toEqual([
    { id: 'a-item', raw: 'first by key', error: '', fileCount: 1 },
    { id: 'b-item', raw: 'second by key, v1 shape without error', fileCount: 0 },
    { id: 'c-item', raw: 'rejected earlier', error: 'Request failed (400)', fileCount: 0 },
  ]);
  expect(db.draft).toEqual({ id: 'draft-1', raw: 'unsaved thought', task_id: '', files: [{ name: 'heap.png', type: 'image/png', size: 68 }] });
  expect(db.taskDraft).toEqual(taskDraft);
});

type HarnessWindow = Window & { openNoemaDb(): Promise<IDBDatabase>; pending?: Promise<number>; __ipcMessages?: string[] };

test.describe('fault injection', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(`window.openNoemaDb = ${openLocalDb}`);
  });

  test('failIdbWrite aborts only the matching write, once, with the injected error', async ({ page, noema }) => {
    await failIdbWrite(page, { store: 'kv', key: 'draft', error: 'QuotaExceededError' });
    await page.goto(noema.origin + '/api/health');
    const outcomes = await page.evaluate(async () => {
      const db = await (window as unknown as HarnessWindow).openNoemaDb();
      const put = (key: string) =>
        new Promise<string>((resolve) => {
          const tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put({ raw: key }, key);
          tx.oncomplete = () => resolve('complete');
          tx.onabort = () => resolve('abort:' + (tx.error?.name ?? 'none'));
        });
      return [await put('task-draft'), await put('draft'), await put('draft')];
    });
    expect(outcomes).toEqual(['complete', 'abort:QuotaExceededError', 'complete']);
  });

  test('failIdbWrite matches outbox records by their id', async ({ page, noema }) => {
    await failIdbWrite(page, { store: 'outbox', key: 'doomed', error: 'AbortError' });
    await page.goto(noema.origin + '/api/health');
    const outcomes = await page.evaluate(async () => {
      const db = await (window as unknown as HarnessWindow).openNoemaDb();
      const add = (id: string) =>
        new Promise<string>((resolve) => {
          const tx = db.transaction('outbox', 'readwrite');
          tx.objectStore('outbox').add({ id, raw: '', task_id: '', files: [] });
          tx.oncomplete = () => resolve('complete');
          tx.onabort = () => resolve('abort:' + (tx.error?.name ?? 'none'));
        });
      return [await add('kept'), await add('doomed')];
    });
    expect(outcomes).toEqual(['complete', 'abort:AbortError']);
  });

  test('delayIdbTransactions postpones completion handlers', async ({ page, noema }) => {
    await delayIdbTransactions(page, 400);
    await page.goto(noema.origin + '/api/health');
    const elapsed = await page.evaluate(async () => {
      const db = await (window as unknown as HarnessWindow).openNoemaDb();
      const started = performance.now();
      await new Promise<void>((resolve) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put('x', 'probe');
        tx.oncomplete = () => resolve();
      });
      return performance.now() - started;
    });
    expect(elapsed).toBeGreaterThanOrEqual(400);
  });

  test('blockIdbOpen reports blocked and never opens the database', async ({ page, noema }) => {
    await blockIdbOpen(page);
    await page.goto(noema.origin + '/api/health');
    const outcome = await page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          const request = indexedDB.open('noema-local-v1', 1);
          request.onblocked = () => setTimeout(() => resolve('blocked'), 200);
          request.onsuccess = () => resolve('opened');
        }),
    );
    expect(outcome).toBe('blocked');
  });

  test('failFetch injects a network error or an HTTP response for matching requests only', async ({ page, noema }) => {
    await failFetch(page, { path: '/api/health', fault: 'network' });
    await failFetch(page, { path: /^\/api\/state/, method: 'GET', fault: { status: 500, body: 'boom', contentType: 'text/plain' } });
    await page.goto(noema.origin + '/api/health');
    const results = await page.evaluate(async () => {
      const attempt = async (path: string) => {
        try {
          const response = await fetch(path);
          return `${response.status} ${(await response.text()).slice(0, 4)}`;
        } catch (error) {
          return (error as Error).name;
        }
      };
      return [await attempt('/api/health'), await attempt('/api/health'), await attempt('/api/state?minutes=5'), await attempt('/api/state')];
    });
    expect(results).toEqual(['TypeError', '200 {"ok', '500 boom', '401 {"de']);
  });

  test('holdFetch holds a matching request until release', async ({ page, noema }) => {
    const hold = await holdFetch(page, '/api/health');
    await page.goto(noema.origin + '/api/health');
    await page.evaluate(() => {
      const w = window as unknown as HarnessWindow;
      w.pending = fetch('/api/health').then((response) => response.status);
    });
    const early = await page.evaluate(() =>
      Promise.race([(window as unknown as HarnessWindow).pending, new Promise<string>((resolve) => setTimeout(() => resolve('held'), 300))]),
    );
    expect(early).toBe('held');
    await hold.release();
    await hold.released();
    expect(await page.evaluate(() => (window as unknown as HarnessWindow).pending)).toBe(200);
  });

  test('loseAck delivers the request but reports a network failure', async ({ page, noema }) => {
    await loseAck(page, '/api/health');
    await page.goto(noema.origin + '/api/health');
    const served = page.waitForResponse((response) => response.url().endsWith('/api/health') && response.request().resourceType() === 'fetch');
    const outcome = await page.evaluate(async () => {
      try {
        await fetch('/api/health');
        return 'acknowledged';
      } catch (error) {
        return (error as Error).name;
      }
    });
    expect(outcome).toBe('TypeError');
    expect((await served).status()).toBe(200);
    expect(await page.evaluate(async () => (await fetch('/api/health')).status)).toBe(200);
  });

  test('stubIpc records close approvals posted to the Electron bridge', async ({ page, noema }) => {
    await stubIpc(page);
    await page.goto(noema.origin + '/api/health');
    await page.evaluate(() => window.ipc?.postMessage('noema:close-approved'));
    expect(await page.evaluate(() => (window as unknown as HarnessWindow).__ipcMessages)).toEqual(['noema:close-approved']);
  });
});
