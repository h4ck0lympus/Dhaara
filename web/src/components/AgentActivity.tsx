import type { JSX } from 'react';
import type { SnapshotRun, SnapshotTask } from '../api/schemas';
import { age } from '../domain/format';
import { readableTaskTitle, reviewLink } from '../domain/tasks';
import { openDialog } from '../shell/dialogs';

export function AgentActivity({ id, attention, working, tasks }: { id: string; attention: SnapshotTask[]; working: SnapshotRun[]; tasks: SnapshotTask[] }): JSX.Element {
  const open = (taskId: string) => openDialog({ kind: 'task', id: taskId });
  return (
    <div className="agent-activity" id={id}>
      {attention.length > 0 && (
        <section className="task-group" aria-labelledby={`${id}-needs`}>
          <h2 id={`${id}-needs`} className="eyebrow warn">Needs you</h2>
          {attention.map(t => {
            const link = reviewLink(t);
            const question = t.runs.some(r => r.effective_status === 'needs_input');
            return (
              <div className="attention-row" key={t.id} data-task={t.id}>
                <i className={question ? 'dot warn' : 'dot'} aria-hidden="true" />
                <span className="mono attention-project">{t.project || t.runs[0]?.agent || '—'}</span>
                <button type="button" className="attention-title" onClick={() => open(t.id)}>
                  <span>{readableTaskTitle(t)}</span>
                  <small>{t.runs.some(r => r.effective_status === 'unknown') ? 'No recent updates · Check status' : t.attention_reason}</small>
                </button>
                {link
                  ? <a className="act" href={link} target="_blank" rel="noopener noreferrer">Review ↗</a>
                  : <button type="button" className="act" onClick={() => open(t.id)}>Open</button>}
              </div>
            );
          })}
        </section>
      )}
      {working.length > 0 && (
        <section className="task-group" aria-labelledby={`${id}-working`}>
          <h2 id={`${id}-working`} className="eyebrow">Agents working</h2>
          <ul className="agents-list" aria-label="Agents working">
            {working.map(r => {
              const t = tasks.find(x => x.id === r.task_id);
              return (
                <li key={r.id}>
                  <span className="mono">{t?.project || r.agent}</span>
                  <button type="button" onClick={() => open(r.task_id)}>{t ? readableTaskTitle(t) : r.agent}</button>
                  <span className="mono">{r.agent} · {age(r.updated_at)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
