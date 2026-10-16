import { useState, type FormEvent, type JSX } from 'react';
import type { FreeModel, Settings, SettingsPatch } from '../api/schemas';
import { useAIStatus, useDeleteAIKey, useFreeModels, useSetAIKey } from '../state/queries';
import { Row, Switch } from '../ui/SettingRows';
import { messageOf, toast } from '../ui/Toast';

export const AI_TEXT = {
  intro: 'Uses free OpenRouter models for note cleanup, task understanding, priority suggestions, merge suggestions and dictation.',
  privacy: 'When on, note text, task text and dictated audio are sent to OpenRouter and the model’s provider. Free models may log what you send.',
  keyHint: 'Create one at openrouter.ai/keys. It is stored on this computer and never shown again.',
  router: 'Auto (OpenRouter free router)',
} as const;

function modelOptions(models: FreeModel[] | undefined, current: string, audio: boolean): { id: string; label: string }[] {
  const list = (models ?? []).filter(m => !audio || m.audio).map(m => ({ id: m.id, label: m.structured || audio ? m.name : `${m.name} · no strict JSON` }));
  if (!audio && !list.some(m => m.id === 'openrouter/free')) list.unshift({ id: 'openrouter/free', label: AI_TEXT.router });
  if (current && !list.some(m => m.id === current)) list.unshift({ id: current, label: current });
  return list;
}

export function AISettings({ settings, onPatch }: { settings: Settings; onPatch: (changes: SettingsPatch) => Promise<boolean> }): JSX.Element {
  const status = useAIStatus();
  const setKey = useSetAIKey();
  const removeKey = useDeleteAIKey();
  const configured = status.data?.configured ?? false;
  const models = useFreeModels(configured);
  const [key, setKeyDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function saveKey(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await setKey.mutateAsync({ key: key.trim() });
      setKeyDraft('');
      toast('OpenRouter key saved.');
    } catch (caught) {
      setError(messageOf(caught));
    }
  }

  async function forgetKey() {
    setError(null);
    try {
      await removeKey.mutateAsync();
      await onPatch({ ai_enabled: false });
      toast('OpenRouter key removed. AI is off.');
    } catch (caught) {
      setError(messageOf(caught));
    }
  }

  if (!status.data) return <>
    <p className="settings-note">{AI_TEXT.intro}</p>
    {status.isError ? <p className="field-error" role="alert">{status.error.message}</p> : <p className="settings-note" role="status">Checking…</p>}
  </>;

  return <>
    <p className="settings-note">{AI_TEXT.intro}</p>
    {configured ? (
      <Row label="OpenRouter key" hint={status.data?.from_env ? 'Set by DHARA_OPENROUTER_API_KEY' : `Saved · ${status.data?.key_hint}`} id="ai-key">
        {!status.data?.from_env && <button type="button" className="ghost-button" disabled={removeKey.isPending} onClick={() => void forgetKey()}>Remove key</button>}
      </Row>
    ) : (
      <form className="setting-row" onSubmit={event => void saveKey(event)}>
        <div className="setting-label"><label htmlFor="ai-key-input">OpenRouter key</label><span id="ai-key-input-hint">{AI_TEXT.keyHint}</span></div>
        <div className="inline-actions ai-key-form">
          <input id="ai-key-input" type="password" autoComplete="off" spellCheck={false} aria-describedby="ai-key-input-hint" value={key} maxLength={300} onChange={e => setKeyDraft(e.target.value)} />
          <button type="submit" className="ghost-button" disabled={!key.trim() || setKey.isPending}>Save key</button>
        </div>
      </form>
    )}
    <Switch label="Send to OpenRouter" hint={AI_TEXT.privacy} checked={settings.ai_enabled && configured}
      onChange={next => { if (next && !configured) setError('Add an OpenRouter key first.'); else void onPatch({ ai_enabled: next }); }} />
    {configured && <>
      <Row label="Text model" hint="Free models from models.dev. Strict JSON models give the most reliable results." id="ai-model" htmlFor="ai-model-select">
        <select id="ai-model-select" aria-describedby="ai-model-hint" value={settings.ai_model} onChange={e => void onPatch({ ai_model: e.target.value })}>
          {modelOptions(models.data, settings.ai_model, false).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </Row>
      <Row label="Dictation model" hint="Free models that accept audio." id="ai-audio" htmlFor="ai-audio-select">
        <select id="ai-audio-select" aria-describedby="ai-audio-hint" value={settings.ai_audio_model} onChange={e => void onPatch({ ai_audio_model: e.target.value })}>
          {modelOptions(models.data, settings.ai_audio_model, true).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </Row>
      {models.isError && <p className="field-error" role="alert">{models.error.message}</p>}
    </>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </>;
}
