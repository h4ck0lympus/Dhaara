import { describe, expect, it } from 'vitest';
import { makeNote } from '../test/fixtures';
import { age, dateLabel, fromLocal, localDateInput, localDay, noteMarkdownExport } from './format';

describe('format', () => {
  it('age counts minutes and hours, then falls back to a date', () => {
    const now = Date.parse('2026-10-10T12:00:00Z');
    expect(age('2026-10-10T11:59:30Z', now)).toBe('just now');
    expect(age('2026-10-10T12:00:30Z', now)).toBe('just now');
    expect(age('2026-10-10T11:15:00Z', now)).toBe('45m ago');
    expect(age('2026-10-10T07:00:00Z', now)).toBe('5h ago');
    expect(age('2026-10-01T12:00:00Z', now)).toBe(new Date('2026-10-01T12:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
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
