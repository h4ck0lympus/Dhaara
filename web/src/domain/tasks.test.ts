import { describe, expect, it } from 'vitest';
import { makeRun, makeSnapshot, makeTask } from '../test/fixtures';
import { dateLabel } from './format';
import {
  RUN_LABEL, STATUS_LABEL, TASK_EDIT_FIELDS, editableFields, isForToday, moveTask, openTasks, priorityGroups, isSessionUrl, keepTimestamps,
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

describe('openTasks', () => {
  it('excludes parked and done, sorted high → low and stable within a priority', () => {
    const tasks = [
      makeTask('low', { effective_priority: 'low' }), makeTask('parked', { status: 'parked' }), makeTask('done', { status: 'done' }),
      makeTask('high', { effective_priority: 'high' }), makeTask('m1', { effective_priority: 'medium' }), makeTask('m2', { effective_priority: 'medium', status: 'waiting' }),
    ];
    expect(openTasks(makeSnapshot({ tasks })).map(t => t.id)).toEqual(['high', 'm1', 'm2', 'low']);
  });
});

describe('isForToday', () => {
  const now = new Date(2026, 9, 15, 23, 30);
  const at = (day: number, hour = 9) => new Date(2026, 9, day, hour).toISOString();
  it.each([
    ['due earlier today', { due_at: at(15, 1) }, true], ['due late tonight', { due_at: at(15, 23) }, true],
    ['overdue', { due_at: at(10) }, true], ['due tomorrow', { due_at: at(16, 0) }, false],
    ['planned today', { planned_on: '2026-10-15' }, true], ['planned earlier', { planned_on: '2026-10-01' }, true],
    ['planned tomorrow', { planned_on: '2026-10-16' }, false], ['undated', {}, false],
    ['due later but planned today', { due_at: at(20), planned_on: '2026-10-15' }, true],
  ] as const)('%s → %s', (_label, changes, expected) => {
    expect(isForToday(makeTask('t', changes), now)).toBe(expected);
  });
});

describe('ordering and moves', () => {
  const t = (id: string, effective_priority: 'high' | 'medium' | 'low', changes: Record<string, unknown> = {}) => makeTask(id, { effective_priority, ...changes });
  const ids = (g: ReturnType<typeof priorityGroups>) => ({ high: g.high.map(x => x.id), medium: g.medium.map(x => x.id), low: g.low.map(x => x.id) });

  it('orders by priority, then manual position, then due date, then newest', () => {
    const tasks = [
      t('old', 'medium', { created_at: '2026-01-01T00:00:00Z' }), t('new', 'medium', { created_at: '2026-02-01T00:00:00Z' }),
      t('due', 'medium', { due_at: '2026-03-01T00:00:00Z' }), t('placed', 'medium', { position: 3 }), t('first', 'medium', { position: 0 }),
      t('hi', 'high'), t('lo', 'low', { position: 0 }),
    ];
    expect(openTasks(makeSnapshot({ tasks })).map(x => x.id)).toEqual(['hi', 'first', 'placed', 'due', 'new', 'old', 'lo']);
    expect(ids(priorityGroups(tasks))).toEqual({ high: ['hi'], medium: ['first', 'placed', 'due', 'new', 'old'], low: ['lo'] });
  });

  const groups = () => priorityGroups([t('a', 'high', { position: 0 }), t('b', 'high', { position: 1 }), t('c', 'high', { position: 2 }), t('m', 'medium', { position: 3 })]);

  it('reorders within a group like the drag preview, both directions', () => {
    expect(moveTask(groups(), 'a', 'c')).toEqual({ order: ['b', 'c', 'a', 'm'], priority: null });
    expect(moveTask(groups(), 'c', 'a')).toEqual({ order: ['c', 'a', 'b', 'm'], priority: null });
    expect(moveTask(groups(), 'a', 'b')).toEqual({ order: ['b', 'a', 'c', 'm'], priority: null });
  });

  it('moving into another group or onto its header changes the priority', () => {
    expect(moveTask(groups(), 'b', 'm')).toEqual({ order: ['a', 'c', 'b', 'm'], priority: { id: 'b', value: 'medium' } });
    expect(moveTask(groups(), 'a', 'low')).toEqual({ order: ['b', 'c', 'm', 'a'], priority: { id: 'a', value: 'low' } });
    expect(moveTask(groups(), 'm', 'high')).toEqual({ order: ['a', 'b', 'c', 'm'], priority: { id: 'm', value: 'high' } });
  });

  it('is a no-op when nothing changes or the target is unknown', () => {
    expect(moveTask(groups(), 'a', 'a')).toBeNull();
    expect(moveTask(groups(), 'c', 'high')).toBeNull();
    expect(moveTask(groups(), 'a', 'ghost')).toBeNull();
    expect(moveTask(groups(), 'ghost', 'a')).toBeNull();
  });
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
