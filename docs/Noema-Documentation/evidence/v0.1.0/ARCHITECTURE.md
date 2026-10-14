# Architecture and continuation notes

## Keep the app independent of inference

The current core is one process serving a static application and an API. SQLite WAL stores durable application state. A single background thread wakes for durable jobs/reminders, and optional speech runs in a subprocess. No PostgreSQL, Redis, Celery, vector database, browser-automation agent or separate frontend build is required for this personal first release.

The previous React/PostgreSQL proposal was intentionally simplified for the hardware/compute constraint. This is not a claim that a framework alone determines resource usage. Native shells can later host the same interface and API without changing task/note semantics.

## Data model

- **Task:** desired outcome, status, dependencies, start/deadline, explicit next action, optional session link, version and priority choice.
- **Run:** one agent attempt for one task, last sequence/event/time, state; task completion is never inferred from process exit.
- **Note:** immutable typed raw input and first transcript; separate editable body, title/folder, revision history, optional task association.
- **Attachment:** random storage filename, verified file signature category, original display filename and note ownership.
- **Reminder:** durable task-linked instant/state, independent of transient browser notification delivery.
- **Job:** queued/running/done/error AI/transcription attempt, expected note version.
- **Token:** hashed scoped agent/observer credential, with selected task access for agents.
- **Context:** latest explicitly observed app/title/workspace/output metadata, rule mapping, age; not a screen-recording archive.

IDs are random. SQL is parameterized. User/model text is treated as text in the interface; the limited Markdown renderer does not execute HTML.

## Capture and editing consistency

1. The browser retains the unsaved draft locally; a recording is only an attachment after Stop.
2. Explicit Save first writes a local outbox record containing the capture ID, text and files.
3. Multipart upload validates content size/types. The server uses capture ID plus a content fingerprint for idempotency.
4. A repeated matching capture returns its existing note; reuse of an ID for changed content is rejected.
5. The original and attachments commit before optional model processing.
6. Revision updates require the expected version. An edit conflict returns 409 rather than overwriting unseen changes.
7. A late AI result becomes a separate suggestion if a newer manual edit exists.

Browser transport/storage were tested through adapters in this environment; actual native browser storage and failure behavior still need device validation. There is no cross-device CRDT or import/merge service yet.

## Priority and availability

Explicit priority overrides are stable. Automatic priority currently promotes due-within-48-hours tasks and tasks blocking other unfinished tasks, demotes parked/explicitly optional work, and otherwise defaults to medium. It does not assign a medical/legal/financial risk category or invent a deadline from arbitrary text.

Availability independently excludes future-start work, unresolved dependencies, waiting/blocked/parked/done tasks, current focus and tasks with active/needs-input/failed runs. A time filter requires a known fitting estimate. A review result can be both actionable and in the attention queue: these are views, not duplicated records.

The user's selected/pinned focus wins over context rules. Matching requires explicit application/title rules; no match leaves focus unchanged rather than creating a fabricated inference.

## Events and reminders

Events are scoped to a run/task. Each event has a stable ID, increasing sequence, kind and bounded message. Duplicates are idempotent, mismatched reused IDs conflict, older sequences are ignored, terminal runs cannot reopen through a delayed heartbeat. Lack of a heartbeat is displayed as unknown after the stale threshold, not automatic success/failure.

The wrapper queues events before delivery, gives the child no Noema integration/admin token, inherits terminal output, and never runs a shell string on behalf of remote requests. The server does not execute commands supplied through the event API.

Due reminder records survive restarts. Desktop notifications are merely optional browser delivery. The reminder clock still depends on the machine's clock; notifications are not guaranteed when the host/browser is stopped.

## Resource policy

No heavy inference at idle. Optional AI jobs serialize. Speech is CPU INT8/four threads in an isolated process. Ollama requests use four threads and `keep_alive: 0`. Task ranking and agent state never require inference. Motion is opt-in, modest, reduced-motion aware and paused when hidden. The native Sway cat uses GTK rather than another webview.

Actual full-app RSS, device battery and speech/vision latency must be measured on the laptop. The QA backend-only idle sample is not a substitute.
