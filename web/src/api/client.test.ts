import { afterEach, describe, expect, it, vi } from 'vitest';
import { connection } from '../domain/connection';
import { S } from '../strings';
import { z } from '../zod';
import { ApiError, api, call, isConflict, normaliseError, onUnauthorized } from './client';

const Ok = z.object({ ok: z.literal(true) });
const fetchMock = vi.fn<typeof fetch>();

function respond(status: number, body: string, contentType = 'application/json') {
  fetchMock.mockResolvedValueOnce(new Response(body === '' ? null : body, { status, headers: { 'content-type': contentType } }));
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

vi.stubGlobal('fetch', fetchMock);
afterEach(() => {
  fetchMock.mockReset();
  connection.report('offline');
});

describe('api', () => {
  it('sends same-origin requests with the marker header and JSON bodies', async () => {
    respond(200, '{"ok":true}');
    await expect(api('/focus', Ok, { method: 'POST', body: { task_id: null } })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/focus', {
      method: 'POST',
      headers: { 'X-Dhara-Request': '1', 'Content-Type': 'application/json' },
      body: '{"task_id":null}',
      credentials: 'same-origin',
      signal: undefined,
    });
  });

  it('passes FormData through without a JSON content type', async () => {
    const form = new FormData();
    form.set('payload', '{}');
    respond(200, '{"ok":true}');
    await api('/captures', Ok, { method: 'POST', body: form });
    const init = fetchMock.mock.calls[0][1];
    expect(init?.body).toBe(form);
    expect(init?.headers).toEqual({ 'X-Dhara-Request': '1' });
  });

  it('defaults to GET with no body', async () => {
    respond(200, '{"ok":true}');
    await api('/health', Ok);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET', body: undefined, credentials: 'same-origin' });
  });

  it('turns a network failure into ApiError(network) and reports disconnected', async () => {
    connection.report('state-success');
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const error = await failure(api('/state', Ok));
    expect(error).toMatchObject({ kind: 'network', status: null, message: S.networkError });
    expect(connection.get()).toBe(false);
  });

  it('rethrows an abort unchanged', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    fetchMock.mockRejectedValueOnce(abort);
    await expect(api('/search', Ok)).rejects.toBe(abort);
  });

  it('normalises HTTP errors by body shape', async () => {
    respond(409, '{"detail":"This note changed on another screen. Your draft has not been overwritten. Reload the latest version to compare."}');
    expect(await failure(api('/notes/n1', Ok, { method: 'PUT', body: {} }))).toMatchObject({
      kind: 'http',
      status: 409,
      message: 'This note changed on another screen. Your draft has not been overwritten. Reload the latest version to compare.',
    });
    respond(500, 'Internal Server Error', 'text/plain');
    expect(await failure(api('/state', Ok))).toMatchObject({ kind: 'http', status: 500, message: 'Request failed (500)' });
  });

  it('rejects a 2xx body that does not match the schema, and an empty 2xx body', async () => {
    respond(200, '{"ok":"yes"}');
    expect(await failure(api('/state', Ok))).toMatchObject({ kind: 'parse', status: 200, message: S.unexpectedResponse });
    respond(200, '<html>');
    expect(await failure(api('/state', Ok))).toMatchObject({ kind: 'parse', status: 200 });
    respond(204, '');
    expect(await failure(api('/state', Ok))).toMatchObject({ kind: 'parse', status: 204 });
    respond(204, '');
    await expect(api('/state', z.null())).resolves.toBeNull();
  });

  it('notifies 401 listeners, except for /session whose 401 is an inline error', async () => {
    const listener = vi.fn();
    const unsubscribe = onUnauthorized(listener);
    respond(401, '{"detail":"Invalid access token"}');
    expect(await failure(api('/session', Ok, { method: 'POST', body: { token: 'wrong' } }))).toMatchObject({ status: 401, message: 'Invalid access token' });
    expect(listener).not.toHaveBeenCalled();
    respond(401, '{"detail":"Unlock Dhara to continue"}');
    await failure(api('/state', Ok));
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    respond(401, '{"detail":"Unlock Dhara to continue"}');
    await failure(api('/state', Ok));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('call', () => {
  it('uses the endpoint method, path parameters and query', async () => {
    respond(200, '{"ok":true}');
    await call('reminderSnooze', Ok, { params: { id: 'r 1' }, body: { minutes: 20 } });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/reminders/r%201/snooze');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{"minutes":20}' });
    respond(200, '{"ok":true}');
    await call('state', Ok, { query: { minutes: 45 } });
    expect(fetchMock.mock.calls[1][0]).toBe('/api/state?minutes=45');
  });
});

describe('normaliseError', () => {
  it('uses a detail string as the message', () => {
    expect(normaliseError(404, '{"detail":"Task not found"}')).toBe('Task not found');
  });

  it('joins a detail list of validation messages', () => {
    const body = JSON.stringify({ detail: [{ loc: ['body', 'title'], msg: 'String should have at most 240 characters' }, { loc: ['body'], type: 'missing' }] });
    expect(normaliseError(422, body)).toBe('String should have at most 240 characters; {"loc":["body"],"type":"missing"}');
  });

  it('falls back to the status for non-JSON, empty, detail-less and empty-list bodies', () => {
    for (const text of ['Internal Server Error', '', '{"error":"x"}', '{"detail":[]}', 'null', '{"detail":5}']) {
      expect(normaliseError(502, text), text).toBe('Request failed (502)');
    }
  });
});

describe('isConflict', () => {
  it('is true only for an HTTP 409 ApiError', () => {
    expect(isConflict(new ApiError('http', 'changed', 409))).toBe(true);
    expect(isConflict(new ApiError('http', 'bad', 400))).toBe(false);
    expect(isConflict(new ApiError('network', 'down', null))).toBe(false);
    expect(isConflict(new Error('x'))).toBe(false);
    expect(isConflict(null)).toBe(false);
    expect(isConflict('409')).toBe(false);
  });
});
