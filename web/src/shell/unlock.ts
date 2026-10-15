import type { QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { runFlush } from '../state/queries';
import { createStore } from '../state/store';

const store = createStore(false);

export function requestUnlock(): void { store.set(true); }
export function cancelUnlock(): void { store.set(false); }
export function isUnlockOpen(): boolean { return store.get(); }
export function useUnlockOpen(): boolean { return useSyncExternalStore(store.subscribe, store.get); }

export async function completeUnlock(qc: QueryClient): Promise<void> {
  store.set(false);
  await qc.refetchQueries({ queryKey: ['snapshot'] });
  await runFlush(qc);
}
