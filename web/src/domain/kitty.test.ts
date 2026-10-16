import { describe, expect, it } from 'vitest';
import { makeRun, makeSnapshot, makeTask } from '../test/fixtures';
import { KITTY_H, KITTY_W, kittyFrame, kittyLabel, kittyStatus, type KittyState } from './kitty';

const reminder = { id: 'r', task_id: 't', at: '', state: 'due' as const, created_at: '' };

describe('kittyStatus', () => {
  const asking = makeTask('a', { attention_reason: 'An agent needs your input.' });
  const nudge = makeTask('n', { reminders: [reminder] });
  const working = makeRun({ effective_status: 'working' });
  const focus = { task_id: 'f', pinned: true, source: 'manual', updated_at: '' };

  it.each<[string, Parameters<typeof kittyStatus>, KittyState, number, string]>([
    ['offline wins', [makeSnapshot({ attention: [asking] }), false, false], 'offline', 0, 'Offline · showing last known'],
    ['no snapshot yet', [undefined, true, false], 'offline', 0, 'Offline · showing last known'],
    ['needs you counts non-reminder attention', [makeSnapshot({ attention: [asking, nudge], runs: [working] }), true, false], 'needs-you', 1, '1 need you · 1 reminder due · 1 working'],
    ['reminder when only reminders are due', [makeSnapshot({ attention: [nudge, makeTask('n2', { reminders: [reminder] })] }), true, false], 'reminder', 2, '2 reminders due'],
    ['working agents', [makeSnapshot({ runs: [working, makeRun({ id: 'x', effective_status: 'review' })] }), true, false], 'working', 0, '1 working'],
    ['focus', [makeSnapshot({ focus }), true, false], 'focus', 0, 'Focused'],
    ['asleep', [makeSnapshot(), true, false], 'sleeping', 0, 'All quiet'],
    ['quiet hides alerts', [makeSnapshot({ attention: [asking] }), true, true], 'sleeping', 0, 'Quiet · 1 need you'],
  ])('%s', (_name, args, state, count, summary) => {
    expect(kittyStatus(...args)).toEqual({ state, count, summary });
  });
});

describe('kittyFrame', () => {
  const states: KittyState[] = ['needs-you', 'reminder', 'working', 'focus', 'sleeping', 'offline'];

  it('every state and frame is a 26 × 15 grid of palette letters', () => {
    for (const state of states) for (let f = 0; f < 6; f += 1) for (const petted of [false, true]) {
      const { pixels } = kittyFrame(state, f, petted);
      expect(pixels).toHaveLength(KITTY_H);
      for (const row of pixels) expect(row).toMatch(new RegExp(`^[.okbpz]{${KITTY_W}}$`));
    }
  });

  it('open eyes are 2×2 dark pixels; asleep shows z pixels and shut eyes', () => {
    const open = kittyFrame('working', 0, false).pixels;
    expect(open[6].slice(6, 8) + open[7].slice(6, 8)).toBe('oooo');
    const asleep = kittyFrame('sleeping', 0, false).pixels;
    expect(asleep[6].slice(6, 8)).toBe('kk');
    expect(asleep.join('')).toContain('z');
  });

  it('needs-you hops on alternate frames; others stay put', () => {
    expect([0, 1, 2].map(f => kittyFrame('needs-you', f, false).hop)).toEqual([false, true, false]);
    expect(kittyFrame('working', 1, false).hop).toBe(false);
  });

  it('working taps the right paw; reminder waves the left', () => {
    expect(kittyFrame('working', 0, false).pixels[14].slice(17, 24)).toBe('.......');
    expect(kittyFrame('working', 1, false).pixels[14].slice(17, 24)).toBe('.ooooo.');
    expect(kittyFrame('reminder', 1, false).pixels[14].slice(0, 6)).toBe('......');
    expect(kittyFrame('reminder', 0, false).pixels[14].slice(0, 6)).toBe('..ooo.');
  });

  it('petting shows happy eyes and blush, except when offline', () => {
    const happy = kittyFrame('needs-you', 0, true).pixels;
    expect(happy[6].slice(6, 8)).toBe('oo');
    expect(happy[7][5]).toBe('o');
    expect(happy[9].slice(4, 6)).toBe('pp');
    expect(kittyFrame('needs-you', 0, true).hop).toBe(false);
    expect(kittyFrame('offline', 0, true)).toEqual(kittyFrame('offline', 0, false));
  });

  it('labels describe the state, and petting', () => {
    expect(kittyLabel({ state: 'needs-you', count: 2, summary: '' }, false)).toBe('Kitty alert: 2 need you');
    expect(kittyLabel({ state: 'working', count: 0, summary: '' }, true)).toBe('Kitty purring: happy to be petted');
    expect(kittyLabel({ state: 'offline', count: 0, summary: '' }, true)).toBe('Kitty dimmed: Dhara is offline');
  });
});
