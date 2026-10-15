import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useSnapshot } from '../state/queries';
import { useConnected } from '../domain/connection';
import { Icon } from '../ui/Icon';
import { openDialog } from './dialogs';
import { MUTE_KEY, mutedUntil, notificationItems } from './notifications';

const KEY = 'dhaara-notification-read';
function readIds(): string[] { try { const value = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(value) ? value.filter(x => typeof x === 'string').slice(-500) : []; } catch { return []; } }
export function NotificationCenter() {
  const navigate = useNavigate();
  const snapshot = useSnapshot().data;
  const connected = useConnected();
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState(readIds);
  const [mute, setMute] = useState(mutedUntil);
  const [now, setNow] = useState(Date.now);
  const [snoozed, setSnoozed] = useState<Record<string, number>>(() => { try { const value = JSON.parse(localStorage.getItem('dhaara-notification-snooze') || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; } });
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  function snooze(id: string) { const next = { ...Object.fromEntries(Object.entries(snoozed).filter(([, until]) => until > now)), [id]: Date.now() + 3_600_000 }; setSnoozed(next); try { localStorage.setItem('dhaara-notification-snooze', JSON.stringify(next)); } catch {} }
  function toggleMute() { const until = mute > now ? 0 : Date.now() + 3_600_000; setMute(until); try { localStorage.setItem(MUTE_KEY, String(until)); } catch {} }
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = (snapshot ? notificationItems(snapshot) : []).filter(item => !(snoozed[item.id] > now));
  const unread = items.filter(item => !read.includes(item.id)).length;
  function mark(ids: string[]) { const next = [...new Set([...read, ...ids])].slice(-500); setRead(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {} }
  useEffect(() => {
    if (!open) return;
    const click = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', click); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', click); document.removeEventListener('keydown', key); };
  }, [open]);
  return <div className="notification-center" ref={root}>
    <button ref={trigger} type="button" className="notification-trigger" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open} aria-controls="notification-panel" onClick={() => setOpen(v => !v)}><Icon name="bell" />{unread > 0 && <span className="notification-badge">{unread > 99 ? '99+' : unread}</span>}</button>
    {open && <section id="notification-panel" className="notification-panel" aria-label="Notifications">
      <div className="section-header"><h2>Notifications</h2><button type="button" className="quiet-button" onClick={() => mark(items.map(i => i.id))}>Mark all read</button><button type="button" className="icon-button" aria-label="Close notifications" onClick={() => { setOpen(false); trigger.current?.focus(); }}><Icon name="close" /></button></div>
      <button type="button" className="quiet-button" aria-pressed={mute > now} onClick={toggleMute}>{mute > now ? 'Resume desktop notifications' : 'Quiet for 1 hour'}</button>
      {!connected && <p className="small muted">Offline · showing last known updates.</p>}
      {items.map(item => <article className="notification-item" key={item.id} data-unread={!read.includes(item.id)}><strong>{item.label}</strong><p>{item.title}</p><div className="section-header"><button type="button" className="quiet-button" onClick={() => { mark([item.id]); setOpen(false); openDialog({ kind: 'task', id: item.taskId }); }}>{item.action}</button><button type="button" className="quiet-button" onClick={() => snooze(item.id)}>Snooze 1h</button>{!read.includes(item.id) && <button type="button" className="quiet-button" onClick={() => mark([item.id])}>Mark read</button>}</div></article>)}
      {!items.length && <p className="empty">You’re up to date.</p>}
      <button type="button" className="quiet-button" onClick={() => { setOpen(false); void navigate({ to: '/settings' }); }}>Notification settings</button>
    </section>}
  </div>;
}
