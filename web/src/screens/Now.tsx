import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { confirmFocusChange } from '../components/focus';
import { greeting } from '../copy';
import { useConnected } from '../domain/connection';
import { focusKind, nowState } from '../domain/nowState';
import { age, dateLabel } from '../domain/format';
import { readableTaskTitle, RUN_LABEL, type TaskFilter } from '../domain/tasks';
import { openDialog } from '../shell/dialogs';
import { OfflineNotice } from '../shell/OfflineNotice';
import { useSetFocus, useSnapshot } from '../state/queries';
import { Icon } from '../ui/Icon';
import { toastError } from '../ui/Toast';
import { CaptureScreen } from './Capture';
import { NotesScreen } from './Notes';
import { EmbeddedNote } from './NoteView';
import { TaskCaptureDialog } from '../dialogs/TaskCapture';
import { allowNavigation } from '../routes/guards';

export function NowScreen() {
  const snapshot = useSnapshot().data;
  const connected = useConnected();
  const navigate = useNavigate();
  const setFocus = useSetFocus();
  const [pane, setPane] = useState<'home' | 'capture' | 'task' | 'notes'>('home');
  const [noteId, setNoteId] = useState<string | null>(null);
  const tasks = snapshot?.tasks ?? [];
  const focus = tasks.find(t => t.id === snapshot?.focus?.task_id);
  const attention = connected ? snapshot?.attention ?? [] : [];
  const attentionIds = new Set(attention.map(t => t.id));
  const available = (connected ? snapshot?.available ?? [] : []).filter(t => !attentionIds.has(t.id) && t.id !== focus?.id);
  const running = (connected ? snapshot?.runs ?? [] : []).filter(r => r.effective_status === 'working' && !attentionIds.has(r.task_id) && r.task_id !== focus?.id);
  const used = new Set([focus?.id, ...attentionIds, ...available.slice(0, 3).map(t => t.id), ...running.map(r => r.task_id)]);
  const upcoming = tasks.filter(t => t.status !== 'done' && t.status !== 'parked' && t.due_at)
    .sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!));
  const nextDue = upcoming.filter(t => !used.has(t.id));
  function show(next: typeof pane, id: string | null = null) {
    // Inline panes honor the same recording, saving and unsaved-edit guards as routes.
    if (!allowNavigation('/overview/pane')) return;
    setPane(next); setNoteId(id);
    if (next === 'capture') setTimeout(() => document.querySelector<HTMLTextAreaElement>('#capture-input')?.focus(), 0);
    if (next === 'task') setTimeout(() => document.querySelector<HTMLTextAreaElement>('#task-input')?.focus(), 0);
  }
  useEffect(() => {
    const listener = (event: Event) => show((event as CustomEvent).detail === 'notes' ? 'notes' : 'capture');
    window.addEventListener('dhaara-overview-pane', listener);
    return () => window.removeEventListener('dhaara-overview-pane', listener);
  });
  const all = (filter: TaskFilter | 'upcoming') => void navigate({ to: '/plan', search: { view: filter } });
  const openTask = (id: string) => openDialog({ kind: 'task', id });
  return <div className="now-page overview-v2" data-now-state={nowState(snapshot ?? null, connected, null).mode}>
    <OfflineNotice />
    <div className="overview-columns">
      <div className="overview-work">
        <h1 className="overview-greeting">{greeting(new Date(), snapshot?.settings.display_name ?? '')}</h1>
        <div className={`overview-center ${pane === 'home' ? 'resting' : 'editing'}`}>
          {pane === 'home' ? <div className="particle-space" aria-hidden="true" /> : <div className="inline-workspace" data-quiet>
            <div className="section-header"><span>{noteId ? 'Your note' : pane === 'capture' ? 'Capture a thought' : pane === 'task' ? 'New task' : 'Your library'}</span>
              <button type="button" className="quiet-button" onClick={() => show('home')}>Close <Icon name="close" size={15} /></button></div>
            {pane === 'capture' && <CaptureScreen embedded onOpenNote={id => show('notes', id)} />}
            {pane === 'task' && <TaskCaptureDialog embedded onClose={() => { setPane('home'); }} />}
            {pane === 'notes' && (noteId ? <><EmbeddedNote id={noteId} onBack={() => show('notes')} /></> : <NotesScreen onOpenNote={id => show('notes', id)} onCapture={() => show('capture')} />)}
          </div>}
          {pane === 'home' && <button type="button" className="quick-capture" onClick={() => show('capture')}><Icon name="pen" /><span>Capture a thought…</span><Icon name="image" /><Icon name="mic" /></button>}
          <div className="overview-shortcuts">
            <button type="button" onClick={() => show('capture')}><Icon name="notes" />+ Note</button>
            <button type="button" onClick={() => show('task')}><Icon name="task-check" />+ Task</button>
          </div>
          {pane !== 'notes' && <section className="recent-notes" aria-label="Recent notes">
            <div className="section-header"><h2>Recent notes</h2><button type="button" className="quiet-button" onClick={() => show('notes')}>Browse notes <Icon name="arrow" size={15} /></button></div>
            {(snapshot?.notes ?? []).slice(0, 2).map(note => <button type="button" key={note.id} onClick={() => show('notes', note.id)}>{note.title}</button>)}
            {!snapshot?.notes.length && <p className="small muted">Your saved thoughts will appear here.</p>}
          </section>}
        </div>
      </div>
      <aside className="overview-activity" aria-label="Parallel work and commitments" data-quiet>
        <section aria-label="Current focus">
          <div className="section-header"><h2>Current focus</h2><button type="button" className="quiet-button" onClick={() => all('open')}>Change</button></div>
          {focus ? <><button type="button" className="preview-row focus-preview" onClick={() => openTask(focus.id)}><span>{readableTaskTitle(focus)}</span><small>{focus.next_action || 'Open task to continue'}</small><small className="focus-kind">{!connected ? 'Last known · ' : ''}{snapshot?.focus ? focusKind(snapshot.focus) : ''}</small></button>
            <button type="button" className="quiet-button" onClick={() => { if (confirmFocusChange(snapshot?.focus ?? null, null)) void setFocus.mutateAsync({ taskId: null }).catch(toastError); }}>{snapshot?.focus?.pinned ? 'Unpin & clear' : 'Clear focus'}</button></> : <p className="small muted">Choose a task when you’re ready.</p>}
        </section>
        <section aria-label="Needs attention"><div className="section-header"><h2>Needs attention</h2><button type="button" className="count" aria-label={`View all ${attention.length} attention items`} onClick={() => all('needs-you')}>{attention.length}</button></div>
          {attention.slice(0, 2).map(t => <button type="button" key={t.id} className="preview-row" onClick={() => openTask(t.id)}><span>{readableTaskTitle(t)}</span><small>{t.runs.some(r => r.effective_status === 'unknown') ? 'No recent updates · Check status' : t.attention_reason}</small></button>)}
          {!attention.length && <p className="small muted">{connected ? 'Nothing needs your attention.' : 'Reconnect to check for updates.'}</p>}
          {attention.length > 2 && <button type="button" className="quiet-button" onClick={() => all('needs-you')}>View all {attention.length}</button>}
        </section>
        <section aria-label="Available next"><div className="section-header"><h2>Available next</h2><button type="button" className="count" aria-label="View available tasks" onClick={() => all('available')}>{available.length}</button></div>
          {available.slice(0, 3).map(t => <button type="button" className="preview-row available-preview" key={t.id} onClick={() => openTask(t.id)}><Icon name="task-check" size={16} /><span>{readableTaskTitle(t)}</span><small>{t.estimate_minutes ? `${t.estimate_minutes}m` : ''}</small></button>)}
          {!available.length && <p className="small muted">No other available tasks.</p>}
        </section>
        <section aria-label="Running"><div className="section-header"><h2>Running</h2><button type="button" className="count" aria-label="View running tasks" onClick={() => all('running')}>{running.length}</button></div>
          {running.slice(0, 2).map(r => <button type="button" className="preview-row" key={r.id} onClick={() => openTask(r.task_id)}><span><i className="run-indicator run-working" />{readableTaskTitle(tasks.find(t => t.id === r.task_id) ?? { title: r.agent })}</span><small>{r.agent} · {RUN_LABEL[r.effective_status]} · {age(r.updated_at)}</small></button>)}
          {!running.length && <p className="small muted">No agents reporting work.</p>}
        </section>
        <section aria-label="Upcoming"><div className="section-header"><h2>Upcoming</h2><button type="button" className="count" aria-label="View upcoming tasks" onClick={() => all('upcoming')}>{upcoming.length}</button></div>
          {nextDue.slice(0, 2).map(t => <button type="button" className="preview-row" key={t.id} onClick={() => openTask(t.id)}><span>{readableTaskTitle(t)}</span><small>{dateLabel(t.due_at)}</small></button>)}
          {!nextDue.length && <p className="small muted">No additional deadlines ahead.</p>}
        </section>
      </aside>
    </div>
  </div>;
}
