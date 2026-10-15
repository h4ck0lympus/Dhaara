import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';

export const SNAPSHOT_INTERVAL_MS = 15_000;

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < 2 && error instanceof ApiError && (error.kind === 'network' || (error.status !== null && error.status >= 500));
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { networkMode: 'always', retry: shouldRetryQuery, refetchOnWindowFocus: false },
      mutations: { networkMode: 'always', retry: 0 },
    },
  });
}
