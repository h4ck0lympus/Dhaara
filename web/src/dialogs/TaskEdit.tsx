import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type JSX, type MutableRefObject } from 'react';
import { ApiError, call } from '../api/client';
import { TaskSchema, type SnapshotTask, type Task, type TaskEditable } from '../api/schemas';
import { TaskFields } from '../components/TaskFields';
import { editableFields, keepTimestamps } from '../domain/tasks';
import { useSaveTask } from '../state/queries';
import { S } from '../strings';
import { messageOf, toast } from '../ui/Toast';

export const DISCARD_EDITS = 'Discard your unsaved edits?';

export function TaskEditForm({ task, tasks, onDone, onCancel, dirtyRef }: {
  task: Task; tasks: SnapshotTask[]; onDone: () => void; onCancel: () => void; dirtyRef: MutableRefObject<boolean>;
}): JSX.Element {
  const save = useSaveTask();
  const qc = useQueryClient();
  const [opened, setOpened] = useState<Task>(task);
  const [values, setValues] = useState<TaskEditable>(() => editableFields(task));
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [reopening, setReopening] = useState(false);

  const dirty = JSON.stringify(values) !== JSON.stringify(editableFields(opened));
  dirtyRef.current = dirty;

  function change<K extends keyof TaskEditable>(name: K, value: TaskEditable[K]): void {
    setValues(current => ({ ...current, [name]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.isPending) return;
    setError('');
    setConflict(false);
    try {
      await save.mutateAsync({ id: opened.id, body: { ...values, ...keepTimestamps(values, opened), expected_version: opened.version } });
      toast(S.taskSaved);
      onDone();
    } catch (err) {
      setError(messageOf(err));
      setConflict(err instanceof ApiError && err.status === 409);
    }
  }

  async function reopen() {
    if (dirty && !window.confirm('Reopen discards your unsaved edits. Continue?')) return;
    setReopening(true);
    try {
      const fresh = await call('task', TaskSchema, { params: { id: opened.id } });
      setOpened(fresh);
      setValues(editableFields(fresh));
      setError('');
      setConflict(false);
      void qc.invalidateQueries({ queryKey: ['snapshot'] });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setReopening(false);
    }
  }

  return (
    <form className="task-edit-form" onSubmit={e => void submit(e)}>
      <label className="task-input-label">Title
        <input name="title" required maxLength={240} autoFocus value={values.title} onChange={e => change('title', e.target.value)} />
      </label>
      <details id="task-details">
        <summary>Details</summary>
        <TaskFields value={values} onChange={change} disabled={false} tasks={tasks} selfId={opened.id} />
      </details>
      <p className="field-error" role="alert">{error}</p>
      {conflict && <button type="button" className="secondary" disabled={reopening} onClick={() => void reopen()}>Reopen</button>}
      <div className="dialog-actions">
        <button type="button" className="quiet-button" onClick={() => { if (!dirty || window.confirm(DISCARD_EDITS)) onCancel(); }}>Cancel</button>
        <button type="submit" className="primary" disabled={save.isPending}>Save task</button>
      </div>
    </form>
  );
}
