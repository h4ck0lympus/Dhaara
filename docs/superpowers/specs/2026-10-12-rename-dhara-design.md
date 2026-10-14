# Rename Noema → Dhara — design (Phase 6)

Date: 2026-10-12 · Status: **draft for owner review, not committed** · Owner: Vishal Juneja
Decisions: 21C (full rename incl. Python package, DB/cookie/header names, with compatibility
shims and migration tests) · 22C ("Dhara" only; धारा mentioned once in the README).

## 1. Goal and scope

Rename the product and every identifier derived from "Noema" to "Dhara" without losing any
user data or breaking an existing install, then keep the migration shims for one release.

**Runs as Phase 6:** after the cutover plan's Task 12 (docs and SHA256SUMS) and before the single
merge (Task 13). The cutover docs are therefore rewritten once more here, as a mechanical
sweep. The owner tests "Dhara" after Phase 6; the merge needs explicit owner approval.

**Out of scope:** the git repository directory name (`/home/p4nic/code/noema`, owner's
filesystem), branch names, commit history, the archived product handbook
(`docs/Noema-Handbook.md`, `docs/Noema-Documentation/`) and the experiment evidence under
`experiments/ui-ab/` — all historical. README states "Dhara (formerly Noema; the product
handbook still uses the old name)". Ruling, reversible by the owner.

## 2. Inventory (branch at Phase 5, excluding deleted trees and archives)

| Class | Today | Hits |
|---|---|---|
| Brand text | "Noema" in UI copy, titles, docs, Electron app name, manifest | ~205 |
| Python package | `noema/` (`from noema …` in run.py, tests, qa, tools) | 17 imports |
| Env vars | `NOEMA_DATA_DIR`, `NOEMA_ACCESS_TOKEN`, `NOEMA_ALLOWED_HOSTS`, `NOEMA_MODEL`, `NOEMA_SPEECH_MODEL`, `NOEMA_ALLOW_REMOTE_MODEL`, `NOEMA_TOKEN`, `NOEMA_ELECTRON_TEST*`, QA `NOEMA_QA_*` | 128 |
| Cookie | `noema_session` | 4 |
| Request marker | `X-Noema-Request` | 11 |
| IndexedDB | `noema-local-v1` | 18 |
| Service worker | `noema-shell-<hash>` cache prefix | 9 |
| Workspace lock | `.noema-service.lock` | 1 |
| Profile path | `~/.local/share/noema/electron` (XDG) | 2 |
| DOM events / globals | `noema:checkpoint-close`, `noema:close-approved`, `noema:service-down/up`, `__noemaCheckpointCloseReady`, `__noemaField` | 64 |
| Package names | `noema-local` (pyproject), web/electron `name` | 3 |
| Test fixtures | `noema: NoemaServer`, `noema.api(...)` | ~1000 |

## 3. Naming rules

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

Case rules: `Dhara` in prose and titles; `dhara` in identifiers; `DHARA` in env vars. Never
"DHARA" in prose, never "dhara" at sentence start.

## 4. Compatibility shims (kept for one release; each removed by a dated follow-up)

### 4.1 Env vars
Each read goes through one helper: `env('DATA_DIR')` returns `DHARA_DATA_DIR`, else
`NOEMA_DATA_DIR` (logging one deprecation line per process when the old name is used), else
the default. Python: `dhara/env.py`; Electron: `electron/src/env.ts`. The managed-launch
environment stripping removes BOTH prefixes. `tools/` and `qa/` use the same helper.

### 4.2 Session cookie
The server sets `dhara_session` on login and reads `dhara_session`, falling back to
`noema_session`. An old cookie keeps a user logged in until it expires (14 days); the next
login or `POST /api/session` refresh writes the new name and clears the old one. The
browser/Electron profile is untouched.

### 4.3 Request marker
`protect()` accepts `X-Dhara-Request: 1` or `X-Noema-Request: 1` for cookie-authenticated
non-GET requests. The web client, `tools/client.py` and `tools/agent.py` send the new header
only.

### 4.4 IndexedDB (data-loss sensitive)
On boot, before the draft store loads, `local/migrate.ts` runs once:
1. If `dhara-local-v1` has any record, do nothing.
2. Else if `noema-local-v1` exists: open it read-only, copy every `kv` entry and every
   `outbox` record (Blobs included) into `dhara-local-v1` inside one readwrite transaction
   per store (`add`, so a half-done earlier run cannot duplicate), then delete
   `noema-local-v1` only after both transactions committed.
3. Any failure leaves BOTH databases as they were and shows "Local data could not be
   migrated; keep this page open and retry" (existing retry pattern); the old DB is never
   deleted on failure.
Capture ids are preserved, so a queued capture uploads once with its original id.
`onblocked` (another tab holding the old DB) reports "Close other Dhara tabs".

### 4.5 Service worker
New prefix `dhara-shell-<hash>`; `activate` deletes every `noema-shell-*` and every other
`dhara-shell-*` cache. The upgrade E2E seeds a `noema-shell-v1`-controlled page and asserts
takeover.

### 4.6 Electron profile path
On startup, before `setPath('userData')`: if the new profile directory does not exist and the
old one does, rename the directory (same filesystem; atomic). If rename fails, keep using the
old path and log one line. The single-instance lock follows the path.

### 4.7 Workspace lock
`.dhara-service.lock`. An old `.noema-service.lock` in a workspace is ignored (stale lock
files are harmless; both shells that used it are gone or renamed).

### 4.8 Python package
`noema/` → `dhara/`. A one-file shim package `noema/__init__.py` re-exports `dhara` with a
`DeprecationWarning` so external scripts (`from noema.server import create_app`) keep working
for one release; `tools/` and `qa/` are updated to `dhara`.

## 5. Order of work (plan phases)

1. **Mechanical rename** with the shims: Python package + shim, env helper, cookie, marker,
   locks, event/global names, package names, fixtures, brand text (one sweep; `git mv`
   where paths change). Build/typecheck/unit green.
2. **Migrations:** IndexedDB migrate module, SW prefix purge, profile rename, each with
   unit tests (fake-indexeddb / temp HOME) and the E2E upgrade tests below.
3. **Docs sweep:** README (with the single धारा mention and the "formerly Noema" line),
   docs/*.md rewritten by Phase 5 (mechanical replace + the compatibility section in
   DESKTOP/SECURITY), parity-map/handbook-trace titles re-pointed where test titles changed,
   SHA256SUMS regenerated.
4. **Gate** (same command, package names updated) with the Phase 5 flake rule.

## 6. Tests (new, all must pass)

- Env fallback (pytest + vitest): new name wins; old name read with a deprecation log;
  neither → default; managed launch strips both prefixes.
- Cookie fallback (pytest): old `noema_session` authenticates; login sets `dhara_session`
  and clears the old cookie; no cookie → 401.
- Marker fallback (pytest): either header accepted; none → 403.
- IndexedDB migration (vitest, fake-indexeddb): old DB with drafts + outbox (with Blobs) →
  migrated once, ids preserved, old DB deleted; failure mid-copy leaves both intact;
  second boot is a no-op; E2E: seed `noema-local-v1` with a queued capture → after the
  renamed build boots it uploads exactly once with its original `capture_id`.
- SW takeover (E2E): page controlled by `noema-shell-*` → `dhara-shell-*`, old caches gone.
- Profile rename (electron unit, temp HOME): old dir moved; rename failure keeps old path.
- Python shim (pytest): `import noema` warns and exposes `create_app`.
- Grep gates: no `Noema`/`noema` outside the allowed set (archives, experiments evidence,
  shims, migration code, this spec/plans, commit history); no `NOEMA_` reads outside the env
  helper.

## 7. Risks

| Risk | Handling |
|---|---|
| Queued captures lost in the DB rename | Copy-then-delete with `add`; old DB kept on any failure; E2E upgrade test |
| User logged out by the cookie rename | Dual-read for 14 days; new cookie written on next login |
| External agent scripts using `NOEMA_*` / old header | Dual-read shims for one release; documented |
| Profile rename on a different filesystem | Fallback to the old path |
| Handbook still says Noema | Out of scope by ruling; README explains; owner can rename the handbook |

## 8. Owner decisions on the plan (2026-10-12)

- 25A: plan approved with its mechanical deviations (Task order 1↔2; localStorage keys
  `noema-notifications`/`noema-sidebar-collapsed` renamed with a one-line read fallback;
  Electron package `dhara-desktop` + `productName: Dhara`; logout clears both cookie names).
- 26A: §4.4 step 1 is replaced by the plan's rule — the old database absent is the no-op;
  otherwise copy only the records whose keys are missing, in one readwrite transaction over
  both stores, then delete the old database only after the commit (never on failure).
- 27B: the notebook file `noema.sqlite3` IS renamed — §4.9 below.

### 4.9 SQLite notebook file (decision 27B)
Before the store opens the database: if `<data>/dhara.sqlite3` does not exist and
`<data>/noema.sqlite3` does, and neither `noema.sqlite3-wal` nor `noema.sqlite3-shm` exists
(a clean close), rename `noema.sqlite3` → `dhara.sqlite3` (same directory; atomic). If the
side files exist or the rename fails, keep opening `noema.sqlite3` and log one line; the next
clean start retries. If both files exist, never move or delete anything — open
`dhara.sqlite3` and log that the old file was left in place. Tests (pytest, temp data dir):
old-only → renamed; `-wal` present → kept + logged; both present → untouched + logged;
`os.rename` raising → old path used + logged; second start → no-op.
