import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { S } from '../strings';
import { makeTask } from '../test/fixtures';

type Modules = { store: typeof import('./taskDraft')['taskDraftStore']; db: typeof import('./db') };
let m: Modules;
const fetchMock = vi.fn<typeof fetch>();

beforeEach(async () => {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory() as unknown as typeof globalThis.indexedDB;
  vi.stubGlobal('fetch', fetchMock);
  m = { store: (await import('./taskDraft')).taskDraftStore, db: await import('./db') };
});
afterEach(() => {
  fetchMock.mockReset();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const acknowledged = (raw: string, explanation = 'Saved as written.') => json(201, makeTask('task-1', { original_input: raw, interpretation: { explanation } }));
const sentBodies = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);

async function typed(raw: string) {
  m.store.setRaw(raw);
  await m.store.persist();
}

describe('taskDraftStore.submit (spec §4.4 Task capture)', () => {
  it('persists the pending payload before any HTTP call, then resets after a verified acknowledgement', async () => {
    await typed('Review the cleanup path');
    m.store.setField('project', 'CTF');
    const id = m.store.getSnapshot().draft.id;
    fetchMock.mockImplementationOnce(async () => {
      expect(await m.db.kvGet('task-draft')).toMatchObject({ pending: { capture_id: id, raw: 'Review the cleanup path', details: { project: 'CTF' } } });
      return acknowledged('Review the cleanup path');
    });
    const result = await m.store.submit(new Date(2026, 9, 9, 18, 0));
    expect(result).toMatchObject({ ok: true, toast: S.taskAdded, task: { id: 'task-1' } });
    expect(sentBodies()).toEqual([{ capture_id: id, raw: 'Review the cleanup path', local_day: '2026-10-09', details: { project: 'CTF' } }]);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/task-captures');
    const after = m.store.getSnapshot().draft;
    expect(after).toMatchObject({ raw: '', fields: {}, pending: null });
    expect(after.id).not.toBe(id);
    expect(await m.db.kvGet('task-draft')).toEqual(after);
  });

  it('keeps date wording with its own toast', async () => {
    await typed('Call Sam tomorrow evening');
    fetchMock.mockResolvedValueOnce(acknowledged('Call Sam tomorrow evening', 'Scheduling wording was kept in the title.'));
    expect(await m.store.submit()).toMatchObject({ ok: true, toast: S.taskAddedDateKept });
  });

  it('never sends when the pending payload cannot be stored', async () => {
    await typed('Store me first');
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new DOMException('Injected', 'QuotaExceededError');
    });
    expect(await m.store.submit()).toEqual({ ok: false, frozen: false, message: S.draftStorageFailed });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(m.store.getSnapshot().draft.pending).toBeNull();
  });

  it('Injected generic HTTP 200 cannot falsely acknowledge a task', async () => {
    await typed('Do not trust me');
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    expect(await m.store.submit()).toEqual({ ok: false, frozen: true, message: S.notConfirmed + S.checkServiceRetry });
    fetchMock.mockResolvedValueOnce(acknowledged('a different input'));
    expect(await m.store.submit()).toEqual({ ok: false, frozen: true, message: S.ackUnverified });
    expect(m.store.getSnapshot().draft.pending).toMatchObject({ raw: 'Do not trust me' });
  });

  it('stays frozen on 409, 5xx and network errors and retries with the same capture_id and local_day across midnight', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 9, 23, 59, 30));
    await typed('Finish before midnight');
    fetchMock.mockResolvedValueOnce(json(409, { detail: 'Task capture ID already exists with different input' }));
    expect(await m.store.submit()).toEqual({ ok: false, frozen: true, message: S.notConfirmed + 'Task capture ID already exists with different input' });
    vi.setSystemTime(new Date(2026, 9, 10, 0, 5));
    fetchMock.mockResolvedValueOnce(json(503, { detail: 'Service restarting' }));
    expect(await m.store.submit()).toMatchObject({ frozen: true });
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await m.store.submit()).toEqual({ ok: false, frozen: true, message: S.notConfirmed + S.checkServiceRetry });
    expect(m.store.statusLabel()).toBe(S.taskDraftUnconfirmed);
    fetchMock.mockResolvedValueOnce(acknowledged('Finish before midnight'));
    expect(await m.store.submit()).toMatchObject({ ok: true });
    const bodies = sentBodies();
    expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);
    expect(bodies[0]).toMatchObject({ local_day: '2026-10-09' });
  });

  it('unfreezes on 401 and other 4xx, clearing the pending attempt', async () => {
    await typed('Needs unlock');
    fetchMock.mockResolvedValueOnce(json(401, { detail: 'Unlock Noema to continue' }));
    expect(await m.store.submit()).toEqual({ ok: false, frozen: false, message: S.notConfirmed + 'Unlock Noema to continue' });
    expect(m.store.getSnapshot().draft).toMatchObject({ raw: 'Needs unlock', pending: null });
    expect(await m.db.kvGet('task-draft')).toMatchObject({ pending: null });
    fetchMock.mockResolvedValueOnce(json(422, { detail: [{ msg: 'String should have at most 16000 characters' }] }));
    expect(await m.store.submit()).toEqual({ ok: false, frozen: false, message: S.notConfirmed + 'String should have at most 16000 characters' });
  });

  it('is single-flight: a second submit while one is in flight sends nothing new', async () => {
    await typed('Once');
    let release!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (release = resolve)));
    const first = m.store.submit();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const second = m.store.submit();
    expect(second).toBe(first);
    expect(m.store.getSnapshot().submitting).toBe(true);
    release(acknowledged('Once'));
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(m.store.getSnapshot().submitting).toBe(false);
  });
});

describe('taskDraftStore draft state', () => {
  it('recovers a stored draft, including one written before pending existed', async () => {
    await m.db.kvPut('task-draft', { id: 'old-draft-01', raw: 'Old', fields: {} } as never);
    await m.store.load();
    expect(m.store.getSnapshot()).toMatchObject({ recovered: true, saveState: 'saved', draft: { id: 'old-draft-01', pending: null } });
    expect(m.store.statusLabel()).toBe(S.taskDraftSaved);
  });

  it('drops an empty title or project override and keeps other fields', () => {
    m.store.setField('title', 'Override');
    m.store.setField('estimate_minutes', 30);
    m.store.setField('title', '');
    expect(m.store.getSnapshot().draft.fields).toEqual({ estimate_minutes: 30 });
  });

  it('labels memory, pending and failed drafts like app.js:306', async () => {
    expect(m.store.statusLabel()).toBe(S.taskDraftMemory);
    m.store.setRaw('x');
    expect(m.store.statusLabel()).toBe(S.taskDraftPending);
    await vi.waitFor(() => expect(m.store.statusLabel()).toBe(S.taskDraftSaved));
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new DOMException('Injected', 'QuotaExceededError');
    });
    await expect(m.store.persist()).rejects.toThrow('Injected');
    expect(m.store.statusLabel()).toBe(S.taskDraftError);
  });
});
