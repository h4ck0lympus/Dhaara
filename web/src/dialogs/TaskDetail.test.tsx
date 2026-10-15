// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Focus, Snapshot } from '../api/schemas';
import { fromLocal } from '../domain/format';
import { makeNoteSummary, makeRun, makeSnapshot, makeTask } from '../test/fixtures';
import { polyfillDialog } from '../ui/testing';

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  call: vi.fn(),
  mutations: {} as Record<string, ReturnType<typeof vi.fn>>,
}));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => h.navigate }));
vi.mock('../api/client', async original => ({ ...(await original<typeof import('../api/client')>()), call: h.call }));
vi.mock('../state/queries', () => {
  const mutation = (name: string) => () => ({ mutateAsync: (h.mutations[name] ??= vi.fn(async () => ({}))), isPending: false });
  return {
    useSnapshot: vi.fn(), useSetFocus: mutation('focus'), usePatchTask: mutation('patch'), useEndTracking: mutation('end'),
    useCreateReminder: mutation('create'), useSnoozeReminder: mutation('snooze'), useDismissReminder: mutation('dismiss'), useSaveTask: mutation('save'),
  };
});
vi.mock('../local/drafts', () => ({ captureDraftStore: { setTaskId: vi.fn(async () => {}) } }));
vi.mock('../shell/notifications', () => ({ rearmReminder: vi.fn() }));
vi.mock('../ui/Toast', async original => ({ ...(await original<typeof import('../ui/Toast')>()), toast: vi.fn(), toastError: vi.fn() }));

import { captureDraftStore } from '../local/drafts';
import { rearmReminder } from '../shell/notifications';
import { useSnapshot } from '../state/queries';
import { S } from '../strings';
import { toast, toastError } from '../ui/Toast';
import { TaskDetailDialog } from './TaskDetail';

const focus = (task_id: string, pinned: boolean): NonNullable<Focus> => ({ task_id, pinned, source: 'manual', updated_at: '2026-10-08T11:00:00+00:00' });
function show(snapshot: Snapshot | undefined, id = 't') {
  vi.mocked(useSnapshot).mockReturnValue({ data: snapshot } as unknown as ReturnType<typeof useSnapshot>);
  const onClose = vi.fn();
  const view = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TaskDetailDialog id={id} onClose={onClose} /></QueryClientProvider>);
  return { onClose, ...view };
}
const m = (name: string) => h.mutations[name];

beforeAll(polyfillDialog);
beforeEach(() => { for (const key of Object.keys(h.mutations)) delete h.mutations[key]; });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });

describe('TaskDetailDialog', () => {
  it('shows the next action and source context before any activity log', () => {
    const run = makeRun({ agent: 'Fixture command wrapper', status: 'working', effective_status: 'working', stale: false, message: 'Running tests' });
    show(makeSnapshot({ tasks: [makeTask('t', {
      title: 'Review the fix', next_action: 'Check cleanup first.', detail: 'Original concern', original_input: 'review the fix tomorrow',
      interpretation: { explanation: 'Scheduling wording kept in the original.' }, runs: [run],
    })] }));
    const next = screen.getByRole('heading', { name: 'Continue here' });
    const runs = screen.getByRole('heading', { name: 'Agent runs' });
    expect(next.compareDocumentPosition(runs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Check cleanup first.')).toBeTruthy();
    expect(screen.getByText('Original concern')).toBeTruthy();
    expect(screen.getByText('At capture: Scheduling wording kept in the original.')).toBeTruthy();
    expect(screen.getByText('review the fix tomorrow')).toBeTruthy();
    expect(screen.getByText(/Fixture command wrapper · Reported running/)).toBeTruthy();
  });

  it('treats task text and links as untrusted', () => {
    const { container } = show(makeSnapshot({ tasks: [makeTask('t', {
      title: '<b>bold</b>', detail: '<script>alert(1)</script>', session_url: 'javascript:alert(1)',
    })] }));
    expect(screen.getByRole('dialog', { name: '<b>bold</b>' })).toBeTruthy();
    expect(container.ownerDocument.querySelector('dialog script, dialog b')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Open session ↗' })).toBeNull();
  });

  it('opens http(s) session links in a new tab without a referrer', () => {
    show(makeSnapshot({ tasks: [makeTask('t', { session_url: 'https://example.test/session' })] }));
    const link = screen.getByRole('link', { name: 'Open session ↗' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('shows dependencies, dates and the estimate only when known', () => {
    show(makeSnapshot({ tasks: [
      makeTask('t', { blocked_by: ['dep'], planned_on: '2026-10-09', estimate_minutes: 20 }),
      makeTask('dep', { title: 'Trace ownership' }),
    ] }));
    expect(screen.getByText('Waiting on: Trace ownership')).toBeTruthy();
    expect(screen.getByText('Planned day: 2026-10-09 · not a deadline or reminder.')).toBeTruthy();
    expect(screen.getByText('20 min · your estimate')).toBeTruthy();
    expect(screen.queryByText(/^Deadline:/)).toBeNull();
    expect(screen.queryByText(/^Available after:/)).toBeNull();
  });

  it('Focus on this asks before replacing a pin, then opens Overview', async () => {
    const { onClose } = show(makeSnapshot({ tasks: [makeTask('t'), makeTask('pin')], focus: focus('pin', true) }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: 'Focus on this' }));
    expect(m('focus')).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Focus on this' }));
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith({ to: '/overview' }));
    expect(m('focus')).toHaveBeenCalledWith({ taskId: 't' });
    expect(onClose).toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledWith('Replace your pinned focus with this task?');
  });

  it.each(['parked', 'done'] as const)('hides Focus on this for %s tasks', status => {
    show(makeSnapshot({ tasks: [makeTask('t', { status })] }));
    expect(screen.queryByRole('button', { name: 'Focus on this' })).toBeNull();
  });

  it('parks, unparks and completes through the fresh-version patch', async () => {
    const { rerender } = show(makeSnapshot({ tasks: [makeTask('t')] }));
    fireEvent.click(screen.getByRole('button', { name: 'Park' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Task parked.'));
    expect(m('patch')).toHaveBeenCalledWith({ id: 't', changes: { status: 'parked' } });
    vi.mocked(useSnapshot).mockReturnValue({ data: makeSnapshot({ tasks: [makeTask('t', { status: 'parked' })] }) } as unknown as ReturnType<typeof useSnapshot>);
    rerender(<QueryClientProvider client={new QueryClient()}><TaskDetailDialog id="t" onClose={vi.fn()} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Unpark' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Task unparked.'));
    expect(m('patch')).toHaveBeenLastCalledWith({ id: 't', changes: { status: 'todo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Complete' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(S.taskCompleted));
  });

  it('End tracking asks first and says it does not stop the agent', async () => {
    const working = makeRun({ id: 'run-1', status: 'working', effective_status: 'working', stale: false });
    const review = makeRun({ id: 'run-2', status: 'review', effective_status: 'review', stale: false });
    show(makeSnapshot({ tasks: [makeTask('t', { runs: [working, review] })] }));
    expect(screen.getAllByRole('button', { name: 'End tracking' })).toHaveLength(1);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: 'End tracking' }));
    expect(m('end')).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'End tracking' }));
    await waitFor(() => expect(m('end')).toHaveBeenCalledWith({ runId: 'run-1' }));
    expect(confirm).toHaveBeenCalledWith('End tracking this run? This does not stop or kill the external agent process.');
  });

  it('adds, snoozes (re-arming notifications) and dismisses reminders', async () => {
    const reminder = { id: 'r1', task_id: 't', at: '2026-10-08T11:00:00+00:00', state: 'due' as const, created_at: '2026-10-08T10:00:00+00:00' };
    show(makeSnapshot({ tasks: [makeTask('t', { reminders: [reminder] })] }));
    fireEvent.change(screen.getByLabelText('Reminder time'), { target: { value: '2026-10-11T09:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add reminder' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Reminder saved.'));
    expect(m('create')).toHaveBeenCalledWith({ taskId: 't', at: fromLocal('2026-10-11T09:30') });
    fireEvent.click(screen.getByRole('button', { name: '+20 min' }));
    await waitFor(() => expect(rearmReminder).toHaveBeenCalledWith('r1'));
    expect(m('snooze')).toHaveBeenCalledWith({ id: 'r1' });
    expect(toast).toHaveBeenCalledWith('Reminder moved forward by 20 minutes.');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(m('dismiss')).toHaveBeenCalledWith({ id: 'r1' }));
  });

  it('shows a rejected reminder inline', async () => {
    h.mutations.create = vi.fn(async () => { throw new Error('Include a timezone offset'); });
    show(makeSnapshot({ tasks: [makeTask('t')] }));
    fireEvent.change(screen.getByLabelText('Reminder time'), { target: { value: '2026-10-11T09:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add reminder' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Include a timezone offset'));
  });

  it('links notes and captures what you learned for this task', async () => {
    const { onClose } = show(makeSnapshot({ tasks: [makeTask('t')], notes: [makeNoteSummary('n1', { title: 'Two pointers', task_id: 't' })] }));
    fireEvent.click(screen.getByRole('button', { name: 'Two pointers ↗' }));
    expect(h.navigate).toHaveBeenCalledWith({ to: '/note/$id', params: { id: 'n1' } });
    fireEvent.click(screen.getByRole('button', { name: '＋ Capture what you learned' }));
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith({ to: '/capture' }));
    expect(captureDraftStore.setTaskId).toHaveBeenCalledWith('t');
    expect(onClose).toHaveBeenCalled();
  });

  it('a failing setTaskId shows the error toast, does not throw and keeps the dialog open', async () => {
    const failure = new Error('IndexedDB unavailable');
    vi.mocked(captureDraftStore.setTaskId).mockRejectedValueOnce(failure);
    const { onClose } = show(makeSnapshot({ tasks: [makeTask('t')] }));
    fireEvent.click(screen.getByRole('button', { name: '＋ Capture what you learned' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(failure));
    expect(onClose).not.toHaveBeenCalled();
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it('closing a dirty edit form asks first (Escape or backdrop reach the same request)', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { onClose } = show(makeSnapshot({ tasks: [makeTask('t')] }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Typed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(confirm).toHaveBeenCalledWith('Discard your unsaved edits?');
    expect(onClose).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });

  it('closing a clean edit form or the detail view never asks', () => {
    const confirm = vi.spyOn(window, 'confirm');
    const { onClose } = show(makeSnapshot({ tasks: [makeTask('t')] }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });

  it('fetches a task missing from the snapshot, and says when it is unavailable', async () => {
    h.call.mockResolvedValueOnce(makeTask('fresh', { title: 'Edit the acknowledged task' }));
    show(makeSnapshot(), 'fresh');
    expect(await screen.findByRole('dialog', { name: 'Edit the acknowledged task' })).toBeTruthy();
    expect(h.call).toHaveBeenCalledWith('task', expect.anything(), { params: { id: 'fresh' } });
    cleanup();
    h.call.mockRejectedValueOnce(new Error('Task not found'));
    show(makeSnapshot(), 'missing');
    expect(await screen.findByRole('dialog', { name: S.taskUnavailable })).toBeTruthy();
  });
});
