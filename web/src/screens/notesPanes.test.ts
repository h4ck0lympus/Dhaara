import { describe, expect, it } from 'vitest';
import { DEFAULT_PANES, PANES_KEY, clampWidth, readPanes, savePanes } from './notesPanes';

const store = (value: string | null) => ({ getItem: (key: string) => (key === PANES_KEY ? value : null) });

describe('notesPanes', () => {
  it('clamps widths to their limits and rounds', () => {
    expect(clampWidth('foldersWidth', 10)).toBe(160);
    expect(clampWidth('foldersWidth', 9999)).toBe(420);
    expect(clampWidth('listWidth', 300.6)).toBe(301);
    expect(clampWidth('listWidth', Number.NaN)).toBe(DEFAULT_PANES.listWidth);
  });

  it('defaults when nothing, garbage or a non-object is stored', () => {
    for (const raw of [null, '{', '42', '"x"', 'null', '[]']) expect(readPanes(store(raw))).toEqual(DEFAULT_PANES);
  });

  it('keeps valid fields and repairs invalid ones', () => {
    expect(readPanes(store(JSON.stringify({ folders: false, list: 'no', note: true, foldersWidth: 5000, listWidth: 'wide' }))))
      .toEqual({ ...DEFAULT_PANES, folders: false, foldersWidth: 420 });
  });

  it('survives blocked storage on read and write', () => {
    const blocked = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(readPanes(blocked)).toEqual(DEFAULT_PANES);
    expect(() => savePanes(DEFAULT_PANES, blocked)).not.toThrow();
  });

  it('round-trips through storage', () => {
    let saved = '';
    const next = { ...DEFAULT_PANES, list: false, listWidth: 400 };
    savePanes(next, { setItem: (_k, v) => { saved = v; } });
    expect(readPanes(store(saved))).toEqual(next);
  });
});
