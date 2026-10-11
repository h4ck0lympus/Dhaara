// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const order: string[] = [];
vi.mock('../state/queries', () => ({ runFlush: vi.fn(async () => { order.push('flush'); return { sent: 0, stop: 'done' }; }) }));

import { runFlush } from '../state/queries';
import { closeDialog, isDialogOpen, openDialog, useDialog } from './dialogs';
import { cancelUnlock, completeUnlock, isUnlockOpen, requestUnlock, useUnlockOpen } from './unlock';

afterEach(() => { act(() => { closeDialog(); cancelUnlock(); }); order.length = 0; });

describe('dialog store', () => {
  it('opens, replaces and closes one dialog at a time', () => {
    const { result } = renderHook(() => useDialog());
    expect(result.current).toBeNull();
    act(() => openDialog({ kind: 'task-capture' }));
    expect(result.current).toEqual({ kind: 'task-capture' });
    expect(isDialogOpen()).toBe(true);
    act(() => openDialog({ kind: 'task', id: 't1' }));
    expect(result.current).toEqual({ kind: 'task', id: 't1' });
    act(() => closeDialog());
    expect(result.current).toBeNull();
    expect(isDialogOpen()).toBe(false);
  });
});

describe('unlock store', () => {
  it('stacks over an open dialog without discarding it', () => {
    const dialog = renderHook(() => useDialog());
    const unlock = renderHook(() => useUnlockOpen());
    act(() => openDialog({ kind: 'task-capture' }));
    act(() => requestUnlock());
    expect(unlock.result.current).toBe(true);
    expect(isUnlockOpen()).toBe(true);
    expect(dialog.result.current).toEqual({ kind: 'task-capture' });
    act(() => cancelUnlock());
    expect(unlock.result.current).toBe(false);
    expect(dialog.result.current).toEqual({ kind: 'task-capture' });
  });

  it('completeUnlock closes Unlock, refreshes the snapshot, then flushes the outbox', async () => {
    const qc = new QueryClient();
    vi.spyOn(qc, 'refetchQueries').mockImplementation(async () => { order.push('refetch'); });
    act(() => requestUnlock());
    await act(() => completeUnlock(qc));
    expect(isUnlockOpen()).toBe(false);
    expect(qc.refetchQueries).toHaveBeenCalledWith({ queryKey: ['snapshot'] });
    expect(runFlush).toHaveBeenCalledWith(qc);
    expect(order).toEqual(['refetch', 'flush']);
  });
});
