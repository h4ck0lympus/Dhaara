import { useState, type JSX } from 'react';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { TaskRow } from '../components/TaskRow';
import { COPY } from '../copy';
import { useConnected } from '../domain/connection';
import { age } from '../domain/format';
import { TASK_FILTERS, filterTasks, type TaskFilter } from '../domain/tasks';
import { openDialog } from '../shell/dialogs';
import { OfflineNotice } from '../shell/OfflineNotice';
import { useSnapshot } from '../state/queries';
import { S } from '../strings';
import { Icon } from '../ui/Icon';
import { PageHeading } from '../ui/PageHeading';

export function PlanScreen(): JSX.Element {
  const snapshot = useSnapshot().data;
  const connected = useConnected();
  const { view } = useSearch({ strict: false });
  const navigate = useNavigate();
  const filter = (TASK_FILTERS.some(f => f.id === view) || view === 'upcoming' ? view : 'open') as TaskFilter | 'upcoming';
  const setFilter = (value: string) => void navigate({ to: '/plan', search: { view: value }, replace: true });
  const [search, setSearch] = useState('');
  const [project, setProject] = useState('');
  const [sort, setSort] = useState('priority');
  const [limit, setLimit] = useState(50);
  const source = snapshot ? filterTasks(snapshot, filter === 'upcoming' ? 'open' : filter) : [];
  const list = source.filter(t => (filter !== 'upcoming' || t.due_at) && (!project || t.project === project) && `${t.title} ${t.project} ${t.next_action}`.toLowerCase().includes(search.toLowerCase()));
  if (sort === 'due' || filter === 'upcoming') list.sort((a, b) => (a.due_at ? Date.parse(a.due_at) : Infinity) - (b.due_at ? Date.parse(b.due_at) : Infinity));
  if (sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title));
  const addTask = () => openDialog({ kind: 'task-capture' });
  return (
    <section className="plan-page">
      <PageHeading title={COPY.plan.title} subtitle={COPY.plan.subtitle}
        action={<button type="button" className="primary" onClick={addTask}><Icon name="plus" size={18} />{S.addTask}</button>} />
      <OfflineNotice />
      <div className="filter-bar" role="group" aria-label="Task views">
        {TASK_FILTERS.map(f => (
          <button type="button" key={f.id} className="filter-chip" aria-label={f.label} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label} <span className="count">{snapshot ? filterTasks(snapshot, f.id).length : 0}</span></button>
        ))}
      </div>
      <div className="task-search-tools">
        <input type="search" aria-label="Search tasks" placeholder="Search tasks…" value={search} onChange={e => { setSearch(e.target.value); setLimit(50); }} />
        <select aria-label="Project" value={project} onChange={e => { setProject(e.target.value); setLimit(50); }}><option value="">All projects</option>{[...new Set(snapshot?.tasks.map(t => t.project).filter(Boolean))].sort().map(p => <option key={p}>{p}</option>)}</select>
        <select aria-label="Sort tasks" value={sort} onChange={e => setSort(e.target.value)}><option value="priority">Priority</option><option value="due">Due date</option><option value="title">Title</option></select>
        {filter === 'upcoming' && <span>Upcoming deadlines</span>}
      </div>
      {!connected && snapshot && <p className="eyebrow">{S.lastKnown + age(snapshot.server_time)}</p>}
      <div className="plan-list" data-quiet="">
        <div className="plan-header" aria-hidden="true"><span>Task</span><span>Priority</span></div>
        {list.length
          ? list.slice(0, limit).map(t => <TaskRow key={t.id} task={t} />)
          : <div className="empty"><p>No tasks in this view.</p><button type="button" className="text-button" onClick={addTask}>Add something for later</button></div>}
      </div>
      {list.length > limit && <button type="button" className="secondary" onClick={() => setLimit(n => n + 50)}>Show more ({list.length - limit} remaining)</button>}
    </section>
  );
}
