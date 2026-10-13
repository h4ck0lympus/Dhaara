# Dhara progress

Last updated: 2026-10-12. Current source: **0.1.0 plus the React + Electron cutover**, written on revision `c1bf6fa2281e0d27e08e1c30b2a1655bd1c435a2`.

This is the maintained handoff: what exists, what has been checked, what remains,
and what to do next. Update it after each completed milestone. Detailed commands
and verification boundaries live in [TEST_REPORT.md](TEST_REPORT.md); older
results stay there rather than being presented as new tests.

## Current direction

Dhara is a local-first learning notebook and task/agent workspace. The working
stack is Python/FastAPI + SQLite, a typed **React** interface (`web/`, built with
Node 22 and served by the service) and an **Electron** desktop shell
(`electron/`) that loads the same origin. The browser version remains usable.
External service startup remains the default; Linux `--manage-service`
(lifecycle protocol 2) is opt-in and not device-accepted. The handbook's
"Current static UI + SQLite" decision (handbook §27) is superseded for the UI
only; SQLite stays.

Keep the compact Overview / Capture / Notes / Tasks navigation (route ids
`overview`/`capture`/`notes`/`plan`), graphite palette, restrained accent,
original approved assets and small kitten. No oversized cards
or permanent overlay panels. Learning notes are not automatically tasks.
Original captures, revisions, manual priorities and pinned focus must survive
future work; pinned focus wins over automatic inference.

**Permanent task-capture requirement:** explicit Add task opens one focused
multiline natural-language input and collapsed Details. One sentence is enough;
no organizing interview or mandatory database fields. Preserve the original,
manual overrides and pin; do not invent consequential fields or turn notes into
tasks. See [the implemented contract and limitations](TASK_CAPTURE.md).

The target is an i7-1270P with 32 GB RAM and integrated graphics. Base use needs
no model or GPU. Optional inference is CPU-first and on demand; no resident
model, screen recording or remote AI service is enabled by ordinary startup.
This is a design policy, **not measured laptop performance**.

## Visual guardrails for the Sway milestone

Clarified 2026-10-08. After the user's cleanup, earlier browser/Now screenshots
are no longer retained. This visibility milestone adds the explicitly requested
[same-fixture before/after set](../qa/kitten-visibility/README.md) and refreshes
the four current native views in [`qa/sway/after/`](../qa/sway/after/). The attached
[desktop concept](<../images/Dhara Productivity Dashboard with Cat Companion.png>),
[small kitten](../images/cat-companion.png),
[mobile concept](../images/reference-mobile-app-ui-design.png) and
[tablet concept](../images/reference-tablet-app-ui-design.png) communicate
direction, not implemented functionality or layouts to reproduce wholesale.

- Preserve the compact Overview / Capture / Notes / Tasks interface delivered by
  the React + Electron cutover. Change layout only for a demonstrated usability,
  accessibility, scaling or platform-integration problem.
- Keep abstract graphics subtle, inside the app and outside reading/editing
  surfaces. Keep the kitten tiny, with dot/hidden modes and on-demand controls.
- Do not reintroduce large dashboard cards, permanent overlays, decorative
  headers or photorealistic cats from older concepts. Owner decision 18B keeps
  the variant B headings, subtitles and tagline in `web/src/copy.ts`; a daily
  motivating slogan is a later milestone that only swaps that module's source.
- Mobile/tablet references do not request device implementation or establish
  device support during this Sway milestone.
- Determine functionality from this record and actual source, never an image.
  Explain any necessary visual change and capture before/after screenshots
  using the same synthetic, non-sensitive fixture. Preserve the baseline.

The reference review itself changed documentation only. The later native-helper
fixes below address controls and status reporting; the main UI/framework remain
unchanged. Physical Sway acceptance is still a separate validation gate.

## Latest continuation: React + Electron cutover

2026-10-12: React + Electron cutover.

- The production UI is the React bundle in `web/` (variant B look), served by
  FastAPI from `web/dist`, which is not committed:
  `npm --prefix web ci && npm --prefix web run build`.
- The desktop shell is Electron (`electron/`): external mode by default, Linux
  managed mode through lifecycle protocol 2.
- Deleted: `public/`, `desktop/`, `experiments/ui-ab/hosts/wry`,
  `experiments/ui-ab/hosts/companion` and `tests/now_state.test.cjs` (ported to
  `web/src/domain/nowState.test.ts`). Untracked leftovers, including both Rust
  `target/` trees, were moved to `/home/p4nic/code/noema-cutover-backup/`. The
  kitten sprite moved to `tools/assets/cat.png`.
- IndexedDB `dhara-local-v1` version 1 is unchanged; captures queued by the old
  UI upload once.
- Headings, subtitles and the tagline are kept in `web/src/copy.ts` (owner
  decision 18B); the greeting uses `display_name`.
- Every parity-map row is green or an approved drop, and every handbook-trace
  row is green. Gate results, the terrain budget and the main-app memory check
  (handbook §21, < 400 MB excluding AI) are in [TEST_REPORT.md](TEST_REPORT.md).
- Not built: AI-assigned priority, daily slogans, audio checkpoint recovery.
- One cutover merge of `feat/react-electron` into `master`, after owner
  approval, tagged `react-electron-cutover`. The approved Phase 6 rename to
  Dhara runs before that merge.

Next validation gate: physical Sway acceptance (handbook §24 Stage A). This
migration does not satisfy it; follow [the device checklist](PHYSICAL_SWAY_ACCEPTANCE.md).

### Rollback to the pre-migration UI

1. Flush first. In the Electron app, wait until the status line no longer shows
   "N capture(s) on this device" (open it and Retry if needed), then quit. Captures
   still queued in the Electron profile are not readable by the restored
   Rust/WebKit shell; this is accepted.
2. In `docs/superpowers`, only `specs/parity-map.md` and `specs/handbook-trace.md`
   are tracked; after the merge they are restorable with
   `git checkout react-electron-cutover^2 -- docs/superpowers/specs/parity-map.md docs/superpowers/specs/handbook-trace.md`.
   The migration spec and plans are untracked by owner decision, so no git
   command restores them: keep a copy outside the worktree before a rollback.
   Revert the merge, then restore the docs and untracked files that the revert
   cannot bring back:
   ```bash
   git switch master
   git revert -m 1 --no-edit react-electron-cutover
   git checkout cutover-docs-baseline -- README.md SHA256SUMS docs/API.md docs/ARCHITECTURE.md \
     docs/ASSETS.md docs/BUILD_STATUS.md docs/CONTINUATION.md docs/DESKTOP.md \
     docs/PHYSICAL_SWAY_ACCEPTANCE.md docs/PROGRESS.md docs/SECURITY.md docs/TEST_REPORT.md \
     docs/TASK_CAPTURE.md docs/Noema-Handbook.md
   git commit -m "docs: restore pre-migration docs after rollback"
   cp -a -n /home/p4nic/code/noema-cutover-backup/desktop/. desktop/
   cp -a -n /home/p4nic/code/noema-cutover-backup/tests/now_state.test.cjs tests/
   ```
3. Browsers: the Dhara build moves the pre-rename browser database into `dhara-local-v1`
   on its first load and deletes the old one, so the pre-migration UI finds no
   queued captures: flush them first (docs/DESKTOP.md, compatibility section). The reinstalled v1 service worker deletes
   nothing of v1's; the v2 `dhara-shell-<hash>` caches are only stale storage.

## Previous continuation: frictionless task capture (historical)

**Frictionless task capture implemented, independently of pending Sway acceptance.**
Replaced only the task-creation interaction with multiline input, Add task and
collapsed Details; Ctrl/Command + Enter submits, plain Enter does not. All existing
task fields remain available, including an optional separate planned calendar day.
After durable saving, return to the prior page with compact confirmation/Edit;
never replace focus or force open the full editor.

The new explicit-intent API stores the task and immutable original atomically.
Stable capture identity handles concurrent retries/lost replies and reads current
state without overwriting corrections. Separate IndexedDB task drafts survive
dismissal/restart, and Rust Close checkpoints them. Failed local/service storage
does not claim saving; task drafts are **not** an offline task queue. Existing
structured API, capture outbox, priorities, dependencies, agent events and pins
remain intact; the schema migration is additive and tested on legacy fixture data.

Interpretation is limited, disclosed rules—not AI: concise first-line excerpt,
explicit Workflow/Next action/Context labels and unambiguous today/tomorrow/ISO
planned days. Unknown workflow stays Unassigned. Uncertain wording remains
recoverable; no inferred reminder, deadline instant, estimate, link, dependency or
extra task. Richer task AI, automatic deadline/reminder/availability extraction,
and task voice input are not implemented. Note transcription/recording is unchanged;
the reported GStreamer dependency problem is diagnosed, not device-validated.

New baseline **116 Python / 22 Now**; final **141 Python** (25 focused task cases),
**27 task UI**, **58 Now browser**, **22 note recovery**, **5 Rust policy / 22 Now**,
**68 managed / 44 external WebKit** checks pass. These use disposable real data /
profiles/processes with explicitly injected failure paths; no model/hardware
claims. Before/after desktop and phone-width images of this interaction only are
in [qa/task-capture](../qa/task-capture/README.md), visually inspected. Current QA
inventory: **39 PNGs**, the previous 35 preserved plus these four. Current source
identity: `qa/task-capture/source-after.sha256`; earlier manifests stay historical.
Dhara is still untracked, no parent commit claimed as its revision.

**Physical A remains BLOCKED/PENDING; managed lifecycle remains opt-in; external
default unchanged.** No new complete-process measurements or device acceptance.
A-FOCUS-01 remains open. Next: the existing guided physical launch/quit/relaunch,
including a task-draft dismissal/reopen check. Unfinished voice/long-recording
recovery remains a later functional priority, not started in this pass.

## Previous continuation: screenshot follow-up (historical)

**Saved current screenshots and updated the handoff; no new feature milestone.**
The user-reported launch with literal `/absolute/...` placeholders failed with
“Cannot create webview profile”; a corrected writable-path command was provided.
The subsequent user command was aborted, so it is not a demonstrated launch.
A read-only exact-executable check found no running Dhara shell at capture time.

Saved [empty and populated Now screenshots](../qa/managed-service/screenshots-2026-10-08/README.md)
from the normal managed development binary in one disposable synthetic workspace,
on private Xvfb/X11—not the user's desktop. Images were visually inspected.
Reused fixture content/helpers, actual service API and normal UI refresh; no
layout/framework/kitten/task-system change. A programmatic normal-close request
exited 0 and the owned backend disappeared. This is screenshot evidence, not
physical input/Wayland/device acceptance. The tiny in-app kitten is a browser
preview, not a native overlay. The temporary fixture was removed afterward;
user data and previous evidence were untouched.

**A remains BLOCKED/PENDING; B remains implemented as Linux development opt-in;
external remains the default.** No acceptance suite, performance sample or model
was rerun. Most recent behavior-test results below remain historical to that
implementation pass. A-FOCUS-01 remains open. QA inventory at that checkpoint: **35 PNGs**,
the preserved 33 plus these two requested captures. Current source checkpoint:
`qa/managed-service/screenshots-2026-10-08/source-after.sha256`; previous manifests
remain intact. Next is the existing guided physical launch/quit/relaunch check.

## Managed-service implementation continuation

**A: BLOCKED ON DEVICE. B: IMPLEMENTED, Linux development opt-in; physical
launch/quit/relaunch still pending. Production default: external, unchanged.**
The user's revised gate permits independent lifecycle implementation, not a
physical acceptance claim. `--manage-service --data-dir PATH` starts the existing
Python service through a background Rust owner. Workspace/profile locks,
prebound stable loopback endpoint, private instance/workspace acknowledgement
and HTTP identity verification precede navigation. A compact transient native
startup/error bar offers explicit Retry/Cancel; after a crash Retry reconnects
without reloading the editor. Close checkpoints first and then stops/reaps only
the owned service group. Hide does not quit. A private stdin lifetime lease
handles Linux shell SIGTERM/SIGKILL; abrupt death does not checkpoint new edits.
No schema/task/pin/UI/companion redesign, model launch or observation was added.

Baseline this pass: 99 Python, 5 Rust policy, 22 Now tests. Final Python:
116 passed, including 17 new API/real-process lifecycle cases. Real WebKit
restart/failure/retry evidence and virtual process samples are detailed in
[TEST_REPORT.md](TEST_REPORT.md), separate from historical counts below.
During that implementation pass, all 33 QA images and approved artwork were
preserved and no screenshots were generated. The later screenshot follow-up
above adds only two main-window views.
A-FOCUS-01 remains open. That implementation's source identity is the manifest in
`qa/managed-service/source-after.sha256`, not the untracked app's parent HEAD.
See [launch/quit/retry policy](DESKTOP.md) and the short added managed-mode
[physical checklist](PHYSICAL_SWAY_ACCEPTANCE.md#managed-mode-guided-device-check-pending).

## Previous continuation: physical-gate preparation (historical)

**Phase A: BLOCKED ON DEVICE. Phase B: NOT STARTED.** Read-only inventory
confirms live Sway IPC and reports the target i7-1270P with eDP-1/DP-5 at scale
1.0; physical interaction cannot be exercised through the available tools.
Added a [single device acceptance checklist](PHYSICAL_SWAY_ACCEPTANCE.md),
synthetic fixture preparation, sanitized session recorder and content-free
process-tree sampler. No production/backend/UI/companion/lifecycle code changed.
No headless companion rerun substitutes for A. Before/final source manifests
under `qa/device-acceptance/` replace a Git revision for this untracked app.
Source characterization records explanation gap A-FOCUS-01 for device review;
pin protection/ranking are unchanged. Complete-app workload measurements remain
blocked. At that checkpoint B was gated on A; the user's subsequent explicit
change permits opt-in implementation independently. Device acceptance is still pending.

## Previous pointer continuation

Added repeatable native pointer acceptance without changing production code.
The private Sway fixture registers a virtual pointer, then delivers press/release
events through Sway IPC and Wayland rather than GTK `clicked` signals. It checks
Cat/Dot controls at 100%/150%/200%, outside-click pass-through and preserved
keyboard focus; task URL, 32/48 sizing, pause/resume and Hidden are also covered.
The 41 checks preserve permission, pinned focus, manual priority and note state.
Three current synthetic screenshots are in [companion-input](../qa/companion-input/README.md).
Physical pointer/monitor validation and OS browser dispatch remain separate.

## What we have built

“Implemented” means code exists; device-dependent behavior may still need
validation. Tests do not make every feature production-ready.

| Area | Implemented now | Boundary / evidence |
|---|---|---|
| Local service | Persistent notes, attachments, revisions, tasks, reminders, settings and agent events in SQLite. | Original tests preserved; 141 current Python tests, including 17 lifecycle/API and 25 task-capture cases. [Architecture](ARCHITECTURE.md), [API](API.md). |
| Task capture | One multiline input, collapsed Details, durable originals, conservative model-free planned-day rules, retry identity and separate recovered drafts. | 27 Chromium and real managed/external WebKit checks; no offline task queue, task voice path or richer AI interpretation. [Permanent contract](TASK_CAPTURE.md). |
| Capture and notes | Explicit text/image/sketch/audio capture; original retained separately from editable content; revision history and edit conflicts. | No automatic task creation. Optional model cleanup is not required; actual microphone/model quality remains unvalidated. |
| Capture recovery | Atomic browser outbox insertion + draft reset, serialized draft writes, visible local-save errors and retry. | Real Chrome persistence/fault-injection checks; unfinished audio and abrupt-loss gaps remain. [Continuation](CONTINUATION.md). |
| Tasks and focus | Dependencies, start/due dates, optional estimates, explainable priorities, durable manual overrides, selected/inferred/pinned focus. | Existing service rules preserved; UI labels provenance and confirms explicit pin replacement. |
| Agents | Task-scoped tokens, ordered/deduplicated events, subprocess wrapper with durable retry, review/questions/failure/stale states. | Tracks deliberately wrapped commands, not arbitrary running agents. Agent exit does not complete the task. |
| Now interface | Distinct empty/notes-only, available, waiting, attention, complete, unknown and disconnected states; one grounded action, disclosed alternatives, useful real setup flow. | 22 current pure state tests; 58 historical browser checks. A-FOCUS-01 records the pin/recommendation explanation gap. Integration connection health has no dedicated API; no runs means unknown, not disconnected. |
| Kitten and motion | Separate GTK/Sway popup (unchanged; sprite `tools/assets/cat.png`) and an optional in-app WebGL2 terrain: motion off by default, static without WebGL2, paused when hidden, blurred or idle. | Browser kitten preview removed at the cutover. Terrain budget measured once in TEST_REPORT. Physical-device behavior remains unvalidated; no reliable presence detection. |
| Desktop shell | Electron shell loading the service origin: sandboxed renderer, same-origin navigation, session-only permissions, draft close checkpoint; opt-in Linux managed lifecycle (protocol 2). | Real-process lifecycle and `_electron` checks; default remains external. Physical acceptance, installer and Windows/macOS remain unproven. [Desktop guide](DESKTOP.md). |
| Reminders and export | In-app due queue, snooze/dismiss and restart handling; Markdown/JSON/attachment export. | No guaranteed closed-app/powered-off notifications; complete import/restore is not implemented. |
| Optional processing | Ollama cleanup adapter and faster-whisper CPU subprocess adapter. | Model tests use doubles. Actual technical-speech accuracy, model quality and hardware latency are unvalidated. |

## Completed milestones

2026-10-12: React + Electron cutover; see the latest continuation above.

2026-10-09: frictionless task capture delivered and made a permanent product
requirement; exact boundaries and evidence are in the previous continuation above.

Numbered entries below were recorded on 2026-10-08; order matters more than the shared
date. Dhara is currently untracked in the parent repository, so its parent HEAD
is not an application revision identifier. No release/version bump is claimed.

1. **Recovered and inspected the actual 0.1.0 baseline.** Read the build/continue
   prompts and handbook, checked source, security and tests. The archived 0.2.0
   documentation is not evidence that screen-awareness code exists here.
2. **Hardened browser capture recovery.** Atomic Save/draft reset and visible
   storage-error retry; kept explicit Save, originals and existing task rules.
3. **Explored Qt/QML, then superseded it.** The user rejected that interface.
   It is not the active client or framework direction. Historical evidence in
   `qa/rust-desktop/` is labeled retired, not current functionality.
4. **Restored the webview interface with Rust infrastructure.** Wry/Tao wraps
   the existing UI and Python service instead of duplicating task/note state.
   Native profile/restart/editor checks were added; browser recovery retained.
5. **Refined Now without redesigning it.** Improved readability and spacing,
   truthful state distinctions, one primary suggestion, focus provenance,
   real setup, kitten controls and unobtrusive motion. Added isolated tests and
   desktop/phone-width screenshots; no demo tasks entered the user's workspace.
6. **Added this maintained progress record.** Linked from README and build status
   so the next session starts with implemented work and known gaps.
7. **Fixed and tested the native Sway helper.** Added local Hide/Pause/Resume,
   truthful report labels, tiny sizes, placement retention and server-Hidden
   precedence. Real private headless Sway/GTK/Rust webview tests cover metadata
   rule mapping without replacing pinned focus, two synthetic outputs and
   hide/restore. This is protocol acceptance, not completed physical-device
   acceptance. A minimal web settings deep link preserves open editors; the
   main layout, backend and framework were not changed.
8. **Kept only current test screenshots at the user's request.** Moved 31
   superseded images to system Trash. The latest 17 Now-state screenshots are
   consolidated in `qa/now-ui/`; retained four current Sway views and two current
   native-storage views. Historical result JSON/logs and approved references
   remain. Screenshot links now point to the retained current images.
9. **Removed the remaining earlier QA screenshot sets.** At the user's follow-up
   request, moved the other 19 Now/browser storage images to system Trash. Only
   four current images in `qa/sway/after/` remain. Historical logs/results,
   references, source/test code and user data are unchanged; stale links removed.
10. **Made the native kitten clearly visible without redesigning Dhara.** Kept
    the approved bitmap and main UI/CSS/framework; added a small pale-sage
    rounded container, border/shadow and scale-aware rendering. Click opens one
    available task's saved action and its implemented details link; a menu
    holds secondary controls. Popovers are non-modal and never request keyboard
    focus. Cat/Dot/Hidden, local pause, permission gates and placement remain.
    Empty/disconnected/changed-work and long-text cases are covered. Added
    before/after dark/light and scale captures using disposable synthetic data.
    The summary adds only saved next-action text; priorities/pins/schema and
    observation authority are unchanged. Native-presence detection and real
    event-triggered attention messages remain pending, not guessed or mocked
    into the running product.
11. **Added native pointer delivery acceptance.** A guarded, temporary virtual
    pointer gives the headless seat input capability. Actual Wayland pointer
    events exercise native controls and desktop pass-through, not direct GTK
    button activation. No production defect surfaced, so runtime code, visual
    design, placement rules and observation permissions remain unchanged.
12. **Prepared the physical acceptance gate, not completed it.** Recorded live
    session facts without private content, fingerprinted the actual untracked
    source, added isolated fixture/sampling tools and focused tooling/source
    tests. No physical workflow was performed. Phase B was gated at that point;
    the subsequent user instruction explicitly changed that restriction.
13. **Implemented opt-in Rust-owned Linux service lifecycle.** Existing Python
    service and web UI retained; verified startup, exclusive workspace/profile,
    stable origin, explicit retry, checkpoint-first close and child-group cleanup.
    Private pipe lifetime policy tested with real terminated owners. Production
    defaults remain external; physical validation is not claimed.

## Managed lifecycle validation (historical · 2026-10-08)

That implementation: **99 → 116 Python, 5 Rust policy, 22 Now tests**. Its
WebKit/process results, injected paths, source fingerprint and actual
virtual idle sample are in [TEST_REPORT.md](TEST_REPORT.md#opt-in-managed-service-lifecycle-2026-10-08).
Physical workloads remain blocked. The table below is the **previous physical-
gate preparation**, not a second newly executed baseline/final result.

These are separate suites, not a combined claim of end-to-end product coverage.
Current device-gate preparation used disposable tests, never the user's `.data`.

| Rerun now | Result | Boundary |
|---|---|---|
| Python baseline / final | 88 / 99 passed | Eleven new QA-tooling tests; one existing dependency warning. Real disposable server/agent cases retained. Synthetic child-tree accounting is not app/device performance. |
| Now pure state baseline / final | 18 / 22 passed | Four new source-characterization cases; no physical UI interaction or new ranking policy. |
| Rust policy | 5 passed | Same origin/link/profile-lock tests, not service ownership. |
| Normal Linux development build | Passed | Existing Wry/Tao shell, QA feature off; no physical launch or installer. |
| Parse / compile / format / approved docs | Passed / 45 hashes | Active source unchanged except QA tests/tools/docs; archived references preserved. |
| Physical A / resource workloads | BLOCKED ON DEVICE | Checklist has per-check status; session inventory is read-only evidence only. |

The following results are **historical, not rerun in this device-gate pass**.
The visibility pass ran its Python baseline at 80 and finished at 88. The later
pointer pass ran 88 before and after and reran 31 native regression checks.

| Check | Result | What it establishes |
|---|---|---|
| Visibility Python baseline / post-change | 80 / 88 passed | Eight additional API/asset cases; original backend tests preserved. |
| Pointer Python baseline / final | 88 / 88 passed | QA-only continuation; 31 native regression checks also rerun then, not now. |
| Native helper policy/asset | 19 passed, included in the 88 | Pure fixtures, actual bitmap hash and explicit client/observer/event-loop doubles; no GI/device claim. |
| Sway native regression | 31 passed | Real private Sway/GTK/HTTP/SQLite/Rust webview; two outputs, metadata/pin protection and hide/restore. Real initial poll with controlled GTK scheduling avoids racing injected fixtures; recurring thread scheduling is not tested. |
| Kitten visibility | 41 after; 14 before | Same synthetic fixture, dark/light, 1/1.5/2 compositor scales, focus sentinel, non-modal panel/menu, action links, long text, Cat/Dot/Hidden and unchanged permission. Programmatic clicks; explicit outage/state injections. |
| Native pointer delivery | 41 passed | Private virtual pointer + actual Sway IPC/Wayland events; controls, outside-click pass-through, focus, task URL, size, pause/resume, Hidden and permission/pin protection. Browser dispatch intercepted; not physical input or polling-thread validation. |
| Now state unit tests | 18 passed | Actual pure presentation helpers with explicit snapshot fixtures. |
| Settings deep link | 8 passed | Actual Chrome/HTTP/SQLite; existing dialog and permission updates, unsaved Capture/note editor and originals preserved. Not an OS browser-launch test. |
| Task deep link | 9 passed | Real Chrome/HTTP/SQLite; actual existing task dialog and saved action, drafts/routes/original/pin preserved, missing-task error. |
| Now browser UI | 58 passed again | Real Chrome/HTTP/SQLite with explicit network/visibility injections; results retained without extra Now screenshots. |
| Browser adapter | 14 passed in preceding milestone | Not rerun; explicit storage/transport doubles. |
| Native browser recovery | 22 passed in preceding milestone | Not rerun; real Chrome/service worker/restart with injected failures. |
| Rust webview restart/editor suite | 26 assertions passed in preceding milestone | Not rerun; real WebKit on virtual X11. Current Sway suite independently tests native Wayland mapping/hide/restore. |
| Rust policy tests | 5 passed again | Origin/link/profile-lock rules. |
| Approved documentation assets | 45 manifest entries verified unchanged | Original documentation bundle preserved. |

Exact commands, changed files, raw-result paths and limitations:
[TEST_REPORT.md](TEST_REPORT.md). UI screenshots are implemented pages with
synthetic test data, not design mockups:

| Current view | Screenshot |
|---|---|
| Dark desktop before / after | [Before](../qa/kitten-visibility/before/dark-1x.png) / [After](../qa/kitten-visibility/after/dark-1x.png) |
| Light desktop before / after | [Before](../qa/kitten-visibility/before/light-1x.png) / [After](../qa/kitten-visibility/after/light-1x.png) |
| Task panel / secondary menu | [Task](../qa/kitten-visibility/after/task-panel.png) / [Menu](../qa/kitten-visibility/after/menu.png) |
| Native controls | [Controls](../qa/sway/after/controls.png) |
| Observer paused | [Paused](../qa/sway/after/paused.png) |
| Helper disconnected | [Disconnected](../qa/sway/after/disconnected.png) |
| Desktop restored | [Desktop](../qa/sway/after/restored-desktop.png) |

At the lifecycle handoff the inspected inventory was **33 QA PNGs**: 26 visibility images, four
refreshed native views and three pointer-pass views in `qa/companion-input/after/`.
The requested screenshot follow-up adds two synthetic Now views, making **35
current PNGs**, without removing older evidence. The earlier 30-image count preceded the pointer pass; cleanup-era counts of
four/23/17 describe their historical moments, not today's inventory. No images
were added/deleted in the device-gate pass. Earlier removed screenshots remain recoverable from system Trash
until it is emptied. A Now regression also generated 17 redundant images; those
were moved to Trash, and the suite rerun with screenshot capture disabled.
Phone-width Chrome does not demonstrate Android, and virtual X11 does not
demonstrate physical Sway. Nor does the new headless Sway suite establish
physical input, microphone, real monitor scaling or GPU behavior. Reliable
native-companion presence detection and event-triggered attention messages
are still unimplemented; the browser kitten preview was removed at the React + Electron cutover.
Installation, cloud synchronization, model accuracy,
native overlay placement and full-process RAM/CPU/battery targets are unproven.

## Remaining work and proposed order

These are planned milestones, not implemented features or permission to change
frameworks. Keep the current working app throughout.

| Order | Work | Completion gate |
|---|---|---|
| Next validation gate · PENDING | Physical Sway acceptance (handbook §24 Stage A) with the single disposable fixture, now on the Electron shell: editor keyboard/clipboard, Overview/pinned focus, minimize/restore, file picker, microphone, agent review, kitten/routing and the opt-in managed launch/quit/relaunch. | Every required checklist row has actual device evidence and failures resolved; complete attributable-process workload measurements. |
| Next build milestone | AI-assigned automatic priority (spec §11.1): the optional local model sets the automatic priority with `priority_source = 'ai'` and a one-line reason; the deterministic rules stay the fallback (`'rules'`). Manual overrides, pins, focus, deadlines and status are never touched. | Schema-validated model output, fallback without a model, override and pin preservation tests. The UI already shows "Auto · AI". |
| Before the merge | Phase 6 rename to Dhara (approved; see `docs/superpowers/specs/2026-10-12-rename-dhara-design.md`), then the owner-approved cutover merge. | Rename lands on `feat/react-electron` before the `react-electron-cutover` merge. |
| After the merge | Remove the rename shims one release later: `git grep -n 'rename-shim:'` lists every line; also `noema/` (shim package), `web/src/local/migrate.ts` + test, and the call sites in `web/src/main.tsx`, `electron/src/main.ts`, `web/src/strings.ts`. Known, accepted: on the first boot after the upgrade a second pre-rename tab writing a capture in the milliseconds between the migration's read and its delete loses that capture (double upload in the other direction is harmless; the server dedupes by capture id). | `git grep -n 'rename-shim:'` returns nothing and the full gate is green. |
| After the merge | Speech in managed mode: a workspace setting (`speech_model`, Settings dialog) read by the worker, because managed launch strips `DHARA_SPEECH_MODEL` from the service environment (external mode uses the env var; see README). | A capture recorded in the Electron shell can be transcribed without any environment variable. |
| Packaging follow-on | `.deb` from the same `release/out/AppDir`: `usr/lib/dhara` with a root-owned 4755 `chrome-sandbox` beside the binary (so neither the one-time line nor the builder-uid limit of the AppImage applies), `dhara.desktop` and the icon under `usr/share`. | `dpkg -i` on a clean Ubuntu 24.04 starts Dhara sandboxed on the default workspace; `dpkg -r` leaves `~/.local/share/dhara` untouched. |
| Release checklist | Bump `pyproject.toml` and `electron/package.json` together (`tests/test_release.py` holds them equal), full gate, `npm --prefix electron run package`, `npm --prefix electron run e2e -- e2e/packaged.spec.ts`, record sizes and versions in TEST_REPORT.md, regenerate `SHA256SUMS`, tag. | Every item is a command or a file in this repository; signing and auto-update stay out of scope. |
| 3 | Recoverable unfinished audio checkpoints and long-capture processing. | Interrupted recording/storage-failure tests, explicit Save preserved, original bytes retained. Benchmark optional models on actual technical recordings before choosing defaults. |
| 4 | Tested import/restore, backup workflow and deletion/retention controls. | Round-trip notes/attachments/revisions; failed-restore recovery without overwriting the user's workspace. |
| 5 | Integration health reporting and permission-scoped OS observation/companion improvements. | Connection health distinct from run counts; explicit observer enablement and exclusions; pin protection; real compositor tests. Screenshot/vision inference is not present now. |
| 6 | Authenticated device pairing, HTTPS synchronization and conflict-safe outboxes; Android capture client. | Offline/retry/conflict/security tests and actual devices. Kotlin/Compose is a proposed Android direction, not an existing client. No cloud sync exists today. |
| Later | Daily motivating slogan (spec §11.2): the Overview slogan changes each day by swapping `web/src/copy.ts`'s source to a list picked by date; an optional AI-generated variant uses the same local model. | No network service; stable within a day; the base app still needs no model. |
| Backlog candidates | Phone shortcut capture, nightly export snapshot, Markdown mirror, opt-in daily prompts. Candidates only; unscheduled and not designed. | Each needs its own spec and tests before work starts. |
| Follow-on | Reduce the animated terrain cost (fps/grid) before enabling motion by default. | Animated measured 4.33% of one core vs the < 3% budget; Paused/Hidden pass. |

After Stage A, AI-assigned priority is the next build milestone; unfinished
voice capture and long recordings follow. Whistle is only a candidate for a
separate comparative transcription evaluation; nothing was started or
downloaded here.

The Slint versus Rust + Qt/QML comparison is closed: the shell was chosen by
measurement and is Electron (migration spec decision 1A).

## How to keep this record current

- Read this document, [BUILD_STATUS.md](BUILD_STATUS.md) and the current test
  report before continuing; consult the original prompts/handbook for constraints.
- After each completed milestone, update the date/current stack, capability
  boundaries and next step, then append a dated milestone entry. Preserve
  superseded decisions as history rather than silently calling them current.
- Record actual changed files, exact executed commands, results and fixture
  isolation in the test report. Label doubles, injected failures, skipped tests
  and unvalidated hardware/model behavior explicitly.
- Add screenshot/evidence links when relevant. Never put demonstration data,
  tokens, private notes or screenshots of the user's screen into progress docs.
- Keep README and build status linked here. This is a repository record updated
  with development milestones, not an automatic background monitoring service.
