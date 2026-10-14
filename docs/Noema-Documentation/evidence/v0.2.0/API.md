# Local API and agent integration

Base URL: `http://127.0.0.1:8765/api`.

Use an agent token restricted to the relevant task, not the installation's admin token. Add `Authorization: Bearer <token>`. Helpers read it from `NOEMA_TOKEN`; the API never launches a supplied command.

The full authenticated OpenAPI JSON is available at `GET /api/openapi` to the admin. Example IDs below are placeholders; create a real task through the interface first.

## Run lifecycle

Create a run:

```http
POST /api/runs
Authorization: Bearer <task-scoped token>
Content-Type: application/json

{
  "task_id": "REAL_TASK_ID",
  "run_id": "unique_run_attempt_id",
  "agent": "Coding agent",
  "session_url": ""
}
```

Persist the returned run ID. Send events with increasing sequence numbers starting at 1:

```http
POST /api/runs/REAL_RUN_ID/events
Authorization: Bearer <task-scoped token>
Content-Type: application/json

{
  "event_id": "unique_stable_event_id",
  "seq": 1,
  "kind": "started",
  "message": "Investigating the failing test."
}
```

Supported kinds: `started`, `heartbeat`, `progress`, `needs_input`, `completed`, `failed`, `cancelled`. Event/run IDs have bounded alphanumeric/underscore/hyphen syntax. Reuse the same ID and payload for retries; do not regenerate an event ID after a timeout.

A `needs_input` event means attention is required, not that the task is completed. A `completed` run becomes ready for review, and the task stays unfinished. A new attempt should receive a new run ID; delayed heartbeats cannot reopen a terminal run.

A scoped agent can read `GET /api/agent/tasks/REAL_TASK_ID`, but not `/api/state`, the note library, or tasks outside its selected scope. Revoking a token prevents future requests; it does not terminate an independently running OS process.

## Window observer

Observer token scope is separate. The server's explicit observation toggle must be enabled before it accepts a context update:

```http
POST /api/context
Authorization: Bearer <observer token>
Content-Type: application/json

{
  "device": "laptop",
  "app": "firefox",
  "title": "Example problem",
  "workspace": "3",
  "monitor": "eDP-1"
}
```

The helper uses `GET /api/companion` for its small summary and settings. It does not receive general note-library access. This metadata route matches user-created app/title rules. A manually pinned task takes precedence. Pixel interpretation is separate and requires the screen scope described below.

## Screen session (experimental, local only)

Create a **screen** token in Settings; a legacy observer or agent token cannot begin image capture. First the admin must enable both observation toggles and specify exact app/project allowlists. The configured server must have a local vision model and the optional image dependency. Use the same screen token for each session request; session IDs are temporary secrets owned by that token.

| Route | Body / behavior |
|---|---|
| `GET /api/screen` | State, cooldown, metrics and optional suggestion; no screenshot retrieval endpoint. |
| `POST /api/screen/session` | `{"consent": true}`; returns session ID, one-hour expiry, heartbeat/interval bounds. Refuses a second active session. |
| `POST /api/screen/context` | `{"session_id": "…", "context": {device, app, title, workspace, monitor}}`; renews 90-second lease and invalidates old-window work. |
| `POST /api/screen/frames` | Same session/context plus `"image"` containing base64 PNG/JPEG/WebP. Returns accepted/skipped reason; HTTP 202 does not itself mean inference or success. |
| `POST /api/screen/stop` | Session/context; ends that owner's active session. |
| `POST /api/screen/hold` | Temporarily suspends pixel capture while the companion menu is open; observer/screen/admin allowed. |
| `POST /api/observation/pause` | Disables observation and ends session; observers may pause but cannot enable permissions. |
| `POST /api/screen/accept` | Admin only, `{"result_id":"…"}`; accept a fresh suggestion and pin that task. |
| `POST /api/screen/dismiss` | Admin only, same body; clears suggestion without changing focus. |

Context fields in braces above are schematic; send valid JSON with quoted keys and actual values as in the metadata example. Session creation consent must literally be `true`. Revocation/permission changes require an explicit new helper session. Pixel frames never use a durable retry outbox. Respect `can_capture` and `retry_after`; submit current pixels only. A successful model response still is not evidence that the user worked on or completed a task.

Settings keys are `screen_enabled` (default false), `screen_apps` (exact IDs), `screen_projects` (exact task project names), `screen_interval_seconds` (120–3600), and `screen_focus_mode` (`suggest` or `automatic`, default suggest). Existing `observation_enabled` must also be true. New setting values merge with older installations without erasing existing preferences.

See [SCREEN_AWARENESS.md](SCREEN_AWARENESS.md) for operational/privacy boundaries. This API has no remote screenshot-upload deployment recipe; the supplied helper and inference adapter use loopback only.

## Main app endpoints

The UI already exercises these; direct scripting is optional.

| Route | Purpose |
|---|---|
| `POST /api/session` | Local/admin-token browser session. |
| `GET /api/state` | Snapshot of tasks, notes index, runs, attention, available work, settings and capabilities. |
| `POST /api/tasks`, `PUT /api/tasks/{id}` | Create/update task; update includes `expected_version`. |
| `POST /api/focus` | Set/clear focus and manual pin. |
| `POST /api/captures` | Multipart `payload` JSON plus zero or more `files`; capture ID makes retries safe. |
| `GET /api/notes/{id}`, `PUT /api/notes/{id}` | Read/update note; update includes `expected_version`. |
| `GET /api/notes/{id}/history` | Prior revisions. |
| `POST /api/notes/{id}/restore/{version}` | Restore as a new version; includes `expected_version`. |
| `POST /api/notes/{id}/organize` | Queue optional local cleanup. |
| `POST /api/notes/{id}/transcribe` | Queue optional CPU transcription. |
| `GET /api/search?q=...` | Bounded lexical note search; not embedding search. |
| `POST /api/reminders` | Schedule task reminder with timezone-aware ISO timestamp. |
| `POST /api/reminders/{id}/snooze` | Shift a reminder by an explicit duration. |
| `DELETE /api/reminders/{id}` | Dismiss reminder. |
| `POST /api/tokens`, `DELETE /api/tokens/{id}` | Create/revoke scoped integration access. |
| `GET /api/export` | Portable ZIP of data and attachments, excluding secrets/context. |

Tasks use `todo`, `active`, `waiting`, `blocked`, `review`, `parked`, `done`. Priorities are `auto`, `high`, `medium`, `low`. Explicit date fields require timezone offsets; the UI converts local date/time input. Dependencies must be existing tasks and must not create cycles.

## Reliability rules for adapters

Queue events before sending. Retry the same event ID/sequence/payload. Keep separate outboxes when tokens have different allowed-task scopes. Do not send periodic `completed` events just because a terminal is quiet. Heartbeats establish observer/process liveness only, not useful progress. Never assert that the task itself is verified because an agent returned a result.
