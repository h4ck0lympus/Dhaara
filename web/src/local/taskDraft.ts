// The Add task draft (spec §4.4 "Task capture", contract §4.3): persisted before any HTTP call and replayed with the same
// capture_id only when the user retries. Port of public/app.js:305-366.
import { useSyncExternalStore } from 'react';
import { ApiError, call } from '../api/client';
import { TaskSchema, type Task, type TaskEditable } from '../api/schemas';
import { localDay } from '../domain/format';
import { S } from '../strings';
import { isTaskDraft, kvGet, kvPut, uid, type TaskDraft } from './db';

export type TaskSaveState = 'memory' | 'pending' | 'saved' | 'error';
export type TaskDraftState = { draft: TaskDraft; saveState: TaskSaveState; submitting: boolean; recovered: boolean };
export type TaskSubmitResult = { ok: true; task: Task; toast: string } | { ok: false; frozen: boolean; message: string };

const emptyTaskDraft = (): TaskDraft => ({ id: uid(), raw: '', fields: {}, pending: null });

let state: TaskDraftState = { draft: emptyTaskDraft(), saveState: 'memory', submitting: false, recovered: false };
const listeners = new Set<() => void>();
let writes: Promise<void> = Promise.resolve();
let inFlight: Promise<TaskSubmitResult> | null = null;

function update(changes: Partial<TaskDraftState>): void {
  state = { ...state, ...changes };
  for (const listener of [...listeners]) listener();
}

function setDraft(draft: TaskDraft): void {
  update({ draft });
}

// app.js:308-312: serialised; throws so callers can keep the dialog open.
function persist(): Promise<void> {
  const snapshot = structuredClone(state.draft);
  update({ saveState: 'pending' });
  const next = writes.catch(() => {}).then(() => kvPut('task-draft', snapshot));
  writes = next;
  return next.then(
    () => update({ saveState: 'saved' }),
    (error: unknown) => {
      update({ saveState: 'error' });
      throw error;
    },
  );
}

async function submitOnce(now: Date): Promise<TaskSubmitResult> {
  let pending = state.draft.pending;
  if (pending === null) {
    // local_day is fixed at the first submit and replayed unchanged, even across midnight.
    pending = { capture_id: state.draft.id, raw: state.draft.raw, local_day: localDay(now), details: state.draft.fields };
    setDraft({ ...state.draft, pending });
    try {
      await persist();
    } catch {
      setDraft({ ...state.draft, pending: null });
      return { ok: false, frozen: false, message: S.draftStorageFailed };
    }
  }
  try {
    const task = await call('taskCapture', TaskSchema, { body: pending });
    if (!task.id || task.original_input !== pending.raw) return { ok: false, frozen: true, message: S.ackUnverified };
    setDraft(emptyTaskDraft());
    await persist().catch(() => {}); // the task is durably acknowledged; a failed local reset is safe to retry by capture ID
    return { ok: true, task, toast: task.interpretation.explanation?.startsWith('Scheduling wording') ? S.taskAddedDateKept : S.taskAdded };
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'http' && error.status !== null && error.status < 500 && error.status !== 409) {
      setDraft({ ...state.draft, pending: null });
      await persist().catch(() => {});
      return { ok: false, frozen: false, message: S.notConfirmed + error.message };
    }
    // 409, 5xx, network, or an unverifiable 2xx: stay frozen; Retry replays the same pending payload.
    return { ok: false, frozen: true, message: S.notConfirmed + (error instanceof ApiError && error.kind === 'http' ? error.message : S.checkServiceRetry) };
  }
}

export const taskDraftStore = {
  getSnapshot(): TaskDraftState {
    return state;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  // app.js:591
  async load(): Promise<void> {
    try {
      const stored = await kvGet('task-draft');
      if (isTaskDraft(stored)) update({ draft: { ...stored, pending: stored.pending ?? null }, saveState: 'saved', recovered: true });
      else update({ recovered: true });
    } catch {
      update({ saveState: 'error', recovered: true });
    }
  },
  // app.js:328-333: every input is persisted.
  setRaw(raw: string): void {
    setDraft({ ...state.draft, raw });
    persist().catch(() => {});
  },
  setField<K extends keyof TaskEditable>(name: K, value: TaskEditable[K] | null | ''): void {
    const fields: Partial<Record<keyof TaskEditable, unknown>> = { ...state.draft.fields };
    if ((name === 'title' || name === 'project') && !value) delete fields[name];
    else fields[name] = value;
    setDraft({ ...state.draft, fields: fields as Partial<TaskEditable> });
    persist().catch(() => {});
  },
  persist,
  // Single-flight: a second call while one is in flight gets the same result.
  submit(now: Date = new Date()): Promise<TaskSubmitResult> {
    if (inFlight) return inFlight;
    update({ submitting: true });
    inFlight = submitOnce(now).finally(() => {
      inFlight = null;
      update({ submitting: false });
    });
    return inFlight;
  },
  // app.js:306
  statusLabel(): string {
    const { saveState, draft } = state;
    if (saveState === 'saved') return draft.pending ? S.taskDraftUnconfirmed : S.taskDraftSaved;
    if (saveState === 'error') return S.taskDraftError;
    if (saveState === 'pending') return S.taskDraftPending;
    return S.taskDraftMemory;
  },
};

export function useTaskDraft(): TaskDraftState {
  return useSyncExternalStore(taskDraftStore.subscribe, taskDraftStore.getSnapshot, taskDraftStore.getSnapshot);
}
