import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { COPY } from '../copy';
import { useConnected } from '../domain/connection';
import { age } from '../domain/format';
import { OfflineNotice } from '../shell/OfflineNotice';
import { useSearch, useSnapshot } from '../state/queries';
import { Icon } from '../ui/Icon';
import { PageHeading } from '../ui/PageHeading';
import { SEARCH_DEBOUNCE_MS, SEARCH_MAX_LENGTH, foldersOf, inFolder, localNoteMatches } from './notesList';
import '../styles/capture-notes.css';

export function NotesScreen({ onOpenNote, onCapture }: { onOpenNote?: (id: string) => void; onCapture?: () => void } = {}) {
  const notes = useSnapshot().data?.notes ?? [];
  const connected = useConnected();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState('');
  const [paneOpen, setPaneOpen] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setQ(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const search = useSearch(q);
  const searching = q !== '';
  const fallback = searching && (!connected || search.isError);
  const pending = searching && !fallback && search.isPending;
  const source = !searching ? notes : fallback ? localNoteMatches(notes, q) : (search.data ?? []);
  const rows = inFolder(source, folder);
  const folders = foldersOf(notes);

  return (
    <div className="screen notes-screen" data-quiet>
      <OfflineNotice />
      <PageHeading title={COPY.notes.title} subtitle={COPY.notes.subtitle} />
      <label className="search-field">
        <Icon name="search" />
        <span className="sr-only">Search notes</span>
        <input
          id="note-search"
          type="search"
          value={input}
          maxLength={SEARCH_MAX_LENGTH}
          placeholder="Search words in your notes…"
          onChange={event => setInput(event.target.value)}
        />
      </label>
      <div className="folder-select">
        <label htmlFor="note-folder-select">Folder</label>
        <select id="note-folder-select" value={folder} onChange={event => setFolder(event.target.value)}>
          <option value="">All notes ({notes.length})</option>
          {folders.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>
      <div className={paneOpen ? 'notes-layout' : 'notes-layout pane-closed'}>
        <aside className="note-navigation" id="note-folders" aria-label="Note folders">
          <button type="button" aria-pressed={folder === ''} onClick={() => setFolder('')}>
            <Icon name="folder" size={17} />All notes <span className="count">{notes.length}</span>
          </button>
          {folders.map(name => (
            <button key={name} type="button" aria-pressed={folder === name} onClick={() => setFolder(name)}>
              <Icon name="folder" size={17} />{name}
            </button>
          ))}
        </aside>
        <section aria-label={searching ? 'Search results' : 'Recent notes'} data-quiet>
          <div className="list-heading">
            <button
              type="button"
              className="quiet-button pane-toggle"
              aria-expanded={paneOpen}
              aria-controls="note-folders"
              onClick={() => setPaneOpen(open => !open)}
            >
              <Icon name="sidebar" />Folders
            </button>
            <h2 className="eyebrow">{searching ? 'Results' : 'Recent'}</h2>
          </div>
          {fallback && (
            <p className="notice" role="status">Server search is unavailable. Showing title and folder matches on this device.</p>
          )}
          {pending && <p className="subtle-line" role="status">Searching…</p>}
          {rows.map(note => (
            <Link key={note.id} to="/note/$id" params={{ id: note.id }} className="note-row" onClick={event => { if (onOpenNote) { event.preventDefault(); onOpenNote(note.id); } }}>
              <span className="note-row-title">{note.title}</span>
              <span className="note-row-meta">
                {note.folder} · {age(note.updated_at)}{note.processing ? ` · ${note.processing}` : ''}
              </span>
            </Link>
          ))}
          {!pending && rows.length === 0 && (searching ? (
            <p className="empty-state">No matching notes.</p>
          ) : (
            <div className="empty-state">
              <h2>No notes here yet.</h2>
              <p>Save a brain dump. Folder filing happens after capture, not before it.</p>
              <Link to="/capture" className="primary" onClick={event => { if (onCapture) { event.preventDefault(); onCapture(); } }}>Capture a thought</Link>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
