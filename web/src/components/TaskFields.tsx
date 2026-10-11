// web/src/components/TaskFields.tsx
import { useId, type JSX } from 'react';
import type { Priority, SnapshotTask, TaskEditable, TaskStatus } from '../api/schemas';
import { fromLocal, localDateInput } from '../domain/format';
import { STATUS_LABEL } from '../domain/tasks';

export type TaskFieldChange = <K extends keyof TaskEditable>(name: K, value: TaskEditable[K]) => void;

const PRIORITY_OPTIONS: [Priority, string][] = [
  ['auto', 'Automatic'], ['high', 'High · set by me'], ['medium', 'Medium · set by me'], ['low', 'Low · set by me'],
];
const STATUSES: TaskStatus[] = ['todo', 'active', 'waiting', 'blocked', 'review', 'parked', 'done'];

export function TaskFields({ value, onChange, disabled, tasks, selfId }: {
  value: Partial<TaskEditable>; onChange: TaskFieldChange; disabled: boolean; tasks: SnapshotTask[]; selfId: string | null;
}): JSX.Element {
  const projectsId = useId();
  const projects = [...new Set(tasks.map(t => t.project))];
  return (
    <div className="form-grid">
      <label className="field">Workflow · optional
        <input name="project" maxLength={80} list={projectsId} placeholder="Unassigned" value={value.project ?? ''} disabled={disabled}
          onChange={e => onChange('project', e.target.value)} />
      </label>
      <datalist id={projectsId}>{projects.map(p => <option key={p} value={p} />)}</datalist>
      <label className="field">Priority
        <select name="priority" value={value.priority ?? 'auto'} disabled={disabled} onChange={e => onChange('priority', e.target.value as Priority)}>
          {PRIORITY_OPTIONS.map(([p, label]) => <option key={p} value={p}>{label}</option>)}
        </select>
      </label>
      <label className="field">Continue here
        <textarea name="next_action" maxLength={1000} value={value.next_action ?? ''} disabled={disabled} onChange={e => onChange('next_action', e.target.value)} />
      </label>
      <label className="field">Status
        <select name="status" value={value.status ?? 'todo'} disabled={disabled} onChange={e => onChange('status', e.target.value as TaskStatus)}>
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </label>
      <label className="field">Estimated minutes · optional
        <input type="number" name="estimate_minutes" min={1} max={1440} value={value.estimate_minutes ?? ''} disabled={disabled}
          onChange={e => onChange('estimate_minutes', e.target.value ? Number(e.target.value) : null)} />
      </label>
      <label className="field">Planned day · optional
        <input type="date" name="planned_on" value={value.planned_on ?? ''} disabled={disabled} onChange={e => onChange('planned_on', e.target.value || null)} />
      </label>
      <label className="field">Deadline · optional
        <input type="datetime-local" name="due_at" value={localDateInput(value.due_at ?? null)} disabled={disabled}
          onChange={e => onChange('due_at', fromLocal(e.target.value))} />
      </label>
      <label className="field">Available after · optional
        <input type="datetime-local" name="not_before" value={localDateInput(value.not_before ?? null)} disabled={disabled}
          onChange={e => onChange('not_before', fromLocal(e.target.value))} />
      </label>
      <label className="field">Dependencies <span className="muted">Select zero or more. Use Ctrl / Cmd for multiple.</span>
        <select name="dependencies" multiple size={3} value={value.dependencies ?? []} disabled={disabled}
          onChange={e => onChange('dependencies', Array.from(e.target.selectedOptions, option => option.value))}>
          {tasks.filter(t => t.id !== selfId).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      </label>
      <label className="field">Context
        <textarea name="detail" maxLength={16000} value={value.detail ?? ''} disabled={disabled} onChange={e => onChange('detail', e.target.value)} />
      </label>
      <label className="field">Session or document link · optional
        <input type="url" name="session_url" placeholder="https://…" value={value.session_url ?? ''} disabled={disabled}
          onChange={e => onChange('session_url', e.target.value)} />
      </label>
    </div>
  );
}
