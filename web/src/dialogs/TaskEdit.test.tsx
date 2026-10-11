// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { Task } from '../api/schemas';
import { makeTask } from '../test/fixtures';

const h = vi.hoisted(() => ({ save: vi.fn(), call: vi.fn() }));
vi.mock('../api/client', async original => ({ ...(await original<typeof import('../api/client')>()), call: h.call }));
vi.mock('../state/queries', () => ({ useSaveTask: () => ({ mutateAsync: h.save, isPending: false }) }));
vi.mock('../ui/Toast', async original => ({ ...(await original<typeof import('../ui/Toast')>()), toast: vi.fn() }));

import { S } from '../strings';
import { toast } from '../ui/Toast';
import { TaskEditForm } from './TaskEdit';

const stored = makeTask('t', {
  title: 'Original title', project: 'Research', priority: 'low', detail: 'Retain context', next_action: 'Read saved release order',
  due_at: '2026-11-20T17:22:33+00:00', not_before: '2026-10-01T11:23:45+00:00', planned_on: '2026-11-18', estimate_minutes: 25,
  dependencies: ['dep'], session_url: 'https://example.test/task', version: 4,
});
const tasks = [stored, makeTask('dep', { title: 'Fixture prerequisite' })];

function ui(task: Task, onDone = vi.fn(), onCancel = vi.fn()) {
  return <QueryClientProvider client={new QueryClient()}><TaskEditForm task={task} tasks={tasks} onDone={onDone} onCancel={onCancel} /></QueryClientProvider>;
}
const title = () => screen.getByLabelText('Title') as HTMLInputElement;
const alertText = () => screen.getByRole('alert').textContent;

beforeEach(() => { h.save.mockReset().mockResolvedValue(stored); h.call.mockReset(); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('TaskEditForm', () => {
  it('opens with Details collapsed and the title focused', () => {
    render(ui(stored));
    expect((document.querySelector('#task-details') as HTMLDetailsElement).open).toBe(false);
    expect(document.activeElement).toBe(title());
  });

  it('saves every field with the version it opened with and keeps untouched timestamps exactly', async () => {
    const onDone = vi.fn();
    render(ui(stored, onDone));
    fireEvent.change(title(), { target: { value: 'Manual correction, not an inference' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(h.save).toHaveBeenCalledWith({ id: 't', body: {
      title: 'Manual correction, not an inference', project: 'Research', detail: 'Retain context', next_action: 'Read saved release order',
      status: 'todo', priority: 'low', due_at: '2026-11-20T17:22:33+00:00', not_before: '2026-10-01T11:23:45+00:00', planned_on: '2026-11-18',
      estimate_minutes: 25, dependencies: ['dep'], session_url: 'https://example.test/task', expected_version: 4,
    } });
    expect(toast).toHaveBeenCalledWith(S.taskSaved);
  });

  it('a refetch with newer server data never replaces in-progress input or the opened version', async () => {
    const { rerender } = render(ui(stored));
    fireEvent.change(title(), { target: { value: 'Half-typed' } });
    rerender(ui({ ...stored, title: 'Changed elsewhere', version: 5 }));
    expect(title().value).toBe('Half-typed');
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(h.save).toHaveBeenCalledOnce());
    expect(h.save.mock.calls[0][0].body.expected_version).toBe(4);
  });

  it('a 409 shows the conflict, never retries, and Reopen loads the current version', async () => {
    h.save.mockRejectedValueOnce(new ApiError('http', 'This task changed. Reopen it before saving.', 409));
    h.call.mockResolvedValueOnce({ ...stored, title: 'Changed elsewhere', version: 5 });
    render(ui(stored));
    fireEvent.change(title(), { target: { value: 'My edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(alertText()).toBe('This task changed. Reopen it before saving.'));
    expect(h.save).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(title().value).toBe('Changed elsewhere'));
    expect(h.call).toHaveBeenCalledWith('task', expect.anything(), { params: { id: 't' } });
    expect(screen.queryByRole('button', { name: 'Reopen' })).toBeNull();
    expect(alertText()).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(2));
    expect(h.save.mock.calls[1][0].body).toMatchObject({ title: 'Changed elsewhere', expected_version: 5 });
  });

  it('other errors stay inline without Reopen', async () => {
    h.save.mockRejectedValueOnce(new ApiError('http', 'A task cannot depend on itself', 400));
    render(ui(stored));
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(alertText()).toBe('A task cannot depend on itself'));
    expect(screen.queryByRole('button', { name: 'Reopen' })).toBeNull();
  });

  it('a failed Reopen keeps the form and says why', async () => {
    h.save.mockRejectedValueOnce(new ApiError('http', 'This task changed. Reopen it before saving.', 409));
    h.call.mockRejectedValueOnce(new ApiError('network', 'Server unreachable. Your saved captures remain queued on this device.', null));
    render(ui(stored));
    fireEvent.change(title(), { target: { value: 'My edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(alertText()).toBe('Server unreachable. Your saved captures remain queued on this device.'));
    expect(title().value).toBe('My edit');
  });

  it('Cancel leaves without saving', () => {
    const onCancel = vi.fn();
    render(ui(stored, vi.fn(), onCancel));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(h.save).not.toHaveBeenCalled();
  });
});
