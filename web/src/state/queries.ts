// Queries and mutation hooks (spec §4.3, contract §4.6). Refetches update the cache only: screens copy server data into
// form state when they open, so a refetch never replaces in-progress input.
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { ApiError, call } from '../api/client';
import {
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
  type Focus,
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
import { editableFields } from '../domain/tasks';
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

// The Overview time budget is shared by every screen that reads the snapshot.
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
  const qc = useQueryClient();
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
    refetchInterval: SNAPSHOT_INTERVAL_MS, // parity cadence: 15 s while visible
    refetchIntervalInBackground: false, // no fetch while hidden
    refetchOnWindowFocus: true, // TanStack's focus is document visibility: refetch on becoming visible
    refetchOnReconnect: true, // the window 'online' event
    placeholderData: keepPreviousData,
  });
  // Flush trigger: each visible snapshot tick (and the refetches on becoming visible and online).
  useEffect(() => {
    if (query.dataUpdatedAt > 0 && document.visibilityState === 'visible') void runFlush(qc);
  }, [query.dataUpdatedAt, qc]);
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
  return () => window.removeEventListener(SERVICE_UP, serviceUp);
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

// Every mutation hook: no retry (QueryClient default), then invalidate the snapshot plus any extra keys.
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

// Complete/reopen/priority re-read the task and PUT with the fresh version (app.js:382).
export function usePatchTask(): UseMutationResult<Task, ApiError, { id: string; changes: Partial<TaskEditable> }> {
  return useApiMutation(async (v: { id: string; changes: Partial<TaskEditable> }) => {
    const fresh = await call('task', TaskSchema, { params: { id: v.id } });
    return call('taskUpdate', TaskSchema, { params: { id: v.id }, body: { ...editableFields(fresh), ...v.changes, expected_version: fresh.version } });
  });
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
