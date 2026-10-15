// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  capture: { saving: false, recovered: true, saveState: 'saved' as string, draft: { id: 'd1', raw: 'thought', task_id: '', files: [] as unknown[] } },
  task: { recovered: true, draft: { id: 't1', raw: '', fields: {}, pending: null as unknown } },
  guards: new Set<string>(),
}));

vi.mock('../local/drafts', () => ({ captureDraftStore: { getSnapshot: () => state.capture, persist: vi.fn(async () => {}) } }));
vi.mock('../local/taskDraft', () => ({ taskDraftStore: { getSnapshot: () => state.task, persist: vi.fn(async () => {}) } }));
vi.mock('../routes/guards', () => ({ isGuardActive: (id: string) => state.guards.has(id) }));
vi.mock('../ui/Toast', () => ({ toast: vi.fn() }));

import { captureDraftStore } from '../local/drafts';
import { taskDraftStore } from '../local/taskDraft';
import { S } from '../strings';
import { toast } from '../ui/Toast';
import { installCheckpointClose } from './checkpoint';

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const requestClose = () => window.dispatchEvent(new Event('dhara:checkpoint-close'));
let postMessage: ReturnType<typeof vi.fn>;
let uninstall: () => void = () => {};

beforeEach(() => {
  state.capture = { saving: false, recovered: true, saveState: 'saved', draft: { id: 'd1', raw: 'thought', task_id: '', files: [] } };
  state.task = { recovered: true, draft: { id: 't1', raw: '', fields: {}, pending: null } };
  state.guards.clear();
  postMessage = vi.fn();
  Object.assign(window, { ipc: { postMessage } as Window['ipc'] });
});

afterEach(() => {
  uninstall();
  uninstall = () => {};
  delete window.ipc;
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('installCheckpointClose', () => {
  it('does nothing in an ordinary browser without the desktop bridge', async () => {
    delete window.ipc;
    uninstall = installCheckpointClose();
    expect(window.__dharaCheckpointCloseReady).toBeUndefined();
    requestClose();
    await settle();
    expect(captureDraftStore.persist).not.toHaveBeenCalled();
  });

  it('marks the page ready only once the listener is installed, and unmarks it on cleanup', () => {
    expect(window.__dharaCheckpointCloseReady).toBeUndefined();
    uninstall = installCheckpointClose();
    expect(window.__dharaCheckpointCloseReady).toBe(true);
    uninstall();
    uninstall = () => {};
    expect(window.__dharaCheckpointCloseReady).toBeUndefined();
  });

  it('saves both drafts, then approves the close', async () => {
    state.task.draft.raw = 'add a task later';
    uninstall = installCheckpointClose();
    requestClose();
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith('dhara:close-approved'));
    expect(vi.mocked(captureDraftStore.persist).mock.invocationCallOrder[0]).toBeLessThan(postMessage.mock.invocationCallOrder[0]);
    expect(vi.mocked(taskDraftStore.persist).mock.invocationCallOrder[0]).toBeLessThan(postMessage.mock.invocationCallOrder[0]);
  });

  it('does not rewrite an empty task draft', async () => {
    uninstall = installCheckpointClose();
    requestClose();
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    expect(taskDraftStore.persist).not.toHaveBeenCalled();
  });

  it('never writes drafts that have not finished loading over the stored ones', async () => {
    state.capture.recovered = false;
    state.task.recovered = false;
    state.task.draft.raw = 'not loaded yet';
    uninstall = installCheckpointClose();
    requestClose();
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    expect(captureDraftStore.persist).not.toHaveBeenCalled();
    expect(taskDraftStore.persist).not.toHaveBeenCalled();
  });

  it('keeps the window open with a toast while a capture save is in flight', async () => {
    state.capture.saving = true;
    uninstall = installCheckpointClose();
    requestClose();
    await settle();
    expect(toast).toHaveBeenCalledWith(S.closeSaveInFlight);
    expect(captureDraftStore.persist).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('asks before closing while recording or editing a note; declining keeps the window open', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    uninstall = installCheckpointClose();
    for (const guard of ['recording', 'note-edit']) {
      state.guards.clear();
      state.guards.add(guard);
      requestClose();
      await settle();
    }
    expect(confirm.mock.calls).toEqual([[S.closeConfirm], [S.closeConfirm]]);
    expect(captureDraftStore.persist).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    requestClose();
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith('dhara:close-approved'));
  });

  it('asks before risking a draft whose write failed, and closes only when the user accepts', async () => {
    vi.mocked(captureDraftStore.persist).mockImplementation(async () => { state.capture.saveState = 'error'; });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    uninstall = installCheckpointClose();
    requestClose();
    await settle();
    expect(confirm).toHaveBeenCalledWith(S.closeDraftFailed);
    expect(postMessage).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    requestClose();
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith('dhara:close-approved'));
  });

  it('closes an empty draft whose write failed without asking', async () => {
    state.capture.draft.raw = '';
    vi.mocked(captureDraftStore.persist).mockImplementation(async () => { state.capture.saveState = 'error'; });
    const confirm = vi.spyOn(window, 'confirm');
    uninstall = installCheckpointClose();
    requestClose();
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('asks before risking a task draft whose write failed, and closes only when the user accepts', async () => {
    state.task.draft.pending = { capture_id: 't1', raw: 'x', local_day: '2026-10-10', details: {} };
    vi.mocked(taskDraftStore.persist).mockRejectedValue(new Error('QuotaExceededError'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    uninstall = installCheckpointClose();
    requestClose();
    await settle();
    expect(confirm.mock.calls).toEqual([[S.closeDraftFailed]]);
    expect(toast).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    requestClose();
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith('dhara:close-approved'));
  });

  it('reports an unexpected checkpoint failure as an error and keeps the window open', async () => {
    vi.spyOn(window, 'confirm').mockImplementation(() => { throw new Error('boom'); });
    state.guards.add('recording');
    uninstall = installCheckpointClose();
    requestClose();
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(S.closeCheckpointFailed, { tone: 'error' }));
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('ignores a second close request while the first is still running', async () => {
    let finish: () => void = () => {};
    vi.mocked(captureDraftStore.persist).mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    uninstall = installCheckpointClose();
    requestClose();
    requestClose();
    await settle();
    expect(captureDraftStore.persist).toHaveBeenCalledTimes(1);
    finish();
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    requestClose();
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));
  });
});
