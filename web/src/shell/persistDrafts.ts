import { captureDraftStore } from '../local/drafts';
import { taskDraftStore } from '../local/taskDraft';

export async function persistDrafts(): Promise<void> {
  const capture = captureDraftStore.getSnapshot();
  if (capture.recovered && !capture.saving) await captureDraftStore.persist();
  const task = taskDraftStore.getSnapshot();
  if (task.recovered && (task.draft.raw || task.draft.pending)) await taskDraftStore.persist();
}
