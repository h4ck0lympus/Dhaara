import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { isConflict } from '../api/client';
import type { Note } from '../api/schemas';
import { age, noteMarkdownExport } from '../domain/format';
import { useNavigationGuard, type NavigationGuard } from '../routes/guards';
import { openDialog } from '../shell/dialogs';
import { OfflineNotice } from '../shell/OfflineNotice';
import { useApplySuggestion, useNote, useProcessNote, useUpdateNote } from '../state/queries';
import { S } from '../strings';
import { FOLDER_MAX } from '../local/limits';
import { Markdown } from '../ui/Markdown';
import { messageOf, toast } from '../ui/Toast';
import '../styles/capture-notes.css';

export const NOTE_TEXT = {
  revisionSaved: 'Revision saved. The original is unchanged.',
  queued: 'Queued for local processing.',
  suggestion: 'An AI suggestion arrived after your edit. Nothing was overwritten.',
  emptyBody: 'Your visual or recording is saved below.',
  noTypedInput: '(No typed input)',
  transcriptHeading: 'VOICE TRANSCRIPT',
  unavailable: 'Note unavailable',
  blank: 'Title and folder cannot be blank.',
  reloadConfirm: 'Replace your draft with the latest saved version? Your unsaved edit will be discarded.',
} as const;

const TITLE_MAX = 240, BODY_MAX = 150_000;

type EditForm = { title: string; folder: string; body: string; baseVersion: number };
type FormError = { message: string; conflict: boolean };

function errorOf(error: unknown): FormError {
  const conflict = isConflict(error);
  return { message: conflict ? S.noteConflict : messageOf(error), conflict };
}

export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function NoteViewScreen() {
  const { id } = useParams({ from: '/note/$id' });
  return <EmbeddedNote id={id} />;
}

export function EmbeddedNote({ id, onBack }: { id: string; onBack?: () => void }) {
  const note = useNote(id);
  if (note.data) return <NotePage key={id} onBack={onBack} note={note.data} refetch={async () => (await note.refetch()).data} />;
  if (note.isError) {
    return (
      <div className="screen note-screen" data-quiet>
        <OfflineNotice />
        <header className="page-heading" data-quiet>
          <h1>{NOTE_TEXT.unavailable}</h1>
          <p>{note.error.message}</p>
        </header>
        <Link to="/notes" className="text-button" onClick={e => { if (onBack) { e.preventDefault(); onBack(); } }}>← All notes</Link>
      </div>
    );
  }
  return (
    <div className="screen note-screen" data-quiet>
      <OfflineNotice />
      <p className="subtle-line" role="status">Opening note…</p>
    </div>
  );
}

function NotePage({ note, refetch, onBack }: { note: Note; refetch: () => Promise<Note | undefined>; onBack?: () => void }) {
  const [view, setView] = useState<'note' | 'original'>('note');
  const [edit, setEdit] = useState<EditForm | null>(null);
  const [formError, setFormError] = useState<FormError | null>(null);
  const update = useUpdateNote();
  const apply = useApplySuggestion();
  const process = useProcessNote();

  const editing = edit !== null;
  const editGuard = useMemo<NavigationGuard | null>(
    () => (editing ? { id: 'note-edit', check: () => ({ kind: 'confirm', message: S.leaveNoteEdit }), beforeUnload: true } : null),
    [editing],
  );
  useNavigationGuard(editGuard);

  function closeEdit() {
    setEdit(null);
    setFormError(null);
  }

  function show(next: 'note' | 'original') {
    if (edit && !window.confirm(S.leaveNoteEdit)) return;
    closeEdit();
    setView(next);
  }

  function startEdit() {
    setEdit({ title: note.title, folder: note.folder, body: note.body, baseVersion: note.version });
    setFormError(null);
    setView('note');
  }

  function change(field: 'title' | 'folder' | 'body', value: string) {
    setEdit(current => current && { ...current, [field]: value });
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!edit) return;
    if (!edit.title.trim() || !edit.folder.trim()) {
      setFormError({ message: NOTE_TEXT.blank, conflict: false });
      return;
    }
    setFormError(null);
    try {
      await update.mutateAsync({ id: note.id, body: { title: edit.title, folder: edit.folder, body: edit.body, expected_version: edit.baseVersion } });
      closeEdit();
      toast(NOTE_TEXT.revisionSaved);
    } catch (error) {
      const failure = errorOf(error);
      setFormError(failure);
      if (failure.conflict) void refetch();
    }
  }

  async function reloadLatest() {
    if (!window.confirm(NOTE_TEXT.reloadConfirm)) return;
    const fresh = await refetch();
    if (!fresh) return;
    setEdit({ title: fresh.title, folder: fresh.folder, body: fresh.body, baseVersion: fresh.version });
    setFormError(null);
  }

  async function applySuggestion(sid: string) {
    try {
      await apply.mutateAsync({ id: note.id, sid, expectedVersion: note.version });
    } catch (error) {
      toast(messageOf(error), { tone: 'error' });
    }
  }

  async function runProcess(kind: 'organize' | 'transcribe') {
    try {
      await process.mutateAsync({ id: note.id, kind });
      toast(NOTE_TEXT.queued);
    } catch (error) {
      toast(messageOf(error), { tone: 'error' });
    }
  }

  function exportMarkdown() {
    const { filename, text } = noteMarkdownExport(note);
    downloadText(filename, text);
  }

  const taskId = note.task_id;
  const hasAudio = note.attachments.some(attachment => attachment.mime.startsWith('audio/'));

  return (
    <div className="screen note-screen" data-quiet>
      <OfflineNotice />
      <Link to="/notes" className="text-button" onClick={e => { if (onBack) { e.preventDefault(); onBack(); } }}>← All notes</Link>
      <article className="note-page" data-quiet>
        <div className="note-meta">
          <span>{note.folder} · {age(note.updated_at)}</span>
          {taskId && <button type="button" className="text-button" onClick={() => openDialog({ kind: 'task', id: taskId })}>Linked task ↗</button>}
        </div>
        <div className="note-title-row">
          <h1>{note.title}</h1>
          {!editing && <button type="button" className="quiet-button" onClick={startEdit}>Edit</button>}
        </div>
        {note.error && <p className="notice error" role="alert">{note.error}</p>}
        {note.processing && note.processing !== 'error' && (
          <p className="notice" role="status">
            {note.processing}. Your original is saved.{' '}
            <button type="button" className="text-button" onClick={() => void refetch()}>Refresh</button>
          </p>
        )}
        <p className="status-line">
          {note.mode === 'original' ? 'Original wording · basic folder filing' : note.mode}
          {note.mode.startsWith('AI') ? ' · review the interpretation' : ''}
        </p>
        <div className="note-toolbar">
          <div className="segmented" role="group" aria-label="Note views">
            <button type="button" aria-pressed={view === 'note'} disabled={update.isPending} onClick={() => show('note')}>Note</button>
            <button type="button" aria-pressed={view === 'original'} disabled={update.isPending} onClick={() => show('original')}>Original</button>
            <button type="button" onClick={() => openDialog({ kind: 'note-history', noteId: note.id })}>History</button>
          </div>
        </div>
        {edit ? (
          <form className="note-form" onSubmit={event => void saveEdit(event)}>
            <label htmlFor="note-edit-title">Title</label>
            <input id="note-edit-title" value={edit.title} required maxLength={TITLE_MAX} onChange={event => change('title', event.target.value)} />
            <label htmlFor="note-edit-folder">Folder</label>
            <input id="note-edit-folder" value={edit.folder} required maxLength={FOLDER_MAX} onChange={event => change('folder', event.target.value)} />
            <label htmlFor="note-edit-body">Note</label>
            <textarea id="note-edit-body" className="note-editor" value={edit.body} maxLength={BODY_MAX} onChange={event => change('body', event.target.value)} />
            {formError?.conflict && (
              <details className="latest-version" open>
                <summary>Latest saved version · {note.version}</summary>
                <p>{note.title} · {note.folder}</p>
                <div className="original-block">{note.body}</div>
              </details>
            )}
            {formError && (
              <p className="field-error" role="alert">
                {formError.message}
                {formError.conflict && (
                  <>
                    {' '}
                    <button type="button" className="text-button" onClick={() => void reloadLatest()}>Reload latest</button>
                    {' '}
                    <button type="button" className="text-button" onClick={() => setFormError(null)}>Keep editing</button>
                  </>
                )}
              </p>
            )}
            <div className="form-actions">
              <button type="button" className="quiet-button" onClick={closeEdit}>Cancel</button>
              <button type="submit" className="primary" disabled={update.isPending}>Save changes</button>
            </div>
          </form>
        ) : view === 'original' ? (
          <div className="original-block">
            {note.raw || NOTE_TEXT.noTypedInput}
            {note.transcript ? `\n\n${NOTE_TEXT.transcriptHeading}\n\n${note.transcript}` : ''}
          </div>
        ) : (
          <div className="note-body"><Markdown text={note.body || NOTE_TEXT.emptyBody} /></div>
        )}
        {note.suggestions.map(suggestion => (
          <details key={suggestion.id} className="suggestion">
            <summary>{NOTE_TEXT.suggestion}</summary>
            <div className="note-body"><Markdown text={suggestion.body} /></div>
            <button type="button" className="secondary" disabled={apply.isPending || editing} onClick={() => void applySuggestion(suggestion.id)}>Use this version</button>
          </details>
        ))}
        {note.attachments.length > 0 && (
          <div className="note-visuals">
            {note.attachments.map(attachment => {
              const src = `/api/attachments/${encodeURIComponent(attachment.id)}`;
              return (
                <figure key={attachment.id} className="embedded-image">
                  {attachment.mime.startsWith('image/')
                    ? <img src={src} alt={attachment.name} loading="lazy" />
                    : <audio controls src={src} preload="metadata" />}
                  <figcaption>{attachment.name}</figcaption>
                </figure>
              );
            })}
          </div>
        )}
        <div className="inline-actions note-actions">
          <button type="button" className="secondary" disabled={process.isPending} onClick={() => void runProcess('organize')}>Organize with local AI</button>
          {hasAudio && <button type="button" className="quiet-button" disabled={process.isPending} onClick={() => void runProcess('transcribe')}>Transcribe recording</button>}
          <button type="button" className="quiet-button" onClick={exportMarkdown}>Export Markdown</button>
        </div>
      </article>
    </div>
  );
}
