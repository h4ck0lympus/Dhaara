// Task field helpers shared by the data layer (contract §4.5). 02-screens-core Task 3 adds the rest of this module.
import type { Task, TaskEditable } from '../api/schemas';

export const TASK_EDIT_FIELDS = ['title', 'project', 'detail', 'next_action', 'status', 'priority', 'due_at', 'not_before', 'planned_on', 'estimate_minutes', 'dependencies', 'session_url'] as const; // app.js:343,382

export function editableFields(task: Task): TaskEditable {
  return Object.fromEntries(TASK_EDIT_FIELDS.map((name) => [name, task[name]])) as TaskEditable;
}
