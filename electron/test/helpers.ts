import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach } from 'vitest';
import { LifecycleError, ManagedService, prepareWorkspace, type ManagedConfig } from '../src/lifecycle.js';
import { tempDir } from './proc.js';

export { admin, live, readPids, tempDir, until } from './proc.js';
export const ELECTRON_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = path.resolve(ELECTRON_ROOT, '..');
export const PYTHON = path.join(REPO_ROOT, '.venv/bin/python');
export const RUN_PY = path.join(REPO_ROOT, 'run.py');
export const FAKE = path.join(ELECTRON_ROOT, 'test/fixtures/fake_service.py');

export function workspace(): string {
  return prepareWorkspace(path.join(tempDir(), 'data'), '/');
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

export async function rejection(promise: Promise<unknown>): Promise<LifecycleError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof LifecycleError) return error;
    throw error;
  }
  throw new Error('Expected a LifecycleError');
}

export function fakeEnv(mode: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { ...process.env, DHARA_FAKE_MODE: mode, ...extra };
}

/** Creates services that are always cancelled (and their groups cleaned) after each test. */
export function serviceFactory(): (config: Partial<ManagedConfig> & Pick<ManagedConfig, 'port' | 'workspace'>) => ManagedService {
  const services: ManagedService[] = [];
  afterEach(async () => {
    await Promise.all(services.splice(0).map((service) => service.cancel()));
  });
  return (config) => {
    const service = new ManagedService({ python: PYTHON, entryPoint: RUN_PY, timeoutMs: 30_000, env: process.env, ...config });
    services.push(service);
    return service;
  };
}
