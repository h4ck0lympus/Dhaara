import { useState, type JSX } from 'react';
import { dateLabel } from '../domain/format';
import { useNote, useNoteHistory, useRestoreNote } from '../state/queries';
import { Dialog } from '../ui/Dialog';
import { messageOf, toast } from '../ui/Toast';

export function NoteHistoryDialog({ onClose, noteId }: { onClose: () => void; noteId: string }): JSX.Element {
  const note = useNote(noteId);
  const history = useNoteHistory(noteId, true);
  const restore = useRestoreNote();
  const [error, setError] = useState<string | null>(null);
  const currentVersion = note.data?.version;

  async function restoreVersion(version: number) {
    if (currentVersion === undefined) return;
    setError(null);
    try {
      await restore.mutateAsync({ id: noteId, version, expectedVersion: currentVersion });
      onClose();
      toast('Restored as a new revision.');   // app.js:511
    } catch (caught) {
      setError(messageOf(caught));
      void note.refetch();   // a 409 means currentVersion is stale; mirrors NoteView
    }
  }

  return (
    <Dialog title="Note history" onRequestClose={onClose}>
      {history.isPending && <p className="subtle-line" role="status">Loading history…</p>}
      {history.isError && <p className="field-error" role="alert">{history.error.message}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <ol className="history-list">
        {(history.data ?? []).map(revision => (
          <li key={revision.id} className="history-item">
            <div className="inline-actions">
              <span className="subtle-line">Version {revision.version} · {revision.source} · {dateLabel(revision.created_at)}</span>
              {currentVersion !== undefined && revision.version !== currentVersion && (
                <button type="button" className="text-button" disabled={restore.isPending} onClick={() => void restoreVersion(revision.version)}>
                  Restore as a new revision
                </button>
              )}
            </div>
            <details>
              <summary>{revision.title}</summary>
              <div className="original-block">{revision.body}</div>
            </details>
          </li>
        ))}
      </ol>
    </Dialog>
  );
}
