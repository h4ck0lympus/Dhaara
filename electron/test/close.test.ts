import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({ answers: [] as number[], messages: [] as string[] }));
vi.mock('electron', () => ({
  dialog: { showMessageBox: async (_win: unknown, options: { message: string }) => { electron.messages.push(options.message); return { response: electron.answers.shift() ?? 1 }; } },
  ipcMain: new EventEmitter(),
}));
const { installCloseHandler } = await import('../src/close.js');
const { CHECKPOINT_FAILED, CLOSE_TIMEOUT_MS, NOT_RESPONDING } = await import('../src/protocol.js');

function fakeWindow(script: () => Promise<unknown>) {
  const state = { crashed: false };
  const contents = Object.assign(new EventEmitter(), {
    mainFrame: {}, isCrashed: () => state.crashed, isLoadingMainFrame: () => false, executeJavaScript: vi.fn(script),
  });
  const win = Object.assign(new EventEmitter(), { webContents: contents, isDestroyed: () => false });
  const onApproved = vi.fn();
  installCloseHandler(win as never, 'http://127.0.0.1:1', onApproved);
  contents.emit('did-finish-load');
  const close = () => { const event = { preventDefault: vi.fn() }; win.emit('close', event); return event; };
  return { contents, close, onApproved, state };
}
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  electron.answers.length = 0;
  electron.messages.length = 0;
});

describe('close handler after the not-responding dialog', () => {
  it('keeps the window open when Keep open is chosen and the hung renderer later answers ready:false', async () => {
    let answer!: (value: unknown) => void;
    const { close, onApproved } = fakeWindow(() => new Promise((resolve) => { answer = resolve; }));
    electron.answers.push(1);
    close();
    await vi.advanceTimersByTimeAsync(CLOSE_TIMEOUT_MS);
    expect(electron.messages).toEqual([NOT_RESPONDING]);
    answer(false);
    await flush();
    expect(onApproved).not.toHaveBeenCalled();
  });

  it('still closes on Force close', async () => {
    const { close, onApproved } = fakeWindow(() => new Promise(() => undefined));
    electron.answers.push(0);
    close();
    await vi.advanceTimersByTimeAsync(CLOSE_TIMEOUT_MS);
    expect(onApproved).toHaveBeenCalledTimes(1);
  });
});

describe('close handler when the checkpoint request rejects', () => {
  it('approves when the renderer died after the request was sent', async () => {
    let reject!: (error: Error) => void;
    const { close, onApproved, state } = fakeWindow(() => new Promise((_, fail) => { reject = fail; }));
    close();
    state.crashed = true;
    reject(new Error('Render frame was disposed before WebFrameMain could be accessed'));
    await flush();
    expect(onApproved).toHaveBeenCalledTimes(1);
  });

  it('keeps the window open and says so when the renderer is alive', async () => {
    const { close, onApproved } = fakeWindow(() => Promise.reject(new Error('Script failed to execute')));
    close();
    await flush();
    expect(onApproved).not.toHaveBeenCalled();
    expect(electron.messages).toEqual([CHECKPOINT_FAILED]);
  });
});
