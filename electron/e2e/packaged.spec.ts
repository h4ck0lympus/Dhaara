import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { getFreePort } from '../../web/e2e/server.js';
import { live, until } from '../test/proc.js';
import { REPO_ROOT, tempDir } from './fixtures.js';

const OUT = path.join(REPO_ROOT, 'release/out');
const APPIMAGE = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((name) => /^Dhara-.+-x86_64\.AppImage$/.test(name)).map((name) => path.join(OUT, name))[0] : undefined;
const SHELL = 'usr/lib/dhara/dhara';
const SERVICE = 'usr/lib/dhara/resources/service/dhara-service/dhara-service';

const cmdline = (pid: number) => fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean);
const parentPid = (pid: number) => Number(fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ')[1]);

// The real artifact, mounted by its own runtime (FUSE), exactly as a user runs it: an extracted tree would be owned by the
// extracting user and could not prove the mounted-ownership rule the launcher depends on (packaging plan, pre-flight finding 2).
test.skip(APPIMAGE === undefined, 'release/out/Dhara-<version>-x86_64.AppImage is absent: run npm --prefix electron run package first');

test('the AppImage runs the bundled service sandboxed on a private workspace, and SIGTERM stops both with exit 0', async () => {
  const root = tempDir('dhara-packaged-');
  const dataDir = path.join(root, 'workspace');
  const port = await getFreePort();
  const origin = `http://127.0.0.1:${port}`;
  // The owner may be using 8765 right now: the test port needs DHARA_ELECTRON_TEST and therefore --server, and --server
  // switches off the packaged managed default, so --manage-service is spelled out (cli.ts); the bundled service stays the default.
  const child = spawn(APPIMAGE!, ['--manage-service', '--data-dir', dataDir, '--server', origin, '--profile', path.join(root, 'profile')], {
    env: { ...process.env, DHARA_ELECTRON_TEST: '1', DHARA_ELECTRON_TEST_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); });
  child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); });
  const exited = new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code)));
  const seen: { identity?: { protocol: number; pid: number } } = {};   // filled inside the closure, which TypeScript's narrowing cannot see
  await until(async () => {
    if (child.exitCode !== null) throw new Error(`the AppImage exited early with ${child.exitCode}:\n${output}`);
    try {
      seen.identity = (await (await fetch(`${origin}/api/desktop-instance`)).json()) as { protocol: number; pid: number };
      return true;
    } catch {
      return false;
    }
  }, 60_000);
  const identity = seen.identity!;
  expect(identity.protocol).toBe(2);
  const service = cmdline(identity.pid);
  const ownerAt = service.indexOf('--owner-pid');
  expect(service[0].endsWith(`/${SERVICE}`)).toBe(true);   // the frozen service: no interpreter, no entry point
  expect(service.slice(1, ownerAt)).toEqual(['--desktop-managed', '--host', '127.0.0.1', '--port', String(port), '--data-dir', fs.realpathSync(dataDir)]);
  const shellPid = Number(service[ownerAt + 1]);
  expect(cmdline(shellPid)[0].endsWith(`/${SHELL}`)).toBe(true);   // owned by the packaged shell (app.isPackaged, resources/app)
  expect(parentPid(shellPid)).toBe(child.pid);                     // which the launcher spawned (the runtime execs AppRun in the launched pid: pre-flight finding 5)
  expect(fs.statSync(dataDir).mode & 0o777).toBe(0o700);
  expect(output).not.toContain('SUID sandbox helper');             // Chromium's sandbox abort never happened, and --no-sandbox was never used
  child.kill('SIGTERM');                                           // forwarded by the launcher; the shell runs its close checkpoint and quits
  expect(await exited).toBe(0);
  await expect.poll(() => live(identity.pid), { timeout: 10_000 }).toBe(false);
  expect(spawnSync('flock', ['--nonblock', path.join(dataDir, '.dhara-service.lock'), 'true']).status).toBe(0);   // the lock is released
});

test('the AppImage --help states the managed default', () => {
  const help = spawnSync(APPIMAGE!, ['--help'], { encoding: 'utf8', env: { ...process.env, XDG_DATA_HOME: '/xdg-help' } });
  expect(help.status).toBe(0);
  expect(help.stdout).toContain('Default: managed service on /xdg-help/dhara/workspace; --server <url> connects to an external service.');
});
