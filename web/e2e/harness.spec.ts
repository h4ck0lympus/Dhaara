import { expect, PNG_1PX, readLocalDb, seedLocalDb, test, type SeedDraft } from './fixtures';

test('seedLocalDb writes v1-shaped records that readLocalDb reads back in key order', async ({ page, noema }) => {
  const png = { name: 'heap.png', type: 'image/png', base64: PNG_1PX };
  const outbox: SeedDraft[] = [
    { id: 'b-item', raw: 'second by key, v1 shape without error', task_id: '', files: [] },
    { id: 'a-item', raw: 'first by key', task_id: 'task-1', files: [png], error: '' },
    { id: 'c-item', raw: 'rejected earlier', task_id: '', files: [], error: 'Request failed (400)' },
  ];
  const taskDraft = { id: 'task-draft-1', raw: 'Review cleanup', fields: { project: 'CTF' }, pending: { capture_id: 'task-draft-1', raw: 'Review cleanup', local_day: '2026-10-09', details: { project: 'CTF' } } };
  await seedLocalDb(page, noema.origin, { draft: { id: 'draft-1', raw: 'unsaved thought', task_id: '', files: [png] }, taskDraft, outbox });
  const db = await readLocalDb(page);
  expect(db.outbox).toEqual([
    { id: 'a-item', raw: 'first by key', error: '', fileCount: 1 },
    { id: 'b-item', raw: 'second by key, v1 shape without error', fileCount: 0 },
    { id: 'c-item', raw: 'rejected earlier', error: 'Request failed (400)', fileCount: 0 },
  ]);
  expect(db.draft).toEqual({ id: 'draft-1', raw: 'unsaved thought', task_id: '', files: [{ name: 'heap.png', type: 'image/png', size: 68 }] });
  expect(db.taskDraft).toEqual(taskDraft);
});
