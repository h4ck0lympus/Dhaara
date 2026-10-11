import type { JSX } from 'react';
import { useConnected } from '../domain/connection';
import { useCaptureDraft } from '../local/drafts';
import { useSnapshot } from '../state/queries';
import { S } from '../strings';

export function OfflineNotice(): JSX.Element | null {
  const connected = useConnected();
  const snapshot = useSnapshot().data;
  const { saveState } = useCaptureDraft();
  if (connected) return null;
  return <div className="offline-banner" role="status">{S.offlineBanner(!!snapshot?.server_time, saveState === 'error')}</div>;
}
