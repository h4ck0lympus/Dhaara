import { describe, expect, it } from 'vitest';
import { makeTask } from '../test/fixtures';
import { TASK_EDIT_FIELDS, editableFields } from './tasks';

describe('editableFields', () => {
  it('copies exactly the fields app.js:382 re-sends, nothing server-computed', () => {
    const task = makeTask('t1', { title: 'Review', due_at: '2026-10-11T09:00:00+00:00', dependencies: ['t0'], estimate_minutes: 30 });
    const fields = editableFields(task);
    expect(Object.keys(fields)).toEqual([...TASK_EDIT_FIELDS]);
    expect(fields).toMatchObject({ title: 'Review', due_at: '2026-10-11T09:00:00+00:00', dependencies: ['t0'], estimate_minutes: 30 });
    expect(fields).not.toHaveProperty('version');
  });
});
