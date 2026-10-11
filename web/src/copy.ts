// All variant B headings, subtitles and the tagline (owner decision 18B). The later
// daily-slogan feature (spec §11.2) only swaps this module's source.
export const COPY = {
  tagline: 'Same chaos. A calmer you.',
  capture: { title: 'Capture a thought.', subtitle: 'A quiet place for the rough edges.' },
  notes: { title: 'A place to return to.', subtitle: 'Your notes, with their original thinking intact.' },
  plan: { title: 'A little room to plan.', subtitle: 'Keep the next step in view.' },
} as const;

export function greeting(now: Date, displayName: string): string {
  const hour = now.getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = displayName.trim();
  return name ? `${part}, ${name}.` : `${part}.`;
}

export function avatarLetter(displayName: string): string | null {
  const name = displayName.trim();
  return name ? [...name][0].toUpperCase() : null;
}
