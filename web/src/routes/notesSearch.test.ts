// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { notesSearch } from './router';

describe('notesSearch', () => {
  it('keeps non-empty strings and drops everything else', () => {
    expect(notesSearch({ q: 'heap', folder: 'CTF', note: 'n1', other: 'x' })).toEqual({ q: 'heap', folder: 'CTF', note: 'n1' });
    expect(notesSearch({ q: '', folder: 3, note: null })).toEqual({ q: undefined, folder: undefined, note: undefined });
  });

  it('caps lengths', () => {
    const out = notesSearch({ q: 'q'.repeat(900), folder: 'f'.repeat(900), note: 'n'.repeat(900) });
    expect([out.q!.length, out.folder!.length, out.note!.length]).toEqual([500, 200, 200]);
  });
});
