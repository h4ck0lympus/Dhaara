# Phase 6 — Rename Noema → Dhara Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the product and every identifier derived from "Noema" to "Dhara" (decision 21C: full rename including the Python package and the DB/cookie/header names, with compatibility shims and migration tests; 22C: "Dhara" only, धारा exactly once, in the README) without losing any user data or breaking an existing install, then prove it with grep gates and three consecutive clean runs of the full gate. The merge is **not** part of this plan.

**Architecture:** The shims are the only new runtime code: `dhara/env.py` and `electron/src/env.ts` (`DHARA_*` with a `NOEMA_*` fallback), the `noema` shim package, the cookie/marker dual-read in `dhara/server.py`, `web/src/local/migrate.ts` (copy-then-delete IndexedDB migration run before any draft store opens the database), the service-worker purge of both cache prefixes, and the Electron profile-directory move with fallback, and the notebook-file move `noema.sqlite3` → `dhara.sqlite3` in `dhara/store.py` (spec §4.9, owner decision 27B). Everything else is one mechanical, grep-driven sweep. Every line that keeps an old name on purpose carries one of two markers — `rename-shim:` (compatibility code, removed by the dated follow-up) or `rename-keep:` (permanent; none remain after owner decision 27B) — and `tests/test_rename_gate.py` fails on any other `noema`/`Noema`/`NOEMA` outside an explicit path allowlist. The sweep (Task 9) and the gate (Task 11) share that allowlist and those markers, so a sweep can never rename inside a shim, a marker line or an archive.

**Tech Stack:** Python 3.11+ (`.venv/bin/python`, pytest), TypeScript 5.9 / Vitest 5.0.3 / Playwright 1.64 for `web/` and `electron/` (Node 22.23.3 through the npm scripts), fake-indexeddb 6.2.5, `git mv`, perl for the sweep.

**Spec:** `/home/p4nic/code/noema/docs/superpowers/specs/2026-10-12-rename-dhara-design.md` (binding). Existing names, files and fixtures: `/home/p4nic/code/noema/docs/superpowers/specs/2026-10-10-react-electron-migration-design.md` (§4.2 boot/401, §4.4 IndexedDB, §6.2 SW, §6.3 profile and close contract, §6.4 lifecycle) · **Contract:** `/home/p4nic/code/noema/docs/superpowers/plans/2026-10-10-react-electron/00-contract.md` (§1.2 file tree, §1.3 events/globals, §4.1 `local/db.ts`, §8.2 Electron APIs, §8.3 Python managed mode, §9.1–9.2 fixtures). Product behaviour: `docs/Noema-Handbook.md` (binding; the rename changes no behaviour).

Phase 5 (cutover) may still be executing while this plan is written, so **no step relies on a line number or on exact doc text**: every edit is located by grep and verified at execution time. Where a step says "the line containing X", there is exactly one such line; the step's verification command proves it.

## Prerequisites

- Cutover plan `06-cutover.md` Tasks 1–12 complete: `public/` and `desktop/` deleted, docs rewritten, `SHA256SUMS` regenerated, tags `cutover-gate` and `cutover-docs-baseline` exist. Cutover Task 13 (the merge) **not** done; this plan ends with the branch unmerged.
- Branch `feat/react-electron`; the tracked tree is clean; `web/node_modules`, `electron/node_modules` and `.venv` are installed; `npm --prefix web run build` succeeds.

- [ ] **Preflight (run before Task 1; stop if any line disagrees)**

```bash
cd /home/p4nic/code/noema
git rev-parse --abbrev-ref HEAD                      # feat/react-electron
git status --porcelain --untracked-files=no          # empty
git tag -l cutover-gate cutover-docs-baseline        # both names printed
test ! -e public -a ! -e desktop && echo trees-gone
sha256sum -c --quiet SHA256SUMS && echo hashes-ok    # cutover Task 12 ran
git merge-base --is-ancestor HEAD master && echo MERGED-STOP || echo unmerged
git tag rename-base                                  # Task 11 proves the archives are byte-identical to this
```

## Global Constraints (verbatim from the rename spec §3 and §4)

§3 naming rules:

| Kind | Rule |
|---|---|
| Brand | `Dhara` |
| Python package | `dhara/` |
| Env vars | `DHARA_*` |
| Cookie | `dhara_session` |
| Request marker | `X-Dhara-Request` |
| IndexedDB | `dhara-local-v1` (same version 1, same stores and record shapes) |
| SW cache | `dhara-shell-<buildhash>` |
| Workspace lock | `.dhara-service.lock` |
| Profile path | `$XDG_DATA_HOME/dhara/electron`, default `~/.local/share/dhara/electron` |
| DOM events / globals | `dhara:*`, `__dharaCheckpointCloseReady`, `__dharaField` |
| Package names | `dhara-local`, `dhara-web`, `dhara-desktop` |
| Test fixtures | `dhara: DharaServer` |
| Electron stderr prefix | `Dhara: <message>` |
| QA env | `DHARA_QA_*` |

"Case rules: `Dhara` in prose and titles; `dhara` in identifiers; `DHARA` in env vars. Never "DHARA" in prose, never "dhara" at sentence start."

§4 shims (kept for one release; each removed by a dated follow-up):

- §4.1 "Each read goes through one helper: `env('DATA_DIR')` returns `DHARA_DATA_DIR`, else `NOEMA_DATA_DIR` (logging one deprecation line per process when the old name is used), else the default. Python: `dhara/env.py`; Electron: `electron/src/env.ts`. The managed-launch environment stripping removes BOTH prefixes. `tools/` and `qa/` use the same helper."
- §4.2 "The server sets `dhara_session` on login and reads `dhara_session`, falling back to `noema_session`. An old cookie keeps a user logged in until it expires (14 days); the next login or `POST /api/session` refresh writes the new name and clears the old one. The browser/Electron profile is untouched."
- §4.3 "`protect()` accepts `X-Dhara-Request: 1` or `X-Noema-Request: 1` for cookie-authenticated non-GET requests. The web client, `tools/client.py` and `tools/agent.py` send the new header only."
- §4.4 "On boot, before the draft store loads, `local/migrate.ts` runs once: 1. If `dhara-local-v1` has any record, do nothing. 2. Else if `noema-local-v1` exists: open it read-only, copy every `kv` entry and every `outbox` record (Blobs included) into `dhara-local-v1` inside one readwrite transaction per store (`add`, so a half-done earlier run cannot duplicate), then delete `noema-local-v1` only after both transactions committed. 3. Any failure leaves BOTH databases as they were and shows "Local data could not be migrated; keep this page open and retry" (existing retry pattern); the old DB is never deleted on failure. Capture ids are preserved, so a queued capture uploads once with its original id. `onblocked` (another tab holding the old DB) reports "Close other Dhara tabs"."
- §4.5 "New prefix `dhara-shell-<hash>`; `activate` deletes every `noema-shell-*` and every other `dhara-shell-*` cache. The upgrade E2E seeds a `noema-shell-v1`-controlled page and asserts takeover."
- §4.6 "On startup, before `setPath('userData')`: if the new profile directory does not exist and the old one does, rename the directory (same filesystem; atomic). If rename fails, keep using the old path and log one line. The single-instance lock follows the path."
- §4.7 "`.dhara-service.lock`. An old `.noema-service.lock` in a workspace is ignored (stale lock files are harmless; both shells that used it are gone or renamed)."
- §4.8 "`noema/` → `dhara/`. A one-file shim package `noema/__init__.py` re-exports `dhara` with a `DeprecationWarning` so external scripts (`from noema.server import create_app`) keep working for one release; `tools/` and `qa/` are updated to `dhara`."
- §4.9 (owner decision 27B) "Before the store opens the database: if `<data>/dhara.sqlite3` does not exist and `<data>/noema.sqlite3` does, and neither `noema.sqlite3-wal` nor `noema.sqlite3-shm` exists (a clean close), rename `noema.sqlite3` → `dhara.sqlite3` (same directory; atomic). If the side files exist or the rename fails, keep opening `noema.sqlite3` and log one line; the next clean start retries. If both files exist, never move or delete anything — open `dhara.sqlite3` and log that the old file was left in place."
- §1 scope: the repository directory, branch names, commit history, `docs/Noema-Handbook.md`, `docs/Noema-Documentation/` and `experiments/ui-ab/` are untouched. "README states "Dhara (formerly Noema; the product handbook still uses the old name)"."
- Owner rules: commit messages are ONE line, no body, no trailer; `git add <exact paths>`; TDD; explicit over clever; DRY.

## Deviations from the letter of the spec (same guarantees; owner may reverse)

1. **Task order.** The Python package move runs first (Task 1) and the env helpers second (Task 2), because `dhara/env.py` must live in a `dhara/` directory that `git mv noema dhara` creates. The suggested order had them swapped.
2. **§4.4 step 1.** `migrate.ts` treats "the old database does not exist" as the no-op condition and, when it exists, copies only the records whose keys are missing from the new database, in **one** readwrite transaction over both stores, then deletes the old database. The literal step 1 ("new DB has any record → do nothing") would strand a half-copied old database forever (one store committed, the other not; or a delete blocked by another tab) and the queued captures in it would never upload. Every §4.4 guarantee holds: `add` never overwrites, ids are preserved, an abort leaves the new database exactly as it was, the old database is deleted only after the commit and never on failure, the second boot is a no-op.
3. **localStorage keys** (`noema-notifications`, `noema-sidebar-collapsed`) are not in the spec inventory. They are renamed with a one-line read fallback each (Task 8), because losing the notifications opt-in would silently stop reminders on an existing install.
4. **`noema.sqlite3`** (the notebook file inside the data directory) was not in the inventory. The first draft kept it; owner decision 27B (spec §4.9) moves it with a guarded startup rename in Task 4: only after a clean close (no `-wal`/`-shm` side files), never over an existing `dhara.sqlite3`, and the old path with one log line on any failure (retried on the next clean start).
5. **Electron package name** becomes `dhara-desktop` (spec §3) with `"productName": "Dhara"`; the blanket sweep would have produced `dhara-electron`.

## Review Focus (five failure modes; each has a test in the owning task)

1. **A queued capture lost in the DB migration.** Owner: Task 5 — `migrate.test.ts` ("leaves both databases intact when the copy fails part-way", "completes a half-done earlier run without duplicating or overwriting", "reports Close other tabs when another connection blocks the delete") and the outbox E2E "Upgrade from the pre-rename build … uploads once with its id".
2. **A user logged out by the cookie rename.** Owner: Task 3 — `test_old_session_cookie_signs_in_until_login_rewrites_it` (old cookie authenticates; login writes `dhara_session` and clears `noema_session`; no cookie → 401).
3. **External agent scripts (or the owner's own shell) using `NOEMA_*` / the old header / `import noema`.** Owner: Task 2 (`test_env_prefers_dhara_then_noema_with_one_deprecation_line`, `env.test.ts`, every harness now strips BOTH prefixes so an exported `NOEMA_ACCESS_TOKEN` cannot leak into a test service through the fallback), Task 3 (`test_request_marker_dual_read`), Task 1 (`test_import_noema_warns_and_exposes_dhara`).
4. **The profile rename across filesystems.** Owner: Task 7 — "keeps using the old path and logs one line when the rename fails" (EXDEV stub) and "never moves over an existing new profile".
5. **A sweep that renames inside a compat identifier or inside the archives.** Owner: Task 9 (the sweep skips the allowlisted paths and every marker line, and `test_no_old_name_outside_the_allowed_set` is RED before and GREEN after) and Task 11 (`git diff --quiet rename-base -- <archives>` and `test_marker_lines_are_listed_for_the_follow_up`).

## Markers and the allowed set (defined once, in `tests/test_rename_gate.py`, Task 9)

- `rename-shim: <why>` on any line that keeps an old name for compatibility. `git grep -n 'rename-shim:'` is the dated follow-up's removal checklist.
- `rename-keep: <why>` on a permanent old name (none remain after owner decision 27B; the marker stays defined so the gate keeps recognising it).
- Allowed paths (never swept, never gated): `docs/Noema-Documentation/`, `docs/Noema-Handbook.md`, `docs/superpowers/`, `experiments/`, `noema/` (the shim package), `dhara/env.py`, `electron/src/env.ts`, `electron/test/env.test.ts`, `web/src/local/migrate.ts`, `web/src/local/migrate.test.ts`, `web/e2e/v1/sw.js` (the historical v1 worker), `tests/test_shims.py`, `tests/test_rename_gate.py`, `SHA256SUMS`.
- Allowed tokens anywhere: `Noema-Handbook`, `Noema-Documentation`, `formerly Noema`, `/tmp/noema-` (historical scratch paths in recorded commands), `share/noema/webview` and `share/noema-dev` (real pre-rename directories named by the rollback notes), `/code/noema` (the repository directory and the cutover backup beside it, `/home/p4nic/code/noema-cutover-backup/`, which `docs/PROGRESS.md`'s rollback copies from: real paths on the owner's disk, out of scope by spec §1).
- Allowed docs sections: from a `## … Compatibility with Noema …` heading to the next `## ` heading (Task 10 writes these in `docs/DESKTOP.md` and `docs/SECURITY.md`).

## Identifier inventory (what each task renames; grep-verified in that task)

| Task | Old → new | Where |
|---|---|---|
| 1 | `noema/` → `dhara/`; `from noema.x import` → `from dhara.x import`; pyproject `noema-local` → `dhara-local`, `packages = ["dhara", "noema"]` | `dhara/*`, `run.py`, `tests/test_core.py`, `tests/test_managed_service.py`, `tests/test_task_capture.py`, `tests/test_cutover.py`, `qa/now_ui_check.py`, `qa/sway_check.py`, `electron/test/fixtures/fake_service.py`, `web/e2e/server.ts` (SERVE_DIST) |
| 2 | `os.getenv('NOEMA_X')` → `env('X')`; `STRIPPED_ENV` under both prefixes; `NOEMA_ELECTRON_TEST*` read through `env()`; harness strips of both prefixes | `dhara/server.py` (DATA_DIR, ACCESS_TOKEN, MODEL, OLLAMA_URL, SPEECH_MODEL, ALLOWED_HOSTS), `dhara/worker.py` (ALLOW_REMOTE_MODEL), `dhara/desktop_service.py`, `run.py`, `tools/client.py` (TOKEN), `tools/doctor.py`, `tools/agent.py`, `qa/browser_check.py`, `qa/native_storage_check.py`, `qa/now_ui_check.py`, `qa/resource_check.py`, `qa/sway_check.py`, `tests/test_core.py`, `tests/test_helpers.py`, `tests/test_managed_service.py`, `electron/src/lifecycle.ts`, `electron/test/service-parity.test.ts`, `web/e2e/server.ts`, `web/e2e/serving.spec.ts` |
| 3 | `noema_session` → `dhara_session` (+ fallback); `x-noema-request` → `x-dhara-request` (+ fallback); test fixture header | `dhara/server.py`, `tests/test_core.py` |
| 4 | `.noema-service.lock` → `.dhara-service.lock`; `noema.sqlite3` → `dhara.sqlite3` (guarded startup move, spec §4.9); the two fixtures that name the file | `dhara/desktop_service.py`, `dhara/store.py`, `tests/test_shims.py`, `web/e2e/db.ts`, `tests/test_task_capture.py` |
| 5 | `noema-local-v1` → `dhara-local-v1` everywhere the **app** database is opened; `noema-local-v1` stays only in `migrate.ts` and the legacy seed | `web/src/local/db.ts`, `db.test.ts`, `web/src/fakeIndexedDb.test.ts`, `web/e2e/fixtures.ts`, `faults.ts`, `screenTest.ts`, `harness.spec.ts`, `outbox.spec.ts`, `electron/e2e/fixtures.ts`, `scenario.spec.ts`, `close.spec.ts`, `qa/native_storage_check.py` |
| 6 | `noema-shell-` → `dhara-shell-` (+ purge of both) | `web/scripts/sw-precache.mjs`, `web/public/sw.js`, `web/src/buildScripts.test.ts`, `web/e2e/sw.spec.ts`, `tests/test_core.py` (`make_dist`) |
| 7 | `~/.local/share/noema/electron` → `…/dhara/electron` (+ move); `Noema:` stderr prefix → `Dhara:`; window title; `noema-electron` → `dhara-desktop` + `productName` | `electron/src/profile.ts`, `electron/test/profile.test.ts`, `electron/src/main.ts`, `electron/e2e/managed.spec.ts`, `electron/package.json`, `electron/package-lock.json` |
| 8 | `noema:*` events and IPC channels → `dhara:*`; `__noemaCheckpointCloseReady`, `__noemaField`, `__noemaReportCsp`, `__noemaFetchRules`, `__noemaHoldGates`, `__noemaHoldRelease`, `__noemaHoldSettled<id>` → `__dhara…`; `noemaStartup` → `dharaStartup`; `openNoemaDb` → `openDharaDb`; `noema-test-checkpoint` → `dhara-test-checkpoint`; `noema-notifications`, `noema-sidebar-collapsed` → `dhara-…` (+ read fallback) | `web/src/events.ts`, `globals.d.ts`, `shell/checkpoint.ts`+test, `shell/notifications.ts`+test, `shell/Nav.tsx`+test, `dialogs/Settings.tsx`, `ui/BackgroundField.tsx`+test, `state/queries.test.tsx`, `web/e2e/fixtures.ts`, `faults.ts`, `harness.spec.ts`, `checkpoint.spec.ts`, `terrain.spec.ts`, `notifications.spec.ts`; `electron/src/protocol.ts`, `preload.cts`, `startup-preload.cts`, `close.ts`, `electron/static/startup.js`, `electron/test/preload.test.ts`, `electron/e2e/scenario.spec.ts`, `close.spec.ts` |
| 9 | Everything left: `Noema` → `Dhara` (brand text, titles, manifest, `S` strings, `NoemaServer`/`startNoema`/`launchNoema` → `DharaServer`/`startDhara`/`launchDhara`, fixture `noema:` → `dhara:`), `NOEMA_` → `DHARA_` (remaining literals, QA vars, messages), `noema` → `dhara` (temp-dir prefixes, `noema-web`, `noema.json`/`noema-export.zip`, GTK class names, comments) | every tracked text file outside the allowed set; marker lines and `noema.sqlite3` untouched |
| 10 | README धारा line, compatibility sections, parity-map/handbook-trace cited test titles, `SHA256SUMS` | `README.md`, `docs/DESKTOP.md`, `docs/SECURITY.md`, `docs/superpowers/specs/parity-map.md`, `handbook-trace.md`, `SHA256SUMS` |

---

### Task 1: Python package `noema/` → `dhara/` with a deprecation shim

**Files:**
- Move (`git mv`): `noema/__init__.py`, `noema/desktop_service.py`, `noema/models.py`, `noema/server.py`, `noema/store.py`, `noema/task_capture.py`, `noema/worker.py` → `dhara/`
- Create: `noema/__init__.py` (shim), `tests/test_shims.py`
- Modify: `pyproject.toml`, `run.py`, `tests/test_core.py`, `tests/test_managed_service.py`, `tests/test_task_capture.py`, `tests/test_cutover.py`, `qa/now_ui_check.py`, `qa/sway_check.py`, `electron/test/fixtures/fake_service.py`, `web/e2e/server.ts`

**Interfaces:**
- Consumes: every `dhara` module unchanged (same names, same signatures as contract §2 and §8.3).
- Produces: package `dhara`; shim package `noema` that warns once (`DeprecationWarning`) and aliases every `dhara` submodule as `noema.<name>`; pyproject `name = "dhara-local"`, `packages = ["dhara", "noema"]`.

- [ ] **Step 1: Write the failing shim test**

Create `tests/test_shims.py`:
```python
"""Rename shims (rename spec §4.1, §4.7, §4.8): the old names keep working for one release."""
import os
import sys

import pytest


def _forget(package):
    for name in [m for m in sys.modules if m == package or m.startswith(package + '.')]:
        del sys.modules[name]


def test_import_noema_warns_and_exposes_dhara():
    _forget('noema')
    with pytest.warns(DeprecationWarning, match="renamed 'dhara'"):
        import noema
    import noema.server
    import noema.desktop_service
    import dhara.server
    import dhara.desktop_service
    assert noema.server is dhara.server
    assert noema.server.create_app is dhara.server.create_app
    assert noema.desktop_service.workspace_lock is dhara.desktop_service.workspace_lock
    assert noema.__version__ == dhara.__version__
```

- [ ] **Step 2: RED**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_shims.py -q
```
Expected: `1 failed` — `Failed: DID NOT WARN. No warnings of type (<class 'DeprecationWarning'>,) were emitted` (today `import noema` is the real package, so the `pytest.warns` block exits without a warning; `import dhara.server` is never reached).

- [ ] **Step 3: Move the package and write the shim**

```bash
cd /home/p4nic/code/noema
git mv noema dhara
rm -rf dhara/__pycache__
mkdir noema
```
Create `noema/__init__.py`:
```python
"""Compatibility shim: the `noema` package was renamed `dhara` (rename spec §4.8).

`from noema.server import create_app` keeps working for one release and warns once.
Delete this package (and `"noema"` in pyproject `packages`) in the dated follow-up.
"""
import importlib
import pkgutil
import sys
import warnings

import dhara

warnings.warn("The 'noema' package was renamed 'dhara'; import dhara instead.", DeprecationWarning, stacklevel=2)
__version__ = dhara.__version__
for _module in pkgutil.iter_modules(dhara.__path__):
    globals()[_module.name] = sys.modules[f'noema.{_module.name}'] = importlib.import_module(f'dhara.{_module.name}')  # bind as an attribute too: import noema.server; noema.server
```

- [ ] **Step 4: Repoint every import (grep-driven)**

```bash
cd /home/p4nic/code/noema
git grep -l -E '\b(from|import) noema\b' -- '*.py' run.py '*.ts' ':!noema/__init__.py' ':!tests/test_shims.py' \
  | xargs perl -pi -e 's/\b(from|import) noema\b/$1 dhara/g'
git grep -n -E '\b(from|import) noema\b' -- '*.py' run.py '*.ts'
```
The word boundaries make `from noema.server`, the indented `from noema.desktop_service import managed` in `run.py`, the import inside the `-c` string of `tests/test_managed_service.py` (`'import ctypes; from noema.desktop_service import set_parent_death_signal; …'`) and the `SERVE_DIST` line of `web/e2e/server.ts` all flip; `noema_session`/`noema-local-v1` never match. Expected for the last command: nothing — `git grep` searches tracked files only, and the two files that import `noema` on purpose (`tests/test_shims.py` and the new shim `noema/__init__.py`) are untracked until Step 8.

- [ ] **Step 5: Package metadata and the editable install**

In `pyproject.toml` replace `name = "noema-local"` with `name = "dhara-local"` and `packages = ["noema"]` with `packages = ["dhara", "noema"]`. Then:
```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pip install -e . --no-deps -q && rm -rf noema_local.egg-info
cd /tmp && /home/p4nic/code/noema/.venv/bin/python -W error::DeprecationWarning -c 'import dhara.server' && echo dhara-importable
cd /tmp && /home/p4nic/code/noema/.venv/bin/python -c 'import noema.server; print(noema.server.__name__)'
```
Expected: `dhara-importable`, then `dhara.server` (preceded by the DeprecationWarning text on stderr is fine). `dhara_local.egg-info/` appears untracked like `noema_local.egg-info/` did; leave it.

- [ ] **Step 6: Keep the cutover scan honest**

In `tests/test_cutover.py`, the `SCANNED` list names `'noema'`. Replace that one entry with two lines:
```python
SCANNED = ['run.py', 'dhara',
           'noema',   # rename-shim: the one-file shim package
           'tools', 'tests', 'electron/src', 'electron/test', 'electron/e2e',
           'web/src', 'web/e2e', 'web/scripts']
```
(`grep -n "SCANNED = " tests/test_cutover.py` locates it; keep every other entry exactly as it is.)

- [ ] **Step 7: GREEN**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest -q
```
Expected: every test passes, including `tests/test_shims.py::test_import_noema_warns_and_exposes_dhara` and `tests/test_managed_service.py::test_stripped_env_matches_the_electron_owner_list` (it still reads `electron/src/lifecycle.ts`). Any failure is an import this step missed: `git grep -n 'noema\.' -- '*.py'` and fix.

- [ ] **Step 8: Commit**

```bash
cd /home/p4nic/code/noema
git add dhara noema/__init__.py pyproject.toml run.py tests/test_shims.py tests/test_core.py tests/test_managed_service.py tests/test_task_capture.py tests/test_cutover.py qa/now_ui_check.py qa/sway_check.py electron/test/fixtures/fake_service.py web/e2e/server.ts
git status --porcelain --untracked-files=no | grep -v '^[MRAD] ' ; echo "unstaged above (expect none)"
git commit -m "refactor: rename the noema package to dhara with a deprecation shim"
```

---

### Task 2: Env helpers — `DHARA_*` first, `NOEMA_*` fallback, both prefixes stripped

**Files:**
- Create: `dhara/env.py`, `electron/src/env.ts`, `electron/test/env.test.ts`
- Modify: `tests/test_shims.py`, `dhara/desktop_service.py`, `dhara/server.py`, `dhara/worker.py`, `run.py`, `tools/client.py`, `tools/doctor.py`, `tools/agent.py`, `qa/browser_check.py`, `qa/native_storage_check.py`, `qa/now_ui_check.py`, `qa/resource_check.py`, `qa/sway_check.py`, `tests/test_core.py`, `tests/test_helpers.py`, `tests/test_managed_service.py`, `electron/src/lifecycle.ts`, `electron/test/service-parity.test.ts`, `web/e2e/server.ts`, `web/e2e/serving.spec.ts`

**Interfaces:**
- Produces (Python): `dhara.env.PREFIX = 'DHARA_'`, `LEGACY_PREFIX = 'NOEMA_'`, `PREFIXES`, `env(name, default=None) -> str | None`, `strip(environment, names) -> environment`; `dhara.desktop_service.STRIPPED_NAMES` and `STRIPPED_ENV` (both prefixes).
- Produces (Electron): `PREFIX`, `LEGACY_PREFIX`, `STRIPPED_NAMES`, `STRIPPED_ENV`, `env(name, source = process.env, log = stderr) -> string | undefined`; `lifecycle.ts` re-exports `STRIPPED_ENV` and `managedPort(source)` reads through `env()`.
- Rule for the rest of the tree: **user-facing** names (`DATA_DIR`, `ACCESS_TOKEN`, `ALLOWED_HOSTS`, `MODEL`, `OLLAMA_URL`, `SPEECH_MODEL`, `ALLOW_REMOTE_MODEL`, `TOKEN`, `QA_OUTPUT`, `ELECTRON_TEST`, `ELECTRON_TEST_PORT`) are read through `env()`. Harness-internal names that the repository both sets and reads (`QA_URL`, `QA_PHASE`, `QA_DESKTOP_PID`, `QA_PRIVATE_RUNTIME`, `QA_COMPOSITOR_PID`, `QA_SOURCE`, `FAKE_*`, `KEEP_ME`) are plainly renamed by the Task 9 sweep.

- [ ] **Step 1: Failing Python tests**

Append to `tests/test_shims.py`:
```python
def test_env_prefers_dhara_then_noema_with_one_deprecation_line(monkeypatch, capsys):
    from dhara import env as helper
    monkeypatch.setattr(helper, '_warned', set())
    monkeypatch.setenv('DHARA_MODEL', 'new')
    monkeypatch.setenv('NOEMA_MODEL', 'old')
    assert helper.env('MODEL') == 'new'
    monkeypatch.delenv('DHARA_MODEL')
    assert helper.env('MODEL') == 'old'
    assert helper.env('MODEL') == 'old'
    assert capsys.readouterr().err == 'NOEMA_MODEL is deprecated; set DHARA_MODEL instead\n'
    monkeypatch.delenv('NOEMA_MODEL')
    assert helper.env('MODEL') is None
    assert helper.env('MODEL', 'default') == 'default'


def test_strip_removes_both_prefixes_and_nothing_else():
    from dhara.env import strip
    environment = {'DHARA_MODEL': 'a', 'NOEMA_MODEL': 'b', 'DHARA_KEEP': 'c', 'PATH': '/bin'}
    assert strip(environment, ('MODEL',)) is environment
    assert environment == {'DHARA_KEEP': 'c', 'PATH': '/bin'}


def test_managed_launch_strips_both_prefixes():
    from dhara.desktop_service import STRIPPED_ENV, STRIPPED_NAMES
    from dhara.env import PREFIXES
    assert PREFIXES == ('DHARA_', 'NOEMA_')
    assert set(STRIPPED_ENV) == {prefix + name for prefix in PREFIXES for name in STRIPPED_NAMES}
    assert {'DHARA_DATA_DIR', 'NOEMA_DATA_DIR', 'DHARA_ACCESS_TOKEN', 'NOEMA_ACCESS_TOKEN'} <= set(STRIPPED_ENV)
```

- [ ] **Step 2: RED (Python)**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_shims.py -q
```
Expected: `3 failed, 1 passed` — `ModuleNotFoundError: No module named 'dhara.env'` / `ImportError: cannot import name 'STRIPPED_NAMES'`.

- [ ] **Step 3: The Python helper**

Create `dhara/env.py`:
```python
"""Configuration reads: DHARA_<name>, else NOEMA_<name> (rename spec §4.1), else the default.

The NOEMA_ fallback is a one-release shim; the dated follow-up deletes LEGACY_PREFIX and the
fallback branch below, and nothing else needs to change.
"""
import os
import sys

PREFIX = 'DHARA_'
LEGACY_PREFIX = 'NOEMA_'  # rename-shim: read-only fallback for one release
PREFIXES = (PREFIX, LEGACY_PREFIX)
_warned = set()


def env(name, default=None):
    """The value of DHARA_<name>; else NOEMA_<name> with one deprecation line per process; else default."""
    value = os.environ.get(PREFIX + name)
    if value is not None:
        return value
    legacy = os.environ.get(LEGACY_PREFIX + name)
    if legacy is None:
        return default
    if name not in _warned:
        _warned.add(name)
        print(f'{LEGACY_PREFIX}{name} is deprecated; set {PREFIX}{name} instead', file=sys.stderr)
    return legacy


def strip(environment, names):
    """Removes DHARA_<name> and NOEMA_<name> for every name from a mapping; returns the same mapping."""
    for prefix in PREFIXES:
        for name in names:
            environment.pop(prefix + name, None)
    return environment
```

In `dhara/desktop_service.py` replace the two-line `STRIPPED_ENV = (...)` tuple (the lines after the comment `# Managed development mode never enables …`) with:
```python
from .env import PREFIXES

STRIPPED_NAMES = ('MODEL', 'SPEECH_MODEL', 'TOKEN', 'ACCESS_TOKEN', 'ALLOWED_HOSTS', 'ALLOW_REMOTE_MODEL', 'DATA_DIR')
STRIPPED_ENV = tuple(prefix + name for prefix in PREFIXES for name in STRIPPED_NAMES)
```
(Put the `from .env import PREFIXES` line with the other imports at the top of the file.)

- [ ] **Step 4: Every Python read goes through `env()`**

```bash
cd /home/p4nic/code/noema
perl -pi -e "s/os\.getenv\('NOEMA_(\w+)'/env('\$1'/g" dhara/server.py dhara/worker.py run.py tools/client.py tools/doctor.py qa/browser_check.py qa/native_storage_check.py
git grep -n "env('" -- dhara/server.py dhara/worker.py run.py tools/client.py tools/doctor.py qa/browser_check.py qa/native_storage_check.py
```
Expected: 6 reads in `dhara/server.py` (DATA_DIR, ACCESS_TOKEN, MODEL, OLLAMA_URL, SPEECH_MODEL, ALLOWED_HOSTS), 1 in `dhara/worker.py` (ALLOW_REMOTE_MODEL), 3 in `run.py`, 1 in `tools/client.py` (TOKEN), 2 in `tools/doctor.py`, 1 each in the two qa files (QA_OUTPUT). Then add the imports:
- `dhara/server.py` and `dhara/worker.py`: `from .env import env` next to the other relative imports.
- `run.py`: `from dhara.env import env` after `import argparse`.
- `tools/client.py`, `tools/doctor.py`, `tools/agent.py` (scripts run with `tools/` as `sys.path[0]`, so the repository root is added explicitly; three identical lines, deliberately not shared):
  ```python
  import sys
  from pathlib import Path
  sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # tools/ scripts run from anywhere; dhara/ is beside them
  from dhara.env import env, strip
  ```
  (`client.py` already imports `os` and `Path`, `agent.py` imports `sys` and `Path`, `doctor.py` imports `sys`; keep one import of each. `doctor.py` uses only `env`; `agent.py` uses only `strip` — import what each uses.)
- `qa/browser_check.py`, `qa/native_storage_check.py`, `qa/resource_check.py` have `ROOT` but no `sys.path` insert (all three already `import sys`): add `sys.path.insert(0, str(ROOT))` right after `ROOT` is defined, then `from dhara.env import env, strip` in the first two and `from dhara.env import PREFIXES` in `resource_check.py` (it has a local `env` dict and reads no config). `qa/now_ui_check.py` and `qa/sway_check.py` already insert `ROOT`; add `from dhara.env import strip` after their existing `from dhara.server import create_app` (`sway_check.py` also has a local `env` variable, so it imports `strip` only).

Then the strips (every harness must strip BOTH prefixes, or an owner's exported `NOEMA_*` reaches a test service through the fallback):
- `tools/agent.py`: replace `for key in ('NOEMA_TOKEN','NOEMA_ACCESS_TOKEN'):child_env.pop(key,None)` with `strip(child_env,('TOKEN','ACCESS_TOKEN'))`.
- `qa/browser_check.py`: replace `_env=os.environ.copy();_env['NOEMA_ACCESS_TOKEN']=TOKEN;_env.pop('NOEMA_MODEL',None);_env.pop('NOEMA_SPEECH_MODEL',None)` with `_env=strip(os.environ.copy(),('MODEL','SPEECH_MODEL'));_env['DHARA_ACCESS_TOKEN']=TOKEN`.
- `qa/native_storage_check.py`: the four lines `self.env = os.environ.copy()` … `self.env.pop('NOEMA_SPEECH_MODEL', None)` become `self.env = strip(os.environ.copy(), ('MODEL', 'SPEECH_MODEL'))` and `self.env['DHARA_ACCESS_TOKEN'] = self.token`.
- `qa/now_ui_check.py`: the two consecutive `os.environ.pop('NOEMA_…', None)` lines become one `strip(os.environ, ('MODEL', 'SPEECH_MODEL'))`.
- `qa/resource_check.py`: `if not k.startswith('NOEMA_')` → `if not k.startswith(PREFIXES)`; `env['NOEMA_ACCESS_TOKEN'] = …` → `env['DHARA_ACCESS_TOKEN'] = …`.
- `qa/sway_check.py`: the loop `for key in ('SWAYSOCK', 'WAYLAND_DISPLAY', 'DISPLAY', 'NOEMA_TOKEN', 'NOEMA_ACCESS_TOKEN', 'NOEMA_MODEL', 'NOEMA_SPEECH_MODEL'): env.pop(key, None)` becomes `for key in ('SWAYSOCK', 'WAYLAND_DISPLAY', 'DISPLAY'): env.pop(key, None)` followed by `strip(env, ('TOKEN', 'ACCESS_TOKEN', 'MODEL', 'SPEECH_MODEL'))`. Leave its `env.update(NOEMA_TOKEN=…, NOEMA_QA_*=…)` producer lines to Task 9 (the probes read them under the same names until then).
- `tests/test_core.py` fixture: `monkeypatch.delenv('NOEMA_MODEL',raising=False);monkeypatch.delenv('NOEMA_SPEECH_MODEL',raising=False)` becomes
  ```python
    for key in (prefix+name for prefix in PREFIXES for name in ('MODEL','SPEECH_MODEL')): monkeypatch.delenv(key,raising=False)
  ```
  with `from dhara.env import PREFIXES` among the imports.
- `tests/test_managed_service.py`: the loop `for key in ('NOEMA_ACCESS_TOKEN', 'NOEMA_MODEL', 'NOEMA_SPEECH_MODEL'): monkeypatch.delenv(key, raising=False)` becomes `for key in STRIPPED_ENV: monkeypatch.delenv(key, raising=False)` (already imported). Replace the whole `test_stripped_env_matches_the_electron_owner_list` function with:
  ```python
  def test_stripped_env_matches_the_electron_owner_list():
      # electron/src/env.ts strips the same names under both prefixes before spawning (spec §6.4.2, rename spec §4.1).
      ts = (ROOT / 'electron/src/env.ts').read_text()
      names = re.search(r'export const STRIPPED_NAMES = \[(.*?)\] as const', ts, re.S).group(1)
      assert set(re.findall(r"'(\w+)'", names)) == set(STRIPPED_NAMES)
      assert re.search(r"export const PREFIX = '(\w+)'", ts).group(1) == PREFIXES[0]
      assert re.search(r"export const LEGACY_PREFIX = '(\w+)'", ts).group(1) == PREFIXES[1]
  ```
  and extend the `from dhara.desktop_service import (…)` line with `STRIPPED_NAMES`, plus `from dhara.env import PREFIXES`.
- `tests/test_helpers.py`: `env=os.environ.copy();env['NOEMA_ACCESS_TOKEN']=secret;env.pop('NOEMA_MODEL',None);env.pop('NOEMA_SPEECH_MODEL',None)` becomes `env=strip(os.environ.copy(),('MODEL','SPEECH_MODEL'));env['DHARA_ACCESS_TOKEN']=secret` (add `from dhara.env import strip` after `from client import Client`; `dhara` resolves the same way `from noema.server import create_app` does in `tests/test_core.py` — pytest runs from the repository root and the package is installed editable). `child_env=env|{'NOEMA_TOKEN':tok}` becomes `child_env=env|{'DHARA_TOKEN':tok,'NOEMA_TOKEN':tok}   # rename-shim: both names must be stripped from the wrapped command`, and inside the `-c` string replace `assert "NOEMA_TOKEN" not in os.environ; assert "NOEMA_ACCESS_TOKEN" not in os.environ;` with `assert not {{"DHARA_TOKEN","DHARA_ACCESS_TOKEN","NOEMA_TOKEN","NOEMA_ACCESS_TOKEN"}} & set(os.environ);` and append `   # rename-shim: legacy names stripped too` to that line.

Verify:
```bash
cd /home/p4nic/code/noema
git grep -n -E "(getenv|environ(\.get)?|environ\[)\s*\(?\s*['\"]NOEMA_" -- '*.py' run.py ':!experiments'
.venv/bin/python -m py_compile tools/*.py qa/*.py run.py dhara/*.py && echo compiled
```
Expected: the grep prints only harness-internal reads that Task 9 renames together with their producers — `os.environ['NOEMA_QA_*']` in `qa/*_probe.py` and `os.environ.get('NOEMA_FAKE_*')` in `electron/test/fixtures/fake_service.py` (`dhara/env.py` reads `PREFIX + name`, so it never matches); any other line is a config read this step missed. Then `compiled`.

- [ ] **Step 5: GREEN (Python)**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest -q
```
Expected: all pass (the cross-check test fails until Step 7 creates `electron/src/env.ts` — run it again after Step 7).

- [ ] **Step 6: Failing Electron test**

Create `electron/test/env.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { env, LEGACY_PREFIX, PREFIX, STRIPPED_ENV, STRIPPED_NAMES } from '../src/env.js';

describe('env (rename spec §4.1)', () => {
  it('prefers DHARA_<name> and never logs for it', () => {
    const log = vi.fn();
    expect(env('MODEL', { DHARA_MODEL: 'new', NOEMA_MODEL: 'old' }, log)).toBe('new');
    expect(log).not.toHaveBeenCalled();
  });

  it('falls back to NOEMA_<name> with one deprecation line per name and process', () => {
    const log = vi.fn();
    expect(env('ELECTRON_TEST', { NOEMA_ELECTRON_TEST: '1' }, log)).toBe('1');
    expect(env('ELECTRON_TEST', { NOEMA_ELECTRON_TEST: '1' }, log)).toBe('1');
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('Dhara: NOEMA_ELECTRON_TEST is deprecated; set DHARA_ELECTRON_TEST instead');
  });

  it('returns undefined when neither name is set', () => {
    const log = vi.fn();
    expect(env('DATA_DIR', {}, log)).toBeUndefined();
    expect(log).not.toHaveBeenCalled();
  });

  it('strips every optional feature and credential under both prefixes', () => {
    expect(PREFIX).toBe('DHARA_');
    expect(LEGACY_PREFIX).toBe('NOEMA_');
    expect(STRIPPED_ENV).toEqual([...STRIPPED_NAMES.map((name) => PREFIX + name), ...STRIPPED_NAMES.map((name) => LEGACY_PREFIX + name)]);
    expect(STRIPPED_ENV).toContain('NOEMA_ACCESS_TOKEN');
    expect(STRIPPED_ENV).toContain('DHARA_DATA_DIR');
  });
});
```

```bash
cd /home/p4nic/code/noema
npm --prefix electron run unit -- test/env.test.ts
```
Expected: FAIL — `Cannot find module '../src/env.js'`.

- [ ] **Step 7: The Electron helper and its callers**

Create `electron/src/env.ts`:
```ts
// DHARA_<name> with a NOEMA_<name> fallback (rename spec §4.1). The dated follow-up deletes LEGACY_PREFIX and the fallback branch.
export const PREFIX = 'DHARA_';
export const LEGACY_PREFIX = 'NOEMA_';   // rename-shim: read-only fallback for one release
export const STRIPPED_NAMES = ['MODEL', 'SPEECH_MODEL', 'TOKEN', 'ACCESS_TOKEN', 'ALLOWED_HOSTS', 'ALLOW_REMOTE_MODEL', 'DATA_DIR'] as const;
/** Managed launch strips every optional feature and credential under both prefixes (spec §6.4.2). */
export const STRIPPED_ENV: readonly string[] = [PREFIX, LEGACY_PREFIX].flatMap((prefix) => STRIPPED_NAMES.map((name) => prefix + name));

const warned = new Set<string>();
const stderr = (line: string) => { process.stderr.write(`${line}\n`); };

/** DHARA_<name>, else NOEMA_<name> (one deprecation line per process and name), else undefined. */
export function env(name: string, source: NodeJS.ProcessEnv = process.env, log: (line: string) => void = stderr): string | undefined {
  const value = source[PREFIX + name];
  if (value !== undefined) return value;
  const legacy = source[LEGACY_PREFIX + name];
  if (legacy === undefined) return undefined;
  if (!warned.has(name)) {
    warned.add(name);
    log(`Dhara: ${LEGACY_PREFIX}${name} is deprecated; set ${PREFIX}${name} instead`);
  }
  return legacy;
}
```

In `electron/src/lifecycle.ts`:
- delete the three-line `export const STRIPPED_ENV = [ … ] as const;` block;
- add `import { env as readEnv, STRIPPED_ENV } from './env.js';` with the imports and `export { STRIPPED_ENV };` right after them (tests import it from `lifecycle.js`);
- replace `managedPort` with
  ```ts
  /** 8765 always; a test-only override needs ELECTRON_TEST=1 under either prefix and is unreachable from the CLI (spec §6.4.2). */
  export function managedPort(source: NodeJS.ProcessEnv): number {
    if (readEnv('ELECTRON_TEST', source) !== '1') return DEFAULT_MANAGED_PORT;
    const raw = readEnv('ELECTRON_TEST_PORT', source) ?? '';
    const port = Number(raw);
    return /^[0-9]+$/.test(raw) && port >= 1024 && port <= 65535 ? port : DEFAULT_MANAGED_PORT;
  }
  ```
`electron/test/service-parity.test.ts`: in the helper that returns a copy of `process.env` with `delete env.NOEMA_ACCESS_TOKEN; delete env.NOEMA_DATA_DIR;`, replace those two lines with
```ts
  for (const name of ['ACCESS_TOKEN', 'DATA_DIR']) for (const prefix of [PREFIX, LEGACY_PREFIX]) delete env[prefix + name];
```
and import `{ LEGACY_PREFIX, PREFIX }` from `'../src/env.js'`. In the test `'disables inherited optional features and never uses NOEMA_DATA_DIR (:292)'`, replace the `const env = { ...process.env, NOEMA_MODEL: …, NOEMA_SPEECH_MODEL: …, NOEMA_ACCESS_TOKEN: …, NOEMA_DATA_DIR: … };` literal with:
```ts
    const env = {
      ...process.env,
      DHARA_MODEL: 'must-not-start',
      DHARA_SPEECH_MODEL: 'must-not-download',
      DHARA_ACCESS_TOKEN: 'inherited-secret-not-used-'.repeat(2),
      DHARA_DATA_DIR: path.join(root, 'not-selected'),
      NOEMA_MODEL: 'must-not-start',                                   // rename-shim: the legacy names are stripped too
      NOEMA_SPEECH_MODEL: 'must-not-download',                         // rename-shim: the legacy names are stripped too
      NOEMA_ACCESS_TOKEN: 'inherited-secret-not-used-'.repeat(2),      // rename-shim: the legacy names are stripped too
      NOEMA_DATA_DIR: path.join(root, 'not-selected-legacy'),          // rename-shim: the legacy names are stripped too
    };
```
and after `expect(fs.existsSync(path.join(root, 'not-selected'))).toBe(false);` add `expect(fs.existsSync(path.join(root, 'not-selected-legacy'))).toBe(false);`.

`web/e2e/server.ts`: replace `childEnv` with
```ts
function childEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  // Inherited DHARA_* (models, tokens, data dir, allowed hosts) must never leak into a test service, and neither may the
  // pre-rename names, which the service still reads as a fallback.
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) if (!/^(DHARA|NOEMA)_/.test(key)) env[key] = value;   // rename-shim: both prefixes
  return { ...env, DHARA_ACCESS_TOKEN: E2E_TOKEN, ...extra };
}
```
`web/e2e/serving.spec.ts`: the test `'base app runs with no model and capture disabled by default'` sets `process.env.NOEMA_MODEL` to prove the harness strips an inherited model. Append `   // rename-shim: an inherited legacy name must be stripped too` to each of its four lines that mention `NOEMA_MODEL` (`grep -n NOEMA_MODEL web/e2e/serving.spec.ts` → exactly 4 lines).

- [ ] **Step 8: GREEN (Electron, Python cross-check, web harness)**

```bash
cd /home/p4nic/code/noema
npm --prefix electron run build && npm --prefix electron run unit
.venv/bin/python -m pytest -q
npm --prefix web run build && npm --prefix web run e2e -- e2e/serving.spec.ts e2e/boot.spec.ts
git grep -n -E "process\.env\.NOEMA_|env\.NOEMA_|\['NOEMA_" -- electron web ':!web/e2e/serving.spec.ts' ':!electron/test/fixtures/fake_service.py'
```
Expected: electron unit all green (incl. `test/env.test.ts`, `service-parity.test.ts`, `service-start.test.ts`, `lifecycle.test.ts`); pytest all green; the two web specs green; the last grep prints nothing.

- [ ] **Step 9: Commit**

```bash
cd /home/p4nic/code/noema
git add dhara/env.py dhara/desktop_service.py dhara/server.py dhara/worker.py run.py tools/client.py tools/doctor.py tools/agent.py qa/browser_check.py qa/native_storage_check.py qa/now_ui_check.py qa/resource_check.py qa/sway_check.py tests/test_shims.py tests/test_core.py tests/test_helpers.py tests/test_managed_service.py electron/src/env.ts electron/src/lifecycle.ts electron/test/env.test.ts electron/test/service-parity.test.ts web/e2e/server.ts web/e2e/serving.spec.ts
git commit -m "feat: read DHARA_* with a NOEMA_* fallback through one env helper on both sides"
```

---

### Task 3: Session cookie and request marker dual-read

**Files:**
- Modify: `dhara/server.py`, `tests/test_core.py`

**Interfaces:**
- Produces in `dhara/server.py`: `SESSION_COOKIE = 'dhara_session'`, `LEGACY_SESSION_COOKIE = 'noema_session'`, `has_request_marker(request) -> bool` used by `protect()` and `POST /api/session`.
- Behaviour (spec §4.2, §4.3): read new cookie, else old; login sets the new cookie and clears the old; logout clears both; either header is a valid marker; no header → 403 as before.

- [ ] **Step 1: Point the test fixture at the new header and write the failing tests**

In `tests/test_core.py`: in the `env` fixture replace `'X-Noema-Request':'1'` with `'X-Dhara-Request':'1'`; in `test_cookie_write_needs_marker` replace `c.headers.pop('X-Noema-Request')` with `c.headers.pop('X-Dhara-Request')`. Append at the end of the file:
```python
def test_old_session_cookie_signs_in_until_login_rewrites_it(env):
 c,s,w=env;c.headers.pop('Authorization')
 assert c.get('/api/state').status_code==401
 old={'Cookie':'noema_session='+ADMIN}   # rename-shim: a cookie written before the rename, sent as the browser still sends it
 assert c.get('/api/state',headers=old).status_code==200
 r=c.post('/api/session',json={},headers=old);assert r.status_code==200
 cookies=r.headers.get_list('set-cookie')
 assert any(h.startswith('dhara_session='+ADMIN) and 'HttpOnly' in h for h in cookies)
 assert any(h.startswith('noema_session=') and 'Max-Age=0' in h for h in cookies)   # rename-shim: login clears the old cookie
 assert c.cookies.get('dhara_session')==ADMIN
 assert c.get('/api/state').status_code==200
 r=c.delete('/api/session');cleared=r.headers.get_list('set-cookie')
 assert all(any(h.startswith(name+'=') and 'Max-Age=0' in h for h in cleared) for name in ('dhara_session','noema_session'))   # rename-shim
 assert c.get('/api/state').status_code==401

def test_request_marker_dual_read(env):
 c,s,w=env;c.headers.pop('Authorization');c.headers.pop('X-Dhara-Request')
 assert c.post('/api/session',json={}).status_code==403
 assert c.post('/api/session',json={},headers={'X-Dhara-Request':'1'}).status_code==200
 assert c.post('/api/tasks',json={'title':'No marker'}).status_code==403
 assert c.post('/api/tasks',json={'title':'Old marker'},headers={'X-Noema-Request':'1'}).status_code==201   # rename-shim: old header accepted for one release
 assert c.post('/api/tasks',json={'title':'New marker'},headers={'X-Dhara-Request':'1'}).status_code==201
```

The old cookie travels as a raw `Cookie` header rather than through `c.cookies.set(...)`: httpx files a client-set cookie under an empty domain, so the server's `Max-Age=0` could never clear it from the jar and the test would be asserting the jar, not the server. The jar still receives `dhara_session` from the login response, so the two following requests prove the new cookie alone signs in and that logout clears it.

- [ ] **Step 2: RED**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_core.py -q -k "marker or session_cookie"
```
Expected: `test_cookie_write_needs_marker`, `test_old_session_cookie_signs_in_until_login_rewrites_it` and `test_request_marker_dual_read` fail (403 where 200/201 is expected: the fixture now sends `X-Dhara-Request`, which the server does not know yet).

- [ ] **Step 3: Server**

In `dhara/server.py`, directly after the `MAX_BODY=…` line (grep `MAX_BODY=`), add:
```python
SESSION_COOKIE='dhara_session'
LEGACY_SESSION_COOKIE='noema_session'   # rename-shim: read and cleared for one release (cookies live 14 days)
def has_request_marker(request):
    """Same-origin marker: the new header, or the pre-rename header for one release."""
    return request.headers.get('x-dhara-request')=='1' or request.headers.get('x-noema-request')=='1'   # rename-shim: old header
```
Then, each located by its unique text:
- `request.cookies.get('noema_session','')` → `(request.cookies.get(SESSION_COOKIE) or request.cookies.get(LEGACY_SESSION_COOKIE,''))` and append `   # rename-shim: an old cookie signs in until it expires` to that line.
- `request.headers.get('x-noema-request')!='1':` inside `protect` → `not has_request_marker(request):`.
- `if request.headers.get('x-noema-request')!='1': raise Problem(403,'Missing request marker')` → `if not has_request_marker(request): raise Problem(403,'Missing request marker')`.
- `response.set_cookie('noema_session',admin,…)` → `response.set_cookie(SESSION_COOKIE,admin,…)` (rest of the line unchanged) and insert before the following `return response`:
  ```python
        response.delete_cookie(LEGACY_SESSION_COOKIE)   # rename-shim: the next login clears the old cookie
  ```
- the one-line body of `logout`, `response=JSONResponse({'ok':True}); response.delete_cookie('noema_session'); return response` → `response=JSONResponse({'ok':True}); response.delete_cookie(SESSION_COOKIE); response.delete_cookie(LEGACY_SESSION_COOKIE); return response   # rename-shim: clear both` (replace the whole line: a comment inserted before `return response` would swallow the return).

```bash
cd /home/p4nic/code/noema
git grep -n "noema_session\|x-noema-request\|x-dhara-request" dhara/server.py
```
Expected: exactly two lines, both carrying `rename-shim:` — `LEGACY_SESSION_COOKIE='noema_session'` and `has_request_marker`'s return (the cookie read and the two `delete_cookie` lines use the constants, so they do not match). Then `git grep -c 'rename-shim:' dhara/server.py` → `5` (those two, the cookie read, the login `delete_cookie`, the `logout` line).

- [ ] **Step 4: GREEN and commit**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest -q
git add dhara/server.py tests/test_core.py
git commit -m "feat(server): dhara_session cookie and X-Dhara-Request marker, old names accepted for one release"
```
Expected before the commit: all green. (The web client still sends `X-Noema-Request` until Task 9; the server accepts both.)

---

### Task 4: Workspace lock `.dhara-service.lock` and the notebook file `dhara.sqlite3`

**Files:**
- Modify: `dhara/desktop_service.py`, `dhara/store.py`, `tests/test_shims.py`, `web/e2e/db.ts`, `tests/test_task_capture.py`

**Interfaces:**
- Produces: `dhara.desktop_service.LOCK_NAME = '.dhara-service.lock'`; `workspace_lock(root)` unchanged otherwise. A stale `.noema-service.lock` — even one that is flocked — never blocks.
- Produces: `Store.NOTEBOOK = 'dhara.sqlite3'`, `Store.OLD_NOTEBOOK = 'noema.sqlite3'` (marker line), `Store._notebook_path()` — the guarded move of spec §4.9; `Store.path` is the file actually opened.

- [ ] **Step 1: Failing test**

Append to `tests/test_shims.py`:
```python
@pytest.mark.skipif(sys.platform != 'linux', reason='the flock lock is Linux-only')
def test_workspace_lock_uses_the_dhara_name_and_ignores_a_held_noema_lock(tmp_path):
    import fcntl
    from dhara.desktop_service import LOCK_NAME, workspace_lock
    old = os.open(tmp_path / '.noema-service.lock', os.O_RDWR | os.O_CREAT, 0o600)
    fcntl.flock(old, fcntl.LOCK_EX | fcntl.LOCK_NB)   # a pre-rename shell still holding its lock must not block
    held = workspace_lock(tmp_path)
    try:
        assert LOCK_NAME == '.dhara-service.lock'
        assert (tmp_path / LOCK_NAME).exists()
        with pytest.raises(ValueError):
            workspace_lock(tmp_path)
    finally:
        held.close()
        os.close(old)
```

- [ ] **Step 2: RED → code → GREEN → commit**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_shims.py -q -k workspace_lock
```
Expected: `ImportError: cannot import name 'LOCK_NAME'`. Then in `dhara/desktop_service.py` add `LOCK_NAME = '.dhara-service.lock'` after `PR_SET_PDEATHSIG = 1` and replace `root / '.noema-service.lock'` with `root / LOCK_NAME`.
```bash
.venv/bin/python -m pytest -q
git add dhara/desktop_service.py tests/test_shims.py
git commit -m "refactor: rename the workspace lock to .dhara-service.lock"
```

- [ ] **Step 3: Failing tests for the notebook-file move (spec §4.9, owner decision 27B)**

Append to `tests/test_shims.py`:
```python
def _old_notebook(root):
    import sqlite3
    path = root / 'noema.sqlite3'
    c = sqlite3.connect(path)
    c.execute('CREATE TABLE marker(x)'); c.execute("INSERT INTO marker VALUES('old')"); c.commit(); c.close()
    return path


def test_notebook_file_moves_on_a_clean_start_and_only_once(tmp_path):
    from dhara.store import Store
    old = _old_notebook(tmp_path)
    store = Store(tmp_path)
    assert store.path == tmp_path / 'dhara.sqlite3' and not old.exists()
    with store.db() as c:
        assert c.execute('SELECT x FROM marker').fetchone()[0] == 'old'
    assert Store(tmp_path).path == tmp_path / 'dhara.sqlite3'   # second start: no-op


def test_notebook_file_stays_when_journal_side_files_exist(tmp_path, caplog):
    from dhara.store import Store
    old = _old_notebook(tmp_path)
    (tmp_path / 'noema.sqlite3-wal').write_bytes(b'')
    with caplog.at_level('WARNING', logger='dhara.store'):
        store = Store(tmp_path)
    assert store.path == old and not (tmp_path / 'dhara.sqlite3').exists()
    assert 'unclean close' in caplog.text


def test_notebook_file_never_moves_over_an_existing_new_file(tmp_path, caplog):
    from dhara.store import Store
    Store(tmp_path)                       # creates dhara.sqlite3
    old = _old_notebook(tmp_path)         # a stray old file appears beside it
    with caplog.at_level('WARNING', logger='dhara.store'):
        store = Store(tmp_path)
    assert store.path == tmp_path / 'dhara.sqlite3' and old.exists()
    assert 'left in place' in caplog.text


def test_notebook_file_stays_when_the_rename_fails(tmp_path, monkeypatch, caplog):
    from pathlib import Path
    from dhara.store import Store
    old = _old_notebook(tmp_path)
    def refuse(self, target):
        raise OSError('simulated EXDEV')
    monkeypatch.setattr(Path, 'rename', refuse)
    with caplog.at_level('WARNING', logger='dhara.store'):
        store = Store(tmp_path)
    assert store.path == old and not (tmp_path / 'dhara.sqlite3').exists()
    assert 'simulated EXDEV' in caplog.text
```

- [ ] **Step 4: RED → code → GREEN → commit**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_shims.py -q -k notebook_file
```
Expected: 4 failed — two on `assert store.path == tmp_path / 'dhara.sqlite3'` (the path is still `noema.sqlite3`), two on their `caplog` assertions.

In `dhara/store.py`: add `import logging` to the imports and `log = logging.getLogger('dhara.store')` after the import block; replace the line `self.path = self.root / 'noema.sqlite3'` with `self.path = self._notebook_path()`; add to `class Store`, before `__init__`:
```python
    NOTEBOOK = 'dhara.sqlite3'
    OLD_NOTEBOOK = 'noema.sqlite3'  # rename-shim: the pre-rename notebook file; moved on the first clean start (spec §4.9)

    def _notebook_path(self) -> Path:
        new, old = self.root / self.NOTEBOOK, self.root / self.OLD_NOTEBOOK
        if new.exists():
            if old.exists():
                log.warning('%s and %s both exist; opening %s; the old file is left in place', old.name, new.name, new.name)
            return new
        if not old.exists():
            return new
        if any((self.root / (self.OLD_NOTEBOOK + suffix)).exists() for suffix in ('-wal', '-shm')):
            log.warning('%s has journal side files (unclean close); opening it under the old name until the next clean start', old.name)
            return old
        try:
            old.rename(new)  # same directory: atomic
        except OSError as exc:
            log.warning('could not rename %s to %s (%s); opening the old file', old.name, new.name, exc)
            return old
        return new
```
The two fixtures that name the file follow the server, which now creates `dhara.sqlite3` in a fresh data directory: in `web/e2e/db.ts` replace `'noema.sqlite3'` with `'dhara.sqlite3'`, and in `tests/test_task_capture.py` the line `path = tmp_path / 'noema.sqlite3'` becomes `path = tmp_path / 'dhara.sqlite3'` (that test covers the additive schema migration, not the file move).
```bash
git grep -n "sqlite3'" -- web/e2e/db.ts tests/test_task_capture.py   # both lines now say dhara.sqlite3
.venv/bin/python -m pytest -q
npm --prefix web run e2e -- e2e/task-capture.spec.ts e2e/notifications.spec.ts e2e/notes.spec.ts e2e/now.spec.ts e2e/layout.spec.ts 2>&1 | tail -3   # every runSql user still passes
git add dhara/store.py tests/test_shims.py web/e2e/db.ts tests/test_task_capture.py
git commit -m "feat(store): move noema.sqlite3 to dhara.sqlite3 on the first clean start"
```

---

### Task 5: IndexedDB migration `noema-local-v1` → `dhara-local-v1`

**Files:**
- Create: `web/src/local/migrate.ts`, `web/src/local/migrate.test.ts`
- Modify: `web/src/local/db.ts`, `web/src/local/db.test.ts`, `web/src/fakeIndexedDb.test.ts`, `web/src/strings.ts`, `web/src/strings.test.ts`, `web/src/main.tsx`, `web/e2e/fixtures.ts`, `web/e2e/outbox.spec.ts`, `web/e2e/faults.ts`, `web/e2e/screenTest.ts`, `web/e2e/harness.spec.ts`, `electron/e2e/fixtures.ts`, `electron/e2e/scenario.spec.ts`, `electron/e2e/close.spec.ts`, `qa/native_storage_check.py`

**Interfaces:**
- `web/src/local/db.ts`: `DB_NAME = 'dhara-local-v1'`; `LocalErrorCode` gains `'migrate'`.
- `web/src/local/migrate.ts`: `LEGACY_DB_NAME = 'noema-local-v1'`; `migrateLocalDb(): Promise<number>` (records copied; 0 when there is nothing to do); rejects only with `LocalStoreError` (`'migrate'` → `S.migrationFailed`; `'blocked'` → `S.closeOtherTabs`; `'open-failed'` as from `openDb`).
- `web/src/strings.ts`: `migrationFailed: 'Local data could not be migrated; keep this page open and retry.'`.
- `web/src/main.tsx`: `await migrateLocalDb()` is the first storage access; a `LocalStoreError` from boot renders the retry notice (`<main data-quiet>`, `role="alert"`, a Retry button that runs `start()` again).
- `web/e2e/fixtures.ts`: `openLocalDb(name = 'dhara-local-v1')`; `seedLocalDb(page, origin, seed, dbName = DB_NAME)`.

- [ ] **Step 1: Failing unit tests**

Create `web/src/local/migrate.test.ts`:
```ts
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { S } from '../strings';

type Db = typeof import('./db');
type Migrate = typeof import('./migrate');
let db: Db;
let migrate: Migrate;

beforeEach(async () => {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory() as unknown as typeof globalThis.indexedDB;
  db = await import('./db');
  migrate = await import('./migrate');
});
afterEach(() => {
  vi.restoreAllMocks();
});

const LEGACY = 'noema-local-v1';
const blob = (text: string) => new Blob([text], { type: 'image/png' });
const QUEUED = { id: '6f1c2b8e-3d4a-4c5b-9e6f-7a8b9c0d1e2f', raw: 'queued by the old UI', task_id: '', files: [{ name: 'heap.png', blob: blob('png-bytes') }] };
const DRAFT = { id: 'draft-0001', raw: 'still typing', task_id: 't1', files: [] };
const TASK_DRAFT = { id: 'task-draft-0001', raw: 'Review cleanup', fields: { project: 'CTF' }, pending: null };

// The same upgrade as public/app.js and db.ts: version 1, kv (out-of-line keys) and outbox (keyPath id).
function open(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('kv');
      request.result.createObjectStore('outbox', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function seedLegacy(records: { kv?: Record<string, unknown>; outbox?: unknown[] } = {}): Promise<void> {
  const legacy = await open(LEGACY);
  await new Promise<void>((resolve, reject) => {
    const tx = legacy.transaction(['kv', 'outbox'], 'readwrite');
    for (const [key, value] of Object.entries(records.kv ?? {})) tx.objectStore('kv').put(value, key);
    for (const item of records.outbox ?? []) tx.objectStore('outbox').put(item);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
  legacy.close();
}

const names = async () => (await indexedDB.databases()).map((info) => info.name ?? '').sort();

async function dump(name: string): Promise<{ kv: Record<string, unknown>; outbox: unknown[] }> {
  const handle = await open(name);
  const tx = handle.transaction(['kv', 'outbox'], 'readonly');
  const kvKeys = tx.objectStore('kv').getAllKeys();
  const kvValues = tx.objectStore('kv').getAll();
  const outbox = tx.objectStore('outbox').getAll();
  await new Promise<void>((resolve) => {
    tx.oncomplete = () => resolve();
  });
  handle.close();
  return { kv: Object.fromEntries(kvKeys.result.map((key, index) => [String(key), kvValues.result[index]])), outbox: outbox.result };
}

const raws = (items: unknown[]) => items.map((item) => (item as { raw: string }).raw).sort();

describe('migrateLocalDb (rename spec §4.4)', () => {
  it('is a no-op without a pre-rename database and creates nothing', async () => {
    expect(await migrate.migrateLocalDb()).toBe(0);
    expect(await names()).toEqual([]);
  });

  it('copies every kv entry and outbox record, Blobs and ids included, then deletes the old database', async () => {
    await seedLegacy({ kv: { draft: DRAFT, 'task-draft': TASK_DRAFT, snapshot: { tasks: [] } }, outbox: [QUEUED] });
    expect(await migrate.migrateLocalDb()).toBe(4);
    expect(await names()).toEqual([db.DB_NAME]);
    const moved = await dump(db.DB_NAME);
    expect(moved.kv).toEqual({ draft: DRAFT, 'task-draft': TASK_DRAFT, snapshot: { tasks: [] } });
    expect(moved.outbox).toHaveLength(1);
    const item = moved.outbox[0] as typeof QUEUED;
    expect(item).toMatchObject({ id: QUEUED.id, raw: QUEUED.raw, task_id: '' });
    expect(db.isOutboxItem(item)).toBe(true);
    expect(await item.files[0].blob.text()).toBe('png-bytes');
  });

  it('is a no-op on the second boot', async () => {
    await seedLegacy({ outbox: [QUEUED] });
    await migrate.migrateLocalDb();
    expect(await migrate.migrateLocalDb()).toBe(0);
    expect(await names()).toEqual([db.DB_NAME]);
    expect((await dump(db.DB_NAME)).outbox).toHaveLength(1);
  });

  it('leaves both databases intact when the copy fails part-way', async () => {
    await seedLegacy({ kv: { draft: DRAFT }, outbox: [QUEUED] });
    const add = IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'outbox') throw new DOMException('Injected storage failure', 'QuotaExceededError');
      return add.call(this, value, key);
    });
    await expect(migrate.migrateLocalDb()).rejects.toMatchObject({ name: 'LocalStoreError', code: 'migrate', message: S.migrationFailed });
    expect(await names()).toEqual([db.DB_NAME, LEGACY].sort());
    const legacy = await dump(LEGACY);
    expect(Object.keys(legacy.kv)).toEqual(['draft']);
    expect(raws(legacy.outbox)).toEqual([QUEUED.raw]);
    expect(await dump(db.DB_NAME)).toEqual({ kv: {}, outbox: [] });   // the aborted transaction wrote nothing
  });

  it('completes a half-done earlier run without duplicating or overwriting', async () => {
    await seedLegacy({ kv: { draft: DRAFT, snapshot: { tasks: ['old'] } }, outbox: [QUEUED, { ...QUEUED, id: 'second', raw: 'second' }] });
    await db.kvPut('draft', { ...DRAFT, raw: 'typed after the rename' });   // the new database already has this key
    await db.outboxPut({ ...QUEUED, raw: 'already copied' });
    expect(await migrate.migrateLocalDb()).toBe(2);   // snapshot and 'second'
    const moved = await dump(db.DB_NAME);
    expect((moved.kv.draft as typeof DRAFT).raw).toBe('typed after the rename');
    expect(moved.kv.snapshot).toEqual({ tasks: ['old'] });
    expect(raws(moved.outbox)).toEqual(['already copied', 'second']);
    expect(await names()).toEqual([db.DB_NAME]);
  });

  it('reports "Close other tabs" when another connection blocks the delete, and keeps the copied data', async () => {
    await seedLegacy({ outbox: [QUEUED] });
    const other = await open(LEGACY);   // another tab still holds the old database
    other.onversionchange = () => undefined;   // and ignores the request to close
    await expect(migrate.migrateLocalDb()).rejects.toMatchObject({ name: 'LocalStoreError', code: 'blocked', message: S.closeOtherTabs });
    expect((await dump(db.DB_NAME)).outbox).toHaveLength(1);
    other.close();   // the pending delete now completes
    await vi.waitFor(async () => expect(await names()).toEqual([db.DB_NAME]));
    expect(await migrate.migrateLocalDb()).toBe(0);
  });
});
```

Also in `web/src/strings.test.ts`, inside the `expect(fixed).toEqual({ … })` literal, add after the `localSaveErrorNotice` line:
```ts
      migrationFailed: 'Local data could not be migrated; keep this page open and retry.',
```

- [ ] **Step 2: RED**

```bash
cd /home/p4nic/code/noema
npm --prefix web test -- src/local/migrate.test.ts src/strings.test.ts
```
Expected: `migrate.test.ts` fails to load (`Failed to resolve import "./migrate"`); `strings.test.ts` fails on the missing `migrationFailed` key.

- [ ] **Step 3: The migration module, the string, the database name**

`web/src/strings.ts`: add, before the `reload:` line:
```ts
  migrationFailed: 'Local data could not be migrated; keep this page open and retry.', // rename spec §4.4
```

`web/src/local/db.ts`:
- `export const DB_NAME = 'noema-local-v1';` → `export const DB_NAME = 'dhara-local-v1';`
- `export type LocalErrorCode = 'blocked' | 'open-failed' | 'aborted';` → `export type LocalErrorCode = 'blocked' | 'open-failed' | 'aborted' | 'migrate';`
- replace the two-line header comment with: `// IndexedDB layer (spec §4.4, contract §4.1): version 1 and the kv/outbox stores and record shapes that public/app.js defined;` / `// local/migrate.ts moves the pre-rename database here, so queued captures stay valid.`

Create `web/src/local/migrate.ts`:
```ts
// One-time move of the pre-rename database (noema-local-v1) into dhara-local-v1 (rename spec §4.4). Runs before any
// draft store opens the database. The dated follow-up deletes this module, its test, main.tsx's call and the legacy
// seed parameter in web/e2e/fixtures.ts.
import { S } from '../strings';
import { DB_NAME, LocalStoreError, openDb } from './db';

export const LEGACY_DB_NAME = 'noema-local-v1';
const STORES = ['kv', 'outbox'] as const;
type Store = (typeof STORES)[number];
type Records = Record<Store, { keys: IDBValidKey[]; values: unknown[] }>;

const failure = () => new LocalStoreError('migrate', S.migrationFailed);

function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject((event.target as IDBRequest | null)?.error ?? tx.error ?? failure());
    tx.onabort = () => reject(tx.error ?? failure());
  });
}

// Opens the old database only if it exists: an open that would create it is aborted inside onupgradeneeded.
function openLegacy(): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DB_NAME);
    let absent = false;
    request.onupgradeneeded = () => {
      absent = true;
      request.transaction?.abort();
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => (absent ? resolve(null) : reject(request.error ?? failure()));
  });
}

function readAll(db: IDBDatabase): Promise<Records> {
  const tx = db.transaction([...STORES], 'readonly');
  const requests = STORES.map((store) => ({ store, keys: tx.objectStore(store).getAllKeys(), values: tx.objectStore(store).getAll() }));
  return committed(tx).then(() => Object.fromEntries(requests.map(({ store, keys, values }) => [store, { keys: keys.result, values: values.result }])) as Records);
}

// Adds every legacy record whose key the new database lacks, in one transaction over both stores: `add` never overwrites,
// and an abort leaves the new database exactly as it was. Returns the number of records added.
function copyMissing(target: IDBDatabase, legacy: Records): Promise<number> {
  const tx = target.transaction([...STORES], 'readwrite');
  let copied = 0;
  let thrown: unknown;
  for (const store of STORES) {
    const objectStore = tx.objectStore(store);
    const existing = objectStore.getAllKeys();
    existing.onsuccess = () => {
      try {
        const present = new Set(existing.result.map(String));
        legacy[store].keys.forEach((key, index) => {
          if (present.has(String(key))) return;
          if (store === 'kv') objectStore.add(legacy.kv.values[index], key);
          else objectStore.add(legacy.outbox.values[index]);   // keyPath 'id': the capture id travels with the record
          copied += 1;
        });
      } catch (error) {
        thrown = error;
        tx.abort();
      }
    };
  }
  return committed(tx).then(
    () => copied,
    (error: unknown) => {
      throw thrown ?? error;
    },
  );
}

function deleteLegacy(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(LEGACY_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? failure());
    request.onblocked = () => reject(new LocalStoreError('blocked', S.closeOtherTabs));   // another tab holds the old database; the delete completes once it closes
  });
}

async function migrate(): Promise<number> {
  const legacy = await openLegacy();
  if (legacy === null) return 0;
  let copied: number;
  try {
    copied = await copyMissing(await openDb(), await readAll(legacy));
  } finally {
    legacy.close();   // our own connection must never block the delete, and never keeps the old database open after a failure
  }
  await deleteLegacy();
  return copied;
}

/** Rename spec §4.4. Resolves with the number of records moved; rejects only with a LocalStoreError, and only with both databases intact. */
export async function migrateLocalDb(): Promise<number> {
  try {
    return await migrate();
  } catch (error) {
    if (error instanceof LocalStoreError) throw error;
    console.error('local data migration failed', error);
    throw failure();
  }
}
```

- [ ] **Step 4: Boot order and the retry notice**

`web/src/main.tsx`:
- add `import { LocalStoreError } from './local/db';`, `import { migrateLocalDb } from './local/migrate';` and `import { S } from './strings';` with the other imports;
- in `start()`, right after the `if (legacy) history.replaceState(null, '', legacy);` line and before `const qc = createQueryClient();`, insert
  ```ts
    await migrateLocalDb();   // rename spec §4.4: before any draft store opens the new database
  ```
- replace from the existing `// public/app.js:616 — never leave a blank page when startup itself throws.` comment line through the whole `showStartupFailure` function and the final `void start().catch(showStartupFailure);` line with (so the comment is not duplicated):
  ```ts
  // public/app.js:616 — never leave a blank page when startup itself throws. With `retry`, the user retries in place
  // (rename spec §4.4: the pre-rename database is moved before anything else touches local storage).
  function showStartupFailure(message: string, retry = false): void {
    const main = document.createElement('main');
    main.dataset.quiet = '';
    const title = document.createElement('h1');
    title.textContent = 'Noema';
    const text = document.createElement('p');
    text.setAttribute('role', 'alert');
    text.textContent = message;
    main.append(title, text);
    if (retry) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'text-button';
      button.textContent = S.retry;
      button.onclick = () => {
        main.remove();
        void start().catch(onStartupError);
      };
      main.append(button);
    }
    document.getElementById('root')?.replaceChildren(main);
  }

  function onStartupError(error: unknown): void {
    if (error instanceof LocalStoreError) showStartupFailure(error.message, true);
    else showStartupFailure('Could not open the workspace. Check the server and reload.');
  }

  void start().catch(onStartupError);
  ```
  (The `'Noema'` title literal and the workspace message are the existing ones; the Task 9 sweep flips the title. `.text-button` exists in `web/src/styles/ui.css`.)

- [ ] **Step 5: Every opener of the app database follows the name; the E2E seed can target the old one**

`web/e2e/fixtures.ts`:
- add `import { DB_NAME } from '../src/local/db';`;
- replace the `openLocalDb` function and its two comment lines with
  ```ts
  // The one place that opens the local database (the app's by default; LEGACY_DB_NAME from src/local/migrate.ts for a
  // pre-rename seed). Same upgrade as web/src/local/db.ts, so seeded records are exactly what the old UI stored. This
  // function is serialised into the page, so the default stays an inline literal.
  export function openLocalDb(name = 'dhara-local-v1'): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('kv');
        request.result.createObjectStore('outbox', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  ```
- change `seedLocalDb` to
  ```ts
  export async function seedLocalDb(page: Page, origin: string, seed: Seed, dbName = DB_NAME): Promise<void> {
    await page.goto(origin + '/api/health'); // same origin, no app code competing for the database
    await inLocalDb(
      page,
      async (open, { seed, dbName }: { seed: Seed; dbName: string }) => {
        const toRecord = (item: SeedDraft) => ({
          id: item.id,
          raw: item.raw,
          task_id: item.task_id,
          files: item.files.map((file) => ({ name: file.name, blob: new Blob([Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))], { type: file.type }) })),
          ...(item.error === undefined ? {} : { error: item.error }),
        });
        const db = await open(dbName);
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(['kv', 'outbox'], 'readwrite');
          if (seed.draft) tx.objectStore('kv').put(toRecord(seed.draft), 'draft');
          if (seed.taskDraft !== undefined) tx.objectStore('kv').put(seed.taskDraft, 'task-draft');
          for (const item of seed.outbox ?? []) tx.objectStore('outbox').put(toRecord(item));
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
        db.close();
      },
      { seed, dbName },
    );
  }
  ```
Then every other opener (none of these may open the old name):
```bash
cd /home/p4nic/code/noema
git grep -l 'noema-local-v1' -- web electron qa ':!web/src/local/migrate.ts' ':!web/src/local/migrate.test.ts' ':!web/e2e/v1' \
  | xargs perl -pi -e 'unless (/rename-shim:/) { s/noema-local-v1/dhara-local-v1/g }'
grep -rn 'noema-local-v1' web/src web/e2e electron qa --include='*.ts' --include='*.tsx' --include='*.py' --include='*.js'
```
Expected: hits only in `web/src/local/migrate.ts` and `web/src/local/migrate.test.ts`.

Append to `web/e2e/outbox.spec.ts` (after the existing `Upgrade:` test; the file's fixture is still called `noema` until Task 9, and no line of this test may carry a `rename-shim:` marker — the Task 9 sweep skips marker lines, and a `{ page, noema }` left behind on one would not compile once the fixture is `dhara`; the old name enters only through `LEGACY_DB_NAME`):
```ts
test('Upgrade from the pre-rename build: a queued capture in the old database is moved and uploads once with its id', async ({ page, noema }) => {
  const draft: SeedDraft = { id: 'draft-legacy-0001', raw: 'still typing', task_id: '', files: [] };
  await seedLocalDb(page, noema.origin, { draft, outbox: [QUEUED] }, LEGACY_DB_NAME);
  await openApp(page, noema);
  await expect.poll(async () => (await notes(noema)).map((note) => note.id)).toEqual([QUEUED.id]);
  await expect.poll(() => outboxIds(page)).toEqual([]);
  await expect.poll(() => page.evaluate(async () => (await indexedDB.databases()).map((info) => info.name))).toEqual([DB_NAME]);
  expect((await readLocalDb(page)).draft).toEqual({ ...draft, files: [] });
  await page.reload();
  await expect(page.locator('#root [data-quiet]').first()).toBeVisible();
  expect((await notes(noema)).map((note) => note.id)).toEqual([QUEUED.id]);   // uploaded exactly once, original capture_id
});
```
with `import { DB_NAME } from '../src/local/db';` and `import { LEGACY_DB_NAME } from '../src/local/migrate';` added to the imports.

- [ ] **Step 6: GREEN**

```bash
cd /home/p4nic/code/noema
npm --prefix web test
npm --prefix web run build && npm --prefix web run e2e -- e2e/outbox.spec.ts e2e/harness.spec.ts e2e/capture.spec.ts e2e/checkpoint.spec.ts
npm --prefix electron run build
```
Expected: all unit tests green (6 new in `migrate.test.ts`; `db.test.ts` and `fakeIndexedDb.test.ts` now open `dhara-local-v1`); the four E2E files green including the new upgrade test; electron typecheck green.

- [ ] **Step 7: Commit**

```bash
cd /home/p4nic/code/noema
git add web/src/local/migrate.ts web/src/local/migrate.test.ts web/src/local/db.ts web/src/local/db.test.ts web/src/fakeIndexedDb.test.ts web/src/strings.ts web/src/strings.test.ts web/src/main.tsx web/e2e/fixtures.ts web/e2e/outbox.spec.ts web/e2e/faults.ts web/e2e/screenTest.ts web/e2e/harness.spec.ts electron/e2e/fixtures.ts electron/e2e/scenario.spec.ts electron/e2e/close.spec.ts qa/native_storage_check.py
git commit -m "feat(web): move noema-local-v1 into dhara-local-v1 on boot, copy-then-delete with retry"
```

---

### Task 6: Service-worker prefix `dhara-shell-` and purge of both prefixes

**Files:**
- Modify: `web/scripts/sw-precache.mjs`, `web/public/sw.js`, `web/src/buildScripts.test.ts`, `web/e2e/sw.spec.ts`, `tests/test_core.py`

**Interfaces:**
- `sw-precache.mjs` writes `const CACHE="dhara-shell-<12 hex>"`.
- `sw.js` `activate` deletes every cache named `dhara-shell-*` or `noema-shell-*` except `CACHE`.
- E2E `readPrecache` matches `dhara-shell-[0-9a-f]{12}`; the takeover test additionally pre-creates `dhara-shell-stale` and asserts only the current cache remains.

- [ ] **Step 1: Tests first (RED)**

```bash
cd /home/p4nic/code/noema
perl -pi -e 's/noema-shell-/dhara-shell-/g' web/src/buildScripts.test.ts tests/test_core.py
perl -pi -e 'unless (/noema-shell-v1/) { s/noema-shell-/dhara-shell-/g }' web/e2e/sw.spec.ts
perl -pi -e "s/(noema-shell-v1[^\n]*)$/\$1   \/\/ rename-shim: the v1 worker's cache name/ unless /rename-shim/" web/e2e/sw.spec.ts
git grep -n 'noema-shell' -- web tests
```
Expected: `web/public/sw.js` (1, untouched yet), `web/scripts/sw-precache.mjs` (1), `web/e2e/v1/sw.js` (1, the fixture), and in `web/e2e/sw.spec.ts` exactly the lines of the takeover test that name `noema-shell-v1` (its title and its `toContain`), each ending in `// rename-shim: …`. In that takeover test, insert after the `await expect.poll(() => page.evaluate(() => caches.keys())).toContain('noema-shell-v1');` line:
```ts
    await page.evaluate(() => caches.open('dhara-shell-stale'));   // an older build of the renamed worker is purged too
```
Then:
```bash
npm --prefix web test -- src/buildScripts.test.ts
```
Expected: FAIL — the header still says `noema-shell-`.

- [ ] **Step 2: Build script and worker**

`web/scripts/sw-precache.mjs`: `` const cache = `noema-shell-${…}`; `` → `` const cache = `dhara-shell-${…}`; ``.

`web/public/sw.js`: add after the `/* global CACHE, PRECACHE */` line
```js
const STALE_PREFIXES = ['dhara-shell-', 'noema-shell-'];   // rename-shim: pre-rename caches are purged for one release
```
and replace the `activate` filter `keys.filter((key) => key.startsWith('noema-shell-') && key !== CACHE)` with `keys.filter((key) => key !== CACHE && STALE_PREFIXES.some((prefix) => key.startsWith(prefix)))`.

- [ ] **Step 3: GREEN and commit**

```bash
cd /home/p4nic/code/noema
npm --prefix web test -- src/buildScripts.test.ts
npm --prefix web run build && npm --prefix web run e2e -- e2e/sw.spec.ts
.venv/bin/python -m pytest tests/test_core.py -q -k frontend
git add web/scripts/sw-precache.mjs web/public/sw.js web/src/buildScripts.test.ts web/e2e/sw.spec.ts tests/test_core.py
git commit -m "feat(web): dhara-shell cache prefix; the worker purges noema-shell caches too"
```
Expected: build prints `dist/sw.js: dhara-shell-…`; all five `sw.spec.ts` tests green (the takeover test ends with `caches.keys()` equal to `[cache]`, so both `noema-shell-v1` and `dhara-shell-stale` are gone).

---

### Task 7: Electron profile move, app name, stderr prefix, package name

**Files:**
- Modify: `electron/src/profile.ts`, `electron/test/profile.test.ts`, `electron/src/main.ts`, `electron/e2e/managed.spec.ts`, `electron/package.json`, `electron/package-lock.json`

**Interfaces:**
- `profile.ts`: `resolveProfile(option, env, cwd)` → `…/dhara/electron` default; `legacyProfile(env) -> string` (the old default); `adoptLegacyProfile(profile, legacy, log) -> string` (the path to use).
- `main.ts`: an explicit `--profile` is never moved; without one, the old default is renamed to the new default before `app.setPath('userData', …)` and the single-instance lock; stderr lines start with `Dhara:`; window `title: 'Dhara'`.
- `electron/package.json`: `"name": "dhara-desktop"`, `"productName": "Dhara"`.

- [ ] **Step 1: Failing tests**

```bash
cd /home/p4nic/code/noema
perl -pi -e 's#/noema/electron#/dhara/electron#g' electron/test/profile.test.ts
```
Then in `electron/test/profile.test.ts` change the vitest import to `import { afterEach, describe, expect, it, vi } from 'vitest';`, the profile import to `import { adoptLegacyProfile, legacyProfile, PROFILE_MESSAGES, prepareProfile, resolveProfile } from '../src/profile.js';`, and append:
```ts
describe('adoptLegacyProfile (rename spec §4.6)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function home() {
    const root = temp();
    const legacy = path.join(root, '.local/share/noema/electron');   // rename-shim: the pre-rename default
    fs.mkdirSync(legacy, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(legacy, 'Cookies'), 'session');
    return { env: { HOME: root }, legacy };
  }

  it('moves the old default profile to the new path once, data and mode included', () => {
    const { env, legacy } = home();
    const log = vi.fn<(line: string) => void>();
    const profile = resolveProfile(null, env, '/c');
    expect(profile).toBe(path.join(env.HOME, '.local/share/dhara/electron'));
    expect(legacyProfile(env)).toBe(legacy);
    expect(adoptLegacyProfile(profile, legacy, log)).toBe(profile);
    expect(fs.readFileSync(path.join(profile, 'Cookies'), 'utf8')).toBe('session');
    expect(fs.existsSync(legacy)).toBe(false);
    expect(fs.statSync(profile).mode & 0o777).toBe(0o700);
    expect(log).not.toHaveBeenCalled();
    expect(adoptLegacyProfile(profile, legacy, log)).toBe(profile);   // next launch: nothing to move
  });

  it('never moves over an existing new profile', () => {
    const { env, legacy } = home();
    const profile = resolveProfile(null, env, '/c');
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(path.join(profile, 'Cookies'), 'newer');
    expect(adoptLegacyProfile(profile, legacy, vi.fn())).toBe(profile);
    expect(fs.readFileSync(path.join(profile, 'Cookies'), 'utf8')).toBe('newer');
    expect(fs.existsSync(path.join(legacy, 'Cookies'))).toBe(true);
  });

  it('keeps using the old path and logs one line when the rename fails (another filesystem)', () => {
    const { env, legacy } = home();
    const log = vi.fn<(line: string) => void>();
    const profile = resolveProfile(null, env, '/c');
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw Object.assign(new Error('EXDEV: cross-device link not permitted'), { code: 'EXDEV' });
    });
    expect(adoptLegacyProfile(profile, legacy, log)).toBe(legacy);
    expect(fs.existsSync(path.join(legacy, 'Cookies'))).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatch(/^Dhara: could not move the profile from .* to .* \(EXDEV\); using the old location$/);
  });
});
```

```bash
cd /home/p4nic/code/noema
npm --prefix electron run unit -- test/profile.test.ts
```
Expected: FAIL — `resolveProfile` still returns `…/noema/electron`, and `adoptLegacyProfile`/`legacyProfile` are not exported.

- [ ] **Step 2: Profile module**

Replace `electron/src/profile.ts` entirely:
```ts
import fs from 'node:fs';
import path from 'node:path';
import { absolutePath, ensurePrivateDir, hasFinalComponent } from './paths.js';

// The profile holds the session cookie: it is credential storage (spec §6.3).
export const PROFILE_MESSAGES = {
  noHome: 'Cannot locate profile; supply --profile PATH',
  dedicated: 'Choose a dedicated profile directory',
  create: 'Cannot create the Electron profile',
  protect: 'Cannot protect profile',
} as const;

function dataHome(env: NodeJS.ProcessEnv): string {
  const xdg = env.XDG_DATA_HOME;
  const base = xdg && path.isAbsolute(xdg) ? xdg : env.HOME ? path.join(env.HOME, '.local/share') : null;
  if (base === null) throw new Error(PROFILE_MESSAGES.noHome);
  return base;
}

export function resolveProfile(option: string | null, env: NodeJS.ProcessEnv, cwd: string): string {
  if (option !== null) return absolutePath(option, cwd);
  return path.join(dataHome(env), 'dhara', 'electron');
}

/** The pre-rename default profile directory (rename spec §4.6); the dated follow-up deletes this and adoptLegacyProfile. */
export function legacyProfile(env: NodeJS.ProcessEnv): string {
  return path.join(dataHome(env), 'noema', 'electron');   // rename-shim: old default location
}

/** Moves the old default profile to the new path once (same filesystem, atomic). If the rename fails, the old path stays in use and one line is logged. */
export function adoptLegacyProfile(profile: string, legacy: string, log: (line: string) => void): string {
  if (fs.existsSync(profile) || !fs.existsSync(legacy)) return profile;
  try {
    fs.mkdirSync(path.dirname(profile), { recursive: true, mode: 0o700 });
    fs.renameSync(legacy, profile);
    return profile;
  } catch (error) {
    log(`Dhara: could not move the profile from ${legacy} to ${profile} (${(error as NodeJS.ErrnoException).code ?? 'error'}); using the old location`);
    return legacy;
  }
}

export function prepareProfile(profile: string): void {
  if (!hasFinalComponent(profile)) throw new Error(PROFILE_MESSAGES.dedicated);
  const failed = ensurePrivateDir(profile);
  if (failed === 'create') throw new Error(PROFILE_MESSAGES.create);
  if (failed === 'protect') throw new Error(PROFILE_MESSAGES.protect);
}
```

- [ ] **Step 3: main.ts, e2e expectations, package name**

`electron/src/main.ts`:
- import line → `import { adoptLegacyProfile, legacyProfile, prepareProfile, resolveProfile } from './profile.js';`
- in `readOptions`, replace `const profile = resolveProfile(options.profile, process.env, process.cwd());` with
  ```ts
    const resolved = resolveProfile(options.profile, process.env, process.cwd());
    // An explicit --profile is never moved; the default location adopts the pre-rename one once (rename spec §4.6), before setPath and the lock.
    const profile = options.profile === null ? adoptLegacyProfile(resolved, legacyProfile(process.env), (line) => process.stderr.write(`${line}\n`)) : resolved;
  ```
- `` exitWith(2, `Noema: ${…}`) `` → `` exitWith(2, `Dhara: ${…}`) ``; `title: 'Noema',` → `title: 'Dhara',`.

```bash
cd /home/p4nic/code/noema
perl -pi -e "s/'Noema: /'Dhara: /g" electron/e2e/managed.spec.ts
git grep -n "Noema: " -- electron
```
Expected: no hits.

`electron/package.json`: `"name": "noema-electron",` → `"name": "dhara-desktop",` and add `"productName": "Dhara",` on the next line. The lock file names the package twice (root and `packages[""]`); rename both in place rather than regenerating the lock:
```bash
cd /home/p4nic/code/noema
perl -pi -e 's/"name": "noema-electron"/"name": "dhara-desktop"/g' electron/package-lock.json
git diff --stat electron/package-lock.json
```
Expected: `2 +-` (two lines changed, nothing else).

- [ ] **Step 4: GREEN and commit**

```bash
cd /home/p4nic/code/noema
npm --prefix electron test
git add electron/src/profile.ts electron/test/profile.test.ts electron/src/main.ts electron/e2e/managed.spec.ts electron/package.json electron/package-lock.json
git commit -m "feat(electron): adopt the noema profile dir as dhara on first launch; Dhara app name, stderr prefix, dhara-desktop package"
```
Expected: build, unit (incl. the three new profile tests) and e2e all green (`managed.spec.ts` now expects `Dhara: …` on stderr).

---

### Task 8: DOM events, IPC channels, globals and localStorage keys (web and Electron sides together)

**Files:**
- Modify: `web/src/events.ts`, `web/src/globals.d.ts`, `web/src/shell/checkpoint.ts`, `web/src/shell/checkpoint.test.ts`, `web/src/shell/notifications.ts`, `web/src/shell/notifications.test.ts`, `web/src/shell/Nav.tsx`, `web/src/shell/Nav.test.tsx`, `web/src/dialogs/Settings.tsx`, `web/src/ui/BackgroundField.tsx`, `web/src/ui/BackgroundField.test.tsx`, `web/src/state/queries.test.tsx`, `web/e2e/fixtures.ts`, `web/e2e/faults.ts`, `web/e2e/nowSeed.ts`, `web/e2e/screenTest.ts`, `web/e2e/harness.spec.ts`, `web/e2e/checkpoint.spec.ts`, `web/e2e/terrain.spec.ts`, `web/e2e/notifications.spec.ts`, `web/e2e/notes.spec.ts`, `web/e2e/outbox.spec.ts`, `web/e2e/plan.spec.ts`, `web/e2e/settings.spec.ts`, `web/e2e/task-capture.spec.ts`, `electron/src/protocol.ts`, `electron/src/preload.cts`, `electron/src/startup-preload.cts`, `electron/src/close.ts`, `electron/static/startup.js`, `electron/test/preload.test.ts`, `electron/e2e/scenario.spec.ts`, `electron/e2e/close.spec.ts`, `electron/e2e/isolation.spec.ts`, `electron/e2e/permissions.spec.ts`, `electron/e2e/relaunch.spec.ts` (the list `git grep -l` prints in Step 2 is authoritative)

**Interfaces:**
- `web/src/events.ts` = `electron/src/protocol.ts` page events: `dhara:checkpoint-close`, `dhara:service-down`, `dhara:service-up`, `dhara:close-approved` (`electron/test/preload.test.ts` keeps them equal). IPC: `dhara:ipc`, `dhara:startup-retry`, `dhara:startup-cancel`, `dhara:startup-status`. Globals: `__dharaCheckpointCloseReady`, `__dharaField`, `window.dharaStartup`.
- `notifications.ts`: `NOTIFICATIONS_KEY = 'dhara-notifications'`; new export `notificationsOptedIn(): boolean` (reads the new key, else `noema-notifications`); `Settings.tsx` uses it. `Nav.tsx`: `SIDEBAR_KEY = 'dhara-sidebar-collapsed'`, read falls back to `noema-sidebar-collapsed`; writes go to the new key only.

- [ ] **Step 1: Failing tests for the two fallbacks**

Append inside the `describe('notifyDueReminders', …)` block of `web/src/shell/notifications.test.ts`:
```ts
  it('honours an opt-in stored under the pre-rename key, and the new key wins once written', async () => {
    const { notifyDueReminders, NOTIFICATIONS_KEY } = await load();
    expect(NOTIFICATIONS_KEY).toBe('dhara-notifications');
    localStorage.clear();
    localStorage.setItem('noema-notifications', '1');   // rename-shim: legacy key
    notifyDueReminders(snapshot(reminder('r1', 'due')));
    expect(shown).toHaveLength(1);
    localStorage.setItem(NOTIFICATIONS_KEY, '0');
    notifyDueReminders(snapshot(reminder('r2', 'due')));
    expect(shown).toHaveLength(1);
  });
```
Append inside the `describe('Nav', …)` block of `web/src/shell/Nav.test.tsx`:
```ts
  it('honours a collapsed flag stored under the pre-rename key until the next toggle', async () => {
    expect(SIDEBAR_KEY).toBe('dhara-sidebar-collapsed');
    localStorage.setItem('noema-sidebar-collapsed', '1');   // rename-shim: legacy key
    renderNavAt('/overview');
    fireEvent.click(await screen.findByRole('button', { name: 'Expand sidebar' }));
    expect(document.querySelector('.sidebar')!.getAttribute('data-collapsed')).toBe('false');
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe('0');
  });
```
```bash
cd /home/p4nic/code/noema
npm --prefix web test -- src/shell/notifications.test.ts src/shell/Nav.test.tsx
```
Expected: both new tests fail on their first line (the keys are still `noema-…`). They stay RED after Step 2 renames the keys, for the reason that matters: the legacy key is then no longer read (`shown` stays empty; the sidebar is not collapsed, so there is no `Expand sidebar` button), until Step 3 adds the fallbacks. Then prove the cross-package guard:
```bash
perl -pi -e "s/'noema:/'dhara:/g" web/src/events.ts
npm --prefix electron run unit -- test/preload.test.ts
```
Expected: `page event names equal web/src/events.ts` FAILS (web renamed, Electron not yet).

- [ ] **Step 2: The mechanical rename on both sides**

```bash
cd /home/p4nic/code/noema
git grep -l -E "'noema:[a-z-]+'|__noema|noemaStartup|openNoemaDb|noema-test-checkpoint|noema-notifications|noema-sidebar-collapsed" -- web electron ':!web/e2e/v1' \
  | xargs perl -pi -e 'unless (/rename-shim:/) { s/\x27noema:([a-z-]+)\x27/\x27dhara:$1\x27/g; s/__noema/__dhara/g; s/\bnoemaStartup\b/dharaStartup/g; s/openNoemaDb/openDharaDb/g; s/noema-test-checkpoint/dhara-test-checkpoint/g; s/noema-notifications/dhara-notifications/g; s/noema-sidebar-collapsed/dhara-sidebar-collapsed/g }'
git grep -n -E "'noema:[a-z-]+'|__noema|noemaStartup|openNoemaDb|noema-test-checkpoint|noema-notifications|noema-sidebar-collapsed" -- web electron
```
Every event and IPC name is a single-quoted literal (`'noema:close-approved'`, `['noema:…']`, `('noema:…'`), so the pattern is the quoted literal, never bare `noema:` — that is also the Playwright fixture property (`{ noema: NoemaServer }`, `noema: async ({}, use)`), which must keep its name until the Task 9 sweep renames fixture and callers together. Expected: only the two `// rename-shim: legacy key` test lines from Step 1. (The test title `'refetches on noema:service-up'` in `web/src/state/queries.test.tsx` is prose inside a longer string; the Task 9 sweep flips it.)

- [ ] **Step 3: The two read fallbacks**

`web/src/shell/notifications.ts`: replace the `NOTIFICATIONS_KEY` line and the `optedIn` function with
```ts
export const NOTIFICATIONS_KEY = 'dhara-notifications';
const LEGACY_NOTIFICATIONS_KEY = 'noema-notifications';   // rename-shim: read until Settings writes the new key

export function notificationsOptedIn(): boolean {
  try { return (localStorage.getItem(NOTIFICATIONS_KEY) ?? localStorage.getItem(LEGACY_NOTIFICATIONS_KEY)) === '1'; } catch { return false; }
}
```
and in `notifyDueReminders` replace `!optedIn()` with `!notificationsOptedIn()`.

`web/src/dialogs/Settings.tsx`: delete its local `notificationsOn()` function (the seven lines from `function notificationsOn(): boolean {` to its closing `}`), import `notificationsOptedIn` from `'../shell/notifications'` (keep the `NOTIFICATIONS_KEY` import; the two `setItem` writes stay), and change `useState(notificationsOn)` to `useState(notificationsOptedIn)` (`grep -n notificationsOn web/src/dialogs/Settings.tsx` → none left).

`web/src/shell/Nav.tsx`: replace the `SIDEBAR_KEY` line and `readCollapsed` with
```ts
export const SIDEBAR_KEY = 'dhara-sidebar-collapsed';
const LEGACY_SIDEBAR_KEY = 'noema-sidebar-collapsed';   // rename-shim: read until the next toggle writes the new key

function readCollapsed(): boolean {
  try { return (localStorage.getItem(SIDEBAR_KEY) ?? localStorage.getItem(LEGACY_SIDEBAR_KEY)) === '1'; } catch { return false; }
}
```

- [ ] **Step 4: GREEN and one commit for both sides**

```bash
cd /home/p4nic/code/noema
npm --prefix web test
npm --prefix web run build && npm --prefix web run e2e -- e2e/checkpoint.spec.ts e2e/terrain.spec.ts e2e/notifications.spec.ts e2e/harness.spec.ts e2e/refetch.spec.ts
npm --prefix electron test
git grep -n -E "exposeInMainWorld\('dharaStartup'|'dhara:ipc'|'dhara:close-approved'" -- electron/src
git add web/src/dialogs/Settings.tsx $(git grep -l -E "'dhara:[a-z-]+'|__dhara|dharaStartup|openDharaDb|dhara-test-checkpoint|dhara-notifications|dhara-sidebar-collapsed" -- web electron)
git status --porcelain --untracked-files=no | grep -v '^[MRAD]  ' ; echo "unstaged above (expect none)"
git commit -m "refactor: dhara:* page events, IPC channels and window globals on both sides; localStorage keys with read fallback"
```
Expected: all green; the grep shows the three renamed literals in `startup-preload.cts`, `preload.cts` (two) and `protocol.ts`; nothing unstaged.

---

### Task 9: The brand sweep, with the grep gate written first

**Files:**
- Create: `tests/test_rename_gate.py`
- Modify: every tracked text file outside the allowed set that still contains `noema`/`Noema`/`NOEMA` (`git grep -I -l -i noema` decides; expect `web/src/strings.ts`, `strings.test.ts`, `api/client.ts`+test, `main.tsx`, `index.html`, `public/manifest.webmanifest`, `shell/AppShell.tsx`, `shell/Nav.tsx`, `web/package.json`, `web/package-lock.json`, every `web/e2e/*.ts` (fixture and server names), every `electron/e2e/*.ts` and `electron/test/*.ts` (`launchNoema`, temp-dir prefixes, `NOEMA_FAKE_*`), `electron/src/permissions.ts`, `cli.ts`, `startup-preload.cts`, `static/startup.html`, `scripts/link-sandbox.mjs`, `dhara/server.py` (messages, export file names, `title='Noema'`), `dhara/worker.py`, `dhara/store.py`, `run.py`, `tools/*.py`, `qa/*.py`, `tests/*.py`, `README.md`, `docs/*.md`)

**Interfaces:**
- `tests/test_rename_gate.py` exports `ALLOWED_PATHS`, `KEEP_TOKENS`, `MARKERS`, `is_allowed_path(name)`, and the tests `test_no_old_name_outside_the_allowed_set`, `test_no_noema_env_read_outside_the_helper`, `test_marker_lines_are_listed_for_the_follow_up`, `test_docs_case_rules[name]`. The sweep script below imports the first three names, so the sweep and the gate can never disagree.
- Sweep substitutions, in order, on every non-marker line of every non-allowed file, with `KEEP_TOKENS` protected: `NOEMA` → `DHARA` (covers `NOEMA_`), `Noema` → `Dhara`, `noema` → `dhara`. No word boundaries are needed: every derived identifier must flip (`NoemaServer` → `DharaServer`, `startNoema` → `startDhara`, `launchNoema` → `launchDhara`, `noema-web` → `dhara-web`, `noema.json` → `dhara.json`, `noema-export.zip` → `dhara-export.zip`, `noema-e2e-` → `dhara-e2e-`, `NOEMA_QA_URL` → `DHARA_QA_URL`, `x-noema-request` in old-style QA scripts → `x-dhara-request`). `noema-local-v1`, `noema-shell-`, `noema_session`, `.noema-service.lock` and the env prefix survive only on marker lines or in allowed files, which Tasks 1–8 arranged.

- [ ] **Step 1: The gate (RED)**

Create `tests/test_rename_gate.py`:
```python
"""Rename gates (rename spec §6): no old name outside the allowed set, no NOEMA_ read outside the env helper, docs case rules."""
from pathlib import Path
import re
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]

# Paths that keep the old name: archives and evidence, this migration's specs and plans, the shims and the migration code
# with their tests, the historical v1 service-worker fixture, and the regenerated manifest (it lists the shim package).
ALLOWED_PATHS = (
    'docs/Noema-Documentation/', 'docs/Noema-Handbook.md', 'docs/superpowers/', 'experiments/',
    'noema/', 'dhara/env.py', 'electron/src/env.ts', 'electron/test/env.test.ts',
    'web/src/local/migrate.ts', 'web/src/local/migrate.test.ts', 'web/e2e/v1/sw.js',
    'tests/test_shims.py', 'tests/test_rename_gate.py', 'SHA256SUMS',
)
# Substrings that are right as they are: archive paths, the README's history line,
# and the repository directory plus the cutover backup beside it: paths on the owner's disk, out of scope (spec §1).
KEEP_TOKENS = ('Noema-Handbook', 'Noema-Documentation', 'formerly Noema', '/code/noema',
               '/tmp/noema-', 'share/noema/webview', 'share/noema-dev')  # historical scratch paths and real pre-rename directories stay as recorded
# A line that keeps an old name on purpose says why: rename-shim (removed by the dated follow-up) or rename-keep (permanent).
MARKERS = ('rename-shim:', 'rename-keep:')
COMPAT_HEADING = re.compile(r'^## .*Compatibility with Noema')
OLD = re.compile('noema', re.IGNORECASE)


def is_allowed_path(name):
    return any(name == allowed or name.startswith(allowed) for allowed in ALLOWED_PATHS)


def tracked_text_files():
    listed = subprocess.run(['git', 'ls-files', '-z'], cwd=ROOT, capture_output=True, check=True).stdout.decode()
    for name in listed.split('\0'):
        if not name or is_allowed_path(name) or not (ROOT / name).is_file():
            continue
        try:
            yield name, (ROOT / name).read_text(encoding='utf-8')
        except UnicodeDecodeError:
            continue  # fonts, images


def excused(name, line, in_compat):
    if in_compat or any(marker in line for marker in MARKERS):
        return True
    for token in KEEP_TOKENS:
        line = line.replace(token, '')
    return not OLD.search(line)


def old_name_lines(name, text):
    in_compat = False
    for number, line in enumerate(text.split('\n'), 1):
        if name.endswith('.md') and line.startswith('## '):
            in_compat = bool(COMPAT_HEADING.match(line))
        if not excused(name, line, in_compat):
            yield f'{name}:{number}: {line.strip()}'


def test_no_old_name_outside_the_allowed_set():
    hits = [hit for name, text in tracked_text_files() for hit in old_name_lines(name, text)]
    assert hits == []


ENV_READ = re.compile(r"""(getenv|environ|process\.env|\benv)\s*(\.get)?\s*[.\[(]?\s*['"]?NOEMA_""")


def test_no_noema_env_read_outside_the_helper():
    hits = [f'{name}:{number}: {line.strip()}' for name, text in tracked_text_files()
            for number, line in enumerate(text.split('\n'), 1)
            if ENV_READ.search(line) and not any(marker in line for marker in MARKERS)]
    assert hits == []


def test_marker_lines_are_listed_for_the_follow_up():
    # One grep finds every compat line; the dated follow-up removes exactly these and the allowed shim files.
    listing = subprocess.run(['git', 'grep', '-n', 'rename-shim:'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    for expected in ('dhara/server.py', 'dhara/store.py', 'web/public/sw.js', 'electron/src/profile.ts', 'web/src/shell/notifications.ts', 'web/e2e/server.ts'):
        assert expected in listing


PROSE_DOCS = ['README.md'] + sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / 'docs').glob('*.md') if not p.name.startswith('Noema-'))
CAPS_IN_PROSE = re.compile(r'(?<![`A-Z_])DHARA(?![_A-Z`])')
LOWER_AT_SENTENCE_START = re.compile(r'(^|[.!?]\s+)dhara(?=[\s,;:)])', re.MULTILINE)


@pytest.mark.parametrize('name', PROSE_DOCS)
def test_docs_case_rules(name):
    text = (ROOT / name).read_text(encoding='utf-8')
    assert [m.group(0) for m in CAPS_IN_PROSE.finditer(text)] == []
    assert [m.group(0) for m in LOWER_AT_SENTENCE_START.finditer(text)] == []
```

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_rename_gate.py -q 2>&1 | tail -5
```
Expected: `test_no_old_name_outside_the_allowed_set` FAILS with hundreds of hits (brand text, fixtures, docs); `test_marker_lines_are_listed_for_the_follow_up` PASSES (Tasks 2–8 added every marker; if it names a file, that task missed its marker — add it before sweeping); `test_no_noema_env_read_outside_the_helper` FAILS only on harness-internal reads that Task 2 left for the sweep (`os.environ['NOEMA_QA_*']` in `qa/*_probe.py`, `os.environ.get('NOEMA_FAKE_*')` in `electron/test/fixtures/fake_service.py`) — any other hit is a config read Task 2 missed: route it through `env()` first.

- [ ] **Step 2: Confirm the notebook-file shim line is marked (added by Task 4)**

```bash
git grep -n 'rename-shim:' -- dhara/store.py
```
Expected: exactly one line, `OLD_NOTEBOOK = 'noema.sqlite3'  # rename-shim: …`.

- [ ] **Step 3: The sweep (one-off; the script is not committed)**

```bash
cd /home/p4nic/code/noema
.venv/bin/python - <<'EOF'
"""Brand sweep (rename plan Task 9). Shares the gate's allowlist, tokens and markers; never touches a marker line."""
import subprocess, sys
sys.path.insert(0, 'tests')
from test_rename_gate import KEEP_TOKENS, MARKERS, is_allowed_path

files = subprocess.run(['git', 'grep', '-I', '-l', '-i', 'noema', '--', '.'], capture_output=True, text=True).stdout.split('\n')
changed = []
for name in filter(None, files):
    if is_allowed_path(name):
        continue
    text = open(name, encoding='utf-8').read()
    out = []
    for line in text.split('\n'):
        if any(marker in line for marker in MARKERS):
            out.append(line)
            continue
        for index, token in enumerate(KEEP_TOKENS):
            line = line.replace(token, f'\x00{index}\x00')
        line = line.replace('NOEMA', 'DHARA').replace('Noema', 'Dhara').replace('noema', 'dhara')
        for index, token in enumerate(KEEP_TOKENS):
            line = line.replace(f'\x00{index}\x00', token)
        out.append(line)
    new = '\n'.join(out)
    if new != text:
        open(name, 'w', encoding='utf-8').write(new)
        changed.append(name)
print('\n'.join(changed))
EOF
git diff --stat -- docs/Noema-Documentation docs/Noema-Handbook.md experiments docs/superpowers web/e2e/v1 noema | tail -1
```
Expected: the changed files are printed; the final `git diff --stat` on the allowed paths prints nothing (archives untouched).

- [ ] **Step 4: Review the diff for the four things a blanket replace can get wrong**

```bash
cd /home/p4nic/code/noema
git diff -U0 | grep -E '^\+' | grep -E 'dhara-local-v1.*rename-shim|dhara-shell-v1|Dhara-Handbook|Dhara-Documentation|code/dhara' ; echo "(expect nothing above: the repository directory and /home/p4nic/code/noema-cutover-backup/ keep their names)"
git diff -U0 | grep -E '^\+' | grep -E '(^\+|[.!?] )dhara[ ,.;:]' ; echo "(sentence-start dhara above: rewrite by hand as Dhara)"
git grep -n -i noema -- web/e2e/fixtures.ts web/e2e/server.ts electron/e2e/fixtures.ts
```
Expected: the first two greps print nothing; the third prints only `rename-shim:` lines (the legacy env regex in `server.ts`). The fixture type is now `DharaServer`, the Playwright fixture `dhara: DharaServer`, the helpers `startDhara`/`launchDhara`.

- [ ] **Step 5: Typecheck, build, unit, pytest (GREEN for the gate)**

```bash
cd /home/p4nic/code/noema
npm --prefix web ci && npm --prefix web run build && npm --prefix web test
npm --prefix electron run build && npm --prefix electron run unit
.venv/bin/python -m pytest -q
```
Expected: all green, including `tests/test_rename_gate.py` (4 tests + the parametrised docs cases) and `tests/test_cutover*.py` (their `REQUIRED` snippets were swept together with the docs). `web/src/strings.test.ts` passes because `strings.ts` and the test literal were swept together. A failure here is a renamed identifier whose definition lives on a marker line or in an allowed file: find it with `git grep -n -i noema -- <file>` and either move the marker or rename by hand.

- [ ] **Step 6: E2E on both sides**

```bash
cd /home/p4nic/code/noema
npm --prefix web run e2e
npm --prefix electron run e2e
```
Expected: green. (`electron/e2e/managed.spec.ts` asserts the `Dhara:` prefix from Task 7; `web/e2e/sw.spec.ts` still seeds the v1 worker from the untouched `web/e2e/v1/sw.js`.)

- [ ] **Step 7: Commit**

```bash
cd /home/p4nic/code/noema
git add -u tests/test_rename_gate.py
git status --porcelain | grep -v -E '^(M  |A  tests/test_rename_gate.py$|\?\?)' ; echo "(expect nothing above: every change is a modification of a tracked file, plus the added gate file)"
git commit -m "refactor: rename Noema to Dhara across code, tests, fixtures, packages and docs"
```
`git add -u` stages exactly the tracked files the sweep modified (its file list came from `git grep`, which sees tracked files only) plus the new `tests/test_rename_gate.py` (named explicitly: `git add -u` alone would skip it). Never `git add -A` here: the tree holds untracked archives and evidence (`docs/Noema-Documentation/`, `qa/`, `experiments/`, `reference-images/`) that must stay untracked.

---

### Task 10: Docs — README धारा line, compatibility sections, re-pointed test titles, SHA256SUMS

**Files:**
- Modify: `README.md`, `docs/DESKTOP.md`, `docs/SECURITY.md`, `docs/PROGRESS.md` (rollback step 3), `docs/superpowers/specs/parity-map.md`, `docs/superpowers/specs/handbook-trace.md`, `SHA256SUMS`

**Interfaces:**
- README line 1 is `# Dhara · 0.1.0` (from the sweep); line 3 is the one sentence below, the repository's only धारा.
- `docs/DESKTOP.md` and `docs/SECURITY.md` each end with a `## Compatibility with Noema-era installs` section (the gate's excused section).
- Every test title cited in `parity-map.md`/`handbook-trace.md` exists verbatim in its test file (the last grep of Step 3 proves it for the one title the rename changes).

- [ ] **Step 1: README**

```bash
cd /home/p4nic/code/noema
head -1 README.md    # expect: # Dhara · 0.1.0
perl -0pi -e 's/^(# Dhara · 0\.1\.0\n)/$1\nDhara (formerly Noema; the product handbook still uses the old name) — धारा, "stream". Existing installs keep their data, cookies, tokens and settings; the compatibility sections at the end of [docs\/DESKTOP.md](docs\/DESKTOP.md) and [docs\/SECURITY.md](docs\/SECURITY.md) list what is still read under the old names for one release.\n/' README.md
sed -n '1,4p' README.md
git grep -c 'धारा' -- . ':!docs/superpowers/'
```
Expected: the new sentence on line 3; the count command prints exactly `README.md:1`.

- [ ] **Step 2: Compatibility sections**

Append to `docs/DESKTOP.md`:
```markdown

## Compatibility with Noema-era installs

Dhara was Noema until 2026-10-12. These shims keep an existing install working and are removed one release later; `git grep -n 'rename-shim:'` lists every line involved.

- **Profile directory.** On the first launch without `--profile`, `$XDG_DATA_HOME/noema/electron` (default `~/.local/share/noema/electron`) is renamed to `…/dhara/electron`. If the rename fails (for example a different filesystem), the old directory stays in use and one `Dhara:` line is printed to stderr. The single-instance lock follows the directory. An explicit `--profile` is never moved.
- **Local browser data.** On the first page load the database `noema-local-v1` is copied record by record into `dhara-local-v1` (queued captures keep their ids and upload once), then deleted. If anything fails, both databases stay as they were and the page shows "Local data could not be migrated; keep this page open and retry" — or "Close other Dhara tabs and retry the local save." when another tab still holds the old database — with a Retry button. A rollback to the pre-rename UI (`docs/PROGRESS.md`, rollback step 3) cannot see `dhara-local-v1`: flush queued captures first.
- **Service worker.** The `dhara-shell-<hash>` worker deletes every `noema-shell-*` cache and every older `dhara-shell-*` cache when it activates.
- **Workspace lock.** The service holds `.dhara-service.lock`; a stale `.noema-service.lock` is ignored.
- **Notebook file.** On the first start after a clean close, `<data>/noema.sqlite3` is renamed to `<data>/dhara.sqlite3` (same directory). If `noema.sqlite3-wal` or `-shm` exists (the previous run did not close cleanly) or the rename fails, the old file is opened as-is and one line is logged; the next clean start retries. If both files exist nothing is moved: `dhara.sqlite3` is opened and the old file is left in place.
- **Environment.** Every `NOEMA_*` variable is still read when the `DHARA_*` one is unset, with one deprecation line per process. Managed launch strips both prefixes from the service's environment.
- **Python.** `from noema.server import create_app` still works and emits a `DeprecationWarning`; new scripts import `dhara`.
```

Append to `docs/SECURITY.md`:
```markdown

## Compatibility with Noema-era installs

Kept for one release after the 2026-10-12 rename; `git grep -n 'rename-shim:'` lists every line.

- **Session cookie.** Login sets `dhara_session`. A `noema_session` cookie written before the rename still authenticates until it expires (14 days); the next login or `POST /api/session` writes the new cookie and clears the old one, and `DELETE /api/session` clears both.
- **Request marker.** `POST /api/session` and every cookie-authenticated non-GET request accept `X-Dhara-Request: 1` or `X-Noema-Request: 1`. The web client, `tools/client.py` and `tools/agent.py` send only the new header.
- **Tokens and settings.** `DHARA_TOKEN`, `DHARA_ACCESS_TOKEN`, `DHARA_ALLOWED_HOSTS`, `DHARA_MODEL`, `DHARA_SPEECH_MODEL`, `DHARA_ALLOW_REMOTE_MODEL` and `DHARA_DATA_DIR` are read first; the `NOEMA_*` names are a logged fallback. The agent wrapper strips both sets from the wrapped command, and the managed service strips both from its own environment.
```

`docs/PROGRESS.md`, rollback step 3 (written by cutover Task 8): the sweep turned "old and new UIs share `noema-local-v1` version 1" into "… share `dhara-local-v1` version 1", which is false once the migration has run — the pre-migration UI reads only the old database, and the migration deletes it. Rewrite that sentence by its post-sweep text (the rest of the step, the Electron-profile "flush first" rule and the two `REQUIRED` git commands in `tests/test_cutover_docs.py`, stay):
```bash
cd /home/p4nic/code/noema
grep -c 'old and new UIs share `dhara-local-v1` version 1' docs/PROGRESS.md     # 1
perl -0pi -e 's/old and new UIs share `dhara-local-v1` version 1, so the old UI in a\s+browser keeps its queued captures\./the Dhara build moves the pre-rename browser database into `dhara-local-v1`\n   on its first load and deletes the old one, so the pre-migration UI finds no\n   queued captures: flush them first (docs\/DESKTOP.md, compatibility section)./' docs/PROGRESS.md
grep -c 'flush them first (docs/DESKTOP.md, compatibility section)' docs/PROGRESS.md     # 1
```

- [ ] **Step 3: Re-point cited test titles (grep-driven)**

```bash
cd /home/p4nic/code/noema
grep -n -E '›.*(NOEMA|Noema|noema)' docs/superpowers/specs/parity-map.md docs/superpowers/specs/handbook-trace.md
perl -pi -e 'if (/› / && !/noema-shell-v1/) { my ($row, $titles) = split(/› /, $_, 2); $titles =~ s/NOEMA_/DHARA_/g; $titles =~ s/Noema/Dhara/g; $titles =~ s/noema/dhara/g; $_ = "$row› $titles"; }' docs/superpowers/specs/parity-map.md docs/superpowers/specs/handbook-trace.md
grep -n -E '›.*(NOEMA|Noema|noema)' docs/superpowers/specs/parity-map.md docs/superpowers/specs/handbook-trace.md ; echo "(expect nothing above)"
git grep -n 'never uses DHARA_DATA_DIR' -- electron/test/service-parity.test.ts docs/superpowers/specs
```
Expected: the first grep lists the rows citing `… never uses NOEMA_DATA_DIR (:292)` (one in each file; possibly others Phase 5 added); after the perl, none; the last grep shows the title in the test file and in both spec files. Only the part after `› ` changed; the Source columns (verbatim `public/app.js` strings such as "Close other Noema tabs…") are history and stay, and so does a row citing the service-worker takeover test, whose title keeps `noema-shell-v1` on a `rename-shim:` line (Task 6). Table B of `parity-map.md` (the `public/app.js` strings) has no Status column, so cutover Task 11's completeness tests never compare its "Noema" labels with the swept `strings.test.ts`.

- [ ] **Step 4: Docs tests, then regenerate SHA256SUMS**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_rename_gate.py tests/test_cutover.py tests/test_cutover_docs.py -q
git add README.md docs/DESKTOP.md docs/SECURITY.md docs/PROGRESS.md docs/superpowers/specs/parity-map.md docs/superpowers/specs/handbook-trace.md
git commit -m "docs: Dhara README line, compatibility sections, rollback note, re-pointed parity and trace test titles"
git ls-files -z | grep -zvx 'SHA256SUMS' | xargs -0 sha256sum > SHA256SUMS
sha256sum -c --quiet SHA256SUMS && echo hashes-ok
test "$(wc -l < SHA256SUMS)" -eq "$(git ls-files | grep -vxc 'SHA256SUMS')" && echo count-ok
grep -c '  dhara/server.py$' SHA256SUMS; grep -c '  noema/__init__.py$' SHA256SUMS
git add SHA256SUMS
git commit -m "chore: regenerate SHA256SUMS after the rename"
```
Expected: gates green; `hashes-ok`, `count-ok`, `1`, `1`.

---

### Task 11: Grep gates and three consecutive clean full-gate runs (no merge)

**Files:**
- Modify: `docs/TEST_REPORT.md` (one paragraph in the cutover's "### Final gate run" section), `SHA256SUMS`; plus the owning task's files if a run fails (one-line `fix: …` commit, then Task 10 Step 4's manifest regeneration, and the count restarts).

**Interfaces:**
- Consumes: the six spec §3 gate commands (contract §0; the same six lines as cutover Task 10 Step 4, log directory renamed), the Phase 5 flake rule: a run counts only when all six commands pass, and three consecutive runs must count; cutover Task 13's checks (Step 1 clean tree, Step 2 "only `docs/`, `SHA256SUMS`, `tests/test_cutover_docs.py` since `cutover-gate`").
- Produces: tag `cutover-gate` moved to the commit the three runs passed on, so cutover Task 13 holds without redoing cutover Tasks 10–12; nothing merged; a report to the owner.

- [ ] **Step 1: The rename gates and the archive check**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_rename_gate.py tests/test_shims.py -q
git diff --quiet rename-base -- docs/Noema-Documentation docs/Noema-Handbook.md experiments/ui-ab && echo archives-untouched
git grep -c 'धारा' -- . ':!docs/superpowers/'          # README.md:1 only
git grep -n -i -E 'noema' -- . ':!docs/Noema-Documentation' ':!docs/Noema-Handbook.md' ':!docs/superpowers' ':!experiments' ':!noema/' ':!SHA256SUMS' | grep -v -E 'rename-shim:|rename-keep:|Noema-Handbook|Noema-Documentation|formerly Noema|/code/noema|/tmp/noema-|share/noema/webview|share/noema-dev' | grep -v -E '^(dhara/env\.py|electron/src/env\.ts|electron/test/env\.test\.ts|web/src/local/migrate(\.test)?\.ts|web/e2e/v1/sw\.js|tests/test_shims\.py|tests/test_rename_gate\.py|docs/(DESKTOP|SECURITY)\.md):'
git grep -n 'rename-shim:' | wc -l
```
Expected: gates green; `archives-untouched`; `README.md:1`; the long grep prints nothing (the two docs are excluded only because their compatibility sections are excused by the gate, which already checked them line by line); the last number is the follow-up's line count — note it for the report.

- [ ] **Step 2: Three consecutive clean runs of the full gate**

```bash
cd /home/p4nic/code/noema
for run in 1 2 3; do
  G=/tmp/dhara-gate-$run; rm -rf "$G" && mkdir -p "$G"
  gate() { local name="$1"; shift; if "$@" >"$G/$name.log" 2>&1; then echo PASS >"$G/$name.status"; else echo FAIL >"$G/$name.status"; fi; echo "run $run $name: $(cat "$G/$name.status")"; }
  gate web-ci npm --prefix web ci
  gate web-build npm --prefix web run build
  gate web-test npm --prefix web test
  gate web-e2e npm --prefix web run e2e
  gate electron-test npm --prefix electron test
  gate pytest .venv/bin/python -m pytest
  grep -Eil '[0-9]+ (skipped|xfailed|xpassed|flaky|todo)' "$G"/*.log && echo "run $run: a log reports skipped/flaky/todo — treat as FAIL"
done
grep -l FAIL /tmp/dhara-gate-*/*.status ; echo "(expect nothing above)"
```
Expected: eighteen `PASS` lines, no skipped/flaky/todo match, nothing from the final grep. On any FAIL: read the log, fix in the owning task's files, commit with one line, regenerate `SHA256SUMS` exactly as in Task 10 Step 4 (cutover Task 12: the manifest is the last content commit before the merge), and start again at `run 1`. Three consecutive clean runs is the condition; partial credit is not.

- [ ] **Step 3: Move the gate tag, record the runs, regenerate the manifest, hand off (no merge)**

Cutover Task 13 Step 2 accepts only `docs/`, `SHA256SUMS` and `tests/test_cutover_docs.py` changes since `cutover-gate`. The three runs above ran on `HEAD`, so the tag moves here (cutover Task 10 Step 4 moves it the same way after a fix), `docs/TEST_REPORT.md` says so under the cutover's "### Final gate run" (cutover Task 10 Step 7 inserted that section directly before the `## Frictionless task capture · 2026-10-09` heading), and the manifest is regenerated last.
```bash
cd /home/p4nic/code/noema
git status --porcelain --untracked-files=no          # empty
git tag -f cutover-gate
grep -c '^### Handbook §21 main-app memory · measured 2026-10-12$' docs/TEST_REPORT.md     # 1 — the first heading after the Final-gate-run subsections; re-verify, Phase 5 may have moved text
NOTE="Phase 6 (the Dhara rename): the same six commands ran three consecutive times clean on \`$(git rev-parse --short HEAD)\`, where \`cutover-gate\` now points." \
  perl -0pi -e 's/\n(### Handbook §21 main-app memory · measured 2026-10-12\n)/\n$ENV{NOTE}\n\n$1/' docs/TEST_REPORT.md
grep -c 'ran three consecutive times clean on' docs/TEST_REPORT.md               # 1
.venv/bin/python -m pytest tests/test_cutover_docs.py tests/test_rename_gate.py -q
git add docs/TEST_REPORT.md
git commit -m "docs(test-report): record the three clean rename gate runs"
git ls-files -z | grep -zvx 'SHA256SUMS' | xargs -0 sha256sum > SHA256SUMS
sha256sum -c --quiet SHA256SUMS && echo hashes-ok
git add SHA256SUMS
git commit -m "chore: regenerate SHA256SUMS after the rename gate"
git diff --name-only cutover-gate..HEAD              # docs/TEST_REPORT.md and SHA256SUMS only
git log --oneline rename-base..HEAD
git merge-base --is-ancestor HEAD master && echo MERGED-STOP || echo unmerged
```
Expected: `1`, `1`, the docs tests green, `hashes-ok`, exactly the two file names, the commit list, `unmerged`. Report to the owner: the commit list, "three consecutive full-gate runs clean", the `rename-shim:` line count (the dated follow-up's checklist), the archive check, and the five deviations listed at the top of this plan. Ask the owner to test Dhara. **Do not merge**; the merge is cutover Task 13 and needs the owner's explicit yes.

---

## Spec coverage

| Spec item | Task |
|---|---|
| §3 Brand `Dhara` (UI copy, titles, manifest, Electron app name) | 7 (Electron name/title/prefix), 9 (everything else) |
| §3 Python package `dhara/` | 1 |
| §3 Env vars `DHARA_*` | 2 (reads), 9 (remaining literals and QA names) |
| §3 Cookie `dhara_session` | 3 |
| §3 Request marker `X-Dhara-Request` | 3 (server), 9 (client, tools, qa, docs) |
| §3 IndexedDB `dhara-local-v1`, same version/stores/shapes | 5 |
| §3 SW cache `dhara-shell-<buildhash>` | 6 |
| §3 Workspace lock `.dhara-service.lock` | 4 |
| §3 Profile path `$XDG_DATA_HOME/dhara/electron` | 7 |
| §3 DOM events / globals `dhara:*`, `__dharaCheckpointCloseReady`, `__dharaField` | 8 |
| §3 Package names `dhara-local`, `dhara-web`, `dhara-desktop` | 1 (pyproject), 9 (web), 7 (electron) |
| §3 Test fixtures `dhara: DharaServer` | 9 |
| §3 Electron stderr prefix `Dhara:` | 7 |
| §3 QA env `DHARA_QA_*` | 9 (producer and consumers renamed together) |
| §3 Case rules | 9 (`test_docs_case_rules`), 10 |
| §4.1 Env helper, one deprecation line, both prefixes stripped, tools/qa use it | 2 |
| §4.2 Cookie dual-read, new cookie on login, old cleared | 3 |
| §4.3 Marker dual-read; clients send the new header only | 3, 9 |
| §4.4 `local/migrate.ts` before the draft store loads; copy with `add`; delete only after commit; failure leaves both; retry notice; ids preserved; `onblocked` → "Close other Dhara tabs" | 5 (see Deviation 2) |
| §4.5 SW prefix, purge of both prefixes, takeover E2E | 6 |
| §4.6 Profile rename before `setPath`, fallback with one log line, lock follows the path | 7 |
| §4.7 Lock rename, old lock ignored | 4 |
| §4.8 `noema` shim package with `DeprecationWarning`; tools/qa on `dhara` | 1 |
| §4.9 Notebook file `noema.sqlite3` → `dhara.sqlite3`: clean-close guard, never over an existing new file, old path + one log line on failure, second start no-op (owner decision 27B) | 4 |
| §5.1 Mechanical rename with shims, build/typecheck/unit green | 1–4, 7–9 |
| §5.2 Migrations with unit and E2E tests | 5, 6, 7 |
| §5.3 Docs sweep: README (धारा once, "formerly Noema"), docs/*.md, compatibility sections, parity-map/handbook-trace titles, SHA256SUMS | 9 (mechanical), 10 |
| §5.4 Gate with the Phase 5 flake rule | 11 |
| §1 Phase 6 runs after cutover Task 12 and before Task 13; nothing in cutover Tasks 1–12 is redone except the docs sweep | Preflight (Task 12 done, unmerged), 1 Step 6 (`SCANNED` keeps the shim), 10 (docs), 11 Step 3 (`cutover-gate` moved; Task 13 Step 2's diff rule holds) |
| §6 Env fallback (pytest + vitest), managed launch strips both prefixes | 2 |
| §6 Cookie fallback (pytest) | 3 |
| §6 Marker fallback (pytest) | 3 |
| §6 IndexedDB migration (vitest fake-indexeddb: migrated once, ids preserved, old deleted; failure mid-copy leaves both; second boot no-op; E2E seed `noema-local-v1` → uploads once with original id) | 5 |
| §6 SW takeover E2E (`noema-shell-*` → `dhara-shell-*`, old caches gone) | 6 |
| §6 Profile rename (electron unit, temp HOME; failure keeps old path) | 7 |
| §6 Python shim (pytest) | 1 |
| §6 Grep gates (no `Noema`/`noema` outside the allowed set; no `NOEMA_` read outside the env helper) | 9 (created, GREEN), 11 (final run) |
| §1 Out of scope untouched (repo dir, branches, history, handbook, archive, experiments) | 9 (allowlist), 11 (`git diff --quiet rename-base -- …`) |
| §7 Risks: queued captures / logout / external scripts / other filesystem / handbook name | Review Focus 1–4; README line (Task 10) |
