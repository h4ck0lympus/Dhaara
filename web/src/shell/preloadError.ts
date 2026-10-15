import { S } from '../strings';
import { toast } from '../ui/Toast';
import { persistDrafts } from './persistDrafts';

export function installPreloadErrorHandler(): () => void {
  const listener = (event: Event) => {
    event.preventDefault();
    const action = { label: S.reload, onClick: () => location.reload() };
    persistDrafts().then(
      () => toast(S.updateReady, { action }),
      () => toast(S.draftsNotSaved, { tone: 'error', action }),
    );
  };
  window.addEventListener('vite:preloadError', listener);
  return () => window.removeEventListener('vite:preloadError', listener);
}
