import type { Note, NoteSummary, Snapshot, SnapshotRun, SnapshotTask } from '../api/schemas';

const STAMP = '2026-10-08T12:00:00+00:00';

export function makeRun(changes: Partial<SnapshotRun> = {}): SnapshotRun {
  return {
    id: 'run-1',
    task_id: 'task-1',
    agent: 'codex',
    session_url: '',
    status: 'working',
    message: 'Started',
    seq: 0,
    created_at: STAMP,
    updated_at: STAMP,
    stale: false,
    effective_status: 'working',
    ...changes,
  };
}

export function makeTask(id: string, changes: Partial<SnapshotTask> = {}): SnapshotTask {
  return {
    id,
    title: `Task ${id}`,
    project: 'Personal',
    detail: '',
    next_action: '',
    status: 'todo',
    priority: 'auto',
    due_at: null,
    not_before: null,
    estimate_minutes: null,
    dependencies: [],
    session_url: '',
    created_at: STAMP,
    updated_at: STAMP,
    version: 1,
    planned_on: null,
    original_input: null,
    interpretation: {},
    runs: [],
    blocked_by: [],
    reminders: [],
    effective_priority: 'medium',
    priority_reason: 'No explicit urgency; neutral default.',
    priority_source: 'automatic',
    attention_reason: '',
    available: false,
    ...changes,
  };
}

export function makeNoteSummary(id: string, changes: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id,
    title: `Note ${id}`,
    folder: 'Inbox',
    project: '',
    task_id: null,
    mode: 'original',
    processing: '',
    error: '',
    version: 1,
    created_at: STAMP,
    updated_at: STAMP,
    ...changes,
  };
}

export function makeNote(id: string, changes: Partial<Note> = {}): Note {
  return { ...makeNoteSummary(id), raw: '', transcript: '', body: '', attachments: [], suggestions: [], ...changes };
}

export function makeSnapshot(changes: Partial<Snapshot> = {}): Snapshot {
  return {
    tasks: [],
    notes: [],
    runs: [],
    reminders: [],
    focus: null,
    context: null,
    context_rules: [],
    settings: { observation_enabled: false, motion: false, companion: 'cat', companion_size: 40, display_name: '', theme: 'dark' },
    available: [],
    attention: [],
    up_next: [],
    server_time: STAMP,
    capabilities: { organizer: false, speech: false, screen_pixels: false, sync: 'single-server', model: '', speech_model: '' },
    ...changes,
  };
}
