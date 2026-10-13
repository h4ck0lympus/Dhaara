// web/src/shell/notifications.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Reminder } from '../api/schemas';
import { makeSnapshot, makeTask } from '../test/fixtures';

type Shown = { title: string; options: NotificationOptions };
let shown: Shown[];
let permission: NotificationPermission;
let throwOnCreate: boolean;

class FakeNotification {
  static get permission() { return permission; }
  constructor(title: string, options: NotificationOptions = {}) {
    if (throwOnCreate) throw new TypeError('Illegal constructor');
    shown.push({ title, options });
  }
}

const reminder = (id: string, state: Reminder['state'], task_id = 'task-1'): Reminder =>
  ({ id, task_id, at: '2026-10-08T11:00:00+00:00', state, created_at: '2026-10-08T10:00:00+00:00' });
const snapshot = (...reminders: Reminder[]) => makeSnapshot({ tasks: [makeTask('task-1', { title: 'Review the cleanup' })], reminders });

async function load() {
  vi.resetModules();
  return import('./notifications');
}

beforeEach(() => {
  shown = []; permission = 'granted'; throwOnCreate = false;
  vi.stubGlobal('Notification', FakeNotification);
  localStorage.setItem('dhara-notifications', '1');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

describe('notifyDueReminders', () => {
  it('notifies a due reminder once per id per session, tagged with the id', async () => {
    const { notifyDueReminders, NOTIFICATIONS_KEY } = await load();
    expect(NOTIFICATIONS_KEY).toBe('dhara-notifications');
    notifyDueReminders(snapshot(reminder('r1', 'due')));
    notifyDueReminders(snapshot(reminder('r1', 'due')));
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe('Dhara reminder');
    expect(shown[0].options.tag).toBe('r1');
    expect(shown[0].options.body).toBe('Review the cleanup');
    expect(typeof shown[0].options.icon).toBe('string');
    expect(shown[0].options.icon).toMatch(/icon.*\.svg/);
  });

  it('ignores scheduled and dismissed reminders', async () => {
    const { notifyDueReminders } = await load();
    notifyDueReminders(snapshot(reminder('r1', 'scheduled'), reminder('r2', 'dismissed')));
    expect(shown).toHaveLength(0);
  });

  it('uses the fallback body when the task is not in the snapshot', async () => {
    const { notifyDueReminders } = await load();
    notifyDueReminders(snapshot(reminder('r1', 'due', 'missing')));
    expect(shown[0].options.body).toBe('A task needs your attention.');
  });

  it('does nothing unless opted in and granted, and does not replay later (app.js:94-96)', async () => {
    const { notifyDueReminders } = await load();
    localStorage.setItem('dhara-notifications', '0');
    notifyDueReminders(snapshot(reminder('r1', 'due')));
    localStorage.setItem('dhara-notifications', '1');
    notifyDueReminders(snapshot(reminder('r1', 'due')));
    expect(shown).toHaveLength(0);
    permission = 'default';
    notifyDueReminders(snapshot(reminder('r2', 'due')));
    expect(shown).toHaveLength(0);
  });

  it('a snooze re-arms the id', async () => {
    const { notifyDueReminders, rearmReminder } = await load();
    notifyDueReminders(snapshot(reminder('r1', 'due')));
    rearmReminder('r1');
    notifyDueReminders(snapshot(reminder('r1', 'due')));
    expect(shown).toHaveLength(2);
  });

  it('survives blocked storage and a throwing constructor', async () => {
    const { notifyDueReminders } = await load();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    expect(() => notifyDueReminders(snapshot(reminder('r1', 'due')))).not.toThrow();
    vi.restoreAllMocks();
    throwOnCreate = true;
    expect(() => notifyDueReminders(snapshot(reminder('r2', 'due')))).not.toThrow();
    expect(shown).toHaveLength(0);
  });

  it('does nothing when the browser has no Notification API', async () => {
    vi.unstubAllGlobals();
    const original = (window as { Notification?: unknown }).Notification;
    delete (window as { Notification?: unknown }).Notification;
    const { notifyDueReminders } = await load();
    expect(() => notifyDueReminders(snapshot(reminder('r1', 'due')))).not.toThrow();
    (window as { Notification?: unknown }).Notification = original;
  });

  it('honours an opt-in stored under the pre-rename key, and the new key wins once written', async () => {
    const { notifyDueReminders, NOTIFICATIONS_KEY } = await load();
    expect(NOTIFICATIONS_KEY).toBe('dhara-notifications');
    localStorage.clear();
    localStorage.setItem('noema-notifications', '1');   // rename-shim: legacy key
    notifyDueReminders(snapshot(reminder('r1', 'due')));
    expect(shown).toHaveLength(1);
    localStorage.setItem(NOTIFICATIONS_KEY, '0');
    notifyDueReminders(snapshot(reminder('r2', 'due')));
    expect(shown).toHaveLength(1);
  });
});
