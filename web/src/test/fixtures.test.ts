import { describe, expect, it } from 'vitest';
import { NoteSchema, NoteSummarySchema, SnapshotRunSchema, SnapshotSchema, SnapshotTaskSchema } from '../api/schemas';
import { makeNote, makeNoteSummary, makeRun, makeSnapshot, makeTask } from './fixtures';

describe('unit fixtures', () => {
  it('produce schema-valid records', () => {
    expect(SnapshotRunSchema.parse(makeRun())).toEqual(makeRun());
    expect(SnapshotTaskSchema.parse(makeTask('t1'))).toEqual(makeTask('t1'));
    expect(NoteSummarySchema.parse(makeNoteSummary('n1'))).toEqual(makeNoteSummary('n1'));
    expect(NoteSchema.parse(makeNote('n1'))).toEqual(makeNote('n1'));
    const snapshot = makeSnapshot({ tasks: [makeTask('t1', { runs: [makeRun({ task_id: 't1' })] })], notes: [makeNoteSummary('n1')] });
    expect(SnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  it('defaults display_name to an empty string, like DEFAULT_SETTINGS', () => {
    expect(makeSnapshot().settings.display_name).toBe('');
  });
});
