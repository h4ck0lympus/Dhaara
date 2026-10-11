// web/src/ui/Icon.tsx
import type { JSX, ReactNode } from 'react';

export type IconName = 'home' | 'pen' | 'notes' | 'task-check' | 'arrow' | 'waveform' | 'plus' | 'plan' | 'search' | 'chevron'
  | 'close' | 'clock' | 'settings' | 'play' | 'spark' | 'image' | 'mic' | 'folder' | 'check' | 'pause' | 'stop' | 'eraser'
  | 'undo' | 'text' | 'sidebar';

const PATHS: Record<IconName, ReactNode> = {
  home: <path d="m2.5 10 9.5-8 9.5 8M5 9v12h5v-7h4v7h5V9" />,
  pen: <path d="m4 16 12-12 4 4L8 20l-5 1zM14 6l4 4" />,
  notes: <path d="M5 2.5h10l4 4v15H5zM15 2.5v5h4M8 11h8M8 15h8M8 18h6" />,
  'task-check': <><circle cx="12" cy="12" r="9.5" /><path d="m7 12 3 3 7-7" /></>,
  arrow: <path d="M3 12h17m-6-6 6 6-6 6" />,
  waveform: <path d="M3 10v4M7 6v12M12 3v18M17 7v10M21 10v4" />,
  plus: <path d="M12 5v14M5 12h14" />,
  plan: <path d="M5 5h14M5 12h12M5 19h14" />,
  search: <><circle cx="10.5" cy="10.5" r="7" /><path d="m16 16 5 5" /></>,
  chevron: <path d="m9 5 6 7-6 7" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 3" /></>,
  settings: <><path d="m9 3 .6-1h4.8l.8 3 2.4 1.4 3-.6 2.4 4.2-2.2 2 .1 2.8 2 2.2-2.4 4.1-3-.7-2.4 1.4-.8 2.7H9.5l-.8-2.7-2.4-1.4-3 .7L1 17l2-2.2V12L1 10l2.4-4.2 3 .6L9 5z" transform="translate(1 0) scale(.9)" /><circle cx="12" cy="12" r="3" /></>,
  play: <path d="m7 4 13 8-13 8z" fill="currentColor" strokeWidth="0" />,
  spark: <path d="M12 1c1 8 3 10 11 11-8 1-10 3-11 11C11 15 9 13 1 12c8-1 10-3 11-11Z" fill="currentColor" strokeWidth="0" />,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 6-6 4 4 3-3 5 5" /></>,
  mic: <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></>,
  folder: <path d="M3 5h7l2 3h9v12H3z" />,
  check: <path d="m5 12 4 4L19 6" />,
  pause: <path d="M8 5v14M16 5v14" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" />,
  eraser: <path d="M16 3 21 8 10 19H5l-2-2L14 6M9 19h12" />,
  undo: <path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-3" />,
  text: <path d="M5 5h14M12 5v14M9 19h6" />,
  sidebar: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
