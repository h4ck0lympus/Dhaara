import { useEffect } from 'react';
import type { Settings } from '../api/schemas';

export type Theme = Settings['theme'];

export function resolveTheme(theme: Theme, prefersLight: boolean): 'dark' | 'light' {
  return theme === 'system' ? (prefersLight ? 'light' : 'dark') : theme;
}

export function useAppliedTheme(theme: Theme): void {
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: light)');
    const apply = () => { document.documentElement.dataset.theme = resolveTheme(theme, query?.matches ?? false); };
    apply();
    if (theme !== 'system' || !query) return;
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [theme]);
}
