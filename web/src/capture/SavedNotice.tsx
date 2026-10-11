import { useState, type FormEvent } from 'react';
import type { ApiError } from '../api/client';
import { useNote, useUpdateNote } from '../state/queries';
import { S } from '../strings';
import { Icon } from '../ui/Icon';
import { messageOf } from '../ui/Toast';

export type SavedCapture = { id: string; state: 'queued' | 'rejected' | 'server' };

export const STORAGE_LABELS = {
  device: S.draftSaved,                                       // 'Draft on this device · not uploaded' (app.js:66)
  queued: 'Queued on this device · not on your server yet',   // new (handbook §20)
  rejected: 'Not accepted by your server · kept on this device',   // new
  server: 'Saved on your server',                             // new
} as const;

export const FOLDER_MAX_LENGTH = 240;   // models.py NoteUpdate.folder

type Props = { saved: SavedCapture; onOpenNote: (id: string) => void; onOpenQueue: () => void; onDismiss: () => void };

export function SavedNotice({ saved, onOpenNote, onOpenQueue, onDismiss }: Props) {
  return (
    <div className="saved-notice" role="status" data-storage={saved.state}>
      <div className="saved-notice-body">
        {saved.state === 'server' ? (
          <ServerSaved id={saved.id} onOpenNote={onOpenNote} />
        ) : (
          <p>
            <span className="storage-label">{STORAGE_LABELS[saved.state]}</span>
            {saved.state === 'rejected' && (
              <> <button type="button" className="text-button" onClick={onOpenQueue}>{S.outboxTitle}</button></>
            )}
          </p>
        )}
      </div>
      <button type="button" className="icon-button" aria-label="Dismiss" onClick={onDismiss}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

function ServerSaved({ id, onOpenNote }: { id: string; onOpenNote: (id: string) => void }) {
  const note = useNote(id);
  const update = useUpdateNote();
  const [changing, setChanging] = useState(false);
  const [folder, setFolder] = useState('');
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);

  if (!note.data) {
    return <p>{note.isError ? messageOf(note.error) : 'Checking your server…'}</p>;
  }
  const current = note.data;

  async function move(event: FormEvent) {
    event.preventDefault();
    const next = folder.trim();
    if (!next) {
      setError({ message: 'Folder cannot be blank.', conflict: false });
      return;
    }
    setError(null);
    try {
      await update.mutateAsync({ id, body: { title: current.title, folder: next, body: current.body, expected_version: current.version } });
      setChanging(false);
    } catch (caught) {
      setError({ message: messageOf(caught), conflict: (caught as ApiError).status === 409 });
    }
  }

  return (
    <>
      <p>
        <span className="storage-label">{STORAGE_LABELS.server}</span> · <strong>{current.title}</strong> · <span>{current.folder}</span>
      </p>
      <div className="inline-actions">
        <button type="button" className="text-button" onClick={() => onOpenNote(id)}>Open note</button>
        {!changing && (
          <button type="button" className="text-button" onClick={() => { setFolder(current.folder); setError(null); setChanging(true); }}>
            Change folder
          </button>
        )}
      </div>
      {changing && (
        <form className="folder-form" onSubmit={event => void move(event)}>
          <label>Folder<input value={folder} maxLength={FOLDER_MAX_LENGTH} onChange={event => setFolder(event.target.value)} /></label>
          <button type="submit" className="secondary" disabled={update.isPending}>Move</button>
          <button type="button" className="quiet-button" onClick={() => { setChanging(false); setError(null); }}>Cancel</button>
        </form>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error.message}
          {error.conflict && (
            <> <button type="button" className="text-button" onClick={() => { setError(null); void note.refetch(); }}>Reopen</button></>
          )}
        </p>
      )}
    </>
  );
}
