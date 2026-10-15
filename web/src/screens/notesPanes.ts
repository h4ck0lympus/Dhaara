export type PaneId = 'folders' | 'list' | 'note';
export type Panes = { folders: boolean; list: boolean; note: boolean; foldersWidth: number; listWidth: number };

export const PANES_KEY = 'dhara-notes-panes';
export const DEFAULT_PANES: Panes = { folders: true, list: true, note: true, foldersWidth: 220, listWidth: 320 };
export const WIDTH_LIMITS = { foldersWidth: [160, 420], listWidth: [220, 560] } as const;
export const RESIZE_STEP = 16;

export function clampWidth(key: keyof typeof WIDTH_LIMITS, value: number): number {
  const [min, max] = WIDTH_LIMITS[key];
  return Number.isFinite(value) ? Math.round(Math.min(max, Math.max(min, value))) : DEFAULT_PANES[key];
}

export function readPanes(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Panes {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(PANES_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return DEFAULT_PANES;
    const v = raw as Record<string, unknown>;
    const flag = (key: PaneId) => (typeof v[key] === 'boolean' ? v[key] as boolean : DEFAULT_PANES[key]);
    return {
      folders: flag('folders'), list: flag('list'), note: flag('note'),
      foldersWidth: clampWidth('foldersWidth', Number(v.foldersWidth ?? DEFAULT_PANES.foldersWidth)),
      listWidth: clampWidth('listWidth', Number(v.listWidth ?? DEFAULT_PANES.listWidth)),
    };
  } catch {
    return DEFAULT_PANES;
  }
}

export function savePanes(panes: Panes, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage): void {
  try { storage?.setItem(PANES_KEY, JSON.stringify(panes)); } catch {}
}
