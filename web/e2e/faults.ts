import type { Page } from '@playwright/test';

type PathPattern = { source: string; flags: string | null };
type FetchAction =
  | { kind: 'network' }
  | { kind: 'status'; status: number; body: string; contentType: string }
  | { kind: 'hold'; id: number }
  | { kind: 'lose-ack' };
type FetchRule = { path: PathPattern; method: string | null; times: number; action: FetchAction };
type FaultWindow = Window & {
  __dharaFetchRules?: FetchRule[];
  __dharaHoldGates?: Record<number, Promise<void>>;
  __dharaHoldRelease?: Record<number, () => void>;
  __ipcMessages?: string[];
} & Record<string, unknown>;

let holdCounter = 0;

function pattern(path: string | RegExp): PathPattern {
  return typeof path === 'string' ? { source: path, flags: null } : { source: path.source, flags: path.flags };
}

// One fetch patch per document; every helper only appends a rule, so all fetch faults share one matcher.
async function addFetchRule(page: Page, rule: FetchRule): Promise<void> {
  await page.addInitScript((rule: FetchRule) => {
    const w = window as unknown as FaultWindow;
    if (!w.__dharaFetchRules) {
      const rules: FetchRule[] = [];
      w.__dharaFetchRules = rules;
      const original = window.fetch.bind(window);
      const matches = (r: FetchRule, url: URL, method: string) =>
        r.times > 0 &&
        (r.method === null || r.method === method) &&
        (r.path.flags === null ? url.pathname === r.path.source : new RegExp(r.path.source, r.path.flags).test(url.pathname + url.search));
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const request = input instanceof Request ? input : null;
        const url = new URL(request ? request.url : String(input), location.href);
        const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
        const match = rules.find((r) => matches(r, url, method));
        if (!match) return original(input, init);
        match.times -= 1;
        const action = match.action;
        if (action.kind === 'network') throw new TypeError('Failed to fetch');
        if (action.kind === 'status') {
          const body = [204, 205, 304].includes(action.status) ? null : action.body;
          return new Response(body, { status: action.status, headers: { 'content-type': action.contentType } });
        }
        if (action.kind === 'lose-ack') {
          await original(input, init);
          throw new TypeError('Failed to fetch');
        }
        await w.__dharaHoldGates?.[action.id];
        try {
          return await original(input, init);
        } finally {
          (w[`__dharaHoldSettled${action.id}`] as () => void)();
        }
      };
    }
    w.__dharaFetchRules.push(rule);
  }, rule);
}

export async function failFetch(
  page: Page,
  options: { path: string | RegExp; method?: string; times?: number; fault: 'network' | { status: number; body?: string; contentType?: string } },
): Promise<void> {
  const action: FetchAction =
    options.fault === 'network'
      ? { kind: 'network' }
      : { kind: 'status', status: options.fault.status, body: options.fault.body ?? '', contentType: options.fault.contentType ?? 'text/plain' };
  await addFetchRule(page, { path: pattern(options.path), method: options.method?.toUpperCase() ?? null, times: options.times ?? 1, action });
}

export async function holdFetch(page: Page, path: string | RegExp): Promise<{ released(): Promise<void>; release(): Promise<void> }> {
  const id = ++holdCounter;
  let settle!: () => void;
  const settled = new Promise<void>((resolve) => {
    settle = resolve;
  });
  await page.exposeFunction(`__dharaHoldSettled${id}`, () => settle());
  await page.addInitScript((id: number) => {
    const w = window as unknown as FaultWindow;
    w.__dharaHoldGates ??= {};
    w.__dharaHoldRelease ??= {};
    w.__dharaHoldGates[id] = new Promise<void>((resolve) => {
      w.__dharaHoldRelease![id] = resolve;
    });
  }, id);
  await addFetchRule(page, { path: pattern(path), method: null, times: 1, action: { kind: 'hold', id } });
  return {
    released: () => settled,
    release: async () => {
      await page.evaluate((id) => (window as unknown as FaultWindow).__dharaHoldRelease?.[id]?.(), id);
    },
  };
}

export async function loseAck(page: Page, path: string | RegExp, times = 1): Promise<void> {
  await addFetchRule(page, { path: pattern(path), method: null, times, action: { kind: 'lose-ack' } });
}

export async function failIdbWrite(
  page: Page,
  options: { store: 'kv' | 'outbox'; key?: string; times?: number; error: 'QuotaExceededError' | 'AbortError' },
): Promise<void> {
  await page.addInitScript(({ store, key, times, error }) => {
    let remaining = times;
    const proto = IDBObjectStore.prototype as unknown as Record<string, (...args: unknown[]) => IDBRequest>;
    for (const method of ['put', 'add', 'delete']) {
      const original = proto[method];
      proto[method] = function (this: IDBObjectStore, ...args: unknown[]) {
        const request = original.apply(this, args);
        const target =
          method === 'delete' ? args[0] : typeof this.keyPath === 'string' ? (args[0] as Record<string, unknown> | null)?.[this.keyPath] : args[1];
        if (this.name === store && (key === undefined || target === key) && remaining > 0) {
          remaining -= 1;
          const tx = this.transaction;
          // A real quota failure aborts after the request is queued, with the error on the transaction.
          Object.defineProperty(tx, 'error', { configurable: true, get: () => new DOMException(`Injected ${error}`, error) });
          queueMicrotask(() => {
            try {
              tx.abort();
            } catch {
              // already finished
            }
          });
        }
        return request;
      };
    }
  }, { store: options.store, key: options.key, times: options.times ?? 1, error: options.error });
}

export async function delayIdbTransactions(page: Page, ms: number): Promise<void> {
  await page.addInitScript((ms: number) => {
    const original = IDBDatabase.prototype.transaction as (...args: unknown[]) => IDBTransaction;
    (IDBDatabase.prototype as unknown as { transaction: (...args: unknown[]) => IDBTransaction }).transaction = function (this: IDBDatabase, ...args: unknown[]) {
      const tx = original.apply(this, args);
      let handler: ((this: IDBTransaction, event: Event) => unknown) | null = null;
      // Shadow the prototype's oncomplete so the app's handler runs late; addEventListener('complete') users are not delayed.
      Object.defineProperty(tx, 'oncomplete', { configurable: true, get: () => handler, set: (value) => { handler = value; } });
      tx.addEventListener('complete', (event) => {
        setTimeout(() => handler?.call(tx, event), ms);
      });
      return tx;
    };
  }, ms);
}

export async function blockIdbOpen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (this: IDBFactory, name: string, version?: number) {
      if (name !== 'dhara-local-v1') return original.call(this, name, version);
      const request = Object.assign(new EventTarget(), {
        onblocked: null as ((this: unknown, event: Event) => unknown) | null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        result: undefined,
        error: null,
        readyState: 'pending',
      });
      setTimeout(() => {
        const event = new Event('blocked');
        request.dispatchEvent(event);
        request.onblocked?.call(request, event);
      }, 0);
      return request as unknown as IDBOpenDBRequest;
    };
  });
}

export async function stubIpc(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as FaultWindow;
    w.__ipcMessages = [];
    w.ipc = {
      postMessage(message) {
        w.__ipcMessages!.push(message);
      },
    };
  });
}
