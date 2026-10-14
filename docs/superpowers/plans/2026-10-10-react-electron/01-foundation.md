# Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `feat/react-electron` branch with everything later phases build on: the parity map and handbook trace, the pinned `web/` toolchain, the shared `S` strings and zod entry point, the content-hashed Vite build with an injected service-worker precache, FastAPI serving of `web/dist` (with the `dist_dir` parameter, the 503 page and the `display_name` setting), a Playwright harness (real `run.py` on a throwaway data dir and free port, CSP and page-error listeners, fault injection) with the Phase-1 serving and service-worker E2E tests, and the data layer (contract P2: zod-parsed API client and boot order, replay-policy table, connection state, v1-compatible IndexedDB drafts and outbox, QueryClient with the snapshot cadence and mutation hooks) with the upgrade, reconnect, lost-acknowledgement and cookie-only E2E tests.

**Architecture:** `web/` is a Vite + React + TypeScript package whose `npm run build` type-checks, bundles to `web/dist`, prepends `CACHE`/`PRECACHE` to `dist/sw.js` and refuses unhashed assets. FastAPI serves exactly five explicit paths from `dist_dir` (default `<repo>/web/dist`) and keeps every API and `protect()` rule unchanged. The service worker is cache-first for `/assets/*`, network-first for navigations with a cached-shell fallback on network errors and 5xx, and never touches `/api/`, cross-origin or non-GET requests. E2E tests start the real service per test. The data layer of contract §3–§4 (owner P2) is built here too: `api/` parses every response with zod and never retries, `local/` keeps the `public/app.js` IndexedDB shapes and invariants, `state/` wraps TanStack Query (no mutation retries, 15 s visible-only snapshot cadence). Routes, shell and screens are **not** in this phase (`02-screens-core.md` creates them); this phase renders a minimal `<main data-quiet><h1>Noema</h1></main>` page that boots and flushes the outbox (Task 19), which `02-screens-core.md` Task 14 replaces.

**Tech Stack:** Node 22.23.3 (npm `node` devDependency), React 19.3.0, TypeScript 5.9.3, Vite 6.4.4, Vitest 5.0.3, fake-indexeddb 6.2.5, @playwright/test 1.64.0 (Chromium), zod 4.1.12, TanStack Query 5.104.1 (used from Task 18) / Router 1.170.42 (installed, used from `02-screens-core.md`), jsdom 30.1.2 and @testing-library/react 16.3.3 (hook tests), Python 3 `.venv` with FastAPI/Starlette 0.50 and pytest.

**Spec:** /home/p4nic/code/noema/docs/superpowers/specs/2026-10-10-react-electron-migration-design.md (sections §3, §4.1, §4.2, §4.3, §4.4, §4.7 backend `display_name` + traceability, §5 checklist rule, §6.1, §6.2, §8 rule/fault injection/E2E harness/unit api, local, domain `connected` and replay list, state/Phase-1 E2E/Python split) · **Contract:** /home/p4nic/code/noema/docs/superpowers/plans/2026-10-10-react-electron/00-contract.md

## Prerequisites (which earlier phase files must be complete)

- None: this is the first phase. Start from `master` at `e0ca9ad` (or later) with no modified tracked files (`git status --short --untracked-files=no` prints nothing). Untracked files (spec, contract, `qa/`, `tests/now_state.test.cjs`, `README.md`) stay untracked and are never added by this phase.
- `.venv/bin/python -m pytest tests/test_core.py` passes before you start (61 tests at `e0ca9ad`).
- `experiments/ui-ab/node_modules/typescript` exists (Task 1 uses its scanner). If it is missing, run `npm --prefix experiments/ui-ab ci` first.
- Network access for `npm install` and `playwright install chromium`.
- **Scope (resolved against the sibling plans):** this plan is contract P1 **and** P2. `02-screens-core.md`, `03-screens-capture-notes.md` and `04-terrain.md` all require `web/src/api/*`, `local/*`, `domain/{connection,format}.ts`, `state/*` and `test/fixtures.ts` from this plan, and no `02-data.md` exists in this directory. Ownership details:
  - `domain/nowState.ts` and the rest of `domain/tasks.ts` belong to `02-screens-core.md` Tasks 2–3. This plan creates `domain/tasks.ts` with only `TASK_EDIT_FIELDS` and `editableFields` (Task 18 needs them for `usePatchTask`); `02-screens-core.md`'s ownership note switches its Task 3 to Modify.
  - Spec §4.5 (router, legacy rewrite, guards, keyboard) is created by `02-screens-core.md` Tasks 7, 8 and 14. This plan does not create those files, so no file is created by two plans.
  - `web/src/ui/Toast.tsx` is a small stand-in here because the data layer calls `toast()` (contract §4.3–4.4). `02-screens-core.md` Task 4 overwrites `Toast.tsx` and `Toast.test.tsx` with the full component and keeps the `toast(message, options)` signature.
  - `web/e2e/outbox.spec.ts` (contract §9.4 lists it under P3) is created here in Task 19: no sibling plan creates it, `03-screens-capture-notes.md` already treats it as existing, and its upgrade and lost-acknowledgement tests need only the data layer and the boot added to the minimal page.

## Global Constraints (one line each, exact values copied verbatim from the spec that apply to this phase)

- Node 22.x, pinned in `.nvmrc` and in `engines` (contract: `.nvmrc` = `22.23.3`, `"engines": {"node": "^22.22.2"}`).
- Exact versions with lockfiles in `web/` and `electron/`: Electron, Vite, TypeScript, Vitest, Playwright, React, zod, TanStack (versions: contract §1.1).
- `web/dist` is **not committed**. It is gitignored and built by `npm --prefix web ci && npm --prefix web run build`.
- Gate commands: `npm --prefix web ci` · `npm --prefix web run build` · `npm --prefix web test` · `npm --prefix web run e2e` · `.venv/bin/python -m pytest` (`npm --prefix electron test` starts in P6).
- zod runs with `z.config({ jitless: true })`. It is set once before any schema is created, so zod never probes `new Function`, which the CSP blocks.
- Fonts and images are imported from `src`, so Vite content-hashes them. `build.assetsInlineLimit: 0`.
- There is no `public/` folder inside `web/` except `manifest.webmanifest`, `icon.svg` and `sw.js`.
- `create_app` takes the dist directory as a parameter (default `<repo>/web/dist`), so tests can inject one.
- Routes (explicit, no catch-all): `/` → `dist/index.html` `no-cache`; `/assets/*` → `StaticFiles(dist/assets, check_dir=False)` `public, max-age=31536000, immutable`; `/sw.js` → `dist/sw.js`, plus `Service-Worker-Allowed: /`, `no-cache`; `/manifest.webmanifest`, `/icon.svg` → dist root, `no-cache`.
- A build check fails if any file under `dist/assets` lacks a content hash.
- The manifest keeps `start_url: "/"` and `scope: "/"`, and adds `id: "/"`.
- If `index.html` is missing, `/` returns a plain 503 page: "Frontend not built: run `npm --prefix web run build`". The API keeps working either way.
- `/static`, `/companion` and `public/` serving are removed.
- `protect()` stays unchanged: Host/Origin checks, request marker, CSP and headers.
- The production build emits no inline scripts. Vite's modulepreload polyfill is disabled, because only modern Chromium and Firefox are targeted.
- Service worker cache name: `noema-shell-<buildhash>`, generated by the same build step that writes the precache list.
- Precache: every file in the Vite output (all JS chunks, CSS, fonts, images), plus `/`, the manifest and the icon. `sw.js` and source maps are excluded.
- `install`: precache inside `waitUntil`, then `self.skipWaiting()`.
- `activate`: inside `waitUntil`, delete every `noema-shell-*` cache except the current one (this includes v1's `noema-shell-v1`), then `clients.claim()`.
- `fetch`: `/assets/*` is cache-first, with network fallback; successful responses are added to the cache. Navigations are network-first. On a network error **or any 5xx**, they fall back to the cached `/`. Only OK responses are ever cached. `/api/`, cross-origin and non-GET requests are never touched.
- `SettingsInput.display_name: str | None` (strip, max 60 chars). `DEFAULT_SETTINGS['display_name'] = ''`. Tested in `tests/test_core.py`.
- Fault injection: the E2E harness injects storage races and faults by monkey-patching `indexedDB`/`fetch` in `page.addInitScript`. No production test hooks are added, except the `?e2e=1` terrain seam.
- E2E (Playwright, real FastAPI, throwaway data dir and port); CSP: a `securitypolicyviolation` listener installed from the first navigation records zero violations.
- `tests/test_core.py`'s static assertions are split: one test asserts the 503 page with no dist; one asserts the routes and headers with a minimal dist generated in `tmp_path` (via the `create_app` dist parameter).
- Parity rule: the plan's first task produces `docs/superpowers/specs/parity-map.md` mapping every check label in the source suites to a new test or a recorded drop with a reason; labels and toasts are copied verbatim from `public/app.js`.
- API client: "Same origin only, with `credentials: 'same-origin'`." "Every request sends `X-Noema-Request: 1`. Body is JSON unless it is `FormData`." Errors by body shape: "a `detail` string → message; a `detail` array → joined validation messages; a non-JSON or empty body → `Request failed (<status>)`." "Every response the UI consumes is parsed with a zod schema. A parse failure is an error state, never coerced."
- Boot: "`GET /api/state`. Only on a 401, `POST /api/session {token:''}` (loopback auto-login). Only on a second 401, open Unlock." "Responses from `/api/session` are exempt from the global '401 → Unlock' rule."
- QueryClient: "`networkMode: 'always'` for queries and mutations", "`mutations.retry: 0`", "Queries retry at most 2× on network errors and 5xx."
- Connection: "`connected` is true only after the most recent `GET /api/state` succeeded. It becomes false immediately on any failed state fetch, on any network error from the client, on the window `offline` event, and on the desktop `noema:service-down` event."
- Snapshot: "`refetchInterval` 15 s while visible, no fetch while hidden", "Refetch on becoming visible, on `online`, and on `noema:service-up`." "Every success is persisted to `kv.snapshot`."
- Replay: "The UI **never automatically retries a mutation**." Only the capture outbox and task capture are idempotent by key. "A unit test enumerates this list against the client's endpoint table." "Every edit carries `expected_version`."
- Database: "`noema-local-v1`, **version 1**", same stores and record shapes as `public/app.js`. "The transaction helper resolves on `oncomplete`; any exception aborts the transaction." "Save is one `['kv','outbox']` readwrite transaction: `outbox.add(record)` (so a duplicate id fails) plus `kv.put(nextDraft,'draft')`. The in-memory draft is replaced only after commit." "Draft writes are serialised. A version counter keeps stale writes from setting status labels. Typing is debounced 350 ms."
- Flush: "Single-flight, and skipped while `!connected`." "IndexedDB key order", "Items with `error` are skipped." "The item is deleted only after a 2xx. A 4xx other than 401 stores `error` and stops. A 401, a 5xx or a network failure stops without marking." "'Saved to {folder}' appears only after a server acknowledgement for exactly one flushed item." "`onversionchange` closes the database. `onblocked` reports 'Close other Noema tabs'."
- Validation: "At most 12 files, each ≤ 32 MB." "Total payload < 60 MB." MIME allowlist `noema/server.py:40-48`: "images: png, jpeg, webp; audio: wav, ogg, webm, mp4, mpeg."
- Task capture: "`pending` is persisted before any HTTP call. If that write fails, the error is 'Draft storage failed. Task not added'." "The acknowledgement must have an `id` and `original_input === raw`." "409, 5xx or network error: stay frozen and show 'Retry add task'. 401 or any other 4xx: unfreeze." "`local_day` ... is replayed unchanged on retry, even across midnight."
- Owner decisions (never reopened here): slogans/subtitles/tagline are kept in `web/src/copy.ts` (P3, decision 18B); AI-assigned priority (§11.1) and daily slogans (§11.2) are not built in this migration.
- Commits: run on branch `feat/react-electron`; stage exact paths only; Conventional Commit subject; every message ends with the attribution trailer the executing session supplies (contract §0).

## Review Focus (the six input classes/failure modes most likely to bite a user that the spec implies; for each, the owning task must include a test for it)

1. **Missing or half-written frontend build** (fresh checkout, `vite build --watch` mid-rebuild, deleted `dist/assets`): `/` must answer a plain 503 with the build hint, `/assets/*` must 404 instead of 500, the API must keep working, and a broken dist must fail the build instead of shipping. Owner: Task 4 (`check-hashes`/`sw-precache` refuse broken dists) and Task 6 (`test_frontend_not_built_returns_503`).
2. **Upgrading a browser that already runs an older build** (v1 `noema-shell-v1` worker, or two consecutive v2 builds): the new worker must take over and purge every older `noema-shell-*` cache so users never run mixed bundles. Owner: Task 10 (`takes over a page controlled by the v1 service worker…`, `two consecutive builds purge the older shell cache`).
3. **Server down, restarting or returning 5xx while the user opens the app** (offline laptop, crashed service, 503 during a rebuild): navigations must fall back to the cached shell, every precached chunk and font must load, and `/api/` must never be answered from cache. Owner: Task 10 (offline cold boot and 5xx fallback tests).
4. **Non-loopback, plain-HTTP origin with only a session cookie** (phone or tablet hitting `http://host:8765`): no secure context means no service worker and no `crypto.randomUUID`; the shell must still boot with zero CSP violations and zero page errors, without calling `/api/session`. Owner: Task 14 (`uid` fallback) and Task 19 (`a non-loopback Host with only a valid cookie reaches the shell and the API`).
5. **Old workspaces and untrusted settings input** (settings rows written before `display_name` existed; names with padding, 61+ characters or non-strings): old rows must read as `''`, input is stripped before the 60-character limit, and nothing is coerced. Owner: Task 7 (`test_display_name_setting`).
6. **Captures queued by the old UI, lost acknowledgements and failing local storage** (an upgraded browser with a v1 outbox item, a server that commits but whose reply is lost, a quota error or an aborted transaction during Save): every item uploads exactly once with its original id, a lost acknowledgement keeps the item queued and replays the same `capture_id`, and a failed Save leaves both stores and the editor unchanged. Owner: Task 15 (`Native abort after request success still rolls back both stores`), Task 17 (`replays a lost acknowledgement with the same capture_id`) and Task 19 (the upgrade and lost-acknowledgement E2E).

---

### Task 1: Branch, parity map and handbook trace (spec §8 rule, §4.4 labels, §5 checklist, §4.7 traceability)

**Files:**
- Create: `docs/superpowers/specs/parity-map.md`
- Create: `docs/superpowers/specs/handbook-trace.md`
- Scratch only (never committed): `${TMPDIR:-/tmp}/noema-parity/extract_labels.py`, `extract_strings.cjs`, `section_b.py`, `check_section_a.py`, `labels.tsv`, `strings.tsv`, `section-b.md`
- Test: `check_section_a.py` (scratch) verifies the map against the source suites

**Interfaces:**
- Consumes: source suites `qa/browser_check.py`, `qa/native_storage_check.py`, `qa/now_ui_check.py`, `qa/task_capture_check.py`, `qa/task_link_check.py`, `qa/settings_link_check.py`, `qa/webview_check.py`, `desktop/qa/scenario.js`, `experiments/ui-ab/scripts/verify.py`, `tests/now_state.test.cjs`, `tests/test_managed_service.py`; `public/app.js`; contract §5 (`S` keys).
- Produces: `parity-map.md` Section A (202 check-label rows) and Section B (264 `public/app.js` string rows); `handbook-trace.md` (one row per spec §4.7 bullet). **Binding rule for every later phase:** a row's target test title is the source label verbatim (computed labels: one parametrized test whose rendered titles substitute each listed value). P6 changes only the Status column (`planned` → `green`); only the owner turns `drop (proposed)` into `drop (approved)`.

- [ ] **Step 1: Create the branch**

```bash
cd /home/p4nic/code/noema
git status --short --untracked-files=no   # expected: no output
git switch -c feat/react-electron
```
Expected: `Switched to a new branch 'feat/react-electron'`.

- [ ] **Step 2: Write the label extractor (scratch)**

```bash
mkdir -p "${TMPDIR:-/tmp}/noema-parity" && cd "${TMPDIR:-/tmp}/noema-parity"
```
Create `extract_labels.py` with exactly this content. It reads the label argument of every `check(...)` call (index 1 where the suite uses `check(ok, label)`), every non-variable `checks.append(...)`, every `test('…')` in `now_state.test.cjs` and every `def test_*` in `test_managed_service.py`. Computed labels are kept as their source expression between `«…»`.

```python
"""Print every parity check label as TSV: suite<TAB>line<TAB>label."""
import ast, re, sys
from pathlib import Path
ROOT = Path(sys.argv[1])
PY = {  # file -> index of the label argument in check(...)
    'qa/browser_check.py': 0, 'qa/native_storage_check.py': 0, 'qa/now_ui_check.py': 0,
    'qa/task_capture_check.py': 0, 'qa/task_link_check.py': 1, 'qa/settings_link_check.py': 1,
    'experiments/ui-ab/scripts/verify.py': 0, 'qa/webview_check.py': None,
}
def text(src, node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str): return node.value
    return '«' + ast.get_source_segment(src, node).replace('\n', ' ') + '»'  # computed label, kept as source
rows = []
for rel, index in PY.items():
    src = (ROOT / rel).read_text()
    for node in ast.walk(ast.parse(src)):
        if not isinstance(node, ast.Call): continue
        f = node.func
        if index is not None and isinstance(f, ast.Name) and f.id == 'check' and len(node.args) > index:
            rows.append((rel, node.lineno, text(src, node.args[index])))
        if isinstance(f, ast.Attribute) and f.attr == 'append' and isinstance(f.value, ast.Name) and f.value.id == 'checks' and node.args and not isinstance(node.args[0], ast.Name):
            rows.append((rel, node.lineno, text(src, node.args[0])))
        if isinstance(f, ast.Name) and f.id == 'check' and index is None:
            rows.append((rel, node.lineno, text(src, node.args[0])))
for rel, pattern in (('desktop/qa/scenario.js', r"check\((?:[^;]*?),\s*'((?:[^'\\]|\\.)*)'\)\s*;"),
                     ('tests/now_state.test.cjs', r"^test\('((?:[^'\\]|\\.)*)'")):
    src = (ROOT / rel).read_text()
    for m in re.finditer(pattern, src, re.M):
        rows.append((rel, src.count('\n', 0, m.start()) + 1, m.group(1)))
src = (ROOT / 'tests/test_managed_service.py').read_text()
for node in ast.parse(src).body:
    if isinstance(node, ast.FunctionDef) and node.name.startswith('test_'):
        rows.append(('tests/test_managed_service.py', node.lineno, node.name))
for r in sorted(rows, key=lambda r: (r[0], r[1])): print(*r, sep='\t')
```

- [ ] **Step 3: Run it and check the counts**

```bash
cd "${TMPDIR:-/tmp}/noema-parity"
python3 -I extract_labels.py /home/p4nic/code/noema > labels.tsv
cut -f1 labels.tsv | sort | uniq -c; wc -l < labels.tsv
```
Expected (sources unchanged since `e0ca9ad`): `40 desktop/qa/scenario.js`, `15 experiments/ui-ab/scripts/verify.py`, `14 qa/browser_check.py`, `22 qa/native_storage_check.py`, `31 qa/now_ui_check.py`, `8 qa/settings_link_check.py`, `25 qa/task_capture_check.py`, `9 qa/task_link_check.py`, `4 qa/webview_check.py`, `22 tests/now_state.test.cjs`, `12 tests/test_managed_service.py`, total `202`. If a count differs, a source suite changed: add or remove the corresponding Section A rows in Step 7 using the routing rules in the map's header before continuing.

- [ ] **Step 4: Write the `public/app.js` string extractor (scratch)**

Create `extract_strings.cjs`. It uses the TypeScript scanner (so regex literals, comments and nested template literals are tokenised correctly), splits template HTML out, and keeps prose fragments: they start with an uppercase letter and contain a space or end in `.`, `…`, `?` or `!`.

```js
// Usage: node extract_strings.cjs <repo>  → TSV "line<TAB>text" of prose string fragments in public/app.js.
const path = require('node:path');
const fs = require('node:fs');
const repo = process.argv[2];
const ts = require(path.join(repo, 'experiments/ui-ab/node_modules/typescript'));
const file = path.join(repo, 'public/app.js');
const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const PROSE = /^[A-Z][^<>{}=;]*?(?: |[.…?!]$)/;
const seen = new Set();
function emit(node, text) {
  for (const part of text.replace(/^[^<>]*>/, '').split(/<[^>]*>?/)) {
    const value = part.trim();
    const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    const key = line + '\t' + value;
    if (PROSE.test(value) && !seen.has(key)) { seen.add(key); console.log(key); }
  }
}
(function visit(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) emit(node, node.text);
  else if (ts.isTemplateExpression(node)) { emit(node.head, node.head.text); for (const span of node.templateSpans) emit(span.literal, span.literal.text); }
  ts.forEachChild(node, visit);
})(source);
```
Run:
```bash
node extract_strings.cjs /home/p4nic/code/noema > strings.tsv; wc -l < strings.tsv
```
Expected: `264`.

- [ ] **Step 5: Write the Section B generator (scratch)**

Create `section_b.py`. Each string is attributed, in this order, to: an explicit text override (headings replaced by `COPY`, removed browser-preview copy, the replaced MIME toast), an `S` key (contract §5), a single-purpose `app.js` line, then the `app.js` function region it sits in.

```python
"""Usage: python3 -I section_b.py strings.tsv > section-b.md — Section B rows of parity-map.md."""
import sys
S = {  # contract §5 key → verbatim text (or the fixed fragment of a template)
 'draftSaved':'Draft on this device · not uploaded','draftError':'Local save failed · keep this page open','draftPending':'Saving draft on this device…',
 'draftMemory':'Draft in this tab · not uploaded','localSaveFailedToast':'Local save failed. Keep this page open and retry; this draft has not been uploaded.',
 'localSaveErrorNotice':'Latest local save failed. Keep this page open.','retryLocalSave':'Retry local save',
 'networkError':'Server unreachable. Your saved captures remain queued on this device.','connected':'Server connected','offline':'Offline · local drafts',
 'statusSummary':('Status unavailable','Nothing tracked yet'),'offlineBanner':('Server disconnected.','Showing the last server snapshot; agent status may be outdated.',
 'Current work and integration status are unavailable.','Local save failed; keep unsaved work open.','Capture can save on this device when local storage is available.'),
 'lastKnown':'Last known ·','savedTo':('Saved to','Processing queued.','Original preserved.'),
 'queueReadFailed':'Cannot read the local capture queue. Keep this page open and retry the local save.','closeOtherTabs':'Close other Noema tabs and retry the local save.',
 'tooManyFiles':'Keep each capture to 12 attachments.','writeSomething':'Write something or add a recording or visual.','stopRecordingBeforeSaving':'Stop recording before saving.',
 'couldNotSave':'Could not save the capture:','captureSavedSending':'Capture saved on this device. Sending to your server…',
 'captureSavedOffline':'Capture saved on this device. It will upload when connected.','stopRecordingBeforeLeaving':'Stop recording before leaving Capture.',
 'finishingLocalSave':'Finishing the local save.','editStillOpen':'Your edit is still open.',
 'leaveNoteEdit':'Leave without saving this note edit? The last saved revision remains safe.','taskUnavailable':'Task unavailable.',
 'taskDraftUnconfirmed':'Save unconfirmed · retry the same attempt','taskDraftSaved':'Draft on this device · not added','taskDraftError':'Local draft save failed · keep this dialog open',
 'taskDraftMemory':'Draft in this tab · not added','previousUnconfirmed':'Previous save is unconfirmed. Retry the same attempt; this draft is not an offline task queue.',
 'draftStorageFailed':'Draft storage failed. Task not added; keep this dialog open and retry.','ackUnverified':'Task acknowledgement could not be verified; retry the same attempt.',
 'notConfirmed':'Not confirmed added. Your input is preserved.','checkServiceRetry':'Check the service or local storage, then retry the same attempt.',
 'unconfirmedPreserved':'Save unconfirmed · draft preserved. Retry does not create a second task.',
 'draftNotStored':'Draft not stored. Keep this dialog open and retry; the task is not added.','addTask':'Add task','retryAddTask':'Retry add task','taskAdded':'Task added.',
 'taskAddedDateKept':'Task added. Date wording kept; correct it in Edit if needed.','taskSaved':'Task saved.','priorityUpdated':'Priority updated.','taskReopened':'Task reopened.',
 'taskCompleted':'Task completed.','unlockTitle':'Unlock Noema','accessToken':'Access token','outboxTitle':'Captures on this device',
 'outboxEmpty':'All saved captures have reached the server.','outboxFallbackText':'Visual or voice capture',
 'openCopy':'Open a copy in Capture','confirmReplaceDraft':'Replace the current unsaved Capture draft? The queued capture remains safe.','openedCopy':'Opened a copy. The queued original still exists.',
 'confirmDiscard':'Permanently discard this unsent capture and its local attachments?','notificationTitle':'Noema reminder','notificationFallback':'A task needs your attention.',
 'notificationsUnsupported':'This browser does not expose notifications here. Reminders still appear in Needs you.',
 'closeSaveInFlight':'A capture save is still finishing. Try closing again shortly.',
 'closeConfirm':'Close Noema? An unfinished recording or unsaved note edit may be lost. Cancel to stop/save or copy it first.',
 'closeDraftFailed':'Local draft saving failed. Close anyway and risk losing this draft? Cancel to keep it open and retry.',
 'closeCheckpointFailed':'Could not checkpoint your draft. Keep Noema open and retry the local save.',
}
PREFIX = {'unlockHelp':'This server needs your access token.','outboxHelp':'Saved explicitly, but not yet acknowledged by the server.'}
OVERRIDE = {  # line → (lives in, asserted by)
 27:('P4 `web/src/dialogs/TaskDetail.tsx`','web/e2e/plan.spec.ts'),
 56:('P2 `web/src/local/db.ts` (`LocalStoreError` aborted message)','web/src/local/drafts.test.ts'),
 83:('P2 `web/src/api/client.ts` (`normaliseError`)','web/src/api/client.test.ts'),
 501:('P4 `web/src/screens/Now.tsx`','web/e2e/now.spec.ts'),502:('P4 `web/src/screens/Now.tsx`','web/e2e/now.spec.ts'),
 511:('P4 `web/src/screens/NoteView.tsx`','web/e2e/notes.spec.ts'),513:('P4 `web/src/screens/NoteView.tsx`','web/e2e/notes.spec.ts'),
 516:('P4 `web/src/dialogs/TaskDetail.tsx`','web/e2e/plan.spec.ts'),519:('P4 `web/src/screens/Now.tsx`','web/e2e/now.spec.ts'),
 555:('P3 `web/src/routes/guards.ts`','web/e2e/capture.spec.ts'),   # guard E2E lives in capture.spec.ts (03-screens-capture-notes.md Task 5)
 616:('P3 `web/src/main.tsx`','web/e2e/boot.spec.ts'),
}
COPY18B = ('replaced by `COPY` headings (owner decision 18B, `web/src/copy.ts`)', 'web/src/copy.test.ts')
PREVIEW = ('removed: browser companion preview (spec §5 "Removed")', '—')
TEXT = {
 'What can I do now?': COPY18B, 'Your work, without keeping it all in your head.': COPY18B, 'A place to think.': COPY18B,
 'Fragments, questions, things you figured out.': COPY18B, 'What you learned, kept in one place.': COPY18B,
 'A little further ahead.': COPY18B, 'Priorities are suggested. Your changes stay yours.': COPY18B,
 'Companion controls · browser preview ·': PREVIEW, 'The native helper is separate from this browser preview.': PREVIEW,
 'Use an image or audio recording.': ('replaced by `S.unsupportedType` (contract §5, server allowlist)', 'web/src/strings.test.ts'),
}
REGIONS = [  # (first line, last line, lives in, asserted by) — app.js function boundaries
 (1,103,'P3 `web/src/shell/`','web/e2e/shell.spec.ts'),(104,143,'P3 `web/src/shell/StatusLine.tsx`, `OfflineNotice.tsx`','web/e2e/shell.spec.ts'),
 (144,148,'P4 `web/src/components/TaskRow.tsx`','web/e2e/plan.spec.ts'),(149,184,'P2 `web/src/domain/nowState.ts`','web/src/domain/nowState.test.ts'),
 (185,210,'P4 `web/src/screens/Now.tsx`','web/e2e/now.spec.ts'),(211,227,'P4 `web/src/screens/Capture.tsx`','web/e2e/capture.spec.ts'),
 (228,256,'P4 `web/src/screens/Notes.tsx`, `NoteView.tsx`','web/e2e/notes.spec.ts'),(257,260,'P4 `web/src/screens/Plan.tsx`','web/e2e/plan.spec.ts'),
 (261,301,'P3 `web/src/routes/router.tsx`','web/e2e/shell.spec.ts'),(302,302,'P3 `web/src/dialogs/Unlock.tsx`','web/e2e/boot.spec.ts'),
 (303,320,'P4 `web/src/dialogs/TaskDetail.tsx`','web/e2e/plan.spec.ts'),(321,370,'P4 `web/src/dialogs/TaskCapture.tsx`','web/e2e/task-capture.spec.ts'),
 (371,381,'P4 `web/src/dialogs/TaskDetail.tsx`','web/e2e/plan.spec.ts'),(382,383,'P4 `web/src/components/PriorityControl.tsx`','web/e2e/plan.spec.ts'),
 (384,387,'P4 `web/src/screens/NoteView.tsx`, `dialogs/NoteHistory.tsx`','web/e2e/notes.spec.ts'),(388,453,'P4 `web/src/capture/`','web/e2e/capture.spec.ts'),
 (454,473,'P4 `web/src/dialogs/Settings.tsx`','web/e2e/settings.spec.ts'),(474,480,PREVIEW[0],'—'),(481,481,'P4 `web/src/dialogs/Settings.tsx`','web/e2e/settings.spec.ts'),(482,482,'P3 `web/src/dialogs/Outbox.tsx`','web/e2e/outbox.spec.ts'),
 (483,588,'P4 (owner by `handleAction` case)','web/e2e/now.spec.ts'),(589,616,'P3 `web/src/shell/checkpoint.ts`','web/e2e/checkpoint.spec.ts'),
]
def owner(line, text):
    if text in TEXT: return TEXT[text]
    for key, value in S.items():
        if text in (value if isinstance(value, tuple) else (value,)): return f'`S.{key}` (`web/src/strings.ts`)', 'web/src/strings.test.ts'
    for key, prefix in PREFIX.items():
        if text.startswith(prefix): return f'`S.{key}` (`web/src/strings.ts`)', 'web/src/strings.test.ts'
    if line in OVERRIDE: return OVERRIDE[line]
    for first, last, lives, spec in REGIONS:
        if first <= line <= last: return lives, spec
    raise SystemExit(f'No owner for app.js:{line}')
print('| # | app.js line | String (verbatim) | Lives in | Asserted by |')
print('|---|---|---|---|---|')
for n, row in enumerate(open(sys.argv[1], encoding='utf-8'), 1):
    line, text = row.rstrip('\n').split('\t', 1)
    lives, spec = owner(int(line), text)
    cell = text.replace('|', '\\|')
    print(f'| {n} | {line} | {cell} | {lives} | {spec} |')
```
Run:
```bash
python3 -I section_b.py strings.tsv > section-b.md; wc -l < section-b.md
```
Expected: `266` (header + separator + 264 rows). `No owner for app.js:<n>` means a new string region appeared: add a `REGIONS` entry for it and rerun.

- [ ] **Step 6: Write the Section A checker (scratch)**

Create `check_section_a.py`:

```python
"""Usage: python3 -I check_section_a.py labels.tsv parity-map.md — Section A must list every extracted label in order."""
import re, sys
labels = [line.rstrip('\n').split('\t') for line in open(sys.argv[1], encoding='utf-8')]
section = open(sys.argv[2], encoding='utf-8').read().split('## A. Check labels', 1)[1].split('## B. ', 1)[0]
rows = [row for row in section.splitlines() if re.match(r'^\| \d+ \|', row)]
assert len(rows) == len(labels), f'{len(rows)} map rows, {len(labels)} extracted labels'
for row, (source, line, label) in zip(rows, labels):
    cells = [cell.strip() for cell in re.split(r'(?<!\\)\|', row)[1:-1]]
    expected = '`' + label[1:-1] + '`' if label.startswith('«') else label.replace('|', '\\|')
    assert cells[1] == f'{source}:{line}' and cells[2] == expected, f'mismatch: {row!r} vs {source}:{line} {label!r}'
print(f'Section A matches all {len(rows)} extracted labels')
```

- [ ] **Step 7: Write `docs/superpowers/specs/parity-map.md` (Section A) and append Section B**

Write the file with exactly this content, then append the generated Section B rows:

```markdown
# Parity map (spec §8)

Produced by Task 1 of `docs/superpowers/plans/2026-10-10-react-electron/01-foundation.md` from the source suites at `master` `e0ca9ad`. The cutover merge is blocked until every row is `green` or `drop (approved)`.

## Rules

- **Test title = label.** The target test's title is the label verbatim. A computed label (shown as a code span) becomes one parametrized test whose rendered titles substitute each value:
  - `now_ui_check.py:118/137/138`: `kind` ∈ new, available, waiting, attention, complete, unknown, disconnected (`now_ui_check.py:128`); `label` ∈ desktop, mobile (`now_ui_check.py:114-115`).
  - `task_capture_check.py:71/76`: `width` ∈ 1200, 390 (`task_capture_check.py:37`).
  - `webview_check.py:143`: both branch strings are titles. `webview_check.py:170`: `stage` ∈ the managed stages of `webview_check.py:87-91`. `webview_check.py:175`: `expected_notes` = 2 (managed run).
- **Phase** is the contract phase id (`00-contract.md` §10); **Target** is the test file from contract §9.4 / §1.2. A phase whose test covers several labels under one title rewrites the Target cell to `<file> › "<title>"` (several joined with `; `); `06-cutover.md` Task 11 checks every cited title, and otherwise the label itself, exists verbatim in the file. Plan files in `docs/superpowers/plans/2026-10-10-react-electron/`: P1 and P2 → `01-foundation.md` (except P2 rows targeting `web/src/domain/nowState.test.ts`, created by `02-screens-core.md` Task 2); P3 → `02-screens-core.md` (`checkpoint.spec.ts` → `03-screens-capture-notes.md`); P4 → `02-screens-core.md` or `03-screens-capture-notes.md`, whichever creates the target file (`03-screens-capture-notes.md` Task 15 retargets the rows it moves); P5 → `04-terrain.md`; P6 → `05-electron.md` (Electron and lifecycle rows) and `06-cutover.md`. A phase that must move a row records the move in its own plan.
- **Status:** `planned` → `green` (set by `06-cutover.md` Task 11 after the full gate) · `drop (proposed): <reason>` → `drop (approved): <reason>` (owner only; the value `06-cutover.md` Task 11 writes and checks).
- "No uncaught … JavaScript errors" rows are satisfied by the P1 auto fixture `pageErrors` (`web/e2e/fixtures.ts`), which fails every E2E test that sees a page error.
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
| 63 | qa/browser_check.py:139 | Offline capture remains queued in storage adapter | P4 | web/e2e/offline.spec.ts | planned |
| 64 | qa/browser_check.py:141 | Reconnect flushes queued capture to real server | P1 | web/e2e/outbox.spec.ts | planned |
| 65 | qa/browser_check.py:144 | Note renderer does not execute untrusted HTML | P4 | web/e2e/notes.spec.ts | planned |
| 66 | qa/browser_check.py:147 | Phone layout has no horizontal overflow | P4 | web/e2e/layout.spec.ts | planned |
| 67 | qa/browser_check.py:150 | Phone capture has no horizontal overflow | P4 | web/e2e/layout.spec.ts | planned |
| 68 | qa/browser_check.py:152 | Tablet layout has no horizontal overflow | P4 | web/e2e/layout.spec.ts | planned |
| 69 | qa/browser_check.py:154 | No uncaught UI JavaScript errors | P1 | web/e2e/fixtures.ts › auto fixture `pageErrors` (runs in every spec) | planned |
| 70 | qa/native_storage_check.py:156 | Real loopback navigation and native service worker control | P1 | web/e2e/sw.spec.ts | planned |
| 71 | qa/native_storage_check.py:160 | Older committed draft cannot label newer input as saved | P2 | web/src/local/drafts.test.ts | planned |
| 72 | qa/native_storage_check.py:166 | Unsaved draft never ingested into server notebook | P4 | web/e2e/capture.spec.ts | planned |
| 73 | qa/native_storage_check.py:175 | Draft text and exact Blob bytes survive browser process restart | P4 | web/e2e/capture.spec.ts | planned |
| 74 | qa/native_storage_check.py:179 | Service worker opens actual capture UI offline with last snapshot | P4 | web/e2e/offline.spec.ts | planned |
| 75 | qa/native_storage_check.py:184 | Explicit offline Save atomically queues original and resets stored draft | P4 | web/e2e/offline.spec.ts | planned |
| 76 | qa/native_storage_check.py:193 | Queued attachment capture survives offline browser restart | P4 | web/e2e/offline.spec.ts | planned |
| 77 | qa/native_storage_check.py:197 | Reconnect receives matching real server acknowledgment | P1 | web/e2e/outbox.spec.ts | planned |
| 78 | qa/native_storage_check.py:204 | Reconnect delivers one original note and exact attachment bytes | P1 | web/e2e/outbox.spec.ts | planned |
| 79 | qa/native_storage_check.py:215 | Aborted atomic Save keeps persisted draft and rolls back queue insertion | P4 | web/e2e/capture.spec.ts | planned |
| 80 | qa/native_storage_check.py:218 | Reload recovers original draft after transaction abort | P4 | web/e2e/capture.spec.ts | planned |
| 81 | qa/native_storage_check.py:224 | Native abort after request success still rolls back both stores | P2 | web/src/local/drafts.test.ts | planned |
| 82 | qa/native_storage_check.py:230 | Injected quota failure has persistent truthful UI and retains editor text | P4 | web/e2e/capture.spec.ts | planned |
| 83 | qa/native_storage_check.py:233 | Recovery control fits phone viewport | P4 | web/e2e/layout.spec.ts | planned |
| 84 | qa/native_storage_check.py:238 | Retry commits recovered edit through native IndexedDB | P4 | web/e2e/capture.spec.ts | planned |
| 85 | qa/native_storage_check.py:254 | Lost server acknowledgment retains queued capture ID | P1 | web/e2e/outbox.spec.ts | planned |
| 86 | qa/native_storage_check.py:266 | Browser/server restart retries lost acknowledgment without duplicate notes | P1 | web/e2e/outbox.spec.ts | planned |
| 87 | qa/native_storage_check.py:267 | Server restart retains manual priority, pinned focus and due reminder | P4 | web/e2e/now.spec.ts | planned |
| 88 | qa/native_storage_check.py:274 | Immediate Save cancels draft debounce without resurrecting a saved draft | P4 | web/e2e/capture.spec.ts | planned |
| 89 | qa/native_storage_check.py:287 | Unavailable storage at boot leaves editable UI and failed Save retains text | P4 | web/e2e/capture.spec.ts | planned |
| 90 | qa/native_storage_check.py:291 | Failed database open can retry in the same page without reloading | P2 | web/src/local/db.test.ts | planned |
| 91 | qa/native_storage_check.py:294 | No uncaught UI JavaScript errors | P1 | web/e2e/fixtures.ts › auto fixture `pageErrors` (runs in every spec) | planned |
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
| 122 | qa/now_ui_check.py:291 | No uncaught UI JavaScript errors | P1 | web/e2e/fixtures.ts › auto fixture `pageErrors` (runs in every spec) | planned |
| 123 | qa/settings_link_check.py:29 | Native settings URL opens actual existing dialog at startup | P4 | web/e2e/settings.spec.ts | planned |
| 124 | qa/settings_link_check.py:31 | Settings link adds no navigation screen | P4 | web/e2e/settings.spec.ts | planned |
| 125 | qa/settings_link_check.py:34 | Linked settings edits actual existing server permission | P4 | web/e2e/settings.spec.ts | planned |
| 126 | qa/settings_link_check.py:44 | Settings link preserves current Capture route and editor text | P4 | web/e2e/settings.spec.ts | planned |
| 127 | qa/settings_link_check.py:46 | Settings navigation never ingests an unsaved draft | P4 | web/e2e/settings.spec.ts | planned |
| 128 | qa/settings_link_check.py:58 | Settings link preserves note-edit route and unsaved editor text | P4 | web/e2e/settings.spec.ts | planned |
| 129 | qa/settings_link_check.py:60 | Opening settings never replaces the saved note original | P4 | web/e2e/settings.spec.ts | planned |
| 130 | qa/settings_link_check.py:62 | No uncaught JavaScript errors | P1 | web/e2e/fixtures.ts › auto fixture `pageErrors` (runs in every spec) | planned |
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
| 164 | qa/task_link_check.py:63 | No uncaught JavaScript errors | P1 | web/e2e/fixtures.ts › auto fixture `pageErrors` (runs in every spec) | planned |
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

```
Then:
```bash
cd /home/p4nic/code/noema
cat "${TMPDIR:-/tmp}/noema-parity/section-b.md" >> docs/superpowers/specs/parity-map.md
python3 -I "${TMPDIR:-/tmp}/noema-parity/check_section_a.py" "${TMPDIR:-/tmp}/noema-parity/labels.tsv" docs/superpowers/specs/parity-map.md
```
Expected: `Section A matches all 202 extracted labels`.

- [ ] **Step 8: Write `docs/superpowers/specs/handbook-trace.md`**

```markdown
# Handbook trace (spec §4.7)

Maps every bullet of spec §4.7 to the handbook section it implements, the owning plan and the test that proves it. Test titles are binding: the owning phase uses them verbatim. P6 updates only the Status column.

The Owning plan task column names the plan file in `docs/superpowers/plans/2026-10-10-react-electron/` and the task that writes the test. Later plans append their own sections below this table; they never rename a title in it.

| ID | Spec §4.7 bullet | Handbook | Owning plan task | Test (file › title) | Status |
|---|---|---|---|---|---|
| R1 | Notes and tasks are separate; a capture never creates a task | §01, §06, §27 | 03-screens-capture-notes.md Task 5 | `web/e2e/capture.spec.ts` › "Capture creates a learning note, never an automatic task" | planned |
| R2 | Nothing silently changes priorities, deadlines or focus | §06, §08, §27 | 02-screens-core.md Tasks 17, 21 | `web/e2e/now.spec.ts` › "Now suggestion cannot silently replace pinned focus"; `web/e2e/task-capture.spec.ts` › "Task save never replaces pinned focus" | planned |
| R3 | Explicit Save is the notebook boundary; drafts are local-only until Save | §04, §19 | 03-screens-capture-notes.md Task 5 | `web/e2e/capture.spec.ts` › "Unsaved draft never ingested into server notebook" | planned |
| R4 | Originals are immutable through editing | §04, §19 | 03-screens-capture-notes.md Task 11 | `web/e2e/notes.spec.ts` › "Original tab shows untouched capture" | planned |
| R5 | A late model result is a suggestion, never an overwrite | §04, §19 | 03-screens-capture-notes.md Task 11 | `web/e2e/notes.spec.ts` › "Applying a suggestion keeps the edit history and says Nothing was overwritten" | planned |
| R6 | Pins and manual priority overrides always win over automatic logic | §07, §08 | 02-screens-core.md Tasks 2, 18 | `web/src/domain/nowState.test.ts` › "deriving suggestions never changes a pinned focus"; `web/e2e/plan.spec.ts` › "Manual priority control persists" | planned |
| R7 | A completed run creates review work, never Done; a stale run reads as unknown | §07 | 02-screens-core.md Tasks 2, 17 | `web/e2e/now.spec.ts` › "Completed agent result is still a review task, not completed work"; `web/src/domain/nowState.test.ts` › "stale reports do not masquerade as running" | planned |
| R8 | No fabricated effort, durations, dates or urgency; "Nothing actionable right now" is valid | §08 | 02-screens-core.md Tasks 2, 17 | `web/src/domain/nowState.test.ts` › "time filter never supplies an estimate for a focused task"; `web/e2e/now.spec.ts` › "No duration, deadline or progress is fabricated" | planned |
| R9 | Capture is disabled by default: no mic, observation or model without explicit user action | §17, §28 | 01-foundation.md Task 8; 03-screens-capture-notes.md Task 7 | `web/e2e/serving.spec.ts` › "base app runs with no model and capture disabled by default"; `web/e2e/capture.spec.ts` › "No microphone permission is requested before Record" | planned |
| U1 | Look: minimal, compact ordered rows, limited accent, no oversized cards, excessive glow or ornamental headers | §10–§14 | 02-screens-core.md Task 22 | `web/e2e/layout.spec.ts` › "Plan rows are compact single lines at desktop width" | planned |
| U2 | Variant B headings, subtitles and tagline kept verbatim, all in `web/src/copy.ts` (owner decision 18B) | §10 (superseded by 18B) | 02-screens-core.md Task 1 | `web/src/copy.test.ts` › "COPY keeps the variant B headings, subtitles and tagline verbatim" | planned |
| U3 | Greeting "Good morning/afternoon/evening, {name}." from the device clock | §11 | 02-screens-core.md Task 1 | `web/src/copy.test.ts` › "greeting follows the device clock and display_name" | planned |
| U4 | Empty `display_name` → greeting without a name; avatar shows the first letter or is hidden | §11 | 02-screens-core.md Tasks 1, 14 | `web/src/copy.test.ts` › "greeting and avatar omit an empty display_name"; `web/e2e/shell.spec.ts` › "the avatar shows the display-name initial and is hidden without a name" | planned |
| U5 | Backend `display_name`: `SettingsInput.display_name: str \| None` (strip, max 60), `DEFAULT_SETTINGS['display_name'] = ''` | §28 (settings merge) | 01-foundation.md Task 7 | `tests/test_core.py` › `test_display_name_setting` | planned |
| U6 | `display_name` is edited in Settings | §11 | 03-screens-capture-notes.md Task 13 | `web/e2e/settings.spec.ts` › "Display name edited in Settings updates the greeting and avatar" | planned |
| U7 | Visible navigation labels Overview, Capture, Notes, Tasks; route ids stay overview/capture/notes/plan | §10 | 02-screens-core.md Task 14 | `web/e2e/shell.spec.ts` › "Navigation shows Overview, Capture, Notes and Tasks with matching accessible names" | planned |
| U8 | Overview: one focus line with provenance, one recommendation with a plain reason and Start/Resume, a short Needs you list, a compact running summary; everything else on request | §08, §10 | 02-screens-core.md Task 17 | `web/e2e/now.spec.ts` › "Primary suggestion is singular and alternatives start collapsed"; "Overview shows focus provenance, one recommendation with its reason, Needs you and a running summary"; `web/src/screens/Now.test.tsx` › "one primary recommendation with a plain reason; Start pins it; alternatives stay collapsed"; "labels inferred and selected focus differently; Resume continues the focus" | planned |
| U9 | Desktop ≥1000 px: narrow sidebar collapsible to icons, remembered per device | §10, §11 | 02-screens-core.md Task 14 | `web/e2e/shell.spec.ts` › "Desktop sidebar collapses to icons and stays collapsed after reload" | planned |
| U10 | Phone <650 px: bottom navigation; Capture is full-screen | §12 | 03-screens-capture-notes.md Task 5 | `web/e2e/capture.spec.ts` › "Phone width uses bottom navigation and full-screen Capture" | planned |
| U11 | Tablet 650–1000 px: sidebar plus an optional collapsible folder/recent-note pane in Notes | §13 | 03-screens-capture-notes.md Task 10 | `web/e2e/notes.spec.ts` › "Tablet width shows a collapsible folder pane in Notes" | planned |
| U12 | Portrait collapses to the phone column; the current note or task can take the full content area | §13 | 03-screens-capture-notes.md Tasks 10, 11 | `web/e2e/notes.spec.ts` › "Portrait tablet collapses to the single phone column"; "Phone width gives the open note the full content area" | planned |
| U13 | Capture: empty writing surface, no title/folder field, compact mic/image/sketch toolbar, one Save note action | §04, §14 | 03-screens-capture-notes.md Task 7 | `web/e2e/capture.spec.ts` › "Capture has one writing surface, a mic/image/sketch toolbar and one Save note action" | planned |
| U14 | Recording shows elapsed time, Pause/Resume and Stop; Paused looks different; the visual tray stays usable while recording | §05, §14 | 03-screens-capture-notes.md Task 7 | `web/e2e/capture.spec.ts` › "Recording shows elapsed time, Pause/Resume and Stop; paused is labelled distinctly"; "Visual tray stays usable while recording" | planned |
| U15 | No live organized preview in the editor; text never moves under the cursor | §14 | 03-screens-capture-notes.md Task 5 | `web/e2e/capture.spec.ts` › "Capture text never moves under the cursor" | planned |
| U16 | After Save: quiet title + folder with Open note and Change folder (reversible PUT with `expected_version`), only after server acknowledgement; queued state stated while queued | §06, §14 | 03-screens-capture-notes.md Tasks 4, 5 | `web/e2e/capture.spec.ts` › "After server acknowledgement Capture shows the title and folder with Open note and Change folder"; "While queued, Capture says the capture is on this device" | planned |
| U17 | Storage-state labels "on this device / draft", "queued" and "saved on server" are distinct | §20 | 01-foundation.md Task 3; 03-screens-capture-notes.md Task 5 | `web/src/strings.test.ts` › "keeps draft, queued and saved-on-server labels distinct (handbook §20)"; `web/e2e/capture.spec.ts` › "Draft, queued and saved-on-server labels are distinct" | planned |
| U18 | Sketch: pen, eraser, undo and a simple text tool; a lightweight tray | §05 | 03-screens-capture-notes.md Task 6 | `web/e2e/capture.spec.ts` › "Sketch offers pen, eraser, undo and a text tool" | planned |
| U19 | Notes: search and recent notes first; folder pane (desktop) or drawer/selector (phone); Original and History as tabs; related task is a small link | §06, §14 | 03-screens-capture-notes.md Tasks 5, 10, 12 | `web/e2e/notes.spec.ts` › "Notes opens on search and recent notes"; "Desktop width shows a narrow folder pane that filters the list"; "Phone width replaces the folder pane with a compact selector"; "Original and History are tabs beside the note"; `web/e2e/capture.spec.ts` › "A capture can link to an open task as a small optional link" | planned |
| U20 | Tasks: compact rows (task, project, state, priority); due date and estimate only when known | §14 | 02-screens-core.md Task 18 | `web/e2e/plan.spec.ts` › "Plan rows show task, project, state and priority; due date and estimate only when known" | planned |
| U21 | Priority editable in place; label from `priority_source` ("Auto · rules", "Auto · AI", "Set by you", unknown → "Auto"); `priority_reason` on hover/focus and in detail | §08, §14 | 02-screens-core.md Tasks 3, 18 | `web/src/domain/tasks.test.ts` › "priorityLabel maps automatic/rules, ai, you and unknown sources"; `web/e2e/plan.spec.ts` › "Priority is editable in place and shows its source and reason" | planned |
| U22 | Filtered views Needs you, Running, Available now, All | §14 | 02-screens-core.md Task 18 | `web/e2e/plan.spec.ts` › "Needs you, Running, Available now and All filter the task list" | planned |
| U23 | Dependencies, not-before dates and session links in task detail; opening a row shows the next action and source first; Review result leads to the result/session link; park/unpark, parked ≠ done | §07, §09, §14 | 02-screens-core.md Tasks 18, 20 | `web/e2e/plan.spec.ts` › "Task detail shows the next action and source before the activity log"; "Review result opens the result or session link"; "Parked is distinct from done and can be unparked" | planned |
| U24 | Keyboard navigation, visible focus, descriptive labels, status without colour, contrast ≥ 4.5:1, touch targets ≥ 44×44 px at phone widths | §14 | 02-screens-core.md Task 22 | `web/e2e/shell.spec.ts` › "Every control is keyboard reachable with a visible focus ring"; `web/e2e/layout.spec.ts` › "Readable body/secondary text meets a 4.5 contrast ratio"; "Phone touch targets are at least 44×44 px" | planned |
| U25 | Motion slow, sparse, optional; absent when hidden or reduced motion; terrain never under reading or editing surfaces | §10, §21 | 04-terrain.md Tasks 6, 7 | `web/e2e/terrain.spec.ts` › "Dot field never paints over the reading surface"; "Reduced motion stops the actual animation timer"; "Injected hidden-document event stops animation" | planned |
| C1 | Base app use needs no model | §21 | 01-foundation.md Task 8 | `web/e2e/serving.spec.ts` › "base app runs with no model and capture disabled by default" | planned |
| C2 | Quiet background target < 1% of one core (paused/hidden budget, spec §7) | §21 | 04-terrain.md Task 9; 06-cutover.md Task 9 | `docs/TEST_REPORT.md` › terrain budget table | planned |
| C3 | Main app process tree measured against < 400 MB excluding AI; recorded pass or fail | §21 | 06-cutover.md Task 9 | `docs/TEST_REPORT.md` › process-tree memory | planned |
| T1 | This traceability file maps every §4.7 bullet to a task and test | — | 01-foundation.md Task 1; 06-cutover.md Task 11 | this file | planned |
```

- [ ] **Step 9: Commit**

```bash
cd /home/p4nic/code/noema
git add docs/superpowers/specs/parity-map.md docs/superpowers/specs/handbook-trace.md
git commit -m "docs: add parity map and handbook trace for the React migration"
```

---

### Task 2: `web/` toolchain, zod entry point and shared globals (spec §3, §4.1)

**Files:**
- Create: `.nvmrc`
- Modify: `.gitignore` (append after line 9)
- Create: `web/package.json`, `web/package-lock.json` (generated), `web/tsconfig.json`, `web/vite.config.ts`
- Create: `web/src/zod.ts`, `web/src/events.ts`, `web/src/globals.d.ts`
- Test: `web/src/zod.test.ts`, `web/src/fakeIndexedDb.test.ts`

**Interfaces:**
- Consumes: contract §1.1 versions and scripts, §1.3 file bodies.
- Produces: `export { z }` from `web/src/zod.ts` (jitless); `CHECKPOINT_CLOSE`, `SERVICE_DOWN`, `SERVICE_UP`, `CLOSE_APPROVED` from `web/src/events.ts`; `Window.ipc`, `Window.__noemaCheckpointCloseReady`, `Window.__noemaField`, `WindowEventMap['vite:preloadError']` from `web/src/globals.d.ts`; npm scripts `build`, `watch`, `check-hashes`, `test`, `e2e`, `typecheck`. Contract gap filled: `tsconfig.json` adds `"node"` to `types`, `skipLibCheck`, and includes `e2e` and both config files, because `npm run build` runs `tsc --noEmit` over tests that import `node:*` and `@playwright/test`.

- [ ] **Step 1: Pin Node and ignore build output**

```bash
cd /home/p4nic/code/noema
printf '22.23.3\n' > .nvmrc
cat >> .gitignore <<'EOF'
web/node_modules/
web/dist/
web/test-results/
web/playwright-report/
electron/node_modules/
electron/dist/
EOF
```

- [ ] **Step 2: Create `web/package.json`**

```json
{
  "name": "noema-web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": "^22.22.2" },
  "scripts": {
    "build": "tsc --noEmit && vite build && node scripts/sw-precache.mjs && node scripts/check-hashes.mjs",
    "watch": "vite build --watch --mode development",
    "check-hashes": "node scripts/check-hashes.mjs",
    "test": "vitest run",
    "e2e": "playwright test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@tanstack/react-query": "5.104.1",
    "@tanstack/react-router": "1.170.42",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "zod": "4.1.12"
  },
  "devDependencies": {
    "@playwright/test": "1.64.0",
    "@testing-library/dom": "10.4.2",
    "@testing-library/react": "16.3.3",
    "@types/node": "22.18.10",
    "@types/react": "19.2.2",
    "@types/react-dom": "19.2.2",
    "@vitejs/plugin-react": "4.7.0",
    "fake-indexeddb": "6.2.5",
    "jsdom": "30.1.2",
    "node": "22.23.3",
    "typescript": "5.9.3",
    "vite": "6.4.4",
    "vitest": "5.0.3"
  }
}
```

- [ ] **Step 3: Install and generate the lockfile**

```bash
cd /home/p4nic/code/noema
npm --prefix web install
npm --prefix web exec -- node --version
npm --prefix web exec -- playwright install chromium
```
Expected: `web/package-lock.json` exists; the second command prints `v22.23.3` (the system `node` is v18; the `node` devDependency puts 22 first inside npm scripts). An `EBADENGINE` warning from the outer npm on Node 18 is expected and harmless.

- [ ] **Step 4: Create `web/tsconfig.json` and `web/vite.config.ts`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "e2e", "vite.config.ts", "playwright.config.ts"]
}
```

```ts
/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: { outDir: 'dist', emptyOutDir: true, assetsInlineLimit: 0, modulePreload: { polyfill: false }, sourcemap: false },
  test: { include: ['src/**/*.test.{ts,tsx}'], environment: 'node' },
});
```

- [ ] **Step 5: Write the failing zod test `web/src/zod.test.ts`**

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from './zod';

const SRC = fileURLToPath(new URL('.', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? sourceFiles(join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(dir, entry.name)] : [],
  );
}

describe('zod entry point', () => {
  it('runs zod without JIT so the CSP never sees new Function', () => {
    expect(z.config().jitless).toBe(true);
  });

  it('is the only module that imports the zod package', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => relative(SRC, file) !== 'zod.ts')
      .filter((file) => /from ['"]zod['"]/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm --prefix web test -- src/zod.test.ts`
Expected: FAIL — `Error: Cannot find module './zod' imported from /home/p4nic/code/noema/web/src/zod.test.ts`.

- [ ] **Step 7: Create `web/src/zod.ts`, `web/src/events.ts`, `web/src/globals.d.ts`**

```ts
// web/src/zod.ts — the only zod import in src/ (contract §1.3). Jitless before any schema exists, because the CSP blocks new Function.
import { z } from 'zod';
z.config({ jitless: true });
export { z };
```

```ts
// web/src/events.ts — page events shared with the Electron shell (spec §6.3–6.4).
export const CHECKPOINT_CLOSE = 'noema:checkpoint-close';
export const SERVICE_DOWN = 'noema:service-down';
export const SERVICE_UP = 'noema:service-up';
export const CLOSE_APPROVED = 'noema:close-approved';
```

```ts
// web/src/globals.d.ts
export {};
declare global {
  interface Window {
    ipc?: { postMessage(message: 'noema:close-approved'): void }; // Electron main preload only
    __noemaCheckpointCloseReady?: true;
    __noemaField?: { frames: number; readPixel(x: number, y: number): Promise<[number, number, number, number]> };
  }
  interface WindowEventMap { 'vite:preloadError': Event }
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm --prefix web test -- src/zod.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 9: Write the IndexedDB test-environment check `web/src/fakeIndexedDb.test.ts`**

This pins the contract §9 pattern every `local/*.test.ts` in P2 uses (`fake-indexeddb/auto` plus a fresh `IDBFactory` per test) against the exact `public/app.js:30-43` upgrade.

```ts
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory() as unknown as typeof globalThis.indexedDB; // fake-indexeddb's class is structurally, not nominally, the DOM type
});

function openV1(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('noema-local-v1', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('kv');
      request.result.createObjectStore('outbox', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function addOutbox(db: IDBDatabase, ids: string[]): Promise<string> {
  return new Promise((resolve) => {
    const tx = db.transaction('outbox', 'readwrite');
    for (const id of ids) tx.objectStore('outbox').add({ id, raw: '', task_id: '', files: [] });
    tx.oncomplete = () => resolve('complete');
    tx.onabort = () => resolve('abort:' + (tx.error?.name ?? 'none'));
  });
}

describe('Vitest IndexedDB environment (contract §9)', () => {
  it('opens noema-local-v1 version 1 with the public/app.js stores', async () => {
    const db = await openV1();
    expect([...db.objectStoreNames].sort()).toEqual(['kv', 'outbox']);
    expect(db.transaction('outbox').objectStore('outbox').keyPath).toBe('id');
    db.close();
  });

  it('starts every test with an empty database', async () => {
    const db = await openV1();
    expect(await addOutbox(db, ['same-id'])).toBe('complete');
    db.close();
  });

  it('aborts a transaction whose outbox.add reuses an id', async () => {
    const db = await openV1();
    expect(await addOutbox(db, ['same-id'])).toBe('complete'); // proves the previous test's record is gone
    expect(await addOutbox(db, ['other-id', 'same-id'])).toBe('abort:ConstraintError');
    db.close();
  });
});
```

- [ ] **Step 10: Run the whole unit suite and the type check**

Run: `npm --prefix web test && npm --prefix web run typecheck`
Expected: PASS (5 tests) and `tsc` exits 0.

- [ ] **Step 11: Commit**

```bash
git add .nvmrc .gitignore web/package.json web/package-lock.json web/tsconfig.json web/vite.config.ts web/src/zod.ts web/src/zod.test.ts web/src/events.ts web/src/globals.d.ts web/src/fakeIndexedDb.test.ts
git commit -m "chore(web): scaffold pinned Vite toolchain with jitless zod entry point"
```

---

### Task 3: Shared user-visible strings `S` (spec §4.4 "Labels and toasts", contract §5)

**Files:**
- Create: `web/src/strings.ts`
- Test: `web/src/strings.test.ts`

**Interfaces:**
- Consumes: `public/app.js` (lines cited per entry).
- Produces: `export const S` exactly as contract §5. Contract gap filled: `statusSummary` takes a local structural type `{ tasks: readonly unknown[]; notes: readonly unknown[]; attention: readonly unknown[]; runs: readonly { effective_status: string }[] } | null` instead of `Snapshot` (P2's `schemas.ts` does not exist yet; every `Snapshot` is assignable to it). `savedTo(folder: string, processing: string)` (`processing` is the server's text column, `store.py:49`). The test pins values with explicit `toEqual` instead of an inline snapshot so every expected string is reviewable in the plan.

- [ ] **Step 1: Write the failing test `web/src/strings.test.ts`**

```ts
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { S } from './strings';

const APP_JS = fileURLToPath(new URL('../../public/app.js', import.meta.url));
const NEW_KEYS = new Set(['unexpectedResponse', 'unsupportedType', 'totalTooLarge', 'updateReady', 'reload']);
const snapshot = (tasks: number, notes: number, attention: number, runs: string[]) => ({
  tasks: Array.from({ length: tasks }, () => ({})),
  notes: Array.from({ length: notes }, () => ({})),
  attention: Array.from({ length: attention }, () => ({})),
  runs: runs.map((effective_status) => ({ effective_status })),
});

describe('S', () => {
  it('keeps every fixed string exactly', () => {
    const fixed = Object.fromEntries(Object.entries(S).filter(([, value]) => typeof value === 'string'));
    expect(fixed).toEqual({
      draftSaved: 'Draft on this device · not uploaded',
      draftError: 'Local save failed · keep this page open',
      draftPending: 'Saving draft on this device…',
      draftMemory: 'Draft in this tab · not uploaded',
      localSaveFailedToast: 'Local save failed. Keep this page open and retry; this draft has not been uploaded.',
      localSaveErrorNotice: 'Latest local save failed. Keep this page open.',
      retryLocalSave: 'Retry local save',
      networkError: 'Server unreachable. Your saved captures remain queued on this device.',
      unexpectedResponse: 'The server sent an unexpected response.',
      connected: 'Server connected',
      offline: 'Offline · local drafts',
      lastKnown: 'Last known · ',
      queueReadFailed: 'Cannot read the local capture queue. Keep this page open and retry the local save.',
      closeOtherTabs: 'Close other Noema tabs and retry the local save.',
      tooManyFiles: 'Keep each capture to 12 attachments.',
      unsupportedType: 'Use a PNG, JPEG or WebP image, or a WAV, Ogg, WebM, MP4 or MP3 recording.',
      totalTooLarge: 'Keep each capture under 60 MB in total.',
      writeSomething: 'Write something or add a recording or visual.',
      stopRecordingBeforeSaving: 'Stop recording before saving.',
      captureSavedSending: 'Capture saved on this device. Sending to your server…',
      captureSavedOffline: 'Capture saved on this device. It will upload when connected.',
      stopRecordingBeforeLeaving: 'Stop recording before leaving Capture.',
      finishingLocalSave: 'Finishing the local save.',
      editStillOpen: 'Your edit is still open.',
      leaveNoteEdit: 'Leave without saving this note edit? The last saved revision remains safe.',
      taskUnavailable: 'Task unavailable.',
      taskDraftUnconfirmed: 'Save unconfirmed · retry the same attempt',
      taskDraftSaved: 'Draft on this device · not added',
      taskDraftError: 'Local draft save failed · keep this dialog open',
      taskDraftPending: 'Saving draft on this device…',
      taskDraftMemory: 'Draft in this tab · not added',
      previousUnconfirmed: 'Previous save is unconfirmed. Retry the same attempt; this draft is not an offline task queue.',
      draftStorageFailed: 'Draft storage failed. Task not added; keep this dialog open and retry.',
      ackUnverified: 'Task acknowledgement could not be verified; retry the same attempt.',
      notConfirmed: 'Not confirmed added. Your input is preserved. ',
      checkServiceRetry: 'Check the service or local storage, then retry the same attempt.',
      unconfirmedPreserved: 'Save unconfirmed · draft preserved. Retry does not create a second task.',
      draftNotStored: 'Draft not stored. Keep this dialog open and retry; the task is not added.',
      addTask: 'Add task',
      retryAddTask: 'Retry add task',
      taskAdded: 'Task added.',
      taskAddedDateKept: 'Task added. Date wording kept; correct it in Edit if needed.',
      taskSaved: 'Task saved.',
      editAction: 'Edit',
      priorityUpdated: 'Priority updated.',
      taskReopened: 'Task reopened.',
      taskCompleted: 'Task completed.',
      unlockTitle: 'Unlock Noema',
      unlockHelp: 'This server needs your access token. On the host machine, it is in the selected data directory’s admin.token file or your NOEMA_ACCESS_TOKEN setting.',
      accessToken: 'Access token',
      unlock: 'Unlock',
      outboxTitle: 'Captures on this device',
      outboxHelp: 'Saved explicitly, but not yet acknowledged by the server. Attachments are kept with each capture. Keep this browser’s site storage until they upload.',
      outboxEmpty: 'All saved captures have reached the server.',
      outboxFallbackText: 'Visual or voice capture',
      retry: 'Retry',
      openCopy: 'Open a copy in Capture',
      discard: 'Discard',
      confirmReplaceDraft: 'Replace the current unsaved Capture draft? The queued capture remains safe.',
      openedCopy: 'Opened a copy. The queued original still exists.',
      confirmDiscard: 'Permanently discard this unsent capture and its local attachments?',
      notificationTitle: 'Noema reminder',
      notificationFallback: 'A task needs your attention.',
      notificationsUnsupported: 'This browser does not expose notifications here. Reminders still appear in Needs you.',
      closeSaveInFlight: 'A capture save is still finishing. Try closing again shortly.',
      closeConfirm: 'Close Noema? An unfinished recording or unsaved note edit may be lost. Cancel to stop/save or copy it first.',
      closeDraftFailed: 'Local draft saving failed. Close anyway and risk losing this draft? Cancel to keep it open and retry.',
      closeCheckpointFailed: 'Could not checkpoint your draft. Keep Noema open and retry the local save.',
      updateReady: 'Noema was updated. Your drafts are saved on this device.',
      reload: 'Reload',
    });
  });

  // public/ is deleted at cutover (P6); the check has already pinned every carried-over string by then.
  it.skipIf(!existsSync(APP_JS))('copies every carried-over string verbatim from public/app.js', () => {
    const source = readFileSync(APP_JS, 'utf8');
    for (const [key, value] of Object.entries(S)) {
      if (typeof value === 'string' && !NEW_KEYS.has(key)) expect(source, key).toContain(value);
    }
  });

  it('summarises status exactly like app.js:107', () => {
    expect(S.statusSummary(null, false)).toBe('Status unavailable');
    expect(S.statusSummary(snapshot(1, 0, 0, []), false)).toBe('Status unavailable');
    expect(S.statusSummary(null, true)).toBe('Nothing tracked yet');
    expect(S.statusSummary(snapshot(0, 0, 0, []), true)).toBe('Nothing tracked yet');
    expect(S.statusSummary(snapshot(0, 1, 0, []), true)).toBe('1 learning note');
    expect(S.statusSummary(snapshot(0, 3, 0, []), true)).toBe('3 learning notes');
    expect(S.statusSummary(snapshot(2, 5, 1, ['working', 'needs_input', 'working']), true)).toBe('1 need you · 2 reported running');
  });

  it('formats counts, file names and server acknowledgements like app.js', () => {
    expect(S.outboxCount(0)).toBe('0 captures on this device');
    expect(S.outboxCount(1)).toBe('1 capture on this device');
    expect(S.outboxCount(2)).toBe('2 captures on this device');
    expect(S.attachmentsCount(1)).toBe('1 attachments'); // app.js:482 never singularises
    expect(S.fileTooLarge('heap.png')).toBe('heap.png exceeds 32 MB.');
    expect(S.couldNotSave('QuotaExceededError')).toBe('Could not save the capture: QuotaExceededError');
    expect(S.savedTo('Inbox', '')).toBe('Saved to Inbox. Original preserved.');
    expect(S.savedTo('Security / CTFs', 'queued: organize')).toBe('Saved to Security / CTFs. Processing queued.');
  });

  it('builds the two-part offline banner exactly like app.js:142', () => {
    expect(S.offlineBanner(true, false)).toBe('Server disconnected. Showing the last server snapshot; agent status may be outdated. Capture can save on this device when local storage is available.');
    expect(S.offlineBanner(false, false)).toBe('Server disconnected. Current work and integration status are unavailable. Capture can save on this device when local storage is available.');
    expect(S.offlineBanner(true, true)).toBe('Server disconnected. Showing the last server snapshot; agent status may be outdated. Local save failed; keep unsaved work open.');
    expect(S.offlineBanner(false, true)).toBe('Server disconnected. Current work and integration status are unavailable. Local save failed; keep unsaved work open.');
  });

  it('keeps draft, queued and saved-on-server labels distinct (handbook §20)', () => {
    const labels = [S.draftMemory, S.draftSaved, S.draftPending, S.captureSavedOffline, S.captureSavedSending, S.outboxCount(1), S.savedTo('Inbox', '')];
    expect(new Set(labels).size).toBe(labels.length);
    for (const local of [S.draftMemory, S.draftSaved]) expect(local).toContain('not uploaded');
    expect(S.savedTo('Inbox', '')).not.toContain('device');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/strings.test.ts`
Expected: FAIL — `Error: Cannot find module './strings' imported from /home/p4nic/code/noema/web/src/strings.test.ts`.

- [ ] **Step 3: Create `web/src/strings.ts`**

```ts
// User-visible strings produced in one module and asserted elsewhere (contract §5). Verbatim from public/app.js (line in the comment) unless marked new.
type StatusSnapshot = {
  tasks: readonly unknown[];
  notes: readonly unknown[];
  attention: readonly unknown[];
  runs: readonly { effective_status: string }[];
};

export const S = {
  draftSaved: 'Draft on this device · not uploaded', // 66
  draftError: 'Local save failed · keep this page open', // 66
  draftPending: 'Saving draft on this device…', // 66
  draftMemory: 'Draft in this tab · not uploaded', // 66
  localSaveFailedToast: 'Local save failed. Keep this page open and retry; this draft has not been uploaded.', // 73
  localSaveErrorNotice: 'Latest local save failed. Keep this page open.', // 218
  retryLocalSave: 'Retry local save', // 218
  networkError: 'Server unreachable. Your saved captures remain queued on this device.', // 80
  unexpectedResponse: 'The server sent an unexpected response.', // new
  connected: 'Server connected', // 105
  offline: 'Offline · local drafts', // 105
  statusSummary: (s: StatusSnapshot | null, connected: boolean): string => // 107
    !connected
      ? 'Status unavailable'
      : !s?.tasks.length
        ? s?.notes.length
          ? `${s.notes.length} learning note${s.notes.length === 1 ? '' : 's'}`
          : 'Nothing tracked yet'
        : `${s.attention.length} need you · ${s.runs.filter((run) => run.effective_status === 'working').length} reported running`,
  outboxCount: (n: number): string => `${n} capture${n === 1 ? '' : 's'} on this device`, // 140
  offlineBanner: (hasSnapshot: boolean, saveError: boolean): string => // 142
    `Server disconnected. ${hasSnapshot ? 'Showing the last server snapshot; agent status may be outdated.' : 'Current work and integration status are unavailable.'} ${saveError ? 'Local save failed; keep unsaved work open.' : 'Capture can save on this device when local storage is available.'}`,
  lastKnown: 'Last known · ', // 189
  savedTo: (folder: string, processing: string): string => `Saved to ${folder}. ${processing ? 'Processing queued.' : 'Original preserved.'}`, // 128
  queueReadFailed: 'Cannot read the local capture queue. Keep this page open and retry the local save.', // 135
  closeOtherTabs: 'Close other Noema tabs and retry the local save.', // 40
  tooManyFiles: 'Keep each capture to 12 attachments.', // 398
  fileTooLarge: (name: string): string => `${name} exceeds 32 MB.`, // 398
  unsupportedType: 'Use a PNG, JPEG or WebP image, or a WAV, Ogg, WebM, MP4 or MP3 recording.', // new; server allowlist server.py:40-48
  totalTooLarge: 'Keep each capture under 60 MB in total.', // new
  writeSomething: 'Write something or add a recording or visual.', // 402
  stopRecordingBeforeSaving: 'Stop recording before saving.', // 401
  couldNotSave: (message: string): string => 'Could not save the capture: ' + message, // 414
  captureSavedSending: 'Capture saved on this device. Sending to your server…', // 417
  captureSavedOffline: 'Capture saved on this device. It will upload when connected.', // 417
  stopRecordingBeforeLeaving: 'Stop recording before leaving Capture.', // 269
  finishingLocalSave: 'Finishing the local save.', // 555
  editStillOpen: 'Your edit is still open.', // 555
  leaveNoteEdit: 'Leave without saving this note edit? The last saved revision remains safe.', // 485
  taskUnavailable: 'Task unavailable.', // 289
  taskDraftUnconfirmed: 'Save unconfirmed · retry the same attempt', // 306
  taskDraftSaved: 'Draft on this device · not added', // 306
  taskDraftError: 'Local draft save failed · keep this dialog open', // 306
  taskDraftPending: 'Saving draft on this device…', // 306
  taskDraftMemory: 'Draft in this tab · not added', // 306
  previousUnconfirmed: 'Previous save is unconfirmed. Retry the same attempt; this draft is not an offline task queue.', // 327
  draftStorageFailed: 'Draft storage failed. Task not added; keep this dialog open and retry.', // 351
  ackUnverified: 'Task acknowledgement could not be verified; retry the same attempt.', // 355
  notConfirmed: 'Not confirmed added. Your input is preserved. ', // 365
  checkServiceRetry: 'Check the service or local storage, then retry the same attempt.', // 365
  unconfirmedPreserved: 'Save unconfirmed · draft preserved. Retry does not create a second task.', // 366
  draftNotStored: 'Draft not stored. Keep this dialog open and retry; the task is not added.', // 299
  addTask: 'Add task', // 323
  retryAddTask: 'Retry add task', // 323
  taskAdded: 'Task added.', // 362
  taskAddedDateKept: 'Task added. Date wording kept; correct it in Edit if needed.', // 362
  taskSaved: 'Task saved.', // 362
  editAction: 'Edit', // 14
  priorityUpdated: 'Priority updated.', // 496
  taskReopened: 'Task reopened.', // 499
  taskCompleted: 'Task completed.', // 499
  unlockTitle: 'Unlock Noema', // 302
  unlockHelp: 'This server needs your access token. On the host machine, it is in the selected data directory’s admin.token file or your NOEMA_ACCESS_TOKEN setting.', // 302
  accessToken: 'Access token', // 302
  unlock: 'Unlock', // 302
  outboxTitle: 'Captures on this device', // 482
  outboxHelp: 'Saved explicitly, but not yet acknowledged by the server. Attachments are kept with each capture. Keep this browser’s site storage until they upload.', // 482
  outboxEmpty: 'All saved captures have reached the server.', // 482
  outboxFallbackText: 'Visual or voice capture', // 482
  attachmentsCount: (n: number): string => `${n} attachments`, // 482
  retry: 'Retry', // 482
  openCopy: 'Open a copy in Capture', // 482
  discard: 'Discard', // 482
  confirmReplaceDraft: 'Replace the current unsaved Capture draft? The queued capture remains safe.', // 541
  openedCopy: 'Opened a copy. The queued original still exists.', // 542
  confirmDiscard: 'Permanently discard this unsent capture and its local attachments?', // 544
  notificationTitle: 'Noema reminder', // 98
  notificationFallback: 'A task needs your attention.', // 98
  notificationsUnsupported: 'This browser does not expose notifications here. Reminders still appear in Needs you.', // 535
  closeSaveInFlight: 'A capture save is still finishing. Try closing again shortly.', // 603
  closeConfirm: 'Close Noema? An unfinished recording or unsaved note edit may be lost. Cancel to stop/save or copy it first.', // 604
  closeDraftFailed: 'Local draft saving failed. Close anyway and risk losing this draft? Cancel to keep it open and retry.', // 608
  closeCheckpointFailed: 'Could not checkpoint your draft. Keep Noema open and retry the local save.', // 612
  updateReady: 'Noema was updated. Your drafts are saved on this device.', // new
  reload: 'Reload', // new
} as const;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix web test -- src/strings.test.ts`
Expected: PASS (6 tests, none skipped while `public/app.js` exists).

- [ ] **Step 5: Commit**

```bash
git add web/src/strings.ts web/src/strings.test.ts
git commit -m "feat(web): add shared user-visible strings copied verbatim from app.js"
```

---

### Task 4: Build checks — content-hash guard and service-worker precache injection (spec §6.1 build check, §6.2 cache name and precache)

**Files:**
- Create: `web/scripts/check-hashes.mjs`, `web/scripts/sw-precache.mjs`
- Test: `web/src/buildScripts.test.ts`

**Interfaces:**
- Consumes: a Vite output directory.
- Produces: `node scripts/check-hashes.mjs [distDir]` (default `dist`) → exit 0, or exit 1 printing `Unhashed asset: <name>` per offender (or `No assets directory in <dist>; run vite build first`). `node scripts/sw-precache.mjs [distDir]` → prepends `const CACHE="noema-shell-<12 hex>";const PRECACHE=[…];\n` to `<dist>/sw.js`; refuses (exit 1) a dist without `index.html` or a `sw.js` that already has the header. `buildhash` = first 12 hex of sha256 over the sorted URL list joined by `\n`, then each listed file's bytes in URL order. The optional `distDir` argument is a local addition so the scripts can be tested on temporary directories.

- [ ] **Step 1: Write the failing test `web/src/buildScripts.test.ts`**

```ts
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const created: string[] = [];
afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeDist(files: Record<string, string>): string {
  const dist = mkdtempSync(join(tmpdir(), 'noema-dist-'));
  created.push(dist);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dist, name)), { recursive: true });
    writeFileSync(join(dist, name), content);
  }
  return dist;
}

function run(script: 'check-hashes.mjs' | 'sw-precache.mjs', dist: string) {
  return spawnSync(process.execPath, [`scripts/${script}`, dist], { encoding: 'utf8' });
}

const SHELL = {
  'index.html': '<!doctype html><div id="root"></div>',
  'assets/index-AbCd1234.js': 'export {};',
  'assets/index-AbCd1234.js.map': '{}',
  'manifest.webmanifest': '{"id":"/"}',
  'icon.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
  'sw.js': "self.addEventListener('install', () => {});\n",
};

describe('check-hashes.mjs', () => {
  it('accepts a dist whose assets all carry an 8-character content hash', () => {
    const result = run('check-hashes.mjs', makeDist({ 'assets/index-AbCd1234.js': '', 'assets/Inter-Regular-a_b-C9d0.otf': '' }));
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('rejects and names every unhashed asset', () => {
    const result = run('check-hashes.mjs', makeDist({ 'assets/index-AbCd1234.js': '', 'assets/logo.svg': '', 'assets/app-abc.js': '' }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unhashed asset: logo.svg');
    expect(result.stderr).toContain('Unhashed asset: app-abc.js');
    expect(result.stderr).not.toContain('index-AbCd1234.js');
  });

  it('fails when dist/assets is missing', () => {
    const result = run('check-hashes.mjs', makeDist({ 'index.html': '' }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('No assets directory');
  });
});

describe('sw-precache.mjs', () => {
  it('prepends the cache name and the list of every shipped file except sw.js and source maps', () => {
    const dist = makeDist(SHELL);
    expect(run('sw-precache.mjs', dist).status).toBe(0);
    const urls = ['/', '/assets/index-AbCd1234.js', '/icon.svg', '/manifest.webmanifest'];
    const hash = createHash('sha256').update(urls.join('\n'));
    for (const name of ['index.html', 'assets/index-AbCd1234.js', 'icon.svg', 'manifest.webmanifest']) hash.update(readFileSync(join(dist, name)));
    const [header, ...rest] = readFileSync(join(dist, 'sw.js'), 'utf8').split('\n');
    expect(header).toBe(`const CACHE="noema-shell-${hash.digest('hex').slice(0, 12)}";const PRECACHE=${JSON.stringify(urls)};`);
    expect(rest.join('\n')).toBe(SHELL['sw.js']);
  });

  it('changes the cache name when any shipped file changes', () => {
    const before = makeDist(SHELL);
    const after = makeDist({ ...SHELL, 'icon.svg': '<svg xmlns="http://www.w3.org/2000/svg" id="new"/>' });
    run('sw-precache.mjs', before);
    run('sw-precache.mjs', after);
    const cacheOf = (dist: string) => readFileSync(join(dist, 'sw.js'), 'utf8').split('"')[1];
    expect(cacheOf(before)).toMatch(/^noema-shell-[0-9a-f]{12}$/);
    expect(cacheOf(after)).not.toBe(cacheOf(before));
  });

  it('refuses to inject a second header into the same sw.js', () => {
    const dist = makeDist(SHELL);
    expect(run('sw-precache.mjs', dist).status).toBe(0);
    const second = run('sw-precache.mjs', dist);
    expect(second.status).toBe(1);
    expect(second.stderr).toContain('already has a precache header');
  });

  it('refuses a dist without index.html', () => {
    const { 'index.html': _index, ...withoutIndex } = SHELL;
    const result = run('sw-precache.mjs', makeDist(withoutIndex));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('No index.html');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/buildScripts.test.ts`
Expected: FAIL — 7 failures; `status` is `1` with `Cannot find module '.../web/scripts/check-hashes.mjs'` (and `sw-precache.mjs`) in stderr where 0 was expected, and the header assertions fail with `ENOENT`.

- [ ] **Step 3: Create `web/scripts/check-hashes.mjs`**

```js
// Fails the build when a file under dist/assets lacks a Vite content hash (spec §6.1). Usage: node scripts/check-hashes.mjs [distDir]
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const HASHED = /-[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+$/;
let entries;
try {
  entries = readdirSync(join(dist, 'assets'), { recursive: true, withFileTypes: true });
} catch {
  console.error(`No assets directory in ${dist}; run vite build first`);
  process.exit(1);
}
const unhashed = entries.filter((entry) => entry.isFile() && !HASHED.test(entry.name)).map((entry) => entry.name);
for (const name of unhashed) console.error(`Unhashed asset: ${name}`);
process.exit(unhashed.length > 0 ? 1 : 0);
```

- [ ] **Step 4: Create `web/scripts/sw-precache.mjs`**

```js
// Prepends the shell cache name and precache list to dist/sw.js (spec §6.2). Usage: node scripts/sw-precache.mjs [distDir]
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const fail = (message) => {
  console.error(message);
  process.exit(1);
};
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));

const names = walk(dist)
  .map((path) => relative(dist, path).split(sep).join('/'))
  .filter((name) => name !== 'sw.js' && !name.endsWith('.map'));
if (!names.includes('index.html')) fail(`No index.html in ${dist}; run vite build first`);
const urls = names.map((name) => (name === 'index.html' ? '/' : `/${name}`)).sort();
const hash = createHash('sha256').update(urls.join('\n'));
for (const url of urls) hash.update(readFileSync(join(dist, url === '/' ? 'index.html' : url.slice(1))));
const cache = `noema-shell-${hash.digest('hex').slice(0, 12)}`;

const swPath = join(dist, 'sw.js');
const worker = readFileSync(swPath, 'utf8');
if (worker.startsWith('const CACHE=')) fail(`${swPath} already has a precache header; rebuild before injecting again`);
writeFileSync(swPath, `const CACHE="${cache}";const PRECACHE=${JSON.stringify(urls)};\n${worker}`);
console.log(`${swPath}: ${cache}, ${urls.length} URLs`);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm --prefix web test -- src/buildScripts.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add web/scripts/check-hashes.mjs web/scripts/sw-precache.mjs web/src/buildScripts.test.ts
git commit -m "feat(web): add content-hash build check and service worker precache injection"
```

---

### Task 5: Buildable shell — base styles, hashed fonts, manifest, icon, minimal entry, worker install/activate (spec §4.1, §6.1 no inline scripts, §6.2 install/activate)

**Files:**
- Create: `web/index.html`, `web/src/main.tsx`, `web/src/styles/base.css`, `web/src/shell/serviceWorker.ts`
- Create (copied binaries): `web/src/assets/fonts/Inter-Regular.otf`, `Inter-Medium.otf`, `TeXGyreTermes-Regular.otf`, `TeXGyreTermes-Italic.otf` (from `experiments/ui-ab/frontend/public/assets/`), `web/src/assets/icon.svg`, `web/public/icon.svg` (from `public/icon.svg`)
- Create: `web/public/manifest.webmanifest`, `web/public/sw.js`
- Test: `web/src/shell/serviceWorker.test.ts`

**Interfaces:**
- Consumes: `S` is not used here; build scripts from Task 4.
- Produces: `registerServiceWorker(): void` (`web/src/shell/serviceWorker.ts`; no-op when `import.meta.env.DEV`, when `import.meta.env.MODE === 'development'` — the `npm run watch` build has no precache header, a local addition to the contract — or when `!('serviceWorker' in navigator)`); a `dist/` whose `index.html` has no inline script; `sw.js` globals `CACHE`, `PRECACHE` consumed by install/activate. Task 19 adds boot and the outbox flush to `main.tsx`; `02-screens-core.md` Task 14 replaces its body (contract §6.6). Behavioural tests of the worker are in Task 10.

- [ ] **Step 1: Write the failing test `web/src/shell/serviceWorker.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerServiceWorker } from './serviceWorker';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function productionBuild(mode = 'production') {
  vi.stubEnv('DEV', false);
  vi.stubEnv('MODE', mode);
}

describe('registerServiceWorker', () => {
  it('registers /sw.js in a production build and swallows a rejected registration', async () => {
    productionBuild();
    const register = vi.fn(() => Promise.reject(new Error('SecurityError')));
    vi.stubGlobal('navigator', { serviceWorker: { register } });
    expect(() => registerServiceWorker()).not.toThrow();
    expect(register).toHaveBeenCalledWith('/sw.js');
    await Promise.resolve();
  });

  it('never registers from the development watch build, whose sw.js has no precache header', () => {
    productionBuild('development');
    const register = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { serviceWorker: { register } });
    registerServiceWorker();
    expect(register).not.toHaveBeenCalled();
  });

  it('does nothing where service workers are unavailable (plain-HTTP non-loopback origin)', () => {
    productionBuild();
    vi.stubGlobal('navigator', {});
    expect(() => registerServiceWorker()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/shell/serviceWorker.test.ts`
Expected: FAIL — `Error: Cannot find module './serviceWorker' imported from /home/p4nic/code/noema/web/src/shell/serviceWorker.test.ts`.

- [ ] **Step 3: Create `web/src/shell/serviceWorker.ts`**

```ts
// The watch build (`npm run watch`, mode development) emits sw.js without its precache header, so it is never registered there.
export function registerServiceWorker(): void {
  if (import.meta.env.DEV || import.meta.env.MODE === 'development' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix web test -- src/shell/serviceWorker.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Copy fonts and icons**

```bash
cd /home/p4nic/code/noema
mkdir -p web/src/assets/fonts web/public
cp experiments/ui-ab/frontend/public/assets/Inter-Regular.otf experiments/ui-ab/frontend/public/assets/Inter-Medium.otf \
   experiments/ui-ab/frontend/public/assets/TeXGyreTermes-Regular.otf experiments/ui-ab/frontend/public/assets/TeXGyreTermes-Italic.otf \
   web/src/assets/fonts/
cp public/icon.svg web/src/assets/icon.svg
cp public/icon.svg web/public/icon.svg
```

- [ ] **Step 6: Create `web/public/manifest.webmanifest`** (`public/manifest.webmanifest` plus `id`, icon at `/icon.svg`)

```json
{"id":"/","name":"Noema","short_name":"Noema","start_url":"/","scope":"/","display":"standalone","background_color":"#101110","theme_color":"#101110","icons":[{"src":"/icon.svg","sizes":"any","type":"image/svg+xml","purpose":"any"}]}
```

- [ ] **Step 7: Create `web/public/sw.js` (install and activate; Task 10 adds `fetch` test-first)**

```js
// CACHE and PRECACHE are prepended at build time by scripts/sw-precache.mjs. Private API data never enters this cache.
/* global CACHE, PRECACHE */
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('noema-shell-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});
```

- [ ] **Step 8: Create `web/src/styles/base.css`** (ported from `experiments/ui-ab/frontend/src/style.css:1-7` and `theme.css:2-12`, `:74`, `:93`; relative font URLs so Vite hashes them)

```css
/* Fonts, tokens and reset. Component styles live in shell.css/ui.css (P3) and screens.css (P4). */
@font-face{font-family:Inter;src:url('../assets/fonts/Inter-Regular.otf') format('opentype');font-weight:400;font-display:swap}
@font-face{font-family:Inter;src:url('../assets/fonts/Inter-Medium.otf') format('opentype');font-weight:500 800;font-display:swap}
@font-face{font-family:Display;src:url('../assets/fonts/TeXGyreTermes-Regular.otf') format('opentype');font-weight:400;font-display:swap}
@font-face{font-family:Display;src:url('../assets/fonts/TeXGyreTermes-Italic.otf') format('opentype');font-weight:400;font-style:italic;font-display:swap}

:root{color-scheme:dark;--sidebar:190px;--reading:866px;font-family:Inter,sans-serif;font-size:16px;color:var(--text);background:var(--bg)}
/* Monochrome graphite with a single cool silver accent; color is reserved for priority. */
:root{
 --bg:#08090b;--bg-raised:#0d0e11;
 --text:#eceef2;--text-dim:#b4b9c3;--muted:#9097a3;--faint:#6f7682;
 --accent:#cdd5e3;--sage:var(--accent);--accent-soft:#cdd5e31a;
 --line:#ffffff14;--line-strong:#ffffff26;--line-hover:#ffffff38;--border:var(--line);
 --surface:#0e0f13d9;--surface-solid:#111216;--surface-raised:#15171cf0;--surface-hover:#ffffff08;--surface-active:#ffffff0e;--panel:var(--surface-raised);
 --highlight:inset 0 1px 0 #ffffff0d;--shadow:0 12px 40px #00000059;--shadow-modal:0 30px 90px #000000b3;
 --font-label:ui-monospace,'SFMono-Regular','JetBrains Mono','Liberation Mono',monospace;
 --radius:10px;--radius-small:7px;
 --ease:cubic-bezier(.2,.8,.2,1);--fast:120ms var(--ease);--transition:180ms var(--ease);--arrive:260ms var(--ease);
}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:var(--bg);color:var(--text)}
button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
```

- [ ] **Step 9: Create `web/index.html` and the minimal `web/src/main.tsx`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#101110">
<meta name="description" content="Learning notes and a quieter place for your attention.">
<title>Noema</title>
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
</head>
<body>
<div id="root"></div>
<script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

```tsx
// Minimal P1 entry (contract §1.3); P3 replaces the body with the boot order of contract §6.6.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/base.css';
import { registerServiceWorker } from './shell/serviceWorker';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <StrictMode>
    <main data-quiet>
      <h1>Noema</h1>
    </main>
  </StrictMode>,
);
registerServiceWorker();
```

- [ ] **Step 10: Build and verify the output**

Run:
```bash
cd /home/p4nic/code/noema
npm --prefix web run build
head -c 120 web/dist/sw.js; echo
ls web/dist web/dist/assets
python3 -c "import re,sys; h=open('web/dist/index.html').read(); s=re.findall(r'<script\b[^>]*>', h); assert s and all('src=' in t for t in s), s; print('no inline scripts:', s)"
```
Expected: `tsc` passes; Vite writes `dist/`; `sw-precache` prints `dist/sw.js: noema-shell-<12 hex>, N URLs`; `check-hashes` exits 0. `sw.js` starts with `const CACHE="noema-shell-`; `dist/` contains exactly `assets`, `icon.svg`, `index.html`, `manifest.webmanifest`, `sw.js`; `dist/assets` holds `index-<hash>.js`, `index-<hash>.css` and the four `<font>-<hash>.otf` files; the Python check prints one `<script type="module" crossorigin src="/assets/index-…js">`.

- [ ] **Step 11: Run all unit tests**

Run: `npm --prefix web test`
Expected: PASS (21 tests).

- [ ] **Step 12: Commit**

```bash
git add web/index.html web/src/main.tsx web/src/styles/base.css web/src/shell/serviceWorker.ts web/src/shell/serviceWorker.test.ts \
  web/src/assets/fonts/Inter-Regular.otf web/src/assets/fonts/Inter-Medium.otf web/src/assets/fonts/TeXGyreTermes-Regular.otf web/src/assets/fonts/TeXGyreTermes-Italic.otf \
  web/src/assets/icon.svg web/public/icon.svg web/public/manifest.webmanifest web/public/sw.js
git commit -m "feat(web): build a hashed minimal shell with fonts, manifest and precaching worker"
```

---

### Task 6: FastAPI serves `web/dist` (spec §6.1, §8 Python split)

**Files:**
- Modify: `noema/server.py:15` (import), `:27` (new `HashedAssets` class before `BodyLimit`), `:52` (signature), `:53` (dist path), `:342-352` (replace the `/`, `/companion`, `/sw.js` and `/static` block)
- Modify: `tests/test_core.py:40-41` (replace `test_health_and_static`)
- Test: `tests/test_core.py` › `test_frontend_not_built_returns_503`, `test_frontend_routes_and_headers`

**Interfaces:**
- Consumes: `create_app(...)` callers (`run.py`, `noema/desktop_service.py`, `tests/*`) — all keep working because `dist_dir` is a new trailing keyword.
- Produces: `create_app(data_dir=None, start_worker=True, admin_token=None, desktop_identity=None, dist_dir=None)`; routes `GET /`, `/assets/*`, `GET /sw.js`, `GET /manifest.webmanifest`, `GET /icon.svg` exactly as contract §2. `/static`, `/companion` and `ROOT/'public'` serving are gone (the old UI is no longer served on this branch; `qa/*` browser suites are superseded by the parity map).

- [ ] **Step 1: Replace `test_health_and_static` (`tests/test_core.py:40-41`) with the two failing tests**

```python
SHELL_ASSET='index-AbCd1234.js'

def make_dist(root):
    (root/'assets').mkdir(parents=True)
    (root/'index.html').write_text('<!doctype html><title>Noema</title><div id="root"></div>')
    (root/'assets'/SHELL_ASSET).write_text('export {};')
    (root/'sw.js').write_text('const CACHE="noema-shell-000000000000";const PRECACHE=["/"];\n')
    (root/'manifest.webmanifest').write_text('{"id":"/","start_url":"/","scope":"/"}')
    (root/'icon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
    return root

def test_frontend_not_built_returns_503(tmp_path):
    app=create_app(tmp_path/'data',start_worker=False,admin_token=ADMIN,dist_dir=tmp_path/'missing')
    with TestClient(app) as c:
        r=c.get('/')
        assert r.status_code==503
        assert r.text=='Frontend not built: run `npm --prefix web run build`'
        assert r.headers['content-type'].startswith('text/plain')
        assert r.headers['cache-control']=='no-cache'
        assert "default-src 'self'" in r.headers['content-security-policy']
        assert c.get('/api/health').json()['ok']
        for path in ('/assets/'+SHELL_ASSET,'/sw.js','/manifest.webmanifest','/icon.svg'):
            assert c.get(path).status_code==404,path

def test_frontend_routes_and_headers(tmp_path):
    dist=make_dist(tmp_path/'dist')
    app=create_app(tmp_path/'data',start_worker=False,admin_token=ADMIN,dist_dir=dist)
    with TestClient(app) as c:
        index=c.get('/')
        assert index.status_code==200 and '<div id="root">' in index.text
        assert index.headers['content-type'].startswith('text/html')
        assert index.headers['cache-control']=='no-cache'
        assert index.headers['x-frame-options']=='DENY'
        asset=c.get('/assets/'+SHELL_ASSET)
        assert asset.status_code==200 and asset.text=='export {};'
        assert asset.headers['cache-control']=='public, max-age=31536000, immutable'
        assert c.get('/assets/missing-AbCd1234.js').status_code==404
        sw=c.get('/sw.js')
        assert sw.status_code==200 and sw.text.startswith('const CACHE=')
        assert sw.headers['content-type'].startswith('application/javascript')
        assert sw.headers['service-worker-allowed']=='/'
        assert sw.headers['cache-control']=='no-cache'
        manifest=c.get('/manifest.webmanifest')
        assert manifest.json()=={'id':'/','start_url':'/','scope':'/'}
        assert manifest.headers['content-type'].startswith('application/manifest+json')
        assert manifest.headers['cache-control']=='no-cache'
        icon=c.get('/icon.svg')
        assert icon.headers['content-type'].startswith('image/svg+xml') and icon.headers['cache-control']=='no-cache'
        for path in ('/static/app.js','/static/sw.js','/companion','/index.html'):
            assert c.get(path).status_code==404,path
        assert c.get('/api/state').status_code==401
        (dist/'manifest.webmanifest').unlink()
        assert c.get('/manifest.webmanifest').status_code==404
```

- [ ] **Step 2: Run them to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_core.py -k "frontend" -q`
Expected: FAIL — `TypeError: create_app() got an unexpected keyword argument 'dist_dir'` in both tests.

- [ ] **Step 3: Implement the serving in `noema/server.py`**

Line 15 becomes:
```python
from fastapi.responses import JSONResponse, FileResponse, PlainTextResponse, Response
```
Insert before `class BodyLimit:` (line 27):
```python
class HashedAssets(StaticFiles):
    """Vite output under dist/assets is content-hashed, so a URL never changes content."""
    async def check_config(self): pass  # dist may be built after start; a missing directory is a plain 404, not a 500
    async def get_response(self,path,scope):
        response=await super().get_response(path,scope)
        response.headers['Cache-Control']='public, max-age=31536000, immutable'
        return response
```
Line 52 becomes:
```python
def create_app(data_dir=None, start_worker=True, admin_token=None, desktop_identity=None, dist_dir=None):
```
After line 53 (`root=Path(...)`) insert:
```python
    dist=Path(dist_dir) if dist_dir is not None else ROOT/'web'/'dist'
```
Replace lines 342-352 (from `@app.get('/')` through `return app`) with:
```python
    no_cache={'Cache-Control':'no-cache'}

    def dist_file(name,media_type,headers=None):
        path=dist/name
        if not path.is_file(): raise Problem(404,'Not found')
        return FileResponse(path,media_type=media_type,headers={**no_cache,**(headers or {})})

    @app.get('/')
    def index():
        if not (dist/'index.html').is_file():
            return PlainTextResponse('Frontend not built: run `npm --prefix web run build`',status_code=503,headers=no_cache)
        return dist_file('index.html','text/html')

    @app.get('/sw.js')
    def sw(): return dist_file('sw.js','application/javascript',{'Service-Worker-Allowed':'/'})

    @app.get('/manifest.webmanifest')
    def manifest(): return dist_file('manifest.webmanifest','application/manifest+json')

    @app.get('/icon.svg')
    def icon(): return dist_file('icon.svg','image/svg+xml')

    app.mount('/assets',HashedAssets(directory=dist/'assets',check_dir=False),name='assets')
    return app
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_core.py -k "frontend" -q`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the whole Python suite**

Run: `.venv/bin/python -m pytest -q`
Expected: every test in `tests/test_core.py` (62), `test_task_capture.py`, `test_helpers.py`, `test_companion.py` and `test_device_tools.py` passes; `tests/test_managed_service.py` has the same pass/skip outcome as on `master` (it depends on the Rust probe; P6 ports it).

- [ ] **Step 6: Commit**

```bash
git add noema/server.py tests/test_core.py
git commit -m "feat(server): serve the web/dist build with explicit routes and a 503 page"
```

---

### Task 7: `display_name` setting (spec §4.7 Greeting backend change)

**Files:**
- Modify: `noema/models.py:130-134` (`SettingsInput`)
- Modify: `noema/store.py:100` (`DEFAULT_SETTINGS`), `:383` (`Store.settings`)
- Test: `tests/test_core.py` › `test_display_name_setting` (append after `test_frontend_routes_and_headers`)

**Interfaces:**
- Consumes: `PATCH /api/settings`, `GET /api/state`.
- Produces: `SettingsInput.display_name: str | None = Field(default=None, max_length=60)` with a `mode='before'` strip; `DEFAULT_SETTINGS['display_name'] = ''`; `Store.settings()` returns `{**DEFAULT_SETTINGS, **stored}` so old rows gain `display_name: ''`. Consumed by P2 `SettingsSchema` and P3 `greeting`/`avatarLetter`.

- [ ] **Step 1: Write the failing test**

```python
def test_display_name_setting(env):
    c,s,w=env
    assert c.get('/api/state').json()['settings']['display_name']==''
    r=c.patch('/api/settings',json={'display_name':'  Vishal  '})
    assert r.status_code==200,r.text
    assert r.json()['display_name']=='Vishal'
    assert c.get('/api/state').json()['settings']['display_name']=='Vishal'
    assert c.patch('/api/settings',json={'display_name':'x'*61}).status_code==422
    padded=c.patch('/api/settings',json={'display_name':' '*10+'y'*60})
    assert padded.status_code==200,padded.text
    assert padded.json()['display_name']=='y'*60
    assert c.patch('/api/settings',json={'display_name':5}).status_code==422
    assert c.patch('/api/settings',json={'motion':True}).json()['display_name']=='y'*60
    assert c.patch('/api/settings',json={'display_name':''}).json()['display_name']==''
    s.set_meta('settings',{'observation_enabled':False,'motion':False,'companion':'cat','companion_size':40})
    old=c.get('/api/state').json()['settings']
    assert old['display_name']==''
    assert old['observation_enabled'] is False and old['motion'] is False
```

- [ ] **Step 2: Run it to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_core.py -k test_display_name_setting -q`
Expected: FAIL — `KeyError: 'display_name'` on the first assertion.

- [ ] **Step 3: Implement**

`noema/models.py`, `SettingsInput` (lines 130-134) becomes:
```python
class SettingsInput(Input):
    observation_enabled: bool | None = None
    motion: bool | None = None
    companion: Literal['cat', 'dot', 'hidden'] | None = None
    companion_size: int | None = Field(default=None, ge=24, le=72)
    display_name: str | None = Field(default=None, max_length=60)

    @field_validator('display_name', mode='before')
    @classmethod
    def strip_display_name(cls, value):
        # Strip before the length check; non-strings fall through to the str check and are rejected, never coerced.
        return value.strip() if isinstance(value, str) else value
```
`noema/store.py:100` becomes:
```python
DEFAULT_SETTINGS = {'observation_enabled': False, 'motion': False, 'companion': 'cat', 'companion_size': 40, 'display_name': ''}
```
`noema/store.py:383` becomes:
```python
        result = {**DEFAULT_SETTINGS, **self.meta('settings')}  # rows written before a setting existed get its default
```

- [ ] **Step 4: Run it to verify it passes, then the full core suite**

Run: `.venv/bin/python -m pytest tests/test_core.py -q`
Expected: PASS (63 tests).

- [ ] **Step 5: Commit**

```bash
git add noema/models.py noema/store.py tests/test_core.py
git commit -m "feat(server): add the display_name setting with defaults for older workspaces"
```

---

### Task 8: Playwright harness, serving E2E and harness self-test (spec §8 E2E harness, CSP, upgrade seed; handbook R9/C1)

**Files:**
- Create: `web/playwright.config.ts`, `web/e2e/server.ts`, `web/e2e/fixtures.ts`
- Test: `web/e2e/serving.spec.ts`, `web/e2e/harness.spec.ts`

**Interfaces:**
- Consumes: `S.connected` (Task 3); `run.py`; `create_app(dist_dir=…)` (Task 6); `web/dist` (Task 5).
- Produces (contract §9.1–9.2, with local additions marked ★):
  - `E2E_TOKEN`, `type NoemaServer` (`api(method, path, body)` takes the full path including `/api`, e.g. `noema.api('GET', '/api/state')`, as `02-screens-core.md` and `04-terrain.md` call it), `getFreePort()`, `startNoema(options?: { dataDir?; env?; port?; distDir?★ })` — spawns `.venv/bin/python run.py --host 127.0.0.1 --port <p> --data-dir <tmp>` with every inherited `NOEMA_*` variable removed and `NOEMA_ACCESS_TOKEN=E2E_TOKEN`; with `distDir`★ it runs `create_app(data_dir, dist_dir=distDir)` under uvicorn instead (run.py always serves `web/dist`). `kill()` = SIGKILL, data kept; `restart()` = stop if alive, relaunch on the same port and data dir; `stop()` = SIGTERM (SIGKILL after 5 s) and remove an owned temp dir. ★`REPO`, `WEB_DIST` exported.
  - `test` with fixtures `noema` (fresh server per test), `csp` (auto; records every `securitypolicyviolation` in every document via `page.exposeFunction`, fails the test at teardown if any — replaces the contract's `window.__cspViolations`, which would reset on navigation), ★`pageErrors` (auto; fails the test on any uncaught page error — satisfies the parity rows "No uncaught … JavaScript errors").
  - `gotoApp(page, noema, hash = '#/overview')` (waits for `S.connected`; first usable once P3 renders the status line), `seedLocalDb(page, origin, seed)`, `readLocalDb(page)` (draft files summarised as `{name, type, size}`), `type SeedDraft`, ★`type LocalDbSnapshot`.

- [ ] **Step 1: Write the failing serving tests `web/e2e/serving.spec.ts`**

```ts
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { startNoema, WEB_DIST } from './server';

type StateBody = {
  capabilities: { organizer: boolean; speech: boolean; screen_pixels: boolean };
  settings: { observation_enabled: boolean; motion: boolean; display_name: string };
};

test('serves the built shell with no inline script and no CSP violation', async ({ page, noema }) => {
  const response = await page.goto(noema.origin + '/');
  expect(response?.status()).toBe(200);
  expect(response?.headers()['content-security-policy']).toContain("script-src 'self'");
  await expect(page.locator('#root [data-quiet]').first()).toBeVisible();
  expect(await page.locator('script:not([src])').count()).toBe(0);
});

test('hashed assets are immutable, shell files revalidate and v1 paths are gone', async ({ request, noema }) => {
  const assets = readdirSync(join(WEB_DIST, 'assets'));
  expect(assets.length).toBeGreaterThan(0);
  for (const name of assets) {
    const response = await request.get(`${noema.origin}/assets/${name}`);
    expect(response.status(), name).toBe(200);
    expect(response.headers()['cache-control'], name).toBe('public, max-age=31536000, immutable');
  }
  for (const path of ['/', '/sw.js', '/manifest.webmanifest', '/icon.svg']) {
    const response = await request.get(noema.origin + path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()['cache-control'], path).toBe('no-cache');
  }
  expect((await request.get(noema.origin + '/sw.js')).headers()['service-worker-allowed']).toBe('/');
  const manifest = await (await request.get(noema.origin + '/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ id: '/', start_url: '/', scope: '/', icons: [{ src: '/icon.svg' }] });
  for (const path of ['/static/app.js', '/companion', '/index.html', '/assets/missing-AbCd1234.js']) {
    expect((await request.get(noema.origin + path)).status(), path).toBe(404);
  }
});

test('fonts load from content-hashed asset URLs', async ({ page, noema }) => {
  await page.goto(noema.origin + '/');
  const fonts = ['16px Inter', '500 16px Inter', '16px Display', 'italic 16px Display'];
  const loaded = await page.evaluate(async (list) => {
    await Promise.all(list.map((font) => document.fonts.load(font)));
    return list.every((font) => document.fonts.check(font));
  }, fonts);
  expect(loaded).toBe(true);
  const fontPaths = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => new URL(entry.name).pathname).filter((path) => path.endsWith('.otf')),
  );
  expect(fontPaths).toHaveLength(4);
  for (const path of fontPaths) expect(path).toMatch(/^\/assets\/.+-[A-Za-z0-9_-]{8}\.otf$/);
});

test('base app runs with no model and capture disabled by default', async () => {
  const inherited = process.env.NOEMA_MODEL;
  process.env.NOEMA_MODEL = 'inherited-model-must-be-stripped';
  const noema = await startNoema().finally(() => {
    if (inherited === undefined) delete process.env.NOEMA_MODEL;
    else process.env.NOEMA_MODEL = inherited;
  });
  try {
    const state = await noema.api<StateBody>('GET', '/api/state');
    expect(state.capabilities).toMatchObject({ organizer: false, speech: false, screen_pixels: false });
    expect(state.settings).toMatchObject({ observation_enabled: false, motion: false, display_name: '' });
  } finally {
    await noema.stop();
  }
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm --prefix web run e2e -- e2e/serving.spec.ts`
Expected: FAIL — `Error: Cannot find module '/home/p4nic/code/noema/web/e2e/fixtures' imported from /home/p4nic/code/noema/web/e2e/serving.spec.ts` and `Error: No tests found.` (no `playwright.config.ts`, `fixtures.ts` or `server.ts` yet).

- [ ] **Step 3: Create `web/playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 60_000, // each test starts its own Python service; the service-worker tests start two
  use: { trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

- [ ] **Step 4: Create `web/e2e/server.ts`**

```ts
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const E2E_TOKEN = 'e2e-admin-token-0123456789abcdef';
export const REPO = fileURLToPath(new URL('../../', import.meta.url));
export const WEB_DIST = join(REPO, 'web', 'dist');
const PYTHON = join(REPO, '.venv', 'bin', 'python');
const STARTUP_MS = 15_000;
// run.py always serves web/dist; an injected dist goes through create_app(dist_dir=…) directly.
const SERVE_DIST = [
  'import sys, uvicorn',
  'from noema.server import create_app',
  "uvicorn.run(create_app(sys.argv[2], dist_dir=sys.argv[3]), host='127.0.0.1', port=int(sys.argv[1]), access_log=False)",
].join('\n');

export type NoemaServer = {
  origin: string;
  port: number;
  dataDir: string;
  api<T = unknown>(method: string, path: string, body?: unknown): Promise<T>;
  kill(): Promise<void>;
  restart(): Promise<void>;
  stop(): Promise<void>;
};

export type StartOptions = { dataDir?: string; env?: Record<string, string>; port?: number; distDir?: string };

export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

function childEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  // Inherited NOEMA_* (models, tokens, data dir, allowed hosts) must never leak into a test service.
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) if (!key.startsWith('NOEMA_')) env[key] = value;
  return { ...env, NOEMA_ACCESS_TOKEN: E2E_TOKEN, ...extra };
}

export async function startNoema(options: StartOptions = {}): Promise<NoemaServer> {
  if (!existsSync(join(options.distDir ?? WEB_DIST, 'index.html'))) throw new Error('Run npm --prefix web run build first');
  const ownsDataDir = options.dataDir === undefined;
  const dataDir = options.dataDir ?? mkdtempSync(join(tmpdir(), 'noema-e2e-'));
  const port = options.port ?? (await getFreePort());
  const origin = `http://127.0.0.1:${port}`;
  const args =
    options.distDir === undefined
      ? [join(REPO, 'run.py'), '--host', '127.0.0.1', '--port', String(port), '--data-dir', dataDir]
      : ['-c', SERVE_DIST, String(port), dataDir, options.distDir];
  let child: ChildProcess | null = null;

  async function launch(): Promise<void> {
    let stderr = '';
    const proc = spawn(PYTHON, args, { cwd: REPO, env: childEnv(options.env ?? {}), stdio: ['ignore', 'ignore', 'pipe'] });
    child = proc;
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    const deadline = Date.now() + STARTUP_MS;
    while (Date.now() < deadline) {
      if (proc.exitCode !== null || proc.signalCode !== null) throw new Error(`Noema exited during startup (${proc.exitCode ?? proc.signalCode}):\n${stderr}`);
      try {
        if ((await fetch(origin + '/api/health')).ok) return;
      } catch {
        // not listening yet
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    proc.kill('SIGKILL');
    throw new Error(`Noema did not answer /api/health within ${STARTUP_MS} ms:\n${stderr}`);
  }

  async function terminate(signal: NodeJS.Signals): Promise<void> {
    const proc = child;
    if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
    const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()));
    proc.kill(signal);
    const escalate = setTimeout(() => proc.kill('SIGKILL'), 5_000);
    await exited;
    clearTimeout(escalate);
  }

  await launch();
  return {
    origin,
    port,
    dataDir,
    async api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
      const response = await fetch(origin + path, {
        method,
        headers: {
          Authorization: `Bearer ${E2E_TOKEN}`,
          'X-Noema-Request': '1',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`${method} ${path} → ${response.status}: ${text}`);
      return (text ? JSON.parse(text) : null) as T;
    },
    kill: () => terminate('SIGKILL'),
    async restart() {
      await terminate('SIGTERM');
      await launch();
    },
    async stop() {
      await terminate('SIGTERM');
      if (ownsDataDir) rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
```

- [ ] **Step 5: Create `web/e2e/fixtures.ts`**

```ts
import { test as base, expect, type Page } from '@playwright/test';
import { S } from '../src/strings';
import { startNoema, type NoemaServer } from './server';

export { expect };

export type SeedDraft = { id: string; raw: string; task_id: string; files: { name: string; type: string; base64: string }[]; error?: string };
export type LocalDbSnapshot = { draft: unknown; taskDraft: unknown; outbox: { id: string; raw: string; error?: string; fileCount: number }[] };

export const test = base.extend<{ noema: NoemaServer; csp: void; pageErrors: void }>({
  noema: async ({}, use) => {
    const noema = await startNoema();
    await use(noema);
    await noema.stop();
  },
  csp: [
    async ({ page }, use) => {
      const violations: string[] = [];
      // exposeFunction survives navigations, so violations from every document of the test are kept.
      await page.exposeFunction('__noemaReportCsp', (violation: string) => {
        violations.push(violation);
      });
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (event) => {
          const report = (window as unknown as { __noemaReportCsp(v: string): void }).__noemaReportCsp;
          report(`${event.effectiveDirective} blocked ${event.blockedURI} at ${event.sourceFile}:${event.lineNumber}`);
        });
      });
      await use();
      expect(violations, 'CSP violations').toEqual([]);
    },
    { auto: true },
  ],
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await use();
      expect(errors, 'uncaught page errors').toEqual([]);
    },
    { auto: true },
  ],
});

export async function gotoApp(page: Page, noema: NoemaServer, hash = '#/overview'): Promise<void> {
  await page.goto(`${noema.origin}/${hash}`);
  await expect(page.getByText(S.connected, { exact: true })).toBeVisible();
}

export async function seedLocalDb(page: Page, origin: string, seed: { draft?: SeedDraft; taskDraft?: unknown; outbox?: SeedDraft[] }): Promise<void> {
  await page.goto(origin + '/api/health'); // same origin, no app code competing for the database
  await page.evaluate(async (seed) => {
    const toRecord = (item: SeedDraft) => ({
      id: item.id,
      raw: item.raw,
      task_id: item.task_id,
      files: item.files.map((file) => ({ name: file.name, blob: new Blob([Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))], { type: file.type }) })),
      ...(item.error === undefined ? {} : { error: item.error }),
    });
    // Same upgrade as public/app.js:30-43, so seeded records are exactly what the v1 UI stored.
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('noema-local-v1', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('kv');
        request.result.createObjectStore('outbox', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
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
  }, seed);
}

export async function readLocalDb(page: Page): Promise<LocalDbSnapshot> {
  return page.evaluate(async () => {
    type Stored = { id: string; raw: string; task_id: string; files: { name: string; blob: Blob }[]; error?: string };
    // Duplicated from seedLocalDb: evaluate callbacks run in the page and cannot share closures.
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('noema-local-v1', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('kv');
        request.result.createObjectStore('outbox', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = <T>(store: 'kv' | 'outbox', query: (s: IDBObjectStore) => IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        const request = query(db.transaction(store, 'readonly').objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const rawDraft = (await read('kv', (s) => s.get('draft'))) as Stored | undefined;
    const taskDraft = (await read('kv', (s) => s.get('task-draft'))) ?? null;
    const items = (await read('outbox', (s) => s.getAll())) as Stored[];
    db.close();
    const draft = rawDraft ? { ...rawDraft, files: rawDraft.files.map((file) => ({ name: file.name, type: file.blob.type, size: file.blob.size })) } : null;
    return {
      draft,
      taskDraft,
      outbox: items.map((item) => ({ id: item.id, raw: item.raw, ...(item.error === undefined ? {} : { error: item.error }), fileCount: item.files.length })),
    };
  });
}
```

- [ ] **Step 6: Run the serving tests to verify they pass**

Run: `npm --prefix web run build && npm --prefix web run e2e -- e2e/serving.spec.ts`
Expected: PASS (4 tests). (Task 19 appends the cookie-only boot test, which needs the boot added there.)

- [ ] **Step 7: Write the harness self-test `web/e2e/harness.spec.ts`** (upgrade half: v1-shaped records round-trip in IndexedDB key order)

```ts
import { expect, readLocalDb, seedLocalDb, test, type SeedDraft } from './fixtures';

const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3l0AAAAASUVORK5CYII=';

test('seedLocalDb writes v1-shaped records that readLocalDb reads back in key order', async ({ page, noema }) => {
  const png = { name: 'heap.png', type: 'image/png', base64: PNG_1PX };
  const outbox: SeedDraft[] = [
    { id: 'b-item', raw: 'second by key, v1 shape without error', task_id: '', files: [] },
    { id: 'a-item', raw: 'first by key', task_id: 'task-1', files: [png], error: '' },
    { id: 'c-item', raw: 'rejected earlier', task_id: '', files: [], error: 'Request failed (400)' },
  ];
  const taskDraft = { id: 'task-draft-1', raw: 'Review cleanup', fields: { project: 'CTF' }, pending: { capture_id: 'task-draft-1', raw: 'Review cleanup', local_day: '2026-10-09', details: { project: 'CTF' } } };
  await seedLocalDb(page, noema.origin, { draft: { id: 'draft-1', raw: 'unsaved thought', task_id: '', files: [png] }, taskDraft, outbox });
  const db = await readLocalDb(page);
  expect(db.outbox).toEqual([
    { id: 'a-item', raw: 'first by key', error: '', fileCount: 1 },
    { id: 'b-item', raw: 'second by key, v1 shape without error', fileCount: 0 },
    { id: 'c-item', raw: 'rejected earlier', error: 'Request failed (400)', fileCount: 0 },
  ]);
  expect(db.draft).toEqual({ id: 'draft-1', raw: 'unsaved thought', task_id: '', files: [{ name: 'heap.png', type: 'image/png', size: 68 }] });
  expect(db.taskDraft).toEqual(taskDraft);
});
```

- [ ] **Step 8: Run it**

Run: `npm --prefix web run e2e -- e2e/harness.spec.ts`
Expected: PASS (1 test). (This exercises the Step 5 helpers against real Chromium IndexedDB; it is the self-check for that code.)

- [ ] **Step 9: Commit**

```bash
git add web/playwright.config.ts web/e2e/server.ts web/e2e/fixtures.ts web/e2e/serving.spec.ts web/e2e/harness.spec.ts
git commit -m "test(web): add Playwright harness with CSP and page-error guards and serving tests"
```

---

### Task 9: Fault injection helpers (spec §8 "Fault injection", contract §9.3)

**Files:**
- Create: `web/e2e/faults.ts`
- Test: `web/e2e/harness.spec.ts` (append)

**Interfaces:**
- Consumes: `test`, `expect` from `./fixtures`.
- Produces (contract §9.3; all via `page.addInitScript`, so they apply from the next navigation): `failIdbWrite(page, { store, key?, times? = 1, error })` — the matching `put`/`add`/`delete` request is issued, then its transaction aborts asynchronously with `tx.error` = `DOMException(error)` (as a real quota failure does); `delayIdbTransactions(page, ms)` — delays every `oncomplete` property handler by `ms`; `blockIdbOpen(page)` — opening `noema-local-v1` fires `blocked` and never succeeds; `failFetch(page, { path, method?, times? = 1, fault })`; `holdFetch(page, path)` → `{ release(), released() }` (`released()` resolves when a held request has been forwarded and settled); `loseAck(page, path, times? = 1)`; `stubIpc(page)`. Matching: a string `path` equals `URL.pathname` (e.g. `'/api/captures'`); a RegExp is tested against `pathname + search`. Rules are checked in the order they were added; each has its own remaining `times`.

- [ ] **Step 1: Append the failing self-tests to `web/e2e/harness.spec.ts`**

Add to the imports at the top of the file:
```ts
import { blockIdbOpen, delayIdbTransactions, failFetch, failIdbWrite, holdFetch, loseAck, stubIpc } from './faults';
```
Append:
```ts
type HarnessWindow = Window & { openNoemaDb(): Promise<IDBDatabase>; pending?: Promise<number>; __ipcMessages?: string[] };

test.describe('fault injection', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as HarnessWindow).openNoemaDb = () =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('noema-local-v1', 1);
          request.onupgradeneeded = () => {
            request.result.createObjectStore('kv');
            request.result.createObjectStore('outbox', { keyPath: 'id' });
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
    });
  });

  test('failIdbWrite aborts only the matching write, once, with the injected error', async ({ page, noema }) => {
    await failIdbWrite(page, { store: 'kv', key: 'draft', error: 'QuotaExceededError' });
    await page.goto(noema.origin + '/api/health');
    const outcomes = await page.evaluate(async () => {
      const db = await (window as unknown as HarnessWindow).openNoemaDb();
      const put = (key: string) =>
        new Promise<string>((resolve) => {
          const tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put({ raw: key }, key);
          tx.oncomplete = () => resolve('complete');
          tx.onabort = () => resolve('abort:' + (tx.error?.name ?? 'none'));
        });
      return [await put('task-draft'), await put('draft'), await put('draft')];
    });
    expect(outcomes).toEqual(['complete', 'abort:QuotaExceededError', 'complete']);
  });

  test('failIdbWrite matches outbox records by their id', async ({ page, noema }) => {
    await failIdbWrite(page, { store: 'outbox', key: 'doomed', error: 'AbortError' });
    await page.goto(noema.origin + '/api/health');
    const outcomes = await page.evaluate(async () => {
      const db = await (window as unknown as HarnessWindow).openNoemaDb();
      const add = (id: string) =>
        new Promise<string>((resolve) => {
          const tx = db.transaction('outbox', 'readwrite');
          tx.objectStore('outbox').add({ id, raw: '', task_id: '', files: [] });
          tx.oncomplete = () => resolve('complete');
          tx.onabort = () => resolve('abort:' + (tx.error?.name ?? 'none'));
        });
      return [await add('kept'), await add('doomed')];
    });
    expect(outcomes).toEqual(['complete', 'abort:AbortError']);
  });

  test('delayIdbTransactions postpones completion handlers', async ({ page, noema }) => {
    await delayIdbTransactions(page, 400);
    await page.goto(noema.origin + '/api/health');
    const elapsed = await page.evaluate(async () => {
      const db = await (window as unknown as HarnessWindow).openNoemaDb();
      const started = performance.now();
      await new Promise<void>((resolve) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put('x', 'probe');
        tx.oncomplete = () => resolve();
      });
      return performance.now() - started;
    });
    expect(elapsed).toBeGreaterThanOrEqual(400);
  });

  test('blockIdbOpen reports blocked and never opens the database', async ({ page, noema }) => {
    await blockIdbOpen(page);
    await page.goto(noema.origin + '/api/health');
    const outcome = await page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          const request = indexedDB.open('noema-local-v1', 1);
          request.onblocked = () => setTimeout(() => resolve('blocked'), 200);
          request.onsuccess = () => resolve('opened');
        }),
    );
    expect(outcome).toBe('blocked');
  });

  test('failFetch injects a network error or an HTTP response for matching requests only', async ({ page, noema }) => {
    await failFetch(page, { path: '/api/health', fault: 'network' });
    await failFetch(page, { path: /^\/api\/state/, method: 'GET', fault: { status: 500, body: 'boom', contentType: 'text/plain' } });
    await page.goto(noema.origin + '/api/health');
    const results = await page.evaluate(async () => {
      const attempt = async (path: string) => {
        try {
          const response = await fetch(path);
          return `${response.status} ${(await response.text()).slice(0, 4)}`;
        } catch (error) {
          return (error as Error).name;
        }
      };
      return [await attempt('/api/health'), await attempt('/api/health'), await attempt('/api/state?minutes=5'), await attempt('/api/state')];
    });
    expect(results).toEqual(['TypeError', '200 {"ok', '500 boom', '401 {"de']);
  });

  test('holdFetch holds a matching request until release', async ({ page, noema }) => {
    const hold = await holdFetch(page, '/api/health');
    await page.goto(noema.origin + '/api/health');
    await page.evaluate(() => {
      const w = window as unknown as HarnessWindow;
      w.pending = fetch('/api/health').then((response) => response.status);
    });
    const early = await page.evaluate(() =>
      Promise.race([(window as unknown as HarnessWindow).pending, new Promise<string>((resolve) => setTimeout(() => resolve('held'), 300))]),
    );
    expect(early).toBe('held');
    await hold.release();
    await hold.released();
    expect(await page.evaluate(() => (window as unknown as HarnessWindow).pending)).toBe(200);
  });

  test('loseAck delivers the request but reports a network failure', async ({ page, noema }) => {
    await loseAck(page, '/api/health');
    await page.goto(noema.origin + '/api/health');
    const served = page.waitForResponse((response) => response.url().endsWith('/api/health') && response.request().resourceType() === 'fetch');
    const outcome = await page.evaluate(async () => {
      try {
        await fetch('/api/health');
        return 'acknowledged';
      } catch (error) {
        return (error as Error).name;
      }
    });
    expect(outcome).toBe('TypeError');
    expect((await served).status()).toBe(200);
    expect(await page.evaluate(async () => (await fetch('/api/health')).status)).toBe(200);
  });

  test('stubIpc records close approvals posted to the Electron bridge', async ({ page, noema }) => {
    await stubIpc(page);
    await page.goto(noema.origin + '/api/health');
    await page.evaluate(() => window.ipc?.postMessage('noema:close-approved'));
    expect(await page.evaluate(() => (window as unknown as HarnessWindow).__ipcMessages)).toEqual(['noema:close-approved']);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm --prefix web run e2e -- e2e/harness.spec.ts`
Expected: FAIL — `Error: Cannot find module '/home/p4nic/code/noema/web/e2e/faults' imported from /home/p4nic/code/noema/web/e2e/harness.spec.ts` and `Error: No tests found.`

- [ ] **Step 3: Create `web/e2e/faults.ts`**

```ts
import type { Page } from '@playwright/test';

type PathPattern = { source: string; flags: string | null };
type FetchAction =
  | { kind: 'network' }
  | { kind: 'status'; status: number; body: string; contentType: string }
  | { kind: 'hold'; id: number }
  | { kind: 'lose-ack' };
type FetchRule = { path: PathPattern; method: string | null; times: number; action: FetchAction };
type FaultWindow = Window & {
  __noemaFetchRules?: FetchRule[];
  __noemaHoldGates?: Record<number, Promise<void>>;
  __noemaHoldRelease?: Record<number, () => void>;
  __ipcMessages?: string[];
} & Record<string, unknown>;

let holdCounter = 0;

function pattern(path: string | RegExp): PathPattern {
  return typeof path === 'string' ? { source: path, flags: null } : { source: path.source, flags: path.flags };
}

// One fetch patch per document; every helper only appends a rule, so all fetch faults share one matcher.
async function addFetchRule(page: Page, rule: FetchRule): Promise<void> {
  await page.addInitScript((rule: FetchRule) => {
    const w = window as unknown as FaultWindow;
    if (!w.__noemaFetchRules) {
      const rules: FetchRule[] = [];
      w.__noemaFetchRules = rules;
      const original = window.fetch.bind(window);
      const matches = (r: FetchRule, url: URL, method: string) =>
        r.times > 0 &&
        (r.method === null || r.method === method) &&
        (r.path.flags === null ? url.pathname === r.path.source : new RegExp(r.path.source, r.path.flags).test(url.pathname + url.search));
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const request = input instanceof Request ? input : null;
        const url = new URL(request ? request.url : String(input), location.href);
        const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
        const match = rules.find((r) => matches(r, url, method));
        if (!match) return original(input, init);
        match.times -= 1;
        const action = match.action;
        if (action.kind === 'network') throw new TypeError('Failed to fetch');
        if (action.kind === 'status') {
          const body = [204, 205, 304].includes(action.status) ? null : action.body;
          return new Response(body, { status: action.status, headers: { 'content-type': action.contentType } });
        }
        if (action.kind === 'lose-ack') {
          await original(input, init);
          throw new TypeError('Failed to fetch');
        }
        await w.__noemaHoldGates?.[action.id];
        try {
          return await original(input, init);
        } finally {
          (w[`__noemaHoldSettled${action.id}`] as () => void)();
        }
      };
    }
    w.__noemaFetchRules.push(rule);
  }, rule);
}

export async function failFetch(
  page: Page,
  options: { path: string | RegExp; method?: string; times?: number; fault: 'network' | { status: number; body?: string; contentType?: string } },
): Promise<void> {
  const action: FetchAction =
    options.fault === 'network'
      ? { kind: 'network' }
      : { kind: 'status', status: options.fault.status, body: options.fault.body ?? '', contentType: options.fault.contentType ?? 'text/plain' };
  await addFetchRule(page, { path: pattern(options.path), method: options.method?.toUpperCase() ?? null, times: options.times ?? 1, action });
}

export async function holdFetch(page: Page, path: string | RegExp): Promise<{ released(): Promise<void>; release(): Promise<void> }> {
  const id = ++holdCounter;
  let settle!: () => void;
  const settled = new Promise<void>((resolve) => {
    settle = resolve;
  });
  await page.exposeFunction(`__noemaHoldSettled${id}`, () => settle());
  await page.addInitScript((id: number) => {
    const w = window as unknown as FaultWindow;
    w.__noemaHoldGates ??= {};
    w.__noemaHoldRelease ??= {};
    w.__noemaHoldGates[id] = new Promise<void>((resolve) => {
      w.__noemaHoldRelease![id] = resolve;
    });
  }, id);
  await addFetchRule(page, { path: pattern(path), method: null, times: 1, action: { kind: 'hold', id } });
  return {
    released: () => settled,
    release: async () => {
      await page.evaluate((id) => (window as unknown as FaultWindow).__noemaHoldRelease?.[id]?.(), id);
    },
  };
}

export async function loseAck(page: Page, path: string | RegExp, times = 1): Promise<void> {
  await addFetchRule(page, { path: pattern(path), method: null, times, action: { kind: 'lose-ack' } });
}

export async function failIdbWrite(
  page: Page,
  options: { store: 'kv' | 'outbox'; key?: string; times?: number; error: 'QuotaExceededError' | 'AbortError' },
): Promise<void> {
  await page.addInitScript(({ store, key, times, error }) => {
    let remaining = times;
    const proto = IDBObjectStore.prototype as unknown as Record<string, (...args: unknown[]) => IDBRequest>;
    for (const method of ['put', 'add', 'delete']) {
      const original = proto[method];
      proto[method] = function (this: IDBObjectStore, ...args: unknown[]) {
        const request = original.apply(this, args);
        const target =
          method === 'delete' ? args[0] : typeof this.keyPath === 'string' ? (args[0] as Record<string, unknown> | null)?.[this.keyPath] : args[1];
        if (this.name === store && (key === undefined || target === key) && remaining > 0) {
          remaining -= 1;
          const tx = this.transaction;
          // A real quota failure aborts after the request is queued, with the error on the transaction.
          Object.defineProperty(tx, 'error', { configurable: true, get: () => new DOMException(`Injected ${error}`, error) });
          queueMicrotask(() => {
            try {
              tx.abort();
            } catch {
              // already finished
            }
          });
        }
        return request;
      };
    }
  }, { store: options.store, key: options.key, times: options.times ?? 1, error: options.error });
}

export async function delayIdbTransactions(page: Page, ms: number): Promise<void> {
  await page.addInitScript((ms: number) => {
    const original = IDBDatabase.prototype.transaction as (...args: unknown[]) => IDBTransaction;
    (IDBDatabase.prototype as unknown as { transaction: (...args: unknown[]) => IDBTransaction }).transaction = function (this: IDBDatabase, ...args: unknown[]) {
      const tx = original.apply(this, args);
      let handler: ((this: IDBTransaction, event: Event) => unknown) | null = null;
      // Shadow the prototype's oncomplete so the app's handler runs late; addEventListener('complete') users are not delayed.
      Object.defineProperty(tx, 'oncomplete', { configurable: true, get: () => handler, set: (value) => { handler = value; } });
      tx.addEventListener('complete', (event) => {
        setTimeout(() => handler?.call(tx, event), ms);
      });
      return tx;
    };
  }, ms);
}

export async function blockIdbOpen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (this: IDBFactory, name: string, version?: number) {
      if (name !== 'noema-local-v1') return original.call(this, name, version);
      const request = Object.assign(new EventTarget(), {
        onblocked: null as ((this: unknown, event: Event) => unknown) | null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        result: undefined,
        error: null,
        readyState: 'pending',
      });
      setTimeout(() => {
        const event = new Event('blocked');
        request.dispatchEvent(event);
        request.onblocked?.call(request, event);
      }, 0);
      return request as unknown as IDBOpenDBRequest;
    };
  });
}

export async function stubIpc(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as FaultWindow;
    w.__ipcMessages = [];
    w.ipc = {
      postMessage(message) {
        w.__ipcMessages!.push(message);
      },
    };
  });
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npm --prefix web run typecheck && npm --prefix web run e2e -- e2e/harness.spec.ts`
Expected: `tsc` exits 0; PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add web/e2e/faults.ts web/e2e/harness.spec.ts
git commit -m "test(web): add addInitScript fault injection for IndexedDB, fetch and IPC"
```

---

### Task 10: Service worker fetch strategy and Phase-1 service-worker E2E (spec §6.2 fetch, §8 Service worker)

**Files:**
- Modify: `web/public/sw.js` (append the `fetch` handler after the `activate` listener)
- Create: `web/e2e/v1/sw.js` (verbatim copy of `public/sw.js`, which P6 deletes)
- Test: `web/e2e/sw.spec.ts`

**Interfaces:**
- Consumes: `startNoema({ port, distDir })`, `getFreePort`, `REPO`, `WEB_DIST` (Task 8); `scripts/sw-precache.mjs` (Task 4); built `web/dist` (Task 5).
- Produces: the complete §6.2 worker. Test titles: "Real loopback navigation and native service worker control" (parity row, `native_storage_check.py:156`), "offline cold boot serves every route, every precached file and loaded fonts", "a 5xx navigation falls back to the cached shell", "two consecutive builds purge the older shell cache", "takes over a page controlled by the v1 service worker and deletes noema-shell-v1". The route loop uses the five P3 route hashes, so the same test covers the lazily loaded `NoteView` chunk once P3 exists; the precache fetch loop already covers every chunk.

- [ ] **Step 1: Copy the v1 worker fixture**

```bash
cd /home/p4nic/code/noema
mkdir -p web/e2e/v1 && cp public/sw.js web/e2e/v1/sw.js && cmp public/sw.js web/e2e/v1/sw.js && echo identical
```
Expected: `identical`.

- [ ] **Step 2: Write the tests `web/e2e/sw.spec.ts`**

```ts
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { getFreePort, REPO, startNoema, WEB_DIST } from './server';

const ROUTES = ['#/overview', '#/capture', '#/notes', '#/note/offline-check', '#/plan'];
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3l0AAAAASUVORK5CYII=';

function readPrecache(dist: string): { cache: string; urls: string[] } {
  const header = readFileSync(join(dist, 'sw.js'), 'utf8').split('\n', 1)[0];
  const match = /^const CACHE="(noema-shell-[0-9a-f]{12})";const PRECACHE=(\[.*\]);$/.exec(header);
  if (!match) throw new Error(`${dist}/sw.js has no precache header; run npm --prefix web run build`);
  return { cache: match[1], urls: JSON.parse(match[2]) as string[] };
}

function copyDist(): string {
  const dist = mkdtempSync(join(tmpdir(), 'noema-dist-'));
  cpSync(WEB_DIST, dist, { recursive: true });
  return dist;
}

async function waitForController(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
}

async function shellVisible(page: Page): Promise<void> {
  await expect(page.locator('#root [data-quiet]').first()).toBeVisible();
}

function serveV1(port: number): Promise<Server> {
  const files: Record<string, [string | Buffer, string]> = {
    '/': ['<!doctype html><title>Noema v1</title><main data-quiet><h1>v1</h1></main><script type="module" src="/static/app.js"></script>', 'text/html'],
    '/sw.js': [readFileSync(join(REPO, 'web/e2e/v1/sw.js')), 'application/javascript'],
    '/static/app.js': ["navigator.serviceWorker.register('/sw.js');", 'application/javascript'],
    '/static/styles.css': ['', 'text/css'],
    '/static/icon.svg': ['<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml'],
    '/static/cat.png': [Buffer.from(PNG_1PX, 'base64'), 'image/png'],
    '/static/manifest.webmanifest': ['{}', 'application/manifest+json'],
  };
  const server = createServer((request, response) => {
    const file = files[new URL(request.url ?? '/', 'http://v1.invalid').pathname];
    if (!file) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-cache' }).end(file[0]);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

test('Real loopback navigation and native service worker control', async ({ page, noema }) => {
  const { cache, urls } = readPrecache(WEB_DIST);
  expect(urls).toEqual(expect.arrayContaining(['/', '/manifest.webmanifest', '/icon.svg']));
  expect(urls.some((url) => /^\/assets\/.+\.js$/.test(url))).toBe(true);
  expect(urls.some((url) => /^\/assets\/.+\.css$/.test(url))).toBe(true);
  expect(urls.filter((url) => url.endsWith('.otf'))).toHaveLength(4);
  expect(urls).not.toContain('/sw.js');
  expect(urls).not.toContain('/index.html');
  await page.goto(noema.origin + '/');
  await waitForController(page);
  expect(await page.evaluate(() => caches.keys())).toEqual([cache]);
  const cached = await page.evaluate(async (name) => (await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname).sort(), cache);
  expect(cached).toEqual([...urls].sort());
});

test('offline cold boot serves every route, every precached file and loaded fonts', async ({ noema }, testInfo) => {
  const { urls } = readPrecache(WEB_DIST);
  const profile = testInfo.outputPath('profile');
  const warm = await chromium.launchPersistentContext(profile);
  const first = await warm.newPage();
  await first.goto(noema.origin + '/');
  await waitForController(first);
  await warm.close();
  await noema.kill();

  const cold = await chromium.launchPersistentContext(profile);
  try {
    for (const hash of ROUTES) {
      const page = await cold.newPage();
      await page.goto(`${noema.origin}/${hash}`);
      await shellVisible(page);
      await page.close();
    }
    const page = await cold.newPage();
    await page.goto(noema.origin + '/');
    const chunks = urls.filter((url) => url.startsWith('/assets/')); // every JS chunk (lazy ones included), CSS and font
    const statuses = await page.evaluate(async (list) => Promise.all(list.map(async (url) => (await fetch(url)).status)), chunks);
    expect(statuses).toEqual(chunks.map(() => 200));
    const fontsReady = await page.evaluate(async () => {
      const fonts = ['16px Inter', '500 16px Inter', '16px Display', 'italic 16px Display'];
      await Promise.all(fonts.map((font) => document.fonts.load(font)));
      return fonts.every((font) => document.fonts.check(font));
    });
    expect(fontsReady).toBe(true);
    const api = await page.evaluate(async () => {
      try {
        await fetch('/api/health');
        return 'answered';
      } catch {
        return 'network-error';
      }
    });
    expect(api).toBe('network-error'); // /api/ is never answered from the cache
  } finally {
    await cold.close();
  }
});

test('a 5xx navigation falls back to the cached shell', async ({ page }) => {
  const dist = copyDist();
  const noema = await startNoema({ distDir: dist });
  try {
    await page.goto(noema.origin + '/');
    await waitForController(page);
    rmSync(join(dist, 'index.html'));
    expect(await page.evaluate(async () => (await fetch('/')).status)).toBe(503); // non-navigation fetches pass through
    const response = await page.reload();
    expect(response?.status()).toBe(200);
    await shellVisible(page);
  } finally {
    await noema.stop();
    rmSync(dist, { recursive: true, force: true });
  }
});

test('two consecutive builds purge the older shell cache', async ({ page }) => {
  const dist = copyDist();
  const noema = await startNoema({ distDir: dist });
  try {
    const before = readPrecache(dist);
    await page.goto(noema.origin + '/');
    await waitForController(page);
    expect(await page.evaluate(() => caches.keys())).toEqual([before.cache]);

    writeFileSync(join(dist, 'assets', 'extra-AbCd1234.js'), 'export const build = 2;');
    copyFileSync(join(REPO, 'web/public/sw.js'), join(dist, 'sw.js'));
    execFileSync(process.execPath, ['scripts/sw-precache.mjs', dist], { cwd: join(REPO, 'web') });
    const after = readPrecache(dist);
    expect(after.cache).not.toBe(before.cache);

    await page.reload();
    await expect.poll(() => page.evaluate(() => caches.keys()), { timeout: 20_000 }).toEqual([after.cache]);
  } finally {
    await noema.stop();
    rmSync(dist, { recursive: true, force: true });
  }
});

test('takes over a page controlled by the v1 service worker and deletes noema-shell-v1', async ({ page }) => {
  const { cache } = readPrecache(WEB_DIST);
  const port = await getFreePort();
  const v1 = await serveV1(port);
  let v1Open = true;
  const closeV1 = () =>
    new Promise<void>((resolve) => {
      v1.closeAllConnections();
      v1.close(() => resolve());
    });
  try {
    await page.goto(`http://127.0.0.1:${port}/`);
    await waitForController(page);
    await expect.poll(() => page.evaluate(() => caches.keys())).toContain('noema-shell-v1');
    await closeV1();
    v1Open = false;

    const noema = await startNoema({ port });
    try {
      await page.reload();
      await expect.poll(() => page.evaluate(() => caches.keys()), { timeout: 20_000 }).toEqual([cache]);
      await page.reload();
      await shellVisible(page);
      expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(`${noema.origin}/sw.js`);
    } finally {
      await noema.stop();
    }
  } finally {
    if (v1Open) await closeV1();
  }
});
```

- [ ] **Step 3: Run them to verify the offline and 5xx tests fail**

Run: `npm --prefix web run build && npm --prefix web run e2e -- e2e/sw.spec.ts`
Expected: 3 PASS (control, two builds, v1 takeover — install/activate exist since Task 5) and 2 FAIL: "offline cold boot…" with `page.goto: net::ERR_CONNECTION_REFUSED`, and "a 5xx navigation falls back…" with `expect(received).toBe(expected) Expected: 200 Received: 503`.

- [ ] **Step 4: Append the fetch strategy to `web/public/sw.js`**

```js
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') event.respondWith(navigate(request));
  else if (url.pathname.startsWith('/assets/')) event.respondWith(asset(request));
});

async function asset(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function navigate(request) {
  let response = null;
  try {
    response = await fetch(request);
    if (response.status < 500) return response;
  } catch {
    // Server unreachable: fall through to the cached shell.
  }
  const shell = await caches.match('/', { cacheName: CACHE });
  return shell ?? response ?? Response.error();
}
```

- [ ] **Step 5: Rebuild and run the service-worker tests to verify they pass**

Run: `npm --prefix web run build && npm --prefix web run e2e -- e2e/sw.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Run every Phase-1 gate**

```bash
cd /home/p4nic/code/noema
npm --prefix web ci && npm --prefix web run build && npm --prefix web test && npm --prefix web run e2e && .venv/bin/python -m pytest
git status --short --untracked-files=no
```
Expected: `ci` succeeds from the lockfile; build passes (`check-hashes` silent); Vitest PASS (21 tests); Playwright PASS (18 tests: serving 4, harness 9, sw 5) with no CSP violation or page error; pytest as in Task 6 Step 5 plus `test_display_name_setting`; `git status` shows only the `web/public/sw.js` change and the two new files before this commit (`web/dist`, `web/node_modules`, `web/test-results` are ignored).

- [ ] **Step 7: Commit**

```bash
git add web/public/sw.js web/e2e/v1/sw.js web/e2e/sw.spec.ts
git commit -m "feat(web): serve assets cache-first and navigations with a cached-shell fallback"
```

---

### Task 11: Connection state and the replay-policy table (spec §4.3 Connection, Replay policy; contract §3.2, §4.5)

**Files:**
- Create: `web/src/domain/connection.ts`, `web/src/api/endpoints.ts`
- Test: `web/src/domain/connection.test.ts`, `web/src/api/endpoints.test.ts`

**Interfaces:**
- Consumes: `SERVICE_DOWN` (Task 2, `web/src/events.ts`).
- Produces (contract §4.5, §3.2, exact):
  ```ts
  export type ConnectionEvent = 'state-success' | 'state-failure' | 'network-error' | 'offline' | 'service-down';
  export function nextConnected(current: boolean, event: ConnectionEvent): boolean;
  export const connection: { get(): boolean; report(event: ConnectionEvent): void; subscribe(listener: () => void): () => void };
  export function useConnected(): boolean;
  export function installConnectionListeners(win?: Window): () => void;
  export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  export type Replay = 'read' | 'idempotent-by-key' | 'once-per-action';
  export type EndpointSpec = { readonly method: Method; readonly path: `/${string}`; readonly replay: Replay };
  export const ENDPOINTS: { /* the 26 keys of contract §3.2 */ };
  export type EndpointKey = keyof typeof ENDPOINTS;
  export function endpointPath(key: EndpointKey, params?: Record<string, string | number>, query?: Record<string, string | number | undefined>): `/${string}`;
  ```
  The fetch-only-in-client check excludes `*.test.ts(x)` files and `src/test/` (test code stubs `fetch`; contract §3.1 is about app code).

- [ ] **Step 1: Write the failing connection test `web/src/domain/connection.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SERVICE_DOWN } from '../events';
import { connection, installConnectionListeners, nextConnected, type ConnectionEvent } from './connection';

afterEach(() => connection.report('offline'));

describe('nextConnected', () => {
  it('is true only after a successful state fetch, whatever the current value', () => {
    const events: ConnectionEvent[] = ['state-success', 'state-failure', 'network-error', 'offline', 'service-down'];
    for (const current of [true, false]) {
      expect(events.map((event) => nextConnected(current, event))).toEqual([true, false, false, false, false]);
    }
  });
});

describe('connection', () => {
  it('starts disconnected and notifies subscribers only when the value changes', () => {
    expect(connection.get()).toBe(false);
    const listener = vi.fn();
    const unsubscribe = connection.subscribe(listener);
    connection.report('state-success');
    connection.report('state-success');
    expect(connection.get()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    connection.report('network-error');
    expect(connection.get()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    connection.report('state-success');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('drops to disconnected on offline and on the desktop service-down event, but online alone never reconnects', () => {
    const win = new EventTarget() as unknown as Window;
    const uninstall = installConnectionListeners(win);
    connection.report('state-success');
    win.dispatchEvent(new Event('offline'));
    expect(connection.get()).toBe(false);
    win.dispatchEvent(new Event('online'));
    expect(connection.get()).toBe(false);
    connection.report('state-success');
    win.dispatchEvent(new Event(SERVICE_DOWN));
    expect(connection.get()).toBe(false);
    uninstall();
    connection.report('state-success');
    win.dispatchEvent(new Event('offline'));
    expect(connection.get()).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/domain/connection.test.ts`
Expected: FAIL — `Error: Cannot find module './connection' imported from /home/p4nic/code/noema/web/src/domain/connection.test.ts`.

- [ ] **Step 3: Create `web/src/domain/connection.ts`**

```ts
// `connected` is true only after the most recent GET /api/state succeeded (spec §4.3).
import { useSyncExternalStore } from 'react';
import { SERVICE_DOWN } from '../events';

export type ConnectionEvent = 'state-success' | 'state-failure' | 'network-error' | 'offline' | 'service-down';

export function nextConnected(_current: boolean, event: ConnectionEvent): boolean {
  return event === 'state-success';
}

let connected = false;
const listeners = new Set<() => void>();

export const connection = {
  get(): boolean {
    return connected;
  },
  report(event: ConnectionEvent): void {
    const next = nextConnected(connected, event);
    if (next === connected) return;
    connected = next;
    for (const listener of [...listeners]) listener();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useConnected(): boolean {
  return useSyncExternalStore(connection.subscribe, connection.get, connection.get);
}

// 'online' deliberately does not set connected: only a successful state fetch does.
export function installConnectionListeners(win: Window = window): () => void {
  const offline = () => connection.report('offline');
  const serviceDown = () => connection.report('service-down');
  win.addEventListener('offline', offline);
  win.addEventListener(SERVICE_DOWN, serviceDown);
  return () => {
    win.removeEventListener('offline', offline);
    win.removeEventListener(SERVICE_DOWN, serviceDown);
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- src/domain/connection.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing replay-policy test `web/src/api/endpoints.test.ts`**

The once-per-action list is spec §4.3 verbatim; path parameters are normalised (`{id}`/`:id` → `{}`) so the comparison is exact on method and shape.

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ENDPOINTS, endpointPath, type Replay } from './endpoints';

const SRC = fileURLToPath(new URL('..', import.meta.url));
// Spec §4.3 "Every other UI mutation is sent once per user action", verbatim (POST/DELETE pairs expanded).
const SPEC_ONCE_PER_ACTION = [
  'POST /api/focus', 'PUT /api/tasks/{id}', 'PUT /api/notes/{id}', 'POST /api/notes/{id}/restore/{v}',
  'POST /api/notes/{id}/suggestions/{sid}/apply', 'POST /api/notes/{id}/organize', 'POST /api/notes/{id}/transcribe',
  'POST /api/reminders', 'POST /api/reminders/{id}/snooze', 'DELETE /api/reminders/{id}', 'POST /api/runs/{id}/end-tracking',
  'PATCH /api/settings', 'POST /api/context/rules', 'DELETE /api/context/rules/{id}',
  'POST /api/tokens', 'DELETE /api/tokens/{id}', 'POST /api/session', 'DELETE /api/session',
];
const normalise = (route: string) => route.replace(/\{\w+\}|:\w+/g, '{}');

function routes(replay: Replay): string[] {
  return Object.values(ENDPOINTS)
    .filter((spec) => spec.replay === replay)
    .map((spec) => normalise(`${spec.method} /api${spec.path}`))
    .sort();
}

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? sources(join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(dir, entry.name)] : [],
  );
}

describe('replay policy (spec §4.3)', () => {
  it('sends exactly the spec list once per user action', () => {
    expect(routes('once-per-action')).toEqual(SPEC_ONCE_PER_ACTION.map(normalise).sort());
  });

  it('replays only the two capture endpoints, by key', () => {
    expect(routes('idempotent-by-key')).toEqual(['POST /api/captures', 'POST /api/task-captures']);
  });

  it('calls fetch( only from api/client.ts (tests excluded)', () => {
    const offenders = sources(SRC)
      .map((file) => relative(SRC, file))
      .filter((file) => file !== join('api', 'client.ts') && !/\.test\.tsx?$/.test(file) && !file.startsWith('test/'))
      .filter((file) => /\bfetch\(/.test(readFileSync(join(SRC, file), 'utf8')));
    expect(offenders).toEqual([]);
  });
});

describe('endpointPath', () => {
  it('encodes path parameters and appends defined query values', () => {
    expect(endpointPath('noteRestore', { id: 'a/b', version: 3 })).toBe('/notes/a%2Fb/restore/3');
    expect(endpointPath('state', {}, { minutes: 30 })).toBe('/state?minutes=30');
    expect(endpointPath('state', {}, { minutes: undefined })).toBe('/state');
    expect(endpointPath('search', {}, { q: 'heap & tcache' })).toBe('/search?q=heap+%26+tcache');
  });

  it('refuses a missing path parameter instead of sending a wrong URL', () => {
    expect(() => endpointPath('task')).toThrow('Missing path parameter id');
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm --prefix web test -- src/api/endpoints.test.ts`
Expected: FAIL — `Error: Cannot find module './endpoints' imported from /home/p4nic/code/noema/web/src/api/endpoints.test.ts`.

- [ ] **Step 7: Create `web/src/api/endpoints.ts`**

```ts
// Replay-policy table (spec §4.3, contract §3.2). Every UI request goes through one of these keys.
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Replay = 'read' | 'idempotent-by-key' | 'once-per-action';
export type EndpointSpec = { readonly method: Method; readonly path: `/${string}`; readonly replay: Replay };

export const ENDPOINTS = {
  state: { method: 'GET', path: '/state', replay: 'read' },
  task: { method: 'GET', path: '/tasks/:id', replay: 'read' },
  search: { method: 'GET', path: '/search', replay: 'read' },
  note: { method: 'GET', path: '/notes/:id', replay: 'read' },
  noteHistory: { method: 'GET', path: '/notes/:id/history', replay: 'read' },
  tokens: { method: 'GET', path: '/tokens', replay: 'read' },
  capture: { method: 'POST', path: '/captures', replay: 'idempotent-by-key' },
  taskCapture: { method: 'POST', path: '/task-captures', replay: 'idempotent-by-key' },
  focus: { method: 'POST', path: '/focus', replay: 'once-per-action' },
  taskUpdate: { method: 'PUT', path: '/tasks/:id', replay: 'once-per-action' },
  noteUpdate: { method: 'PUT', path: '/notes/:id', replay: 'once-per-action' },
  noteRestore: { method: 'POST', path: '/notes/:id/restore/:version', replay: 'once-per-action' },
  noteApplySuggestion: { method: 'POST', path: '/notes/:id/suggestions/:sid/apply', replay: 'once-per-action' },
  noteOrganize: { method: 'POST', path: '/notes/:id/organize', replay: 'once-per-action' },
  noteTranscribe: { method: 'POST', path: '/notes/:id/transcribe', replay: 'once-per-action' },
  reminderCreate: { method: 'POST', path: '/reminders', replay: 'once-per-action' },
  reminderSnooze: { method: 'POST', path: '/reminders/:id/snooze', replay: 'once-per-action' },
  reminderDismiss: { method: 'DELETE', path: '/reminders/:id', replay: 'once-per-action' },
  runEndTracking: { method: 'POST', path: '/runs/:id/end-tracking', replay: 'once-per-action' },
  settingsUpdate: { method: 'PATCH', path: '/settings', replay: 'once-per-action' },
  ruleCreate: { method: 'POST', path: '/context/rules', replay: 'once-per-action' },
  ruleDelete: { method: 'DELETE', path: '/context/rules/:id', replay: 'once-per-action' },
  tokenCreate: { method: 'POST', path: '/tokens', replay: 'once-per-action' },
  tokenRevoke: { method: 'DELETE', path: '/tokens/:id', replay: 'once-per-action' },
  sessionCreate: { method: 'POST', path: '/session', replay: 'once-per-action' },
  sessionDelete: { method: 'DELETE', path: '/session', replay: 'once-per-action' },
} as const satisfies Record<string, EndpointSpec>;

export type EndpointKey = keyof typeof ENDPOINTS;

export function endpointPath(
  key: EndpointKey,
  params: Record<string, string | number> = {},
  query: Record<string, string | number | undefined> = {},
): `/${string}` {
  const path = ENDPOINTS[key].path.replace(/:([A-Za-z]+)/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Missing path parameter ${name}`);
    return encodeURIComponent(String(value));
  });
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) if (value !== undefined) search.set(name, String(value));
  const text = search.toString();
  return (text ? `${path}?${text}` : path) as `/${string}`;
}
```

- [ ] **Step 8: Run both tests to verify they pass**

Run: `npm --prefix web test -- src/domain/connection.test.ts src/api/endpoints.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 9: Commit**

```bash
git add web/src/domain/connection.ts web/src/domain/connection.test.ts web/src/api/endpoints.ts web/src/api/endpoints.test.ts
git commit -m "feat(web): add connection state and the replay-policy endpoint table"
```

---

### Task 12: Response schemas and unit fixtures (spec §4.2 "Every response the UI consumes is parsed with a zod schema"; contract §3.3, §4.7)

**Files:**
- Create: `web/src/api/schemas.ts`, `web/src/test/fixtures.ts`
- Test: `web/src/api/schemas.test.ts`, `web/src/test/fixtures.test.ts`

**Interfaces:**
- Consumes: `z` (Task 2); field shapes from `noema/store.py:33-95` (DDL), `:141-147` (`task_row`: `original_input` from a LEFT JOIN, so nullable), `:254-262` (`note`), `:345-351` (reminder), `:419-472` (`snapshot`), `noema/server.py:150-155` (`capabilities`), and the `display_name` setting from Task 7.
- Produces: every schema, exported type and request-body type of contract §3.3 (exact names), and `makeRun`, `makeTask`, `makeNoteSummary`, `makeNote`, `makeSnapshot` (contract §4.7; `makeSnapshot().server_time` is `'2026-10-08T12:00:00+00:00'`, settings are the server defaults including `display_name: ''`).

- [ ] **Step 1: Write the failing tests**

`web/src/api/schemas.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { makeNote, makeSnapshot, makeTask } from '../test/fixtures';
import { NoteSchema, SettingsSchema, SnapshotSchema, TaskSchema } from './schemas';

describe('schemas', () => {
  it('strip unknown keys instead of failing (a newer server may add fields)', () => {
    const parsed = SnapshotSchema.parse({ ...makeSnapshot(), extra: 1, settings: { ...makeSnapshot().settings, future: true } });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed.settings).not.toHaveProperty('future');
  });

  it('never coerce: a numeric string version or a string boolean is an error', () => {
    expect(TaskSchema.safeParse({ ...makeTask('t1'), version: '2' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ ...makeSnapshot().settings, motion: 'true' }).success).toBe(false);
  });

  it('accept a task created without a capture (original_input null) and open interpretation keys', () => {
    expect(TaskSchema.parse({ ...makeTask('t1'), original_input: null, interpretation: { explanation: 'x', rules: ['a'] } }).interpretation).toEqual({ explanation: 'x', rules: ['a'] });
  });

  it('bound the settings the server bounds', () => {
    const settings = makeSnapshot().settings;
    expect(SettingsSchema.safeParse({ ...settings, companion_size: 73 }).success).toBe(false);
    expect(SettingsSchema.safeParse({ ...settings, display_name: 'x'.repeat(61) }).success).toBe(false);
    expect(SettingsSchema.safeParse({ ...settings, display_name: undefined }).success).toBe(false);
  });

  it('accept the note shape store.note returns', () => {
    const note = makeNote('n1', { attachments: [{ id: 'a1', name: 'heap.png', mime: 'image/png', size: 68, offset_seconds: null }] });
    expect(NoteSchema.parse(note)).toEqual(note);
  });
});
```
`web/src/test/fixtures.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { NoteSchema, NoteSummarySchema, SnapshotRunSchema, SnapshotSchema, SnapshotTaskSchema } from '../api/schemas';
import { makeNote, makeNoteSummary, makeRun, makeSnapshot, makeTask } from './fixtures';

describe('unit fixtures', () => {
  it('produce schema-valid records', () => {
    expect(SnapshotRunSchema.parse(makeRun())).toEqual(makeRun());
    expect(SnapshotTaskSchema.parse(makeTask('t1'))).toEqual(makeTask('t1'));
    expect(NoteSummarySchema.parse(makeNoteSummary('n1'))).toEqual(makeNoteSummary('n1'));
    expect(NoteSchema.parse(makeNote('n1'))).toEqual(makeNote('n1'));
    const snapshot = makeSnapshot({ tasks: [makeTask('t1', { runs: [makeRun({ task_id: 't1' })] })], notes: [makeNoteSummary('n1')] });
    expect(SnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  it('defaults display_name to an empty string, like DEFAULT_SETTINGS', () => {
    expect(makeSnapshot().settings.display_name).toBe('');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm --prefix web test -- src/api/schemas.test.ts src/test/fixtures.test.ts`
Expected: FAIL — `Error: Cannot find module '../test/fixtures' imported from /home/p4nic/code/noema/web/src/api/schemas.test.ts` and `Error: Cannot find module '../api/schemas' imported from /home/p4nic/code/noema/web/src/test/fixtures.test.ts`.

- [ ] **Step 3: Create `web/src/api/schemas.ts`**

```ts
// Response schemas (contract §3.3). z.object strips unknown keys; nothing is coerced. Shapes: noema/store.py, noema/server.py.
import { z } from '../zod';

const int = () => z.number().int();

export const TaskStatusSchema = z.enum(['todo', 'active', 'waiting', 'blocked', 'review', 'parked', 'done']);
export const PrioritySchema = z.enum(['auto', 'high', 'medium', 'low']);
export const EffectivePrioritySchema = z.enum(['high', 'medium', 'low']);
export const RunStatusSchema = z.enum(['working', 'needs_input', 'review', 'failed', 'cancelled']);

export const RunSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  agent: z.string(),
  session_url: z.string(),
  status: RunStatusSchema,
  message: z.string(),
  seq: int(),
  created_at: z.string(),
  updated_at: z.string(),
});
// store.py:432-433
export const SnapshotRunSchema = RunSchema.extend({ stale: z.boolean(), effective_status: z.union([RunStatusSchema, z.literal('unknown')]) });

export const ReminderSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  at: z.string(),
  state: z.enum(['scheduled', 'due', 'dismissed']),
  created_at: z.string(),
});
// store.py:351
export const ReminderCreatedSchema = z.object({ id: z.string(), task_id: z.string(), at: z.string(), state: z.literal('scheduled') });

export const InterpretationSchema = z.looseObject({ explanation: z.string().optional(), manual_fields: z.array(z.string()).optional() });

// store.task_row: LEFT JOIN task_captures, so original_input is null for tasks created without a capture.
export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  project: z.string(),
  detail: z.string(),
  next_action: z.string(),
  status: TaskStatusSchema,
  priority: PrioritySchema,
  due_at: z.string().nullable(),
  not_before: z.string().nullable(),
  estimate_minutes: int().nullable(),
  dependencies: z.array(z.string()),
  session_url: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  version: int(),
  planned_on: z.string().nullable(),
  original_input: z.string().nullable(),
  interpretation: InterpretationSchema,
});
// store.py:443-466. priority_source is open: 'automatic' | 'you' today, 'rules' | 'ai' after spec §11.1.
export const SnapshotTaskSchema = TaskSchema.extend({
  runs: z.array(SnapshotRunSchema),
  blocked_by: z.array(z.string()),
  reminders: z.array(ReminderSchema),
  effective_priority: EffectivePrioritySchema,
  priority_reason: z.string(),
  priority_source: z.string(),
  attention_reason: z.string(),
  available: z.boolean(),
  recommendation_reason: z.string().optional(),
});

export const NoteSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  folder: z.string(),
  project: z.string(),
  task_id: z.string().nullable(),
  mode: z.string(),
  processing: z.string(),
  error: z.string(),
  version: int(),
  created_at: z.string(),
  updated_at: z.string(),
});
export const AttachmentSchema = z.object({ id: z.string(), name: z.string(), mime: z.string(), size: int(), offset_seconds: z.number().nullable() });
export const SuggestionSchema = z.object({ id: z.string(), note_id: z.string(), title: z.string(), body: z.string(), folder: z.string(), created_at: z.string() });
export const NoteSchema = NoteSummarySchema.extend({
  raw: z.string(),
  transcript: z.string(),
  body: z.string(),
  attachments: z.array(AttachmentSchema),
  suggestions: z.array(SuggestionSchema),
});
export const RevisionSchema = z.object({
  id: int(),
  note_id: z.string(),
  version: int(),
  title: z.string(),
  body: z.string(),
  folder: z.string(),
  source: z.string(),
  created_at: z.string(),
});

export const FocusSchema = z.object({ task_id: z.string(), pinned: z.boolean(), source: z.string(), updated_at: z.string() }).nullable();
export const ContextSchema = z
  .object({
    device: z.string(),
    app: z.string(),
    title: z.string(),
    workspace: z.string(),
    monitor: z.string(),
    updated_at: z.string(),
    source: z.string(),
    suggested_task_id: z.string().nullable(),
    stale: z.boolean().optional(),
  })
  .nullable();
export const ContextRuleSchema = z.object({ id: z.string(), app: z.string(), contains_text: z.string(), task_id: z.string() });
export const SettingsSchema = z.object({
  observation_enabled: z.boolean(),
  motion: z.boolean(),
  companion: z.enum(['cat', 'dot', 'hidden']),
  companion_size: int().min(24).max(72),
  display_name: z.string().max(60),
});
export const CapabilitiesSchema = z.object({
  organizer: z.boolean(),
  speech: z.boolean(),
  screen_pixels: z.boolean(),
  sync: z.string(),
  model: z.string(),
  speech_model: z.string(),
});
export const SnapshotSchema = z.object({
  tasks: z.array(SnapshotTaskSchema),
  notes: z.array(NoteSummarySchema),
  runs: z.array(SnapshotRunSchema),
  reminders: z.array(ReminderSchema),
  focus: FocusSchema,
  context: ContextSchema,
  context_rules: z.array(ContextRuleSchema),
  settings: SettingsSchema,
  available: z.array(SnapshotTaskSchema),
  attention: z.array(SnapshotTaskSchema),
  up_next: z.array(SnapshotTaskSchema),
  server_time: z.string(),
  capabilities: CapabilitiesSchema,
});
export const TokenSummarySchema = z.object({ id: z.string(), name: z.string(), scope: z.enum(['agent', 'observer']), created_at: z.string() });
export const TokenCreatedSchema = z.object({ id: z.string(), token: z.string(), scope: z.enum(['agent', 'observer']), task_ids: z.array(z.string()) });
export const OkSchema = z.object({ ok: z.literal(true) });

export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type Priority = z.infer<typeof PrioritySchema>;
export type Run = z.infer<typeof RunSchema>;
export type SnapshotRun = z.infer<typeof SnapshotRunSchema>;
export type Reminder = z.infer<typeof ReminderSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type SnapshotTask = z.infer<typeof SnapshotTaskSchema>;
export type NoteSummary = z.infer<typeof NoteSummarySchema>;
export type Note = z.infer<typeof NoteSchema>;
export type Revision = z.infer<typeof RevisionSchema>;
export type Focus = z.infer<typeof FocusSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type TokenSummary = z.infer<typeof TokenSummarySchema>;
export type TokenCreated = z.infer<typeof TokenCreatedSchema>;

// Request bodies.
export type TaskEditable = Pick<
  Task,
  'title' | 'project' | 'detail' | 'next_action' | 'status' | 'priority' | 'due_at' | 'not_before' | 'planned_on' | 'estimate_minutes' | 'dependencies' | 'session_url'
>;
export type TaskUpdateBody = TaskEditable & { expected_version: number };
export type TaskCaptureBody = { capture_id: string; raw: string; local_day: string; details: Partial<TaskEditable> };
export type CapturePayload = { capture_id: string; raw: string; project: ''; task_id: string | null; organize: true };
export type NoteUpdateBody = { title: string; folder: string; body: string; expected_version: number };
export type SettingsPatch = Partial<Pick<Settings, 'observation_enabled' | 'motion' | 'companion' | 'companion_size' | 'display_name'>>;
```

- [ ] **Step 4: Create `web/src/test/fixtures.ts`**

```ts
// Schema-valid unit-test factories (contract §4.7). Values mirror what noema/store.py returns for a fresh workspace.
import type { Note, NoteSummary, Snapshot, SnapshotRun, SnapshotTask } from '../api/schemas';

const STAMP = '2026-10-08T12:00:00+00:00';

export function makeRun(changes: Partial<SnapshotRun> = {}): SnapshotRun {
  return {
    id: 'run-1',
    task_id: 'task-1',
    agent: 'codex',
    session_url: '',
    status: 'working',
    message: 'Started',
    seq: 0,
    created_at: STAMP,
    updated_at: STAMP,
    stale: false,
    effective_status: 'working',
    ...changes,
  };
}

export function makeTask(id: string, changes: Partial<SnapshotTask> = {}): SnapshotTask {
  return {
    id,
    title: `Task ${id}`,
    project: 'Personal',
    detail: '',
    next_action: '',
    status: 'todo',
    priority: 'auto',
    due_at: null,
    not_before: null,
    estimate_minutes: null,
    dependencies: [],
    session_url: '',
    created_at: STAMP,
    updated_at: STAMP,
    version: 1,
    planned_on: null,
    original_input: null,
    interpretation: {},
    runs: [],
    blocked_by: [],
    reminders: [],
    effective_priority: 'medium',
    priority_reason: 'No explicit urgency; neutral default.',
    priority_source: 'automatic',
    attention_reason: '',
    available: false,
    ...changes,
  };
}

export function makeNoteSummary(id: string, changes: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id,
    title: `Note ${id}`,
    folder: 'Inbox',
    project: '',
    task_id: null,
    mode: 'original',
    processing: '',
    error: '',
    version: 1,
    created_at: STAMP,
    updated_at: STAMP,
    ...changes,
  };
}

export function makeNote(id: string, changes: Partial<Note> = {}): Note {
  return { ...makeNoteSummary(id), raw: '', transcript: '', body: '', attachments: [], suggestions: [], ...changes };
}

export function makeSnapshot(changes: Partial<Snapshot> = {}): Snapshot {
  return {
    tasks: [],
    notes: [],
    runs: [],
    reminders: [],
    focus: null,
    context: null,
    context_rules: [],
    settings: { observation_enabled: false, motion: false, companion: 'cat', companion_size: 40, display_name: '' },
    available: [],
    attention: [],
    up_next: [],
    server_time: STAMP,
    capabilities: { organizer: false, speech: false, screen_pixels: false, sync: 'single-server', model: '', speech_model: '' },
    ...changes,
  };
}
```

- [ ] **Step 5: Run them to verify they pass**

Run: `npm --prefix web test -- src/api/schemas.test.ts src/test/fixtures.test.ts && npm --prefix web run typecheck`
Expected: PASS (7 tests); `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/api/schemas.ts web/src/api/schemas.test.ts web/src/test/fixtures.ts web/src/test/fixtures.test.ts
git commit -m "feat(web): add zod response schemas and schema-valid unit fixtures"
```

---

### Task 13: API client and boot sequence (spec §4.2; contract §3.1, §3.4)

**Files:**
- Create: `web/src/api/client.ts`, `web/src/api/session.ts`
- Test: `web/src/api/client.test.ts`, `web/src/api/session.test.ts`

**Interfaces:**
- Consumes: `connection` (Task 11), `ENDPOINTS`, `endpointPath`, `EndpointKey` (Task 11), `S.networkError`, `S.unexpectedResponse` (Task 3), `OkSchema`, `SnapshotSchema`, `Snapshot` (Task 12), `makeSnapshot` (Task 12, tests).
- Produces (contract §3.1, §3.4, exact): `ApiErrorKind`, `ApiError(kind, message, status)`, `normaliseError(status, bodyText)`, `ApiOptions`, `api(path, schema, options?)`, `call(key, schema, options?)`, `onUnauthorized(listener)`; `BootResult`, `fetchSnapshot(minutes)`, `boot()`, `unlock(token)`, `signOut()`. A failure to read the response body counts as a network error, like a rejected `fetch`. A non-`ApiError` failure inside `boot()` (for example an abort) is reported as `unreachable` with `ApiError('network', S.networkError, null)`.

- [ ] **Step 1: Write the failing client test `web/src/api/client.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connection } from '../domain/connection';
import { S } from '../strings';
import { z } from '../zod';
import { ApiError, api, call, normaliseError, onUnauthorized } from './client';

const Ok = z.object({ ok: z.literal(true) });
const fetchMock = vi.fn<typeof fetch>();

function respond(status: number, body: string, contentType = 'application/json') {
  fetchMock.mockResolvedValueOnce(new Response(body === '' ? null : body, { status, headers: { 'content-type': contentType } }));
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

vi.stubGlobal('fetch', fetchMock);
afterEach(() => {
  fetchMock.mockReset();
  connection.report('offline');
});

describe('api', () => {
  it('sends same-origin requests with the marker header and JSON bodies', async () => {
    respond(200, '{"ok":true}');
    await expect(api('/focus', Ok, { method: 'POST', body: { task_id: null } })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/focus', {
      method: 'POST',
      headers: { 'X-Noema-Request': '1', 'Content-Type': 'application/json' },
      body: '{"task_id":null}',
      credentials: 'same-origin',
      signal: undefined,
    });
  });

  it('passes FormData through without a JSON content type', async () => {
    const form = new FormData();
    form.set('payload', '{}');
    respond(200, '{"ok":true}');
    await api('/captures', Ok, { method: 'POST', body: form });
    const init = fetchMock.mock.calls[0][1];
    expect(init?.body).toBe(form);
    expect(init?.headers).toEqual({ 'X-Noema-Request': '1' });
  });

  it('defaults to GET with no body', async () => {
    respond(200, '{"ok":true}');
    await api('/health', Ok);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET', body: undefined, credentials: 'same-origin' });
  });

  it('turns a network failure into ApiError(network) and reports disconnected', async () => {
    connection.report('state-success');
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const error = await failure(api('/state', Ok));
    expect(error).toMatchObject({ kind: 'network', status: null, message: S.networkError });
    expect(connection.get()).toBe(false);
  });

  it('rethrows an abort unchanged', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    fetchMock.mockRejectedValueOnce(abort);
    await expect(api('/search', Ok)).rejects.toBe(abort);
  });

  it('normalises HTTP errors by body shape', async () => {
    respond(409, '{"detail":"This note changed on another screen. Your draft has not been overwritten. Reopen to compare."}');
    expect(await failure(api('/notes/n1', Ok, { method: 'PUT', body: {} }))).toMatchObject({
      kind: 'http',
      status: 409,
      message: 'This note changed on another screen. Your draft has not been overwritten. Reopen to compare.',
    });
    respond(500, 'Internal Server Error', 'text/plain');
    expect(await failure(api('/state', Ok))).toMatchObject({ kind: 'http', status: 500, message: 'Request failed (500)' });
  });

  it('rejects a 2xx body that does not match the schema, and an empty 2xx body', async () => {
    respond(200, '{"ok":"yes"}');
    expect(await failure(api('/state', Ok))).toMatchObject({ kind: 'parse', status: 200, message: S.unexpectedResponse });
    respond(200, '<html>');
    expect(await failure(api('/state', Ok))).toMatchObject({ kind: 'parse', status: 200 });
    respond(204, '');
    expect(await failure(api('/state', Ok))).toMatchObject({ kind: 'parse', status: 204 });
    respond(204, '');
    await expect(api('/state', z.null())).resolves.toBeNull();
  });

  it('notifies 401 listeners, except for /session whose 401 is an inline error', async () => {
    const listener = vi.fn();
    const unsubscribe = onUnauthorized(listener);
    respond(401, '{"detail":"Invalid access token"}');
    expect(await failure(api('/session', Ok, { method: 'POST', body: { token: 'wrong' } }))).toMatchObject({ status: 401, message: 'Invalid access token' });
    expect(listener).not.toHaveBeenCalled();
    respond(401, '{"detail":"Unlock Noema to continue"}');
    await failure(api('/state', Ok));
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    respond(401, '{"detail":"Unlock Noema to continue"}');
    await failure(api('/state', Ok));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('call', () => {
  it('uses the endpoint method, path parameters and query', async () => {
    respond(200, '{"ok":true}');
    await call('reminderSnooze', Ok, { params: { id: 'r 1' }, body: { minutes: 20 } });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/reminders/r%201/snooze');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{"minutes":20}' });
    respond(200, '{"ok":true}');
    await call('state', Ok, { query: { minutes: 45 } });
    expect(fetchMock.mock.calls[1][0]).toBe('/api/state?minutes=45');
  });
});

describe('normaliseError', () => {
  it('uses a detail string as the message', () => {
    expect(normaliseError(404, '{"detail":"Task not found"}')).toBe('Task not found');
  });

  it('joins a detail list of validation messages', () => {
    const body = JSON.stringify({ detail: [{ loc: ['body', 'title'], msg: 'String should have at most 240 characters' }, { loc: ['body'], type: 'missing' }] });
    expect(normaliseError(422, body)).toBe('String should have at most 240 characters; {"loc":["body"],"type":"missing"}');
  });

  it('falls back to the status for non-JSON, empty, detail-less and empty-list bodies', () => {
    for (const text of ['Internal Server Error', '', '{"error":"x"}', '{"detail":[]}', 'null', '{"detail":5}']) {
      expect(normaliseError(502, text), text).toBe('Request failed (502)');
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/api/client.test.ts`
Expected: FAIL — `Error: Cannot find module './client' imported from /home/p4nic/code/noema/web/src/api/client.test.ts`.

- [ ] **Step 3: Create `web/src/api/client.ts`**

```ts
// The only fetch( in src/ (spec §4.2, contract §3.1). Same origin, request marker, body-shape error normalisation, zod-parsed responses.
import { connection } from '../domain/connection';
import { S } from '../strings';
import type { z } from '../zod';
import { ENDPOINTS, endpointPath, type EndpointKey } from './endpoints';

export type ApiErrorKind = 'network' | 'http' | 'parse';

export class ApiError extends Error {
  // status is null only for 'network'.
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function normaliseError(status: number, bodyText: string): string {
  let body: unknown = null;
  try {
    body = JSON.parse(bodyText);
  } catch {
    // Not JSON: fall through to the status message.
  }
  const detail = typeof body === 'object' && body !== null ? (body as { detail?: unknown }).detail : undefined;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map((item: unknown) => {
        const msg = typeof item === 'object' && item !== null ? (item as { msg?: unknown }).msg : undefined;
        return typeof msg === 'string' ? msg : JSON.stringify(item);
      })
      .join('; ');
  }
  return `Request failed (${status})`;
}

export type ApiOptions = { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; signal?: AbortSignal };

const unauthorizedListeners = new Set<() => void>();

export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

export async function api<T>(path: `/${string}`, schema: z.ZodType<T>, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-Noema-Request': '1' };
  let body: BodyInit | undefined;
  if (options.body instanceof FormData) body = options.body;
  else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers['Content-Type'] = 'application/json';
  }
  let status: number;
  let ok: boolean;
  let text: string;
  try {
    const response = await fetch('/api' + path, { method: options.method ?? 'GET', headers, body, credentials: 'same-origin', signal: options.signal });
    status = response.status;
    ok = response.ok;
    text = await response.text(); // the body is read once, as text
  } catch (error) {
    if (isAbort(error)) throw error;
    connection.report('network-error');
    throw new ApiError('network', S.networkError, null);
  }
  if (!ok) {
    // /api/session answers a wrong token with 401; that is an inline field error, never a global Unlock.
    if (status === 401 && !path.startsWith('/session')) for (const listener of [...unauthorizedListeners]) listener();
    throw new ApiError('http', normaliseError(status, text), status);
  }
  try {
    return schema.parse(text === '' ? null : JSON.parse(text));
  } catch {
    throw new ApiError('parse', S.unexpectedResponse, status);
  }
}

export function call<T>(
  key: EndpointKey,
  schema: z.ZodType<T>,
  options: { params?: Record<string, string | number>; query?: Record<string, string | number | undefined>; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  return api(endpointPath(key, options.params, options.query), schema, { method: ENDPOINTS[key].method, body: options.body, signal: options.signal });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- src/api/client.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Write the failing boot test `web/src/api/session.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeSnapshot } from '../test/fixtures';
import { ApiError } from './client';
import { boot, signOut, unlock } from './session';

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);
afterEach(() => fetchMock.mockReset());

const SNAPSHOT = JSON.stringify(makeSnapshot());
function respond(...responses: [number, string][]) {
  for (const [status, body] of responses) fetchMock.mockResolvedValueOnce(new Response(body, { status, headers: { 'content-type': 'application/json' } }));
}
const requests = () => fetchMock.mock.calls.map(([url, init]) => `${init?.method} ${String(url)}${init?.body ? ' ' + String(init.body) : ''}`);

describe('boot', () => {
  it('uses the cookie it already has: one GET, no session call (non-loopback cookie-only client)', async () => {
    respond([200, SNAPSHOT]);
    expect(await boot()).toEqual({ kind: 'ready', snapshot: makeSnapshot() });
    expect(requests()).toEqual(['GET /api/state']);
  });

  it('tries loopback auto-login only after a 401, then fetches the state again', async () => {
    respond([401, '{"detail":"Unlock Noema to continue"}'], [200, '{"ok":true}'], [200, SNAPSHOT]);
    expect((await boot()).kind).toBe('ready');
    expect(requests()).toEqual(['GET /api/state', 'POST /api/session {"token":""}', 'GET /api/state']);
  });

  it('is locked only after a second 401', async () => {
    respond([401, '{"detail":"Unlock Noema to continue"}'], [401, '{"detail":"Invalid access token"}']);
    expect(await boot()).toEqual({ kind: 'locked' });
    respond([401, '{"detail":"Unlock Noema to continue"}'], [200, '{"ok":true}'], [401, '{"detail":"Unlock Noema to continue"}']);
    expect(await boot()).toEqual({ kind: 'locked' });
  });

  it('is unreachable on any other failure, without trying to log in', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const network = await boot();
    expect(network.kind).toBe('unreachable');
    respond([503, 'Service Unavailable']);
    const server = await boot();
    expect(server).toMatchObject({ kind: 'unreachable', error: { kind: 'http', status: 503 } });
    expect(server.kind === 'unreachable' && server.error).toBeInstanceOf(ApiError);
    expect(requests()).toEqual(['GET /api/state', 'GET /api/state']);
  });
});

describe('unlock and signOut', () => {
  it('post the token and surface a wrong token as an ApiError for an inline message', async () => {
    respond([401, '{"detail":"Invalid access token"}']);
    await expect(unlock('wrong-token')).rejects.toMatchObject({ kind: 'http', status: 401, message: 'Invalid access token' });
    respond([200, '{"ok":true}'], [200, '{"ok":true}']);
    await unlock('right-token');
    await signOut();
    expect(requests()).toEqual(['POST /api/session {"token":"wrong-token"}', 'POST /api/session {"token":"right-token"}', 'DELETE /api/session']);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm --prefix web test -- src/api/session.test.ts`
Expected: FAIL — `Error: Cannot find module './session' imported from /home/p4nic/code/noema/web/src/api/session.test.ts`.

- [ ] **Step 7: Create `web/src/api/session.ts`**

```ts
// Boot order (spec §4.2): GET /api/state; only on a 401, loopback auto-login; only on a second 401, Unlock.
import { S } from '../strings';
import { ApiError, call } from './client';
import { OkSchema, SnapshotSchema, type Snapshot } from './schemas';

export type BootResult = { kind: 'ready'; snapshot: Snapshot } | { kind: 'locked' } | { kind: 'unreachable'; error: ApiError };

export function fetchSnapshot(minutes: number | null): Promise<Snapshot> {
  return call('state', SnapshotSchema, { query: { minutes: minutes ?? undefined } });
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'http' && error.status === 401;
}

function unreachable(error: unknown): BootResult {
  return { kind: 'unreachable', error: error instanceof ApiError ? error : new ApiError('network', S.networkError, null) };
}

export async function boot(): Promise<BootResult> {
  try {
    return { kind: 'ready', snapshot: await fetchSnapshot(null) };
  } catch (error) {
    if (!isUnauthorized(error)) return unreachable(error);
  }
  try {
    await call('sessionCreate', OkSchema, { body: { token: '' } });
    return { kind: 'ready', snapshot: await fetchSnapshot(null) };
  } catch (error) {
    return isUnauthorized(error) ? { kind: 'locked' } : unreachable(error);
  }
}

export async function unlock(token: string): Promise<void> {
  await call('sessionCreate', OkSchema, { body: { token } });
}

export async function signOut(): Promise<void> {
  await call('sessionDelete', OkSchema);
}
```

- [ ] **Step 8: Run both to verify they pass**

Run: `npm --prefix web test -- src/api && npm --prefix web run typecheck`
Expected: PASS (27 tests in `src/api`: client 12, endpoints 5, schemas 5, session 5); `tsc` exits 0.

- [ ] **Step 9: Commit**

```bash
git add web/src/api/client.ts web/src/api/client.test.ts web/src/api/session.ts web/src/api/session.test.ts
git commit -m "feat(web): add the same-origin API client and the boot sequence"
```

---

### Task 14: IndexedDB layer and attachment limits (spec §4.4 Database, Invariants, Validation before queueing; contract §4.1, §4.2)

**Files:**
- Create: `web/src/local/db.ts`, `web/src/local/limits.ts`
- Test: `web/src/local/db.test.ts`, `web/src/local/limits.test.ts`

**Interfaces:**
- Consumes: `S.closeOtherTabs`, `S.tooManyFiles`, `S.fileTooLarge`, `S.unsupportedType`, `S.totalTooLarge` (Task 3); `TaskEditable` (Task 12).
- Produces: everything in contract §4.1 and §4.2 (exact names and types), plus two local additions: `onOutboxWrite(listener): () => void` (called after every committed readwrite transaction that includes `outbox`; `local/outbox.ts` uses it to refresh its count after every outbox change without an import cycle with `drafts.ts`), and `uid()` falls back to 32 random hex characters when `crypto.randomUUID` is missing, as `public/app.js:5` does (a plain-HTTP LAN origin is not a secure context). Two deliberate refinements of `app.js:51-60`: `transaction` rejects a request error with that request's own error (`tx.error` is still null when the error event reaches the transaction, so `app.js` rejected with `null`), and `isTaskDraft` accepts a stored task draft without `pending` (read as `null` by Task 16) so an older draft is recovered instead of overwritten.

- [ ] **Step 1: Write the failing database test `web/src/local/db.test.ts`**

Each test gets a fresh `IDBFactory` and a fresh module instance (contract §9), so the cached connection never leaks between tests.

```ts
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { S } from '../strings';

type Db = typeof import('./db');
let db: Db;

beforeEach(async () => {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory() as unknown as typeof globalThis.indexedDB;
  db = await import('./db');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const blob = (text: string, type = 'image/png') => new Blob([text], { type });

describe('openDb', () => {
  it('opens noema-local-v1 version 1 with the public/app.js stores and caches the connection', async () => {
    const first = await db.openDb();
    expect(first.name).toBe('noema-local-v1');
    expect(first.version).toBe(1);
    expect([...first.objectStoreNames].sort()).toEqual(['kv', 'outbox']);
    expect(first.transaction('outbox').objectStore('outbox').keyPath).toBe('id');
    expect(await db.openDb()).toBe(first);
  });

  it('Failed database open can retry in the same page without reloading', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    await expect(db.openDb()).rejects.toThrow('The operation is insecure.');
    await expect(db.openDb()).resolves.toMatchObject({ name: 'noema-local-v1' });
  });

  it('reports a blocked open as "Close other Noema tabs"', async () => {
    const request = {} as IDBOpenDBRequest;
    vi.spyOn(indexedDB, 'open').mockReturnValueOnce(request);
    const opening = db.openDb();
    request.onblocked!.call(request, new Event('blocked') as IDBVersionChangeEvent);
    await expect(opening).rejects.toMatchObject({ name: 'LocalStoreError', code: 'blocked', message: S.closeOtherTabs });
  });

  it('closes on versionchange and forgets the cached connection', async () => {
    const first = await db.openDb();
    const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('noema-local-v1', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('blocked: the old connection did not close'));
    });
    upgraded.close();
    await expect(db.openDb()).rejects.toMatchObject({ code: 'open-failed' }); // version 1 < 2: a fresh open, not the closed one
    expect(() => first.transaction('kv')).toThrow();
  });
});

describe('transaction', () => {
  it('resolves on complete with the request result', async () => {
    await db.kvPut('snapshot', { tasks: [] });
    expect(await db.kvGet('snapshot')).toEqual({ tasks: [] });
    expect(await db.kvGet('draft')).toBeUndefined();
  });

  it('rolls back every write when run() throws', async () => {
    const boom = new Error('boom');
    await expect(
      db.transaction(['kv', 'outbox'], 'readwrite', (tx) => {
        tx.objectStore('kv').put('kept?', 'snapshot');
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(await db.kvGet('snapshot')).toBeUndefined();
  });

  it('rejects a duplicate outbox.add with ConstraintError and rolls back the other store', async () => {
    const item = { id: 'capture-0001', raw: 'first', task_id: '', files: [] };
    await db.outboxPut(item);
    const error = await db
      .transaction(['kv', 'outbox'], 'readwrite', (tx) => {
        tx.objectStore('kv').put({ id: 'next', raw: '', task_id: '', files: [] }, 'draft');
        tx.objectStore('outbox').add({ ...item, raw: 'second' });
      })
      .then(
        () => null,
        (reason: unknown) => reason,
      );
    expect(error).toMatchObject({ name: 'ConstraintError' });
    expect(await db.kvGet('draft')).toBeUndefined();
    expect(await db.outboxGet('capture-0001')).toMatchObject({ raw: 'first' });
  });

  it('keeps outbox records in key order and stores Blobs', async () => {
    await db.outboxPut({ id: 'b', raw: 'b', task_id: '', files: [] });
    await db.outboxPut({ id: 'a', raw: 'a', task_id: 'task-1', files: [{ name: 'heap.png', blob: blob('png') }], error: '' });
    const items = await db.outboxAll();
    expect(items.map((item) => (item as { id: string }).id)).toEqual(['a', 'b']);
    expect(db.isOutboxItem(items[0])).toBe(true);
    await db.outboxDelete('a');
    expect(await db.outboxAll()).toHaveLength(1);
  });

  it('notifies outbox listeners only after a committed outbox write', async () => {
    const listener = vi.fn();
    const off = db.onOutboxWrite(listener);
    await db.kvPut('snapshot', {});
    await db.outboxAll();
    expect(listener).not.toHaveBeenCalled();
    await db.outboxPut({ id: 'x', raw: '', task_id: '', files: [] });
    expect(listener).toHaveBeenCalledTimes(1);
    await db.transaction(['kv', 'outbox'], 'readwrite', () => {
      throw new Error('aborted');
    }).catch(() => {});
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    await db.outboxDelete('x');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('record guards', () => {
  it('accept the shapes public/app.js stores, including v1 items without error', () => {
    const file = { name: 'heap.png', blob: blob('png') };
    expect(db.isDraft({ id: 'd', raw: '', task_id: '', files: [file] })).toBe(true);
    expect(db.isOutboxItem({ id: 'o', raw: 'x', task_id: 't', files: [] })).toBe(true);
    expect(db.isOutboxItem({ id: 'o', raw: 'x', task_id: 't', files: [], error: 'Request failed (400)' })).toBe(true);
    expect(db.isTaskDraft({ id: 't', raw: 'r', fields: {}, pending: null })).toBe(true);
    expect(db.isTaskDraft({ id: 't', raw: 'r', fields: { project: 'CTF' }, pending: { capture_id: 't', raw: 'r', local_day: '2026-10-09', details: {} } })).toBe(true);
  });

  it('reject malformed records instead of guessing', () => {
    for (const value of [null, 'draft', [], { id: 'd', raw: '', task_id: null, files: [] }, { id: 'd', raw: '', task_id: '', files: [{ name: 'x', blob: 'not a blob' }] }]) {
      expect(db.isDraft(value), JSON.stringify(value)).toBe(false);
    }
    expect(db.isOutboxItem({ id: 'o', raw: '', task_id: '', files: [], error: 5 })).toBe(false);
    expect(db.isTaskDraft({ id: 't', raw: 'r', fields: {}, pending: { capture_id: 't' } })).toBe(false);
  });
});

describe('uid', () => {
  it('uses randomUUID, or 32 random hex characters where randomUUID is unavailable (plain-HTTP LAN)', () => {
    expect(db.uid()).toMatch(/^[0-9a-f-]{36}$/);
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: (array: Uint8Array) => real.getRandomValues(array) });
    expect(db.uid()).toMatch(/^[0-9a-f]{32}$/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/local/db.test.ts`
Expected: FAIL — every test fails with `Error: Cannot find module '/src/local/db' imported from /home/p4nic/code/noema/web/src/local/db.test.ts` (the test imports the module inside `beforeEach`, after `vi.resetModules()`).

- [ ] **Step 3: Create `web/src/local/db.ts`**

```ts
// IndexedDB layer (spec §4.4, contract §4.1): the same database, version, stores and record shapes as public/app.js,
// so drafts and captures queued by the old UI stay valid.
import type { TaskEditable } from '../api/schemas';
import { S } from '../strings';

export const DB_NAME = 'noema-local-v1';
export const DB_VERSION = 1;
export type StoredFile = { name: string; blob: Blob };
export type Draft = { id: string; raw: string; task_id: string; files: StoredFile[] }; // kv['draft']
export type OutboxItem = Draft & { error?: string }; // outbox, keyPath 'id'
export type TaskDraftPending = { capture_id: string; raw: string; local_day: string; details: Partial<TaskEditable> };
export type TaskDraft = { id: string; raw: string; fields: Partial<TaskEditable>; pending: TaskDraftPending | null }; // kv['task-draft']
export type KvValues = { draft: Draft; 'task-draft': TaskDraft; snapshot: unknown };
export type LocalErrorCode = 'blocked' | 'open-failed' | 'aborted';
type StoreName = 'kv' | 'outbox';

export class LocalStoreError extends Error {
  constructor(
    readonly code: LocalErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LocalStoreError';
  }
}

let dbPromise: Promise<IDBDatabase> | undefined;

export function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      // public/app.js:33, unchanged.
      request.result.createObjectStore('kv');
      request.result.createObjectStore('outbox', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = undefined;
      };
      resolve(db);
    };
    request.onerror = () => reject(new LocalStoreError('open-failed', request.error?.message || 'Local storage is unavailable'));
    request.onblocked = () => reject(new LocalStoreError('blocked', S.closeOtherTabs));
  }).catch((error: unknown) => {
    dbPromise = undefined; // a failed open can be retried in the same page (native_storage_check.py:291)
    throw error;
  });
  return dbPromise;
}

const outboxWriteListeners = new Set<() => void>();

// Called after every committed readwrite transaction that includes the outbox store (save, flush, retry, discard).
export function onOutboxWrite(listener: () => void): () => void {
  outboxWriteListeners.add(listener);
  return () => {
    outboxWriteListeners.delete(listener);
  };
}

// Resolves on oncomplete with the request's result; any error, abort or exception thrown by run() rejects (app.js:51-60).
export async function transaction<T>(
  stores: StoreName | StoreName[],
  mode: IDBTransactionMode,
  run: (tx: IDBTransaction) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDb();
  const names = Array.isArray(stores) ? stores : [stores];
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(names, mode);
    let result: T | undefined;
    const fail = (error: unknown) => reject(error ?? new LocalStoreError('aborted', 'Local save failed'));
    tx.oncomplete = () => {
      resolve(result);
      if (mode === 'readwrite' && names.includes('outbox')) for (const listener of [...outboxWriteListeners]) listener();
    };
    // A request error reaches tx.onerror before tx.error is set, so prefer the failing request's own error.
    tx.onerror = (event) => fail((event.target as IDBRequest | null)?.error ?? tx.error);
    tx.onabort = () => fail(tx.error);
    try {
      const request = run(tx);
      if (request) {
        request.onsuccess = () => {
          result = request.result;
        };
      }
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // already finished
      }
      reject(error);
    }
  });
}

export function kvGet<K extends keyof KvValues>(key: K): Promise<unknown> {
  return transaction<unknown>('kv', 'readonly', (tx) => tx.objectStore('kv').get(key));
}

export async function kvPut<K extends keyof KvValues>(key: K, value: KvValues[K]): Promise<void> {
  await transaction('kv', 'readwrite', (tx) => {
    tx.objectStore('kv').put(value, key);
  });
}

export async function outboxAll(): Promise<unknown[]> {
  return (await transaction<unknown[]>('outbox', 'readonly', (tx) => tx.objectStore('outbox').getAll())) ?? [];
}

export function outboxGet(id: string): Promise<unknown> {
  return transaction<unknown>('outbox', 'readonly', (tx) => tx.objectStore('outbox').get(id));
}

export async function outboxPut(item: OutboxItem): Promise<void> {
  await transaction('outbox', 'readwrite', (tx) => {
    tx.objectStore('outbox').put(item);
  });
}

export async function outboxDelete(id: string): Promise<void> {
  await transaction('outbox', 'readwrite', (tx) => {
    tx.objectStore('outbox').delete(id);
  });
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStoredFile = (v: unknown): v is StoredFile => isRecord(v) && typeof v.name === 'string' && v.blob instanceof Blob;

export function isDraft(v: unknown): v is Draft {
  return isRecord(v) && typeof v.id === 'string' && typeof v.raw === 'string' && typeof v.task_id === 'string' && Array.isArray(v.files) && v.files.every(isStoredFile);
}

export function isOutboxItem(v: unknown): v is OutboxItem {
  return isDraft(v) && ((v as OutboxItem).error === undefined || typeof (v as OutboxItem).error === 'string');
}

function isPending(v: unknown): v is TaskDraftPending {
  return isRecord(v) && typeof v.capture_id === 'string' && typeof v.raw === 'string' && typeof v.local_day === 'string' && isRecord(v.details);
}

// A missing pending is accepted (read as null by taskDraftStore.load) so an older draft is recovered, not overwritten.
export function isTaskDraft(v: unknown): v is TaskDraft {
  return isRecord(v) && typeof v.id === 'string' && typeof v.raw === 'string' && isRecord(v.fields) && (v.pending == null || isPending(v.pending));
}

// app.js:5: randomUUID needs a secure context; a plain-HTTP LAN origin falls back to 32 random hex characters.
export function uid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- src/local/db.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Write the failing limits test `web/src/local/limits.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { S } from '../strings';
import type { StoredFile } from './db';
import { ACCEPT_ATTR, MAX_FILE_BYTES, MAX_TOTAL_BYTES, validateFiles } from './limits';

const MB = 1024 * 1024;
// validateFiles reads only name, type and size, so large files need no real bytes.
const file = (name: string, type: string, size = 10) => ({ name, type, size }) as unknown as File;
const stored = (size: number): StoredFile => ({ name: 'kept.png', blob: { size } as Blob });

describe('validateFiles (spec §4.4)', () => {
  it('accepts exactly the server allowlist, ignoring MIME parameters', () => {
    const types = ['image/png', 'image/jpeg', 'image/webp', 'audio/wav', 'audio/ogg', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/mpeg'];
    const { accepted, rejections } = validateFiles([], types.map((type, i) => file(`f${i}`, type)));
    expect(rejections).toEqual([]);
    expect(accepted.map((f) => f.name)).toEqual(types.map((_, i) => `f${i}`));
    expect(ACCEPT_ATTR).toBe('image/png,image/jpeg,image/webp,audio/wav,audio/ogg,audio/webm,audio/mp4,audio/mpeg');
  });

  it('rejects other types with their own message and keeps going', () => {
    const { accepted, rejections } = validateFiles([], [file('a.gif', 'image/gif'), file('b.webm', 'video/webm'), file('c', ''), file('d.png', 'image/png')]);
    expect(rejections.map((r) => [r.code, r.name, r.message])).toEqual([
      ['unsupported-type', 'a.gif', S.unsupportedType],
      ['unsupported-type', 'b.webm', S.unsupportedType],
      ['unsupported-type', 'c', S.unsupportedType],
    ]);
    expect(accepted.map((f) => f.name)).toEqual(['d.png']);
  });

  it('allows 32 MB per file and rejects one byte more, naming the file', () => {
    const { accepted, rejections } = validateFiles([], [file('ok.wav', 'audio/wav', MAX_FILE_BYTES), file('big.wav', 'audio/wav', MAX_FILE_BYTES + 1)]);
    expect(accepted.map((f) => f.name)).toEqual(['ok.wav']);
    expect(rejections).toEqual([{ code: 'too-large', name: 'big.wav', message: 'big.wav exceeds 32 MB.' }]);
  });

  it('keeps the total strictly under 60 MB, counting files already attached', () => {
    const { accepted, rejections } = validateFiles([stored(30 * MB)], [file('a.wav', 'audio/wav', 29 * MB), file('b.wav', 'audio/wav', MB), file('c.png', 'image/png', MB - 1)]);
    expect(accepted.map((f) => f.name)).toEqual(['a.wav', 'c.png']);
    expect(rejections).toEqual([{ code: 'total-too-large', name: 'b.wav', message: S.totalTooLarge }]);
    expect(30 * MB + 29 * MB + MB - 1).toBeLessThan(MAX_TOTAL_BYTES);
  });

  it('stops at 12 attachments with one message', () => {
    const existing = Array.from({ length: 10 }, () => stored(1));
    const { accepted, rejections } = validateFiles(existing, ['1', '2', '3', '4'].map((n) => file(`${n}.png`, 'image/png')));
    expect(accepted.map((f) => f.name)).toEqual(['1.png', '2.png']);
    expect(rejections).toEqual([{ code: 'too-many', name: '3.png', message: S.tooManyFiles }]);
  });

  it('names an unnamed pasted image visual.png', () => {
    expect(validateFiles([], [file('', 'image/png')]).accepted[0].name).toBe('visual.png');
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm --prefix web test -- src/local/limits.test.ts`
Expected: FAIL — `Error: Cannot find module './limits' imported from /home/p4nic/code/noema/web/src/local/limits.test.ts`.

- [ ] **Step 7: Create `web/src/local/limits.ts`**

```ts
// Validation before queueing (spec §4.4): nothing bound to fail permanently enters the outbox.
import { S } from '../strings';
import type { StoredFile } from './db';

export const MAX_FILES = 12;
export const MAX_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 60 * 1024 * 1024; // total must be < this; headroom under the server's 64 MB body cap
export const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/mpeg'] as const; // server.py:40-48
export const ACCEPT_ATTR = ALLOWED_MIME.join(',');
export type RejectionCode = 'too-many' | 'too-large' | 'total-too-large' | 'unsupported-type';
export type FileRejection = { code: RejectionCode; name: string; message: string };

const ALLOWED: ReadonlySet<string> = new Set(ALLOWED_MIME);

export function validateFiles(existing: StoredFile[], incoming: File[]): { accepted: StoredFile[]; rejections: FileRejection[] } {
  const accepted: StoredFile[] = [];
  const rejections: FileRejection[] = [];
  let total = existing.reduce((sum, file) => sum + file.blob.size, 0);
  for (const file of incoming) {
    const name = file.name || 'visual.png'; // app.js:398
    if (existing.length + accepted.length >= MAX_FILES) {
      rejections.push({ code: 'too-many', name, message: S.tooManyFiles });
      break;
    }
    if (file.size > MAX_FILE_BYTES) {
      rejections.push({ code: 'too-large', name, message: S.fileTooLarge(name) });
      continue;
    }
    if (!ALLOWED.has(file.type.split(';')[0])) {
      rejections.push({ code: 'unsupported-type', name, message: S.unsupportedType });
      continue;
    }
    if (total + file.size >= MAX_TOTAL_BYTES) {
      rejections.push({ code: 'total-too-large', name, message: S.totalTooLarge });
      continue;
    }
    total += file.size;
    accepted.push({ name, blob: file });
  }
  return { accepted, rejections };
}
```

- [ ] **Step 8: Run both to verify they pass**

Run: `npm --prefix web test -- src/local/db.test.ts src/local/limits.test.ts`
Expected: PASS (18 tests).

- [ ] **Step 9: Commit**

```bash
git add web/src/local/db.ts web/src/local/db.test.ts web/src/local/limits.ts web/src/local/limits.test.ts
git commit -m "feat(web): add the v1-compatible IndexedDB layer and capture limits"
```

---

### Task 15: Capture draft store (spec §4.4 Invariants: atomic Save, serialised draft writes, 350 ms debounce; contract §4.3)

**Files:**
- Create: `web/src/ui/Toast.tsx` (Phase-1 stand-in; `02-screens-core.md` Task 4 overwrites it), `web/src/local/drafts.ts`
- Test: `web/src/ui/Toast.test.tsx` (`02-screens-core.md` Task 4 overwrites it with the full component test), `web/src/local/drafts.test.ts`

**Interfaces:**
- Consumes: `kvGet`, `kvPut`, `transaction`, `isDraft`, `uid`, `Draft`, `OutboxItem` (Task 14); `validateFiles`, `FileRejection` (Task 14); `S.localSaveFailedToast`, `S.writeSomething`, `S.finishingLocalSave`, `S.couldNotSave` (Task 3).
- Produces: `toast(message: string, options?: { tone?: 'status' | 'error' }): void` (a single `#noema-toast` live region; `role=status aria-live=polite`, or `role=alert` for errors; hidden after 5500 ms, `app.js:15`); contract §4.3 `LocalSaveState`, `CaptureDraftState`, `SaveCaptureResult`, `DRAFT_DEBOUNCE_MS`, `emptyDraft()`, `captureDraftStore`, `useCaptureDraft()`. Local addition: `captureDraftStore.markSaveError(): void` (used by Task 17 when the capture queue cannot be read, `app.js:135`). `save()` while a save is in flight returns `{ ok: false, message: S.finishingLocalSave }` (`app.js:400` returned silently; the result type needs a message). `addFiles` persists only when it accepted at least one file. `replaceWith` drops the `error` key instead of storing `error: undefined`.

- [ ] **Step 1: Write the failing toast test `web/src/ui/Toast.test.tsx`**

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from './Toast';

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('toast (Phase-1 stand-in)', () => {
  it('announces status politely, errors as alerts, one at a time, hidden after 5500 ms', () => {
    vi.useFakeTimers();
    toast('Saved to Inbox. Original preserved.');
    expect(document.querySelectorAll('#noema-toast')).toHaveLength(1);
    expect(document.querySelector('[role="status"][aria-live="polite"]')?.textContent).toBe('Saved to Inbox. Original preserved.');
    toast('Cannot read the local capture queue.', { tone: 'error' });
    expect(document.querySelectorAll('#noema-toast')).toHaveLength(1);
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('Cannot read the local capture queue.');
    vi.advanceTimersByTime(5499);
    expect(document.querySelector('#noema-toast')).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(document.querySelector('#noema-toast')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/ui/Toast.test.tsx`
Expected: FAIL — `Error: Cannot find module './Toast' imported from /home/p4nic/code/noema/web/src/ui/Toast.test.tsx`.

- [ ] **Step 3: Create `web/src/ui/Toast.tsx`**

```tsx
// Phase-1 stand-in so the data layer can report outcomes (contract §4.3–4.4 call toast()). 02-screens-core Task 4
// overwrites this whole file with the ToastHost component; toast(message, options) keeps this signature.
export type ToastOptions = { tone?: 'status' | 'error' };

let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(message: string, options: ToastOptions = {}): void {
  document.getElementById('noema-toast')?.remove();
  const node = document.createElement('div');
  node.id = 'noema-toast';
  if (options.tone === 'error') node.setAttribute('role', 'alert');
  else {
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
  }
  node.textContent = message;
  document.body.append(node);
  clearTimeout(timer);
  timer = setTimeout(() => node.remove(), 5500); // app.js:15
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- src/ui/Toast.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Write the failing draft-store test `web/src/local/drafts.test.ts`**

Two parity rows are unit tests here with their labels as titles (`native_storage_check.py:160` and `:224`); the debounce and abort cases use fake `setTimeout` only, because `fake-indexeddb` schedules with `setImmediate`.

```ts
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { S } from '../strings';

vi.mock('../ui/Toast', () => ({ toast: vi.fn() }));

type Modules = { drafts: typeof import('./drafts'); db: typeof import('./db'); toast: ReturnType<typeof vi.fn> };
let m: Modules;

beforeEach(async () => {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory() as unknown as typeof globalThis.indexedDB;
  m = { drafts: await import('./drafts'), db: await import('./db'), toast: vi.mocked((await import('../ui/Toast')).toast) };
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const store = () => m.drafts.captureDraftStore;
const png = (name: string) => new File(['png-bytes'], name, { type: 'image/png' });
const failNextPut = (name: string) =>
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
    throw new DOMException('Injected', name);
  });

describe('captureDraftStore.load', () => {
  it('recovers a stored draft as saved, or starts in memory', async () => {
    await store().load();
    expect(store().getSnapshot()).toMatchObject({ saveState: 'memory', recovered: true, draft: { raw: '' } });
    const stored = { id: 'draft-0001', raw: 'unsaved thought', task_id: '', files: [{ name: 'heap.png', blob: new Blob(['x'], { type: 'image/png' }) }] };
    await m.db.kvPut('draft', stored);
    await store().load();
    expect(store().getSnapshot()).toMatchObject({ saveState: 'saved', draft: { id: 'draft-0001', raw: 'unsaved thought' } });
    expect(store().getSnapshot().draft.files[0].blob).toBeInstanceOf(Blob);
  });

  it('reports a storage read failure as a local save error', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    await store().load();
    expect(store().getSnapshot()).toMatchObject({ saveState: 'error', recovered: true });
  });
});

describe('captureDraftStore draft writes', () => {
  it('debounces typing by 350 ms and labels it pending until the write commits', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const listener = vi.fn();
    store().subscribe(listener);
    store().setRaw('first');
    store().setRaw('first line');
    expect(store().getSnapshot()).toMatchObject({ saveState: 'pending', draft: { raw: 'first line' } });
    expect(listener).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(349);
    expect(await m.db.kvGet('draft')).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(store().getSnapshot().saveState).toBe('saved'));
    expect(await m.db.kvGet('draft')).toMatchObject({ raw: 'first line' });
  });

  it('Older committed draft cannot label newer input as saved', async () => {
    store().setRaw('older');
    const older = store().persist();
    store().setRaw('older and newer');
    await older;
    expect(store().getSnapshot().saveState).toBe('pending');
    await store().persist();
    expect(store().getSnapshot().saveState).toBe('saved');
    expect(await m.db.kvGet('draft')).toMatchObject({ raw: 'older and newer' });
  });

  it('a quota failure is an error with a toast, and the next write still runs', async () => {
    store().setRaw('keep me');
    failNextPut('QuotaExceededError');
    await store().persist();
    expect(store().getSnapshot()).toMatchObject({ saveState: 'error', draft: { raw: 'keep me' } });
    expect(m.toast).toHaveBeenCalledWith(S.localSaveFailedToast, { tone: 'error' });
    await store().persist();
    expect(store().getSnapshot().saveState).toBe('saved');
  });

  it('serialises writes so a save queued behind a draft write commits last', async () => {
    store().setRaw('queued thought');
    const write = store().persist();
    const saved = store().save();
    await Promise.all([write, saved]);
    expect(await saved).toEqual({ ok: true });
    expect(await m.db.kvGet('draft')).toEqual(store().getSnapshot().draft);
    expect(store().getSnapshot().draft.raw).toBe('');
  });

  it('adds valid files, returns rejections and persists only when something was accepted', async () => {
    const rejections = await store().addFiles([png('a.png'), new File(['gif'], 'b.gif', { type: 'image/gif' })]);
    expect(rejections.map((r) => r.code)).toEqual(['unsupported-type']);
    expect(store().getSnapshot().draft.files.map((f) => f.name)).toEqual(['a.png']);
    expect(await m.db.kvGet('draft')).toMatchObject({ files: [{ name: 'a.png' }] });
    await store().removeFile(0);
    expect(await m.db.kvGet('draft')).toMatchObject({ files: [] });
  });

  it('links a task and opens a copy of a queued item with a new id', async () => {
    await store().setTaskId('task-1');
    expect(await m.db.kvGet('draft')).toMatchObject({ task_id: 'task-1' });
    await store().replaceWith({ id: 'queued-0001', raw: 'queued', task_id: '', files: [], error: 'Request failed (400)' });
    const draft = store().getSnapshot().draft;
    expect(draft).toMatchObject({ raw: 'queued', task_id: '' });
    expect(draft.id).not.toBe('queued-0001');
    expect(draft).not.toHaveProperty('error');
    expect(await m.db.kvGet('draft')).toEqual(draft);
  });
});

describe('captureDraftStore.save', () => {
  it('refuses an empty capture without touching storage', async () => {
    store().setRaw('   ');
    expect(await store().save()).toEqual({ ok: false, message: S.writeSomething });
    expect(await m.db.outboxAll()).toEqual([]);
  });

  it('queues the original and resets the stored draft in one transaction', async () => {
    store().setRaw('Explicit save');
    await store().addFiles([png('heap.png')]);
    const before = store().getSnapshot().draft;
    expect(await store().save()).toEqual({ ok: true });
    const [item] = await m.db.outboxAll();
    expect(item).toMatchObject({ id: before.id, raw: 'Explicit save', task_id: '', error: '', files: [{ name: 'heap.png' }] });
    const after = store().getSnapshot();
    expect(after).toMatchObject({ saveState: 'saved', saving: false, draft: { raw: '', files: [] } });
    expect(after.draft.id).not.toBe(before.id);
    expect(await m.db.kvGet('draft')).toEqual(after.draft);
  });

  it('refuses a second save while one is in flight', async () => {
    store().setRaw('once');
    const first = store().save();
    expect(store().getSnapshot().saving).toBe(true);
    expect(await store().save()).toEqual({ ok: false, message: S.finishingLocalSave });
    expect(await first).toEqual({ ok: true });
    expect(await m.db.outboxAll()).toHaveLength(1);
  });

  it('fails on a duplicate id without resetting either store or the editor', async () => {
    store().setRaw('duplicate');
    await store().persist();
    const draft = store().getSnapshot().draft;
    await m.db.outboxPut({ ...draft, raw: 'already queued' });
    const result = await store().save();
    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false && result.message).toMatch(/^Could not save the capture: /);
    expect(store().getSnapshot()).toMatchObject({ saveState: 'error', saving: false, draft });
    expect(await m.db.kvGet('draft')).toEqual(draft);
    expect(await m.db.outboxAll()).toEqual([expect.objectContaining({ raw: 'already queued' })]);
  });

  it('Native abort after request success still rolls back both stores', async () => {
    store().setRaw('abort me');
    await store().persist();
    const original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      const request = original.call(this, value, key);
      request.addEventListener('success', () => this.transaction.abort());
      return request;
    });
    expect(await store().save()).toEqual({ ok: false, message: S.couldNotSave('Local save failed') });
    expect(await m.db.outboxAll()).toEqual([]);
    expect(await m.db.kvGet('draft')).toMatchObject({ raw: 'abort me' });
    expect(store().getSnapshot().draft.raw).toBe('abort me');
  });

  it('reports a quota failure during save with the browser message', async () => {
    store().setRaw('too big');
    failNextPut('QuotaExceededError');
    expect(await store().save()).toEqual({ ok: false, message: S.couldNotSave('Injected') });
    expect(await m.db.outboxAll()).toEqual([]);
  });

  it('Immediate Save cancels draft debounce without resurrecting a saved draft', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    store().setRaw('saved at once');
    expect(await store().save()).toEqual({ ok: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await m.db.kvGet('draft')).toMatchObject({ raw: '' });
    expect(await m.db.outboxAll()).toHaveLength(1);
  });

  it('ignores files added while a save is in flight', async () => {
    store().setRaw('busy');
    const saving = store().save();
    expect(await store().addFiles([png('late.png')])).toEqual([]);
    await saving;
    expect(store().getSnapshot().draft.files).toEqual([]);
  });
});

describe('markSaveError', () => {
  it('labels the draft as not saved', () => {
    store().markSaveError();
    expect(store().getSnapshot().saveState).toBe('error');
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm --prefix web test -- src/local/drafts.test.ts`
Expected: FAIL — every test fails with `Error: Cannot find module '/src/local/drafts' imported from /home/p4nic/code/noema/web/src/local/drafts.test.ts` (the test imports the module inside `beforeEach`, after `vi.resetModules()`).

- [ ] **Step 7: Create `web/src/local/drafts.ts`**

```ts
// The Capture draft (spec §4.4, contract §4.3): one external store shared by Capture, the Outbox dialog and the close
// checkpoint. Writes are serialised; a version counter keeps a stale write from labelling newer input as saved.
import { useSyncExternalStore } from 'react';
import { S } from '../strings';
import { toast } from '../ui/Toast';
import { isDraft, kvGet, kvPut, transaction, uid, type Draft, type OutboxItem } from './db';
import { validateFiles, type FileRejection } from './limits';

export type LocalSaveState = 'memory' | 'pending' | 'saved' | 'error';
export type CaptureDraftState = { draft: Draft; saveState: LocalSaveState; saving: boolean; recovered: boolean };
export type SaveCaptureResult = { ok: true } | { ok: false; message: string };
export const DRAFT_DEBOUNCE_MS = 350;

export function emptyDraft(): Draft {
  return { id: uid(), raw: '', task_id: '', files: [] };
}

let state: CaptureDraftState = { draft: emptyDraft(), saveState: 'memory', saving: false, recovered: false };
const listeners = new Set<() => void>();
let writeVersion = 0;
let writes: Promise<unknown> = Promise.resolve();
let debounce: ReturnType<typeof setTimeout> | undefined;

function update(changes: Partial<CaptureDraftState>): void {
  state = { ...state, ...changes };
  for (const listener of [...listeners]) listener();
}

function serialise<T>(operation: () => Promise<T>): Promise<T> {
  const next = writes.catch(() => {}).then(operation);
  writes = next;
  return next;
}

// app.js:69-74
async function persist(): Promise<void> {
  clearTimeout(debounce);
  const version = ++writeVersion;
  const snapshot = structuredClone(state.draft);
  update({ saveState: 'pending' });
  try {
    await serialise(() => kvPut('draft', snapshot));
    if (version === writeVersion) update({ saveState: 'saved' });
  } catch {
    if (version === writeVersion) {
      update({ saveState: 'error' });
      toast(S.localSaveFailedToast, { tone: 'error' });
    }
  }
}

export const captureDraftStore = {
  getSnapshot(): CaptureDraftState {
    return state;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  // app.js:590. A malformed stored draft is left in place until the next write; the editor starts empty.
  async load(): Promise<void> {
    try {
      const stored = await kvGet('draft');
      if (isDraft(stored)) update({ draft: stored, saveState: 'saved', recovered: true });
      else update({ saveState: 'memory', recovered: true });
    } catch {
      update({ saveState: 'error', recovered: true });
    }
  },
  // app.js:390 — typing is debounced 350 ms and immediately marks the draft as not yet saved.
  setRaw(raw: string): void {
    writeVersion++;
    update({ draft: { ...state.draft, raw }, saveState: 'pending' });
    clearTimeout(debounce);
    debounce = setTimeout(() => void persist(), DRAFT_DEBOUNCE_MS);
  },
  async setTaskId(taskId: string): Promise<void> {
    update({ draft: { ...state.draft, task_id: taskId } });
    await persist();
  },
  // app.js:398. The caller toasts the rejections; nothing is accepted while a save is in flight.
  async addFiles(files: File[]): Promise<FileRejection[]> {
    if (state.saving) return [];
    const { accepted, rejections } = validateFiles(state.draft.files, files);
    if (accepted.length > 0) {
      update({ draft: { ...state.draft, files: [...state.draft.files, ...accepted] } });
      await persist();
    }
    return rejections;
  },
  async removeFile(index: number): Promise<void> {
    update({ draft: { ...state.draft, files: state.draft.files.filter((_, i) => i !== index) } });
    await persist();
  },
  persist,
  // app.js:400-418: one ['kv','outbox'] transaction; the in-memory draft is replaced only after commit.
  async save(): Promise<SaveCaptureResult> {
    if (state.saving) return { ok: false, message: S.finishingLocalSave };
    const draft = state.draft;
    if (!draft.raw.trim() && draft.files.length === 0) return { ok: false, message: S.writeSomething };
    clearTimeout(debounce);
    writeVersion++;
    update({ saving: true });
    const capture: OutboxItem = structuredClone({ ...draft, error: '' });
    const next = emptyDraft();
    try {
      await serialise(() =>
        transaction(['kv', 'outbox'], 'readwrite', (tx) => {
          tx.objectStore('outbox').add(capture); // add, not put: a duplicate id fails the whole save
          tx.objectStore('kv').put(next, 'draft');
        }),
      );
      update({ draft: next, saveState: 'saved', saving: false });
      return { ok: true };
    } catch (error) {
      update({ saveState: 'error', saving: false });
      return { ok: false, message: S.couldNotSave(error instanceof Error ? error.message : String(error)) };
    }
  },
  // app.js:542 "Open a copy in Capture": a new id, so the queued original stays independent.
  async replaceWith(item: OutboxItem): Promise<void> {
    const { error: _error, ...copy } = item;
    update({ draft: { ...copy, id: uid() } });
    await persist();
  },
  // Local addition: outbox.ts marks the draft status when the capture queue cannot be read (app.js:135).
  markSaveError(): void {
    update({ saveState: 'error' });
  },
};

export function useCaptureDraft(): CaptureDraftState {
  return useSyncExternalStore(captureDraftStore.subscribe, captureDraftStore.getSnapshot, captureDraftStore.getSnapshot);
}
```

- [ ] **Step 8: Run both to verify they pass**

Run: `npm --prefix web test -- src/ui/Toast.test.tsx src/local/drafts.test.ts && npm --prefix web run typecheck`
Expected: PASS (18 tests); `tsc` exits 0.

- [ ] **Step 9: Commit**

```bash
git add web/src/ui/Toast.tsx web/src/ui/Toast.test.tsx web/src/local/drafts.ts web/src/local/drafts.test.ts
git commit -m "feat(web): add the capture draft store with atomic save"
```

---

### Task 16: Formatting helpers and the task draft store (spec §4.4 Task capture, `local_day`; contract §4.3, §4.5 `domain/format.ts`)

**Files:**
- Create: `web/src/domain/format.ts`, `web/src/local/taskDraft.ts`
- Test: `web/src/domain/format.test.ts`, `web/src/local/taskDraft.test.ts`

**Interfaces:**
- Consumes: `call`, `ApiError` (Task 13); `TaskSchema`, `Task`, `TaskEditable`, `Note` (Task 12); `isTaskDraft`, `kvGet`, `kvPut`, `uid`, `TaskDraft` (Task 14); `S.draftStorageFailed`, `S.ackUnverified`, `S.taskAdded`, `S.taskAddedDateKept`, `S.notConfirmed`, `S.checkServiceRetry`, `S.taskDraft*` (Task 3); `makeTask`, `makeNote` (Task 12, tests).
- Produces: contract §4.5 `age(stamp, now?)`, `dateLabel`, `localDateInput`, `fromLocal`, `localDay(date)` (`app.js:349-350` exactly), `noteMarkdownExport(note)` (`app.js:514`); contract §4.3 `TaskSaveState`, `TaskDraftState`, `TaskSubmitResult`, `taskDraftStore`, `useTaskDraft()`. `submit()` is single-flight: a second call while one is in flight returns the same promise and sends nothing.

- [ ] **Step 1: Write the failing format test `web/src/domain/format.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { makeNote } from '../test/fixtures';
import { age, dateLabel, fromLocal, localDateInput, localDay, noteMarkdownExport } from './format';

describe('format', () => {
  it('age counts minutes and hours, then falls back to a date', () => {
    const now = Date.parse('2026-10-10T12:00:00Z');
    expect(age('2026-10-10T11:59:30Z', now)).toBe('just now');
    expect(age('2026-10-10T12:00:30Z', now)).toBe('just now'); // clock skew never goes negative
    expect(age('2026-10-10T11:15:00Z', now)).toBe('45m ago');
    expect(age('2026-10-10T07:00:00Z', now)).toBe('5h ago');
    expect(age('2026-10-01T12:00:00Z', now)).toBe(new Date('2026-10-01T12:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  });

  it('dateLabel is empty for a missing stamp', () => {
    expect(dateLabel(null)).toBe('');
    expect(dateLabel('2026-10-10T12:00:00Z')).not.toBe('');
  });

  it('localDateInput and fromLocal round-trip a minute-precision stamp', () => {
    expect(localDateInput(null)).toBe('');
    expect(fromLocal('')).toBeNull();
    const input = localDateInput('2026-10-10T12:34:00.000Z');
    expect(input).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(fromLocal(input)).toBe('2026-10-10T12:34:00.000Z');
  });

  it('localDay is the device-local calendar day on both sides of midnight', () => {
    expect(localDay(new Date(2026, 9, 9, 23, 59, 59))).toBe('2026-10-09');
    expect(localDay(new Date(2026, 9, 10, 0, 0, 0))).toBe('2026-10-10');
  });

  it('noteMarkdownExport keeps the title, folder and body and makes a safe file name', () => {
    expect(noteMarkdownExport(makeNote('n1', { title: 'Heap: tcache/poison?', folder: 'Security / CTFs', body: '`x`' }))).toEqual({
      filename: 'Heap tcachepoison.md',
      text: '# Heap: tcache/poison?\n\nFolder: Security / CTFs\n\n`x`\n',
    });
    expect(noteMarkdownExport(makeNote('n2', { title: '???' })).filename).toBe('note.md');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/domain/format.test.ts`
Expected: FAIL — `Error: Cannot find module './format' imported from /home/p4nic/code/noema/web/src/domain/format.test.ts`.

- [ ] **Step 3: Create `web/src/domain/format.ts`**

```ts
// Pure formatting helpers ported from public/app.js (line numbers per function).
import type { Note } from '../api/schemas';

// app.js:17-23
export function age(stamp: string, now: number = Date.now()): string {
  const seconds = Math.max(0, (now - Date.parse(stamp)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(stamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// app.js:24
export function dateLabel(stamp: string | null): string {
  return stamp ? new Date(stamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
}

// app.js:25 — value for <input type="datetime-local">
export function localDateInput(stamp: string | null): string {
  if (!stamp) return '';
  const date = new Date(stamp);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// app.js:26
export function fromLocal(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

// app.js:349-350 — the device-local calendar day, sent once with a task capture and replayed unchanged.
export function localDay(date: Date): string {
  const day = new Date(date.getTime());
  day.setMinutes(day.getMinutes() - day.getTimezoneOffset());
  return day.toISOString().slice(0, 10);
}

// app.js:514 — client-side Markdown export of the current note.
export function noteMarkdownExport(note: Note): { filename: string; text: string } {
  return {
    filename: `${note.title.replace(/[^\w -]/g, '').slice(0, 70) || 'note'}.md`,
    text: `# ${note.title}\n\nFolder: ${note.folder}\n\n${note.body}\n`,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- src/domain/format.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the failing task-draft test `web/src/local/taskDraft.test.ts`**

```ts
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { S } from '../strings';
import { makeTask } from '../test/fixtures';

type Modules = { store: typeof import('./taskDraft')['taskDraftStore']; db: typeof import('./db') };
let m: Modules;
const fetchMock = vi.fn<typeof fetch>();

beforeEach(async () => {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory() as unknown as typeof globalThis.indexedDB;
  vi.stubGlobal('fetch', fetchMock);
  m = { store: (await import('./taskDraft')).taskDraftStore, db: await import('./db') };
});
afterEach(() => {
  fetchMock.mockReset();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const acknowledged = (raw: string, explanation = 'Saved as written.') => json(201, makeTask('task-1', { original_input: raw, interpretation: { explanation } }));
const sentBodies = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);

async function typed(raw: string) {
  m.store.setRaw(raw);
  await m.store.persist();
}

describe('taskDraftStore.submit (spec §4.4 Task capture)', () => {
  it('persists the pending payload before any HTTP call, then resets after a verified acknowledgement', async () => {
    await typed('Review the cleanup path');
    m.store.setField('project', 'CTF');
    const id = m.store.getSnapshot().draft.id;
    fetchMock.mockImplementationOnce(async () => {
      expect(await m.db.kvGet('task-draft')).toMatchObject({ pending: { capture_id: id, raw: 'Review the cleanup path', details: { project: 'CTF' } } });
      return acknowledged('Review the cleanup path');
    });
    const result = await m.store.submit(new Date(2026, 9, 9, 18, 0));
    expect(result).toMatchObject({ ok: true, toast: S.taskAdded, task: { id: 'task-1' } });
    expect(sentBodies()).toEqual([{ capture_id: id, raw: 'Review the cleanup path', local_day: '2026-10-09', details: { project: 'CTF' } }]);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/task-captures');
    const after = m.store.getSnapshot().draft;
    expect(after).toMatchObject({ raw: '', fields: {}, pending: null });
    expect(after.id).not.toBe(id);
    expect(await m.db.kvGet('task-draft')).toEqual(after);
  });

  it('keeps date wording with its own toast', async () => {
    await typed('Call Sam tomorrow evening');
    fetchMock.mockResolvedValueOnce(acknowledged('Call Sam tomorrow evening', 'Scheduling wording was kept in the title.'));
    expect(await m.store.submit()).toMatchObject({ ok: true, toast: S.taskAddedDateKept });
  });

  it('never sends when the pending payload cannot be stored', async () => {
    await typed('Store me first');
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new DOMException('Injected', 'QuotaExceededError');
    });
    expect(await m.store.submit()).toEqual({ ok: false, frozen: false, message: S.draftStorageFailed });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(m.store.getSnapshot().draft.pending).toBeNull();
  });

  it('Injected generic HTTP 200 cannot falsely acknowledge a task', async () => {
    await typed('Do not trust me');
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    expect(await m.store.submit()).toEqual({ ok: false, frozen: true, message: S.notConfirmed + S.checkServiceRetry });
    fetchMock.mockResolvedValueOnce(acknowledged('a different input'));
    expect(await m.store.submit()).toEqual({ ok: false, frozen: true, message: S.ackUnverified });
    expect(m.store.getSnapshot().draft.pending).toMatchObject({ raw: 'Do not trust me' });
  });

  it('stays frozen on 409, 5xx and network errors and retries with the same capture_id and local_day across midnight', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 9, 23, 59, 30));
    await typed('Finish before midnight');
    fetchMock.mockResolvedValueOnce(json(409, { detail: 'Task capture ID already exists with different input' }));
    expect(await m.store.submit()).toEqual({ ok: false, frozen: true, message: S.notConfirmed + 'Task capture ID already exists with different input' });
    vi.setSystemTime(new Date(2026, 9, 10, 0, 5));
    fetchMock.mockResolvedValueOnce(json(503, { detail: 'Service restarting' }));
    expect(await m.store.submit()).toMatchObject({ frozen: true });
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await m.store.submit()).toEqual({ ok: false, frozen: true, message: S.notConfirmed + S.checkServiceRetry });
    expect(m.store.statusLabel()).toBe(S.taskDraftUnconfirmed);
    fetchMock.mockResolvedValueOnce(acknowledged('Finish before midnight'));
    expect(await m.store.submit()).toMatchObject({ ok: true });
    const bodies = sentBodies();
    expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);
    expect(bodies[0]).toMatchObject({ local_day: '2026-10-09' });
  });

  it('unfreezes on 401 and other 4xx, clearing the pending attempt', async () => {
    await typed('Needs unlock');
    fetchMock.mockResolvedValueOnce(json(401, { detail: 'Unlock Noema to continue' }));
    expect(await m.store.submit()).toEqual({ ok: false, frozen: false, message: S.notConfirmed + 'Unlock Noema to continue' });
    expect(m.store.getSnapshot().draft).toMatchObject({ raw: 'Needs unlock', pending: null });
    expect(await m.db.kvGet('task-draft')).toMatchObject({ pending: null });
    fetchMock.mockResolvedValueOnce(json(422, { detail: [{ msg: 'String should have at most 16000 characters' }] }));
    expect(await m.store.submit()).toEqual({ ok: false, frozen: false, message: S.notConfirmed + 'String should have at most 16000 characters' });
  });

  it('is single-flight: a second submit while one is in flight sends nothing new', async () => {
    await typed('Once');
    let release!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (release = resolve)));
    const first = m.store.submit();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const second = m.store.submit();
    expect(second).toBe(first);
    expect(m.store.getSnapshot().submitting).toBe(true);
    release(acknowledged('Once'));
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(m.store.getSnapshot().submitting).toBe(false);
  });
});

describe('taskDraftStore draft state', () => {
  it('recovers a stored draft, including one written before pending existed', async () => {
    await m.db.kvPut('task-draft', { id: 'old-draft-01', raw: 'Old', fields: {} } as never);
    await m.store.load();
    expect(m.store.getSnapshot()).toMatchObject({ recovered: true, saveState: 'saved', draft: { id: 'old-draft-01', pending: null } });
    expect(m.store.statusLabel()).toBe(S.taskDraftSaved);
  });

  it('drops an empty title or project override and keeps other fields', () => {
    m.store.setField('title', 'Override');
    m.store.setField('estimate_minutes', 30);
    m.store.setField('title', '');
    expect(m.store.getSnapshot().draft.fields).toEqual({ estimate_minutes: 30 });
  });

  it('labels memory, pending and failed drafts like app.js:306', async () => {
    expect(m.store.statusLabel()).toBe(S.taskDraftMemory);
    m.store.setRaw('x');
    expect(m.store.statusLabel()).toBe(S.taskDraftPending);
    await vi.waitFor(() => expect(m.store.statusLabel()).toBe(S.taskDraftSaved));
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new DOMException('Injected', 'QuotaExceededError');
    });
    await expect(m.store.persist()).rejects.toThrow('Injected');
    expect(m.store.statusLabel()).toBe(S.taskDraftError);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm --prefix web test -- src/local/taskDraft.test.ts`
Expected: FAIL — every test fails with `Error: Cannot find module '/src/local/taskDraft' imported from /home/p4nic/code/noema/web/src/local/taskDraft.test.ts` (the test imports the module inside `beforeEach`, after `vi.resetModules()`).

- [ ] **Step 7: Create `web/src/local/taskDraft.ts`**

```ts
// The Add task draft (spec §4.4 "Task capture", contract §4.3): persisted before any HTTP call and replayed with the same
// capture_id only when the user retries. Port of public/app.js:305-366.
import { useSyncExternalStore } from 'react';
import { ApiError, call } from '../api/client';
import { TaskSchema, type Task, type TaskEditable } from '../api/schemas';
import { localDay } from '../domain/format';
import { S } from '../strings';
import { isTaskDraft, kvGet, kvPut, uid, type TaskDraft } from './db';

export type TaskSaveState = 'memory' | 'pending' | 'saved' | 'error';
export type TaskDraftState = { draft: TaskDraft; saveState: TaskSaveState; submitting: boolean; recovered: boolean };
export type TaskSubmitResult = { ok: true; task: Task; toast: string } | { ok: false; frozen: boolean; message: string };

const emptyTaskDraft = (): TaskDraft => ({ id: uid(), raw: '', fields: {}, pending: null });

let state: TaskDraftState = { draft: emptyTaskDraft(), saveState: 'memory', submitting: false, recovered: false };
const listeners = new Set<() => void>();
let writes: Promise<void> = Promise.resolve();
let inFlight: Promise<TaskSubmitResult> | null = null;

function update(changes: Partial<TaskDraftState>): void {
  state = { ...state, ...changes };
  for (const listener of [...listeners]) listener();
}

function setDraft(draft: TaskDraft): void {
  update({ draft });
}

// app.js:308-312: serialised; throws so callers can keep the dialog open.
function persist(): Promise<void> {
  const snapshot = structuredClone(state.draft);
  update({ saveState: 'pending' });
  const next = writes.catch(() => {}).then(() => kvPut('task-draft', snapshot));
  writes = next;
  return next.then(
    () => update({ saveState: 'saved' }),
    (error: unknown) => {
      update({ saveState: 'error' });
      throw error;
    },
  );
}

async function submitOnce(now: Date): Promise<TaskSubmitResult> {
  let pending = state.draft.pending;
  if (pending === null) {
    // local_day is fixed at the first submit and replayed unchanged, even across midnight.
    pending = { capture_id: state.draft.id, raw: state.draft.raw, local_day: localDay(now), details: state.draft.fields };
    setDraft({ ...state.draft, pending });
    try {
      await persist();
    } catch {
      setDraft({ ...state.draft, pending: null });
      return { ok: false, frozen: false, message: S.draftStorageFailed };
    }
  }
  try {
    const task = await call('taskCapture', TaskSchema, { body: pending });
    if (!task.id || task.original_input !== pending.raw) return { ok: false, frozen: true, message: S.ackUnverified };
    setDraft(emptyTaskDraft());
    await persist().catch(() => {}); // the task is durably acknowledged; a failed local reset is safe to retry by capture ID
    return { ok: true, task, toast: task.interpretation.explanation?.startsWith('Scheduling wording') ? S.taskAddedDateKept : S.taskAdded };
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'http' && error.status !== null && error.status < 500 && error.status !== 409) {
      setDraft({ ...state.draft, pending: null });
      await persist().catch(() => {});
      return { ok: false, frozen: false, message: S.notConfirmed + error.message };
    }
    // 409, 5xx, network, or an unverifiable 2xx: stay frozen; Retry replays the same pending payload.
    return { ok: false, frozen: true, message: S.notConfirmed + (error instanceof ApiError && error.kind === 'http' ? error.message : S.checkServiceRetry) };
  }
}

export const taskDraftStore = {
  getSnapshot(): TaskDraftState {
    return state;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  // app.js:591
  async load(): Promise<void> {
    try {
      const stored = await kvGet('task-draft');
      if (isTaskDraft(stored)) update({ draft: { ...stored, pending: stored.pending ?? null }, saveState: 'saved', recovered: true });
      else update({ recovered: true });
    } catch {
      update({ saveState: 'error', recovered: true });
    }
  },
  // app.js:328-333: every input is persisted.
  setRaw(raw: string): void {
    setDraft({ ...state.draft, raw });
    persist().catch(() => {});
  },
  setField<K extends keyof TaskEditable>(name: K, value: TaskEditable[K] | null | ''): void {
    const fields: Partial<Record<keyof TaskEditable, unknown>> = { ...state.draft.fields };
    if ((name === 'title' || name === 'project') && !value) delete fields[name];
    else fields[name] = value;
    setDraft({ ...state.draft, fields: fields as Partial<TaskEditable> });
    persist().catch(() => {});
  },
  persist,
  // Single-flight: a second call while one is in flight gets the same result.
  submit(now: Date = new Date()): Promise<TaskSubmitResult> {
    if (inFlight) return inFlight;
    update({ submitting: true });
    inFlight = submitOnce(now).finally(() => {
      inFlight = null;
      update({ submitting: false });
    });
    return inFlight;
  },
  // app.js:306
  statusLabel(): string {
    const { saveState, draft } = state;
    if (saveState === 'saved') return draft.pending ? S.taskDraftUnconfirmed : S.taskDraftSaved;
    if (saveState === 'error') return S.taskDraftError;
    if (saveState === 'pending') return S.taskDraftPending;
    return S.taskDraftMemory;
  },
};

export function useTaskDraft(): TaskDraftState {
  return useSyncExternalStore(taskDraftStore.subscribe, taskDraftStore.getSnapshot, taskDraftStore.getSnapshot);
}
```

- [ ] **Step 8: Run both to verify they pass**

Run: `npm --prefix web test -- src/domain/format.test.ts src/local/taskDraft.test.ts && npm --prefix web run typecheck`
Expected: PASS (15 tests); `tsc` exits 0.

- [ ] **Step 9: Commit**

```bash
git add web/src/domain/format.ts web/src/domain/format.test.ts web/src/local/taskDraft.ts web/src/local/taskDraft.test.ts
git commit -m "feat(web): add formatting helpers and the persisted task draft"
```

---

### Task 17: Outbox flush (spec §4.4 Flush; contract §4.4)

**Files:**
- Create: `web/src/local/outbox.ts`
- Test: `web/src/local/outbox.test.ts`

**Interfaces:**
- Consumes: `call`, `ApiError` (Task 13); `NoteSchema`, `CapturePayload`, `Note` (Task 12); `connection` (Task 11); `isOutboxItem`, `onOutboxWrite`, `outboxAll`, `outboxDelete`, `outboxGet`, `outboxPut`, `OutboxItem` (Task 14); `captureDraftStore.markSaveError` (Task 15); `toast` (Task 15); `S.savedTo`, `S.queueReadFailed` (Task 3); `makeNote` (Task 12, tests).
- Produces: contract §4.4 `FlushStop`, `FlushResult`, `flushOutbox()`, `retryItem(id)`, `discardItem(id)`, `outboxCount()`, `subscribeOutbox(listener)`, `useOutboxCount()`, `useOutboxItems()`. A local storage failure while marking or deleting an item is reported like a read failure (`read-failed`, `app.js:135`, whose `try` covers the whole flush). `retryItem` ignores a malformed record (it can only be discarded).

- [ ] **Step 1: Write the failing test `web/src/local/outbox.test.ts`**

```ts
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { S } from '../strings';
import { makeNote } from '../test/fixtures';

vi.mock('../ui/Toast', () => ({ toast: vi.fn() }));

type Modules = {
  outbox: typeof import('./outbox');
  db: typeof import('./db');
  connection: typeof import('../domain/connection')['connection'];
  drafts: typeof import('./drafts')['captureDraftStore'];
  toast: ReturnType<typeof vi.fn>;
};
let m: Modules;
const fetchMock = vi.fn<typeof fetch>();

beforeEach(async () => {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory() as unknown as typeof globalThis.indexedDB;
  vi.stubGlobal('fetch', fetchMock);
  m = {
    outbox: await import('./outbox'),
    db: await import('./db'),
    connection: (await import('../domain/connection')).connection,
    drafts: (await import('./drafts')).captureDraftStore,
    toast: vi.mocked((await import('../ui/Toast')).toast),
  };
  m.connection.report('state-success');
});
afterEach(() => {
  fetchMock.mockReset();
  vi.restoreAllMocks();
});

const ID = (n: number) => `0000000${n}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
const item = (n: number, changes: Record<string, unknown> = {}) => ({ id: ID(n), raw: `capture ${n}`, task_id: '', files: [], ...changes });
const created = (folder = 'Inbox', processing = '') => new Response(JSON.stringify(makeNote('n', { folder, processing })), { status: 201, headers: { 'content-type': 'application/json' } });
const failed = (status: number, detail: string) => new Response(JSON.stringify({ detail }), { status, headers: { 'content-type': 'application/json' } });
const payloads = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init?.body as FormData).get('payload'))) as Record<string, unknown>);
const ids = async () => (await m.db.outboxAll()).map((stored) => (stored as { id: string }).id);

describe('flushOutbox', () => {
  it('sends in IndexedDB key order with the v1 multipart payload and deletes each item only after a 2xx', async () => {
    const png = new Blob(['png-bytes'], { type: 'image/png' });
    await m.db.outboxPut(item(3));
    await m.db.outboxPut(item(1, { task_id: 'task-1', files: [{ name: 'heap.png', blob: png }] })); // v1 shape: no error key
    await m.db.outboxPut(item(2, { error: '' }));
    fetchMock.mockImplementation(async () => created());
    expect(await m.outbox.flushOutbox()).toEqual({ sent: 3, stop: 'done' });
    expect(payloads()).toEqual([
      { capture_id: ID(1), raw: 'capture 1', project: '', task_id: 'task-1', organize: true },
      { capture_id: ID(2), raw: 'capture 2', project: '', task_id: null, organize: true },
      { capture_id: ID(3), raw: 'capture 3', project: '', task_id: null, organize: true },
    ]);
    const first = fetchMock.mock.calls[0][1]?.body as FormData;
    const attachment = first.get('attachments') as File;
    expect([attachment.name, attachment.type, await attachment.text()]).toEqual(['heap.png', 'image/png', 'png-bytes']);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/captures');
    expect(await ids()).toEqual([]);
    expect(m.toast).not.toHaveBeenCalled(); // three items: no single "Saved to" claim
  });

  it('says "Saved to {folder}" only after the server acknowledged the only queued item', async () => {
    await m.db.outboxPut(item(1));
    fetchMock.mockResolvedValueOnce(created('Security / CTFs', 'queued: organize'));
    expect(await m.outbox.flushOutbox()).toEqual({ sent: 1, stop: 'done' });
    expect(m.toast).toHaveBeenCalledWith('Saved to Security / CTFs. Processing queued.');
  });

  it('does nothing while disconnected and is single-flight', async () => {
    await m.db.outboxPut(item(1));
    m.connection.report('offline');
    expect(await m.outbox.flushOutbox()).toEqual({ sent: 0, stop: 'disconnected' });
    m.connection.report('state-success');
    let release!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (release = resolve)));
    const first = m.outbox.flushOutbox();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(await m.outbox.flushOutbox()).toEqual({ sent: 0, stop: 'busy' });
    release(created());
    expect(await first).toEqual({ sent: 1, stop: 'done' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops without marking on 401, 5xx and network failures', async () => {
    await m.db.outboxPut(item(1));
    await m.db.outboxPut(item(2));
    fetchMock.mockResolvedValueOnce(failed(401, 'Unlock Noema to continue'));
    expect(await m.outbox.flushOutbox()).toEqual({ sent: 0, stop: 'unauthorized' });
    fetchMock.mockResolvedValueOnce(failed(503, 'Service restarting'));
    expect(await m.outbox.flushOutbox()).toEqual({ sent: 0, stop: 'server' });
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await m.outbox.flushOutbox()).toEqual({ sent: 0, stop: 'network' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(await m.db.outboxAll()).toEqual([expect.not.objectContaining({ error: expect.any(String) }), expect.not.objectContaining({ error: expect.any(String) })]);
  });

  it('marks a permanent 4xx rejection with the server message, stops, and skips it afterwards', async () => {
    await m.db.outboxPut(item(1));
    await m.db.outboxPut(item(2));
    fetchMock.mockResolvedValueOnce(failed(400, 'Write something or attach a recording or visual'));
    expect(await m.outbox.flushOutbox()).toEqual({ sent: 0, stop: 'rejected' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await m.db.outboxGet(ID(1))).toMatchObject({ error: 'Write something or attach a recording or visual' });
    fetchMock.mockResolvedValueOnce(created());
    expect(await m.outbox.flushOutbox()).toEqual({ sent: 1, stop: 'done' });
    expect(payloads()[1]).toMatchObject({ capture_id: ID(2) });
    expect(await ids()).toEqual([ID(1)]);
  });

  it('replays a lost acknowledgement with the same capture_id', async () => {
    await m.db.outboxPut(item(1));
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')); // the server may have stored it
    expect(await m.outbox.flushOutbox()).toEqual({ sent: 0, stop: 'network' });
    expect(await ids()).toEqual([ID(1)]);
    m.connection.report('state-success');
    fetchMock.mockResolvedValueOnce(created());
    expect(await m.outbox.flushOutbox()).toEqual({ sent: 1, stop: 'done' });
    expect(payloads().map((p) => p.capture_id)).toEqual([ID(1), ID(1)]);
  });

  it('skips malformed records and never deletes them', async () => {
    await m.db.transaction('outbox', 'readwrite', (tx) => {
      tx.objectStore('outbox').put({ id: ID(1), raw: 42 });
    });
    expect(await m.outbox.flushOutbox()).toEqual({ sent: 0, stop: 'done' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await ids()).toEqual([ID(1)]);
  });

  it('reports an unreadable queue as a local save error', async () => {
    vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementationOnce(() => {
      throw new DOMException('Injected', 'UnknownError');
    });
    expect(await m.outbox.flushOutbox()).toEqual({ sent: 0, stop: 'read-failed' });
    expect(m.drafts.getSnapshot().saveState).toBe('error');
    expect(m.toast).toHaveBeenCalledWith(S.queueReadFailed, { tone: 'error' });
  });
});

describe('outbox actions and count', () => {
  it('retry clears the error and sends again; discard deletes; the count follows every change', async () => {
    const listener = vi.fn();
    m.outbox.subscribeOutbox(listener);
    await m.db.outboxPut(item(1, { error: 'Request failed (400)' }));
    await m.db.outboxPut(item(2));
    await vi.waitFor(() => expect(m.outbox.outboxCount()).toBe(2));
    expect(listener).toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(created()).mockResolvedValueOnce(failed(503, 'down'));
    await m.outbox.retryItem(ID(1));
    expect(payloads().map((p) => p.capture_id)).toEqual([ID(1), ID(2)]); // retry flushes the whole queue in key order
    expect(await ids()).toEqual([ID(2)]);
    await m.outbox.discardItem(ID(2));
    await vi.waitFor(() => expect(m.outbox.outboxCount()).toBe(0));
    expect(await ids()).toEqual([]);
  });

  it('retry ignores an unknown or malformed id', async () => {
    await m.outbox.retryItem('missing');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/local/outbox.test.ts`
Expected: FAIL — every test fails with `Error: Cannot find module '/src/local/outbox' imported from /home/p4nic/code/noema/web/src/local/outbox.test.ts` (the test imports the module inside `beforeEach`, after `vi.resetModules()`).

- [ ] **Step 3: Create `web/src/local/outbox.ts`**

```ts
// Capture outbox flush (spec §4.4, contract §4.4): a port of public/app.js:116-137. Items replay with capture_id = their id,
// so a lost acknowledgement never duplicates a note.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { ApiError, call } from '../api/client';
import { NoteSchema, type CapturePayload, type Note } from '../api/schemas';
import { connection } from '../domain/connection';
import { S } from '../strings';
import { toast } from '../ui/Toast';
import { isOutboxItem, onOutboxWrite, outboxAll, outboxDelete, outboxGet, outboxPut, type OutboxItem } from './db';
import { captureDraftStore } from './drafts';

export type FlushStop = 'done' | 'busy' | 'disconnected' | 'unauthorized' | 'server' | 'network' | 'rejected' | 'read-failed';
export type FlushResult = { sent: number; stop: FlushStop };

function captureForm(item: OutboxItem): FormData {
  const payload: CapturePayload = { capture_id: item.id, raw: item.raw, project: '', task_id: item.task_id || null, organize: true };
  const form = new FormData();
  form.set('payload', JSON.stringify(payload));
  for (const file of item.files) form.append('attachments', file.blob, file.name);
  return form;
}

function localFailure(sent: number): FlushResult {
  captureDraftStore.markSaveError();
  toast(S.queueReadFailed, { tone: 'error' });
  return { sent, stop: 'read-failed' };
}

let flushing = false;

export async function flushOutbox(): Promise<FlushResult> {
  if (flushing) return { sent: 0, stop: 'busy' };
  if (!connection.get()) return { sent: 0, stop: 'disconnected' };
  flushing = true;
  let sent = 0;
  try {
    let items: unknown[];
    try {
      items = await outboxAll(); // IndexedDB key order: random-UUID order, not chronological (parity with app.js)
    } catch {
      return localFailure(sent);
    }
    for (const item of items) {
      if (!isOutboxItem(item) || item.error) continue; // malformed items are listed in the Outbox dialog, never deleted here
      let note: Note;
      try {
        note = await call('capture', NoteSchema, { body: captureForm(item) });
      } catch (error) {
        if (!(error instanceof ApiError) || error.kind !== 'http' || error.status === null) return { sent, stop: 'network' };
        if (error.status === 401) return { sent, stop: 'unauthorized' };
        if (error.status >= 500) return { sent, stop: 'server' };
        try {
          await outboxPut({ ...item, error: error.message });
        } catch {
          return localFailure(sent);
        }
        return { sent, stop: 'rejected' };
      }
      try {
        await outboxDelete(item.id); // only after a 2xx
      } catch {
        return localFailure(sent);
      }
      sent += 1;
      if (items.length === 1) toast(S.savedTo(note.folder, note.processing)); // app.js:128: only when it was the only queued item
    }
    return { sent, stop: 'done' };
  } finally {
    flushing = false;
  }
}

export async function retryItem(id: string): Promise<void> {
  const item = await outboxGet(id);
  if (!isOutboxItem(item)) return; // a malformed record can only be discarded
  await outboxPut({ ...item, error: '' });
  await flushOutbox();
}

export async function discardItem(id: string): Promise<void> {
  await outboxDelete(id);
}

let count = 0;
const listeners = new Set<() => void>();

async function refresh(): Promise<void> {
  try {
    count = (await outboxAll()).length;
  } catch {
    // keep the last known count; flushOutbox reports unreadable storage
  }
  for (const listener of [...listeners]) listener();
}

onOutboxWrite(() => void refresh());

export function outboxCount(): number {
  return count;
}

export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useOutboxCount(): number {
  useEffect(() => {
    void refresh();
  }, []);
  return useSyncExternalStore(subscribeOutbox, outboxCount, outboxCount);
}

export function useOutboxItems(): { items: unknown[]; reload(): Promise<void> } {
  const [items, setItems] = useState<unknown[]>([]);
  const reload = useCallback(async () => {
    setItems(await outboxAll());
  }, []);
  useEffect(() => {
    void reload().catch(() => {});
    return subscribeOutbox(() => void reload().catch(() => {}));
  }, [reload]);
  return { items, reload };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- src/local/outbox.test.ts && npm --prefix web run typecheck`
Expected: PASS (10 tests); `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/local/outbox.ts web/src/local/outbox.test.ts
git commit -m "feat(web): flush the capture outbox in key order with the v1 stop rules"
```

---

### Task 18: QueryClient, snapshot query and mutation hooks (spec §4.3 QueryClient, Snapshot query, Replay policy; contract §4.6)

**Files:**
- Create: `web/src/domain/tasks.ts` (only `TASK_EDIT_FIELDS` and `editableFields`; `02-screens-core.md` Task 3 switches to Modify and adds the rest, per its ownership note), `web/src/state/queryClient.ts`, `web/src/state/queries.ts`
- Test: `web/src/domain/tasks.test.ts` (`02-screens-core.md` Task 3 replaces it with its fuller test), `web/src/state/queryClient.test.ts`, `web/src/state/queries.test.tsx`

**Interfaces:**
- Consumes: `call`, `ApiError` (Task 13); `fetchSnapshot` (Task 13); every schema and body type (Task 12); `connection` (Task 11); `SERVICE_UP` (Task 2); `kvGet`, `kvPut` (Task 14); `flushOutbox`, `FlushResult` (Task 17); `z` (Task 2); `makeSnapshot`, `makeTask` (Task 12, tests).
- Produces: contract §4.5 `TASK_EDIT_FIELDS`, `editableFields(task)`; contract §4.6 `SNAPSHOT_INTERVAL_MS`, `shouldRetryQuery`, `createQueryClient`, `queryKeys`, `useTimeBudget`, `useSnapshot`, `readCachedSnapshot`, `runFlush`, `installRefetchTriggers`, `useNote`, `useNoteHistory`, `useSearch`, `useTokens`, and the 16 mutation hooks of the contract §4.6 table (exact variables, endpoints and result schemas). Every mutation `onSuccess` awaits the snapshot invalidation (note hooks also `['note', id]`, token hooks also `['tokens']`), so a caller's `mutateAsync` resolves after the refetch, like `app.js`'s `await refresh()`.

- [ ] **Step 1: Write the failing tests**

`web/src/domain/tasks.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { makeTask } from '../test/fixtures';
import { TASK_EDIT_FIELDS, editableFields } from './tasks';

describe('editableFields', () => {
  it('copies exactly the fields app.js:382 re-sends, nothing server-computed', () => {
    const task = makeTask('t1', { title: 'Review', due_at: '2026-10-11T09:00:00+00:00', dependencies: ['t0'], estimate_minutes: 30 });
    const fields = editableFields(task);
    expect(Object.keys(fields)).toEqual([...TASK_EDIT_FIELDS]);
    expect(fields).toMatchObject({ title: 'Review', due_at: '2026-10-11T09:00:00+00:00', dependencies: ['t0'], estimate_minutes: 30 });
    expect(fields).not.toHaveProperty('version');
  });
});
```
`web/src/state/queryClient.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { SNAPSHOT_INTERVAL_MS, createQueryClient, shouldRetryQuery } from './queryClient';

describe('shouldRetryQuery', () => {
  it('retries network errors and 5xx at most twice, never 4xx or parse errors', () => {
    const network = new ApiError('network', 'down', null);
    const server = new ApiError('http', 'Request failed (502)', 502);
    expect([0, 1, 2].map((n) => shouldRetryQuery(n, network))).toEqual([true, true, false]);
    expect([0, 1, 2].map((n) => shouldRetryQuery(n, server))).toEqual([true, true, false]);
    expect(shouldRetryQuery(0, new ApiError('http', 'Task not found', 404))).toBe(false);
    expect(shouldRetryQuery(0, new ApiError('http', 'Unlock Noema to continue', 401))).toBe(false);
    expect(shouldRetryQuery(0, new ApiError('parse', 'bad', 200))).toBe(false);
    expect(shouldRetryQuery(0, new Error('other'))).toBe(false);
  });
});

describe('createQueryClient', () => {
  it('never pauses for OS offline reports and never retries mutations', () => {
    const defaults = createQueryClient().getDefaultOptions();
    expect(defaults.queries).toMatchObject({ networkMode: 'always', retry: shouldRetryQuery, refetchOnWindowFocus: false });
    expect(defaults.mutations).toEqual({ networkMode: 'always', retry: 0 });
    expect(SNAPSHOT_INTERVAL_MS).toBe(15_000);
  });
});
```
`web/src/state/queries.test.tsx` (jsdom: TanStack Query only runs `refetchInterval` and its focus/online managers when `window` exists):
```tsx
// @vitest-environment jsdom
import { QueryClientProvider, onlineManager, type QueryClient } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connection } from '../domain/connection';
import { SERVICE_UP } from '../events';
import { kvGet, kvPut } from '../local/db';
import { flushOutbox } from '../local/outbox';
import { makeSnapshot, makeTask } from '../test/fixtures';
import { createQueryClient } from './queryClient';
import { installRefetchTriggers, readCachedSnapshot, runFlush, useCreateToken, usePatchTask, useSetFocus, useSnapshot, useTimeBudget } from './queries';

vi.mock('../local/db', () => ({ kvGet: vi.fn(), kvPut: vi.fn(async () => {}) }));
vi.mock('../local/outbox', () => ({ flushOutbox: vi.fn(async () => ({ sent: 0, stop: 'done' })) }));

const fetchMock = vi.fn<typeof fetch>();
let qc: QueryClient;
let hidden = false;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const calls = (method: string, path: string) => fetchMock.mock.calls.filter(([url, init]) => (init?.method ?? 'GET') === method && String(url).startsWith('/api' + path)).length;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

function setVisible(visible: boolean) {
  hidden = !visible;
  document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
  hidden = false;
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url) => (String(url).startsWith('/api/state') ? json(makeSnapshot()) : json({ ok: true })));
  qc = createQueryClient();
  connection.report('offline');
});
afterEach(() => {
  cleanup();
  qc.clear();
  onlineManager.setOnline(true);
  fetchMock.mockReset();
  vi.mocked(flushOutbox).mockClear();
  vi.useRealTimers();
});

describe('useSnapshot', () => {
  it('refetches every 15 s while visible, never while hidden, and again on becoming visible', async () => {
    renderHook(() => useSnapshot(), { wrapper });
    await vi.waitFor(() => expect(connection.get()).toBe(true));
    expect(calls('GET', '/state')).toBe(1);
    expect(kvPut).toHaveBeenCalledWith('snapshot', makeSnapshot());
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(calls('GET', '/state')).toBe(2);
    act(() => setVisible(false));
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(calls('GET', '/state')).toBe(2);
    act(() => setVisible(true));
    await vi.waitFor(() => expect(calls('GET', '/state')).toBe(3));
  });

  it('flushes the outbox after each visible snapshot', async () => {
    renderHook(() => useSnapshot(), { wrapper });
    await vi.waitFor(() => expect(flushOutbox).toHaveBeenCalledTimes(1));
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    await vi.waitFor(() => expect(flushOutbox).toHaveBeenCalledTimes(2));
  });

  it('reports disconnected on a failed state fetch and keeps the last snapshot', async () => {
    const { result } = renderHook(() => useSnapshot(), { wrapper });
    await vi.waitFor(() => expect(result.current.data).toEqual(makeSnapshot()));
    fetchMock.mockImplementation(async () => json({ detail: 'Unlock Noema to continue' }, 401));
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    await vi.waitFor(() => expect(connection.get()).toBe(false));
    expect(result.current.data).toEqual(makeSnapshot());
  });

  it('queries the chosen time budget', async () => {
    const { result } = renderHook(() => [useSnapshot(), useTimeBudget()] as const, { wrapper });
    await vi.waitFor(() => expect(calls('GET', '/state')).toBe(1));
    act(() => result.current[1][1](30));
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === '/api/state?minutes=30')).toBe(true));
    act(() => result.current[1][1](null));
  });

  it('refetches on noema:service-up', async () => {
    const { result } = renderHook(() => useSnapshot(), { wrapper });
    await vi.waitFor(() => expect(result.current.isSuccess).toBe(true));
    const uninstall = installRefetchTriggers(qc);
    window.dispatchEvent(new Event(SERVICE_UP));
    await vi.waitFor(() => expect(calls('GET', '/state')).toBe(2));
    uninstall();
  });
});

describe('network mode and replay (spec §4.3)', () => {
  it('fetches even when the OS reports offline (networkMode always)', async () => {
    onlineManager.setOnline(false);
    renderHook(() => useSnapshot(), { wrapper });
    await vi.waitFor(() => expect(calls('GET', '/state')).toBe(1));
  });

  it('a mutation issued while disconnected is sent once and not replayed on reconnect', async () => {
    onlineManager.setOnline(false);
    fetchMock.mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });
    const { result } = renderHook(() => useSetFocus(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ taskId: 'task-1' }).catch(() => {});
    });
    expect(calls('POST', '/focus')).toBe(1);
    await vi.waitFor(() => expect(result.current.error).toMatchObject({ kind: 'network' }));
    fetchMock.mockImplementation(async () => json({ task_id: 'task-1', pinned: true, source: 'manual', updated_at: 'now' }));
    act(() => {
      onlineManager.setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(calls('POST', '/focus')).toBe(1);
  });
});

describe('mutations', () => {
  it('usePatchTask re-reads the task and PUTs with the fresh version, then refreshes the snapshot', async () => {
    const fresh = makeTask('task-1', { version: 7, title: 'Fresh title', priority: 'auto' });
    fetchMock.mockImplementation(async (url, init) => {
      if (url === '/api/tasks/task-1' && (init?.method ?? 'GET') === 'GET') return json(fresh);
      if (url === '/api/tasks/task-1') return json({ ...fresh, version: 8, priority: 'low' });
      return json(makeSnapshot());
    });
    renderHook(() => useSnapshot(), { wrapper });
    await vi.waitFor(() => expect(calls('GET', '/state')).toBe(1));
    const { result } = renderHook(() => usePatchTask(), { wrapper });
    await act(() => result.current.mutateAsync({ id: 'task-1', changes: { priority: 'low' } }));
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(String(put?.[1]?.body))).toMatchObject({ title: 'Fresh title', priority: 'low', expected_version: 7 });
    expect(calls('GET', '/state')).toBe(2);
  });

  it('a 409 is surfaced to the caller, never retried', async () => {
    fetchMock.mockImplementation(async () => json({ detail: 'This task changed on another screen.' }, 409));
    const { result } = renderHook(() => usePatchTask(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ id: 'task-1', changes: { status: 'done' } })).rejects.toMatchObject({ status: 409 });
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('token mutations also refresh the token list', async () => {
    const spy = vi.spyOn(qc, 'invalidateQueries');
    fetchMock.mockImplementation(async () => json({ id: 'tok-1', token: 'secret', scope: 'agent', task_ids: ['task-1'] }, 201));
    const { result } = renderHook(() => useCreateToken(), { wrapper });
    await act(() => result.current.mutateAsync({ name: 'codex', scope: 'agent', task_ids: ['task-1'] }));
    expect(spy.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([['snapshot'], ['tokens']]);
  });
});

describe('runFlush and the cached snapshot', () => {
  it('refreshes the snapshot only when something was sent', async () => {
    const spy = vi.spyOn(qc, 'invalidateQueries');
    expect(await runFlush(qc)).toEqual({ sent: 0, stop: 'done' });
    expect(spy).not.toHaveBeenCalled();
    vi.mocked(flushOutbox).mockResolvedValueOnce({ sent: 2, stop: 'done' });
    expect(await runFlush(qc)).toEqual({ sent: 2, stop: 'done' });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['snapshot'] });
  });

  it('reads back only a schema-valid cached snapshot', async () => {
    vi.mocked(kvGet).mockResolvedValueOnce(makeSnapshot());
    expect(await readCachedSnapshot()).toEqual(makeSnapshot());
    vi.mocked(kvGet).mockResolvedValueOnce({ tasks: 'corrupt' });
    expect(await readCachedSnapshot()).toBeNull();
    vi.mocked(kvGet).mockRejectedValueOnce(new Error('blocked'));
    expect(await readCachedSnapshot()).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm --prefix web test -- src/domain/tasks.test.ts src/state`
Expected: FAIL — `Error: Cannot find module './tasks' imported from /home/p4nic/code/noema/web/src/domain/tasks.test.ts`, `Error: Cannot find module './queryClient' imported from /home/p4nic/code/noema/web/src/state/queryClient.test.ts` and `Error: Cannot find module './queryClient' imported from /home/p4nic/code/noema/web/src/state/queries.test.tsx`.

- [ ] **Step 3: Create `web/src/domain/tasks.ts`**

```ts
// Task field helpers shared by the data layer (contract §4.5). 02-screens-core Task 3 adds the rest of this module.
import type { Task, TaskEditable } from '../api/schemas';

export const TASK_EDIT_FIELDS = ['title', 'project', 'detail', 'next_action', 'status', 'priority', 'due_at', 'not_before', 'planned_on', 'estimate_minutes', 'dependencies', 'session_url'] as const; // app.js:343,382

export function editableFields(task: Task): TaskEditable {
  return {
    title: task.title,
    project: task.project,
    detail: task.detail,
    next_action: task.next_action,
    status: task.status,
    priority: task.priority,
    due_at: task.due_at,
    not_before: task.not_before,
    planned_on: task.planned_on,
    estimate_minutes: task.estimate_minutes,
    dependencies: task.dependencies,
    session_url: task.session_url,
  };
}
```

- [ ] **Step 4: Create `web/src/state/queryClient.ts`**

```ts
// Server-state defaults (spec §4.3): never paused by OS "offline" reports, mutations never retried, queries retried at
// most twice on network errors and 5xx.
import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';

export const SNAPSHOT_INTERVAL_MS = 15_000;

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < 2 && error instanceof ApiError && (error.kind === 'network' || (error.status !== null && error.status >= 500));
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { networkMode: 'always', retry: shouldRetryQuery, refetchOnWindowFocus: false },
      mutations: { networkMode: 'always', retry: 0 },
    },
  });
}
```

- [ ] **Step 5: Create `web/src/state/queries.ts`**

```ts
// Queries and mutation hooks (spec §4.3, contract §4.6). Refetches update the cache only: screens copy server data into
// form state when they open, so a refetch never replaces in-progress input.
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { ApiError, call } from '../api/client';
import {
  ContextRuleSchema,
  FocusSchema,
  NoteSchema,
  NoteSummarySchema,
  OkSchema,
  ReminderCreatedSchema,
  RevisionSchema,
  RunSchema,
  SettingsSchema,
  SnapshotSchema,
  TaskSchema,
  TokenCreatedSchema,
  TokenSummarySchema,
  type Focus,
  type Note,
  type NoteSummary,
  type NoteUpdateBody,
  type Revision,
  type Run,
  type Settings,
  type SettingsPatch,
  type Snapshot,
  type Task,
  type TaskEditable,
  type TaskUpdateBody,
  type TokenCreated,
  type TokenSummary,
} from '../api/schemas';
import { fetchSnapshot } from '../api/session';
import { connection } from '../domain/connection';
import { editableFields } from '../domain/tasks';
import { SERVICE_UP } from '../events';
import { kvGet, kvPut } from '../local/db';
import { flushOutbox, type FlushResult } from '../local/outbox';
import { z } from '../zod';
import { SNAPSHOT_INTERVAL_MS } from './queryClient';

export const queryKeys = {
  snapshot: (minutes: number | null) => ['snapshot', minutes] as const,
  note: (id: string) => ['note', id] as const,
  noteHistory: (id: string) => ['note', id, 'history'] as const,
  search: (q: string) => ['search', q] as const,
  tokens: ['tokens'] as const,
};

const RevisionListSchema = z.array(RevisionSchema);
const NoteSummaryListSchema = z.array(NoteSummarySchema);
const TokenSummaryListSchema = z.array(TokenSummarySchema);
type Ok = z.infer<typeof OkSchema>;
type ContextRule = z.infer<typeof ContextRuleSchema>;
type ReminderCreated = z.infer<typeof ReminderCreatedSchema>;

// The Overview time budget is shared by every screen that reads the snapshot.
let budget: number | null = null;
const budgetListeners = new Set<() => void>();
const subscribeBudget = (listener: () => void) => {
  budgetListeners.add(listener);
  return () => {
    budgetListeners.delete(listener);
  };
};
const getBudget = () => budget;
function setBudget(minutes: number | null): void {
  budget = minutes;
  for (const listener of [...budgetListeners]) listener();
}

export function useTimeBudget(): readonly [number | null, (minutes: number | null) => void] {
  return [useSyncExternalStore(subscribeBudget, getBudget, getBudget), setBudget] as const;
}

export async function runFlush(qc: QueryClient): Promise<FlushResult> {
  const result = await flushOutbox();
  if (result.sent > 0) await qc.invalidateQueries({ queryKey: ['snapshot'] });
  return result;
}

export function useSnapshot(): UseQueryResult<Snapshot, ApiError> {
  const [minutes] = useTimeBudget();
  const qc = useQueryClient();
  const query = useQuery<Snapshot, ApiError>({
    queryKey: queryKeys.snapshot(minutes),
    queryFn: async () => {
      try {
        const snapshot = await fetchSnapshot(minutes);
        connection.report('state-success');
        void kvPut('snapshot', snapshot).catch(() => {});
        return snapshot;
      } catch (error) {
        connection.report('state-failure');
        throw error;
      }
    },
    refetchInterval: SNAPSHOT_INTERVAL_MS, // parity cadence: 15 s while visible
    refetchIntervalInBackground: false, // no fetch while hidden
    refetchOnWindowFocus: true, // TanStack's focus is document visibility: refetch on becoming visible
    refetchOnReconnect: true, // the window 'online' event
    placeholderData: keepPreviousData,
  });
  // Flush trigger: each visible snapshot tick (and the refetches on becoming visible and online).
  useEffect(() => {
    if (query.dataUpdatedAt > 0 && document.visibilityState === 'visible') void runFlush(qc);
  }, [query.dataUpdatedAt, qc]);
  return query;
}

export async function readCachedSnapshot(): Promise<Snapshot | null> {
  const stored = await kvGet('snapshot').catch(() => null);
  const parsed = SnapshotSchema.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

export function installRefetchTriggers(qc: QueryClient): () => void {
  const serviceUp = () => void qc.refetchQueries({ queryKey: ['snapshot'] });
  window.addEventListener(SERVICE_UP, serviceUp);
  return () => window.removeEventListener(SERVICE_UP, serviceUp);
}

export function useNote(id: string): UseQueryResult<Note, ApiError> {
  return useQuery<Note, ApiError>({ queryKey: queryKeys.note(id), queryFn: () => call('note', NoteSchema, { params: { id } }) });
}

export function useNoteHistory(id: string, enabled: boolean): UseQueryResult<Revision[], ApiError> {
  return useQuery<Revision[], ApiError>({ queryKey: queryKeys.noteHistory(id), queryFn: () => call('noteHistory', RevisionListSchema, { params: { id } }), enabled });
}

export function useSearch(q: string): UseQueryResult<NoteSummary[], ApiError> {
  return useQuery<NoteSummary[], ApiError>({ queryKey: queryKeys.search(q), queryFn: () => call('search', NoteSummaryListSchema, { query: { q } }), enabled: q !== '' });
}

export function useTokens(enabled: boolean): UseQueryResult<TokenSummary[], ApiError> {
  return useQuery<TokenSummary[], ApiError>({ queryKey: queryKeys.tokens, queryFn: () => call('tokens', TokenSummaryListSchema), enabled });
}

// Every mutation hook: no retry (QueryClient default), then invalidate the snapshot plus any extra keys.
function useApiMutation<V, R>(mutationFn: (variables: V) => Promise<R>, extraKeys: (variables: V) => QueryKey[] = () => []): UseMutationResult<R, ApiError, V> {
  const qc = useQueryClient();
  return useMutation<R, ApiError, V>({
    mutationFn,
    onSuccess: async (_data, variables) => {
      await Promise.all([['snapshot'], ...extraKeys(variables)].map((queryKey) => qc.invalidateQueries({ queryKey })));
    },
  });
}

export function useSetFocus(): UseMutationResult<Focus, ApiError, { taskId: string | null }> {
  return useApiMutation((v: { taskId: string | null }) => call('focus', FocusSchema, { body: { task_id: v.taskId, pinned: true } }));
}

// Complete/reopen/priority re-read the task and PUT with the fresh version (app.js:382).
export function usePatchTask(): UseMutationResult<Task, ApiError, { id: string; changes: Partial<TaskEditable> }> {
  return useApiMutation(async (v: { id: string; changes: Partial<TaskEditable> }) => {
    const fresh = await call('task', TaskSchema, { params: { id: v.id } });
    return call('taskUpdate', TaskSchema, { params: { id: v.id }, body: { ...editableFields(fresh), ...v.changes, expected_version: fresh.version } });
  });
}

export function useSaveTask(): UseMutationResult<Task, ApiError, { id: string; body: TaskUpdateBody }> {
  return useApiMutation((v: { id: string; body: TaskUpdateBody }) => call('taskUpdate', TaskSchema, { params: { id: v.id }, body: v.body }));
}

export function useUpdateNote(): UseMutationResult<Note, ApiError, { id: string; body: NoteUpdateBody }> {
  return useApiMutation(
    (v: { id: string; body: NoteUpdateBody }) => call('noteUpdate', NoteSchema, { params: { id: v.id }, body: v.body }),
    (v) => [queryKeys.note(v.id)],
  );
}

export function useRestoreNote(): UseMutationResult<Note, ApiError, { id: string; version: number; expectedVersion: number }> {
  return useApiMutation(
    (v: { id: string; version: number; expectedVersion: number }) =>
      call('noteRestore', NoteSchema, { params: { id: v.id, version: v.version }, body: { expected_version: v.expectedVersion } }),
    (v) => [queryKeys.note(v.id)],
  );
}

export function useApplySuggestion(): UseMutationResult<Note, ApiError, { id: string; sid: string; expectedVersion: number }> {
  return useApiMutation(
    (v: { id: string; sid: string; expectedVersion: number }) =>
      call('noteApplySuggestion', NoteSchema, { params: { id: v.id, sid: v.sid }, body: { expected_version: v.expectedVersion } }),
    (v) => [queryKeys.note(v.id)],
  );
}

export function useProcessNote(): UseMutationResult<Note, ApiError, { id: string; kind: 'organize' | 'transcribe' }> {
  return useApiMutation(
    (v: { id: string; kind: 'organize' | 'transcribe' }) => call(v.kind === 'organize' ? 'noteOrganize' : 'noteTranscribe', NoteSchema, { params: { id: v.id } }),
    (v) => [queryKeys.note(v.id)],
  );
}

export function useCreateReminder(): UseMutationResult<ReminderCreated, ApiError, { taskId: string; at: string }> {
  return useApiMutation((v: { taskId: string; at: string }) => call('reminderCreate', ReminderCreatedSchema, { body: { task_id: v.taskId, at: v.at } }));
}

export function useSnoozeReminder(): UseMutationResult<Ok, ApiError, { id: string }> {
  return useApiMutation((v: { id: string }) => call('reminderSnooze', OkSchema, { params: { id: v.id }, body: { minutes: 20 } }));
}

export function useDismissReminder(): UseMutationResult<Ok, ApiError, { id: string }> {
  return useApiMutation((v: { id: string }) => call('reminderDismiss', OkSchema, { params: { id: v.id } }));
}

export function useEndTracking(): UseMutationResult<Run, ApiError, { runId: string }> {
  return useApiMutation((v: { runId: string }) => call('runEndTracking', RunSchema, { params: { id: v.runId } }));
}

export function useUpdateSettings(): UseMutationResult<Settings, ApiError, SettingsPatch> {
  return useApiMutation((patch: SettingsPatch) => call('settingsUpdate', SettingsSchema, { body: patch }));
}

export function useCreateRule(): UseMutationResult<ContextRule, ApiError, { app: string; contains: string; task_id: string }> {
  return useApiMutation((v: { app: string; contains: string; task_id: string }) => call('ruleCreate', ContextRuleSchema, { body: v }));
}

export function useDeleteRule(): UseMutationResult<Ok, ApiError, { id: string }> {
  return useApiMutation((v: { id: string }) => call('ruleDelete', OkSchema, { params: { id: v.id } }));
}

export function useCreateToken(): UseMutationResult<TokenCreated, ApiError, { name: string; scope: 'agent' | 'observer'; task_ids: string[] }> {
  return useApiMutation(
    (v: { name: string; scope: 'agent' | 'observer'; task_ids: string[] }) => call('tokenCreate', TokenCreatedSchema, { body: v }),
    () => [queryKeys.tokens],
  );
}

export function useRevokeToken(): UseMutationResult<Ok, ApiError, { id: string }> {
  return useApiMutation((v: { id: string }) => call('tokenRevoke', OkSchema, { params: { id: v.id } }), () => [queryKeys.tokens]);
}
```

- [ ] **Step 6: Run them to verify they pass, then the whole unit suite**

Run: `npm --prefix web test -- src/domain/tasks.test.ts src/state && npm --prefix web test && npm --prefix web run typecheck`
Expected: PASS (15 tests: tasks 1, queryClient 2, queries 12), then the whole suite PASS (129 tests in 21 files); `tsc` exits 0.

- [ ] **Step 7: Commit**

```bash
git add web/src/domain/tasks.ts web/src/domain/tasks.test.ts web/src/state/queryClient.ts web/src/state/queryClient.test.ts web/src/state/queries.ts web/src/state/queries.test.tsx
git commit -m "feat(web): add the query client, snapshot cadence and mutation hooks without retries"
```

---

### Task 19: Phase-1 boot, upgrade and reconnect E2E, cookie-only boot (spec §8 E2E Upgrade and Cookie-only access; parity rows 64, 77, 78, 85, 86)

**Files:**
- Modify: `web/src/main.tsx` (replace the Task 5 body; `02-screens-core.md` Task 14 replaces it again with the full boot order, which keeps boot and `runFlush`)
- Create: `web/e2e/outbox.spec.ts`
- Modify: `web/e2e/serving.spec.ts` (import lines at the top; append one test)
- Test: `web/e2e/outbox.spec.ts`, `web/e2e/serving.spec.ts`

**Interfaces:**
- Consumes: `boot` (Task 13), `connection`, `installConnectionListeners` (Task 11), `flushOutbox` (Task 17), `registerServiceWorker` (Task 5); E2E `test`, `expect`, `seedLocalDb`, `readLocalDb`, `SeedDraft` (Task 8), `startNoema`, `E2E_TOKEN`, `NoemaServer` (Task 8), `loseAck` (Task 9); `S.savedTo` (Task 3).
- Produces: the minimal page now runs contract §6.6 steps 5 and 8 (boot; on `ready`, report `state-success` and flush the outbox), so captures queued by the old UI upload after the upgrade. Test titles are the parity labels of rows 64, 77, 78, 85 and 86 plus the spec §8 upgrade and cookie-only tests. Every assertion holds unchanged after `02-screens-core.md` replaces `main.tsx` (its boot also uses the cookie first and flushes after boot; lost acknowledgements are lost on every retry of the first page, so a 15 s refetch cannot hide them).

- [ ] **Step 1: Write the failing outbox E2E `web/e2e/outbox.spec.ts`**

```ts
import type { Page } from '@playwright/test';
import { S } from '../src/strings';
import { loseAck } from './faults';
import { expect, readLocalDb, seedLocalDb, test, type SeedDraft } from './fixtures';
import { E2E_TOKEN, type NoemaServer } from './server';

// public/app.js wrote these shapes; v1 outbox items carry no `error` key until a rejection.
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3l0AAAAASUVORK5CYII=';
const QUEUED: SeedDraft = { id: '6f1c2b8e-3d4a-4c5b-9e6f-7a8b9c0d1e2f', raw: 'Queued by the old UI', task_id: '', files: [{ name: 'heap.png', type: 'image/png', base64: PNG_1PX }] };

type NoteRow = { id: string; folder: string; processing: string };
type NoteBody = NoteRow & { raw: string; attachments: { id: string; name: string; mime: string; size: number }[] };

const notes = (noema: NoemaServer) => noema.api<NoteRow[]>('GET', '/api/search');
const outboxIds = async (page: Page) => (await readLocalDb(page)).outbox.map((item) => item.id);

async function openApp(page: Page, noema: NoemaServer): Promise<void> {
  await page.goto(noema.origin + '/');
  await expect(page.locator('#root [data-quiet]').first()).toBeVisible();
}

test('Upgrade: a v1 outbox item and drafts upload exactly once with the original id', async ({ page, noema }) => {
  const draft: SeedDraft = { id: 'draft-v1-0001', raw: 'still typing', task_id: '', files: [] };
  const taskDraft = { id: 'task-draft-v1-01', raw: 'Review cleanup', fields: { project: 'CTF' }, pending: null };
  await seedLocalDb(page, noema.origin, { draft, taskDraft, outbox: [QUEUED] });
  await openApp(page, noema);
  await expect.poll(async () => (await notes(noema)).map((note) => note.id)).toEqual([QUEUED.id]);
  await expect.poll(() => outboxIds(page)).toEqual([]);
  await page.reload();
  await expect(page.locator('#root [data-quiet]').first()).toBeVisible();
  expect((await notes(noema)).map((note) => note.id)).toEqual([QUEUED.id]);
  const local = await readLocalDb(page);
  expect(local.draft).toEqual({ ...draft, files: [] }); // drafts stay on the device; Save is the only notebook boundary
  expect(local.taskDraft).toEqual(taskDraft);
});

test('Reconnect flushes queued capture to real server', async ({ page, noema }) => {
  await openApp(page, noema); // installs the service worker, so the shell opens while the server is down
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
  await noema.kill();
  await page.reload();
  await expect(page.locator('#root [data-quiet]').first()).toBeVisible();
  await page.evaluate(async (item) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('noema-local-v1', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('outbox', 'readwrite');
      tx.objectStore('outbox').put({ id: item.id, raw: item.raw, task_id: '', files: [] });
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, QUEUED);
  await noema.restart();
  await page.reload();
  await expect.poll(async () => (await notes(noema)).map((note) => note.id)).toEqual([QUEUED.id]);
  await expect.poll(() => outboxIds(page)).toEqual([]);
});

test('Reconnect receives matching real server acknowledgment', async ({ page, noema }) => {
  await seedLocalDb(page, noema.origin, { outbox: [QUEUED] });
  const acknowledged = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/captures');
  await openApp(page, noema);
  const response = await acknowledged;
  expect(response.status()).toBe(201);
  const note = (await response.json()) as NoteBody;
  expect(note).toMatchObject({ id: QUEUED.id, raw: QUEUED.raw });
  await expect(page.getByText(S.savedTo(note.folder, note.processing), { exact: true })).toBeVisible();
});

test('Reconnect delivers one original note and exact attachment bytes', async ({ page, noema }) => {
  await seedLocalDb(page, noema.origin, { outbox: [QUEUED] });
  await openApp(page, noema);
  await expect.poll(() => outboxIds(page)).toEqual([]);
  const note = await noema.api<NoteBody>('GET', `/api/notes/${QUEUED.id}`);
  expect(note).toMatchObject({ raw: QUEUED.raw, attachments: [{ name: 'heap.png', mime: 'image/png', size: 68 }] });
  const bytes = await (await fetch(`${noema.origin}/api/attachments/${note.attachments[0].id}`, { headers: { Authorization: `Bearer ${E2E_TOKEN}` } })).arrayBuffer();
  expect(Buffer.from(bytes).toString('base64')).toBe(PNG_1PX);
  expect((await notes(noema)).length).toBe(1);
});

test('Lost server acknowledgment retains queued capture ID', async ({ page, noema }) => {
  await loseAck(page, '/api/captures', 100); // every acknowledgement on this page is lost, however often the app retries
  await seedLocalDb(page, noema.origin, { outbox: [QUEUED] });
  await openApp(page, noema);
  await expect.poll(async () => (await notes(noema)).map((note) => note.id)).toEqual([QUEUED.id]); // the server stored it
  expect(await outboxIds(page)).toEqual([QUEUED.id]); // the page never saw the acknowledgement, so the item stays queued
  expect((await notes(noema)).length).toBe(1); // replays with the same capture_id never duplicate the note
});

test('Browser/server restart retries lost acknowledgment without duplicate notes', async ({ page, noema }) => {
  await loseAck(page, '/api/captures', 100);
  await seedLocalDb(page, noema.origin, { outbox: [QUEUED] });
  await openApp(page, noema);
  await expect.poll(async () => (await notes(noema)).length).toBe(1);
  expect(await outboxIds(page)).toEqual([QUEUED.id]);
  await noema.restart();
  const fresh = await page.context().newPage(); // loseAck is per page: this page sees real acknowledgements
  await openApp(fresh, noema);
  await expect.poll(() => outboxIds(fresh)).toEqual([]);
  expect((await notes(noema)).map((note) => note.id)).toEqual([QUEUED.id]);
});
```

- [ ] **Step 2: Append the cookie-only boot test to `web/e2e/serving.spec.ts`**

Replace the import lines at the top of `web/e2e/serving.spec.ts` with:
```ts
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { expect, test } from './fixtures';
import { E2E_TOKEN, startNoema, WEB_DIST } from './server';
```
Append:
```ts
// A phone or tablet on the LAN: plain HTTP, a non-loopback Host and only the session cookie (spec §8 "Cookie-only access").
test('a non-loopback Host with only a valid cookie reaches the shell and the API', async () => {
  const noema = await startNoema({ env: { NOEMA_ALLOWED_HOSTS: 'noema.test' } });
  const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP noema.test 127.0.0.1'] });
  try {
    const origin = `http://noema.test:${noema.port}`;
    const context = await browser.newContext();
    await context.addCookies([{ name: 'noema_session', value: E2E_TOKEN, url: origin, httpOnly: true, sameSite: 'Strict' }]);
    const page = await context.newPage();
    // This page is outside the auto fixtures, so it records its own page errors and CSP violations.
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const w = window as unknown as { __csp: string[] };
      w.__csp = [];
      document.addEventListener('securitypolicyviolation', (event) => w.__csp.push(event.effectiveDirective));
    });
    const sessionCalls: string[] = [];
    const stateStatuses: number[] = [];
    page.on('response', (response) => {
      const path = new URL(response.url()).pathname;
      if (path === '/api/session') sessionCalls.push(response.request().method());
      if (path === '/api/state') stateStatuses.push(response.status());
    });
    await page.goto(origin + '/');
    await expect(page.locator('#root [data-quiet]').first()).toBeVisible();
    expect(await page.evaluate(() => ({ secure: window.isSecureContext, worker: 'serviceWorker' in navigator }))).toEqual({ secure: false, worker: false });
    await expect.poll(() => stateStatuses[0]).toBe(200); // the app's own boot request used the cookie
    expect(stateStatuses).not.toContain(401);
    expect(sessionCalls).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await noema.stop();
  }
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npm --prefix web run build && npm --prefix web run e2e -- e2e/outbox.spec.ts e2e/serving.spec.ts`
Expected: 4 PASS (the Task 8 serving tests) and 7 FAIL, because the Task 5 page never boots or flushes: the upgrade and reconnect tests time out in `expect.poll` (`Expected: ["6f1c2b8e-3d4a-4c5b-9e6f-7a8b9c0d1e2f"]`, `Received: []`), "Reconnect receives matching real server acknowledgment" times out in `page.waitForResponse`, and the cookie-only test fails with `Expected: 200`, `Received: undefined`.

- [ ] **Step 4: Replace `web/src/main.tsx`**

```tsx
// Minimal P1 entry (contract §1.3) plus boot and the outbox flush of contract §6.6 steps 5 and 8, so captures queued by
// the old UI upload after the upgrade (spec §8). 02-screens-core Task 14 replaces this body with the full boot order.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { boot } from './api/session';
import { connection, installConnectionListeners } from './domain/connection';
import { flushOutbox } from './local/outbox';
import { registerServiceWorker } from './shell/serviceWorker';
import './styles/base.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <StrictMode>
    <main data-quiet>
      <h1>Noema</h1>
    </main>
  </StrictMode>,
);
installConnectionListeners();
void boot().then(async (result) => {
  if (result.kind !== 'ready') return;
  connection.report('state-success');
  await flushOutbox();
});
registerServiceWorker();
```

- [ ] **Step 5: Rebuild and run them to verify they pass**

Run: `npm --prefix web run build && npm --prefix web run e2e -- e2e/outbox.spec.ts e2e/serving.spec.ts`
Expected: PASS (11 tests) with no CSP violation or page error.

- [ ] **Step 6: Run every Phase-1 gate**

```bash
cd /home/p4nic/code/noema
npm --prefix web ci && npm --prefix web run build && npm --prefix web test && npm --prefix web run e2e && .venv/bin/python -m pytest
```
Expected: `ci` succeeds from the lockfile; build passes (`check-hashes` silent); Vitest PASS (129 tests in 21 files); Playwright PASS (25 tests: serving 5, harness 9, sw 5, outbox 6); pytest as in Task 10 Step 6.

- [ ] **Step 7: Commit**

```bash
git add web/src/main.tsx web/e2e/outbox.spec.ts web/e2e/serving.spec.ts
git commit -m "feat(web): boot and flush queued captures from the minimal page"
```

---

## Spec coverage

| Spec bullet in scope | Task |
|---|---|
| §3 Branch `feat/react-electron`; all work on it | 1 |
| §3 Node 22.x pinned in `.nvmrc` and `engines` | 2 |
| §3 Exact versions with lockfiles in `web/` (React, zod, TanStack, Vite, TypeScript, Vitest, Playwright) | 2 |
| §3 Exact versions with lockfile in `electron/` | `05-electron.md` |
| §3 `web/dist` not committed, gitignored, built by `ci` + `build` | 2 (`.gitignore`), 5 (build), 10 (gate) |
| §3 README lists Node; `SHA256SUMS` regenerated; deletions and sprite move at cutover | `06-cutover.md` |
| §3 Gate commands `web ci/build/test/e2e`, pytest | 2–10 (all green in Task 10 Step 6) |
| §3 Gate command `npm --prefix electron test` | `05-electron.md` |
| §4.1 Module layout (`api/ local/ domain/ state/ routes/ screens/ dialogs/ capture/ ui/`) | `api/`, `local/`, `domain/connection,format`, `state/`: 11–18; the rest `02-screens-core.md`, `03-screens-capture-notes.md`, `04-terrain.md` (contract §1.2) |
| §4.1 Runtime dependencies at exact versions | 2 |
| §4.1 zod `z.config({ jitless: true })` before any schema | 2 (`zod.ts`, `zod.test.ts`) |
| §4.1 Fonts/images imported from `src`; `assetsInlineLimit: 0` | 2 (config), 5 (fonts in `base.css`), 8 (fonts hashed E2E) |
| §4.1 `web/public` holds only manifest, icon, `sw.js` | 5 |
| §4.2 API client: same origin, marker header, JSON/FormData bodies, error normalisation by body shape, zod parsing; boot order; `/api/session` 401 exemption | 12 (schemas), 13 (`client.test.ts`, `session.test.ts`), 19 (cookie-only boot E2E); Unlock dialog, stacking and after-unlock refresh/flush: `02-screens-core.md` Tasks 6, 13 |
| §4.3 QueryClient (`networkMode: 'always'`, no mutation retries, ≤ 2 query retries), connection, snapshot cadence/refetch triggers/`kv.snapshot`, replay policy table and its test, `expected_version` re-read | 11 (`connection.test.ts`, `endpoints.test.ts`), 18 (`queryClient.test.ts`, `queries.test.tsx`); "Last known" labels and form-state copying: `02-screens-core.md`, `03-screens-capture-notes.md` |
| §4.4 Database, invariants, flush, flush triggers (boot 19, visible tick/visible/online 18), validation, task capture | 14 (`db.test.ts`, `limits.test.ts`), 15 (`drafts.test.ts`), 16 (`taskDraft.test.ts`), 17 (`outbox.test.ts`), 19 (upgrade/reconnect E2E); harness 8; fault helpers 9; after-save and after-unlock triggers, rejection toasts and the picker `accept`: `02-screens-core.md`, `03-screens-capture-notes.md` |
| §4.4 Labels and toasts copied verbatim; full list extracted in the first task | 1 (parity map Section B), 3 (`S`, verbatim check) |
| §4.5 Routes, modal routes, legacy rewrite, guards, keyboard | `02-screens-core.md` Tasks 7, 8, 9, 14 (contract §6.1); SW offline test walks the route hashes (10) |
| §4.6 Content and accessibility | `02-screens-core.md`, `03-screens-capture-notes.md` (handbook-trace rows); Phase-1 toast stand-in uses `role=status aria-live=polite` / `role=alert` (15) |
| §4.7 Product rules, UI direction, compute | handbook-trace rows R1–R9, U1–U25, C1–C3 (1); R9/C1 tested in 8 |
| §4.7 `display_name`: `SettingsInput.display_name` (strip, max 60), `DEFAULT_SETTINGS['display_name'] = ''`, tested in `test_core.py` | 7 |
| §4.7 Slogans kept in `copy.ts` (18B); greeting from `display_name` | `02-screens-core.md` Task 1 (trace U2–U4); `SettingsSchema.display_name` 12 |
| §4.7 Traceability file `handbook-trace.md` | 1 |
| §5 First task extracts every flow and string of `app.js` into a checklist | 1 |
| §6.1 `create_app` dist parameter (default `<repo>/web/dist`) | 6 |
| §6.1 Explicit routes and Cache-Control table | 6 (pytest), 8 (real build E2E) |
| §6.1 Build check fails on an unhashed asset | 4 (script + tests), 5 (wired into `build`) |
| §6.1 Manifest `start_url`, `scope`, `id` = `/` | 5, 6, 8 |
| §6.1 503 page when `index.html` is missing; API keeps working | 6 |
| §6.1 `/static`, `/companion`, `public/` serving removed | 6 (pytest 404s), 8 (E2E 404s) |
| §6.1 `protect()` unchanged | 6 (no edit; CSP/X-Frame-Options/401 asserted) |
| §6.1 No inline scripts; modulepreload polyfill disabled | 2 (config), 5 (dist check), 8 (E2E + CSP fixture) |
| §6.2 Cache name `noema-shell-<buildhash>` from the precache step | 4 |
| §6.2 Precache every Vite output file + `/`, manifest, icon; exclude `sw.js` and maps | 4 (unit), 10 (real build) |
| §6.2 `install` precache then `skipWaiting` | 5 (code), 10 (control test) |
| §6.2 `activate` deletes other `noema-shell-*` incl. `noema-shell-v1`, then `clients.claim()` | 5 (code), 10 (two builds, v1 takeover) |
| §6.2 `/assets/*` cache-first with network fallback, caching OK responses | 10 |
| §6.2 Navigations network-first; network error or 5xx → cached `/` | 10 |
| §6.2 Only OK responses cached; `/api/`, cross-origin, non-GET untouched | 10 (code; `/api/` offline assertion; 503 pass-through) |
| §6.2 `vite:preloadError` saves drafts then offers reload | `03-screens-capture-notes.md` (`preloadError.ts`); `S.updateReady`/`S.reload` in 3 |
| §6.3–6.4 Electron shell and managed lifecycle | `05-electron.md` |
| §7 Terrain | `04-terrain.md` |
| §8 Rule: parity map from the listed source suites | 1 |
| §8 Fault injection through `page.addInitScript`, no production hooks | 9 |
| §8 Unit tests: api (marker, error normalisation, boot order, `/api/session` exemption, jitless), local (atomic save, `add` duplicate, abort rollback, quota, serialised writes, single-flight, key order, stop rules, lost-ack replay, limits, `local_day` across midnight), domain (`connected`, replay list), state (cadence, `networkMode`, no replay on reconnect) | 2, 11–18; domain `now_state` cases and routes: `02-screens-core.md`; field: `04-terrain.md` |
| §8 E2E harness: real FastAPI on a throwaway data dir and free port | 8 |
| §8 E2E Upgrade: seeded old-shape outbox item uploads exactly once | 19 (`outbox.spec.ts` › "Upgrade: a v1 outbox item and drafts upload exactly once with the original id"); seed/read helpers 8 |
| §8 E2E Service worker: takeover from v1, two builds purge, offline cold boot with lazy chunk and fonts | 10 |
| §8 E2E CSP: listener from the first navigation records zero violations | 8 (`csp` auto fixture on every test) |
| §8 E2E Cookie-only: non-loopback Host with a valid cookie never shows Unlock | 19 (boot answers 200 from the cookie, no `/api/session` call, no CSP violation or page error); the Unlock dialog assertion: `02-screens-core.md` `boot.spec.ts` |
| §8 E2E Refetch, navigation guards | `02-screens-core.md`, `03-screens-capture-notes.md` |
| §8 Python: `test_core.py` static split (503 / routes with `tmp_path` dist) | 6 |
| §8 Python: managed tests, `test_companion.py` sprite path | `05-electron.md`, `06-cutover.md` |
| §11 AI priority, daily slogans | Not built (owner decisions 19A/18B); the `S`/`COPY` split keeps all slogan copy in one module for §11.2 |
