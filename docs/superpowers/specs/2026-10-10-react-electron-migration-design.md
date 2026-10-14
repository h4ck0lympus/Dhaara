# React + Electron migration — design

Date: 2026-10-10 · Revision 2 (after review) · Status: **draft for owner review, not committed** · Owner: Vishal Juneja

## 1. Goal and scope

This migration replaces the production web UI (`public/`, plain JS) and the Rust
Wry/Tao desktop shell (`desktop/`) with variant B. Variant B is a typed React
frontend served by the existing FastAPI service. It runs both in ordinary browsers
(including the phone-width PWA) and in an Electron desktop shell.

**Success means:**
- Every behavioural guarantee of the current UI still holds (§8 parity gate).
- The variant B look ships.
- The Electron shell runs the same bundle against the real service, in both
  external and managed mode.
- The WebGL terrain meets the measured budget in §7.

**Out of scope:**
- The desktop kitten:
  - The Electron companion prototype is not carried over.
  - The Python Sway helper keeps working. Its only change is the sprite path
    (§3).
  - The browser kitten preview (`/companion`, `public/companion.*`, the in-app
    `#companion-launch` button) is removed.
  - Kitten **settings** (observation, mode, size) stay in Settings because the
    Python helper reads them from the server.
- Audio checkpoint/recovery and long-capture processing, AI-assigned priority
  (§11.1) and daily slogans (§11.2). These are follow-on milestones.
- Backend data-model or API-semantics changes, except the managed launch protocol
  (§6.4), frontend serving (§6.1) and the `display_name` setting (§4.7).
- A managed lifecycle on Windows/macOS, installers, Android.

## 2. Decisions record

| ID | Decision | Choice |
|---|---|---|
| 1A | Desktop host | Electron (variant B), based on the 2026-10-10 headless-Sway benchmark |
| 2A | Order | Migrate before audio recovery |
| 3A | Delivery | One React bundle served by FastAPI; Electron loads that origin |
| 4B | Rollout | Big-bang rewrite on one branch; single cutover merge |
| 5A/15B | Lifecycle | Managed mode is ported now; Node in Electron main; Python binds its own fixed port (§6.4) |
| 6C | Kitten | Deferred; Python Sway helper kept |
| 7A/16B | Terrain | Keep the look; full rework up front (§7) |
| 8A | Structure | Branch, parity gate, IndexedDB compatibility (§3, §8) |
| 9B | Libraries | TanStack Query + TanStack Router; no automatic mutation retries (§4.3) |
| 11C | Old WebKit profile | No special handling; accepted risk (§10) |
| 13B | Benchmark harness | Throwaway; numbers recorded once in TEST_REPORT |
| 17A | Dev loop | No dev proxy; `vite build --watch` against the real FastAPI origin |
| — | Spec | Not committed until the owner says so |
| 18B | Slogans | Variant B slogans kept in `web/src/copy.ts`; greeting uses a new `display_name` setting; daily rotation later (§11.2) |
| 19A | Priority | AI-assigned automatic priority is the next milestone (§11.1); the migration UI already shows the source label |
| — | Handbook | `docs/Noema-Handbook.md` is binding (§4.7). This migration deliberately supersedes only its §18/§27 "current static UI" decision. Per §18, the native shell's memory cost was measured before choosing it (benchmark below) |

Benchmark basis for 1A (private headless Sway, Iris Xe, median of 3):

| Metric | A: Wry/WebKitGTK | B: Electron/Chromium |
|---|---|---|
| Idle, host only | 347 MiB RAM + 233 MiB GPU | 269 MiB + 110 MiB |
| Window hidden | 10% of one core, 16% iGPU | 0.75%, 0% |
| No hardware GL | 431% CPU | 49% |
| Startup to ready | 0.98 s | 1.13 s |
| Wayland suite | pass; +56 MiB kept after churn | pass |

## 3. Structure, branch and cutover

```
web/        React + TypeScript + Vite (rebuilt from experiments/ui-ab/frontend)
electron/   Electron main, preloads, startup page, lifecycle module
noema/      FastAPI; serves web/dist
tools/      Python Sway helper etc.; sprite moves to tools/assets/cat.png
```

**Deleted at cutover:**
- `public/`
- `desktop/`
- `experiments/ui-ab/hosts/wry` (it depends on the `desktop` crate)
- `experiments/ui-ab/hosts/companion`

`public/cat.png` moves to `tools/assets/cat.png`. That requires a one-line path
change in `tools/sway_companion.py:271` and `tests/test_companion.py:15`; both are
recorded in `docs/ASSETS.md`. The experiment's evidence stays as history. Variant A
stays on its branch.

All work happens on `feat/react-electron`. `master` keeps the current UI until one
cutover merge, which is blocked until §8 passes in full.

**Phases** (each ends with green tests):
1. Foundation: `web/` scaffold, API client, IndexedDB layer, serving, service
   worker.
2. Screens (§5).
3. Terrain (§7).
4. Electron shell + lifecycle (§6.3–6.4).
5. Cutover (§9).

**Toolchain:**
- Node 22.x, pinned in `.nvmrc` and in `engines`.
- Exact versions with lockfiles in `web/` and `electron/`: Electron, Vite,
  TypeScript, Vitest, Playwright, React, zod, TanStack.
- `web/dist` is **not committed**. It is gitignored and built by
  `npm --prefix web ci && npm --prefix web run build`. The README lists Node as a
  requirement.
- `SHA256SUMS` is regenerated at cutover.

**Gate commands:**
- `npm --prefix web ci`
- `npm --prefix web run build`
- `npm --prefix web test` (Vitest)
- `npm --prefix web run e2e` (Playwright; starts `run.py` on a temporary data dir
  and a free port)
- `npm --prefix electron test` (Playwright `_electron` + lifecycle)
- `.venv/bin/python -m pytest`

## 4. Frontend architecture (`web/`)

### 4.1 Modules

```
api/       client.ts, schemas.ts (zod)
local/     db.ts, outbox.ts, drafts.ts
domain/    nowState.ts (ported pure Now logic), tasks.ts, connection.ts
state/     queryClient.ts, queries.ts
routes/    TanStack Router tree (hash history), legacy-hash rewrite
screens/   Now, Capture, Notes, NoteView, Plan
dialogs/   TaskCapture, TaskDetail, Settings, Outbox, Unlock
capture/   Recorder, Sketch, Attachments
ui/        Dialog, Toast, Icon, BackgroundField
```

**Runtime dependencies** (exact versions): `react`, `react-dom`, `zod`,
`@tanstack/react-query`, `@tanstack/react-router`.

- zod runs with `z.config({ jitless: true })`. It is set once before any schema is
  created, so zod never probes `new Function`, which the CSP blocks.
- Fonts and images are imported from `src`, so Vite content-hashes them.
  `build.assetsInlineLimit: 0`.
- There is no `public/` folder inside `web/` except `manifest.webmanifest`,
  `icon.svg` and `sw.js` (see §6.1).

### 4.2 API client (`api/client.ts`)

- Same origin only, with `credentials: 'same-origin'`.
- Every request sends `X-Noema-Request: 1`. Body is JSON unless it is `FormData`.
- **Error normalisation by body shape, not status:**
  - a `detail` string → message;
  - a `detail` array → joined validation messages;
  - a non-JSON or empty body → `Request failed (<status>)`.
- **Boot:**
  1. `GET /api/state`.
  2. Only on a 401, `POST /api/session {token:''}` (loopback auto-login).
  3. Only on a second 401, open Unlock.

  This way a non-loopback client that already holds a valid cookie never sees
  Unlock.
- **401 handling:**
  - Responses from `/api/session` are exempt from the global "401 → Unlock" rule; a
    wrong token shows an inline field error.
  - Unlock stacks over any open dialog and does not discard it.
  - After unlock: refresh the snapshot, then flush the outbox.
  - A 401 during task capture unfreezes the input, as today.
- Every response the UI consumes is parsed with a zod schema. A parse failure is an
  error state, never coerced.

### 4.3 Server state and replay policy

**QueryClient:**
- `networkMode: 'always'` for queries and mutations, so loopback calls are never
  paused by OS "offline" reports.
- `mutations.retry: 0`.
- Queries retry at most 2× on network errors and 5xx.

**Connection** (`domain/connection.ts`):
- `connected` is true only after the most recent `GET /api/state` succeeded.
- It becomes false immediately on any failed state fetch, on any network error from
  the client, on the window `offline` event, and on the desktop
  `noema:service-down` event (§6.4).
- It is unit-tested.

**Snapshot query:**
- Parity cadence: `refetchInterval` 15 s while visible, no fetch while hidden
  (`refetchIntervalInBackground: false`).
- Refetch on becoming visible, on `online`, and on `noema:service-up`.
- Every success is persisted to `kv.snapshot`. While disconnected, the last
  snapshot is shown with "Last known · " labels.
- **Refetches never replace in-progress input.** Capture, NoteView edit mode,
  TaskDetail, Settings and TaskCapture copy server data into local form state only
  when they open.

**Replay policy:**
- The UI **never automatically retries a mutation**.
- Two operations are *idempotent by key* and are replayed with the same key:
  - The capture outbox (`capture_id` = outbox record `id`) is replayed by its flush
    triggers (§4.4).
  - A task capture (`capture_id` = task draft `id`) is replayed only when the user
    clicks "Retry add task", using the persisted pending payload.
- Every other UI mutation is sent once per user action:
  - `POST /api/focus`
  - `PUT /api/tasks/{id}`
  - `PUT /api/notes/{id}`
  - `POST /api/notes/{id}/restore/{v}`
  - `POST /api/notes/{id}/suggestions/{sid}/apply`
  - `POST /api/notes/{id}/organize`
  - `POST /api/notes/{id}/transcribe`
  - `POST /api/reminders`
  - `POST /api/reminders/{id}/snooze`
  - `DELETE /api/reminders/{id}`
  - `POST /api/runs/{id}/end-tracking`
  - `PATCH /api/settings`
  - `POST /api/context/rules`
  - `DELETE /api/context/rules/{id}`
  - `POST/DELETE /api/tokens…`
  - `POST/DELETE /api/session`
- A unit test enumerates this list against the client's endpoint table.
- Every edit carries `expected_version`. A 409 shows a conflict prompt and never
  overwrites. Complete/reopen/priority re-read the task and PUT with the fresh
  version.

### 4.4 Local persistence (`local/`)

**Database:** `noema-local-v1`, **version 1**. It has the same stores and record
shapes as `public/app.js`, so items queued by the old UI stay valid:

- `kv['draft']`: `{id, raw, task_id, files: [{name, blob}]}`
- `kv['task-draft']`: `{id, raw, fields, pending}`
  - `pending`: `{capture_id, raw, local_day, details}`
  - `local_day` is the device-local `YYYY-MM-DD` at the first submit. It is replayed
    unchanged on retry, even across midnight.
- `kv['snapshot']`: the last `/api/state` body.
- `outbox` (`keyPath: 'id'`): `{id, raw, task_id, files: [{name, blob}], error?}`

**Invariants:**
- The transaction helper resolves on `oncomplete`; any exception aborts the
  transaction.
- Save is one `['kv','outbox']` readwrite transaction: `outbox.add(record)` (so a
  duplicate id fails) plus `kv.put(nextDraft,'draft')`. The in-memory draft is
  replaced only after commit.
- Draft writes are serialised. A version counter keeps stale writes from setting
  status labels. Typing is debounced 350 ms.
- **Flush:**
  - Single-flight, and skipped while `!connected`.
  - Items are processed in **IndexedDB key order**. That is random-UUID order,
    exactly as today, and is *not* chronological. Items with `error` are skipped.
  - Request: `POST /api/captures` multipart with
    `payload = {capture_id: id, raw, project: '', task_id: task_id ?? null, organize: true}`
    and each file appended as `attachments` (blob, name).
  - The item is deleted only after a 2xx.
  - A 4xx other than 401 stores `error` and stops.
  - A 401, a 5xx or a network failure stops without marking.
- Flush triggers: boot, after save, after unlock, `online`, becoming visible, and
  each visible snapshot tick.
- `onversionchange` closes the database. `onblocked` reports "Close other Noema
  tabs".
- **Validation before queueing** (nothing that is bound to fail permanently enters
  the outbox):
  - At most 12 files, each ≤ 32 MB.
  - Total payload < 60 MB, which keeps headroom under the server's 64 MB body cap.
  - MIME types limited to the server's allowlist (`noema/server.py:40-48`):
    - images: png, jpeg, webp;
    - audio: wav, ogg, webm, mp4, mpeg.
  - Each rejection has its own toast. The picker's `accept` attribute matches.
- **Labels and toasts** are copied verbatim from `public/app.js`. The full list is
  extracted in the plan's first task and asserted by E2E tests. This includes
  "Draft on this device · not uploaded", "Local save failed · keep this page open",
  "Capture saved on this device. Sending to your server…" and "Saved to {folder}".
  "Saved to {folder}" appears only after a server acknowledgement for exactly one
  flushed item.
- **Task capture:**
  - `pending` is persisted before any HTTP call. If that write fails, the error is
    "Draft storage failed. Task not added".
  - Inputs stay frozen while pending.
  - The acknowledgement must have an `id` and `original_input === raw`.
  - Error handling:
    - 409, 5xx or network error: stay frozen and show "Retry add task".
    - 401 or any other 4xx: unfreeze.
  - Escape, Close and backdrop all save the draft first; if that save fails, the
    dialog stays open. Close is blocked while a submit is in flight.

### 4.5 Routing and guards

**Routes:** TanStack Router with hash history:
- `#/overview` (default), `#/capture`, `#/notes`, `#/note/$id`, `#/plan`.
- Modal routes: `#/task/$id` and `#/settings`.

**Modal behaviour:**
- When a modal opens, the URL is replaced with the underlying route, as today.
- On a cold start, `#/task/$id` renders over `#/plan` and `#/settings` renders over
  `#/overview`.
- "Task unavailable." is checked against the first loaded snapshot.

**Legacy forms** (`#overview`, `#capture`, `#notes`, `#plan`, `#note/<id>`,
`#task/<id>`, `#settings`) are rewritten to the new forms **on boot and on every
`hashchange`**. The Python helper opens `/#task/<id>` and `/#settings`.

**Navigation guards** (parity):
- While recording: navigation away from Capture is blocked, with the existing toast.
- While a capture save is in flight: blocked with "Finishing the local save."
- An unsaved note edit asks for confirmation.
- `beforeunload` is set while recording, while a save is in flight, and while
  editing a note.

**Keyboard:**
- `n` opens Capture, only with no open dialog, no modifier key, and focus outside
  any field.
- Ctrl/Cmd+K opens search.
- Ctrl/Cmd+Enter submits Capture and Add task. Plain Enter inserts a newline.
- IME composition is respected.

### 4.6 Content and accessibility

- **Remove all demo content:**
  - fixtures and `DEMO_CLOCK`;
  - the hard-coded name in the greeting and the hard-coded "V" avatar (both now come from `display_name`, §4.7; slogans and tagline are kept);
  - the "Isolated demo" and "fixture data" labels;
  - the `?fixture=` and `?host=` parameters;
  - the hard-coded "Tonight", and the example code and SVG.
- **Saving:** no whole-document saves on every keystroke. Attachments are Blobs, and
  each object URL is revoked when its owner unmounts.
- **Accessibility:**
  - Nav accessible names match the visible text.
  - Dialogs keep the focus trap, `inert` background, Escape and focus restore.
  - Toasts use `role=status aria-live=polite`; errors use `role=alert`.
  - Status is never shown by colour alone; contrast is at least 4.5:1.
- **Safety:** Markdown escapes all HTML, and no `dangerouslySetInnerHTML` is used
  with user content.
- **Notifications:**
  - Same rules as today: the `noema-notifications` localStorage key, `state==='due'`
    only, at most once per id per session, and a snooze re-arms it.
  - Tag = reminder id.
  - Icon is the new hashed icon URL.

### 4.7 Handbook conformance (`docs/Noema-Handbook.md`)

The handbook is the product source of truth. Behaviour must match it wherever it
describes current or carried-forward design. Items it marks *planned/future*
(semantic search, time-linked visuals, live transcripts, learned filing, sync,
mixed-topic split) stay out of scope. The items below are **required by this
migration**, even where today's `public/` UI lacks them.

**Product rules (never violated):**
- Notes and tasks are separate. A capture never creates a task, and nothing
  silently changes priorities, deadlines or focus (§01, §06, §27).
- Explicit Save is the notebook boundary. Drafts are local-only until Save.
  Originals are immutable through editing. A late model result is a suggestion,
  never an overwrite (§04, §19).
- Pins and manual priority overrides always win over automatic logic (§07, §08).
- A completed run creates review work, never Done. A stale run reads as unknown
  (§07).
- No fabricated effort, durations, dates or urgency. "Nothing actionable right now"
  is a valid result (§08).
- Capture is disabled by default: no mic, observation or model without explicit
  user action (§17, §28).

**UI direction (§10–§14):**
- **Look:** minimal and zen; a note-taking app first; compact ordered rows; limited
  accent; no oversized cards, excessive glow or ornamental headers.
- **Slogans (owner decision 18B; overrides the handbook's "filler slogans" line):**
  - The variant B headings, subtitles and tagline are **kept**: "Capture a
    thought." / "A quiet place for the rough edges.", "A place to return to." /
    "Your notes, with their original thinking intact.", "A little room to plan." /
    "Keep the next step in view.", and "Same chaos. A calmer you."
  - All of this copy lives in one module, `web/src/copy.ts`, so a later
    daily-slogan feature only has to swap its source (backlog, §11).
- **Greeting:**
  - The Overview greeting reads "Good morning/afternoon/evening, {name}." The time
    of day comes from the device clock.
  - `{name}` comes from a new `display_name` setting, edited in Settings. If it is
    empty, the greeting has no name ("Good afternoon.").
  - The avatar shows the first letter of the name, or is hidden when no name is set.
  - **Backend change:**
    - `SettingsInput.display_name: str | None` (strip, max 60 chars).
    - `DEFAULT_SETTINGS['display_name'] = ''`.
    - Tested in `tests/test_core.py`.
- **Labels:** visible navigation labels are **Overview, Capture, Notes, Tasks**.
  Route ids stay `overview`/`capture`/`notes`/`plan` (§10 mapping table).
- **Overview (progressive disclosure):**
  - one current-focus line with its provenance;
  - one primary recommendation with a plain reason ("Waiting for your answer",
    "Unblocked; resume from the saved approach") and a Start/Resume action;
  - a short attention list (Needs you);
  - a compact running summary.
  - Everything else opens on request.
- **Layout by form factor:**

  | Form factor | Width | Layout |
  |---|---|---|
  | Desktop | ≥1000 px | Narrow sidebar that the user can collapse to icons (remembered per device in localStorage) |
  | Phone | <650 px | Bottom navigation; Capture is full-screen |
  | Tablet / landscape | 650–1000 px | Sidebar plus an optional, collapsible folder/recent-note pane in Notes |
  | Portrait | — | Collapses to the phone's single column |

  The current note or task can always take the full content area.
- **Capture:**
  - an empty writing surface with no title or folder field;
  - a compact toolbar with microphone, image/paste and sketch;
  - one **Save note** action.
  - Recording opens a small control area with **elapsed time**, Pause/Resume and
    Stop.
  - **Paused** looks visibly different from recording and from stopped/added.
  - The visual tray (images, sketch) stays usable while recording.
  - There is no live organized preview in the editor, so text never moves under the
    cursor.
- **After Save:** a quiet confirmation shows the resulting title and folder, with
  **Open note** and **Change folder**. Change folder is a reversible
  `PUT /api/notes/{id}` with `expected_version`. There is no filing wizard (§06,
  §14). It appears only after the server acknowledges; while queued, the
  confirmation states the local/queued state.
- **Storage states:** the labels for "on this device / draft", "queued" and "saved
  on server" are distinct and never interchangeable (§20).
- **Sketch** (§05 target controls): pen, eraser, undo and a simple text tool. It is
  a lightweight tray, not a drawing app.
- **Notes:**
  - Search and recent notes are the default entrance.
  - Folder navigation is a narrow pane on desktop and a drawer or compact selector
    on phone.
  - Original and History sit nearby (tabs), never permanently side by side.
  - A related task is a small optional link.
- **Tasks (Plan):**
  - Compact rows: task, project, state, priority.
  - Due date and estimate appear only when known.
  - Priority is editable in place. Its label comes from the server's
    `priority_source`:
    - **"Auto · rules"** today (the deterministic policy);
    - **"Auto · AI"** once the AI-priority milestone (§11) adds that source;
    - **"Set by you"** for a manual override.
  - The `priority_reason` is shown on hover/focus and in task detail.
  - The UI maps unknown sources to "Auto" so the later milestone needs no frontend
    change.
  - Filtered views: **Needs you**, **Running**, **Available now**, All.
  - Dependencies, not-before dates and session links live in task detail.
  - Opening a row shows the next action and source context before any activity log.
  - **Review result** leads to the result or session link, not a checkbox.
  - Park/unpark is available; parked is distinct from done.
- **Accessibility:** keyboard navigation, visible focus, descriptive labels, status
  understandable without colour, contrast ≥ 4.5:1, touch targets ≥ 44×44 px at
  phone widths.
- **Motion:** slow, sparse and optional. It is absent when hidden or when reduced
  motion is set (§10, §21). The terrain stays inside the app and never under reading
  or editing surfaces.

**Compute (§21):**
- Base app use needs no model.
- The quiet background target is < 1% of one core, which matches the
  paused/hidden budget in §7.
- The main app process tree is measured against the handbook's aspiration of
  < 400 MB excluding AI, and the result is recorded in TEST_REPORT whether or not
  it passes.

**Traceability:** the plan includes `docs/superpowers/specs/handbook-trace.md`,
which maps every bullet above to the task and test that cover it.

## 5. Feature parity list

Behaviour follows `public/app.js`. The plan's first task extracts every flow and
string from it into a checklist; this table lists the endpoints.

| Flow | Endpoints |
|---|---|
| Shell: connection label, outbox indicator "N captures on this device", integration status | `GET /api/state` |
| Now: focus with provenance ("Pinned by you" / "Inferred from window metadata" / "Selected by you"), one primary recommendation, alternatives, attention, runs, waiting, time budget from saved estimates only, agent setup | `GET /api/state?minutes=N`, `POST /api/tokens` |
| Focus pin/clear, with confirmation before replacing or clearing a pin | `POST /api/focus` |
| Plan: rows by state with project, priority pill ("· auto"), due/planned dates; complete/reopen | `GET /api/tasks/{id}`, `PUT /api/tasks/{id}` |
| Add task (docs/TASK_CAPTURE.md) | `POST /api/task-captures` |
| Task detail: all fields, dependencies, runs, needs-input, session links (http/https, `noopener noreferrer`), reminders, linked capture | `GET/PUT /api/tasks/{id}` |
| Capture: text, task link, images/audio (§4.4 limits), sketch (DPR canvas, 12-step undo, `sketch.png`), MediaRecorder (webm/opus → webm → ogg/opus → mp4; 64 kbps; 1 s chunks; pause/resume; auto-stop over 30 MB) | `POST /api/captures` |
| Outbox dialog: Retry, Open a copy in Capture (new id; confirm before replacing a non-empty draft), Discard (confirm) | local |
| Notes: search (300 ms debounce, local fallback), folders, recent | `GET /api/search?q=` |
| Note view: Note/Original/History, edit, restore, apply suggestion ("Nothing was overwritten"), organize, transcribe, attachments, client-side Markdown export | `GET/PUT /api/notes/{id}`, `GET …/history`, `POST …/restore/{v}`, `POST …/suggestions/{sid}/apply`, `POST …/organize`, `POST …/transcribe`, `GET /api/attachments/{id}` |
| Reminders: add, snooze 20 min, dismiss, notifications (§4.6) | `POST /api/reminders`, `POST …/{id}/snooze`, `DELETE …/{id}` |
| Runs: needs-input/review/failed/stale, end tracking (with the confirmation that it does not stop the external agent) | `POST /api/runs/{id}/end-tracking` |
| Settings: observation, motion, companion mode/size (24–72, for the Python helper), context rules, tokens (shown once), export | `PATCH /api/settings`, `POST/DELETE /api/context/rules…`, `GET/POST/DELETE /api/tokens…`, `GET /api/export` |
| Unlock | `POST/DELETE /api/session` |
| Desktop close checkpoint | §6.3 |

**Removed:** the `#companion-launch` button and the browser preview popup.

## 6. Serving, service worker, Electron shell, lifecycle

### 6.1 FastAPI serving (`noema/server.py`)

`create_app` takes the dist directory as a parameter (default `<repo>/web/dist`),
so tests can inject one.

**Routes** (explicit, no catch-all):

| Path | Source | Cache-Control |
|---|---|---|
| `/` | `dist/index.html` | `no-cache` |
| `/assets/*` | `StaticFiles(dist/assets, check_dir=False)` | `public, max-age=31536000, immutable` |
| `/sw.js` | `dist/sw.js`, plus `Service-Worker-Allowed: /` | `no-cache` |
| `/manifest.webmanifest`, `/icon.svg` | dist root | `no-cache` |

- A build check fails if any file under `dist/assets` lacks a content hash.
- The manifest keeps `start_url: "/"` and `scope: "/"`, and adds `id: "/"`.
- If `index.html` is missing, `/` returns a plain 503 page: "Frontend not built: run
  `npm --prefix web run build`". The API keeps working either way.
- `/static`, `/companion` and `public/` serving are removed.
- `protect()` stays unchanged: Host/Origin checks, request marker, CSP and headers.
- The production build emits no inline scripts. Vite's modulepreload polyfill is
  disabled, because only modern Chromium and Firefox are targeted.

### 6.2 Service worker (`web/public/sw.js`, precache list injected at build)

- **Cache name:** `noema-shell-<buildhash>`, generated by the same build step that
  writes the precache list.
- **Precache:** every file in the Vite output (all JS chunks, CSS, fonts, images),
  plus `/`, the manifest and the icon. `sw.js` and source maps are excluded.
- **`install`:** precache inside `waitUntil`, then `self.skipWaiting()`.
- **`activate`:** inside `waitUntil`, delete every `noema-shell-*` cache except the
  current one (this includes v1's `noema-shell-v1`), then `clients.claim()`.
- **`fetch`:**
  - `/assets/*` is cache-first, with network fallback; successful responses are
    added to the cache.
  - Navigations are network-first. On a network error **or any 5xx**, they fall back
    to the cached `/`.
  - Only OK responses are ever cached.
  - `/api/`, cross-origin and non-GET requests are never touched.
- **`vite:preloadError`:** the page saves drafts, then offers a reload.

### 6.3 Electron shell (`electron/`)

**CLI:**
- `--server` (default `http://127.0.0.1:8765`)
- `--profile DIR`
- `--manage-service`
- `--data-dir PATH`
- `--python PATH`
- `--entry-point PATH`
- `--startup-timeout S` (0.1–60, default 15)

**Validation:**
- `--server` must be a loopback IP literal over http, with no credentials, path,
  query or fragment. This is a port of `validate_server` with its unit tests.
- With `--manage-service`, `--server` must be exactly `http://127.0.0.1:8765`.
- `--data-dir` without `--manage-service` is rejected.
- Paths are resolved to absolute paths against the current directory, as in
  `desktop/src/main.rs:79-91`.

**Profile:**
- `--profile`, or `$XDG_DATA_HOME/noema/electron` (default
  `~/.local/share/noema/electron`). Mode 0700.
- `app.setPath('userData', …)` runs **before** `requestSingleInstanceLock()`, and
  both run before `ready`.
- Chromium's ProcessSingleton is the profile lock; there is no extra flock.
- A second instance focuses the existing window, ignores its own arguments and
  exits 0.
- The profile holds the session cookie, so it is treated as credential storage.
- Tests always use a throwaway `--profile`.

**webPreferences:** `sandbox: true`, `contextIsolation: true`,
`nodeIntegration: false`, devtools off in packaged builds. The setuid
`chrome-sandbox` is required on Linux (never `--no-sandbox`).

**Navigation:**
- `will-navigate`, `will-redirect` and `will-frame-navigate` allow same-origin only.
  URL parse errors are denied.
- `setWindowOpenHandler` always denies. http(s) links with a host and no credentials
  go to `shell.openExternal`.
- `will-attach-webview` is denied.
- Downloads are allowed only for same-origin or `blob:<origin>`.

**Permissions:** a request handler and a check handler on the session.
- **Request handler:**
  - `'media'` is granted only when `mediaTypes` is exactly `['audio']`, the request
    comes from the main frame and the requesting URL is at the trusted origin.
    Anything that includes `'video'` is denied.
  - `'notifications'` follows the same main-frame and origin rule.
  - Each of these two shows a `dialog.showMessageBox` prompt.
  - Everything else is denied.
- **Decisions are remembered for the app session only** (in memory). The check
  handler returns the remembered decision for those two and `false` for everything
  else. Restarting the app clears them.
- Tests stub `dialog.showMessageBox` through `electronApp.evaluate`.

**Preloads:**
- The main window preload exposes only `window.ipc.postMessage(msg)`. It accepts
  only `'noema:close-approved'` from the main frame at the trusted origin.
- The startup page has its own preload exposing `retry()` and `cancel()`.

**Close contract** (same as `desktop/src/close.js` and `public/app.js`):
- If the page has not finished loading (`did-finish-load`), or
  `__noemaCheckpointCloseReady` is not set, or the renderer is gone, the window
  closes without touching storage.
- Otherwise Electron dispatches `noema:checkpoint-close`. The page then:
  - refuses while a capture save is in flight, keeping the window open with a toast;
  - asks for confirmation if recording or editing;
  - saves both drafts;
  - posts `noema:close-approved`.
  - If the draft write fails, it asks "Close without saving the draft?" and keeps
    the window open if the user declines.
- After approval, main calls `win.destroy()`, so `beforeunload` cannot cancel the
  close silently.
- If there is no answer within 10 s (an unresponsive renderer), a native dialog
  offers "Force close" or "Keep open".
- The React app sets `__noemaCheckpointCloseReady` only after its listener is
  installed **and** IndexedDB recovery has finished.

### 6.4 Managed lifecycle (Linux; `--manage-service --data-dir PATH`)

This is protocol 2 and replaces protocol 1 (the fd-3/fd-4 handoff).

**1. Workspace.** Electron:
- resolves `--data-dir` against the current directory;
- rejects a path with no final component;
- creates it with mode 0700 (chmod only if newly created);
- canonicalises it with `fs.realpathSync`.

That canonical path is passed to Python and compared later.

**2. Spawn.**
- Command: `<python> <entry-point> --desktop-managed --host 127.0.0.1 --port <p>
  --data-dir <canonical> --owner-pid <electron pid>`.
- `detached: true`, so the child gets its own session and process group.
- `stdio: ['pipe','pipe','ignore']`.
- The environment is stripped of `NOEMA_MODEL`, `NOEMA_SPEECH_MODEL`,
  `NOEMA_TOKEN`, `NOEMA_ACCESS_TOKEN`, `NOEMA_ALLOWED_HOSTS`,
  `NOEMA_ALLOW_REMOTE_MODEL` and `NOEMA_DATA_DIR`.
- Electron writes `{"instance":"<64 hex>"}\n` to stdin and keeps stdin open as the
  lifetime lease.
- Error handlers are attached to `spawn` (`ENOENT` → "Python not found"),
  `stdin` (EPIPE) and `stdout`.
- `<p>` is always 8765. A test-only override exists only when
  `NOEMA_ELECTRON_TEST=1`; it is not reachable from the CLI.

**3. Python** (`noema/desktop_service.py`, `--desktop-managed`), in this order,
before importing the server:
1. `prctl(PR_SET_PDEATHSIG, SIGTERM)` through ctypes, then exit if
   `getppid() != --owner-pid`.
2. Read the stdin lease line (≤ 2048 bytes; 64-hex instance).
3. Take the `.noema-service.lock` flock (`O_NOFOLLOW`, 0600).
4. Create the socket with `SO_REUSEADDR=1` (never `SO_REUSEPORT`), bind
   127.0.0.1:port, then `listen()`.
5. Start the stdin-EOF watcher (SIGTERM to its own group, SIGKILL after 8 s;
   unchanged).
6. Import and serve with `uvicorn.Server.run(sockets=[sock])`.
7. Once serving, print one line:
   `{"protocol":2,"instance","pid","workspace","port"}`.

Exit codes:

| Code | Meaning | User message (existing wording) |
|---|---|---|
| 10 | workspace locked | "This workspace already has a service…" |
| 11 | port in use | "Endpoint is occupied…" |
| 12 | invalid lease or arguments | generic startup failure |
| other | — | generic startup failure |

PDEATHSIG fires when Electron's spawning thread (its main thread) dies. The
`--owner-pid` check closes the race where Electron dies before the prctl call.

**4. Readiness.**
- Electron reads stdout as raw bytes up to the first `\n` or 4096 bytes, within
  `--startup-timeout`, then destroys the stream.
- The line must match exactly: protocol, instance, pid, workspace (canonical) and
  port. No extra keys are allowed.
- Then `GET /api/desktop-instance` must return exactly `{protocol:2, instance, pid}`
  (never the workspace).
- Only then is the origin loaded.
- Python never creates or modifies anything in the workspace beyond the lock until
  the lease is valid. An identity failure means Electron never loads the origin and
  stops the service.

**5. Fixed port.** The origin includes the port, and IndexedDB, the outbox and the
service worker are all stored per origin. If the port is in use, the result is exit
11 with Retry. The occupant is never contacted or killed.

**6. State machine and UI.** States: `starting` → `loaded` → `crashed` →
`stopping`.

- **starting:**
  - The window shows the local `startup.html` (`file://`, its own preload) with
    status plus Retry/Cancel.
  - Retries are serialised; Retry never spawns while a service process is alive.
  - Cancel stops the service and quits with no checkpoint, because no page has
    loaded yet.
- **loaded:**
  - The main window shows the service origin.
  - Close runs the §6.3 checkpoint, then stops the service.
- **crashed (after loaded):**
  - Main runs `executeJavaScript` to dispatch the custom event `noema:service-down`
    to the page. It does not use `offline`.
  - A `WebContentsView` overlay loading `startup.html` shows Retry/Quit over the
    still-loaded page.
  - A successful Retry removes the overlay and dispatches `noema:service-up`, with
    no reload.
  - Quit runs the checkpoint first.
- **stopping:**
  - Close stdin.
  - Wait 5 s.
  - SIGTERM `-pgid` (pgid = child pid), then wait 1 s.
  - SIGKILL `-pgid`.
  - Reap the child.
  - ESRCH counts as success.

**7. Group cleanup always runs after `exit` is observed**, including on a crash or a
timeout. A process group id stays reserved while any member is alive, so signalling
`-pgid` after the leader has been reaped either reaches the remaining members or
returns ESRCH. A test covers this: SIGKILL the Python process while a grandchild is
alive, then assert the grandchild is gone.

**8. Owner killed** (including SIGKILL): stdin EOF triggers Python's group shutdown,
and PDEATHSIG covers the time before the watcher starts.

**Removed:** protocol 1 in Python (the fd 3 socket, the fstat(4) lock check and the
protocol 1 identity), along with `desktop/`.
`test_public_handshake_does_not_authorize_api` is updated to protocol 2.

## 7. Terrain (`ui/BackgroundField`, `field.ts`)

**API level.** WebGL2 is required. Without WebGL2, the field shows the existing
static fallback (`data-state="unsupported"`) and draws nothing animated.

**Technique.** The terrain shape is computed once per frame, not once per vertex:

1. **Height pass.** A fragment shader renders height and slope for the 120×70 grid
   into an `RGBA16F` texture (`EXT_color_buffer_float`). If that extension is
   missing, it uses `RGBA8` with packed values. This is 8,400 `field()` evaluations
   per frame, down from about 600,000 today.
2. **Stroke pass.** Instanced strokes (`drawArraysInstanced`, one instance per grid
   point, 2 vertices each) sample the height texture with `texelFetch`. The base and
   tip vertices share one fetch result.

**Rendering:**
- `antialias: false`, `preserveDrawingBuffer: false`.
- The backing store is 0.5× device pixels, upscaled with CSS.
- Frames are scheduled with `setTimeout` at 12 fps. There is no
  `requestAnimationFrame` loop.
- `QUALITY_STEPS` and slow-frame step-down are kept, driven by the measured draw
  time.

**Quiet rects** (areas where the terrain must stay calm):
- Recomputed by a `ResizeObserver` on the observed elements, plus a
  `MutationObserver` on the app root (childList, subtree) and the existing scroll
  listener.
- The 500 ms polling is removed.
- A test opens a dialog and asserts the quiet rects update.
- **Invariant:** the alpha under the reading column is 0. The pixel test reads it
  through the test seam below.

**State machine.**
- Inputs: `supported`, `documentHidden`, `windowBlurred`, `idle`, `reducedMotion`,
  `motionSetting`.
- States:
  - `unsupported`;
  - `static` (reduced motion, or the motion setting off);
  - `paused` (hidden, blurred, or 60 s with no `pointermove`, `keydown`, `wheel`,
    `touchstart` or `focus`);
  - `animated`.
- Each state is exposed as `data-state`.
- The motion setting **defaults to off**, matching the server.
- `field.test.mjs` is rewritten for the new signature and grid, and ported to
  Vitest.

**Test seam.** `window.__noemaField = {frames, readPixel(x, y)}`, present only when
the page URL has `?e2e=1`. `readPixel` runs inside the draw callback. It ships but
is inert without the flag.

**Budget** (whole Electron app process tree; Iris Xe; private headless Sway gles2;
1440×900 at scale 1; motion on, reduced motion off; 30 s samples, same method as
the benchmark):

| State | CPU (one core) | iGPU busy |
|---|---|---|
| Animated: focused, within 60 s of input (synthetic input during the sample) | < 3% | < 6% |
| Paused: idle timeout or blur | < 1% | ~0% |
| Hidden | < 1% | 0% |

The budget is measured once at cutover with the scratch harness and recorded in
TEST_REPORT.

## 8. Testing and the parity gate

The cutover merge is blocked until everything below passes.

**Rule.** The plan's first task produces `docs/superpowers/specs/parity-map.md`.
It maps every check label in the source suites (`qa/browser_check.py`,
`qa/native_storage_check.py`, `qa/now_ui_check.py`, `qa/task_capture_check.py`,
`qa/task_link_check.py`, `qa/settings_link_check.py`, `qa/webview_check.py` with
`desktop/qa/scenario.js`, `experiments/ui-ab/scripts/verify.py`,
`tests/now_state.test.cjs`, `tests/test_managed_service.py`) to a new test, or to a
recorded drop with a reason. The gate is: every row is green or is an approved
drop.

**Fault injection.** The E2E harness injects storage races and faults by
monkey-patching `indexedDB`/`fetch` in `page.addInitScript`. No production test
hooks are added, except the `?e2e=1` terrain seam.

**Unit tests (Vitest):**
- **api:**
  - the marker header;
  - error normalisation (a string `detail`, a list `detail`, a text/plain 500);
  - the boot order;
  - the `/api/session` 401 exemption;
  - zod `jitless`.
- **local** (fake-indexeddb):
  - an atomic save;
  - the `add`-duplicate failure;
  - abort rollback;
  - a quota error;
  - serialised draft writes;
  - single-flight flush;
  - key-order flush;
  - the stop rules;
  - lost-acknowledgement replay with the same `capture_id`;
  - validation limits;
  - `local_day` stability across midnight with a fake clock.
- **domain:**
  - the 22 `now_state` cases;
  - the `connected` predicate;
  - the replay-policy endpoint list.
- **state:**
  - hidden/visible cadence;
  - `networkMode: 'always'`;
  - a mutation issued while disconnected is not replayed on reconnect.
- **routes:** legacy rewrite on boot and on `hashchange`.
- **field:** state machine, grid, quiet-rect packing.

**E2E (Playwright, real FastAPI, throwaway data dir and port)**, covering every
parity-map row, plus:
- **Upgrade:** seed `noema-local-v1` with an old-shape outbox item and drafts; the
  item uploads exactly once with its original id.
- **Service worker:**
  - takeover from a v1-controlled page;
  - two consecutive builds purge the old caches;
  - offline cold boot loads every route, including a lazily loaded chunk, with
    fonts loaded (`document.fonts.check`).
- **CSP:** a `securitypolicyviolation` listener installed from the first navigation
  records zero violations.
- **Refetch:** an edit in progress survives a snapshot refetch.
- **Navigation guards:** a save in flight blocks navigation.
- **Cookie-only access:** a non-loopback Host with a valid cookie never shows
  Unlock.

**Electron (Playwright `_electron`):**
- **Isolation:** off-origin navigation, redirects, frame navigation, popups and
  webview attach are blocked.
- **Links:** external links go to `openExternal`.
- **Downloads:** export is allowed; anything else is blocked.
- **Permissions:**
  - audio-only media is prompted and remembered;
  - video is denied;
  - `Notification.permission` is correct before and after a decision.
- **Close:**
  - the checkpoint saves a draft;
  - closing during boot needs no checkpoint;
  - a save in flight keeps the window open;
  - a draft-write failure asks for confirmation;
  - an unresponsive renderer offers "Force close".
- **Single instance:** a second instance focuses the first and exits 0.
- **`scenario.js` stages:** restart with draft, backend crash → service-down →
  Retry → service-up with no reload, offline queue → Retry → flush, and Blob
  survives a restart.

**Lifecycle** (Node module, port of all `tests/test_managed_service.py` cases plus
protocol 2):
- workspace locked (10);
- port in use (11), with the occupant untouched;
- invalid lease (12);
- startup timeout and cancel cleanup;
- crash then Retry, with no second spawn during Retry;
- owner SIGKILL before and after the lease watcher;
- identity mismatch, for both stdout and HTTP;
- extra keys rejected;
- environment stripping;
- agent survival;
- a missing interpreter;
- early exit before the lease;
- a symlinked workspace;
- grandchild cleanup after Python is SIGKILLed;
- crash → Retry rebinds immediately (`SO_REUSEADDR`).

**Python:**
- Everything except the managed tests runs unchanged.
- `tests/test_core.py`'s static assertions are split:
  - one test asserts the 503 page with no dist;
  - one asserts the routes and headers with a minimal dist generated in `tmp_path`
    (via the `create_app` dist parameter).
- `tests/test_companion.py` points at `tools/assets/cat.png`.

## 9. Documentation and cutover checklist

**Rewrite:**
- `README.md` (Node requirement, build step).
- `docs/ARCHITECTURE.md`.
- `docs/DESKTOP.md` (Electron, protocol 2).
- `docs/SECURITY.md` (Electron posture, the profile as a credential store,
  session-only permissions).
- `docs/API.md` (fix the `files` → `attachments` field name, `/api/desktop-instance`
  protocol 2).
- `docs/PHYSICAL_SWAY_ACCEPTANCE.md` (launch commands).
- `docs/BUILD_STATUS.md`.
- `docs/CONTINUATION.md`.
- `docs/ASSETS.md` (fonts and their licences, the sprite path).
- `docs/TEST_REPORT.md` (new suites, terrain numbers).
- `docs/PROGRESS.md` (milestone; the handbook's "static UI" decision is
  superseded).

The archived handbook is not edited. `SHA256SUMS` is regenerated.

**Rollback:**
- Revert the merge commit.
- Old and new UIs share `noema-local-v1` version 1, so a browser rollback keeps
  queued captures.
- The reinstalled v1 service worker deletes nothing of v1's, and the v2 caches are
  only stale storage.
- Captures queued inside the **Electron** profile after cutover are not readable by
  the restored Rust/WebKit shell. **This is accepted.** Flush before rolling back.

## 10. Risks and accepted trade-offs

| Risk | Handling |
|---|---|
| Big-bang: no user value until cutover | Phased build with green gates; `master` keeps working |
| Unsent captures in the old Wry/WebKit profile cannot be read by Chromium | **Accepted (11C).** The profile is left untouched |
| Another process takes 8765 between lock and bind | Exit 11. The identity handshake rejects impostors. Nothing is killed |
| Electron runtime size (~283 MB) and setuid sandbox packaging | Accepted per 1A; documented |
| Permission decisions are not persisted | Deliberate: prompt again on each app start; revisit if annoying |
| WebGL2 required for the animated terrain | The static fallback keeps the app fully usable |
| Outbox flush order is not chronological | Parity with today. Notes list by server `updated_at` (`store.py:427`), so several offline captures can appear out of capture order after upload. Accepted; fixing it would need a new `saved_at` field |
| Kitten deferred: no overlay outside Sway | Explicit non-goal |
| Handbook §24 warns against a UI redesign replacing validation | Physical Sway acceptance (Stage A) remains pending and is **not** satisfied by this migration. PROGRESS keeps it as the next validation gate |

## 11. Follow-on milestones (not built here)

These are recorded so the migration leaves room for them. Neither is implemented in
this migration.

### 11.1 AI-assigned priority (decision 19A, next milestone after cutover)

- **What sets it.** Automatic priority is set by the existing optional local model,
  the worker's Ollama adapter. The model receives the task's outcome, next action,
  dates, dependencies and project. It returns one of high/medium/low plus a
  one-line reason.
- **Schema checks.** The response is validated against a schema, the same way other
  model output is validated.
- **Storage and source.** The result is stored as the automatic priority with
  `priority_source = 'ai'` and `priority_reason`.
- **Fallback.** With no model configured, or when the model fails, the deterministic
  rules remain the fallback (`priority_source = 'rules'`, renamed from today's
  `'automatic'`). Handbook §21 requires that the base app needs no model.
- **What AI must never touch.**
  - Manual overrides (`priority_source = 'you'`) are never changed.
  - The model never changes pins, focus, deadlines or status (handbook §08).
- **Cost.** Runs are serialised in the existing worker, on task create/edit only,
  and bounded like note cleanup (§21 compute policy).

The migration UI already renders the "Auto · AI" / "Auto · rules" / "Set by you"
labels from `priority_source`, so this milestone is backend-only.

### 11.2 Daily motivating slogan (owner request, later)

The Overview slogan rotates daily. Copy comes from `web/src/copy.ts` today; the
later feature swaps that source to a list picked by date. An AI-generated variant
would use the same optional local model. No network service is required.
