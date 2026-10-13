// web/src/dialogs/TaskCapture.test.tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSnapshot } from '../test/fixtures';
import { polyfillDialog } from '../ui/testing';

const h = vi.hoisted(() => {
  type Draft = { id: string; raw: string; fields: Record<string, unknown>; pending: null | { capture_id: string; raw: string; local_day: string; details: Record<string, unknown> } };
  type State = { draft: Draft; saveState: string; submitting: boolean; recovered: boolean };
  const fresh = (): State => ({ draft: { id: 'draft-1', raw: '', fields: {}, pending: null }, saveState: 'saved', submitting: false, recovered: true });
  let state = fresh();
  const listeners = new Set<() => void>();
  const set = (next: Partial<State>) => { state = { ...state, ...next }; listeners.forEach(l => l()); };
  const store = {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setRaw: vi.fn((raw: string) => set({ draft: { ...state.draft, raw } })),
    setField: vi.fn(),
    persist: vi.fn(async () => {}),
    submit: vi.fn(),
    statusLabel: vi.fn(() => 'Draft on this device · not added'),
  };
  return { store, set, reset: () => { state = fresh(); }, pending: { capture_id: 'draft-1', raw: 'Review the cleanup path', local_day: '2026-10-10', details: {} } };
});

vi.mock('../local/taskDraft', async () => {
  const { useSyncExternalStore } = await import('react');
  return { taskDraftStore: h.store, useTaskDraft: () => useSyncExternalStore(h.store.subscribe, h.store.getSnapshot) };
});
vi.mock('../state/queries', () => ({ useSnapshot: () => ({ data: makeSnapshot() }) }));
vi.mock('../shell/dialogs', () => ({ openDialog: vi.fn() }));
vi.mock('../ui/Toast', () => ({ toast: vi.fn() }));

import { openDialog } from '../shell/dialogs';
import { S } from '../strings';
import { toast } from '../ui/Toast';
import { TaskCaptureDialog } from './TaskCapture';

beforeAll(polyfillDialog);
beforeEach(() => h.reset());
afterEach(() => { cleanup(); vi.clearAllMocks(); h.store.persist.mockImplementation(async () => {}); });

function renderDialog() {
  const onClose = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}><TaskCaptureDialog onClose={onClose} /></QueryClientProvider>);
  return { onClose, input: screen.getByLabelText('What do you need to do?') as HTMLTextAreaElement };
}
const typeRaw = (input: HTMLTextAreaElement, raw: string) => fireEvent.change(input, { target: { value: raw } });

describe('TaskCaptureDialog', () => {
  it('opens on one focused multiline input with Details collapsed', () => {
    const { input } = renderDialog();
    expect(input.tagName).toBe('TEXTAREA');
    expect(document.activeElement).toBe(input);
    expect((document.querySelector('#task-details') as HTMLDetailsElement).open).toBe(false);
    expect(screen.getByText('Ctrl / ⌘ + Enter to add. Enter starts a new line.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Draft on this device · not added');
  });

  it('typing goes to the draft store; Details fields go to setField', () => {
    const { input } = renderDialog();
    typeRaw(input, 'Review the cleanup path');
    expect(h.store.setRaw).toHaveBeenCalledWith('Review the cleanup path');
    fireEvent.change(screen.getByLabelText('Workflow · optional'), { target: { value: 'Research' } });
    expect(h.store.setField).toHaveBeenCalledWith('project', 'Research');
    fireEvent.change(screen.getByLabelText('Title override · optional'), { target: { value: 'Shorter title' } });
    expect(h.store.setField).toHaveBeenCalledWith('title', 'Shorter title');
  });

  it('plain Enter never submits; Ctrl+Enter does, unless composing', async () => {
    h.store.submit.mockResolvedValue({ ok: false, frozen: false, message: 'x' });
    const { input } = renderDialog();
    typeRaw(input, 'Review the cleanup path');
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true, isComposing: true });
    expect(h.store.submit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(h.store.submit).toHaveBeenCalledOnce());
  });

  it('a confirmed add closes, confirms compactly with Edit, and Edit opens the saved task', async () => {
    h.store.submit.mockResolvedValue({ ok: true, task: { id: 'task-9' }, toast: S.taskAdded });
    const { input, onClose } = renderDialog();
    typeRaw(input, 'Review the cleanup path');
    fireEvent.click(screen.getByRole('button', { name: S.addTask }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    const [message, options] = vi.mocked(toast).mock.calls[0];
    expect(message).toBe(S.taskAdded);
    expect(options?.action?.label).toBe(S.editAction);
    options!.action!.onClick();
    expect(openDialog).toHaveBeenCalledWith({ kind: 'task', id: 'task-9' });
  });

  it('an unconfirmed add stays frozen with Retry add task', async () => {
    h.store.submit.mockImplementation(async () => {
      h.set({ draft: { id: 'draft-1', raw: 'Review the cleanup path', fields: {}, pending: h.pending } });
      return { ok: false, frozen: true, message: S.notConfirmed + S.checkServiceRetry };
    });
    const { input, onClose } = renderDialog();
    typeRaw(input, 'Review the cleanup path');
    fireEvent.click(screen.getByRole('button', { name: S.addTask }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(S.notConfirmed + S.checkServiceRetry));
    expect(screen.getByRole('status').textContent).toBe(S.unconfirmedPreserved);
    expect(screen.getByRole('button', { name: S.retryAddTask })).toBeTruthy();
    expect(input.disabled).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a 401 or other 4xx unfreezes the input', async () => {
    h.store.submit.mockResolvedValue({ ok: false, frozen: false, message: S.notConfirmed + 'Unlock Dhara to continue' });
    const { input } = renderDialog();
    typeRaw(input, 'Review the cleanup path');
    fireEvent.click(screen.getByRole('button', { name: S.addTask }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(S.notConfirmed + 'Unlock Dhara to continue'));
    expect(input.disabled).toBe(false);
    expect(screen.getByRole('button', { name: S.addTask })).toBeTruthy();
  });

  it('reopening with an unconfirmed attempt shows it frozen with Retry', () => {
    h.set({ draft: { id: 'draft-1', raw: 'Review the cleanup path', fields: {}, pending: h.pending } });
    const { input } = renderDialog();
    expect(input.value).toBe('Review the cleanup path');
    expect(input.disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toBe(S.previousUnconfirmed);
    expect(screen.getByRole('button', { name: S.retryAddTask })).toBeTruthy();
  });

  it('Close, Escape and backdrop save the draft before closing', async () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(h.store.persist).toHaveBeenCalledOnce();
    const dialog = screen.getByRole('dialog', { name: S.addTask });
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));
    expect(h.store.persist).toHaveBeenCalledTimes(2);
  });

  it('stays open with retry advice when the draft cannot be saved', async () => {
    h.store.persist.mockRejectedValue(new DOMException('Injected quota failure', 'QuotaExceededError'));
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(S.draftNotStored));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores Close while a submit is in flight', () => {
    h.set({ submitting: true });
    const { onClose } = renderDialog();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Close dialog' })); });
    expect(h.store.persist).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
