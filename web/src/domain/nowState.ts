import type { Focus, Snapshot, SnapshotRun, SnapshotTask } from '../api/schemas';

export type NowMode = 'disconnected' | 'new' | 'notes-only' | 'unknown' | 'attention' | 'complete' | 'available' | 'waiting' | 'filtered' | 'idle';
export type NowState = {
  mode: NowMode; title: string; explanation: string; primary: SnapshotTask | null; kind: 'attention' | 'focus' | 'available';
  alternatives: SnapshotTask[]; focus: SnapshotTask | undefined; active: SnapshotRun[]; unknown: SnapshotRun[]; questions: SnapshotRun[];
  waiting: SnapshotTask[]; integration: string; open: SnapshotTask[];
};

const WAITING_RUN = ['working', 'needs_input', 'unknown'];
const BLOCKING_FOCUS_RUN = ['working', 'needs_input', 'unknown', 'failed'];

export function focusKind(focus: Focus): 'Pinned by you' | 'Selected by you' {
  return focus?.pinned ? 'Pinned by you' : 'Selected by you';
}

export function nowState(snapshot: Snapshot | null, connected: boolean, budget: number | null = null): NowState {
  const tasks = snapshot?.tasks ?? [], runs = snapshot?.runs ?? [], notes = snapshot?.notes ?? [];
  const serverTime = snapshot?.server_time ?? '';
  const open = tasks.filter(t => t.status !== 'done');
  const attention = snapshot?.attention ?? [], available = snapshot?.available ?? [];
  const focus = tasks.find(t => t.id === snapshot?.focus?.task_id);
  const active = runs.filter(r => r.effective_status === 'working');
  const unknown = runs.filter(r => r.effective_status === 'unknown' || r.stale);
  const questions = runs.filter(r => r.effective_status === 'needs_input');
  const waiting = open.filter(t => !attention.some(a => a.id === t.id) && (t.blocked_by.length > 0 || t.status === 'waiting' || t.status === 'blocked' || t.runs.some(r => WAITING_RUN.includes(r.effective_status))));
  const integration = !connected ? 'Integration status unavailable · server disconnected'
    : unknown.length ? `Agent status unknown · ${unknown.length} stale report${unknown.length === 1 ? '' : 's'}`
    : active.length || questions.length ? `${active.length} running · ${questions.length} awaiting input · recently reported`
    : 'Integration connection status unknown · no active runs reported';
  const actionableFocus = focus !== undefined && ['todo', 'active', 'review'].includes(focus.status) && focus.blocked_by.length === 0
    && (!focus.not_before || focus.not_before <= serverTime)
    && !focus.runs.some(r => BLOCKING_FOCUS_RUN.includes(r.effective_status))
    && (budget == null || (focus.estimate_minutes != null && focus.estimate_minutes <= budget));
  let primary: SnapshotTask | null = attention[0] ?? available[0] ?? (actionableFocus ? focus : null);
  const kind: NowState['kind'] = attention.some(t => t.id === primary?.id) ? 'attention' : primary?.id === focus?.id ? 'focus' : 'available';
  let mode: NowMode = 'idle';
  let title = 'Nothing actionable right now';
  let explanation = 'Some tracked work is scheduled, parked or not available yet. Plan keeps those items visible.';
  if (!connected) {
    mode = 'disconnected'; title = 'Current status unavailable';
    explanation = 'The server is disconnected. Cached work and integration reports may be out of date. You can still capture locally.';
    primary = null;
  } else if (!tasks.length && !runs.length) {
    mode = notes.length ? 'notes-only' : 'new';
    title = notes.length ? 'No tasks tracked yet' : 'Nothing tracked yet';
    explanation = notes.length
      ? 'Your learning notes stay separate from tasks. Add a task only when you intend to do something.'
      : 'Capture something you are learning, or add a task you intend to do. Notes do not become to-dos automatically.';
  } else if (attention.length) {
    mode = attention.every(t => t.runs.some(r => r.effective_status === 'unknown') && t.status !== 'review'
      && !t.reminders.some(r => r.state === 'due')
      && !t.runs.some(r => r.effective_status === 'needs_input' || r.status === 'review' || r.status === 'failed')) ? 'unknown' : 'attention';
    title = mode === 'unknown' ? 'Agent status needs checking' : 'Your attention is needed';
    explanation = attention[0].attention_reason;
  } else if (tasks.length && tasks.every(t => t.status === 'done') && !active.length && !questions.length && !unknown.length) {
    mode = 'complete'; title = 'All tracked work is complete';
    explanation = 'Every tracked task is marked done. Your learning notes remain available; there is no need to add more work.';
    primary = null;
  } else if (primary) {
    mode = 'available'; title = 'Available work';
    explanation = primary.recommendation_reason || 'Continue your selected focus.';
  } else if (unknown.length) {
    mode = 'unknown'; title = 'Agent status needs checking';
    explanation = 'A previous run has stopped reporting. No current activity or completion can be confirmed.';
  } else if (waiting.length) {
    mode = 'waiting'; title = 'Work is waiting';
    explanation = 'Tracked work is waiting on an agent, unresolved dependencies or an explicit waiting state.';
  } else if (budget != null) {
    mode = 'filtered'; title = 'No work matches this time filter';
    explanation = 'Only saved estimates are used. Tasks without an estimate are excluded; no duration is invented.';
  }
  const alternatives = connected
    ? [...attention, ...available].filter((t, i, all) => t.id !== primary?.id && all.findIndex(x => x.id === t.id) === i)
    : [];
  return { mode, title, explanation, primary, kind, alternatives, focus, active, unknown, questions, waiting, integration, open };
}
