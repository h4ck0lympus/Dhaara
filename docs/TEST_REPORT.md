# Verification report · Dhara 0.1.0 + React/Electron cutover

The final cutover gate below ran on source revision `cfbfed53d548f039915436975bb2317ae0917d0a` (`git rev-parse HEAD` at the final run; the commit that adds this report comes after it, so it is not that revision). Every other section is an inherited report: the terrain measurements ran on `b13fd4d` and the §21 memory measurement on `54ffe98`, and the sections from "Frictionless task capture" down are earlier milestones' reports, kept unchanged.

## React + Electron cutover · 2026-10-12

Executed on branch `feat/react-electron` before the cutover merge, terrain on source revision `b13fd4d97b2274011708f159936ebc0a72bea484` and §21 memory on `54ffe98218e87873ebffe69252b4fdc55f08811b` (see each section). The terrain budget (spec §7) and the handbook §21 memory check were measured with throwaway harnesses (decision 13B, not committed) under a private headless Sway; see the subsection below and the "Terrain budget" section. Per-process PSS could not be read under the setuid Chromium sandbox, so both use cgroup accounting.

### Final gate run

Gate, run from the repository root with Node 22.22.0 (`node --version` = v22.22.0, outside the packages' `engines` range ^22.22.2, so `npm ci` prints `npm warn EBADENGINE`, which is non-fatal; `.nvmrc` says 22.23.3, which the next phase's gate uses) and Python 3.12.3 (`.venv/bin/python --version`): `npm --prefix web ci && npm --prefix web run build && npm --prefix web test && npm --prefix web run e2e && npm --prefix electron ci && node electron/scripts/link-sandbox.mjs && npm --prefix electron test && .venv/bin/python -m pytest`. Playwright runs with workers=4 and retries=0 (`web/playwright.config.ts`, unchanged). Source revision `cfbfed53d548f039915436975bb2317ae0917d0a` on `feat/react-electron`, 2026-10-12 22:03–23:03 local time. Each segment ran as its own foreground command, and a run counts only when all eight commands pass back to back. Three consecutive clean runs are recorded. Each cell is the tool's own summary line and the command's wall time. The one pytest warning is a third-party `DeprecationWarning` from starlette's test client (`anyio.abc.BlockingPortal` alias), not from Dhara code. No log has a skipped, xfailed, xpassed, flaky or todo count, and `tests/test_cutover.py` guards against focused tests.

| Command | Run 1 | Run 2 | Run 3 | Result |
|---|---|---|---|---|
| `npm --prefix web ci` | added 156 packages · 7 s | added 156 packages · 7 s | added 156 packages · 7 s | PASS |
| `npm --prefix web run build` | built in 2.88s · 13 s | built in 3.44s · 14 s | built in 3.56s · 13 s | PASS |
| `npm --prefix web test` | Tests 506 passed (506) · 19 s | Tests 506 passed (506) · 19 s | Tests 506 passed (506) · 23 s | PASS |
| `npm --prefix web run e2e` | 267 passed (5.9m) · 357 s | 267 passed (5.8m) · 347 s | 267 passed (5.7m) · 343 s | PASS |
| `npm --prefix electron ci` | added 58 packages · 8 s | added 58 packages · 7 s | added 58 packages · 7 s | PASS |
| `node electron/scripts/link-sandbox.mjs` | installed root-owned sandbox helper used · 0 s | same · 0 s | same · 1 s | PASS |
| `npm --prefix electron test` | Tests 210 passed (210); 35 passed (2.2m) · 150 s | Tests 210 passed (210); 35 passed (2.3m) · 151 s | Tests 210 passed (210); 35 passed (2.2m) · 146 s | PASS |
| `.venv/bin/python -m pytest` | 205 passed, 1 warning in 8.47s · 9 s | 205 passed, 1 warning in 12.75s · 13 s | 205 passed, 1 warning in 10.08s · 10 s | PASS |

Run wall time, summed over the eight commands: 563 s, 558 s and 550 s.

#### Runs discarded for an infrastructure reason

Two attempts were discarded and do not count as runs; neither was a test fault. During the gate the host's Wi-Fi interface removed and re-added its secondary IPv4 address (10.0.0.156) about every 3 s (`ip -ts monitor address`). Chromium treats each change as a network change and aborts in-flight requests with `net::ERR_NETWORK_CHANGED`, including requests to the 127.0.0.1 test service. A diagnostic e2e run that logged failed requests recorded this error on page loads, a stylesheet and the app's entry script.

- Between runs 1 and 2: `e2e/layout.spec.ts:70` (contrast) measured a ratio of 1 for `.recommendation p`. That means equal luminance for text and body background, which happens only on an unstyled page. A probe that delayed the stylesheet by 4 s showed the app does not render before its CSS, so the stylesheet request itself failed. The trace was overwritten by the isolated reruns, which passed 3/3. The attempt was repeated from `npm --prefix web ci`.
- Between runs 2 and 3: `e2e/notes.spec.ts:273` timed out waiting for "Server connected". Its trace shows `GET /assets/index-*.js` and `GET /assets/index-*.css` both failed with `net::ERR_NETWORK_CHANGED`, so the app never booted. The attempt was repeated from `npm --prefix web ci`.

#### Flakes found and how each was hardened

- `web/src/dialogs/NoteHistory.test.tsx` (409 restore; red twice in earlier full runs). The test counted note GETs, and a background refetch could make that count 3. Commit `6c48cd4` flips the server version when the 409 POST arrives, so no earlier GET can see it. The test now waits for the state it asserts: both Restore buttons render only once the refetched version 3 is the current version. It passed 10 of 10 repeated runs.
- `web/e2e/fixtures.ts` `gotoApp`: the "Server connected" wait has an explicit 30 s bound for a cold service next to three busy workers (commit `6c48cd4`). The global `expect.timeout` of 15 s from the same commit was reverted in `cfbfed5`, because it was not hardening.
- `web/e2e/capture.spec.ts`, empty Save: the test waits for Save to be enabled before clicking it (commit `6c48cd4`).
- `web/e2e/capture.spec.ts`, fixed waits replaced with waits on state (commit `cfbfed5`):
  - IME Ctrl+Enter: waits for the debounced draft to land (`draftSaved`, raw `かな`), because a save would have cancelled that draft.
  - Quota failure, Save-cancels-debounce and paused recording: Playwright's fake clock fires every timer due in the window (`page.clock.runFor`) instead of sleeping.
- `web/e2e/server.ts` (commit `cfbfed5`): each test service binds port 0 and reports its own port, and its health is trusted only after that report. Before, a probed free port could be bound by a sibling worker's service, and `/api/health` would then answer from the sibling. This race was latent: no failure was traced to it.
- `notes.spec.ts:121` and `:178`, `outbox.spec.ts:149`, and the `plan.spec.ts` 409 test (named by earlier runs). Each step in these tests already waits on the UI or server state it uses. The `:178` race (Original clicked before the save closed the editor) was fixed earlier with the Edit-visible wait. The recorded failures were:
  - "Server unreachable" on a PUT
  - `page.goto` failures
  - an unstyled page
  - an outbox list that never loaded

  These match the aborted-request pattern above. None of these tests failed in the three runs or in 40 repeated isolated runs.

Phase 6 (the Dhara rename): the same six commands ran three consecutive times clean on `da9c9cc`, where `cutover-gate` now points. Environment: Node v22.23.3, Python 3.12.3. Flake instances: none from the code; in run 2 one web e2e attempt failed two tests (checkpoint.spec.ts:28, terrain.spec.ts:148) with `net::ERR_NETWORK_CHANGED` (wifi address churn, infrastructure), and the segment was rerun clean without counting that attempt.

Fix-wave run (after the final review): one run of the same six segments on `b7ea6fe`, where `cutover-gate` now points (it moved from `da9c9cc`), 2026-10-13. Environment: Node v22.23.3, Python 3.12.3; workers=4, retries=0. Results: web ci + build: added 156 packages, built in 3.51s · 21 s; web test: Tests 514 passed (514) · 22 s; web e2e: 269 passed (5.7m) · 344 s; electron ci + link-sandbox: added 58 packages, installed root-owned sandbox helper used · 7 s; electron test: Tests 217 passed (217); 35 passed (2.1m) · 138 s; pytest: 242 passed, 1 warning · 10 s. Discarded attempt: the first web e2e attempt (338 s) failed `e2e/now.spec.ts:200` in `page.goto` with `net::ERR_NETWORK_CHANGED` (wifi address churn, infrastructure); 268 passed, and the segment was rerun clean.

Packaging (the AppImage): one run of the same eight commands as separate segments (`npm --prefix electron ci` replaced the Electron dist the package build had installed and `link-sandbox.mjs` restored the root-owned helper) on `5b2c767`, where `packaging-gate` points (the merge moves `cutover-gate` there), 2026-10-13, with `release/out/Dhara-0.1.0-x86_64.AppImage` present, so `electron/e2e/packaged.spec.ts` and the ten `[packaged]` cases of `tests/test_managed_service.py` ran instead of skipping; no log has a skipped count. Environment: Node v22.23.3, Python 3.12.3, Electron 44.7.0, PyInstaller 6.22.3 + hooks-contrib 2026.8, appimagetool 1.9.1, type2-runtime 20251108. Results: web ci + build added 156 packages, built in 2.88 s (5 s + 12 s); web test Tests 514 passed (514), 20 s; web e2e 269 passed (5.6m), 491 s, after two infrastructure attempts that each failed one test on `net::ERR_NETWORK_CHANGED` (the wifi churn recorded above) and were rerun as the segment; electron ci + link-sandbox added 58 packages, installed root-owned sandbox helper used, 7 s; electron test Tests 232 passed (232); 36 passed (2.2m), 149 s; pytest 262 passed, 1 warning, 14 s. Build: `npm --prefix electron run package` in 1m14.8s; frozen service 36M, AppDir 318M, AppImage 127M (132966904 bytes); self-check passed; the corrupted-cache check failed loudly as designed. Sandbox on this host: user namespaces are restricted (`unshare -Ur true` fails), so the launcher used `/opt/google/chrome/chrome-sandbox` through `CHROME_DEVEL_SANDBOX`. Owner run of the §1 success lines: pending (not run by the implementer; it opens windows on port 8765).

Fix-wave run (packaging final review: every `--no-sandbox` spelling refused, the owner uid checked before any helper search or copy, the probe `unshare -Urpn true`, packaged `--help` states the managed default): on `55065e7`, where `packaging-gate` now points, 2026-10-13. `npm --prefix electron run package` rebuilt the artifact in 1m3.3s (frozen service 36M, AppDir 318M, AppImage 127M, 132971000 bytes; self-check passed), then `link-sandbox.mjs`, then `electron/e2e/packaged.spec.ts` alone under the private Sway: 2 passed (4.3s), the new case runs the mounted AppImage with `--help`. Then the six segments, workers 4 and retries 0 unchanged, Node v22.23.3, Python 3.12.3: web ci + build added 156 packages, built in 3.05 s, 19 s; web test Tests 514 passed (514), 20 s; web e2e 269 passed (6.1m), 364 s; electron ci + link-sandbox added 58 packages, installed root-owned sandbox helper used, 17 s; electron test Tests 235 passed (235); 37 passed (2.4m), 162 s; pytest 262 passed, 1 warning, 14 s. No attempt was discarded and no log has a skipped count.

### Handbook §21 main-app memory · measured 2026-10-12

Source revision `54ffe98218e87873ebffe69252b4fdc55f08811b`. Private headless Sway (`WLR_RENDERER=gles2`, 1440×900 at scale 1). Idle app: the built web shell in Electron (`chromiumSandbox: true`, throwaway profile), motion off, observation off, no model configured, so AI is excluded; 20 s warm-up then 60 × 1 s samples. Each tree ran in its own `systemd-run --user --scope -p MemoryAccounting=yes` scope; memory is cgroup accounting (`memory.current`, and non-file = anon + shmem + kernel from `memory.stat`). PSS is unavailable under the setuid sandbox (EACCES on smaps_rollup), so it was not used. Aspiration: < 400 MB, read as 400,000,000 bytes (381.5 MiB). Persisted run: `qa/bench/out-mem/results.json` (summary plus the 60 raw rows; untracked). Harness: throwaway bench.py plus mem.py, not committed (decision 13B).

| Tree | non-file MiB (median / max) | memory.current MiB (median / max) |
|---|---|---|
| Electron shell | 228.6 / 232.4 | 328.3 / 331.2 |
| Companion Python service (run.py) | 36.4 / 36.5 | 36.6 / 36.6 |
| Electron + service | 264.9 / 268.8 | 364.8 / 367.7 |

Worst case (max memory.current of both trees, 367.7 MiB = 385.6 MB) is under 400,000,000 bytes. The worst case is within ≈14 MiB (3.6%) of the budget, and the rise from the earlier run's 232 MiB shell memory.current is file-backed page cache (non-file memory unchanged at ≈229 MiB).

Result: PASS

## Terrain budget · 2026-10-12

Source revision `b13fd4d97b2274011708f159936ebc0a72bea484` (web, electron, the package `noema` and run.py clean in the working tree). Spec §7 method: Electron app process tree only (the run.py service is excluded), launched through Playwright with `chromiumSandbox: true` (never `--no-sandbox`), private headless Sway (gles2, Iris Xe), 1440×900 at scale 1, motion on, reduced motion off, 30 s samples, median of 3 runs; PSS is unavailable under the setuid sandbox (EACCES on smaps_rollup), so memory is cgroup accounting (anon + shmem + kernel) of the Electron scope. Harness: the throwaway bench.py plus terrain.py (decision 13B), not committed.

| State | CPU % of one core (budget) | iGPU busy % (budget) | Electron non-file MiB (cgroup; PSS unavailable under the setuid sandbox, EACCES on smaps_rollup) | Result |
|---|---|---|---|---|
| Animated: focused, Escape key every 5 s | 4.33 (< 3.0) | 1.27 (< 6.0) | 212.3 | FAIL |
| Paused: 65 s without input (idle timeout) | 0.17 (< 1.0) | 0.0 (< 0.5) | 206.7 | PASS |
| Hidden: blurred in the Sway scratchpad (document.hidden stays false on Wayland) | 0.1 (< 1.0) | 0.0 (< 0.05) | 222.7 | PASS |

Screen check: animated frames changed in 3/3 runs (gating: proves motion was really on); paused frames were identical in 3/3 runs (informational: any CSS animation in the app also changes the screen, and a terrain that kept drawing would already fail the Paused CPU row).
Hidden-view visibility flags: [[False], [False], [False]]. Failed or incomplete runs discarded: 0 (`complete=false` in the raw rows refers to the unavailable PSS series, not to the cgroup series used here).
iGPU budgets: paused "~0%" is read as < 0.5%, hidden "0%" as < 0.05% (sampling rounding). The terrain table's memory column is the host-only cgroup series (non-file memory of the Electron scope in that run), while the §21 figure above is the whole Electron scope plus the service, so the two are not comparable.
Animated misses its CPU budget (4.33% vs < 3%); iGPU is within budget. Motion is opt-in (default off), so the default states are Paused and Hidden, which pass. Thresholds, code and terrain were not changed; raised for the owner (spec §1 success criterion).
**Overall: FAIL**


## Frictionless task capture · 2026-10-09

**Implemented independently; physical Sway A remains BLOCKED/PENDING.** Managed
lifecycle remains opt-in development; external default unchanged. Only task
creation/editor progressive disclosure, task-original/planned-day persistence
and task-draft close recovery changed. No framework, kitten, Now ranking,
inference provider, permissions or note-to-task conversion. A-FOCUS-01 stays open.

### Source identity and isolation

Before runtime edits `git status --short -- .` was `?? ./`; `git ls-files -- .`
was empty. All **69 entries** of the previous
`qa/managed-service/screenshots-2026-10-08/source-after.sha256` verified. Parent
HEAD is not a Dhara revision; no stage/commit/push/nested repository. Current
identity is [qa/task-capture/source-after.sha256](../qa/task-capture/source-after.sha256),
covering **73 active files**, all verified after the final handoff edits.
Existing unrelated work and historical/reference evidence are preserved.

Disposable SQLite/attachments/tokens/loopback ports, temporary Chromium/WebKit
profiles and synthetic task/note content only. No real notebook or `.data`
opened/migrated as a fixture. The new schema is exercised on both legacy and
new disposable databases; no live-data migration validation is claimed.
Existing dependencies/SDK reused, nothing installed/downloaded. No recording,
observation or model started. New screenshots are this interaction only:
[four inspected before/after views](../qa/task-capture/README.md), desktop
1200×900 and phone-width 390×844 on identical empty-workspace fixture recipes,
not the user's session or literal same database. Current inventory **39 PNGs**
(previous 35 preserved + four). Two incidental storage-regression screenshots
were moved to `/tmp/noema-task-regression-images-6Rlm2W/` rather than retained as
another UI collection; the recovery suite was rerun without screenshots into
its separate current evidence directory. No earlier image was removed.

### Newly executed results

| Check | Result | What it demonstrates |
|---|---|---|
| Existing Python baseline | **116 passed**, 32.46s | Before application edits, disposable fixtures. |
| Existing Now baseline/final | **22 passed** | Pure state/pin/ranking characterization, not device input. |
| Original core intermediate | **61 passed** | Existing API rules after additive persistence changes. |
| Focused task API intermediate | **21 passed** | Original/rules/concurrent retry/late-stale edit/rollback/migration cases; one compatibility case added afterward. |
| Final full Python | **141 passed**, 31.66s | Original 116 plus **25** task-capture cases; real SQLite/API and preserved real-process lifecycle tests. Existing Starlette/AnyIO warning remains. |
| Task UI | **27 passed** | Real Chrome/HTTP/SQLite/IndexedDB; desktop/phone-width keyboard, Enter, Details, save/recovery, lost-reply retry, rejected generic acknowledgement, Edit after failed refresh, independent note capture. |
| Now browser regression | **58 passed** | Existing states, contrasts, permissions, pin protection; no new screenshots. |
| Note recovery regression | **22 passed** | Existing real browser/blob/offline/restart recovery. Separate current output, no new screenshots retained. |
| Rust policy | **5 passed** | Existing profile/navigation/link/download safety. |
| Managed Rust/WebKit | **68 checks passed** | Existing 49-check workflow plus task capture, actual shell/profile/backend reopen, uncommitted task draft and injected checkpoint failure; owned backend reaped on each normal close. |
| External Rust/WebKit | **44 checks passed** | Existing 28-check workflow plus same task checks; separately running fixture backend remains available. |
| Parse/compile/normal build | Passed | QA build used for native tests; normal non-QA Linux debug executable rebuilt afterward. Not an installer. |
| Approved documentation archive | **45 hashes passed** | Approved bitmap/reference assets and archive untouched. |
| Physical Sway / microphone / full-process performance | **NOT RUN / remains BLOCKED ON DEVICE** | No new device acceptance, app resource sample, battery/model performance or hardware claim. |

Task checks cover one sentence without a model, separate planned days, unclear
project/date preservation, exact originals/export/reopen, eight concurrent same-ID
retries, changed-ID-payload conflicts, old-client compatibility, SQLite trigger
rollback, manual corrections/priorities/pin and version conflict. **No delayed
task AI worker exists**: late-result protection here is current-state replay and
optimistic stale-write rejection, not a mocked claim of model organization.
Deadline/reminder/availability wording outside chosen Details stays original;
general extraction and task voice are unimplemented.

Browser fault paths intentionally replace one IndexedDB method, discard a real
committed response, reject transport, or install a fixture SQLite trigger. Native
failed-checkpoint prompts are intercepted only in the QA build. The other HTTP,
database, storage, process restart, native checkpoint and cleanup operations are
real. These injections do not prove physical disk damage/power-loss recovery.
No synthetic sampler test is counted as app performance. Earlier 80→88 visibility,
88→88 pointer, 99→116 lifecycle and 49/28 WebKit counts below remain historical.

### Exact executed commands

```bash
git status --short -- .
git ls-files -- .
sha256sum -c qa/managed-service/screenshots-2026-10-08/source-after.sha256
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-task-capture-baseline
node --test tests/now_state.test.cjs
CHROMIUM_PATH=/usr/bin/google-chrome .venv/bin/python qa/task_capture_check.py --before --output qa/task-capture
.venv/bin/python -m pytest -q tests/test_core.py -p no:cacheprovider --basetemp=/tmp/noema-task-core-first
.venv/bin/python -m pytest -q tests/test_task_capture.py -p no:cacheprovider --basetemp=/tmp/noema-task-focused
CHROMIUM_PATH=/usr/bin/google-chrome .venv/bin/python qa/task_capture_check.py --output qa/task-capture
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-task-capture-final
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-task-capture-handoff
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-task-capture-final-guard
.venv/bin/python -m pytest -q tests/test_task_capture.py -p no:cacheprovider --basetemp=/tmp/noema-task-capture-final-focused
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-task-capture-complete
CHROMIUM_PATH=/usr/bin/google-chrome .venv/bin/python -c 'from pathlib import Path; from qa import now_ui_check as checks; checks.OUTPUT=Path("qa/task-capture/now-regression"); checks.main(capture_screenshots=False)'
CHROMIUM_PATH=/usr/bin/google-chrome .venv/bin/python qa/native_storage_check.py
DHARA_QA_OUTPUT=qa/task-capture/capture-recovery CHROMIUM_PATH=/usr/bin/google-chrome .venv/bin/python -c 'from qa.native_storage_check import run; run(capture_screenshots=False)'
cargo test --offline --locked --manifest-path desktop/Cargo.toml --no-default-features --lib
PKG_CONFIG_PATH=/tmp/noema-webview-sdk-V3K1nA/root/usr/lib/x86_64-linux-gnu/pkgconfig cargo build --offline --locked --manifest-path desktop/Cargo.toml --features qa -j 2
LD_LIBRARY_PATH=/tmp/noema-webview-sdk-V3K1nA/root/usr/lib/x86_64-linux-gnu .venv/bin/python qa/webview_check.py --managed --task-capture --skip-build --no-screenshots --output qa/task-capture/webkit --xvfb /tmp/noema-webview-sdk-V3K1nA/root/usr/bin/Xvfb
LD_LIBRARY_PATH=/tmp/noema-webview-sdk-V3K1nA/root/usr/lib/x86_64-linux-gnu .venv/bin/python qa/webview_check.py --task-capture --skip-build --no-screenshots --output qa/task-capture/webkit-external --xvfb /tmp/noema-webview-sdk-V3K1nA/root/usr/bin/Xvfb
LD_LIBRARY_PATH=/tmp/noema-webview-sdk-V3K1nA/root/usr/lib/x86_64-linux-gnu .venv/bin/python qa/webview_check.py --managed --task-capture --skip-build --no-screenshots --output qa/task-capture/webkit-final --xvfb /tmp/noema-webview-sdk-V3K1nA/root/usr/bin/Xvfb
LD_LIBRARY_PATH=/tmp/noema-webview-sdk-V3K1nA/root/usr/lib/x86_64-linux-gnu .venv/bin/python qa/webview_check.py --task-capture --skip-build --no-screenshots --output qa/task-capture/webkit-external-final --xvfb /tmp/noema-webview-sdk-V3K1nA/root/usr/bin/Xvfb
PKG_CONFIG_PATH=/tmp/noema-webview-sdk-V3K1nA/root/usr/lib/x86_64-linux-gnu/pkgconfig cargo build --offline --locked --manifest-path desktop/Cargo.toml -j 2
node --check public/app.js
.venv/bin/python -m compileall -q noema qa/task_capture_check.py qa/webview_check.py qa/native_storage_check.py tests/test_task_capture.py
desktop/target/debug/noema-desktop --qa-stage verify
rg --files qa -g '*.png' | wc -l
sha256sum -c qa/task-capture/source-after.sha256
```

The final `--qa-stage verify` invocation rejects the argument with exit **2** as
expected, confirming the normal binary has no QA argument. Archive check
`sha256sum -c SHA256SUMS` ran in `docs/Noema-Documentation` and passed 45 entries.
Parse/compile were rerun successfully from the root after one wrong-directory
invocation during the archive check. Evidence checksums are in
`qa/task-capture/SHA256SUMS` (verify from that directory).

Intermediate full suites passed 137 in 29.40s and 138 in 32.08s. The focused
complete-source rerun passed **25** in 1.89s. Final native evidence is in
`webkit-final` / `webkit-external-final`; earlier runs within this milestone are
preserved separately. Browser: Google Chrome 154.0.8037.92, Python 3.12.3;
native WebKitGTK runtime 2.52.6, private X11 only.

Complete-source full rerun: **141 passed in 31.66s**, same deprecation warning,
no skips. The 35.54s run preceded only the overflow-safe exception widening.
During harness development, the default `/usr/bin/chromium` was absent; using the
documented existing Google Chrome succeeded. Two test-only strict-selector /
function-restoration errors were corrected; the final 27-check run passed.
Browser skill setup found no connected browser, so existing local Chrome QA was
used. No physical session was inferred from that fallback.

### Files and handoff

Runtime: `public/app.js`, `public/styles.css`, `dhara/models.py`, `dhara/store.py`,
`dhara/server.py`, new `dhara/task_capture.py`. Tests/QA: new
`tests/test_task_capture.py`, `qa/task_capture_check.py`, existing
`qa/now_ui_check.py`, `qa/browser_check.py` selectors, `qa/native_storage_check.py`
optional screenshot suppression, `qa/webview_check.py` and
`desktop/qa/scenario.js` optional native task stages. Evidence under
`qa/task-capture/`. Docs: README, PROGRESS, BUILD_STATUS, API, ARCHITECTURE,
SECURITY, DESKTOP, PHYSICAL_SWAY_ACCEPTANCE, this report and new TASK_CAPTURE.

Restart the existing backend or close/reopen managed mode, then reload the client;
do not change real workspace/profile/origin to a fixture. The normal binary is
not QA-enabled. Next is the existing guided physical launch/quit/relaunch with
task-draft recovery; richer task AI, task voice, unfinished audio/long recording,
physical mic acceptance and A-FOCUS-01 are still pending. External service startup
remains the production default.

## Screenshot and progress follow-up 2026-10-08

**Physical A remains BLOCKED/PENDING. Managed B remains implemented as explicit
Linux development opt-in. External production default unchanged.** No acceptance
suite or resource sample was rerun; 116 Python / 5 Rust policy / 22 Now / 49
managed / 28 external checks below remain the prior implementation results.

The first user launch used literal placeholder paths and failed to create its
profile. The corrected `$HOME/.local/share/noema-dev/...` command was aborted
by the user, not a successful launch result. Exact-executable read-only `/proc`
inspection found no Dhara shell running. Sanitized session inventory still
reports live Sway/Wayland; it does not demonstrate input or a native app launch.

On the explicit screenshot request, saved only [two current main-window captures](../qa/managed-service/screenshots-2026-10-08/README.md):
empty Now, then populated Now in the same synthetic workspace. Normal development
binary (QA feature absent), private Xvfb/X11 1280×900 at scale 1, app window
1200×800, software rendering requested. Reused `qa/device_fixture.py` preparation,
note/code/hypothesis and PNG; HTTP creates one saved note/image and two explicit
tasks with a dependency, manual Low and pinned focus. Waited for the normal
15-second refresh; no mocked/injected DOM, timestamps/deadlines/estimates or
automatically inferred tasks. The screenshot shows the in-app browser-preview
kitten; the separate native companion was not launched. Both images were opened
and visually verified after capture. These are not device/performance evidence.

Programmatic `WM_DELETE_WINDOW` was sent only to the private fixture window:
normal shell exit **0**, owned backend PID absent. Unique temporary fixture
data/profile/credentials were removed; the real notebook and development profile
were not opened or modified. Existing 33 QA PNGs/references/evidence preserved;
inventory is now **35 PNGs**. No application runtime/UI code changed; added the
small repeatable `qa/managed_screenshots.py` capture utility and evidence README,
updated progress/report/status/README inventory. A-FOCUS-01 remains unresolved.

All 68 previous source-manifest entries verified before these changes. The
current checkpoint is [source-after.sha256](../qa/managed-service/screenshots-2026-10-08/source-after.sha256);
previous manifests are preserved, not relabeled as current. Dhara is still
untracked; parent HEAD is not its revision. No Git stage/commit/push.

Exact newly executed capture/parsing commands:

```bash
sha256sum -c qa/managed-service/source-after.sha256
LD_LIBRARY_PATH=/tmp/noema-webview-sdk-V3K1nA/root/usr/lib/x86_64-linux-gnu .venv/bin/python qa/managed_screenshots.py --output qa/managed-service/screenshots-2026-10-08 --xvfb /tmp/noema-webview-sdk-V3K1nA/root/usr/bin/Xvfb
.venv/bin/python -m compileall -q qa/managed_screenshots.py
rg --files qa -g '*.png' | wc -l
sha256sum -c qa/managed-service/screenshots-2026-10-08/source-after.sha256
```

No models, microphone, observer, cloud, framework or companion redesign work was
started. Next remains the [guided physical managed launch/quit/relaunch check](PHYSICAL_SWAY_ACCEPTANCE.md#managed-mode-guided-device-check-pending),
not another virtual acceptance run.

## Opt-in managed service lifecycle 2026-10-08

**A: BLOCKED ON DEVICE, unchanged. B: IMPLEMENTED/tested as Linux development
opt-in; physical launch/quit/relaunch pending. C: production defaults unchanged,
external service.** The user explicitly removed A as a blocker for independent
opt-in implementation, not for physical acceptance/default promotion. No
equivalent companion/headless Sway suite was rerun to pretend A progressed.

### Source checkpoint and isolation

Before editing, `git status --short -- .` was `?? ./`, `git ls-files -- .` empty;
the top level remains `/home/p4nic/code`. All **64** entries in the previous
`qa/device-acceptance/source-after.sha256` verified. Its SHA256 is
`aa63b1d8a93ec5e375fd47b041c5945e1ffa12cee17fcb41eb68d08379ab4a84`.
It is preserved as historical evidence. The new current source identity is
[source-after.sha256](../qa/managed-service/source-after.sha256), covering **68**
active files in the
same active scope plus the new owner/probe/service module/tests. Parent HEAD is
not an application revision; no staging, nested repository, commit or push.

Disposable pytest directories, temporary service databases/attachments/tokens,
fresh webview profiles and synthetic captures/tasks were used throughout.
Fixture ports are selected once per workflow and kept stable on reopen; no
production endpoint/profile changes. The real notebook/`.data`, screen,
clipboard, microphone and observation permissions were not used as fixtures.
No dependency installation, model download/inference, cloud sync or installer.
The extracted existing SDK was reused; private Xvfb, not the user's Sway, rendered
the webview. The manual fixture/recorder/sampler are reused, not replaced.

### Changes and policy

- `desktop/src/service.rs`: asynchronous owner, workspace exclusion, prebound
  loopback listener, bounded private acknowledgement + HTTP identity, serial
  Retry, monitored child exit, bounded group shutdown and reaping. An unreaped
  own child remains the group authority through cleanup, preventing PID reuse.
- `desktop/src/main.rs`: explicit `--manage-service --data-dir`, configured
  Python/entry/timeout; compact transient native startup/error/Retry/Cancel.
  Profile lock/default origin unchanged. Normal close still asks the existing
  web checkpoint before shutdown; hide does nothing to service ownership.
  Crash sends existing offline presentation immediately; Retry reconnects without
  navigating/reloading the editor. External mode has no backend shutdown path.
- `dhara/desktop_service.py`, `run.py`, `dhara/server.py`: actual Python entry
  consumes inherited listener/workspace lock and private stdin lifetime lease;
  acknowledges only after Uvicorn startup. `/api/desktop-instance` publishes
  protocol/public non-authorizing instance/PID only (external mode 404). Manual
  Linux launcher shares the workspace lock. Host/Origin/auth/scopes unchanged.
- Before exec, Linux parent-death TERM plus a parent-PID race check covers early
  startup before the Python lease watcher exists. After readiness, shell death
  also closes the private pipe; Python requests Uvicorn exit/group TERM. Normal
  owner shutdown waits 5 seconds, TERM up to 1 second, then KILL/reap only its
  group. No broad kill/name/PID-file cleanup. Separately wrapped agents survive.
- `desktop/Cargo.toml`, `desktop/Cargo.lock`, `desktop/src/lib.rs`: expose the
  Linux owner and already-cached libc/JSON dependencies. No framework migration.
- `desktop/examples/service_probe.rs`, `tests/test_managed_service.py`: focused
  real-process/API regressions against the exact production owner. Existing
  `desktop/qa/scenario.js` and `qa/webview_check.py` extended for managed/external,
  fault/retry/termination, duplicate launch and the existing sampler. Test-only
  native Retry activation compiles only with `qa`; normal IPC still only closes.
- Updated README, PROGRESS, BUILD_STATUS, DESKTOP, PHYSICAL_SWAY_ACCEPTANCE,
  SECURITY, ARCHITECTURE, API, CONTINUATION and this report. New evidence is under
  `qa/managed-service/`; old screenshots/reference assets/evidence are preserved.

No `public/` layout/CSS, approved kitten, task ranking/schema, priorities,
dependencies, pin protection or agent-event semantics changed. A-FOCUS-01
remains open; no explanation/ranking fix is claimed.

### Newly executed results (not historical totals)

| Check | Result | Evidence boundary |
|---|---|---|
| Python baseline | **99 passed**, 6.92s; one existing Starlette/AnyIO deprecation warning. | Before runtime edits, disposable data. |
| Final full Python | **116 passed**, 34.13s; same warning, no skips. | Original 99 plus 17 new lifecycle/API cases; real Rust actor/Python processes, HTTP/SQLite and independent wrapped command. |
| Rust policy baseline/final | **5 passed**. | Existing URL/navigation/download/profile lock rules; process ownership is exercised separately, not mocked in these five. |
| Now state baseline/final | **22 passed**. | Existing pure snapshot characterization; A-FOCUS-01 preserved. |
| Final managed WebKit | **49 checks passed**, [results](../qa/managed-service/owner-final/results.json). | Real Rust/Wry/WebKit, native IndexedDB/Blob, HTTP, SQLite, seven shell launches; six normal checkpoint closes and one actual native shell SIGKILL. Programmatic actions/native Retry signal, not physical input. |
| Final external WebKit | **28 checks passed**, [results](../qa/managed-service/external-owner-final/results.json). | Three native restarts against an independently held real fixture service. Shell close leaves it usable; duplicate profile launch refused. |
| Earlier resource-bearing managed run | **50 checks passed**, [results](../qa/managed-service/validated/results.json). | Above workflow plus one virtual open-idle sample/actual native shell SIGTERM. Collected before the final early-startup parent-death backstop/immediate offline notification; idle actor/worker behavior unchanged. Not an additional 50 independent product features. |
| Normal Linux debug build / format / parse / compile | Passed. | Normal binary rebuilt without QA at handoff; development executable, not installer. |
| Preserved documentation archive | **45 SHA256 entries pass**, including approved references. | Eight image-asset manifest hashes also checked; no artwork change. |
| Physical A / managed physical launch-close-reopen | **BLOCKED ON DEVICE**. | No new physical keyboard/pointer/file-picker/microphone, monitor/routing or native Wayland acceptance evidence. |

Process cases: cold start/reopen; simultaneous workspace owner refusal; eight
in-flight Retry requests keep one PID; wrong endpoint refused **without even
connecting**; missing interpreter/missing entry; dependency exception from a
controlled child entry; data path that cannot be a directory; early exit;
readiness timeout/cancel with real child + descendant cleanup; malformed private
identity refused; backend SIGKILL then explicit recovery/no auto loop; owner
SIGTERM/SIGKILL after readiness; owner SIGKILL before Python watcher; external
backend survives owner cancellation; inherited optional models/tokens disabled;
public identity grants no API access; separately launched real scoped agent
survives managed Quit/reopen and exits into **review**, task still **todo**.
Tests wait for owned fixture PIDs to disappear, not merely stop CPU execution.

WebKit checks additionally prove preserved original/image bytes, actual editor
code/undo, revision history, low manual priority and pinned focus across backend
restarts. A failed checkpoint is **explicit IDB transaction/confirmation fault
injection**: declining risk retains the editor and live backend, later successful
close/relaunch recovers the draft. This is not physical disk damage. Offline Save
queues one real outbox item; Retry uploads it once, leaves the newer unsaved
draft alone, and does not navigate away. No task is created from a capture.

Intermediate evidence is retained, not relabeled as final: the first five-launch
run had 40 checks; `qa/managed-service/final/` is an **aborted QA run**, not current
acceptance (the test held a stale DOM node after Capture rerender). An initial
process test raced `/proc` exit; a new assertion also initially expected the
wrong enum name (`ready_for_review`, actual existing value `review`). These QA
issues were corrected; no backend semantic change was made to satisfy them.
Current accepted final directories are `owner-final` and `external-owner-final`.

### Real process sample, limitations and inventory

[Raw virtual open-idle sample](../qa/managed-service/validated/open-idle.json):
20.0091s warm-up, 60.0148s sampling at requested 1s intervals, four observed
attributable processes throughout (Rust shell, two webview descendants, Python
service), no missing root/departed process, complete PSS/private readings.

| Metric | Observed |
|---|---|
| CPU, 100% = one core | **0.7332%** average; observed lower bound. |
| CPU, full logical-machine capacity | **0.0458%**, divided by 16 logical CPUs (not equal-performance cores). |
| Summed RSS | 449,417,216–453,193,728 bytes (428.6–432.2 MiB); shared pages double-counted. |
| Summed PSS | 211,185,664–215,056,384 bytes (201.4–205.1 MiB); shared pages proportioned. |
| Summed private | 151,924,736–155,799,552 bytes (144.9–148.6 MiB). |

Private Xvfb/X11 1280×900, software rendering requested. Existing synthetic
Capture page resting; managed optional processing disabled. Explicit shell and
service roots plus observed descendants; no whole-system overhead guarantee.
Xvfb, D-Bus/session/portal brokers, compositor, sampler, external browser excluded.
Companion/observer/microphone/models were not enabled. Short-lived/missed helpers
and CPU after last readable stat can be missed. Physical open/hidden/editing/
companion workloads remain pending. No battery, accelerated GPU, model latency,
resource target or native Wayland conclusion follows. Earlier **synthetic sampler
unit tests are not these Dhara workload measurements**. After the sample, all
four recorded PIDs were checked absent; owned timeout/cancel descendants also
disappeared. No unrelated processes were stopped by lifecycle cleanup.

Inspected screenshot inventory remains **33 QA PNGs**: 26 kitten visibility,
four Sway native, three pointer-pass. No screenshot generated/deleted in this
pass; older four/17/23/30-image inventories and visibility 80→88 / pointer 88→88 /
preparation 88→99 Python totals below are historical, not today's 99→116.

### Exact commands executed

From the repository root unless noted; output directories preserve earlier runs:

```bash
git status --short -- .
git ls-files -- .
sha256sum -c qa/device-acceptance/source-after.sha256
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-managed-baseline
cargo test --locked --manifest-path desktop/Cargo.toml --no-default-features --lib
node --test tests/now_state.test.cjs
cargo build --offline --locked --manifest-path desktop/Cargo.toml --no-default-features --example service_probe
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-owner-process-tests tests/test_managed_service.py
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-owner-process-final tests/test_managed_service.py
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-owner-process-expanded tests/test_managed_service.py
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-managed-final
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-managed-release-check
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-managed-final-reap
PKG_CONFIG_PATH=/tmp/noema-webview-sdk-V3K1nA/root/usr/lib/x86_64-linux-gnu/pkgconfig cargo build --offline --locked --manifest-path desktop/Cargo.toml --features qa -j 2
LD_LIBRARY_PATH=/tmp/noema-webview-sdk-V3K1nA/root/usr/lib/x86_64-linux-gnu .venv/bin/python qa/webview_check.py --skip-build --managed --sample --no-screenshots --output qa/managed-service/validated --xvfb /tmp/noema-webview-sdk-V3K1nA/root/usr/bin/Xvfb
LD_LIBRARY_PATH=/tmp/noema-webview-sdk-V3K1nA/root/usr/lib/x86_64-linux-gnu .venv/bin/python qa/webview_check.py --skip-build --managed --no-screenshots --output qa/managed-service/owner-final --xvfb /tmp/noema-webview-sdk-V3K1nA/root/usr/bin/Xvfb
LD_LIBRARY_PATH=/tmp/noema-webview-sdk-V3K1nA/root/usr/lib/x86_64-linux-gnu .venv/bin/python qa/webview_check.py --skip-build --no-screenshots --output qa/managed-service/external-owner-final --xvfb /tmp/noema-webview-sdk-V3K1nA/root/usr/bin/Xvfb
cargo test --offline --locked --manifest-path desktop/Cargo.toml --no-default-features --lib
cargo fmt --manifest-path desktop/Cargo.toml -- --check
node --check desktop/src/close.js
node --check desktop/qa/scenario.js
node --check public/app.js
.venv/bin/python -m compileall -q noema/desktop_service.py noema/server.py run.py qa/webview_check.py tests/test_managed_service.py
# Working directory docs/Noema-Documentation:
sha256sum -c SHA256SUMS
# Back at repository root, normal non-QA development handoff build:
PKG_CONFIG_PATH=/tmp/noema-webview-sdk-V3K1nA/root/usr/lib/x86_64-linux-gnu/pkgconfig cargo build --offline --locked --manifest-path desktop/Cargo.toml -j 2
desktop/target/debug/noema-desktop --help
# Expected exit 2: QA argument is absent in the normal handoff executable.
desktop/target/debug/noema-desktop --qa-stage verify
rg --files qa -g '*.png' | wc -l
# Generate source list using this command; saved through apply_patch:
{ rg --files -0 noema public desktop/src desktop/qa desktop/examples tools tests -g '!*.pyc' -g '!__pycache__/**'; rg --files -0 qa -g '*.py' -g '*.c' -g '*.config'; rg --files -0 docs -g '*.md' -g '!docs/Noema-Documentation/**'; printf '%s\0' README.md run.py pyproject.toml requirements.txt desktop/Cargo.toml desktop/Cargo.lock; } | sort -zu | xargs -0 sha256sum
sha256sum -c qa/managed-service/source-after.sha256
sha256sum qa/managed-service/source-after.sha256
```

The earlier 40-check/intermediate runs used the same webview command with output
directories `qa/managed-service`, `final`, `external`, `external-current`,
`post-fix` and `external-final`, without `--sample` except the aborted `final`
attempt. The sample calls the existing `qa.process_sample.measure` directly,
with explicit shell/service PIDs and default 20/60/1 timing. Choose **new** output
directories and disposable basetemps when repeating; sample files refuse overwrite.

### Remaining gate / next milestone

Physical Sway launch/keyboard, hide/restore, normal close/relaunch, startup error/
Retry, microphone/file-picker/routing/monitor checks and physical workloads stay
BLOCKED. Use the [short guided managed check](PHYSICAL_SWAY_ACCEPTANCE.md#managed-mode-guided-device-check-pending)
alongside original A. Linux-only evidence is not Windows/macOS support. Power
loss, simultaneous shell/backend kill, stuck kernel I/O, deliberately detached/
hostile descendants and unfinished recording recovery are not validated.
Managed mode intentionally disables optional models and does not retain the
backend after session Quit. External workflow remains available for independent
browser/agent/companion lifetime. No installer/autostart/daemon was added.

**One next milestone: user-assisted physical acceptance of existing A and opt-in
managed launch/quit/relaunch before default promotion.** Recoverable unfinished
voice/long recordings follow lifecycle acceptance; Whistle remains a separate
candidate evaluation, not an integrated model or work started here.

## Physical Sway gate preparation 2026-10-08 (historical)

**Phase A: BLOCKED ON DEVICE. Phase B: NOT STARTED.** Live Sway IPC is
available, but no physical-input tool channel is available to the assistant.
No physical workflow, mouse/keyboard/clipboard, file picker, microphone,
native browser dispatch, monitor/workspace placement or workload measurement
was performed. No equivalent headless companion suite was rerun. The
[single acceptance checklist](PHYSICAL_SWAY_ACCEPTANCE.md) records each required
device check BLOCKED and gives exact supported manual launch/sample commands.
This is a completed preparation handoff, not a completed Phase A or B.

### Checkpoint and isolation

`git status --short -- .` returns `?? ./`; `git ls-files -- .` is empty and
the Git top level is `/home/p4nic/code`. No parent commit is used as an
application revision. Before editing, 59 active source/configuration/test/doc
files were fingerprinted and all verified. The
[before manifest](../qa/device-acceptance/source-before.sha256) SHA256 is
`1e1e42bb6ed25d5ab613225b1638ef2832f4c79234e0bff99fdbc93ccb67548c`.
The [final source manifest](../qa/device-acceptance/source-after.sha256) is the
reproducible handoff fingerprint. Manifests cover the package `noema`, `public`, desktop
source/QA/Cargo files, `tools`, `tests`, QA Python/C/config and active docs plus
README/launcher/dependency files; they exclude private data, environments,
profiles, binaries, generated evidence and the preserved documentation archive.
No Git staging, nested repository, commit, history change or push occurred.

The [sanitized session record](../qa/device-acceptance/session.json) reports
Linux/Wayland, Sway 1.9, GTK 3.24.41, WebKitGTK 2.52.6, gtk-layer-shell 0.8.2,
Python 3.12.3 and Rust 1.93.1. Hardware reports i7-1270P, 31.06 GiB total usable
RAM, one DRM card. Active eDP-1 1920×1200 and DP-5 1920×1080 both report scale
1.0; device types include keyboard/pointer/touchpad. No headless connector name
is reported. These facts do not prove physical interaction, monitor validation,
GPU acceleration or a native Dhara client launch. The optional session recorder
can confirm only the fixture PID's `xdg_shell` versus `xwayland` protocol after
the user launches it; it was not given a shell PID in this pass.

Testing used disposable pytest databases/attachments/tokens/ports and synthetic
child processes. The preparation helper creates private `/tmp/noema-device-*`
files for the human workflow, not demonstration records in the notebook. The
user's `.data`, drafts/profile, clipboard, microphone and screen were untouched.
No model or observer was started. Only sanitized live version/output/input-count
IPC was used; no private titles, serials, process arguments or full environments
were logged. Existing artwork/evidence is preserved.

### Changes and newly executed results

Added `qa/device_fixture.py` (synthetic code/hypothesis + PNG and occupied-port
preflight, no service/UI launch), `qa/device_session.py` (sanitized read-only
inventory; optional fixture client protocol), `qa/process_sample.py` (content-
free selected-root accounting), `tests/test_device_tools.py`, the checklist and
`qa/device-acceptance/` manifests/session evidence. Extended
`tests/now_state.test.cjs` with four focus characterization cases. Updated
README, PROGRESS, BUILD_STATUS, DESKTOP and this report. **Production runtime,
UI/CSS, backend/schema, priority/dependency/agent semantics, original captures,
revisions, pin protection, companion and observation gates are unchanged.**

| Executed now | Result and boundary |
|---|---|
| Python baseline before edits | 88 passed, 4.86s; one existing Starlette/AnyIO warning. |
| New QA-tooling tests | 11 passed, 0.88s. Real temporary files/occupied socket, synthetic child trees and actual sampler CLI; PID reuse/privacy filtering use explicit fixtures and missing PSS is injected. |
| Full Python final | 99 passed, 6.15s; same warning. Original 88 preserved. |
| Now pure state baseline / final | 18 / 22 passed. Actual extracted presentation helpers with synthetic snapshots, not device UI. |
| Rust policy | 5 passed. Existing origin/link/profile-lock behavior, not lifecycle ownership. |
| Normal Linux development build | Passed, default Wry/Tao without QA feature; extracted existing SDK, no installation or physical launch. |
| Parsing/compilation/format | Python compileall, JavaScript parse and Rust formatting passed. |
| Approved documentation archive | All 45 manifest entries pass unchanged. |
| Physical A / full-process measurements | BLOCKED ON DEVICE; no application workload samples or physical checks executed. |

The sampler measures explicitly selected roots plus discovered descendants,
retains known reparented children and rejects reused PID identities using Linux
start ticks. It reports actual warm-up/sample periods, process count, one-core
and logical-machine CPU normalization, summed RSS, PSS and private memory;
unknown private/PSS values stay null. Short-lived/missed helpers and CPU after
last readable samples are explicit exclusions; already-reparented helpers need
explicit attributed `webview-N` roots. No process is started/stopped by sampling.
Tests use brief synthetic process trees solely to validate accounting and
privacy. **There are no complete-Dhara resource results in this pass**, despite
the target CPU being reported. No battery/model performance is inferred.
The old backend-only sampler was not rerun; its optional `psutil` is absent in
the current venv. The new sampler needs only Python's standard library.

Source review records A-FOCUS-01: attention → available → actionable focus is
the implemented recommendation order. Another available task can be suggested
ahead of an actionable pin, without changing it; the displayed task action
does not explicitly explain why the pin is bypassed. Device reproduction/text
review remains required, not a claim of physical failure. No ranking rewrite
or speculative UI change was made.

### Exact executed commands

Repository root unless specified; baseline suites were run before edits:

```bash
git status --short -- .
git rev-parse --show-toplevel
git ls-files -- .
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-device-gate-baseline
node --test tests/now_state.test.cjs
cargo test --locked --manifest-path desktop/Cargo.toml --no-default-features --lib
# Manifest file lists, before and after edits, were generated with:
{ rg --files -0 noema public desktop/src desktop/qa tools tests -g '!*.pyc' -g '!__pycache__/**'; rg --files -0 qa -g '*.py' -g '*.c' -g '*.config'; rg --files -0 docs -g '*.md' -g '!docs/Noema-Documentation/**'; printf '%s\0' README.md run.py pyproject.toml requirements.txt desktop/Cargo.toml desktop/Cargo.lock; } | sort -zu | xargs -0 sha256sum
sha256sum qa/device-acceptance/source-before.sha256
sha256sum -c qa/device-acceptance/source-before.sha256
.venv/bin/python qa/device_session.py --output qa/device-acceptance/session.json
.venv/bin/python run.py --help
desktop/target/debug/noema-desktop --help
/usr/bin/python3 tools/sway_companion.py --help
.venv/bin/python tools/agent.py --help
.venv/bin/python qa/process_sample.py --help
.venv/bin/python qa/device_fixture.py --help
PKG_CONFIG_PATH=/tmp/noema-webview-sdk-V3K1nA/root/usr/lib/x86_64-linux-gnu/pkgconfig cargo build --locked --manifest-path desktop/Cargo.toml -j 2
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-device-tools-test tests/test_device_tools.py
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-device-tools-final tests/test_device_tools.py
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-device-gate-final
node --test tests/now_state.test.cjs
.venv/bin/python -m compileall -q qa/device_fixture.py qa/device_session.py qa/process_sample.py tests/test_device_tools.py
cargo fmt --manifest-path desktop/Cargo.toml -- --check
node --check public/app.js
sha256sum desktop/target/debug/noema-desktop public/cat.png public/app.js public/styles.css tools/sway_companion.py
rg --files qa -g '*.png' -g '*.jpg' -g '*.jpeg' -g '*.webp'
sha256sum -c qa/device-acceptance/source-after.sha256
# Working directory: docs/Noema-Documentation
sha256sum -c SHA256SUMS
```

The first focused tooling run had nine tests; two real CLI/root-exit cases were
then added, bringing the final focused suite to eleven. Additional narrow
diagnostics used ctypes version functions, filtered `/proc` CPU/memory fields
and a Gtk/GtkLayerShell/Cairo import check. GtkLayerShell's shared library exists
but its typelib is absent from the default system search path; the checklist
uses the already-extracted temporary GI directory. Nothing was installed.
The normal development executable SHA256 after build is
`d643049cb0813879d10c279088e70c317b2addb4da84130069585664cc84da4b`.

### Historical evidence and outstanding gate

Earlier visibility pass: Python **80→88**, native visibility **14 before / 41
after**. Latest pointer pass: Python **88→88**, **41** compositor pointer checks,
**31** native regression. Those companion/browser suites were **not rerun now**;
neither historical unit counts nor screenshots are current physical evidence.
Inspected inventory is **33 current QA PNGs**: 26 `qa/kitten-visibility/`, four
`qa/sway/after/`, three `qa/companion-input/after/`. No screenshots were created,
removed or replaced in this pass. Earlier four/23/30-image inventories below
are historical moments, not today's totals. Approved documentation images
are outside the QA inventory and remain untouched.

Next milestone: complete A with the user's physical keyboard/pointer/microphone,
actual OS routing and four attributable-process workload samples on the one
synthetic fixture. Resolve/recheck physical failures and explanation gap before
closing A. **Do not begin B while A is blocked.** Backend ownership, bounded
startup/readiness/retry/shutdown and real cleanup tests remain unimplemented.
Native-presence detection, automatic preview suppression and event-triggered
messages remain pending. Unfinished voice/long recordings follow lifecycle
acceptance; no Whistle integration/evaluation was started.

## Native pointer acceptance 2026-10-08 (historical)

Added QA-only `qa/companion_input_probe.py`, `qa/virtual_pointer.c`, the
`qa/sway_check.py --pointer` entry point and `qa/companion-input/` evidence.
Updated PROGRESS, BUILD_STATUS, DESKTOP and this report. Production helper,
frontend, backend, asset and placement/permission logic are unchanged.

**41 checks pass** with a registered private virtual pointer and actual Sway
IPC/Wayland press/release events, not GTK `clicked` signals. Cat/Dot, menu,
Close, keyboard-focus retention and outside-click delivery to the work window
pass at 100%/150%/200% scales. At 200%, the saved task URL, 32/48 sizing,
pause/resume and explicit Hidden pass. Independent service reads verify
permission off, no context/implicit notes, manual priority and pinned focus.
The virtual device refuses missing fixture runtime and absolute Wayland paths.
Runtime/socket/compositor-PID guards protect against input on the user's seat.

The first fixture attempt had no pointer device (`capabilities: 0`), so neither
the kitten nor the ordinary GTK window received clicks. Registering a virtual
device corrected the fixture; no production defect was found. A work-window
click calibration now fails early if pointer delivery is unavailable. The
helper is built with `cc -Wall -Wextra -Werror` and pkg-config's Wayland flags
inside the temporary fixture. No package installation is claimed.

Python baseline: **88 passed, 7.57s**; final: **88 passed, 5.33s**; same existing
Starlette/AnyIO warning. Native regression rerun: **31 passed**. Other suites
below are prior-milestone evidence, not rerun in this QA-only continuation.

Exact executed commands:

```bash
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-companion-input-baseline
GI_TYPELIB_PATH=/tmp/noema-sway-sdk-dEQTbK/root/usr/lib/x86_64-linux-gnu/girepository-1.0 .venv/bin/python qa/sway_check.py --pointer
GI_TYPELIB_PATH=/tmp/noema-sway-sdk-dEQTbK/root/usr/lib/x86_64-linux-gnu/girepository-1.0 .venv/bin/python qa/sway_check.py
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-companion-input-final
.venv/bin/python -m compileall -q qa/sway_check.py qa/companion_input_probe.py
sha256sum public/cat.png public/styles.css public/app.js tools/sway_companion.py
```

[Current captures and raw results](../qa/companion-input/README.md) are synthetic,
unmodified compositor output; no new before/after visual change is claimed.
Browser dispatch is intercepted; local pause/resume does not exercise recurring
polling-thread scheduling. No physical input, monitor, clipboard, microphone,
model or target-laptop performance claim follows. Observation is not enabled.
No new runtime feature, installer, cloud sync, native-presence suppression or
event-triggered attention messages were added. Next: user-assisted physical
Sway checks using disposable data, then OS browser routing and accessibility.

## Native kitten visibility 2026-10-08

The unchanged illustrated asset now sits in a small pale-sage rounded container,
thin contrasting border and subtle shadow. This fixes its demonstrated lack of
contrast on a dark desktop; no main layout, CSS or application framework was
changed. Default sprite/container are 40/56 logical pixels; selecting 32 gives
32/48, with the previous 24 option preserved. The 64×64 default native surface
includes four pixels of shadow margin per edge, not a full-screen input overlay.
Scale changes rebuild a Cairo surface from the original asset, without editing
the PNG. Dot has its own small contrasting container; Hidden is explicit.

Clicking opens one available task and its actual saved next action. The new
`#task/<id>` link opens the existing task dialog, including the full action;
it does not select focus or complete work. Secondary appearance/observation/
quit controls are behind Companion menu. Close or another kitten click dismisses
the panel. Popovers are non-modal and keyboard mode stays NONE. Long text is
abbreviated and menus height-limited/scrollable. An open panel refreshes when
available work or its display scale changes. Appearance/clicks never enable
observation. Explicit dismissal is tracked separately from GTK's closing
animation, so a scale/size refresh cannot reopen a dismissed panel.

Changed runtime code: `tools/sway_companion.py`, `dhara/server.py` (saved
`next_action` added to the observer-readable summary), `public/app.js` (existing
task-dialog deep link only). No ranking, priority, focus, SQLite schema, token
scope middleware or observation permission gate changed. `public/styles.css`
remains SHA256 `a4c616b4e2025f81373a53bde30f9cd55c53afaeea80c0f868d95eb967ff7346`;
`public/cat.png` remains
`bc81d2ce788db7c6cd6cf5971b61450a9949c571cbaebe64b65d49d481ab3d0f`.

Changed tests/harness: `tests/test_core.py`, `tests/test_companion.py`,
`qa/sway_check.py`, `qa/sway_probe.py`, `qa/now_ui_check.py` (optional screenshot
suppression); added `qa/kitten_visibility_probe.py`, `qa/task_link_check.py`.
Updated README, PROGRESS, BUILD_STATUS, DESKTOP, ARCHITECTURE, SECURITY, API and
this report; added `qa/kitten-visibility/README.md` and current evidence under
that directory. Four native views in `qa/sway/after/` were refreshed in place.

Baseline before edits: **80 Python tests, 4.95s**. Final: **88, 5.40s**, including
seven summary API cases and one original-asset hash check, with one existing
Starlette/AnyIO deprecation warning. The original 80 remain. The 19 helper
policy/asset tests include pure fixtures and explicit observer/client/event-loop
doubles, not GI/device validation. Model tests elsewhere remain doubles, not
measured model quality or target-hardware performance.

Actual GTK/Sway visibility checks: **41 after, 14 before**. Both use the same
synthetic pinned low-priority allocator task and available parser task, with
server observation permission off. A real GTK focus sentinel lives on the
second private output. Dark/light captures at 100%/150%/200% show the actual
new surface, with measured 56×56 logical container in all three cases. GTK
buffer scale is 1/2/2; this exercises compositor scaling, not physical monitors.
Checks cover panel/menu bounds (including live scale changes with the menu
open), preserved active-window focus, actual saved
action, menu disclosure, pause/resume, 32/48 sizing, Cat/Dot/Hidden, disconnected
and changed-work presentation, long unbroken text and unchanged permission/pin.
Browser launch is intercepted and the URL asserted; GTK clicks are programmatic
signals. Outage/task-state/long-text summaries are explicit injections. They do
not establish physical pointer hit testing or OS browser dispatch.

Native regression: **31 passed**, including actual two-output placement,
server-Hidden precedence, local pause/resume, real metadata rule matching with
pin protection and real Rust Wayland scratchpad hide/restore. A background poll
initially raced the probe's injected placement and produced a fixture failure.
The probe now executes a real HTTP/observer `poll_once`, then drives GTK without
the recurring thread so fixture transitions are deterministic. No fake server
or GTK widgets; recurring polling-thread scheduling itself is not validated by
this probe. Production polling code is unchanged.

Chrome task/settings link checks pass **9/8** against real HTTP/SQLite, preserving
unsaved Capture/note editors and originals. Missing tasks get an error, not a
fake action. **58** Now regression, **18** Now unit and **5** Rust policy tests
also pass. The connected browser surface was unavailable after prescribed
connection checks; browser QA used the repository's isolated headless Chrome
harness. No OS browser launching, clipboard, microphone or physical input is
claimed. Formatting/parsing/compilation and all 45 documentation hashes pass.

Exact executed commands (repository root unless specified):

```bash
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-kitten-visibility-baseline
mktemp -d /tmp/noema-kitten-before-XXXXXX
cp tools/sway_companion.py /tmp/noema-kitten-before-8Fkv6z/sway_companion.py
GI_TYPELIB_PATH=/tmp/noema-sway-sdk-dEQTbK/root/usr/lib/x86_64-linux-gnu/girepository-1.0 .venv/bin/python qa/sway_check.py --visibility --before-source /tmp/noema-kitten-before-8Fkv6z/sway_companion.py
GI_TYPELIB_PATH=/tmp/noema-sway-sdk-dEQTbK/root/usr/lib/x86_64-linux-gnu/girepository-1.0 .venv/bin/python qa/sway_check.py --visibility
GI_TYPELIB_PATH=/tmp/noema-sway-sdk-dEQTbK/root/usr/lib/x86_64-linux-gnu/girepository-1.0 .venv/bin/python qa/sway_check.py
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-kitten-visibility-final
CHROMIUM_PATH=/usr/bin/google-chrome .venv/bin/python qa/task_link_check.py
CHROMIUM_PATH=/usr/bin/google-chrome .venv/bin/python qa/settings_link_check.py
CHROMIUM_PATH=/usr/bin/google-chrome .venv/bin/python -c 'from qa import now_ui_check; now_ui_check.main(capture_screenshots=False)'
node --test tests/now_state.test.cjs
cargo test --locked --manifest-path desktop/Cargo.toml --no-default-features --lib
node --check public/app.js
cargo fmt --manifest-path desktop/Cargo.toml -- --check
.venv/bin/python -m compileall -q tools/sway_companion.py qa/sway_check.py qa/sway_probe.py qa/kitten_visibility_probe.py qa/task_link_check.py qa/now_ui_check.py tests/test_companion.py tests/test_core.py
sha256sum public/cat.png public/styles.css tools/sway_companion.py
# Working directory: docs/Noema-Documentation
sha256sum -c SHA256SUMS
```

The baseline source path is a temporary pre-edit copy, not a release tag. Its
SHA256 is recorded in `qa/kitten-visibility/before/results.json`. Initial before
captures preceded code edits; final captures repeated the original helper with
the focus sentinel. Both use the same unchanged bitmap and synthetic task
fixture. Native QA uses the existing system GTK/Cairo/Sway binaries and an
already-extracted temporary GtkLayerShell typelib; no system installation or
new Rust binary build is claimed. All services/profiles use temporary data,
workers/models disabled. No user workspace tasks, notes or permission settings
were altered, and the user's Sway desktop/config were not inspected or captured.

Current comparison/evidence:

| View | Before | After |
|---|---|---|
| Dark desktop | [Original](../qa/kitten-visibility/before/dark-1x.png) | [Popup](../qa/kitten-visibility/after/dark-1x.png) |
| Light desktop | [Original](../qa/kitten-visibility/before/light-1x.png) | [Popup](../qa/kitten-visibility/after/light-1x.png) |
| Task panel | [Original controls](../qa/kitten-visibility/before/task-panel.png) | [One actual action](../qa/kitten-visibility/after/task-panel.png) |

The [visibility evidence directory](../qa/kitten-visibility/README.md) links the
scale/mode/menu captures. Its JSON records measurements and source hashes;
`qa/sway/after/results.json`, `qa/kitten-visibility/task-link-results.json`,
`qa/sway/settings-link-results.json` and `qa/now-ui/results.json` hold other raw
results. Only 26 milestone visibility images and four refreshed native images
are retained. An initial Now regression generated 17 redundant images; all
17 were individually moved to system Trash with `gio trash --`, and the suite
rerun with screenshots disabled. Those generated images are recoverable until
Trash is emptied; approved references/runtime art/user data were untouched.

Pending: physical Sway pointer/keyboard and monitor/workspace/scaling acceptance,
OS browser routing, accessibility/IME and target-laptop resource measurement.
Reliable native-presence detection is absent; no heuristic suppression of the
in-app browser preview was added. Event-triggered native attention messages
remain unimplemented; no fake agent activity or attention events were added.
No installer, cloud sync, Android integration, vision/screen capture or
hardware/model performance claim is made. Next concrete step: run the same
disposable fixture on physical Sway with explicit user participation, checking
popup hit targets, all controls, focus and placement at the laptop's actual
display scales before treating device acceptance as complete.

## Previous final screenshot cleanup 2026-10-08

At the user's follow-up request, moved the remaining 17 Now-state images and two
browser storage-error images to system Trash. Only the four latest PNGs in
`qa/sway/after/` remain: controls, paused, disconnected and restored desktop.
The two cleanup passes removed 50 images in total. References, runtime assets,
source/test code and historical logs/result JSON are unchanged. Removed images
are recoverable from system Trash until it is emptied.

Used `gio trash --` with 19 individually resolved paths. Verified the four-image
inventory and removed stale image links. No application tests were rerun for
this image/documentation-only cleanup. Older sections below describe historical
images and comparisons, not currently retained screenshots.

## Screenshot cleanup 2026-10-08

At the user's request, moved 31 superseded test images to system Trash and kept
only 23 current images: 17 Now-state views in `qa/now-ui/`, four native views in
`qa/sway/after/`, and two storage-error views in
`qa/continuation/native-storage/`. The latest Now images were moved unchanged
from `qa/sway/ui-regression/` into the canonical `qa/now-ui/` directory; SHA256
checks confirm the moves preserved all 17 files byte-for-byte.

Removed: four original `qa/*.png`, four browser-adapter images, two retired Qt
images, three older WebKit images, the old Sway before image and 17 superseded
Now images. Historical JSON/logs, test code, approved documentation assets,
user-supplied references and runtime art remain. Below, earlier screenshots and
comparison commands describe historical tests; their superseded images are no
longer retained. In particular, the before-image pixel comparison is historical,
not a currently rerunnable check. Removed images can be restored from system
Trash until it is emptied. No application code changed or tests were rerun for
this image/documentation-only cleanup.

Cleanup used `gio trash --` with the 31 individually resolved image paths, then
`mv -n --` for each of the 17 current images into the vacated canonical paths.
Verification checked the retained hashes, the 23-image inventory and local
documentation links. The follow-up cleanup above supersedes this first pass's
23-image retention count.

## Native Sway helper continuation 2026-10-08

Changed code: `tools/sway_companion.py` and a four-line existing-settings deep
link handler in `public/app.js`; added `tools/companion_state.py`.
New tests/harness: `tests/test_companion.py`, `qa/sway_check.py`,
`qa/sway_probe.py`, `qa/sway.config`, `qa/settings_link_check.py`. Evidence:
`qa/sway/before/`, `qa/sway/after/`, `qa/sway/ui-regression/` and
`qa/sway/settings-link-results.json`. Updated README, PROGRESS, BUILD_STATUS,
DESKTOP, ARCHITECTURE, SECURITY and this report. The main layout/stylesheet,
Rust desktop source, backend/schema, original tests, user data and approved
assets are unchanged. Before/after JSON records frontend source hashes; the CSS
hash matches and the JavaScript hash reflects only the settings-link fix.

Baseline before code edits: **62 Python tests passed in 5.82s**. Post-change:
**80 passed in 5.52s**, and final after the deep-link fix **80 passed in 6.31s**,
including 18 new companion policy tests, with the same
existing dependency deprecation warning. The new policy tests use actual pure
helpers plus explicit client/observer/event-loop doubles; they do not import GI
or demonstrate a compositor. Existing Now state tests: 18 passed again. Rust
policy tests: 5 passed again. Compile/parse/format checks and the documentation
bundle's 45 hashes pass. After finding the missing settings route, the real Now
UI suite passes 58 again (written under `qa/sway/ui-regression/` to preserve the
original screenshots), native Chrome storage passes 22 again, and the new real
settings-link suite passes 8 checks. Browser adapter 14 and WebKit restart/editor
26 were not rerun; those results remain historical, not newly executed results.

The native helper's Observation settings link originally targeted an unhandled
`#settings` hash. The minimal handler opens the already implemented dialog, with
no new navigation screen. Real Chrome/HTTP tests verify startup deep linking,
actual permission updates, and preservation of unsaved Capture and note-editor
text/routes and saved originals. These are not OS external-browser launch or
physical permission tests. Closing the dialog leaves the current editor intact.

The new **30-check** suite runs actual Sway 1.9 with headless/pixman rendering,
GTK3, gtk-layer-shell 0.8.2, the normal Rust/Wry/WebKit executable, real loopback
HTTP and SQLite. It creates a private compositor from a supplied minimal
config, two synthetic outputs, temporary service/profile and synthetic tasks.
It does not load the user's Sway config, notebook, clipboard or desktop pixels.
Before screenshot/IPC actions, the probe checks its private runtime, socket and
compositor PID. Worker/model processing is disabled; helpers use a real scoped
observer token, never a production credential.

Coverage: layer surface/no reserved layout space; no idle keyboard interaction;
explicit popover ON_DEMAND interaction (protocol 4+); controls dismiss;
Cat/Dot/Hide, 40 px cap, local pause/resume; placement on a second synthetic
output; local actions cannot resurrect a hidden-workspace surface; server
Hidden overrides local Dot; disconnected controls suppress cached available
tasks; normal Rust window maps as Wayland and survives Sway scratchpad
hide/restore. A real GTK fixture window is observed through actual Sway IPC;
two metadata observations match a competing task rule through the real scoped
API while pinned focus stays unchanged. Fresh-report labeling requires that
actual report. An independent service read checks original pin/manual priority,
no implicit notes and unchanged observation permission.

Outage (`unavailable()`), workspace visibility and server-Hidden presentation
are explicit injections into the real GTK UI; local appearance reset in the
probe is a fixture reset, not an implemented restore button. Monitor movement,
window mapping/hide/restore and final metadata are actual compositor/API
operations. Buttons are activated programmatically, not physical mouse/keyboard
events. A selected keyboard mode is not proof of physical keyboard navigation.
No OS clipboard, file picker, microphone, notification, accessibility/IME,
physical multi-monitor scaling, GPU/model, RAM/battery, installer, Windows,
Android or synchronization claim is made.

Visual change rationale: the old native popover treated allowed metadata as
enabled observation, omitted Hide, offered a 56 px cat and could discard
placement when a local mode/size changed. The targeted native controls now
separate permission/recent evidence/local polling, add Hide and local observer
pause, cap sizes at 40 px and preserve placement. The compact main app is not
redesigned. All images below are actual private compositor captures with the
same synthetic fixture/1440x960 output, not mockups or the user's screen.
The existing `qa/now-ui/` regression baseline is untouched.
Decoded before/after pixels for the main navigation/reading region
(1440x620, top of this fixed fixture) compare identically using GdkPixbuf.
This is a scoped visual check, not universal cross-platform pixel equivalence.

| Evidence | Screenshot |
|---|---|
| Before native controls | Superseded image removed at the user's request; historical result JSON retained. |
| After native controls | [After](../qa/sway/after/controls.png) |
| Local observer paused | [Paused](../qa/sway/after/paused.png) |
| Explicit disconnected state | [Disconnected](../qa/sway/after/disconnected.png) |
| Desktop restored by Sway | [Restored](../qa/sway/after/restored-desktop.png) |

Local appearance resets on helper restart; Hide restores only by restart.
Local pause prevents future helper polls, not an in-flight request or another
observer. Global permission/clear-context remains in real web Settings; no new
admin scope is granted. The helper is still launched manually and not owned by
the main desktop shell. The popover uses GTK's documented
[layer-shell keyboard modes](https://wmww.github.io/gtk-layer-shell/).

Exact executed commands from the repository root unless noted:

```bash
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-sway-baseline
cp /home/p4nic/code/noema/tools/sway_companion.py /tmp/noema-sway-before-72kw09/sway_companion.py
# Dependency extraction only, from /tmp/noema-sway-sdk-dEQTbK:
apt-get download gir1.2-gtklayershell-0.1
dpkg-deb -x gir1.2-gtklayershell-0.1_0.8.2-1build2_amd64.deb root
# Back at repository root:
GI_TYPELIB_PATH=/tmp/noema-sway-sdk-dEQTbK/root/usr/lib/x86_64-linux-gnu/girepository-1.0 .venv/bin/python qa/sway_check.py --before-source /tmp/noema-sway-before-72kw09/sway_companion.py
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-sway-policy tests/test_companion.py
GI_TYPELIB_PATH=/tmp/noema-sway-sdk-dEQTbK/root/usr/lib/x86_64-linux-gnu/girepository-1.0 .venv/bin/python qa/sway_check.py
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-sway-post-change
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-sway-final
CHROMIUM_PATH=/usr/bin/google-chrome .venv/bin/python qa/settings_link_check.py
CHROMIUM_PATH=/usr/bin/google-chrome .venv/bin/python -c 'from pathlib import Path; from qa import now_ui_check as checks; checks.OUTPUT=Path("qa/sway/ui-regression"); checks.main()'
CHROMIUM_PATH=/usr/bin/google-chrome .venv/bin/python qa/native_storage_check.py
node --test tests/now_state.test.cjs
cargo test --locked --manifest-path desktop/Cargo.toml --no-default-features --lib
.venv/bin/python -m compileall -q tools/sway_companion.py tools/companion_state.py qa/sway_check.py qa/sway_probe.py qa/settings_link_check.py tests/test_companion.py
node --check public/app.js
cargo fmt --manifest-path desktop/Cargo.toml -- --check
/usr/bin/python3 -c 'import gi; gi.require_version("GdkPixbuf","2.0"); from gi.repository import GdkPixbuf; before=GdkPixbuf.Pixbuf.new_from_file("qa/sway/before/controls.png"); after=GdkPixbuf.Pixbuf.new_from_file("qa/sway/after/controls.png"); a,b=before.get_pixels(),after.get_pixels(); stride_a,stride_b=before.get_rowstride(),after.get_rowstride(); width=1440*before.get_n_channels(); print("Main navigation/reading surface rows 0–619 identical:",all(a[y*stride_a:y*stride_a+width]==b[y*stride_b:y*stride_b+width] for y in range(620)))'
# From docs/Noema-Documentation:
sha256sum -c SHA256SUMS
```

The two temporary directories were created with `mktemp -d` using prefixes
`/tmp/noema-sway-sdk-XXXXXX` and `/tmp/noema-sway-before-XXXXXX`. Runtime GTK and
layer-shell libraries already existed; only the missing GI typelib package was
downloaded/extracted, not installed system-wide. After dependencies are present,
`.venv/bin/python qa/sway_check.py` runs the current suite without SDK variables.
The pre-change source is backed up at the exact path above while that temporary
directory exists; its SHA256 is recorded in `qa/sway/before/results.json`.
Current screenshots and final result JSON remain repository evidence; the
superseded before image was removed during the cleanup described above.

An initial baseline attempt could not locate the sprite relative to the saved
temporary module. The probe now resolves that unchanged repository asset while
executing the saved source. Test success is explicit, not inferred from a stale
result file. Visual review also corrected screenshot timing for paused/offline
popovers so capture waits for GTK to paint. Final logs retain a GTK
theme-property warning; it does not establish
theme compatibility on every desktop. Browser connection discovery found no
connected browser, so native protocol testing uses the private local harness.

Next concrete step: physical Sway keyboard/clipboard/IME, file-picker and
microphone permission/capture checks using disposable data, plus real monitor
scale and full process-tree measurements. Then implement owned Rust service
lifecycle/error recovery; do not redesign the interface to fill that gap.

## Now interface refinement · 2026-10-08 (previous completed milestone)

No framework/backend/schema change. Code changes are `public/app.js` and
`public/styles.css`; new tests are `tests/now_state.test.cjs` and
`qa/now_ui_check.py`. README/architecture/security/build-status/test-report
documents and synthetic QA evidence are updated. Approved assets and original
historical documentation evidence are unchanged.

Before editing: Python 62 passed (5.03s) and isolated browser 14 passed.
Added pure presentation tests: 18 passed. New real Now UI suite: 58 checks
passed, no uncaught JavaScript errors. Post-change Python: 62 passed (8.65s),
one existing dependency deprecation warning;
existing adapter/native-storage/webview suites: 14/22/26 passed respectively.
The pure presentation tests exercise actual extracted helper code with explicit
snapshot fixtures, not mocked backend or inference claims. Real Now UI QA uses
headless Chrome, actual served HTML/CSS/module JavaScript, loopback HTTP,
SQLite and native browser storage. Each fixture has a fresh temporary service
directory and browser context, with workers/models disabled; no demonstration
tasks are written to production `.data`.

The fixture suite covers new/notes-only, available, agent/dependency waiting,
completed results and questions needing attention, all tasks marked done,
stale reports and disconnected/reconnected state. It verifies a singular
primary suggestion/disclosed alternatives, no fabricated estimates, real
Capture/Add-task forms, learning notes remaining separate from tasks, real
scoped-token setup, manual/inferred/pinned labels, pinned-focus protection,
kitten mode/size/hide/permission controls, text contrast, overflow and motion.
Reduced-motion uses the actual media query; visibility and network loss are
explicit test injections. Stale timestamps are fixture data, not real agent
outages. Canvas pixels are checked to exclude the reading rectangle.

Screenshots in `qa/now-ui/` show the implemented page, not mockups: 1440x960
desktop and 390x844 phone viewports for new, notes-only, available, waiting,
attention, complete, unknown and disconnected states, plus the on-demand
companion controls. Screenshots use synthetic data and are visually inspected.
Phone-width Chrome is not an Android/native-phone test. The browser skill was
read and discovery attempted; no connected browser was available, so the
existing standalone isolated testing route was used.

These 17 earlier Now/companion-dialog screenshots were removed at the user's
request. The test harness and result JSON remain; only the four latest native
Sway images linked above are retained in QA.

Exact executed commands (from repository root unless stated):

```bash
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-ui-refine-baseline
CHROMIUM_PATH=/usr/bin/google-chrome .venv/bin/python qa/browser_check.py
node --test tests/now_state.test.cjs
CHROMIUM_PATH=/usr/bin/google-chrome .venv/bin/python qa/now_ui_check.py
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-ui-refine-post-change
CHROMIUM_PATH=/usr/bin/google-chrome .venv/bin/python qa/native_storage_check.py
node --check public/app.js
.venv/bin/python -m compileall -q qa/now_ui_check.py
PKG_CONFIG_PATH=/tmp/noema-webview-sdk-V3K1nA/root/usr/lib/x86_64-linux-gnu/pkgconfig cargo build --locked --manifest-path desktop/Cargo.toml --features qa -j 2
LD_LIBRARY_PATH=/tmp/noema-webview-sdk-V3K1nA/root/usr/lib/x86_64-linux-gnu .venv/bin/python qa/webview_check.py --skip-build --xvfb /tmp/noema-webview-sdk-V3K1nA/root/usr/bin/Xvfb
PKG_CONFIG_PATH=/tmp/noema-webview-sdk-V3K1nA/root/usr/lib/x86_64-linux-gnu/pkgconfig cargo build --locked --manifest-path desktop/Cargo.toml -j 2
```

The browser adapter remains 14 checks with explicit transport/storage doubles;
native storage remains 22 real Chrome checks with injected failures. The Rust
webview compatibility/restart/editor suite remains 26 assertions on private
virtual X11. No unit/fixture result proves actual microphone/model behavior,
native overlay placement, installation, cloud sync or laptop resource targets.
Integration connection health is still unimplemented; it is visibly unknown
unless recent/stale run evidence can be reported. Native overlay and physical
keyboard/clipboard/Sway/mobile/device accessibility validation remain separate.

Development harness corrections preserved app CSP: string wait predicates
were replaced with function predicates. Kitten preferences are serialized to
avoid out-of-order refreshes; the size check waits for real acknowledgment.
The completed-run fixture now checks run `review` and task not `done`, matching
the existing service contract rather than assuming automatic task-status edits.

## Webview restoration · 2026-10-08 (previous completed milestone)

The rejected Qt/QML interface is replaced by a compiled Rust Wry 0.57.0 /
Tao 0.37.1 shell displaying the original web app through Linux WebKitGTK.
There is no Qt/CXX build dependency or native duplicate of note/task state.
Python service/schema, existing capture recovery, original-note retention,
manual priority and pinned focus are preserved. `public/app.js` adds only a
native-close event hook using its existing serialized draft-saving logic;
layout and controls were not redesigned. The app's module-private variables
are not incorrectly read as globals by the shell.

Before desktop replacement: 62 Python tests passed in 4.90s. Final regression:
62 passed in 8.29s, one existing dependency deprecation warning. Rust policy
tests: 5 passed, including origin/link/download restrictions and exclusive
profile locking without deleting stored data. Rust formatting, all three JS
parse checks and Python harness compile checks passed. Linux QA and normal
development builds use extracted headers in a disposable SDK; no system-wide
GTK/WebKit development-package installation is claimed.

Real native webview QA: **26 assertions passed**, including repeated UI/style
checks across three desktop launches. The harness uses real Rust/Wry/WebKit,
native persistent IndexedDB/Blob bytes, a temporary loopback HTTP service and
SQLite database. It verifies capture draft and exact image-byte restart
recovery, immediate close checkpoint before input debounce, no ingestion before
Save, one committed note/no restart duplicates, outbox acknowledgment, original
retention, manual low priority and pinned focus. It also drives the actual note
editor: focus, multiline Rust code insertion, engine undo, form submission and
code-block rendering. Image paste is a synthetic ClipboardEvent containing a
real File/Blob, not an OS clipboard/file-picker test. Task/focus setup and the
independent final read use real HTTP. Workers/models are disabled.

Actions are programmatic on a private virtual X11 display, not physical keyboard
navigation or Sway. `qa/webview/results.json`, per-launch logs and synthetic PNGs
are current evidence; capture and Now screenshots were visually inspected.
The temporary service/profile are removed afterwards; production `.data` is
never opened by this harness. The normal executable is rebuilt without the QA
feature after checks. No broad command/filesystem IPC is exposed by the shell.

Existing browser suites rerun after the close hook: isolated UI 14 passed
(explicit transport/storage doubles); native Chrome 22 passed (real HTTP,
IndexedDB/Blob, service worker and injected failures). Neither suite confers
all Chrome offline/fault behavior on WebKit. Historical optional speech/model
tests use doubles and do not establish actual inference quality or latency.
The documentation bundle's 45 manifest entries still verify unchanged.

During development, the first QA attempt incorrectly accessed module-private
state; the next contained malformed synthetic PNG base64 outside the error
handler. The harness now uses DOM/real HTTP/native IndexedDB, valid image data
and error reporting inside its guard. A compile-time GTK dialog string-type
error was also corrected. Virtual-display logs retain portal/FUSE/GTK-theme
warnings; passing core checks does not validate portals or device permissions.

Not validated: physical Sway minimize/restore, OS clipboard/keyboard/IME,
microphone/camera/notification delivery, file picker/export dialogs, companion
window integration, Windows/macOS, installation, cloud sync, model behavior
or RAM/CPU/battery targets on the i7-1270P. No Slint editor prototype or Slint
versus Qt/QML comparison is implemented. Rust remains the desktop infrastructure
direction; a future UI choice must pass editor/desktop gates before replacing
the working app. Exact commands/changed files and next steps: [DESKTOP.md](DESKTOP.md).

## Retired Qt/QML prototype · historical results, not current client

Desktop baseline: 62 Python tests passed before desktop code changes (5.07s).
Post-change: 62 passed (3.38s), one existing dependency deprecation warning.
Rust API unit tests: 3 passed. The explicit integration test passed against
a temporary real HTTP service: capture replay, note editing/original retention,
stale-version rejection, manual priority, task-field preservation and pinned
focus. No model worker was started. Ordinary Cargo tests ignore this live test;
the QA harness explicitly opts it in with disposable endpoint/token variables.

The compiled Rust/CXX-Qt 0.10 / Qt Minimal 6.10.0 client passed offscreen QML
checks against that real service. These drive programmatic control signals
and property edits, not physical mouse/keyboard input. They cover capture,
versioned note saves, original viewer, conflict-draft retention, same-response
explicit reload, dirty-note capture guard, manual priority, pinned focus,
Qt minimize/restore state and an unsaved-close guard. Synthetic screenshots
are in `qa/rust-desktop/`; inspected Now and conflict-editor views retain the
minimal navigation/layout without observed overlap. No production `.data`
was opened. The harness stops and removes the disposable database afterwards.

Web regressions rerun: isolated UI 14 passed (storage/transport doubles);
native Chrome persistence 22 passed (real HTTP/IndexedDB/Blob/service worker,
explicit injected failures). No web/backend source changes were needed.
Rust formatting and Python QA compile checks passed. Exact commands, changed
files and remaining gaps are in [DESKTOP.md](DESKTOP.md).

Development issues resolved: sandbox sockets/network required test permission;
gold failed to resolve CXX-Qt initializer archives, so Linux builds select lld;
runtime loaded an older system Qt until an SDK library path was supplied;
QML descendant `state` shadowed the window snapshot until references were
qualified. Screenshot capture was corrected to use a QML-owned scene, dialog
control lookup searches popup content, and QA explicitly closes its window
after testing the close guard. These harness fixes do not establish physical
compositor behavior. Unique reply IDs fix a real same-response notification
issue in the Rust/QML bridge, covered by the UI check.

No claim of laptop RAM/battery/latency, model accuracy, Sway monitor/workspace
behavior, Windows build, Android, installer, OS notifications or cloud sync.
The desktop's memory-only drafts/outbox gap remains explicit; existing browser
persistence coverage does not confer desktop crash recovery. Rust/Cargo 1.93.1
was used. PySide6 development packages were installed during the superseded
Python/Qt exploration; the Rust client neither imports nor depends on PySide6.

## Newly executed continuation checks · 2026-10-08

| Check | Result and boundary |
|---|---|
| Baseline Python | 62 passed, 1 dependency deprecation warning, 5.21s. Disposable pytest directories, real server and child-process integration. |
| Baseline isolated UI | 14 passed. Actual assets/API, explicit storage/transport doubles. |
| Post-change Python | 62 passed; see `qa/continuation/python-post-change.txt` for exact output. |
| Post-change isolated UI | 14 passed, no uncaught JS errors. `qa/continuation/browser-adapter/browser-results.json`. |
| Native browser persistence | 22 passed on three consecutive final runs; `qa/continuation/native-storage/results.json`. Real loopback HTTP, Chrome, IndexedDB/Blob bytes, service worker and persistent browser profile. |
| Parse/compile | `node --check` for app/companion/service worker; `compileall` for backend/helpers/launcher and both browser harnesses. Passed. |
| Visual inspection | Native-harness desktop/phone storage-error screenshots inspected. Synthetic text; phone-width Chrome viewport, not Android hardware. Original approved images inspected and preserved. |

Native coverage includes no notebook ingestion before Save; exact text and
attachment recovery after browser restart; offline shell/draft/outbox recovery;
atomic rollback on a thrown reset failure and a native transaction abort after
request success; persistent local failure UI and retry; lost acknowledgment
replay without duplicate notes after browser/server restart; manual low priority,
pinned focus and due reminder survival; immediate Save before debounce; storage
unavailability at boot and retry of failed opening without reload. An older draft
commit is also checked against newer input: it must not mark the newer draft as
saved before that draft's own commit completes.

Faults are explicit test injections. No physical disk-full/power-loss or browser
eviction check was performed. Browser storage checks use native Chrome storage,
but speech/model tests in the Python suite still use doubles. No microphone,
notification delivery, PWA installation, Sway hardware, target laptop, Android,
Windows/macOS device, cloud sync or new resource benchmark was exercised.

Environment: Python 3.12.3, pytest 9.0.2, Playwright 1.63.0, Google Chrome
154.0.8037.92, Node 18.19.1 on Linux. Optional QA dependencies were installed
in the workspace `.venv`; no browser or model was downloaded/installed.

Initial test commands failed because pytest was absent, then local sockets were
blocked by the sandbox (TestClient stalled; real socket creation returned EPERM).
The suites passed with local-test execution permission. Browser skill discovery
returned no connected browser; headless Chrome was used for QA. Early native
reruns raced startup/reconnect and queried the note before receiving the upload
acknowledgment; follow-up queries found the exact note. The corrected harness
waits for the real 201 response and matching capture ID. See failure excerpts in
`qa/continuation/diagnostics.txt`. No production change was needed for that race.
Further harness corrections wait for the failed-request event rather than a
transient connection label, and use function predicates compatible with the
unchanged app CSP. The production draft-status race found in code review was
fixed separately and is covered by the additional native check.

The initial existing browser harness refreshed four top-level `qa/*.png` baseline
screenshots. It now writes to a separate continuation output directory by default.
Historical reports/artwork under `docs/Noema-Documentation/` were not edited.
The original source manifest is retained as the starting identity; it intentionally
does not describe the modified continuation files.

## Original release report (historical)

Date: 2026-10-08. These results describe the source distributed with this report, not a running installation on the user's devices.

## Executed

| Check | Result |
|---|---|
| Python backend/helper suite | **62 passed**, no failures. Raw output: `qa/backend-tests.txt`. |
| Real-process integration | Included in the 62: a disposable actual HTTP server, task-scoped token, actual child command, exit 0 → review, exit 7 → failed, task remains unfinished, integration/admin tokens absent from child environment. |
| Frontend interaction harness | **14 passed**, no uncaught UI JavaScript errors. `qa/browser-results.json` / `qa/browser-tests.txt`. |
| JavaScript parse checks | `node --check` passed for `app.js`, `companion.js`, `sw.js`. Node was used for QA, not to run the product. |
| Python compile checks | `compileall` passed for package, tools and launcher. |
| Interface inspection | Inspected actual desktop and phone screenshots from the harness. Small cat renders; text/control hierarchy and phone bottom navigation show no observed overlap in inspected views. This is not a full accessibility/browser audit. |
| Backend idle sample | One disposable empty backend, models off, 10 seconds. Approximately 117 MiB RSS and 0.2% of one CPU core. See `qa/resource-results.json` for exact values and limits. |

## Backend/helper coverage

The suite covers task persistence and optimistic versions; invalid/missing/cyclic dependencies; automatic priorities and persistent manual overrides; future-start/dependency/estimate/agent availability filtering; notes never implicitly becoming tasks; immutable originals; capture idempotency; upload validation and failure cleanup; revisions/restore and lexical search; reminders due/snooze/dismiss/restart; agent duplicate/out-of-order/reused-ID handling and stale/terminal states; task-scoped token access and revocation; observation off/pinned focus/rule matching; queued AI success/failure/concurrent edit recovery using test doubles; export omissions; Sway tree parsing for outputs/workspaces/floating nodes and observer debounce; outbox retry; rejection of plaintext remote helper endpoints; and real wrapper subprocess execution.

Model response validation/recovery tests use fixtures. They are not a quality evaluation of a language or speech model.

## Browser harness boundary

Ordinary Chromium navigation to the local server returned `ERR_BLOCKED_BY_ADMINISTRATOR` in this environment. The restriction was not disabled or bypassed.

Instead, `qa/browser_check.py` mounts the **actual** HTML/CSS/JavaScript in an isolated page and explicitly bridges frontend fetches to a **real** disposable Python server. Because an opaque page origin cannot provide normal persistent browser storage, IndexedDB and localStorage use explicit in-memory test doubles. The harness also excludes native service-worker registration.

The 14 checks exercise UI behavior with this boundary: render real API state; task creation; priority control; multipart image/text capture; note edit/history/original recovery; queued capture and reconnect delivery; untrusted HTML rendering; phone overview/capture and tablet layout without horizontal overflow; no uncaught errors.

They do **not** establish that real browser IndexedDB, service workers, microphone permissions, audio recording devices, OS notifications, PWA installation or multi-device synchronization work end-to-end. Separate hardware/browser tests remain required.

Screenshots contain synthetic example tasks created by the harness. They do not show actual active work, user desktop observation or live agents.

## Resource measurement boundary

`qa/resource_check.py` starts a new backend with no clients/models and an empty disposable database. It samples process RSS and CPU-time deltas for ten seconds. This is a short **build-container, backend-only** sample, not a benchmark on the i7-1270P. It excludes the browser, native companion, Sway polling, active clients, AI inference, media decoding, database scale, battery use and other running agents. CPU figures near zero are limited by OS accounting resolution.

The previously discussed full minimized-process memory target has not been validated. The backend alone is above 100 MiB in this environment; do not advertise a sub-100-MB whole application on the strength of these results.

## Environment

Python 3.13.5 on Linux, Node v22.16.0 for JavaScript syntax checks, system Chromium plus Playwright for the isolated UI harness. Tested core packages: FastAPI 0.128.2, Uvicorn 0.48.0, Pydantic 2.13.5, python-multipart 0.0.29, HTTPX 0.28.1, pytest 9.0.2. Dependency versions are pinned in the package. Optional faster-whisper and a local model were not installed/downloaded for this run.

## Not performed

- Installing or running on the user's laptop, macOS, Windows, Android, real Sway or multiple physical monitors.
- Live Ollama inference, transcription accuracy/speed, video/screenshot interpretation.
- Native desktop overlay size/placement/permission validation or automatic minimize integration.
- Secure hosted deployment, account pairing, encrypted cloud storage, remote push notification delivery.
- Full security audit, load testing, resilience under disk-full/power-loss conditions, native accessibility evaluation, or indefinite background monitoring.

The source contains these boundaries explicitly so the next development session can build on verified behavior rather than treat the concept screens as already implemented features.

## Archive/relocation check

The initial source archive passed ZIP integrity and SHA-256 file-manifest checks. It was extracted into a fresh directory whose path contains spaces, and the complete backend/helper suite passed again: **62 tests**. This reused already-installed build-environment dependencies rather than performing a new internet installation. The subsequent final archive adds this report and its machine-readable result without changing application code. See `qa/archive-check.json`.
