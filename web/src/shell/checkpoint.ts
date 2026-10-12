import { CHECKPOINT_CLOSE, CLOSE_APPROVED } from '../events';
import { captureDraftStore } from '../local/drafts';
import { isGuardActive } from '../routes/guards';
import { S } from '../strings';
import { toast } from '../ui/Toast';
import { persistDrafts } from './persistDrafts';

// Page side of the desktop close contract (app.js:598-614, spec §6.3). Ordinary browsers have no bridge and ignore the request.
export function installCheckpointClose(): () => void {
  const ipc = window.ipc;
  if (typeof ipc?.postMessage !== 'function') return () => {};
  let closing = false;

  async function checkpoint(): Promise<void> {
    if (closing) return;
    closing = true;
    try {
      if (captureDraftStore.getSnapshot().saving) {
        toast(S.closeSaveInFlight);
        return;
      }
      if ((isGuardActive('recording') || isGuardActive('note-edit')) && !window.confirm(S.closeConfirm)) return;
      // A task-draft write failure (persistDrafts only writes a non-empty one) asks like a capture one; other errors still toast.
      let taskDraftFailed = false;
      await persistDrafts().catch(() => { taskDraftFailed = true; });
      const { draft, saveState } = captureDraftStore.getSnapshot();
      const captureFailed = saveState !== 'saved' && (draft.raw || draft.files.length);
      if ((taskDraftFailed || captureFailed) && !window.confirm(S.closeDraftFailed)) return;
      ipc!.postMessage(CLOSE_APPROVED);
    } catch {
      toast(S.closeCheckpointFailed, { tone: 'error' });
    } finally {
      closing = false;
    }
  }

  const listener = () => { void checkpoint(); };
  window.addEventListener(CHECKPOINT_CLOSE, listener);
  window.__noemaCheckpointCloseReady = true;   // only after the listener exists (spec §6.3)
  return () => {
    window.removeEventListener(CHECKPOINT_CLOSE, listener);
    delete window.__noemaCheckpointCloseReady;
  };
}
