import type { NoteSummary } from '../api/schemas';

export const SEARCH_DEBOUNCE_MS = 300;   // app.js:454
export const SEARCH_MAX_LENGTH = 500;    // server.py:215

export function foldersOf(notes: NoteSummary[]): string[] {
  return [...new Set(notes.map(note => note.folder))].sort();   // app.js:230
}

export function localNoteMatches(notes: NoteSummary[], q: string): NoteSummary[] {
  const needle = q.toLowerCase();
  return notes.filter(note => `${note.title} ${note.folder}`.toLowerCase().includes(needle));   // app.js:229
}

export function inFolder(notes: NoteSummary[], folder: string): NoteSummary[] {
  return folder ? notes.filter(note => note.folder === folder) : notes;
}
