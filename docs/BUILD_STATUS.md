# Build status · Noema 0.1.0 + React/Electron cutover

The maintained [progress record and roadmap](PROGRESS.md) summarize completed
milestones, current evidence and the next concrete step. Update it alongside
this status and the test report after each milestone.

## Latest: React + Electron cutover · 2026-10-12

The production UI is the typed React bundle in `web/`, served by FastAPI, and
the desktop shell is Electron in `electron/`: external mode by default, Linux
`--manage-service` (lifecycle protocol 2) as opt-in. `public/`, the Rust
Wry/Tao shell `desktop/`, `experiments/ui-ab/hosts/wry` and
`experiments/ui-ab/hosts/companion` were deleted; the kitten sprite moved to
`tools/assets/cat.png`. IndexedDB `noema-local-v1` version 1 and its record
shapes are unchanged. Headings, subtitles and the tagline are kept in
`web/src/copy.ts` (owner decision 18B); the greeting uses the new
`display_name` setting. Priority labels come from `priority_source` ("Auto ·
rules", "Set by you"; "Auto · AI" once the AI-priority milestone lands). Gate
results, the terrain budget and the main-app memory check are in
[TEST_REPORT.md](TEST_REPORT.md). Not built here: AI-assigned priority (the next
milestone), daily slogans and audio checkpoint recovery. Physical Sway
acceptance (handbook §24 Stage A) remains pending and is the next validation gate.

## Previous continuation: frictionless task capture · 2026-10-09

Implemented one-input explicit task capture, collapsed Details, durable immutable
originals, limited model-free planned-day/label rules, idempotent service saves,
separate local task drafts and task-aware Rust Close checkpoint. Hidden editor
values/precise timestamps, manual priorities and pins survive. One sentence is
enough; notes remain notes. This is a [permanent product requirement](TASK_CAPTURE.md),
not a framework/UI-wide redesign. Richer task AI, task voice and automatic
deadline/reminder/availability extraction remain unimplemented.

Newly executed: **116 baseline / 141 final Python**, **27 task UI**, **58 Now browser**,
**22 note recovery**, **5 Rust policy / 22 Now**, **68 managed / 44 external WebKit**.
Four specific-interaction before/after images bring the preserved QA inventory to
**39 PNGs**. Source remains untracked; current manifest is
`qa/task-capture/source-after.sha256`. See [TEST_REPORT.md](TEST_REPORT.md) for exact
commands and headless/injected versus physical boundaries. No new performance
sample, model, microphone or device acceptance. Normal non-QA binary rebuilt.
Physical A stays blocked/pending; managed lifecycle remains opt-in and external
default unchanged. A-FOCUS-01 remains open. Next is guided physical launch/quit/
relaunch with task-draft recovery, not unfinished voice work automatically.

## Previous continuation: opt-in managed service (historical Linux development)

Screenshot follow-up: saved two requested current main-window views in
[`qa/managed-service/screenshots-2026-10-08/`](../qa/managed-service/screenshots-2026-10-08/README.md)
using the normal binary and a disposable private-X11 fixture. No runtime changes
or acceptance-suite reruns; user retry was aborted, not a proven device launch.
Physical A/lifecycle checks stay pending, prior test results below are historical
to implementation, and current screenshot inventory is 35 (previous 33 preserved).

**A BLOCKED ON DEVICE; B implemented/tested virtually, physical validation pending;
production defaults unchanged (external service).** The revised user gate allows
this independent implementation. Rust starts the actual Python launcher with
explicit arguments and private inherited listener/workspace/lease descriptors;
verified readiness precedes webview navigation. Stable profile/origin, explicit
Retry, checkpoint-first Close and bounded owned-group cleanup are implemented.
No automatic models, observer, microphone, installer or companion orchestration.
No main-app layout or framework change. A-FOCUS-01 remains open.

Newly executed Python baseline/final **99/116**, Rust policy **5**, Now **22**;
real-process owner, native WebKit and resource results are separately reported in
[TEST_REPORT.md](TEST_REPORT.md#opt-in-managed-service-lifecycle-2026-10-08).
No physical Sway result was added. Existing 33 QA PNGs remain unchanged; the later
screenshot follow-up adds two. Source is still untracked; current handoff is
`qa/managed-service/screenshots-2026-10-08/source-after.sha256`, not parent HEAD.
Next: user-guided physical managed launch/quit/relaunch alongside existing A
acceptance. Defaults cannot be promoted on virtual evidence alone.

## Previous continuation: physical Sway gate preparation (historical)

**Phase A BLOCKED ON DEVICE; Phase B NOT STARTED.** Read-only live Sway 1.9
inventory reports eDP-1 1920×1200 and DP-5 1920×1080 at scale 1.0, on the
i7-1270P/32 GB class target. No physical-input channel is available to the
assistant. Mouse/keyboard, clipboard/file picker, microphone, native OS routing,
actual monitor/workspace behavior and complete-process workloads remain blocked.
No equivalent headless companion suite was rerun to replace device evidence.

Added synthetic fixture preparation, sanitized session inventory and a
dependency-free, selected-process-tree resource sampler with PID/start-time
identity, RSS/PSS/private metrics and explicit exclusions. A single
[acceptance checklist](PHYSICAL_SWAY_ACCEPTANCE.md) provides exact launch commands
and per-check status. No runtime, UI, backend, companion or lifecycle change.
Noema remains untracked; before/final source manifests identify this handoff,
not the parent's commit. No Git staging/commit/push was performed.

Executed now: Python **88 baseline / 99 final**, Now pure state **18 baseline /
22 final**, Rust policy **5**; normal Linux development build, parse/compile/
format checks and 45 approved documentation hashes pass. Eleven new Python
tests cover QA tools, including real synthetic child trees, not app performance.
Four Now cases characterize pinned/available/waiting/attention/no-focus behavior;
explanation gap A-FOCUS-01 awaits device review. Historical visibility
80→88, pointer 88→88 and 41 compositor pointer checks remain historical.
Current QA inventory is 33 PNGs (26 visibility, four native, three pointer);
none were generated or deleted in this pass. See [TEST_REPORT.md](TEST_REPORT.md).

Next: user-assisted physical acceptance and measurements on the one fixture.
At that checkpoint Rust-owned lifecycle was gated on A; the later user instruction
explicitly permits opt-in implementation independently. Packaging is separate;
unfinished voice/long-recording recovery follows lifecycle acceptance. Whistle
is only a candidate for a separate future evaluation, not an integration.

## Previous continuation: native pointer acceptance

Added `qa/sway_check.py --pointer`: a guarded private virtual pointer and actual
Sway/Wayland press/release events exercise the existing native helper. **41
checks pass**, including Cat/Dot at 1/1.5/2 scales, work-window focus and outside
clicks, saved task URL, 32/48 sizing, pause/resume, Hidden and unchanged
permission/pin/manual priority. Python baseline/final remain **88/88**; **31**
native regression checks pass again. No runtime/UI/framework change was needed.
See [input evidence](../qa/companion-input/README.md) and exact commands in
[TEST_REPORT.md](TEST_REPORT.md). Physical input/monitor acceptance, OS browser
dispatch, presence detection and event-triggered messages remain pending.

## Previous continuation: visible native kitten popup

The approved bitmap is unchanged. The native GTK companion now rests in a
pale-sage rounded container with a thin contrasting border and subtle shadow:
40 logical-pixel sprite / 56-pixel container by default, 32 / 48 when selected.
The render buffer tracks scale changes; sizes, explicit Dot/Hidden, placement,
local pause/resume and server permission/Hidden precedence remain intact.
Click shows one available task's saved next action and its real task-details
link; a menu holds secondary controls. Controls are non-modal and never request
keyboard focus. Long content is constrained, and open suggestions refresh when
available work changes. No observation starts because the popup appears.

Baseline: 80 Python tests before edits. Current: 88 Python, 18 Now state, five
Rust policy, 31 native Sway regression and 41 visibility checks pass. Chrome
task/settings links pass 9/8, and Now regression passes 58 without retaining its
extra screenshots. Same-fixture before/after native captures cover dark/light
backgrounds and 100%/150%/200% compositor scales. See [TEST_REPORT.md](TEST_REPORT.md)
for exact commands, files, screenshot links, injections and physical-device gaps.

Main layout/CSS/framework, SQLite schema, priority/focus rules and artwork are
unchanged. The observer summary additionally returns saved next-action text;
scope/write gates remain unchanged. Native-presence detection is absent, so no
duplicate-suppression guess was added. Event-triggered attention messages remain
pending. Next: physical Sway pointer/keyboard, monitor/scaling and placement
acceptance with disposable data; OS browser routing also remains unvalidated.

## Previous continuation: Sway native companion acceptance

The main layout/CSS, Rust shell, Python service/schema, notebook and approved
assets are unchanged. A minimal web deep link opens existing Settings from the
native helper without replacing an open editor. Native GTK controls distinguish permission, local polling and
recent reports; add local Hide and observer Pause/Resume; cap the cat at 40 px;
retain workspace placement during local controls; honor server Hidden above
local overrides; suppress cached task suggestions while disconnected. Keyboard
interaction is requested only for an opened popover on protocol 4+.

Baseline: 62 Python tests passed before code edits. Current: 80 Python tests,
18 unchanged Now state tests and 5 Rust policy tests pass. Real settings deep
link / Now / native Chrome storage checks pass 8 / 58 / 22. The new native suite
passes 30 real headless Sway/Wayland/GTK/layer-shell checks, including two
synthetic outputs, real metadata inference/pin protection and Rust webview
scratchpad hide/restore. Six pre-change checks reproduce the old native labels
and missing hide control. Per the later cleanup requests, only the four latest
native images in `qa/sway/after/` remain. Earlier Now/storage-error images were
removed. Historical before/after results remain in
`qa/sway/` without the superseded before image. [TEST_REPORT.md](TEST_REPORT.md) records
exact commands, test injections and boundaries.

This does not complete physical Sway acceptance. Keyboard/clipboard/IME,
microphone, file picker, monitor scaling and target-device resources still need
device checks. Native helper appearance is session-local; local pause does not
disable another observer or clear server context. No desktop lifecycle owner,
installer, screenshot observer, Android support or synchronization is added.
Next concrete step: physical Sway acceptance with disposable data, then owned
Rust service lifecycle/error recovery without redesigning the UI.

## Previous completed milestone: refine the existing Now interface

The existing static web UI and Rust/Wry shell are preserved. Body/secondary
text is more readable, spacing is tighter, and the content column/responsive
navigation remain compact. Now distinguishes a new workspace, notes-only,
available, waiting, human-attention, complete, stale/unknown and disconnected
states. One server-grounded action is primary; alternatives are disclosed.
Cached tasks are not called currently actionable while disconnected.

Focus says selected, inferred or pinned accurately. Pinned focus is never
automatically replaced; explicit replacement/clearing asks confirmation.
The kitten stays small and opens real mode/size/metadata-permission controls.
Browser preview versus native overlay and permission versus reporting are
explicit. Agent setup is offered only with useful unfinished task context and
opens the implemented task-scoped token flow, not a placeholder. Notes do not
become tasks. Optional dots stay outside reading surfaces, stop when hidden
and react to reduced-motion changes. Backend/API/schema/model policy unchanged.

Current exact checks and screenshots: [TEST_REPORT.md](TEST_REPORT.md),
`qa/now-ui/`: 18 pure presentation tests, 58 real Now UI checks, 62 unchanged
Python tests, plus 14 adapter / 22 native-storage / 26 webview checks pass.
Actual integration connection health is not supplied by this
backend, so the UI reports unknown rather than inventing connectivity from
zero runs. Physical mobile/Sway/native-overlay/model/resource checks remain
unvalidated. Next concrete step: test the refined editor/Now/kitten controls
with physical keyboard, clipboard and Sway against disposable data.

## Previous completed milestone: restore webview desktop style

`desktop/` now implements a Rust Wry/Tao system-webview shell for the original
web interface. The rejected Qt/QML UI and Qt build dependency are removed;
Python service, schema, user data and browser capture-recovery fixes remain.
Approved assets are unchanged. The desktop uses the actual web draft/outbox,
original-note, manual-priority and pinned-focus behavior, not a parallel port.
See [DESKTOP.md](DESKTOP.md) for launch commands and verification.

The webview profile is persistent and exclusively locked. Window close asks
the web app to checkpoint the capture draft and warns about unfinished recording
or note edits. Chrome drafts do not migrate automatically; keep the service
origin/port stable for profile-local recovery. No backend/schema/data migration
was performed. Test boundaries and raw evidence are in [TEST_REPORT.md](TEST_REPORT.md).

Executed checks: baseline/final Python 62 each, Rust policy 5, real WebKit
26 assertions over three process launches, isolated browser 14 (doubles),
native Chrome 22 (injected failures). Formatting/parsing and the documentation
bundle's 45 hashes pass. Native editor code insertion/undo and synthetic image
paste are covered; physical keyboard/clipboard/Sway behavior is not.

Next concrete desktop step: physical Sway minimize/restore, file-picker and
microphone checks against disposable data, followed by owned service lifecycle
and packaging. Benchmark the complete process tree on the i7-1270P; Android,
kitten/observer integration, installation and sync remain separate milestones.

## Prior capture-recovery continuation

Current workspace update: 2026-10-08. The source is v0.1.0, verified against
all 47 original manifest entries before edits. The parent repository HEAD is
`2865fba0481d7cf34aa0c22fc6fa1ab62fc9fbbd`, but Noema is untracked there;
that commit does not identify this app. The starting `SHA256SUMS` digest is
`062799a885090fdce1c6b1b4685331e3368e345a7342e1c36947a74465e60bbe`.
The v0.2.0 documentation evidence does not mean its screenshot/vision code is
present. `docs/SCREEN_AWARENESS.md`, `noema/vision.py` and `tools/sway_screen.py`
are absent in the actual source.

Implemented next daily-use slice: browser capture Save atomically commits
outbox insertion and draft reset, cancels the input debounce, and resets the
editor only after commit. Local failure state stays visible with retry;
failed database opening can retry on the same page. Storage failure at boot
does not replace the connected editor with a fatal page. No server schema,
user data, approved artwork, task/focus semantics or inference policy changed.

New verification: baseline 62 Python tests and 14 isolated-browser checks;
post-change 62 Python tests and 14 isolated-browser checks; 22 native-browser
checks passed on three consecutive final runs after correcting test event
synchronization and CSP-compatible waits. The native harness exercises actual
headless Chrome HTTP, IndexedDB,
Blob bytes, service-worker offline loading, browser-profile restart and
server restart. Quota/open/transaction failures and lost acknowledgment are
injected. The isolated harness still uses explicit storage/transport doubles.
Raw results and synthetic UI screenshots are in `qa/continuation/`; see
[TEST_REPORT.md](TEST_REPORT.md) and [CONTINUATION.md](CONTINUATION.md).

Remaining local gaps: shared unsaved draft across tabs, uncheckpointed active
recordings, text debounce window, long-input processing, tested import/restore
and target-device validation. Cloud sync, native shells, model accuracy,
physical Sway behavior and full-app resource performance remain unvalidated
or unimplemented as described below. No installation/deployment is claimed.

Prior next concrete implementation (before the user's native/Rust request): add recoverable local checkpoints for unfinished
audio recordings, preserving the explicit Save gate, with interrupted-recording
and storage-failure tests. Target-laptop browser/microphone checks remain a
separate validation gate before relying on speech or companion behavior.

The sections below describe the original v0.1.0 delivery; the continuation
above supersedes their native-browser persistence boundary.

## Original release baseline

Prepared 2026-10-08. This source package is the recoverable baseline for the next development session.

## Starting point

Prior conversation material included UI concepts and a surfaced Noema UI site. A previously referenced backend directory was not present in this build runtime. This package is a new, tested implementation of the agreed scope, not a claim that the old site was updated or that files were written to the user's laptop.

## Delivered now

- Runnable Python/FastAPI local server with a persistent SQLite database and private attachment directory.
- Actual responsive Now/Capture/Notes/Plan interface, charcoal and muted olive, sparse optional dot motion, compact task rows, small supplied cat sprite.
- Explicit learning-note capture with text/images/sketches/audio; conservative automatic folder filing without models; raw originals, revision history, recovery and manual edits.
- Optional real API adapter for local Ollama cleanup and optional faster-whisper CPU subprocess. Model output is never executed.
- Automatic rule-based task priority, durable manual override, dependency validation and scheduling; explainable actionable-task selection, manual focus pinning.
- Durable reminders surfaced in the app, snooze/dismiss, restart recovery.
- Task-scoped agent API, durable command-wrapper outbox, real subprocess lifecycle, ready-for-review/needs-input/failed/stale states.
- Optional metadata-only Sway observer and experimental small native cat/dot with output/workspace placement logic.
- Portable data export, source, tests, screenshots and setup instructions.

## Runtime defaults on the i7-1270P target

There is no resident language/speech/vision model. The UI is a prebuilt React bundle; the desktop shell bundles Chromium through Electron (about 283 MB, accepted per decision 1A). Python, the browser and SQLite perform ordinary app work. The optional worker serializes AI jobs; screenshot inference is absent. Four model threads and on-demand process/model unloading are initial conservative policies, not laptop performance measurements.

The short build-container idle sample uses about 117 MiB for the backend process only and about 0.2% of one core in its 10-second sampling window. See the raw JSON for exact values and exclusions. This does not validate the earlier aspiration of a sub-100-MB complete minimized application; browser and companion measurements are still needed.

## Implemented but not exercised end-to-end on target hardware

- Speech decoding, technical vocabulary accuracy, recording permissions and model download/install compatibility.
- Real local language-model response quality and latency.
- Native Sway GTK overlay, multi-monitor movement, scale factors and workspace visibility.
- Native browser IndexedDB persistence, service worker/PWA installation and operating-system notifications.
- Windows/macOS runtime and Android device behavior.

## Not implemented yet

1. Periodic screenshots with local change detection and vision-assisted task inference. Current observation is explicit metadata mapping only.
2. Complete webview desktop lifecycle/packaging and automatic companion behavior upon minimizing it; Windows/macOS/Android overlay implementations. The Electron shell reuses the web interface; physical integrations remain unvalidated.
3. Cloud accounts, hosted HTTPS sync, cross-device outbox reconciliation and encrypted remote storage. Two installations currently have separate data.
4. Background Web Push when the browser is closed, calendar integrations, and reminders delivered while the host is powered off.
5. Live streaming transcription, rolling recovery of unfinished recordings, audio-time-linked visual references, image understanding/search, reliable technical-term confidence marking.
6. Dynamic folder taxonomy learning, mixed-topic capture splitting, embedding-based semantic search and meaningful personalization of priorities.
7. Native lifecycle hooks for already-running Codex/browser sessions. The generic wrapper tracks a process it launches; it cannot see arbitrary existing agents.
8. Complete data import, deletion/retention management UI, production authorization/TLS hardening and comprehensive backup automation.

## Original release's proposed next milestone (historical)

Run this package on the actual Sway laptop. Verify note capture and optional local speech on short technical recordings. Test the cat/dot on each monitor and workspace before writing Windows/macOS shells. Then add permission-scoped screenshots behind the existing observer API, with an explicit visual capture boundary and resource measurement. Native shell and secure cross-device deployment should follow verified local behavior, rather than another UI redesign.

## Do not claim

Do not describe this as fully shipped, production audited, deployed to the cloud, or installed on the user's machine. Do not claim local-model quality, automatic understanding of arbitrary screens, universal agent integration, or platform-wide notification delivery. Do not present example screenshot tasks as live user activity.
