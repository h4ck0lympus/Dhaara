import { S } from '../strings';
import { toast } from '../ui/Toast';
import { persistDrafts } from './persistDrafts';

// A lazily loaded chunk from the previous build is gone (spec §6.2): keep the drafts, then let the user choose when to reload.
export function installPreloadErrorHandler(): () => void {
  const listener = (event: Event) => {
    event.preventDefault();
    void persistDrafts().catch(() => {}).then(() => {
      toast(S.updateReady, { action: { label: S.reload, onClick: () => location.reload() } });
    });
  };
  window.addEventListener('vite:preloadError', listener);
  return () => window.removeEventListener('vite:preloadError', listener);
}
