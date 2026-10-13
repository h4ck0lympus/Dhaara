import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { SNAPSHOT_INTERVAL_MS, createQueryClient, shouldRetryQuery } from './queryClient';

describe('shouldRetryQuery', () => {
  it('retries network errors and 5xx at most twice, never 4xx or parse errors', () => {
    const network = new ApiError('network', 'down', null);
    const server = new ApiError('http', 'Request failed (502)', 502);
    expect([0, 1, 2].map((n) => shouldRetryQuery(n, network))).toEqual([true, true, false]);
    expect([0, 1, 2].map((n) => shouldRetryQuery(n, server))).toEqual([true, true, false]);
    expect(shouldRetryQuery(0, new ApiError('http', 'Task not found', 404))).toBe(false);
    expect(shouldRetryQuery(0, new ApiError('http', 'Unlock Dhara to continue', 401))).toBe(false);
    expect(shouldRetryQuery(0, new ApiError('parse', 'bad', 200))).toBe(false);
    expect(shouldRetryQuery(0, new Error('other'))).toBe(false);
  });
});

describe('createQueryClient', () => {
  it('never pauses for OS offline reports and never retries mutations', () => {
    const defaults = createQueryClient().getDefaultOptions();
    expect(defaults.queries).toMatchObject({ networkMode: 'always', retry: shouldRetryQuery, refetchOnWindowFocus: false });
    expect(defaults.mutations).toEqual({ networkMode: 'always', retry: 0 });
    expect(SNAPSHOT_INTERVAL_MS).toBe(15_000);
  });
});
