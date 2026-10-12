// The only fetch( in src/ (spec §4.2, contract §3.1). Same origin, request marker, body-shape error normalisation, zod-parsed responses.
import { connection } from '../domain/connection';
import { S } from '../strings';
import type { z } from '../zod';
import { ENDPOINTS, endpointPath, type EndpointKey } from './endpoints';

export type ApiErrorKind = 'network' | 'http' | 'parse';

export class ApiError extends Error {
  // status is null only for 'network'.
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

export function normaliseError(status: number, bodyText: string): string {
  let body: unknown = null;
  try {
    body = JSON.parse(bodyText);
  } catch {
    // Not JSON: fall through to the status message.
  }
  const detail = typeof body === 'object' && body !== null ? (body as { detail?: unknown }).detail : undefined;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map((item: unknown) => {
        const msg = typeof item === 'object' && item !== null ? (item as { msg?: unknown }).msg : undefined;
        return typeof msg === 'string' ? msg : JSON.stringify(item);
      })
      .join('; ');
  }
  return `Request failed (${status})`;
}

export type ApiOptions = { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; signal?: AbortSignal };

const unauthorizedListeners = new Set<() => void>();

export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

export async function api<T>(path: `/${string}`, schema: z.ZodType<T>, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-Noema-Request': '1' };
  let body: BodyInit | undefined;
  if (options.body instanceof FormData) body = options.body;
  else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers['Content-Type'] = 'application/json';
  }
  let status: number;
  let ok: boolean;
  let text: string;
  try {
    const response = await fetch('/api' + path, { method: options.method ?? 'GET', headers, body, credentials: 'same-origin', signal: options.signal });
    status = response.status;
    ok = response.ok;
    text = await response.text(); // the body is read once, as text
  } catch (error) {
    if (isAbort(error)) throw error;
    connection.report('network-error');
    throw new ApiError('network', S.networkError, null);
  }
  if (!ok) {
    // /api/session answers a wrong token with 401; that is an inline field error, never a global Unlock.
    if (status === 401 && !path.startsWith('/session')) for (const listener of [...unauthorizedListeners]) listener();
    throw new ApiError('http', normaliseError(status, text), status);
  }
  try {
    return schema.parse(text === '' ? null : JSON.parse(text));
  } catch {
    throw new ApiError('parse', S.unexpectedResponse, status);
  }
}

export function call<T>(
  key: EndpointKey,
  schema: z.ZodType<T>,
  options: { params?: Record<string, string | number>; query?: Record<string, string | number | undefined>; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  return api(endpointPath(key, options.params, options.query), schema, { method: ENDPOINTS[key].method, body: options.body, signal: options.signal });
}
