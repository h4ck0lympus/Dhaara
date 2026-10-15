import type { Note } from '../api/schemas';

export function age(stamp: string, now: number = Date.now()): string {
  const seconds = Math.max(0, (now - Date.parse(stamp)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(stamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function dateLabel(stamp: string | null): string {
  return stamp ? new Date(stamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
}

export function dueLabel(stamp: string | null, now: Date = new Date()): { text: string; soon: boolean } | null {
  if (!stamp) return null;
  const due = new Date(stamp);
  if (Number.isNaN(due.getTime())) return null;
  const days = Math.round((new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000);
  const text = days < 0 ? 'Overdue' : days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days < 7
    ? due.toLocaleDateString(undefined, { weekday: 'short' }) : due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return { text, soon: days <= 1 };
}

export function localDateInput(stamp: string | null): string {
  if (!stamp) return '';
  const date = new Date(stamp);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function fromLocal(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function localDay(date: Date): string {
  const day = new Date(date.getTime());
  day.setMinutes(day.getMinutes() - day.getTimezoneOffset());
  return day.toISOString().slice(0, 10);
}

export function noteMarkdownExport(note: Note): { filename: string; text: string } {
  return {
    filename: `${note.title.replace(/[^\w -]/g, '').slice(0, 70) || 'note'}.md`,
    text: `# ${note.title}\n\nFolder: ${note.folder}\n\n${note.body}\n`,
  };
}
