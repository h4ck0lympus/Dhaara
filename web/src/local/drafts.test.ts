import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { S } from '../strings';

vi.mock('../ui/Toast', () => ({ toast: vi.fn() }));

type Modules = { drafts: typeof import('./drafts'); db: typeof import('./db'); toast: ReturnType<typeof vi.fn> };
let m: Modules;

beforeEach(async () => {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory() as unknown as typeof globalThis.indexedDB;
  m = { drafts: await import('./drafts'), db: await import('./db'), toast: vi.mocked((await import('../ui/Toast')).toast) };
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const store = () => m.drafts.captureDraftStore;
const png = (name: string) => new File(['png-bytes'], name, { type: 'image/png' });
const failNextPut = (name: string) =>
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
    throw new DOMException('Injected', name);
  });

describe('captureDraftStore.load', () => {
  it('recovers a stored draft as saved, or starts in memory', async () => {
    await store().load();
    expect(store().getSnapshot()).toMatchObject({ saveState: 'memory', recovered: true, draft: { raw: '' } });
    const stored = { id: 'draft-0001', raw: 'unsaved thought', task_id: '', files: [{ name: 'heap.png', blob: new Blob(['x'], { type: 'image/png' }) }] };
    await m.db.kvPut('draft', stored);
    await store().load();
    expect(store().getSnapshot()).toMatchObject({ saveState: 'saved', draft: { id: 'draft-0001', raw: 'unsaved thought' } });
    expect(store().getSnapshot().draft.files[0].blob).toBeInstanceOf(Blob);
  });

  it('reports a storage read failure as a local save error', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    await store().load();
    expect(store().getSnapshot()).toMatchObject({ saveState: 'error', recovered: true });
  });
});

describe('captureDraftStore draft writes', () => {
  it('debounces typing by 350 ms and labels it pending until the write commits', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const listener = vi.fn();
    store().subscribe(listener);
    store().setRaw('first');
    store().setRaw('first line');
    expect(store().getSnapshot()).toMatchObject({ saveState: 'pending', draft: { raw: 'first line' } });
    expect(listener).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(349);
    expect(await m.db.kvGet('draft')).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(store().getSnapshot().saveState).toBe('saved'));
    expect(await m.db.kvGet('draft')).toMatchObject({ raw: 'first line' });
  });

  it('Older committed draft cannot label newer input as saved', async () => {
    store().setRaw('older');
    const older = store().persist();
    store().setRaw('older and newer');
    await older;
    expect(store().getSnapshot().saveState).toBe('pending');
    await store().persist();
    expect(store().getSnapshot().saveState).toBe('saved');
    expect(await m.db.kvGet('draft')).toMatchObject({ raw: 'older and newer' });
  });

  it('a quota failure is an error with a toast, and the next write still runs', async () => {
    store().setRaw('keep me');
    failNextPut('QuotaExceededError');
    await store().persist();
    expect(store().getSnapshot()).toMatchObject({ saveState: 'error', draft: { raw: 'keep me' } });
    expect(m.toast).toHaveBeenCalledWith(S.localSaveFailedToast, { tone: 'error' });
    await store().persist();
    expect(store().getSnapshot().saveState).toBe('saved');
  });

  it('serialises writes so a save queued behind a draft write commits last', async () => {
    store().setRaw('queued thought');
    const write = store().persist();
    const saved = store().save();
    await Promise.all([write, saved]);
    expect(await saved).toEqual({ ok: true });
    expect(await m.db.kvGet('draft')).toEqual(store().getSnapshot().draft);
    expect(store().getSnapshot().draft.raw).toBe('');
  });

  it('adds valid files, returns rejections and persists only when something was accepted', async () => {
    const rejections = await store().addFiles([png('a.png'), new File(['gif'], 'b.gif', { type: 'image/gif' })]);
    expect(rejections.map((r) => r.code)).toEqual(['unsupported-type']);
    expect(store().getSnapshot().draft.files.map((f) => f.name)).toEqual(['a.png']);
    expect(await m.db.kvGet('draft')).toMatchObject({ files: [{ name: 'a.png' }] });
    await store().removeFile(0);
    expect(await m.db.kvGet('draft')).toMatchObject({ files: [] });
  });

  it('links a task and opens a copy of a queued item with a new id', async () => {
    await store().setTaskId('task-1');
    expect(await m.db.kvGet('draft')).toMatchObject({ task_id: 'task-1' });
    await store().replaceWith({ id: 'queued-0001', raw: 'queued', task_id: '', files: [], error: 'Request failed (400)' });
    const draft = store().getSnapshot().draft;
    expect(draft).toMatchObject({ raw: 'queued', task_id: '' });
    expect(draft.id).not.toBe('queued-0001');
    expect(draft).not.toHaveProperty('error');
    expect(await m.db.kvGet('draft')).toEqual(draft);
  });
});

describe('captureDraftStore.save', () => {
  it('refuses an empty capture without touching storage', async () => {
    store().setRaw('   ');
    expect(await store().save()).toEqual({ ok: false, message: S.writeSomething });
    expect(await m.db.outboxAll()).toEqual([]);
  });

  it('queues the original and resets the stored draft in one transaction', async () => {
    store().setRaw('Explicit save');
    await store().addFiles([png('heap.png')]);
    const before = store().getSnapshot().draft;
    expect(await store().save()).toEqual({ ok: true });
    const [item] = await m.db.outboxAll();
    expect(item).toMatchObject({ id: before.id, raw: 'Explicit save', task_id: '', error: '', files: [{ name: 'heap.png' }] });
    const after = store().getSnapshot();
    expect(after).toMatchObject({ saveState: 'saved', saving: false, draft: { raw: '', files: [] } });
    expect(after.draft.id).not.toBe(before.id);
    expect(await m.db.kvGet('draft')).toEqual(after.draft);
  });

  it('refuses a second save while one is in flight', async () => {
    store().setRaw('once');
    const first = store().save();
    expect(store().getSnapshot().saving).toBe(true);
    expect(await store().save()).toEqual({ ok: false, message: S.finishingLocalSave });
    expect(await first).toEqual({ ok: true });
    expect(await m.db.outboxAll()).toHaveLength(1);
  });

  it('fails on a duplicate id without resetting either store or the editor', async () => {
    store().setRaw('duplicate');
    await store().persist();
    const draft = store().getSnapshot().draft;
    await m.db.outboxPut({ ...draft, raw: 'already queued' });
    const result = await store().save();
    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false && result.message).toMatch(/^Could not save the capture: /);
    expect(store().getSnapshot()).toMatchObject({ saveState: 'error', saving: false, draft });
    expect(await m.db.kvGet('draft')).toEqual(draft);
    expect(await m.db.outboxAll()).toEqual([expect.objectContaining({ raw: 'already queued' })]);
  });

  it('Native abort after request success still rolls back both stores', async () => {
    store().setRaw('abort me');
    await store().persist();
    const original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      const request = original.call(this, value, key);
      request.addEventListener('success', () => this.transaction.abort());
      return request;
    });
    expect(await store().save()).toEqual({ ok: false, message: S.couldNotSave('Local save failed') });
    expect(await m.db.outboxAll()).toEqual([]);
    expect(await m.db.kvGet('draft')).toMatchObject({ raw: 'abort me' });
    expect(store().getSnapshot().draft.raw).toBe('abort me');
  });

  it('reports a quota failure during save with the browser message', async () => {
    store().setRaw('too big');
    failNextPut('QuotaExceededError');
    expect(await store().save()).toEqual({ ok: false, message: S.couldNotSave('Injected') });
    expect(await m.db.outboxAll()).toEqual([]);
  });

  it('Immediate Save cancels draft debounce without resurrecting a saved draft', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    store().setRaw('saved at once');
    expect(await store().save()).toEqual({ ok: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await m.db.kvGet('draft')).toMatchObject({ raw: '' });
    expect(await m.db.outboxAll()).toHaveLength(1);
  });

  it('ignores files added while a save is in flight', async () => {
    store().setRaw('busy');
    const saving = store().save();
    expect(await store().addFiles([png('late.png')])).toEqual([]);
    await saving;
    expect(store().getSnapshot().draft.files).toEqual([]);
  });
});

describe('markSaveError', () => {
  it('labels the draft as not saved', () => {
    store().markSaveError();
    expect(store().getSnapshot().saveState).toBe('error');
  });
});
