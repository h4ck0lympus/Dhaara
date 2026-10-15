import { useEffect, useRef, useState } from 'react';
import type { Settings, SettingsPatch } from '../api/schemas';
import { useOutboxCount } from '../local/outbox';
import { openDialog } from '../shell/dialogs';
import { NOTIFICATIONS_KEY, notificationsOptedIn } from '../shell/notifications';
import { useSnapshot, useUpdateSettings } from '../state/queries';
import { S } from '../strings';
import { Dialog } from '../ui/Dialog';
import { messageOf, toast } from '../ui/Toast';
import '../styles/capture-notes.css';
import { AgentConnections } from '../components/AgentConnections';

export const DISPLAY_NAME_MAX = 60;
export const COMPANION_SIZE_MIN = 24, COMPANION_SIZE_MAX = 72;
export const SETTINGS_TEXT = {
  title: 'Settings',
  offline: 'Settings load from your server. Reconnect to change them.',
} as const;

function pick(source: Settings, changes: SettingsPatch): SettingsPatch {
  return Object.fromEntries(Object.keys(changes).map(key => [key, source[key as keyof SettingsPatch]])) as SettingsPatch;
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const snapshot = useSnapshot().data ?? null;
  const [form, setForm] = useState<Settings | null>(snapshot?.settings ?? null);
  const [name, setName] = useState(snapshot?.settings.display_name ?? '');
  const savedSize = useRef(snapshot?.settings.companion_size ?? 40);
  const [error, setError] = useState<string | null>(null);
  const [notify, setNotify] = useState(notificationsOptedIn);
  const sizeInput = useRef<HTMLInputElement>(null);
  const update = useUpdateSettings();
  const queued = useOutboxCount();

  useEffect(() => {
    if (form !== null || !snapshot) return;
    setForm(snapshot.settings);
    setName(snapshot.settings.display_name);
    savedSize.current = snapshot.settings.companion_size;
  }, [form, snapshot]);

  async function patch(changes: SettingsPatch): Promise<boolean> {
    const previous = form;
    setForm(current => current && { ...current, ...changes });
    setError(null);
    try {
      await update.mutateAsync(changes);
      return true;
    } catch (caught) {
      if (previous) setForm(current => current && { ...current, ...pick(previous, changes) });
      setError(messageOf(caught));
      return false;
    }
  }

  useEffect(() => {
    const input = sizeInput.current;
    if (!input) return;
    const commit = () => {
      const value = Number(input.value);
      void patch({ companion_size: value }).then(ok => {
        if (ok) savedSize.current = value;
        else setForm(current => current && { ...current, companion_size: savedSize.current });
      });
    };
    input.addEventListener('change', commit);
    return () => input.removeEventListener('change', commit);
  }, [form?.companion_size]);

  async function saveName() {
    const value = name.trim();
    setName(value);
    if (form && value !== form.display_name) await patch({ display_name: value });
  }

  async function toggleNotifications() {
    try {
      if (notify) {
        localStorage.setItem(NOTIFICATIONS_KEY, '0');
        setNotify(false);
        return;
      }
      if (!('Notification' in window)) {
        toast(S.notificationsUnsupported);
        return;
      }
      const permission = await Notification.requestPermission();
      localStorage.setItem(NOTIFICATIONS_KEY, permission === 'granted' ? '1' : '0');
      setNotify(permission === 'granted');
    } catch (caught) {
      setError(messageOf(caught));
    }
  }

  const capabilities = snapshot?.capabilities;

  return (
    <Dialog title={SETTINGS_TEXT.title} onRequestClose={() => { void saveName(); onClose(); }} className="settings-dialog">
      {form ? (
        <>
          <form className="settings-row" onSubmit={event => { event.preventDefault(); void saveName(); }}>
            <label htmlFor="settings-display-name">Name</label>
            <input id="settings-display-name" value={name} maxLength={DISPLAY_NAME_MAX} autoComplete="name" onChange={event => setName(event.target.value)} onBlur={() => void saveName()} />
          </form>
          <label className="settings-row">
            Motion
            <input type="checkbox" checked={form.motion} onChange={event => void patch({ motion: event.target.checked })} />
          </label>
          <div className="settings-row">
            Cat
            <div className="inline-actions">
              <select aria-label="Companion mode" value={form.companion} onChange={event => void patch({ companion: event.target.value as Settings['companion'] })}>
                {(['cat', 'dot', 'hidden'] as const).map(mode => <option key={mode} value={mode}>{mode}</option>)}
              </select>
              <input
                ref={sizeInput}
                type="range"
                aria-label="Companion size"
                min={COMPANION_SIZE_MIN}
                max={COMPANION_SIZE_MAX}
                value={form.companion_size}
                onChange={event => {
                  const value = Number(event.target.value);
                  setForm(current => current && { ...current, companion_size: value });
                }}
              />
            </div>
          </div>
        </>
      ) : (
        <p className="notice" role="status">{SETTINGS_TEXT.offline}</p>
      )}
      <label className="settings-row">
        Alerts
        <input type="checkbox" checked={notify} onChange={() => void toggleNotifications()} />
      </label>
      {capabilities && <>
        <div className="settings-row">Note AI<span className="pill">{(capabilities.organizer && capabilities.model) || 'Off'}</span></div>
        <div className="settings-row">Voice<span className="pill">{capabilities.speech ? 'Ready' : 'Off'}</span></div>
      </>}
      <AgentConnections />
      {form && (
        <label className="settings-row">
          Screen
          <input type="checkbox" checked={form.observation_enabled} onChange={event => void patch({ observation_enabled: event.target.checked })} />
        </label>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="inline-actions">
        <a href="/api/export" className="secondary" download>Export notes &amp; tasks</a>
        {queued > 0 && <button type="button" className="quiet-button" onClick={() => openDialog({ kind: 'outbox' })}>Local capture queue</button>}
      </div>
    </Dialog>
  );
}
