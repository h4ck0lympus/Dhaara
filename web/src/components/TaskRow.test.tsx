// web/src/components/TaskRow.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRun, makeTask } from '../test/fixtures';

vi.mock('../state/queries', () => ({ usePatchTask: vi.fn() }));
vi.mock('../shell/dialogs', () => ({ openDialog: vi.fn() }));
vi.mock('../ui/Toast', () => ({ toast: vi.fn(), toastError: vi.fn() }));

import { openDialog } from '../shell/dialogs';
import { usePatchTask } from '../state/queries';
import { S } from '../strings';
import { toast, toastError } from '../ui/Toast';
import { PriorityControl } from './PriorityControl';
import { TaskRow } from './TaskRow';

const mutateAsync = vi.fn();
beforeEach(() => {
  mutateAsync.mockReset().mockResolvedValue({});
  vi.mocked(usePatchTask).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<typeof usePatchTask>);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('PriorityControl', () => {
  it.each([
    [{ priority: 'auto', effective_priority: 'medium', priority_source: 'automatic' }, 'medium · Auto · rules'],
    [{ priority: 'auto', effective_priority: 'high', priority_source: 'ai' }, 'high · Auto · AI'],
    [{ priority: 'high', effective_priority: 'high', priority_source: 'you' }, 'high · Set by you'],
    [{ priority: 'auto', effective_priority: 'low', priority_source: 'learned-v3' }, 'low · Auto'],
  ] as const)('shows the effective priority and its source label (%j)', (changes, label) => {
    render(<PriorityControl task={makeTask('t', { title: 'Read', ...changes })} />);
    const select = screen.getByRole('combobox', { name: 'Priority for Read' }) as HTMLSelectElement;
    expect(select.selectedOptions[0].textContent).toBe(label);
  });

  it('exposes the reason as the description shown on hover/focus', () => {
    render(<PriorityControl task={makeTask('t', { title: 'Read', priority_reason: 'This task is blocking another commitment.' })} />);
    expect(screen.getByRole('combobox', { name: 'Priority for Read' }).getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByRole('tooltip').textContent).toBe('This task is blocking another commitment.');
  });

  it('edits in place through the fresh-version patch and confirms', async () => {
    render(<PriorityControl task={makeTask('t', { title: 'Read' })} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Priority for Read' }), { target: { value: 'high' } });
    await waitFor(() => expect(toast).toHaveBeenCalledWith(S.priorityUpdated));
    expect(mutateAsync).toHaveBeenCalledWith({ id: 't', changes: { priority: 'high' } });
  });

  it('reports a failed change as an error and never retries', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('Task changed elsewhere'));
    render(<PriorityControl task={makeTask('t', { title: 'Read' })} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Priority for Read' }), { target: { value: 'low' } });
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledOnce();
  });
});

describe('TaskRow', () => {
  it('shows title, project and state in one compact row', () => {
    render(<TaskRow task={makeTask('t', { title: 'Read the chapter', project: 'Learning', status: 'todo' })} />);
    expect(screen.getByRole('button', { name: /^Read the chapter/ }).textContent).toContain('Learning · To do');
  });

  it('opens task detail from the title', () => {
    render(<TaskRow task={makeTask('t', { title: 'Read the chapter' })} />);
    fireEvent.click(screen.getByRole('button', { name: /^Read the chapter/ }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'task', id: 't' });
  });

  it('completes and reopens with the fresh-version patch', async () => {
    const { rerender } = render(<TaskRow task={makeTask('t', { title: 'Read' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Complete Read' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(S.taskCompleted));
    expect(mutateAsync).toHaveBeenCalledWith({ id: 't', changes: { status: 'done' } });
    rerender(<TaskRow task={makeTask('t', { title: 'Read', status: 'done' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reopen Read' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(S.taskReopened));
    expect(mutateAsync).toHaveBeenLastCalledWith({ id: 't', changes: { status: 'todo' } });
  });

  it('review work leads to the result link, not a checkbox', () => {
    const run = makeRun({ status: 'review', effective_status: 'review', stale: false, session_url: 'https://agent.test/result' });
    render(<TaskRow task={makeTask('t', { title: 'Review fix', runs: [run] })} />);
    const link = screen.getByRole('link', { name: 'Review result ↗' });
    expect(link.getAttribute('href')).toBe('https://agent.test/result');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.queryByRole('button', { name: 'Complete Review fix' })).toBeNull();
  });

  it('review work without a safe link opens the detail instead', () => {
    render(<TaskRow task={makeTask('t', { title: 'Review fix', status: 'review', session_url: 'javascript:alert(1)' })} />);
    expect(screen.queryByRole('link')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Review result' }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'task', id: 't' });
  });

  it('renders HTML in a title as text', () => {
    const { container } = render(<TaskRow task={makeTask('t', { title: '<img src=x onerror=alert(1)>' })} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
  });
});
