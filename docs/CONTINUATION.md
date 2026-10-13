# Capture recovery continuation · 2026-10-08

This is the historical capture-recovery slice. Current milestones and source
identity live in [PROGRESS.md](PROGRESS.md). At the React + Electron cutover the
`public/app.js` storage code described below was ported to `web/src/local/db.ts`,
`web/src/local/drafts.ts`, `web/src/local/outbox.ts` and `web/src/local/taskDraft.ts`
with the same database (`noema-local-v1`, version 1), stores, record shapes,
atomic Save transaction and serialised draft writes. The Electron close
checkpoint preserves these semantics (see [DESKTOP.md](DESKTOP.md)). File
references below are historical.

The next unmet local daily-use slice is implemented: atomic browser queue/draft
commit and visible, retryable local-save failure. This is an unreleased
continuation of the actual v0.1.0 source, not a reconstructed v0.2.0 or a UI redesign.

## Source and preserved data

Noema is untracked inside the parent `/home/p4nic/code` Git repository. Its HEAD
is `2865fba0481d7cf34aa0c22fc6fa1ab62fc9fbbd`; that is not a Noema source revision.
Before editing, `sha256sum -c SHA256SUMS` verified all 47 files of the original
manifest (starting SHA256
`062799a885090fdce1c6b1b4685331e3368e345a7342e1c36947a74465e60bbe`). That
manifest was historical; `SHA256SUMS` was regenerated at the React + Electron
cutover as the tracked-file manifest.

Read the actual prompts/handbook under `docs/Noema-Documentation/`, current
README/architecture/security/status/reports, tests and relevant source. The
approved desktop/phone/tablet images were inspected as references and preserved.
`docs/SCREEN_AWARENESS.md`, `noema/vision.py` and `tools/sway_screen.py` are absent;
v0.2.0 screen reports are historical evidence only.

Existing `.data` and credentials were not used as test data, reset or migrated.
The server database schema and browser database `noema-local-v1` version 1 are
unchanged. Tests use temporary databases/profiles and synthetic content. Existing
original notes, manual task priorities, focus pins and optional serialized
CPU-first inference remain intact. No model is required by the new code.

## Changed files and behavior

- `public/app.js`: shared transaction helper; atomic queue insertion and draft
  reset; serialized draft writes; cancelled debounce on Save; capture controls
  held during local commit; retryable database-open failures; visible pending/
  committed/error draft states guarded against newer input; local retry control;
  nonfatal storage failure at
  startup; offline wording no longer guarantees a failed local save.
- `qa/native_storage_check.py`: native loopback HTTP/Chrome/IndexedDB/Blob/service
  worker and browser/server restart checks. Injected open/quota/transaction and
  lost-response faults; no production test hooks.
- `qa/browser_check.py`: adapter supports the new multi-store calls and queue
  insertion; outputs now default to `qa/continuation/browser-adapter` and clearly
  label the isolated test boundary.
- `README.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/BUILD_STATUS.md`,
  `docs/TEST_REPORT.md`, this file: running instructions, invariants, actual
  source identity, current evidence, limitations and next step.
- `qa/continuation/`: new baseline/post-change Python output, diagnostic excerpts,
  generated browser result JSON and synthetic screenshots. The first baseline
  run of the original harness also refreshed `qa/desktop.png`, `qa/mobile.png`,
  `qa/capture-desktop.png` and `qa/capture-mobile.png`; subsequent runs have a
  separate output directory. Archived documentation evidence was not edited.

Dependency setup also created standard `noema_local.egg-info/` editable
installation metadata and updated the workspace `.venv`; these are generated
development artifacts, not a native application installation or runtime redesign.

## Exact setup/test commands run

Existing venv was Python 3.12.3 with core dependencies but no pytest. These
installed development/QA packages in that venv, not on the target laptop:

```bash
.venv/bin/pip list
.venv/bin/pip install -e '.[test]'
.venv/bin/pip install playwright
sha256sum -c SHA256SUMS
sha256sum SHA256SUMS
mktemp -d /tmp/noema-baseline-XXXXXX
```

The generated directory was `/tmp/noema-baseline-sYo3m7`. Baseline ran before
application edits; final tests used new disposable directories:

```bash
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-baseline-sYo3m7/unrestricted
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-baseline-sYo3m7/post-change
CHROMIUM_PATH=/usr/bin/google-chrome .venv/bin/python qa/browser_check.py
CHROMIUM_PATH=/usr/bin/google-chrome .venv/bin/python qa/native_storage_check.py
for noema_attempt in 1 2 3; do CHROMIUM_PATH=/usr/bin/google-chrome .venv/bin/python qa/native_storage_check.py || break; done
for noema_attempt in 1 2 3; do CHROMIUM_PATH=/usr/bin/google-chrome .venv/bin/python qa/native_storage_check.py || exit; done
node --check public/app.js
node --check public/companion.js
node --check public/sw.js
.venv/bin/python -m compileall -q noema tools run.py qa/browser_check.py qa/native_storage_check.py
```

Local socket tests required execution permission outside the socket-restricted
sandbox. Initial sandbox failures/timeouts and the corrected native-harness
assertion/event/CSP corrections are retained in `qa/continuation/diagnostics.txt`. The Browser
skill found no connected browser; headless Chrome was used for UI QA.

For repeatable base-app startup, use an explicitly chosen data directory:

```bash
.venv/bin/python run.py --data-dir /path/to/private/noema-data --open
```

That is a handoff command, not a claim it was run against the user's data.
No migration is needed. Back up the complete data directory with the server
stopped before upgrading. Keep tokens/backups private. The top-level
`SHA256SUMS` is the regenerated tracked-file manifest (see
[PHYSICAL_SWAY_ACCEPTANCE.md](PHYSICAL_SWAY_ACCEPTANCE.md)); the 47-file original
is historical.

## Evidence and limits

Baseline: 62 Python tests (5.21s, one dependency deprecation warning), 14 isolated
UI checks. Post-change: 62 Python tests (8.55s, same warning), 14 isolated UI
checks. Native persistence: 22 checks passed on three consecutive final runs,
with no uncaught JS errors. Parse/compile checks passed. The documentation
bundle's 45-file manifest was reverified from `docs/Noema-Documentation`;
all approved artwork and archived evidence still match.

The native suite uses actual headless Google Chrome 154.0.8037.92, Playwright
1.63.0, native storage, actual service-worker offline loading and persistent
profile restart. It verifies exact attachment bytes, no notebook ingestion until
Save, aborted transactions, explicit failure/retry, lost acknowledgment replay,
manual low priority/pin and durable reminder survival. Faults are injected;
physical disk-full/power-loss and browser eviction are untested. The older UI
suite still uses transport/storage doubles. Model fixtures establish recovery
contracts, not technical speech/cleanup quality.

Actual desktop/phone-width recovery screenshots are under
`qa/continuation/native-storage/`. Phone width is not Android hardware. No target
i7-1270P benchmark, real microphone, Sway monitor, Windows/macOS/Android device,
PWA installation, closed-browser notification, cloud sync or deployment was
demonstrated. No browser or model download was needed.

## Remaining gaps and next concrete step

The shared browser draft can still conflict across tabs. A crash inside the
350ms text debounce window can lose the newest unsaved keystrokes. Active audio
is still held in memory until Stop; long-input chunking and tested import/restore
are absent. Do not call portable export a complete restore solution.

Next implementation: checkpoint unfinished recording chunks locally, restore an
interrupted recording with an explicit review/recovery state, and keep all audio
out of the notebook/server until Save. Test transaction/quota failures and
interruption without silently dropping chunks. Validate the browser/microphone
on the actual laptop and Android separately; only then evaluate CPU speech on
real technical recordings. Secure sync and native-shell delivery remain later
milestones with their own authorization/device gates.

Current order (see [PROGRESS.md](PROGRESS.md)): physical Sway acceptance (Stage A)
first, then AI-assigned priority; recording checkpoints follow.
