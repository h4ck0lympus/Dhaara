// web/src/components/PriorityControl.tsx
import { useId, type JSX } from 'react';
import type { Priority, SnapshotTask } from '../api/schemas';
import { priorityLabel } from '../domain/tasks';
import { usePatchTask } from '../state/queries';
import { S } from '../strings';
import { toast, toastError } from '../ui/Toast';

const MANUAL = ['high', 'medium', 'low'] as const;

export function PriorityControl({ task }: { task: SnapshotTask }): JSX.Element {
  const patch = usePatchTask();
  const reasonId = useId();
  // The selected option always reads "effective · source", so the closed control shows both (spec §4.7).
  const current = `${task.effective_priority} · ${priorityLabel(task.priority_source)}`;

  async function change(priority: Priority) {
    try {
      await patch.mutateAsync({ id: task.id, changes: { priority } });
      toast(S.priorityUpdated);
    } catch (error) {
      toastError(error);
    }
  }

  return (
    <span className={`priority-control priority-${task.effective_priority}`}>
      <select aria-label={`Priority for ${task.title}`} aria-describedby={reasonId} value={task.priority}
        disabled={patch.isPending} onChange={event => void change(event.target.value as Priority)}>
        <option value="auto">{task.priority === 'auto' ? current : 'Automatic'}</option>
        {MANUAL.map(p => <option key={p} value={p}>{task.priority === p ? current : `${p} · Set by you`}</option>)}
      </select>
      <span id={reasonId} role="tooltip" className="priority-reason">{task.priority_reason}</span>
    </span>
  );
}
