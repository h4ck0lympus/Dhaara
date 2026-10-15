import { useState, type JSX } from 'react';
import { TaskRow } from '../components/TaskRow';
import { COPY } from '../copy';
import { useConnected } from '../domain/connection';
import { age, localDay } from '../domain/format';
import { openTasks, readableTaskTitle, reviewLink } from '../domain/tasks';
import { openDialog } from '../shell/dialogs';
import { OfflineNotice } from '../shell/OfflineNotice';
import { useSnapshot } from '../state/queries';
import { S } from '../strings';
import { Swirl } from '../ui/Ambient';

const PAGE = 50;

function Disclosure({ label, children, className = '' }: { label: JSX.Element | string; children: JSX.Element; className?: string }): JSX.Element {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={`disclosure ${className}`.trim()} aria-expanded={open} onClick={() => setOpen(v => !v)}>
      {label}<span aria-hidden="true">{open ? ' ▾' : ' ▸'}</span>
    </button>
    {open && children}
  </>;
}

export function PlanScreen(): JSX.Element {
  const snapshot = useSnapshot().data;
  const connected = useConnected();
  const [limit, setLimit] = useState(PAGE);
  const tasks = snapshot?.tasks ?? [];
  const attention = connected ? snapshot?.attention ?? [] : [];
  const attentionIds = new Set(attention.map(t => t.id));
  const working = connected ? (snapshot?.runs ?? []).filter(r => r.effective_status === 'working') : [];
  const todo = snapshot ? openTasks(snapshot).filter(t => !attentionIds.has(t.id)) : [];
  const later = tasks.filter(t => t.status === 'parked');
  const today = localDay(new Date());
  // shortcut: no completed_at field, so a done task edited today also counts; add completed_at if this misleads
  const doneToday = tasks.filter(t => t.status === 'done' && localDay(new Date(t.updated_at)) === today);
  const addTask = () => openDialog({ kind: 'task-capture' });

  return (
    <div className="tasks-page">
      <Swirl motion={snapshot?.settings.motion ?? true} />
      <OfflineNotice />
      <div className="tasks-heading">
        <h1>{COPY.plan.title}</h1>
        <span>{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        {!connected && snapshot && <span className="eyebrow">{S.lastKnown + age(snapshot.server_time)}</span>}
      </div>

      {(attention.length > 0 || working.length > 0) && (
        <section className="task-group" aria-labelledby="needs-you">
          <h2 id="needs-you" className="eyebrow warn">Needs you</h2>
          {attention.map(t => {
            const link = reviewLink(t);
            const question = t.runs.some(r => r.effective_status === 'needs_input');
            return (
              <div className="attention-row" key={t.id} data-task={t.id}>
                <i className={question ? 'dot warn' : 'dot'} aria-hidden="true" />
                <span className="mono attention-project">{t.project || t.runs[0]?.agent || '—'}</span>
                <button type="button" className="attention-title" onClick={() => openDialog({ kind: 'task', id: t.id })}>
                  <span>{readableTaskTitle(t)}</span>
                  <small>{t.runs.some(r => r.effective_status === 'unknown') ? 'No recent updates · Check status' : t.attention_reason}</small>
                </button>
                {link
                  ? <a className="act" href={link} target="_blank" rel="noopener noreferrer">Review ↗</a>
                  : <button type="button" className="act" onClick={() => openDialog({ kind: 'task', id: t.id })}>Open</button>}
              </div>
            );
          })}
          {working.length > 0 && (
            <Disclosure className="agents-toggle" label={<><i className="dots" aria-hidden="true"><i /><i /><i /></i>{working.length} agent{working.length === 1 ? '' : 's'} working</>}>
              <ul className="agents-list" aria-label="Agents working">
                {working.map(r => {
                  const t = tasks.find(x => x.id === r.task_id);
                  return (
                    <li key={r.id}>
                      <span className="mono">{t?.project || r.agent}</span>
                      <button type="button" onClick={() => openDialog({ kind: 'task', id: r.task_id })}>{t ? readableTaskTitle(t) : r.agent}</button>
                      <span className="mono">{r.agent} · {age(r.updated_at)}</span>
                    </li>
                  );
                })}
              </ul>
            </Disclosure>
          )}
        </section>
      )}

      <section className="task-group" aria-labelledby="to-do">
        <h2 id="to-do" className="eyebrow">To do</h2>
        {todo.slice(0, limit).map(t => <TaskRow key={t.id} task={t} />)}
        {todo.length > limit && <button type="button" className="quiet-button show-more" onClick={() => setLimit(n => n + PAGE)}>Show more ({todo.length - limit} remaining)</button>}
        {!todo.length && <p className="muted small empty-line">Nothing to do right now.</p>}
        <button type="button" className="new-task" onClick={addTask}><span aria-hidden="true">+</span>New task<kbd>N</kbd></button>
      </section>

      {later.length > 0 && (
        <section className="task-group later" aria-labelledby="later">
          <h2 id="later" className="eyebrow">Later</h2>
          {later.map(t => <button type="button" key={t.id} className="later-row" data-task={t.id} onClick={() => openDialog({ kind: 'task', id: t.id })}><i aria-hidden="true" />{readableTaskTitle(t)}</button>)}
        </section>
      )}

      {doneToday.length > 0 && (
        <Disclosure className="done-toggle" label={`Done today · ${doneToday.length}`}>
          <section className="task-group" aria-label="Done today">{doneToday.map(t => <TaskRow key={t.id} task={t} />)}</section>
        </Disclosure>
      )}
    </div>
  );
}
