import { describe, expect, it } from 'vitest';
import { S } from './strings';

const snapshot = (tasks: number, notes: number, attention: number, runs: string[]) => ({
  tasks: Array.from({ length: tasks }, () => ({})),
  notes: Array.from({ length: notes }, () => ({})),
  attention: Array.from({ length: attention }, () => ({})),
  runs: runs.map((effective_status) => ({ effective_status })),
});

describe('S', () => {
  it('keeps every fixed string exactly', () => {
    const fixed = Object.fromEntries(Object.entries(S).filter(([, value]) => typeof value === 'string'));
    expect(fixed).toEqual({
      draftSaved: 'Draft on this device · not uploaded',
      draftError: 'Local save failed · keep this page open',
      draftPending: 'Saving draft on this device…',
      draftMemory: 'Draft in this tab · not uploaded',
      localSaveFailedToast: 'Local save failed. Keep this page open and retry; this draft has not been uploaded.',
      localSaveErrorNotice: 'Latest local save failed. Keep this page open.',
      migrationFailed: 'Local data could not be migrated; keep this page open and retry.',
      retryLocalSave: 'Retry local save',
      networkError: 'Server unreachable. Your saved captures remain queued on this device.',
      unexpectedResponse: 'The server sent an unexpected response.',
      connected: 'Server connected',
      offline: 'Offline · local drafts',
      lastKnown: 'Last known · ',
      queueReadFailed: 'Cannot read the local capture queue. Keep this page open and retry the local save.',
      closeOtherTabs: 'Close other Dhara tabs and retry the local save.',
      tooManyFiles: 'Keep each capture to 12 attachments.',
      unsupportedType: 'Use a PNG, JPEG or WebP image, or a WAV, Ogg, WebM, MP4 or MP3 recording.',
      totalTooLarge: 'Keep each capture under 60 MB in total.',
      writeSomething: 'Write something or add a recording or visual.',
      stopRecordingBeforeSaving: 'Stop recording before saving.',
      captureSavedSending: 'Capture saved on this device. Sending to your server…',
      captureSavedOffline: 'Capture saved on this device. It will upload when connected.',
      stopRecordingBeforeLeaving: 'Stop recording before leaving Capture.',
      finishingLocalSave: 'Finishing the local save.',
      editStillOpen: 'Your edit is still open.',
      leaveNoteEdit: 'Leave without saving this note edit? The last saved revision remains safe.',
      taskUnavailable: 'Task unavailable.',
      taskDraftUnconfirmed: 'Save unconfirmed · retry the same attempt',
      taskDraftSaved: 'Draft on this device · not added',
      taskDraftError: 'Local draft save failed · keep this dialog open',
      taskDraftPending: 'Saving draft on this device…',
      taskDraftMemory: 'Draft in this tab · not added',
      previousUnconfirmed: 'Previous save is unconfirmed. Retry the same attempt; this draft is not an offline task queue.',
      draftStorageFailed: 'Draft storage failed. Task not added; keep this dialog open and retry.',
      ackUnverified: 'Task acknowledgement could not be verified; retry the same attempt.',
      notConfirmed: 'Not confirmed added. Your input is preserved. ',
      checkServiceRetry: 'Check the service or local storage, then retry the same attempt.',
      unconfirmedPreserved: 'Save unconfirmed · draft preserved. Retry does not create a second task.',
      draftNotStored: 'Draft not stored. Keep this dialog open and retry; the task is not added.',
      addTask: 'Add task',
      retryAddTask: 'Retry add task',
      taskAdded: 'Task added.',
      taskAddedDateKept: 'Task added. Date wording kept; correct it in Edit if needed.',
      taskSaved: 'Task saved.',
      editAction: 'Edit',
      priorityUpdated: 'Priority updated.',
      taskReopened: 'Task reopened.',
      taskCompleted: 'Task completed.',
      unlockTitle: 'Unlock Dhara',
      unlockHelp: 'This server needs your access token. On the host machine, it is in the selected data directory’s admin.token file or your DHARA_ACCESS_TOKEN setting.',
      accessToken: 'Access token',
      unlock: 'Unlock',
      outboxTitle: 'Captures on this device',
      outboxHelp: 'Saved explicitly, but not yet acknowledged by the server. Attachments are kept with each capture. Keep this browser’s site storage until they upload.',
      outboxEmpty: 'All saved captures have reached the server.',
      outboxFallbackText: 'Visual or voice capture',
      retry: 'Retry',
      openCopy: 'Open a copy in Capture',
      discard: 'Discard',
      confirmReplaceDraft: 'Replace the current unsaved Capture draft? The queued capture remains safe.',
      openedCopy: 'Opened a copy. The queued original still exists.',
      confirmDiscard: 'Permanently discard this unsent capture and its local attachments?',
      notificationTitle: 'Dhara reminder',
      notificationFallback: 'A task needs your attention.',
      notificationsUnsupported: 'This browser does not expose notifications here. Reminders still appear in Needs you.',
      closeSaveInFlight: 'A capture save is still finishing. Try closing again shortly.',
      closeConfirm: 'Close Dhara? An unfinished recording or unsaved note edit may be lost. Cancel to stop/save or copy it first.',
      closeDraftFailed: 'Local draft saving failed. Close anyway and risk losing this draft? Cancel to keep it open and retry.',
      closeCheckpointFailed: 'Could not checkpoint your draft. Keep Dhara open and retry the local save.',
      draftsNotSaved: 'Could not save your drafts on this device.',
      updateReady: 'Dhara was updated. Your drafts are saved on this device.',
      reload: 'Reload',
      noteConflict: 'This note changed on the server. Your edits were not overwritten — Reload latest replaces them with the newest version; Keep editing keeps them.',
    });
  });

  it('summarises status exactly like app.js:107', () => {
    expect(S.statusSummary(null, false)).toBe('Status unavailable');
    expect(S.statusSummary(snapshot(1, 0, 0, []), false)).toBe('Status unavailable');
    expect(S.statusSummary(null, true)).toBe('Nothing tracked yet');
    expect(S.statusSummary(snapshot(0, 0, 0, []), true)).toBe('Nothing tracked yet');
    expect(S.statusSummary(snapshot(0, 1, 0, []), true)).toBe('1 learning note');
    expect(S.statusSummary(snapshot(0, 3, 0, []), true)).toBe('3 learning notes');
    expect(S.statusSummary(snapshot(2, 5, 1, ['working', 'needs_input', 'working']), true)).toBe('1 need you · 2 reported running');
  });

  it('formats counts, file names and server acknowledgements like app.js', () => {
    expect(S.outboxCount(0)).toBe('0 captures on this device');
    expect(S.outboxCount(1)).toBe('1 capture on this device');
    expect(S.outboxCount(2)).toBe('2 captures on this device');
    expect(S.attachmentsCount(1)).toBe('1 attachments');
    expect(S.fileTooLarge('heap.png')).toBe('heap.png exceeds 32 MB.');
    expect(S.couldNotSave('QuotaExceededError')).toBe('Could not save the capture: QuotaExceededError');
    expect(S.savedTo('Inbox', '')).toBe('Saved to Inbox. Original preserved.');
    expect(S.savedTo('Security / CTFs', 'queued: organize')).toBe('Saved to Security / CTFs. Processing queued.');
  });

  it('builds the two-part offline banner exactly like app.js:142', () => {
    expect(S.offlineBanner(true, false)).toBe('Server disconnected. Showing the last server snapshot; agent status may be outdated. Capture can save on this device when local storage is available.');
    expect(S.offlineBanner(false, false)).toBe('Server disconnected. Current work and integration status are unavailable. Capture can save on this device when local storage is available.');
    expect(S.offlineBanner(true, true)).toBe('Server disconnected. Showing the last server snapshot; agent status may be outdated. Local save failed; keep unsaved work open.');
    expect(S.offlineBanner(false, true)).toBe('Server disconnected. Current work and integration status are unavailable. Local save failed; keep unsaved work open.');
  });

  it('keeps draft, queued and saved-on-server labels distinct (handbook §20)', () => {
    const labels = [S.draftMemory, S.draftSaved, S.draftPending, S.captureSavedOffline, S.captureSavedSending, S.outboxCount(1), S.savedTo('Inbox', ''), S.taskDraftSaved, S.taskDraftMemory, S.taskDraftUnconfirmed];
    expect(new Set(labels).size).toBe(labels.length);
    for (const local of [S.draftMemory, S.draftSaved]) expect(local).toContain('not uploaded');
    expect(S.savedTo('Inbox', '')).not.toContain('device');
  });
});
