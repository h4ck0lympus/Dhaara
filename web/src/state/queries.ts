import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { ApiError, call } from '../api/client';
import {
  AIStatusSchema,
  DictationSchema,
  FreeModelListSchema,
  MergeResultSchema,
  ContextRuleSchema,
  FocusSchema,
  NoteSchema,
  NoteSummarySchema,
  OkSchema,
  ReminderCreatedSchema,
  RevisionSchema,
  RunSchema,
  SettingsSchema,
  SnapshotSchema,
  TaskSchema,
  TokenCreatedSchema,
  TokenSummarySchema,
  type AIStatus,
  type Focus,
  type FreeModel,
  type Note,
  type NoteSummary,
  type NoteUpdateBody,
  type Revision,
  type Run,
  type Settings,
  type SettingsPatch,
  type Snapshot,
  type Task,
  type TaskEditable,
  type TaskUpdateBody,
  type TokenCreated,
  type TokenSummary,
} from '../api/schemas';
import { fetchSnapshot } from '../api/session';
import { connection } from '../domain/connection';
import { editableFields, type TaskMove } from '../domain/tasks';
import { SERVICE_UP } from '../events';
import { kvGet, kvPut } from '../local/db';
import { flushOutbox, type FlushResult } from '../local/outbox';
import { z } from '../zod';
import { SNAPSHOT_INTERVAL_MS } from './queryClient';

export const queryKeys = {
  snapshot: (minutes: number | null) => ['snapshot', minutes] as const,
  note: (id: string) => ['note', id] as const,
  noteHistory: (id: string) => ['note', id, 'history'] as const,
  search: (q: string) => ['search', q] as const,
  tokens: ['tokens'] as const,
};

const RevisionListSchema = z.array(RevisionSchema);
const NoteSummaryListSchema = z.array(NoteSummarySchema);
const TokenSummaryListSchema = z.array(TokenSummarySchema);
type Ok = z.infer<typeof OkSchema>;
type ContextRule = z.infer<typeof ContextRuleSchema>;
type ReminderCreated = z.infer<typeof ReminderCreatedSchema>;

let budget: number | null = null;
const budgetListeners = new Set<() => void>();
const subscribeBudget = (listener: () => void) => {
  budgetListeners.add(listener);
  return () => {
    budgetListeners.delete(listener);
  };
};
const getBudget = () => budget;
function setBudget(minutes: number | null): void {
  budget = minutes;
  for (const listener of [...budgetListeners]) listener();
}

export function useTimeBudget(): readonly [number | null, (minutes: number | null) => void] {
  return [useSyncExternalStore(subscribeBudget, getBudget, getBudget), setBudget] as const;
}

export async function runFlush(qc: QueryClient): Promise<FlushResult> {
  const result = await flushOutbox();
  if (result.sent > 0) await qc.invalidateQueries({ queryKey: ['snapshot'] });
  return result;
}

export function useSnapshot(): UseQueryResult<Snapshot, ApiError> {
  const [minutes] = useTimeBudget();
  const query = useQuery<Snapshot, ApiError>({
    queryKey: queryKeys.snapshot(minutes),
    queryFn: async () => {
      try {
        const snapshot = await fetchSnapshot(minutes);
        connection.report('state-success');
        void kvPut('snapshot', snapshot).catch(() => {});
        return snapshot;
      } catch (error) {
        connection.report('state-failure');
        throw error;
      }
    },
    refetchInterval: SNAPSHOT_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
  });
  return query;
}

export async function readCachedSnapshot(): Promise<Snapshot | null> {
  const stored = await kvGet('snapshot').catch(() => null);
  const parsed = SnapshotSchema.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

export function installRefetchTriggers(qc: QueryClient): () => void {
  const serviceUp = () => void qc.refetchQueries({ queryKey: ['snapshot'] });
  window.addEventListener(SERVICE_UP, serviceUp);
  const unsubscribe = qc.getQueryCache().subscribe(event => {
    if (event.type === 'updated' && event.action.type === 'success' && event.query.queryKey[0] === 'snapshot' && document.visibilityState === 'visible') void runFlush(qc);
  });
  return () => { window.removeEventListener(SERVICE_UP, serviceUp); unsubscribe(); };
}

export function useNote(id: string): UseQueryResult<Note, ApiError> {
  return useQuery<Note, ApiError>({ queryKey: queryKeys.note(id), queryFn: () => call('note', NoteSchema, { params: { id } }) });
}

export function useNoteHistory(id: string, enabled: boolean): UseQueryResult<Revision[], ApiError> {
  return useQuery<Revision[], ApiError>({ queryKey: queryKeys.noteHistory(id), queryFn: () => call('noteHistory', RevisionListSchema, { params: { id } }), enabled });
}

export function useSearch(q: string): UseQueryResult<NoteSummary[], ApiError> {
  return useQuery<NoteSummary[], ApiError>({ queryKey: queryKeys.search(q), queryFn: () => call('search', NoteSummaryListSchema, { query: { q } }), enabled: q !== '' });
}

export function useTokens(enabled: boolean): UseQueryResult<TokenSummary[], ApiError> {
  return useQuery<TokenSummary[], ApiError>({ queryKey: queryKeys.tokens, queryFn: () => call('tokens', TokenSummaryListSchema), enabled });
}

function useApiMutation<V, R>(mutationFn: (variables: V) => Promise<R>, extraKeys: (variables: V) => QueryKey[] = () => []): UseMutationResult<R, ApiError, V> {
  const qc = useQueryClient();
  return useMutation<R, ApiError, V>({
    mutationFn,
    onSuccess: async (_data, variables) => {
      await Promise.all([['snapshot'], ...extraKeys(variables)].map((queryKey) => qc.invalidateQueries({ queryKey })));
    },
  });
}

export function useSetFocus(): UseMutationResult<Focus, ApiError, { taskId: string | null }> {
  return useApiMutation((v: { taskId: string | null }) => call('focus', FocusSchema, { body: { task_id: v.taskId, pinned: true } }));
}

export function usePatchTask(): UseMutationResult<Task, ApiError, { id: string; changes: Partial<TaskEditable> }> {
  return useApiMutation(async (v: { id: string; changes: Partial<TaskEditable> }) => {
    const fresh = await call('task', TaskSchema, { params: { id: v.id } });
    return call('taskUpdate', TaskSchema, { params: { id: v.id }, body: { ...editableFields(fresh), ...v.changes, expected_version: fresh.version } });
  });
}

function applyMove(snapshot: Snapshot, move: TaskMove): Snapshot {
  const position = new Map(move.order.map((id, index) => [id, index]));
  const tasks = snapshot.tasks.map(task => {
    const moved = position.has(task.id) ? { ...task, position: position.get(task.id)! } : task;
    return move.priority?.id === task.id
      ? { ...moved, priority: move.priority.value, effective_priority: move.priority.value, priority_source: 'you' }
      : moved;
  });
  return { ...snapshot, tasks };
}

/** Saves a drag: the dragged task's new priority (if it changed group), then the order. Shows it at once, and rolls back on failure. */
export function useReorderTasks(): UseMutationResult<void, ApiError, TaskMove> {
  const qc = useQueryClient();
  return useMutation<void, ApiError, TaskMove, [QueryKey, Snapshot | undefined][]>({
    mutationFn: async move => {
      if (move.priority) {
        const fresh = await call('task', TaskSchema, { params: { id: move.priority.id } });
        await call('taskUpdate', TaskSchema, { params: { id: fresh.id }, body: { ...editableFields(fresh), priority: move.priority.value, expected_version: fresh.version } });
      }
      await call('taskOrder', OkSchema, { body: { ids: move.order } });
    },
    onMutate: async move => {
      await qc.cancelQueries({ queryKey: ['snapshot'] });
      const previous = qc.getQueriesData<Snapshot>({ queryKey: ['snapshot'] });
      qc.setQueriesData<Snapshot>({ queryKey: ['snapshot'] }, snapshot => (snapshot ? applyMove(snapshot, move) : snapshot));
      return previous;
    },
    onError: (_error, _move, previous) => { for (const [key, data] of previous ?? []) qc.setQueryData(key, data); },
    onSettled: () => qc.invalidateQueries({ queryKey: ['snapshot'] }),
  });
}

export function useAIStatus(): UseQueryResult<AIStatus, ApiError> {
  return useQuery<AIStatus, ApiError>({ queryKey: ['ai'], queryFn: () => call('ai', AIStatusSchema) });
}

export function useFreeModels(enabled: boolean): UseQueryResult<FreeModel[], ApiError> {
  return useQuery<FreeModel[], ApiError>({ queryKey: ['ai-models'], queryFn: () => call('aiModels', FreeModelListSchema), enabled, staleTime: 60 * 60_000 });
}

export function useSetAIKey(): UseMutationResult<AIStatus, ApiError, { key: string }> {
  return useApiMutation((v: { key: string }) => call('aiKeySet', AIStatusSchema, { body: v }), () => [['ai']]);
}

export function useDeleteAIKey(): UseMutationResult<AIStatus, ApiError, void> {
  return useApiMutation(() => call('aiKeyDelete', AIStatusSchema), () => [['ai']]);
}

export function useMergeAction(): UseMutationResult<{ id: string; state: string }, ApiError, { id: string; action: 'accept' | 'undo' | 'dismiss' }> {
  const key = { accept: 'mergeAccept', undo: 'mergeUndo', dismiss: 'mergeDismiss' } as const;
  return useApiMutation((v: { id: string; action: 'accept' | 'undo' | 'dismiss' }) => call(key[v.action], MergeResultSchema, { params: { id: v.id } }));
}

export function dictate(audio: Blob): Promise<{ text: string; source: 'openrouter' | 'local' }> {
  const form = new FormData();
  form.append('audio', audio, 'dictation.wav');
  return call('dictate', DictationSchema, { body: form });
}

export function useSaveTask(): UseMutationResult<Task, ApiError, { id: string; body: TaskUpdateBody }> {
  return useApiMutation((v: { id: string; body: TaskUpdateBody }) => call('taskUpdate', TaskSchema, { params: { id: v.id }, body: v.body }));
}

export function useUpdateNote(): UseMutationResult<Note, ApiError, { id: string; body: NoteUpdateBody }> {
  return useApiMutation(
    (v: { id: string; body: NoteUpdateBody }) => call('noteUpdate', NoteSchema, { params: { id: v.id }, body: v.body }),
    (v) => [queryKeys.note(v.id)],
  );
}

export function useRestoreNote(): UseMutationResult<Note, ApiError, { id: string; version: number; expectedVersion: number }> {
  return useApiMutation(
    (v: { id: string; version: number; expectedVersion: number }) =>
      call('noteRestore', NoteSchema, { params: { id: v.id, version: v.version }, body: { expected_version: v.expectedVersion } }),
    (v) => [queryKeys.note(v.id)],
  );
}

export function useApplySuggestion(): UseMutationResult<Note, ApiError, { id: string; sid: string; expectedVersion: number }> {
  return useApiMutation(
    (v: { id: string; sid: string; expectedVersion: number }) =>
      call('noteApplySuggestion', NoteSchema, { params: { id: v.id, sid: v.sid }, body: { expected_version: v.expectedVersion } }),
    (v) => [queryKeys.note(v.id)],
  );
}

export function useProcessNote(): UseMutationResult<Note, ApiError, { id: string; kind: 'organize' | 'transcribe' }> {
  return useApiMutation(
    (v: { id: string; kind: 'organize' | 'transcribe' }) => call(v.kind === 'organize' ? 'noteOrganize' : 'noteTranscribe', NoteSchema, { params: { id: v.id } }),
    (v) => [queryKeys.note(v.id)],
  );
}

export function useCreateReminder(): UseMutationResult<ReminderCreated, ApiError, { taskId: string; at: string }> {
  return useApiMutation((v: { taskId: string; at: string }) => call('reminderCreate', ReminderCreatedSchema, { body: { task_id: v.taskId, at: v.at } }));
}

export function useSnoozeReminder(): UseMutationResult<Ok, ApiError, { id: string }> {
  return useApiMutation((v: { id: string }) => call('reminderSnooze', OkSchema, { params: { id: v.id }, body: { minutes: 20 } }));
}

export function useDismissReminder(): UseMutationResult<Ok, ApiError, { id: string }> {
  return useApiMutation((v: { id: string }) => call('reminderDismiss', OkSchema, { params: { id: v.id } }));
}

export function useEndTracking(): UseMutationResult<Run, ApiError, { runId: string }> {
  return useApiMutation((v: { runId: string }) => call('runEndTracking', RunSchema, { params: { id: v.runId } }));
}

export function useUpdateSettings(): UseMutationResult<Settings, ApiError, SettingsPatch> {
  return useApiMutation((patch: SettingsPatch) => call('settingsUpdate', SettingsSchema, { body: patch }));
}

export function useCreateRule(): UseMutationResult<ContextRule, ApiError, { app: string; contains: string; task_id: string }> {
  return useApiMutation((v: { app: string; contains: string; task_id: string }) => call('ruleCreate', ContextRuleSchema, { body: v }));
}

export function useDeleteRule(): UseMutationResult<Ok, ApiError, { id: string }> {
  return useApiMutation((v: { id: string }) => call('ruleDelete', OkSchema, { params: { id: v.id } }));
}

export function useCreateToken(): UseMutationResult<TokenCreated, ApiError, { name: string; scope: 'agent' | 'observer'; task_ids: string[] }> {
  return useApiMutation(
    (v: { name: string; scope: 'agent' | 'observer'; task_ids: string[] }) => call('tokenCreate', TokenCreatedSchema, { body: v }),
    () => [queryKeys.tokens],
  );
}

export function useRevokeToken(): UseMutationResult<Ok, ApiError, { id: string }> {
  return useApiMutation((v: { id: string }) => call('tokenRevoke', OkSchema, { params: { id: v.id } }), () => [queryKeys.tokens]);
}
