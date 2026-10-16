export const IPC_COMPANION = 'dhara:companion';
export const COMPANION_TITLE = 'Dhara companion';
export const COMPANION_MARGIN = 16;
export const CLOSED_SIZE = { width: 150, height: 120 } as const;
export const OPEN_SIZE = { width: 380, height: 700 } as const;

export type Rect = { x: number; y: number; width: number; height: number };
export type CompanionMessage =
  | { type: 'resize'; open: boolean }
  | { type: 'visible'; visible: boolean }
  | { type: 'open-app'; path: string };

/** Only in-app hash routes such as /task/abc or /settings; nothing that could leave the origin. */
const APP_PATH = /^\/(?!\/)[A-Za-z0-9/_\-?=&.%]{0,200}$/;

export function parseCompanionMessage(value: unknown): CompanionMessage | null {
  if (typeof value !== 'object' || value === null) return null;
  const message = value as Record<string, unknown>;
  if (message.type === 'resize' && typeof message.open === 'boolean') return { type: 'resize', open: message.open };
  if (message.type === 'visible' && typeof message.visible === 'boolean') return { type: 'visible', visible: message.visible };
  if (message.type === 'open-app' && typeof message.path === 'string' && APP_PATH.test(message.path) && !message.path.includes('..')) {
    return { type: 'open-app', path: message.path };
  }
  return null;
}

/** Bottom-right of the work area, kept inside it even on a small screen. */
export function companionBounds(workArea: Rect, open: boolean): Rect {
  const size = open ? OPEN_SIZE : CLOSED_SIZE;
  const width = Math.min(size.width, workArea.width), height = Math.min(size.height, workArea.height);
  return {
    x: Math.max(workArea.x, workArea.x + workArea.width - width - COMPANION_MARGIN),
    y: Math.max(workArea.y, workArea.y + workArea.height - height - COMPANION_MARGIN),
    width, height,
  };
}
