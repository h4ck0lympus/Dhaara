// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  capture: { saving: false, recovered: true },
  task: { recovered: true, draft: { raw: 'a task', pending: null } },
}));

vi.mock('../local/drafts', () => ({ captureDraftStore: { getSnapshot: () => state.capture, persist: vi.fn(async () => {}) } }));
vi.mock('../local/taskDraft', () => ({ taskDraftStore: { getSnapshot: () => state.task, persist: vi.fn(async () => {}) } }));
vi.mock('../ui/Toast', () => ({ toast: vi.fn() }));

import { captureDraftStore } from '../local/drafts';
import { taskDraftStore } from '../local/taskDraft';
import { S } from '../strings';
import { toast } from '../ui/Toast';
import { installPreloadErrorHandler } from './preloadError';

let uninstall: () => void = () => {};
const fire = () => {
  const event = new Event('vite:preloadError', { cancelable: true });
  window.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  state.capture = { saving: false, recovered: true };
  state.task = { recovered: true, draft: { raw: 'a task', pending: null } };
});

afterEach(() => {
  uninstall();
  uninstall = () => {};
  vi.clearAllMocks();
});

describe('installPreloadErrorHandler', () => {
  it('stops the default error, saves both drafts, then offers a reload', async () => {
    uninstall = installPreloadErrorHandler();
    expect(fire().defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(S.updateReady, { action: { label: S.reload, onClick: expect.any(Function) } }));
    expect(vi.mocked(captureDraftStore.persist).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(toast).mock.invocationCallOrder[0]);
    expect(vi.mocked(taskDraftStore.persist).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(toast).mock.invocationCallOrder[0]);
  });

  it('still offers the reload when a draft write fails', async () => {
    vi.mocked(taskDraftStore.persist).mockRejectedValueOnce(new Error('quota'));
    uninstall = installPreloadErrorHandler();
    fire();
    await vi.waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
  });

  it('does not overwrite an in-flight save or a draft that has not loaded', async () => {
    state.capture = { saving: true, recovered: true };
    state.task.recovered = false;
    uninstall = installPreloadErrorHandler();
    fire();
    await vi.waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(captureDraftStore.persist).not.toHaveBeenCalled();
    expect(taskDraftStore.persist).not.toHaveBeenCalled();
  });

  it('stops listening after cleanup', async () => {
    installPreloadErrorHandler()();
    expect(fire().defaultPrevented).toBe(false);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(toast).not.toHaveBeenCalled();
  });
});
