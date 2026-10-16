import { Link, useNavigate, useSearch as useRouteSearch } from '@tanstack/react-router';
import { Suspense, lazy, useEffect, useRef, useState, type JSX, type KeyboardEvent, type PointerEvent } from 'react';
import { useConnected } from '../domain/connection';
import { age } from '../domain/format';
import { isDialogOpen } from '../shell/dialogs';
import { OfflineNotice } from '../shell/OfflineNotice';
import { useSearch, useSnapshot } from '../state/queries';
import { Icon } from '../ui/Icon';
import { RESIZE_STEP, clampWidth, readPanes, savePanes, type PaneId, type Panes } from './notesPanes';
import { SEARCH_DEBOUNCE_MS, foldersOf, inFolder, localNoteMatches } from './notesList';
import '../styles/capture-notes.css';

const EmbeddedNote = lazy(() => import('./NoteView').then(m => ({ default: m.EmbeddedNote })));

export type NotesSearch = { q?: string; folder?: string; note?: string };
const PANE_LABEL: Record<PaneId, string> = { folders: 'folders', list: 'note list', note: 'note' };
const PANE_KEY: Record<string, PaneId> = { 1: 'folders', 2: 'list', 3: 'note' };

function usePanes(): [Panes, (change: Partial<Panes>) => void] {
  const [panes, setPanes] = useState(readPanes);
  const update = (change: Partial<Panes>) => setPanes(current => { const next = { ...current, ...change }; savePanes(next); return next; });
  return [panes, update];
}

function PaneToggle({ pane, shown, onToggle }: { pane: PaneId; shown: boolean; onToggle: () => void }): JSX.Element {
  const label = `${shown ? 'Hide' : 'Show'} ${PANE_LABEL[pane]}`;
  return <button type="button" className="pane-toggle icon-button" aria-label={label} title={`${label}  Ctrl ${Object.keys(PANE_KEY).find(k => PANE_KEY[k] === pane)}`} aria-pressed={shown} onClick={onToggle}><Icon name="sidebar" size={18} /></button>;
}

function Resizer({ label, width, onWidth }: { label: string; width: number; onWidth: (w: number) => void }): JSX.Element {
  const start = useRef<{ x: number; width: number } | null>(null);
  const down = (e: PointerEvent<HTMLButtonElement>) => { start.current = { x: e.clientX, width }; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const move = (e: PointerEvent<HTMLButtonElement>) => { if (start.current) onWidth(start.current.width + e.clientX - start.current.x); };
  const up = () => { start.current = null; };
  const key = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); onWidth(width + (e.key === 'ArrowRight' ? RESIZE_STEP : -RESIZE_STEP)); }
  };
  return <button type="button" className="pane-resizer" aria-label={`Resize ${label} pane (arrow keys)`} aria-valuenow={width} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key} />;
}

function Collapsed({ pane, title, onShow }: { pane: PaneId; title: string; onShow: () => void }): JSX.Element {
  return <div className="pane-collapsed"><PaneToggle pane={pane} shown={false} onToggle={onShow} /><span aria-hidden="true">{title}</span></div>;
}

export function NotesScreen(): JSX.Element {
  const notes = useSnapshot().data?.notes ?? [];
  const connected = useConnected();
  const navigate = useNavigate();
  const { q: rawQ = '', folder = '', note: noteId } = useRouteSearch({ strict: false }) as NotesSearch;
  const [q, setQ] = useState(rawQ.trim());
  const [panes, setPanes] = usePanes();

  useEffect(() => {
    const timer = setTimeout(() => setQ(rawQ.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [rawQ]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const pane = PANE_KEY[e.key];
      if (!pane || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || isDialogOpen()) return;
      e.preventDefault();
      setPanes({ [pane]: !panes[pane] });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const go = (change: NotesSearch) => void navigate({ to: '/notes', search: (prev: NotesSearch) => ({ ...prev, ...change }) });
  const search = useSearch(q);
  const searching = q !== '';
  const fallback = searching && (!connected || search.isError);
  const pending = searching && !fallback && search.isPending;
  const rows = inFolder(!searching ? notes : fallback ? localNoteMatches(notes, q) : (search.data ?? []), folder);
  const folders = foldersOf(notes);
  const listTitle = searching ? 'Results' : folder || 'All notes';
  const toggle = (pane: PaneId) => setPanes({ [pane]: !panes[pane] });
  const count = (name: string) => notes.filter(n => n.folder === name).length;

  return (
    <div className="notes wide-screen" data-has-note={noteId ? 'true' : 'false'}>
      <OfflineNotice />
      <div className="notes-panes">
        {panes.folders ? <>
          <aside className="pane folders-pane" aria-label="Folders" style={{ width: panes.foldersWidth }}>
            <div className="pane-head"><PaneToggle pane="folders" shown onToggle={() => toggle('folders')} /></div>
            <button type="button" className="folder-row" aria-pressed={folder === ''} onClick={() => go({ folder: undefined })}>All notes{' '}<span>{notes.length}</span></button>
            <div className="pane-rule" />
            <div className="eyebrow pane-label">Folders</div>
            {folders.map(name => <button type="button" key={name} className="folder-row" aria-pressed={folder === name} onClick={() => go({ folder: name })}>{name}{' '}<span>{count(name)}</span></button>)}
            <p className="folders-footer">{notes.length} note{notes.length === 1 ? '' : 's'} · {folders.length} folder{folders.length === 1 ? '' : 's'}</p>
          </aside>
          <Resizer label="folders" width={panes.foldersWidth} onWidth={w => setPanes({ foldersWidth: clampWidth('foldersWidth', w) })} />
        </> : <Collapsed pane="folders" title="Folders" onShow={() => toggle('folders')} />}

        {panes.list ? <>
          <section className={panes.note ? 'pane list-pane' : 'pane list-pane grow'} aria-label={searching ? 'Search results' : `Notes in ${listTitle}`} style={{ width: panes.note ? panes.listWidth : undefined }}>
            <div className="pane-head"><span className="pane-title">{listTitle}</span><PaneToggle pane="list" shown onToggle={() => toggle('list')} /></div>
            <div className="folder-select">
              <label htmlFor="note-folder" className="sr-only">Folder</label>
              <select id="note-folder" value={folder} onChange={e => go({ folder: e.target.value || undefined })}>
                <option value="">All notes ({notes.length})</option>
                {folders.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            {fallback && <p className="notice" role="status">Server search is unavailable. Showing title and folder matches on this device.</p>}
            {pending && <p className="subtle-line" role="status">Searching…</p>}
            {rows.map(n => (
              <button type="button" key={n.id} className="note-row" aria-current={n.id === noteId ? 'true' : undefined} onClick={() => go({ note: n.id })}>
                <span className="note-row-title">{n.title}</span>
                <span className="note-row-meta">{folder ? '' : `${n.folder} · `}{age(n.updated_at)}{n.processing ? ` · ${n.processing}` : ''}</span>
              </button>
            ))}
            {!pending && rows.length === 0 && (searching ? <p className="empty-state">No matching notes.</p> : (
              <div className="empty-state">
                <h2>No notes here yet.</h2>
                <p>Save a brain dump. Folder filing happens after capture, not before it.</p>
                <Link to="/capture" className="primary">Capture a thought</Link>
              </div>
            ))}
          </section>
          {panes.note && <Resizer label="note list" width={panes.listWidth} onWidth={w => setPanes({ listWidth: clampWidth('listWidth', w) })} />}
        </> : <Collapsed pane="list" title={listTitle} onShow={() => toggle('list')} />}

        {panes.note ? (
          <article className="pane note-pane" aria-label="Open note">
            <PaneToggle pane="note" shown onToggle={() => toggle('note')} />
            {noteId
              ? <Suspense fallback={<p className="subtle-line" role="status">Opening note…</p>}><EmbeddedNote key={noteId} id={noteId} onBack={() => go({ note: undefined })} /></Suspense>
              : <p className="empty-state">Choose a note to read it here.</p>}
          </article>
        ) : <Collapsed pane="note" title="Note" onShow={() => toggle('note')} />}
      </div>
    </div>
  );
}
