// @vitest-environment jsdom
import { QueryClientProvider, onlineManager, type QueryClient } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connection } from '../domain/connection';
import { SERVICE_UP } from '../events';
import { kvGet, kvPut } from '../local/db';
import { flushOutbox } from '../local/outbox';
import { makeSnapshot, makeTask } from '../test/fixtures';
import { createQueryClient } from './queryClient';
import { installRefetchTriggers, readCachedSnapshot, runFlush, usePatchTask, useSetFocus, useSnapshot, useTimeBudget } from './queries';

vi.mock('../local/db', () => ({ kvGet: vi.fn(), kvPut: vi.fn(async () => {}) }));
vi.mock('../local/outbox', () => ({ flushOutbox: vi.fn(async () => ({ sent: 0, stop: 'done' })) }));

const fetchMock = vi.fn<typeof fetch>();
let qc: QueryClient;
let hidden = false;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const calls = (method: string, path: string) => fetchMock.mock.calls.filter(([url, init]) => (init?.method ?? 'GET') === method && String(url).startsWith('/api' + path)).length;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

function setVisible(visible: boolean) {
  hidden = !visible;
  document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
  hidden = false;
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url) => (String(url).startsWith('/api/state') ? json(makeSnapshot()) : json({ ok: true })));
  qc = createQueryClient();
  connection.report('offline');
});
afterEach(() => {
  cleanup();
  qc.clear();
  onlineManager.setOnline(true);
  fetchMock.mockReset();
  vi.mocked(flushOutbox).mockClear();
  vi.useRealTimers();
});

describe('useSnapshot', () => {
  it('refetches every 15 s while visible, never while hidden, and again on becoming visible', async () => {
    renderHook(() => useSnapshot(), { wrapper });
    await vi.waitFor(() => expect(connection.get()).toBe(true));
    expect(calls('GET', '/state')).toBe(1);
    expect(kvPut).toHaveBeenCalledWith('snapshot', makeSnapshot());
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(calls('GET', '/state')).toBe(2);
    act(() => setVisible(false));
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(calls('GET', '/state')).toBe(2);
    act(() => setVisible(true));
    await vi.waitFor(() => expect(calls('GET', '/state')).toBe(3));
  });

  it('flushes the outbox after each visible snapshot, once per client however many consumers mount', async () => {
    const uninstall = installRefetchTriggers(qc);
    renderHook(() => { useSnapshot(); useSnapshot(); }, { wrapper });
    await vi.waitFor(() => expect(flushOutbox).toHaveBeenCalledTimes(1));
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    await vi.waitFor(() => expect(flushOutbox).toHaveBeenCalledTimes(2));
    uninstall();
  });

  it('reports disconnected on a failed state fetch and keeps the last snapshot', async () => {
    const { result } = renderHook(() => useSnapshot(), { wrapper });
    await vi.waitFor(() => expect(result.current.data).toEqual(makeSnapshot()));
    fetchMock.mockImplementation(async () => json({ detail: 'Unlock Dhara to continue' }, 401));
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    await vi.waitFor(() => expect(connection.get()).toBe(false));
    expect(result.current.data).toEqual(makeSnapshot());
  });

  it('queries the chosen time budget', async () => {
    const { result } = renderHook(() => [useSnapshot(), useTimeBudget()] as const, { wrapper });
    await vi.waitFor(() => expect(calls('GET', '/state')).toBe(1));
    act(() => result.current[1][1](30));
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === '/api/state?minutes=30')).toBe(true));
    act(() => result.current[1][1](null));
  });

  it('refetches on the window online event', async () => {
    const { result } = renderHook(() => useSnapshot(), { wrapper });
    await vi.waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls('GET', '/state')).toBe(1);
    onlineManager.setOnline(false);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await vi.waitFor(() => expect(calls('GET', '/state')).toBe(2));
  });

  it('refetches on dhara:service-up', async () => {
    const { result } = renderHook(() => useSnapshot(), { wrapper });
    await vi.waitFor(() => expect(result.current.isSuccess).toBe(true));
    const uninstall = installRefetchTriggers(qc);
    window.dispatchEvent(new Event(SERVICE_UP));
    await vi.waitFor(() => expect(calls('GET', '/state')).toBe(2));
    uninstall();
  });
});

describe('network mode and replay (spec §4.3)', () => {
  it('fetches even when the OS reports offline (networkMode always)', async () => {
    onlineManager.setOnline(false);
    renderHook(() => useSnapshot(), { wrapper });
    await vi.waitFor(() => expect(calls('GET', '/state')).toBe(1));
  });

  it('a mutation issued while disconnected is sent once and not replayed on reconnect', async () => {
    onlineManager.setOnline(false);
    fetchMock.mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });
    const { result } = renderHook(() => useSetFocus(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ taskId: 'task-1' }).catch(() => {});
    });
    expect(calls('POST', '/focus')).toBe(1);
    await vi.waitFor(() => expect(result.current.error).toMatchObject({ kind: 'network' }));
    fetchMock.mockImplementation(async () => json({ task_id: 'task-1', pinned: true, source: 'manual', updated_at: 'now' }));
    act(() => {
      onlineManager.setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(calls('POST', '/focus')).toBe(1);
  });
});

describe('mutations', () => {
  it('usePatchTask re-reads the task and PUTs with the fresh version, then refreshes the snapshot', async () => {
    const fresh = makeTask('task-1', { version: 7, title: 'Fresh title', priority: 'auto' });
    fetchMock.mockImplementation(async (url, init) => {
      if (url === '/api/tasks/task-1' && (init?.method ?? 'GET') === 'GET') return json(fresh);
      if (url === '/api/tasks/task-1') return json({ ...fresh, version: 8, priority: 'low' });
      return json(makeSnapshot());
    });
    renderHook(() => useSnapshot(), { wrapper });
    await vi.waitFor(() => expect(calls('GET', '/state')).toBe(1));
    const { result } = renderHook(() => usePatchTask(), { wrapper });
    await act(() => result.current.mutateAsync({ id: 'task-1', changes: { priority: 'low' } }));
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(String(put?.[1]?.body))).toMatchObject({ title: 'Fresh title', priority: 'low', expected_version: 7 });
    expect(calls('GET', '/state')).toBe(2);
  });

  it('a 409 is surfaced to the caller, never retried', async () => {
    fetchMock.mockImplementation(async () => json({ detail: 'This task changed on another screen.' }, 409));
    const { result } = renderHook(() => usePatchTask(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ id: 'task-1', changes: { status: 'done' } })).rejects.toMatchObject({ status: 409 });
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a 409 returned by the PUT itself is surfaced and the PUT is sent exactly once', async () => {
    const fresh = makeTask('task-1', { version: 7 });
    fetchMock.mockImplementation(async (url, init) =>
      init?.method === 'PUT' ? json({ detail: 'This task changed on another screen.' }, 409) : json(fresh),
    );
    const { result } = renderHook(() => usePatchTask(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ id: 'task-1', changes: { status: 'done' } })).rejects.toMatchObject({ status: 409 });
    });
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(calls('PUT', '/tasks/task-1')).toBe(1);
    expect(calls('GET', '/tasks/task-1')).toBe(1);
  });
});

describe('runFlush and the cached snapshot', () => {
  it('refreshes the snapshot only when something was sent', async () => {
    const spy = vi.spyOn(qc, 'invalidateQueries');
    expect(await runFlush(qc)).toEqual({ sent: 0, stop: 'done' });
    expect(spy).not.toHaveBeenCalled();
    vi.mocked(flushOutbox).mockResolvedValueOnce({ sent: 2, stop: 'done' });
    expect(await runFlush(qc)).toEqual({ sent: 2, stop: 'done' });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['snapshot'] });
  });

  it('reads back only a schema-valid cached snapshot', async () => {
    vi.mocked(kvGet).mockResolvedValueOnce(makeSnapshot());
    expect(await readCachedSnapshot()).toEqual(makeSnapshot());
    vi.mocked(kvGet).mockResolvedValueOnce({ tasks: 'corrupt' });
    expect(await readCachedSnapshot()).toBeNull();
    vi.mocked(kvGet).mockRejectedValueOnce(new Error('blocked'));
    expect(await readCachedSnapshot()).toBeNull();
  });
});
