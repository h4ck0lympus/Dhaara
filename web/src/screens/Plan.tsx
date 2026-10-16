import { useState, type JSX } from 'react';
import { PriorityBoard } from '../components/PriorityBoard';
import { TaskRow } from '../components/TaskRow';
import { COPY } from '../copy';
import { useConnected } from '../domain/connection';
import { age, localDay } from '../domain/format';
import { openTasks, readableTaskTitle } from '../domain/tasks';
import { openDialog } from '../shell/dialogs';
import { OfflineNotice } from '../shell/OfflineNotice';
import { useSnapshot } from '../state/queries';
import { S } from '../strings';
import { Swirl } from '../ui/Ambient';

function Disclosure({ label, children, className = '' }: { label: string; children: JSX.Element; className?: string }): JSX.Element {
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
  const tasks = snapshot?.tasks ?? [];
  const todo = snapshot ? openTasks(snapshot) : [];
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

      <div className="task-board">
        {todo.length ? <PriorityBoard tasks={todo} /> : <p className="muted small empty-line">Nothing to do right now.</p>}
        <button type="button" className="new-task" onClick={addTask}><span aria-hidden="true">+</span>New task<kbd>N</kbd></button>
      </div>

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
