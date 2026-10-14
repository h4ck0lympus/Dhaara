# Architecture and continuation notes

## React + Electron (current)

The browser UI is a typed React bundle in `web/` (React, TanStack Query and
Router with hash history, zod-validated API responses). FastAPI serves
`web/dist` through explicit routes: `/`, content-hashed `/assets/*` (immutable),
`/sw.js`, `/manifest.webmanifest` and `/icon.svg`. Without a build, `/` returns a
503 that names the build command and the API keeps working. Node 22 is needed to
build, never to run the service.

Local persistence keeps IndexedDB `dhara-local-v1` version 1 with the same `kv`
(`draft`, `task-draft`, `snapshot`) and `outbox` record shapes as the old UI, so
captures queued before the cutover upload once with their original ids. The UI
never retries a mutation automatically; only the capture outbox and "Retry add
task" replay, with the same idempotency key. Every edit sends
`expected_version`; a 409 shows a conflict and never overwrites.

The desktop shell is Electron (`electron/`), loading the same origin with a
sandboxed renderer, same-origin navigation and session-only permission
decisions. Linux `--manage-service` uses lifecycle protocol 2 (stdin lease,
stdout acknowledgement, fixed 127.0.0.1:8765, own process group); see
[DESKTOP.md](DESKTOP.md). The Rust Wry/Tao shell (`desktop/`), the `public/` UI
and the browser kitten preview were removed. The Python Sway helper is unchanged
apart from its sprite path, `tools/assets/cat.png`.

The background terrain (`web/src/ui/BackgroundField.tsx`) is WebGL2: one height
pass per frame into a 120×70 texture plus instanced strokes, 12 fps through
`setTimeout`, a half-resolution backing store, and the states `unsupported`,
`static`, `paused` and `animated`. Motion defaults to off and the terrain is
never drawn under `[data-quiet]` reading or editing surfaces. Its measured cost
is in [TEST_REPORT.md](TEST_REPORT.md).

This supersedes only the handbook's "current static UI" decision (§18/§27);
SQLite and the service are unchanged.

## Frictionless explicit task capture · 2026-10-09

The existing service/UI now offer one-input Add task with collapsed Details.
`dhara/task_capture.py` applies only disclosed first-line/explicit-label/planned-
day rules, without model calls, window association or task jobs. Unknown workflow
stays Unassigned; priority and availability algorithms are unchanged. The new
`task_captures` table stores immutable original/fingerprint/initial interpretation
with its task in one transaction. An additive `planned_on` task column keeps
calendar planning separate from deadlines/reminders/not_before. Idempotent retries
return current task state without reapplying interpretation; versioned edits
retain stale-write protection. Existing rows, structured clients and originals
are preserved; export includes task originals.

The existing IndexedDB kv store has a separate task-draft record, not a task
outbox. Native Close also checkpoints it; failed checkpoint keeps the shell open.
No offline task-added claim, background task interpretation, new framework,
permission, AI provider or task voice path. [Permanent contract](TASK_CAPTURE.md).

## Native Sway companion continuation

`tools/companion_state.py` contains conservative presentation and placement
helpers; `tools/sway_companion.py` remains a separate GTK3/layer-shell process,
not a new main-app framework. It consumes the existing observer-scoped summary
and optional metadata endpoint. The summary now includes the existing saved
`next_action` beside each available task's title, ID and priority. Available
ranking, SQLite schema and authentication scopes/middleware are unchanged.
Local Cat/Dot/Hide and sizes reset on restart, with a 24–40 px sprite bound and
server Hidden taking precedence. Applying local controls retains placement.

The optional polling thread is gated by explicit launch opt-in, server
permission and a local pause event. Pause prevents future polls, not another
observer or an already in-flight report. Global pause remains in real web
Settings. The controls distinguish permission from fresh/stale reports and
their own polling switch. Layer surfaces keep keyboard mode NONE even during
interaction. GTK popovers are non-modal, without an input grab or desktop
dimming. Native controls are transient, not a permanent overlay panel.
The unchanged approved sprite is rendered on a scale-aware Cairo surface inside
a pale-sage bordered/shadowed container: default 40 in 56 logical pixels, 32 in
48. Four pixels around each edge accommodate the shadow. Scale changes rebuild
the buffer, not the bitmap file. GTK's monitor-constrained popover placement and
a height-limited scroller keep the task panel/menu compact at tested scaling.
The resting surface contains only the kitten (or explicit Dot/Hidden). Click
shows one server-ranked available task and its saved action; secondary controls
are behind Companion menu. Changes to available work refresh an open task panel.
The web `#settings` deep link opens the existing settings dialog rather than
a new screen. Its hash handler restores the previous route without rerendering
an open Capture/note editor; startup linking renders Now behind the dialog.
The analogous `#task/<id>` link opens the existing task dialog, rendering Plan
behind it on startup. A task without a saved action gets an explicit missing-
action message, not an invented step. These links use the existing browser
launcher; OS dispatch into the Rust shell is not implemented or tested.

There is no reliable native-presence endpoint/heartbeat. The app preview remains
explicitly labeled, rather than disappearing based on inferred presence.
Event-triggered companion attention messages remain unimplemented.

`qa/sway_check.py` starts an entirely private headless compositor from
`qa/sway.config`, two synthetic outputs and a temporary service/profile. Its
GTK probe guards against a non-fixture socket before screenshots/commands.
It tests the real GTK3/layer-shell companion mapping, not physical hardware
input. Its Rust/Wry webview checks were removed with the shell at the cutover;
the kitten suite has not been rerun since, and Stage A of
`docs/PHYSICAL_SWAY_ACCEPTANCE.md` validates it.

## Now presentation refinement (historical; ported to web/src/domain/nowState.ts)

Pure helpers inside `public/app.js` classify the existing snapshot and label
focus/reporting/observation evidence. They do not write task state, recalculate
priorities, infer agent completion or create tasks from notes. Attention comes
from the service, then available work in its supplied order; an eligible
existing focus can be continued when nothing else is actionable. Other
suggestions stay under a disclosure. Disconnection suppresses recommendations
and labels cached focus rather than asserting current status.

There is no integration-connectivity API. Recent run reports, stale reports,
questions and zero reported runs are shown as different evidence; tokens or
zero running counts are not proof of connected/disconnected integrations.
The on-demand kitten dialog edits existing preferences through the existing
API with serialized writes. It neither launches an observer nor captures a
screen. No framework, service schema, inference or native helper is replaced.

## Rust webview desktop shell (historical; removed at the React + Electron cutover)

`desktop/` uses Rust Wry/Tao to display the existing HTML/CSS/JavaScript in a
system webview. The rejected CXX-Qt/QML presentation layer has been removed.
The existing loopback Python service owns SQLite and task/note semantics;
there is no duplicate Rust API client or UI data model. The normal browser
interface remains available. The desktop webview has a dedicated persistent
profile and the same IndexedDB draft/outbox code, plus a window-close draft
checkpoint. An OS file lock prevents concurrent use of that profile by two
shells. The shell event loop waits when idle; the unchanged web app retains
its existing refresh/animation behavior. See [DESKTOP.md](DESKTOP.md).

Linux opt-in `--manage-service` adds `desktop/src/service.rs`, a background Rust
owner with explicit retry, no restart loop and bounded readiness/shutdown. The
existing `run.py` delegates its private managed descriptor/lease protocol to
`dhara/desktop_service.py`; manual startup remains available/default. The owner
prebinds the stable loopback listener and holds a canonical-workspace OS lock
also used by manual `run.py` launches. Private startup acknowledgement verifies
workspace/PID/instance, then `/api/desktop-instance` verifies the same identity
before webview navigation. This is not a second task API/backend or secret-
transport bridge. Existing auth/origin/session guards remain in place.

Close keeps the existing frontend checkpoint, then closes the owner lifetime
pipe and boundedly stops/reaps only its child group. Hide is not quit; an
external service is never stopped. Linux parent-death pipe cleanup is tested
under SIGTERM/SIGKILL with disposable processes; physical Sway and power-loss
behavior are separate. On crash, compact native Retry reconnects the loaded
editor without changing profile/origin or navigating away from draft state.
Managed mode disables inherited optional model configuration, adds no observer/
microphone startup and does not orchestrate the separate companion.

## Keep the app independent of inference

Desktop direction: the shell was chosen by measurement, not preference. The
2026-10-10 headless-Sway benchmark selected Electron over Wry/WebKitGTK (decision
1A in the migration spec); the Slint and Rust/Qt-QML comparison is closed.

The current core is one process serving a prebuilt React bundle and an API.
SQLite WAL stores durable application state. A single background thread wakes
for durable jobs/reminders, and optional speech runs in a subprocess. A Node
build step produces the bundle; Node is not a runtime dependency. No PostgreSQL,
Redis, Celery, vector database or browser-automation agent is required.

The earlier React/PostgreSQL proposal was simplified for the hardware
constraint. React returned at the cutover as a frontend only; SQLite stays. A
framework alone does not determine resource use; measured numbers live in
[TEST_REPORT.md](TEST_REPORT.md).

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
2. Explicit Save inserts the capture ID, text and files into the outbox and
   resets the stored draft in one IndexedDB read/write transaction spanning
   `kv` and `outbox`. The editor resets only after transaction completion;
   aborted writes retain the draft and roll back the queue insertion.
   Draft writes are serialized and the pending input debounce is cancelled on
   Save. Capture controls are disabled during the local commit.
3. Multipart upload validates content size/types. The server uses capture ID plus a content fingerprint for idempotency.
4. A repeated matching capture returns its existing note; reuse of an ID for changed content is rejected.
5. The original and attachments commit before optional model processing.
6. Revision updates require the expected version. An edit conflict returns 409 rather than overwriting unseen changes.
7. A late AI result becomes a separate suggestion if a newer manual edit exists.

The continuation harness additionally tests actual headless Chrome HTTP,
IndexedDB/Blob persistence, service-worker offline loading and browser/server
restart with disposable profiles. Quota and transaction failures and lost
acknowledgments are injected; physical disk-full/power-loss behavior and target
devices remain unvalidated. Local open failures can retry without a reload;
the UI reports pending, committed and failed draft writes separately. Schema
version 1, database name and existing records are unchanged. There is no
cross-device CRDT or import/merge service yet. The browser still shares one
draft across tabs; concurrent draft editing is an outstanding gap.

## Priority and availability

Explicit priority overrides are stable. Automatic priority currently promotes due-within-48-hours tasks and tasks blocking other unfinished tasks, demotes parked/explicitly optional work, and otherwise defaults to medium. It does not assign a medical/legal/financial risk category or invent a deadline from arbitrary text.

Availability independently excludes future-start work, unresolved dependencies, waiting/blocked/parked/done tasks, current focus and tasks with active/needs-input/failed runs. A time filter requires a known fitting estimate. A review result can be both actionable and in the attention queue: these are views, not duplicated records.

The user's selected/pinned focus wins over context rules. Matching requires explicit application/title rules; no match leaves focus unchanged rather than creating a fabricated inference.

## Events and reminders

Events are scoped to a run/task. Each event has a stable ID, increasing sequence, kind and bounded message. Duplicates are idempotent, mismatched reused IDs conflict, older sequences are ignored, terminal runs cannot reopen through a delayed heartbeat. Lack of a heartbeat is displayed as unknown after the stale threshold, not automatic success/failure.

The wrapper queues events before delivery, gives the child no Dhara integration/admin token, inherits terminal output, and never runs a shell string on behalf of remote requests. The server does not execute commands supplied through the event API.

Due reminder records survive restarts. Desktop notifications are merely optional browser delivery. The reminder clock still depends on the machine's clock; notifications are not guaranteed when the host/browser is stopped.

## Resource policy

No heavy inference at idle. Optional AI jobs serialize. Speech is CPU INT8/four threads in an isolated process. Ollama requests use four threads and `keep_alive: 0`. Task ranking and agent state never require inference. Motion is opt-in (off by default), 12 fps, reduced-motion aware, and paused when hidden, blurred or idle for 60 s. The native Sway cat uses GTK rather than another webview.

The main app process tree (Electron plus the service, no AI) is measured against the handbook's < 400 MB aspiration in TEST_REPORT. Device battery and speech/vision latency must still be measured on the laptop.
