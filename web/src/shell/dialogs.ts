import { useSyncExternalStore } from 'react';
import { createStore } from '../state/store';

export type DialogRequest =
  | { kind: 'task'; id: string } | { kind: 'task-capture' } | { kind: 'settings'; section?: 'agents' }
  | { kind: 'outbox' } | { kind: 'note-history'; noteId: string } | { kind: 'sketch' };

const store = createStore<DialogRequest | null>(null);

export function openDialog(request: DialogRequest): void { store.set(request); }
export function closeDialog(): void { store.set(null); }
export function isDialogOpen(): boolean { return store.get() !== null; }
export function useDialog(): DialogRequest | null { return useSyncExternalStore(store.subscribe, store.get); }
