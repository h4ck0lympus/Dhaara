// Response schemas (contract §3.3). z.object strips unknown keys; nothing is coerced. Shapes: noema/store.py, noema/server.py.
import { z } from '../zod';

const int = () => z.number().int();

export const TaskStatusSchema = z.enum(['todo', 'active', 'waiting', 'blocked', 'review', 'parked', 'done']);
export const PrioritySchema = z.enum(['auto', 'high', 'medium', 'low']);
export const EffectivePrioritySchema = z.enum(['high', 'medium', 'low']);
export const RunStatusSchema = z.enum(['working', 'needs_input', 'review', 'failed', 'cancelled']);

export const RunSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  agent: z.string(),
  session_url: z.string(),
  status: RunStatusSchema,
  message: z.string(),
  seq: int(),
  created_at: z.string(),
  updated_at: z.string(),
});
// store.py:432-433
export const SnapshotRunSchema = RunSchema.extend({ stale: z.boolean(), effective_status: z.union([RunStatusSchema, z.literal('unknown')]) });

export const ReminderSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  at: z.string(),
  state: z.enum(['scheduled', 'due', 'dismissed']),
  created_at: z.string(),
});
// store.py:351
export const ReminderCreatedSchema = z.object({ id: z.string(), task_id: z.string(), at: z.string(), state: z.literal('scheduled') });

export const InterpretationSchema = z.looseObject({ explanation: z.string().optional(), manual_fields: z.array(z.string()).optional() });

// store.task_row: LEFT JOIN task_captures, so original_input is null for tasks created without a capture.
export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  project: z.string(),
  detail: z.string(),
  next_action: z.string(),
  status: TaskStatusSchema,
  priority: PrioritySchema,
  due_at: z.string().nullable(),
  not_before: z.string().nullable(),
  estimate_minutes: int().nullable(),
  dependencies: z.array(z.string()),
  session_url: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  version: int(),
  planned_on: z.string().nullable(),
  original_input: z.string().nullable(),
  interpretation: InterpretationSchema,
});
// store.py:443-466. priority_source is open: 'automatic' | 'you' today, 'rules' | 'ai' after spec §11.1.
export const SnapshotTaskSchema = TaskSchema.extend({
  runs: z.array(SnapshotRunSchema),
  blocked_by: z.array(z.string()),
  reminders: z.array(ReminderSchema),
  effective_priority: EffectivePrioritySchema,
  priority_reason: z.string(),
  priority_source: z.string(),
  attention_reason: z.string(),
  available: z.boolean(),
  recommendation_reason: z.string().optional(),
});

export const NoteSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  folder: z.string(),
  project: z.string(),
  task_id: z.string().nullable(),
  mode: z.string(),
  processing: z.string(),
  error: z.string(),
  version: int(),
  created_at: z.string(),
  updated_at: z.string(),
});
export const AttachmentSchema = z.object({ id: z.string(), name: z.string(), mime: z.string(), size: int(), offset_seconds: z.number().nullable() });
export const SuggestionSchema = z.object({ id: z.string(), note_id: z.string(), title: z.string(), body: z.string(), folder: z.string(), created_at: z.string() });
export const NoteSchema = NoteSummarySchema.extend({
  raw: z.string(),
  transcript: z.string(),
  body: z.string(),
  attachments: z.array(AttachmentSchema),
  suggestions: z.array(SuggestionSchema),
});
export const RevisionSchema = z.object({
  id: int(),
  note_id: z.string(),
  version: int(),
  title: z.string(),
  body: z.string(),
  folder: z.string(),
  source: z.string(),
  created_at: z.string(),
});

export const FocusSchema = z.object({ task_id: z.string(), pinned: z.boolean(), source: z.string(), updated_at: z.string() }).nullable();
export const ContextSchema = z
  .object({
    device: z.string(),
    app: z.string(),
    title: z.string(),
    workspace: z.string(),
    monitor: z.string(),
    updated_at: z.string(),
    source: z.string(),
    suggested_task_id: z.string().nullable(),
    stale: z.boolean().optional(),
  })
  .nullable();
export const ContextRuleSchema = z.object({ id: z.string(), app: z.string(), contains_text: z.string(), task_id: z.string() });
export const SettingsSchema = z.object({
  observation_enabled: z.boolean(),
  motion: z.boolean(),
  companion: z.enum(['cat', 'dot', 'hidden']),
  companion_size: int().min(24).max(72),
  display_name: z.string().max(60),
});
export const CapabilitiesSchema = z.object({
  organizer: z.boolean(),
  speech: z.boolean(),
  screen_pixels: z.boolean(),
  sync: z.string(),
  model: z.string(),
  speech_model: z.string(),
});
export const SnapshotSchema = z.object({
  tasks: z.array(SnapshotTaskSchema),
  notes: z.array(NoteSummarySchema),
  runs: z.array(SnapshotRunSchema),
  reminders: z.array(ReminderSchema),
  focus: FocusSchema,
  context: ContextSchema,
  context_rules: z.array(ContextRuleSchema),
  settings: SettingsSchema,
  available: z.array(SnapshotTaskSchema),
  attention: z.array(SnapshotTaskSchema),
  up_next: z.array(SnapshotTaskSchema),
  server_time: z.string(),
  capabilities: CapabilitiesSchema,
});
export const TokenSummarySchema = z.object({ id: z.string(), name: z.string(), scope: z.enum(['agent', 'observer']), created_at: z.string() });
export const TokenCreatedSchema = z.object({ id: z.string(), token: z.string(), scope: z.enum(['agent', 'observer']), task_ids: z.array(z.string()) });
export const OkSchema = z.object({ ok: z.literal(true) });

export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type Priority = z.infer<typeof PrioritySchema>;
export type Run = z.infer<typeof RunSchema>;
export type SnapshotRun = z.infer<typeof SnapshotRunSchema>;
export type Reminder = z.infer<typeof ReminderSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type SnapshotTask = z.infer<typeof SnapshotTaskSchema>;
export type NoteSummary = z.infer<typeof NoteSummarySchema>;
export type Note = z.infer<typeof NoteSchema>;
export type Revision = z.infer<typeof RevisionSchema>;
export type Focus = z.infer<typeof FocusSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type TokenSummary = z.infer<typeof TokenSummarySchema>;
export type TokenCreated = z.infer<typeof TokenCreatedSchema>;

// Request bodies.
export type TaskEditable = Pick<
  Task,
  'title' | 'project' | 'detail' | 'next_action' | 'status' | 'priority' | 'due_at' | 'not_before' | 'planned_on' | 'estimate_minutes' | 'dependencies' | 'session_url'
>;
export type TaskUpdateBody = TaskEditable & { expected_version: number };
export type TaskCaptureBody = { capture_id: string; raw: string; local_day: string; details: Partial<TaskEditable> };
export type CapturePayload = { capture_id: string; raw: string; project: ''; task_id: string | null; organize: true };
export type NoteUpdateBody = { title: string; folder: string; body: string; expected_version: number };
export type SettingsPatch = Partial<Pick<Settings, 'observation_enabled' | 'motion' | 'companion' | 'companion_size' | 'display_name'>>;
