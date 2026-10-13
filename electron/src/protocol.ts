// IPC channel names, page event names and startup texts shared by main, the preloads and the tests.
export const IPC_PAGE = 'dhara:ipc';
export const IPC_STARTUP_RETRY = 'dhara:startup-retry';
export const IPC_STARTUP_CANCEL = 'dhara:startup-cancel';
export const IPC_STARTUP_STATUS = 'dhara:startup-status';
export type StartupStatus = { text: string; busy: boolean; mode: 'startup' | 'overlay' };
// Must equal web/src/events.ts (test/preload.test.ts).
export const CHECKPOINT_CLOSE = 'dhara:checkpoint-close', SERVICE_DOWN = 'dhara:service-down', SERVICE_UP = 'dhara:service-up', CLOSE_APPROVED = 'dhara:close-approved';
// desktop/src/main.rs:229 and :366.
export const STARTUP_TEXT = { starting: 'Starting the managed local service…', cancelling: 'Cancelling managed startup…' } as const;
export const CLOSE_TIMEOUT_MS = 10_000;
export const NOT_RESPONDING = 'Dhara is not responding to the close request.';
// Verbatim web/src/strings.ts S.closeCheckpointFailed (the page cannot show it when its script cannot run).
export const CHECKPOINT_FAILED = 'Could not checkpoint your draft. Keep Dhara open and retry the local save.';
