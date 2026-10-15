// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Snapshot } from '../api/schemas';
import { makeRun, makeSnapshot, makeTask } from '../test/fixtures';

vi.mock('../state/queries', () => ({ useSnapshot: vi.fn(), usePatchTask: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })) }));
vi.mock('../domain/connection', () => ({ useConnected: vi.fn() }));
vi.mock('../local/drafts', () => ({ useCaptureDraft: () => ({ saveState: 'saved' }) }));
vi.mock('../shell/dialogs', () => ({ openDialog: vi.fn() }));
vi.mock('../ui/Toast', () => ({ toast: vi.fn(), toastError: vi.fn() }));

import { useConnected } from '../domain/connection';
import { age } from '../domain/format';
import { openDialog } from '../shell/dialogs';
import { useSnapshot } from '../state/queries';
import { PlanScreen } from './Plan';

function given(snapshot: Snapshot | undefined, connected = true) {
  vi.mocked(useSnapshot).mockReturnValue({ data: snapshot } as unknown as ReturnType<typeof useSnapshot>);
  vi.mocked(useConnected).mockReturnValue(connected);
  render(<PlanScreen />);
}
const group = (name: string) => screen.getByRole('region', { name });
const titles = (el: HTMLElement) => [...el.querySelectorAll('.task-title, .attention-title > span, .later-row')].map(n => n.textContent);
const earlier = new Date(Date.now() - 2 * 86_400_000).toISOString();

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Tasks page', () => {
  const working = makeRun({ id: 'w', task_id: 'busy', agent: 'codex', effective_status: 'working', stale: false });
  const asking = makeTask('ask', { title: 'Which boards first?', project: 'job-watcher', attention_reason: 'Agent is awaiting your input', runs: [makeRun({ effective_status: 'needs_input', status: 'needs_input' })] });
  const review = makeTask('rev', { title: 'Review fix', status: 'review', attention_reason: 'A result is ready for your review.', session_url: 'https://agent.test/r' });
  const stale = makeTask('stale', { title: 'Quiet agent', runs: [makeRun({ effective_status: 'unknown', stale: true })], attention_reason: 'Agent status unknown' });
  const low = makeTask('low', { title: 'Low work', effective_priority: 'low' });
  const high = makeTask('high', { title: 'High work', effective_priority: 'high' });
  const busy = makeTask('busy', { title: 'Notes classifier', project: 'dhara', runs: [working] });
  const parked = makeTask('parked', { title: 'Parked idea', status: 'parked' });
  const doneNow = makeTask('done', { title: 'Finished', status: 'done', updated_at: new Date().toISOString() });
  const doneBefore = makeTask('old', { title: 'Old', status: 'done', updated_at: earlier });
  const snapshot = makeSnapshot({ tasks: [low, asking, review, stale, high, busy, parked, doneNow, doneBefore], attention: [asking, review, stale], runs: [working] });

  it('shows the heading with the date and offers New task', () => {
    given(snapshot);
    expect(screen.getByRole('heading', { level: 1, name: 'Tasks' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /New task/ }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'task-capture' });
  });

  it('Needs you lists attention with honest reasons and the right action', () => {
    given(snapshot);
    const needs = group('Needs you');
    expect(titles(needs)).toEqual(['Which boards first?', 'Review fix', 'Quiet agent']);
    expect(needs.textContent).toContain('job-watcher');
    expect(needs.textContent).toContain('Agent is awaiting your input');
    expect(needs.textContent).toContain('No recent updates · Check status');
    const link = within(needs).getByRole('link', { name: 'Review ↗' });
    expect(link.getAttribute('href')).toBe('https://agent.test/r');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    fireEvent.click(within(needs).getAllByRole('button', { name: 'Open' })[0]);
    expect(openDialog).toHaveBeenCalledWith({ kind: 'task', id: 'ask' });
  });

  it('collapses working agents behind a count and expands them', () => {
    given(snapshot);
    const toggle = screen.getByRole('button', { name: /1 agent working/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('list', { name: 'Agents working' })).toBeNull();
    fireEvent.click(toggle);
    const list = screen.getByRole('list', { name: 'Agents working' });
    expect(list.textContent).toContain('Notes classifier');
    expect(list.textContent).toContain('codex · ');
    fireEvent.click(within(list).getByRole('button', { name: 'Notes classifier' }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'task', id: 'busy' });
  });

  it('To do is open work by priority without attention, parked or done', () => {
    given(snapshot);
    expect(titles(group('To do'))).toEqual(['High work', 'Notes classifier', 'Low work']);
  });

  it('Later holds parked work and opens it', () => {
    given(snapshot);
    expect(titles(group('Later'))).toEqual(['Parked idea']);
    fireEvent.click(screen.getByRole('button', { name: 'Parked idea' }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'task', id: 'parked' });
  });

  it('Done today counts only today and expands to reopenable rows', () => {
    given(snapshot);
    fireEvent.click(screen.getByRole('button', { name: /Done today · 1/ }));
    expect(titles(group('Done today'))).toEqual(['Finished']);
    expect(screen.getByRole('button', { name: 'Reopen Finished' })).toBeTruthy();
  });

  it('pages a long To do list', () => {
    const many = Array.from({ length: 120 }, (_, i) => makeTask(`t${i}`, { title: `Task ${i}` }));
    given(makeSnapshot({ tasks: many }));
    expect(group('To do').querySelectorAll('.task-row')).toHaveLength(50);
    fireEvent.click(screen.getByRole('button', { name: 'Show more (70 remaining)' }));
    expect(group('To do').querySelectorAll('.task-row')).toHaveLength(100);
  });

  it('is calm when empty: no Needs you, Later or Done', () => {
    given(makeSnapshot());
    expect(screen.getByText('Nothing to do right now.')).toBeTruthy();
    for (const name of ['Needs you', 'Later']) expect(screen.queryByRole('region', { name })).toBeNull();
    expect(screen.queryByRole('button', { name: /Done today/ })).toBeNull();
  });

  it('while disconnected marks the list last known and hides live agent state', () => {
    given(snapshot, false);
    expect(screen.getByText('Last known · ' + age(snapshot.server_time))).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Server disconnected.');
    expect(screen.queryByRole('region', { name: 'Needs you' })).toBeNull();
    expect(titles(group('To do'))).toContain('Which boards first?');
  });

  it('renders with no snapshot yet', () => {
    given(undefined);
    expect(screen.getByText('Nothing to do right now.')).toBeTruthy();
  });
});
