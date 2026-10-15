import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeSnapshot } from '../test/fixtures';
import { ApiError } from './client';
import { boot, signOut, unlock } from './session';

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);
afterEach(() => fetchMock.mockReset());

const SNAPSHOT = JSON.stringify(makeSnapshot());
function respond(...responses: [number, string][]) {
  for (const [status, body] of responses) fetchMock.mockResolvedValueOnce(new Response(body, { status, headers: { 'content-type': 'application/json' } }));
}
const requests = () => fetchMock.mock.calls.map(([url, init]) => `${init?.method} ${String(url)}${init?.body ? ' ' + String(init.body) : ''}`);

describe('boot', () => {
  it('is unreachable when the server accepts the connection but never replies (10 s timeout)', async () => {
    vi.useFakeTimers();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('timed out', 'TimeoutError')), ms);
      return controller.signal;
    });
    try {
      fetchMock.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      }));
      const pending = boot();
      await vi.advanceTimersByTimeAsync(10_000);
      expect((await pending).kind).toBe('unreachable');
      expect(timeout).toHaveBeenCalledWith(10_000);
    } finally { vi.useRealTimers(); timeout.mockRestore(); }
  });

  it('uses the cookie it already has: one GET, no session call (non-loopback cookie-only client)', async () => {
    respond([200, SNAPSHOT]);
    expect(await boot()).toEqual({ kind: 'ready', snapshot: makeSnapshot() });
    expect(requests()).toEqual(['GET /api/state']);
  });

  it('tries loopback auto-login only after a 401, then fetches the state again', async () => {
    respond([401, '{"detail":"Unlock Dhara to continue"}'], [200, '{"ok":true}'], [200, SNAPSHOT]);
    expect((await boot()).kind).toBe('ready');
    expect(requests()).toEqual(['GET /api/state', 'POST /api/session {"token":""}', 'GET /api/state']);
  });

  it('is locked only after a second 401', async () => {
    respond([401, '{"detail":"Unlock Dhara to continue"}'], [401, '{"detail":"Invalid access token"}']);
    expect(await boot()).toEqual({ kind: 'locked' });
    respond([401, '{"detail":"Unlock Dhara to continue"}'], [200, '{"ok":true}'], [401, '{"detail":"Unlock Dhara to continue"}']);
    expect(await boot()).toEqual({ kind: 'locked' });
  });

  it('is unreachable on any other failure, without trying to log in', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const network = await boot();
    expect(network.kind).toBe('unreachable');
    respond([503, 'Service Unavailable']);
    const server = await boot();
    expect(server).toMatchObject({ kind: 'unreachable', error: { kind: 'http', status: 503 } });
    expect(server.kind === 'unreachable' && server.error).toBeInstanceOf(ApiError);
    expect(requests()).toEqual(['GET /api/state', 'GET /api/state']);
  });
});

describe('unlock and signOut', () => {
  it('post the token and surface a wrong token as an ApiError for an inline message', async () => {
    respond([401, '{"detail":"Invalid access token"}']);
    await expect(unlock('wrong-token')).rejects.toMatchObject({ kind: 'http', status: 401, message: 'Invalid access token' });
    respond([200, '{"ok":true}'], [200, '{"ok":true}']);
    await unlock('right-token');
    await signOut();
    expect(requests()).toEqual(['POST /api/session {"token":"wrong-token"}', 'POST /api/session {"token":"right-token"}', 'DELETE /api/session']);
  });
});
