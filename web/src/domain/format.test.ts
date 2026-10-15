import { describe, expect, it } from 'vitest';
import { makeNote } from '../test/fixtures';
import { age, dateLabel, dueLabel, fromLocal, localDateInput, localDay, noteMarkdownExport } from './format';

describe('format', () => {
  it('age counts minutes and hours, then falls back to a date', () => {
    const now = Date.parse('2026-10-10T12:00:00Z');
    expect(age('2026-10-10T11:59:30Z', now)).toBe('just now');
    expect(age('2026-10-10T12:00:30Z', now)).toBe('just now');
    expect(age('2026-10-10T11:15:00Z', now)).toBe('45m ago');
    expect(age('2026-10-10T07:00:00Z', now)).toBe('5h ago');
    expect(age('2026-10-01T12:00:00Z', now)).toBe(new Date('2026-10-01T12:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  });

  it('dueLabel names the local calendar day and flags today, tomorrow and overdue as soon', () => {
    const now = new Date(2026, 9, 15, 23, 30);
    const at = (d: number, h = 9) => new Date(2026, 9, d, h).toISOString();
    expect(dueLabel(null, now)).toBeNull();
    expect(dueLabel('not a date', now)).toBeNull();
    expect(dueLabel(at(14, 23), now)).toEqual({ text: 'Overdue', soon: true });
    expect(dueLabel(at(15, 0), now)).toEqual({ text: 'Today', soon: true });
    expect(dueLabel(at(16, 0), now)).toEqual({ text: 'Tomorrow', soon: true });
    expect(dueLabel(at(17), now)).toEqual({ text: new Date(2026, 9, 17).toLocaleDateString(undefined, { weekday: 'short' }), soon: false });
    expect(dueLabel(at(21), now)?.soon).toBe(false);
    expect(dueLabel(at(22), now)).toEqual({ text: new Date(2026, 9, 22).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), soon: false });
  });

  it('dueLabel counts days across a DST change by calendar day', () => {
    expect(dueLabel(new Date(2026, 10, 2, 9).toISOString(), new Date(2026, 10, 1, 9))?.text).toBe('Tomorrow');
    expect(dueLabel(new Date(2026, 2, 9, 9).toISOString(), new Date(2026, 2, 8, 1))?.text).toBe('Tomorrow');
  });

  it('dateLabel is empty for a missing stamp', () => {
    expect(dateLabel(null)).toBe('');
    expect(dateLabel('2026-10-10T12:00:00Z')).not.toBe('');
  });

  it('localDateInput and fromLocal round-trip a minute-precision stamp', () => {
    expect(localDateInput(null)).toBe('');
    expect(fromLocal('')).toBeNull();
    const input = localDateInput('2026-10-10T12:34:00.000Z');
    expect(input).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(fromLocal(input)).toBe('2026-10-10T12:34:00.000Z');
  });

  it('localDay is the device-local calendar day on both sides of midnight', () => {
    expect(localDay(new Date(2026, 9, 9, 23, 59, 59))).toBe('2026-10-09');
    expect(localDay(new Date(2026, 9, 10, 0, 0, 0))).toBe('2026-10-10');
  });

  it('noteMarkdownExport keeps the title, folder and body and makes a safe file name', () => {
    expect(noteMarkdownExport(makeNote('n1', { title: 'Heap: tcache/poison?', folder: 'Security / CTFs', body: '`x`' }))).toEqual({
      filename: 'Heap tcachepoison.md',
      text: '# Heap: tcache/poison?\n\nFolder: Security / CTFs\n\n`x`\n',
    });
    expect(noteMarkdownExport(makeNote('n2', { title: '???' })).filename).toBe('note.md');
  });
});
