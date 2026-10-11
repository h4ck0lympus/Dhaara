// web/src/components/TaskFields.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromLocal } from '../domain/format';
import { makeTask } from '../test/fixtures';
import { TaskFields } from './TaskFields';

afterEach(cleanup);

const tasks = [
  makeTask('self', { title: 'This task', project: 'Research' }),
  makeTask('a', { title: 'Fixture prerequisite', project: 'Research' }),
  makeTask('b', { title: 'Other work', project: 'Applications' }),
];

function renderFields(value = {}, disabled = false) {
  const onChange = vi.fn();
  render(<TaskFields value={value} onChange={onChange} disabled={disabled} tasks={tasks} selfId="self" />);
  return onChange;
}

describe('TaskFields', () => {
  it('shows every optional field with the existing labels and defaults', () => {
    renderFields();
    for (const label of ['Workflow · optional', 'Priority', 'Continue here', 'Status', 'Estimated minutes · optional',
      'Planned day · optional', 'Deadline · optional', 'Available after · optional', 'Context', 'Session or document link · optional']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect((screen.getByLabelText('Priority') as HTMLSelectElement).value).toBe('auto');
    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('todo');
    expect((screen.getByLabelText('Workflow · optional') as HTMLInputElement).placeholder).toBe('Unassigned');
  });

  it('labels manual priority choices as set by me (app.js:304)', () => {
    renderFields();
    const options = [...(screen.getByLabelText('Priority') as HTMLSelectElement).options].map(o => o.textContent);
    expect(options).toEqual(['Automatic', 'High · set by me', 'Medium · set by me', 'Low · set by me']);
  });

  it('converts values like the old form (app.js:313-320)', () => {
    const onChange = renderFields();
    fireEvent.change(screen.getByLabelText('Workflow · optional'), { target: { value: 'Research' } });
    fireEvent.change(screen.getByLabelText('Estimated minutes · optional'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Planned day · optional'), { target: { value: '2026-11-18' } });
    fireEvent.change(screen.getByLabelText('Deadline · optional'), { target: { value: '2026-11-20T10:30' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'parked' } });
    fireEvent.change(screen.getByLabelText('Session or document link · optional'), { target: { value: 'https://example.test/s' } });
    expect(onChange.mock.calls).toEqual([
      ['project', 'Research'], ['estimate_minutes', 25], ['planned_on', '2026-11-18'],
      ['due_at', fromLocal('2026-11-20T10:30')], ['status', 'parked'], ['session_url', 'https://example.test/s'],
    ]);
  });

  it('turns cleared optional values into null', () => {
    const onChange = renderFields({ estimate_minutes: 25, planned_on: '2026-11-18', not_before: '2026-10-01T11:23:45+00:00' });
    fireEvent.change(screen.getByLabelText('Estimated minutes · optional'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Planned day · optional'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Available after · optional'), { target: { value: '' } });
    expect(onChange.mock.calls).toEqual([['estimate_minutes', null], ['planned_on', null], ['not_before', null]]);
  });

  it('lists dependencies without the task itself and returns every selected id', () => {
    const onChange = renderFields();
    const select = screen.getByLabelText(/^Dependencies/) as HTMLSelectElement;
    expect([...select.options].map(o => o.textContent)).toEqual(['Fixture prerequisite', 'Other work']);
    select.options[0].selected = true;
    select.options[1].selected = true;
    fireEvent.change(select);
    expect(onChange).toHaveBeenCalledWith('dependencies', ['a', 'b']);
  });

  it('suggests each existing workflow once', () => {
    const { container } = render(<TaskFields value={{}} onChange={vi.fn()} disabled={false} tasks={tasks} selfId={null} />);
    expect([...container.querySelectorAll('datalist option')].map(o => o.getAttribute('value'))).toEqual(['Research', 'Applications']);
  });

  it('freezes every control while disabled', () => {
    renderFields({}, true);
    for (const control of document.querySelectorAll('input, select, textarea')) expect((control as HTMLInputElement).disabled).toBe(true);
  });
});
