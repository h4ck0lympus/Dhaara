# Noema · 0.1.0

See [the maintained progress record](docs/PROGRESS.md) for what is built,
what has been tested, remaining milestones and the next concrete step.

Current status: **physical Sway acceptance BLOCKED ON DEVICE; Rust-owned service
lifecycle implemented as Linux development opt-in, not device-accepted**. Live Sway inventory is available, not physical-input
evidence. Use the [single isolated device checklist and resource sampler](docs/PHYSICAL_SWAY_ACCEPTANCE.md).
The externally started Python service remains the default. To opt in, use
`desktop/target/debug/noema-desktop --manage-service --data-dir /absolute/workspace`
with the same stable `--server` and persistent `--profile` on every launch.
See [ownership, launch, quit and retry instructions](docs/DESKTOP.md).
No framework or companion redesign is part of this pass.

Frictionless task capture (2026-10-09, unreleased): **Add task** now opens one
focused multiline input and collapsed Details. A sentence is enough;
Ctrl/Command + Enter adds, ordinary Enter inserts a newline. Original wording is retained,
limited rules distinguish a planned day from deadlines/reminders, and retries
cannot duplicate a capture. Task drafts recover separately from learning notes;
they are not an offline task queue. See [the permanent requirement and limits](docs/TASK_CAPTURE.md),
[before/after images](qa/task-capture/README.md), and [newly executed tests](docs/TEST_REPORT.md).
Restart the service/managed app and reload the client to use the new API; retain
the same workspace/profile/origin. No task voice or richer AI path is claimed.

Workspace continuation (unreleased): capture Save now commits the browser queue
and draft reset atomically. Local-save failures remain visible and can be retried
without losing editor text. Native headless-Chrome persistence checks are in
`qa/native_storage_check.py`; see [the continuation note](docs/CONTINUATION.md).
The actual application is still based on v0.1.0. The documentation bundle's
v0.2.0 reports describe an archived release, not screen-awareness code in this workspace.

The **Rust webview desktop shell** in `desktop/` now loads the original web
interface, replacing the rejected Qt/QML prototype. The Python service and
existing notebook data are unchanged. The shell uses Wry/Tao, not a new UI;
its private persistent browser profile reuses the existing draft/outbox logic.
See [desktop launch instructions and validation boundaries](docs/DESKTOP.md).
Existing Chrome/browser drafts are not automatically moved into that profile.

Now-screen refinement (unreleased): stronger secondary-text contrast, tighter
spacing, one grounded next action with disclosed alternatives, distinct empty /
waiting / human-attention / complete / unknown states, and correctly labeled
selected/inferred/pinned focus. Click the small kitten for mode, size and window-
metadata permission controls. Permission is not proof of an active observer.
The backend and webview framework are unchanged. Now-state results remain in
`qa/now-ui/`; earlier screenshots were removed at your request. Current native
views are in `qa/sway/after/`, with the newly requested kitten visibility
before/after set in `qa/kitten-visibility/`, plus three pointer-pass views in
`qa/companion-input/after/`; see [verification](docs/TEST_REPORT.md). There are
39 current QA PNGs: those preserved 33 plus [two current managed-desktop Now captures](qa/managed-service/screenshots-2026-10-08/README.md)
and [four task-capture before/after views](qa/task-capture/README.md).
These new captures use a synthetic private-X11 fixture, not physical Sway
acceptance; earlier screenshot inventories below are historical.

A quiet place for what you are learning, what your agents are doing, and what you can do next.

This is a **runnable local development release**, not just a UI mockup. The server persists notes, attachments, tasks, reminders, agent events, and revisions. The interface uses those real APIs. It starts empty; the example content in the screenshots belongs to disposable tests, not your workspace.

**No GPU, Node build, paid API key, account, or AI model is required for the base app.** Optional local models provide transcription and note rewriting. The default app does not record your microphone, capture your screen, download models, or contact an AI service.

## Start here

Requirements: Python 3.11 or newer, a current browser, and internet access to install the Python dependencies once. Python 3.13.5 was exercised in this build environment; other operating systems and optional speech wheels still need device testing.

### Linux / macOS

From the extracted `noema` directory:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python run.py --open
```

The interface is at `http://127.0.0.1:8765`. Stop the server with Ctrl-C. Starting it again opens the same saved workspace.

### Windows PowerShell

Activation is not required:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe run.py --open
```

This distribution contains portable source, not a Windows installer, macOS application bundle, or Android APK. Native packaging has not been tested.

### A stable data location

The default data directory is `.data` beside `run.py`. To keep data independent of code upgrades:

```bash
python run.py --data-dir "$HOME/.local/share/noema" --open
```

Use the same path on subsequent starts. Files include `noema.sqlite3`, an `attachments/` directory, and `admin.token`. Keep the directory private. An OS account with access to these files can read the data; this build does not encrypt it at rest.

## First five minutes

1. Open **Plan** and click Task. Type a sentence and Add task. Details and next actions are optional; priority remains Automatic unless you choose an override. A planned day is separate from a deadline, reminder or availability constraint.
2. Open **Now**. Choose a focus. “Available now” excludes work with unresolved dependencies, tasks intentionally parked, and tasks waiting on an active agent. It explains the priority/ranking decision rather than invoking a model for every refresh.
3. Open **Capture** and dump a thought. Paste an image, drop a screenshot, or use Sketch. **Save note** sends the bundle to the server. Before that, the draft stays in this browser's local storage.
4. Read the saved note in **Notes**. The original is separate from the editable note. Edits create revisions; restoring an older version creates another revision instead of destroying history.
5. To track a command or agent, create a task-scoped token in Settings and use the wrapper described below.

You do not have to create tasks from learning notes. Linking a note to a task is optional. Tentative ideas in notes are not automatically turned into obligations.

## What is implemented

| Area | This release |
|---|---|
| Interface | Responsive Now, Capture, Notes, Plan; minimal charcoal layout; original sparse dot field inside the app; optional low-rate motion and reduced-motion handling. |
| Knowledge capture | Text, image uploads/paste/drop, simple sketch canvas, microphone recording after permission. Text and attachments are saved as one idempotent capture. |
| Organizing notes | Conservative keyword folder assignment by default. **It does not rewrite grammar without a model.** Optional local Ollama adapter produces an editable organized note while preserving the original. |
| Voice | Records and saves audio. Optional faster-whisper CPU worker transcribes after saving. **No live transcript in this release.** |
| Recovery | Local browser draft/outbox, retry on reconnect, explicit failed-upload queue, original capture, note revisions, optimistic edit-conflict detection. |
| Tasks | Dependencies, future start, due dates, estimates, notes/session links, transparent automatic priorities, persistent manual priority overrides, manual or inferred focus. |
| Next action | Deterministic “What can I do now?” selection from existing actionable tasks; unknown estimates are not fabricated. |
| Agent lifecycle | Scoped event API and real subprocess wrapper; ordered/deduplicated events, stale-run status, durable wrapper outbox. An exited agent produces a review item, not a completed task. |
| Reminders | Persisted schedule, in-app due queue, snooze/dismiss, due processing after server restart. Optional browser notification while the app is running. |
| Window context | Experimental opt-in Sway metadata observer with application/title-to-task rules. Pinned focus wins. **No screenshot capture or vision inference.** |
| Companion | Tiny browser preview plus separate experimental native GTK/Sway cat/dot helper, output/workspace placement code and click-to-expand task list. |
| Portability | Markdown/JSON/attachment export. One local SQLite server, no managed cloud account or automatic synchronization of independent installations. |

More precise boundaries and remaining milestones are in [BUILD_STATUS.md](docs/BUILD_STATUS.md).

## Optional local note cleanup

The app works without this. This adapter sends saved note text to a separately running local Ollama service. It does not send screenshots, run tools, or give the model access to your entire notebook.

Install/start Ollama separately using its official instructions. Choose a model that is available on your machine. For an initial CPU experiment, the following uses a compact model; its quality on your technical notes **has not been measured by this release**:

```bash
ollama pull qwen2.5:3b
export NOEMA_MODEL='qwen2.5:3b'
python run.py --open
```

`ollama pull` explicitly downloads model files. It is not part of ordinary Noema startup. On PowerShell, set `$env:NOEMA_MODEL = 'qwen2.5:3b'` instead of `export`.

The worker uses one job at a time, four inference threads, a bounded context, a 14,000-character input limit, and `keep_alive: 0` to request model unloading after a job. Longer captures remain safely saved and receive an explanatory processing error; automatic chunking is not implemented yet.

Ollama defaults to `http://127.0.0.1:11434`. Change `NOEMA_OLLAMA_URL` only when necessary. A non-loopback model host also requires `NOEMA_ALLOW_REMOTE_MODEL=1`, because note content would leave the machine. Remote authentication/TLS for model services is not managed here.

Cleanup output is validated for shape, not factual accuracy. It can still be wrong. The original and all revisions remain accessible. If you edit while a model is working, its late result becomes a separate suggestion instead of overwriting your changes. The first version uses a small fixed folder taxonomy; arbitrary project-folder learning and robust mixed-topic splitting remain future work.

Official references: [Ollama generate API](https://docs.ollama.com/api/generate), [structured output](https://docs.ollama.com/capabilities/structured-outputs), [model listing](https://ollama.com/library/qwen2.5:3b).

## Optional CPU speech transcription

Recording does not require a speech model. Save first; configure transcription when ready.

Within the same Python environment:

```bash
python -m pip install -e '.[speech]'
python tools/download_speech_model.py small
export NOEMA_SPEECH_MODEL="$PWD/.data/models/whisper-small"
python run.py --open
```

The helper downloads a model only when you explicitly run it. You may choose `tiny`, `base`, `small`, `medium`, or `large-v3`; smaller is not automatically good enough for technical speech. Model downloads can be substantial. On PowerShell, set `$env:NOEMA_SPEECH_MODEL` to the full model-directory path.

Transcription runs in a separate CPU process using INT8 and four threads, with local model files only. The process exits when done. Audio and original typed content survive a transcription failure. You can retry through the note's **Transcribe recording** button.

**Not tested here:** real speech recognition, your accent, hesitant explanations, technical vocabulary, live microphone permission flows, or speed on your i7-1270P. The adapter and failure/recovery paths are present, but the optional dependency/model was not downloaded in this build. Benchmark it on short actual CTF/LeetCode recordings before relying on the transcript.

Recording currently becomes a saved attachment when you stop it and save the capture. Closing or crashing the browser during an unfinished recording can lose that recording; continuous recording checkpoints are not implemented. Text drafts are separate and have local persistence.

Reference: [faster-whisper](https://github.com/SYSTRAN/faster-whisper).

## Connect a local agent or command

This does not inspect arbitrary existing conversations. You deliberately wrap a command that belongs to a task.

In **Settings → Agent & observer tokens**, create an **Agent** token and select the allowed task(s). Copy the token when shown. In a task's detail view, expand **Connect an agent** to copy its ID.

```bash
export NOEMA_TOKEN='paste-the-task-scoped-token-here'
python tools/agent.py --task TASK_ID --name 'Coding agent' -- your-command argument1
```

For a harmless first check:

```bash
python tools/agent.py --task TASK_ID --name 'Test command' -- python -c "print('Ready for review')"
```

The wrapper leaves output in the terminal, creates a run, reports liveness every 30 seconds, and reports the exit status. It removes `NOEMA_TOKEN` and `NOEMA_ACCESS_TOKEN` from the child environment. A zero exit code means ready for human review, not verified success. Terminal output/prompt text is not automatically copied into notes.

Events are written to an SQLite outbox before delivery. If the server goes away, they can be replayed after reconnect:

```bash
python tools/agent.py --flush
```

Use a separate `--outbox` path per concurrently used token/task scope so an unauthorized older event from one scope does not block another queue:

```bash
python tools/agent.py --task TASK_ID --outbox .data/coding-events.sqlite3 -- your-command
python tools/agent.py --outbox .data/coding-events.sqlite3 --flush
```

The initial run registration requires a reachable server. For interactive agents with native lifecycle/approval hooks, use the event API rather than treating terminal-process liveness as semantic progress. See [API.md](docs/API.md).

## Tiny Sway companion (experimental)

The browser's cat is a **browser preview**, not a transparent desktop window. The native Linux helper is separate:

```bash
export NOEMA_TOKEN='paste-an-observer-token-created-in-settings'
/usr/bin/python3 tools/sway_companion.py
```

System prerequisites are **Sway, PyGObject, GTK 3, GtkLayerShell introspection bindings, and the PyGObject Cairo bridge** (often `python3-cairo` / `python3-gi-cairo`). Install the matching packages through your distribution. The system Python usually sees these bindings while a normal venv does not. The helper does not need FastAPI, a browser engine, or a model.

The unchanged kitten rests inside a pale-sage rounded popup with a thin border
and subtle shadow: default 40 logical pixels in a 56-pixel container, or 32 in
48. Click for one available task and its saved next action; Open task opens the
existing task dialog. Companion menu holds Cat/Dot/Hide, 24/32/40 px sizes,
observation controls and links. Click the kitten again or Close to dismiss.
Native size is capped at 40 px; appearance changes are local and reset on restart.
Hide lasts until helper restart. Server Hidden always wins over local Cat/Dot.
The popup reserves no tiling space; controls are non-modal and never request
keyboard focus. The main web layout is unchanged; task/settings links open
existing dialogs without replacing an editor. Long text is abbreviated in the
popup and available in full in task details.

To enable window metadata, both the helper flag and the server permission must be enabled:

```bash
/usr/bin/python3 tools/sway_companion.py --observe-window-context
```

Then enable **Window context** in Noema Settings and add application/title-to-task rules. Alternatively, run only the observer without the native cat:

```bash
python tools/sway_context.py --observe-window-context
```

It reads the focused application's identifier, title, output and workspace every
five seconds when permitted. A change must persist across two samples; stable
context refreshes every 30 seconds. The companion uses that output/workspace to
place itself and hides when that workspace is not visible. Global pause in
Settings clears the latest stored context and inferred focus. The native
popover's Pause/Resume controls gate only this explicitly enabled helper's
future polls; an in-flight request can finish and other observers are unaffected.
Observation settings opens the real web settings. Permission, this helper's
polling switch and recent metadata reports are labeled separately. The observer
does not read pixels, clipboard contents, keypresses or browser history. Window
titles may still contain sensitive information.

Private headless Sway/GTK/layer-shell validation now passes 31 checks with two
synthetic outputs and disposable service/profile data, including actual metadata
mapping with pinned focus preserved and Rust webview hide/restore. Another 41
visibility checks cover dark/light backgrounds, modes, non-modal controls,
unchanged permissions and 100%/150%/200% compositor scaling. This is not
physical keyboard/clipboard, microphone, physical-monitor scaling or laptop
CPU/battery validation. Current screenshots and historical test commands are in
[the test report](docs/TEST_REPORT.md). Automatic conversion of a minimized
main window into the companion is not implemented; start/stop the helper
explicitly. Windows/macOS/Android overlays are not included.
Reliable native-presence detection does not exist, so the browser preview is
not automatically suppressed by a guess. Event-triggered companion messages
are not implemented.

References: [Sway IPC](https://github.com/swaywm/sway/blob/master/sway/sway-ipc.7.scd), [GtkLayerShell](https://github.com/wmww/gtk-layer-shell).

## Mobile and cloud boundaries

The web interface adapts to phone and tablet widths. A web manifest and application-shell service worker are included, but native PWA installation and Android permission behavior have not been validated on a device.

A phone's `localhost` is the phone, not your laptop. This release is not deployed online. It does not synchronize two independent `.data` directories, provide cloud accounts, or send push notifications after the browser is closed. Sharing a single server with another device needs an authenticated HTTPS deployment, which remains a separate integration/security milestone.

Do not simply bind the development app to `0.0.0.0` and expose it to the internet. The launcher requires an explicit token and host allowlist for non-loopback binding, but that guard is **not** a production deployment recipe. Reverse-proxy origin/TLS handling still needs work and testing.

## Storage, backups, and recovery

- Browser drafts/outbox contain private text and attachments. Use a trusted browser profile. Clearing site data deletes captures that have not reached the server.
- The visible label distinguishes queued/local capture from server-saved content. Failed uploads remain in **Settings → Local capture queue** until retried or explicitly discarded.
- **Settings → Export notes & tasks** creates a ZIP with JSON, Markdown notes, originals, revisions, and attachments. Tokens and raw observed context are excluded.
- Portable export is not yet a one-click import feature.
- Failed local storage keeps the editor open and shows **Retry local save**.
  Save requires a successful local queue commit before uploading. Keep the page
  open while local saving is unavailable; no server-only fallback is implemented.
- For a full installation backup, stop the server and copy the entire selected data directory, including the database and attachments. Treat `admin.token` and backups as secrets. Do not copy only the SQLite main file while it is writing WAL data.
- The single user is the OS user/installation owner, not an independently isolated enterprise tenant. Other local processes may access loopback service capabilities. See [SECURITY.md](docs/SECURITY.md).

## Verification

```bash
python -m pip install -e '.[test]'
python -m pytest -q
```

The original shipped run had 62 Python tests. The visibility pass grew 80 to 88;
the pointer pass reran 88 before/after. The device-gate preparation now passes
**99** (88 preserved plus 11 QA-tooling tests), with **22** pure Now-state tests
and five Rust policy tests. Tooling tests are not physical acceptance. Current
Python tests include 19 native-companion policy/asset tests and seven summary
API cases. Some policy cases use
explicit client/observer/event-loop doubles. Frontend syntax is checked using
Node as a QA tool; Node is not a runtime requirement.

`qa/browser_check.py` is an optional Playwright harness. It uses the actual HTML/CSS/JS and a real disposable server, but the build environment prohibits browser URL navigation, so HTTP transport and browser storage are explicitly bridged/test-doubled. Its 14 passing checks are **not** proof of native IndexedDB, PWA, microphone, notification, or device behavior. It never resets your database.

The report, screenshots of the running UI with test fixtures, and a narrowly scoped idle-backend measurement are in `qa/`. Full boundaries are in [TEST_REPORT.md](docs/TEST_REPORT.md).

For current native browser persistence checks (optional QA dependencies only):

```bash
.venv/bin/pip install playwright
CHROMIUM_PATH=/usr/bin/google-chrome .venv/bin/python qa/native_storage_check.py
CHROMIUM_PATH=/usr/bin/google-chrome .venv/bin/python qa/browser_check.py
```

Use the path to your existing Chrome/Chromium executable. These commands do not
install a browser or a model. Both harnesses create disposable server data;
new results/screenshots go to `qa/continuation/`, or `NOEMA_QA_OUTPUT` when set.
The native harness uses actual HTTP, IndexedDB, Blob storage, service-worker
offline loading and browser-profile restart. Faults are explicitly injected.
The older isolated harness still uses transport/storage doubles. Neither is
an Android, microphone, PWA-installation, physical power-loss or cloud-sync test.

## Source layout

```text
run.py                  Local launcher
noema/server.py         HTTP API, local safeguards, static assets, export
noema/store.py          SQLite records, priority/availability policy, state transitions
noema/models.py         Bounded API input validation
noema/worker.py         Single optional AI/transcription worker
public/                 Real responsive app; no build step or external assets
 tools/agent.py         Command tracking + durable event outbox
 tools/sway_context.py  Opt-in metadata observer
 tools/sway_companion.py Tiny experimental native Sway overlay
 tools/transcribe.py    Isolated CPU transcription worker
 tools/doctor.py        Read-only setup diagnostics
tests/                  Backend/helper regression tests
qa/                     UI harness, screenshots and actual test results
docs/                   Status, architecture, API and security boundaries
```

No code has been installed on your device by creating this package. The downloaded source is the handoff point for running and continuing the project.
