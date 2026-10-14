import { describe, expect, it } from 'vitest';
import { makeNoteSummary } from '../test/fixtures';
import { foldersOf, inFolder, localNoteMatches } from './notesList';

const notes = [
  makeNoteSummary('a', { title: 'Two pointers', folder: 'Programming / Algorithms' }),
  makeNoteSummary('b', { title: 'Heap slot', folder: 'Security / CTFs' }),
  makeNoteSummary('c', { title: 'Loose thought', folder: 'Inbox' }),
  makeNoteSummary('d', { title: 'More pointers', folder: 'Programming / Algorithms' }),
];
const ids = (list: { id: string }[]) => list.map(note => note.id);

describe('notesList', () => {
  it('lists each folder once, sorted', () => {
    expect(foldersOf(notes)).toEqual(['Inbox', 'Programming / Algorithms', 'Security / CTFs']);
    expect(foldersOf([])).toEqual([]);
  });

  it('matches title and folder case-insensitively on this device', () => {
    expect(ids(localNoteMatches(notes, 'POINTERS'))).toEqual(['a', 'd']);
    expect(ids(localNoteMatches(notes, 'security'))).toEqual(['b']);
    expect(ids(localNoteMatches(notes, 'algorithms'))).toEqual(['a', 'd']);
    expect(ids(localNoteMatches(notes, 'zebra'))).toEqual([]);
  });

  it('filters by folder, and an empty folder means all notes', () => {
    expect(ids(inFolder(notes, 'Programming / Algorithms'))).toEqual(['a', 'd']);
    expect(ids(inFolder(notes, ''))).toEqual(['a', 'b', 'c', 'd']);
    expect(inFolder(notes, 'Missing')).toEqual([]);
  });
});
