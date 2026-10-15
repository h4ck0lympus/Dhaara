import type { JSX } from 'react';
import { useConnected } from '../domain/connection';
import { useOutboxCount } from '../local/outbox';
import { S } from '../strings';
import { openDialog } from './dialogs';

export function StatusLine(): JSX.Element {
  const connected = useConnected();
  const queued = useOutboxCount();
  return (
    <div className="status-line">
      <span className="local-label">
        <span className={connected ? 'status-dot' : 'status-dot paused'} aria-hidden="true" />
        <span id="connection-label">{connected ? S.connected : S.offline}</span>
      </span>
      {queued > 0 && (
        <button type="button" className="text-button" onClick={() => openDialog({ kind: 'outbox' })}>{S.outboxCount(queued)}</button>
      )}
    </div>
  );
}
