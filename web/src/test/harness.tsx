import 'fake-indexeddb/auto';
import type { ReactElement } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { vi } from 'vitest';
import { createQueryClient } from '../state/queryClient';

export type StubCall = { url: string; method: string; body: unknown };

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export function stubFetch(route: (call: StubCall) => Response | undefined): StubCall[] {
  const calls: StubCall[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call: StubCall = {
      url: String(input),
      method: init.method ?? 'GET',
      body: typeof init.body === 'string' ? JSON.parse(init.body) : null,
    };
    calls.push(call);
    return route(call) ?? jsonResponse(404, { detail: `Not stubbed: ${call.method} ${call.url}` });
  }));
  return calls;
}

export function installDialogPolyfill(): void {
  if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.open = true; };
  }
  if (typeof HTMLDialogElement.prototype.close !== 'function') {
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.open = false; };
  }
}

export function renderWithClient(ui: ReactElement, seed?: (queryClient: QueryClient) => void): RenderResult & { queryClient: QueryClient } {
  const queryClient = createQueryClient();
  seed?.(queryClient);
  return { queryClient, ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>) };
}
