// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRun, makeSnapshot, makeTask } from '../test/fixtures';
const h = vi.hoisted(() => ({ setFocus: vi.fn().mockResolvedValue({}), connected: true }));
vi.mock('@tanstack/react-router', () => ({ Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => <a href={to} {...rest}>{children}</a> }));
vi.mock('../state/queries', () => ({ useSnapshot: vi.fn(), useSetFocus: () => ({ mutateAsync: h.setFocus }), usePatchTask: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock('../domain/connection', () => ({ useConnected: () => h.connected }));
vi.mock('../shell/dialogs', () => ({ openDialog: vi.fn(), isDialogOpen: () => false }));
vi.mock('../shell/OfflineNotice', () => ({ OfflineNotice: () => null }));
vi.mock('../routes/guards', () => ({ allowNavigation: vi.fn(() => true) }));
vi.mock('./Capture', () => ({ CaptureScreen: () => <textarea id="capture-input" aria-label="Inline note" /> }));
import { allowNavigation } from '../routes/guards';
import { openDialog } from '../shell/dialogs';
import { CAPTURE_EVENT } from '../shell/keyboard';
import { useSnapshot } from '../state/queries';
import { NowScreen } from './Now';

beforeEach(() => { h.connected = true; vi.spyOn(window, 'confirm').mockReturnValue(true); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });
function given(snapshot = makeSnapshot()) {
  vi.mocked(useSnapshot).mockReturnValue({ data: snapshot } as ReturnType<typeof useSnapshot>);
  return render(<NowScreen />);
}
const focusAt = (task_id: string, pinned = false) => ({ task_id, pinned, source: 'user', updated_at: new Date().toISOString() });

describe('Home', () => {
  it('greets by name', () => {
    given(makeSnapshot({ settings: { ...makeSnapshot().settings, display_name: 'Vishal' } }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good (morning|afternoon|evening), Vishal\.$/);
  });

  it('summarises agents and expands to show what needs you and who is working', () => {
    const waiting = makeTask('a', { title: 'Answer agent' });
    const busy = makeTask('b', { title: 'Busy task' });
    const runs = [makeRun({ id: 'r1', task_id: 'b', effective_status: 'working' }), makeRun({ id: 'r2', task_id: 'b', effective_status: 'working' }), makeRun({ id: 'r3', effective_status: 'review' })];
    given(makeSnapshot({ tasks: [waiting, busy], attention: [waiting], runs }));
    const strip = screen.getByRole('button', { name: 'Agents: 1 need you, 2 working' });
    expect(strip.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('region', { name: 'Needs you' })).toBeNull();
    fireEvent.click(strip);
    expect(strip.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('region', { name: 'Needs you' }).textContent).toContain('Answer agent');
    expect(screen.getByRole('list', { name: 'Agents working' }).textContent).toContain('Busy task');
    fireEvent.click(strip);
    expect(screen.queryByRole('region', { name: 'Needs you' })).toBeNull();
  });

  it('hides the agent strip when nothing is happening, and while offline', () => {
    given();
    expect(screen.queryByRole('button', { name: /^Agents:/ })).toBeNull();
    cleanup();
    h.connected = false;
    const t = makeTask('a');
    given(makeSnapshot({ tasks: [t], attention: [t], runs: [makeRun({ effective_status: 'working' })] }));
    expect(screen.queryByRole('button', { name: /^Agents:/ })).toBeNull();
  });

  it('shows the focus with its source, opens it and clears a pinned focus after confirming', () => {
    const t = makeTask('f', { title: 'Garmin analysis', next_action: 'Compare parsers' });
    given(makeSnapshot({ tasks: [t], focus: focusAt('f', true) }));
    const card = screen.getByRole('region', { name: 'Current focus' });
    expect(card.textContent).toContain('Pinned by you');
    expect(card.textContent).toContain('Compare parsers');
    fireEvent.click(within(card).getByRole('button', { name: 'Garmin analysis' }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'task', id: 'f' });
    fireEvent.click(within(card).getByRole('button', { name: 'Unpin & clear' }));
    expect(window.confirm).toHaveBeenCalled();
    expect(h.setFocus).toHaveBeenCalledWith({ taskId: null });
  });

  it('labels a focus shown offline as last known', () => {
    h.connected = false;
    given(makeSnapshot({ tasks: [makeTask('f')], focus: focusAt('f') }));
    expect(screen.getByRole('region', { name: 'Current focus' }).textContent).toContain('Last known · Selected by you');
  });

  it('invites choosing a focus when there is none', () => {
    given();
    expect(screen.getByRole('region', { name: 'Current focus' }).textContent).toContain('Choose a task when you’re ready.');
    expect(screen.queryByRole('button', { name: /clear/i })).toBeNull();
  });

  it('caps "a few minutes" at three, skipping attention, focus and tasks already listed for today, and hides it offline', () => {
    const tasks = Array.from({ length: 12 }, (_, i) => makeTask(`t${i}`, { title: `Task ${i}`, created_at: new Date(2026, 0, 12 - i).toISOString() }));
    given(makeSnapshot({ tasks, available: tasks, attention: [tasks[0]], focus: focusAt('t1') }));
    const few = screen.getByRole('region', { name: 'If you have a few minutes' });
    expect(within(few).getAllByRole('button').map(b => b.textContent)).toEqual(['Task 2', 'Task 3', 'Task 4']);
    cleanup();
    h.connected = false;
    given(makeSnapshot({ tasks, available: tasks }));
    expect(screen.queryByRole('region', { name: 'If you have a few minutes' })).toBeNull();
  });

  it('lists every open task due or planned today, by priority, without future, undated, focus, done or parked work', () => {
    const today = (h: number) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.toISOString(); };
    const later = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    const tasks = [
      makeTask('a', { title: 'Due today', due_at: today(23) }), makeTask('b', { title: 'Overdue', due_at: yesterday }),
      makeTask('c', { title: 'Hot today', due_at: today(23), effective_priority: 'high' }), makeTask('d', { title: 'Planned', planned_on: new Date().toLocaleDateString('sv') }),
      makeTask('e', { title: 'Later', due_at: later }), makeTask('f', { title: 'Undated' }),
      makeTask('g', { title: 'Done', status: 'done', due_at: today(23) }), makeTask('h', { title: 'Parked', status: 'parked', due_at: today(23) }),
      makeTask('i', { title: 'Focus', due_at: today(23) }), makeTask('j', { title: 'Five', due_at: today(23) }), makeTask('k', { title: 'Six', due_at: today(23) }),
    ];
    given(makeSnapshot({ tasks, focus: focusAt('i') }));
    const list = screen.getByRole('region', { name: 'Today' });
    const titles = [...list.querySelectorAll('.task-title')].map(b => b.textContent);
    expect(titles[0]).toBe('Hot today');
    expect([...titles].sort()).toEqual(['Due today', 'Five', 'Hot today', 'Overdue', 'Planned', 'Six']);
    expect(within(list).getAllByRole('img')[0].getAttribute('aria-label')).toBe('High priority');
    expect(within(list).getByRole('link', { name: 'All tasks →' }).getAttribute('href')).toBe('/plan');
  });

  it('says when nothing is due today', () => {
    given(makeSnapshot({ tasks: [makeTask('f', { title: 'Undated' })] }));
    expect(screen.getByRole('region', { name: 'Today' }).textContent).toContain('Nothing due today.');
  });

  it('readable titles hide session hashes', () => {
    const task = makeTask('t', { title: 'Codex · g-p-6ac822bb03588191b51d07108e212526 · 7fab3c', planned_on: '2000-01-01' });
    given(makeSnapshot({ tasks: [task] }));
    expect(screen.getByRole('button', { name: 'Codex session' })).toBeTruthy();
  });
});

describe('Home capture bar', () => {
  it('opens in place, focuses the editor and closes with Escape or the scrim', () => {
    given();
    fireEvent.click(screen.getByRole('button', { name: /Capture a thought/ }));
    const editor = screen.getByLabelText('Inline note');
    expect(document.activeElement).toBe(editor);
    fireEvent.keyDown(editor, { key: 'Escape' });
    expect(screen.queryByLabelText('Inline note')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Capture a thought/ }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Close capture' })[0]);
    expect(screen.queryByLabelText('Inline note')).toBeNull();
  });

  it('stays open when a navigation guard refuses', () => {
    given();
    fireEvent.click(screen.getByRole('button', { name: /Capture a thought/ }));
    vi.mocked(allowNavigation).mockReturnValueOnce(false);
    fireEvent.keyDown(screen.getByLabelText('Inline note'), { key: 'Escape' });
    expect(screen.getByLabelText('Inline note')).toBeTruthy();
  });

  it('opens from the keyboard shortcut event', () => {
    given();
    act(() => { window.dispatchEvent(new CustomEvent(CAPTURE_EVENT)); });
    expect(screen.getByLabelText('Inline note')).toBeTruthy();
  });
});
