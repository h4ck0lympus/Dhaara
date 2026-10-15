import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MESSAGES, STRIPPED_ENV } from '../src/lifecycle.js';
import { FAKE, PYTHON, fakeEnv, freePort, live, readPids, rejection, serviceFactory, tempDir, workspace } from './helpers.js';

const service = serviceFactory();

async function fakeService(mode: string, extra: Record<string, string> = {}, timeoutMs = 15_000) {
  const port = await freePort();
  const ws = workspace();
  return { port, ws, managed: service({ port, workspace: ws, entryPoint: FAKE, timeoutMs, env: fakeEnv(mode, extra) }) };
}

describe('ManagedService.start (spec §6.4.2-6.4.4)', () => {
  it('spawns the exact protocol-2 command in its own session, with a 64-hex lease and a stripped environment', async () => {
    const envfile = path.join(tempDir(), 'env.json');
    const inherited = Object.fromEntries(STRIPPED_ENV.map((key) => [key, 'must-not-reach-python']));
    const { port, ws, managed } = await fakeService('env-dump', { ...inherited, DHARA_FAKE_ENVFILE: envfile, DHARA_KEEP_ME: 'yes' });
    const handle = await managed.start();
    const dump = JSON.parse(fs.readFileSync(envfile, 'utf8')) as { env: string[]; argv: string[]; lease: string; pid: number; pgid: number; sid: number; ppid: number };
    expect(dump.argv).toEqual(['--desktop-managed', '--host', '127.0.0.1', '--port', String(port), '--data-dir', ws, '--owner-pid', String(process.pid)]);
    expect(handle.instance).toMatch(/^[0-9a-f]{64}$/);
    expect(dump.lease).toBe(`{"instance":"${handle.instance}"}\n`);
    expect([dump.pgid, dump.sid, dump.ppid]).toEqual([dump.pid, dump.pid, process.pid]);
    for (const key of STRIPPED_ENV) expect(dump.env).not.toContain(key);
    expect(dump.env).toEqual(expect.arrayContaining(['PATH', 'DHARA_KEEP_ME', 'DHARA_FAKE_MODE']));
    expect(handle).toEqual({ pid: dump.pid, instance: handle.instance, origin: `http://127.0.0.1:${port}` });
    expect(managed.state).toBe('running');
  });

  it('spawns [python, ...args] when the entry point is empty, as for a frozen service (packaging spec §4)', async () => {
    const dir = tempDir();
    const frozen = path.join(dir, 'dhara-service');
    fs.writeFileSync(frozen, `#!/bin/sh\nexec ${JSON.stringify(PYTHON)} ${JSON.stringify(FAKE)} "$@"\n`, { mode: 0o755 });
    const envfile = path.join(dir, 'env.json');
    const port = await freePort();
    const ws = workspace();
    const managed = service({ port, workspace: ws, python: frozen, entryPoint: '', env: fakeEnv('env-dump', { DHARA_FAKE_ENVFILE: envfile }) });
    await managed.start();
    const dump = JSON.parse(fs.readFileSync(envfile, 'utf8')) as { argv: string[] };
    expect(dump.argv).toEqual(['--desktop-managed', '--host', '127.0.0.1', '--port', String(port), '--data-dir', ws, '--owner-pid', String(process.pid)]);
  });

  it('shares one attempt between concurrent calls and returns the running handle on Retry', async () => {
    const { managed } = await fakeService('ok');
    const first = managed.start();
    expect(managed.start()).toBe(first);
    const handle = await first;
    expect(await managed.start()).toEqual(handle);
  });

  it.each([
    ['locked', 'workspace-locked', MESSAGES.workspaceLocked],
    ['port', 'port-in-use', MESSAGES.portInUse],
    ['lease', 'invalid-lease', MESSAGES.startupExit],
  ])('maps the %s exit to %s', async (mode, code, message) => {
    const { managed } = await fakeService(mode);
    const error = await rejection(managed.start());
    expect([error.code, error.message]).toEqual([code, message]);
    expect(managed.state).toBe('crashed');
  });

  it('reports a service that dies between its ack and the identity check as a startup exit', async () => {
    const { managed } = await fakeService('die-after-ack');
    const error = await rejection(managed.start());
    expect([error.code, error.message]).toEqual(['startup-exit', MESSAGES.startupExit]);
  });

  it('reports a missing or empty interpreter as python-missing', async () => {
    for (const python of [path.join(tempDir(), 'missing-python'), '']) {
      const managed = service({ port: await freePort(), workspace: workspace(), python, entryPoint: FAKE, env: fakeEnv('ok') });
      const error = await rejection(managed.start());
      expect([error.code, error.message]).toEqual(['python-missing', MESSAGES.pythonMissing]);
    }
  });

  it('turns an exit before the lease into a bounded startup error, never an unhandled EPIPE', async () => {
    const pidfile = path.join(tempDir(), 'pids.json');
    const { managed } = await fakeService('early-exit', { DHARA_FAKE_PIDFILE: pidfile });
    const error = await rejection(managed.start());
    expect([['early-exit', MESSAGES.earlyExit], ['startup-exit', MESSAGES.startupExit]]).toContainEqual([error.code, error.message]);
    expect(readPids(pidfile).some(live)).toBe(false);
  });

  it('times out without an acknowledgement, then escalates to signals and stops the service', async () => {
    const pidfile = path.join(tempDir(), 'pids.json');
    const { managed } = await fakeService('hang', { DHARA_FAKE_PIDFILE: pidfile }, 400);
    const started = Date.now();
    const error = await rejection(managed.start());
    expect([error.code, error.message]).toEqual(['timeout', MESSAGES.timeout]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(400);
    expect(readPids(pidfile).some(live)).toBe(false);
  });

  it.each(['bad-ack', 'extra-key', 'long-ack', 'bad-http'])('%s fails identity, stops the service and never writes the workspace', async (mode) => {
    const pidfile = path.join(tempDir(), 'pids.json');
    const { ws, managed } = await fakeService(mode, { DHARA_FAKE_PIDFILE: pidfile });
    const error = await rejection(managed.start());
    expect([error.code, error.message]).toEqual(['identity', MESSAGES.identity]);
    expect(readPids(pidfile).some(live)).toBe(false);
    expect(fs.readdirSync(ws)).toEqual([]);
  });
});
