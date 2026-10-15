import { readableTaskTitle } from '../domain/tasks';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useRef, useState, type FormEvent, type JSX } from 'react';
import { call } from '../api/client';
import { TaskSchema, type Snapshot, type SnapshotTask, type Task, type TaskStatus } from '../api/schemas';
import { confirmFocusChange } from '../components/focus';
import { PriorityControl } from '../components/PriorityControl';
import { age, dateLabel, fromLocal } from '../domain/format';
import { RUN_LABEL, STATUS_LABEL, isSessionUrl } from '../domain/tasks';
import { captureDraftStore } from '../local/drafts';
import { rearmReminder } from '../shell/notifications';
import { useCreateReminder, useDismissReminder, useEndTracking, usePatchTask, useSetFocus, useSnapshot, useSnoozeReminder } from '../state/queries';
import { S } from '../strings';
import { Dialog } from '../ui/Dialog';
import { messageOf, toast, toastError } from '../ui/Toast';
import { DISCARD_EDITS, TaskEditForm } from './TaskEdit';

function SessionLink({ url }: { url: string }): JSX.Element | null {
  if (!isSessionUrl(url)) return null;
  return <a className="text-button" href={url} target="_blank" rel="noopener noreferrer">Open session ↗</a>;
}

function TaskView({ task, snapTask, snapshot, onClose, onEdit }: {
  task: Task; snapTask: SnapshotTask | undefined; snapshot: Snapshot | undefined; onClose: () => void; onEdit: () => void;
}): JSX.Element {
  const navigate = useNavigate();
  const setFocus = useSetFocus();
  const patch = usePatchTask();
  const endTracking = useEndTracking();
  const createReminder = useCreateReminder();
  const snooze = useSnoozeReminder();
  const dismiss = useDismissReminder();
  const [reminderError, setReminderError] = useState('');
  const tasks = snapshot?.tasks ?? [];
  const linkedNotes = (snapshot?.notes ?? []).filter(n => n.task_id === task.id);
  const focusable = task.status !== 'done' && task.status !== 'parked';

  async function focusThis() {
    if (!confirmFocusChange(snapshot?.focus ?? null, task.id)) return;
    try {
      await setFocus.mutateAsync({ taskId: task.id });
      onClose();
      void navigate({ to: '/overview' });
    } catch (error) { toastError(error); }
  }

  async function setStatus(status: TaskStatus, message: string) {
    try {
      await patch.mutateAsync({ id: task.id, changes: { status } });
      toast(message);
    } catch (error) { toastError(error); }
  }

  async function endRun(runId: string) {
    if (!window.confirm('End tracking this run? This does not stop or kill the external agent process.')) return;
    try { await endTracking.mutateAsync({ runId }); } catch (error) { toastError(error); }
  }

  async function addReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const at = fromLocal(String(new FormData(form).get('at') ?? ''));
    if (!at) return;
    setReminderError('');
    try {
      await createReminder.mutateAsync({ taskId: task.id, at });
      form.reset();
      toast('Reminder saved.');
    } catch (error) { setReminderError(messageOf(error)); }
  }

  async function snoozeReminder(id: string) {
    try {
      await snooze.mutateAsync({ id });
      rearmReminder(id);
      toast('Reminder moved forward by 20 minutes.');
    } catch (error) { toastError(error); }
  }

  async function dismissReminder(id: string) {
    try { await dismiss.mutateAsync({ id }); } catch (error) { toastError(error); }
  }

  async function captureForTask() {
    try { await captureDraftStore.setTaskId(task.id); } catch (error) { toastError(error); return; }
    onClose();
    void navigate({ to: '/capture' });
  }

  const parked = task.status === 'parked';
  const done = task.status === 'done';
  return (
    <>
      <div className="inline-actions">
        {task.project && <span className="pill">{task.project}</span>}
        {snapTask && <PriorityControl task={snapTask} />}
        <span className="small muted">{STATUS_LABEL[task.status]}</span>
      </div>
      {snapTask && <p className="small dim">{snapTask.priority_reason}</p>}
      {task.next_action && <><h3 className="subheading">Continue here</h3><p>{task.next_action}</p></>}
      {task.detail && <details open><summary>Context</summary><div className="original-block">{task.detail}</div></details>}
      {snapTask && snapTask.blocked_by.length > 0 && (
        <div className="notice">Waiting on: {snapTask.blocked_by.map(dep => tasks.find(t => t.id === dep)?.title ?? dep).join(', ')}</div>
      )}
      {task.due_at && <p className="small dim">Deadline: {dateLabel(task.due_at)}</p>}
      {task.not_before && <p className="small dim">Available after: {dateLabel(task.not_before)}</p>}
      {task.planned_on && <p className="small dim">Planned day: {task.planned_on} · not a deadline or reminder.</p>}
      {task.estimate_minutes != null && <p className="small dim">{task.estimate_minutes} min · your estimate</p>}
      {task.interpretation.explanation && <p className="small dim">At capture: {task.interpretation.explanation}</p>}
      {task.original_input && (
        <details>
          <summary>Original task input</summary>
          <pre className="original-block">{task.original_input}</pre>
          <p className="small muted">Limited capture rules, not AI interpretation. Your original stays unchanged when you edit.</p>
        </details>
      )}
      <div className="inline-actions">
        {focusable && <button type="button" className="primary" onClick={() => void focusThis()}>Focus on this</button>}
        <SessionLink url={task.session_url} />
        <button type="button" className="quiet-button" onClick={onEdit}>{S.editAction}</button>
        {!done && (
          <button type="button" className="quiet-button" onClick={() => void setStatus(parked ? 'todo' : 'parked', parked ? 'Task unparked.' : 'Task parked.')}>
            {parked ? 'Unpark' : 'Park'}
          </button>
        )}
        <button type="button" className="quiet-button" onClick={() => void setStatus(done ? 'todo' : 'done', done ? S.taskReopened : S.taskCompleted)}>
          {done ? 'Reopen' : 'Complete'}
        </button>
      </div>
      {snapTask && snapTask.runs.length > 0 && (
        <section aria-label="Agent runs">
          <h3 className="subheading">Agent runs</h3>
          {snapTask.runs.map(r => (
            <div className="run-detail" key={r.id}>
              <div className="small">{`${r.agent} · ${RUN_LABEL[r.effective_status]} · ${age(r.updated_at)}`}</div>
              {r.message && <p className="small dim">{r.message}</p>}
              <SessionLink url={r.session_url} />
              {(r.status === 'working' || r.status === 'needs_input') && (
                <button type="button" className="quiet-button small" onClick={() => void endRun(r.id)}>End tracking</button>
              )}
            </div>
          ))}
        </section>
      )}
      <section aria-label="Reminders">
        <h3 className="subheading">Reminders</h3>
        {(snapTask?.reminders ?? []).map(r => (
          <div className="token-row small" key={r.id}>
            <span>{`${r.state} · ${dateLabel(r.at)}`}</span>
            <span>
              <button type="button" className="quiet-button" onClick={() => void snoozeReminder(r.id)}>+20 min</button>
              <button type="button" className="quiet-button" onClick={() => void dismissReminder(r.id)}>Dismiss</button>
            </span>
          </div>
        ))}
        {!done && (
          <form className="inline-actions" onSubmit={e => void addReminder(e)}>
            <input type="datetime-local" name="at" required aria-label="Reminder time" />
            <button type="submit" className="secondary">Add reminder</button>
          </form>
        )}
        <p className="field-error" role="alert">{reminderError}</p>
        <p className="small muted">Times use this device’s timezone. Server-saved reminders survive closing the app; delivery requires a connected client.</p>
      </section>
      <section aria-label="Linked learning notes">
        <h3 className="subheading">Linked learning notes</h3>
        {linkedNotes.length
          ? linkedNotes.map(n => (
            <div key={n.id}>
              <button type="button" className="text-button" onClick={() => { onClose(); void navigate({ to: '/note/$id', params: { id: n.id } }); }}>{n.title} ↗</button>
            </div>
          ))
          : <p className="small muted">No notes linked yet.</p>}
        <button type="button" className="quiet-button small" onClick={() => void captureForTask()}>＋ Capture what you learned</button>
      </section>
    </>
  );
}

export function TaskDetailDialog({ id, onClose }: { id: string; onClose: () => void }): JSX.Element {
  const [editing, setEditing] = useState(false);
  const editDirty = useRef(false);
  const snapshot = useSnapshot().data;
  const snapTask = snapshot?.tasks.find(t => t.id === id);
  const fetched = useQuery({ queryKey: ['task', id], queryFn: () => call('task', TaskSchema, { params: { id } }), enabled: !snapTask });
  const task = snapTask ?? fetched.data;
  if (!task) {
    return (
      <Dialog title={fetched.isError ? S.taskUnavailable : 'Opening task…'} onRequestClose={onClose}>
        {fetched.isError && <p className="small dim">{messageOf(fetched.error)}</p>}
      </Dialog>
    );
  }
  return (
    <Dialog title={editing ? 'Edit task' : readableTaskTitle(task)} onRequestClose={() => { if (!editing || !editDirty.current || window.confirm(DISCARD_EDITS)) onClose(); }}>
      {editing
        ? <TaskEditForm task={task} tasks={snapshot?.tasks ?? []} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} dirtyRef={editDirty} />
        : <TaskView task={task} snapTask={snapTask} snapshot={snapshot} onClose={onClose} onEdit={() => setEditing(true)} />}
    </Dialog>
  );
}
