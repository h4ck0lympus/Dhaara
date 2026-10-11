// Boot order (spec §4.2): GET /api/state; only on a 401, loopback auto-login; only on a second 401, Unlock.
import { S } from '../strings';
import { ApiError, call } from './client';
import { OkSchema, SnapshotSchema, type Snapshot } from './schemas';

export type BootResult = { kind: 'ready'; snapshot: Snapshot } | { kind: 'locked' } | { kind: 'unreachable'; error: ApiError };

export function fetchSnapshot(minutes: number | null, signal?: AbortSignal): Promise<Snapshot> {
  return call('state', SnapshotSchema, { query: { minutes: minutes ?? undefined }, signal });
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'http' && error.status === 401;
}

function unreachable(error: unknown): BootResult {
  return { kind: 'unreachable', error: error instanceof ApiError ? error : new ApiError('network', S.networkError, null) };
}

// A hung server must not hold the shell blank: an abort counts as unreachable and the shell opens disconnected.
const BOOT_TIMEOUT_MS = 10_000;

export async function boot(): Promise<BootResult> {
  try {
    return { kind: 'ready', snapshot: await fetchSnapshot(null, AbortSignal.timeout(BOOT_TIMEOUT_MS)) };
  } catch (error) {
    if (!isUnauthorized(error)) return unreachable(error);
  }
  try {
    await call('sessionCreate', OkSchema, { body: { token: '' }, signal: AbortSignal.timeout(BOOT_TIMEOUT_MS) });
    return { kind: 'ready', snapshot: await fetchSnapshot(null, AbortSignal.timeout(BOOT_TIMEOUT_MS)) };
  } catch (error) {
    return isUnauthorized(error) ? { kind: 'locked' } : unreachable(error);
  }
}

export async function unlock(token: string): Promise<void> {
  await call('sessionCreate', OkSchema, { body: { token } });
}

export async function signOut(): Promise<void> {
  await call('sessionDelete', OkSchema);
}
