// Pure formatting helpers ported from public/app.js (line numbers per function).
import type { Note } from '../api/schemas';

// app.js:17-23
export function age(stamp: string, now: number = Date.now()): string {
  const seconds = Math.max(0, (now - Date.parse(stamp)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(stamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// app.js:24
export function dateLabel(stamp: string | null): string {
  return stamp ? new Date(stamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
}

// app.js:25 — value for <input type="datetime-local">
export function localDateInput(stamp: string | null): string {
  if (!stamp) return '';
  const date = new Date(stamp);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// app.js:26
export function fromLocal(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

// app.js:349-350 — the device-local calendar day, sent once with a task capture and replayed unchanged.
export function localDay(date: Date): string {
  const day = new Date(date.getTime());
  day.setMinutes(day.getMinutes() - day.getTimezoneOffset());
  return day.toISOString().slice(0, 10);
}

// app.js:514 — client-side Markdown export of the current note.
export function noteMarkdownExport(note: Note): { filename: string; text: string } {
  return {
    filename: `${note.title.replace(/[^\w -]/g, '').slice(0, 70) || 'note'}.md`,
    text: `# ${note.title}\n\nFolder: ${note.folder}\n\n${note.body}\n`,
  };
}
