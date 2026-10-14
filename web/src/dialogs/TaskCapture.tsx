import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState, type FormEvent, type JSX, type KeyboardEvent } from 'react';
import { useNavigationGuard } from '../routes/guards';
import { TaskFields } from '../components/TaskFields';
import { taskDraftStore, useTaskDraft } from '../local/taskDraft';
import { openDialog } from '../shell/dialogs';
import { useSnapshot } from '../state/queries';
import { S } from '../strings';
import { Dialog } from '../ui/Dialog';
import { toast } from '../ui/Toast';

export function TaskCaptureDialog({ onClose, embedded = false }: { onClose: () => void; embedded?: boolean }): JSX.Element {
  const { draft, submitting } = useTaskDraft();
  const tasks = useSnapshot().data?.tasks ?? [];
  const qc = useQueryClient();
  const form = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);
  const [notice, setNotice] = useState(() => (draft.pending ? S.previousUnconfirmed : ''));
  const [error, setError] = useState('');
  const frozen = draft.pending !== null || submitting;
  useNavigationGuard(useMemo(() => embedded && submitting ? { id: 'inline-task-saving', check: () => ({ kind: 'block' as const, toast: 'Finishing task save…' }), beforeUnload: true } : null, [embedded, submitting]));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || submitting) return;
    inFlight.current = true;
    setError('');
    try {
      const result = await taskDraftStore.submit();
      if (result.ok) {
        onClose();
        void qc.invalidateQueries({ queryKey: ['snapshot'] });
        const id = result.task.id;
        toast(result.toast, { action: { label: S.editAction, onClick: () => openDialog({ kind: 'task', id }) } });
        return;
      }
      setError(result.message);
      setNotice(result.frozen ? S.unconfirmedPreserved : '');
    } finally {
      inFlight.current = false;
    }
  }

  async function requestClose() {
    if (inFlight.current || submitting) return; // app.js:297
    try {
      await taskDraftStore.persist();
      onClose();
    } catch {
      setNotice(S.draftNotStored);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
      event.preventDefault();
      form.current?.requestSubmit();
    }
  }

  const content = (
      <form ref={form} className="task-capture-form" onSubmit={e => void submit(e)} onKeyDown={onKeyDown}>
        <label className="task-input-label" htmlFor="task-input">What do you need to do?</label>
        <textarea id="task-input" name="raw" required maxLength={16000} rows={4} placeholder="Review the cleanup path" data-autofocus=""
          value={draft.raw} disabled={frozen} onChange={e => { setNotice(''); taskDraftStore.setRaw(e.target.value); }} />
        <details id="task-details">
          <summary>Details</summary>
          <label className="field">Title override · optional
            <input name="title" maxLength={240} value={draft.fields.title ?? ''} disabled={frozen}
              onChange={e => { setNotice(''); taskDraftStore.setField('title', e.target.value); }} />
          </label>
          <TaskFields value={draft.fields} disabled={frozen} tasks={tasks} selfId={null}
            onChange={(name, value) => { setNotice(''); taskDraftStore.setField(name, value); }} />
        </details>
        <p className="small muted shortcut-help">Ctrl / ⌘ + Enter to add. Enter starts a new line.</p>
        <p className="small dim" id="task-draft-status" role="status">{notice || taskDraftStore.statusLabel()}</p>
        <p className="field-error" role="alert">{error}</p>
        <div className="dialog-actions">
          <button type="button" className="secondary" disabled={submitting} onClick={() => void requestClose()}>Close</button>
          <button type="submit" className="primary" disabled={submitting}>{draft.pending ? S.retryAddTask : S.addTask}</button>
        </div>
      </form>
  );
  return embedded ? <section className="inline-task" aria-label="Add task">{content}</section> : <Dialog title={S.addTask} onRequestClose={() => void requestClose()} className="task-panel">{content}</Dialog>;
}
