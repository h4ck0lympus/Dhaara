// The Capture draft (spec §4.4, contract §4.3): one external store shared by Capture, the Outbox dialog and the close
// checkpoint. Writes are serialised; a version counter keeps a stale write from labelling newer input as saved.
import { useSyncExternalStore } from 'react';
import { S } from '../strings';
import { toast } from '../ui/Toast';
import { isDraft, kvGet, kvPut, transaction, uid, type Draft, type OutboxItem } from './db';
import { validateFiles, type FileRejection } from './limits';

export type LocalSaveState = 'memory' | 'pending' | 'saved' | 'error';
export type CaptureDraftState = { draft: Draft; saveState: LocalSaveState; saving: boolean; recovered: boolean };
export type SaveCaptureResult = { ok: true } | { ok: false; message: string };
export const DRAFT_DEBOUNCE_MS = 350;

export function emptyDraft(): Draft {
  return { id: uid(), raw: '', task_id: '', files: [] };
}

let state: CaptureDraftState = { draft: emptyDraft(), saveState: 'memory', saving: false, recovered: false };
const listeners = new Set<() => void>();
let writeVersion = 0;
let writes: Promise<unknown> = Promise.resolve();
let debounce: ReturnType<typeof setTimeout> | undefined;

function update(changes: Partial<CaptureDraftState>): void {
  state = { ...state, ...changes };
  for (const listener of [...listeners]) listener();
}

function serialise<T>(operation: () => Promise<T>): Promise<T> {
  const next = writes.catch(() => {}).then(operation);
  writes = next;
  return next;
}

// app.js:69-74
async function persist(): Promise<void> {
  clearTimeout(debounce);
  const version = ++writeVersion;
  update({ saveState: 'pending' });
  try {
    await serialise(() => kvPut('draft', structuredClone(state.draft))) // cloned when the write runs, so a queued persist never writes a pre-save draft;
    if (version === writeVersion) update({ saveState: 'saved' });
  } catch {
    if (version === writeVersion) {
      update({ saveState: 'error' });
      toast(S.localSaveFailedToast, { tone: 'error' });
    }
  }
}

export const captureDraftStore = {
  getSnapshot(): CaptureDraftState {
    return state;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  // app.js:590. A malformed stored draft is left in place until the next write; the editor starts empty.
  async load(): Promise<void> {
    try {
      const stored = await kvGet('draft');
      if (isDraft(stored)) update({ draft: stored, saveState: 'saved', recovered: true });
      else update({ saveState: 'memory', recovered: true });
    } catch {
      update({ saveState: 'error', recovered: true });
    }
  },
  // app.js:390 — typing is debounced 350 ms and immediately marks the draft as not yet saved.
  setRaw(raw: string): void {
    writeVersion++;
    update({ draft: { ...state.draft, raw }, saveState: 'pending' });
    clearTimeout(debounce);
    debounce = setTimeout(() => void persist(), DRAFT_DEBOUNCE_MS);
  },
  async setTaskId(taskId: string): Promise<void> {
    update({ draft: { ...state.draft, task_id: taskId } });
    await persist();
  },
  // app.js:398. The caller toasts the rejections; nothing is accepted while a save is in flight.
  async addFiles(files: File[]): Promise<FileRejection[]> {
    if (state.saving) return [];
    const { accepted, rejections } = validateFiles(state.draft.files, files);
    if (accepted.length > 0) {
      update({ draft: { ...state.draft, files: [...state.draft.files, ...accepted] } });
      await persist();
    }
    return rejections;
  },
  async removeFile(index: number): Promise<void> {
    update({ draft: { ...state.draft, files: state.draft.files.filter((_, i) => i !== index) } });
    await persist();
  },
  persist,
  // app.js:400-418: one ['kv','outbox'] transaction; the in-memory draft is replaced only after commit.
  async save(): Promise<SaveCaptureResult> {
    if (state.saving) return { ok: false, message: S.finishingLocalSave };
    const draft = state.draft;
    if (!draft.raw.trim() && draft.files.length === 0) return { ok: false, message: S.writeSomething };
    clearTimeout(debounce);
    writeVersion++;
    update({ saving: true });
    const capture: OutboxItem = structuredClone({ ...draft, error: '' });
    const next = emptyDraft();
    try {
      await serialise(() =>
        transaction(['kv', 'outbox'], 'readwrite', (tx) => {
          tx.objectStore('outbox').add(capture); // add, not put: a duplicate id fails the whole save
          tx.objectStore('kv').put(next, 'draft');
        }),
      );
      update({ draft: next, saveState: 'saved', saving: false });
      return { ok: true };
    } catch (error) {
      update({ saveState: 'error', saving: false });
      return { ok: false, message: S.couldNotSave(error instanceof Error ? error.message : String(error)) };
    }
  },
  // app.js:542 "Open a copy in Capture": a new id, so the queued original stays independent.
  async replaceWith(item: OutboxItem): Promise<void> {
    const { error: _error, ...copy } = item;
    update({ draft: { ...copy, id: uid() } });
    await persist();
  },
  // Local addition: outbox.ts marks the draft status when the capture queue cannot be read (app.js:135).
  markSaveError(): void {
    update({ saveState: 'error' });
  },
};

export function useCaptureDraft(): CaptureDraftState {
  return useSyncExternalStore(captureDraftStore.subscribe, captureDraftStore.getSnapshot, captureDraftStore.getSnapshot);
}
