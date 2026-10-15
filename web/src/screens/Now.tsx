import { Link } from '@tanstack/react-router';
import { useEffect, useState, type JSX } from 'react';
import { confirmFocusChange } from '../components/focus';
import { TaskRow } from '../components/TaskRow';
import { COPY, greeting } from '../copy';
import { useConnected } from '../domain/connection';
import { age } from '../domain/format';
import { focusKind, nowState } from '../domain/nowState';
import { openTasks, readableTaskTitle } from '../domain/tasks';
import { allowNavigation } from '../routes/guards';
import { isDialogOpen, openDialog } from '../shell/dialogs';
import { CAPTURE_EVENT } from '../shell/keyboard';
import { OfflineNotice } from '../shell/OfflineNotice';
import { useSetFocus, useSnapshot } from '../state/queries';
import { Waves } from '../ui/Ambient';
import { Icon } from '../ui/Icon';
import { toastError } from '../ui/Toast';
import { CaptureScreen } from './Capture';

const HOME_TASKS = 4;
const FEW_MINUTES = 3;

function CaptureBar(): JSX.Element {
  const [open, setOpen] = useState(false);
  const close = () => { if (allowNavigation('/overview/pane')) setOpen(false); };
  useEffect(() => {
    const listener = () => setOpen(true);
    window.addEventListener(CAPTURE_EVENT, listener);
    return () => window.removeEventListener(CAPTURE_EVENT, listener);
  }, []);
  useEffect(() => {
    if (!open) return;
    document.querySelector<HTMLTextAreaElement>('#capture-input')?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented && !isDialogOpen()) { event.preventDefault(); close(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return (
    <div className="capture-bar">
      <button type="button" className="capture-bar-open" onClick={() => setOpen(true)}><Icon name="pen" size={18} /><span>Capture a thought…</span><kbd>Ctrl K</kbd></button>
    </div>
  );
  return <>
    <button type="button" className="scrim" aria-label="Close capture" tabIndex={-1} onClick={close} />
    <section className="capture-bar open" aria-label="Capture a thought">
      <button type="button" className="icon-button capture-close" aria-label="Close capture" onClick={close}><Icon name="close" size={16} /></button>
      <CaptureScreen embedded />
    </section>
  </>;
}

export function NowScreen(): JSX.Element {
  const snapshot = useSnapshot().data;
  const connected = useConnected();
  const setFocus = useSetFocus();
  const tasks = snapshot?.tasks ?? [];
  const focusInfo = snapshot?.focus ?? null;
  const focus = tasks.find(t => t.id === focusInfo?.task_id);
  const attention = connected ? snapshot?.attention ?? [] : [];
  const working = connected ? (snapshot?.runs ?? []).filter(r => r.effective_status === 'working').length : 0;
  const attentionIds = new Set(attention.map(t => t.id));
  const open = snapshot ? openTasks(snapshot).filter(t => t.id !== focus?.id) : [];
  open.sort((a, b) => (a.due_at ? Date.parse(a.due_at) : Infinity) - (b.due_at ? Date.parse(b.due_at) : Infinity));
  const homeTasks = open.slice(0, HOME_TASKS);
  const shown = new Set([focus?.id, ...attentionIds, ...homeTasks.map(t => t.id)]);
  const fewMinutes = (connected ? snapshot?.available ?? [] : []).filter(t => !shown.has(t.id)).slice(0, FEW_MINUTES);
  const motion = snapshot?.settings.motion ?? true;

  function clearFocus() {
    if (confirmFocusChange(focusInfo, null)) void setFocus.mutateAsync({ taskId: null }).catch(toastError);
  }

  return (
    <div className="home" data-now-state={nowState(snapshot ?? null, connected, null).mode}>
      <Waves motion={motion} />
      <OfflineNotice />
      <div className="home-greeting">
        <h1>{greeting(new Date(), snapshot?.settings.display_name ?? '')}</h1>
        <p>{COPY.tagline}</p>
      </div>

      {(attention.length > 0 || working > 0) && (
        <Link to="/plan" className="agent-strip" aria-label={`Agents: ${attention.length} need you, ${working} working`}>
          <span className="agent-need"><i className="dot warn" aria-hidden="true" />{attention.length} need you</span>
          <span className="agent-working"><i className="dots" aria-hidden="true"><i /><i /><i /></i>{working} working</span>
          <span className="agent-more">Agents →</span>
        </Link>
      )}

      <section className="focus-card" aria-label="Current focus">
        <i className="focus-dot" aria-hidden="true" />
        {focus ? <>
          <div className="focus-body">
            <span className="eyebrow">Current focus · {!connected ? 'Last known · ' : ''}{focusKind(focusInfo)} · {focusInfo ? age(focusInfo.updated_at) : ''}</span>
            <button type="button" className="focus-title" onClick={() => openDialog({ kind: 'task', id: focus.id })}>{readableTaskTitle(focus)}</button>
            {focus.next_action && <span className="focus-next">{focus.next_action}</span>}
          </div>
          <button type="button" className="quiet-button" onClick={clearFocus}>{focusInfo?.pinned ? 'Unpin & clear' : 'Clear focus'}</button>
        </> : <div className="focus-body">
          <span className="eyebrow">Current focus</span>
          <span className="focus-next">Choose a task when you’re ready.</span>
        </div>}
      </section>

      {fewMinutes.length > 0 && (
        <section className="home-list" aria-labelledby="few-minutes">
          <h2 id="few-minutes" className="eyebrow"><Icon name="spark" size={12} />If you have a few minutes</h2>
          {fewMinutes.map(t => (
            <button type="button" key={t.id} className="home-row" onClick={() => openDialog({ kind: 'task', id: t.id })}>
              <span>{readableTaskTitle(t)}</span>{t.estimate_minutes ? <small>{t.estimate_minutes}m</small> : null}
            </button>
          ))}
        </section>
      )}

      <section className="home-list" aria-labelledby="home-tasks">
        <div className="home-list-head"><h2 id="home-tasks" className="eyebrow">Tasks</h2><Link to="/plan">See all →</Link></div>
        {homeTasks.map(t => <TaskRow key={t.id} task={t} />)}
        {!open.length && <p className="muted small">Nothing open. Press N to add a task.</p>}
      </section>

      <CaptureBar />
    </div>
  );
}
