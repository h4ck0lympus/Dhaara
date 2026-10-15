// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Snapshot } from '../api/schemas';
import { makeSnapshot, makeTask } from '../test/fixtures';

vi.mock('@tanstack/react-router', async () => {
  const React = await import('react');
  let update: (v: string) => void;
  return { useSearch: () => { const [view, setView] = React.useState('open'); update = setView; return { view }; }, useNavigate: () => ({ search }: { search: { view: string } }) => update(search.view) };
});

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
const rowTitles = () => [...document.querySelectorAll('.task-row .task-title > span')].map(el => el.textContent);

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('PlanScreen', () => {
  const low = makeTask('low', { title: 'Low work', effective_priority: 'low' });
  const high = makeTask('high', { title: 'High work', effective_priority: 'high' });
  const parked = makeTask('parked', { title: 'Parked idea', status: 'parked' });
  const done = makeTask('done', { title: 'Finished', status: 'done' });
  const snapshot = makeSnapshot({ tasks: [low, parked, done, high], attention: [high], available: [low] });

  it('keeps the variant B heading and offers Add task', () => {
    given(snapshot);
    expect(screen.getByRole('heading', { level: 1, name: 'Tasks' })).toBeTruthy();
    expect(screen.getByText('Keep the next step in view.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'task-capture' });
  });

  it('defaults to Open, sorted high → low, without parked or done', () => {
    given(snapshot);
    expect(screen.getByRole('button', { name: 'Open' }).getAttribute('aria-pressed')).toBe('true');
    expect(rowTitles()).toEqual(['High work', 'Low work']);
  });

  it.each([
    ['Needs you', ['High work']], ['Available now', ['Low work']], ['Parked', ['Parked idea']],
    ['Completed', ['Finished']], ['All', ['High work', 'Parked idea', 'Finished', 'Low work']],
  ])('the %s view', (label, titles) => {
    given(snapshot);
    const views = screen.getByRole('group', { name: 'Task views' });
    fireEvent.click(within(views).getByRole('button', { name: label }));
    expect(within(views).getByRole('button', { name: label }).getAttribute('aria-pressed')).toBe('true');
    expect(rowTitles()).toEqual(titles);
  });

  it('says when a view is empty and offers to add for later', () => {
    given(makeSnapshot());
    expect(screen.getByText('No tasks in this view.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add something for later' }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'task-capture' });
  });

  it('marks a cached list as last known while disconnected', () => {
    given(snapshot, false);
    expect(screen.getByText('Last known · ' + age(snapshot.server_time))).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Server disconnected.');
  });

  it('renders with no snapshot yet', () => {
    given(undefined);
    expect(screen.getByText('No tasks in this view.')).toBeTruthy();
  });
});
