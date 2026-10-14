import type { JSX } from 'react';
import { SettingsDialog } from '../dialogs/Settings';
import { SketchDialog } from '../capture/Sketch';
import { NoteHistoryDialog } from '../dialogs/NoteHistory';
import { OutboxDialog } from '../dialogs/Outbox';
import { TaskDetailDialog } from '../dialogs/TaskDetail';
import { TaskCaptureDialog } from '../dialogs/TaskCapture';
import { closeDialog, useDialog } from './dialogs';

export function DialogHost(): JSX.Element | null {
  const request = useDialog();
  switch (request?.kind) {
    case 'task': return <TaskDetailDialog key={request.id} id={request.id} onClose={closeDialog} />;
    case 'task-capture': return <TaskCaptureDialog onClose={closeDialog} />;
    case 'sketch': return <SketchDialog onClose={closeDialog} />;
    case 'outbox': return <OutboxDialog onClose={closeDialog} />;
    case 'note-history': return <NoteHistoryDialog onClose={closeDialog} noteId={request.noteId} />;
    case 'settings': return <SettingsDialog onClose={closeDialog} section={request.section} />;
    case undefined: return null;
    default: {
      const unhandled: never = request;
      return unhandled;
    }
  }
}
