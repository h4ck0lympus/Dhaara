import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { NoteSchema, TaskSchema } from '../api/schemas';
import { call } from '../api/client';
import { elapsed, useDictation } from '../capture/dictation';
import { useConnected } from '../domain/connection';
import { localDay } from '../domain/format';
import { kittyStatus } from '../domain/kitty';
import { isForToday, openTasks, readableTaskTitle, reviewLink } from '../domain/tasks';
import { MUTE_KEY, mutedUntil } from '../shell/notifications';
import { dictate, usePatchTask, useSnapshot, useSnoozeReminder } from '../state/queries';
import { Icon } from '../ui/Icon';
import { KittySprite } from '../ui/KittySprite';
import { messageOf } from '../ui/Toast';

export const QUIET_MS = 30 * 60_000;
const TODAY_LIMIT = 5;
export const COMPANION_TEXT = {
  noDictation: 'Dictation needs AI turned on in Settings, or a local speech model.',
  savedNote: 'Saved to Notes.',
  savedTask: 'Added to Tasks.',
  savedVoice: 'Voice note saved. The transcript will follow.',
} as const;

/** Opens a route in the main Dhara window; in a plain browser tab it opens one. */
export function openInApp(path: string): void {
  if (window.dharaCompanion) window.dharaCompanion.openApp(path);
  else window.open(`/#${path}`, '_blank', 'noopener');
}

export function splitTodo(raw: string): { kind: 'task' | 'note'; text: string } {
  const match = /^\s*todo\b[:\s-]*/i.exec(raw);
  return match ? { kind: 'task', text: raw.slice(match[0].length).trim() } : { kind: 'note', text: raw.trim() };
}

function newId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

async function saveText(raw: string): Promise<'task' | 'note'> {
  const { kind, text } = splitTodo(raw);
  if (kind === 'task') {
    await call('taskCapture', TaskSchema, { body: { capture_id: newId(), raw: text, local_day: localDay(new Date()) } });
  } else {
    const form = new FormData();
    form.append('payload', JSON.stringify({ capture_id: newId(), raw: text, organize: true }));
    await call('capture', NoteSchema, { body: form });
  }
  return kind;
}

async function saveVoice(audio: Uint8Array<ArrayBuffer>): Promise<void> {
  const form = new FormData();
  form.append('payload', JSON.stringify({ capture_id: newId(), raw: '' }));
  form.append('attachments', new Blob([audio], { type: 'audio/wav' }), 'voice-note.wav');
  await call('capture', NoteSchema, { body: form });
}

function CaptureBox({ dictationReady, onStatus }: { dictationReady: boolean; onStatus: (text: string) => void }): JSX.Element {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const mic = useDictation();

  async function run(work: () => Promise<string>) {
    setBusy(true);
    try { onStatus(await work()); } catch (error) { onStatus(messageOf(error)); } finally { setBusy(false); }
  }
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    void run(async () => { const kind = await saveText(draft); setDraft(''); return kind === 'task' ? COMPANION_TEXT.savedTask : COMPANION_TEXT.savedNote; });
  };
  const useAsText = () => void run(async () => {
    const audio = mic.audio();
    if (!audio) return '';
    const { text } = await dictate(new Blob([audio], { type: 'audio/wav' }));
    setDraft(d => (d ? `${d} ${text}` : text));
    mic.reset();
    return '';
  });
  const keepVoice = () => void run(async () => {
    const audio = mic.audio();
    if (!audio) return '';
    await saveVoice(audio);
    mic.reset();
    return COMPANION_TEXT.savedVoice;
  });

  if (mic.phase === 'recording') return (
    <div className="companion-capture recording" role="group" aria-label="Recording">
      <i className="rec-dot" aria-hidden="true" />
      <span aria-live="polite" className="mono">{elapsed(mic.seconds)}</span>
      <span className="rec-levels" aria-hidden="true">{mic.levels.map((l, i) => <i key={i} style={{ height: 3 + Math.round(l * 15) }} />)}</span>
      <button type="button" className="quiet-button" onClick={mic.reset}>Cancel</button>
      <button type="button" className="ghost-button" onClick={() => mic.stop()}>Stop</button>
    </div>
  );
  if (mic.phase === 'recorded') return (
    <div className="companion-capture" role="group" aria-label="Use the recording">
      <span className="rec-done">Recorded {elapsed(mic.seconds)}</span>
      <button type="button" className="ghost-button" disabled={busy || !dictationReady} title={dictationReady ? undefined : COMPANION_TEXT.noDictation} onClick={useAsText}>Use as text</button>
      <button type="button" className="primary small-button" disabled={busy} onClick={keepVoice}>Save voice note</button>
    </div>
  );
  return <>
    <form className="companion-capture" onSubmit={submit}>
      <label htmlFor="companion-capture" className="sr-only">Capture a thought</label>
      <input id="companion-capture" value={draft} maxLength={16000} placeholder="Capture a thought…  todo: makes a task" onChange={e => setDraft(e.target.value)} disabled={busy} />
      <button type="button" className="icon-button" aria-label="Record voice" title="Record voice: dictate text or save a voice note" onClick={() => void mic.start()} disabled={busy}><Icon name="mic" size={16} /></button>
      <button type="submit" className="primary small-button" disabled={busy || !draft.trim()}>Save</button>
    </form>
    {mic.error && <p className="field-error" role="alert">{mic.error}</p>}
  </>;
}

export function CompanionScreen(): JSX.Element | null {
  const snapshot = useSnapshot().data;
  const connected = useConnected();
  const patch = usePatchTask();
  const snooze = useSnoozeReminder();
  const [open, setOpen] = useState(false);
  const [quietUntil, setQuietUntil] = useState(mutedUntil);
  const [now, setNow] = useState(Date.now);
  const [message, setMessage] = useState('');
  const settings = snapshot?.settings;
  const hidden = settings?.companion === 'hidden';
  const quiet = quietUntil > now;
  const status = kittyStatus(snapshot, connected, quiet);

  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { window.dharaCompanion?.setVisible(!hidden); }, [hidden]);
  useEffect(() => { window.dharaCompanion?.resize(open); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (hidden) return null;
  const toggleQuiet = () => {
    const until = quiet ? 0 : Date.now() + QUIET_MS;
    try { localStorage.setItem(MUTE_KEY, String(until)); } catch {}
    setQuietUntil(until);
  };
  const due = (t: { reminders: { state: string }[] }) => t.reminders.some(r => r.state === 'due');
  const attention = connected ? snapshot?.attention ?? [] : [];
  const needs = attention.filter(t => !due(t));
  const reminders = attention.filter(due);
  const today = snapshot ? openTasks(snapshot).filter(t => isForToday(t)).slice(0, TODAY_LIMIT) : [];
  const width = Math.round((settings?.companion_size ?? 40) * 26 / 16);

  return (
    <div className="companion" data-open={open}>
      {open && (
        <section className="companion-panel" aria-label="Dhara mini panel">
          <div className="companion-head"><strong>Dhara</strong><span className="mono">{status.summary}</span></div>
          {needs.length > 0 && <div className="companion-group">
            <h2 className="eyebrow warn">Needs you</h2>
            {needs.slice(0, 4).map(t => {
              const link = reviewLink(t);
              return <div key={t.id} className="companion-row">
                <span className="companion-row-text"><span>{readableTaskTitle(t)}</span><small>{[t.project, t.attention_reason].filter(Boolean).join(' · ')}</small></span>
                {link ? <a className="act" href={link} target="_blank" rel="noopener noreferrer">Review ↗</a>
                  : <button type="button" className="act" onClick={() => openInApp(`/task/${t.id}`)}>Open</button>}
              </div>;
            })}
          </div>}
          {reminders.map(t => {
            const reminder = t.reminders.find(r => r.state === 'due')!;
            return <div key={t.id} className="companion-reminder">
              <span>Reminder · {readableTaskTitle(t)}</span>
              <button type="button" className="quiet-button" onClick={() => void snooze.mutateAsync({ id: reminder.id }).catch(e => setMessage(messageOf(e)))}>+20 min</button>
              <button type="button" className="act" onClick={() => openInApp(`/task/${t.id}`)}>Open</button>
            </div>;
          })}
          <div className="companion-group">
            <h2 className="eyebrow">Today</h2>
            {today.map(t => <div key={t.id} className="companion-row">
              <i className={`priority-dot ${t.effective_priority}`} role="img" aria-label={`${t.effective_priority} priority`} />
              <button type="button" className="task-check" aria-label={`Complete ${readableTaskTitle(t)}`} disabled={patch.isPending}
                onClick={() => void patch.mutateAsync({ id: t.id, changes: { status: 'done' } }).then(() => setMessage('Task completed.'), e => setMessage(messageOf(e)))} />
              <button type="button" className="companion-title" onClick={() => openInApp(`/task/${t.id}`)}>{readableTaskTitle(t)}</button>
            </div>)}
            {!today.length && <p className="muted small">Nothing due today.</p>}
          </div>
          <CaptureBox dictationReady={snapshot?.capabilities.dictation ?? false} onStatus={setMessage} />
          <p className="companion-status" role="status">{message}</p>
          <div className="companion-foot">
            <button type="button" className="quiet-button" onClick={() => openInApp('/overview')}>Open Dhara</button>
            <button type="button" className="quiet-button" aria-pressed={quiet} onClick={toggleQuiet}>{quiet ? 'Resume alerts' : 'Quiet 30 min'}</button>
            <button type="button" className="icon-button" aria-label="Companion settings" title="Companion settings" onClick={() => openInApp('/settings')}><Icon name="settings" size={16} /></button>
          </div>
        </section>
      )}
      <button type="button" className="companion-kitty" aria-expanded={open} aria-label={`Dhara companion: ${status.summary}`} onClick={() => setOpen(v => !v)}>
        {settings?.companion === 'dot'
          ? <span className={`companion-dot ${status.state}`} aria-hidden="true" />
          : <KittySprite status={status} width={width} motion={settings?.motion ?? true} />}
      </button>
    </div>
  );
}
