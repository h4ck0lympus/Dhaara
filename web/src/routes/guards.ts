import { useBlocker } from '@tanstack/react-router';
import { useEffect } from 'react';
import { toast } from '../ui/Toast';

export type GuardId = 'recording' | 'capture-saving' | 'note-edit';
export type GuardVerdict = { kind: 'block'; toast: string } | { kind: 'confirm'; message: string } | null;
export type NavigationGuard = { id: GuardId; check(toPath: string): GuardVerdict; beforeUnload: boolean };

const guards = new Map<GuardId, NavigationGuard>();

export function registerGuard(guard: NavigationGuard): () => void {
  guards.set(guard.id, guard);
  return () => { if (guards.get(guard.id) === guard) guards.delete(guard.id); };
}

export function useNavigationGuard(guard: NavigationGuard | null): void {
  useEffect(() => (guard ? registerGuard(guard) : undefined), [guard]);
}

export function isGuardActive(id: GuardId): boolean {
  return guards.has(id);
}

export function allowNavigation(toPath: string): boolean {
  for (const guard of guards.values()) {
    const verdict = guard.check(toPath);
    if (verdict?.kind === 'block') { toast(verdict.toast); return false; }
    if (verdict?.kind === 'confirm' && !window.confirm(verdict.message)) return false;
  }
  return true;
}

export function shouldWarnBeforeUnload(): boolean {
  return [...guards.values()].some(guard => guard.beforeUnload);
}

export function RouteGuards(): null {
  useBlocker({ shouldBlockFn: ({ next }) => !allowNavigation(next.pathname), enableBeforeUnload: shouldWarnBeforeUnload, withResolver: false });
  return null;
}
