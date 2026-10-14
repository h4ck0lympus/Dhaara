// web/src/domain/tasks.test.ts
import { describe, expect, it } from 'vitest';
import { makeRun, makeSnapshot, makeTask } from '../test/fixtures';
import { dateLabel } from './format';
import {
  RUN_LABEL, STATUS_LABEL, TASK_EDIT_FIELDS, TASK_FILTERS, editableFields, filterTasks, isSessionUrl, keepTimestamps,
  needsReview, priorityLabel, reviewLink, taskMeta, waitingReason,
} from './tasks';

describe('priorityLabel (spec §4.7, decision 19A)', () => {
  it('priorityLabel maps automatic/rules, ai, you and unknown sources', () => {
    const cases: [string, string][] = [
      ['automatic', 'Auto · rules'], ['rules', 'Auto · rules'], ['ai', 'Auto · AI'], ['you', 'Set by you'], ['model-v2', 'Auto'], ['', 'Auto'],
    ];
    for (const [source, label] of cases) expect(priorityLabel(source), source).toBe(label);
  });
});

describe('editableFields', () => {
  it('copies exactly the twelve editable fields (app.js:343,382)', () => {
    const task = makeTask('t', { dependencies: ['a'], session_url: 'https://example.test/s' });
    const fields = editableFields(task);
    expect(Object.keys(fields).sort()).toEqual([...TASK_EDIT_FIELDS].sort());
    expect(fields.dependencies).toEqual(['a']);
    expect(fields.dependencies).not.toBe(task.dependencies);
  });
});

describe('filterTasks', () => {
  const high = makeTask('high', { effective_priority: 'high' });
  const low = makeTask('low', { effective_priority: 'low' });
  const parked = makeTask('parked', { status: 'parked' });
  const done = makeTask('done', { status: 'done' });
  const running = makeTask('running', { runs: [makeRun({ status: 'working', effective_status: 'working', stale: false })] });
  const asking = makeTask('asking', { runs: [makeRun({ status: 'needs_input', effective_status: 'needs_input', stale: false })] });
  const stale = makeTask('stale', { runs: [makeRun({ status: 'working', effective_status: 'unknown', stale: true })] });
  const snapshot = makeSnapshot({ tasks: [low, parked, done, high, running, asking, stale], attention: [asking], available: [low, high] });
  const ids = (filter: Parameters<typeof filterTasks>[1]) => filterTasks(snapshot, filter).map(t => t.id);

  it('lists the views with their visible labels', () => {
    expect(TASK_FILTERS.map(f => f.label)).toEqual(['Open', 'Needs you', 'Running', 'Available now', 'Parked', 'Completed', 'All']);
  });
  it('open excludes parked and done, sorted high → low (app.js:258)', () => {
    // Stable sort: mediums keep snapshot order.
    expect(ids('open')).toEqual(['high', 'running', 'asking', 'stale', 'low']);
  });
  it('needs-you uses the server attention list', () => expect(ids('needs-you')).toEqual(['asking']));
  it('running counts working and needs-input runs, never stale ones', () => expect(ids('running')).toEqual(['running', 'asking']));
  it('available uses the server available list', () => expect(ids('available')).toEqual(['high', 'low']));
  it('parked and done are distinct views', () => {
    expect(ids('parked')).toEqual(['parked']);
    expect(ids('done')).toEqual(['done']);
  });
  it('all keeps every task', () => expect(ids('all')).toHaveLength(7));
});

describe('row text', () => {
  it('taskMeta shows project and state, then only known reason, dates and estimate', () => {
    expect(taskMeta(makeTask('a', { project: 'Research', status: 'todo' }))).toBe('Research · To do');
    const due = '2026-10-09T10:00:00+00:00';
    expect(taskMeta(makeTask('b', {
      project: 'Work', status: 'review', attention_reason: 'A result is ready for your review.',
      due_at: due, planned_on: '2026-10-09', estimate_minutes: 25,
    }))).toBe(`Work · Review · A result is ready for your review. · Due ${dateLabel(due)} · Planned 2026-10-09 · 25 min · your estimate`);
  });
  it('STATUS_LABEL keeps parked distinct from done', () => {
    expect(STATUS_LABEL.parked).toBe('Parked');
    expect(STATUS_LABEL.done).toBe('Completed');
  });
  it('RUN_LABEL reads a stale run as unknown', () => expect(RUN_LABEL.unknown).toBe('Status unknown'));
});

describe('waitingReason (app.js:202-203)', () => {
  const dep = makeTask('dep', { title: 'Trace ownership' });
  it.each([
    [makeTask('t', { blocked_by: ['dep'] }), 'Waiting on: Trace ownership'],
    [makeTask('t', { runs: [makeRun({ status: 'working', effective_status: 'unknown', stale: true })] }), 'Agent status unknown'],
    [makeTask('t', { runs: [makeRun({ status: 'needs_input', effective_status: 'needs_input', stale: false })] }), 'Agent is awaiting your input'],
    [makeTask('t', { runs: [makeRun({ status: 'working', effective_status: 'working', stale: false })] }), 'Waiting on an agent report'],
    [makeTask('t', { status: 'blocked' }), 'Marked blocked'],
  ])('%#', (task, reason) => expect(waitingReason(task, [dep, task])).toBe(reason));
});

describe('links and review', () => {
  it('isSessionUrl accepts only http(s) (app.js:27)', () => {
    expect(isSessionUrl('https://example.test/s')).toBe(true);
    expect(isSessionUrl('http://127.0.0.1:3000')).toBe(true);
    expect(isSessionUrl('javascript:alert(1)')).toBe(false);
    expect(isSessionUrl('data:text/html,x')).toBe(false);
    expect(isSessionUrl('')).toBe(false);
    expect(isSessionUrl(null)).toBe(false);
  });
  it('a review task or a run in review needs review', () => {
    expect(needsReview(makeTask('a', { status: 'review' }))).toBe(true);
    expect(needsReview(makeTask('b', { runs: [makeRun({ status: 'review', effective_status: 'review', stale: false })] }))).toBe(true);
    expect(needsReview(makeTask('c'))).toBe(false);
  });
  it('reviewLink prefers the newest review run link, then the task link, never a non-http link', () => {
    const run = makeRun({ status: 'review', effective_status: 'review', stale: false, session_url: 'https://agent.test/result' });
    expect(reviewLink(makeTask('a', { runs: [run], session_url: 'https://example.test/task' }))).toBe('https://agent.test/result');
    expect(reviewLink(makeTask('b', { status: 'review', session_url: 'https://example.test/task' }))).toBe('https://example.test/task');
    expect(reviewLink(makeTask('c', { status: 'review', session_url: 'javascript:alert(1)' }))).toBeNull();
  });
});

describe('keepTimestamps (app.js:344)', () => {
  const original = makeTask('t', { due_at: '2026-11-20T17:22:33+00:00', not_before: '2026-10-01T11:23:45+00:00' });
  it('keeps stored precision for untouched or equivalent datetimes', () => {
    const values = { ...editableFields(original), due_at: '2026-11-20T17:22:00.000Z' };
    expect(keepTimestamps(values, original)).toEqual({ due_at: original.due_at, not_before: original.not_before });
  });
  it('uses the edited value when the minute changed', () => {
    const values = { ...editableFields(original), due_at: '2026-11-21T09:00:00.000Z', not_before: null };
    expect(keepTimestamps(values, original)).toEqual({ due_at: '2026-11-21T09:00:00.000Z', not_before: null });
  });
});
