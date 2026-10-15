// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveTheme, useAppliedTheme } from './theme';

function mockMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const query = { matches, addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) };
  vi.stubGlobal('matchMedia', () => query);
  return { query, listeners, flip(next: boolean) { query.matches = next; listeners.forEach(fn => fn()); } };
}

afterEach(() => { vi.unstubAllGlobals(); delete document.documentElement.dataset.theme; });

describe('resolveTheme', () => {
  it.each([['dark', false, 'dark'], ['dark', true, 'dark'], ['light', false, 'light'], ['system', false, 'dark'], ['system', true, 'light']] as const)('%s with prefersLight=%s is %s', (theme, light, out) => {
    expect(resolveTheme(theme, light)).toBe(out);
  });
});

describe('useAppliedTheme', () => {
  it('sets data-theme and follows the system only in system mode', () => {
    const media = mockMedia(false);
    const { rerender, unmount } = renderHook(({ theme }) => useAppliedTheme(theme), { initialProps: { theme: 'light' as 'light' | 'dark' | 'system' } });
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(media.listeners.size).toBe(0);
    rerender({ theme: 'system' });
    expect(document.documentElement.dataset.theme).toBe('dark');
    media.flip(true);
    expect(document.documentElement.dataset.theme).toBe('light');
    rerender({ theme: 'dark' });
    expect(media.listeners.size).toBe(0);
    expect(document.documentElement.dataset.theme).toBe('dark');
    unmount();
  });

  it('works without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    renderHook(() => useAppliedTheme('system'));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
