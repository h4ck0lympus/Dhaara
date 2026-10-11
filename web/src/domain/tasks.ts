// web/src/domain/tasks.ts
import type { Snapshot, SnapshotRun, SnapshotTask, Task, TaskEditable, TaskStatus } from '../api/schemas';
import { dateLabel, localDateInput } from './format';

export const TASK_EDIT_FIELDS = ['title', 'project', 'detail', 'next_action', 'status', 'priority', 'due_at', 'not_before', 'planned_on', 'estimate_minutes', 'dependencies', 'session_url'] as const;

export function editableFields(task: Task): TaskEditable {
  return {
    title: task.title, project: task.project, detail: task.detail, next_action: task.next_action,
    status: task.status, priority: task.priority, due_at: task.due_at, not_before: task.not_before,
    planned_on: task.planned_on, estimate_minutes: task.estimate_minutes,
    dependencies: [...task.dependencies], session_url: task.session_url,
  };
}

export type PriorityLabel = 'Auto · rules' | 'Auto · AI' | 'Set by you' | 'Auto';

export function priorityLabel(source: string): PriorityLabel {
  if (source === 'automatic' || source === 'rules') return 'Auto · rules';
  if (source === 'ai') return 'Auto · AI';
  if (source === 'you') return 'Set by you';
  return 'Auto'; // unknown future sources need no frontend change (spec §4.7)
}

export type TaskFilter = 'open' | 'needs-you' | 'running' | 'available' | 'parked' | 'done' | 'all';
export const TASK_FILTERS: readonly { id: TaskFilter; label: string }[] = [
  { id: 'open', label: 'Open' }, { id: 'needs-you', label: 'Needs you' }, { id: 'running', label: 'Running' },
  { id: 'available', label: 'Available now' }, { id: 'parked', label: 'Parked' }, { id: 'done', label: 'Completed' },
  { id: 'all', label: 'All' },
];

const RANK = { high: 0, medium: 1, low: 2 } as const;

export function filterTasks(snapshot: Snapshot, filter: TaskFilter): SnapshotTask[] {
  const attention = new Set(snapshot.attention.map(t => t.id));
  const available = new Set(snapshot.available.map(t => t.id));
  const keep = (t: SnapshotTask): boolean => {
    switch (filter) {
      case 'open': return t.status !== 'done' && t.status !== 'parked';
      case 'needs-you': return attention.has(t.id);
      case 'running': return t.runs.some(r => r.effective_status === 'working' || r.effective_status === 'needs_input');
      case 'available': return available.has(t.id);
      case 'parked': return t.status === 'parked';
      case 'done': return t.status === 'done';
      case 'all': return true;
    }
  };
  return snapshot.tasks.filter(keep).sort((a, b) => RANK[a.effective_priority] - RANK[b.effective_priority]);
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do', active: 'Active', waiting: 'Waiting', blocked: 'Blocked', review: 'Review', parked: 'Parked', done: 'Completed',
};

export const RUN_LABEL: Record<SnapshotRun['effective_status'], string> = {
  working: 'Reported running', needs_input: 'Needs your input', review: 'Result ready for review',
  failed: 'Reported a failure', cancelled: 'Tracking ended', unknown: 'Status unknown',
};

export function taskMeta(task: SnapshotTask): string {
  return [
    task.project, STATUS_LABEL[task.status], task.attention_reason,
    task.due_at ? `Due ${dateLabel(task.due_at)}` : '',
    task.planned_on ? `Planned ${task.planned_on}` : '',
    task.estimate_minutes != null ? `${task.estimate_minutes} min · your estimate` : '',
  ].filter(Boolean).join(' · ');
}

export function waitingReason(task: SnapshotTask, tasks: SnapshotTask[]): string {
  const dependencies = task.blocked_by.map(id => tasks.find(x => x.id === id)?.title).filter((title): title is string => !!title);
  if (dependencies.length) return 'Waiting on: ' + dependencies.join(', ');
  if (task.runs.some(r => r.effective_status === 'unknown')) return 'Agent status unknown';
  if (task.runs.some(r => r.effective_status === 'needs_input')) return 'Agent is awaiting your input';
  if (task.runs.some(r => r.effective_status === 'working')) return 'Waiting on an agent report';
  return 'Marked ' + task.status;
}

export function isSessionUrl(url: string | null | undefined): boolean {
  return /^https?:\/\//.test(url ?? '');
}

export function needsReview(task: SnapshotTask): boolean {
  return task.status === 'review' || task.runs.some(r => r.status === 'review');
}

// Runs arrive newest first (store.py: ORDER BY updated_at DESC).
export function reviewLink(task: SnapshotTask): string | null {
  const run = task.runs.find(r => r.status === 'review' && isSessionUrl(r.session_url));
  if (run) return run.session_url;
  return isSessionUrl(task.session_url) ? task.session_url : null;
}

export function keepTimestamps(values: TaskEditable, original: Task): Pick<TaskEditable, 'due_at' | 'not_before'> {
  const keep = (edited: string | null, stored: string | null) => (localDateInput(edited) === localDateInput(stored) ? stored : edited);
  return { due_at: keep(values.due_at, original.due_at), not_before: keep(values.not_before, original.not_before) };
}
