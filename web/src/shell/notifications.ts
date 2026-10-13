// web/src/shell/notifications.ts
import type { Snapshot } from '../api/schemas';
import iconUrl from '../assets/icon.svg';
import { S } from '../strings';


const notified = new Set<string>(); // per page session (app.js:9)

export const NOTIFICATIONS_KEY = 'dhara-notifications';
const LEGACY_NOTIFICATIONS_KEY = 'noema-notifications';   // rename-shim: read until Settings writes the new key

export function notificationsOptedIn(): boolean {
  try { return (localStorage.getItem(NOTIFICATIONS_KEY) ?? localStorage.getItem(LEGACY_NOTIFICATIONS_KEY)) === '1'; } catch { return false; }
}

export function notifyDueReminders(snapshot: Snapshot): void {
  for (const reminder of snapshot.reminders) {
    if (reminder.state !== 'due' || notified.has(reminder.id)) continue;
    notified.add(reminder.id);
    if (!notificationsOptedIn() || !('Notification' in window) || Notification.permission !== 'granted') continue;
    const task = snapshot.tasks.find(t => t.id === reminder.task_id);
    try {
      new Notification(S.notificationTitle, { body: task?.title || S.notificationFallback, tag: reminder.id, icon: iconUrl });
    } catch {
      // Some engines forbid page-context notifications; Needs you still lists the reminder.
    }
  }
}

export function rearmReminder(id: string): void {
  notified.delete(id);
}
