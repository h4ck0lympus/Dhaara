import type { JSX, ReactNode } from 'react';
import type { SnapshotTask } from '../api/schemas';
import { dueLabel } from '../domain/format';
import { needsReview, readableTaskTitle, reviewLink } from '../domain/tasks';
import { openDialog } from '../shell/dialogs';
import { usePatchTask } from '../state/queries';
import { S } from '../strings';
import { Icon } from '../ui/Icon';
import { toast, toastError } from '../ui/Toast';

const PRIORITY_NAME = { high: 'High', medium: 'Medium', low: 'Low' } as const;

export function TaskRow({ task, lead, meta, showPriority = false }: { task: SnapshotTask; lead?: ReactNode; meta?: ReactNode; showPriority?: boolean }): JSX.Element {
  const patch = usePatchTask();
  const done = task.status === 'done';
  const review = needsReview(task);
  const link = review ? reviewLink(task) : null;
  const due = done ? null : dueLabel(task.due_at);
  const open = () => openDialog({ kind: 'task', id: task.id });

  async function toggle() {
    try {
      await patch.mutateAsync({ id: task.id, changes: { status: done ? 'todo' : 'done' } });
      toast(done ? S.taskReopened : S.taskCompleted);
    } catch (error) {
      toastError(error);
    }
  }

  let check: JSX.Element;
  if (review && link) check = <a className="review-link" href={link} target="_blank" rel="noopener noreferrer">Review result ↗</a>;
  else if (review) check = <button type="button" className="review-link" onClick={open}>Review result</button>;
  else check = (
    <button type="button" className={done ? 'task-check done' : 'task-check'} aria-label={`${done ? 'Reopen' : 'Complete'} ${readableTaskTitle(task)}`}
      disabled={patch.isPending} onClick={() => void toggle()}>{done && <Icon name="check" size={12} />}</button>
  );

  return (
    <div className="task-row" data-task={task.id} title={`${PRIORITY_NAME[task.effective_priority]} priority · ${task.priority_source === 'you' ? 'set by you' : task.priority_reason}`}>
      {lead}
      {showPriority && <i className={`priority-dot ${task.effective_priority}`} aria-label={`${PRIORITY_NAME[task.effective_priority]} priority`} role="img" />}
      {check}
      <button type="button" className="task-title" onClick={open}>{readableTaskTitle(task)}</button>
      {task.priority_source === 'you' && !done && <span className="priority-source">set by you</span>}
      {meta ?? (due && <span className={due.soon ? 'task-due soon' : 'task-due'}>{due.text}</span>)}
    </div>
  );
}
