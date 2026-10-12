import { useNavigate } from '@tanstack/react-router';
import type { JSX } from 'react';
import { isOutboxItem, type OutboxItem } from '../local/db';
import { captureDraftStore } from '../local/drafts';
import { discardItem, retryItem, useOutboxItems } from '../local/outbox';
import { S } from '../strings';
import { Dialog } from '../ui/Dialog';
import { toast } from '../ui/Toast';

const UNREADABLE = 'This queued item cannot be read. It stays in this browser’s storage until you discard it.';

function hasStringId(value: unknown): value is { id: string } {
  return typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string';
}

export function OutboxDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const { items, reload } = useOutboxItems();
  const navigate = useNavigate();

  async function run(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), { tone: 'error' });
    } finally {
      await reload().catch(() => {});
    }
  }

  async function openCopy(item: OutboxItem) {
    const { draft, saving } = captureDraftStore.getSnapshot();
    if (saving) { toast(S.finishingLocalSave); return; }   // a save in flight would be overwritten by the copy
    if ((draft.raw || draft.files.length) && !window.confirm(S.confirmReplaceDraft)) return;   // app.js:541
    await captureDraftStore.replaceWith(item);
    onClose();
    await navigate({ to: '/capture' });
    toast(S.openedCopy);
  }

  function discard(id: string) {
    if (window.confirm(S.confirmDiscard)) void run(() => discardItem(id));   // app.js:544
  }

  return (
    <Dialog title={S.outboxTitle} onRequestClose={onClose}>
      <p className="subtle-line">{S.outboxHelp}</p>
      {items.length === 0 && <p className="subtle-line">{S.outboxEmpty}</p>}
      <ul className="outbox-list">
        {items.map((item, index) => (isOutboxItem(item) ? (
          <li key={item.id} className="outbox-item">
            <p>{item.raw.slice(0, 180) || S.outboxFallbackText}</p>
            <p className="subtle-line">{S.attachmentsCount(item.files.length)}</p>
            {item.error && <p className="notice error" role="alert">{item.error}</p>}
            <div className="inline-actions">
              <button type="button" className="secondary" onClick={() => void run(() => retryItem(item.id))}>{S.retry}</button>
              <button type="button" className="quiet-button" onClick={() => void run(() => openCopy(item))}>{S.openCopy}</button>
              <button type="button" className="quiet-button" onClick={() => discard(item.id)}>{S.discard}</button>
            </div>
          </li>
        ) : (
          <li key={hasStringId(item) ? item.id : `unreadable-${index}`} className="outbox-item">
            <p className="notice error">{UNREADABLE}</p>
            {hasStringId(item) && (
              <button type="button" className="quiet-button" onClick={() => discard(item.id)}>{S.discard}</button>
            )}
          </li>
        )))}
      </ul>
    </Dialog>
  );
}
