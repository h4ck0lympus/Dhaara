// IPC channel names, page event names and startup texts shared by main, the preloads and the tests.
export const IPC_PAGE = 'noema:ipc';
export const IPC_STARTUP_RETRY = 'noema:startup-retry';
export const IPC_STARTUP_CANCEL = 'noema:startup-cancel';
export const IPC_STARTUP_STATUS = 'noema:startup-status';
export type StartupStatus = { text: string; busy: boolean; mode: 'startup' | 'overlay' };
// Must equal web/src/events.ts (test/preload.test.ts).
export const CHECKPOINT_CLOSE = 'noema:checkpoint-close', SERVICE_DOWN = 'noema:service-down', SERVICE_UP = 'noema:service-up', CLOSE_APPROVED = 'noema:close-approved';
// desktop/src/main.rs:229 and :366.
export const STARTUP_TEXT = { starting: 'Starting the managed local service…', cancelling: 'Cancelling managed startup…' } as const;
export const CLOSE_TIMEOUT_MS = 10_000;
export const NOT_RESPONDING = 'Noema is not responding to the close request.';
// Verbatim web/src/strings.ts S.closeCheckpointFailed (the page cannot show it when its script cannot run).
export const CHECKPOINT_FAILED = 'Could not checkpoint your draft. Keep Noema open and retry the local save.';
