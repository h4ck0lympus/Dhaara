# Frictionless task capture · permanent product requirement

An explicit **Add task** action opens one initially focused multiline input:
“What do you need to do?”, Add task, and collapsed Details. One sentence is
enough. Enter inserts a newline; Ctrl/Command + Enter submits. No workflow,
priority, status, next action, date, estimate, dependency or link is required.
This is the task-creation contract, not a temporary shortcut to a database form.
The existing Now/Capture/Notes/Plan layout, framework and kitten are unchanged.

After a durable service response, the dialog closes back to its previous page
and a compact confirmation offers Edit. Creating a task never changes focus.
Editing existing tasks retains every mounted Details field even while collapsed;
unchanged deadline/availability timestamps retain their original precision.
Ordinary Capture is still learning-note capture, not implicit task creation.

## What the interpretation actually does

No model is required, started or called. The disclosed, limited rules use the
first nonempty line (whitespace condensed, an excerpt with ellipsis when needed)
as the title. The complete original is immutable and available in task details
and export. It is separate from editable title/context/next action.

- An explicit `Workflow: ...`, `Next action: ...` or `Context: ...` line is
  retained in the matching field. Chosen Details override these rules.
- Otherwise workflow is **Unassigned**, not inferred from a window, pinned
  focus, project list or unrelated activity. No project classifier is claimed.
- Unqualified today/tomorrow at the beginning/end of the thought or in an explicit
  Plan label, and a clear `on YYYY-MM-DD` / `Planned: YYYY-MM-DD`
  set **planned_on**, a calendar day. Relative days use the device's local date
  captured with the first submission and persisted for retries.
- Uncertain wording, multiple days, invalid dates, weekdays/next-week phrases,
  deadline/reminder/availability wording stay in the original. A small retained-
  date notice and Edit allow correction without blocking task creation.
- A planned day is not a deadline, reminder, availability gate or ranking change.
  Existing automatic priority rules remain in force; manual overrides survive.
- No estimate, URL, dependency, reminder time or additional commitment is inferred.
  A paragraph creates one task, never an automatic task split.

This is not general natural-language understanding. Automatic timezone-aware
deadline/availability/reminder extraction and richer configured-provider task
organization are **not implemented**. There is no delayed task interpretation
worker; capture retries only read current task state and cannot reapply old
interpretation over manual edits. Versioned edits reject stale writes. Pin and
agent-review behavior are unchanged. Capture explanation describes the initial
rules; explicit user corrections take precedence over that historical metadata.

## Persistence and recovery

`POST /api/task-captures` uses a stable capture ID, raw input, local day and
optional chosen details. Task insertion and immutable original/fingerprint
insertion commit in the same SQLite transaction. Concurrent/repeated identical
submissions return the existing current task; changed input under the same ID is
409, not another task. Existing `POST /api/tasks` remains available for structured
clients, and `PUT /api/tasks/{id}` retains optimistic versions. The additive
schema migration retains existing rows/fields; old clients omitting planned_on
do not clear it. Export now includes task originals.

The separate `task-draft` key in the existing IndexedDB `kv` store preserves
input, chosen details and an unconfirmed submission payload. It is **not** the
note outbox and **not** offline task saving. Local draft/identity must commit
before the HTTP submission. No durable response means “Not confirmed added”,
not a success. An unconfirmed attempt freezes its contents and offers Retry add
task, preventing an accidental changed-payload duplicate. Repair storage/service
and retry; no automatic submission or restart loop is introduced.

ESC, Close and outside dismissal checkpoint the draft. If local draft storage
fails, the dialog stays open with the input and retry advice. Successful task
storage may precede a lost reply; replay of the persisted attempt resolves that
uncertainty without duplication. If clearing the local draft fails after actual
server acknowledgement, the task is still saved; recovering/retrying the old ID
does not recreate it. Reopen with the same profile/origin to recover local drafts.
Clearing site storage removes drafts; concurrent tabs still share a task draft.

Rust Close now checkpoints the task draft as well as the existing note draft;
task-checkpoint failure keeps the shell open. Hide remains different from Quit.
Abrupt shell/browser death can only retain already committed local drafts, not
arbitrary last-keystroke or power-loss recovery.

## Voice and device boundaries

No task voice button is shown: there is no supported task-specific recording /
transcription-to-input path. Existing explicit note audio capture is untouched.
The reported WebKit/GStreamer recording dependency problem is diagnosed, not
installed/fixed or device-accepted in this milestone. No microphone was opened.

Before/after desktop and 390px phone-width views, actual Chromium tests, real
SQLite failures/retries and actual Rust/WebKit restart/checkpoint evidence are
linked in [TEST_REPORT.md](TEST_REPORT.md). They are not physical keyboard,
phone hardware, microphone, Sway monitor or performance validation. Physical
Sway acceptance and A-FOCUS-01 remain pending independently.

## Try it

Restart the existing service (or close/reopen opt-in managed Dhara) to load the
new API, and reload the client. Keep the same data directory, profile and origin;
do not switch to a test notebook. Click Add task, type a sentence and press
Ctrl/Command + Enter. To check recovery safely, use the existing disposable
[physical fixture instructions](PHYSICAL_SWAY_ACCEPTANCE.md), enter a task draft,
close/reopen normally, and reopen Add task. Saving a task must not replace a pin
or turn a learning note into a task. Device results remain to be recorded.
