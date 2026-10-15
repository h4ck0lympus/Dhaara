import type { Focus } from '../api/schemas';

export function confirmFocusChange(focus: Focus, taskId: string | null): boolean {
  if (!focus?.pinned) return true;
  if (taskId === null) return window.confirm('Unpin and clear your current focus?');
  return focus.task_id === taskId || window.confirm('Replace your pinned focus with this task?');
}
