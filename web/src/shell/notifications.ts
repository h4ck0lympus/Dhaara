import type { Snapshot } from '../api/schemas';
import iconUrl from '../assets/icon.svg';
import { readableTaskTitle } from '../domain/tasks';
import { openDialog } from './dialogs';
import { S } from '../strings';


const notified = new Set<string>();

export const NOTIFICATIONS_KEY = 'dhara-notifications';
const LEGACY_NOTIFICATIONS_KEY = 'noema-notifications';   // rename-shim: read until Settings writes the new key

export const MUTE_KEY = 'dhaara-notifications-muted-until';
export function mutedUntil(): number { try { return Number(localStorage.getItem(MUTE_KEY)) || 0; } catch { return 0; } }
export function notificationsOptedIn(): boolean {
  if (mutedUntil() > Date.now()) return false;
  try { return (localStorage.getItem(NOTIFICATIONS_KEY) ?? localStorage.getItem(LEGACY_NOTIFICATIONS_KEY)) === '1'; } catch { return false; }
}

export function notifyDueReminders(snapshot: Snapshot): void {
  for (const reminder of snapshot.reminders) {
    if (reminder.state !== 'due' || notified.has(reminder.id)) continue;
    notified.add(reminder.id);
    if (!notificationsOptedIn() || !('Notification' in window) || Notification.permission !== 'granted') continue;
    const task = snapshot.tasks.find(t => t.id === reminder.task_id);
    try {
      const notification = new Notification(S.notificationTitle, { body: task ? readableTaskTitle(task) : S.notificationFallback, tag: reminder.id, icon: iconUrl });
      notification.onclick = () => { window.focus(); openDialog({ kind: 'task', id: reminder.task_id }); notification.close(); };
    } catch {
    }
  }
}

export function rearmReminder(id: string): void {
  notified.delete(id);
}

export function notificationItems(snapshot: Snapshot) {
  const taskName = (id: string) => readableTaskTitle(snapshot.tasks.find(t => t.id === id) ?? { title: 'Task update' });
  const reminders = snapshot.reminders.filter(r => r.state === 'due').map(r => ({ id: `reminder:${r.id}`, taskId: r.task_id, title: taskName(r.task_id), label: 'Reminder due', action: 'Open task', at: r.at }));
  const labels: Record<string, string> = { needs_input: 'Agent needs your input', review: 'Result ready for review', failed: 'Agent reported a failure' };
  const agents = snapshot.runs.filter(r => labels[r.effective_status]).map(r => ({ id: `run:${r.id}:${r.effective_status}`, taskId: r.task_id, title: taskName(r.task_id), label: labels[r.effective_status], action: r.effective_status === 'needs_input' ? 'Respond' : 'Review task', at: r.updated_at }));
  return [...reminders, ...agents].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 100);
}

export function notifyAgentUpdates(snapshot: Snapshot): void {
  let delivered: string[] = [];
  try { const saved = JSON.parse(localStorage.getItem('dhaara-agent-notified') || '[]'); if (Array.isArray(saved)) delivered = saved.filter(id => typeof id === 'string').slice(-500); } catch {}
  for (const item of notificationItems(snapshot).filter(i => i.id.startsWith('run:'))) {
    if (notified.has(item.id) || delivered.includes(item.id)) continue;
    notified.add(item.id);
    if (!notificationsOptedIn() || !('Notification' in window) || Notification.permission !== 'granted') continue;
    try {
      const notification = new Notification(item.label, { body: item.title, tag: item.id, icon: iconUrl });
      notification.onclick = () => { window.focus(); openDialog({ kind: 'task', id: item.taskId }); notification.close(); };
      delivered = [...delivered, item.id].slice(-500);
      try { localStorage.setItem('dhaara-agent-notified', JSON.stringify(delivered)); } catch {}
    } catch {}
  }
}
