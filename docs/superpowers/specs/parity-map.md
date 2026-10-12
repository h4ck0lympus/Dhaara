# Parity map (spec §8)

Produced by Task 1 of `docs/superpowers/plans/2026-10-10-react-electron/01-foundation.md` from the source suites at `master` `e0ca9ad`. The cutover merge is blocked until every row is `green` or `drop (approved)`.

## Rules

- **Test title = label.** The target test's title is the label verbatim. A computed label (shown as a code span) becomes one parametrized test whose rendered titles substitute each value:
  - `now_ui_check.py:118/137/138`: `kind` ∈ new, available, waiting, attention, complete, unknown, disconnected (`now_ui_check.py:128`); `label` ∈ desktop, mobile (`now_ui_check.py:114-115`).
  - `task_capture_check.py:71/76`: `width` ∈ 1200, 390 (`task_capture_check.py:37`).
  - `webview_check.py:143`: both branch strings are titles. `webview_check.py:170`: `stage` ∈ the managed stages of `webview_check.py:87-91`. `webview_check.py:175`: `expected_notes` = 2 (managed run).
- **Phase** is the contract phase id (`00-contract.md` §10); **Target** is the test file from contract §9.4 / §1.2. A phase whose test covers several labels under one title rewrites the Target cell to `<file> › "<title>"` (several joined with `; `); `06-cutover.md` Task 11 checks every cited title, and otherwise the label itself, exists verbatim in the file. Plan files in `docs/superpowers/plans/2026-10-10-react-electron/`: P1 and P2 → `01-foundation.md` (except P2 rows targeting `web/src/domain/nowState.test.ts`, created by `02-screens-core.md` Task 2); P3 → `02-screens-core.md` (`checkpoint.spec.ts` → `03-screens-capture-notes.md`); P4 → `02-screens-core.md` or `03-screens-capture-notes.md`, whichever creates the target file (`03-screens-capture-notes.md` Task 15 retargets the rows it moves); P5 → `04-terrain.md`; P6 → `05-electron.md` (Electron and lifecycle rows) and `06-cutover.md`. A phase that must move a row records the move in its own plan.
- **Status:** `planned` → `green` (set by `06-cutover.md` Task 11 after the full gate) · `drop (proposed): <reason>` → `drop (approved): <reason>` (owner only; the value `06-cutover.md` Task 11 writes and checks).
- "No uncaught … JavaScript errors" rows are satisfied by the P1 auto fixture `guards` (`web/e2e/fixtures.ts`, built on `guardContext`), which fails every E2E test that sees an uncaught page error or CSP violation.
- Section B lists every prose string in `public/app.js` (generator in Task 1). A string either lives in `S` (`web/src/strings.ts`, pinned by `web/src/strings.test.ts`), is a verbatim literal in the named component (asserted by the named spec), or is recorded as replaced/removed with the spec or owner decision that replaced it.

## A. Check labels

| # | Source | Label (verbatim) | Phase | Target test file | Status |
|---|---|---|---|---|---|
| 1 | desktop/qa/scenario.js:22 | Original web UI loaded | — | — | drop (proposed): asserts the deleted `public/` UI (spec §3); `scenario.spec.ts` loads the React shell in every stage |
| 2 | desktop/qa/scenario.js:23 | Original stylesheet used | — | — | drop (proposed): asserts `/static/styles.css`, which spec §6.1 removes |
| 3 | desktop/qa/scenario.js:35 | Explicit offline Save queues a capture while backend is stopped | P6 | electron/e2e/scenario.spec.ts | planned |
| 4 | desktop/qa/scenario.js:40 | Editor remains usable while backend is stopped | P6 | electron/e2e/scenario.spec.ts | planned |
| 5 | desktop/qa/scenario.js:43 | Explicit native Retry reconnects without navigating or losing draft | P6 | electron/e2e/scenario.spec.ts | planned |
| 6 | desktop/qa/scenario.js:45 | Retry uploads queued capture once without ingesting unsaved draft | P6 | electron/e2e/scenario.spec.ts | planned |
| 7 | desktop/qa/scenario.js:56 | Native webview initially focuses multiline task capture | P6 | electron/e2e/scenario.spec.ts | planned |
| 8 | desktop/qa/scenario.js:57 | Native Details starts collapsed | P6 | electron/e2e/scenario.spec.ts | planned |
| 9 | desktop/qa/scenario.js:65 | Native one-input Save durably adds one task | P6 | electron/e2e/scenario.spec.ts | planned |
| 10 | desktop/qa/scenario.js:66 | Native capture preserves override and separates planned day | P6 | electron/e2e/scenario.spec.ts | planned |
| 11 | desktop/qa/scenario.js:67 | Native task capture never changes the existing pin | P6 | electron/e2e/scenario.spec.ts | planned |
| 12 | desktop/qa/scenario.js:75 | Task draft survives actual shell/profile/service restart | P6 | electron/e2e/scenario.spec.ts | planned |
| 13 | desktop/qa/scenario.js:81 | Failed task checkpoint keeps committed task draft | P6 | electron/e2e/scenario.spec.ts | planned |
| 14 | desktop/qa/scenario.js:82 | Failed task checkpoint keeps managed service/window usable | P6 | electron/e2e/scenario.spec.ts | planned |
| 15 | desktop/qa/scenario.js:89 | Native capture reopens the exact unsaved task input | P6 | electron/e2e/scenario.spec.ts | planned |
| 16 | desktop/qa/scenario.js:91 | Task draft recovery never auto-submits | P6 | electron/e2e/scenario.spec.ts | planned |
| 17 | desktop/qa/scenario.js:102 | Native webview IndexedDB commits draft | P6 | electron/e2e/scenario.spec.ts | planned |
| 18 | desktop/qa/scenario.js:103 | Synthetic image paste stores native Blob attachment | P6 | electron/e2e/scenario.spec.ts | planned |
| 19 | desktop/qa/scenario.js:104 | Nothing ingested before explicit Save | P6 | electron/e2e/scenario.spec.ts | planned |
| 20 | desktop/qa/scenario.js:109 | Close checkpoint and draft survive webview process restart | P6 | electron/e2e/scenario.spec.ts | planned |
| 21 | desktop/qa/scenario.js:111 | Blob survives webview process restart | P6 | electron/e2e/scenario.spec.ts | planned |
| 22 | desktop/qa/scenario.js:113 | Recovered Blob bytes are exact | P6 | electron/e2e/scenario.spec.ts | planned |
| 23 | desktop/qa/scenario.js:116 | Capture commits and resets local draft | P6 | electron/e2e/scenario.spec.ts | planned |
| 24 | desktop/qa/scenario.js:117 | Acknowledged capture removed from native outbox | P6 | electron/e2e/scenario.spec.ts | planned |
| 25 | desktop/qa/scenario.js:119 | Original text committed to real service | P6 | electron/e2e/scenario.spec.ts | planned |
| 26 | desktop/qa/scenario.js:120 | Original attachment committed to real service | P6 | electron/e2e/scenario.spec.ts | planned |
| 27 | desktop/qa/scenario.js:128 | Actual note editor accepts focus | P6 | electron/e2e/scenario.spec.ts | planned |
| 28 | desktop/qa/scenario.js:129 | Actual WebKit editor accepts multiline code | P6 | electron/e2e/scenario.spec.ts | planned |
| 29 | desktop/qa/scenario.js:130 | Native editor undo restores previous text | P6 | electron/e2e/scenario.spec.ts | planned |
| 30 | desktop/qa/scenario.js:134 | Saved code renders in actual note viewer | P6 | electron/e2e/scenario.spec.ts | planned |
| 31 | desktop/qa/scenario.js:135 | Edit retains original | P6 | electron/e2e/scenario.spec.ts | planned |
| 32 | desktop/qa/scenario.js:139 | Manual priority and pinned focus preserved | P6 | electron/e2e/scenario.spec.ts | planned |
| 33 | desktop/qa/scenario.js:154 | Declined checkpoint-risk prompt retains editor | P6 | electron/e2e/scenario.spec.ts | planned |
| 34 | desktop/qa/scenario.js:155 | Declined close retains live backend without duplicate capture | P6 | electron/e2e/scenario.spec.ts | planned |
| 35 | desktop/qa/scenario.js:159 | Recovered checkpoint-failure draft on managed relaunch | P6 | electron/e2e/scenario.spec.ts | planned |
| 36 | desktop/qa/scenario.js:160 | Recovery draft was not automatically ingested | P6 | electron/e2e/scenario.spec.ts | planned |
| 37 | desktop/qa/scenario.js:163 | Saved capture does not reappear on restart | P6 | electron/e2e/scenario.spec.ts | planned |
| 38 | desktop/qa/scenario.js:164 | Restart does not duplicate capture | P6 | electron/e2e/scenario.spec.ts | planned |
| 39 | desktop/qa/scenario.js:165 | Focus and manual priority survive restart | P6 | electron/e2e/scenario.spec.ts | planned |
| 40 | desktop/qa/scenario.js:167 | Original, edited code and revisions survive backend restart | P6 | electron/e2e/scenario.spec.ts | planned |
| 41 | experiments/ui-ab/scripts/verify.py:41 | Terrain animates, stays static with reduced motion, pauses when hidden, and does not capture input | P5 | web/e2e/terrain.spec.ts | planned |
| 42 | experiments/ui-ab/scripts/verify.py:42 | Task draft survives close and reload; initially focused; Enter inserts newline | P4 | web/e2e/task-capture.spec.ts | planned |
| 43 | experiments/ui-ab/scripts/verify.py:43 | Fixture preserves raw input, coarse Tonight, provenance; returns to Plan with Edit | — | — | drop (proposed): fixture interpreter and the hard-coded "Tonight" are removed (spec §4.6); provenance and Edit are covered by row "Compact confirmation includes Edit and does not open full editor" |
| 44 | experiments/ui-ab/scripts/verify.py:57 | Mouse submission from Now reveals the new task without jumping the viewport | P4 | web/e2e/now.spec.ts | planned |
| 45 | experiments/ui-ab/scripts/verify.py:62 | Saved task is visible and reopenable from Now after reload; pin is preserved | P4 | web/e2e/now.spec.ts | planned |
| 46 | experiments/ui-ab/scripts/verify.py:64 | Manual priority persists after reload | P4 | web/e2e/plan.spec.ts | planned |
| 47 | experiments/ui-ab/scripts/verify.py:65 | Unsupported input saved with honest unavailable interpretation | P4 | web/e2e/task-capture.spec.ts | planned |
| 48 | experiments/ui-ab/scripts/verify.py:67 | Repeated submit does not duplicate task | P4 | web/e2e/task-capture.spec.ts | planned |
| 49 | experiments/ui-ab/scripts/verify.py:68 | Separate focus, next actions and Tasks; colored priorities and manual completion persist without changing pin | P4 | web/e2e/now.spec.ts | planned |
| 50 | experiments/ui-ab/scripts/verify.py:69 | Image attachment preview, capture save, note edit/save/reopen, immutable original | P4 | web/e2e/notes.spec.ts | planned |
| 51 | experiments/ui-ab/scripts/verify.py:70 | Voice controls are explicitly simulated; no recording permission opened | — | — | drop (proposed): the simulated voice demo is removed; the real recorder is covered by handbook-trace row R8 "No microphone permission is requested before Record" |
| 52 | experiments/ui-ab/scripts/verify.py:71 | Companion modes persist; browser reports no native connection and contains no kitten overlay | P4 | web/e2e/settings.spec.ts | planned |
| 53 | experiments/ui-ab/scripts/verify.py:76 | Open desktop panel becomes a modal on resize; narrow dialog traps Tab and Escape closes | P3 | web/e2e/shell.spec.ts | planned |
| 54 | experiments/ui-ab/scripts/verify.py:80 | Failed submission reports an inline error, retains wording and refuses unsafe close | P4 | web/e2e/task-capture.spec.ts | planned |
| 55 | experiments/ui-ab/scripts/verify.py:83 | Empty, waiting, review and offline/unknown fixture states rendered | P4 | web/e2e/now.spec.ts | planned |
| 56 | qa/browser_check.py:109 | Real API-backed overview renders | P4 | web/e2e/now.spec.ts | planned |
| 57 | qa/browser_check.py:114 | Create task form persists to real SQLite | P4 | web/e2e/task-capture.spec.ts | planned |
| 58 | qa/browser_check.py:117 | Manual priority control persists | P4 | web/e2e/plan.spec.ts | planned |
| 59 | qa/browser_check.py:127 | Text and uploaded image commit together | P4 | web/e2e/capture.spec.ts | planned |
| 60 | qa/browser_check.py:132 | Note edits create revision and retain raw text | P4 | web/e2e/notes.spec.ts | planned |
| 61 | qa/browser_check.py:133 | Original tab shows untouched capture | P4 | web/e2e/notes.spec.ts | planned |
| 62 | qa/browser_check.py:135 | History restore adds another revision | P4 | web/e2e/notes.spec.ts | planned |
| 63 | qa/browser_check.py:139 | Offline capture remains queued in storage adapter | P4 | web/e2e/capture.spec.ts | planned |
| 64 | qa/browser_check.py:141 | Reconnect flushes queued capture to real server | P1 | web/e2e/outbox.spec.ts | planned |
| 65 | qa/browser_check.py:144 | Note renderer does not execute untrusted HTML | P4 | web/e2e/notes.spec.ts | planned |
| 66 | qa/browser_check.py:147 | Phone layout has no horizontal overflow | P4 | web/e2e/layout.spec.ts | planned |
| 67 | qa/browser_check.py:150 | Phone capture has no horizontal overflow | P4 | web/e2e/capture.spec.ts | planned |
| 68 | qa/browser_check.py:152 | Tablet layout has no horizontal overflow | P4 | web/e2e/layout.spec.ts | planned |
| 69 | qa/browser_check.py:154 | No uncaught UI JavaScript errors | P1 | web/e2e/fixtures.ts › auto fixture `guards` (runs in every spec) | planned |
| 70 | qa/native_storage_check.py:156 | Real loopback navigation and native service worker control | P1 | web/e2e/sw.spec.ts | planned |
| 71 | qa/native_storage_check.py:160 | Older committed draft cannot label newer input as saved | P2 | web/src/local/drafts.test.ts | planned |
| 72 | qa/native_storage_check.py:166 | Unsaved draft never ingested into server notebook | P4 | web/e2e/capture.spec.ts | planned |
| 73 | qa/native_storage_check.py:175 | Draft text and exact Blob bytes survive browser process restart | P4 | web/e2e/capture.spec.ts | planned |
| 74 | qa/native_storage_check.py:179 | Service worker opens actual capture UI offline with last snapshot | P4 | web/e2e/capture.spec.ts | planned |
| 75 | qa/native_storage_check.py:184 | Explicit offline Save atomically queues original and resets stored draft | P4 | web/e2e/capture.spec.ts | planned |
| 76 | qa/native_storage_check.py:193 | Queued attachment capture survives offline browser restart | P4 | web/e2e/capture.spec.ts | planned |
| 77 | qa/native_storage_check.py:197 | Reconnect receives matching real server acknowledgment | P1 | web/e2e/outbox.spec.ts | planned |
| 78 | qa/native_storage_check.py:204 | Reconnect delivers one original note and exact attachment bytes | P1 | web/e2e/outbox.spec.ts | planned |
| 79 | qa/native_storage_check.py:215 | Aborted atomic Save keeps persisted draft and rolls back queue insertion | P4 | web/e2e/capture.spec.ts | planned |
| 80 | qa/native_storage_check.py:218 | Reload recovers original draft after transaction abort | P4 | web/e2e/capture.spec.ts | planned |
| 81 | qa/native_storage_check.py:224 | Native abort after request success still rolls back both stores | P2 | web/src/local/drafts.test.ts | planned |
| 82 | qa/native_storage_check.py:230 | Injected quota failure has persistent truthful UI and retains editor text | P4 | web/e2e/capture.spec.ts | planned |
| 83 | qa/native_storage_check.py:233 | Recovery control fits phone viewport | P4 | web/e2e/capture.spec.ts | planned |
| 84 | qa/native_storage_check.py:238 | Retry commits recovered edit through native IndexedDB | P4 | web/e2e/capture.spec.ts | planned |
| 85 | qa/native_storage_check.py:254 | Lost server acknowledgment retains queued capture ID | P1 | web/e2e/outbox.spec.ts | planned |
| 86 | qa/native_storage_check.py:266 | Browser/server restart retries lost acknowledgment without duplicate notes | P1 | web/e2e/outbox.spec.ts | planned |
| 87 | qa/native_storage_check.py:267 | Server restart retains manual priority, pinned focus and due reminder | P4 | web/e2e/now.spec.ts | planned |
| 88 | qa/native_storage_check.py:274 | Immediate Save cancels draft debounce without resurrecting a saved draft | P4 | web/e2e/capture.spec.ts | planned |
| 89 | qa/native_storage_check.py:287 | Unavailable storage at boot leaves editable UI and failed Save retains text | P4 | web/e2e/capture.spec.ts | planned |
| 90 | qa/native_storage_check.py:291 | Failed database open can retry in the same page without reloading | P2 | web/src/local/db.test.ts | planned |
| 91 | qa/native_storage_check.py:294 | No uncaught UI JavaScript errors | P1 | web/e2e/fixtures.ts › auto fixture `guards` (runs in every spec) | planned |
| 92 | qa/now_ui_check.py:118 | `kind + ' / ' + label + ' has no horizontal overflow'` | P4 | web/e2e/now.spec.ts | planned |
| 93 | qa/now_ui_check.py:137 | `kind + ' uses real server state'` | P4 | web/e2e/now.spec.ts | planned |
| 94 | qa/now_ui_check.py:138 | `kind + ' preserves the four navigation destinations'` | P4 | web/e2e/now.spec.ts | planned |
| 95 | qa/now_ui_check.py:144 | Disconnected cache has no currently actionable alternatives | P4 | web/e2e/now.spec.ts | planned |
| 96 | qa/now_ui_check.py:145 | Disconnected cache does not claim available/completed/connected integrations | P4 | web/e2e/now.spec.ts | planned |
| 97 | qa/now_ui_check.py:150 | Agent and dependency waiting reasons are distinct and real | P4 | web/e2e/now.spec.ts | planned |
| 98 | qa/now_ui_check.py:153 | Empty workspace has no agent setup or all-complete claim | P4 | web/e2e/now.spec.ts | planned |
| 99 | qa/now_ui_check.py:163 | Capture creates a learning note, never an automatic task | P4 | web/e2e/capture.spec.ts | planned |
| 100 | qa/now_ui_check.py:173 | Add a task opens an implemented form and persists explicit intent | P4 | web/e2e/task-capture.spec.ts | planned |
| 101 | qa/now_ui_check.py:176 | Readable body/secondary text meets a 4.5 contrast ratio | P4 | web/e2e/layout.spec.ts | planned |
| 102 | qa/now_ui_check.py:182 | Primary suggestion is singular and alternatives start collapsed | P4 | web/e2e/now.spec.ts | planned |
| 103 | qa/now_ui_check.py:185 | No duration, deadline or progress is fabricated | P4 | web/e2e/now.spec.ts | planned |
| 104 | qa/now_ui_check.py:196 | Agent setup creates a real task-scoped token | P4 | web/e2e/now.spec.ts | planned |
| 105 | qa/now_ui_check.py:204 | Inferred focus is separately labeled | P4 | web/e2e/now.spec.ts | planned |
| 106 | qa/now_ui_check.py:210 | Observer metadata never overrides a pinned focus | P4 | web/e2e/now.spec.ts | planned |
| 107 | qa/now_ui_check.py:212 | Now suggestion cannot silently replace pinned focus | P4 | web/e2e/now.spec.ts | planned |
| 108 | qa/now_ui_check.py:217 | Declining explicit pinned replacement preserves focus | P4 | web/e2e/now.spec.ts | planned |
| 109 | qa/now_ui_check.py:222 | Kitten reveals implemented size, mode and observation controls | P4 | web/e2e/settings.spec.ts | planned |
| 110 | qa/now_ui_check.py:228 | Hidden companion is actually hidden, not overridden by CSS | — | — | drop (proposed): the in-app kitten preview (`#companion-launch`) is removed (spec §1, §5); companion mode is still saved, covered by row "Companion modes persist; browser reports no native connection and contains no kitten overlay" |
| 111 | qa/now_ui_check.py:235 | Observation permission does not claim an active observer or screenshots | P4 | web/e2e/settings.spec.ts | planned |
| 112 | qa/now_ui_check.py:241 | Kitten stays small despite larger native helper setting | — | — | drop (proposed): the in-app kitten preview is removed (spec §1, §5); the size setting range 24–72 is covered by `settings.spec.ts` row "Kitten reveals implemented size, mode and observation controls" |
| 113 | qa/now_ui_check.py:252 | Dot field never paints over the reading surface | P5 | web/e2e/terrain.spec.ts | planned |
| 114 | qa/now_ui_check.py:260 | Reduced motion stops the actual animation timer | P5 | web/e2e/terrain.spec.ts | planned |
| 115 | qa/now_ui_check.py:266 | Injected hidden-document event stops animation | P5 | web/e2e/terrain.spec.ts | planned |
| 116 | qa/now_ui_check.py:268 | Completed agent result is still a review task, not completed work | P4 | web/e2e/now.spec.ts | planned |
| 117 | qa/now_ui_check.py:273 | Zero running agents does not erase a reported question | P4 | web/e2e/now.spec.ts | planned |
| 118 | qa/now_ui_check.py:276 | Human-attention action opens the real task/result details | P4 | web/e2e/now.spec.ts | planned |
| 119 | qa/now_ui_check.py:279 | All-complete state has no agent onboarding prompt | P4 | web/e2e/now.spec.ts | planned |
| 120 | qa/now_ui_check.py:283 | Stale integration status is visibly unknown, not running or complete | P4 | web/e2e/now.spec.ts | planned |
| 121 | qa/now_ui_check.py:287 | Reconnect returns to real available work | P4 | web/e2e/offline.spec.ts | planned |
| 122 | qa/now_ui_check.py:291 | No uncaught UI JavaScript errors | P1 | web/e2e/fixtures.ts › auto fixture `guards` (runs in every spec) | planned |
| 123 | qa/settings_link_check.py:29 | Native settings URL opens actual existing dialog at startup | P4 | web/e2e/settings.spec.ts | planned |
| 124 | qa/settings_link_check.py:31 | Settings link adds no navigation screen | P4 | web/e2e/settings.spec.ts | planned |
| 125 | qa/settings_link_check.py:34 | Linked settings edits actual existing server permission | P4 | web/e2e/settings.spec.ts | planned |
| 126 | qa/settings_link_check.py:44 | Settings link preserves current Capture route and editor text | P4 | web/e2e/settings.spec.ts | planned |
| 127 | qa/settings_link_check.py:46 | Settings navigation never ingests an unsaved draft | P4 | web/e2e/settings.spec.ts | planned |
| 128 | qa/settings_link_check.py:58 | Settings link preserves note-edit route and unsaved editor text | P4 | web/e2e/settings.spec.ts | planned |
| 129 | qa/settings_link_check.py:60 | Opening settings never replaces the saved note original | P4 | web/e2e/settings.spec.ts | planned |
| 130 | qa/settings_link_check.py:62 | No uncaught JavaScript errors | P1 | web/e2e/fixtures.ts › auto fixture `guards` (runs in every spec) | planned |
| 131 | qa/task_capture_check.py:64 | One multiline input; no unsupported voice button or mandatory details | P4 | web/e2e/task-capture.spec.ts | planned |
| 132 | qa/task_capture_check.py:71 | `f'{width}px layout has no horizontal overflow'` | P4 | web/e2e/task-capture.spec.ts | planned |
| 133 | qa/task_capture_check.py:76 | `f'{width}px Details is keyboard reachable'` | P4 | web/e2e/task-capture.spec.ts | planned |
| 134 | qa/task_capture_check.py:81 | Ordinary Enter inserts a newline, never submits | P4 | web/e2e/task-capture.spec.ts | planned |
| 135 | qa/task_capture_check.py:87 | Opening and closing Details preserves input and chosen workflow | P4 | web/e2e/task-capture.spec.ts | planned |
| 136 | qa/task_capture_check.py:92 | Keyboard submit durably creates one task without a model | P4 | web/e2e/task-capture.spec.ts | planned |
| 137 | qa/task_capture_check.py:93 | Compact confirmation includes Edit and does not open full editor | P4 | web/e2e/task-capture.spec.ts | planned |
| 138 | qa/task_capture_check.py:101 | Planned day is separate from deadline/reminder/availability | P4 | web/e2e/task-capture.spec.ts | planned |
| 139 | qa/task_capture_check.py:118 | Existing task Details starts collapsed | P4 | web/e2e/task-capture.spec.ts | planned |
| 140 | qa/task_capture_check.py:124 | Collapsed editor preserves every hidden field, exact timestamps and original | P4 | web/e2e/task-capture.spec.ts | planned |
| 141 | qa/task_capture_check.py:126 | Task save never replaces pinned focus | P4 | web/e2e/task-capture.spec.ts | planned |
| 142 | qa/task_capture_check.py:142 | Accidental dismissal and reload recover task draft and details | P4 | web/e2e/task-capture.spec.ts | planned |
| 143 | qa/task_capture_check.py:151 | Actual browser-profile restart recovers task draft | P4 | web/e2e/task-capture.spec.ts | planned |
| 144 | qa/task_capture_check.py:154 | Ambiguous workflow/date save without interview or fabricated fields | P4 | web/e2e/task-capture.spec.ts | planned |
| 145 | qa/task_capture_check.py:168 | Injected storage failure retains input, blocks dismissal and makes no task | P4 | web/e2e/task-capture.spec.ts | planned |
| 146 | qa/task_capture_check.py:171 | Local storage retry adds exactly once | P4 | web/e2e/task-capture.spec.ts | planned |
| 147 | qa/task_capture_check.py:182 | Server storage failure shows no false success and rolls back task | P4 | web/e2e/task-capture.spec.ts | planned |
| 148 | qa/task_capture_check.py:186 | Server storage retry adds once | P4 | web/e2e/task-capture.spec.ts | planned |
| 149 | qa/task_capture_check.py:197 | Lost acknowledgement is unconfirmed, not a success | P4 | web/e2e/task-capture.spec.ts | planned |
| 150 | qa/task_capture_check.py:199 | Retry after actual commit returns same task, never duplicates | P4 | web/e2e/task-capture.spec.ts | planned |
| 151 | qa/task_capture_check.py:208 | Injected generic HTTP 200 cannot falsely acknowledge a task | P4 | web/e2e/task-capture.spec.ts | planned |
| 152 | qa/task_capture_check.py:221 | Confirmation Edit opens the saved task even when post-save snapshot failed | P4 | web/e2e/task-capture.spec.ts | planned |
| 153 | qa/task_capture_check.py:231 | Disconnected task saving retains draft, no task/outbox success | P4 | web/e2e/task-capture.spec.ts | planned |
| 154 | qa/task_capture_check.py:238 | Disconnected draft retry after reload uses durable capture identity | P4 | web/e2e/task-capture.spec.ts | planned |
| 155 | qa/task_capture_check.py:250 | Ordinary learning-note capture creates no task | P4 | web/e2e/capture.spec.ts | planned |
| 156 | qa/task_link_check.py:33 | Startup task link opens existing dialog over Plan | P4 | web/e2e/plan.spec.ts | planned |
| 157 | qa/task_link_check.py:34 | Task link adds no main navigation/layout | P4 | web/e2e/plan.spec.ts | planned |
| 158 | qa/task_link_check.py:43 | Task link preserves unsaved Capture and route | P4 | web/e2e/plan.spec.ts | planned |
| 159 | qa/task_link_check.py:44 | Opening task never ingests a learning-note draft | P4 | web/e2e/plan.spec.ts | planned |
| 160 | qa/task_link_check.py:54 | Task link preserves note-edit text and route | P4 | web/e2e/plan.spec.ts | planned |
| 161 | qa/task_link_check.py:55 | Saved note original is unchanged | P4 | web/e2e/plan.spec.ts | planned |
| 162 | qa/task_link_check.py:58 | Task-link navigation never changes pin or manual priority | P4 | web/e2e/plan.spec.ts | planned |
| 163 | qa/task_link_check.py:62 | Missing task has truthful error, no fake action | P4 | web/e2e/plan.spec.ts | planned |
| 164 | qa/task_link_check.py:63 | No uncaught JavaScript errors | P1 | web/e2e/fixtures.ts › auto fixture `guards` (runs in every spec) | planned |
| 165 | qa/webview_check.py:143 | `'Actual virtual open-idle process sample and native shell SIGTERM lease cleanup' if stage == 'idle' else 'Actual native shell SIGKILL closes lease and stops owned service'` | P6 | electron/e2e/managed.spec.ts | planned |
| 166 | qa/webview_check.py:161 | Actual second desktop launch refused by persistent-profile lock | P6 | electron/e2e/single-instance.spec.ts | planned |
| 167 | qa/webview_check.py:170 | `f'{stage}: actual owned backend stopped after checkpoint-approved close'` | P6 | electron/e2e/managed.spec.ts | planned |
| 168 | qa/webview_check.py:175 | `f'Independent backend read confirms {expected_notes} explicitly saved note(s), pinned focus and manual low priority'` | P6 | electron/e2e/scenario.spec.ts | planned |
| 169 | tests/now_state.test.cjs:12 | empty connected workspace is new, not complete | P2 | web/src/domain/nowState.test.ts | planned |
| 170 | tests/now_state.test.cjs:13 | notes without tasks are not a new workspace or implicit work | P2 | web/src/domain/nowState.test.ts | planned |
| 171 | tests/now_state.test.cjs:14 | one available suggestion keeps server ranking and hidden alternatives | P2 | web/src/domain/nowState.test.ts | planned |
| 172 | tests/now_state.test.cjs:18 | questions and results outrank ordinary available work | P2 | web/src/domain/nowState.test.ts | planned |
| 173 | tests/now_state.test.cjs:22 | unresolved dependencies are waiting, not completed | P2 | web/src/domain/nowState.test.ts | planned |
| 174 | tests/now_state.test.cjs:25 | a reported agent run is waiting, not a human recommendation | P2 | web/src/domain/nowState.test.ts | planned |
| 175 | tests/now_state.test.cjs:29 | all tasks explicitly done means complete | P2 | web/src/domain/nowState.test.ts | planned |
| 176 | tests/now_state.test.cjs:30 | parked work is not complete | P2 | web/src/domain/nowState.test.ts | planned |
| 177 | tests/now_state.test.cjs:31 | future-start work is not complete or actionable focus | P2 | web/src/domain/nowState.test.ts | planned |
| 178 | tests/now_state.test.cjs:35 | zero running does not mean no integration; needs-input stays reported | P2 | web/src/domain/nowState.test.ts | planned |
| 179 | tests/now_state.test.cjs:39 | stale reports do not masquerade as running | P2 | web/src/domain/nowState.test.ts | planned |
| 180 | tests/now_state.test.cjs:43 | disconnected cached complete/new snapshots cannot assert current state | P2 | web/src/domain/nowState.test.ts | planned |
| 181 | tests/now_state.test.cjs:46 | disconnected cached tasks cannot be called currently actionable alternatives | P2 | web/src/domain/nowState.test.ts | planned |
| 182 | tests/now_state.test.cjs:49 | manual, inferred and pinned focus have different labels | P2 | web/src/domain/nowState.test.ts | planned |
| 183 | tests/now_state.test.cjs:54 | deriving suggestions never changes a pinned focus | P2 | web/src/domain/nowState.test.ts | planned |
| 184 | tests/now_state.test.cjs:58 | a focused task with a stale agent cannot be recommended | P2 | web/src/domain/nowState.test.ts | planned |
| 185 | tests/now_state.test.cjs:61 | time filter never supplies an estimate for a focused task | P2 | web/src/domain/nowState.test.ts | planned |
| 186 | tests/now_state.test.cjs:64 | observation enabled without fresh metadata is not active capture | P2 | web/src/domain/nowState.test.ts | planned |
| 187 | tests/now_state.test.cjs:70 | actionable pin is continued when no competing available item exists | P2 | web/src/domain/nowState.test.ts | planned |
| 188 | tests/now_state.test.cjs:74 | another available recommendation does not replace an actionable pin | P2 | web/src/domain/nowState.test.ts | planned |
| 189 | tests/now_state.test.cjs:79 | dependency or agent waiting pin stays pinned while other work is recommended | P2 | web/src/domain/nowState.test.ts | planned |
| 190 | tests/now_state.test.cjs:86 | attention on another task outranks a pin without changing it; no focus stays unset | P2 | web/src/domain/nowState.test.ts | planned |
| 191 | tests/test_managed_service.py:104 | test_cold_reopen_browser_and_retry_preserve_state | P6 | electron/test/lifecycle.test.ts | planned |
| 192 | tests/test_managed_service.py:135 | test_wrong_endpoint_is_not_contacted_or_killed | P6 | electron/test/lifecycle.test.ts | planned |
| 193 | tests/test_managed_service.py:149 | test_startup_errors_are_bounded | P6 | electron/test/lifecycle.test.ts | planned |
| 194 | tests/test_managed_service.py:165 | test_timeout_cancel_cleanup_owned_descendant | P6 | electron/test/lifecycle.test.ts | planned |
| 195 | tests/test_managed_service.py:183 | test_backend_crash_requires_explicit_retry | P6 | electron/test/lifecycle.test.ts | planned |
| 196 | tests/test_managed_service.py:195 | test_unexpected_owner_death_closes_lease | P6 | electron/test/lifecycle.test.ts | planned |
| 197 | tests/test_managed_service.py:206 | test_external_backend_not_owned | P6 | electron/test/lifecycle.test.ts | planned |
| 198 | tests/test_managed_service.py:230 | test_public_handshake_does_not_authorize_api | P6 | tests/test_managed_service.py | planned |
| 199 | tests/test_managed_service.py:244 | test_separately_wrapped_agent_survives_owned_quit | P6 | electron/test/lifecycle.test.ts | planned |
| 200 | tests/test_managed_service.py:281 | test_invalid_identity_never_loads_workspace | P6 | electron/test/lifecycle.test.ts | planned |
| 201 | tests/test_managed_service.py:292 | test_managed_disables_inherited_optional_features | P6 | electron/test/lifecycle.test.ts | planned |
| 202 | tests/test_managed_service.py:307 | test_owner_death_before_python_lease_watcher | P6 | electron/test/lifecycle.test.ts | planned |

## B. public/app.js strings

| # | app.js line | String (verbatim) | Lives in | Asserted by |
|---|---|---|---|---|
| 1 | 27 | Open session | P4 `web/src/dialogs/TaskDetail.tsx` | web/e2e/plan.spec.ts |
| 2 | 40 | Close other Noema tabs and retry the local save. | `S.closeOtherTabs` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 3 | 56 | Local save failed | P2 `web/src/local/db.ts` (`LocalStoreError` aborted message) | web/src/local/drafts.test.ts |
| 4 | 66 | Draft on this device · not uploaded | `S.draftSaved` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 5 | 66 | Local save failed · keep this page open | `S.draftError` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 6 | 66 | Saving draft on this device… | `S.draftPending` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 7 | 66 | Draft in this tab · not uploaded | `S.draftMemory` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 8 | 73 | Local save failed. Keep this page open and retry; this draft has not been uploaded. | `S.localSaveFailedToast` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 9 | 80 | Server unreachable. Your saved captures remain queued on this device. | `S.networkError` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 10 | 83 | Request failed ( | P2 `web/src/api/client.ts` (`normaliseError`) | web/src/api/client.test.ts |
| 11 | 98 | Noema reminder | `S.notificationTitle` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 12 | 98 | A task needs your attention. | `S.notificationFallback` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 13 | 105 | Server connected | `S.connected` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 14 | 105 | Offline · local drafts | `S.offline` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 15 | 107 | Status unavailable | `S.statusSummary` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 16 | 107 | Nothing tracked yet | `S.statusSummary` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 17 | 113 | Companion controls · browser preview · | removed: browser companion preview (spec §5 "Removed") | — |
| 18 | 128 | Saved to | `S.savedTo` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 19 | 128 | Processing queued. | `S.savedTo` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 20 | 128 | Original preserved. | `S.savedTo` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 21 | 135 | Cannot read the local capture queue. Keep this page open and retry the local save. | `S.queueReadFailed` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 22 | 142 | Server disconnected. | `S.offlineBanner` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 23 | 142 | Showing the last server snapshot; agent status may be outdated. | `S.offlineBanner` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 24 | 142 | Current work and integration status are unavailable. | `S.offlineBanner` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 25 | 142 | Local save failed; keep unsaved work open. | `S.offlineBanner` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 26 | 142 | Capture can save on this device when local storage is available. | `S.offlineBanner` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 27 | 150 | Pinned by you | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 28 | 150 | Inferred from window metadata | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 29 | 150 | Selected by you | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 30 | 153 | Observation paused | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 31 | 154 | Recent window metadata report | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 32 | 154 | Allowed · no recent observer report | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 33 | 164 | Integration status unavailable · server disconnected | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 34 | 164 | Agent status unknown · | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 35 | 164 | Integration connection status unknown · no active runs reported | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 36 | 171 | Nothing actionable right now | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 37 | 171 | Some tracked work is scheduled, parked or not available yet. Plan keeps those items visible. | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 38 | 172 | Current status unavailable | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 39 | 172 | The server is disconnected. Cached work and integration reports may be out of date. You can still capture locally. | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 40 | 173 | No tasks tracked yet | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 41 | 173 | Nothing tracked yet | `S.statusSummary` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 42 | 173 | Your learning notes stay separate from tasks. Add a task only when you intend to do something. | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 43 | 173 | Capture something you are learning, or add a task you intend to do. Notes do not become to-dos automatically. | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 44 | 174 | Agent status needs checking | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 45 | 174 | Your attention is needed | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 46 | 175 | All tracked work is complete | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 47 | 175 | Every tracked task is marked done. Your learning notes remain available; there is no need to add more work. | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 48 | 176 | Available work | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 49 | 176 | Continue your selected focus. | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 50 | 177 | Agent status needs checking | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 51 | 177 | A previous run has stopped reporting. No current activity or completion can be confirmed. | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 52 | 178 | Work is waiting | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 53 | 178 | Tracked work is waiting on an agent, unresolved dependencies or an explicit waiting state. | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 54 | 179 | No work matches this time filter | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 55 | 179 | Only saved estimates are used. Tasks without an estimate are excluded; no duration is invented. | P2 `web/src/domain/nowState.ts` | web/src/domain/nowState.test.ts |
| 56 | 188 | What can I do now? | replaced by `COPY` headings (owner decision 18B, `web/src/copy.ts`) | web/src/copy.test.ts |
| 57 | 188 | Your work, without keeping it all in your head. | replaced by `COPY` headings (owner decision 18B, `web/src/copy.ts`) | web/src/copy.test.ts |
| 58 | 189 | CURRENT FOCUS | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 59 | 189 | Last known · | `S.lastKnown` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 60 | 189 | Unpin & clear | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 61 | 190 | Status unknown | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 62 | 190 | Needs you · | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 63 | 190 | Available now | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 64 | 191 | Any duration | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 65 | 194 | Continue your selected focus. | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 66 | 195 | Check agent status | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 67 | 195 | Open for review | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 68 | 195 | Continue current focus | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 69 | 195 | View next action | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 70 | 195 | Make current focus | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 71 | 198 | Capture a thought | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 72 | 198 | Add a task | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 73 | 198 | Retry connection | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 74 | 201 | Waiting work | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 75 | 203 | Waiting on: | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 76 | 203 | Agent status unknown | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 77 | 203 | Agent is awaiting your input | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 78 | 203 | Waiting on an agent report | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 79 | 206 | Agent reports | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 80 | 206 | Status unknown | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 81 | 206 | Needs your input | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 82 | 206 | Reported running | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 83 | 206 | Set up agent reporting | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 84 | 206 | Task-scoped tokens and the command wrapper; no automatic agent launch. | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 85 | 211 | Record a thought | P4 `web/src/screens/Capture.tsx` | web/e2e/capture.spec.ts |
| 86 | 211 | Audio stays local until you save. | P4 `web/src/screens/Capture.tsx` | web/e2e/capture.spec.ts |
| 87 | 213 | Visuals & recordings | P4 `web/src/screens/Capture.tsx` | web/e2e/capture.spec.ts |
| 88 | 213 | Paste or drop an image. Diagrams and audio stay with this note. | P4 `web/src/screens/Capture.tsx` | web/e2e/capture.spec.ts |
| 89 | 213 | Link to a task | P4 `web/src/screens/Capture.tsx` | web/e2e/capture.spec.ts |
| 90 | 213 | None — just a learning note | P4 `web/src/screens/Capture.tsx` | web/e2e/capture.spec.ts |
| 91 | 216 | Save note ↗ | P4 `web/src/screens/Capture.tsx` | web/e2e/capture.spec.ts |
| 92 | 216 | Latest local save failed. Keep this page open. | `S.localSaveErrorNotice` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 93 | 216 | Retry local save | `S.retryLocalSave` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 94 | 211 | A place to think. | replaced by `COPY` headings (owner decision 18B, `web/src/copy.ts`) | web/src/copy.test.ts |
| 95 | 211 | Fragments, questions, things you figured out. | replaced by `COPY` headings (owner decision 18B, `web/src/copy.ts`) | web/src/copy.test.ts |
| 96 | 219 | Local AI cleanup runs after save. The original is preserved. | P4 `web/src/screens/Capture.tsx` | web/e2e/capture.spec.ts |
| 97 | 219 | Basic folder filing is on. AI rewriting is off until you connect a local model. | P4 `web/src/screens/Capture.tsx` | web/e2e/capture.spec.ts |
| 98 | 231 | All notes | P4 `web/src/screens/Notes.tsx`, `NoteView.tsx` | web/e2e/notes.spec.ts |
| 99 | 231 | What you learned, kept in one place. | replaced by `COPY` headings (owner decision 18B, `web/src/copy.ts`) | web/src/copy.test.ts |
| 100 | 231 | No notes here yet. | P4 `web/src/screens/Notes.tsx`, `NoteView.tsx` | web/e2e/notes.spec.ts |
| 101 | 231 | Save a brain dump. Folder filing happens after capture, not before it. | P4 `web/src/screens/Notes.tsx`, `NoteView.tsx` | web/e2e/notes.spec.ts |
| 102 | 255 | Organize with local AI | P4 `web/src/screens/Notes.tsx`, `NoteView.tsx` | web/e2e/notes.spec.ts |
| 103 | 256 | Export Markdown | P4 `web/src/screens/Notes.tsx`, `NoteView.tsx` | web/e2e/notes.spec.ts |
| 104 | 250 | Original wording · basic folder filing | P4 `web/src/screens/Notes.tsx`, `NoteView.tsx` | web/e2e/notes.spec.ts |
| 105 | 251 | Linked task ↗ | P4 `web/src/screens/Notes.tsx`, `NoteView.tsx` | web/e2e/notes.spec.ts |
| 106 | 253 | Save changes | P4 `web/src/screens/Notes.tsx`, `NoteView.tsx` | web/e2e/notes.spec.ts |
| 107 | 253 | VOICE TRANSCRIPT | P4 `web/src/screens/Notes.tsx`, `NoteView.tsx` | web/e2e/notes.spec.ts |
| 108 | 253 | Your visual or recording is saved below. | P4 `web/src/screens/Notes.tsx`, `NoteView.tsx` | web/e2e/notes.spec.ts |
| 109 | 254 | An AI suggestion arrived after your edit. Nothing was overwritten. | P4 `web/src/screens/Notes.tsx`, `NoteView.tsx` | web/e2e/notes.spec.ts |
| 110 | 254 | Use this version | P4 `web/src/screens/Notes.tsx`, `NoteView.tsx` | web/e2e/notes.spec.ts |
| 111 | 256 | Transcribe recording | P4 `web/src/screens/Notes.tsx`, `NoteView.tsx` | web/e2e/notes.spec.ts |
| 112 | 259 | A little further ahead. | replaced by `COPY` headings (owner decision 18B, `web/src/copy.ts`) | web/src/copy.test.ts |
| 113 | 259 | Priorities are suggested. Your changes stay yours. | replaced by `COPY` headings (owner decision 18B, `web/src/copy.ts`) | web/src/copy.test.ts |
| 114 | 259 | No tasks in this view. | P4 `web/src/screens/Plan.tsx` | web/e2e/plan.spec.ts |
| 115 | 259 | Add something for later | P4 `web/src/screens/Plan.tsx` | web/e2e/plan.spec.ts |
| 116 | 269 | Stop recording before leaving Capture. | `S.stopRecordingBeforeLeaving` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 117 | 273 | Tasks & reminders | P3 `web/src/routes/router.tsx` | web/e2e/shell.spec.ts |
| 118 | 273 | Your workspace | P3 `web/src/routes/router.tsx` | web/e2e/shell.spec.ts |
| 119 | 279 | Note unavailable | P3 `web/src/routes/router.tsx` | web/e2e/shell.spec.ts |
| 120 | 289 | Task unavailable. | `S.taskUnavailable` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 121 | 299 | Draft not stored. Keep this dialog open and retry; the task is not added. | `S.draftNotStored` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 122 | 302 | Unlock Noema | `S.unlockTitle` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 123 | 302 | This server needs your access token. On the host machine, it is in the selected data directory’s admin.token file or your NOEMA_ACCESS_TOKEN setting. | `S.unlockHelp` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 124 | 302 | Access token | `S.accessToken` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 125 | 303 | No dependency | P4 `web/src/dialogs/TaskDetail.tsx` | web/e2e/plan.spec.ts |
| 126 | 304 | Workflow · optional | P4 `web/src/dialogs/TaskDetail.tsx` | web/e2e/plan.spec.ts |
| 127 | 304 | Continue here | P4 `web/src/dialogs/TaskDetail.tsx` | web/e2e/plan.spec.ts |
| 128 | 304 | Estimated minutes · optional | P4 `web/src/dialogs/TaskDetail.tsx` | web/e2e/plan.spec.ts |
| 129 | 304 | Planned day · optional | P4 `web/src/dialogs/TaskDetail.tsx` | web/e2e/plan.spec.ts |
| 130 | 304 | Deadline · optional | P4 `web/src/dialogs/TaskDetail.tsx` | web/e2e/plan.spec.ts |
| 131 | 304 | Available after · optional | P4 `web/src/dialogs/TaskDetail.tsx` | web/e2e/plan.spec.ts |
| 132 | 304 | Select zero or more. Use Ctrl / Cmd for multiple. | P4 `web/src/dialogs/TaskDetail.tsx` | web/e2e/plan.spec.ts |
| 133 | 304 | Session or document link · optional | P4 `web/src/dialogs/TaskDetail.tsx` | web/e2e/plan.spec.ts |
| 134 | 306 | Save unconfirmed · retry the same attempt | `S.taskDraftUnconfirmed` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 135 | 306 | Draft on this device · not added | `S.taskDraftSaved` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 136 | 306 | Local draft save failed · keep this dialog open | `S.taskDraftError` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 137 | 306 | Saving draft on this device… | `S.draftPending` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 138 | 306 | Draft in this tab · not added | `S.taskDraftMemory` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 139 | 323 | Edit task | P4 `web/src/dialogs/TaskCapture.tsx` | web/e2e/task-capture.spec.ts |
| 140 | 323 | Add task | `S.addTask` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 141 | 323 | What do you need to do? | P4 `web/src/dialogs/TaskCapture.tsx` | web/e2e/task-capture.spec.ts |
| 142 | 323 | Title override · optional | P4 `web/src/dialogs/TaskCapture.tsx` | web/e2e/task-capture.spec.ts |
| 143 | 323 | Ctrl / ⌘ + Enter to add. Enter starts a new line. | P4 `web/src/dialogs/TaskCapture.tsx` | web/e2e/task-capture.spec.ts |
| 144 | 323 | Save task | P4 `web/src/dialogs/TaskCapture.tsx` | web/e2e/task-capture.spec.ts |
| 145 | 323 | Retry add task | `S.retryAddTask` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 146 | 327 | Previous save is unconfirmed. Retry the same attempt; this draft is not an offline task queue. | `S.previousUnconfirmed` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 147 | 351 | Draft storage failed. Task not added; keep this dialog open and retry. | `S.draftStorageFailed` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 148 | 355 | Task acknowledgement could not be verified; retry the same attempt. | `S.ackUnverified` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 149 | 362 | Task saved. | `S.taskSaved` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 150 | 362 | Scheduling wording | P4 `web/src/dialogs/TaskCapture.tsx` | web/e2e/task-capture.spec.ts |
| 151 | 362 | Task added. Date wording kept; correct it in Edit if needed. | `S.taskAddedDateKept` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 152 | 362 | Task added. | `S.taskAdded` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 153 | 365 | Not confirmed added. Your input is preserved. | `S.notConfirmed` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 154 | 365 | Check the service or local storage, then retry the same attempt. | `S.checkServiceRetry` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 155 | 366 | Retry add task | `S.retryAddTask` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 156 | 366 | Save unconfirmed · draft preserved. Retry does not create a second task. | `S.unconfirmedPreserved` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 157 | 375 | Focus on this | P4 `web/src/dialogs/TaskDetail.tsx` | web/e2e/plan.spec.ts |
| 158 | 377 | Add reminder | P4 `web/src/dialogs/TaskDetail.tsx` | web/e2e/plan.spec.ts |
| 159 | 377 | Times use this device’s timezone. Server-saved reminders survive closing the app; delivery requires a connected client. | P4 `web/src/dialogs/TaskDetail.tsx` | web/e2e/plan.spec.ts |
| 160 | 377 | Linked learning notes | P4 `web/src/dialogs/TaskDetail.tsx` | web/e2e/plan.spec.ts |
| 161 | 379 | Connect an agent | P4 `web/src/dialogs/TaskDetail.tsx` | web/e2e/plan.spec.ts |
| 162 | 379 | Create a task-scoped token in Settings, then wrap your command. Task ID: | P4 `web/src/dialogs/TaskDetail.tsx` | web/e2e/plan.spec.ts |
| 163 | 373 | Continue here | P4 `web/src/dialogs/TaskDetail.tsx` | web/e2e/plan.spec.ts |
| 164 | 373 | Waiting on: | P4 `web/src/dialogs/TaskDetail.tsx` | web/e2e/plan.spec.ts |
| 165 | 374 | Planned day: | P4 `web/src/dialogs/TaskDetail.tsx` | web/e2e/plan.spec.ts |
| 166 | 374 | At capture: | P4 `web/src/dialogs/TaskDetail.tsx` | web/e2e/plan.spec.ts |
| 167 | 374 | Original task input | P4 `web/src/dialogs/TaskDetail.tsx` | web/e2e/plan.spec.ts |
| 168 | 374 | Limited capture rules, not AI interpretation. Your original stays unchanged when you edit. | P4 `web/src/dialogs/TaskDetail.tsx` | web/e2e/plan.spec.ts |
| 169 | 376 | Agent runs | P4 `web/src/dialogs/TaskDetail.tsx` | web/e2e/plan.spec.ts |
| 170 | 376 | End tracking | P4 `web/src/dialogs/TaskDetail.tsx` | web/e2e/plan.spec.ts |
| 171 | 379 | No notes linked yet. | P4 `web/src/dialogs/TaskDetail.tsx` | web/e2e/plan.spec.ts |
| 172 | 380 | Reminder saved. | P4 `web/src/dialogs/TaskDetail.tsx` | web/e2e/plan.spec.ts |
| 173 | 383 | Your choice stays in effect until you select Automatic again. | P4 `web/src/components/PriorityControl.tsx` | web/e2e/plan.spec.ts |
| 174 | 384 | Revision saved. The original is unchanged. | P4 `web/src/screens/NoteView.tsx`, `dialogs/NoteHistory.tsx` | web/e2e/notes.spec.ts |
| 175 | 385 | Note history | P4 `web/src/screens/NoteView.tsx`, `dialogs/NoteHistory.tsx` | web/e2e/notes.spec.ts |
| 176 | 385 | Restore as a new revision | P4 `web/src/screens/NoteView.tsx`, `dialogs/NoteHistory.tsx` | web/e2e/notes.spec.ts |
| 177 | 398 | Keep each capture to 12 attachments. | `S.tooManyFiles` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 178 | 398 | Use an image or audio recording. | replaced by `S.unsupportedType` (contract §5, server allowlist) | web/src/strings.test.ts |
| 179 | 401 | Stop recording before saving. | `S.stopRecordingBeforeSaving` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 180 | 402 | Write something or add a recording or visual. | `S.writeSomething` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 181 | 414 | Could not save the capture: | `S.couldNotSave` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 182 | 417 | Capture saved on this device. Sending to your server… | `S.captureSavedSending` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 183 | 417 | Capture saved on this device. It will upload when connected. | `S.captureSavedOffline` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 184 | 422 | Recording requires a supported browser on localhost or HTTPS. You can still attach an audio file. | P4 `web/src/capture/` | web/e2e/capture.spec.ts |
| 185 | 428 | Recording stopped near the 32 MB limit. Save this part before continuing. | P4 `web/src/capture/` | web/e2e/capture.spec.ts |
| 186 | 435 | Record another thought | P4 `web/src/capture/` | web/e2e/capture.spec.ts |
| 187 | 435 | Recording added. Save when ready. | P4 `web/src/capture/` | web/e2e/capture.spec.ts |
| 188 | 437 | Recording failed. Stop and check your microphone. | P4 `web/src/capture/` | web/e2e/capture.spec.ts |
| 189 | 438 | Stop recording | P4 `web/src/capture/` | web/e2e/capture.spec.ts |
| 190 | 440 | Microphone unavailable: | P4 `web/src/capture/` | web/e2e/capture.spec.ts |
| 191 | 444 | A quick sketch | P4 `web/src/capture/` | web/e2e/capture.spec.ts |
| 192 | 444 | Draw while you talk. Your recording continues. | P4 `web/src/capture/` | web/e2e/capture.spec.ts |
| 193 | 444 | Add to capture | P4 `web/src/capture/` | web/e2e/capture.spec.ts |
| 194 | 452 | Draw something first. | P4 `web/src/capture/` | web/e2e/capture.spec.ts |
| 195 | 457 | Your workspace | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 196 | 457 | Screen context | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 197 | 457 | Off by default. The Sway helper reports window metadata only. | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 198 | 457 | No screenshot analysis is implemented in this build. | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 199 | 457 | Slow background motion | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 200 | 457 | Pauses when hidden. Static by default. | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 201 | 458 | The native helper is separate from this browser preview. | removed: browser companion preview (spec §5 "Removed") | — |
| 202 | 459 | Companion size | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 203 | 459 | Logical pixels; native helper reads this setting. | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 204 | 460 | Reminder notifications | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 205 | 460 | Opt-in browser notifications while a client is open. | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 206 | 460 | No push service or always-on delivery yet. | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 207 | 461 | Local processing | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 208 | 461 | Note cleanup: | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 209 | 462 | No models download or load automatically. Enable them using the README’s optional setup. | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 210 | 462 | Window-to-task rules | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 211 | 462 | A known application or title maps to a task. Unmatched windows do not become made-up focus claims. Pinned focus wins. | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 212 | 463 | App ID | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 213 | 463 | Title contains | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 214 | 464 | Add rule | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 215 | 464 | Agent & observer tokens | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 216 | 464 | An agent token can report runs and read only the tasks you choose. Observer tokens may report window context and read the small companion summary. Never paste tokens into notes. | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 217 | 464 | Task-scoped agent | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 218 | 464 | Window observer | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 219 | 464 | Allowed tasks · agent tokens | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 220 | 465 | Create token | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 221 | 465 | Use the generated task-scoped token with tools/agent.py. The wrapper tracks only the command you explicitly start; it does not attach to arbitrary browser sessions. See the README for the exact command and token environment setup. | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 222 | 465 | Keep your data | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 223 | 465 | One SQLite database and an attachments directory on the server. This build does not automatically deploy or synchronize independent servers. | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 224 | 465 | Export notes & tasks | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 225 | 465 | Local capture queue | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 226 | 465 | Version 0.1.0 · local-first development build | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 227 | 463 | Any app | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 228 | 463 | Any title | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 229 | 470 | Copy this token now. It will not be displayed again. | P4 `web/src/dialogs/Settings.tsx` | web/e2e/settings.spec.ts |
| 230 | 476 | Small browser preview · not a native desktop overlay. | removed: browser companion preview (spec §5 "Removed") | — |
| 231 | 476 | The app preview stays at most 40 px (28 px on phones). The separately launched native helper reads this setting. | removed: browser companion preview (spec §5 "Removed") | — |
| 232 | 476 | Allow window metadata | removed: browser companion preview (spec §5 "Removed") | — |
| 233 | 476 | This does not start the Sway helper or prove it is reporting. Pinned focus stays yours. | removed: browser companion preview (spec §5 "Removed") | — |
| 234 | 476 | Open browser preview | removed: browser companion preview (spec §5 "Removed") | — |
| 235 | 476 | All settings | removed: browser companion preview (spec §5 "Removed") | — |
| 236 | 482 | Captures on this device | `S.outboxTitle` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 237 | 482 | Saved explicitly, but not yet acknowledged by the server. Attachments are kept with each capture. Keep this browser’s site storage until they upload. | `S.outboxHelp` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 238 | 482 | Open a copy in Capture | `S.openCopy` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 239 | 482 | Visual or voice capture | `S.outboxFallbackText` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 240 | 482 | All saved captures have reached the server. | `S.outboxEmpty` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 241 | 485 | Leave without saving this note edit? The last saved revision remains safe. | `S.leaveNoteEdit` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 242 | 496 | Priority updated. | `S.priorityUpdated` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 243 | 499 | Task reopened. | `S.taskReopened` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 244 | 499 | Task completed. | `S.taskCompleted` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 245 | 501 | Replace your pinned focus with this task? | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 246 | 502 | Unpin and clear your current focus? | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 247 | 511 | Restored as a new revision. | P4 `web/src/screens/NoteView.tsx` | web/e2e/notes.spec.ts |
| 248 | 513 | Queued for local processing. | P4 `web/src/screens/NoteView.tsx` | web/e2e/notes.spec.ts |
| 249 | 516 | Reminder moved forward by 20 minutes. | P4 `web/src/dialogs/TaskDetail.tsx` | web/e2e/plan.spec.ts |
| 250 | 519 | End tracking this run? This does not stop or kill the external agent process. | P4 `web/src/screens/Now.tsx` | web/e2e/now.spec.ts |
| 251 | 535 | This browser does not expose notifications here. Reminders still appear in Needs you. | `S.notificationsUnsupported` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 252 | 541 | Replace the current unsaved Capture draft? The queued capture remains safe. | `S.confirmReplaceDraft` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 253 | 542 | Opened a copy. The queued original still exists. | `S.openedCopy` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 254 | 544 | Permanently discard this unsent capture and its local attachments? | `S.confirmDiscard` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 255 | 554 | Task unavailable. | `S.taskUnavailable` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 256 | 555 | Leave without saving this note edit? | P3 `web/src/routes/guards.ts` | web/e2e/capture.spec.ts |
| 257 | 555 | Finishing the local save. | `S.finishingLocalSave` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 258 | 555 | Stop recording before leaving Capture. | `S.stopRecordingBeforeLeaving` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 259 | 555 | Your edit is still open. | `S.editStillOpen` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 260 | 603 | A capture save is still finishing. Try closing again shortly. | `S.closeSaveInFlight` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 261 | 604 | Close Noema? An unfinished recording or unsaved note edit may be lost. Cancel to stop/save or copy it first. | `S.closeConfirm` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 262 | 608 | Local draft saving failed. Close anyway and risk losing this draft? Cancel to keep it open and retry. | `S.closeDraftFailed` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 263 | 612 | Could not checkpoint your draft. Keep Noema open and retry the local save. | `S.closeCheckpointFailed` (`web/src/strings.ts`) | web/src/strings.test.ts |
| 264 | 616 | Could not open the workspace. Check the server and reload. | P3 `web/src/main.tsx` | web/e2e/boot.spec.ts |
