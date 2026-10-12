import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { LifecycleError, MESSAGES, prepareWorkspace } from '../src/lifecycle.js';
import { ELECTRON_ROOT, FAKE, PYTHON, REPO_ROOT, RUN_PY, admin, freePort, live, readPids, rejection, serviceFactory, tempDir, until, workspace } from './helpers.js';

const service = serviceFactory();
const strays: ChildProcess[] = [];
afterEach(() => {
  for (const child of strays.splice(0)) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
});

function withoutSecrets(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = { ...process.env, ...extra };
  delete env.NOEMA_ACCESS_TOKEN;
  delete env.NOEMA_DATA_DIR;
  return env;
}

function startOwner(args: string[], env: NodeJS.ProcessEnv = process.env) {
  if (!fs.existsSync(path.join(ELECTRON_ROOT, 'dist/lifecycle.js'))) throw new Error('Run npm --prefix electron run build first');
  const owner = spawn(process.execPath, [path.join(ELECTRON_ROOT, 'test/fixtures/owner.mjs'), ...args], { stdio: ['ignore', 'pipe', 'ignore'], env });
  strays.push(owner);
  const first = new Promise<{ ready?: number; error?: string }>((resolve) => {
    let text = '';
    owner.stdout.on('data', (chunk: Buffer) => {
      text += chunk.toString('utf8');
      const newline = text.indexOf('\n');
      if (newline >= 0) resolve(JSON.parse(text.slice(0, newline)));
    });
  });
  return { owner, first };
}

describe('managed service parity (ported from tests/test_managed_service.py)', () => {
  it('cold reopen, retries while running and a competing owner keep one service and its state (:104)', async () => {
    const port = await freePort();
    const ws = workspace();
    const owner = service({ port, workspace: ws });
    const { pid } = await owner.start();
    const identity = await (await fetch(`http://127.0.0.1:${port}/api/desktop-instance`)).json() as Record<string, unknown>;
    expect(identity.pid).toBe(pid);
    expect(Object.keys(identity).sort()).toEqual(['instance', 'pid', 'protocol']);
    expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toContain('Noema');   // existing browser workflow
    const task = await admin(ws, port, '/tasks', { method: 'POST', body: { title: 'Synthetic task', priority: 'low' } });
    const dependent = await admin(ws, port, '/tasks', { method: 'POST', body: { title: 'Synthetic dependent', dependencies: [task.id] } });
    await admin(ws, port, '/focus', { method: 'POST', body: { task_id: task.id, pinned: true } });
    const retries = await Promise.all(Array.from({ length: 8 }, () => owner.start()));
    expect(new Set(retries.map((handle) => handle.pid))).toEqual(new Set([pid]));
    const competitor = service({ port, workspace: ws });
    expect((await rejection(competitor.start())).code).toBe('workspace-locked');
    expect((await admin(ws, port, '/health')).ok).toBe(true);
    await owner.stop();
    expect(live(pid)).toBe(false);
    const reopened = service({ port, workspace: ws });
    expect((await reopened.start()).pid).not.toBe(pid);
    const state = await admin(ws, port, '/state');
    const tasks = new Map<string, any>(state.tasks.map((item: any) => [item.id, item]));
    expect(tasks.size).toBe(2);
    expect(tasks.get(task.id).priority).toBe('low');
    expect(tasks.get(dependent.id).dependencies).toEqual([task.id]);
    expect(state.focus).toMatchObject({ pinned: true, task_id: task.id });
  });

  it('never contacts or kills a port occupant (:135)', async () => {
    let contacts = 0;
    const occupant = net.createServer((socket) => {
      contacts += 1;
      socket.destroy();
    });
    await new Promise<void>((resolve) => occupant.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = occupant.address() as net.AddressInfo;
      const error = await rejection(service({ port, workspace: workspace() }).start());
      expect([error.code, error.message]).toEqual(['port-in-use', MESSAGES.portInUse]);
      expect(contacts).toBe(0);
      expect(occupant.listening).toBe(true);
    } finally {
      occupant.close();
    }
  });

  it.each(['entry', 'dependency'])('bounds a %s failure as a startup error (:148)', async (failure) => {
    const dir = tempDir();
    const entry = path.join(dir, failure === 'entry' ? 'missing-entry.py' : 'missing-dependency.py');
    if (failure === 'dependency') fs.writeFileSync(entry, 'raise ModuleNotFoundError("synthetic dependency")\n');
    const error = await rejection(service({ port: await freePort(), workspace: workspace(), entryPoint: entry }).start());
    expect([error.code, error.message]).toEqual(['startup-exit', MESSAGES.startupExit]);
  });

  it('refuses a data directory that is a file before spawning (:148 permissions)', () => {
    const file = path.join(tempDir(), 'file');
    fs.writeFileSync(file, 'not a directory');
    expect(() => prepareWorkspace(file, '/')).toThrow(MESSAGES.createDir);
  });

  it('needs an explicit Retry after a crash, and Retry rebinds the fixed port at once (:183, SO_REUSEADDR)', async () => {
    const port = await freePort();
    const owner = service({ port, workspace: workspace() });
    const first = await owner.start();
    const agent = new http.Agent({ keepAlive: true });   // a live connection leaves TIME_WAIT/FIN_WAIT on the port
    await new Promise<void>((resolve, reject) => {
      http.get({ host: '127.0.0.1', port, path: '/api/health', agent }, (response) => {
        response.resume();
        response.on('end', resolve);
      }).on('error', reject);
    });
    const crashed = once(owner, 'crashed') as Promise<[LifecycleError]>;
    process.kill(first.pid, 'SIGKILL');
    const [error] = await crashed;
    expect(error.message).toBe(MESSAGES.crashed);
    await delay(300);
    expect(owner.state).toBe('crashed');   // no automatic restart loop
    const second = await owner.start();
    expect(second.pid).not.toBe(first.pid);
    expect(((await (await fetch(`http://127.0.0.1:${port}/api/desktop-instance`)).json()) as { pid: number }).pid).toBe(second.pid);
    agent.destroy();
  });

  it.each(['SIGTERM', 'SIGKILL'] as const)('owner %s closes the lease and frees the lock and port (:194)', async (signal) => {
    const port = await freePort();
    const ws = workspace();
    const { owner, first } = startOwner([PYTHON, RUN_PY, ws, String(port), '30000']);
    const { ready } = await first;
    expect(typeof ready).toBe('number');
    owner.kill(signal);
    await until(() => !live(ready!));
    expect((await service({ port, workspace: ws }).start()).pid).not.toBe(ready);
  });

  it('owner SIGKILL before the lease watcher still stops Python through PDEATHSIG (:307)', async () => {
    const port = await freePort();
    const ws = workspace();
    const pidfile = path.join(tempDir(), 'pids.json');
    const { owner } = startOwner([PYTHON, FAKE, ws, String(port), '30000'], { ...process.env, NOEMA_FAKE_MODE: 'pdeathsig', NOEMA_FAKE_PIDFILE: pidfile });
    await until(() => readPids(pidfile).length === 1);
    const [pid] = readPids(pidfile);
    owner.kill('SIGKILL');
    await until(() => !live(pid));
    await service({ port, workspace: ws }).start();
  });

  it('never owns an external service on the same workspace (:206)', async () => {
    const port = await freePort();
    const ws = workspace();
    const external = spawn(PYTHON, [RUN_PY, '--data-dir', ws, '--port', String(port)], { stdio: 'ignore', env: withoutSecrets() });
    strays.push(external);
    await until(() => fs.existsSync(path.join(ws, 'admin.token')));
    await until(async () => {
      try {
        return (await fetch(`http://127.0.0.1:${port}/api/health`)).ok;
      } catch {
        return false;
      }
    });
    expect((await fetch(`http://127.0.0.1:${port}/api/desktop-instance`)).status).toBe(404);
    const error = await rejection(service({ port, workspace: ws }).start());
    expect(error.code).toBe('workspace-locked');
    expect(external.exitCode).toBeNull();
    expect((await admin(ws, port, '/state')).tasks).toEqual([]);
  });

  it('lets a separately wrapped agent survive an owned quit (:244)', async () => {
    const port = await freePort();
    const ws = workspace();
    const owner = service({ port, workspace: ws });
    await owner.start();
    const task = await admin(ws, port, '/tasks', { method: 'POST', body: { title: 'Synthetic agent task' } });
    const { token } = await admin(ws, port, '/tokens', { method: 'POST', body: { name: 'Fixture agent', scope: 'agent', task_ids: [task.id] } });
    const release = path.join(tempDir(), 'release');
    const code = `from pathlib import Path; import time\np=Path(${JSON.stringify(release)})\nwhile not p.exists(): time.sleep(.05)`;
    const agent = spawn(PYTHON, [path.join(REPO_ROOT, 'tools/agent.py'), '--url', `http://127.0.0.1:${port}`, '--task', task.id,
      '--outbox', path.join(tempDir(), 'agent-outbox.sqlite3'), '--', PYTHON, '-c', code], { stdio: 'ignore', env: { ...process.env, NOEMA_TOKEN: token } });
    strays.push(agent);
    const agentExit = once(agent, 'exit');
    try {
      await until(async () => (await admin(ws, port, '/state')).runs.length === 1);
      await owner.stop();
      expect(agent.exitCode).toBeNull();
      await service({ port, workspace: ws }).start();
      fs.writeFileSync(release, '');
      const [exitCode] = await agentExit;
      expect(exitCode).toBe(0);
      const state = await admin(ws, port, '/state');
      expect(state.tasks[0].status).toBe('todo');
      expect(state.runs[0].effective_status).toBe('review');
    } finally {
      fs.writeFileSync(release, '');
    }
  });

  it('disables inherited optional features and never uses NOEMA_DATA_DIR (:292)', async () => {
    const root = tempDir();
    const ws = prepareWorkspace(path.join(root, 'selected'), '/');
    const port = await freePort();
    const env = {
      ...process.env,
      NOEMA_MODEL: 'must-not-start',
      NOEMA_SPEECH_MODEL: 'must-not-download',
      NOEMA_ACCESS_TOKEN: 'inherited-secret-not-used-'.repeat(2),
      NOEMA_DATA_DIR: path.join(root, 'not-selected'),
    };
    await service({ port, workspace: ws, env }).start();
    const state = await admin(ws, port, '/state');
    expect(state.capabilities.organizer).toBe(false);
    expect(state.capabilities.speech).toBe(false);
    expect(state.settings.observation_enabled).toBe(false);
    expect(fs.existsSync(path.join(root, 'not-selected'))).toBe(false);
  });

  it('serves a symlinked workspace through its canonical path', async () => {
    const root = tempDir();
    fs.mkdirSync(path.join(root, 'real'), { mode: 0o700 });
    fs.symlinkSync(path.join(root, 'real'), path.join(root, 'link'));
    const ws = prepareWorkspace(path.join(root, 'link'), '/');
    expect(ws).toBe(fs.realpathSync(path.join(root, 'real')));
    await service({ port: await freePort(), workspace: ws }).start();
    expect(fs.existsSync(path.join(root, 'real', 'admin.token'))).toBe(true);
  });
});
