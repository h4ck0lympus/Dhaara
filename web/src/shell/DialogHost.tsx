import type { JSX } from 'react';
import { SketchDialog } from '../capture/Sketch';
import { TaskDetailDialog } from '../dialogs/TaskDetail';
import { TaskCaptureDialog } from '../dialogs/TaskCapture';
import { closeDialog, useDialog } from './dialogs';

export function DialogHost(): JSX.Element | null {
  const request = useDialog();
  switch (request?.kind) {
    case 'task': return <TaskDetailDialog key={request.id} id={request.id} onClose={closeDialog} />;
    case 'task-capture': return <TaskCaptureDialog onClose={closeDialog} />;
    case 'sketch': return <SketchDialog onClose={closeDialog} />;
    case 'settings': case 'outbox': case 'note-history': case undefined: return null; // Phase 2b adds these arms
    default: {
      const unhandled: never = request;
      return unhandled;
    }
  }
}
