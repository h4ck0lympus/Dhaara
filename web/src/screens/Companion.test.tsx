// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRun, makeSnapshot, makeTask } from '../test/fixtures';

const h = vi.hoisted(() => ({
  connected: true, call: vi.fn(), patch: vi.fn(), snooze: vi.fn(), dictate: vi.fn(),
  mic: { phase: 'idle', seconds: 0, levels: [0], error: null as string | null, start: vi.fn(), stop: vi.fn(), reset: vi.fn(), audio: vi.fn() },
}));
vi.mock('../api/client', () => ({ call: h.call }));
vi.mock('../domain/connection', () => ({ useConnected: () => h.connected }));
vi.mock('../state/queries', () => ({
  useSnapshot: vi.fn(), usePatchTask: () => ({ mutateAsync: h.patch, isPending: false }),
  useSnoozeReminder: () => ({ mutateAsync: h.snooze }), dictate: h.dictate,
}));
vi.mock('../capture/dictation', async importOriginal => ({ ...(await importOriginal<typeof import('../capture/dictation')>()), useDictation: () => h.mic }));
import { MUTE_KEY } from '../shell/notifications';
import { useSnapshot } from '../state/queries';
import { COMPANION_TEXT, CompanionScreen, splitTodo } from './Companion';

const bridge = { resize: vi.fn(), setVisible: vi.fn(), openApp: vi.fn() };
const today = new Date(); today.setHours(23, 0, 0, 0);
const asking = makeTask('ask', { title: 'Which boards first?', project: 'job-watcher', attention_reason: 'An agent needs your input.' });
const nudge = makeTask('nudge', { title: 'Send lease scan', reminders: [{ id: 'r1', task_id: 'nudge', at: '', state: 'due', created_at: '' }], attention_reason: 'You asked to revisit this.' });
const due = makeTask('due', { title: 'Finish slides', due_at: today.toISOString(), effective_priority: 'high' });

function given(changes = {}, settings = {}) {
  const snapshot = makeSnapshot({ tasks: [asking, nudge, due], attention: [asking, nudge], runs: [makeRun({ effective_status: 'working' })], ...changes });
  vi.mocked(useSnapshot).mockReturnValue({ data: { ...snapshot, settings: { ...snapshot.settings, ...settings } } } as ReturnType<typeof useSnapshot>);
  return render(<CompanionScreen />);
}
const kitty = () => screen.getByRole('button', { name: /^Dhara companion:/ });

beforeEach(() => {
  h.connected = true;
  Object.assign(h.mic, { phase: 'idle', error: null });
  window.dharaCompanion = bridge;
  h.call.mockReset().mockResolvedValue({});
  h.patch.mockReset().mockResolvedValue({});
  h.snooze.mockReset().mockResolvedValue({ ok: true });
  localStorage.clear();
});
afterEach(() => { cleanup(); vi.clearAllMocks(); delete window.dharaCompanion; });

describe('splitTodo', () => {
  it.each([['todo: call bank', 'task', 'call bank'], ['TODO - renew passport', 'task', 'renew passport'], ['  todo buy milk', 'task', 'buy milk'],
    ['todos are fun', 'note', 'todos are fun'], ['heap idea', 'note', 'heap idea']] as const)('%j → %s', (raw, kind, text) => {
    expect(splitTodo(raw)).toEqual({ kind, text });
  });
});

describe('CompanionScreen', () => {
  it('shows the kitty with a summary and opens or closes the panel, resizing the window', () => {
    given();
    expect(kitty().getAttribute('aria-label')).toBe('Dhara companion: 1 need you · 1 reminder due · 1 working');
    expect(screen.getByRole('img', { name: /^Kitty/ }).getAttribute('aria-label')).toBe('Kitty alert: 1 need you');
    expect(bridge.resize).toHaveBeenLastCalledWith(false);
    fireEvent.click(kitty());
    expect(screen.getByRole('region', { name: 'Dhara mini panel' })).toBeTruthy();
    expect(bridge.resize).toHaveBeenLastCalledWith(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Dhara mini panel' })).toBeNull();
    expect(bridge.resize).toHaveBeenLastCalledWith(false);
  });

  it('lists what needs you, reminders and today, and opens tasks in the main window', async () => {
    given();
    fireEvent.click(kitty());
    const panel = screen.getByRole('region', { name: 'Dhara mini panel' });
    expect(panel.textContent).toContain('Which boards first?');
    expect(panel.textContent).toContain('job-watcher · An agent needs your input.');
    fireEvent.click(within(panel).getAllByRole('button', { name: 'Open' })[0]);
    expect(bridge.openApp).toHaveBeenCalledWith('/task/ask');
    expect(panel.textContent).toContain('Reminder · Send lease scan');
    fireEvent.click(within(panel).getByRole('button', { name: '+20 min' }));
    expect(h.snooze).toHaveBeenCalledWith({ id: 'r1' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Complete Finish slides' }));
    expect(h.patch).toHaveBeenCalledWith({ id: 'due', changes: { status: 'done' } });
    await waitFor(() => expect(panel.textContent).toContain('Task completed.'));
    fireEvent.click(within(panel).getByRole('button', { name: 'Open Dhara' }));
    expect(bridge.openApp).toHaveBeenLastCalledWith('/overview');
    fireEvent.click(within(panel).getByRole('button', { name: 'Companion settings' }));
    expect(bridge.openApp).toHaveBeenLastCalledWith('/settings');
  });

  it('saves a note, or a task with the todo prefix', async () => {
    given();
    fireEvent.click(kitty());
    const input = screen.getByLabelText('Capture a thought');
    fireEvent.change(input, { target: { value: 'GCD checksum is a sum' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(COMPANION_TEXT.savedNote));
    const [key, , options] = h.call.mock.calls[0];
    expect(key).toBe('capture');
    expect(JSON.parse((options.body as FormData).get('payload') as string)).toMatchObject({ raw: 'GCD checksum is a sum', organize: true });
    expect((input as HTMLInputElement).value).toBe('');
    fireEvent.change(input, { target: { value: 'todo: renew passport' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(COMPANION_TEXT.savedTask));
    expect(h.call.mock.calls[1][0]).toBe('taskCapture');
    expect(h.call.mock.calls[1][2].body).toMatchObject({ raw: 'renew passport' });
    h.call.mockRejectedValueOnce(new Error('Server unreachable.'));
    fireEvent.change(input, { target: { value: 'kept on failure' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Server unreachable.'));
    expect((input as HTMLInputElement).value).toBe('kept on failure');
  });

  it('records with the mic, then dictates into the box or saves a voice note', async () => {
    const view = given({ capabilities: { ...makeSnapshot().capabilities, dictation: true } });
    fireEvent.click(kitty());
    fireEvent.click(screen.getByRole('button', { name: 'Record voice' }));
    expect(h.mic.start).toHaveBeenCalled();
    h.mic.phase = 'recorded'; h.mic.seconds = 7;
    h.mic.audio.mockReturnValue(new Uint8Array([82, 73, 70, 70]));
    h.dictate.mockResolvedValue({ text: 'buy milk', source: 'openrouter' });
    view.rerender(<CompanionScreen />);
    expect(screen.getByRole('group', { name: 'Use the recording' }).textContent).toContain('Recorded 0:07');
    fireEvent.click(screen.getByRole('button', { name: 'Use as text' }));
    await waitFor(() => expect(h.mic.reset).toHaveBeenCalled());
    expect(h.dictate).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save voice note' }));
    await waitFor(() => expect(h.call).toHaveBeenCalledWith('capture', expect.anything(), expect.anything()));
    const form = h.call.mock.calls.at(-1)![2].body as FormData;
    expect((form.get('attachments') as File).type).toBe('audio/wav');
  });

  it('greys out dictation when no speech service is available', () => {
    given();
    h.mic.phase = 'recorded';
    fireEvent.click(kitty());
    const use = screen.getByRole('button', { name: 'Use as text' }) as HTMLButtonElement;
    expect(use.disabled).toBe(true);
    expect(use.title).toBe(COMPANION_TEXT.noDictation);
  });

  it('quiet for 30 minutes calms the kitty and survives a reload', () => {
    given();
    fireEvent.click(kitty());
    fireEvent.click(screen.getByRole('button', { name: 'Quiet 30 min' }));
    expect(Number(localStorage.getItem(MUTE_KEY))).toBeGreaterThan(Date.now() + 29 * 60_000);
    expect(screen.getByRole('img', { name: /^Kitty/ }).getAttribute('aria-label')).toBe('Kitty asleep: nothing needs you');
    expect(kitty().getAttribute('aria-label')).toContain('Quiet ·');
    fireEvent.click(screen.getByRole('button', { name: 'Resume alerts' }));
    expect(screen.getByRole('img', { name: /^Kitty/ }).getAttribute('aria-label')).toBe('Kitty alert: 1 need you');
  });

  it('hidden mode shows nothing and hides the window; dot mode shows a dot', () => {
    const view = given({}, { companion: 'hidden' });
    expect(view.container.innerHTML).toBe('');
    expect(bridge.setVisible).toHaveBeenLastCalledWith(false);
    cleanup();
    given({}, { companion: 'dot' });
    expect(bridge.setVisible).toHaveBeenLastCalledWith(true);
    expect(document.querySelector('.companion-dot.needs-you')).not.toBeNull();
  });

  it('dims while offline and opens tasks in a new tab without the Electron bridge', () => {
    h.connected = false;
    delete window.dharaCompanion;
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    given();
    expect(screen.getByRole('img', { name: /^Kitty/ }).getAttribute('aria-label')).toBe('Kitty dimmed: Dhara is offline');
    fireEvent.click(kitty());
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Open Dhara' })); });
    expect(open).toHaveBeenCalledWith('/#/overview', '_blank', 'noopener');
  });
});
