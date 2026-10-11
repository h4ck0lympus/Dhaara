// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Focus } from '../api/schemas';
import { confirmFocusChange } from './focus';

const focus = (task_id: string, pinned: boolean): NonNullable<Focus> => ({ task_id, pinned, source: 'manual', updated_at: '2026-10-08T11:00:00+00:00' });
afterEach(() => vi.restoreAllMocks());

describe('confirmFocusChange', () => {
  it('allows any change without a pin and never asks', () => {
    const confirm = vi.spyOn(window, 'confirm');
    expect(confirmFocusChange(null, 't1')).toBe(true);
    expect(confirmFocusChange(focus('t1', false), 't2')).toBe(true);
    expect(confirmFocusChange(focus('t1', false), null)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('re-pinning the same task needs no confirmation', () => {
    const confirm = vi.spyOn(window, 'confirm');
    expect(confirmFocusChange(focus('t1', true), 't1')).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('asks before replacing a pin and respects a decline', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    expect(confirmFocusChange(focus('t1', true), 't2')).toBe(false);
    expect(confirmFocusChange(focus('t1', true), 't2')).toBe(true);
    expect(confirm).toHaveBeenCalledWith('Replace your pinned focus with this task?');
  });

  it('asks before clearing a pin', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(confirmFocusChange(focus('t1', true), null)).toBe(false);
    expect(confirm).toHaveBeenCalledWith('Unpin and clear your current focus?');
  });
});
