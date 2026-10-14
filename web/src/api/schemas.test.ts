import { describe, expect, it } from 'vitest';
import { makeNote, makeSnapshot, makeTask } from '../test/fixtures';
import { NoteSchema, SettingsSchema, SnapshotSchema, TaskSchema } from './schemas';

describe('schemas', () => {
  it('strip unknown keys instead of failing (a newer server may add fields)', () => {
    const parsed = SnapshotSchema.parse({ ...makeSnapshot(), extra: 1, settings: { ...makeSnapshot().settings, future: true } });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed.settings).not.toHaveProperty('future');
  });

  it('never coerce: a numeric string version or a string boolean is an error', () => {
    expect(TaskSchema.safeParse({ ...makeTask('t1'), version: '2' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ ...makeSnapshot().settings, motion: 'true' }).success).toBe(false);
  });

  it('accept a task created without a capture (original_input null) and open interpretation keys', () => {
    expect(TaskSchema.parse({ ...makeTask('t1'), original_input: null, interpretation: { explanation: 'x', rules: ['a'] } }).interpretation).toEqual({ explanation: 'x', rules: ['a'] });
  });

  it('bound the settings the server bounds', () => {
    const settings = makeSnapshot().settings;
    expect(SettingsSchema.safeParse({ ...settings, companion_size: 73 }).success).toBe(false);
    expect(SettingsSchema.safeParse({ ...settings, display_name: 'x'.repeat(61) }).success).toBe(false);
    expect(SettingsSchema.safeParse({ ...settings, display_name: 5 }).success).toBe(false);
  });

  it('defaults a missing display_name to empty so a v1-written snapshot still parses', () => {
    const { display_name: _omit, ...v1Settings } = makeSnapshot().settings;
    expect(SettingsSchema.parse(v1Settings).display_name).toBe('');
  });

  it('accept the note shape store.note returns', () => {
    const note = makeNote('n1', { attachments: [{ id: 'a1', name: 'heap.png', mime: 'image/png', size: 68, offset_seconds: null }] });
    expect(NoteSchema.parse(note)).toEqual(note);
  });
});
