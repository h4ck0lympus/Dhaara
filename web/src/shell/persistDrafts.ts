import { captureDraftStore } from '../local/drafts';
import { taskDraftStore } from '../local/taskDraft';

// Never write an unloaded (empty) draft over a stored one, and never overwrite an in-flight Capture save (spec §4.4).
// Rejects when the task-draft write fails; the Capture store records its own failure in saveState.
export async function persistDrafts(): Promise<void> {
  const capture = captureDraftStore.getSnapshot();
  if (capture.recovered && !capture.saving) await captureDraftStore.persist();
  const task = taskDraftStore.getSnapshot();
  if (task.recovered && (task.draft.raw || task.draft.pending)) await taskDraftStore.persist();
}
