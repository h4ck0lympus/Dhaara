import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { LifecycleError, MESSAGES, STOP_GRACE_MS } from '../src/lifecycle.js';
import { FAKE, fakeEnv, freePort, live, readPids, rejection, serviceFactory, tempDir, until, workspace } from './helpers.js';

const service = serviceFactory();
const fake = async (mode: string, extra: Record<string, string> = {}, timeoutMs = 15_000) =>
  service({ port: await freePort(), workspace: workspace(), entryPoint: FAKE, timeoutMs, env: fakeEnv(mode, extra) });

describe('ManagedService stop, cancel and crash (spec §6.4.6-6.4.7)', () => {
  it('stop closes the lease; the service exits well inside the grace period', async () => {
    const managed = await fake('ok');
    const { pid } = await managed.start();
    const started = Date.now();
    await managed.stop();
    expect(Date.now() - started).toBeLessThan(STOP_GRACE_MS);
    expect(live(pid)).toBe(false);
    expect(managed.state).toBe('stopped');
    await managed.stop();
    expect(managed.state).toBe('stopped');
  });

  it('stop before any start is a no-op', async () => {
    const managed = await fake('ok');
    await managed.stop();
    expect(managed.state).toBe('stopped');
  });

  it('cancel during startup rejects with cancelled and removes the whole owned group', async () => {
    const pidfile = path.join(tempDir(), 'pids.json');
    const managed = await fake('grandchild', { DHARA_FAKE_PIDFILE: pidfile }, 30_000);
    const attempt = managed.start();
    await until(() => readPids(pidfile).length === 2);
    const pids = readPids(pidfile);
    await managed.cancel();
    const error = await rejection(attempt);
    expect([error.code, error.message]).toEqual(['cancelled', MESSAGES.cancelled]);
    expect(managed.state).toBe('stopped');
    await until(() => !pids.some(live));
  });

  it('a startup timeout also removes an owned descendant', async () => {
    const pidfile = path.join(tempDir(), 'pids.json');
    const managed = await fake('grandchild', { DHARA_FAKE_PIDFILE: pidfile }, 400);
    const error = await rejection(managed.start());
    expect(error.code).toBe('timeout');
    const pids = readPids(pidfile);
    expect(pids).toHaveLength(2);
    await until(() => !pids.some(live));
  });

  it('reports a crash once, cleans the group, never restarts by itself; Retry is exactly one new spawn', async () => {
    const pidfile = path.join(tempDir(), 'pids.json');
    const managed = await fake('grandchild', { DHARA_FAKE_PIDFILE: pidfile, DHARA_FAKE_ACK: '1' });
    const first = await managed.start();
    const pids = readPids(pidfile);
    expect(pids[0]).toBe(first.pid);
    const crashes: LifecycleError[] = [];
    managed.on('crashed', (error) => crashes.push(error));
    process.kill(first.pid, 'SIGKILL');
    await until(() => crashes.length === 1);
    expect([crashes[0].code, crashes[0].message]).toEqual(['crashed', MESSAGES.crashed]);
    await until(() => !pids.some(live));
    await delay(300);
    expect(managed.state).toBe('crashed');
    expect(readPids(pidfile)).toEqual(pids);
    const retries = [managed.start(), managed.start(), managed.start()];
    expect(new Set(retries).size).toBe(1);
    const second = await retries[0];
    expect(second.pid).not.toBe(first.pid);
    expect(readPids(pidfile)[0]).toBe(second.pid);
    expect(crashes).toHaveLength(1);
  });
});
