import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { env as readEnv, STRIPPED_ENV } from './env.js';
import { ensurePrivateDir, hasFinalComponent } from './paths.js';

export const DEFAULT_MANAGED_PORT = 8765, STOP_GRACE_MS = 5_000, TERM_GRACE_MS = 1_000, ACK_MAX_BYTES = 4_096;
export { STRIPPED_ENV };

export type LifecycleCode = 'workspace' | 'workspace-locked' | 'port-in-use' | 'invalid-lease' | 'python-missing' | 'early-exit'
  | 'startup-exit' | 'timeout' | 'identity' | 'cancelled' | 'crashed';

export class LifecycleError extends Error {
  constructor(readonly code: LifecycleCode, message: string) {
    super(message);
    this.name = 'LifecycleError';
  }
}

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

export function managedPort(source: NodeJS.ProcessEnv): number {
  if (readEnv('ELECTRON_TEST', source) !== '1') return DEFAULT_MANAGED_PORT;
  const raw = readEnv('ELECTRON_TEST_PORT', source) ?? '';
  const port = Number(raw);
  return /^[0-9]+$/.test(raw) && port >= 1024 && port <= 65535 ? port : DEFAULT_MANAGED_PORT;
}

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

export type ManagedConfig = { python: string; entryPoint: string; workspace: string ; port: number; timeoutMs: number; env: NodeJS.ProcessEnv };
export type ServiceHandle = { pid: number; instance: string; origin: string };
export type ManagedState = 'idle' | 'starting' | 'running' | 'crashed' | 'stopping' | 'stopped';
type Child = ChildProcessByStdio<Writable, Readable, null>;

const IDENTITY_MAX_BYTES = 8_192;
const POLL_MS = 40;
const cancelledError = () => new LifecycleError('cancelled', MESSAGES.cancelled);

function signalGroup(pgid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pgid, signal);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ESRCH' && code !== 'EPERM') throw error;
  }
}

function groupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch {
    return false;
  }
}

function readIdentity(port: number, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve) => {
    const request = http.get({ host: '127.0.0.1', port, path: '/api/desktop-instance', agent: false, timeout: timeoutMs }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > IDENTITY_MAX_BYTES) request.destroy();
        else chunks.push(chunk);
      });
      response.on('end', () => {
        if (response.statusCode !== 200) return resolve(null);
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          resolve(null);
        }
      });
      response.on('error', () => resolve(null));
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(null));
    request.on('close', () => resolve(null));
  });
}

export class ManagedService extends EventEmitter<{ crashed: [LifecycleError]; exit: [number | null] }> {
  readonly #config: ManagedConfig;
  #state: ManagedState = 'idle';
  #child: Child | null = null;
  #handle: ServiceHandle | null = null;
  #starting: Promise<ServiceHandle> | null = null;
  #cancelled = false;
  #abort: ((error: LifecycleError) => void) | null = null;
  readonly #exits = new WeakMap<Child, Promise<number | null>>();
  readonly #stops = new WeakMap<Child, Promise<void>>();

  constructor(config: ManagedConfig) {
    super();
    this.#config = config;
  }

  get state(): ManagedState {
    return this.#state;
  }

  start(): Promise<ServiceHandle> {
    if (this.#starting) return this.#starting;
    if (this.#state === 'running' && this.#handle) return Promise.resolve(this.#handle);
    const attempt = this.#launch();
    this.#starting = attempt;
    const settle = () => {
      if (this.#starting === attempt) this.#starting = null;
    };
    attempt.then(settle, settle);
    return attempt;
  }

  async cancel(): Promise<void> {
    const attempt = this.#starting;
    if (attempt) {
      this.#cancelled = true;
      this.#abort?.(cancelledError());
      await attempt.catch(() => undefined);
    }
    await this.stop();
  }

  async stop(): Promise<void> {
    const child = this.#child;
    if (child === null) {
      this.#state = 'stopped';
      return;
    }
    if (this.#state === 'running' || this.#state === 'crashed') this.#state = 'stopping';
    await this.#stopChild(child);
    if (this.#child === child && this.#state !== 'starting') {
      this.#state = 'stopped';
      this.#handle = null;
    }
  }

  async #launch(): Promise<ServiceHandle> {
    this.#cancelled = false;
    const previous = this.#child;
    if (previous) await this.#stopChild(previous);
    if (this.#cancelled) {
      this.#state = 'stopped';
      throw cancelledError();
    }
    this.#state = 'starting';
    this.#handle = null;
    const { python, entryPoint, workspace, port, timeoutMs } = this.#config;
    const deadline = Date.now() + timeoutMs;
    const instance = randomBytes(32).toString('hex');
    const env: NodeJS.ProcessEnv = { ...this.#config.env };
    for (const key of STRIPPED_ENV) delete env[key];
    let child: Child;
    try {
      const args = ['--desktop-managed', '--host', '127.0.0.1', '--port', String(port), '--data-dir', workspace, '--owner-pid', String(process.pid)];
      if (entryPoint !== '') args.unshift(entryPoint);
      child = spawn(python, args, { detached: true, stdio: ['pipe', 'pipe', 'ignore'], env });
    } catch {
      this.#state = 'crashed';
      throw new LifecycleError('python-missing', MESSAGES.pythonMissing);
    }
    this.#child = child;
    this.#exits.set(child, new Promise((resolve) => {
      child.on('exit', (code) => resolve(code));
      child.on('error', () => {
        if (child.pid === undefined) resolve(null);
      });
    }));
    child.on('exit', (code) => this.#onExit(child, code));
    let leaseFailed = false;
    child.stdin.on('error', () => {
      leaseFailed = true;
    });
    child.stdout.on('error', () => undefined);
    if (child.pid === undefined) {
      await this.#exits.get(child);
      this.#state = 'crashed';
      throw new LifecycleError('python-missing', MESSAGES.pythonMissing);
    }
    const pid: number = child.pid;
    child.stdin.write(`${JSON.stringify({ instance })}\n`);
    try {
      const line = await this.#readAck(child, deadline, () => leaseFailed);
      if (!ackMatches(line, { instance, pid, workspace, port })) throw new LifecycleError('identity', MESSAGES.identity);
      const body = await readIdentity(port, Math.max(250, deadline - Date.now()));
      if (this.#cancelled) throw cancelledError();
      if (!identityMatches(body, { instance, pid })) await Promise.race([this.#exits.get(child), delay(100)]);
      if (child.exitCode !== null || child.signalCode !== null) throw exitCodeError(child.exitCode);
      if (!identityMatches(body, { instance, pid })) throw new LifecycleError('identity', MESSAGES.identity);
      this.#state = 'running';
      this.#handle = { pid, instance, origin: `http://127.0.0.1:${port}` };
      return this.#handle;
    } catch (error) {
      await this.#stopChild(child);
      if (this.#cancelled) {
        this.#state = 'stopped';
        throw cancelledError();
      }
      this.#state = 'crashed';
      throw error;
    }
  }

  #readAck(child: Child, deadline: number, leaseFailed: () => boolean): Promise<string> {
    return new Promise((resolve, reject) => {
      let buffer = Buffer.alloc(0);
      let settled = false;
      const finish = (settle: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.stdout.off('data', onData);
        child.stdout.destroy();
        this.#abort = null;
        settle();
      };
      const onData = (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        const newline = buffer.indexOf(0x0a);
        if (newline >= 0 && newline < ACK_MAX_BYTES) finish(() => resolve(buffer.subarray(0, newline).toString('utf8')));
        else if (buffer.length >= ACK_MAX_BYTES) finish(() => reject(new LifecycleError('identity', MESSAGES.identity)));
      };
      const timer = setTimeout(() => finish(() => reject(new LifecycleError('timeout', MESSAGES.timeout))), Math.max(0, deadline - Date.now()));
      this.#abort = (error) => finish(() => reject(error));
      child.stdout.on('data', onData);
      void this.#exits.get(child)!.then((code) => finish(() => reject(leaseFailed() ? new LifecycleError('early-exit', MESSAGES.earlyExit) : exitCodeError(code))));
      if (this.#cancelled) this.#abort(cancelledError());
    });
  }

  #onExit(child: Child, code: number | null): void {
    this.emit('exit', code);
    if (this.#child !== child || this.#state !== 'running') return;
    this.#state = 'crashed';
    this.#handle = null;
    void this.#stopChild(child);
    this.emit('crashed', new LifecycleError('crashed', MESSAGES.crashed));
  }

  #stopChild(child: Child): Promise<void> {
    let stopping = this.#stops.get(child);
    if (!stopping) {
      stopping = this.#terminate(child);
      this.#stops.set(child, stopping);
    }
    return stopping;
  }

  async #terminate(child: Child): Promise<void> {
    const exited = this.#exits.get(child) ?? Promise.resolve(null);
    const pgid = child.pid;
    if (pgid === undefined) {
      await exited;
      return;
    }
    if (!child.stdin.destroyed) child.stdin.end();
    const grace = new AbortController();
    await Promise.race([exited, delay(STOP_GRACE_MS, undefined, { signal: grace.signal }).catch(() => undefined)]);
    grace.abort();
    signalGroup(pgid, 'SIGTERM');
    const termDeadline = Date.now() + TERM_GRACE_MS;
    while (groupAlive(pgid) && Date.now() < termDeadline) await delay(POLL_MS);
    signalGroup(pgid, 'SIGKILL');
    await exited;
  }
}
