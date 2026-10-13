import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Attachments, toastRejections } from '../capture/Attachments';
import { RECORDER_TEXT, formatElapsed, useRecorder } from '../capture/Recorder';
import { SavedNotice, type SavedCapture } from '../capture/SavedNotice';
import { COPY } from '../copy';
import { connection } from '../domain/connection';
import { isOutboxItem, outboxGet } from '../local/db';
import { captureDraftStore, useCaptureDraft, type LocalSaveState } from '../local/drafts';
import { ACCEPT_ATTR } from '../local/limits';
import { subscribeOutbox } from '../local/outbox';
import { useNavigationGuard, type NavigationGuard } from '../routes/guards';
import { openDialog } from '../shell/dialogs';
import { OfflineNotice } from '../shell/OfflineNotice';
import { runFlush, useSnapshot } from '../state/queries';
import { S } from '../strings';
import { Icon } from '../ui/Icon';
import { PageHeading } from '../ui/PageHeading';
import { toast } from '../ui/Toast';
import '../styles/capture-notes.css';

const DRAFT_LABELS: Record<LocalSaveState, string> = {   // app.js:66
  saved: S.draftSaved,
  error: S.draftError,
  pending: S.draftPending,
  memory: S.draftMemory,
};

// Flush deletes an outbox item only after a 2xx, so an absent item means the server acknowledged it.
async function ackState(id: string): Promise<SavedCapture['state']> {
  const item = await outboxGet(id);
  if (item === undefined) return 'server';
  return isOutboxItem(item) && item.error ? 'rejected' : 'queued';
}

export function CaptureScreen({ embedded = false, onOpenNote }: { embedded?: boolean; onOpenNote?: (id: string) => void } = {}) {
  const { draft, saveState, saving } = useCaptureDraft();
  const snapshot = useSnapshot().data ?? null;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const picker = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState<SavedCapture | null>(null);
  const [dragging, setDragging] = useState(false);
  const recorder = useRecorder();
  const recording = recorder.phase !== 'idle';
  const recordingGuard = useMemo<NavigationGuard | null>(
    () => (recording
      ? { id: 'recording', check: to => (to !== (embedded ? '/overview' : '/capture') ? { kind: 'block', toast: S.stopRecordingBeforeLeaving } : null), beforeUnload: true }
      : null),
    [recording, embedded],
  );
  useNavigationGuard(recordingGuard);

  const savingGuard = useMemo<NavigationGuard | null>(
    () => (saving ? { id: 'capture-saving', check: () => ({ kind: 'block', toast: S.finishingLocalSave }), beforeUnload: true } : null),
    [saving],
  );
  useNavigationGuard(savingGuard);

  const pendingId = saved && saved.state !== 'server' ? saved.id : null;
  useEffect(() => {
    if (!pendingId) return;
    return subscribeOutbox(() => {
      ackState(pendingId).then(
        state => setSaved(current => (current?.id === pendingId ? { id: pendingId, state } : current)),
        () => {},
      );
    });
  }, [pendingId]);

  async function addFiles(files: File[]) {
    if (!files.length) return;
    if (captureDraftStore.getSnapshot().saving) {
      toast(S.finishingLocalSave);   // addFiles accepts nothing while a save is in flight
      return;
    }
    toastRejections(await captureDraftStore.addFiles(files));
  }

  async function save() {
    if (captureDraftStore.getSnapshot().saving) return;
    if (recording) {
      toast(S.stopRecordingBeforeSaving);   // app.js:401
      return;
    }
    const id = captureDraftStore.getSnapshot().draft.id;
    const result = await captureDraftStore.save();
    if (!result.ok) {
      toast(result.message, { tone: 'error' });
      return;
    }
    setSaved({ id, state: 'queued' });
    toast(connection.get() ? S.captureSavedSending : S.captureSavedOffline);   // app.js:417
    await runFlush(queryClient);
    try {
      const state = await ackState(id);
      setSaved(current => (current?.id === id ? { id, state } : current));
    } catch {
      // An unreadable queue keeps the queued wording; flush already reported it.
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void save();
    }
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files);
    if (!files.length) return;
    event.preventDefault();
    void addFiles(files);
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    void addFiles(Array.from(event.dataTransfer.files));
  }

  const tasks = (snapshot?.tasks ?? []).filter(task => task.status !== 'done');   // app.js:216
  const linkedElsewhere = draft.task_id !== '' && !tasks.some(task => task.id === draft.task_id);

  return (
    <div className="screen capture-screen" data-quiet onKeyDown={onKeyDown}>
      <OfflineNotice />
      {!embedded && <PageHeading title={COPY.capture.title} subtitle={COPY.capture.subtitle} />}
      <fieldset className="capture-fieldset" disabled={saving}>
        <legend className="sr-only">Capture</legend>
        <div
          className={dragging ? 'writing-canvas dragging' : 'writing-canvas'}
          data-quiet
          onDragOver={event => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <label className="sr-only" htmlFor="capture-input">Rough learning note</label>
          <textarea
            id="capture-input"
            value={draft.raw}
            placeholder="Start anywhere. You don’t have to explain it neatly."
            onChange={event => captureDraftStore.setRaw(event.target.value)}
            onPaste={onPaste}
          />
          <div className="visual-tray" role="group" aria-labelledby="visual-tray-label">
            {/* app.js:213 */}
            <span className="eyebrow" id="visual-tray-label">Visuals &amp; recordings</span>
            <Attachments files={draft.files} onRemove={index => { void captureDraftStore.removeFile(index); }} />
            {draft.files.length === 0 && <p className="tray-hint">Paste or drop an image. Diagrams and audio stay with this note.</p>}
          </div>
          <div className="canvas-tools">
            <div className="tool-group">
              {/* app.js:211, 435 */}
              <button type="button" className="quiet-button" onClick={() => void recorder.start()} disabled={recording}><Icon name="mic" />{recorder.status === RECORDER_TEXT.added ? 'Record another thought' : 'Record a thought'}</button>
              <button type="button" className="quiet-button" onClick={() => picker.current?.click()}><Icon name="image" />Image</button>
              <button type="button" className="quiet-button" onClick={() => openDialog({ kind: 'sketch' })}><Icon name="pen" />Sketch</button>
            </div>
            <button type="button" className="primary" onClick={() => void save()}>Save note <span aria-hidden="true">↗</span></button>
          </div>
          {recording ? (
            <div className="recording-controls" role="group" aria-label="Recording" data-phase={recorder.phase}>
              <span className="recording-indicator" aria-hidden="true"><Icon name={recorder.phase === 'paused' ? 'pause' : 'mic'} /></span>
              <span className="recording-phase" aria-live="polite">
                {recorder.phase === 'paused' ? 'Paused' : recorder.phase === 'starting' ? 'Starting…' : 'Recording'}
              </span>
              <span className="recording-elapsed">{formatElapsed(recorder.elapsedMs)}</span>
              {recorder.phase === 'paused' ? (
                <button type="button" className="secondary" onClick={recorder.resume}><Icon name="play" />Resume</button>
              ) : (
                <button type="button" className="secondary" onClick={recorder.pause} disabled={recorder.phase !== 'recording'}><Icon name="pause" />Pause</button>
              )}
              {/* app.js:438 */}
              <button type="button" className="secondary" onClick={recorder.stop} disabled={recorder.phase === 'starting'}><Icon name="stop" />Stop recording</button>
            </div>
          ) : (
            <p className="record-status">{recorder.status}</p>
          )}
          <input
            ref={picker}
            type="file"
            accept={ACCEPT_ATTR}
            multiple
            hidden
            onChange={event => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = '';
              void addFiles(files);
            }}
          />
        </div>
        <label className="capture-link">
          Link to a task
          <select value={draft.task_id} onChange={event => { void captureDraftStore.setTaskId(event.target.value); }}>
            <option value="">None — just a learning note</option>
            {linkedElsewhere && <option value={draft.task_id}>Linked task (not open)</option>}
            {tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}
          </select>
        </label>
      </fieldset>
      <p className="draft-meta" id="draft-status" role="status">{DRAFT_LABELS[saveState]}</p>
      {saveState === 'error' && (
        <div className="notice error" id="local-save-error" role="alert">
          {S.localSaveErrorNotice}{' '}
          <button type="button" className="text-button" disabled={saving} onClick={() => void captureDraftStore.persist()}>{S.retryLocalSave}</button>
        </div>
      )}
      {saved && (
        <SavedNotice
          saved={saved}
          onOpenNote={id => onOpenNote ? onOpenNote(id) : void navigate({ to: '/note/$id', params: { id } })}
          onOpenQueue={() => openDialog({ kind: 'outbox' })}
          onDismiss={() => setSaved(null)}
        />
      )}
      <p className="subtle-line">
        {snapshot?.capabilities.organizer
          ? 'Local AI cleanup runs after save. The original is preserved.'
          : 'Basic folder filing is on. AI rewriting is off until you connect a local model.'}
      </p>
    </div>
  );
}
