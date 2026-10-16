// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Snapshot } from '../api/schemas';
import { makeRun, makeSnapshot, makeTask } from '../test/fixtures';

vi.mock('../state/queries', () => ({ useSnapshot: vi.fn(), usePatchTask: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })), useReorderTasks: vi.fn(() => ({ mutate: vi.fn() })) }));
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
const titles = (el: HTMLElement) => [...el.querySelectorAll('.task-title, .later-row')].map(n => n.textContent);
const earlier = new Date(Date.now() - 2 * 86_400_000).toISOString();

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Tasks page', () => {
  const asking = makeTask('ask', { title: 'Which boards first?', effective_priority: 'high', runs: [makeRun({ effective_status: 'needs_input', status: 'needs_input' })] });
  const low = makeTask('low', { title: 'Low work', effective_priority: 'low' });
  const high = makeTask('high', { title: 'High work', effective_priority: 'high', position: 0 });
  const mine = makeTask('mine', { title: 'Mine', effective_priority: 'medium', priority: 'medium', priority_source: 'you' });
  const parked = makeTask('parked', { title: 'Parked idea', status: 'parked' });
  const doneNow = makeTask('done', { title: 'Finished', status: 'done', updated_at: new Date().toISOString() });
  const doneBefore = makeTask('old', { title: 'Old', status: 'done', updated_at: earlier });
  const snapshot = makeSnapshot({ tasks: [low, asking, high, mine, parked, doneNow, doneBefore], attention: [asking] });

  it('shows the heading and offers New task', () => {
    given(snapshot);
    expect(screen.getByRole('heading', { level: 1, name: 'Tasks' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /New task/ }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'task-capture' });
  });

  it('groups open work by priority, manual order first, including tasks that need you', () => {
    given(snapshot);
    expect(titles(group('High priority'))).toEqual(['High work', 'Which boards first?']);
    expect(titles(group('Medium priority'))).toEqual(['Mine']);
    expect(titles(group('Low priority'))).toEqual(['Low work']);
    expect(screen.queryByRole('region', { name: 'Needs you' })).toBeNull();
  });

  it('gives each row a drag handle and marks priorities you set', () => {
    given(snapshot);
    expect(screen.getByRole('button', { name: 'Move High work' })).toBeTruthy();
    expect(group('Medium priority').textContent).toContain('set by you');
    expect(group('High priority').textContent).not.toContain('set by you');
  });

  it('shows an empty group as a drop target', () => {
    given(makeSnapshot({ tasks: [high] }));
    expect(group('Low priority').textContent).toContain('Drag a task here to make it low priority.');
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

  it('is calm when empty', () => {
    given(makeSnapshot());
    expect(screen.getByText('Nothing to do right now.')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'High priority' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Done today/ })).toBeNull();
  });

  it('while disconnected marks the list last known', () => {
    given(snapshot, false);
    expect(screen.getByText('Last known · ' + age(snapshot.server_time))).toBeTruthy();
    expect(screen.getByText(/^Server disconnected\./)).toBeTruthy();
  });

  it('renders with no snapshot yet', () => {
    given(undefined);
    expect(screen.getByText('Nothing to do right now.')).toBeTruthy();
  });
});
