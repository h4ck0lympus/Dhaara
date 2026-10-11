// web/src/components/TaskRow.tsx
import type { JSX } from 'react';
import type { SnapshotTask } from '../api/schemas';
import { needsReview, reviewLink, taskMeta } from '../domain/tasks';
import { openDialog } from '../shell/dialogs';
import { usePatchTask } from '../state/queries';
import { S } from '../strings';
import { Icon } from '../ui/Icon';
import { toast, toastError } from '../ui/Toast';
import { PriorityControl } from './PriorityControl';

export function TaskRow({ task }: { task: SnapshotTask }): JSX.Element {
  const patch = usePatchTask();
  const done = task.status === 'done';
  const review = needsReview(task);
  const link = review ? reviewLink(task) : null;
  const open = () => openDialog({ kind: 'task', id: task.id });

  async function toggle() {
    try {
      await patch.mutateAsync({ id: task.id, changes: { status: done ? 'todo' : 'done' } });
      toast(done ? S.taskReopened : S.taskCompleted);
    } catch (error) {
      toastError(error);
    }
  }

  let lead: JSX.Element;
  if (review && link) lead = <a className="review-link text-button" href={link} target="_blank" rel="noopener noreferrer">Review result ↗</a>;
  else if (review) lead = <button type="button" className="review-link text-button" onClick={open}>Review result</button>;
  else lead = (
    <button type="button" className={done ? 'task-check done' : 'task-check'} aria-label={`${done ? 'Reopen' : 'Complete'} ${task.title}`}
      disabled={patch.isPending} onClick={() => void toggle()}>{done && <Icon name="check" size={13} />}</button>
  );

  return (
    <div className="task-row" data-task={task.id}>
      {lead}
      <button type="button" className="task-title" onClick={open}>
        <span>{task.title}</span>
        <small>{taskMeta(task)}</small>
      </button>
      <PriorityControl task={task} />
    </div>
  );
}
