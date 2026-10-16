import type { JSX } from 'react';
import { useOutboxCount } from '../local/outbox';
import { S } from '../strings';
import { openDialog } from './dialogs';

export function StatusLine(): JSX.Element | null {
  const queued = useOutboxCount();
  if (queued === 0) return null;
  return (
    <div className="status-line">
      <button type="button" className="text-button" onClick={() => openDialog({ kind: 'outbox' })}>{S.outboxCount(queued)}</button>
    </div>
  );
}
