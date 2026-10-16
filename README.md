# dhaara · 0.1.0

Dhara (formerly Noema) — धारा, "stream". Existing installs keep their data, cookies, tokens and settings; settings stored under the old names are still read for one release.

Current status: **React + Electron cutover; physical Sway acceptance testing is still pending**
and is the next validation gate. The interface is a typed React bundle (`web/`)
served by the Python service. The desktop shell is Electron (`electron/`), which
loads that same bundle from the service origin. The previous `public/` interface,
the Rust Wry/Tao shell (`desktop/`) and the in-app browser kitten preview were
removed at the cutover.
External service startup remains the default; Linux managed mode
(`--manage-service`) is opt-in.

Task capture, the capture outbox and the browser database `dhara-local-v1`
(version 1) keep their behaviour and record shapes, so captures queued by the
old browser UI upload once after the upgrade. Kitten settings stay in Settings
for the separate Python Sway helper. Priority shows where it came from:
"Auto · rules" or "Set by you". AI-assigned automatic priority ("Auto · AI") is
the next milestone and is not built yet.

A quiet place for what you are learning, what your agents are doing, and what you can do next.

This is a **runnable local development release**, not just a UI mockup. The server persists notes, attachments, tasks, reminders, agent events, and revisions. The interface uses those real APIs. It starts empty; the example content in the screenshots belongs to disposable tests, not your workspace.

**No GPU, paid API key, account, or AI model is required for the base app.** Node 22 is needed once to build the interface, not to run it. Optional local models provide transcription and note rewriting. The default app does not record your microphone, capture your screen, download models, or contact an AI service.

## Start here

Requirements: Python 3.11 or newer, Node 22 with npm (pinned in `.nvmrc`) to build the interface, a current Chromium- or Firefox-based browser, and internet access to install the dependencies once. `uv sync` uses Python 3.12 (pinned in `.python-version`); 3.11 is the minimum. Other operating systems and the optional speech wheels have not been tested.

### Install (Linux x86_64 AppImage)

Users: download or build `Dhara-<version>-x86_64.AppImage` (`release/build.sh`), make it executable and
run it. It starts the bundled service on `~/.local/share/dhara/workspace`
(`$XDG_DATA_HOME` is respected); `--data-dir PATH` opens another workspace. If user
namespaces are unavailable and no root-owned setuid sandbox helper is found, it
copies Chromium's helper to `~/.local/share/dhara/chrome-sandbox`, prints the
`sudo chown root:root … && sudo chmod 4755 …` command and exits; run it once and
start again. If your home is mounted nosuid, install the helper as
`/opt/google/chrome/chrome-sandbox` instead. It never runs without the sandbox.
The AppImage runs only for the user that built it; another user runs
`--appimage-extract` and starts `squashfs-root/AppRun`. `--server URL` connects
it to an external service instead of the bundled one. Contributors: the development flow below (a browser, or
`npm --prefix electron start`) is unchanged and needs no AppImage.

### Linux / macOS

From the repository root:

```bash
uv sync                      # creates .venv from uv.lock (install uv: https://docs.astral.sh/uv/)
npm --prefix web ci && npm --prefix web run build
uv run run.py --open
```

The interface is at `http://127.0.0.1:8765`. Stop the server with Ctrl-C. Starting it again opens the same saved workspace.

`web/dist` is not committed. `run.py` rebuilds it with `npm --prefix web run build` whenever it is missing or older than `web/src`, so you never get a stale interface; pass `--no-build` to serve it as is. Without npm, the API still works and a missing build shows "Frontend not built: run `npm --prefix web run build`" at `/`. Only one service can use a data directory at a time; a second start on the same workspace is refused.

To use the desktop shell instead of a browser (Node 22; Linux), install it once, link the Chromium sandbox helper, and start it against the running service (`npm --prefix electron start` builds the TypeScript first):

```bash
npm --prefix electron ci
node electron/scripts/link-sandbox.mjs
npm --prefix electron start -- --server http://127.0.0.1:8765
```

`link-sandbox.mjs` symlinks a root-owned `/opt/google/chrome/chrome-sandbox` when present; otherwise it prints the exact `sudo chown`/`chmod` commands. The sandbox is never disabled. After `npm --prefix electron run build`, `uv run run.py --desktop` starts the service and the shell together; closing either stops both. To let Electron own the service instead (opt-in, Linux only; `--manage-service` and `--data-dir` each require the other; it runs `.venv/bin/python run.py` on port 8765):

```bash
npm --prefix electron start -- --manage-service --data-dir /absolute/workspace
```

### Windows PowerShell

Activation is not required:

```powershell
uv sync
npm --prefix web ci
npm --prefix web run build
uv run run.py --open
```

Linux x86_64 has an AppImage (`release/build.sh`). There is no Windows installer, macOS app bundle or Android APK; run those platforms from source.

### A stable data location

The default data directory is `$DHARA_DATA_DIR`, else `.data` beside `run.py`. To keep data independent of code upgrades:

```bash
uv run run.py --data-dir "$HOME/.local/share/dhara/workspace" --open
```

This is the AppImage's workspace, so both share one notebook; pick another path to keep them apart. Use the same path on subsequent starts. Files include `dhara.sqlite3`, an `attachments/` directory, and `admin.token` (not written when `DHARA_ACCESS_TOKEN` is set). A pre-rename notebook file is renamed to `dhara.sqlite3` on first start. Keep the directory private. An OS account with access to these files can read the data; this build does not encrypt it at rest.

## First five minutes

1. Press **N** anywhere (or open **Tasks** and click **New task**). Type a sentence and save. Details and next actions are optional; priority remains Automatic unless you choose an override in the task's detail. A planned day is separate from a deadline, reminder or availability constraint.
2. Open **Home** to see your current focus, agents that need you, **If you have a few minutes** (available work) and your next tasks by due date. **Tasks** groups everything into Needs you, agents working, To do (by priority), Later (parked) and Done today. Tasks are excluded from available work if they have unfinished dependencies or a future start date, are parked, waiting or blocked, have an agent working, waiting for input or failed, or are already your focus. Ranking is rule-based and explains itself; no model is called.
3. On **Home**, click **Capture a thought…** (or press **Ctrl K**) and dump a thought. Paste an image, drop a screenshot, or use Sketch. **Save note** sends the bundle to the server. Before that, the draft stays in this browser's local storage.
4. Open **Notes** (or press **/** to search). Folders, the note list and the open note sit side by side; resize them by dragging or with the arrow keys, and hide each with **Ctrl 1/2/3**. The original is separate from the editable note. Edits create revisions; restoring an older version creates another revision instead of destroying history.
5. To track a command or agent, create a task-scoped token in **Settings** (the gear, bottom left) and use the wrapper described below.

You do not have to create tasks from learning notes. Linking a note to a task is optional. Tentative ideas in notes are not automatically turned into obligations.

## What is implemented

| Area | This release |
|---|---|
| Interface | Home, Notes (three resizable panes), Tasks and Settings pages in a typed React bundle; dark, light or system theme (a workspace setting); IBM Plex Sans/Mono bundled locally; notes search; quiet dot-wave and swirl backgrounds (on by default, can be turned off in Settings, follow prefers-reduced-motion). |
| Desktop | Electron shell (`electron/`, `run.py --desktop`), opt-in managed service on Linux, and a Linux x86_64 AppImage (`release/`). |
| Knowledge capture | Text, image uploads/paste/drop, simple sketch canvas, microphone recording after permission. Text and attachments are saved as one idempotent capture. |
| Organizing notes | Conservative keyword folder assignment by default. **It does not rewrite grammar without a model.** Optional local Ollama adapter produces an editable organized note while preserving the original. |
| Voice | Records and saves audio. Optional faster-whisper CPU worker transcribes after saving. **No live transcript in this release.** |
| Recovery | Local browser draft/outbox, retry on reconnect, explicit failed-upload queue, original capture, note revisions, optimistic edit-conflict detection. |
| Tasks | Dependencies, future start, planned day, due dates, estimates, notes/session links, transparent automatic priorities labelled "Auto · rules", persistent manual overrides labelled "Set by you", manual or inferred focus; Needs you, Running, Parked, Completed and All views. AI-assigned automatic priority ("Auto · AI") is the next milestone, not built yet. |
| Next action | Deterministic “What can I do now?” selection from existing actionable tasks; unknown estimates are not fabricated. |
| Agent lifecycle | One-click Claude Code / Codex hook connection (or a local plugin package); scoped event API and real subprocess wrapper; ordered/deduplicated events, stale-run status, durable wrapper outbox. An exited agent produces a review item, not a completed task. |
| Reminders | Persisted schedule, in-app due queue, snooze/dismiss, due processing after server restart. Optional browser notification while the app is running. |
| Window context | Experimental opt-in Sway metadata observer with application/title-to-task rules. Pinned focus wins. **No screenshot capture or vision inference.** |
| Companion | Separate experimental native GTK/Sway cat/dot helper (`tools/sway_companion.py`, sprite `tools/assets/kitten-illustrated.png`), output/workspace placement code and click-to-expand task list. The in-app browser preview was removed. |
| Portability | Markdown/JSON/attachment export. One local SQLite server, no managed cloud account or automatic synchronization of independent installations. |

## Optional local note cleanup

The app works without this. This adapter sends saved note text to a separately running local Ollama service. It does not send screenshots, run tools, or give the model access to your entire notebook.

Install/start Ollama separately using its official instructions. Choose a model that is available on your machine. For an initial CPU experiment, the following uses a compact model; its quality on your technical notes **has not been measured by this release**:

```bash
ollama pull qwen2.5:3b
export DHARA_MODEL='qwen2.5:3b'
uv run run.py --open
```

`ollama pull` explicitly downloads model files. It is not part of ordinary Dhara startup. On PowerShell, set `$env:DHARA_MODEL = 'qwen2.5:3b'` instead of `export`.

The worker uses one job at a time, four inference threads, a bounded context, a 14,000-character input limit, and `keep_alive: 0` to request model unloading after a job. Longer captures remain safely saved and receive an explanatory processing error; automatic chunking is not implemented yet.

Ollama defaults to `http://127.0.0.1:11434`. Change `DHARA_OLLAMA_URL` only when necessary. A non-loopback model host also requires `DHARA_ALLOW_REMOTE_MODEL=1`, because note content would leave the machine. Remote authentication/TLS for model services is not managed here.

Cleanup output is validated for shape, not factual accuracy. It can still be wrong. The original and all revisions remain accessible. If you edit while a model is working, its late result becomes a separate suggestion instead of overwriting your changes. The first version uses a small fixed folder taxonomy; arbitrary project-folder learning and robust mixed-topic splitting remain future work.

Official references: [Ollama generate API](https://docs.ollama.com/api/generate), [structured output](https://docs.ollama.com/capabilities/structured-outputs), [model listing](https://ollama.com/library/qwen2.5:3b).

## Optional CPU speech transcription

Recording does not require a speech model. Save first; configure transcription when ready.

`uv sync` keeps only the extras you name, so list every one you use (e.g. `--extra speech --extra test`):

```bash
uv sync --extra speech
uv run tools/download_speech_model.py base.en
export DHARA_SPEECH_MODEL="$PWD/.data/models/whisper-base.en"
uv run run.py --open          # or: uv run run.py --desktop
```

No GPU is needed: transcription runs on the CPU, and `base.en` keeps up with real time on a
recent laptop. The helper downloads a model only when you explicitly run it. You may choose
`tiny`, `base`, `small`, `medium` or `large-v3`, or the English-only `tiny.en`, `base.en`,
`small.en`, `medium.en` (faster and more accurate for English notes); smaller is not automatically
good enough for technical speech. Model downloads can be substantial. On PowerShell, set
`$env:DHARA_SPEECH_MODEL` to the full model-directory path. Managed mode (the Electron shell
starting the service, and the packaged build) strips `DHARA_SPEECH_MODEL` from the service's
environment, so speech is configured this way in external mode only; a workspace setting for it
is a follow-on.

Transcription runs in a separate CPU process using INT8 and four threads, with local model files only. The process exits when done. Audio and original typed content survive a transcription failure. You can retry through the note's **Transcribe recording** button.

**Not tested here:** real speech recognition, your accent, hesitant explanations, technical vocabulary, live microphone permission flows, or CPU speed on your machine. The adapter and failure/recovery paths are present, but the optional dependency/model was not downloaded in this build. Benchmark it on short recordings of your own material before relying on the transcript.

Recording currently becomes a saved attachment when you stop it and save the capture. Closing or crashing the browser during an unfinished recording can lose that recording; continuous recording checkpoints are not implemented. Text drafts are separate and have local persistence.

Reference: [faster-whisper](https://github.com/SYSTRAN/faster-whisper).

## Connect Claude Code or Codex once

Open **Settings → Connect your agents → Connect Claude Code / Connect Codex**.
This adds lifecycle hooks to that agent on the same computer, preserving other
settings and backing up the original configuration. Claude Code loads the
changes in a new session. In Codex, open `/hooks` and review/trust the dhaara
hooks once. That review is required by Codex; dhaara does not bypass it.

Subsequent sessions register automatically: **no task IDs, tokens or wrapper
commands**. A task is created for each session when its first activity arrives,
labelled with the agent, project folder name and a short session code (for example `Codex · myrepo · 3fa9c1`). Rename it if useful. Prompt
submission/tool activity reports work, permission requests report a need for
input, and Stop reports a result ready for review. A finished turn never marks
a task Done. Child-agent events do not complete their parent session. Sessions
without a recent report become unknown; the hooks do not pretend to provide
continuous liveness during a long model/tool call.

Only a hashed session identifier, agent name, project folder basename, status
and timestamp enter the private local queue. No prompts, responses, transcripts,
source files or screen content are copied. The queue works while the app is
closed and drains after restart (every three seconds while the worker runs,
and on state refresh). Replays are idempotent. Repeated identical reports are
coalesced for 15 seconds. The queue is bounded at 10,000 events, dropping its
oldest event if full. An unavailable/unwritable queue must not block an agent.

**Disconnect** removes only the commands installed by dhaara and disables
future ingestion for that provider. Existing tasks and reports remain.
Advanced task-scoped tokens remain available for custom integrations.

Connecting a provider also prepares a **local plugin package** for it,
including its manifest, lifecycle hooks and a troubleshooting skill. Download
it from the connection's Plugin package disclosure after choosing **Use plugin instead**.
That switch removes direct hooks while keeping ingestion enabled. Packages target this
computer and workspace; use either direct hooks or a plugin, not both.
Generated sources live in `<data-dir>/agent-hooks/plugins/{claude,codex}`.
The plugin requires its corresponding connection to remain enabled for ingestion.
The direct installer is the normal one-click path; downloading a plugin is optional.

Hook execution uses the current Python runtime in a source install. The AppImage
does not yet support agent connections: hooks need a `python3` on PATH, and the
frozen service does not bundle the `agent_hook.py` receiver that Connect copies.
Use a source install for agent connections until both are bundled.
Native agent hook trust/reload behavior still needs a live session check; local
receiver execution, queues, configuration preservation and HTTP authorization
are covered by automated tests.

Sources: [Codex hooks](https://learn.chatgpt.com/docs/hooks),
[Codex plugin packaging](https://developers.openai.com/plugins/build/plugins),
[Claude Code hooks](https://code.claude.com/docs/en/hooks).

## Advanced: connect another local agent or command

This does not inspect arbitrary existing conversations. You deliberately wrap a command that belongs to a task.

In **Settings**, expand **Advanced: agent & observer tokens**, set **Access** to **Task-scoped agent** and select the allowed task(s). Copy the token when shown. In a task's detail view, expand **Connect an agent** to copy its ID.

```bash
export DHARA_TOKEN='paste-the-task-scoped-token-here'
python tools/agent.py --task TASK_ID --name 'Coding agent' -- your-command argument1
```

For a harmless first check:

```bash
python tools/agent.py --task TASK_ID --name 'Test command' -- python -c "print('Ready for review')"
```

The wrapper leaves output in the terminal, creates a run, reports liveness every 30 seconds, and reports the exit status. It removes `DHARA_TOKEN` and `DHARA_ACCESS_TOKEN` (and their pre-rename equivalents) from the child environment. A zero exit code means ready for human review, not verified success. Terminal output/prompt text is not automatically copied into notes.

Events are written to an SQLite outbox before delivery. If the server goes away, they can be replayed after reconnect:

```bash
python tools/agent.py --flush
```

Use a separate `--outbox` path per concurrently used token/task scope so an unauthorized older event from one scope does not block another queue:

```bash
python tools/agent.py --task TASK_ID --outbox .data/coding-events.sqlite3 -- your-command
python tools/agent.py --outbox .data/coding-events.sqlite3 --flush
```

The initial run registration requires a reachable server. For interactive agents with native lifecycle/approval hooks, use the event API rather than treating terminal-process liveness as semantic progress.

## Tiny Sway companion (experimental)

The in-app browser kitten preview was removed at the React + Electron cutover. The native Linux helper is separate:

```bash
export DHARA_TOKEN='paste-an-observer-token-created-in-settings'
/usr/bin/python3 tools/sway_companion.py
```

System prerequisites are **Sway, PyGObject, GTK 3, GtkLayerShell introspection bindings, and the PyGObject Cairo bridge** (often `python3-cairo` / `python3-gi-cairo`). Install the matching packages through your distribution. The system Python usually sees these bindings while a normal venv does not. The helper does not need FastAPI, a browser engine, or a model.

The companion uses a transparent illustrated kitten (`tools/assets/kitten-illustrated.png`)
without a colored container. Click for an item needing your attention, or the
next available task and its saved next action. Open task opens the existing
task dialog. Companion menu holds Cat/Dot/Hide, 24/40/56/72 px sizes,
observation controls and links. Click the kitten again or Close to dismiss.
Native size is capped at 72 px; appearance changes are local and reset on restart.
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

There is no automated companion test against a real compositor:
`tests/test_companion.py` covers the pure state and placement logic only. The
companion has not been validated on physical monitors, with scaling, or for
laptop CPU/battery use. Automatic conversion of a minimized
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
- The single user is the OS user/installation owner, not an independently isolated enterprise tenant. Other local processes may access loopback service capabilities.

## Verification

The cutover gate, run in this order from the repository root after
`uv sync --extra test` (add `--extra speech` if you use it):

```bash
npm --prefix web ci
npm --prefix web run build
npm --prefix web test
npm --prefix web run e2e
npm --prefix electron ci
node electron/scripts/link-sandbox.mjs
npm --prefix electron test
uv run pytest
```

The E2E suite starts `run.py` on a temporary data directory and a free port; it
never touches your workspace. Install Playwright's Chromium once with
`npm --prefix web exec -- playwright install chromium`. The Electron suite runs
in a private headless Sway and needs `sway` on PATH; `npm --prefix electron test`
runs the build, the unit tests and the Playwright suite.
These are real-browser and real-process tests with injected faults. They are not
Android, microphone, PWA-installation, physical power-loss, cloud-sync or
physical Sway tests.

## Source layout

```text
run.py                          Local launcher (non-loopback binding needs a token and host allowlist)
dhara/server.py                 HTTP API, local safeguards, serves web/dist, export
dhara/store.py                  SQLite records, priority/availability policy, state transitions
dhara/models.py                 Bounded API input validation
dhara/worker.py                 Single optional AI/transcription worker
dhara/task_capture.py           Rule-based task capture parsing (no model)
dhara/agent_connections.py      Claude Code / Codex hook install and removal
dhara/agent_hook.py             Standalone hook receiver and local event queue
dhara/agent_plugin.py           Local plugin package builder
dhara/desktop_service.py        Linux managed-mode lease (protocol 2)
dhara/env.py                    Environment helpers (with a fallback to pre-rename variable names)
noema/                          rename-shim: legacy import shim, kept for one release
web/                            React + TypeScript interface (npm --prefix web run build)
web/e2e/                        Playwright tests against run.py on a temporary data directory
electron/                       Electron desktop shell and managed lifecycle
electron/e2e/                   Playwright tests in a private headless Sway
release/                        Linux AppImage build (build.sh, PyInstaller spec, launcher)
tools/agent.py                  Command tracking + durable event outbox
tools/client.py                 Shared HTTP client for the helpers
tools/sway_context.py           Opt-in metadata observer
tools/sway_companion.py         Tiny experimental native Sway overlay (sprite: tools/assets/kitten-illustrated.png)
tools/companion_state.py        Companion state and placement logic
tools/transcribe.py             Isolated CPU transcription worker
tools/download_speech_model.py  Explicit speech model download
tools/doctor.py                 Read-only setup diagnostics
tests/                          Backend, helper and cutover regression tests
reference-images/               UI design references
```
