// web/src/screens/Now.tsx
import { useNavigate } from '@tanstack/react-router';
import type { JSX } from 'react';
import { confirmFocusChange } from '../components/focus';
import { TaskRow } from '../components/TaskRow';
import { COPY, greeting } from '../copy';
import { useConnected } from '../domain/connection';
import { age } from '../domain/format';
import { focusKind, nowState } from '../domain/nowState';
import { RUN_LABEL, waitingReason } from '../domain/tasks';
import { openDialog } from '../shell/dialogs';
import { OfflineNotice } from '../shell/OfflineNotice';
import { useSetFocus, useSnapshot, useTimeBudget } from '../state/queries';
import { S } from '../strings';
import { Icon } from '../ui/Icon';
import { PageHeading } from '../ui/PageHeading';
import { toastError } from '../ui/Toast';

const BUDGETS = [10, 15, 30, 60];
const REPORTED = ['working', 'needs_input', 'unknown'];

export function NowScreen(): JSX.Element {
  const query = useSnapshot();
  const snapshot = query.data ?? null;
  const connected = useConnected();
  const [budget, setBudget] = useTimeBudget();
  const setFocus = useSetFocus();
  const navigate = useNavigate();
  const n = nowState(snapshot, connected, budget);
  const primary = n.primary;
  const focusTask = n.focus;
  const focusRecord = snapshot?.focus ?? null;
  const pinned = focusRecord?.pinned ?? false;
  const tasks = snapshot?.tasks ?? [];
  const runs = snapshot?.runs ?? [];
  const needsYou = connected ? (snapshot?.attention ?? []).filter(t => t.id !== primary?.id) : [];
  const alternatives = n.alternatives.filter(t => !needsYou.some(a => a.id === t.id));
  const reported = runs.filter(r => REPORTED.includes(r.effective_status));
  const openTask = (id: string) => openDialog({ kind: 'task', id });

  async function changeFocus(taskId: string | null) {
    if (!confirmFocusChange(focusRecord, taskId)) return;
    try { await setFocus.mutateAsync({ taskId }); } catch (error) { toastError(error); }
  }

  const eyebrow = !primary ? 'Workspace'
    : n.mode === 'unknown' ? 'Status unknown'
    : n.kind === 'attention' ? `Needs you · ${snapshot?.attention.length ?? 0}`
    : 'Available now';

  let recommendation: JSX.Element;
  if (primary) {
    const reason = n.kind === 'attention' ? primary.attention_reason : primary.next_action || primary.recommendation_reason || 'Continue your selected focus.';
    const startsFocus = n.kind === 'available' && !pinned; // app.js:196 — never replaces a pin
    const label = n.mode === 'unknown' ? 'Check agent status' : n.kind === 'attention' ? 'Open for review'
      : n.kind === 'focus' ? 'Resume' : pinned ? 'View next action' : 'Start';
    recommendation = (
      <>
        <h2>{primary.title}</h2>
        <p>{reason}</p>
        <div className="inline-actions">
          <button type="button" className="primary" onClick={() => (startsFocus ? void changeFocus(primary.id) : openTask(primary.id))}>{label}</button>
          {startsFocus && <button type="button" className="quiet-button" onClick={() => openTask(primary.id)}>Details</button>}
          {primary.estimate_minutes != null && <span className="small dim">{primary.estimate_minutes} min · your estimate</span>}
        </div>
      </>
    );
  } else {
    recommendation = (
      <div className="empty">
        <h2>{n.title}</h2>
        <p>{n.explanation}</p>
        <div className="inline-actions">
          <button type="button" className="secondary" onClick={() => void navigate({ to: '/capture' })}>Capture a thought</button>
          {connected
            ? <button type="button" className="text-button" onClick={() => openDialog({ kind: 'task-capture' })}>Add a task</button>
            : <button type="button" className="text-button" onClick={() => void query.refetch()}>Retry connection</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="now-page" data-now-state={n.mode}>
      <PageHeading title={greeting(new Date(), snapshot?.settings.display_name ?? '')} subtitle={COPY.tagline} />
      <OfflineNotice />
      {focusTask && focusRecord && (
        <div className="focus-line" data-quiet="">
          <span className="eyebrow">Current focus</span>
          <button type="button" className="task-title" onClick={() => openTask(focusTask.id)}>{focusTask.title}</button>
          <span className="focus-kind" data-focus-kind={focusRecord.pinned ? 'pinned' : focusRecord.source === 'context' ? 'inferred' : 'manual'}>
            {(connected ? '' : S.lastKnown) + focusKind(focusRecord) + (focusTask.project ? ' · ' + focusTask.project : '')}
          </span>
          <button type="button" className="quiet-button" onClick={() => void changeFocus(null)}>{pinned ? 'Unpin & clear' : 'Clear'}</button>
        </div>
      )}
      <section className="recommendation" aria-label="Next action" data-quiet="">
        <div className="section-header">
          <span className="eyebrow">{eyebrow}</span>
          {connected && n.open.length > 0 && (
            <select aria-label="Available time" value={budget ?? ''} onChange={e => setBudget(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Any duration</option>
              {BUDGETS.map(v => <option key={v} value={v}>{v} minutes</option>)}
            </select>
          )}
        </div>
        {recommendation}
        {alternatives.length > 0 && (
          <details className="alternatives">
            <summary>{alternatives.length} other actionable task{alternatives.length === 1 ? '' : 's'}</summary>
            {alternatives.map(t => <TaskRow key={t.id} task={t} />)}
          </details>
        )}
      </section>
      {needsYou.length > 0 && (
        <section className="needs-you" aria-label="Needs you">
          <h2 className="eyebrow">Needs you</h2>
          {needsYou.map(t => (
            <button type="button" key={t.id} className="attention-row" onClick={() => openTask(t.id)}>
              <span>{t.title}</span><small>{t.attention_reason}</small>
            </button>
          ))}
        </section>
      )}
      {(tasks.length > 0 || runs.length > 0) && (
        <details className="agent-status" open={n.mode === 'unknown' || !connected}>
          <summary>Agent reports <span className="count">{reported.length}</span></summary>
          <p className="small dim" id="integration-status">{n.integration}</p>
          {reported.map(r => (
            <div className="run-row" key={r.id}>
              <button type="button" className="task-title" onClick={() => openTask(r.task_id)}>
                <span>{tasks.find(t => t.id === r.task_id)?.title ?? r.agent}</span>
                <small>{`${r.agent} · ${RUN_LABEL[r.effective_status]} · last report ${age(r.updated_at)}`}</small>
              </button>
            </div>
          ))}
          {connected && n.open.some(t => t.status !== 'parked') && (
            <>
              <button type="button" className="text-button" onClick={() => openDialog({ kind: 'settings', section: 'agents' })}>Set up agent reporting</button>
              <p className="small muted">Task-scoped tokens and the command wrapper; no automatic agent launch.</p>
            </>
          )}
        </details>
      )}
      {n.waiting.length > 0 && (
        <details className="waiting-work">
          <summary>Waiting work <span className="count">{n.waiting.length}</span></summary>
          {n.waiting.map(t => (
            <div className="run-row" key={t.id}>
              <button type="button" className="task-title" onClick={() => openTask(t.id)}>
                <span>{t.title}</span><small>{waitingReason(t, tasks)}</small>
              </button>
            </div>
          ))}
        </details>
      )}
      {primary && (
        <button type="button" className="add-later" onClick={() => openDialog({ kind: 'task-capture' })}>
          <Icon name="plus" size={16} />Add something for later
        </button>
      )}
    </div>
  );
}
