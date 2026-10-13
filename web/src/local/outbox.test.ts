import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { S } from '../strings';
import { makeNote } from '../test/fixtures';

vi.mock('../ui/Toast', () => ({ toast: vi.fn() }));

type Modules = {
  outbox: typeof import('./outbox');
  db: typeof import('./db');
  connection: typeof import('../domain/connection')['connection'];
  drafts: typeof import('./drafts')['captureDraftStore'];
  toast: ReturnType<typeof vi.fn>;
};
let m: Modules;
const fetchMock = vi.fn<typeof fetch>();

beforeEach(async () => {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory() as unknown as typeof globalThis.indexedDB;
  vi.stubGlobal('fetch', fetchMock);
  m = {
    outbox: await import('./outbox'),
    db: await import('./db'),
    connection: (await import('../domain/connection')).connection,
    drafts: (await import('./drafts')).captureDraftStore,
    toast: vi.mocked((await import('../ui/Toast')).toast),
  };
  m.connection.report('state-success');
});
afterEach(() => {
  fetchMock.mockReset();
  vi.restoreAllMocks();
});

const ID = (n: number) => `0000000${n}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
const item = (n: number, changes: Record<string, unknown> = {}) => ({ id: ID(n), raw: `capture ${n}`, task_id: '', files: [], ...changes });
const created = (folder = 'Inbox', processing = '') => new Response(JSON.stringify(makeNote('n', { folder, processing })), { status: 201, headers: { 'content-type': 'application/json' } });
const failed = (status: number, detail: string) => new Response(JSON.stringify({ detail }), { status, headers: { 'content-type': 'application/json' } });
const payloads = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init?.body as FormData).get('payload'))) as Record<string, unknown>);
const ids = async () => (await m.db.outboxAll()).map((stored) => (stored as { id: string }).id);

describe('flushOutbox', () => {
  it('a malformed 2xx body toasts, keeps the item unmarked and stops', async () => {
    await m.db.outboxPut(item(1));
    fetchMock.mockImplementation(async () => new Response('{"nope":1}', { status: 201, headers: { 'content-type': 'application/json' } }));
    expect(await m.outbox.flushOutbox()).toEqual({ sent: 0, stop: 'network' });
    expect(m.toast).toHaveBeenCalledWith(S.unexpectedResponse, { tone: 'error' });
    expect(await m.db.outboxAll()).toEqual([expect.not.objectContaining({ error: expect.anything() })]);
  });

  it('sends in IndexedDB key order with the v1 multipart payload and deletes each item only after a 2xx', async () => {
    const png = new Blob(['png-bytes'], { type: 'image/png' });
    await m.db.outboxPut(item(3));
    await m.db.outboxPut(item(1, { task_id: 'task-1', files: [{ name: 'heap.png', blob: png }] })); // v1 shape: no error key
    await m.db.outboxPut(item(2, { error: '' }));
    fetchMock.mockImplementation(async () => created());
    expect(await m.outbox.flushOutbox()).toEqual({ sent: 3, stop: 'done' });
    expect(payloads()).toEqual([
      { capture_id: ID(1), raw: 'capture 1', project: '', task_id: 'task-1', organize: true },
      { capture_id: ID(2), raw: 'capture 2', project: '', task_id: null, organize: true },
      { capture_id: ID(3), raw: 'capture 3', project: '', task_id: null, organize: true },
    ]);
    const first = fetchMock.mock.calls[0][1]?.body as FormData;
    const attachment = first.get('attachments') as File;
    expect([attachment.name, attachment.type, await attachment.text()]).toEqual(['heap.png', 'image/png', 'png-bytes']);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/captures');
    expect(await ids()).toEqual([]);
    expect(m.toast).not.toHaveBeenCalled(); // three items: no single "Saved to" claim
  });

  it('says "Saved to {folder}" only after the server acknowledged the only queued item', async () => {
    await m.db.outboxPut(item(1));
    fetchMock.mockResolvedValueOnce(created('Security / CTFs', 'queued: organize'));
    expect(await m.outbox.flushOutbox()).toEqual({ sent: 1, stop: 'done' });
    expect(m.toast).toHaveBeenCalledWith('Saved to Security / CTFs. Processing queued.');
  });

  it('does nothing while disconnected and is single-flight', async () => {
    await m.db.outboxPut(item(1));
    m.connection.report('offline');
    expect(await m.outbox.flushOutbox()).toEqual({ sent: 0, stop: 'disconnected' });
    m.connection.report('state-success');
    let release!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (release = resolve)));
    const first = m.outbox.flushOutbox();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(await m.outbox.flushOutbox()).toEqual({ sent: 0, stop: 'busy' });
    release(created());
    expect(await first).toEqual({ sent: 1, stop: 'done' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops without marking on 401, 5xx and network failures', async () => {
    await m.db.outboxPut(item(1));
    await m.db.outboxPut(item(2));
    fetchMock.mockResolvedValueOnce(failed(401, 'Unlock Dhara to continue'));
    expect(await m.outbox.flushOutbox()).toEqual({ sent: 0, stop: 'unauthorized' });
    fetchMock.mockResolvedValueOnce(failed(503, 'Service restarting'));
    expect(await m.outbox.flushOutbox()).toEqual({ sent: 0, stop: 'server' });
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await m.outbox.flushOutbox()).toEqual({ sent: 0, stop: 'network' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(await m.db.outboxAll()).toEqual([expect.not.objectContaining({ error: expect.any(String) }), expect.not.objectContaining({ error: expect.any(String) })]);
  });

  it('marks a permanent 4xx rejection with the server message, stops, and skips it afterwards', async () => {
    await m.db.outboxPut(item(1));
    await m.db.outboxPut(item(2));
    fetchMock.mockResolvedValueOnce(failed(400, 'Write something or attach a recording or visual'));
    expect(await m.outbox.flushOutbox()).toEqual({ sent: 0, stop: 'rejected' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await m.db.outboxGet(ID(1))).toMatchObject({ error: 'Write something or attach a recording or visual' });
    fetchMock.mockResolvedValueOnce(created());
    expect(await m.outbox.flushOutbox()).toEqual({ sent: 1, stop: 'done' });
    expect(payloads()[1]).toMatchObject({ capture_id: ID(2) });
    expect(await ids()).toEqual([ID(1)]);
  });

  it('replays a lost acknowledgement with the same capture_id', async () => {
    await m.db.outboxPut(item(1));
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')); // the server may have stored it
    expect(await m.outbox.flushOutbox()).toEqual({ sent: 0, stop: 'network' });
    expect(await ids()).toEqual([ID(1)]);
    m.connection.report('state-success');
    fetchMock.mockResolvedValueOnce(created());
    expect(await m.outbox.flushOutbox()).toEqual({ sent: 1, stop: 'done' });
    expect(payloads().map((p) => p.capture_id)).toEqual([ID(1), ID(1)]);
  });

  it('skips malformed records and never deletes them', async () => {
    await m.db.transaction('outbox', 'readwrite', (tx) => {
      tx.objectStore('outbox').put({ id: ID(1), raw: 42 });
    });
    expect(await m.outbox.flushOutbox()).toEqual({ sent: 0, stop: 'done' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await ids()).toEqual([ID(1)]);
  });

  it('reports an unreadable queue as a local save error', async () => {
    vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementationOnce(() => {
      throw new DOMException('Injected', 'UnknownError');
    });
    expect(await m.outbox.flushOutbox()).toEqual({ sent: 0, stop: 'read-failed' });
    expect(m.drafts.getSnapshot().saveState).toBe('error');
    expect(m.toast).toHaveBeenCalledWith(S.queueReadFailed, { tone: 'error' });
  });
});

describe('outbox actions and count', () => {
  it('retry clears the error and sends again; discard deletes; the count follows every change', async () => {
    const listener = vi.fn();
    m.outbox.subscribeOutbox(listener);
    await m.db.outboxPut(item(1, { error: 'Request failed (400)' }));
    await m.db.outboxPut(item(2));
    await vi.waitFor(() => expect(m.outbox.outboxCount()).toBe(2));
    expect(listener).toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(created()).mockResolvedValueOnce(failed(503, 'down'));
    await m.outbox.retryItem(ID(1));
    expect(payloads().map((p) => p.capture_id)).toEqual([ID(1), ID(2)]); // retry flushes the whole queue in key order
    expect(await ids()).toEqual([ID(2)]);
    await m.outbox.discardItem(ID(2));
    await vi.waitFor(() => expect(m.outbox.outboxCount()).toBe(0));
    expect(await ids()).toEqual([]);
  });

  it('retry ignores an unknown or malformed id', async () => {
    await m.outbox.retryItem('missing');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
