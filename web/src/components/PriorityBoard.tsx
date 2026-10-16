import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { JSX } from 'react';
import type { SnapshotTask } from '../api/schemas';
import { PRIORITY_GROUPS, moveTask, priorityGroups, readableTaskTitle, type PriorityGroup } from '../domain/tasks';
import { useReorderTasks } from '../state/queries';
import { Icon } from '../ui/Icon';
import { toastError } from '../ui/Toast';
import { TaskRow } from './TaskRow';

const LABEL: Record<PriorityGroup, string> = { high: 'High', medium: 'Medium', low: 'Low' };

function SortableTask({ task }: { task: SnapshotTask }): JSX.Element {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <div ref={setNodeRef} className={isDragging ? 'sortable dragging' : 'sortable'} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <TaskRow task={task} lead={
        <button type="button" ref={setActivatorNodeRef} className="drag-handle" aria-label={`Move ${readableTaskTitle(task)}`} {...attributes} {...listeners}>
          <Icon name="grip" size={16} />
        </button>
      } />
    </div>
  );
}

function Group({ group, tasks }: { group: PriorityGroup; tasks: SnapshotTask[] }): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: group });
  return (
    <section ref={setNodeRef} className={`task-group priority-group ${group}`} data-over={isOver} aria-labelledby={`priority-${group}`}>
      <h2 className="eyebrow"><i className={`priority-dot ${group}`} aria-hidden="true" /><span id={`priority-${group}`}>{LABEL[group]} priority</span><span className="group-count">{tasks.length}</span></h2>
      <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
        {tasks.map(t => <SortableTask key={t.id} task={t} />)}
      </SortableContext>
      {!tasks.length && <p className="drop-hint">Drag a task here to make it {LABEL[group].toLowerCase()} priority.</p>}
    </section>
  );
}

export function PriorityBoard({ tasks }: { tasks: SnapshotTask[] }): JSX.Element {
  const reorder = useReorderTasks();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const groups = priorityGroups(tasks);
  function onDragEnd({ active, over }: DragEndEvent) {
    const move = over ? moveTask(groups, String(active.id), String(over.id)) : null;
    if (move) reorder.mutate(move, { onError: toastError });
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      {PRIORITY_GROUPS.map(group => <Group key={group} group={group} tasks={groups[group]} />)}
    </DndContext>
  );
}
