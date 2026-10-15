import { describe, expect, it } from 'vitest';
import type { Focus, Snapshot } from '../api/schemas';
import { makeNoteSummary, makeRun, makeSnapshot, makeTask } from '../test/fixtures';
import { focusKind, nowState } from './nowState';

const focus = (task_id: string, pinned: boolean, source = 'manual'): NonNullable<Focus> =>
  ({ task_id, pinned, source, updated_at: '2026-10-08T11:00:00+00:00' });

describe('nowState (verbatim port of the legacy Now-state cases)', () => {
  it('empty connected workspace is new, not complete', () => {
    expect(nowState(makeSnapshot(), true).mode).toBe('new');
  });

  it('notes without tasks are not a new workspace or implicit work', () => {
    expect(nowState(makeSnapshot({ notes: [makeNoteSummary('learning')] }), true).mode).toBe('notes-only');
  });

  it('one available suggestion keeps server ranking and hidden alternatives', () => {
    const a = makeTask('first'), b = makeTask('second');
    const n = nowState(makeSnapshot({ tasks: [a, b], available: [a, b] }), true);
    expect(n.mode).toBe('available');
    expect(n.primary?.id).toBe('first');
    expect(n.alternatives).toHaveLength(1);
  });

  it('questions and results outrank ordinary available work', () => {
    const a = makeTask('question'), b = makeTask('available');
    const n = nowState(makeSnapshot({ tasks: [a, b], attention: [a], available: [b] }), true);
    expect(n.mode).toBe('attention');
    expect(n.primary?.id).toBe('question');
  });

  it('unresolved dependencies are waiting, not completed', () => {
    const t = makeTask('blocked', { blocked_by: ['dependency'] });
    expect(nowState(makeSnapshot({ tasks: [t] }), true).mode).toBe('waiting');
  });

  it('a reported agent run is waiting, not a human recommendation', () => {
    const run = makeRun({ status: 'working', effective_status: 'working', stale: false });
    const t = makeTask('agent', { runs: [run] });
    const n = nowState(makeSnapshot({ tasks: [t], runs: [run] }), true);
    expect(n.mode).toBe('waiting');
    expect(n.primary).toBeNull();
  });

  it('all tasks explicitly done means complete', () => {
    expect(nowState(makeSnapshot({ tasks: [makeTask('done', { status: 'done' })] }), true).mode).toBe('complete');
  });

  it('parked work is not complete', () => {
    expect(nowState(makeSnapshot({ tasks: [makeTask('parked', { status: 'parked' })] }), true).mode).toBe('idle');
  });

  it('future-start work is not complete or actionable focus', () => {
    const t = makeTask('future', { not_before: '2026-11-08T12:00:00+00:00' });
    expect(nowState(makeSnapshot({ tasks: [t], focus: focus(t.id, false) }), true).primary).toBeNull();
  });

  it('zero running does not mean no integration; needs-input stays reported', () => {
    const r = makeRun({ status: 'needs_input', effective_status: 'needs_input', stale: false });
    expect(nowState(makeSnapshot({ runs: [r] }), true).integration).toMatch(/awaiting input.*recently reported/);
    expect(nowState(makeSnapshot(), true).integration).toMatch(/connection status unknown/);
  });

  it('stale reports do not masquerade as running', () => {
    const r = makeRun({ status: 'working', effective_status: 'unknown', stale: true });
    const t = makeTask('unknown', { runs: [r] });
    const n = nowState(makeSnapshot({ tasks: [t], runs: [r], attention: [t] }), true);
    expect(n.mode).toBe('unknown');
    expect(n.active).toHaveLength(0);
    expect(n.integration).toMatch(/status unknown/);
  });

  it('disconnected cached complete/new snapshots cannot assert current state', () => {
    for (const s of [makeSnapshot(), makeSnapshot({ tasks: [makeTask('done', { status: 'done' })] })]) {
      const n = nowState(s, false);
      expect(n.mode).toBe('disconnected');
      expect(n.primary).toBeNull();
    }
  });

  it('disconnected cached tasks cannot be called currently actionable alternatives', () => {
    const t = makeTask('cached');
    expect(nowState(makeSnapshot({ tasks: [t], available: [t] }), false).alternatives).toHaveLength(0);
  });

  it('manual and pinned focus have different labels', () => {
    expect(focusKind(focus('t', false, 'manual'))).toBe('Selected by you');
    expect(focusKind(focus('t', true))).toBe('Pinned by you');
  });

  it('deriving suggestions never changes a pinned focus', () => {
    const a = makeTask('pin'), b = makeTask('other');
    const s = makeSnapshot({ tasks: [a, b], available: [b], focus: focus('pin', true) });
    nowState(s, true);
    expect(s.focus).toEqual(focus('pin', true));
  });

  it('a focused task with a stale agent cannot be recommended', () => {
    const t = makeTask('focus', { runs: [makeRun({ status: 'working', effective_status: 'unknown', stale: true })] });
    expect(nowState(makeSnapshot({ tasks: [t], focus: focus(t.id, false) }), true).primary).toBeNull();
  });

  it('time filter never supplies an estimate for a focused task', () => {
    const t = makeTask('focus');
    expect(nowState(makeSnapshot({ tasks: [t], focus: focus(t.id, false) }), true, 15).primary).toBeNull();
  });

  it('actionable pin is continued when no competing available item exists', () => {
    const pin = makeTask('pin');
    const s = makeSnapshot({ tasks: [pin], focus: focus(pin.id, true) });
    const n = nowState(s, true);
    expect(n.primary?.id).toBe('pin');
    expect(n.kind).toBe('focus');
    expect(s.focus?.pinned).toBe(true);
  });

  it('another available recommendation does not replace an actionable pin', () => {
    const pin = makeTask('pin'), other = makeTask('other', { next_action: 'Inspect synthetic example' });
    const s = makeSnapshot({ tasks: [pin, other], available: [other], focus: focus(pin.id, true) });
    const n = nowState(s, true);
    expect(n.primary?.id).toBe('other');
    expect(s.focus?.task_id).toBe('pin');
    expect(s.focus?.pinned).toBe(true);
  });

  it('dependency or agent waiting pin stays pinned while other work is recommended', () => {
    const changes = [
      { blocked_by: ['other'] },
      { runs: [makeRun({ status: 'working', effective_status: 'working', stale: false })] },
    ];
    for (const change of changes) {
      const pin = makeTask('pin', change), other = makeTask('other');
      const s = makeSnapshot({ tasks: [pin, other], available: [other], focus: focus(pin.id, true) });
      const n = nowState(s, true);
      expect(n.primary?.id).toBe('other');
      expect(n.waiting[0].id).toBe('pin');
      expect(s.focus?.task_id).toBe('pin');
    }
  });

  it('attention on another task outranks a pin without changing it; no focus stays unset', () => {
    const pin = makeTask('pin');
    const review = makeTask('review', { status: 'review', attention_reason: 'Ready for human review' });
    const s = makeSnapshot({ tasks: [pin, review], attention: [review], focus: focus(pin.id, true) });
    expect(nowState(s, true).primary?.id).toBe('review');
    expect(s.focus?.task_id).toBe('pin');
    const none = makeSnapshot({ tasks: [pin], available: [pin] });
    expect(nowState(none, true).primary?.id).toBe('pin');
    expect(none.focus).toBeNull();
  });
});
