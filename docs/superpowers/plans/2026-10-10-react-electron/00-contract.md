# React + Electron migration: shared interface contract

Status: binding for all six phase plans. Source of truth for engineering decisions:
`docs/superpowers/specs/2026-10-10-react-electron-migration-design.md` (the "spec"). Product
source of truth: `docs/Noema-Handbook.md`. When a plan needs a name, signature, path, string or
version that is defined here, it uses this one exactly. If a plan needs something that is not
here, it defines it inside its own phase-owned files only (§10) and never in another phase's file.

Owner decisions that plans must not reopen:
- **18B:** slogans, subtitles and the tagline are **kept** in `web/src/copy.ts` (§6.4). The
  greeting uses the new `display_name` setting. A daily rotating slogan is a later milestone
  (spec §11.2). Its only hook here is that all of this copy lives in one module.
- **19A:** AI-assigned priority is the next milestone (spec §11.1) and is **not** built here. The
  UI already maps `priority_source` → "Auto · rules" / "Auto · AI" / "Set by you" / "Auto"
  (`priorityLabel`, §4.3), so that milestone needs no backend change to the frontend.
- Handbook rules: no oversized cards, no fabricated estimates/dates/urgency, notes never become
  tasks, no automatic change to pins/priorities/focus, capture disabled by default.

## 0. Conventions

- Branch: `feat/react-electron`. Only the first P1 task creates it (`git switch -c feat/react-electron`).
  Every commit step uses `git add <exact paths>` and a Conventional Commit message (`feat(web): …`,
  `test(electron): …`, `fix(server): …`, `docs: …`, `chore: …`). Each message ends with
  the attribution trailer that the executing session supplies.
- Node **22.23.3**. The system `node` is v18, so `web/` and `electron/` reuse the pattern from
  `experiments/ui-ab/package.json`: a devDependency `"node": "22.23.3"` puts Node 22 first on
  PATH inside every `npm run` script. Also pinned in `.nvmrc` (`22.23.3`) and in
  `"engines": {"node": "^22.22.2"}`.
- Python: `.venv/bin/python` at the repo root. Pytest: `.venv/bin/python -m pytest tests/<file> -k <name>`.
- Unit test command: `npm --prefix web test -- <path relative to web/>`, for example
  `npm --prefix web test -- src/api/client.test.ts`. E2E: `npm --prefix web run e2e -- e2e/<file>`.
  Electron: `npm --prefix electron run unit -- test/<file>` and `npm --prefix electron run e2e -- e2e/<file>`.
- Gate commands (spec §3), run from the repo root and written **exactly** like this in every plan:
  - web gate (every phase before the Electron plan): `npm --prefix web ci && npm --prefix web run build && npm --prefix web test && npm --prefix web run e2e && .venv/bin/python -m pytest`
  - full gate (the Electron plan onward, and the cutover): `npm --prefix web ci && npm --prefix web run build && npm --prefix web test && npm --prefix web run e2e && npm --prefix electron test && .venv/bin/python -m pytest`
  `06-cutover.md` Task 10 runs the same six commands one by one to log each.
- Import aliases: none. Use relative imports only. TypeScript `strict: true`.
- zod is imported **only** from `web/src/zod.ts`. A test enforces this (§1.3).
- Every reading or editing surface (page heading, main column, writing surface, note page, plan list,
  every `<dialog>`) carries the attribute `data-quiet`. The terrain quiet selector is `[data-quiet]` (§7).

## 1. `web/` package

### 1.1 Exact versions (`web/package.json`, lockfile committed)

| Package | Version | Kind |
|---|---|---|
| react, react-dom | 19.3.0 | dep |
| zod | 4.1.12 | dep |
| @tanstack/react-query | 5.104.1 | dep |
| @tanstack/react-router | 1.170.42 | dep |
| vite | 6.4.4 | dev |
| @vitejs/plugin-react | 4.7.0 | dev |
| typescript | 5.9.3 | dev |
| vitest | 5.0.3 | dev |
| jsdom | 30.1.2 | dev (component and hook tests, per-file `// @vitest-environment jsdom`) |
| @testing-library/react | 16.3.3 | dev |
| @testing-library/dom | 10.4.2 | dev |
| fake-indexeddb | 6.2.5 | dev |
| @playwright/test | 1.64.0 | dev |
| @types/react, @types/react-dom | 19.2.2 | dev |
| @types/node | 22.18.10 | dev |
| node | 22.23.3 | dev (Node 22 on the script PATH) |

React, react-dom, zod, vite, plugin-react, typescript, the @types packages and node match
`experiments/ui-ab/node_modules`. The others are the current registry releases (2026-10-10),
and their peer ranges were checked (vitest 5.0.3 accepts vite ^6.4).

`web/package.json` scripts (exact):
```json
{
  "build": "tsc --noEmit && vite build && node scripts/sw-precache.mjs && node scripts/check-hashes.mjs",
  "watch": "vite build --watch --mode development",
  "check-hashes": "node scripts/check-hashes.mjs",
  "test": "vitest run",
  "e2e": "playwright test",
  "typecheck": "tsc --noEmit"
}
```
`"private": true`, `"type": "module"`, `"engines": {"node": "^22.22.2"}`.

`vite.config.ts`:
- `plugins: [react()]`, `base: '/'`;
- `build: { outDir: 'dist', emptyOutDir: true, assetsInlineLimit: 0, modulePreload: { polyfill: false }, sourcemap: false }`;
- `test: { include: ['src/**/*.test.{ts,tsx}'], environment: 'node' }`.

`web/public/` holds only `manifest.webmanifest`, `icon.svg` and `sw.js`. The manifest is
`public/manifest.webmanifest` plus `"id": "/"`, with the icon `src` set to `/icon.svg`.

### 1.2 File tree (every file any phase creates)

```
.nvmrc                                   P1
web/package.json, package-lock.json      P1
web/tsconfig.json                        P1  (target ES2022, lib ES2022+DOM+DOM.Iterable, module ESNext, moduleResolution Bundler, jsx react-jsx, strict, noEmit, types ["vite/client"])
web/vite.config.ts                       P1
web/playwright.config.ts                 P1  (testDir 'e2e', project chromium only, fullyParallel true, workers 2, retries 0, use.trace 'retain-on-failure')
web/index.html                           P1  (no inline script; <div id="root"></div>; <link rel="manifest" href="/manifest.webmanifest">)
web/public/manifest.webmanifest          P1
web/public/icon.svg                      P1  (copy of public/icon.svg)
web/public/sw.js                         P1
web/scripts/sw-precache.mjs              P1
web/scripts/check-hashes.mjs             P1
web/src/main.tsx                         P1 creates (minimal), P3 replaces body
web/src/zod.ts                           P1
web/src/globals.d.ts                     P1
web/src/events.ts                        P1
web/src/strings.ts                       P1
web/src/copy.ts                          P3
web/src/styles/base.css                  P1  (fonts, tokens, reset; ported from experiments/ui-ab/frontend/src/theme.css + style.css:1-7)
web/src/styles/shell.css, ui.css         P3
web/src/styles/screens.css               P4
web/src/styles/field.css                 P5
web/src/assets/fonts/Inter-Regular.otf, Inter-Medium.otf, TeXGyreTermes-Regular.otf, TeXGyreTermes-Italic.otf   P1 (from experiments/ui-ab/frontend/public/assets)
web/src/assets/icon.svg                  P1  (same file as web/public/icon.svg; hashed URL for notifications)
web/src/api/client.ts, schemas.ts, session.ts, endpoints.ts           P2
web/src/local/db.ts, drafts.ts, outbox.ts, taskDraft.ts, limits.ts    P2
web/src/domain/connection.ts, nowState.ts, tasks.ts, format.ts        P2
web/src/state/queryClient.ts, queries.ts                              P2
web/src/test/fixtures.ts                                              P2
web/src/routes/router.tsx, legacy.ts, guards.ts                       P3
web/src/shell/AppShell.tsx                P3 creates, P5 adds <BackgroundField>
web/src/shell/Nav.tsx, StatusLine.tsx, OfflineNotice.tsx, dialogs.ts, unlock.ts, keyboard.ts, checkpoint.ts, notifications.ts, preloadError.ts, serviceWorker.ts(P1)   P3 except serviceWorker.ts
web/src/shell/DialogHost.tsx              P3 creates (outbox case), P4 adds the other cases
web/src/ui/Dialog.tsx, Toast.tsx, Icon.tsx, Markdown.tsx              P3
web/src/ui/BackgroundField.tsx, field.ts, fieldShaders.ts             P5
web/src/screens/Now.tsx, Capture.tsx, Notes.tsx, NoteView.tsx, Plan.tsx   P3 creates (heading + OfflineNotice only), P4 completes
web/src/components/TaskRow.tsx, PriorityControl.tsx                   P4
web/src/dialogs/Unlock.tsx, Outbox.tsx                                P3
web/src/dialogs/TaskCapture.tsx, TaskDetail.tsx, Settings.tsx, NoteHistory.tsx   P4
web/src/capture/Recorder.ts, Sketch.tsx, Attachments.tsx              P4
web/src/**/<module>.test.ts(x)            colocated with the owning phase's module
web/e2e/server.ts, fixtures.ts, faults.ts P1
web/e2e/*.spec.ts                         see §9
```

### 1.3 Small shared files (P1)

```ts
// web/src/zod.ts
import { z } from 'zod';
z.config({ jitless: true });
export { z };
```
`src/zod.test.ts` asserts two things. First, no file under `src/` other than `zod.ts` contains
`from 'zod'`. Second, `z.config().jitless === true` after importing `./zod`.

```ts
// web/src/events.ts
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
    ipc?: { postMessage(message: 'noema:close-approved'): void };   // Electron main preload only
    __noemaCheckpointCloseReady?: true;
    __noemaField?: { frames: number; readPixel(x: number, y: number): Promise<[number, number, number, number]> };
  }
  interface WindowEventMap { 'vite:preloadError': Event }
}
```

```ts
// web/src/shell/serviceWorker.ts (P1)
export function registerServiceWorker(): void   // no-op when import.meta.env.DEV or !('serviceWorker' in navigator); navigator.serviceWorker.register('/sw.js').catch(() => {})
```

`web/src/main.tsx` (P1 minimal form) imports `./styles/base.css`, calls `registerServiceWorker()`
and renders `<main data-quiet><h1>Noema</h1></main>` into `#root`. P3 replaces the body (§6.6).

### 1.4 Build scripts (P1)

- `scripts/sw-precache.mjs`:
  - Lists every file under `dist/` recursively, except `sw.js` and `*.map`. The list holds URL
    paths (`/assets/…`, `/manifest.webmanifest`, `/icon.svg`) plus `/`, minus `/index.html`.
  - `buildhash` = the first 12 hex characters of the sha256 of the sorted list joined by `\n`
    plus the content of every listed file.
  - Prepends `const CACHE="noema-shell-<buildhash>";const PRECACHE=[…];\n` to `dist/sw.js`.
  - `web/public/sw.js` reads only the globals `CACHE` and `PRECACHE`, and implements spec §6.2
    exactly.
- `scripts/check-hashes.mjs`: exits 1, printing `Unhashed asset: <name>`, if any file in
  `dist/assets` fails `/-[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+$/`.

## 2. FastAPI serving and backend changes (P1, `noema/`)

```python
# noema/server.py
def create_app(data_dir=None, start_worker=True, admin_token=None, desktop_identity=None, dist_dir=None): ...
# dist_dir default: ROOT/'web'/'dist'
```
Routes (explicit; `/static`, `/companion` and `ROOT/'public'` serving are removed):

| Path | Response | Cache-Control |
|---|---|---|
| `GET /` | `dist/index.html`, or a 503 `text/plain`: ``Frontend not built: run `npm --prefix web run build` `` | `no-cache` |
| `/assets/*` | `StaticFiles(directory=dist/'assets', check_dir=False)` mounted at `/assets` | `public, max-age=31536000, immutable` |
| `GET /sw.js` | `dist/sw.js`, `application/javascript`, `Service-Worker-Allowed: /` | `no-cache` |
| `GET /manifest.webmanifest`, `GET /icon.svg` | from dist root | `no-cache` |

A missing dist file other than `index.html` returns 404. `protect()` is unchanged.

`display_name`:
- `noema/models.py`: `SettingsInput.display_name: str | None = Field(default=None, max_length=60)`.
  A field validator strips whitespace, and the length check applies after stripping.
- `noema/store.py`: `DEFAULT_SETTINGS['display_name'] = ''`.
- `Store.settings()` returns `{**DEFAULT_SETTINGS, **stored}`. Existing workspaces have a stored
  settings dict without the key, so the merge is required.
- Tests in `tests/test_core.py`:
  - `test_display_name_setting`: default `''`, strip, 61 chars → 422, and an old settings row
    without the key still gets `''`.
  - `test_frontend_not_built_returns_503`.
  - `test_frontend_routes_and_headers`: a minimal dist in `tmp_path` via `dist_dir`.
  - `test_health_and_static` is replaced by these two tests.

## 3. API layer (P2, `web/src/api/`)

### 3.1 `client.ts`

```ts
import type { z } from '../zod';
export type ApiErrorKind = 'network' | 'http' | 'parse';
export class ApiError extends Error {
  constructor(readonly kind: ApiErrorKind, message: string, readonly status: number | null) // status null only for 'network'
}
export function normaliseError(status: number, bodyText: string): string;
export type ApiOptions = { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; signal?: AbortSignal };
export function api<T>(path: `/${string}`, schema: z.ZodType<T>, options?: ApiOptions): Promise<T>;
export function call<T>(key: EndpointKey, schema: z.ZodType<T>, options?: {
  params?: Record<string, string | number>; query?: Record<string, string | number | undefined>; body?: unknown; signal?: AbortSignal;
}): Promise<T>;
export function onUnauthorized(listener: () => void): () => void;   // returns unsubscribe
```
Semantics:
- `fetch('/api' + path, { method, headers, body, credentials: 'same-origin', signal })`. Headers
  always include `X-Noema-Request: 1`. A `FormData` body is passed through. Any other defined body
  is `JSON.stringify`'d with `Content-Type: application/json`.
- If `fetch` rejects, the client calls `connection.report('network-error')` and throws
  `ApiError('network', S.networkError, null)`. An `AbortError` is rethrown as-is.
- The body is read once as text.
  - Non-2xx: throws `ApiError('http', normaliseError(status, text), status)`.
  - Status 401 on a path that does not start with `/session` also notifies every
    `onUnauthorized` listener.
  - 2xx: `JSON.parse(text)` (an empty text parses as `null`), then `schema.parse`. Any failure
    throws `ApiError('parse', S.unexpectedResponse, status)`.
- `normaliseError` behaves as follows:
  - JSON with a `detail` string → that string;
  - JSON with a non-empty `detail` array → each item's `msg` if it is a string, else
    `JSON.stringify(item)`, joined with `'; '`;
  - anything else (non-JSON, empty, missing `detail`) → `` `Request failed (${status})` ``.
- The boot sequence (`session.ts`) runs **before** the app subscribes `onUnauthorized`. A 401 from
  boot's first `GET /state` therefore never opens Unlock.
- `fetch(` may appear in `src/` only in `api/client.ts`. `src/api/endpoints.test.ts` enforces this.

### 3.2 `endpoints.ts` (replay-policy table)

```ts
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Replay = 'read' | 'idempotent-by-key' | 'once-per-action';
export type EndpointSpec = { readonly method: Method; readonly path: `/${string}`; readonly replay: Replay };
export const ENDPOINTS = { /* entries below */ } as const satisfies Record<string, EndpointSpec>;
export type EndpointKey = keyof typeof ENDPOINTS;
export function endpointPath(key: EndpointKey, params?: Record<string, string | number>, query?: Record<string, string | number | undefined>): `/${string}`;
// replaces each `:name` with encodeURIComponent(String(params[name])); throws Error(`Missing path parameter ${name}`); appends URLSearchParams of defined query values
```
| key | method | path | replay |
|---|---|---|---|
| state | GET | /state | read |
| task | GET | /tasks/:id | read |
| search | GET | /search | read |
| note | GET | /notes/:id | read |
| noteHistory | GET | /notes/:id/history | read |
| tokens | GET | /tokens | read |
| capture | POST | /captures | idempotent-by-key |
| taskCapture | POST | /task-captures | idempotent-by-key |
| focus | POST | /focus | once-per-action |
| taskUpdate | PUT | /tasks/:id | once-per-action |
| noteUpdate | PUT | /notes/:id | once-per-action |
| noteRestore | POST | /notes/:id/restore/:version | once-per-action |
| noteApplySuggestion | POST | /notes/:id/suggestions/:sid/apply | once-per-action |
| noteOrganize | POST | /notes/:id/organize | once-per-action |
| noteTranscribe | POST | /notes/:id/transcribe | once-per-action |
| reminderCreate | POST | /reminders | once-per-action |
| reminderSnooze | POST | /reminders/:id/snooze | once-per-action |
| reminderDismiss | DELETE | /reminders/:id | once-per-action |
| runEndTracking | POST | /runs/:id/end-tracking | once-per-action |
| settingsUpdate | PATCH | /settings | once-per-action |
| ruleCreate | POST | /context/rules | once-per-action |
| ruleDelete | DELETE | /context/rules/:id | once-per-action |
| tokenCreate | POST | /tokens | once-per-action |
| tokenRevoke | DELETE | /tokens/:id | once-per-action |
| sessionCreate | POST | /session | once-per-action |
| sessionDelete | DELETE | /session | once-per-action |

`src/api/endpoints.test.ts` checks three things:
- the `once-per-action` set equals the spec §4.3 list exactly;
- the `idempotent-by-key` set is exactly `{POST /captures, POST /task-captures}`;
- the fetch-only-in-client rule from §3.1 holds.

`GET /api/export` and `GET /api/attachments/{id}` are plain links or `src` attributes, never `api()`.

### 3.3 `schemas.ts`

The schemas are `z.object` (unknown keys stripped), never `.strict()` and never coerced. Field
shapes come from `noema/store.py` and `noema/server.py`.

```ts
TaskStatusSchema   = z.enum(['todo','active','waiting','blocked','review','parked','done'])
PrioritySchema     = z.enum(['auto','high','medium','low'])
EffectivePrioritySchema = z.enum(['high','medium','low'])
RunStatusSchema    = z.enum(['working','needs_input','review','failed','cancelled'])
RunSchema          = { id, task_id, agent, session_url, status: RunStatusSchema, message: string, seq: int, created_at, updated_at }       // store.run / end-tracking
SnapshotRunSchema  = RunSchema + { stale: boolean, effective_status: RunStatusSchema | 'unknown' }                                       // store.py:432-433
ReminderSchema     = { id, task_id, at, state: z.enum(['scheduled','due','dismissed']), created_at }
ReminderCreatedSchema = { id, task_id, at, state: z.literal('scheduled') }                                                            // store.py:351
InterpretationSchema = z.looseObject({ explanation: z.string().optional(), manual_fields: z.array(z.string()).optional() })
TaskSchema = { id, title, project, detail, next_action, status: TaskStatusSchema, priority: PrioritySchema,
  due_at: string|null, not_before: string|null, estimate_minutes: int|null, dependencies: string[], session_url: string,
  created_at, updated_at, version: int, planned_on: string|null, original_input: string|null, interpretation: InterpretationSchema }   // store.task_row (LEFT JOIN ⇒ original_input may be null)
SnapshotTaskSchema = TaskSchema + { runs: SnapshotRunSchema[], blocked_by: string[], reminders: ReminderSchema[],
  effective_priority: EffectivePrioritySchema, priority_reason: string, priority_source: string /* open: 'automatic'|'you' today, 'rules'|'ai' later */,
  attention_reason: string, available: boolean, recommendation_reason: string.optional() }                                             // store.py:443-466
NoteSummarySchema  = { id, title, folder, project, task_id: string|null, mode, processing, error, version: int, created_at, updated_at }   // snapshot notes and GET /search
AttachmentSchema   = { id, name, mime, size: int, offset_seconds: number|null }
SuggestionSchema   = { id, note_id, title, body, folder, created_at }
NoteSchema         = NoteSummarySchema + { raw, transcript, body, attachments: AttachmentSchema[], suggestions: SuggestionSchema[] }       // store.note
RevisionSchema     = { id: int, note_id, version: int, title, body, folder, source, created_at }
FocusSchema        = z.object({ task_id: string, pinned: boolean, source: string, updated_at: string }).nullable()
ContextSchema      = z.object({ device, app, title, workspace, monitor, updated_at, source, suggested_task_id: string|null, stale: boolean.optional() }).nullable()
ContextRuleSchema  = { id, app, contains_text, task_id }
SettingsSchema     = { observation_enabled: boolean, motion: boolean, companion: z.enum(['cat','dot','hidden']), companion_size: int(24..72), display_name: string(max 60) }
CapabilitiesSchema = { organizer: boolean, speech: boolean, screen_pixels: boolean, sync: string, model: string, speech_model: string }
SnapshotSchema     = { tasks: SnapshotTaskSchema[], notes: NoteSummarySchema[], runs: SnapshotRunSchema[], reminders: ReminderSchema[],
  focus: FocusSchema, context: ContextSchema, context_rules: ContextRuleSchema[], settings: SettingsSchema,
  available: SnapshotTaskSchema[], attention: SnapshotTaskSchema[], up_next: SnapshotTaskSchema[], server_time: string, capabilities: CapabilitiesSchema }
TokenSummarySchema = { id, name, scope: z.enum(['agent','observer']), created_at }
TokenCreatedSchema = { id, token, scope: z.enum(['agent','observer']), task_ids: string[] }
OkSchema           = { ok: z.literal(true) }
```
Unmarked fields are `z.string()`, and `int` is `z.number().int()`. Exported types:
`Task, SnapshotTask, Run, SnapshotRun, Reminder, Note, NoteSummary, Revision, Focus, Settings,
Snapshot, TokenSummary, TokenCreated, TaskStatus, Priority`. Each is `z.infer` of the schema of
the same name.

Request bodies (TS types, exported from `schemas.ts`):
```ts
export type TaskEditable = Pick<Task, 'title'|'project'|'detail'|'next_action'|'status'|'priority'|'due_at'|'not_before'|'planned_on'|'estimate_minutes'|'dependencies'|'session_url'>;
export type TaskUpdateBody = TaskEditable & { expected_version: number };
export type TaskCaptureBody = { capture_id: string; raw: string; local_day: string; details: Partial<TaskEditable> };
export type CapturePayload = { capture_id: string; raw: string; project: ''; task_id: string | null; organize: true };
export type NoteUpdateBody = { title: string; folder: string; body: string; expected_version: number };
export type SettingsPatch = Partial<Pick<Settings, 'observation_enabled'|'motion'|'companion'|'companion_size'|'display_name'>>;
```

### 3.4 `session.ts`

```ts
export type BootResult = { kind: 'ready'; snapshot: Snapshot } | { kind: 'locked' } | { kind: 'unreachable'; error: ApiError };
export function fetchSnapshot(minutes: number | null): Promise<Snapshot>;   // call('state', SnapshotSchema, { query: { minutes: minutes ?? undefined } })
export function boot(): Promise<BootResult>;   // GET state → on http 401 only: POST /session {token:''} → GET state; a second 401 (from either call) → locked; other errors → unreachable
export function unlock(token: string): Promise<void>;   // POST /session {token}; throws ApiError (caller shows it inline)
export function signOut(): Promise<void>;     // DELETE /session
```

## 4. Local persistence and domain (P2)

### 4.1 `local/db.ts`

```ts
export const DB_NAME = 'noema-local-v1';
export const DB_VERSION = 1;
export type StoredFile = { name: string; blob: Blob };
export type Draft = { id: string; raw: string; task_id: string; files: StoredFile[] };            // kv['draft']
export type OutboxItem = Draft & { error?: string };                                            // outbox, keyPath 'id'
export type TaskDraftPending = { capture_id: string; raw: string; local_day: string; details: Partial<TaskEditable> };
export type TaskDraft = { id: string; raw: string; fields: Partial<TaskEditable>; pending: TaskDraftPending | null };   // kv['task-draft']
export type KvValues = { draft: Draft; 'task-draft': TaskDraft; snapshot: unknown };
export type LocalErrorCode = 'blocked' | 'open-failed' | 'aborted';
export class LocalStoreError extends Error { constructor(readonly code: LocalErrorCode, message: string) }
export function openDb(): Promise<IDBDatabase>;   // cached promise
export function transaction<T>(stores: ('kv'|'outbox') | ('kv'|'outbox')[], mode: IDBTransactionMode,
  run: (tx: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined>;
export function kvGet<K extends keyof KvValues>(key: K): Promise<unknown>;      // raw value; callers validate
export function kvPut<K extends keyof KvValues>(key: K, value: KvValues[K]): Promise<void>;
export function outboxAll(): Promise<unknown[]>;   // IndexedDB key order
export function outboxGet(id: string): Promise<unknown>;
export function outboxPut(item: OutboxItem): Promise<void>;
export function outboxDelete(id: string): Promise<void>;
export function isDraft(v: unknown): v is Draft;            // hand-written guards, Blob checked with instanceof
export function isOutboxItem(v: unknown): v is OutboxItem;
export function isTaskDraft(v: unknown): v is TaskDraft;
export function uid(): string;                              // crypto.randomUUID()
```
- `openDb` copies the upgrade from `public/app.js:30-43` exactly:
  `createObjectStore('kv')` and `createObjectStore('outbox', {keyPath: 'id'})`.
- `onversionchange` closes the database and clears the cache.
- `onblocked` rejects with `LocalStoreError('blocked', S.closeOtherTabs)`.
- Any open error clears the cache.
- `transaction` resolves on `oncomplete` with the request result. It rejects on `onerror` or
  `onabort` with `tx.error ?? new LocalStoreError('aborted', 'Local save failed')`. An exception
  thrown inside `run` aborts the transaction (`app.js:51-60`).
- Malformed stored records are never deleted automatically. Flush skips them, and the Outbox
  dialog lists them with Discard only.

### 4.2 `local/limits.ts`

```ts
export const MAX_FILES = 12;
export const MAX_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 60 * 1024 * 1024;   // total must be < this
export const ALLOWED_MIME = ['image/png','image/jpeg','image/webp','audio/wav','audio/ogg','audio/webm','audio/mp4','audio/mpeg'] as const;  // server.py:40-48
export const ACCEPT_ATTR = ALLOWED_MIME.join(',');   // file picker accept
export type RejectionCode = 'too-many' | 'too-large' | 'total-too-large' | 'unsupported-type';
export type FileRejection = { code: RejectionCode; name: string; message: string };
export function validateFiles(existing: StoredFile[], incoming: File[]): { accepted: StoredFile[]; rejections: FileRejection[] };
```
Rules:
- Files are processed in order, and the MIME base type is `type.split(';')[0]`.
- Count reached → `too-many` (`S.tooManyFiles`), then stop processing.
- `size > MAX_FILE_BYTES` → `too-large` (`S.fileTooLarge(name)`), continue.
- Type not allowed → `unsupported-type` (`S.unsupportedType`), continue.
- Total reaching `MAX_TOTAL_BYTES` or more → `total-too-large` (`S.totalTooLarge`), continue.
- Accepted names are `file.name || 'visual.png'` (`app.js:398`).

### 4.3 Draft stores

Both stores are external stores (`useSyncExternalStore`) so that Capture, the Outbox dialog and
the close checkpoint share one source.

```ts
// local/drafts.ts
export type LocalSaveState = 'memory' | 'pending' | 'saved' | 'error';
export type CaptureDraftState = { draft: Draft; saveState: LocalSaveState; saving: boolean; recovered: boolean };
export type SaveCaptureResult = { ok: true } | { ok: false; message: string };
export const DRAFT_DEBOUNCE_MS = 350;
export function emptyDraft(): Draft;                         // { id: uid(), raw: '', task_id: '', files: [] }
export const captureDraftStore: {
  getSnapshot(): CaptureDraftState; subscribe(listener: () => void): () => void;
  load(): Promise<void>;                     // kv draft → saveState 'saved'; none → 'memory'; read error → 'error' (app.js:590); sets recovered=true
  setRaw(raw: string): void;                 // version++, 'pending', debounced persist
  setTaskId(taskId: string): Promise<void>;
  addFiles(files: File[]): Promise<FileRejection[]>;   // ignored while saving; validateFiles; persist
  removeFile(index: number): Promise<void>;
  persist(): Promise<void>;                  // serialised kv.put(structuredClone(draft),'draft'); only the latest version sets saveState; failure → 'error' + toast(S.localSaveFailedToast); never throws
  save(): Promise<SaveCaptureResult>;        // empty → {ok:false,message:S.writeSomething}; one ['kv','outbox'] tx: outbox.add({...draft,error:''}) + kv.put(next,'draft'); draft replaced only after commit; failure → {ok:false,message:S.couldNotSave(err.message)}
  replaceWith(item: OutboxItem): Promise<void>;   // Outbox "Open a copy": {...item, id: uid(), error: undefined}, persisted
};
export function useCaptureDraft(): CaptureDraftState;

// local/taskDraft.ts
export type TaskSaveState = 'memory' | 'pending' | 'saved' | 'error';
export type TaskDraftState = { draft: TaskDraft; saveState: TaskSaveState; submitting: boolean; recovered: boolean };
export type TaskSubmitResult = { ok: true; task: Task; toast: string } | { ok: false; frozen: boolean; message: string };
export const taskDraftStore: {
  getSnapshot(): TaskDraftState; subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  setRaw(raw: string): void;                                         // persists (app.js:328-333)
  setField<K extends keyof TaskEditable>(name: K, value: TaskEditable[K] | null | ''): void;   // '' title/project deletes the key
  persist(): Promise<void>;                                          // serialised; throws on failure (callers decide)
  submit(now?: Date): Promise<TaskSubmitResult>;                     // app.js:346-366 + spec §4.4
  statusLabel(): string;                                             // app.js:306 via S.taskDraft*
};
export function useTaskDraft(): TaskDraftState;
```
`submit` semantics:
- When `pending` is null, it sets `pending = {capture_id: draft.id, raw, local_day: localDay(now), details: fields}`
  and persists it. If that fails, it clears `pending` and returns `{ok: false, frozen: false, message: S.draftStorageFailed}`.
- It then posts `call('taskCapture', TaskSchema, {body: pending})`.
- Ack check: `task.id && task.original_input === pending.raw`. A failed check returns
  `{ok: false, frozen: true, message: S.ackUnverified}`.
- Success: the store resets to a new empty draft and persists it, ignoring errors. The returned
  toast is `S.taskAddedDateKept` if `interpretation.explanation` starts with `'Scheduling wording'`,
  else `S.taskAdded`.
- Errors:
  - `ApiError` kind `'http'` with status < 500 and ≠ 409 → clear `pending`, persist, return
    `{frozen: false, message: S.notConfirmed + err.message}`;
  - anything else → `{frozen: true, message: S.notConfirmed + (err.kind === 'http' ? err.message : S.checkServiceRetry)}`.

### 4.4 `local/outbox.ts`

```ts
export type FlushStop = 'done' | 'busy' | 'disconnected' | 'unauthorized' | 'server' | 'network' | 'rejected' | 'read-failed';
export type FlushResult = { sent: number; stop: FlushStop };
export function flushOutbox(): Promise<FlushResult>;
export function retryItem(id: string): Promise<void>;     // clears error, then flushOutbox()
export function discardItem(id: string): Promise<void>;
export function outboxCount(): number;                    // cached; refreshed after every outbox change
export function subscribeOutbox(listener: () => void): () => void;
export function useOutboxCount(): number;
export function useOutboxItems(): { items: unknown[]; reload(): Promise<void> };
```
Flush is a port of `app.js:116-137` with the spec §4.4 rules:
- Single-flight (`busy`). It returns `disconnected` when `!connection.get()`.
- Items are processed in key order, skipping ones with `error` and malformed ones.
- Each item is sent as multipart `payload = JSON.stringify({capture_id: item.id, raw: item.raw, project: '', task_id: item.task_id || null, organize: true})`
  (`|| null` per `app.js:123`, so that `''` becomes null), with each file appended as
  `attachments` (blob, name). The response is parsed with `NoteSchema`.
- 2xx → delete the item. If `items.length === 1` (all items, `app.js:128`), it shows
  `toast(S.savedTo(note.folder, note.processing))`.
- Errors:
  - http 401 → stop `unauthorized`;
  - ≥ 500 → stop `server`;
  - other http → store `error = err.message` and stop `rejected`;
  - network or parse → stop without marking.
- A read failure sets the capture draft `saveState = 'error'`, shows `toast(S.queueReadFailed)`
  and stops with `read-failed`.

### 4.5 `domain/`

```ts
// domain/connection.ts
export type ConnectionEvent = 'state-success' | 'state-failure' | 'network-error' | 'offline' | 'service-down';
export function nextConnected(current: boolean, event: ConnectionEvent): boolean;   // true only for 'state-success'
export const connection: { get(): boolean; report(event: ConnectionEvent): void; subscribe(listener: () => void): () => void };
export function useConnected(): boolean;
export function installConnectionListeners(win?: Window): () => void;   // 'offline' and SERVICE_DOWN → report; 'online' does NOT set connected

// domain/nowState.ts — verbatim port of app.js:148-183 (strings unchanged)
export type NowMode = 'disconnected'|'new'|'notes-only'|'unknown'|'attention'|'complete'|'available'|'waiting'|'filtered'|'idle';
export type NowState = { mode: NowMode; title: string; explanation: string; primary: SnapshotTask | null; kind: 'attention'|'focus'|'available';
  alternatives: SnapshotTask[]; focus: SnapshotTask | undefined; active: SnapshotRun[]; unknown: SnapshotRun[]; questions: SnapshotRun[];
  waiting: SnapshotTask[]; integration: string; open: SnapshotTask[] };
export function focusKind(focus: Focus): 'Pinned by you' | 'Inferred from window metadata' | 'Selected by you';
export function observationStatus(snapshot: Snapshot | null): string;
export function nowState(snapshot: Snapshot | null, connected: boolean, budget?: number | null): NowState;   // app.js `!budget` ⇔ budget == null

// domain/tasks.ts
export const TASK_EDIT_FIELDS = ['title','project','detail','next_action','status','priority','due_at','not_before','planned_on','estimate_minutes','dependencies','session_url'] as const;  // app.js:343,382
export function editableFields(task: Task): TaskEditable;
export function priorityLabel(source: string): 'Auto · rules' | 'Auto · AI' | 'Set by you' | 'Auto';   // 'automatic'|'rules'→rules, 'ai'→AI, 'you'→Set by you, else 'Auto'
export type TaskFilter = 'open' | 'needs-you' | 'running' | 'available' | 'parked' | 'done' | 'all';
export const TASK_FILTERS: readonly { id: TaskFilter; label: string }[];   // Open, Needs you, Running, Available now, Parked, Completed, All
export function filterTasks(snapshot: Snapshot, filter: TaskFilter): SnapshotTask[];   // open = not done/parked; needs-you = attention ids; running = a run with effective_status working|needs_input; available = snapshot.available ids; sorted high→low (app.js:258)
export function rowSubtitle(task: SnapshotTask): string;            // app.js:145
export function waitingReason(task: SnapshotTask, tasks: SnapshotTask[]): string;   // app.js:202-203
export function isSessionUrl(url: string | null | undefined): boolean;              // /^https?:\/\//  app.js:27

// domain/format.ts
export function age(stamp: string, now?: number): string;           // app.js:17-23
export function dateLabel(stamp: string | null): string;            // app.js:24
export function localDateInput(stamp: string | null): string;       // app.js:25
export function fromLocal(value: string): string | null;            // app.js:26
export function localDay(date: Date): string;                       // device-local YYYY-MM-DD, app.js:349-350
export function noteMarkdownExport(note: Note): { filename: string; text: string };   // app.js:514
```

### 4.6 `state/`

```ts
// state/queryClient.ts
export const SNAPSHOT_INTERVAL_MS = 15_000;
export function shouldRetryQuery(failureCount: number, error: unknown): boolean;   // failureCount < 2 && ApiError && (kind==='network' || status >= 500)
export function createQueryClient(): QueryClient;
// queries: { networkMode: 'always', retry: shouldRetryQuery, refetchOnWindowFocus: false }, mutations: { networkMode: 'always', retry: 0 }

// state/queries.ts
export const queryKeys = {
  snapshot: (minutes: number | null) => ['snapshot', minutes] as const,
  note: (id: string) => ['note', id] as const,
  noteHistory: (id: string) => ['note', id, 'history'] as const,
  search: (q: string) => ['search', q] as const,
  tokens: ['tokens'] as const,
};
export function useTimeBudget(): readonly [number | null, (minutes: number | null) => void];
export function useSnapshot(): UseQueryResult<Snapshot, ApiError>;
export function readCachedSnapshot(): Promise<Snapshot | null>;      // kv 'snapshot' → SnapshotSchema.safeParse; invalid → null
export function runFlush(qc: QueryClient): Promise<FlushResult>;     // flushOutbox(); invalidate ['snapshot'] when sent > 0
export function installRefetchTriggers(qc: QueryClient): () => void; // SERVICE_UP → refetch ['snapshot']
export function useNote(id: string): UseQueryResult<Note, ApiError>;
export function useNoteHistory(id: string, enabled: boolean): UseQueryResult<Revision[], ApiError>;
export function useSearch(q: string): UseQueryResult<NoteSummary[], ApiError>;   // enabled when q !== ''
export function useTokens(enabled: boolean): UseQueryResult<TokenSummary[], ApiError>;
```
`useSnapshot`:
- Key: `queryKeys.snapshot(budget)`.
- `queryFn`: on success `connection.report('state-success')` and `kvPut('snapshot', s).catch(() => {})`;
  on failure `report('state-failure')` and rethrow.
- `refetchInterval: SNAPSHOT_INTERVAL_MS`, `refetchIntervalInBackground: false`,
  `refetchOnWindowFocus: true` (visibility), `refetchOnReconnect: true` (`online`),
  `placeholderData: keepPreviousData`.
- Each time `dataUpdatedAt` changes while `document.visibilityState === 'visible'`, it calls
  `runFlush`.

Mutation hooks. None retries. Every `onSuccess` invalidates `['snapshot']`. Note mutations also
invalidate `['note', id]`. Errors propagate to the caller, which shows them inline.

| hook | variables | endpoint | result schema |
|---|---|---|---|
| `useSetFocus()` | `{ taskId: string \| null }` (pinned: true) | focus | FocusSchema |
| `usePatchTask()` | `{ id: string; changes: Partial<TaskEditable> }`: GET task, then PUT `{...editableFields(fresh), ...changes, expected_version: fresh.version}` (`app.js:382`) | task + taskUpdate | TaskSchema |
| `useSaveTask()` | `{ id: string; body: TaskUpdateBody }` (version from when the form opened) | taskUpdate | TaskSchema |
| `useUpdateNote()` | `{ id: string; body: NoteUpdateBody }` | noteUpdate | NoteSchema |
| `useRestoreNote()` | `{ id: string; version: number; expectedVersion: number }` | noteRestore | NoteSchema |
| `useApplySuggestion()` | `{ id: string; sid: string; expectedVersion: number }` | noteApplySuggestion | NoteSchema |
| `useProcessNote()` | `{ id: string; kind: 'organize' \| 'transcribe' }` | noteOrganize / noteTranscribe | NoteSchema |
| `useCreateReminder()` | `{ taskId: string; at: string }` | reminderCreate | ReminderCreatedSchema |
| `useSnoozeReminder()` | `{ id: string }` → body `{minutes: 20}` | reminderSnooze | OkSchema |
| `useDismissReminder()` | `{ id: string }` | reminderDismiss | OkSchema |
| `useEndTracking()` | `{ runId: string }` | runEndTracking | RunSchema |
| `useUpdateSettings()` | `SettingsPatch` | settingsUpdate | SettingsSchema |
| `useCreateRule()` | `{ app: string; contains: string; task_id: string }` | ruleCreate | ContextRuleSchema |
| `useDeleteRule()` | `{ id: string }` | ruleDelete | OkSchema |
| `useCreateToken()` | `{ name: string; scope: 'agent' \| 'observer'; task_ids: string[] }` | tokenCreate | TokenCreatedSchema (also invalidates tokens) |
| `useRevokeToken()` | `{ id: string }` | tokenRevoke | OkSchema (also invalidates tokens) |

Every edit sends `expected_version`. A 409 surfaces the server's `detail`, which is already a
conflict sentence (`store.py:183,268`), as an inline error with a "Reopen" action that refetches.
It never retries and never overwrites.

### 4.7 Unit fixtures (`web/src/test/fixtures.ts`, P2)

```ts
export function makeRun(changes?: Partial<SnapshotRun>): SnapshotRun;
export function makeTask(id: string, changes?: Partial<SnapshotTask>): SnapshotTask;   // status 'todo', priority 'auto', effective 'medium', priority_source 'automatic', all arrays [], nullable fields null
export function makeNoteSummary(id: string, changes?: Partial<NoteSummary>): NoteSummary;
export function makeNote(id: string, changes?: Partial<Note>): Note;
export function makeSnapshot(changes?: Partial<Snapshot>): Snapshot;   // server_time '2026-10-08T12:00:00+00:00', settings defaults incl. display_name ''
```
`fixtures.test.ts` asserts that each factory's output passes its schema.

## 5. Strings (`web/src/strings.ts`, P1)

`export const S = { … } as const`. This holds every user-visible string that is produced in one
module and asserted elsewhere. Strings used by a single screen or dialog stay as verbatim literals
in that component, cited in `parity-map.md` (§10). The values below are verbatim from
`public/app.js` (line numbers given) unless marked **new**. `src/strings.test.ts` pins S with
`toMatchInlineSnapshot()`.

```
draftSaved 'Draft on this device · not uploaded' (66) · draftError 'Local save failed · keep this page open' (66) · draftPending 'Saving draft on this device…' (66) · draftMemory 'Draft in this tab · not uploaded' (66)
localSaveFailedToast 'Local save failed. Keep this page open and retry; this draft has not been uploaded.' (73)
localSaveErrorNotice 'Latest local save failed. Keep this page open.' (218) · retryLocalSave 'Retry local save' (218)
networkError 'Server unreachable. Your saved captures remain queued on this device.' (80)
unexpectedResponse 'The server sent an unexpected response.' (new)
connected 'Server connected' · offline 'Offline · local drafts' (105)
statusSummary(s: Snapshot | null, connected: boolean): string (107; 'Status unavailable', 'Nothing tracked yet', `${n} learning note${n===1?'':'s'}`, `${a} need you · ${r} reported running`)
outboxCount(n) `${n} capture${n===1?'':'s'} on this device` (140)
offlineBanner(hasSnapshot: boolean, saveError: boolean) (142, exact two-part sentence)
lastKnown 'Last known · ' (189)
savedTo(folder, processing) `Saved to ${folder}. ${processing?'Processing queued.':'Original preserved.'}` (128)
queueReadFailed 'Cannot read the local capture queue. Keep this page open and retry the local save.' (135)
closeOtherTabs 'Close other Noema tabs and retry the local save.' (40)
tooManyFiles 'Keep each capture to 12 attachments.' (398) · fileTooLarge(name) `${name} exceeds 32 MB.` (398) · unsupportedType 'Use a PNG, JPEG or WebP image, or a WAV, Ogg, WebM, MP4 or MP3 recording.' (new; replaces 398's broader 'Use an image or audio recording.') · totalTooLarge 'Keep each capture under 60 MB in total.' (new)
writeSomething 'Write something or add a recording or visual.' (402) · stopRecordingBeforeSaving 'Stop recording before saving.' (401)
couldNotSave(msg) 'Could not save the capture: '+msg (414)
captureSavedSending 'Capture saved on this device. Sending to your server…' · captureSavedOffline 'Capture saved on this device. It will upload when connected.' (417)
stopRecordingBeforeLeaving 'Stop recording before leaving Capture.' (269) · finishingLocalSave 'Finishing the local save.' (555) · editStillOpen 'Your edit is still open.' (555)
leaveNoteEdit 'Leave without saving this note edit? The last saved revision remains safe.' (485)
taskUnavailable 'Task unavailable.' (289)
taskDraftUnconfirmed 'Save unconfirmed · retry the same attempt' · taskDraftSaved 'Draft on this device · not added' · taskDraftError 'Local draft save failed · keep this dialog open' · taskDraftPending 'Saving draft on this device…' · taskDraftMemory 'Draft in this tab · not added' (306)
previousUnconfirmed 'Previous save is unconfirmed. Retry the same attempt; this draft is not an offline task queue.' (327)
draftStorageFailed 'Draft storage failed. Task not added; keep this dialog open and retry.' (351)
ackUnverified 'Task acknowledgement could not be verified; retry the same attempt.' (355)
notConfirmed 'Not confirmed added. Your input is preserved. ' (365) · checkServiceRetry 'Check the service or local storage, then retry the same attempt.' (365)
unconfirmedPreserved 'Save unconfirmed · draft preserved. Retry does not create a second task.' (366)
draftNotStored 'Draft not stored. Keep this dialog open and retry; the task is not added.' (299)
addTask 'Add task' · retryAddTask 'Retry add task' (323)
taskAdded 'Task added.' · taskAddedDateKept 'Task added. Date wording kept; correct it in Edit if needed.' · taskSaved 'Task saved.' (362) · editAction 'Edit' (14)
priorityUpdated 'Priority updated.' (496) · taskReopened 'Task reopened.' · taskCompleted 'Task completed.' (499)
unlockTitle 'Unlock Noema' · unlockHelp 'This server needs your access token. On the host machine, it is in the selected data directory’s admin.token file or your NOEMA_ACCESS_TOKEN setting.' · accessToken 'Access token' · unlock 'Unlock' (302)
outboxTitle 'Captures on this device' · outboxHelp 'Saved explicitly, but not yet acknowledged by the server. Attachments are kept with each capture. Keep this browser’s site storage until they upload.' · outboxEmpty 'All saved captures have reached the server.' · outboxFallbackText 'Visual or voice capture' · attachmentsCount(n) `${n} attachments` · retry 'Retry' · openCopy 'Open a copy in Capture' · discard 'Discard' (482)
confirmReplaceDraft 'Replace the current unsaved Capture draft? The queued capture remains safe.' (541) · openedCopy 'Opened a copy. The queued original still exists.' (542) · confirmDiscard 'Permanently discard this unsent capture and its local attachments?' (544)
notificationTitle 'Noema reminder' · notificationFallback 'A task needs your attention.' (98) · notificationsUnsupported 'This browser does not expose notifications here. Reminders still appear in Needs you.' (535)
closeSaveInFlight 'A capture save is still finishing. Try closing again shortly.' (603) · closeConfirm 'Close Noema? An unfinished recording or unsaved note edit may be lost. Cancel to stop/save or copy it first.' (604) · closeDraftFailed 'Local draft saving failed. Close anyway and risk losing this draft? Cancel to keep it open and retry.' (608) · closeCheckpointFailed 'Could not checkpoint your draft. Keep Noema open and retry the local save.' (612)
updateReady 'Noema was updated. Your drafts are saved on this device.' (new) · reload 'Reload' (new)
```
The priority labels and the task filter labels are owned by `domain/tasks.ts` (§4.5), not `S`.

## 6. Shell, routes and UI (P3)

### 6.1 `routes/`

```ts
// routes/router.tsx
export function createAppRouter(queryClient: QueryClient): AnyRouter;   // createHashHistory(); type registered via `declare module '@tanstack/react-router' { interface Register { router: ReturnType<typeof createAppRouter> } }`
// route paths: '/' (redirect → '/overview'), '/overview', '/capture', '/notes', '/note/$id' (lazy: lazyRouteComponent(() => import('../screens/NoteView'), 'NoteViewScreen')), '/plan', '/task/$id', '/settings'
// '/task/$id' renders PlanScreen and opens {kind:'task', id}; '/settings' renders NowScreen and opens {kind:'settings'}; both then navigate({to: <previous route or underlying>, replace: true}). The task id is checked against the first loaded snapshot; unknown → toast(S.taskUnavailable)

// routes/legacy.ts
export function rewriteLegacyHash(hash: string): string | null;   // '#overview'→'#/overview', '#capture','#notes','#plan','#settings' likewise, '#note/<id>'→'#/note/<id>', '#task/<id>'→'#/task/<id>'; '' / '#' / '#/…' / unknown → null
export function installLegacyHashRewrite(navigate: (to: string) => void): () => void;   // hashchange listener: rewritten → navigate(path without '#', replace)
// main.tsx calls `const r = rewriteLegacyHash(location.hash); if (r) history.replaceState(null, '', r)` synchronously BEFORE createAppRouter

// routes/guards.ts
export type GuardId = 'recording' | 'capture-saving' | 'note-edit';
export type GuardVerdict = { kind: 'block'; toast: string } | { kind: 'confirm'; message: string } | null;
export type NavigationGuard = { id: GuardId; check(toPath: string): GuardVerdict; beforeUnload: boolean };
export function registerGuard(guard: NavigationGuard): () => void;
export function useNavigationGuard(guard: NavigationGuard | null): void;   // registers while non-null; Capture and NoteView use this
export function isGuardActive(id: GuardId): boolean;
export function allowNavigation(toPath: string): boolean;   // block → toast(verdict.toast), false; confirm → window.confirm(message)
export function RouteGuards(): null;   // mounted once in AppShell: useBlocker({ shouldBlockFn: ({ next }) => !allowNavigation(next.pathname), enableBeforeUnload: () => any guard with beforeUnload })
```
Guard verdicts (registered by P4):
- recording: `check = to !== '/capture' ? {block, S.stopRecordingBeforeLeaving} : null`, `beforeUnload: true`;
- capture-saving: `{block, S.finishingLocalSave}`, `beforeUnload: true`;
- note-edit: `{confirm, S.leaveNoteEdit}`, `beforeUnload: true`.

### 6.2 `ui/`

```tsx
// ui/Dialog.tsx — native <dialog>.showModal(): top layer, inert background, stacking; focus restore to the opener on unmount
export function Dialog(props: { title: string; onRequestClose: () => void /* Escape (cancel event, preventDefault), close button, backdrop click outside the rect */;
  children: ReactNode; closeLabel?: string /* default 'Close dialog' (app.js:292) */; className?: string }): JSX.Element;   // the <dialog> carries data-quiet
// ui/Toast.tsx
export type ToastOptions = { action?: { label: string; onClick: () => void }; tone?: 'status' | 'error' };   // status: role=status aria-live=polite; error: role=alert
export function toast(message: string, options?: ToastOptions): void;   // one visible toast, replaced by the next, hidden after 5500 ms (app.js:15)
export function ToastHost(): JSX.Element;
// ui/Icon.tsx
export type IconName = 'home'|'pen'|'notes'|'task-check'|'arrow'|'waveform'|'plus'|'plan'|'search'|'chevron'|'close'|'clock'|'settings'|'play'|'spark'|'image'|'mic'|'folder'|'check'|'pause'|'stop'|'eraser'|'undo'|'text'|'sidebar';
export function Icon(props: { name: IconName; size?: number }): JSX.Element;   // aria-hidden; paths ported from experiments/ui-ab/frontend/src/icons.tsx:4-25
// ui/Markdown.tsx
export function Markdown(props: { text: string }): JSX.Element;   // port of app.js:233-247 producing React elements; no dangerouslySetInnerHTML
```

### 6.3 `shell/`

```ts
// shell/dialogs.ts
export type DialogRequest =
  | { kind: 'task'; id: string } | { kind: 'task-capture' } | { kind: 'settings'; section?: 'agents' }
  | { kind: 'outbox' } | { kind: 'note-history'; noteId: string } | { kind: 'sketch' };
export function openDialog(request: DialogRequest): void;   // replaces the current one (app.js modal())
export function closeDialog(): void;
export function useDialog(): DialogRequest | null;
export function isDialogOpen(): boolean;
// shell/unlock.ts — Unlock stacks above any open dialog and never closes it
export function requestUnlock(): void;
export function useUnlockOpen(): boolean;
export function completeUnlock(qc: QueryClient): Promise<void>;   // refetch snapshot, then runFlush (spec §4.2)
// shell/keyboard.ts
export function installKeyboard(navigate: (to: string) => void): () => void;   // 'n' → /capture (no dialog, no modifier, focus outside INPUT/TEXTAREA/SELECT/contenteditable, !isComposing); Ctrl/Cmd+K → /notes then focus #note-search
// shell/checkpoint.ts
export function installCheckpointClose(): () => void;   // only if typeof window.ipc?.postMessage === 'function'; listener for CHECKPOINT_CLOSE (app.js:598-614 semantics, toast for save-in-flight); sets window.__noemaCheckpointCloseReady = true after the listener is attached
// shell/notifications.ts
export const NOTIFICATIONS_KEY = 'noema-notifications';
export function notifyDueReminders(snapshot: Snapshot): void;   // state==='due' only, once per id per session, tag = reminder id, icon = hashed import of ../assets/icon.svg
export function rearmReminder(id: string): void;               // after snooze
// shell/preloadError.ts
export function installPreloadErrorHandler(): () => void;      // 'vite:preloadError' → preventDefault; persist both drafts; toast(S.updateReady, {action: {label: S.reload, onClick: () => location.reload()}})
```
Components:
- `AppShell` (the root layout: Nav, top bar with avatar, `<Outlet/>`, `ToastHost`, `DialogHost`,
  `UnlockHost`, `RouteGuards`);
- `Nav` (labels Overview, Capture, Notes, Tasks, plus Settings; the accessible name equals the
  visible text; desktop collapse persisted in localStorage `noema-sidebar-collapsed` = `'1'`/`'0'`);
- `StatusLine` (connection label plus the outbox indicator button, which opens Outbox);
- `OfflineNotice` (renders `S.offlineBanner` while disconnected);
- `DialogHost` (switches on `useDialog()`);
- `UnlockHost` (lives in `AppShell.tsx`).

Dialog components (each takes `{ onClose: () => void }` plus the listed props, and is a named export):

| Component | File | Owner | Extra props |
|---|---|---|---|
| `UnlockDialog` | dialogs/Unlock.tsx | P3 | — |
| `OutboxDialog` | dialogs/Outbox.tsx | P3 | — |
| `TaskCaptureDialog` | dialogs/TaskCapture.tsx | P4 | — |
| `TaskDetailDialog` | dialogs/TaskDetail.tsx | P4 | `id: string` |
| `SettingsDialog` | dialogs/Settings.tsx | P4 | `section?: 'agents'` |
| `NoteHistoryDialog` | dialogs/NoteHistory.tsx | P4 | `noteId: string` |
| `SketchDialog` | capture/Sketch.tsx | P4 | — |

Screens (named exports, no props): `NowScreen` (Now.tsx), `CaptureScreen`, `NotesScreen`,
`NoteViewScreen` (reads `$id`), `PlanScreen`. P4 components: `TaskRow({ task: SnapshotTask })` and
`PriorityControl({ task: SnapshotTask })`, which shows `${effective_priority} · ${priorityLabel(priority_source)}`
and `priority_reason` on hover or focus, and edits through `usePatchTask`. Capture parts:
`useRecorder(): RecorderState` in capture/Recorder.ts, and `Attachments({ files, onRemove })` in
capture/Attachments.tsx.

### 6.4 `copy.ts` (P3; owner decision 18B)

```ts
export const COPY = {
  tagline: 'Same chaos. A calmer you.',                  // Overview subtitle
  capture: { title: 'Capture a thought.', subtitle: 'A quiet place for the rough edges.' },
  notes: { title: 'A place to return to.', subtitle: 'Your notes, with their original thinking intact.' },
  plan: { title: 'A little room to plan.', subtitle: 'Keep the next step in view.' },
} as const;
export function greeting(now: Date, displayName: string): string;   // hour <12 'Good morning', <18 'Good afternoon', else 'Good evening'; trimmed name → `${g}, ${name}.` else `${g}.`
export function avatarLetter(displayName: string): string | null;   // first letter of the trimmed name, upper-cased; '' → null (avatar hidden)
```

### 6.5 Close checkpoint (page side)

`installCheckpointClose` behaves as follows:
- On `CHECKPOINT_CLOSE`:
  - while `captureDraftStore.getSnapshot().saving` → `toast(S.closeSaveInFlight)` and return;
  - if `isGuardActive('recording') || isGuardActive('note-edit')` and the user declines
    `confirm(S.closeConfirm)` → return;
  - otherwise it runs `captureDraftStore.persist()`. If `saveState !== 'saved'` and the draft is
    non-empty and the user declines `confirm(S.closeDraftFailed)` → return.
  - If the task draft has raw or pending → `await taskDraftStore.persist()`.
  - Finally `window.ipc.postMessage(CLOSE_APPROVED)`.
  - Any exception → `toast(S.closeCheckpointFailed, {tone: 'error'})`.
- A re-entrancy flag ignores events while one is in progress.
- `main.tsx` calls this only after `captureDraftStore.load()` and `taskDraftStore.load()` have
  both settled.

### 6.6 `main.tsx` boot order (P3)

1. Rewrite the legacy hash.
2. `createQueryClient()`.
3. In parallel: `captureDraftStore.load()`, `taskDraftStore.load()`, `readCachedSnapshot()`.
   The cached snapshot is seeded as `['snapshot', null]` data.
4. `installConnectionListeners()`, `installRefetchTriggers(qc)`, `installPreloadErrorHandler()`,
   `installCheckpointClose()`.
5. `boot()`:
   - ready → `setQueryData` and report `state-success`;
   - locked → `requestUnlock()`.
6. Subscribe `onUnauthorized(requestUnlock)`.
7. Render `<QueryClientProvider><RouterProvider router={createAppRouter(qc)}/></QueryClientProvider>`
   and `installLegacyHashRewrite`.
8. `runFlush(qc)`.
9. `registerServiceWorker()`.

## 7. Terrain (P5)

```ts
// ui/field.ts (pure; no DOM/WebGL)
export type FieldState = 'animated' | 'static' | 'paused' | 'unsupported';
export type FieldInputs = { supported: boolean; documentHidden: boolean; windowBlurred: boolean; idle: boolean; reducedMotion: boolean; motionSetting: boolean };
export function fieldState(inputs: FieldInputs): FieldState;   // !supported→unsupported; reducedMotion||!motionSetting→static; hidden||blurred||idle→paused; else animated
export const GRID_COLUMNS = 120, GRID_ROWS = 70, QUIET_SLOTS = 6;
export const QUALITY_STEPS = [1, 0.75, 0.55] as const;
export const FRAME_INTERVAL_MS = 1000 / 12, IDLE_TIMEOUT_MS = 60_000, BACKING_SCALE = 0.5;
export const QUIET_SELECTOR = '[data-quiet]';
export type Rect = { left: number; top: number; width: number; height: number };
export function buildInstances(columns: number, rows: number): Float32Array;   // [u, v, seed] per grid point; RangeError below 2×2
export function packQuietRects(rects: Rect[], viewportWidth: number, viewportHeight: number): Float32Array;   // unchanged from experiments field.ts:43-55
export function stepQuality(state: { quality: number; slow: number }, drawMs: number): { quality: number; slow: number };
// ui/fieldShaders.ts: HEIGHT_VERTEX, HEIGHT_FRAGMENT, STROKE_VERTEX, STROKE_FRAGMENT (GLSL ES 3.00 strings)
// ui/BackgroundField.tsx
export function BackgroundField(props: { motion: boolean }): JSX.Element;   // <canvas class="background-field" aria-hidden data-state={FieldState}>; installs window.__noemaField only when new URLSearchParams(location.search).get('e2e') === '1'
```
`AppShell` (P5 edit) renders `<BackgroundField motion={snapshot?.settings.motion ?? false}/>` as its
first child. The idle inputs are `pointermove`, `keydown`, `wheel`, `touchstart` and `focus`. The
alpha under any quiet rect is 0. `field.test.ts` ports `experiments/ui-ab/scripts/field.test.mjs`.

## 8. Electron and managed lifecycle (P6)

### 8.1 `electron/` package

Versions:
- `electron` 44.7.0
- `typescript` 5.9.3
- `@types/node` 22.18.10
- `vitest` 5.0.3
- `@playwright/test` 1.64.0
- `node` 22.23.3

Manifest:
- `"type": "module"`
- `"main": "dist/main.js"`
- `"engines": {"node": "^22.22.2"}`

Scripts:
```json
{ "build": "tsc -p tsconfig.json", "start": "npm run build && electron .", "unit": "vitest run", "e2e": "playwright test",
  "test": "npm run build && npm run unit && npm run e2e" }
```
```
electron/package.json, package-lock.json, tsconfig.json (module NodeNext, outDir dist, rootDir src), vitest.config.ts (include test/**/*.test.ts), playwright.config.ts (testDir e2e, workers 1)
electron/src/main.ts          app wiring and the window state machine ('starting'|'loaded'|'crashed'|'stopping')
electron/src/cli.ts           parseArgs, validateServer
electron/src/origin.ts        sameOrigin, downloadAllowed, externalLinkAllowed  (ports of desktop/src/lib.rs:12-53 with its tests)
electron/src/profile.ts       resolveProfile, prepareProfile
electron/src/permissions.ts   classifyPermission, installPermissions
electron/src/navigation.ts    installNavigationGuards
electron/src/close.ts         installCloseHandler
electron/src/lifecycle.ts     ManagedService and helpers
electron/src/protocol.ts      IPC channel names, page event names, user messages
electron/src/preload.cts      main window preload → dist/preload.cjs
electron/src/startup-preload.cts → dist/startup-preload.cjs
electron/static/startup.html, startup.js, startup.css   (CSP meta: default-src 'self'; no inline script)
electron/test/{cli,origin,paths,profile,permissions,lifecycle,preload,service-start,service-stop,service-parity}.test.ts, electron/test/{proc,helpers}.ts, electron/test/fixtures/owner.mjs
electron/src/paths.ts         path helpers (absolutePath, protected mkdir)
electron/test/fixtures/fake_service.py
electron/e2e/fixtures.ts, managed.ts (managed-mode helpers), isolation.spec.ts, permissions.spec.ts, close.spec.ts, single-instance.spec.ts, scenario.spec.ts, managed.spec.ts
```

### 8.2 TypeScript APIs

```ts
// cli.ts
export type CliOptions = { server: string /* origin */; profile: string | null; manageService: boolean; dataDir: string | null;
  python: string; entryPoint: string; startupTimeoutMs: number };
export class CliError extends Error {}
export function validateServer(value: string): string;   // http, loopback IP literal, no credentials, path '/', no query/fragment → origin; else CliError('Use a literal loopback HTTP URL, e.g. http://127.0.0.1:8765')
export function parseArgs(argv: string[], cwd: string, repoRoot: string, env: NodeJS.ProcessEnv): CliOptions | 'help';
```
`parseArgs` rules:
- Defaults (`main.rs:13-23`): server `http://127.0.0.1:8765`, python `<repoRoot>/.venv/bin/python`,
  entry `<repoRoot>/run.py`, timeout 15 s.
- Each flag without its value → `CliError('--<flag> needs …')` with the `main.rs` wording.
- Timeout outside 0.1–60 → `'Use a startup timeout from 0.1 to 60 seconds'`.
- `--data-dir` without `--manage-service` → `'--data-dir requires explicit --manage-service; external mode never owns a service'`.
- Managed without data → `'Managed mode requires an explicit --data-dir; no implicit real notebook'`.
- Managed with server ≠ `http://127.0.0.1:${managedPort(env)}` → `'Managed mode uses http://127.0.0.1:8765 only'`.
- Non-Linux managed → `'Managed development mode is supported only on Linux'`.
- Unknown argument → `'Unknown argument; use --help. No token file is needed by the webview.'`.
- Relative python, entry and data paths are resolved against `cwd`.
- `main.ts` prints `Noema: <message>` to stderr and exits 2 on `CliError`.

```ts
// profile.ts
export function resolveProfile(option: string | null, env: NodeJS.ProcessEnv, cwd: string): string;   // option, else $XDG_DATA_HOME (absolute) /noema/electron, else ~/.local/share/noema/electron
export function prepareProfile(path: string): void;   // no final component → Error('Choose a dedicated profile directory'); mkdir recursive; chmod 0700 only if newly created
// main.ts order: parseArgs → prepareProfile → app.setPath('userData', profile) → requestSingleInstanceLock() (false → app.exit(0)) → 'second-instance' focuses the window → app.whenReady

// origin.ts
export function sameOrigin(server: string, target: string): boolean;
export function downloadAllowed(server: string, target: string): boolean;
export function externalLinkAllowed(target: string): boolean;

// permissions.ts
export type PermissionKind = 'media-audio' | 'notifications';
export function classifyPermission(permission: string, details: { mediaTypes?: string[]; isMainFrame: boolean; requestingUrl: string }, origin: string): PermissionKind | null;
export function installPermissions(session: Electron.Session, origin: string, prompt: (kind: PermissionKind) => Promise<boolean>): void;   // decisions kept in a Map for the app session
export const PERMISSION_PROMPTS: Record<PermissionKind, string>;   // 'Allow Noema to use your microphone for a recording?', 'Allow Noema to show notifications?' (main.rs:263-276)

// navigation.ts
export function installNavigationGuards(contents: Electron.WebContents, origin: string): void;   // will-navigate, will-redirect, will-frame-navigate same-origin only (parse error → deny); setWindowOpenHandler deny + openExternal when externalLinkAllowed; will-attach-webview deny; session will-download allowed only via downloadAllowed

// close.ts
export const CLOSE_TIMEOUT_MS = 10_000;
export function installCloseHandler(win: Electron.BrowserWindow, origin: string, onApproved: () => void): void;
```
Close handler behaviour:
- It runs `executeJavaScript("window.__noemaCheckpointCloseReady===true ? (window.dispatchEvent(new Event('noema:checkpoint-close')), true) : false")`.
- If the page has not finished loading, the renderer is gone, or the script returns `false`, it
  calls `onApproved()` directly.
- Otherwise it waits for IPC `CLOSE_APPROVED` from the main frame at the origin, then calls
  `onApproved()`. `main.ts` calls `win.destroy()` and then stops the service.
- With no answer in 10 s, it shows `dialog.showMessageBox` `{message: 'Noema is not responding to the close request.', buttons: ['Force close', 'Keep open'], defaultId: 1, cancelId: 1}`.

```ts
// protocol.ts
export const IPC_PAGE = 'noema:ipc';                       // preload: window.ipc.postMessage(msg) → ipcRenderer.send(IPC_PAGE, msg); main accepts only 'noema:close-approved' from the main frame at the trusted origin
export const IPC_STARTUP_RETRY = 'noema:startup-retry';
export const IPC_STARTUP_CANCEL = 'noema:startup-cancel';
export const IPC_STARTUP_STATUS = 'noema:startup-status';  // main → startup page: StartupStatus
export type StartupStatus = { text: string; busy: boolean; mode: 'startup' | 'overlay' };   // buttons: 'Retry service' + ('Cancel / Quit' | 'Quit')
export const CHECKPOINT_CLOSE = 'noema:checkpoint-close', SERVICE_DOWN = 'noema:service-down', SERVICE_UP = 'noema:service-up', CLOSE_APPROVED = 'noema:close-approved';
// startup preload exposes: window.noemaStartup = { retry(): void; cancel(): void; onStatus(cb: (s: StartupStatus) => void): void }
// page events are dispatched with executeJavaScript(`window.dispatchEvent(new Event('${SERVICE_DOWN}'))`)
```
Startup texts (`desktop/src/main.rs`):
- `'Starting the managed local service…'`
- `'Stopping the owned local service…'`
- `'Cancelling managed startup…'`

```ts
// lifecycle.ts
export const DEFAULT_MANAGED_PORT = 8765, STOP_GRACE_MS = 5_000, TERM_GRACE_MS = 1_000, ACK_MAX_BYTES = 4_096;
export const STRIPPED_ENV = ['NOEMA_MODEL','NOEMA_SPEECH_MODEL','NOEMA_TOKEN','NOEMA_ACCESS_TOKEN','NOEMA_ALLOWED_HOSTS','NOEMA_ALLOW_REMOTE_MODEL','NOEMA_DATA_DIR'] as const;
export type LifecycleCode = 'workspace'|'workspace-locked'|'port-in-use'|'invalid-lease'|'python-missing'|'early-exit'|'startup-exit'|'timeout'|'identity'|'cancelled';
export class LifecycleError extends Error { constructor(readonly code: LifecycleCode, message: string) }
export const MESSAGES: {
  workspaceLocked: 'This workspace already has a service. Use external mode or stop it deliberately.';   // service.rs:77
  portInUse: 'Endpoint is occupied or unavailable. Do not stop its occupant; choose external mode or a deliberate stable endpoint.';
  pythonMissing: 'Python not found. Check --python and installed dependencies; no installation is automatic.';
  earlyExit: 'Python exited before accepting the desktop lease.';
  startupExit: 'Service exited during startup. Check Python dependencies, entry point and data permissions.';   // exit 12 and any other code
  timeout: 'Service readiness timed out. Check Python dependencies and data permissions, then Retry.';
  identity: 'Service identity verification failed. No workspace credentials were sent.';
  crashed: 'Managed service stopped unexpectedly. Your local draft stays in this window; Retry explicitly.';
  noDir: 'Choose a dedicated data directory.'; createDir: 'Cannot create the data directory. Check its permissions.';
  protectDir: 'Cannot protect the data directory.'; accessDir: 'Cannot access the data directory.';
};
export function managedPort(env: NodeJS.ProcessEnv): number;   // DEFAULT_MANAGED_PORT unless env.NOEMA_ELECTRON_TEST==='1' and env.NOEMA_ELECTRON_TEST_PORT is an integer 1024–65535
export function prepareWorkspace(dataDir: string, cwd: string): string;   // resolve; no final component → noDir; mkdir 0700 (chmod only if newly created); fs.realpathSync → canonical
export function exitCodeError(code: number | null): LifecycleError;   // 10 workspaceLocked, 11 portInUse, 12 invalid-lease/startupExit, other startupExit
export function ackMatches(line: string, expected: { instance: string; pid: number; workspace: string; port: number }): boolean;   // JSON object with exactly keys protocol(2), instance, pid, workspace, port
export function identityMatches(body: unknown, expected: { instance: string; pid: number }): boolean;   // exactly {protocol:2, instance, pid}
export type ManagedConfig = { python: string; entryPoint: string; workspace: string /* canonical */; port: number; timeoutMs: number; env: NodeJS.ProcessEnv };
export type ServiceHandle = { pid: number; instance: string; origin: string };
export class ManagedService extends EventEmitter<{ crashed: [LifecycleError]; exit: [number | null] }> {
  constructor(config: ManagedConfig);
  get state(): 'idle' | 'starting' | 'running' | 'crashed' | 'stopping' | 'stopped';
  start(): Promise<ServiceHandle>;   // serialised; a call while starting returns the same promise; never spawns while a child is alive
  cancel(): Promise<void>;           // during starting: stop() and reject start() with LifecycleError('cancelled')
  stop(): Promise<void>;             // close stdin → wait STOP_GRACE_MS → SIGTERM -pgid → TERM_GRACE_MS → SIGKILL -pgid → reap; ESRCH = success; group cleanup also runs after any observed exit
}
```
The spawn follows spec §6.4.2 exactly:
- `spawn(python, [entryPoint, '--desktop-managed', '--host', '127.0.0.1', '--port', String(port), '--data-dir', workspace, '--owner-pid', String(process.pid)], {detached: true, stdio: ['pipe','pipe','ignore'], env: stripped})`.
- stdin receives `JSON.stringify({instance}) + '\n'`, where `instance` is 32 random bytes as
  64 lowercase hex.

### 8.3 Python managed mode (`noema/desktop_service.py`, `run.py`)

```python
EXIT_LOCKED = 10
EXIT_PORT = 11
EXIT_LEASE = 12
def set_parent_death_signal() -> None: ...   # libc prctl(PR_SET_PDEATHSIG=1, signal.SIGTERM) via ctypes
def read_lease(stream) -> str: ...           # stream.readline(2049); >2048 bytes, bad JSON, non-object, or instance not 64 lowercase hex → ValueError('Invalid desktop lease'); returns the instance
def bind_listener(host: str, port: int) -> socket.socket: ...   # SO_REUSEADDR=1 (never SO_REUSEPORT), bind, listen(); OSError propagates
def managed(args) -> int: ...                # returns the process exit code
def workspace_lock(root): ...                # unchanged; still used by non-managed run.py
```
`run.py` changes:
- adds `parser.add_argument('--owner-pid', type=int, help=argparse.SUPPRESS)`;
- the managed branch becomes `raise SystemExit(managed(args))`.

`managed` steps, in order:
1. `set_parent_death_signal()`.
2. `os.getppid() != args.owner_pid` → 12.
3. Argument check. Each failure → 12:
   - Linux only;
   - `args.data_dir` set;
   - `not args.open`;
   - `args.host == '127.0.0.1'`;
   - `Path(args.data_dir)` exists and equals `.resolve(strict=True)`.
4. `read_lease(sys.stdin.buffer)` → 12 on ValueError.
5. `workspace_lock(root)` → 10 on ValueError.
6. `bind_listener` → 11 on OSError.
7. Start the stdin-EOF lease thread (unchanged).
8. Pop the env keys listed in `STRIPPED_ENV`.
9. `create_app(root, desktop_identity={'protocol': 2, 'instance': i, 'pid': os.getpid()})`.
10. `uvicorn.Server(...).run(sockets=[sock])`.
11. Once `server.started`, print exactly one line, `json.dumps({'protocol': 2, 'instance': i, 'pid': pid, 'workspace': str(root), 'port': port})`, and flush.
12. Normal shutdown → 0.

Protocol 1 (fd 3/fd 4) is deleted. `GET /api/desktop-instance` returns `dict(desktop_identity)`,
which is exactly `{protocol, instance, pid}`.

`electron/test/fixtures/fake_service.py` selects its mode with env `NOEMA_FAKE_MODE`:
- `locked`, `port`, `lease` → exit 10, 11 and 12;
- `hang` → no ack;
- `early-exit` → exit before reading stdin;
- `bad-ack` → wrong instance;
- `extra-key` → ack with an `extra` key;
- `bad-http` → correct ack, wrong identity over HTTP;
- `grandchild` → spawns `sleep 60` and writes both pids to `$NOEMA_FAKE_PIDFILE`;
- `env-dump` → writes `os.environ` keys to `$NOEMA_FAKE_ENVFILE`.

Everything else uses the real `run.py`.

## 9. Tests: layout, fixtures, fault injection

- Unit tests sit next to their module as `web/src/**/<module>.test.ts(x)`. Electron unit tests are
  `electron/test/*.test.ts`. Python tests are `tests/test_*.py`.
- `fake-indexeddb`: each `local/*.test.ts` uses `import 'fake-indexeddb/auto'`, plus
  `vi.resetModules()` and `indexedDB = new IDBFactory()` in `beforeEach`.
- Fake clock: `vi.useFakeTimers()` with `vi.setSystemTime(...)`.

### 9.1 `web/e2e/server.ts` (P1)

```ts
export const E2E_TOKEN = 'e2e-admin-token-0123456789abcdef';
export type NoemaServer = { origin: string; port: number; dataDir: string;
  api<T = unknown>(method: string, path: string, body?: unknown): Promise<T>;   // fetch(origin + path): path INCLUDES '/api' (e.g. '/api/settings'); Bearer E2E_TOKEN + X-Noema-Request: 1; throws on non-2xx
  kill(): Promise<void>; restart(): Promise<void>; stop(): Promise<void> };      // restart: same port + dataDir
export function getFreePort(): Promise<number>;
export function startNoema(options?: { dataDir?: string; env?: Record<string, string>; port?: number }): Promise<NoemaServer>;
// spawns <repo>/.venv/bin/python <repo>/run.py --host 127.0.0.1 --port <p> --data-dir <tmp or dataDir>, env NOEMA_ACCESS_TOKEN=E2E_TOKEN; waits ≤15 s for GET /api/health; throws 'Run npm --prefix web run build first' if web/dist/index.html is missing
```

### 9.2 `web/e2e/fixtures.ts` (P1)

```ts
export const test: TestType<{ noema: NoemaServer; csp: void; pageErrors: void }, {}>;   // noema: a fresh server per test, stopped after; csp: auto fixture, addInitScript records securitypolicyviolation into window.__cspViolations and fails the test if non-empty at teardown; pageErrors: auto fixture, fails the test on any uncaught page error (parity rows 'No uncaught … JavaScript errors')
export { expect } from '@playwright/test';
export function gotoApp(page: Page, noema: NoemaServer, hash?: string /* default '#/overview' */): Promise<void>;   // goto origin+'/'+hash; waits for text 'Server connected'
export function seedLocalDb(page: Page, origin: string, seed: { draft?: SeedDraft; taskDraft?: unknown; outbox?: SeedDraft[] }): Promise<void>;   // goto origin+'/api/health', open noema-local-v1 v1 with app.js's upgrade, write records; files become Blobs
export type SeedDraft = { id: string; raw: string; task_id: string; files: { name: string; type: string; base64: string }[]; error?: string };
export function readLocalDb(page: Page): Promise<{ draft: unknown; taskDraft: unknown; outbox: { id: string; raw: string; error?: string; fileCount: number }[] }>;
```

### 9.3 `web/e2e/faults.ts` (P1)

All helpers use `page.addInitScript` only. No production hooks.

```ts
export function failIdbWrite(page: Page, options: { store: 'kv' | 'outbox'; key?: string; times?: number; error: 'QuotaExceededError' | 'AbortError' }): Promise<void>;
export function delayIdbTransactions(page: Page, ms: number): Promise<void>;
export function blockIdbOpen(page: Page): Promise<void>;                       // fires onblocked
export function failFetch(page: Page, options: { path: string | RegExp; method?: string; times?: number;
  fault: 'network' | { status: number; body?: string; contentType?: string } }): Promise<void>;
export function holdFetch(page: Page, path: string | RegExp): Promise<{ released(): Promise<void>; release(): Promise<void> }>;   // via page.exposeFunction
export function loseAck(page: Page, path: string | RegExp, times?: number): Promise<void>;   // forwards the request, then rejects with TypeError('Failed to fetch')
export function stubIpc(page: Page): Promise<void>;   // window.ipc = { postMessage(m) { window.__ipcMessages.push(m) } }
```

### 9.4 E2E spec files (owner)

| File | Owner | Plan file that creates it |
|---|---|---|
| sw.spec.ts, serving.spec.ts | P1 | `01-foundation.md` |
| outbox.spec.ts (upgrade seed uploads once, flush stop rules, lost ack) | P3 | `01-foundation.md` Task 19 creates it; `03-screens-capture-notes.md` Task 8 appends the Outbox dialog tests |
| boot.spec.ts (boot order, unlock, cookie-only via `--host-resolver-rules`, legacy hashes), notifications.spec.ts, shell.spec.ts (nav, keyboard, a11y) | P3 | `02-screens-core.md` |
| checkpoint.spec.ts | P3 | `03-screens-capture-notes.md` |
| now.spec.ts, plan.spec.ts, task-capture.spec.ts, refetch.spec.ts, offline.spec.ts, layout.spec.ts | P4 | `02-screens-core.md` |
| capture.spec.ts (also the navigation-guard E2E; there is no guards.spec.ts), notes.spec.ts, settings.spec.ts | P4 | `03-screens-capture-notes.md` |
| terrain.spec.ts | P5 | `04-terrain.md` |

Electron e2e (`electron/e2e/fixtures.ts`, P6):
```ts
export function launchNoema(args: string[], options?: { env?: Record<string, string>; profile?: string }): Promise<{ app: ElectronApplication; window: Page; profile: string }>;   // always a throwaway --profile
export function stubMessageBox(app: ElectronApplication, responses: number[]): Promise<void>;   // via app.evaluate; responses consumed in order
```
Electron e2e reuses `startNoema` from `../../web/e2e/server.ts`.

## 10. Phase ownership

The phase ids P1–P6 are fixed. The plan files that implement them in this directory are:

| Phase | Plan file(s) | Notes |
|---|---|---|
| P1 + P2 | `01-foundation.md` | also creates `web/src/ui/Toast.tsx` as a stand-in (overwritten by `02-screens-core.md` Task 4), `domain/tasks.ts` with only `TASK_EDIT_FIELDS`/`editableFields`, and `web/e2e/outbox.spec.ts` |
| P2 (`domain/nowState.ts`, rest of `domain/tasks.ts`), P3, P4 (Overview, Tasks, Add task, Task detail, layout) | `02-screens-core.md` | Task 24 runs after `03-screens-capture-notes.md` |
| P3 (`ui/Markdown.tsx`, `dialogs/Outbox.tsx` + `outbox` arm, `shell/checkpoint.ts`, `shell/preloadError.ts` + their `main.tsx` calls, checkpoint.spec.ts), P4 (Capture, Notes, NoteView, Settings, NoteHistory, Sketch, guard registrations) | `03-screens-capture-notes.md` | |
| P5 | `04-terrain.md` | Task 9 (budget) runs once, after `05-electron.md` |
| P6 Electron rows | `05-electron.md` | |
| P6 cutover rows | `06-cutover.md` | |

`parity-map.md` and `handbook-trace.md` are created by `01-foundation.md` Task 1. Later plans may append their own trace sections (`02-screens-core.md` Task 23, `04-terrain.md` Task 8, `05-electron.md` Task 15) and rewrite Target cells of parity rows they cover (`03-screens-capture-notes.md` Task 15, `05-electron.md` Task 16); only `06-cutover.md` changes Status cells.

| Contract phase plan (logical) | Owns (creates or modifies) | Modifies other phases' files |
|---|---|---|
| `01-foundation.md` (P1) | branch creation, `.nvmrc`, `.gitignore` (add web/node_modules, web/dist, web/test-results, web/playwright-report, electron/node_modules, electron/dist), web scaffold (§1.2 P1 rows), `noema/server.py`, `noema/models.py`, `noema/store.py`, `tests/test_core.py`, web/e2e server/fixtures/faults, `docs/superpowers/specs/parity-map.md` and `handbook-trace.md` (rows map to phase plus target spec file; first task) | — |
| `02-data.md` (P2) | `web/src/api/*`, `local/*`, `domain/*`, `state/*`, `test/fixtures.ts`, their tests | — |
| `03-shell.md` (P3) | `copy.ts`, `routes/*`, `shell/*` except serviceWorker.ts, `ui/Dialog,Toast,Icon,Markdown`, `dialogs/Unlock,Outbox`, screens (headings only), `styles/shell.css,ui.css`, P3 e2e | `src/main.tsx` (replace body) |
| `04-screens.md` (P4) | `components/*`, `dialogs/TaskCapture,TaskDetail,Settings,NoteHistory`, `capture/*`, `styles/screens.css`, P4 e2e | `screens/*.tsx` (complete), `shell/DialogHost.tsx` (add cases) |
| `05-terrain.md` (P5) | `ui/BackgroundField.tsx`, `field.ts`, `fieldShaders.ts`, `field.test.ts`, `styles/field.css`, terrain.spec.ts | `shell/AppShell.tsx` (mount field) |
| `06-electron-cutover.md` (P6) | `electron/**`, `noema/desktop_service.py`, `run.py`, `tests/test_managed_service.py` (protocol 2, Python side, incl. `test_public_handshake_does_not_authorize_api`), cutover (spec §3, §9): delete `public/`, `desktop/`, `experiments/ui-ab/hosts/wry`, `experiments/ui-ab/hosts/companion`, `tests/now_state.test.cjs` (ported to nowState.test.ts); move `public/cat.png` → `tools/assets/cat.png`, edit `tools/sway_companion.py:271`, `tests/test_companion.py:15`; docs in spec §9; `SHA256SUMS` | `parity-map.md` and `handbook-trace.md` (status column only) |

Execution order: P1 → P2 → P3 → P4 → P5 → P6. Every phase ends with all gate commands green for
what exists. The cutover merge is not part of any plan; the owner performs it after §8 of the
spec passes.

Deliberately skipped (ponytail):
- No Firefox Playwright project, because the spec targets modern Chromium and Firefox but asks
  for no browser matrix.
- No dev proxy (decision 17A).
- No AI priority or daily slogan code (§11).


## Addendum (controller, Phase 2a pre-flight): additional 02-owned files
`web/src/components/focus.ts`, `web/src/components/TaskFields.tsx`, `web/src/ui/PageHeading.tsx`, `web/src/ui/testing.ts`, `web/src/dialogs/TaskEdit.tsx`, `web/e2e/db.ts`, `web/e2e/nowSeed.ts`, `web/src/state/store.ts` (createStore helper, Task 4).

## Addendum (Phase 6, `07-rename-dhara.md`): Noema → Dhara

Binding spec: `docs/superpowers/specs/2026-10-12-rename-dhara-design.md` (decisions 21C, 22C). Each name below replaces the one this contract gives; an old name survives only in the shims listed in the last column, on a line marked `rename-shim:` (one release) or `rename-keep:` (permanent), or in an allowed path (`noema/` shim package, `dhara/env.py`, `electron/src/env.ts`, `web/src/local/migrate.ts`, their tests, `web/e2e/v1/sw.js`, `tests/test_rename_gate.py`, the archives, `experiments/`).

| Section | Was | Is now (shim) |
|---|---|---|
| §2, §8.3, §10 | package `noema/` (`noema/server.py`, `noema/desktop_service.py`, `models.py`, `store.py`, `worker.py`, `task_capture.py`) | `dhara/` (`noema/__init__.py` re-exports `dhara` with a `DeprecationWarning`) |
| pyproject | `noema-local`, `packages = ["noema"]` | `dhara-local`, `packages = ["dhara", "noema"]` |
| §2 server | cookie `noema_session`; marker header `x-noema-request`; `title='Noema'`; export `noema.json` / `noema-export.zip` | `SESSION_COOKIE = 'dhara_session'` (`LEGACY_SESSION_COOKIE` read and cleared); `has_request_marker()` accepts `X-Dhara-Request` or `X-Noema-Request`; `title='Dhara'`; `dhara.json` / `dhara-export.zip`. `noema.sqlite3` is unchanged (`rename-keep:`) |
| §8.3, env everywhere | `NOEMA_*` read with `os.getenv`; `STRIPPED_ENV` of seven `NOEMA_*`; `NOEMA_FAKE_*`, `NOEMA_QA_*` | `dhara/env.py`: `PREFIX`, `LEGACY_PREFIX`, `PREFIXES`, `env(name, default)`, `strip(environment, names)`; `dhara.desktop_service.STRIPPED_NAMES` and `STRIPPED_ENV` (fourteen names, both prefixes), `LOCK_NAME = '.dhara-service.lock'`; `DHARA_FAKE_*`, `DHARA_QA_*` |
| §1.3 `events.ts`, §8.2 `protocol.ts` | `noema:checkpoint-close`, `noema:service-down`, `noema:service-up`, `noema:close-approved`, `noema:ipc`, `noema:startup-retry/-cancel/-status` | `dhara:` + the same suffixes |
| §1.3 `globals.d.ts`, §6.3, §8.2 | `__noemaCheckpointCloseReady`, `__noemaField`, `window.noemaStartup` (tests: `__noemaReportCsp`, `__noemaFetchRules`, `__noemaHold*`, `openNoemaDb`, `noema-test-checkpoint`) | `__dhara…`, `window.dharaStartup`, `openDharaDb`, `dhara-test-checkpoint` |
| §1.4, spec §6.2 | cache `noema-shell-<buildhash>` | `dhara-shell-<buildhash>`; `sw.js` `activate` also deletes `noema-shell-*` |
| §4.1 | `DB_NAME = 'noema-local-v1'`; `LocalErrorCode` | `'dhara-local-v1'`; `LocalErrorCode` gains `'migrate'`; new `web/src/local/migrate.ts` (`LEGACY_DB_NAME`, `migrateLocalDb(): Promise<number>`), awaited in `main.tsx` before §6.6 step 2; a `LocalStoreError` from boot renders the retry notice |
| §5 | `closeOtherTabs`, `unlockTitle`, `unlockHelp`, `notificationTitle`, `closeConfirm`, `closeCheckpointFailed`, `updateReady` say "Noema" / `NOEMA_ACCESS_TOKEN` | say "Dhara" / `DHARA_ACCESS_TOKEN`; new `migrationFailed: 'Local data could not be migrated; keep this page open and retry.'` |
| §6.3 | `NOTIFICATIONS_KEY = 'noema-notifications'`; Nav `noema-sidebar-collapsed` | `'dhara-notifications'` plus `notificationsOptedIn()` (reads the old key as fallback; `Settings.tsx` uses it); `'dhara-sidebar-collapsed'` (read fallback) |
| §8.1 | package `noema-electron` | `dhara-desktop`, `"productName": "Dhara"`; new `electron/src/env.ts` (`PREFIX`, `LEGACY_PREFIX`, `STRIPPED_NAMES`, `STRIPPED_ENV`, `env(name, source, log)`) |
| §8.2 `main.ts`, `permissions.ts`, `close.ts` | `Noema: <message>` on stderr; window title `Noema`; "Allow Noema …"; `'Noema is not responding …'` | `Dhara: …`; `Dhara`; "Allow Dhara …"; `'Dhara is not responding …'` |
| §8.2 `profile.ts` | default `…/noema/electron` | `…/dhara/electron`; new `legacyProfile(env)` and `adoptLegacyProfile(profile, legacy, log)`, run by `main.ts` for the default profile before `app.setPath('userData', …)` |
| §8.2 `lifecycle.ts` | `STRIPPED_ENV` defined here; `managedPort` reads `env.NOEMA_ELECTRON_TEST*` | `STRIPPED_ENV` re-exported from `env.ts`; `managedPort` reads `env('ELECTRON_TEST')` / `env('ELECTRON_TEST_PORT')` |
| §9.1 | `NoemaServer`, `startNoema`, `X-Noema-Request`, `NOEMA_ACCESS_TOKEN` | `DharaServer`, `startDhara`, `X-Dhara-Request`, `DHARA_ACCESS_TOKEN`; `childEnv` strips both prefixes |
| §9.2 | fixture `noema: NoemaServer`; `openLocalDb()` on `noema-local-v1`; `seedLocalDb(page, origin, seed)` | `dhara: DharaServer`; `openLocalDb(name = 'dhara-local-v1')`; `seedLocalDb(page, origin, seed, dbName = DB_NAME)` |
| §9.4 | `launchNoema` | `launchDhara` |

New tests: `tests/test_shims.py`, `tests/test_rename_gate.py` (`ALLOWED_PATHS`, `KEEP_TOKENS`, `MARKERS`, the grep gates), `electron/test/env.test.ts`, `web/src/local/migrate.test.ts`. The repository directory `/home/p4nic/code/noema` and `/home/p4nic/code/noema-cutover-backup/` keep their names (spec §1). Phase 6 commit messages are one line with no body and no trailer (owner rule; it overrides §0's trailer sentence for this phase). Phase 6 ends with `cutover-gate` moved to its gate commit; `06-cutover.md` Task 13 (the merge) runs after it.

## Addendum (Packaging, `2026-10-13-single-binary-packaging.md`): the AppImage

Binding spec: `docs/superpowers/specs/2026-10-13-single-binary-packaging-design.md` (decisions 29C, 30A, 31A, 32A). Nothing above is renamed; these are additions, each owned by the packaging plan's task in parentheses.

| Section | Addition |
|---|---|
| §0 gate | Unchanged. The plan runs the eight-command line recorded in `docs/TEST_REPORT.md` "### Final gate run" and the README Verification block (`tests/test_cutover_docs.py` `GATE_COMMANDS`: the six above plus `npm --prefix electron ci && node electron/scripts/link-sandbox.mjs`), one segment each, with `release/out/` populated so no log has a skipped count. `release/build.sh` is not part of the gate; `npm --prefix electron run package` is its alias (`electron/package.json` `scripts.package = "bash ../release/build.sh"`, Task 5). |
| §8.1 package | New script `package`; `.gitignore` gains `release/out/` and `release/cache/` (Task 5). |
| §8.2 `cli.ts` | `export type PackagedFacts = { resourcesPath: string; dataHome: string }`; `parseArgs(argv, cwd, repoRoot, env, packaged: PackagedFacts | null = null)`. Non-null facts and neither `--server` nor `--manage-service`: `manageService = true`, `dataDir = <dataHome>/dhara/workspace`; non-null facts always: `python` defaults to `<resourcesPath>/service/dhara-service/dhara-service`, `entryPoint` to `''`. Every explicit flag still wins (Task 1). |
| §8.2 `profile.ts`, `main.ts` | `dataHome(env)` is exported; `main.ts` passes `app.isPackaged ? { resourcesPath: process.resourcesPath, dataHome: dataHome(process.env) } : null` (Task 1). |
| §8.2 `lifecycle.ts` | `ManagedService` spawns `[python, ...args]` when `entryPoint === ''`, `[python, entryPoint, ...args]` otherwise; arguments, protocol 2, `MESSAGES` and exit codes unchanged (Task 2). |
| §8.3 service | `pyproject.toml` extra `release = ["pyinstaller==6.22.3", "pyinstaller-hooks-contrib==2026.8"]`; `release/dhara-service.spec` (one directory, console, `web/dist` as data, name `dhara-service`); the 409 detail of `POST /api/notes/{id}/transcribe` gains `(the packaged build does not include speech)` before `Your recording is saved.` (Task 4). |
| new `release/` | `release/launch.cjs` (CommonJS: `EXIT_REFUSED = 3`, `NO_SANDBOX = 'Dhara: --no-sandbox is not supported.'`, `SYSTEM_HELPER = '/opt/google/chrome/chrome-sandbox'`, `dataHome(env)`, `helperMessage(target)`, `ownerMessage(builtFor, uid)`, `decide({ env, argv, exe, dataHome, bundledHelper, facts })`; Task 3), `release/build.sh`, `release/AppRun`, `release/dhara.desktop` (Task 5). Outputs: `release/out/Dhara-<version>-x86_64.AppImage`, `release/out/AppDir/`, `release/out/service/`, `release/cache/` (ignored). The sandbox helper ships at `usr/lib/dhara/resources/chrome-sandbox`, never beside the binary. |
| §8.4 tests | `electron/test/launch.test.ts` (vitest, injected facts); `electron/test/cli.test.ts` describe `parseArgs in a packaged build (packaging spec §4)`; `electron/test/service-start.test.ts` test `spawns [python, ...args] when the entry point is empty, as for a frozen service (packaging spec §4)`; `electron/e2e/packaged.spec.ts` (Playwright under the private Sway, skipped with a reason without the artifact); `tests/test_release.py`; `tests/test_managed_service.py` fixture `service_cmd` (params `venv`, `packaged`), `FROZEN_DEFAULT`, `SERVICE_CMDS`, env `DHARA_SERVICE_CMD` (shell-split override of the frozen command), `launch(cmd, data, port, owner=None, host='127.0.0.1', cwd=None)`; `tests/test_core.py` `test_transcribe_off_names_the_setup_commands` gains one needle. |
| §9 docs | `docs/DESKTOP.md` section `## Packaged build (AppImage)` before `## Close checkpoint` and one sentence in `## Tests`; README `### Install (Linux x86_64 AppImage)` before `### Linux / macOS`; `docs/PROGRESS.md` roadmap rows `Packaging follow-on` (`.deb`) and `Release checklist`; `docs/TEST_REPORT.md` paragraph `Packaging (the AppImage): …` before `### Handbook §21 …`; `cutover-gate` moved to the gate commit and `SHA256SUMS` regenerated last, exactly as Phase 6 Task 11 Step 3 (Task 7). Commit messages stay one line, no body, no trailer. |
