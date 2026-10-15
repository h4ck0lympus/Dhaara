export const COPY = {
  tagline: 'Same chaos. A calmer you.',
  capture: { title: 'Capture', subtitle: 'Write, record, or sketch. Organize later.' },
  plan: { title: 'Tasks' },
} as const;

export function greeting(now: Date, displayName: string): string {
  const hour = now.getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = displayName.trim();
  return name ? `${part}, ${name}.` : `${part}.`;
}

