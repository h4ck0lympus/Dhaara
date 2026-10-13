import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { MESSAGES } from '../src/lifecycle.js';
import { STARTUP_TEXT } from '../src/protocol.js';
import { live, readPids } from '../test/proc.js';
import { closeWindow, killAll, launchNoema, openCapture, readDraft, tempDir, waitConnected } from './fixtures.js';
import { FAKE, appPage, mainUrl, managedSetup, overlayBounds, ownedServices, runElectron, servicePid, startupPage } from './managed.js';

test.afterEach(killAll);

test('starts the owned service, loads only the verified origin, and stops the service after the close checkpoint', async () => {
  const m = await managedSetup();
  const { app } = await launchNoema(m.args, { env: m.env });
  const page = await appPage(app, m.origin);
  await waitConnected(page);
  const pid = await servicePid(m.origin);
  expect(ownedServices(app.process().pid!)).toEqual([pid]);   // Electron main owns exactly this one service
  expect(fs.statSync(m.dataDir).mode & 0o777).toBe(0o700);    // created 0700 (spec §6.4.1)
  const closed = app.waitForEvent('close');
  await closeWindow(app);
  await closed;
  await expect.poll(() => live(pid), { timeout: 10_000 }).toBe(false);
});

test('an occupied port shows the occupied message with Retry, never contacts the occupant, and Retry works once it is free', async () => {
  const m = await managedSetup();
  let contacts = 0;
  const occupant = net.createServer((socket) => {
    contacts += 1;
    socket.destroy();
  });
  await new Promise<void>((resolve) => occupant.listen(m.port, '127.0.0.1', resolve));
  const { app } = await launchNoema(m.args, { env: m.env });
  const startup = await startupPage(app);
  await expect(startup.locator('#status')).toHaveText(MESSAGES.portInUse);
  await expect(startup.locator('#retry')).toBeEnabled();
  await expect(startup.locator('#cancel')).toHaveText('Cancel / Quit');
  expect(await mainUrl(app)).not.toMatch(/^http/);
  // startup: a full-window curtain (polled: Sway may still be resizing the new window)
  await expect.poll(async () => {
    const { content, views } = await overlayBounds(app);
    return views.some((view) => view.x === 0 && view.y === 0 && view.width === content.width && view.height === content.height);
  }).toBe(true);
  expect(contacts).toBe(0);
  await new Promise<void>((resolve) => occupant.close(() => resolve()));
  await startup.locator('#retry').click();
  await waitConnected(await appPage(app, m.origin));
  expect(contacts).toBe(0);
});

test('Cancel during startup stops the service and quits without a checkpoint', async () => {
  const m = await managedSetup();
  const pidfile = path.join(tempDir('noema-cancel-'), 'pids.json');
  const { app } = await launchNoema([...m.args, '--entry-point', FAKE, '--startup-timeout', '60'], {
    env: { ...m.env, NOEMA_FAKE_MODE: 'hang', NOEMA_FAKE_PIDFILE: pidfile },
  });
  const startup = await startupPage(app);
  await expect(startup.locator('#status')).toHaveText(STARTUP_TEXT.starting);
  await expect(startup.locator('#retry')).toBeDisabled();
  await expect.poll(() => readPids(pidfile).length).toBe(1);
  const [pid] = readPids(pidfile);
  const exited = new Promise<number | null>((resolve) => app.process().once('exit', (code) => resolve(code)));
  await startup.locator('#cancel').click();
  await expect(startup.locator('#status')).toHaveText(STARTUP_TEXT.cancelling);   // the 'hang' fake ignores the lease: ~5 s grace
  expect(await exited).toBe(0);
  expect(live(pid)).toBe(false);
});

test('an HTTP identity mismatch never loads the origin and stops the impostor', async () => {
  const m = await managedSetup();
  const pidfile = path.join(tempDir('noema-identity-'), 'pids.json');
  const { app } = await launchNoema([...m.args, '--entry-point', FAKE], {
    env: { ...m.env, NOEMA_FAKE_MODE: 'bad-http', NOEMA_FAKE_PIDFILE: pidfile },
  });
  const startup = await startupPage(app);
  await expect(startup.locator('#status')).toHaveText(MESSAGES.identity);
  await expect(startup.locator('#retry')).toBeEnabled();
  expect(await mainUrl(app)).not.toMatch(/^http/);
  const [pid] = readPids(pidfile);
  await expect.poll(() => live(pid)).toBe(false);
  expect(fs.readdirSync(m.dataDir)).toEqual([]);
});

test('a crash shows the overlay over the loaded page; Quit runs the checkpoint first', async () => {
  const m = await managedSetup();
  const first = await launchNoema(m.args, { env: m.env });
  const page = await appPage(first.app, m.origin);
  await waitConnected(page);
  const editor = await openCapture(page);
  process.kill(await servicePid(m.origin), 'SIGKILL');
  const overlay = await startupPage(first.app);
  await expect(overlay.locator('#status')).toHaveText(MESSAGES.crashed);
  await expect(overlay.locator('#retry')).toBeEnabled();
  await expect(overlay.locator('#cancel')).toHaveText('Quit');
  await expect(page.getByText('Offline · local drafts', { exact: true }).first()).toBeVisible();   // service-down, not a reload
  // Crashed: only a bottom strip, so the still-loaded page (editor, offline status) stays visible and usable above it.
  await expect.poll(async () => {
    const { content, views } = await overlayBounds(first.app);
    return views.some((view) => view.x === 0 && view.width === content.width && view.height <= 120 && view.y + view.height === content.height);
  }).toBe(true);
  const { views } = await overlayBounds(first.app);
  const box = await editor.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(Math.min(...views.map((view) => view.y)));
  await editor.click();
  await editor.fill('Typed after the crash, right before Quit.');   // inside the debounce: only the checkpoint saves it
  const closed = first.app.waitForEvent('close');
  await overlay.locator('#cancel').click();
  await closed;
  const second = await launchNoema(m.args, { env: m.env, profile: first.profile });
  const reopened = await appPage(second.app, m.origin);
  await waitConnected(reopened);
  expect((await readDraft(reopened))?.raw).toBe('Typed after the crash, right before Quit.');
});

test('SIGTERM runs the close checkpoint and stops the owned service', async () => {
  const m = await managedSetup();
  const first = await launchNoema(m.args, { env: m.env });
  const page = await appPage(first.app, m.origin);
  await waitConnected(page);
  const editor = await openCapture(page);
  await editor.fill('Typed right before SIGTERM.');   // inside the debounce: only the checkpoint saves it
  const pid = await servicePid(m.origin);
  const child = first.app.process();
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  await exited;
  await expect.poll(() => live(pid), { timeout: 10_000 }).toBe(false);
  const second = await launchNoema(m.args, { env: m.env, profile: first.profile });
  const reopened = await appPage(second.app, m.origin);
  await waitConnected(reopened);
  expect((await readDraft(reopened))?.raw).toBe('Typed right before SIGTERM.');
});

test('command-line errors exit 2 before any window or directory exists; --help exits 0', async () => {
  const profile = tempDir('noema-cli-profile-');
  const dataDir = path.join(tempDir('noema-cli-data-'), 'never-created');
  const LOOPBACK = 'Dhara: Use a literal loopback HTTP URL, e.g. http://127.0.0.1:8765';
  const cases: [string[], Record<string, string>, string][] = [
    [['--server', 'http://localhost:8765'], {}, LOOPBACK],
    [['--server', 'http://[::ffff:127.0.0.1]:8765'], {}, LOOPBACK],
    [['--server', 'http://127.0.0.1:8765/?'], {}, LOOPBACK],
    [['--bogus'], {}, 'Dhara: Unknown argument; use --help. No token file is needed by the webview.'],
    [['--server'], {}, 'Dhara: --server needs a URL'],
    [['--startup-timeout', '61'], {}, 'Dhara: Use a startup timeout from 0.1 to 60 seconds'],
    [['--startup-timeout', 'soon'], {}, 'Dhara: Invalid startup timeout'],
    [['--data-dir', dataDir], {}, 'Dhara: --data-dir requires explicit --manage-service; external mode never owns a service'],
    [['--manage-service'], {}, 'Dhara: Managed mode requires an explicit --data-dir; no implicit real notebook'],
    // The test port is ignored without NOEMA_ELECTRON_TEST=1.
    [['--manage-service', '--data-dir', dataDir, '--server', 'http://127.0.0.1:9100'], { NOEMA_ELECTRON_TEST_PORT: '9100' }, 'Dhara: Managed mode uses http://127.0.0.1:8765 only'],
  ];
  for (const [args, env, message] of cases) {
    const result = await runElectron(['--profile', profile, ...args], env);
    expect([result.code, result.stderr.includes(message)], `${args.join(' ')}\n${result.stderr}`).toEqual([2, true]);
  }
  expect(fs.existsSync(dataDir)).toBe(false);
  const badProfile = await runElectron(['--profile', '']);
  expect([badProfile.code, badProfile.stderr.includes('Dhara: Choose a dedicated profile directory')]).toEqual([2, true]);
  const help = await runElectron(['--help']);
  expect(help.code).toBe(0);
  expect(help.stdout).toContain('--manage-service --data-dir');
});
