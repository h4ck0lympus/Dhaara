import fs from 'node:fs';
import path from 'node:path';
import { ensurePrivateDir, hasFinalComponent } from './paths.js';

export const DEFAULT_MANAGED_PORT = 8765, STOP_GRACE_MS = 5_000, TERM_GRACE_MS = 1_000, ACK_MAX_BYTES = 4_096;
export const STRIPPED_ENV = [
  'NOEMA_MODEL', 'NOEMA_SPEECH_MODEL', 'NOEMA_TOKEN', 'NOEMA_ACCESS_TOKEN', 'NOEMA_ALLOWED_HOSTS', 'NOEMA_ALLOW_REMOTE_MODEL', 'NOEMA_DATA_DIR',
] as const;

export type LifecycleCode = 'workspace' | 'workspace-locked' | 'port-in-use' | 'invalid-lease' | 'python-missing' | 'early-exit'
  | 'startup-exit' | 'timeout' | 'identity' | 'cancelled' | 'crashed';

export class LifecycleError extends Error {
  constructor(readonly code: LifecycleCode, message: string) {
    super(message);
    this.name = 'LifecycleError';
  }
}

// Existing wording from desktop/src/service.rs (line numbers in contract §8.2).
export const MESSAGES = {
  workspaceLocked: 'This workspace already has a service. Use external mode or stop it deliberately.',
  portInUse: 'Endpoint is occupied or unavailable. Do not stop its occupant; choose external mode or a deliberate stable endpoint.',
  pythonMissing: 'Python not found. Check --python and installed dependencies; no installation is automatic.',
  earlyExit: 'Python exited before accepting the desktop lease.',
  startupExit: 'Service exited during startup. Check Python dependencies, entry point and data permissions.',
  timeout: 'Service readiness timed out. Check Python dependencies and data permissions, then Retry.',
  identity: 'Service identity verification failed. No workspace credentials were sent.',
  crashed: 'Managed service stopped unexpectedly. Your local draft stays in this window; Retry explicitly.',
  noDir: 'Choose a dedicated data directory.',
  createDir: 'Cannot create the data directory. Check its permissions.',
  protectDir: 'Cannot protect the data directory.',
  accessDir: 'Cannot access the data directory.',
  cancelled: 'Managed startup was cancelled.',
} as const;

/** 8765 always; a test-only override needs NOEMA_ELECTRON_TEST=1 and is unreachable from the CLI (spec §6.4.2). */
export function managedPort(env: NodeJS.ProcessEnv): number {
  if (env.NOEMA_ELECTRON_TEST !== '1') return DEFAULT_MANAGED_PORT;
  const raw = env.NOEMA_ELECTRON_TEST_PORT ?? '';
  const port = Number(raw);
  return /^[0-9]+$/.test(raw) && port >= 1024 && port <= 65535 ? port : DEFAULT_MANAGED_PORT;
}

/** Spec §6.4.1: resolve, refuse a path with no final component, create 0700, canonicalise. */
export function prepareWorkspace(dataDir: string, cwd: string): string {
  if (!hasFinalComponent(dataDir)) throw new LifecycleError('workspace', MESSAGES.noDir);
  const resolved = path.resolve(cwd, dataDir);
  const failed = ensurePrivateDir(resolved);
  if (failed === 'create') throw new LifecycleError('workspace', MESSAGES.createDir);
  if (failed === 'protect') throw new LifecycleError('workspace', MESSAGES.protectDir);
  try {
    return fs.realpathSync(resolved);
  } catch {
    throw new LifecycleError('workspace', MESSAGES.accessDir);
  }
}

export function exitCodeError(code: number | null): LifecycleError {
  if (code === 10) return new LifecycleError('workspace-locked', MESSAGES.workspaceLocked);
  if (code === 11) return new LifecycleError('port-in-use', MESSAGES.portInUse);
  if (code === 12) return new LifecycleError('invalid-lease', MESSAGES.startupExit);
  return new LifecycleError('startup-exit', MESSAGES.startupExit);
}

function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

export function ackMatches(line: string, expected: { instance: string; pid: number; workspace: string; port: number }): boolean {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return false;
  }
  return hasExactKeys(value, ['protocol', 'instance', 'pid', 'workspace', 'port']) && value.protocol === 2
    && value.instance === expected.instance && value.pid === expected.pid
    && value.workspace === expected.workspace && value.port === expected.port;
}

export function identityMatches(body: unknown, expected: { instance: string; pid: number }): boolean {
  return hasExactKeys(body, ['protocol', 'instance', 'pid']) && body.protocol === 2
    && body.instance === expected.instance && body.pid === expected.pid;
}
