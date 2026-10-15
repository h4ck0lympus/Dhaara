export const COPY = {
  tagline: 'Your work, at a glance.',
  capture: { title: 'Capture', subtitle: 'Write, record, or sketch. Organize later.' },
  notes: { title: 'Notes', subtitle: 'Your knowledge, with its original thinking intact.' },
  plan: { title: 'Tasks', subtitle: 'Keep the next step in view.' },
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
