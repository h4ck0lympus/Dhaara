import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Settings, SettingsPatch, TokenCreated } from '../api/schemas';
import { observationStatus } from '../domain/nowState';
import { openDialog } from '../shell/dialogs';
import { NOTIFICATIONS_KEY, notificationsOptedIn } from '../shell/notifications';
import { useCreateRule, useCreateToken, useDeleteRule, useRevokeToken, useSnapshot, useTokens, useUpdateSettings } from '../state/queries';
import { S } from '../strings';
import { Dialog } from '../ui/Dialog';
import { messageOf, toast } from '../ui/Toast';
import '../styles/capture-notes.css';

export const DISPLAY_NAME_MAX = 60;   // models.py SettingsInput.display_name
export const COMPANION_SIZE_MIN = 24, COMPANION_SIZE_MAX = 72;   // models.py:134
export const AGENT_TASK_REQUIRED = 'Choose at least one task for an agent token';   // dhara/store.py:369 Problem(400)
export const SETTINGS_TEXT = {
  title: 'Your workspace',   // app.js:457
  offline: 'Settings load from your server. Reconnect to change them.',   // new
  nameSaved: 'Name saved.',   // new
  tokenOnce: 'Copy this token now. It will not be displayed again.',   // app.js:470
} as const;

function pick(source: Settings, changes: SettingsPatch): SettingsPatch {
  return Object.fromEntries(Object.keys(changes).map(key => [key, source[key as keyof SettingsPatch]])) as SettingsPatch;
}

export function SettingsDialog({ onClose, section }: { onClose: () => void; section?: 'agents' }) {
  const snapshot = useSnapshot().data ?? null;
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Settings | null>(snapshot?.settings ?? null);
  const [name, setName] = useState(snapshot?.settings.display_name ?? '');
  const savedSize = useRef(snapshot?.settings.companion_size ?? 40);
  const [error, setError] = useState<string | null>(null);
  const [notify, setNotify] = useState(notificationsOptedIn);
  const [agentsOpen, setAgentsOpen] = useState(section === 'agents');
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [created, setCreated] = useState<TokenCreated | null>(null);
  const [scope, setScope] = useState<'agent' | 'observer'>('agent');
  const [taskIds, setTaskIds] = useState<string[]>([]);
  const sizeInput = useRef<HTMLInputElement>(null);
  const agents = useRef<HTMLDetailsElement>(null);
  const tokenLabel = useRef<HTMLInputElement>(null);
  const update = useUpdateSettings();
  const createRule = useCreateRule();
  const deleteRule = useDeleteRule();
  const createToken = useCreateToken();
  const revokeToken = useRevokeToken();
  const tokens = useTokens(agentsOpen);

  // Server data is copied into the form once; later refetches never touch what the user is editing.
  useEffect(() => {
    if (form !== null || !snapshot) return;
    setForm(snapshot.settings);
    setName(snapshot.settings.display_name);
    savedSize.current = snapshot.settings.companion_size;
  }, [form, snapshot]);

  useEffect(() => {
    if (section !== 'agents') return;
    const frame = requestAnimationFrame(() => {
      agents.current?.scrollIntoView?.({ block: 'nearest' });
      tokenLabel.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [section]);

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
    // Commit on the native change event (release), as app.js:468 did, not on every drag step.
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

  async function saveName(event: FormEvent) {
    event.preventDefault();
    const value = name.trim();
    if (await patch({ display_name: value })) {
      setName(value);
      toast(SETTINGS_TEXT.nameSaved);
    }
  }

  async function toggleNotifications() {
    try {
      if (notify) {
        localStorage.setItem(NOTIFICATIONS_KEY, '0');
        setNotify(false);
        return;
      }
      if (!('Notification' in window)) {
        toast(S.notificationsUnsupported);   // app.js:535
        return;
      }
      const permission = await Notification.requestPermission();
      localStorage.setItem(NOTIFICATIONS_KEY, permission === 'granted' ? '1' : '0');
      setNotify(permission === 'granted');
    } catch (caught) {
      setError(messageOf(caught));
    }
  }

  async function addRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const data = new FormData(element);
    setRuleError(null);
    try {
      await createRule.mutateAsync({ app: String(data.get('app') ?? ''), contains: String(data.get('window_contains') ?? ''), task_id: String(data.get('task_id') ?? '') });
      element.reset();
    } catch (caught) {
      setRuleError(messageOf(caught));
    }
  }

  async function removeRule(id: string) {
    setRuleError(null);
    try {
      await deleteRule.mutateAsync({ id });
    } catch (caught) {
      setRuleError(messageOf(caught));
    }
  }

  async function addToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const data = new FormData(element);
    setTokenError(null);
    setCreated(null);
    try {
      const result = await createToken.mutateAsync({
        name: String(data.get('name') ?? '').trim(),
        scope,
        task_ids: scope === 'agent' ? taskIds : [],
      });
      // The secret is shown once from this dialog's state only; drop it from the mutation cache.
      const cache = queryClient.getMutationCache();
      cache.findAll({ predicate: mutation => mutation.state.data === result }).forEach(mutation => cache.remove(mutation));
      createToken.reset();
      setCreated(result);
      element.reset();
      setTaskIds([]);
    } catch (caught) {
      setTokenError(messageOf(caught));
    }
  }

  async function revoke(id: string) {
    setTokenError(null);
    try {
      await revokeToken.mutateAsync({ id });
    } catch (caught) {
      setTokenError(messageOf(caught));
    }
  }

  const needsTask = scope === 'agent' && taskIds.length === 0;
  const tasks = snapshot?.tasks ?? [];
  const capabilities = snapshot?.capabilities;
  const taskTitle = (id: string) => tasks.find(task => task.id === id)?.title ?? 'Unavailable task';

  return (
    <Dialog title={SETTINGS_TEXT.title} onRequestClose={onClose} className="settings-dialog">
      {form ? (
        <>
          <form className="settings-row" onSubmit={event => void saveName(event)}>
            <div>
              <label htmlFor="settings-display-name">Your name</label>
              <p>Shown in the Overview greeting. Leave it empty for no name.</p>
            </div>
            <div className="inline-actions">
              <input id="settings-display-name" value={name} maxLength={DISPLAY_NAME_MAX} autoComplete="name" onChange={event => setName(event.target.value)} />
              <button type="submit" className="secondary" disabled={update.isPending}>Save name</button>
            </div>
          </form>
          <div className="settings-row">
            <div>Screen context<p>Off by default. The Sway helper reports window metadata only. No screenshot analysis is implemented in this build.</p></div>
            <input type="checkbox" aria-label="Enable window context" checked={form.observation_enabled} onChange={event => void patch({ observation_enabled: event.target.checked })} />
          </div>
          {/* app.js:477: the status reflects the server snapshot, never the optimistic toggle. */}
          <p className="subtle-line" id="observation-status">{observationStatus(snapshot)}. Window metadata only; no screenshot observation is implemented.</p>
          <div className="settings-row">
            <div>Slow background motion<p>Pauses when hidden. Static by default.</p></div>
            <input type="checkbox" aria-label="Enable background motion" checked={form.motion} onChange={event => void patch({ motion: event.target.checked })} />
          </div>
          <div className="settings-row">
            <div>Companion<p>The Sway helper reads this setting. This browser does not connect to the desktop companion.</p></div>
            <select aria-label="Companion mode" value={form.companion} onChange={event => void patch({ companion: event.target.value as Settings['companion'] })}>
              {(['cat', 'dot', 'hidden'] as const).map(mode => <option key={mode} value={mode}>{mode}</option>)}
            </select>
          </div>
          <div className="settings-row">
            {/* app.js:459 */}
            <div>Companion size<p>Logical pixels; native helper reads this setting. Now {form.companion_size} px.</p></div>
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
        </>
      ) : (
        <p className="notice" role="status">{SETTINGS_TEXT.offline}</p>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="settings-row">
        <div>Reminder notifications<p>Opt-in browser notifications while a client is open. No push service or always-on delivery yet.</p></div>
        <button type="button" className="secondary" onClick={() => void toggleNotifications()}>{notify ? 'Disable notifications' : 'Enable notifications'}</button>
      </div>
      {capabilities && (
        <>
          <h3 className="eyebrow">Local processing</h3>
          <p className="notice">
            Note cleanup: {capabilities.organizer ? capabilities.model : 'off — original wording is preserved'}<br />
            Speech: {capabilities.speech ? capabilities.speech_model : 'off — recordings can still be saved'}<br />
            No models download or load automatically. Enable them using the README’s optional setup.
          </p>
        </>
      )}
      <details className="settings-section">
        <summary>Window-to-task rules</summary>
        <p className="subtle-line">A known application or title maps to a task. Unmatched windows do not become made-up focus claims. Pinned focus wins.</p>
        <ul className="history-list">
          {(snapshot?.context_rules ?? []).map(rule => (
            <li key={rule.id} className="inline-actions">
              <span>{rule.app || 'Any app'} / {rule.contains_text || 'Any title'} → {taskTitle(rule.task_id)}</span>
              <button type="button" className="quiet-button" onClick={() => void removeRule(rule.id)}>Remove</button>
            </li>
          ))}
        </ul>
        <form className="settings-form" onSubmit={event => void addRule(event)}>
          <div><label htmlFor="rule-app">App ID</label><input id="rule-app" name="app" maxLength={160} placeholder="org.mozilla.firefox" /></div>
          <div><label htmlFor="rule-contains">Title contains</label><input id="rule-contains" name="window_contains" maxLength={200} placeholder="Two Sum" /></div>
          <div className="full">
            <label htmlFor="rule-task">Task</label>
            <select id="rule-task" name="task_id" required>
              {tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}
            </select>
          </div>
          <div className="full">
            <button type="submit" className="secondary" disabled={tasks.length === 0 || createRule.isPending}>Add rule</button>
            {ruleError && <p className="field-error" role="alert">{ruleError}</p>}
          </div>
        </form>
      </details>
      <details ref={agents} className="settings-section" open={agentsOpen} onToggle={event => setAgentsOpen(event.currentTarget.open)}>
        <summary>Agent &amp; observer tokens</summary>
        <p className="subtle-line">An agent token can report runs and read only the tasks you choose. Observer tokens may report window context and read the small companion summary. Never paste tokens into notes.</p>
        {tokens.isError && <p className="field-error" role="alert">{tokens.error.message}</p>}
        <ul className="history-list">
          {(tokens.data ?? []).map(token => (
            <li key={token.id} className="inline-actions">
              <span>{token.name} · {token.scope}</span>
              <button type="button" className="quiet-button" onClick={() => void revoke(token.id)}>Revoke</button>
            </li>
          ))}
        </ul>
        <form className="settings-form" onSubmit={event => void addToken(event)}>
          <div><label htmlFor="token-name">Label</label><input ref={tokenLabel} id="token-name" name="name" required maxLength={80} placeholder="Local coding agent" /></div>
          <div>
            <label htmlFor="token-scope">Access</label>
            <select id="token-scope" value={scope} onChange={event => setScope(event.target.value as 'agent' | 'observer')}>
              <option value="agent">Task-scoped agent</option>
              <option value="observer">Window observer</option>
            </select>
          </div>
          <div className="full">
            <label htmlFor="token-tasks">Allowed tasks · agent tokens</label>
            <select id="token-tasks" multiple size={3} disabled={scope !== 'agent'} value={taskIds} onChange={event => setTaskIds(Array.from(event.target.selectedOptions, option => option.value))}>
              {tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}
            </select>
          </div>
          <div className="full">
            <button type="submit" className="secondary" disabled={createToken.isPending || needsTask}>Create token</button>
            {tokenError && <p className="field-error" role="alert">{tokenError}</p>}
            {needsTask && <p className="field-error" role="status">{AGENT_TASK_REQUIRED}</p>}
          </div>
        </form>
        {created && (
          <div className="notice" role="status">
            <p>{SETTINGS_TEXT.tokenOnce}</p>
            <code className="token-value">{created.token}</code>
          </div>
        )}
        <p className="subtle-line">Use the generated task-scoped token with tools/agent.py. The wrapper tracks only the command you explicitly start; it does not attach to arbitrary browser sessions. See the README for the exact command and token environment setup.</p>
      </details>
      <h3 className="eyebrow">Keep your data</h3>
      <p className="subtle-line">One SQLite database and an attachments directory on the server. This build does not automatically deploy or synchronize independent servers.</p>
      <div className="inline-actions">
        <a href="/api/export" className="secondary" download>Export notes &amp; tasks</a>
        <button type="button" className="quiet-button" onClick={() => openDialog({ kind: 'outbox' })}>Local capture queue</button>
      </div>
      <p className="subtle-line">Version 0.1.0 · local-first development build</p>
    </Dialog>
  );
}
