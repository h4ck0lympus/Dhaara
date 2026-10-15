import { test, expect, type Page } from '@playwright/test';
import { startDhara, type DharaServer } from '../../web/e2e/server.js';
import { killAll, launchDhara, messageBoxes, stubMessageBox, waitConnected } from './fixtures.js';

const MICROPHONE = 'Allow Dhara to use your microphone for a recording?';
const NOTIFICATIONS = 'Allow Dhara to show notifications?';

let dhara: DharaServer;
test.beforeEach(async () => { dhara = await startDhara(); });
test.afterEach(async () => { await killAll(); await dhara.stop(); });

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
  const first = await launchDhara(['--server', dhara.origin]);
  await waitConnected(first.window);
  await stubMessageBox(first.app, [0]);
  expect(await getUserMedia(first.window, { audio: true })).toBe('granted');
  expect(await getUserMedia(first.window, { audio: true })).toBe('granted');
  expect(await getUserMedia(first.window, { video: true })).toBe('NotAllowedError');
  expect(await getUserMedia(first.window, { audio: true, video: true })).toBe('NotAllowedError');
  expect(await messageBoxes(first.app)).toEqual([MICROPHONE]);
  await first.app.close();
  const second = await launchDhara(['--server', dhara.origin], { profile: first.profile });
  await waitConnected(second.window);
  await stubMessageBox(second.app, [1]);
  expect(await getUserMedia(second.window, { audio: true })).toBe('NotAllowedError');
  expect(await messageBoxes(second.app)).toEqual([MICROPHONE]);
});

test('Notification.permission is correct before and after a decision', async () => {
  const { app, window } = await launchDhara(['--server', dhara.origin]);
  await waitConnected(window);
  expect(await window.evaluate(() => Notification.permission)).not.toBe('granted');
  await stubMessageBox(app, [0]);
  expect(await window.evaluate(() => Notification.requestPermission())).toBe('granted');
  expect(await window.evaluate(() => Notification.permission)).toBe('granted');
  expect(await window.evaluate(() => Notification.requestPermission())).toBe('granted');
  expect(await messageBoxes(app)).toEqual([NOTIFICATIONS]);
});
