import { useQueryClient } from '@tanstack/react-query';
import { useCanGoBack, useRouter } from '@tanstack/react-router';
import { useEffect, useId, useRef, useState, type FormEvent, type JSX, type ReactNode } from 'react';
import type { Settings, SettingsPatch, TokenCreated } from '../api/schemas';
import { AgentConnections, useAgentConnections } from '../components/AgentConnections';
import { useConnected } from '../domain/connection';
import { observationStatus } from '../domain/nowState';
import { isDialogOpen, openDialog } from '../shell/dialogs';
import { NOTIFICATIONS_KEY, notificationsOptedIn } from '../shell/notifications';
import { useCreateRule, useCreateToken, useDeleteRule, useRevokeToken, useSnapshot, useTokens, useUpdateSettings } from '../state/queries';
import { S } from '../strings';
import { Icon } from '../ui/Icon';
import { messageOf, toast } from '../ui/Toast';
import '../styles/capture-notes.css';

export const DISPLAY_NAME_MAX = 60;
export const COMPANION_SIZE_MIN = 24, COMPANION_SIZE_MAX = 72;
export const AGENT_TASK_REQUIRED = 'Choose at least one task for an agent token';
export const SETTINGS_TEXT = {
  title: 'Settings',
  intro: 'Everything runs and stays on this computer. Changes save as you make them.',
  offline: 'Settings load from your server. Reconnect to change them.',
  nameSaved: 'Name saved.',
  tokenOnce: 'Copy this token now. It will not be displayed again.',
} as const;

const THEMES: [Settings['theme'], string][] = [['dark', 'Dark'], ['light', 'Light'], ['system', 'System']];
const COMPANIONS: [Settings['companion'], string][] = [['cat', 'Cat'], ['dot', 'Dot'], ['hidden', 'Hidden']];

function pick(source: Settings, changes: SettingsPatch): SettingsPatch {
  return Object.fromEntries(Object.keys(changes).map(key => [key, source[key as keyof SettingsPatch]])) as SettingsPatch;
}

function Row({ label, hint, id, htmlFor, children }: { label: string; hint?: ReactNode; id: string; htmlFor?: string; children: ReactNode }): JSX.Element {
  const Label = htmlFor ? 'label' : 'span';
  return (
    <div className="setting-row">
      <div className="setting-label"><Label id={`${id}-label`} htmlFor={htmlFor}>{label}</Label>{hint && <span id={`${id}-hint`}>{hint}</span>}</div>
      {children}
    </div>
  );
}

function Switch({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (next: boolean) => void }): JSX.Element {
  const id = useId();
  return (
    <Row label={label} hint={hint} id={id}>
      <button type="button" className="switch" role="switch" aria-labelledby={`${id}-label`} aria-describedby={hint ? `${id}-hint` : undefined} aria-checked={checked} onClick={() => onChange(!checked)}><span /></button>
    </Row>
  );
}

function Segmented<T extends string>({ label, hint, value, options, onChange }: { label: string; hint?: string; value: T; options: [T, string][]; onChange: (next: T) => void }): JSX.Element {
  const id = useId();
  return (
    <Row label={label} hint={hint} id={id}>
      <div className="segmented" role="group" aria-labelledby={`${id}-label`} aria-describedby={hint ? `${id}-hint` : undefined}>
        {options.map(([option, text]) => <button type="button" key={option} aria-pressed={value === option} onClick={() => { if (value !== option) onChange(option); }}>{text}</button>)}
      </div>
    </Row>
  );
}

function Status({ tone, label, detail }: { tone: 'ok' | 'warn' | 'off'; label: string; detail: string }): JSX.Element {
  return <div className="status-row"><i className={`dot ${tone}`} aria-hidden="true" /><span>{label}</span><span>{detail}</span></div>;
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }): JSX.Element {
  return <section className="settings-group" aria-labelledby={id}><h2 id={id}>{title}</h2><div className="settings-card">{children}</div></section>;
}

export function SettingsScreen(): JSX.Element {
  const snapshot = useSnapshot().data ?? null;
  const connected = useConnected();
  const queryClient = useQueryClient();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const connections = useAgentConnections();
  const [form, setForm] = useState<Settings | null>(snapshot?.settings ?? null);
  const [name, setName] = useState(snapshot?.settings.display_name ?? '');
  const savedSize = useRef(snapshot?.settings.companion_size ?? 40);
  const sizeInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [notify, setNotify] = useState(notificationsOptedIn);
  const [tokensOpen, setTokensOpen] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [created, setCreated] = useState<TokenCreated | null>(null);
  const [scope, setScope] = useState<'agent' | 'observer'>('agent');
  const [taskIds, setTaskIds] = useState<string[]>([]);
  const update = useUpdateSettings();
  const createRule = useCreateRule();
  const deleteRule = useDeleteRule();
  const createToken = useCreateToken();
  const revokeToken = useRevokeToken();
  const tokens = useTokens(tokensOpen);

  const back = () => { if (canGoBack) router.history.back(); else void router.navigate({ to: '/overview' }); };

  useEffect(() => {
    if (form !== null || !snapshot) return;
    setForm(snapshot.settings);
    setName(snapshot.settings.display_name);
    savedSize.current = snapshot.settings.companion_size;
  }, [form, snapshot]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== 'Escape' || event.defaultPrevented || isDialogOpen() || target?.closest('input, textarea, select, details[open] summary')) return;
      back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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

  async function saveName(event?: FormEvent) {
    event?.preventDefault();
    const value = name.trim();
    if (!form || value === form.display_name) { setName(value); return; }
    if (await patch({ display_name: value })) {
      setName(value);
      toast(SETTINGS_TEXT.nameSaved);
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
  const installed = (connections.data?.connections ?? []).filter(c => c.installed);

  return (
    <div className="settings-page">
      <div className="settings-top">
        <button type="button" className="quiet-button" onClick={back}><Icon name="arrow" size={16} />Back<kbd>Esc</kbd></button>
      </div>
      <div className="settings-intro">
        <h1>{SETTINGS_TEXT.title}</h1>
        <p>{SETTINGS_TEXT.intro}</p>
      </div>

      <Section id="settings-status" title="Status">
        <Status tone={connected ? 'ok' : 'off'} label="Server" detail={connected ? S.connected : S.offline} />
        <Status tone={installed.length ? 'ok' : 'off'} label="Agents connected" detail={installed.length ? installed.map(c => c.name).join(', ') : connections.isPending ? 'Checking…' : 'None yet'} />
        {capabilities && <>
          <Status tone={capabilities.organizer ? 'ok' : 'off'} label="Notes model" detail={capabilities.organizer ? `${capabilities.model || 'Local model'} · ready` : 'Not configured · your original wording is kept'} />
          <Status tone={capabilities.speech ? 'ok' : 'off'} label="Voice transcription" detail={capabilities.speech ? `${capabilities.speech_model || 'Local model'} · ready` : 'Not configured · recordings are still saved'} />
        </>}
        <Status tone={snapshot ? 'ok' : 'off'} label="Notes" detail={snapshot ? `${snapshot.notes.length} note${snapshot.notes.length === 1 ? '' : 's'}` : 'Unavailable'} />
        <Status tone={form?.observation_enabled ? 'ok' : 'off'} label="Window context" detail={observationStatus(snapshot)} />
      </Section>

      {form ? <>
        <Section id="settings-general" title="General">
          <form className="setting-row" onSubmit={event => void saveName(event)}>
            <div className="setting-label"><label htmlFor="settings-display-name">Your name</label><span id="settings-display-name-hint">Used in the greeting. Leave it empty for no name.</span></div>
            <input id="settings-display-name" aria-describedby="settings-display-name-hint" value={name} maxLength={DISPLAY_NAME_MAX} autoComplete="name" onChange={event => setName(event.target.value)} onBlur={() => void saveName()} />
          </form>
          <Segmented label="Appearance" hint="System follows your desktop's light or dark setting" value={form.theme} options={THEMES} onChange={theme => void patch({ theme })} />
          <Switch label="Background motion" hint="Dot waves and swirl. Off if your system prefers reduced motion" checked={form.motion} onChange={motion => void patch({ motion })} />
        </Section>

        <Section id="settings-companion" title="Desktop companion">
          <Segmented label="Companion" hint="The desktop kitten runs separately from this window" value={form.companion} options={COMPANIONS} onChange={companion => void patch({ companion })} />
          <Row label="Companion size" hint={`${form.companion_size} px`} id="settings-companion-size-row" htmlFor="settings-companion-size">
            <input id="settings-companion-size" aria-describedby="settings-companion-size-row-hint" type="range" min={COMPANION_SIZE_MIN} max={COMPANION_SIZE_MAX} value={form.companion_size}
              ref={sizeInput} onChange={event => { const value = Number(event.target.value); setForm(current => current && { ...current, companion_size: value }); }} />
          </Row>
        </Section>
      </> : <p className="notice" role="status">{SETTINGS_TEXT.offline}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}

      <Section id="settings-alerts" title="Agents and alerts">
        <Switch label="Desktop notifications" hint="Agent input, review results and due reminders, while Dhara is running" checked={notify} onChange={() => void toggleNotifications()} />
        <AgentConnections />
        <details className="settings-details" onToggle={event => setTokensOpen(event.currentTarget.open)}>
          <summary>Advanced: agent &amp; observer tokens</summary>
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
            <div><label htmlFor="token-name">Label</label><input id="token-name" name="name" required maxLength={80} placeholder="Local coding agent" /></div>
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
      </Section>

      {form && (
        <Section id="settings-context" title="Window context">
          <Switch label="Use window context" hint="Off by default. The Sway helper reports window titles only; no screenshots are taken or stored" checked={form.observation_enabled} onChange={observation_enabled => void patch({ observation_enabled })} />
          <details className="settings-details">
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
        </Section>
      )}

      <Section id="settings-data" title="Your data">
        <Row label="Export everything" hint="Notes and tasks from this workspace, in one archive" id="settings-export">
          <a href="/api/export" className="ghost-button" download>Export</a>
        </Row>
        <Row label="Local capture queue" hint="Captures saved on this device that have not reached the server yet" id="settings-queue">
          <button type="button" className="ghost-button" onClick={() => openDialog({ kind: 'outbox' })}>Open</button>
        </Row>
      </Section>
      <p className="subtle-line settings-version">Version 0.1.0 · local-first development build</p>
    </div>
  );
}
