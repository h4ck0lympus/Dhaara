# Phase 5 — Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the superseded `public/` UI, the Rust `desktop/` shell and the experiment's wry/companion hosts, move the kitten sprite, rewrite the §9 documents, make sure the spec §7 terrain budget is measured exactly once and recorded (by the terrain plan's Task 9 procedure, run here if it has not run yet), measure the handbook §21 memory aspiration, prove the parity gate and handbook trace are complete, regenerate `SHA256SUMS`, and merge `feat/react-electron` into `master` once — only after the owner approves.

**Architecture:** No new runtime code. Two small pytest modules (`tests/test_cutover.py`, `tests/test_cutover_docs.py`) turn the cutover's promises into permanent checks: deleted trees stay deleted, no runtime code points at them, current-instruction docs name only the new stack, TEST_REPORT records the measured numbers and a green gate, and every parity-map / handbook-trace row is green (or an approved drop). The terrain budget is measured once with the terrain plan's Task 9 harness: if `docs/TEST_REPORT.md` already has its section this phase only checks the record, otherwise Task 9 here executes that procedure (the single run) before checking. The §21 memory check uses a throwaway harness in scratch (decision 13B) that reuses `qa/process_sample.py`'s `measure()`. Rollback is protected by two tags and a backup directory for untracked files that `git` cannot restore.

**Tech Stack:** git, bash, Python 3 + pytest (`.venv/bin/python`), Node 22.23.3 via the `node` devDependency (`npm --prefix electron exec -- node …`), Playwright `_electron` 1.64.0 (already in `electron/`), private headless Sway (`WLR_RENDERER=gles2`).

**Spec:** /home/p4nic/code/noema/docs/superpowers/specs/2026-10-10-react-electron-migration-design.md (sections §1, §2 decisions 1A/4B/11C/13B/18B/19A, §3, §4.7, §7 Budget, §8, §9, §10, §11) · **Contract:** /home/p4nic/code/noema/docs/superpowers/plans/2026-10-10-react-electron/00-contract.md

Contract naming note: contract §10 puts the cutover rows in the P6 file `06-electron-cutover.md`. The orchestrator split P6 into `05-electron.md` (Electron rows) and this file (cutover rows: the spec §3 deletions and sprite move, the spec §9 docs, `SHA256SUMS`, and the Status columns of `parity-map.md` and `handbook-trace.md`). Ownership is otherwise unchanged. Contract §10 also says "The cutover merge is not part of any plan"; the orchestrator asked for it as this plan's last step, so Task 13 performs it **only** after the owner's explicit yes, which is the owner performing it.

## Prerequisites (which earlier phase files must be complete)

Every earlier plan in `/home/p4nic/code/noema/docs/superpowers/plans/2026-10-10-react-electron/` is fully executed and its final step was green:

- Foundation (contract P1): branch `feat/react-electron`, `web/` scaffold, FastAPI serving of `web/dist`, `display_name`, `docs/superpowers/specs/parity-map.md` and `docs/superpowers/specs/handbook-trace.md` committed.
- Data layer (P2): `web/src/api|local|domain|state`, including `web/src/domain/nowState.test.ts` (the port of `tests/now_state.test.cjs`).
- Shell (P3) and Screens (P4): all screens, dialogs and their E2E specs.
- Terrain (P5, plan `04-terrain.md`): `web/src/ui/BackgroundField.tsx`, `field.ts`, `canvas.background-field[data-state]`.
- Electron shell + lifecycle (the Electron rows of contract P6): `electron/**`, protocol 2 in `noema/desktop_service.py` and `run.py`, `tests/test_managed_service.py` rewritten so it no longer needs `desktop/target/debug/examples/service_probe`.
- The terrain plan's Task 9 (the single spec §7 budget measurement, which needs the Electron shell) has either run — `docs/TEST_REPORT.md` contains its `## Terrain budget · <date>` section, committed on the branch — or not run at all. In the second case this plan's Task 9 Step 2 runs it, once. It is never run twice.

Task 1 verifies these mechanically before anything is deleted.

## Global Constraints (one line each, exact values copied verbatim from the spec that apply to this phase)

- "**Deleted at cutover:** `public/` · `desktop/` · `experiments/ui-ab/hosts/wry` (it depends on the `desktop` crate) · `experiments/ui-ab/hosts/companion`" (§3)
- "`public/cat.png` moves to `tools/assets/cat.png`. That requires a one-line path change in `tools/sway_companion.py:271` and `tests/test_companion.py:15`; both are recorded in `docs/ASSETS.md`." (§3)
- "The experiment's evidence stays as history. Variant A stays on its branch." (§3)
- "All work happens on `feat/react-electron`. `master` keeps the current UI until one cutover merge, which is blocked until §8 passes in full." (§3)
- "`web/dist` is **not committed**." (§3)
- "`SHA256SUMS` is regenerated at cutover." (§3)
- Gate commands: "`npm --prefix web ci`", "`npm --prefix web run build`", "`npm --prefix web test` (Vitest)", "`npm --prefix web run e2e`", "`npm --prefix electron test`", "`.venv/bin/python -m pytest`" (§3)
- "The gate is: every row is green or is an approved drop." (§8)
- "Budget (whole Electron app process tree; Iris Xe; private headless Sway gles2; 1440×900 at scale 1; motion on, reduced motion off; 30 s samples, same method as the benchmark)" (§7)
- "Animated: focused, within 60 s of input (synthetic input during the sample) | < 3% | < 6%" · "Paused: idle timeout or blur | < 1% | ~0%" · "Hidden | < 1% | 0%" (§7)
- "The budget is measured once at cutover with the scratch harness and recorded in TEST_REPORT." (§7)
- "The main app process tree is measured against the handbook's aspiration of < 400 MB excluding AI, and the result is recorded in TEST_REPORT whether or not it passes." (§4.7)
- "the plan includes `docs/superpowers/specs/handbook-trace.md`, which maps every bullet above to the task and test that cover it." (§4.7)
- "The archived handbook is not edited. `SHA256SUMS` is regenerated." (§9)
- Rollback: "Revert the merge commit." · "Old and new UIs share `noema-local-v1` version 1, so a browser rollback keeps queued captures." · "The reinstalled v1 service worker deletes nothing of v1's, and the v2 caches are only stale storage." · "Captures queued inside the **Electron** profile after cutover are not readable by the restored Rust/WebKit shell. **This is accepted.** Flush before rolling back." (§9)
- "Physical Sway acceptance (Stage A) remains pending and is **not** satisfied by this migration. PROGRESS keeps it as the next validation gate" (§10)
- "18B | Slogans | Variant B slogans kept in `web/src/copy.ts`; greeting uses a new `display_name` setting; daily rotation later (§11.2)" (§2)
- "19A | Priority | AI-assigned automatic priority is the next milestone (§11.1); the migration UI already shows the source label" (§2)
- "13B | Benchmark harness | Throwaway; numbers recorded once in TEST_REPORT" (§2)
- Contract §0: every commit message ends with the attribution trailer that the executing session supplies.

## Review Focus (the five input classes/failure modes most likely to bite a user that the spec implies; for each, the owning task must include a test for it)

1. **Untracked files destroyed by the deletions.** `desktop/examples/`, `desktop/qa/scenario.js`, `desktop/.qmlls.ini`, `tests/now_state.test.cjs` and both Rust `target/` trees are untracked or ignored, so `git revert` cannot bring them back. Owner: Task 3 (backup manifest + per-file presence check, `test_superseded_trees_are_deleted`).
2. **Runtime code still pointing at a moved/deleted path.** The Sway helper crashes on first cat render, or a managed-service test silently skips because its Rust probe is gone. Owner: Tasks 2–3 (`test_approved_kitten_asset_is_unmodified` at the new path, `test_nothing_points_at_deleted_trees`, and Task 3 Step 5 removing the `strings.test.ts` check that would otherwise skip forever).
3. **A false green gate.** Parity or trace rows left pending, green rows naming tests that do not exist, a `.only(` or a skipped test hiding a failure, or a spec §4.7 bullet with no row. Owner: Tasks 10–11 (`test_no_focused_tests`, the log scan for `skipped|xfailed|xpassed|flaky|todo`, the four trace tests).
4. **A measurement taken twice, or on an incomplete process tree.** A second terrain run contradicting the terrain phase's single recorded run (spec §7 "measured once"), or a memory figure missing the service or PSS. Owner: Task 9 (Step 2 runs the terrain plan's Task 9 procedure only when no `## Terrain budget · ` section exists, and stops on two; `test_test_report_records_terrain_budget` checks the record; the memory harness samples Electron plus the service and refuses incomplete samples or missing PSS; `test_test_report_records_main_app_memory`).
5. **Rollback or provenance that does not match the tree.** Docs that were untracked on `master` vanish on `git revert`, docs still tell people to run `cargo`/`public/`, or `SHA256SUMS` does not match the tracked files. Owner: Tasks 1, 4–8 and 12 (`cutover-docs-baseline` tag, `test_document_has_no_stale_instruction`, `sha256sum -c` plus the file-count comparison).

Line numbers in **Files:** and in the steps refer to each file as it is before the task starts. Earlier edits in the same task shift later lines, so locate every edit by the quoted text it names.

---

### Task 1: Preflight and pre-migration baseline

**Files:**
- Test: none (git and file checks only)
- Modify (track as-is, no content change): `README.md`, `SHA256SUMS`, `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/ASSETS.md`, `docs/BUILD_STATUS.md`, `docs/CONTINUATION.md`, `docs/DESKTOP.md`, `docs/PHYSICAL_SWAY_ACCEPTANCE.md`, `docs/PROGRESS.md`, `docs/SECURITY.md`, `docs/TEST_REPORT.md`, `docs/TASK_CAPTURE.md`, `docs/Noema-Handbook.md`

**Interfaces:**
- Consumes: branch `feat/react-electron` (contract §0); earlier phases' files listed in Prerequisites.
- Produces: tag `pre-react-electron` (current `master`), tag `cutover-docs-baseline` (the commit holding the pre-migration docs). Tasks 8 and 13 use both names.

These docs, `README.md` and `SHA256SUMS` are untracked on `master` today. If they are first committed already rewritten, `git revert` of the merge deletes them and the pre-migration text is gone. Tracking them unchanged first makes rollback restorable. `docs/TEST_REPORT.md` is already tracked by the terrain plan's Task 9, so its baseline also holds the terrain section; that section is accurate history and harmless after a rollback.

- [ ] **Step 1: Confirm branch and clean tracked tree**

```bash
cd /home/p4nic/code/noema
git rev-parse --abbrev-ref HEAD
git status --porcelain --untracked-files=no
```
Expected: `feat/react-electron`, then no output.

- [ ] **Step 2: Confirm the earlier phases are present**

```bash
cd /home/p4nic/code/noema
for f in web/package-lock.json web/src/domain/nowState.test.ts web/src/ui/BackgroundField.tsx \
         electron/package-lock.json electron/src/lifecycle.ts \
         docs/superpowers/specs/parity-map.md docs/superpowers/specs/handbook-trace.md; do
  test -f "$f" || echo "MISSING $f"
done
grep -c "'protocol': 2" noema/desktop_service.py
grep -c "service_probe" tests/test_managed_service.py
grep -c '^## Terrain budget · ' docs/TEST_REPORT.md
```
Expected: no `MISSING` line; first count `1` or more; second count `0`; third count `1` (the terrain plan's Task 9 ran) or `0` (it has not run; Task 9 Step 2 below runs it). A third count above `1` means the budget was measured twice: stop and ask the owner which record to keep. Any other result: stop and report the missing phase to the owner.

- [ ] **Step 3: Baseline gate run before anything is deleted**

```bash
cd /home/p4nic/code/noema
npm --prefix web ci && npm --prefix web run build && npm --prefix web test && npm --prefix web run e2e && npm --prefix electron test && .venv/bin/python -m pytest   # the full gate, contract §0
echo "gate exit $?"
```
Expected: `gate exit 0`. A failure here belongs to an earlier phase; stop and report it.

- [ ] **Step 4: Tag the pre-migration `master`**

```bash
cd /home/p4nic/code/noema
git tag pre-react-electron master
git rev-parse --short pre-react-electron
```
Expected: a short hash (the current `master` tip, `e0ca9ad` unless `master` moved).

- [ ] **Step 5: Commit the unchanged docs as the baseline and tag it**

```bash
cd /home/p4nic/code/noema
git add README.md SHA256SUMS docs/API.md docs/ARCHITECTURE.md docs/ASSETS.md docs/BUILD_STATUS.md \
  docs/CONTINUATION.md docs/DESKTOP.md docs/PHYSICAL_SWAY_ACCEPTANCE.md docs/PROGRESS.md \
  docs/SECURITY.md docs/TEST_REPORT.md docs/TASK_CAPTURE.md docs/Noema-Handbook.md
git diff --cached --quiet || git commit -m "docs: track pre-migration docs baseline for cutover rollback"
git tag cutover-docs-baseline
git show cutover-docs-baseline:docs/DESKTOP.md | head -1
```
Expected: last line `# Rust webview desktop · original interface restored`.

---

### Task 2: Move the kitten sprite to `tools/assets/cat.png`

**Files:**
- Modify: `tests/test_companion.py:15`
- Modify: `tools/sway_companion.py:271`
- Move: `public/cat.png` → `tools/assets/cat.png` (bytes unchanged, sha256 `bc81d2ce788db7c6cd6cf5971b61450a9949c571cbaebe64b65d49d481ab3d0f`)

**Interfaces:**
- Consumes: existing `test_approved_kitten_asset_is_unmodified` (`tests/test_companion.py:14-17`).
- Produces: sprite path `tools/assets/cat.png`, documented by Task 7 in `docs/ASSETS.md`.

- [ ] **Step 1: Point the asset test at the new path**

In `tests/test_companion.py`, replace line 15:

```python
    sprite = Path(__file__).resolve().parents[1] / 'public/cat.png'
```
with:
```python
    sprite = Path(__file__).resolve().parents[1] / 'tools/assets/cat.png'
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_companion.py -k approved_kitten_asset_is_unmodified -q
```
Expected: FAIL with `FileNotFoundError: [Errno 2] No such file or directory: '/home/p4nic/code/noema/tools/assets/cat.png'`.

- [ ] **Step 3: Move the file and update the helper (one line)**

```bash
cd /home/p4nic/code/noema
mkdir -p tools/assets
git mv public/cat.png tools/assets/cat.png
```
In `tools/sway_companion.py`, replace line 271:
```python
                sprite = Path(__file__).resolve().parents[1] / 'public/cat.png'
```
with:
```python
                sprite = Path(__file__).resolve().parents[1] / 'tools/assets/cat.png'
```

- [ ] **Step 4: Run the companion tests**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_companion.py -q
sha256sum tools/assets/cat.png
```
Expected: all passed; hash `bc81d2ce788db7c6cd6cf5971b61450a9949c571cbaebe64b65d49d481ab3d0f  tools/assets/cat.png`.

- [ ] **Step 5: Commit**

```bash
cd /home/p4nic/code/noema
git add tests/test_companion.py tools/sway_companion.py
git commit -m "chore(tools): move kitten sprite to tools/assets"
```
(The rename is already staged by `git mv`.)

---

### Task 3: Delete the superseded trees, keeping untracked files recoverable

**Files:**
- Create: `tests/test_cutover.py`
- Modify: `web/src/strings.test.ts` (lines 1–2 imports, 6–7 `APP_JS`/`NEW_KEYS`, 92–98 the `it.skipIf(!existsSync(APP_JS))` check, as written by `01-foundation.md` Task 3 Step 1)
- Delete (tracked): `public/` (8 files left after Task 2), `desktop/` (7 tracked files), `experiments/ui-ab/hosts/wry/` (3), `experiments/ui-ab/hosts/companion/` (6)
- Move out of the repo (untracked/ignored): `desktop/.qmlls.ini`, `desktop/examples/service_probe.rs`, `desktop/qa/scenario.js`, `desktop/target/` (3.6 GB), `experiments/ui-ab/hosts/wry/target/` (1.6 GB), `tests/now_state.test.cjs` → `/home/p4nic/code/noema-cutover-backup/`

**Interfaces:**
- Consumes: `web/src/strings.test.ts` from `01-foundation.md` Task 3 (its `public/app.js` verbatim check is `it.skipIf(!existsSync(APP_JS))`, which would turn into a permanent `1 skipped` once `public/` is gone and fail Task 10 Step 5).
- Produces: `tests/test_cutover.py` with `ROOT: Path`, `DELETED: list[str]`, `STALE: re.Pattern`, `SCANNED: list[str]`, `SELF_CHECKS: set[str]`, `scanned_files() -> Iterator[Path]`, `test_superseded_trees_are_deleted()`, `test_nothing_points_at_deleted_trees()`. Task 10 adds `test_no_focused_tests()` to this file. Backup directory `/home/p4nic/code/noema-cutover-backup` with `untracked-files.txt` (used by the rollback in Task 8).

Contract §10 gives `web/src/strings.test.ts` to P1. Removing its `public/app.js` check is a direct consequence of the spec §3 deletion that this phase owns; the check already pinned every carried-over string on every earlier gate run, and the `toEqual` pinning of `S` stays.

- [ ] **Step 1: Write the failing test**

Create `tests/test_cutover.py`:

```python
"""Cutover checks (spec §3): superseded code is gone and nothing still points at it."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

DELETED = ['public', 'desktop', 'experiments/ui-ab/hosts/wry',
           'experiments/ui-ab/hosts/companion', 'tests/now_state.test.cjs']

# Quoted path literals only: a comment citing an old source ("port of desktop/src/main.rs:79")
# is history, but a quoted path is something code would open at runtime.
STALE = re.compile(r"""['"](?:\.{1,2}/)*(?:public/|public['"]|desktop/)"""
                   r"""|['"][^'"\n]*(?:hosts/wry|hosts/companion|now_state\.test\.cjs)""")

SCANNED = ['run.py', 'noema', 'tools', 'tests', 'electron/src', 'electron/test', 'electron/e2e',
           'web/src', 'web/e2e', 'web/scripts']
TEXT_SUFFIXES = {'.py', '.ts', '.tsx', '.mts', '.cts', '.mjs', '.js', '.json'}
# These two files name the deleted paths on purpose, as the things they forbid.
SELF_CHECKS = {'tests/test_cutover.py', 'tests/test_cutover_docs.py'}


def scanned_files():
    for name in SCANNED:
        path = ROOT / name
        candidates = [path] if path.is_file() else sorted(path.rglob('*'))
        for file in candidates:
            if (file.is_file() and file.suffix in TEXT_SUFFIXES
                    and '__pycache__' not in file.parts and 'node_modules' not in file.parts
                    and file.relative_to(ROOT).as_posix() not in SELF_CHECKS):
                yield file


def test_superseded_trees_are_deleted():
    assert [name for name in DELETED if (ROOT / name).exists()] == []


def test_nothing_points_at_deleted_trees():
    hits = [f'{file.relative_to(ROOT)}:{number}: {line.strip()}'
            for file in scanned_files()
            for number, line in enumerate(file.read_text(encoding='utf-8').splitlines(), 1)
            if STALE.search(line)]
    assert hits == []
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_cutover.py -q
```
Expected: both FAIL. `test_superseded_trees_are_deleted` with `AssertionError: assert ['public', 'desktop', 'experiments/ui-ab/hosts/wry', 'experiments/ui-ab/hosts/companion', 'tests/now_state.test.cjs'] == []`. `test_nothing_points_at_deleted_trees` with exactly one hit, `web/src/strings.test.ts:6: const APP_JS = fileURLToPath(new URL('../../public/app.js', import.meta.url));` (Step 5 removes it). Any other hit belongs to an earlier phase: stop and report it.

- [ ] **Step 3: Record every untracked or ignored file that the deletion would orphan**

```bash
cd /home/p4nic/code/noema
BACKUP=/home/p4nic/code/noema-cutover-backup
mkdir "$BACKUP"   # fails if it exists: never mix with an older backup
git ls-files --others -- public desktop experiments/ui-ab/hosts/wry \
  experiments/ui-ab/hosts/companion tests/now_state.test.cjs | grep -v '/target/' > "$BACKUP/untracked-files.txt"
cat "$BACKUP/untracked-files.txt"
```
Expected: lists `desktop/.qmlls.ini`, the files under `desktop/examples/` and `desktop/qa/` (including `desktop/qa/scenario.js`) and `tests/now_state.test.cjs`; no `target/` paths.

- [ ] **Step 4: Remove the tracked files, then move every leftover into the backup**

```bash
cd /home/p4nic/code/noema
BACKUP=/home/p4nic/code/noema-cutover-backup
git rm -r -q public desktop experiments/ui-ab/hosts/wry experiments/ui-ab/hosts/companion
for p in public desktop experiments/ui-ab/hosts/wry experiments/ui-ab/hosts/companion tests/now_state.test.cjs; do
  if [ -e "$p" ]; then mkdir -p "$BACKUP/$(dirname "$p")" && mv "$p" "$BACKUP/$p"; fi
done
while read -r f; do test -e "$BACKUP/$f" || echo "MISSING $f"; done < "$BACKUP/untracked-files.txt"
test -d "$BACKUP/desktop/target" && echo target-kept
```
Expected: no `MISSING` line, then `target-kept`. (`mv` within `/home` is a rename, so the 5 GB of build output is not copied.)

- [ ] **Step 5: Remove the `public/app.js` check from `web/src/strings.test.ts`**

Replace the first two lines
```ts
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
```
with
```ts
import { describe, expect, it } from 'vitest';
```
Delete these two lines:
```ts
const APP_JS = fileURLToPath(new URL('../../public/app.js', import.meta.url));
const NEW_KEYS = new Set(['unexpectedResponse', 'unsupportedType', 'totalTooLarge', 'updateReady', 'reload']);
```
Delete this block and the blank line after it:
```ts
  // public/ is deleted at cutover (P6); the check has already pinned every carried-over string by then.
  it.skipIf(!existsSync(APP_JS))('copies every carried-over string verbatim from public/app.js', () => {
    const source = readFileSync(APP_JS, 'utf8');
    for (const [key, value] of Object.entries(S)) {
      if (typeof value === 'string' && !NEW_KEYS.has(key)) expect(source, key).toContain(value);
    }
  });
```

- [ ] **Step 6: Run the cutover tests, the Python suite and Vitest**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_cutover.py -q
.venv/bin/python -m pytest -q
npm --prefix web test
```
Expected: `2 passed`; then the full Python suite passes with no `skipped`; then Vitest passes with no `skipped` in its `Tests` line.

- [ ] **Step 7: Commit**

```bash
cd /home/p4nic/code/noema
git add tests/test_cutover.py web/src/strings.test.ts
git commit -m "chore: delete public/, desktop/ and the superseded experiment hosts"
```

---

### Task 4: README — Node requirement, build step, Electron launch

**Files:**
- Create: `tests/test_cutover_docs.py`
- Modify: `README.md:3-52` (status block), `:58`, `:62`, `:68-73` (Linux block), `:79-85` (Windows block), `:101-102`, `:113`, `:118`, `:123`, `:209`, `:264-266`, `:281`, `:290-343` (Verification + Source layout)

**Interfaces:**
- Consumes: contract S strings `outboxTitle` ('Captures on this device'), §1.1 scripts, §8.1 `start` script.
- Produces: `tests/test_cutover_docs.py` with `ROOT`, `text(name: str) -> str`, `REQUIRED: dict[str, list[str]]`, `STALE_INSTRUCTIONS: list[str]`, `CURRENT_INSTRUCTION_DOCS: list[str]`, `test_document_states_current_fact(name, snippet)`, `test_document_has_no_stale_instruction(name)`. Tasks 5–11 extend these.

- [ ] **Step 1: Write the failing test**

Create `tests/test_cutover_docs.py`:

```python
"""Cutover documentation checks (spec §9): current instructions name the new stack only."""
from pathlib import Path
import re

import pytest

ROOT = Path(__file__).resolve().parents[1]

# Each rewritten document must state these current facts verbatim.
REQUIRED = {
    'README.md': [
        'npm --prefix web ci && npm --prefix web run build',
        'Node 22',
        'npm --prefix electron start -- --server http://127.0.0.1:8765',
        'physical Sway acceptance (handbook §24 Stage A) is still pending',
        'AI-assigned automatic priority',
    ],
}

# Current-instruction documents must not tell anyone to run the deleted shell or UI.
STALE_INSTRUCTIONS = ['cargo run', 'cargo build', 'desktop/target', 'public/app.js', 'companion.html']
CURRENT_INSTRUCTION_DOCS = ['README.md']


def text(name):
    return (ROOT / name).read_text(encoding='utf-8')


@pytest.mark.parametrize('name,snippet', [(n, s) for n, items in REQUIRED.items() for s in items])
def test_document_states_current_fact(name, snippet):
    assert snippet in text(name)


@pytest.mark.parametrize('name', CURRENT_INSTRUCTION_DOCS)
def test_document_has_no_stale_instruction(name):
    content = text(name)
    assert [stale for stale in STALE_INSTRUCTIONS if stale in content] == []
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_cutover_docs.py -q
```
Expected: FAIL — five `test_document_states_current_fact[README.md-…]` cases and `test_document_has_no_stale_instruction[README.md]` with `assert ['desktop/target'] == []`.

- [ ] **Step 3: Rewrite the README status block (lines 3–52)**

Replace everything from line 3 (`See [the maintained progress record]…`) through line 52 (`…earlier screenshot inventories below are historical.`) with:

```markdown
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

Task capture, the capture outbox and the browser database `noema-local-v1`
(version 1) keep their behaviour and record shapes, so captures queued by the
old browser UI upload once after the upgrade. Kitten settings stay in Settings
for the separate Python Sway helper. Priority shows where it came from:
"Auto · rules" or "Set by you". AI-assigned automatic priority ("Auto · AI") is
the next milestone and is not built yet; a daily motivating slogan comes later.
```

- [ ] **Step 4: Update the base-app sentence and requirements (lines 58 and 62)**

Replace the paragraph starting `**No GPU, Node build, paid API key` (line 58) with:
```markdown
**No GPU, paid API key, account, or AI model is required for the base app.** Node 22 is needed once to build the interface, not to run it. Optional local models provide transcription and note rewriting. The default app does not record your microphone, capture your screen, download models, or contact an AI service.
```
Replace the line starting `Requirements: Python 3.11 or newer, a current browser` (line 62) with:
```markdown
Requirements: Python 3.11 or newer, Node 22 with npm (pinned in `.nvmrc`) to build the interface, a current Chromium- or Firefox-based browser, and internet access to install the dependencies once. Python 3.13.5 was exercised in this build environment; other operating systems and optional speech wheels still need device testing.
```

- [ ] **Step 5: Add the build step to both install blocks (lines 68–73, 79–85)**

Replace
```text
python -m pip install -r requirements.txt
python run.py --open
```
with
```text
python -m pip install -r requirements.txt
npm --prefix web ci && npm --prefix web run build
python run.py --open
```
Replace
```text
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe run.py --open
```
with
```text
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm --prefix web ci
npm --prefix web run build
.\.venv\Scripts\python.exe run.py --open
```
After the paragraph that follows the Linux block (`The interface is at http://127.0.0.1:8765…`), add:
`````markdown
`web/dist` is not committed. If you skip the build, the API still works and the page at `/` says "Frontend not built: run `npm --prefix web run build`". To use the desktop shell instead of a browser, build it once and start it against the running service:

```bash
npm --prefix electron ci && npm --prefix electron run build
npm --prefix electron start -- --server http://127.0.0.1:8765
```
`````

- [ ] **Step 6: Navigation labels in "First five minutes" (lines 101–102)**

In line 101 replace `1. Open **Plan** and click Task.` with `1. Open **Tasks** and click Task.`; in line 102 replace `2. Open **Now**.` with `2. Open **Overview**.`

- [ ] **Step 7: "What is implemented" rows (lines 113, 118, 123)**

Replace the row starting `| Interface |` (line 113) with:
```markdown
| Interface | Responsive Overview, Capture, Notes and Tasks in a typed React bundle; compact graphite layout with the original headings, subtitles and tagline; optional WebGL2 stroke terrain inside the app (motion off by default, static without WebGL2, paused when hidden, blurred or idle, never under reading or editing surfaces). |
```
Replace the row starting `| Tasks |` (line 118) with:
```markdown
| Tasks | Dependencies, future start, due dates, estimates, notes/session links, transparent automatic priorities labelled "Auto · rules", persistent manual overrides labelled "Set by you", manual or inferred focus. AI-assigned automatic priority ("Auto · AI") is the next milestone, not built yet. |
```
Replace the row starting `| Companion |` (line 123) with:
```markdown
| Companion | Separate experimental native GTK/Sway cat/dot helper (`tools/sway_companion.py`, sprite `tools/assets/cat.png`), output/workspace placement code and click-to-expand task list. The in-app browser preview was removed. |
```

- [ ] **Step 8: Sway companion section (lines 209, 264–266) and storage bullet (line 281)**

Replace the line starting `The browser's cat is a **browser preview**` (line 209) with:
```markdown
The in-app browser kitten preview was removed at the React + Electron cutover. The native Linux helper is separate:
```
Replace lines 264–266 (`Reliable native-presence detection does not exist, so the browser preview is` / `not automatically suppressed by a guess. Event-triggered companion messages` / `are not implemented.`) with:
```markdown
Event-triggered companion messages are not implemented.
```
In line 281 replace `Failed uploads remain in **Settings → Local capture queue** until retried or explicitly discarded.` with `Failed uploads remain in the **Captures on this device** dialog (open it from the status line) until retried or explicitly discarded.`

- [ ] **Step 9: Replace "Verification" and "Source layout" (lines 290–343)**

Replace from `## Verification` through the closing fence of the source-layout block (line 343, keep line 345) with:

`````markdown
## Verification

The cutover gate, run from the repository root after `python -m pip install -e '.[test]'`:

```bash
npm --prefix web ci
npm --prefix web run build
npm --prefix web test
npm --prefix web run e2e
npm --prefix electron test
.venv/bin/python -m pytest
```

The E2E suite starts `run.py` on a temporary data directory and a free port; it
never touches your workspace. Install Playwright's Chromium once with
`npm --prefix web exec -- playwright install chromium`. Results, the terrain
budget and the main-app memory check are in [TEST_REPORT.md](docs/TEST_REPORT.md).
These are real-browser and real-process tests with injected faults. They are not
Android, microphone, PWA-installation, physical power-loss, cloud-sync or
physical Sway tests. The older `qa/` browser and webview harnesses drove the
removed UI and shell and are kept only as history.

## Source layout

```text
run.py                   Local launcher
noema/server.py          HTTP API, local safeguards, serves web/dist, export
noema/store.py           SQLite records, priority/availability policy, state transitions
noema/models.py          Bounded API input validation
noema/worker.py          Single optional AI/transcription worker
noema/desktop_service.py Linux managed-mode lease (protocol 2)
web/                     React + TypeScript interface (npm --prefix web run build)
electron/                Electron desktop shell and managed lifecycle
tools/agent.py           Command tracking + durable event outbox
tools/sway_context.py    Opt-in metadata observer
tools/sway_companion.py  Tiny experimental native Sway overlay (sprite: tools/assets/cat.png)
tools/transcribe.py      Isolated CPU transcription worker
tools/doctor.py          Read-only setup diagnostics
tests/                   Backend, helper and cutover regression tests
qa/                      Device-check helpers, historical harnesses and recorded results
docs/                    Status, architecture, API and security boundaries
experiments/ui-ab/       Variant A/B experiment evidence (history)
```
`````

- [ ] **Step 10: Run the docs test**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_cutover_docs.py -q
```
Expected: `6 passed`.

- [ ] **Step 11: Commit**

```bash
cd /home/p4nic/code/noema
git add README.md tests/test_cutover_docs.py
git commit -m "docs(readme): document the React + Electron build and launch"
```

---

### Task 5: `docs/DESKTOP.md` (Electron, protocol 2) and `docs/PHYSICAL_SWAY_ACCEPTANCE.md` (launch commands)

**Files:**
- Modify: `tests/test_cutover_docs.py` (`REQUIRED`, `CURRENT_INSTRUCTION_DOCS`)
- Modify: `docs/DESKTOP.md:1-318` (whole file replaced)
- Modify: `docs/PHYSICAL_SWAY_ACCEPTANCE.md:3-9`, `:27-31`, `:33-45`, `:69-80`, `:107-121`, `:126-127`, `:139-141`, `:163`, `:247-248`

**Interfaces:**
- Consumes: contract §8.2 `MESSAGES` (exact strings), `validateServer` error text, `CLOSE_TIMEOUT_MS`, close dialog buttons; spec §6.3–6.4; `qa/device_fixture.py --port`, `qa/device_session.py --shell-pid`.
- Produces: new `REQUIRED` entries and two `CURRENT_INSTRUCTION_DOCS` entries.

- [ ] **Step 1: Extend the docs test**

In `tests/test_cutover_docs.py`, add these entries to the `REQUIRED` dict (after the `'README.md'` entry):

```python
    'docs/DESKTOP.md': [
        '# Electron desktop shell',
        'npm --prefix electron start -- --server http://127.0.0.1:8765',
        'lifecycle protocol 2',
        '~/.local/share/noema/electron',
        'chrome-sandbox',
        'Decisions last for the app session only',
        'Treat it as credential storage',
    ],
    'docs/PHYSICAL_SWAY_ACCEPTANCE.md': [
        '**Stage A (handbook §24): PENDING',
        'electron/node_modules/electron/dist/electron electron/',
        'qa/device_fixture.py --port 8765',
        'sha256sum -c --quiet SHA256SUMS',
    ],
```
and replace the `CURRENT_INSTRUCTION_DOCS` line with:
```python
CURRENT_INSTRUCTION_DOCS = ['README.md', 'docs/DESKTOP.md', 'docs/PHYSICAL_SWAY_ACCEPTANCE.md']
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_cutover_docs.py -q
```
Expected: FAIL — the eleven new `test_document_states_current_fact` cases, plus `test_document_has_no_stale_instruction[docs/DESKTOP.md]` (`['cargo run', 'cargo build', 'desktop/target', 'public/app.js']`) and `[docs/PHYSICAL_SWAY_ACCEPTANCE.md]` (`['cargo build', 'desktop/target']`).

- [ ] **Step 3: Replace `docs/DESKTOP.md` entirely**

Write the whole file:

`````markdown
# Electron desktop shell

Noema's desktop shell is Electron (`electron/`). It loads the same React bundle
that a browser loads, from the Python service's origin; there is no second UI
and no second API client. It replaced the Rust Wry/Tao shell (`desktop/`) at the
React + Electron cutover, chosen from the 2026-10-10 private headless-Sway
benchmark (idle 269 MiB + 110 MiB GPU versus 347 MiB + 233 MiB; hidden 0.75%
versus 10% of one core). Physical Sway acceptance (handbook §24 Stage A) is
still pending; use the [device checklist](PHYSICAL_SWAY_ACCEPTANCE.md).
Rollback steps are in [PROGRESS.md](PROGRESS.md).

## Build

Requirements: Node 22 (pinned in `.nvmrc`) with npm, plus the Python
environment from the README. Neither build downloads a model or installs
anything system-wide.

```bash
npm --prefix web ci && npm --prefix web run build
npm --prefix electron ci && npm --prefix electron run build
```

`web/dist` is not committed. Without it the API still works and `/` answers
503 "Frontend not built: run `npm --prefix web run build`".

Linux needs Electron's setuid sandbox helper; the shell is never started with
`--no-sandbox`. If Electron reports that `chrome-sandbox` is not configured:

```bash
sudo chown root:root electron/node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 electron/node_modules/electron/dist/chrome-sandbox
```

## Launch in external mode (default)

Start the service you chose, then the shell:

```bash
.venv/bin/python run.py
npm --prefix electron start -- --server http://127.0.0.1:8765
```

External mode only connects. It never starts or stops the service.
`npm --prefix electron start` runs from `electron/`, so give absolute paths.
When you need the shell's own PID (for `qa/device_session.py` or
`qa/process_sample.py`), start the binary directly from the repository root:
`electron/node_modules/electron/dist/electron electron/ --server http://127.0.0.1:8765`.

| Flag | Meaning |
|---|---|
| `--server URL` | Service origin, default `http://127.0.0.1:8765`. A literal loopback IP over http with no credentials, path, query or fragment; anything else exits 2 with "Use a literal loopback HTTP URL, e.g. http://127.0.0.1:8765". |
| `--profile DIR` | Profile, default `$XDG_DATA_HOME/noema/electron`, else `~/.local/share/noema/electron`; created with mode 0700. |
| `--manage-service` | Linux only: start and own the service (below). |
| `--data-dir PATH` | Managed-mode workspace; rejected without `--manage-service`. |
| `--python PATH` | Managed-mode interpreter, default `<repo>/.venv/bin/python`. |
| `--entry-point PATH` | Managed-mode entry script, default `<repo>/run.py`. |
| `--startup-timeout S` | Managed readiness timeout, 0.1–60 s, default 15. |

A second launch on the same profile focuses the first window, ignores its own
arguments and exits 0.

## Opt-in Linux managed mode (lifecycle protocol 2)

```bash
npm --prefix electron start -- --manage-service \
  --data-dir /absolute/path/to/noema-workspace
```

Managed mode serves only `http://127.0.0.1:8765`. The origin includes the port,
and IndexedDB, the outbox and the service worker are stored per origin, so the
port never changes. If 8765 is taken, startup stops with "Endpoint is occupied
or unavailable. Do not stop its occupant; choose external mode or a deliberate
stable endpoint." and offers Retry. The occupant is never contacted or killed.

Startup, in order:

1. Electron resolves `--data-dir`, rejects a path with no final component,
   creates it with mode 0700 (permissions are changed only when it creates the
   directory) and canonicalises it.
2. It spawns `<python> <entry-point> --desktop-managed --host 127.0.0.1 --port 8765
   --data-dir <canonical> --owner-pid <electron pid>` in the child's own process
   group, removes `NOEMA_MODEL`, `NOEMA_SPEECH_MODEL`, `NOEMA_TOKEN`,
   `NOEMA_ACCESS_TOKEN`, `NOEMA_ALLOWED_HOSTS`, `NOEMA_ALLOW_REMOTE_MODEL` and
   `NOEMA_DATA_DIR` from its environment, and writes `{"instance":"<64 hex>"}`
   to its stdin. Stdin stays open as the lifetime lease.
3. Python sets `PR_SET_PDEATHSIG(SIGTERM)`, exits unless its parent is
   `--owner-pid`, reads the lease, takes the `.noema-service.lock` flock, binds
   127.0.0.1:8765 with `SO_REUSEADDR`, starts the stdin-EOF watcher and serves.
   Once serving it prints one line with exactly `protocol` (2), `instance`,
   `pid`, `workspace` and `port`.
4. Electron accepts that line only with exactly those keys and the expected
   values, then requires `GET /api/desktop-instance` to return exactly
   `{protocol: 2, instance, pid}`. Only then does it load the origin.

| Exit | Meaning | Message |
|---|---|---|
| 10 | workspace locked | This workspace already has a service. Use external mode or stop it deliberately. |
| 11 | port in use | Endpoint is occupied or unavailable. Do not stop its occupant; choose external mode or a deliberate stable endpoint. |
| 12 or other | invalid lease or arguments, startup failure | Service exited during startup. Check Python dependencies, entry point and data permissions. |

A missing interpreter shows "Python not found. Check --python and installed
dependencies; no installation is automatic." A timeout shows "Service readiness
timed out. Check Python dependencies and data permissions, then Retry." An
identity mismatch shows "Service identity verification failed. No workspace
credentials were sent." and the origin is never loaded.

| State | What you see | Close or Quit |
|---|---|---|
| starting | Local startup page with status, Retry and Cancel. Retry never spawns while a service process is alive. | Cancel stops the service and quits; no page has loaded, so there is no checkpoint. |
| loaded | The app. | Runs the close checkpoint, then stops the service. |
| crashed | The page stays loaded and receives `noema:service-down`; an overlay offers Retry and Quit. A successful Retry removes the overlay and dispatches `noema:service-up` without a reload. | Quit runs the checkpoint first. |
| stopping | — | Close stdin, wait 5 s, SIGTERM the group, wait 1 s, SIGKILL the group, reap. ESRCH counts as success. |

Group cleanup always runs after the child's exit is observed, so grandchildren
do not survive a Python crash. If Electron itself is killed, even with SIGKILL,
stdin EOF makes Python shut down its group; `PR_SET_PDEATHSIG` covers the moment
before the watcher starts. Separately launched agents, browsers and the Sway
helper are never in that group.

## Close checkpoint

Closing the window asks the page to checkpoint. A capture save still in flight
keeps the window open with a toast. Recording or an open note edit asks for
confirmation. Both drafts are saved; if that fails the page asks "Local draft
saving failed. Close anyway and risk losing this draft? Cancel to keep it open
and retry." Before the page has finished loading and recovering its drafts, the
window closes without touching storage. If the page does not answer within
10 s, a native dialog offers "Force close" or "Keep open". This does not recover
active recordings, abrupt crashes, power loss or storage eviction.

## Profile, permissions and navigation

The profile holds the session cookie, IndexedDB drafts and outbox, and cache.
Treat it as credential storage; it is not encrypted. Tests always use a
throwaway `--profile`.

Microphone (audio only) and notification requests from the app's main frame
show a native prompt; video and everything else are denied.
Decisions last for the app session only and are asked again after a restart.

Navigation is restricted to the service origin. New windows are denied; http(s)
links open in your browser. Downloads are allowed only from the origin and its
`blob:` URLs, so export works. See [SECURITY.md](SECURITY.md).

## Moving from the Rust shell or a browser

Captures queued in the old Rust/WebKit profile (`~/.local/share/noema/webview`)
are not readable by Chromium. This is accepted (decision 11C), and that profile
is left untouched. Browser drafts and queued captures on the same origin keep
working: the database `noema-local-v1` version 1 and its records are unchanged,
and queued items upload once with their original ids.

## Tests

```bash
npm --prefix electron test
```

This builds, runs the unit tests in `electron/test/` (CLI validation, origin
rules, profile, permissions, lifecycle) and the Playwright `_electron` suites in
`electron/e2e/` (isolation, permissions, close, single instance, the
restart/crash/offline scenario and managed mode). Results are in
[TEST_REPORT.md](TEST_REPORT.md).

## Sway companion

The Python Sway helper (`tools/sway_companion.py`) is separate and unchanged
apart from its sprite path, `tools/assets/cat.png`. It still opens `/#task/<id>`
and `/#settings` in your browser; the React UI rewrites those to `#/task/<id>`
and `#/settings`. The browser kitten preview was removed. Main-window hide does
not launch or control the helper.
`````

- [ ] **Step 4: `PHYSICAL_SWAY_ACCEPTANCE.md` status header (lines 3–9)**

Replace lines 3–9 (from `**Phase A: BLOCKED ON DEVICE.` through `does not change any A row's status or authorize default promotion.`) with:
```markdown
**Stage A (handbook §24): PENDING — the next validation gate.** The React +
Electron cutover does not satisfy it. Managed mode is an opt-in Linux
development mode; its physical lifecycle checks are PENDING. Default remains
external. A person must execute this one fixture workflow on the actual Sway
session. Do not substitute headless tests or mark the gate passed from screenshots.
```

- [ ] **Step 5: Source identity (lines 27–31)**

Replace from `is also preserved, along with the later screenshot handoff. The **current**` through `profiles, binaries and generated evidence are excluded from source manifests.` with:
```markdown
is also preserved, along with the later screenshot and task-capture handoffs.
The **current** source identity is the repository's `SHA256SUMS`, regenerated at
the React + Electron cutover. Run `sha256sum -c --quiet SHA256SUMS` from the
repository root before recording device results. Earlier manifests are history.
Data, credentials, profiles, binaries and generated evidence are excluded.
```

- [ ] **Step 6: Build section (lines 33–45)**

Replace from `## Isolated manual launch` through `not an executed physical workflow**.` with:
`````markdown
## Isolated manual launch

Run from `/home/p4nic/code/noema` in Bash terminals on the actual Sway session.
Build the interface and the shell once (Node 22, `.nvmrc`):

```bash
npm --prefix web ci && npm --prefix web run build
npm --prefix electron ci && npm --prefix electron run build
```

The commands below start the Electron binary directly
(`electron/node_modules/electron/dist/electron`), so `$!` is the shell's own PID
for the session recorder and the sampler. No package installation or shipped
installer is claimed. The following commands are **handoff commands, not an
executed physical workflow**.
`````

- [ ] **Step 7: Terminal 2 (lines 69–80)**

Replace from `Terminal 2 — paste the generated path when prompted; force native Wayland:` through that block's closing fence with:
`````markdown
Terminal 2 — paste the generated path when prompted. On a Sway session Electron
runs as a native Wayland client; the session recorder below confirms it:

```bash
read -r -p 'Fixture path from terminal 1: ' NOEMA_FIXTURE
if [[ -f "$NOEMA_FIXTURE/fixture-port.txt" ]]; then
  electron/node_modules/electron/dist/electron electron/ \
    --server http://127.0.0.1:18765 --profile "$NOEMA_FIXTURE/profile" &
  NOEMA_SHELL_PID=$!
  printf 'Shell PID: %s\n' "$NOEMA_SHELL_PID"
  fg
fi
```
`````

- [ ] **Step 8: Managed-mode check (lines 107–121, 126–127, 139–141)**

Replace the bash block that starts `NOEMA_MANAGED_FIXTURE="$(.venv/bin/python qa/device_fixture.py)"` (lines 114–121, including fences) with:
`````markdown
Managed mode always serves `http://127.0.0.1:8765`, because IndexedDB, the
outbox and the service worker belong to that origin. Prepare the fixture on that
port. If your own service holds 8765, preparation refuses; stop your own service
deliberately first. Never stop an occupant you have not identified.

```bash
NOEMA_MANAGED_FIXTURE="$(.venv/bin/python qa/device_fixture.py --port 8765)"
printf 'Keep this fixture path for relaunch: %s\n' "$NOEMA_MANAGED_FIXTURE"
electron/node_modules/electron/dist/electron electron/ --manage-service \
  --data-dir "$NOEMA_MANAGED_FIXTURE/data" \
  --python /home/p4nic/code/noema/.venv/bin/python \
  --profile "$NOEMA_MANAGED_FIXTURE/profile"
```
`````
In step 1 replace `Use another deliberately` / `fixed fixture port if preparation reports 18765 occupied; never stop its occupant.` with `Managed mode has no other` / `port: if preparation reports 8765 occupied, stop; never stop its occupant.`
In step 4 replace `using the original two-terminal commands, omit `--manage-service`, then` with `using the original two-terminal commands with 18765 replaced by 8765, then`.

- [ ] **Step 9: Two single-phrase fixes (lines 163, 247–248)**

In line 163 replace `not a Rust deep-link registration.` with `not a desktop-shell deep-link registration.`
Replace `Verify the selected set` / `includes the relevant WebKit processes.` with `Chromium's GPU, renderer` / `and utility processes are descendants of the Electron main process and are included from the shell root.`

- [ ] **Step 10: Run the docs test**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_cutover_docs.py -q
```
Expected: `19 passed`.

- [ ] **Step 11: Commit**

```bash
cd /home/p4nic/code/noema
git add docs/DESKTOP.md docs/PHYSICAL_SWAY_ACCEPTANCE.md tests/test_cutover_docs.py
git commit -m "docs: rewrite desktop guide and Sway acceptance launch for Electron"
```

---

### Task 6: `docs/SECURITY.md` (Electron posture) and `docs/API.md` (`attachments`, protocol 2)

**Files:**
- Modify: `tests/test_cutover_docs.py` (`REQUIRED`, `STALE_INSTRUCTIONS`, `CURRENT_INSTRUCTION_DOCS`)
- Modify: `docs/SECURITY.md:12-43`, `:77-96`
- Modify: `docs/API.md:9-17`, `:82`, `:95`

**Interfaces:**
- Consumes: spec §6.3 webPreferences, navigation, permissions, preload rules; §6.4 protocol 2; `noema/server.py:176` (`attachments: list[UploadFile]`).
- Produces: new `REQUIRED` entries; `STALE_INSTRUCTIONS` gains `'protocol: 1'` and ``'zero or more `files`'``; `docs/API.md` joins `CURRENT_INSTRUCTION_DOCS`.

- [ ] **Step 1: Extend the docs test**

Add to `REQUIRED`:
```python
    'docs/SECURITY.md': [
        '## Opt-in Linux managed service boundary (protocol 2)',
        '## Electron desktop shell boundary',
        '`sandbox: true`, `contextIsolation: true`',
        'it is\ntreated as credential storage',
        'Decisions are remembered for the app session\nonly',
    ],
    'docs/API.md': [
        '`{protocol: 2, instance: PUBLIC_RANDOM_ID, pid: PROCESS_ID}`',
        'zero or more `attachments` file parts',
        '`#/task/<id>`',
    ],
```
Replace the `STALE_INSTRUCTIONS` and `CURRENT_INSTRUCTION_DOCS` lines with:
```python
STALE_INSTRUCTIONS = ['cargo run', 'cargo build', 'desktop/target', 'public/app.js', 'companion.html',
                      'protocol: 1', 'zero or more `files`']
CURRENT_INSTRUCTION_DOCS = ['README.md', 'docs/DESKTOP.md', 'docs/PHYSICAL_SWAY_ACCEPTANCE.md', 'docs/API.md']
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_cutover_docs.py -q
```
Expected: FAIL — eight new `test_document_states_current_fact` cases and `test_document_has_no_stale_instruction[docs/API.md]` with `['protocol: 1', 'zero or more `files`']`.

- [ ] **Step 3: SECURITY managed boundary (lines 12–43)**

Replace from `## Opt-in Linux managed service boundary` through `limits; physical launch/quit/relaunch remains pending.` with:
```markdown
## Opt-in Linux managed service boundary (protocol 2)

External mode is still the default and never stops the user's backend. Explicit
`--manage-service --data-dir PATH` owns only the child it spawns, in that
child's own process group. Electron creates the workspace with mode 0700 and
canonicalises it. Python takes the `.noema-service.lock` flock, binds
127.0.0.1:8765 itself (`SO_REUSEADDR`, never `SO_REUSEPORT`) and, once serving,
prints one acknowledgement line with exactly `protocol` (2), `instance`, `pid`,
`workspace` and `port`. Electron accepts it only with exactly those keys and
values, then requires `GET /api/desktop-instance` to return exactly
`{protocol: 2, instance, pid}` before it loads the origin. A port occupant is
never contacted, authenticated to or killed (exit 11). The instance id is a
fresh 64-hex value sent on stdin, which stays open as the lifetime lease.
Manual Linux `run.py` launches use the same workspace lock; arbitrary custom
ASGI embeddings are not claimed to participate in launcher exclusion.

`GET /api/desktop-instance` exposes only protocol, the public non-authorizing
instance id and PID in managed mode (404 in external mode); never the workspace
path or a token. Host/Origin checks and no-store apply. The child environment is
stripped of `NOEMA_MODEL`, `NOEMA_SPEECH_MODEL`, `NOEMA_TOKEN`,
`NOEMA_ACCESS_TOKEN`, `NOEMA_ALLOWED_HOSTS`, `NOEMA_ALLOW_REMOTE_MODEL` and
`NOEMA_DATA_DIR`; child stderr is discarded and user messages are fixed text.

Python sets `PR_SET_PDEATHSIG(SIGTERM)` and exits if its parent is not
`--owner-pid` before it reads the lease, so it cannot outlive an owner that died
during startup. Stdin EOF, including after an owner SIGKILL, triggers group
shutdown. Normal close runs the page checkpoint, closes stdin, waits 5 s, then
sends SIGTERM and SIGKILL to the group; cleanup also runs after any observed
exit. This is not a sandbox against hostile same-user processes or deliberately
detached descendants, and an abrupt close cannot checkpoint the newest edits.
Physical launch/quit/relaunch on Sway remains pending.
```

- [ ] **Step 4: SECURITY shell posture (lines 77–96)**

Replace from `The Rust webview shell accepts only literal loopback HTTP base URLs and blocks` through `authority, public hosting, installer or OS keychain integration was added.` with:
```markdown
## Electron desktop shell boundary

The renderer runs with `sandbox: true`, `contextIsolation: true` and
`nodeIntegration: false`; devtools are off in packaged builds. Linux needs the
setuid `chrome-sandbox`; the shell is never run with `--no-sandbox`. `--server`
accepts only a literal loopback IP over http with no credentials, path, query
or fragment. Navigation, redirects and frame navigation are allowed only to that
exact origin, and URL parse errors deny. New windows are always denied; http(s)
links with a host and no credentials open in the user's browser. `<webview>` is
denied. Downloads are allowed only from the origin and its `blob:` URLs. The page
preload exposes one call, `window.ipc.postMessage`, and main accepts only
`noema:close-approved` from the main frame at the origin. No command, filesystem
or token bridge exists; the page uses the same loopback session bootstrap as a
browser.

Audio-only microphone requests and notification requests from the main frame at
the origin show a native prompt; video, display capture, geolocation and
everything else are denied. Decisions are remembered for the app session
only and cleared on restart, by design.

The profile (`$XDG_DATA_HOME/noema/electron` or `~/.local/share/noema/electron`,
mode 0700) holds the session cookie, IndexedDB drafts and outbox, and cache; it is
treated as credential storage and is not encrypted. Chromium's single-instance
lock guards it; a second launch focuses the first window and exits. Old
Rust/WebKit profiles are left untouched, and their unsent captures are not
readable by Chromium (accepted). Close checkpoints do not recover active
recordings, abrupt crashes or storage eviction.
```

- [ ] **Step 5: API identity (lines 9–17), helper link (line 82), captures row (line 95)**

Replace lines 9–17 (from `## Managed desktop identity` through `restart HTTP endpoint was added. See [lifecycle policy](DESKTOP.md).`) with:
```markdown
## Managed desktop identity

Opt-in Linux managed instances (lifecycle protocol 2) expose
`GET /api/desktop-instance` without login:
`{protocol: 2, instance: PUBLIC_RANDOM_ID, pid: PROCESS_ID}`, exactly these three
keys and never the workspace path. Host/Origin guards and no-store still apply.
It grants no authority and is 404 for external `run.py` instances. The Electron
shell compares it with the child's one-line stdout acknowledgement before it
loads the origin; the endpoint alone, or `/api/health`, is not proof of
ownership. No stop/restart HTTP endpoint exists. See [lifecycle policy](DESKTOP.md).
```
After line 82 (`list does not prove that all tracked work is complete.`) add the sentence:
```markdown
The React UI rewrites the legacy `#task/<id>` and `#settings` forms to `#/task/<id>` and `#/settings` on load and on every hash change.
```
Replace the row starting ``| `POST /api/captures` |`` (line 95) with:
```markdown
| `POST /api/captures` | Multipart `payload` JSON plus zero or more `attachments` file parts (at most 12); capture ID makes retries safe. |
```

- [ ] **Step 6: Run the docs test**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_cutover_docs.py -q
```
Expected: `28 passed`.

- [ ] **Step 7: Commit**

```bash
cd /home/p4nic/code/noema
git add docs/SECURITY.md docs/API.md tests/test_cutover_docs.py
git commit -m "docs: update security boundary and API for Electron and protocol 2"
```

---

### Task 7: `docs/ARCHITECTURE.md`, `docs/ASSETS.md`, `docs/BUILD_STATUS.md`, `docs/CONTINUATION.md`

**Files:**
- Modify: `tests/test_cutover_docs.py` (`REQUIRED`)
- Modify: `docs/ARCHITECTURE.md:1` (insert after), `:64`, `:81`, `:114-125`, `:183`, `:185`
- Modify: `docs/ASSETS.md:1-6` (whole file)
- Modify: `docs/BUILD_STATUS.md:1`, `:5` (insert after), `:7`, `:274`, `:289`
- Modify: `docs/CONTINUATION.md:1-5`, `:142` (append after)

**Interfaces:**
- Consumes: contract §1.2 file tree (fonts, icon), §6.4 `COPY`, §4.5 `priorityLabel`; `experiments/ui-ab/assets.md` licence wording.
- Produces: new `REQUIRED` entries.

- [ ] **Step 1: Extend the docs test**

Add to `REQUIRED`:
```python
    'docs/ARCHITECTURE.md': [
        '## React + Electron (current)',
        '`noema-local-v1` version 1',
        'lifecycle protocol 2',
    ],
    'docs/ASSETS.md': [
        '`tools/assets/cat.png`',
        '`tools/sway_companion.py:271`',
        '`tests/test_companion.py:15`',
        '`Inter-Regular.otf`',
        'GUST Font License',
    ],
    'docs/BUILD_STATUS.md': [
        '## Latest: React + Electron cutover',
        '`web/src/copy.ts`',
    ],
    'docs/CONTINUATION.md': [
        '`web/src/local/drafts.ts`',
    ],
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_cutover_docs.py -q
```
Expected: FAIL — the eleven new cases.

- [ ] **Step 3: ARCHITECTURE — new current section after line 1**

Insert after line 1 (`# Architecture and continuation notes`) and its blank line:
```markdown
## React + Electron (current)

The browser UI is a typed React bundle in `web/` (React, TanStack Query and
Router with hash history, zod-validated API responses). FastAPI serves
`web/dist` through explicit routes: `/`, content-hashed `/assets/*` (immutable),
`/sw.js`, `/manifest.webmanifest` and `/icon.svg`. Without a build, `/` returns a
503 that names the build command and the API keeps working. Node 22 is needed to
build, never to run the service.

Local persistence keeps IndexedDB `noema-local-v1` version 1 with the same `kv`
(`draft`, `task-draft`, `snapshot`) and `outbox` record shapes as the old UI, so
captures queued before the cutover upload once with their original ids. The UI
never retries a mutation automatically; only the capture outbox and "Retry add
task" replay, with the same idempotency key. Every edit sends
`expected_version`; a 409 shows a conflict and never overwrites.

The desktop shell is Electron (`electron/`), loading the same origin with a
sandboxed renderer, same-origin navigation and session-only permission
decisions. Linux `--manage-service` uses lifecycle protocol 2 (stdin lease,
stdout acknowledgement, fixed 127.0.0.1:8765, own process group); see
[DESKTOP.md](DESKTOP.md). The Rust Wry/Tao shell (`desktop/`), the `public/` UI
and the browser kitten preview were removed. The Python Sway helper is unchanged
apart from its sprite path, `tools/assets/cat.png`.

The background terrain (`web/src/ui/BackgroundField.tsx`) is WebGL2: one height
pass per frame into a 120×70 texture plus instanced strokes, 12 fps through
`setTimeout`, a half-resolution backing store, and the states `unsupported`,
`static`, `paused` and `animated`. Motion defaults to off and the terrain is
never drawn under `[data-quiet]` reading or editing surfaces. Its measured cost
is in [TEST_REPORT.md](TEST_REPORT.md).

This supersedes only the handbook's "current static UI" decision (§18/§27);
SQLite and the service are unchanged.

```

- [ ] **Step 4: ARCHITECTURE — mark history and update policy text**

Replace line 64 `## Now presentation refinement (unreleased)` with `## Now presentation refinement (historical; ported to web/src/domain/nowState.ts)`.
Replace line 81 `## Rust webview desktop shell (unreleased)` with `## Rust webview desktop shell (historical; removed at the React + Electron cutover)`.
Replace lines 114–125 (the `Desktop direction: Rust is the preferred…` paragraph through `…it does not replace the backend or require inference.`) with:
```markdown
Desktop direction: the shell was chosen by measurement, not preference. The
2026-10-10 headless-Sway benchmark selected Electron over Wry/WebKitGTK (decision
1A in the migration spec); the Slint and Rust/Qt-QML comparison is closed.

The current core is one process serving a prebuilt React bundle and an API.
SQLite WAL stores durable application state. A single background thread wakes
for durable jobs/reminders, and optional speech runs in a subprocess. A Node
build step produces the bundle; Node is not a runtime dependency. No PostgreSQL,
Redis, Celery, vector database or browser-automation agent is required.

The earlier React/PostgreSQL proposal was simplified for the hardware
constraint. React returned at the cutover as a frontend only; SQLite stays. A
framework alone does not determine resource use; measured numbers live in
[TEST_REPORT.md](TEST_REPORT.md).
```
In line 183 replace `Motion is opt-in, modest, reduced-motion aware and paused when hidden.` with `Motion is opt-in (off by default), 12 fps, reduced-motion aware, and paused when hidden, blurred or idle for 60 s.`
Replace the line starting `Actual full-app RSS, device battery` (line 185) with:
```markdown
The main app process tree (Electron plus the service, no AI) is measured against the handbook's < 400 MB aspiration in TEST_REPORT. Device battery and speech/vision latency must still be measured on the laptop.
```

- [ ] **Step 5: Replace `docs/ASSETS.md` entirely**

```markdown
# Asset provenance

- `tools/assets/cat.png`: the kitten sprite used by the Python Sway helper
  (`tools/sway_companion.py:271`); `tests/test_companion.py:15` reads it from there and
  the test pins its sha256.
  Moved unchanged from `public/cat.png` at the React + Electron cutover. Adapted
  from the small black-cat image supplied by the user in this conversation. The
  white exterior was removed, preserving the eyes; no generative image call is
  needed at runtime. Rights for redistribution outside the user's own project
  have not been independently established. Replace it with an owned/licensed
  sprite before public distribution.
- `web/public/icon.svg` and its hashed copy `web/src/assets/icon.svg`: the
  application icon, copied unchanged from the former `public/icon.svg`; created
  for this implementation.
- Fonts in `web/src/assets/fonts/`, bundled locally and content-hashed by Vite;
  the app makes no remote font requests:
  - Inter Regular and Medium (`Inter-Regular.otf`, `Inter-Medium.otf`): The
    Inter Project Authors, SIL OFL 1.1 / Apache 2.0; source
    https://github.com/rsms/inter. Full notice: `experiments/ui-ab/licenses/Inter.txt`.
  - TeX Gyre Termes Regular and Italic (`TeXGyreTermes-Regular.otf`,
    `TeXGyreTermes-Italic.otf`): GUST e-foundry, GUST Font License. Full notice:
    `experiments/ui-ab/licenses/TeXGyre.txt`. Used for document titles.
- The application layout, styles, line icons (`web/src/ui/Icon.tsx`) and the
  WebGL terrain were created for this implementation (variant B of
  `experiments/ui-ab`). No third-party icon set, image or wallpaper is used.
- `qa/*.png` are screenshots of the actual implemented interface using explicitly synthetic example data. They are not evidence of current user activity or deployed agents.
```

- [ ] **Step 6: BUILD_STATUS edits**

Replace line 1 with `# Build status · Noema 0.1.0 + React/Electron cutover`.
After line 5 (`this status and the test report after each milestone.`) insert:
```markdown

## Latest: React + Electron cutover · 2026-10-10

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
```
Replace line 7 `## Latest continuation: frictionless task capture · 2026-10-09` with `## Previous continuation: frictionless task capture · 2026-10-09`.
In line 274 replace `The UI has no npm build or bundled Chromium engine.` with `The UI is a prebuilt React bundle; the desktop shell bundles Chromium through Electron (about 283 MB, accepted per decision 1A).`
In line 289 replace `The Rust/Wry shell above reuses the web interface;` with `The Electron shell reuses the web interface;`.

- [ ] **Step 7: CONTINUATION edits**

Replace lines 1–5 (through `preserves these storage/checkpoint semantics; see [DESKTOP.md](DESKTOP.md).`; line 5 ends the sentence that line 4 starts) with:
```markdown
# Capture recovery continuation · 2026-10-08

This is the historical capture-recovery slice. Current milestones and source
identity live in [PROGRESS.md](PROGRESS.md). At the React + Electron cutover the
`public/app.js` storage code described below was ported to `web/src/local/db.ts`,
`web/src/local/drafts.ts`, `web/src/local/outbox.ts` and `web/src/local/taskDraft.ts`
with the same database (`noema-local-v1`, version 1), stores, record shapes,
atomic Save transaction and serialised draft writes. The Electron close
checkpoint preserves these semantics (see [DESKTOP.md](DESKTOP.md)). File
references below are historical.
```
Append after the last line (line 142):
```markdown

Current order (see [PROGRESS.md](PROGRESS.md)): physical Sway acceptance (Stage A)
first, then AI-assigned priority; recording checkpoints follow.
```

- [ ] **Step 8: Run the docs test**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_cutover_docs.py -q
```
Expected: `39 passed`.

- [ ] **Step 9: Commit**

```bash
cd /home/p4nic/code/noema
git add docs/ARCHITECTURE.md docs/ASSETS.md docs/BUILD_STATUS.md docs/CONTINUATION.md tests/test_cutover_docs.py
git commit -m "docs: update architecture, assets, build status and continuation notes"
```

---

### Task 8: `docs/PROGRESS.md` — milestone, Stage A as next gate, follow-ons, rollback

**Files:**
- Modify: `tests/test_cutover_docs.py` (`REQUIRED`, new `test_progress_has_dated_cutover_milestone`)
- Modify: `docs/PROGRESS.md:3`, `:12-16`, `:18-19`, `:47-49`, `:52-53`, `:64` (insert before), `:198-199`, `:205-206`, `:341-342`, `:353-354`, `:358` (append after), `:360-367`

**Interfaces:**
- Consumes: tags `react-electron-cutover` (created in Task 13), `cutover-docs-baseline` (Task 1); backup `/home/p4nic/code/noema-cutover-backup` (Task 3); spec §11.1, §11.2.
- Produces: new `REQUIRED` entries; `test_progress_has_dated_cutover_milestone()`.

If this runs on a later day than 2026-10-10, use the output of `date +%F` wherever `2026-10-10` appears in this task's text and test expectation.

- [ ] **Step 1: Extend the docs test**

Add to `REQUIRED`:
```python
    'docs/PROGRESS.md': [
        'Next validation gate: physical Sway acceptance (handbook §24 Stage A)',
        '"Current static UI + SQLite" decision (handbook §27) is superseded',
        '`web/src/copy.ts`',
        'AI-assigned automatic priority (spec §11.1)',
        'Daily motivating slogan (spec §11.2)',
        'git revert -m 1 --no-edit react-electron-cutover',
        'git checkout cutover-docs-baseline --',
    ],
```
Append the test:
```python
def test_progress_has_dated_cutover_milestone():
    assert re.search(r'^\d{4}-\d{2}-\d{2}: React \+ Electron cutover', text('docs/PROGRESS.md'), re.M)
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_cutover_docs.py -q
```
Expected: FAIL — seven new `REQUIRED` cases and `test_progress_has_dated_cutover_milestone` (`assert None`).

- [ ] **Step 3: Header, direction, navigation, guardrails (lines 3, 12–16, 18–19, 47–49, 52–53)**

Replace line 3 with `Last updated: 2026-10-10. Current source: **0.1.0 plus the React + Electron cutover**.`
Replace lines 12–16 (`Noema is a local-first learning notebook…` through `…it is not device-accepted or a shipped installer.`) with:
```markdown
Noema is a local-first learning notebook and task/agent workspace. The working
stack is Python/FastAPI + SQLite, a typed **React** interface (`web/`, built with
Node 22 and served by the service) and an **Electron** desktop shell
(`electron/`) that loads the same origin. The browser version remains usable.
External service startup remains the default; Linux `--manage-service`
(lifecycle protocol 2) is opt-in and not device-accepted. The handbook's
"Current static UI + SQLite" decision (handbook §27) is superseded for the UI
only; SQLite stays.
```
Replace `Keep the compact Now / Capture / Notes / Plan navigation, charcoal palette,` / `restrained accent, original approved assets and small kitten.` with:
```markdown
Keep the compact Overview / Capture / Notes / Tasks navigation (route ids
`overview`/`capture`/`notes`/`plan`), graphite palette, restrained accent,
original approved assets and small kitten.
```
Replace lines 47–49 (`- Preserve the existing compact Now / Capture / Notes / Plan interface and` / `  framework. Change layout only for a demonstrated usability, accessibility,` / `  scaling or platform-integration problem.`) with:
```markdown
- Preserve the compact Overview / Capture / Notes / Tasks interface delivered by
  the React + Electron cutover. Change layout only for a demonstrated usability,
  accessibility, scaling or platform-integration problem.
```
Replace lines 52–53 (`- Do not reintroduce large dashboard cards, permanent overlays, slogans,` / `  decorative headers or photorealistic cats from older concepts.`) with:
```markdown
- Do not reintroduce large dashboard cards, permanent overlays, decorative
  headers or photorealistic cats from older concepts. Owner decision 18B keeps
  the variant B headings, subtitles and tagline in `web/src/copy.ts`; a daily
  motivating slogan is a later milestone that only swaps that module's source.
```

- [ ] **Step 4: New latest continuation (insert before line 64)**

Replace the heading `## Latest continuation` (line 64) with the block below; the old heading becomes `## Previous continuation: frictionless task capture (historical)` at its end:
`````markdown
## Latest continuation: React + Electron cutover

2026-10-10: React + Electron cutover.

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
- IndexedDB `noema-local-v1` version 1 is unchanged; captures queued by the old
  UI upload once.
- Headings, subtitles and the tagline are kept in `web/src/copy.ts` (owner
  decision 18B); the greeting uses `display_name`.
- Every parity-map row is green or an approved drop, and every handbook-trace
  row is green. Gate results, the terrain budget and the main-app memory check
  (handbook §21, < 400 MB excluding AI) are in [TEST_REPORT.md](TEST_REPORT.md).
- Not built: AI-assigned priority, daily slogans, audio checkpoint recovery.
- One cutover merge of `feat/react-electron` into `master`, after owner
  approval, tagged `react-electron-cutover`.

Next validation gate: physical Sway acceptance (handbook §24 Stage A). This
migration does not satisfy it; follow [the device checklist](PHYSICAL_SWAY_ACCEPTANCE.md).

### Rollback to the pre-migration UI

1. Flush first. In the Electron app, wait until the status line no longer shows
   "N capture(s) on this device" (open it and Retry if needed), then quit. Captures
   still queued in the Electron profile are not readable by the restored
   Rust/WebKit shell; this is accepted.
2. Revert the merge, then restore the docs and untracked files that the revert
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
3. Browsers: old and new UIs share `noema-local-v1` version 1, so queued
   captures survive. The reinstalled v1 service worker deletes nothing of v1's;
   the v2 `noema-shell-<hash>` caches are only stale storage.

## Previous continuation: frictionless task capture (historical)
`````

- [ ] **Step 5: Capability rows (lines 198–199) and the preview sentence (lines 341–342)**

Replace the row starting `| Kitten and motion |` with:
```markdown
| Kitten and motion | Separate GTK/Sway popup (unchanged; sprite `tools/assets/cat.png`) and an optional in-app WebGL2 terrain: motion off by default, static without WebGL2, paused when hidden, blurred or idle. | Browser kitten preview removed at the cutover. Terrain budget measured once in TEST_REPORT. Physical-device behavior remains unvalidated; no reliable presence detection. |
```
Replace the row starting `| Rust desktop |` with:
```markdown
| Desktop shell | Electron shell loading the service origin: sandboxed renderer, same-origin navigation, session-only permissions, draft close checkpoint; opt-in Linux managed lifecycle (protocol 2). | Real-process lifecycle and `_electron` checks; default remains external. Physical acceptance, installer and Windows/macOS remain unproven. [Desktop guide](DESKTOP.md). |
```

In lines 341–342 replace `the browser preview remains explicit, not hidden by` / `guessing whether a helper is present.` with `the browser kitten preview was removed at the React + Electron cutover.`

- [ ] **Step 6: Completed milestones (lines 205–206)**

Replace `2026-10-09: frictionless task capture delivered and made a permanent product` / `requirement; exact boundaries and evidence are in the latest continuation above.` with:
```markdown
2026-10-10: React + Electron cutover; see the latest continuation above.

2026-10-09: frictionless task capture delivered and made a permanent product
requirement; exact boundaries and evidence are in the previous continuation above.
```

- [ ] **Step 7: Remaining work order (lines 353–354, after 358, 360–367)**

Replace the two rows starting `| Next · BLOCKED ON DEVICE |` and `| 2 · IMPLEMENTED / DEVICE PENDING |` with:
```markdown
| Next validation gate · PENDING | Physical Sway acceptance (handbook §24 Stage A) with the single disposable fixture, now on the Electron shell: editor keyboard/clipboard, Overview/pinned focus, minimize/restore, file picker, microphone, agent review, kitten/routing and the opt-in managed launch/quit/relaunch. | Every required checklist row has actual device evidence and failures resolved; complete attributable-process workload measurements. |
| Next build milestone | AI-assigned automatic priority (spec §11.1): the optional local model sets the automatic priority with `priority_source = 'ai'` and a one-line reason; the deterministic rules stay the fallback (`'rules'`). Manual overrides, pins, focus, deadlines and status are never touched. | Schema-validated model output, fallback without a model, override and pin preservation tests. The UI already shows "Auto · AI". |
```
After the row starting `| 6 |` add:
```markdown
| Later | Daily motivating slogan (spec §11.2): the Overview slogan changes each day by swapping `web/src/copy.ts`'s source to a list picked by date; an optional AI-generated variant uses the same local model. | No network service; stable within a day; the base app still needs no model. |
```
Replace lines 360–367 (from `After lifecycle acceptance, unfinished voice capture and long recordings are` through `evaluation, not a decision to replace the current webview.`) with:
```markdown
After Stage A, AI-assigned priority is the next build milestone; unfinished
voice capture and long recordings follow. Whistle is only a candidate for a
separate comparative transcription evaluation; nothing was started or
downloaded here.

The Slint versus Rust + Qt/QML comparison is closed: the shell was chosen by
measurement and is Electron (migration spec decision 1A).
```

- [ ] **Step 8: Run the docs test**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_cutover_docs.py -q
```
Expected: `47 passed`.

- [ ] **Step 9: Commit**

```bash
cd /home/p4nic/code/noema
git add docs/PROGRESS.md tests/test_cutover_docs.py
git commit -m "docs(progress): record the cutover milestone and keep Stage A next"
```

---

### Task 9: Terrain budget check and handbook §21 main-app memory, recorded in `docs/TEST_REPORT.md`

**Files:**
- Create (scratch, never committed — decision 13B): `/tmp/noema-cutover-bench/memory-bench.mjs`, `/tmp/noema-cutover-bench/intro.md`
- Modify: `tests/test_cutover_docs.py` (two tests)
- Modify: `docs/TEST_REPORT.md:1`, insert before `## Frictionless task capture · 2026-10-09` (line 3)
- Modify, only if the terrain plan's Task 9 never ran: `docs/TEST_REPORT.md` end of file, through that task's Step 5 (Step 2 below)

**Interfaces:**
- Consumes: the `## Terrain budget · <date>` section that the terrain plan's Task 9 (`04-terrain.md`, contract P5) appends to `docs/TEST_REPORT.md` (rows `| Animated: … |`, `| Paused: … |`, `| Hidden: … |` in the form `| <label> | <cpu> (< <budget>) | <gpu> (< <budget>) | <pss> | PASS or FAIL |`, then `**Overall: PASS**` or `**Overall: FAIL**`); `measure(roots_by_pid: dict[str, int], warmup: float, duration: float, interval: float, phase: str) -> dict` from `qa/process_sample.py:93` (keys used: `status`, `missing_roots`, `memory_ranges_bytes.summed_pss_bytes.max`, `memory_ranges_bytes.summed_rss_bytes.max`); S `connected` ('Server connected'); `@playwright/test` `_electron` and `electron` from `electron/node_modules`.
- Produces: TEST_REPORT section `## React + Electron cutover · <date>` with the subsection `### Handbook §21 main-app memory · measured <date>` ending in `Result: PASS` or `Result: FAIL`; tests `test_test_report_records_terrain_budget()`, `test_test_report_records_main_app_memory()`.

The spec measures the terrain budget **once** at cutover (§7, decision 13B). That one measurement is the terrain plan's Task 9, which runs after the Electron shell exists and before this task (Prerequisites). If the terrain plan's Task 9 has already recorded its section, this task does not measure the terrain again and only checks the record. If it has not run, Step 2 runs it here, once, using that task's own steps (its harness, thresholds and row format are the ones `test_test_report_records_terrain_budget` checks). The terrain figure covers the Electron tree only, so the handbook §21 check (Electron tree **plus** the Python service, no AI) is measured here. "400 MB" is taken as 400,000,000 bytes of summed PSS (PSS does not double-count shared pages) and the report says so.

- [ ] **Step 1: Write the tests**

Append to `tests/test_cutover_docs.py`:
```python
def test_test_report_records_terrain_budget():
    """Spec §7: measured once by the terrain phase (04-terrain.md Task 9); never re-measured here."""
    content = text('docs/TEST_REPORT.md')
    assert re.search(r'^## Terrain budget · \d{4}-\d{2}-\d{2}$', content, re.M)
    for state in ('Animated', 'Paused', 'Hidden'):
        assert re.search(rf'^\| {state}: [^|]+ \| [0-9.]+ \(< [0-9.]+\) \| [0-9.]+ \(< [0-9.]+\) \| [0-9.]+ \| '
                         r'(?:PASS|FAIL) \|$', content, re.M), state
    assert re.search(r'^\*\*Overall: (?:PASS|FAIL)\*\*$', content, re.M)


def test_test_report_records_main_app_memory():
    content = text('docs/TEST_REPORT.md')
    assert re.search(r'^### Handbook §21 main-app memory · measured .+\n[\s\S]*?^Result: (?:PASS|FAIL)$',
                     content, re.M)
```

- [ ] **Step 2: Run them; measure the terrain here only if it was never measured**

```bash
cd /home/p4nic/code/noema
grep -c '^## Terrain budget · ' docs/TEST_REPORT.md
.venv/bin/python -m pytest tests/test_cutover_docs.py -k test_report -q
```
Expected: count `1`, then `1 failed, 1 passed` — `test_test_report_records_main_app_memory` FAILS with `assert None`; `test_test_report_records_terrain_budget` passes on the terrain phase's record.

If the count is `0` (the terrain plan's Task 9 never ran), run that task now, exactly as written in `/home/p4nic/code/noema/docs/superpowers/plans/2026-10-10-react-electron/04-terrain.md` (Task 9, Steps 1–6: preconditions, adapter, summariser, the three 30 s runs, append to `docs/TEST_REPORT.md`, commit `docs: record terrain budget measurement`). That is the single spec §7 measurement. Then rerun the two commands above and expect count `1` and `1 failed, 1 passed`. If its Step 1 reports the scratch harness missing, stop and ask the owner to restore it; do not write a second harness. If the count is `2` or more, stop: the budget was measured twice, and the owner picks the record to keep.

A terrain row that reads `FAIL` is recorded as is and is raised with the owner in Task 13 Step 4 (spec §1 makes the budget a success criterion). Never tune the thresholds.

- [ ] **Step 3: Write the throwaway memory harness**

```bash
mkdir -p /tmp/noema-cutover-bench
```
Create `/tmp/noema-cutover-bench/memory-bench.mjs`:
```js
// Throwaway cutover harness: handbook §21 main-app memory (decision 13B). Scratch only, never committed.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = '/home/p4nic/code/noema';
const ELECTRON_DIR = join(REPO, 'electron');
const requireFromElectron = createRequire(join(ELECTRON_DIR, 'package.json'));
const { _electron } = requireFromElectron('@playwright/test');
const ELECTRON_BIN = requireFromElectron('electron');
const PYTHON = join(REPO, '.venv/bin/python');
const MEMORY_LIMIT_BYTES = 400_000_000; // handbook §21 "400 MB", SI bytes of summed PSS
const STRIPPED_ENV = ['NOEMA_MODEL', 'NOEMA_SPEECH_MODEL', 'NOEMA_TOKEN', 'NOEMA_ACCESS_TOKEN',
  'NOEMA_ALLOWED_HOSTS', 'NOEMA_ALLOW_REMOTE_MODEL', 'NOEMA_DATA_DIR']; // no model: AI excluded
const OUTPUT = process.argv[2];
if (!OUTPUT || !OUTPUT.endsWith('.md')) throw new Error('Usage: node memory-bench.mjs <results.md>');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mib = (bytes) => (bytes / 1048576).toFixed(1);

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const SAMPLER = [
  'import json, sys',
  `sys.path.insert(0, ${JSON.stringify(REPO)})`,
  'from qa.process_sample import measure',
  'roots, phase, warmup, seconds = json.loads(sys.argv[1]), sys.argv[2], float(sys.argv[3]), float(sys.argv[4])',
  'print(json.dumps(measure(roots, warmup, seconds, 1, phase)))',
].join('\n');

function sampleProcesses(roots, phase, warmup, seconds) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, ['-I', '-c', SAMPLER, JSON.stringify(roots), phase, String(warmup), String(seconds)],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`sampler failed: ${stderr.trim()}`));
      const sample = JSON.parse(stdout);
      if (sample.status !== 'sampled') return reject(new Error(`sample incomplete; missing roots: ${sample.missing_roots}`));
      resolve(sample);
    });
  });
}

async function startSway(root) {
  const runtime = join(root, 'runtime');
  mkdirSync(runtime, { mode: 0o700 });
  const config = join(root, 'sway.config');
  writeFileSync(config, 'xwayland disable\noutput HEADLESS-1 mode 1440x900 position 0 0 scale 1\n'
    + 'default_border none\nfocus_follows_mouse no\n');
  const env = { ...process.env, XDG_RUNTIME_DIR: runtime, XDG_SESSION_TYPE: 'wayland', WLR_BACKENDS: 'headless',
    WLR_HEADLESS_OUTPUTS: '1', WLR_LIBINPUT_NO_DEVICES: '1', WLR_RENDERER: 'gles2' };
  for (const key of ['SWAYSOCK', 'WAYLAND_DISPLAY', 'DISPLAY']) delete env[key];
  const sway = spawn('sway', ['-c', config], { env, stdio: 'ignore' });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const names = readdirSync(runtime);
    const wayland = names.find((name) => /^wayland-\d+$/.test(name));
    const ipc = names.find((name) => name.startsWith('sway-ipc.'));
    if (wayland && ipc) return { sway, env: { ...env, WAYLAND_DISPLAY: wayland, SWAYSOCK: join(runtime, ipc) } };
    await sleep(100);
  }
  sway.kill('SIGTERM');
  throw new Error('private headless Sway did not start');
}

async function startService(root) {
  const port = await freePort();
  const env = { ...process.env };
  for (const key of STRIPPED_ENV) delete env[key];
  const service = spawn(PYTHON, [join(REPO, 'run.py'), '--host', '127.0.0.1', '--port', String(port),
    '--data-dir', join(root, 'data')], { env, stdio: 'ignore' });
  const origin = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      if ((await fetch(`${origin}/api/health`)).ok) return { service, origin };
    } catch {
      // not listening yet
    }
    await sleep(100);
  }
  service.kill('SIGTERM');
  throw new Error('service did not become healthy within 15 s');
}

async function main() {
  const root = mkdtempSync(join(tmpdir(), 'noema-bench-'));
  const cleanup = [];
  try {
    const { sway, env } = await startSway(root);
    cleanup.push(() => sway.kill('SIGTERM'));
    const { service, origin } = await startService(root);
    cleanup.push(() => service.kill('SIGTERM'));
    const app = await _electron.launch({ executablePath: ELECTRON_BIN, env, timeout: 30_000,
      args: [ELECTRON_DIR, '--server', origin, '--profile', join(root, 'profile')] });
    cleanup.push(() => app.close());
    const win = await app.firstWindow();
    await win.getByText('Server connected').first().waitFor({ timeout: 30_000 });
    if ((await win.evaluate(() => document.visibilityState)) !== 'visible') throw new Error('the Noema window is not visible');
    const memory = await sampleProcesses({ shell: app.process().pid, service: service.pid }, 'open-idle', 20, 60);
    const pss = memory.memory_ranges_bytes.summed_pss_bytes;
    if (!pss) throw new Error('PSS unavailable for part of the tree; the memory result would be incomplete');
    const rss = memory.memory_ranges_bytes.summed_rss_bytes;
    const date = new Date().toISOString().slice(0, 10);
    const markdown = [
      `### Handbook §21 main-app memory · measured ${date}`, '',
      'Private headless Sway (`WLR_RENDERER=gles2`, one 1440×900 output at scale 1). Roots: the Electron main process '
        + '(shell, external mode, throwaway profile) and the Python service on a throwaway data directory, each with all '
        + 'descendants, through `measure()` in `qa/process_sample.py`. Default settings (motion off, observation off) '
        + 'and no model configured, so AI is excluded. Window visible on Overview; 20 s warm-up, 60 s sample at 1 s. '
        + `Max summed PSS ${mib(pss.max)} MiB (${pss.max} bytes); max summed RSS ${mib(rss.max)} MiB `
        + '(RSS double-counts shared pages). Aspiration: < 400 MB (400,000,000 bytes) of PSS. '
        + 'Harness: throwaway, not committed (decision 13B).', '',
      `Result: ${pss.max < MEMORY_LIMIT_BYTES ? 'PASS' : 'FAIL'}`, '', '',
    ].join('\n');
    writeFileSync(OUTPUT, markdown);
    writeFileSync(OUTPUT.replace(/\.md$/, '.json'), JSON.stringify(memory, null, 2));
    process.stdout.write(markdown);
  } finally {
    for (const step of cleanup.reverse()) {
      try { await step(); } catch { /* best effort */ }
    }
    rmSync(root, { recursive: true, force: true });
  }
}

await main();
```

- [ ] **Step 4: Build what the harness drives and run it**

```bash
cd /home/p4nic/code/noema
npm --prefix web run build && npm --prefix electron run build
npm --prefix electron exec -- node /tmp/noema-cutover-bench/memory-bench.mjs /tmp/noema-cutover-bench/results.md
```
Expected: about 2 minutes, then the `### Handbook §21 main-app memory` subsection on stdout ending in `Result: PASS` or `Result: FAIL`. A thrown error (Sway or service not started, window not visible, sample incomplete, PSS missing) means the number would be invalid: fix the environment cause and rerun; do not record a partial number. A `FAIL` is recorded as is (spec §4.7: "whether or not it passes") and does not block the merge.

- [ ] **Step 5: Write the section intro**

Create `/tmp/noema-cutover-bench/intro.md`:
```markdown
## React + Electron cutover · 2026-10-10

Executed on branch `feat/react-electron` before the cutover merge. New suites:
Vitest unit tests in `web/src/**` (api, local, domain, state, routes, field);
Playwright E2E in `web/e2e/` against a real FastAPI on a throwaway data directory
and free port; Electron `_electron` and lifecycle tests in `electron/`; and the
Python suite including `tests/test_cutover.py` and `tests/test_cutover_docs.py`.
The harnesses `qa/browser_check.py`, `qa/native_storage_check.py`,
`qa/now_ui_check.py`, `qa/task_capture_check.py`, `qa/task_link_check.py`,
`qa/settings_link_check.py` and `qa/webview_check.py` (with
`desktop/qa/scenario.js`) drove the deleted `public/` UI or `desktop/` shell;
their checks are mapped to new tests or approved drops in
[parity-map.md](superpowers/specs/parity-map.md), and the scripts are kept as
history only. `qa/sway_check.py` and `qa/managed_screenshots.py` also launch the
deleted Rust shell; they are not runnable until ported, which this migration
does not do. The terrain budget (spec §7) was measured once, with the terrain
phase's throwaway harness, and is recorded in the "Terrain budget" section of
this report.

```
If this runs on a later day than 2026-10-10, use the output of `date +%F` in the heading.

- [ ] **Step 6: Insert intro and results into TEST_REPORT**

Replace line 1 of `docs/TEST_REPORT.md` with `# Verification report · Noema 0.1.0 + React/Electron cutover`, then:
```bash
cd /home/p4nic/code/noema
.venv/bin/python - <<'EOF'
from pathlib import Path
report = Path('docs/TEST_REPORT.md')
section = Path('/tmp/noema-cutover-bench/intro.md').read_text() + Path('/tmp/noema-cutover-bench/results.md').read_text()
anchor = '## Frictionless task capture · 2026-10-09'
content = report.read_text()
assert content.count(anchor) == 1, 'anchor must appear exactly once'
report.write_text(content.replace(anchor, section + anchor, 1))
EOF
```

- [ ] **Step 7: Run the tests**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_cutover_docs.py -q
```
Expected: `49 passed`.

- [ ] **Step 8: Commit**

```bash
cd /home/p4nic/code/noema
git add docs/TEST_REPORT.md tests/test_cutover_docs.py
git commit -m "docs(test-report): record the main-app memory check"
```

---

### Task 10: Final full gate run, recorded in `docs/TEST_REPORT.md`

**Files:**
- Modify: `tests/test_cutover.py` (add `test_no_focused_tests`)
- Modify: `tests/test_cutover_docs.py` (add `GATE_COMMANDS`, `test_test_report_records_a_green_final_gate`)
- Modify: `docs/TEST_REPORT.md` (insert `### Final gate run` before `## Frictionless task capture · 2026-10-09`)

**Interfaces:**
- Consumes: the six spec §3 gate commands; contract §1.1 and §8.1 scripts.
- Produces: tag `cutover-gate` (the commit the gate ran on; Task 13 compares against it); `test_no_focused_tests()`, `GATE_COMMANDS: list[str]`, `test_test_report_records_a_green_final_gate()`.

- [ ] **Step 1: Add the focus guard**

Append to `tests/test_cutover.py`:
```python
# A focused test silently stops the rest of its file from running in Playwright.
FOCUSED = re.compile(r'\.only\(')
FOCUS_SCANNED = ['web/src', 'web/e2e', 'electron/test', 'electron/e2e']


def test_no_focused_tests():
    hits = [f'{file.relative_to(ROOT)}:{number}'
            for name in FOCUS_SCANNED
            for file in sorted((ROOT / name).rglob('*.ts*')) if 'node_modules' not in file.parts
            for number, line in enumerate(file.read_text(encoding='utf-8').splitlines(), 1)
            if FOCUSED.search(line)]
    assert hits == []
```

- [ ] **Step 2: Run the guard**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_cutover.py -q
```
Expected: `3 passed`. This guard has no failing first run: a failure here is a real `.only(` left by an earlier phase — stop and report it.

- [ ] **Step 3: Commit the guard and tag the gate commit**

```bash
cd /home/p4nic/code/noema
git add tests/test_cutover.py
git commit -m "test: guard against focused tests before the cutover gate"
git tag cutover-gate
```

- [ ] **Step 4: Run the full gate on the tagged commit, capturing every log**

```bash
cd /home/p4nic/code/noema
G=/tmp/noema-gate; rm -rf "$G" && mkdir -p "$G"
gate() {
  local name="$1"; shift
  if "$@" >"$G/$name.log" 2>&1; then echo PASS >"$G/$name.status"; else echo FAIL >"$G/$name.status"; fi
  echo "$name: $(cat "$G/$name.status")"
}
gate web-ci npm --prefix web ci
gate web-build npm --prefix web run build
gate web-test npm --prefix web test
gate web-e2e npm --prefix web run e2e
gate electron-test npm --prefix electron test
gate pytest .venv/bin/python -m pytest
```
Expected: six lines, each ending `PASS`. Any `FAIL`: read its log, fix the cause in the owning phase's files, commit, move the tag (`git tag -f cutover-gate`) and rerun this step.

- [ ] **Step 5: Prove nothing was skipped, retried or left as todo**

```bash
grep -Eil '[0-9]+ (skipped|xfailed|xpassed|flaky|todo)' /tmp/noema-gate/*.log
echo "exit $?"
```
Expected: no file names, then `exit 1`. The pattern matches the summary counts that pytest (`1 skipped`), Vitest (`| 1 skipped`, `| 2 todo`) and Playwright (`1 flaky`) print, not test titles. A match means a test did not really pass; treat it like a failure.

- [ ] **Step 6: Write the failing TEST_REPORT test**

Append to `tests/test_cutover_docs.py`:
```python
GATE_COMMANDS = ['npm --prefix web ci', 'npm --prefix web run build', 'npm --prefix web test',
                 'npm --prefix web run e2e', 'npm --prefix electron test', '.venv/bin/python -m pytest']


def test_test_report_records_a_green_final_gate():
    content = text('docs/TEST_REPORT.md')
    assert '### Final gate run' in content
    section = content.split('### Final gate run', 1)[1].split('\n## ', 1)[0]
    for command in GATE_COMMANDS:
        assert re.search(rf'^\| `{re.escape(command)}` \| \S[^|]* \| PASS \|$', section, re.M), command
```
```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_cutover_docs.py -k final_gate -q
```
Expected: FAIL with `assert '### Final gate run' in …`.

- [ ] **Step 7: Generate the section from the logs and insert it**

```bash
cd /home/p4nic/code/noema
G=/tmp/noema-gate
summary() { sed 's/\x1b\[[0-9;]*m//g' "$G/$1.log" | grep -E "$2" | tail -n "${3:-1}" | tr -s ' ' | sed 's/^ //; s/|/\//g' | paste -sd ';' -; }
{
  echo '### Final gate run'
  echo
  echo "Commit \`$(git rev-parse --short cutover-gate)\` (tag \`cutover-gate\`) on \`feat/react-electron\`, $(date +%F). Each summary is the command's own output line; the logs contain no skipped, xfailed, flaky or todo tests, and no test is focused."
  echo
  echo '| Command | Summary | Result |'
  echo '|---|---|---|'
  echo "| \`npm --prefix web ci\` | $(summary web-ci '^added [0-9]+ packages') | $(cat $G/web-ci.status) |"
  echo "| \`npm --prefix web run build\` | $(summary web-build 'built in') | $(cat $G/web-build.status) |"
  echo "| \`npm --prefix web test\` | $(summary web-test '^ *Tests ') | $(cat $G/web-test.status) |"
  echo "| \`npm --prefix web run e2e\` | $(summary web-e2e '^ *[0-9]+ (passed|failed)') | $(cat $G/web-e2e.status) |"
  echo "| \`npm --prefix electron test\` | $(summary electron-test '^ *Tests |^ *[0-9]+ (passed|failed)' 2) | $(cat $G/electron-test.status) |"
  echo "| \`.venv/bin/python -m pytest\` | $(summary pytest '[0-9]+ passed') | $(cat $G/pytest.status) |"
  echo
} > "$G/section.md"
cat "$G/section.md"
.venv/bin/python - <<'EOF'
from pathlib import Path
report = Path('docs/TEST_REPORT.md')
section = Path('/tmp/noema-gate/section.md').read_text()
anchor = '## Frictionless task capture · 2026-10-09'
content = report.read_text()
assert content.count(anchor) == 1, 'anchor must appear exactly once'
report.write_text(content.replace(anchor, section + '\n' + anchor, 1))
EOF
```
Expected: the printed table has a non-empty summary in every row and six `PASS`. An empty summary means the grep pattern missed that tool's line: copy the real summary line from the log into that cell by hand.

- [ ] **Step 8: Run the docs tests**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_cutover_docs.py -q
```
Expected: `50 passed`.

- [ ] **Step 9: Commit**

```bash
cd /home/p4nic/code/noema
git add docs/TEST_REPORT.md tests/test_cutover_docs.py
git commit -m "docs(test-report): record the final cutover gate run"
```

---

### Task 11: Parity-map and handbook-trace completeness

**Files:**
- Modify: `tests/test_cutover_docs.py` (trace helpers and four tests)
- Modify: `docs/superpowers/specs/parity-map.md` (Status column only)
- Modify: `docs/superpowers/specs/handbook-trace.md` (Status column; plus the test cell of the rows mapped to this cutover phase)
- Create (scratch, never committed): `/tmp/noema-cutover-bench/flip-status.py`

**Interfaces:**
- Consumes: the tables written by `01-foundation.md` Task 1 Steps 7–8 (parity map: `| # | Source | Label (verbatim) | Phase | Target test file | Status |`; handbook trace: `| ID | Spec §4.7 bullet | Handbook | Owning plan task | Test (file › title) | Status |`, one row per spec §4.7 bullet with IDs R1–R9, U1–U25, C1–C3, T1) and the `## Terrain detail (04-terrain.md)` rows U25.1–U25.7 appended by `04-terrain.md` Task 8. Status vocabulary (foundation map header): `planned` → `green` (this phase) and `drop (proposed): <reason>` → `drop (approved)` (owner only). A row names its test by a repo-relative path matching `(web|electron|tests)/….(ts|tsx|py)`. Cells are split on unescaped `|` only (row U5 contains `str \| None`).
- Produces: `PARITY`, `TRACE`, `TEST_PATH`, `CELL_SPLIT`, `SPEC_4_7_TRACE_IDS: list[str]`, `is_separator(line: str) -> bool`, `cells_of(line: str) -> list[str]`, `status_rows(name: str) -> list[tuple[str, str]]`, `test_parity_rows_are_green_or_approved_drops()`, `test_handbook_trace_rows_are_green()`, `test_green_rows_name_an_existing_test(name)`, `TITLE_TOKEN`, `cited_titles(cell: str) -> list[tuple[str | None, str]]`, `defines_test(path: str | None, title: str) -> bool`, `test_green_rows_cite_existing_test_titles(name)`, `test_every_spec_4_7_bullet_has_a_green_trace_row()`.

Precondition: Task 10's gate passed with nothing skipped, so every existing test that a row names has run green on `cutover-gate`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_cutover_docs.py`:
```python
PARITY = 'docs/superpowers/specs/parity-map.md'
TRACE = 'docs/superpowers/specs/handbook-trace.md'
TEST_PATH = re.compile(r'\b((?:web|electron|tests)/[\w./-]+\.(?:ts|tsx|py))\b')
CELL_SPLIT = re.compile(r'(?<!\\)\|')  # a `\|` inside a cell is content, not a column break

# handbook-trace.md has exactly one row per spec §4.7 bullet (01-foundation.md Task 1 Step 8).
SPEC_4_7_TRACE_IDS = ([f'R{n}' for n in range(1, 10)] + [f'U{n}' for n in range(1, 26)]
                      + ['C1', 'C2', 'C3', 'T1'])


def is_separator(line):
    return re.match(r'^\|\s*:?-{3,}', line.strip()) is not None


def cells_of(line):
    return [cell.strip() for cell in CELL_SPLIT.split(line.strip().strip('|'))]


def status_rows(name):
    """(status, row) for every row of every table that has a Status column."""
    lines = text(name).splitlines()
    rows, status_at = [], None
    for index, line in enumerate(lines):
        stripped = line.strip()
        if not stripped.startswith('|'):
            status_at = None
        elif index + 1 < len(lines) and is_separator(lines[index + 1]):
            columns = [cell.lower() for cell in cells_of(stripped)]
            status_at = columns.index('status') if 'status' in columns else None
        elif status_at is not None and not is_separator(stripped):
            cells = cells_of(stripped)
            rows.append((cells[status_at].lower() if status_at < len(cells) else '', stripped))
    return rows


def test_parity_rows_are_green_or_approved_drops():
    rows = status_rows(PARITY)
    assert rows, 'parity-map.md has no table with a Status column'
    assert [row for status, row in rows if status != 'green' and not status.startswith('drop (approved)')] == []


def test_handbook_trace_rows_are_green():
    rows = status_rows(TRACE)
    assert rows, 'handbook-trace.md has no table with a Status column'
    assert [row for status, row in rows if status != 'green'] == []


@pytest.mark.parametrize('name', [PARITY, TRACE])
def test_green_rows_name_an_existing_test(name):
    def names_only_existing_tests(row):
        paths = TEST_PATH.findall(row)
        return bool(paths) and all((ROOT / path).is_file() for path in paths)
    assert [row for status, row in status_rows(name) if status == 'green' and not names_only_existing_tests(row)] == []


TITLE_TOKEN = re.compile(r'"([^"]+)"|`(test_\w+)`|\b((?:web|electron|tests)/[\w./-]+\.(?:ts|tsx|py))\b')


def cited_titles(cell):
    """(path, title) pairs: each quoted title or `test_*` name belongs to the nearest path before it."""
    pairs, current = [], None
    for match in TITLE_TOKEN.finditer(cell):
        quoted, name, path = match.groups()
        if path:
            current = path
        else:
            pairs.append((current, quoted or name))
    return pairs


def defines_test(path, title):
    if path is None or not (ROOT / path).is_file():
        return False
    source = (ROOT / path).read_text(encoding='utf-8')
    variants = {title, title.replace("'", "\\'")}
    return f'def {title}(' in source or any(q + v + q in source for v in variants for q in ("'", '"', '`'))


@pytest.mark.parametrize('name', [PARITY, TRACE])
def test_green_rows_cite_existing_test_titles(name):
    """Spec §8 rule: a green row's test exists under its title, not just its file."""
    missing = []
    for status, row in status_rows(name):
        if status != 'green':
            continue
        cells = cells_of(row)
        test_cell = cells[4]   # parity: Target test file; trace: Test (file › title)
        pairs = cited_titles(test_cell)
        # A parity row that cites no title uses its label as the title. Computed labels (code spans) are rendered by a
        # parametrized test and the pageErrors rows by an auto fixture, so neither has a literal title to find.
        if not pairs and name == PARITY and not cells[2].startswith('`') and 'auto fixture' not in test_cell:
            pairs = [(path, cells[2].replace('\\|', '|')) for path in TEST_PATH.findall(test_cell)]
        missing += [f'{cells[0]}: {path} › {title}' for path, title in pairs if not defines_test(path, title)]
    assert missing == []


def test_every_spec_4_7_bullet_has_a_green_trace_row():
    green_ids = {cells_of(row)[0] for status, row in status_rows(TRACE) if status == 'green'}
    assert [row_id for row_id in SPEC_4_7_TRACE_IDS if row_id not in green_ids] == []
```

- [ ] **Step 2: Run them and watch them fail**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_cutover_docs.py -k "parity or trace or bullet" -q
```
Expected: `3 failed, 4 passed`. `test_parity_rows_are_green_or_approved_drops` and `test_handbook_trace_rows_are_green` list the `planned` / `drop (proposed)` rows; `test_every_spec_4_7_bullet_has_a_green_trace_row` lists all 38 IDs `R1` … `T1`; the two `test_green_rows_name_an_existing_test` and the two `test_green_rows_cite_existing_test_titles` cases pass (no row is green yet). If a test fails with `has no table with a Status column`, the foundation phase wrote another format: stop and report it.

- [ ] **Step 3: Write the one-off status flipper**

Create `/tmp/noema-cutover-bench/flip-status.py`:
```python
"""One-off: mark rows green when the test they name exists (run only after a fully green gate)."""
from pathlib import Path
import re
import sys

ROOT = Path('/home/p4nic/code/noema')
TEST_PATH = re.compile(r'\b((?:web|electron|tests)/[\w./-]+\.(?:ts|tsx|py))\b')
CELL_SPLIT = re.compile(r'(?<!\\)\|')  # same rule as tests/test_cutover_docs.py


def is_separator(line):
    return re.match(r'^\|\s*:?-{3,}', line.strip()) is not None


for name in sys.argv[1:]:
    path = ROOT / name
    lines = path.read_text(encoding='utf-8').splitlines(keepends=True)
    status_at = None
    for index, line in enumerate(lines):
        stripped = line.strip()
        if not stripped.startswith('|'):
            status_at = None
            continue
        if index + 1 < len(lines) and is_separator(lines[index + 1]):
            columns = [cell.strip().lower() for cell in CELL_SPLIT.split(stripped.strip('|'))]
            status_at = columns.index('status') if 'status' in columns else None
            continue
        if status_at is None or is_separator(stripped):
            continue
        cells = CELL_SPLIT.split(stripped.strip('|'))
        status = cells[status_at].strip().lower()
        if status == 'green' or status.startswith('drop (approved)'):
            continue
        if status.startswith('drop'):  # only the owner turns a proposed drop into an approved one (Step 6)
            print(f'{name}:{index + 1}: DROP? [{status}] {stripped[:200]}')
            continue
        paths = TEST_PATH.findall(stripped)
        if paths and all((ROOT / found).is_file() for found in paths):
            cells[status_at] = ' green '
            lines[index] = '|' + '|'.join(cells) + '|\n'
        else:
            print(f'{name}:{index + 1}: NO TEST [{status}] {stripped[:200]}')
    path.write_text(''.join(lines), encoding='utf-8')
```

- [ ] **Step 4: Flip rows whose named test exists**

```bash
cd /home/p4nic/code/noema
.venv/bin/python /tmp/noema-cutover-bench/flip-status.py docs/superpowers/specs/parity-map.md docs/superpowers/specs/handbook-trace.md
git diff --stat docs/superpowers/specs/
```
Expected: printed lines only of kind `DROP?` (parity-map rows the foundation phase recorded as `drop (proposed): …`) and exactly four `NO TEST` lines, all in handbook-trace: `C2`, `C3` and `U25.7` (their test cell names `docs/TEST_REPORT.md`) and `T1` (test cell `this file`). Any other `NO TEST` row is a gap in an earlier phase: stop and report it.

- [ ] **Step 5: Point the four cutover-owned trace rows at their tests**

This deviates from contract §10 (status column only) because these tests are created by this phase and could not be named earlier; mention it to the owner in Task 13 Step 5.
```bash
cd /home/p4nic/code/noema
.venv/bin/python - <<'EOF'
from pathlib import Path
path = Path('docs/superpowers/specs/handbook-trace.md')
NEW = {  # row id: (old test cell, new test cell)
    'C2': ('`docs/TEST_REPORT.md` › terrain budget table',
           '`tests/test_cutover_docs.py` › `test_test_report_records_terrain_budget`'),
    'C3': ('`docs/TEST_REPORT.md` › process-tree memory',
           '`tests/test_cutover_docs.py` › `test_test_report_records_main_app_memory`'),
    'U25.7': ('`docs/TEST_REPORT.md` › Terrain budget, Animated row',
              '`tests/test_cutover_docs.py` › `test_test_report_records_terrain_budget`'),
    'T1': ('| this file |',
           '| `tests/test_cutover_docs.py` › `test_every_spec_4_7_bullet_has_a_green_trace_row` |'),
}
lines = path.read_text(encoding='utf-8').splitlines(keepends=True)
done = set()
for index, line in enumerate(lines):
    for row_id, (old, new) in NEW.items():
        if line.startswith(f'| {row_id} |'):
            body = line.rstrip('\n')
            assert body.count(old) == 1 and body.endswith('| planned |'), body
            lines[index] = body.replace(old, new)[:-len('| planned |')] + '| green |\n'
            done.add(row_id)
assert done == set(NEW), sorted(set(NEW) - done)
path.write_text(''.join(lines), encoding='utf-8')
EOF
grep -cE '^\| (C2|C3|U25\.7|T1) \|.*\| green \|$' docs/superpowers/specs/handbook-trace.md
```
Expected: `4`. An `AssertionError` means a row's wording differs from `01-foundation.md` Task 1 Step 8 / `04-terrain.md` Task 8: stop and report it.

- [ ] **Step 6: Ask the owner to approve the drops**

Show the owner every `DROP?` row from Step 4 (row text and its recorded reason) and ask: "These parity-map checks are recorded as drops. Approve each one, or name the ones that need a test before the cutover?" For each approved row, change the start of its Status cell from `drop (proposed)` to `drop (approved)` and keep the reason. A row the owner does not approve blocks the cutover until a test covers it.

- [ ] **Step 7: Run the completeness tests**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_cutover_docs.py -q
```
Expected: `57 passed`. If `test_every_spec_4_7_bullet_has_a_green_trace_row` lists an ID, handbook-trace lacks that bullet's row: it is a foundation-phase gap — stop and report it. If `test_green_rows_cite_existing_test_titles` lists a row, the test file exists but no test carries the cited title (or, for a parity row without a cited title, the verbatim label): an earlier phase renamed or never wrote that test — stop and report it to the owning phase; never edit the title in the map to make it pass.

- [ ] **Step 8: Commit**

```bash
cd /home/p4nic/code/noema
git add docs/superpowers/specs/parity-map.md docs/superpowers/specs/handbook-trace.md tests/test_cutover_docs.py
git commit -m "docs: mark parity-map and handbook-trace rows green after the cutover gate"
```

---

### Task 12: Regenerate `SHA256SUMS`

**Files:**
- Modify: `SHA256SUMS` (whole file)

**Interfaces:**
- Consumes: the final tracked tree.
- Produces: `SHA256SUMS` = sha256 of every tracked file except itself, in `git ls-files` order, `sha256sum` format.

This must be the last content commit before the merge; any later commit must regenerate it again.

- [ ] **Step 1: Show the current manifest is stale**

```bash
cd /home/p4nic/code/noema
sha256sum -c --quiet SHA256SUMS 2>/dev/null | head -3; echo "exit ${PIPESTATUS[0]}"
```
Expected: `FAILED` lines (for example `public/app.js: FAILED open or read`) and a non-zero exit.

- [ ] **Step 2: Regenerate over the tracked tree**

```bash
cd /home/p4nic/code/noema
test -z "$(git status --porcelain --untracked-files=no)" || { echo 'commit first'; exit 1; }
git ls-files -z | grep -zvx 'SHA256SUMS' | xargs -0 sha256sum > SHA256SUMS
```

- [ ] **Step 3: Verify hashes and coverage**

```bash
cd /home/p4nic/code/noema
sha256sum -c --quiet SHA256SUMS && echo hashes-ok
test "$(wc -l < SHA256SUMS)" -eq "$(git ls-files | grep -vxc 'SHA256SUMS')" && echo count-ok
grep -cE '  (public|desktop)/' SHA256SUMS
grep -c '  tools/assets/cat.png$' SHA256SUMS
```
Expected: `hashes-ok`, `count-ok`, `0`, `1`.

- [ ] **Step 4: Commit**

```bash
cd /home/p4nic/code/noema
git add SHA256SUMS
git commit -m "chore: regenerate SHA256SUMS for the cutover tree"
```

---

### Task 13: Pre-merge checklist and the cutover merge (owner approval required)

**Files:**
- Test: none new; reruns `.venv/bin/python -m pytest`
- Modify: none on the branch; creates the merge commit on `master`

**Interfaces:**
- Consumes: tags `pre-react-electron`, `cutover-docs-baseline`, `cutover-gate`; `/home/p4nic/code/noema-cutover-backup`; TEST_REPORT subsections from Tasks 9–10.
- Produces: merge commit on `master`, tag `react-electron-cutover` (named in PROGRESS's rollback steps).

- [ ] **Step 1: Branch state**

```bash
cd /home/p4nic/code/noema
git rev-parse --abbrev-ref HEAD
git status --porcelain --untracked-files=no
git merge-base --is-ancestor master feat/react-electron && echo master-is-ancestor
git ls-files web/dist electron/dist | wc -l
```
Expected: `feat/react-electron`, no output, `master-is-ancestor`, `0`. If `master` moved, merge it into the branch, rerun Task 10 Steps 4–5 and Task 12, then restart this task.

- [ ] **Step 2: Only docs, SHA256SUMS and the docs test changed since the gate**

```bash
cd /home/p4nic/code/noema
git diff --name-only cutover-gate..HEAD | grep -vE '^(docs/|SHA256SUMS$|tests/test_cutover_docs\.py$)'
echo "exit $?"
.venv/bin/python -m pytest -q
sha256sum -c --quiet SHA256SUMS && echo hashes-ok
```
Expected: no file names, `exit 1`; pytest all passed with no `skipped`; `hashes-ok`. A code change after the gate means rerun Task 10 Steps 4–5 and Task 12.

- [ ] **Step 3: Recovery material exists**

```bash
cd /home/p4nic/code/noema
git rev-parse --short pre-react-electron cutover-docs-baseline cutover-gate
test -s /home/p4nic/code/noema-cutover-backup/untracked-files.txt && echo backup-ok
grep -c '^Next validation gate: physical Sway acceptance (handbook §24 Stage A)' docs/PROGRESS.md
```
Expected: three short hashes, `backup-ok`, `1`.

- [ ] **Step 4: Collect the measured results for the owner**

```bash
cd /home/p4nic/code/noema
grep -E '^\| (Animated|Paused|Hidden): ' docs/TEST_REPORT.md
grep -E '^\*\*Overall: (PASS|FAIL)\*\*$' docs/TEST_REPORT.md
grep -E '^Result: (PASS|FAIL)$' docs/TEST_REPORT.md | head -1
```
Expected: the terrain phase's three budget rows, its overall line and the memory result. Every budget row and the overall line should read `PASS` (spec §1: the terrain meets the measured budget). A `FAIL` blocks the merge unless the owner explicitly accepts it in Step 5. The memory result is recorded whether it passes or not and does not block.

- [ ] **Step 5: Ask the owner for approval — stop here until they answer**

Send the owner the results of Steps 1–4, the four handbook-trace rows whose test cell Task 11 Step 5 filled in (contract §10 deviation), and ask exactly: "Full gate green on `cutover-gate`; parity-map and handbook-trace complete; terrain budget <the Overall line from Step 4>; main-app memory <the Result line from Step 4>; `SHA256SUMS` verified; rollback tags and backup in place. Merge `feat/react-electron` into `master` now?" If the terrain line reads `FAIL`, say so first and ask whether the owner accepts it. Proceed only on an explicit yes from the owner. Any other answer ends the task with the branch unmerged.

- [ ] **Step 6: Merge and tag**

```bash
cd /home/p4nic/code/noema
git switch master
git merge --no-ff feat/react-electron -m "feat: cut over to the React + Electron UI"
git tag react-electron-cutover
```
Expected: a merge commit with no conflicts (`master` is an ancestor, Step 1). Do not push unless the owner asks.

- [ ] **Step 7: Verify `master` after the merge**

```bash
cd /home/p4nic/code/noema
git rev-parse --abbrev-ref HEAD
test ! -e public && test ! -e desktop && echo deleted-ok
sha256sum -c --quiet SHA256SUMS && echo hashes-ok
npm --prefix web run build && .venv/bin/python -m pytest -q
```
Expected: `master`, `deleted-ok`, `hashes-ok`, build succeeds, pytest all passed. A failure here: follow "Rollback to the pre-migration UI" in `docs/PROGRESS.md` (also listed below) and tell the owner.

---

## Rollback

Recorded in `docs/PROGRESS.md` by Task 8; repeated here so the executor has it without the docs.

1. **Flush first.** In the Electron app, wait until the status line no longer shows "N capture(s) on this device" (open it and Retry if needed), then quit. Captures still queued inside the Electron profile are not readable by the restored Rust/WebKit shell — accepted (spec §9, decision 11C).
2. **Revert and restore what `git revert` cannot:**
   ```bash
   cd /home/p4nic/code/noema
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
   The revert deletes the docs because they were untracked on `master` before the cutover; the `cutover-docs-baseline` checkout brings back their pre-migration text. The backup restores `desktop/examples/`, `desktop/qa/scenario.js`, `desktop/.qmlls.ini`, the Rust `target/` build and `tests/now_state.test.cjs`, none of which git ever tracked.
3. **Browsers:** old and new UIs share `noema-local-v1` version 1, so queued captures survive. The reinstalled v1 service worker deletes nothing of v1's, and the v2 `noema-shell-<hash>` caches are only stale storage.
4. To keep the migration's spec and plans for reference after a rollback: `git checkout react-electron-cutover^2 -- docs/superpowers`.

---

## Spec coverage

| Spec requirement in scope | Task |
|---|---|
| §3 delete `public/` | 3 |
| §3 delete `desktop/` | 3 |
| §3 delete `experiments/ui-ab/hosts/wry` | 3 |
| §3 delete `experiments/ui-ab/hosts/companion` | 3 |
| Contract §10: delete `tests/now_state.test.cjs` (ported) | 1 (port present), 3 |
| Consequence of the §3 deletion: the `public/app.js` verbatim check in `web/src/strings.test.ts` would become a permanent skip | 3 Step 5 (removed; `S` stays pinned by `toEqual`) |
| §3 `public/cat.png` → `tools/assets/cat.png` | 2 |
| §3 one-line change `tools/sway_companion.py:271` | 2 |
| §3 one-line change `tests/test_companion.py:15` (§8 Python bullet) | 2 |
| §3 both recorded in `docs/ASSETS.md` | 7 |
| §3 experiment evidence stays as history; Variant A stays on its branch | 3 (only the two hosts are deleted; no branch touched) |
| §3 `web/dist` not committed | 13 Step 1 |
| §3 `SHA256SUMS` regenerated at cutover (also §9) | 12 |
| §3 one cutover merge, blocked until §8 passes | 13 |
| §3/§8 gate commands, final full run | 1 Step 3 (baseline), 10 |
| §8 parity gate: every row green or approved drop | 11 |
| §4.7 handbook-trace: every bullet has a green test | 11 |
| §7 terrain budget measured once with scratch harness, recorded in TEST_REPORT (13B) | 9 Step 2 (runs `04-terrain.md` Task 9 only if it has not run; stops on a second record), 9 Step 1 test checks the record, 1 Step 2 counts it, 13 Step 4 shows it to the owner |
| §4.7 Compute: main-app tree < 400 MB excluding AI, recorded pass or fail | 9 |
| §4.7 Compute: quiet background < 1% of one core (paused/hidden budget) | Paused/Hidden rows of the single terrain run (9 Step 2); 9 checks the record, 11 traces it |
| §9 README (Node requirement, build step) | 4 |
| §9 `docs/ARCHITECTURE.md` | 7 |
| §9 `docs/DESKTOP.md` (Electron, protocol 2) | 5 |
| §9 `docs/SECURITY.md` (Electron posture, profile as credential store, session-only permissions) | 6 |
| §9 `docs/API.md` (`files` → `attachments`, `/api/desktop-instance` protocol 2) | 6 |
| §9 `docs/PHYSICAL_SWAY_ACCEPTANCE.md` (launch commands) | 5 |
| §9 `docs/BUILD_STATUS.md` | 7 |
| §9 `docs/CONTINUATION.md` | 7 |
| §9 `docs/ASSETS.md` (fonts and licences, sprite path) | 7 |
| §9 `docs/TEST_REPORT.md` (new suites, terrain numbers) | 9, 10 |
| §9 `docs/PROGRESS.md` (milestone; handbook "static UI" decision superseded) | 8 |
| §9 archived handbook not edited | 1 (tracked unchanged; no task edits it) |
| §9 Rollback: revert merge; shared `noema-local-v1` v1; v1 SW deletes nothing; Electron-profile captures accepted, flush first | 1 (tags), 3 (backup), 8 (PROGRESS), Rollback section |
| §10 PROGRESS keeps physical Sway acceptance (Stage A) as the next validation gate | 8 (also 4, 5, 7) |
| §2 18B slogans kept in `web/src/copy.ts`; daily rotation later (§11.2) — and the owner's request to allow a daily motivating slogan in future | 7, 8 (recorded as a later milestone; not built) |
| §2 19A AI-assigned priority is the next milestone (§11.1) — and the owner's note that priority is labelled automatically by AI | 4, 7, 8 (recorded as the next build milestone; UI labels already in place; not built) |
| §1 success: Electron runs the same bundle (external and managed) — documented | 5, 6 |
| Pre-merge checklist and the merge after owner approval | 13 |
