// User-visible strings produced in one module and asserted elsewhere (contract §5). Verbatim from public/app.js (line in the comment) unless marked new.
type StatusSnapshot = {
  tasks: readonly unknown[];
  notes: readonly unknown[];
  attention: readonly unknown[];
  runs: readonly { effective_status: string }[];
};

export const S = {
  draftSaved: 'Draft on this device · not uploaded', // 66
  draftError: 'Local save failed · keep this page open', // 66
  draftPending: 'Saving draft on this device…', // 66
  draftMemory: 'Draft in this tab · not uploaded', // 66
  localSaveFailedToast: 'Local save failed. Keep this page open and retry; this draft has not been uploaded.', // 73
  localSaveErrorNotice: 'Latest local save failed. Keep this page open.', // 218
  retryLocalSave: 'Retry local save', // 218
  networkError: 'Server unreachable. Your saved captures remain queued on this device.', // 80
  unexpectedResponse: 'The server sent an unexpected response.', // new
  connected: 'Server connected', // 105
  offline: 'Offline · local drafts', // 105
  statusSummary: (s: StatusSnapshot | null, connected: boolean): string => // 107
    !connected
      ? 'Status unavailable'
      : !s?.tasks.length
        ? s?.notes.length
          ? `${s.notes.length} learning note${s.notes.length === 1 ? '' : 's'}`
          : 'Nothing tracked yet'
        : `${s.attention.length} need you · ${s.runs.filter((run) => run.effective_status === 'working').length} reported running`,
  outboxCount: (n: number): string => `${n} capture${n === 1 ? '' : 's'} on this device`, // 140
  offlineBanner: (hasSnapshot: boolean, saveError: boolean): string => // 142
    `Server disconnected. ${hasSnapshot ? 'Showing the last server snapshot; agent status may be outdated.' : 'Current work and integration status are unavailable.'} ${saveError ? 'Local save failed; keep unsaved work open.' : 'Capture can save on this device when local storage is available.'}`,
  lastKnown: 'Last known · ', // 189
  savedTo: (folder: string, processing: string): string => `Saved to ${folder}. ${processing ? 'Processing queued.' : 'Original preserved.'}`, // 128
  queueReadFailed: 'Cannot read the local capture queue. Keep this page open and retry the local save.', // 135
  closeOtherTabs: 'Close other Noema tabs and retry the local save.', // 40
  tooManyFiles: 'Keep each capture to 12 attachments.', // 398
  fileTooLarge: (name: string): string => `${name} exceeds 32 MB.`, // 398
  unsupportedType: 'Use a PNG, JPEG or WebP image, or a WAV, Ogg, WebM, MP4 or MP3 recording.', // new; server allowlist server.py:40-48
  totalTooLarge: 'Keep each capture under 60 MB in total.', // new
  writeSomething: 'Write something or add a recording or visual.', // 402
  stopRecordingBeforeSaving: 'Stop recording before saving.', // 401
  couldNotSave: (message: string): string => 'Could not save the capture: ' + message, // 414
  captureSavedSending: 'Capture saved on this device. Sending to your server…', // 417
  captureSavedOffline: 'Capture saved on this device. It will upload when connected.', // 417
  stopRecordingBeforeLeaving: 'Stop recording before leaving Capture.', // 269
  finishingLocalSave: 'Finishing the local save.', // 555
  editStillOpen: 'Your edit is still open.', // 555
  leaveNoteEdit: 'Leave without saving this note edit? The last saved revision remains safe.', // 485
  taskUnavailable: 'Task unavailable.', // 289
  taskDraftUnconfirmed: 'Save unconfirmed · retry the same attempt', // 306
  taskDraftSaved: 'Draft on this device · not added', // 306
  taskDraftError: 'Local draft save failed · keep this dialog open', // 306
  taskDraftPending: 'Saving draft on this device…', // 306
  taskDraftMemory: 'Draft in this tab · not added', // 306
  previousUnconfirmed: 'Previous save is unconfirmed. Retry the same attempt; this draft is not an offline task queue.', // 327
  draftStorageFailed: 'Draft storage failed. Task not added; keep this dialog open and retry.', // 351
  ackUnverified: 'Task acknowledgement could not be verified; retry the same attempt.', // 355
  notConfirmed: 'Not confirmed added. Your input is preserved. ', // 365
  checkServiceRetry: 'Check the service or local storage, then retry the same attempt.', // 365
  unconfirmedPreserved: 'Save unconfirmed · draft preserved. Retry does not create a second task.', // 366
  draftNotStored: 'Draft not stored. Keep this dialog open and retry; the task is not added.', // 299
  addTask: 'Add task', // 323
  retryAddTask: 'Retry add task', // 323
  taskAdded: 'Task added.', // 362
  taskAddedDateKept: 'Task added. Date wording kept; correct it in Edit if needed.', // 362
  taskSaved: 'Task saved.', // 362
  editAction: 'Edit', // 14
  priorityUpdated: 'Priority updated.', // 496
  taskReopened: 'Task reopened.', // 499
  taskCompleted: 'Task completed.', // 499
  unlockTitle: 'Unlock Noema', // 302
  unlockHelp: 'This server needs your access token. On the host machine, it is in the selected data directory’s admin.token file or your NOEMA_ACCESS_TOKEN setting.', // 302
  accessToken: 'Access token', // 302
  unlock: 'Unlock', // 302
  outboxTitle: 'Captures on this device', // 482
  outboxHelp: 'Saved explicitly, but not yet acknowledged by the server. Attachments are kept with each capture. Keep this browser’s site storage until they upload.', // 482
  outboxEmpty: 'All saved captures have reached the server.', // 482
  outboxFallbackText: 'Visual or voice capture', // 482
  attachmentsCount: (n: number): string => `${n} attachments`, // 482
  retry: 'Retry', // 482
  openCopy: 'Open a copy in Capture', // 482
  discard: 'Discard', // 482
  confirmReplaceDraft: 'Replace the current unsaved Capture draft? The queued capture remains safe.', // 541
  openedCopy: 'Opened a copy. The queued original still exists.', // 542
  confirmDiscard: 'Permanently discard this unsent capture and its local attachments?', // 544
  notificationTitle: 'Noema reminder', // 98
  notificationFallback: 'A task needs your attention.', // 98
  notificationsUnsupported: 'This browser does not expose notifications here. Reminders still appear in Needs you.', // 535
  closeSaveInFlight: 'A capture save is still finishing. Try closing again shortly.', // 603
  closeConfirm: 'Close Noema? An unfinished recording or unsaved note edit may be lost. Cancel to stop/save or copy it first.', // 604
  closeDraftFailed: 'Local draft saving failed. Close anyway and risk losing this draft? Cancel to keep it open and retry.', // 608
  closeCheckpointFailed: 'Could not checkpoint your draft. Keep Noema open and retry the local save.', // 612
  updateReady: 'Noema was updated. Your drafts are saved on this device.', // new
  reload: 'Reload', // new
} as const;
