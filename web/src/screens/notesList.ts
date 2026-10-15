import type { NoteSummary } from '../api/schemas';

export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_MAX_LENGTH = 500;

export function foldersOf(notes: NoteSummary[]): string[] {
  return [...new Set(notes.map(note => note.folder))].sort();
}

export function localNoteMatches(notes: NoteSummary[], q: string): NoteSummary[] {
  const needle = q.toLowerCase();
  return notes.filter(note => `${note.title} ${note.folder}`.toLowerCase().includes(needle));
}

export function inFolder(notes: NoteSummary[], folder: string): NoteSummary[] {
  return folder ? notes.filter(note => note.folder === folder) : notes;
}
