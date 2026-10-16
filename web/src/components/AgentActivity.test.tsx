// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeRun, makeTask } from '../test/fixtures';

vi.mock('../shell/dialogs', () => ({ openDialog: vi.fn() }));
import { openDialog } from '../shell/dialogs';
import { AgentActivity } from './AgentActivity';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('AgentActivity', () => {
  const asking = makeTask('ask', { title: 'Which boards first?', project: 'job-watcher', attention_reason: 'Agent is awaiting your input', runs: [makeRun({ effective_status: 'needs_input', status: 'needs_input' })] });
  const review = makeTask('rev', { title: 'Review fix', status: 'review', attention_reason: 'A result is ready for your review.', session_url: 'https://agent.test/r' });
  const stale = makeTask('stale', { title: 'Quiet agent', runs: [makeRun({ effective_status: 'unknown', stale: true })], attention_reason: 'Agent status unknown' });
  const busy = makeTask('busy', { title: 'Notes classifier', project: 'dhara' });
  const working = makeRun({ id: 'w', task_id: 'busy', agent: 'codex', effective_status: 'working' });

  it('lists what needs you with honest reasons and the right action', () => {
    render(<AgentActivity id="a" attention={[asking, review, stale]} working={[]} tasks={[asking, review, stale]} />);
    const needs = screen.getByRole('region', { name: 'Needs you' });
    expect(needs.textContent).toContain('job-watcher');
    expect(needs.textContent).toContain('Agent is awaiting your input');
    expect(needs.textContent).toContain('No recent updates · Check status');
    const link = within(needs).getByRole('link', { name: 'Review ↗' });
    expect(link.getAttribute('href')).toBe('https://agent.test/r');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    fireEvent.click(within(needs).getAllByRole('button', { name: 'Open' })[0]);
    expect(openDialog).toHaveBeenCalledWith({ kind: 'task', id: 'ask' });
    expect(screen.queryByRole('region', { name: 'Agents working' })).toBeNull();
  });

  it('lists working agents and opens their task', () => {
    render(<AgentActivity id="a" attention={[]} working={[working]} tasks={[busy]} />);
    const list = screen.getByRole('list', { name: 'Agents working' });
    expect(list.textContent).toContain('dhara');
    expect(list.textContent).toContain('codex · ');
    fireEvent.click(within(list).getByRole('button', { name: 'Notes classifier' }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'task', id: 'busy' });
    expect(screen.queryByRole('region', { name: 'Needs you' })).toBeNull();
  });
});
