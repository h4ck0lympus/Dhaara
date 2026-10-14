// Capture outbox flush (spec §4.4, contract §4.4): a port of public/app.js:116-137. Items replay with capture_id = their id,
// so a lost acknowledgement never duplicates a note.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { ApiError, call } from '../api/client';
import { NoteSchema, type CapturePayload, type Note } from '../api/schemas';
import { connection } from '../domain/connection';
import { S } from '../strings';
import { toast } from '../ui/Toast';
import { isOutboxItem, onOutboxWrite, outboxAll, outboxDelete, outboxGet, outboxPut, type OutboxItem } from './db';
import { captureDraftStore } from './drafts';

export type FlushStop = 'done' | 'busy' | 'disconnected' | 'unauthorized' | 'server' | 'network' | 'rejected' | 'read-failed';
export type FlushResult = { sent: number; stop: FlushStop };

function captureForm(item: OutboxItem): FormData {
  const payload: CapturePayload = { capture_id: item.id, raw: item.raw, project: '', task_id: item.task_id || null, organize: true };
  const form = new FormData();
  form.set('payload', JSON.stringify(payload));
  for (const file of item.files) form.append('attachments', file.blob, file.name);
  return form;
}

function localFailure(sent: number): FlushResult {
  captureDraftStore.markSaveError();
  toast(S.queueReadFailed, { tone: 'error' });
  return { sent, stop: 'read-failed' };
}

let flushing = false;

export async function flushOutbox(): Promise<FlushResult> {
  if (flushing) return { sent: 0, stop: 'busy' };
  if (!connection.get()) return { sent: 0, stop: 'disconnected' };
  flushing = true;
  let sent = 0;
  try {
    let items: unknown[];
    try {
      items = await outboxAll(); // IndexedDB key order: random-UUID order, not chronological (parity with app.js)
    } catch {
      return localFailure(sent);
    }
    for (const item of items) {
      if (!isOutboxItem(item) || item.error) continue; // malformed items are listed in the Outbox dialog, never deleted here
      let note: Note;
      try {
        note = await call('capture', NoteSchema, { body: captureForm(item) });
      } catch (error) {
        if (error instanceof ApiError && error.kind === 'parse') toast(S.unexpectedResponse, { tone: 'error' }); // 2xx the item is kept unmarked: replay is idempotent
        if (!(error instanceof ApiError) || error.kind !== 'http' || error.status === null) return { sent, stop: 'network' };
        if (error.status === 401) return { sent, stop: 'unauthorized' };
        if (error.status >= 500) return { sent, stop: 'server' };
        try {
          await outboxPut({ ...item, error: error.message });
        } catch {
          return localFailure(sent);
        }
        return { sent, stop: 'rejected' };
      }
      try {
        await outboxDelete(item.id); // only after a 2xx
      } catch {
        return localFailure(sent);
      }
      sent += 1;
      if (items.length === 1) toast(S.savedTo(note.folder, note.processing)); // app.js:128: only when it was the only queued item
    }
    return { sent, stop: 'done' };
  } finally {
    flushing = false;
  }
}

export async function retryItem(id: string): Promise<void> {
  const item = await outboxGet(id);
  if (!isOutboxItem(item)) return; // a malformed record can only be discarded
  await outboxPut({ ...item, error: '' });
  await flushOutbox();
}

export async function discardItem(id: string): Promise<void> {
  await outboxDelete(id);
}

let count = 0;
const listeners = new Set<() => void>();

async function refresh(): Promise<void> {
  try {
    count = (await outboxAll()).length;
  } catch {
    // keep the last known count; flushOutbox reports unreadable storage
  }
  for (const listener of [...listeners]) listener();
}

onOutboxWrite(() => void refresh());

export function outboxCount(): number {
  return count;
}

export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useOutboxCount(): number {
  useEffect(() => {
    void refresh();
  }, []);
  return useSyncExternalStore(subscribeOutbox, outboxCount, outboxCount);
}

export function useOutboxItems(): { items: unknown[]; reload(): Promise<void> } {
  const [items, setItems] = useState<unknown[]>([]);
  const reload = useCallback(async () => {
    setItems(await outboxAll());
  }, []);
  useEffect(() => {
    void reload().catch(() => {});
    return subscribeOutbox(() => void reload().catch(() => {}));
  }, [reload]);
  return { items, reload };
}
