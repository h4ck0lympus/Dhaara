import type { JSX } from 'react';
import { TaskDetailDialog } from '../dialogs/TaskDetail';
import { TaskCaptureDialog } from '../dialogs/TaskCapture';
import { closeDialog, useDialog } from './dialogs';

export function DialogHost(): JSX.Element | null {
  const request = useDialog();
  switch (request?.kind) {
    case 'task': return <TaskDetailDialog key={request.id} id={request.id} onClose={closeDialog} />;
    case 'task-capture': return <TaskCaptureDialog onClose={closeDialog} />;
    default: return null; // Phase 2b adds outbox, settings, note-history and sketch
  }
}
