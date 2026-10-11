// web/src/screens/Plan.tsx
import { useState, type JSX } from 'react';
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
  const [filter, setFilter] = useState<TaskFilter>('open');
  const list = snapshot ? filterTasks(snapshot, filter) : [];
  const addTask = () => openDialog({ kind: 'task-capture' });
  return (
    <section className="plan-page">
      <PageHeading title={COPY.plan.title} subtitle={COPY.plan.subtitle}
        action={<button type="button" className="primary" onClick={addTask}><Icon name="plus" size={18} />{S.addTask}</button>} />
      <OfflineNotice />
      <div className="filter-bar" role="group" aria-label="Task views">
        {TASK_FILTERS.map(f => (
          <button type="button" key={f.id} className="filter-chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>
        ))}
      </div>
      {!connected && snapshot && <p className="eyebrow">{S.lastKnown + age(snapshot.server_time)}</p>}
      <div className="plan-list" data-quiet="">
        <div className="plan-header" aria-hidden="true"><span>Task</span><span>Priority</span></div>
        {list.length
          ? list.map(t => <TaskRow key={t.id} task={t} />)
          : <div className="empty"><p>No tasks in this view.</p><button type="button" className="text-button" onClick={addTask}>Add something for later</button></div>}
      </div>
    </section>
  );
}
