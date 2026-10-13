# Dhara · 0.1.0

See [the maintained progress record](docs/PROGRESS.md) for what is built,
what has been tested, remaining milestones and the next concrete step.

Current status: **React + Electron cutover; physical Sway acceptance (handbook §24 Stage A) is still pending**
and is the next validation gate. The interface is a typed React bundle (`web/`)
served by the Python service. The desktop shell is Electron (`electron/`), which
loads that same bundle from the service origin. The previous `public/` interface,
the Rust Wry/Tao shell (`desktop/`) and the in-app browser kitten preview were
removed at the cutover; rollback steps are in [PROGRESS.md](docs/PROGRESS.md).
External service startup remains the default; Linux managed mode
(`--manage-service`) is opt-in. See [desktop instructions](docs/DESKTOP.md).

Task capture, the capture outbox and the browser database `dhara-local-v1`
(version 1) keep their behaviour and record shapes, so captures queued by the
old browser UI upload once after the upgrade. Kitten settings stay in Settings
for the separate Python Sway helper. Priority shows where it came from:
"Auto · rules" or "Set by you". AI-assigned automatic priority ("Auto · AI") is
the next milestone and is not built yet; a daily motivating slogan comes later.

A quiet place for what you are learning, what your agents are doing, and what you can do next.

This is a **runnable local development release**, not just a UI mockup. The server persists notes, attachments, tasks, reminders, agent events, and revisions. The interface uses those real APIs. It starts empty; the example content in the screenshots belongs to disposable tests, not your workspace.

**No GPU, paid API key, account, or AI model is required for the base app.** Node 22 is needed once to build the interface, not to run it. Optional local models provide transcription and note rewriting. The default app does not record your microphone, capture your screen, download models, or contact an AI service.

## Start here

Requirements: Python 3.11 or newer, Node 22 with npm (pinned in `.nvmrc`) to build the interface, a current Chromium- or Firefox-based browser, and internet access to install the dependencies once. Python 3.12.3 was exercised in this build environment; other operating systems and optional speech wheels still need device testing.

### Linux / macOS

From the extracted `dhara` directory:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
npm --prefix web ci && npm --prefix web run build
python run.py --open
```

The interface is at `http://127.0.0.1:8765`. Stop the server with Ctrl-C. Starting it again opens the same saved workspace.

`web/dist` is not committed. If you skip the build, the API still works and the page at `/` says "Frontend not built: run `npm --prefix web run build`". To use the desktop shell instead of a browser (Node 22; Linux), install it once, link the Chromium sandbox helper, and start it against the running service:

```bash
npm --prefix electron ci
node electron/scripts/link-sandbox.mjs
npm --prefix electron start -- --server http://127.0.0.1:8765
```

`link-sandbox.mjs` symlinks a root-owned `/opt/google/chrome/chrome-sandbox` when present; otherwise it prints the exact `sudo chown`/`chmod` commands. The sandbox is never disabled. To let Electron own the service instead (opt-in, Linux only; both flags are required):

```bash
npm --prefix electron start -- --manage-service --data-dir /absolute/workspace
```

### Windows PowerShell

Activation is not required:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm --prefix web ci
npm --prefix web run build
.\.venv\Scripts\python.exe run.py --open
```

This distribution contains portable source, not a Windows installer, macOS application bundle, or Android APK. Native packaging has not been tested.

### A stable data location

The default data directory is `.data` beside `run.py`. To keep data independent of code upgrades:

```bash
python run.py --data-dir "$HOME/.local/share/dhara" --open
```

Use the same path on subsequent starts. Files include `dhara.sqlite3`, an `attachments/` directory, and `admin.token`. Keep the directory private. An OS account with access to these files can read the data; this build does not encrypt it at rest.

## First five minutes

1. Open **Tasks** and click Task. Type a sentence and Add task. Details and next actions are optional; priority remains Automatic unless you choose an override. A planned day is separate from a deadline, reminder or availability constraint.
2. Open **Overview**. Choose a focus. “Available now” excludes work with unresolved dependencies, tasks intentionally parked, and tasks waiting on an active agent. It explains the priority/ranking decision rather than invoking a model for every refresh.
3. Open **Capture** and dump a thought. Paste an image, drop a screenshot, or use Sketch. **Save note** sends the bundle to the server. Before that, the draft stays in this browser's local storage.
4. Read the saved note in **Notes**. The original is separate from the editable note. Edits create revisions; restoring an older version creates another revision instead of destroying history.
5. To track a command or agent, create a task-scoped token in Settings and use the wrapper described below.

You do not have to create tasks from learning notes. Linking a note to a task is optional. Tentative ideas in notes are not automatically turned into obligations.

## What is implemented

| Area | This release |
|---|---|
| Interface | Responsive Overview, Capture, Notes and Tasks in a typed React bundle; compact graphite layout with the original headings, subtitles and tagline; optional WebGL2 stroke terrain inside the app (motion off by default, static without WebGL2, paused when hidden, blurred or idle, never under reading or editing surfaces). |
| Knowledge capture | Text, image uploads/paste/drop, simple sketch canvas, microphone recording after permission. Text and attachments are saved as one idempotent capture. |
| Organizing notes | Conservative keyword folder assignment by default. **It does not rewrite grammar without a model.** Optional local Ollama adapter produces an editable organized note while preserving the original. |
| Voice | Records and saves audio. Optional faster-whisper CPU worker transcribes after saving. **No live transcript in this release.** |
| Recovery | Local browser draft/outbox, retry on reconnect, explicit failed-upload queue, original capture, note revisions, optimistic edit-conflict detection. |
| Tasks | Dependencies, future start, due dates, estimates, notes/session links, transparent automatic priorities labelled "Auto · rules", persistent manual overrides labelled "Set by you", manual or inferred focus. AI-assigned automatic priority ("Auto · AI") is the next milestone, not built yet. |
| Next action | Deterministic “What can I do now?” selection from existing actionable tasks; unknown estimates are not fabricated. |
| Agent lifecycle | Scoped event API and real subprocess wrapper; ordered/deduplicated events, stale-run status, durable wrapper outbox. An exited agent produces a review item, not a completed task. |
| Reminders | Persisted schedule, in-app due queue, snooze/dismiss, due processing after server restart. Optional browser notification while the app is running. |
| Window context | Experimental opt-in Sway metadata observer with application/title-to-task rules. Pinned focus wins. **No screenshot capture or vision inference.** |
| Companion | Separate experimental native GTK/Sway cat/dot helper (`tools/sway_companion.py`, sprite `tools/assets/cat.png`), output/workspace placement code and click-to-expand task list. The in-app browser preview was removed. |
| Portability | Markdown/JSON/attachment export. One local SQLite server, no managed cloud account or automatic synchronization of independent installations. |

More precise boundaries and remaining milestones are in [BUILD_STATUS.md](docs/BUILD_STATUS.md).

## Optional local note cleanup

The app works without this. This adapter sends saved note text to a separately running local Ollama service. It does not send screenshots, run tools, or give the model access to your entire notebook.

Install/start Ollama separately using its official instructions. Choose a model that is available on your machine. For an initial CPU experiment, the following uses a compact model; its quality on your technical notes **has not been measured by this release**:

```bash
ollama pull qwen2.5:3b
export DHARA_MODEL='qwen2.5:3b'
python run.py --open
```

`ollama pull` explicitly downloads model files. It is not part of ordinary Dhara startup. On PowerShell, set `$env:DHARA_MODEL = 'qwen2.5:3b'` instead of `export`.

The worker uses one job at a time, four inference threads, a bounded context, a 14,000-character input limit, and `keep_alive: 0` to request model unloading after a job. Longer captures remain safely saved and receive an explanatory processing error; automatic chunking is not implemented yet.

Ollama defaults to `http://127.0.0.1:11434`. Change `DHARA_OLLAMA_URL` only when necessary. A non-loopback model host also requires `DHARA_ALLOW_REMOTE_MODEL=1`, because note content would leave the machine. Remote authentication/TLS for model services is not managed here.

Cleanup output is validated for shape, not factual accuracy. It can still be wrong. The original and all revisions remain accessible. If you edit while a model is working, its late result becomes a separate suggestion instead of overwriting your changes. The first version uses a small fixed folder taxonomy; arbitrary project-folder learning and robust mixed-topic splitting remain future work.

Official references: [Ollama generate API](https://docs.ollama.com/api/generate), [structured output](https://docs.ollama.com/capabilities/structured-outputs), [model listing](https://ollama.com/library/qwen2.5:3b).

## Optional CPU speech transcription

Recording does not require a speech model. Save first; configure transcription when ready.

Within the same Python environment:

```bash
python -m pip install -e '.[speech]'
python tools/download_speech_model.py small
export DHARA_SPEECH_MODEL="$PWD/.data/models/whisper-small"
python run.py --open
```

The helper downloads a model only when you explicitly run it. You may choose `tiny`, `base`, `small`, `medium`, or `large-v3`; smaller is not automatically good enough for technical speech. Model downloads can be substantial. On PowerShell, set `$env:DHARA_SPEECH_MODEL` to the full model-directory path.

Transcription runs in a separate CPU process using INT8 and four threads, with local model files only. The process exits when done. Audio and original typed content survive a transcription failure. You can retry through the note's **Transcribe recording** button.

**Not tested here:** real speech recognition, your accent, hesitant explanations, technical vocabulary, live microphone permission flows, or speed on your i7-1270P. The adapter and failure/recovery paths are present, but the optional dependency/model was not downloaded in this build. Benchmark it on short actual CTF/LeetCode recordings before relying on the transcript.

Recording currently becomes a saved attachment when you stop it and save the capture. Closing or crashing the browser during an unfinished recording can lose that recording; continuous recording checkpoints are not implemented. Text drafts are separate and have local persistence.

Reference: [faster-whisper](https://github.com/SYSTRAN/faster-whisper).

## Connect a local agent or command

This does not inspect arbitrary existing conversations. You deliberately wrap a command that belongs to a task.

In **Settings → Agent & observer tokens**, create an **Agent** token and select the allowed task(s). Copy the token when shown. In a task's detail view, expand **Connect an agent** to copy its ID.

```bash
export DHARA_TOKEN='paste-the-task-scoped-token-here'
python tools/agent.py --task TASK_ID --name 'Coding agent' -- your-command argument1
```

For a harmless first check:

```bash
python tools/agent.py --task TASK_ID --name 'Test command' -- python -c "print('Ready for review')"
```

The wrapper leaves output in the terminal, creates a run, reports liveness every 30 seconds, and reports the exit status. It removes `DHARA_TOKEN` and `DHARA_ACCESS_TOKEN` from the child environment. A zero exit code means ready for human review, not verified success. Terminal output/prompt text is not automatically copied into notes.

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

The in-app browser kitten preview was removed at the React + Electron cutover. The native Linux helper is separate:

```bash
export DHARA_TOKEN='paste-an-observer-token-created-in-settings'
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

Then enable **Window context** in Dhara Settings and add application/title-to-task rules. Alternatively, run only the observer without the native cat:

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

Private headless Sway/GTK/layer-shell validation (`qa/sway_check.py`) tests the
GTK3/layer-shell companion mapping with two synthetic outputs and disposable
service/profile data, including actual metadata mapping with pinned focus
preserved. Before the cutover it passed 31 checks, three of which covered the
Rust webview hide/restore; those were removed with the Rust shell at the
cutover, and the kitten suite has not been rerun since. Stage A of
[the physical Sway acceptance](docs/PHYSICAL_SWAY_ACCEPTANCE.md) validates it. Another 41
visibility checks cover dark/light backgrounds, modes, non-modal controls,
unchanged permissions and 100%/150%/200% compositor scaling. This is not
physical keyboard/clipboard, microphone, physical-monitor scaling or laptop
CPU/battery validation. Current screenshots and historical test commands are in
[the test report](docs/TEST_REPORT.md). Automatic conversion of a minimized
main window into the companion is not implemented; start/stop the helper
explicitly. Windows/macOS/Android overlays are not included.
Event-triggered companion messages are not implemented.

References: [Sway IPC](https://github.com/swaywm/sway/blob/master/sway/sway-ipc.7.scd), [GtkLayerShell](https://github.com/wmww/gtk-layer-shell).

## Mobile and cloud boundaries

The web interface adapts to phone and tablet widths. A web manifest and application-shell service worker are included, but native PWA installation and Android permission behavior have not been validated on a device.

A phone's `localhost` is the phone, not your laptop. This release is not deployed online. It does not synchronize two independent `.data` directories, provide cloud accounts, or send push notifications after the browser is closed. Sharing a single server with another device needs an authenticated HTTPS deployment, which remains a separate integration/security milestone.

Do not simply bind the development app to `0.0.0.0` and expose it to the internet. The launcher requires an explicit token and host allowlist for non-loopback binding, but that guard is **not** a production deployment recipe. Reverse-proxy origin/TLS handling still needs work and testing.

## Storage, backups, and recovery

- Browser drafts/outbox contain private text and attachments. Use a trusted browser profile. Clearing site data deletes captures that have not reached the server.
- The visible label distinguishes queued/local capture from server-saved content. Failed uploads remain in the **Captures on this device** dialog (open it from the status line) until retried or explicitly discarded.
- **Settings → Export notes & tasks** creates a ZIP with JSON, Markdown notes, originals, revisions, and attachments. Tokens and raw observed context are excluded.
- Portable export is not yet a one-click import feature.
- Failed local storage keeps the editor open and shows **Retry local save**.
  Save requires a successful local queue commit before uploading. Keep the page
  open while local saving is unavailable; no server-only fallback is implemented.
- For a full installation backup, stop the server and copy the entire selected data directory, including the database and attachments. Treat `admin.token` and backups as secrets. Do not copy only the SQLite main file while it is writing WAL data.
- The single user is the OS user/installation owner, not an independently isolated enterprise tenant. Other local processes may access loopback service capabilities. See [SECURITY.md](docs/SECURITY.md).

## Verification

The cutover gate, run in this order from the repository root after
`python -m pip install -e '.[test]'`:

```bash
npm --prefix web ci
npm --prefix web run build
npm --prefix web test
npm --prefix web run e2e
npm --prefix electron ci
node electron/scripts/link-sandbox.mjs
npm --prefix electron test
.venv/bin/python -m pytest
```

The E2E suite starts `run.py` on a temporary data directory and a free port; it
never touches your workspace. Install Playwright's Chromium once with
`npm --prefix web exec -- playwright install chromium`. The Electron suite runs
in a private headless Sway and needs `sway` on PATH. Results, the terrain
budget and the main-app memory check are in [TEST_REPORT.md](docs/TEST_REPORT.md).
These are real-browser and real-process tests with injected faults. They are not
Android, microphone, PWA-installation, physical power-loss, cloud-sync or
physical Sway tests. The older `qa/` browser and webview harnesses
(`qa/browser_check.py`, `qa/webview_check.py`, `qa/managed_screenshots.py`)
drove the removed UI and shell and were deleted at the cutover (they remain in
git history); only their recorded results under `qa/` stay.

## Source layout

```text
run.py                   Local launcher
dhara/server.py          HTTP API, local safeguards, serves web/dist, export
dhara/store.py           SQLite records, priority/availability policy, state transitions
dhara/models.py          Bounded API input validation
dhara/worker.py          Single optional AI/transcription worker
dhara/desktop_service.py Linux managed-mode lease (protocol 2)
web/                     React + TypeScript interface (npm --prefix web run build)
electron/                Electron desktop shell and managed lifecycle
tools/agent.py           Command tracking + durable event outbox
tools/sway_context.py    Opt-in metadata observer
tools/sway_companion.py  Tiny experimental native Sway overlay (sprite: tools/assets/cat.png)
tools/transcribe.py      Isolated CPU transcription worker
tools/doctor.py          Read-only setup diagnostics
tests/                   Backend, helper and cutover regression tests
qa/                      Device-check helpers and recorded results of deleted harnesses
docs/                    Status, architecture, API and security boundaries
experiments/ui-ab/       Variant A/B experiment evidence (history)
```

No code has been installed on your device by creating this package. The downloaded source is the handoff point for running and continuing the project.
