// web/src/screens/Now.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Focus, Snapshot } from '../api/schemas';
import { makeRun, makeSnapshot, makeTask } from '../test/fixtures';

const h = vi.hoisted(() => ({ navigate: vi.fn(), setFocus: vi.fn(), setBudget: vi.fn(), refetch: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => h.navigate }));
vi.mock('../state/queries', () => ({ useSnapshot: vi.fn(), useTimeBudget: vi.fn(), useSetFocus: vi.fn(), usePatchTask: vi.fn() }));
vi.mock('../domain/connection', () => ({ useConnected: vi.fn() }));
vi.mock('../local/drafts', () => ({ useCaptureDraft: () => ({ saveState: 'saved' }) }));
vi.mock('../shell/dialogs', () => ({ openDialog: vi.fn() }));
vi.mock('../ui/Toast', () => ({ toast: vi.fn(), toastError: vi.fn() }));

import { useConnected } from '../domain/connection';
import { openDialog } from '../shell/dialogs';
import { usePatchTask, useSetFocus, useSnapshot, useTimeBudget } from '../state/queries';
import { NowScreen } from './Now';

const focus = (task_id: string, pinned: boolean, source = 'manual'): NonNullable<Focus> => ({ task_id, pinned, source, updated_at: '2026-10-08T11:00:00+00:00' });

function given(snapshot: Snapshot, { connected = true, budget = null as number | null } = {}) {
  vi.mocked(useSnapshot).mockReturnValue({ data: snapshot, refetch: h.refetch } as unknown as ReturnType<typeof useSnapshot>);
  vi.mocked(useConnected).mockReturnValue(connected);
  vi.mocked(useTimeBudget).mockReturnValue([budget, h.setBudget]);
  vi.mocked(useSetFocus).mockReturnValue({ mutateAsync: h.setFocus } as unknown as ReturnType<typeof useSetFocus>);
  vi.mocked(usePatchTask).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<typeof usePatchTask>);
  render(<NowScreen />);
}
const mode = () => document.querySelector('.now-page')!.getAttribute('data-now-state');

beforeEach(() => h.setFocus.mockResolvedValue(null));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });

describe('NowScreen', () => {
  it('greets with the display name and keeps the tagline', () => {
    given(makeSnapshot({ settings: { ...makeSnapshot().settings, display_name: 'Vishal' } }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good (morning|afternoon|evening), Vishal\.$/);
    expect(screen.getByText('Same chaos. A calmer you.')).toBeTruthy();
  });

  it('a new workspace offers Capture and Add task, and no agent setup', () => {
    given(makeSnapshot());
    expect(mode()).toBe('new');
    expect(screen.getByRole('heading', { name: 'Nothing tracked yet' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Capture a thought' }));
    expect(h.navigate).toHaveBeenCalledWith({ to: '/capture' });
    fireEvent.click(screen.getByRole('button', { name: 'Add a task' }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'task-capture' });
    expect(screen.queryByRole('button', { name: 'Set up agent reporting' })).toBeNull();
  });

  it('"Nothing actionable right now" is a valid result', () => {
    given(makeSnapshot({ tasks: [makeTask('p', { status: 'parked' })] }));
    expect(screen.getByRole('heading', { name: 'Nothing actionable right now' })).toBeTruthy();
  });

  it('one primary recommendation with a plain reason; Start pins it; alternatives stay collapsed', async () => {
    const a = makeTask('a', { title: 'Continue the two-pointer exercise', next_action: 'Check duplicate values.' });
    const b = makeTask('b', { title: 'Read the ownership chapter' });
    given(makeSnapshot({ tasks: [a, b], available: [a, b] }));
    expect(mode()).toBe('available');
    const recommendation = screen.getByRole('region', { name: 'Next action' });
    expect(recommendation.querySelectorAll('h2')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: a.title })).toBeTruthy();
    expect(screen.getByText('Check duplicate values.')).toBeTruthy();
    expect(screen.queryByText(/your estimate/)).toBeNull();
    const alternatives = recommendation.querySelector('details')!;
    expect(alternatives.open).toBe(false);
    expect(alternatives.querySelector('summary')!.textContent).toBe('1 other actionable task');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(h.setFocus).toHaveBeenCalledWith({ taskId: 'a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'task', id: 'a' });
  });

  it('shows an estimate only when one was saved', () => {
    const a = makeTask('a', { estimate_minutes: 25 });
    given(makeSnapshot({ tasks: [a], available: [a] }));
    expect(screen.getByText('25 min · your estimate')).toBeTruthy();
  });

  it('a pin is never replaced from Overview; clearing it asks first', async () => {
    const pin = makeTask('pin', { title: 'Study allocator cleanup', project: 'Research' });
    const other = makeTask('other', { title: 'Other work' });
    given(makeSnapshot({ tasks: [pin, other], available: [other], focus: focus('pin', true) }));
    expect(screen.getByText('Pinned by you · Research').getAttribute('data-focus-kind')).toBe('pinned');
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'View next action' }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'task', id: 'other' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: 'Unpin & clear' }));
    expect(h.setFocus).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Unpin & clear' }));
    await waitFor(() => expect(h.setFocus).toHaveBeenCalledWith({ taskId: null }));
    expect(confirm).toHaveBeenCalledWith('Unpin and clear your current focus?');
  });

  it('labels inferred and selected focus differently; Resume continues the focus', () => {
    const t = makeTask('t', { title: 'Inferred', project: '' });
    given(makeSnapshot({ tasks: [t], focus: focus('t', false, 'context') }));
    expect(screen.getByText('Inferred from window metadata').getAttribute('data-focus-kind')).toBe('inferred');
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'task', id: 't' });
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(h.setFocus).toHaveBeenCalledWith({ taskId: null });
  });

  it('attention outranks available work and the rest appear once under Needs you', () => {
    const q = makeTask('q', { title: 'Answer the question', attention_reason: 'An agent needs your input.' });
    const r = makeTask('r', { title: 'Review the result', attention_reason: 'A result is ready for your review.' });
    const a = makeTask('a', { title: 'Available work' });
    given(makeSnapshot({ tasks: [q, r, a], attention: [q, r], available: [a] }));
    expect(mode()).toBe('attention');
    expect(screen.getByText('Needs you · 2')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open for review' })).toBeTruthy();
    const needsYou = screen.getByRole('region', { name: 'Needs you' });
    expect(needsYou.textContent).toContain('Review the result');
    expect(needsYou.textContent).toContain('A result is ready for your review.');
    expect(needsYou.textContent).not.toContain('Answer the question');
    expect(screen.getByRole('region', { name: 'Next action' }).querySelector('details summary')!.textContent).toBe('1 other actionable task');
  });

  it('disconnected: last-known provenance, no time filter, Retry connection, integration unavailable', () => {
    const t = makeTask('t', { title: 'Cached', project: 'Research' });
    given(makeSnapshot({ tasks: [t], available: [t], focus: focus('t', false) }), { connected: false });
    expect(mode()).toBe('disconnected');
    expect(screen.getByText('Last known · Selected by you · Research')).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Available time' })).toBeNull();
    expect(screen.queryByText(/other actionable task/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
    expect(h.refetch).toHaveBeenCalled();
    const reports = document.querySelector('details.agent-status') as HTMLDetailsElement;
    expect(reports.open).toBe(true);
    expect(document.querySelector('#integration-status')!.textContent).toContain('server disconnected');
  });

  it('the time filter uses only saved estimates', () => {
    const t = makeTask('t');
    given(makeSnapshot({ tasks: [t], available: [t] }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Available time' }), { target: { value: '15' } });
    expect(h.setBudget).toHaveBeenCalledWith(15);
    fireEvent.change(screen.getByRole('combobox', { name: 'Available time' }), { target: { value: '' } });
    expect(h.setBudget).toHaveBeenLastCalledWith(null);
  });

  it('waiting work explains why, and agent reports never claim running for a stale run', () => {
    const dep = makeTask('dep', { title: 'Trace ownership', status: 'waiting' });
    const blocked = makeTask('blocked', { title: 'Test the revised cleanup', blocked_by: ['dep'] });
    const stale = makeRun({ task_id: 'dep', agent: 'Fixture command wrapper', status: 'working', effective_status: 'unknown', stale: true });
    given(makeSnapshot({ tasks: [dep, blocked], runs: [stale] }));
    expect(document.querySelector('details.waiting-work')!.textContent).toContain('Waiting on: Trace ownership');
    const reports = document.querySelector('details.agent-status')!;
    expect(reports.textContent).toContain('Fixture command wrapper · Status unknown');
    expect(reports.textContent).not.toContain('Reported running');
  });

  it('agent setup opens the agents section of Settings', () => {
    const t = makeTask('t');
    given(makeSnapshot({ tasks: [t], available: [t] }));
    fireEvent.click(screen.getByRole('button', { name: 'Set up agent reporting' }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'settings', section: 'agents' });
  });
});
