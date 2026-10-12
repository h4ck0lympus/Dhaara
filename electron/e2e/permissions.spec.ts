import { test, expect, type Page } from '@playwright/test';
import { startNoema, type NoemaServer } from '../../web/e2e/server.js';
import { killAll, launchNoema, messageBoxes, stubMessageBox, waitConnected } from './fixtures.js';

// Verbatim PERMISSION_PROMPTS (src/permissions.ts; main.rs:263-276).
const MICROPHONE = 'Allow Noema to use your microphone for a recording?';
const NOTIFICATIONS = 'Allow Noema to show notifications?';

let noema: NoemaServer;
test.beforeEach(async () => { noema = await startNoema(); });
test.afterEach(async () => { await killAll(); await noema.stop(); });

const getUserMedia = (page: Page, constraints: MediaStreamConstraints) => page.evaluate(async (wanted) => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(wanted);
    stream.getTracks().forEach((track) => track.stop());
    return 'granted';
  } catch (error) {
    return (error as DOMException).name;
  }
}, constraints);

test('audio-only media is prompted once per app session; video is always denied', async () => {
  const first = await launchNoema(['--server', noema.origin]);
  await waitConnected(first.window);
  await stubMessageBox(first.app, [0]);
  expect(await getUserMedia(first.window, { audio: true })).toBe('granted');
  expect(await getUserMedia(first.window, { audio: true })).toBe('granted');
  expect(await getUserMedia(first.window, { video: true })).toBe('NotAllowedError');
  expect(await getUserMedia(first.window, { audio: true, video: true })).toBe('NotAllowedError');
  expect(await messageBoxes(first.app)).toEqual([MICROPHONE]);
  await first.app.close();
  // Decisions are not persisted: a restart prompts again.
  const second = await launchNoema(['--server', noema.origin], { profile: first.profile });
  await waitConnected(second.window);
  await stubMessageBox(second.app, [1]);
  expect(await getUserMedia(second.window, { audio: true })).toBe('NotAllowedError');
  expect(await messageBoxes(second.app)).toEqual([MICROPHONE]);
});

test('Notification.permission is correct before and after a decision', async () => {
  const { app, window } = await launchNoema(['--server', noema.origin]);
  await waitConnected(window);
  expect(await window.evaluate(() => Notification.permission)).not.toBe('granted');
  await stubMessageBox(app, [0]);
  expect(await window.evaluate(() => Notification.requestPermission())).toBe('granted');
  expect(await window.evaluate(() => Notification.permission)).toBe('granted');
  expect(await window.evaluate(() => Notification.requestPermission())).toBe('granted');
  expect(await messageBoxes(app)).toEqual([NOTIFICATIONS]);
});
