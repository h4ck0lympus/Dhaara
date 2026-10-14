# Phase 2a — Shell, Now, Plan, tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the variant B app shell (navigation, status line, toasts, dialogs, unlock, routes, modal links, guard mechanism, keyboard, notifications, boot-time flush), the Overview (Now) screen, the Tasks (Plan) screen, Add task, Task detail and Edit task on top of the contract P2 data layer, with parity to `public/app.js`, the parity-map rows of `qa/now_ui_check.py`, `qa/task_capture_check.py`, `qa/task_link_check.py` and `qa/settings_link_check.py`, and the handbook rules.

**Architecture:** One React tree under a TanStack hash router. `AppShell` is the root route component and hosts `Nav`, the top bar, `<Outlet/>`, `ToastHost`, `DialogHost`, the Unlock host and `RouteGuards`. Dialog and unlock state live in tiny external stores (`useSyncExternalStore`). Screens read the snapshot through `useSnapshot()` and mutate only through the P2 mutation hooks (no retries, `expected_version` on every edit). Modal links (`#/task/<id>`, `#/settings` and their legacy forms) open dialogs without unmounting the screen underneath. Forms copy server data into local state once, when they open. All copy that a later daily-slogan feature may swap lives in `web/src/copy.ts`.

**Tech Stack:** React 19.3.0, TypeScript 5.9.3 (strict), @tanstack/react-router 1.170.42, @tanstack/react-query 5.104.1, zod 4.1.12 (via `web/src/zod.ts` only), Vite 6.4.4, Vitest 5.0.3 + jsdom 30.1.2 + @testing-library/react 16.3.3, Playwright 1.64.0 against the real FastAPI service.

**Spec:** /home/p4nic/code/noema/docs/superpowers/specs/2026-10-10-react-electron-migration-design.md (sections §4.2 boot/401/Unlock, §4.3 replay policy, versions and refetch rule, §4.4 task capture and flush, §4.5 routing, guards and keyboard, §4.6 content, accessibility and notifications, §4.7 handbook conformance: product rules, look, slogans, greeting, labels, Overview, layout by form factor, storage-state labels, Tasks (Plan), accessibility; §5 rows Shell, Now, Focus, Plan, Add task, Task detail, Reminders, Runs, Unlock; §8 parity rule, Upgrade, Refetch, Cookie-only E2E) · **Contract:** /home/p4nic/code/noema/docs/superpowers/plans/2026-10-10-react-electron/00-contract.md

## Prerequisites (which earlier phase files must be complete)

- **`01-foundation.md` (contract P1 and P2)** is fully executed on branch `feat/react-electron` and green: `web/` scaffold, `web/src/zod.ts`, `events.ts`, `globals.d.ts`, `strings.ts` (`S`, contract §5), `styles/base.css`, `assets/icon.svg`, `assets/fonts/*`, `shell/serviceWorker.ts`, `web/index.html`, `web/vite.config.ts`, `web/playwright.config.ts`, `web/e2e/{server,fixtures,faults}.ts` (contract §9.1–9.3; `NoemaServer.api(method, path, body)` fetches `origin + path`, so the path **includes** `/api`, e.g. `noema.api('POST', '/api/tasks', {...})`, `01-foundation.md` Task 8), `docs/superpowers/specs/parity-map.md`, `docs/superpowers/specs/handbook-trace.md`, FastAPI serving of `web/dist`, the `display_name` setting, and the data layer: `web/src/api/{client,endpoints,schemas,session}.ts`, `web/src/local/{db,limits,drafts,taskDraft,outbox}.ts`, `web/src/domain/{connection,format}.ts`, `web/src/state/{queryClient,queries}.ts`, `web/src/test/fixtures.ts` (contract §3, §4).
- Files `01-foundation.md` already created that this plan changes:
  - `web/src/domain/tasks.ts` and `tasks.test.ts` hold only `TASK_EDIT_FIELDS` and `editableFields` (`01-foundation.md` Task 18). Task 3 **modifies** them: it replaces both files and keeps those two exports unchanged.
  - `web/src/ui/Toast.tsx` and `Toast.test.tsx` are a Phase-1 stand-in (`01-foundation.md` Task 15). Task 4 **overwrites** them and keeps the `toast(message, options)` signature.
  - `web/src/main.tsx` is the minimal boot-and-flush page (`01-foundation.md` Task 19). Task 14 replaces its body.
  - `web/e2e/outbox.spec.ts` (`01-foundation.md` Task 19) already holds the boot-flush, lost-acknowledgement and spec §8 Upgrade tests (parity rows 64, 77, 78, 85, 86). This plan does not recreate it. Task 14 reruns it against the full shell.
- **Phase 2b** (`03-screens-capture-notes.md`) runs after Tasks 1–23 of this plan. As that plan records, it completes the stub screens created here, owns the P3 items this plan hands over — `ui/Markdown.tsx`, `dialogs/Outbox.tsx` with its `outbox` case in `shell/DialogHost.tsx`, `shell/checkpoint.ts` and `shell/preloadError.ts` with their two calls in `main.tsx` — adds the `settings`, `note-history` and `sketch` cases, and registers the three guards whose mechanism Task 8 builds. It also owns the `settings_link_check.py` parity rows (its `settings.spec.ts`) and the verbatim trace titles of U10–U12. **Task 24 of this plan runs after Phase 2b**, because its parity rows need the Capture editor, the note editor and the Settings agents section.

## Global Constraints (one line each, exact values copied verbatim from the spec that apply to this phase)

- Node **22.23.3** on the npm script PATH; exact versions from contract §1.1; relative imports only; TypeScript `strict: true`.
- zod is imported only from `web/src/zod.ts`; `fetch(` appears only in `web/src/api/client.ts`.
- Parity rule: "**Test title = label.** The target test's title is the label verbatim." Handbook-trace test titles are binding the same way.
- "The UI **never automatically retries a mutation**." Mutation hooks have `retry: 0`.
- "Every edit carries `expected_version`. A 409 shows a conflict prompt and never overwrites. Complete/reopen/priority re-read the task and PUT with the fresh version."
- "**Refetches never replace in-progress input.** … TaskDetail … and TaskCapture copy server data into local form state only when they open."
- Task capture: "`pending` is persisted before any HTTP call. If that write fails, the error is 'Draft storage failed. Task not added'." "Inputs stay frozen while pending." "The acknowledgement must have an `id` and `original_input === raw`." "409, 5xx or network error: stay frozen and show 'Retry add task'." "401 or any other 4xx: unfreeze." "Escape, Close and backdrop all save the draft first; if that save fails, the dialog stays open. Close is blocked while a submit is in flight."
- Flush: "The item is deleted only after a 2xx." "A 4xx other than 401 stores `error` and stops." "A 401, a 5xx or a network failure stops without marking." "Flush triggers: boot, after save, after unlock, `online`, becoming visible, and each visible snapshot tick."
- Upgrade: "seed `noema-local-v1` with an old-shape outbox item and drafts; the item uploads exactly once with its original id."
- Routes: "`#/overview` (default), `#/capture`, `#/notes`, `#/note/$id`, `#/plan`. Modal routes: `#/task/$id` and `#/settings`." "On a cold start, `#/task/$id` renders over `#/plan` and `#/settings` renders over `#/overview`." "'Task unavailable.' is checked against the first loaded snapshot."
- Legacy forms "`#overview`, `#capture`, `#notes`, `#plan`, `#note/<id>`, `#task/<id>`, `#settings`) are rewritten to the new forms **on boot and on every `hashchange`**."
- Keyboard: "`n` opens Capture, only with no open dialog, no modifier key, and focus outside any field." "Ctrl/Cmd+K opens search." "Ctrl/Cmd+Enter submits Capture and Add task. Plain Enter inserts a newline." "IME composition is respected."
- Boot: "`GET /api/state`. Only on a 401, `POST /api/session {token:''}`. Only on a second 401, open Unlock." "Unlock stacks over any open dialog and does not discard it." "After unlock: refresh the snapshot, then flush the outbox." "A 401 during task capture unfreezes the input."
- Accessibility: "Nav accessible names match the visible text." "Dialogs keep the focus trap, `inert` background, Escape and focus restore." "Toasts use `role=status aria-live=polite`; errors use `role=alert`." "Status is never shown by colour alone; contrast is at least 4.5:1." "touch targets ≥ 44×44 px at phone widths."
- Safety: "no `dangerouslySetInnerHTML` is used with user content." Session links: "http/https, `noopener noreferrer`".
- Notifications: "the `noema-notifications` localStorage key, `state==='due'` only, at most once per id per session, and a snooze re-arms it." "Tag = reminder id." "Icon is the new hashed icon URL."
- Remove demo content: "fixtures and `DEMO_CLOCK`", "the hard-coded name in the greeting and the hard-coded 'V' avatar", "the 'Isolated demo' and 'fixture data' labels", "the `?fixture=` and `?host=` parameters", "the hard-coded 'Tonight', and the example code and SVG".
- Slogans (decision 18B): "Capture a thought." / "A quiet place for the rough edges.", "A place to return to." / "Your notes, with their original thinking intact.", "A little room to plan." / "Keep the next step in view.", and "Same chaos. A calmer you." all live in `web/src/copy.ts`.
- Greeting: "'Good morning/afternoon/evening, {name}.' The time of day comes from the device clock." "If it is empty, the greeting has no name ('Good afternoon.')." "The avatar shows the first letter of the name, or is hidden when no name is set."
- Labels: "visible navigation labels are **Overview, Capture, Notes, Tasks**. Route ids stay `overview`/`capture`/`notes`/`plan`."
- Priority: "**'Auto · rules'** today", "**'Auto · AI'** once the AI-priority milestone (§11) adds that source", "**'Set by you'** for a manual override", "The UI maps unknown sources to 'Auto'". AI priority itself is **not** built here (§11.1); daily slogans are **not** built here (§11.2).
- Layout: "Desktop ≥1000 px: Narrow sidebar that the user can collapse to icons (remembered per device in localStorage)"; "Phone <650 px: Bottom navigation; Capture is full-screen"; "Tablet / landscape 650–1000 px: Sidebar"; "Portrait: Collapses to the phone's single column".
- "No fabricated effort, durations, dates or urgency. 'Nothing actionable right now' is a valid result." "Pins and manual priority overrides always win over automatic logic." "A completed run creates review work, never Done. A stale run reads as unknown."
- Storage states: "the labels for 'on this device / draft', 'queued' and 'saved on server' are distinct and never interchangeable".
- Every reading or editing surface (page heading, main column, plan list, every `<dialog>`) carries `data-quiet`.
- Snapshot cadence: "`refetchInterval` 15 s while visible, no fetch while hidden".

## Review Focus (the five input classes/failure modes most likely to bite a user that the spec implies; for each, the owning task must include a test for it)

1. **Unconfirmed task capture** (lost acknowledgement, a generic HTTP 200 without a task, 409/5xx/network versus 401/other 4xx, local draft write failing on submit or on Escape/Close). A duplicate task or a lost thought is the worst outcome. Owner: **Task 19** (unit + `task-capture.spec.ts` rows 145–154).
2. **A stale or disconnected snapshot presented as current** (alternatives, time filter, integration status and focus provenance while offline). Owner: **Task 17** (unit + `now.spec.ts` disconnected rows + `offline.spec.ts`).
3. **Concurrent edits and refetches against an open edit form** (409 conflict, a 15 s refetch while typing, datetime precision of untouched fields). Owner: **Task 21** (unit + `plan.spec.ts` conflict + `refetch.spec.ts` + `task-capture.spec.ts` row 140).
4. **Silent changes to focus, pins or priority** (Start while a pin exists, Clear/Unpin, task creation, task/settings link navigation, an edit save). Owners: **Task 11** (confirm rules), **Task 17** (Start only without a pin; row 106), **Task 20** (Focus on this; rows 107, 108 and 162: links leave pin and priority unchanged), **Task 21** (row 141).
5. **Untrusted task text and links** (HTML in titles and context, `javascript:` or non-http session URLs, long unbroken titles at 390 px). Owners: **Task 15** (row escaping, review link), **Task 20** (detail escaping, link rules), **Task 22** (no horizontal overflow at 390 px); Markdown escaping is Phase 2b's (`03-screens-capture-notes.md` Task 9).

---

### Task 1: `copy.ts` — slogans, greeting and avatar letter

**Files:**
- Create: `web/src/copy.ts`
- Test: `web/src/copy.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (contract §6.4):
  ```ts
  export const COPY: { readonly tagline: 'Same chaos. A calmer you.'; readonly capture: {…}; readonly notes: {…}; readonly plan: {…} };
  export function greeting(now: Date, displayName: string): string;
  export function avatarLetter(displayName: string): string | null;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// web/src/copy.test.ts
import { describe, expect, it } from 'vitest';
import { COPY, avatarLetter, greeting } from './copy';

describe('COPY (owner decision 18B: slogans kept)', () => {
  it('COPY keeps the variant B headings, subtitles and tagline verbatim', () => {
    expect(COPY).toEqual({
      tagline: 'Same chaos. A calmer you.',
      capture: { title: 'Capture a thought.', subtitle: 'A quiet place for the rough edges.' },
      notes: { title: 'A place to return to.', subtitle: 'Your notes, with their original thinking intact.' },
      plan: { title: 'A little room to plan.', subtitle: 'Keep the next step in view.' },
    });
  });
});

describe('greeting', () => {
  it('greeting follows the device clock and display_name', () => {
    const cases: [number, string][] = [[0, 'Good morning'], [11, 'Good morning'], [12, 'Good afternoon'], [17, 'Good afternoon'], [18, 'Good evening'], [23, 'Good evening']];
    for (const [hour, part] of cases) expect(greeting(new Date(2026, 9, 10, hour, 30), 'Vishal')).toBe(`${part}, Vishal.`);
  });

  it('trims the name', () => {
    expect(greeting(new Date(2026, 9, 10, 9), '  Vishal  ')).toBe('Good morning, Vishal.');
  });

  it('greeting and avatar omit an empty display_name', () => {
    expect(greeting(new Date(2026, 9, 10, 14), '')).toBe('Good afternoon.');
    expect(greeting(new Date(2026, 9, 10, 14), '   ')).toBe('Good afternoon.');
    expect(avatarLetter('')).toBeNull();
    expect(avatarLetter('   ')).toBeNull();
  });
});

describe('avatarLetter', () => {
  it('upper-cases the first letter of the trimmed name', () => {
    expect(avatarLetter('vishal')).toBe('V');
    expect(avatarLetter('  élodie')).toBe('É');
  });

  it('keeps a surrogate pair whole', () => {
    expect(avatarLetter('😀 Sam')).toBe('😀');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/copy.test.ts`
Expected: FAIL with `Error: Failed to resolve import "./copy" from "src/copy.test.ts". Does the file exist?`

- [ ] **Step 3: Write the minimal implementation**

```ts
// web/src/copy.ts
// All variant B headings, subtitles and the tagline (owner decision 18B). The later
// daily-slogan feature (spec §11.2) only swaps this module's source.
export const COPY = {
  tagline: 'Same chaos. A calmer you.',
  capture: { title: 'Capture a thought.', subtitle: 'A quiet place for the rough edges.' },
  notes: { title: 'A place to return to.', subtitle: 'Your notes, with their original thinking intact.' },
  plan: { title: 'A little room to plan.', subtitle: 'Keep the next step in view.' },
} as const;

export function greeting(now: Date, displayName: string): string {
  const hour = now.getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = displayName.trim();
  return name ? `${part}, ${name}.` : `${part}.`;
}

export function avatarLetter(displayName: string): string | null {
  const name = displayName.trim();
  return name ? [...name][0].toUpperCase() : null;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- src/copy.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/copy.ts web/src/copy.test.ts
git commit -m "feat(web): keep variant B copy and add display-name greeting"
```

### Task 2: `domain/nowState.ts` — verbatim Now-state port with the 22 cases

**Files:**
- Create: `web/src/domain/nowState.ts` (port of `public/app.js:148-183`, strings unchanged)
- Test: `web/src/domain/nowState.test.ts` (port of all 22 cases in `tests/now_state.test.cjs:11-91`)

**Interfaces:**
- Consumes: `Focus`, `Snapshot`, `SnapshotRun`, `SnapshotTask` from `../api/schemas`; `makeTask`, `makeRun`, `makeSnapshot`, `makeNoteSummary` from `../test/fixtures` (tests only).
- Produces (contract §4.5):
  ```ts
  export type NowMode = 'disconnected'|'new'|'notes-only'|'unknown'|'attention'|'complete'|'available'|'waiting'|'filtered'|'idle';
  export type NowState = { mode: NowMode; title: string; explanation: string; primary: SnapshotTask | null; kind: 'attention'|'focus'|'available';
    alternatives: SnapshotTask[]; focus: SnapshotTask | undefined; active: SnapshotRun[]; unknown: SnapshotRun[]; questions: SnapshotRun[];
    waiting: SnapshotTask[]; integration: string; open: SnapshotTask[] };
  export function focusKind(focus: Focus): 'Pinned by you' | 'Inferred from window metadata' | 'Selected by you';
  export function observationStatus(snapshot: Snapshot | null): string;
  export function nowState(snapshot: Snapshot | null, connected: boolean, budget?: number | null): NowState;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// web/src/domain/nowState.test.ts
// Port of tests/now_state.test.cjs (22 cases). Pure view-state tests, not service validation.
import { describe, expect, it } from 'vitest';
import type { Focus, Snapshot } from '../api/schemas';
import { makeNoteSummary, makeRun, makeSnapshot, makeTask } from '../test/fixtures';
import { focusKind, nowState, observationStatus } from './nowState';

const focus = (task_id: string, pinned: boolean, source = 'manual'): NonNullable<Focus> =>
  ({ task_id, pinned, source, updated_at: '2026-10-08T11:00:00+00:00' });
const context = (stale: boolean): NonNullable<Snapshot['context']> => ({
  device: 'desktop', app: 'fixture', title: 'Fixture window', workspace: '1', monitor: 'eDP-1',
  updated_at: '2026-10-08T11:59:00+00:00', source: 'window metadata', suggested_task_id: null, stale,
});
const settings = (observation_enabled: boolean) => ({ ...makeSnapshot().settings, observation_enabled });

describe('nowState (tests/now_state.test.cjs)', () => {
  it('empty connected workspace is new, not complete', () => {
    expect(nowState(makeSnapshot(), true).mode).toBe('new');
  });

  it('notes without tasks are not a new workspace or implicit work', () => {
    expect(nowState(makeSnapshot({ notes: [makeNoteSummary('learning')] }), true).mode).toBe('notes-only');
  });

  it('one available suggestion keeps server ranking and hidden alternatives', () => {
    const a = makeTask('first'), b = makeTask('second');
    const n = nowState(makeSnapshot({ tasks: [a, b], available: [a, b] }), true);
    expect(n.mode).toBe('available');
    expect(n.primary?.id).toBe('first');
    expect(n.alternatives).toHaveLength(1);
  });

  it('questions and results outrank ordinary available work', () => {
    const a = makeTask('question'), b = makeTask('available');
    const n = nowState(makeSnapshot({ tasks: [a, b], attention: [a], available: [b] }), true);
    expect(n.mode).toBe('attention');
    expect(n.primary?.id).toBe('question');
  });

  it('unresolved dependencies are waiting, not completed', () => {
    const t = makeTask('blocked', { blocked_by: ['dependency'] });
    expect(nowState(makeSnapshot({ tasks: [t] }), true).mode).toBe('waiting');
  });

  it('a reported agent run is waiting, not a human recommendation', () => {
    const run = makeRun({ status: 'working', effective_status: 'working', stale: false });
    const t = makeTask('agent', { runs: [run] });
    const n = nowState(makeSnapshot({ tasks: [t], runs: [run] }), true);
    expect(n.mode).toBe('waiting');
    expect(n.primary).toBeNull();
  });

  it('all tasks explicitly done means complete', () => {
    expect(nowState(makeSnapshot({ tasks: [makeTask('done', { status: 'done' })] }), true).mode).toBe('complete');
  });

  it('parked work is not complete', () => {
    expect(nowState(makeSnapshot({ tasks: [makeTask('parked', { status: 'parked' })] }), true).mode).toBe('idle');
  });

  it('future-start work is not complete or actionable focus', () => {
    const t = makeTask('future', { not_before: '2026-11-08T12:00:00+00:00' });
    expect(nowState(makeSnapshot({ tasks: [t], focus: focus(t.id, false) }), true).primary).toBeNull();
  });

  it('zero running does not mean no integration; needs-input stays reported', () => {
    const r = makeRun({ status: 'needs_input', effective_status: 'needs_input', stale: false });
    expect(nowState(makeSnapshot({ runs: [r] }), true).integration).toMatch(/awaiting input.*recently reported/);
    expect(nowState(makeSnapshot(), true).integration).toMatch(/connection status unknown/);
  });

  it('stale reports do not masquerade as running', () => {
    const r = makeRun({ status: 'working', effective_status: 'unknown', stale: true });
    const t = makeTask('unknown', { runs: [r] });
    const n = nowState(makeSnapshot({ tasks: [t], runs: [r], attention: [t] }), true);
    expect(n.mode).toBe('unknown');
    expect(n.active).toHaveLength(0);
    expect(n.integration).toMatch(/status unknown/);
  });

  it('disconnected cached complete/new snapshots cannot assert current state', () => {
    for (const s of [makeSnapshot(), makeSnapshot({ tasks: [makeTask('done', { status: 'done' })] })]) {
      const n = nowState(s, false);
      expect(n.mode).toBe('disconnected');
      expect(n.primary).toBeNull();
    }
  });

  it('disconnected cached tasks cannot be called currently actionable alternatives', () => {
    const t = makeTask('cached');
    expect(nowState(makeSnapshot({ tasks: [t], available: [t] }), false).alternatives).toHaveLength(0);
  });

  it('manual, inferred and pinned focus have different labels', () => {
    expect(focusKind(focus('t', false, 'manual'))).toBe('Selected by you');
    expect(focusKind(focus('t', false, 'context'))).toBe('Inferred from window metadata');
    expect(focusKind(focus('t', true, 'context'))).toBe('Pinned by you');
  });

  it('deriving suggestions never changes a pinned focus', () => {
    const a = makeTask('pin'), b = makeTask('other');
    const s = makeSnapshot({ tasks: [a, b], available: [b], focus: focus('pin', true) });
    nowState(s, true);
    expect(s.focus).toEqual(focus('pin', true));
  });

  it('a focused task with a stale agent cannot be recommended', () => {
    const t = makeTask('focus', { runs: [makeRun({ status: 'working', effective_status: 'unknown', stale: true })] });
    expect(nowState(makeSnapshot({ tasks: [t], focus: focus(t.id, false) }), true).primary).toBeNull();
  });

  it('time filter never supplies an estimate for a focused task', () => {
    const t = makeTask('focus');
    expect(nowState(makeSnapshot({ tasks: [t], focus: focus(t.id, false) }), true, 15).primary).toBeNull();
  });

  it('observation enabled without fresh metadata is not active capture', () => {
    expect(observationStatus(makeSnapshot())).toBe('Observation paused');
    expect(observationStatus(makeSnapshot({ settings: settings(true) }))).toMatch(/no recent observer report/);
    expect(observationStatus(makeSnapshot({ settings: settings(true), context: context(true) }))).toMatch(/no recent observer report/);
  });

  // Phase A source characterization, not a physical UI acceptance result.
  it('actionable pin is continued when no competing available item exists', () => {
    const pin = makeTask('pin');
    const s = makeSnapshot({ tasks: [pin], focus: focus(pin.id, true) });
    const n = nowState(s, true);
    expect(n.primary?.id).toBe('pin');
    expect(n.kind).toBe('focus');
    expect(s.focus?.pinned).toBe(true);
  });

  it('another available recommendation does not replace an actionable pin', () => {
    const pin = makeTask('pin'), other = makeTask('other', { next_action: 'Inspect synthetic example' });
    const s = makeSnapshot({ tasks: [pin, other], available: [other], focus: focus(pin.id, true) });
    const n = nowState(s, true);
    expect(n.primary?.id).toBe('other');
    expect(s.focus?.task_id).toBe('pin');
    expect(s.focus?.pinned).toBe(true);
  });

  it('dependency or agent waiting pin stays pinned while other work is recommended', () => {
    const changes = [
      { blocked_by: ['other'] },
      { runs: [makeRun({ status: 'working', effective_status: 'working', stale: false })] },
    ];
    for (const change of changes) {
      const pin = makeTask('pin', change), other = makeTask('other');
      const s = makeSnapshot({ tasks: [pin, other], available: [other], focus: focus(pin.id, true) });
      const n = nowState(s, true);
      expect(n.primary?.id).toBe('other');
      expect(n.waiting[0].id).toBe('pin');
      expect(s.focus?.task_id).toBe('pin');
    }
  });

  it('attention on another task outranks a pin without changing it; no focus stays unset', () => {
    const pin = makeTask('pin');
    const review = makeTask('review', { status: 'review', attention_reason: 'Ready for human review' });
    const s = makeSnapshot({ tasks: [pin, review], attention: [review], focus: focus(pin.id, true) });
    expect(nowState(s, true).primary?.id).toBe('review');
    expect(s.focus?.task_id).toBe('pin');
    const none = makeSnapshot({ tasks: [pin], available: [pin] });
    expect(nowState(none, true).primary?.id).toBe('pin');
    expect(none.focus).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/domain/nowState.test.ts`
Expected: FAIL with `Error: Failed to resolve import "./nowState" from "src/domain/nowState.test.ts". Does the file exist?`

- [ ] **Step 3: Write the minimal implementation**

```ts
// web/src/domain/nowState.ts
// Verbatim port of public/app.js:148-183 (NOW_STATE_START..NOW_STATE_END). Strings unchanged.
// Pure presentation of the server snapshot: never mutates it, never invents work.
import type { Focus, Snapshot, SnapshotRun, SnapshotTask } from '../api/schemas';

export type NowMode = 'disconnected' | 'new' | 'notes-only' | 'unknown' | 'attention' | 'complete' | 'available' | 'waiting' | 'filtered' | 'idle';
export type NowState = {
  mode: NowMode; title: string; explanation: string; primary: SnapshotTask | null; kind: 'attention' | 'focus' | 'available';
  alternatives: SnapshotTask[]; focus: SnapshotTask | undefined; active: SnapshotRun[]; unknown: SnapshotRun[]; questions: SnapshotRun[];
  waiting: SnapshotTask[]; integration: string; open: SnapshotTask[];
};

const WAITING_RUN = ['working', 'needs_input', 'unknown'];
const BLOCKING_FOCUS_RUN = ['working', 'needs_input', 'unknown', 'failed'];

export function focusKind(focus: Focus): 'Pinned by you' | 'Inferred from window metadata' | 'Selected by you' {
  return focus?.pinned ? 'Pinned by you' : focus?.source === 'context' ? 'Inferred from window metadata' : 'Selected by you';
}

export function observationStatus(snapshot: Snapshot | null): string {
  if (!snapshot?.settings?.observation_enabled) return 'Observation paused';
  return snapshot.context && !snapshot.context.stale ? 'Recent window metadata report' : 'Allowed · no recent observer report';
}

export function nowState(snapshot: Snapshot | null, connected: boolean, budget: number | null = null): NowState {
  const tasks = snapshot?.tasks ?? [], runs = snapshot?.runs ?? [], notes = snapshot?.notes ?? [];
  const serverTime = snapshot?.server_time ?? '';
  const open = tasks.filter(t => t.status !== 'done');
  const attention = snapshot?.attention ?? [], available = snapshot?.available ?? [];
  const focus = tasks.find(t => t.id === snapshot?.focus?.task_id);
  const active = runs.filter(r => r.effective_status === 'working');
  const unknown = runs.filter(r => r.effective_status === 'unknown' || r.stale);
  const questions = runs.filter(r => r.effective_status === 'needs_input');
  const waiting = open.filter(t => !attention.some(a => a.id === t.id) && (t.blocked_by.length > 0 || t.status === 'waiting' || t.status === 'blocked' || t.runs.some(r => WAITING_RUN.includes(r.effective_status))));
  const integration = !connected ? 'Integration status unavailable · server disconnected'
    : unknown.length ? `Agent status unknown · ${unknown.length} stale report${unknown.length === 1 ? '' : 's'}`
    : active.length || questions.length ? `${active.length} running · ${questions.length} awaiting input · recently reported`
    : 'Integration connection status unknown · no active runs reported';
  const actionableFocus = focus !== undefined && ['todo', 'active', 'review'].includes(focus.status) && focus.blocked_by.length === 0
    && (!focus.not_before || focus.not_before <= serverTime)
    && !focus.runs.some(r => BLOCKING_FOCUS_RUN.includes(r.effective_status))
    && (budget == null || (focus.estimate_minutes != null && focus.estimate_minutes <= budget));
  let primary: SnapshotTask | null = attention[0] ?? available[0] ?? (actionableFocus ? focus : null);
  const kind: NowState['kind'] = attention.some(t => t.id === primary?.id) ? 'attention' : primary?.id === focus?.id ? 'focus' : 'available';
  let mode: NowMode = 'idle';
  let title = 'Nothing actionable right now';
  let explanation = 'Some tracked work is scheduled, parked or not available yet. Plan keeps those items visible.';
  if (!connected) {
    mode = 'disconnected'; title = 'Current status unavailable';
    explanation = 'The server is disconnected. Cached work and integration reports may be out of date. You can still capture locally.';
    primary = null;
  } else if (!tasks.length && !runs.length) {
    mode = notes.length ? 'notes-only' : 'new';
    title = notes.length ? 'No tasks tracked yet' : 'Nothing tracked yet';
    explanation = notes.length
      ? 'Your learning notes stay separate from tasks. Add a task only when you intend to do something.'
      : 'Capture something you are learning, or add a task you intend to do. Notes do not become to-dos automatically.';
  } else if (attention.length) {
    mode = attention.every(t => t.runs.some(r => r.effective_status === 'unknown') && t.status !== 'review'
      && !t.reminders.some(r => r.state === 'due')
      && !t.runs.some(r => r.effective_status === 'needs_input' || r.status === 'review' || r.status === 'failed')) ? 'unknown' : 'attention';
    title = mode === 'unknown' ? 'Agent status needs checking' : 'Your attention is needed';
    explanation = attention[0].attention_reason;
  } else if (tasks.length && tasks.every(t => t.status === 'done') && !active.length && !questions.length && !unknown.length) {
    mode = 'complete'; title = 'All tracked work is complete';
    explanation = 'Every tracked task is marked done. Your learning notes remain available; there is no need to add more work.';
    primary = null;
  } else if (primary) {
    mode = 'available'; title = 'Available work';
    explanation = primary.recommendation_reason || 'Continue your selected focus.';
  } else if (unknown.length) {
    mode = 'unknown'; title = 'Agent status needs checking';
    explanation = 'A previous run has stopped reporting. No current activity or completion can be confirmed.';
  } else if (waiting.length) {
    mode = 'waiting'; title = 'Work is waiting';
    explanation = 'Tracked work is waiting on an agent, unresolved dependencies or an explicit waiting state.';
  } else if (budget != null) {
    mode = 'filtered'; title = 'No work matches this time filter';
    explanation = 'Only saved estimates are used. Tasks without an estimate are excluded; no duration is invented.';
  }
  const alternatives = connected
    ? [...attention, ...available].filter((t, i, all) => t.id !== primary?.id && all.findIndex(x => x.id === t.id) === i)
    : [];
  return { mode, title, explanation, primary, kind, alternatives, focus, active, unknown, questions, waiting, integration, open };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- src/domain/nowState.test.ts`
Expected: PASS (22 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/domain/nowState.ts web/src/domain/nowState.test.ts
git commit -m "feat(web): port the Now state and its 22 characterization cases"
```

### Task 3: `domain/tasks.ts` — priority labels, filtered views, row text, review and timestamp rules

**Files:**
- Modify: `web/src/domain/tasks.ts` (replace the Phase-1 file, which holds only `TASK_EDIT_FIELDS` and `editableFields`; both are kept unchanged; ports `public/app.js:27, 145, 202-203, 258, 343-344, 382`)
- Test: `web/src/domain/tasks.test.ts` (replace the Phase-1 file; its `editableFields` case is kept below)

**Interfaces:**
- Consumes: `Snapshot`, `SnapshotTask`, `SnapshotRun`, `Task`, `TaskEditable`, `TaskStatus` from `../api/schemas`; `dateLabel`, `localDateInput` from `./format`.
- Produces (contract §4.5 names, plus phase-local names marked *new*):
  ```ts
  export const TASK_EDIT_FIELDS: readonly ['title','project','detail','next_action','status','priority','due_at','not_before','planned_on','estimate_minutes','dependencies','session_url'];
  export function editableFields(task: Task): TaskEditable;
  export type PriorityLabel = 'Auto · rules' | 'Auto · AI' | 'Set by you' | 'Auto';            // new (named return type)
  export function priorityLabel(source: string): PriorityLabel;
  export type TaskFilter = 'open' | 'needs-you' | 'running' | 'available' | 'parked' | 'done' | 'all';
  export const TASK_FILTERS: readonly { id: TaskFilter; label: string }[];
  export function filterTasks(snapshot: Snapshot, filter: TaskFilter): SnapshotTask[];
  export function waitingReason(task: SnapshotTask, tasks: SnapshotTask[]): string;
  export function isSessionUrl(url: string | null | undefined): boolean;
  export const STATUS_LABEL: Record<TaskStatus, string>;                                        // new
  export const RUN_LABEL: Record<SnapshotRun['effective_status'], string>;                       // new
  export function taskMeta(task: SnapshotTask): string;                                          // new: project · state · reason · due · planned · estimate
  export function needsReview(task: SnapshotTask): boolean;                                      // new
  export function reviewLink(task: SnapshotTask): string | null;                                 // new
  export function keepTimestamps(values: TaskEditable, original: Task): Pick<TaskEditable, 'due_at' | 'not_before'>;   // new, app.js:344
  ```
  `rowSubtitle` from contract §4.5 is not created: the handbook's compact row needs project and state, which `taskMeta` provides (see Spec coverage note).

- [ ] **Step 1: Write the failing test**

```ts
// web/src/domain/tasks.test.ts
import { describe, expect, it } from 'vitest';
import { makeRun, makeSnapshot, makeTask } from '../test/fixtures';
import { dateLabel } from './format';
import {
  RUN_LABEL, STATUS_LABEL, TASK_EDIT_FIELDS, TASK_FILTERS, editableFields, filterTasks, isSessionUrl, keepTimestamps,
  needsReview, priorityLabel, reviewLink, taskMeta, waitingReason,
} from './tasks';

describe('priorityLabel (spec §4.7, decision 19A)', () => {
  it('priorityLabel maps automatic/rules, ai, you and unknown sources', () => {
    const cases: [string, string][] = [
      ['automatic', 'Auto · rules'], ['rules', 'Auto · rules'], ['ai', 'Auto · AI'], ['you', 'Set by you'], ['model-v2', 'Auto'], ['', 'Auto'],
    ];
    for (const [source, label] of cases) expect(priorityLabel(source), source).toBe(label);
  });
});

describe('editableFields', () => {
  it('copies exactly the twelve editable fields (app.js:343,382)', () => {
    const task = makeTask('t', { dependencies: ['a'], session_url: 'https://example.test/s' });
    const fields = editableFields(task);
    expect(Object.keys(fields).sort()).toEqual([...TASK_EDIT_FIELDS].sort());
    expect(fields.dependencies).toEqual(['a']);
    expect(fields.dependencies).not.toBe(task.dependencies);
  });
});

describe('filterTasks', () => {
  const high = makeTask('high', { effective_priority: 'high' });
  const low = makeTask('low', { effective_priority: 'low' });
  const parked = makeTask('parked', { status: 'parked' });
  const done = makeTask('done', { status: 'done' });
  const running = makeTask('running', { runs: [makeRun({ status: 'working', effective_status: 'working', stale: false })] });
  const asking = makeTask('asking', { runs: [makeRun({ status: 'needs_input', effective_status: 'needs_input', stale: false })] });
  const stale = makeTask('stale', { runs: [makeRun({ status: 'working', effective_status: 'unknown', stale: true })] });
  const snapshot = makeSnapshot({ tasks: [low, parked, done, high, running, asking, stale], attention: [asking], available: [low, high] });
  const ids = (filter: Parameters<typeof filterTasks>[1]) => filterTasks(snapshot, filter).map(t => t.id);

  it('lists the views with their visible labels', () => {
    expect(TASK_FILTERS.map(f => f.label)).toEqual(['Open', 'Needs you', 'Running', 'Available now', 'Parked', 'Completed', 'All']);
  });
  it('open excludes parked and done, sorted high → low (app.js:258)', () => {
    // Stable sort: mediums keep snapshot order.
    expect(ids('open')).toEqual(['high', 'running', 'asking', 'stale', 'low']);
  });
  it('needs-you uses the server attention list', () => expect(ids('needs-you')).toEqual(['asking']));
  it('running counts working and needs-input runs, never stale ones', () => expect(ids('running')).toEqual(['running', 'asking']));
  it('available uses the server available list', () => expect(ids('available')).toEqual(['high', 'low']));
  it('parked and done are distinct views', () => {
    expect(ids('parked')).toEqual(['parked']);
    expect(ids('done')).toEqual(['done']);
  });
  it('all keeps every task', () => expect(ids('all')).toHaveLength(7));
});

describe('row text', () => {
  it('taskMeta shows project and state, then only known reason, dates and estimate', () => {
    expect(taskMeta(makeTask('a', { project: 'Research', status: 'todo' }))).toBe('Research · To do');
    const due = '2026-10-09T10:00:00+00:00';
    expect(taskMeta(makeTask('b', {
      project: 'Work', status: 'review', attention_reason: 'A result is ready for your review.',
      due_at: due, planned_on: '2026-10-09', estimate_minutes: 25,
    }))).toBe(`Work · Review · A result is ready for your review. · Due ${dateLabel(due)} · Planned 2026-10-09 · 25 min · your estimate`);
  });
  it('STATUS_LABEL keeps parked distinct from done', () => {
    expect(STATUS_LABEL.parked).toBe('Parked');
    expect(STATUS_LABEL.done).toBe('Completed');
  });
  it('RUN_LABEL reads a stale run as unknown', () => expect(RUN_LABEL.unknown).toBe('Status unknown'));
});

describe('waitingReason (app.js:202-203)', () => {
  const dep = makeTask('dep', { title: 'Trace ownership' });
  it.each([
    [makeTask('t', { blocked_by: ['dep'] }), 'Waiting on: Trace ownership'],
    [makeTask('t', { runs: [makeRun({ status: 'working', effective_status: 'unknown', stale: true })] }), 'Agent status unknown'],
    [makeTask('t', { runs: [makeRun({ status: 'needs_input', effective_status: 'needs_input', stale: false })] }), 'Agent is awaiting your input'],
    [makeTask('t', { runs: [makeRun({ status: 'working', effective_status: 'working', stale: false })] }), 'Waiting on an agent report'],
    [makeTask('t', { status: 'blocked' }), 'Marked blocked'],
  ])('%#', (task, reason) => expect(waitingReason(task, [dep, task])).toBe(reason));
});

describe('links and review', () => {
  it('isSessionUrl accepts only http(s) (app.js:27)', () => {
    expect(isSessionUrl('https://example.test/s')).toBe(true);
    expect(isSessionUrl('http://127.0.0.1:3000')).toBe(true);
    expect(isSessionUrl('javascript:alert(1)')).toBe(false);
    expect(isSessionUrl('data:text/html,x')).toBe(false);
    expect(isSessionUrl('')).toBe(false);
    expect(isSessionUrl(null)).toBe(false);
  });
  it('a review task or a run in review needs review', () => {
    expect(needsReview(makeTask('a', { status: 'review' }))).toBe(true);
    expect(needsReview(makeTask('b', { runs: [makeRun({ status: 'review', effective_status: 'review', stale: false })] }))).toBe(true);
    expect(needsReview(makeTask('c'))).toBe(false);
  });
  it('reviewLink prefers the newest review run link, then the task link, never a non-http link', () => {
    const run = makeRun({ status: 'review', effective_status: 'review', stale: false, session_url: 'https://agent.test/result' });
    expect(reviewLink(makeTask('a', { runs: [run], session_url: 'https://example.test/task' }))).toBe('https://agent.test/result');
    expect(reviewLink(makeTask('b', { status: 'review', session_url: 'https://example.test/task' }))).toBe('https://example.test/task');
    expect(reviewLink(makeTask('c', { status: 'review', session_url: 'javascript:alert(1)' }))).toBeNull();
  });
});

describe('keepTimestamps (app.js:344)', () => {
  const original = makeTask('t', { due_at: '2026-11-20T17:22:33+00:00', not_before: '2026-10-01T11:23:45+00:00' });
  it('keeps stored precision for untouched or equivalent datetimes', () => {
    const values = { ...editableFields(original), due_at: '2026-11-20T17:22:00.000Z' };
    expect(keepTimestamps(values, original)).toEqual({ due_at: original.due_at, not_before: original.not_before });
  });
  it('uses the edited value when the minute changed', () => {
    const values = { ...editableFields(original), due_at: '2026-11-21T09:00:00.000Z', not_before: null };
    expect(keepTimestamps(values, original)).toEqual({ due_at: '2026-11-21T09:00:00.000Z', not_before: null });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/domain/tasks.test.ts`
Expected: FAIL. The Phase-1 `./tasks` exports only `TASK_EDIT_FIELDS` and `editableFields`, so the `editableFields` case passes and the others fail with `TypeError: … is not a function` (for example `priorityLabel`) or `TypeError: Cannot read properties of undefined (reading 'map')` (`TASK_FILTERS`).

- [ ] **Step 3: Write the minimal implementation**

```ts
// web/src/domain/tasks.ts
import type { Snapshot, SnapshotRun, SnapshotTask, Task, TaskEditable, TaskStatus } from '../api/schemas';
import { dateLabel, localDateInput } from './format';

export const TASK_EDIT_FIELDS = ['title', 'project', 'detail', 'next_action', 'status', 'priority', 'due_at', 'not_before', 'planned_on', 'estimate_minutes', 'dependencies', 'session_url'] as const;

export function editableFields(task: Task): TaskEditable {
  return {
    title: task.title, project: task.project, detail: task.detail, next_action: task.next_action,
    status: task.status, priority: task.priority, due_at: task.due_at, not_before: task.not_before,
    planned_on: task.planned_on, estimate_minutes: task.estimate_minutes,
    dependencies: [...task.dependencies], session_url: task.session_url,
  };
}

export type PriorityLabel = 'Auto · rules' | 'Auto · AI' | 'Set by you' | 'Auto';

export function priorityLabel(source: string): PriorityLabel {
  if (source === 'automatic' || source === 'rules') return 'Auto · rules';
  if (source === 'ai') return 'Auto · AI';
  if (source === 'you') return 'Set by you';
  return 'Auto'; // unknown future sources need no frontend change (spec §4.7)
}

export type TaskFilter = 'open' | 'needs-you' | 'running' | 'available' | 'parked' | 'done' | 'all';
export const TASK_FILTERS: readonly { id: TaskFilter; label: string }[] = [
  { id: 'open', label: 'Open' }, { id: 'needs-you', label: 'Needs you' }, { id: 'running', label: 'Running' },
  { id: 'available', label: 'Available now' }, { id: 'parked', label: 'Parked' }, { id: 'done', label: 'Completed' },
  { id: 'all', label: 'All' },
];

const RANK = { high: 0, medium: 1, low: 2 } as const;

export function filterTasks(snapshot: Snapshot, filter: TaskFilter): SnapshotTask[] {
  const attention = new Set(snapshot.attention.map(t => t.id));
  const available = new Set(snapshot.available.map(t => t.id));
  const keep = (t: SnapshotTask): boolean => {
    switch (filter) {
      case 'open': return t.status !== 'done' && t.status !== 'parked';
      case 'needs-you': return attention.has(t.id);
      case 'running': return t.runs.some(r => r.effective_status === 'working' || r.effective_status === 'needs_input');
      case 'available': return available.has(t.id);
      case 'parked': return t.status === 'parked';
      case 'done': return t.status === 'done';
      case 'all': return true;
    }
  };
  return snapshot.tasks.filter(keep).sort((a, b) => RANK[a.effective_priority] - RANK[b.effective_priority]);
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do', active: 'Active', waiting: 'Waiting', blocked: 'Blocked', review: 'Review', parked: 'Parked', done: 'Completed',
};

export const RUN_LABEL: Record<SnapshotRun['effective_status'], string> = {
  working: 'Reported running', needs_input: 'Needs your input', review: 'Result ready for review',
  failed: 'Reported a failure', cancelled: 'Tracking ended', unknown: 'Status unknown',
};

export function taskMeta(task: SnapshotTask): string {
  return [
    task.project, STATUS_LABEL[task.status], task.attention_reason,
    task.due_at ? `Due ${dateLabel(task.due_at)}` : '',
    task.planned_on ? `Planned ${task.planned_on}` : '',
    task.estimate_minutes != null ? `${task.estimate_minutes} min · your estimate` : '',
  ].filter(Boolean).join(' · ');
}

export function waitingReason(task: SnapshotTask, tasks: SnapshotTask[]): string {
  const dependencies = task.blocked_by.map(id => tasks.find(x => x.id === id)?.title).filter((title): title is string => !!title);
  if (dependencies.length) return 'Waiting on: ' + dependencies.join(', ');
  if (task.runs.some(r => r.effective_status === 'unknown')) return 'Agent status unknown';
  if (task.runs.some(r => r.effective_status === 'needs_input')) return 'Agent is awaiting your input';
  if (task.runs.some(r => r.effective_status === 'working')) return 'Waiting on an agent report';
  return 'Marked ' + task.status;
}

export function isSessionUrl(url: string | null | undefined): boolean {
  return /^https?:\/\//.test(url ?? '');
}

export function needsReview(task: SnapshotTask): boolean {
  return task.status === 'review' || task.runs.some(r => r.status === 'review');
}

// Runs arrive newest first (store.py: ORDER BY updated_at DESC).
export function reviewLink(task: SnapshotTask): string | null {
  const run = task.runs.find(r => r.status === 'review' && isSessionUrl(r.session_url));
  if (run) return run.session_url;
  return isSessionUrl(task.session_url) ? task.session_url : null;
}

export function keepTimestamps(values: TaskEditable, original: Task): Pick<TaskEditable, 'due_at' | 'not_before'> {
  const keep = (edited: string | null, stored: string | null) => (localDateInput(edited) === localDateInput(stored) ? stored : edited);
  return { due_at: keep(values.due_at, original.due_at), not_before: keep(values.not_before, original.not_before) };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- src/domain/tasks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/domain/tasks.ts web/src/domain/tasks.test.ts
git commit -m "feat(web): add task labels, filtered views and review rules"
```

### Task 4: `ui/Icon.tsx` and `ui/Toast.tsx`

**Files:**
- Create: `web/src/ui/Icon.tsx` (paths ported from `experiments/ui-ab/frontend/src/icons.tsx:4-25`; demo-only `now` and `chart` dropped; `pause`, `stop`, `eraser`, `undo`, `text`, `sidebar` added for contract §6.2)
- Modify: `web/src/ui/Toast.tsx` (overwrite the Phase-1 stand-in; one visible toast, replaced by the next, hidden after 5500 ms, `public/app.js:13-16`; `toast(message, options)` keeps its signature, so `local/drafts.ts` and `local/outbox.ts` are unchanged)
- Test: `web/src/ui/Toast.test.tsx` (overwrite the Phase-1 test)
- Note: from this task until Task 14 mounts `ToastHost`, the Phase-1 page shows no toasts, so `web/e2e/outbox.spec.ts` "Reconnect receives matching real server acknowledgment" fails if run in between. Task 14 Step 7 reruns it.

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export type IconName = 'home'|'pen'|'notes'|'task-check'|'arrow'|'waveform'|'plus'|'plan'|'search'|'chevron'|'close'|'clock'|'settings'|'play'|'spark'|'image'|'mic'|'folder'|'check'|'pause'|'stop'|'eraser'|'undo'|'text'|'sidebar';
  export function Icon(props: { name: IconName; size?: number }): JSX.Element;
  export type ToastOptions = { action?: { label: string; onClick: () => void }; tone?: 'status' | 'error' };
  export function toast(message: string, options?: ToastOptions): void;
  export function ToastHost(): JSX.Element;
  export const TOAST_MS = 5500;                    // new
  export function dismissToast(): void;            // new
  export function messageOf(error: unknown): string;   // new: Error → message, else String(error)
  export function toastError(error: unknown): void;    // new: toast(messageOf(error), { tone: 'error' })
  ```

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/ui/Toast.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Icon } from './Icon';
import { TOAST_MS, ToastHost, dismissToast, messageOf, toast, toastError } from './Toast';

afterEach(() => {
  act(() => dismissToast());
  cleanup();
  vi.useRealTimers();
});

describe('Icon', () => {
  it('renders a decorative 20 px svg by default', () => {
    const { container } = render(<Icon name="sidebar" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('width')).toBe('20');
    expect(svg.childElementCount).toBeGreaterThan(0);
  });
});

describe('toast', () => {
  it('announces status toasts politely', () => {
    render(<ToastHost />);
    act(() => toast('Task added.'));
    expect(screen.getByRole('status').textContent).toContain('Task added.');
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
    expect(screen.getByRole('alert').textContent).toBe('');
  });

  it('puts error toasts in an alert region', () => {
    render(<ToastHost />);
    act(() => toastError(new Error('Boom')));
    expect(screen.getByRole('alert').textContent).toContain('Boom');
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('runs the action and clears the toast', () => {
    const onClick = vi.fn();
    render(<ToastHost />);
    act(() => toast('Task added.', { action: { label: 'Edit', onClick } }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.queryByText('Task added.')).toBeNull();
  });

  it('shows one toast at a time; the next replaces it', () => {
    render(<ToastHost />);
    act(() => toast('First'));
    act(() => toast('Second'));
    expect(screen.queryByText('First')).toBeNull();
    expect(screen.getByText('Second')).toBeTruthy();
  });

  it('hides after 5500 ms (app.js:15)', () => {
    vi.useFakeTimers();
    render(<ToastHost />);
    act(() => toast('Saved'));
    act(() => vi.advanceTimersByTime(TOAST_MS - 1));
    expect(screen.queryByText('Saved')).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('Saved')).toBeNull();
  });

  it('can be dismissed explicitly', () => {
    render(<ToastHost />);
    act(() => toast('Saved'));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Saved')).toBeNull();
  });

  it('messageOf reads Error messages and stringifies the rest', () => {
    expect(messageOf(new Error('x'))).toBe('x');
    expect(messageOf('y')).toBe('y');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/ui/Toast.test.tsx`
Expected: FAIL with `Error: Failed to resolve import "./Icon" from "src/ui/Toast.test.tsx". Does the file exist?`

- [ ] **Step 3: Write the minimal implementation**

```tsx
// web/src/ui/Icon.tsx
import type { JSX, ReactNode } from 'react';

export type IconName = 'home' | 'pen' | 'notes' | 'task-check' | 'arrow' | 'waveform' | 'plus' | 'plan' | 'search' | 'chevron'
  | 'close' | 'clock' | 'settings' | 'play' | 'spark' | 'image' | 'mic' | 'folder' | 'check' | 'pause' | 'stop' | 'eraser'
  | 'undo' | 'text' | 'sidebar';

const PATHS: Record<IconName, ReactNode> = {
  home: <path d="m2.5 10 9.5-8 9.5 8M5 9v12h5v-7h4v7h5V9" />,
  pen: <path d="m4 16 12-12 4 4L8 20l-5 1zM14 6l4 4" />,
  notes: <path d="M5 2.5h10l4 4v15H5zM15 2.5v5h4M8 11h8M8 15h8M8 18h6" />,
  'task-check': <><circle cx="12" cy="12" r="9.5" /><path d="m7 12 3 3 7-7" /></>,
  arrow: <path d="M3 12h17m-6-6 6 6-6 6" />,
  waveform: <path d="M3 10v4M7 6v12M12 3v18M17 7v10M21 10v4" />,
  plus: <path d="M12 5v14M5 12h14" />,
  plan: <path d="M5 5h14M5 12h12M5 19h14" />,
  search: <><circle cx="10.5" cy="10.5" r="7" /><path d="m16 16 5 5" /></>,
  chevron: <path d="m9 5 6 7-6 7" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 3" /></>,
  settings: <><path d="m9 3 .6-1h4.8l.8 3 2.4 1.4 3-.6 2.4 4.2-2.2 2 .1 2.8 2 2.2-2.4 4.1-3-.7-2.4 1.4-.8 2.7H9.5l-.8-2.7-2.4-1.4-3 .7L1 17l2-2.2V12L1 10l2.4-4.2 3 .6L9 5z" transform="translate(1 0) scale(.9)" /><circle cx="12" cy="12" r="3" /></>,
  play: <path d="m7 4 13 8-13 8z" fill="currentColor" strokeWidth="0" />,
  spark: <path d="M12 1c1 8 3 10 11 11-8 1-10 3-11 11C11 15 9 13 1 12c8-1 10-3 11-11Z" fill="currentColor" strokeWidth="0" />,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 6-6 4 4 3-3 5 5" /></>,
  mic: <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></>,
  folder: <path d="M3 5h7l2 3h9v12H3z" />,
  check: <path d="m5 12 4 4L19 6" />,
  pause: <path d="M8 5v14M16 5v14" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" />,
  eraser: <path d="M16 3 21 8 10 19H5l-2-2L14 6M9 19h12" />,
  undo: <path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-3" />,
  text: <path d="M5 5h14M12 5v14M9 19h6" />,
  sidebar: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
```

```tsx
// web/src/ui/Toast.tsx
import { useEffect, useRef, useSyncExternalStore, type JSX } from 'react';
import { Icon } from './Icon';

export type ToastOptions = { action?: { label: string; onClick: () => void }; tone?: 'status' | 'error' };
type Current = { id: number; message: string; options: ToastOptions };

export const TOAST_MS = 5500; // public/app.js:15

let current: Current | null = null;
let seq = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export function toast(message: string, options: ToastOptions = {}): void {
  clearTimeout(timer);
  current = { id: ++seq, message, options };
  emit();
  timer = setTimeout(dismissToast, TOAST_MS);
}

export function dismissToast(): void {
  clearTimeout(timer);
  current = null;
  emit();
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function toastError(error: unknown): void {
  toast(messageOf(error), { tone: 'error' });
}

export function ToastHost(): JSX.Element {
  const active = useSyncExternalStore(subscribe, () => current);
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = layer.current;
    if (!el || typeof el.showPopover !== 'function') return; // engines without popover keep a fixed layer
    // Re-showing puts the toast above any modal dialog opened since (top-layer order).
    if (el.matches(':popover-open')) el.hidePopover();
    el.showPopover();
  }, [active]);
  const action = active?.options.action;
  const body = active && (
    <div className="toast" key={active.id}>
      <span>{active.message}</span>
      {action && <button type="button" className="text-button" onClick={() => { dismissToast(); action.onClick(); }}>{action.label}</button>}
      <button type="button" className="icon-button" aria-label="Dismiss" onClick={dismissToast}><Icon name="close" size={16} /></button>
    </div>
  );
  const isError = active?.options.tone === 'error';
  return (
    <div ref={layer} popover="manual" className="toast-layer">
      <div role="status" aria-live="polite">{!isError && body}</div>
      <div role="alert">{isError && body}</div>
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- src/ui/Toast.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/ui/Icon.tsx web/src/ui/Toast.tsx web/src/ui/Toast.test.tsx
git commit -m "feat(web): add icon set and accessible toast"
```

### Task 5: `ui/Dialog.tsx` — native modal dialog with focus restore

**Files:**
- Create: `web/src/ui/Dialog.tsx`
- Create: `web/src/ui/testing.ts` (test-only jsdom `<dialog>` polyfill; never imported by app code)
- Test: `web/src/ui/Dialog.test.tsx`

**Interfaces:**
- Consumes: `Icon` (Task 4).
- Produces:
  ```ts
  export function Dialog(props: { title: string; onRequestClose: () => void; children: ReactNode; closeLabel?: string /* default 'Close dialog' (app.js:292) */; className?: string }): JSX.Element;
  // Convention (new): the first descendant with a `data-autofocus` attribute receives focus when the dialog opens.
  export function polyfillDialog(): void;   // ui/testing.ts, tests only
  ```

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/ui/Dialog.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';
import { polyfillDialog } from './testing';

beforeAll(polyfillDialog);
afterEach(cleanup);

function renderDialog(onRequestClose = vi.fn(), closeLabel?: string) {
  render(<Dialog title="Edit task" onRequestClose={onRequestClose} closeLabel={closeLabel}><input data-autofocus="" aria-label="Title" /><p>Body</p></Dialog>);
  return { onRequestClose, dialog: screen.getByRole('dialog', { name: 'Edit task' }) as HTMLDialogElement };
}

describe('Dialog', () => {
  it('opens modally, is labelled by its title and marks a quiet surface', () => {
    const { dialog } = renderDialog();
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.hasAttribute('data-quiet')).toBe(true);
  });

  it('focuses the data-autofocus control on open', () => {
    renderDialog();
    expect(document.activeElement).toBe(screen.getByLabelText('Title'));
  });

  it('turns Escape (cancel) into a close request and keeps the dialog open', () => {
    const { dialog, onRequestClose } = renderDialog();
    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(onRequestClose).toHaveBeenCalledOnce();
    expect(dialog.hasAttribute('open')).toBe(true);
  });

  it('requests close from the close button with the default label', () => {
    const { onRequestClose } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onRequestClose).toHaveBeenCalledOnce();
  });

  it('accepts a custom close label', () => {
    renderDialog(vi.fn(), 'Close Add task');
    expect(screen.getByRole('button', { name: 'Close Add task' })).toBeTruthy();
  });

  it('requests close on a backdrop click outside the box, not on clicks inside', () => {
    const { dialog, onRequestClose } = renderDialog();
    dialog.getBoundingClientRect = () => ({ left: 100, right: 300, top: 100, bottom: 300, width: 200, height: 200, x: 100, y: 100, toJSON: () => ({}) });
    fireEvent.click(screen.getByText('Body'), { clientX: 150, clientY: 150 });
    fireEvent.click(dialog, { clientX: 150, clientY: 150 });
    expect(onRequestClose).not.toHaveBeenCalled();
    fireEvent.click(dialog, { clientX: 20, clientY: 20 });
    expect(onRequestClose).toHaveBeenCalledOnce();
  });

  it('reopens and requests close if the browser closes it natively', () => {
    const { dialog, onRequestClose } = renderDialog();
    dialog.removeAttribute('open');
    dialog.dispatchEvent(new Event('close'));
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(onRequestClose).toHaveBeenCalledOnce();
  });

  it('restores focus to the opener when it unmounts', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return <>
        <button type="button" onClick={() => setOpen(true)}>Open</button>
        {open && <Dialog title="Details" onRequestClose={() => setOpen(false)}><button type="button" data-autofocus="">Inside</button></Dialog>}
      </>;
    }
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Inside' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByText('Inside')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/ui/Dialog.test.tsx`
Expected: FAIL with `Error: Failed to resolve import "./Dialog" from "src/ui/Dialog.test.tsx". Does the file exist?`

- [ ] **Step 3: Write the minimal implementation**

```ts
// web/src/ui/testing.ts
// Test-only: jsdom has no modal <dialog>. Never imported by app code.
export function polyfillDialog(): void {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}
```

```tsx
// web/src/ui/Dialog.tsx
// Native <dialog>.showModal(): top layer, inert background, stacking and Tab containment come from the platform.
import { useId, useLayoutEffect, useRef, type JSX, type MouseEvent, type ReactNode } from 'react';
import { Icon } from './Icon';

export function Dialog({ title, onRequestClose, children, closeLabel = 'Close dialog', className = '' }: {
  title: string; onRequestClose: () => void; children: ReactNode; closeLabel?: string; className?: string;
}): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const request = useRef(onRequestClose);
  request.current = onRequestClose;

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let mounted = true;
    if (!dialog.hasAttribute('open')) dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    const onCancel = (event: Event) => { event.preventDefault(); request.current(); };
    // Chromium may close on a repeated Escape without 'cancel'; React stays the only authority.
    const onClose = () => { if (mounted) { dialog.showModal(); request.current(); } };
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onClose);
    return () => {
      mounted = false;
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
      if (dialog.hasAttribute('open')) dialog.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  function onClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return;
    const box = event.currentTarget.getBoundingClientRect();
    const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
    if (outside) request.current(); // backdrop click (app.js:547)
  }

  return (
    <dialog ref={ref} className={`dialog ${className}`.trim()} aria-labelledby={titleId} data-quiet="" onClick={onClick}>
      <div className="dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" aria-label={closeLabel} onClick={() => request.current()}>
          <Icon name="close" size={19} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- src/ui/Dialog.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/ui/Dialog.tsx web/src/ui/testing.ts web/src/ui/Dialog.test.tsx
git commit -m "feat(web): add native modal dialog with focus restore"
```

### Task 6: `shell/dialogs.ts` and `shell/unlock.ts` — dialog and unlock stores

**Files:**
- Create: `web/src/shell/dialogs.ts` (one dialog at a time, replaced by the next, as `public/app.js:291-294` `modal()`)
- Create: `web/src/shell/unlock.ts` (Unlock is a separate store so it stacks over any open dialog, spec §4.2)
- Test: `web/src/shell/dialogs.test.ts`

**Interfaces:**
- Consumes: `QueryClient` from `@tanstack/react-query`; `runFlush` from `../state/queries`.
- Produces (contract §6.3, plus *new* `cancelUnlock`, `isUnlockOpen`):
  ```ts
  export type DialogRequest =
    | { kind: 'task'; id: string } | { kind: 'task-capture' } | { kind: 'settings'; section?: 'agents' }
    | { kind: 'outbox' } | { kind: 'note-history'; noteId: string } | { kind: 'sketch' };
  export function openDialog(request: DialogRequest): void;
  export function closeDialog(): void;
  export function useDialog(): DialogRequest | null;
  export function isDialogOpen(): boolean;
  export function requestUnlock(): void;
  export function cancelUnlock(): void;           // new: Unlock's own close button/Escape
  export function isUnlockOpen(): boolean;        // new: used by the keyboard guard
  export function useUnlockOpen(): boolean;
  export function completeUnlock(qc: QueryClient): Promise<void>;   // close, refetch ['snapshot'], then runFlush (spec §4.2)
  ```

- [ ] **Step 1: Write the failing test**

```ts
// web/src/shell/dialogs.test.ts
// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const order: string[] = [];
vi.mock('../state/queries', () => ({ runFlush: vi.fn(async () => { order.push('flush'); return { sent: 0, stop: 'done' }; }) }));

import { runFlush } from '../state/queries';
import { closeDialog, isDialogOpen, openDialog, useDialog } from './dialogs';
import { cancelUnlock, completeUnlock, isUnlockOpen, requestUnlock, useUnlockOpen } from './unlock';

afterEach(() => { act(() => { closeDialog(); cancelUnlock(); }); order.length = 0; });

describe('dialog store', () => {
  it('opens, replaces and closes one dialog at a time', () => {
    const { result } = renderHook(() => useDialog());
    expect(result.current).toBeNull();
    act(() => openDialog({ kind: 'task-capture' }));
    expect(result.current).toEqual({ kind: 'task-capture' });
    expect(isDialogOpen()).toBe(true);
    act(() => openDialog({ kind: 'task', id: 't1' }));
    expect(result.current).toEqual({ kind: 'task', id: 't1' });
    act(() => closeDialog());
    expect(result.current).toBeNull();
    expect(isDialogOpen()).toBe(false);
  });
});

describe('unlock store', () => {
  it('stacks over an open dialog without discarding it', () => {
    const dialog = renderHook(() => useDialog());
    const unlock = renderHook(() => useUnlockOpen());
    act(() => openDialog({ kind: 'task-capture' }));
    act(() => requestUnlock());
    expect(unlock.result.current).toBe(true);
    expect(isUnlockOpen()).toBe(true);
    expect(dialog.result.current).toEqual({ kind: 'task-capture' });
    act(() => cancelUnlock());
    expect(unlock.result.current).toBe(false);
    expect(dialog.result.current).toEqual({ kind: 'task-capture' });
  });

  it('completeUnlock closes Unlock, refreshes the snapshot, then flushes the outbox', async () => {
    const qc = new QueryClient();
    vi.spyOn(qc, 'refetchQueries').mockImplementation(async () => { order.push('refetch'); });
    act(() => requestUnlock());
    await act(() => completeUnlock(qc));
    expect(isUnlockOpen()).toBe(false);
    expect(qc.refetchQueries).toHaveBeenCalledWith({ queryKey: ['snapshot'] });
    expect(runFlush).toHaveBeenCalledWith(qc);
    expect(order).toEqual(['refetch', 'flush']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/shell/dialogs.test.ts`
Expected: FAIL with `Error: Failed to resolve import "./dialogs" from "src/shell/dialogs.test.ts". Does the file exist?`

- [ ] **Step 3: Write the minimal implementation**

```ts
// web/src/shell/dialogs.ts
import { useSyncExternalStore } from 'react';

export type DialogRequest =
  | { kind: 'task'; id: string } | { kind: 'task-capture' } | { kind: 'settings'; section?: 'agents' }
  | { kind: 'outbox' } | { kind: 'note-history'; noteId: string } | { kind: 'sketch' };

let current: DialogRequest | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function set(next: DialogRequest | null): void {
  current = next;
  listeners.forEach(listener => listener());
}

export function openDialog(request: DialogRequest): void { set(request); }
export function closeDialog(): void { set(null); }
export function isDialogOpen(): boolean { return current !== null; }
export function useDialog(): DialogRequest | null { return useSyncExternalStore(subscribe, () => current); }
```

```ts
// web/src/shell/unlock.ts
// Unlock stacks above any open dialog and never closes it (spec §4.2).
import type { QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { runFlush } from '../state/queries';

let open = false;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function set(next: boolean): void {
  open = next;
  listeners.forEach(listener => listener());
}

export function requestUnlock(): void { set(true); }
export function cancelUnlock(): void { set(false); }
export function isUnlockOpen(): boolean { return open; }
export function useUnlockOpen(): boolean { return useSyncExternalStore(subscribe, () => open); }

export async function completeUnlock(qc: QueryClient): Promise<void> {
  set(false);
  await qc.refetchQueries({ queryKey: ['snapshot'] });
  await runFlush(qc);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- src/shell/dialogs.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/shell/dialogs.ts web/src/shell/unlock.ts web/src/shell/dialogs.test.ts
git commit -m "feat(web): add dialog and stacked unlock stores"
```

### Task 7: `routes/legacy.ts` — legacy hash rewrite and modal links

**Files:**
- Create: `web/src/routes/legacy.ts` (legacy forms from spec §4.5; runtime modal links ported from `public/app.js:550-557`)
- Test: `web/src/routes/legacy.test.ts`

**Interfaces:**
- Consumes: `DialogRequest` from `../shell/dialogs` (Task 6).
- Produces (contract §6.1, plus *new* `modalRequestForHash`, `installModalLinks`):
  ```ts
  export function rewriteLegacyHash(hash: string): string | null;
  export function installLegacyHashRewrite(navigate: (to: string) => void): () => void;   // 'hashchange' → navigate('/plan') etc.
  export function modalRequestForHash(hash: string): DialogRequest | null;               // new: '#/task/<id>', '#task/<id>', '#/settings', '#settings'
  export function installModalLinks(current: () => { href: string; state: unknown }, open: (request: DialogRequest) => void): () => void;   // new
  ```
  Why `installModalLinks` exists: the Python helper opens `/#task/<id>` and `/#settings` in a running tab. If the router handled that hash, the current screen would unmount and an unsaved note edit or Capture draft view would be lost (`qa/task_link_check.py`, `qa/settings_link_check.py`). The listener runs in the capture phase on `window`, is installed before the router's own `popstate` listener, restores the previous URL and history state, stops the event, and opens the dialog. Cold starts still use the `/task/$id` and `/settings` routes (Task 14).

- [ ] **Step 1: Write the failing test**

```ts
// web/src/routes/legacy.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLegacyHashRewrite, installModalLinks, modalRequestForHash, rewriteLegacyHash } from './legacy';

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); history.replaceState(null, '', '#/overview'); });

describe('rewriteLegacyHash', () => {
  it.each([
    ['#overview', '#/overview'], ['#capture', '#/capture'], ['#notes', '#/notes'], ['#plan', '#/plan'],
    ['#settings', '#/settings'], ['#note/abc', '#/note/abc'], ['#task/t-1', '#/task/t-1'],
  ])('%s → %s', (hash, rewritten) => expect(rewriteLegacyHash(hash)).toBe(rewritten));

  it.each(['', '#', '#/overview', '#/note/abc', '#unknown', '#note/', 'overview'])('leaves %j alone', hash => {
    expect(rewriteLegacyHash(hash)).toBeNull();
  });
});

describe('installLegacyHashRewrite', () => {
  it('rewrites on every hashchange and ignores new forms', () => {
    const navigate = vi.fn();
    cleanups.push(installLegacyHashRewrite(navigate));
    history.replaceState(null, '', '#plan');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(navigate).toHaveBeenCalledWith('/plan');
    history.replaceState(null, '', '#/notes');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('stops listening after uninstall', () => {
    const navigate = vi.fn();
    installLegacyHashRewrite(navigate)();
    history.replaceState(null, '', '#capture');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('modalRequestForHash', () => {
  it.each([
    ['#/task/abc', { kind: 'task', id: 'abc' }], ['#task/abc', { kind: 'task', id: 'abc' }],
    ['#/task/a%20b', { kind: 'task', id: 'a b' }], ['#/task/%E0%A4%A', { kind: 'task', id: '%E0%A4%A' }],
    ['#/settings', { kind: 'settings' }], ['#settings', { kind: 'settings' }],
  ])('%s → %j', (hash, request) => expect(modalRequestForHash(hash)).toEqual(request));

  it.each(['#/plan', '#/task/', '#/note/abc', ''])('%j is not a modal link', hash => expect(modalRequestForHash(hash)).toBeNull());
});

describe('installModalLinks', () => {
  it('opens the dialog, restores the previous URL and state, and hides the event from the router', () => {
    const open = vi.fn(), router = vi.fn();
    cleanups.push(installModalLinks(() => ({ href: '/notes', state: { key: 'k', __TSR_index: 3 } }), open));
    window.addEventListener('popstate', router);
    cleanups.push(() => window.removeEventListener('popstate', router));
    history.pushState(null, '', '#task/abc');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(open).toHaveBeenCalledWith({ kind: 'task', id: 'abc' });
    expect(location.hash).toBe('#/notes');
    expect(history.state).toEqual({ key: 'k', __TSR_index: 3 });
    expect(router).not.toHaveBeenCalled();
  });

  it('lets ordinary navigation reach the router', () => {
    const open = vi.fn(), router = vi.fn();
    cleanups.push(installModalLinks(() => ({ href: '/notes', state: null }), open));
    window.addEventListener('popstate', router);
    cleanups.push(() => window.removeEventListener('popstate', router));
    history.pushState(null, '', '#/plan');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(open).not.toHaveBeenCalled();
    expect(router).toHaveBeenCalledOnce();
    expect(location.hash).toBe('#/plan');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/routes/legacy.test.ts`
Expected: FAIL with `Error: Failed to resolve import "./legacy" from "src/routes/legacy.test.ts". Does the file exist?`

- [ ] **Step 3: Write the minimal implementation**

```ts
// web/src/routes/legacy.ts
import type { DialogRequest } from '../shell/dialogs';

const LEGACY_PAGES = ['overview', 'capture', 'notes', 'plan', 'settings'];

export function rewriteLegacyHash(hash: string): string | null {
  if (!hash.startsWith('#') || hash.startsWith('#/')) return null;
  const route = hash.slice(1);
  if (LEGACY_PAGES.includes(route)) return '#/' + route;
  const match = /^(note|task)\/(.+)$/.exec(route);
  return match ? `#/${match[1]}/${match[2]}` : null;
}

export function installLegacyHashRewrite(navigate: (to: string) => void): () => void {
  const onHashChange = () => {
    const rewritten = rewriteLegacyHash(location.hash);
    if (rewritten) navigate(rewritten.slice(1));
  };
  window.addEventListener('hashchange', onHashChange);
  return () => window.removeEventListener('hashchange', onHashChange);
}

function decode(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

export function modalRequestForHash(hash: string): DialogRequest | null {
  const path = hash.startsWith('#/') ? hash.slice(2) : hash.startsWith('#') ? hash.slice(1) : '';
  if (path === 'settings') return { kind: 'settings' };
  const match = /^task\/(.+)$/.exec(path);
  return match ? { kind: 'task', id: decode(match[1]) } : null;
}

export function installModalLinks(current: () => { href: string; state: unknown }, open: (request: DialogRequest) => void): () => void {
  // Capture phase on window, installed before the router: the screen underneath never unmounts.
  const onPopState = (event: PopStateEvent) => {
    const request = modalRequestForHash(location.hash);
    if (!request) return;
    event.stopImmediatePropagation();
    const previous = current();
    history.replaceState(previous.state, '', '#' + previous.href);
    open(request);
  };
  window.addEventListener('popstate', onPopState, true);
  return () => window.removeEventListener('popstate', onPopState, true);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- src/routes/legacy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/routes/legacy.ts web/src/routes/legacy.test.ts
git commit -m "feat(web): rewrite legacy hashes and open modal links in place"
```

### Task 8: `routes/guards.ts` — navigation guard registry and router blocker

**Files:**
- Create: `web/src/routes/guards.ts` (port of `public/app.js:269, 485, 555, 560`)
- Test: `web/src/routes/guards.test.tsx`

**Interfaces:**
- Consumes: `toast` (Task 4); `useBlocker` from `@tanstack/react-router`.
- Produces (contract §6.1, plus *new* `shouldWarnBeforeUnload`):
  ```ts
  export type GuardId = 'recording' | 'capture-saving' | 'note-edit';
  export type GuardVerdict = { kind: 'block'; toast: string } | { kind: 'confirm'; message: string } | null;
  export type NavigationGuard = { id: GuardId; check(toPath: string): GuardVerdict; beforeUnload: boolean };
  export function registerGuard(guard: NavigationGuard): () => void;
  export function useNavigationGuard(guard: NavigationGuard | null): void;   // callers pass a memoised guard
  export function isGuardActive(id: GuardId): boolean;
  export function allowNavigation(toPath: string): boolean;
  export function shouldWarnBeforeUnload(): boolean;                        // new
  export function RouteGuards(): null;
  ```
  Phase 2b registers the three guards (contract §6.1 verdicts). This task only builds and tests the mechanism.

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/routes/guards.test.tsx
// @vitest-environment jsdom
import { Outlet, RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ui/Toast', () => ({ toast: vi.fn() }));
import { toast } from '../ui/Toast';
import { RouteGuards, allowNavigation, isGuardActive, registerGuard, shouldWarnBeforeUnload, useNavigationGuard, type NavigationGuard } from './guards';

const recording: NavigationGuard = {
  id: 'recording', beforeUnload: true,
  check: to => (to !== '/capture' ? { kind: 'block', toast: 'Stop recording before leaving Capture.' } : null),
};
const noteEdit: NavigationGuard = {
  id: 'note-edit', beforeUnload: true,
  check: () => ({ kind: 'confirm', message: 'Leave without saving this note edit? The last saved revision remains safe.' }),
};
const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); cleanup(); vi.restoreAllMocks(); vi.mocked(toast).mockClear(); });

describe('guard registry', () => {
  it('allows everything with no guards', () => {
    expect(allowNavigation('/notes')).toBe(true);
    expect(shouldWarnBeforeUnload()).toBe(false);
  });

  it('blocks with the guard toast', () => {
    cleanups.push(registerGuard(recording));
    expect(isGuardActive('recording')).toBe(true);
    expect(allowNavigation('/capture')).toBe(true);
    expect(allowNavigation('/notes')).toBe(false);
    expect(toast).toHaveBeenCalledWith('Stop recording before leaving Capture.');
    expect(shouldWarnBeforeUnload()).toBe(true);
  });

  it('asks for confirmation and respects the answer', () => {
    cleanups.push(registerGuard(noteEdit));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    expect(allowNavigation('/plan')).toBe(false);
    expect(allowNavigation('/plan')).toBe(true);
    expect(confirm).toHaveBeenCalledWith('Leave without saving this note edit? The last saved revision remains safe.');
  });

  it('an old unregister never removes a newer guard with the same id', () => {
    const first = registerGuard(recording);
    const second = registerGuard({ ...recording });
    first();
    expect(isGuardActive('recording')).toBe(true);
    second();
    expect(isGuardActive('recording')).toBe(false);
  });

  it('useNavigationGuard registers only while mounted and non-null', () => {
    const hook = renderHook(({ guard }) => useNavigationGuard(guard), { initialProps: { guard: null as NavigationGuard | null } });
    expect(isGuardActive('recording')).toBe(false);
    hook.rerender({ guard: recording });
    expect(isGuardActive('recording')).toBe(true);
    hook.unmount();
    expect(isGuardActive('recording')).toBe(false);
  });
});

describe('RouteGuards', () => {
  it('blocks router navigation that a guard refuses', async () => {
    const root = createRootRoute({ component: () => <><RouteGuards /><Outlet /></> });
    const overview = createRoute({ getParentRoute: () => root, path: '/overview', component: () => <p>Overview page</p> });
    const plan = createRoute({ getParentRoute: () => root, path: '/plan', component: () => <p>Plan page</p> });
    const router = createRouter({ routeTree: root.addChildren([overview, plan]), history: createMemoryHistory({ initialEntries: ['/overview'] }) });
    render(<RouterProvider router={router} />);
    await screen.findByText('Overview page');
    cleanups.push(registerGuard(recording));
    await act(() => router.navigate({ to: '/plan' }));
    expect(router.state.location.pathname).toBe('/overview');
    expect(toast).toHaveBeenCalledWith('Stop recording before leaving Capture.');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/routes/guards.test.tsx`
Expected: FAIL with `Error: Failed to resolve import "./guards" from "src/routes/guards.test.tsx". Does the file exist?`

- [ ] **Step 3: Write the minimal implementation**

```ts
// web/src/routes/guards.ts
import { useBlocker } from '@tanstack/react-router';
import { useEffect } from 'react';
import { toast } from '../ui/Toast';

export type GuardId = 'recording' | 'capture-saving' | 'note-edit';
export type GuardVerdict = { kind: 'block'; toast: string } | { kind: 'confirm'; message: string } | null;
export type NavigationGuard = { id: GuardId; check(toPath: string): GuardVerdict; beforeUnload: boolean };

const guards = new Map<GuardId, NavigationGuard>();

export function registerGuard(guard: NavigationGuard): () => void {
  guards.set(guard.id, guard);
  return () => { if (guards.get(guard.id) === guard) guards.delete(guard.id); };
}

export function useNavigationGuard(guard: NavigationGuard | null): void {
  useEffect(() => (guard ? registerGuard(guard) : undefined), [guard]);
}

export function isGuardActive(id: GuardId): boolean {
  return guards.has(id);
}

export function allowNavigation(toPath: string): boolean {
  for (const guard of guards.values()) {
    const verdict = guard.check(toPath);
    if (verdict?.kind === 'block') { toast(verdict.toast); return false; }
    if (verdict?.kind === 'confirm' && !window.confirm(verdict.message)) return false;
  }
  return true;
}

export function shouldWarnBeforeUnload(): boolean {
  return [...guards.values()].some(guard => guard.beforeUnload);
}

export function RouteGuards(): null {
  useBlocker({ shouldBlockFn: ({ next }) => !allowNavigation(next.pathname), enableBeforeUnload: shouldWarnBeforeUnload, withResolver: false });
  return null;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- src/routes/guards.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/routes/guards.ts web/src/routes/guards.test.tsx
git commit -m "feat(web): add navigation guard registry and router blocker"
```

### Task 9: `shell/keyboard.ts` — `n` and Ctrl/Cmd+K

**Files:**
- Create: `web/src/shell/keyboard.ts` (port of `public/app.js:561-565`, plus the spec §4.5 IME and dialog rules)
- Test: `web/src/shell/keyboard.test.ts`

**Interfaces:**
- Consumes: `isDialogOpen` (Task 6), `isUnlockOpen` (Task 6).
- Produces: `export function installKeyboard(navigate: (to: string) => void): () => void;`
  Ctrl/Cmd+Enter is handled by the forms that own it (Add task in Task 19, Capture in Phase 2b).

- [ ] **Step 1: Write the failing test**

```ts
// web/src/shell/keyboard.test.ts
// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDialog, openDialog } from './dialogs';
import { installKeyboard } from './keyboard';
import { cancelUnlock, requestUnlock } from './unlock';

let navigate: ReturnType<typeof vi.fn>;
let uninstall: () => void;
beforeEach(() => { navigate = vi.fn(); uninstall = installKeyboard(navigate); });
afterEach(() => { uninstall(); act(() => { closeDialog(); cancelUnlock(); }); document.body.innerHTML = ''; vi.useRealTimers(); });

const press = (init: KeyboardEventInit, target: EventTarget = document.body) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

describe('n opens Capture', () => {
  it('navigates with no modifier, outside fields, with no dialog', () => {
    const event = press({ key: 'n' });
    expect(navigate).toHaveBeenCalledWith('/capture');
    expect(event.defaultPrevented).toBe(true);
  });

  it.each([{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }])('ignores %j', init => {
    press({ key: 'n', ...init });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores Shift+N (key "N")', () => {
    press({ key: 'N', shiftKey: true });
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each(['input', 'textarea', 'select'])('ignores typing in a %s', tag => {
    const field = document.createElement(tag);
    document.body.append(field);
    field.focus();
    press({ key: 'n' }, field);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores contenteditable regions', () => {
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    editor.tabIndex = 0;
    document.body.append(editor);
    editor.focus();
    press({ key: 'n' }, editor);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores n while a dialog or Unlock is open', () => {
    act(() => openDialog({ kind: 'task-capture' }));
    press({ key: 'n' });
    act(() => { closeDialog(); requestUnlock(); });
    press({ key: 'n' });
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('Ctrl/Cmd+K opens search', () => {
  it.each([{ ctrlKey: true }, { metaKey: true }])('%j navigates to Notes and focuses #note-search', init => {
    vi.useFakeTimers();
    const search = document.createElement('input');
    search.id = 'note-search';
    document.body.append(search);
    const event = press({ key: 'k', ...init });
    expect(event.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/notes');
    vi.advanceTimersByTime(100);
    expect(document.activeElement).toBe(search);
  });

  it('stops after uninstall', () => {
    uninstall();
    press({ key: 'k', ctrlKey: true });
    expect(navigate).not.toHaveBeenCalled();
    uninstall = () => {};
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/shell/keyboard.test.ts`
Expected: FAIL with `Error: Failed to resolve import "./keyboard" from "src/shell/keyboard.test.ts". Does the file exist?`

- [ ] **Step 3: Write the minimal implementation**

```ts
// web/src/shell/keyboard.ts
import { isDialogOpen } from './dialogs';
import { isUnlockOpen } from './unlock';

function isField(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
    || element.closest('[contenteditable]:not([contenteditable="false"])') !== null;
}

export function installKeyboard(navigate: (to: string) => void): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing || event.defaultPrevented) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      navigate('/notes');
      setTimeout(() => document.querySelector<HTMLInputElement>('#note-search')?.focus(), 100); // app.js:563
      return;
    }
    if (event.key === 'n' && !event.ctrlKey && !event.metaKey && !event.altKey
      && !isField(document.activeElement) && !isDialogOpen() && !isUnlockOpen()) {
      event.preventDefault();
      navigate('/capture');
    }
  };
  document.addEventListener('keydown', onKeyDown);
  return () => document.removeEventListener('keydown', onKeyDown);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- src/shell/keyboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/shell/keyboard.ts web/src/shell/keyboard.test.ts
git commit -m "feat(web): add n and Ctrl/Cmd+K shortcuts with IME and dialog rules"
```

### Task 10: `shell/notifications.ts` — due-reminder notifications

**Files:**
- Create: `web/src/shell/notifications.ts` (port of `public/app.js:93-101` and `516`)
- Test: `web/src/shell/notifications.test.ts`

**Interfaces:**
- Consumes: `Snapshot` from `../api/schemas`; `S.notificationTitle`, `S.notificationFallback` from `../strings`; the hashed `../assets/icon.svg` URL.
- Produces (contract §6.3):
  ```ts
  export const NOTIFICATIONS_KEY = 'noema-notifications';
  export function notifyDueReminders(snapshot: Snapshot): void;
  export function rearmReminder(id: string): void;
  ```
  Like `app.js:94-95`, a due id is remembered for the page session even when notifications are off, so enabling them later does not replay old reminders.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/shell/notifications.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Reminder } from '../api/schemas';
import { makeSnapshot, makeTask } from '../test/fixtures';

type Shown = { title: string; options: NotificationOptions };
let shown: Shown[];
let permission: NotificationPermission;
let throwOnCreate: boolean;

class FakeNotification {
  static get permission() { return permission; }
  constructor(title: string, options: NotificationOptions = {}) {
    if (throwOnCreate) throw new TypeError('Illegal constructor');
    shown.push({ title, options });
  }
}

const reminder = (id: string, state: Reminder['state'], task_id = 'task-1'): Reminder =>
  ({ id, task_id, at: '2026-10-08T11:00:00+00:00', state, created_at: '2026-10-08T10:00:00+00:00' });
const snapshot = (...reminders: Reminder[]) => makeSnapshot({ tasks: [makeTask('task-1', { title: 'Review the cleanup' })], reminders });

async function load() {
  vi.resetModules();
  return import('./notifications');
}

beforeEach(() => {
  shown = []; permission = 'granted'; throwOnCreate = false;
  vi.stubGlobal('Notification', FakeNotification);
  localStorage.setItem('noema-notifications', '1');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

describe('notifyDueReminders', () => {
  it('notifies a due reminder once per id per session, tagged with the id', async () => {
    const { notifyDueReminders, NOTIFICATIONS_KEY } = await load();
    expect(NOTIFICATIONS_KEY).toBe('noema-notifications');
    notifyDueReminders(snapshot(reminder('r1', 'due')));
    notifyDueReminders(snapshot(reminder('r1', 'due')));
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe('Noema reminder');
    expect(shown[0].options.tag).toBe('r1');
    expect(shown[0].options.body).toBe('Review the cleanup');
    expect(typeof shown[0].options.icon).toBe('string');
    expect(shown[0].options.icon).toMatch(/icon.*\.svg/);
  });

  it('ignores scheduled and dismissed reminders', async () => {
    const { notifyDueReminders } = await load();
    notifyDueReminders(snapshot(reminder('r1', 'scheduled'), reminder('r2', 'dismissed')));
    expect(shown).toHaveLength(0);
  });

  it('uses the fallback body when the task is not in the snapshot', async () => {
    const { notifyDueReminders } = await load();
    notifyDueReminders(snapshot(reminder('r1', 'due', 'missing')));
    expect(shown[0].options.body).toBe('A task needs your attention.');
  });

  it('does nothing unless opted in and granted, and does not replay later (app.js:94-96)', async () => {
    const { notifyDueReminders } = await load();
    localStorage.setItem('noema-notifications', '0');
    notifyDueReminders(snapshot(reminder('r1', 'due')));
    localStorage.setItem('noema-notifications', '1');
    notifyDueReminders(snapshot(reminder('r1', 'due')));
    expect(shown).toHaveLength(0);
    permission = 'default';
    notifyDueReminders(snapshot(reminder('r2', 'due')));
    expect(shown).toHaveLength(0);
  });

  it('a snooze re-arms the id', async () => {
    const { notifyDueReminders, rearmReminder } = await load();
    notifyDueReminders(snapshot(reminder('r1', 'due')));
    rearmReminder('r1');
    notifyDueReminders(snapshot(reminder('r1', 'due')));
    expect(shown).toHaveLength(2);
  });

  it('survives blocked storage and a throwing constructor', async () => {
    const { notifyDueReminders } = await load();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    expect(() => notifyDueReminders(snapshot(reminder('r1', 'due')))).not.toThrow();
    vi.restoreAllMocks();
    throwOnCreate = true;
    expect(() => notifyDueReminders(snapshot(reminder('r2', 'due')))).not.toThrow();
    expect(shown).toHaveLength(0);
  });

  it('does nothing when the browser has no Notification API', async () => {
    vi.unstubAllGlobals();
    const original = (window as { Notification?: unknown }).Notification;
    delete (window as { Notification?: unknown }).Notification;
    const { notifyDueReminders } = await load();
    expect(() => notifyDueReminders(snapshot(reminder('r1', 'due')))).not.toThrow();
    (window as { Notification?: unknown }).Notification = original;
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/shell/notifications.test.ts`
Expected: FAIL with `Error: Failed to resolve import "./notifications" from "src/shell/notifications.test.ts". Does the file exist?`

- [ ] **Step 3: Write the minimal implementation**

```ts
// web/src/shell/notifications.ts
import type { Snapshot } from '../api/schemas';
import iconUrl from '../assets/icon.svg';
import { S } from '../strings';

export const NOTIFICATIONS_KEY = 'noema-notifications';

const notified = new Set<string>(); // per page session (app.js:9)

function optedIn(): boolean {
  try { return localStorage.getItem(NOTIFICATIONS_KEY) === '1'; } catch { return false; }
}

export function notifyDueReminders(snapshot: Snapshot): void {
  for (const reminder of snapshot.reminders) {
    if (reminder.state !== 'due' || notified.has(reminder.id)) continue;
    notified.add(reminder.id);
    if (!optedIn() || !('Notification' in window) || Notification.permission !== 'granted') continue;
    const task = snapshot.tasks.find(t => t.id === reminder.task_id);
    try {
      new Notification(S.notificationTitle, { body: task?.title || S.notificationFallback, tag: reminder.id, icon: iconUrl });
    } catch {
      // Some engines forbid page-context notifications; Needs you still lists the reminder.
    }
  }
}

export function rearmReminder(id: string): void {
  notified.delete(id);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- src/shell/notifications.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/shell/notifications.ts web/src/shell/notifications.test.ts
git commit -m "feat(web): notify due reminders once per session with hashed icon"
```

### Task 11: `components/focus.ts` — pinned-focus confirmation rules

**Files:**
- Create: `web/src/components/focus.ts` (port of `public/app.js:501-502`)
- Test: `web/src/components/focus.test.ts`

**Interfaces:**
- Consumes: `Focus` from `../api/schemas`.
- Produces (*new*): `export function confirmFocusChange(focus: Focus, taskId: string | null): boolean;` — returns `true` when the change may be sent. Replacing or clearing a **pin** needs `window.confirm`; anything else is allowed without asking.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/components/focus.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Focus } from '../api/schemas';
import { confirmFocusChange } from './focus';

const focus = (task_id: string, pinned: boolean): NonNullable<Focus> => ({ task_id, pinned, source: 'manual', updated_at: '2026-10-08T11:00:00+00:00' });
afterEach(() => vi.restoreAllMocks());

describe('confirmFocusChange', () => {
  it('allows any change without a pin and never asks', () => {
    const confirm = vi.spyOn(window, 'confirm');
    expect(confirmFocusChange(null, 't1')).toBe(true);
    expect(confirmFocusChange(focus('t1', false), 't2')).toBe(true);
    expect(confirmFocusChange(focus('t1', false), null)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('re-pinning the same task needs no confirmation', () => {
    const confirm = vi.spyOn(window, 'confirm');
    expect(confirmFocusChange(focus('t1', true), 't1')).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('asks before replacing a pin and respects a decline', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    expect(confirmFocusChange(focus('t1', true), 't2')).toBe(false);
    expect(confirmFocusChange(focus('t1', true), 't2')).toBe(true);
    expect(confirm).toHaveBeenCalledWith('Replace your pinned focus with this task?');
  });

  it('asks before clearing a pin', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(confirmFocusChange(focus('t1', true), null)).toBe(false);
    expect(confirm).toHaveBeenCalledWith('Unpin and clear your current focus?');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/components/focus.test.ts`
Expected: FAIL with `Error: Failed to resolve import "./focus" from "src/components/focus.test.ts". Does the file exist?`

- [ ] **Step 3: Write the minimal implementation**

```ts
// web/src/components/focus.ts
// Pins always win over automatic logic (handbook §07/§08): only an explicit "yes" replaces or clears one.
import type { Focus } from '../api/schemas';

export function confirmFocusChange(focus: Focus, taskId: string | null): boolean {
  if (!focus?.pinned) return true;
  if (taskId === null) return window.confirm('Unpin and clear your current focus?');
  return focus.task_id === taskId || window.confirm('Replace your pinned focus with this task?');
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- src/components/focus.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/focus.ts web/src/components/focus.test.ts
git commit -m "feat(web): confirm before replacing or clearing a pinned focus"
```

### Task 12: Shell parts — `Nav`, `StatusLine`, `OfflineNotice`, `PageHeading`

**Files:**
- Create: `web/src/shell/Nav.tsx` (variant B sidebar, `experiments/ui-ab/frontend/src/main.tsx:164`, with the demo status/caption removed)
- Create: `web/src/shell/StatusLine.tsx` (`public/app.js:104-108, 138-141`)
- Create: `web/src/shell/OfflineNotice.tsx` (`public/app.js:142`)
- Create: `web/src/ui/PageHeading.tsx` (variant B `.page-heading`, `main.tsx:170, 197`)
- Test: `web/src/shell/Nav.test.tsx`, `web/src/shell/StatusLine.test.tsx`

**Interfaces:**
- Consumes: `Icon` (Task 4); `openDialog` (Task 6); `useSnapshot` from `../state/queries`; `useConnected` from `../domain/connection`; `useOutboxCount` from `../local/outbox`; `useCaptureDraft` from `../local/drafts`; `S.connected`, `S.offline`, `S.statusSummary`, `S.outboxCount`, `S.offlineBanner` from `../strings`; `Link`, `useRouterState` from `@tanstack/react-router`.
- Produces:
  ```ts
  export const SIDEBAR_KEY = 'noema-sidebar-collapsed';   // new export of the contract §6.3 key; values '1' | '0'
  export function Nav(): JSX.Element;            // labels Overview, Capture, Notes, Tasks + Settings
  export function StatusLine(): JSX.Element;     // #connection-label, status summary, outbox button "N captures on this device"
  export function OfflineNotice(): JSX.Element | null;
  export function PageHeading(props: { title: string; subtitle?: string; action?: ReactNode }): JSX.Element;   // new
  ```

- [ ] **Step 1: Write the failing tests**

```tsx
// web/src/shell/Nav.test.tsx
// @vitest-environment jsdom
import { Outlet, RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./dialogs', () => ({ openDialog: vi.fn() }));
import { openDialog } from './dialogs';
import { Nav, SIDEBAR_KEY } from './Nav';

function renderNavAt(path: string) {
  const root = createRootRoute({ component: () => <><Nav /><Outlet /></> });
  const routes = ['/overview', '/capture', '/notes', '/note/$id', '/plan'].map(p => createRoute({ getParentRoute: () => root, path: p, component: () => null }));
  const router = createRouter({ routeTree: root.addChildren(routes), history: createMemoryHistory({ initialEntries: [path] }) });
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

describe('Nav', () => {
  it('shows Overview, Capture, Notes, Tasks with matching accessible names', async () => {
    renderNavAt('/overview');
    const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
    const links = [...nav.querySelectorAll('a')];
    expect(links.map(a => a.textContent)).toEqual(['Overview', 'Capture', 'Notes', 'Tasks']);
    for (const name of ['Overview', 'Capture', 'Notes', 'Tasks']) expect(screen.getByRole('link', { name })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Tasks' }).getAttribute('href')).toBe('/plan');
  });

  it('marks Notes current while a note is open', async () => {
    renderNavAt('/note/abc');
    expect((await screen.findByRole('link', { name: 'Notes' })).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('aria-current')).toBeNull();
  });

  it('collapses to icons, keeps accessible names and remembers the choice', async () => {
    renderNavAt('/overview');
    fireEvent.click(await screen.findByRole('button', { name: 'Collapse sidebar' }));
    expect(document.querySelector('.sidebar')!.getAttribute('data-collapsed')).toBe('true');
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe('1');
    expect(screen.getByRole('link', { name: 'Overview' })).toBeTruthy();
    cleanup();
    renderNavAt('/overview');
    expect((await screen.findByRole('button', { name: 'Expand sidebar' })).getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe('0');
  });

  it('still works when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    renderNavAt('/overview');
    fireEvent.click(await screen.findByRole('button', { name: 'Collapse sidebar' }));
    expect(document.querySelector('.sidebar')!.getAttribute('data-collapsed')).toBe('true');
  });

  it('opens Settings', async () => {
    renderNavAt('/overview');
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'settings' });
  });
});
```

```tsx
// web/src/shell/StatusLine.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeSnapshot, makeTask } from '../test/fixtures';

vi.mock('../state/queries', () => ({ useSnapshot: vi.fn() }));
vi.mock('../domain/connection', () => ({ useConnected: vi.fn() }));
vi.mock('../local/outbox', () => ({ useOutboxCount: vi.fn() }));
vi.mock('../local/drafts', () => ({ useCaptureDraft: vi.fn() }));
vi.mock('./dialogs', () => ({ openDialog: vi.fn() }));

import { useConnected } from '../domain/connection';
import { useCaptureDraft } from '../local/drafts';
import { useOutboxCount } from '../local/outbox';
import { useSnapshot } from '../state/queries';
import { S } from '../strings';
import { openDialog } from './dialogs';
import { OfflineNotice } from './OfflineNotice';
import { StatusLine } from './StatusLine';

function given({ connected, snapshot = null, outbox = 0, saveState = 'saved' }: {
  connected: boolean; snapshot?: ReturnType<typeof makeSnapshot> | null; outbox?: number; saveState?: 'memory' | 'pending' | 'saved' | 'error';
}) {
  vi.mocked(useConnected).mockReturnValue(connected);
  vi.mocked(useSnapshot).mockReturnValue({ data: snapshot ?? undefined } as unknown as ReturnType<typeof useSnapshot>);
  vi.mocked(useOutboxCount).mockReturnValue(outbox);
  vi.mocked(useCaptureDraft).mockReturnValue({ saveState } as unknown as ReturnType<typeof useCaptureDraft>);
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('StatusLine', () => {
  it('labels the connection in words, not colour alone', () => {
    given({ connected: true, snapshot: makeSnapshot() });
    render(<StatusLine />);
    expect(document.querySelector('#connection-label')!.textContent).toBe(S.connected);
    cleanup();
    given({ connected: false, snapshot: makeSnapshot() });
    render(<StatusLine />);
    expect(document.querySelector('#connection-label')!.textContent).toBe(S.offline);
  });

  it('shows the integration summary from the snapshot', () => {
    const snapshot = makeSnapshot({ tasks: [makeTask('t')] });
    given({ connected: true, snapshot });
    render(<StatusLine />);
    expect(screen.getByText(S.statusSummary(snapshot, true))).toBeTruthy();
  });

  it('shows the queued-capture indicator only when the outbox has items and opens Outbox', () => {
    given({ connected: true, snapshot: makeSnapshot(), outbox: 0 });
    render(<StatusLine />);
    expect(screen.queryByRole('button', { name: S.outboxCount(1) })).toBeNull();
    cleanup();
    given({ connected: true, snapshot: makeSnapshot(), outbox: 2 });
    render(<StatusLine />);
    fireEvent.click(screen.getByRole('button', { name: '2 captures on this device' }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'outbox' });
  });

  it('keeps queued, draft and saved-on-server labels distinct in the shell (handbook §20)', () => {
    given({ connected: true, snapshot: makeSnapshot(), outbox: 1 });
    render(<StatusLine />);
    const queued = screen.getByRole('button', { name: S.outboxCount(1) }).textContent;
    expect(queued).toBe('1 capture on this device');
    for (const other of [S.draftSaved, S.draftMemory, S.draftPending, S.savedTo('Inbox', false), S.connected]) expect(queued).not.toBe(other);
    expect(queued).not.toMatch(/saved|uploaded|server/i);
  });
});

describe('OfflineNotice', () => {
  it('renders nothing while connected', () => {
    given({ connected: true, snapshot: makeSnapshot() });
    const { container } = render(<OfflineNotice />);
    expect(container.textContent).toBe('');
  });

  it.each([
    [true, 'saved', true, false], [false, 'saved', false, false], [true, 'error', true, true],
  ] as const)('offline with snapshot=%s, draft=%s uses offlineBanner(%s, %s)', (hasSnapshot, saveState, a, b) => {
    given({ connected: false, snapshot: hasSnapshot ? makeSnapshot() : null, saveState });
    render(<OfflineNotice />);
    expect(screen.getByRole('status').textContent).toBe(S.offlineBanner(a, b));
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm --prefix web test -- src/shell/Nav.test.tsx src/shell/StatusLine.test.tsx`
Expected: FAIL with `Error: Failed to resolve import "./Nav" from "src/shell/Nav.test.tsx". Does the file exist?` and the same for `./OfflineNotice`.

- [ ] **Step 3: Write the minimal implementation**

```tsx
// web/src/ui/PageHeading.tsx
import type { JSX, ReactNode } from 'react';

export function PageHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }): JSX.Element {
  return (
    <div className={action ? 'page-heading heading-with-action' : 'page-heading'} data-quiet="">
      <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      {action}
    </div>
  );
}
```

```tsx
// web/src/shell/Nav.tsx
import { Link, useRouterState } from '@tanstack/react-router';
import { useState, type JSX } from 'react';
import { Icon, type IconName } from '../ui/Icon';
import { openDialog } from './dialogs';

export const SIDEBAR_KEY = 'noema-sidebar-collapsed';

type Item = { to: '/overview' | '/capture' | '/notes' | '/plan'; label: string; icon: IconName; prefix?: string };
const ITEMS: Item[] = [
  { to: '/overview', label: 'Overview', icon: 'home' },
  { to: '/capture', label: 'Capture', icon: 'pen' },
  { to: '/notes', label: 'Notes', icon: 'notes', prefix: '/note/' },
  { to: '/plan', label: 'Tasks', icon: 'task-check' },
];

function readCollapsed(): boolean {
  try { return localStorage.getItem(SIDEBAR_KEY) === '1'; } catch { return false; }
}

export function Nav(): JSX.Element {
  const pathname = useRouterState({ select: state => state.location.pathname });
  const [collapsed, setCollapsed] = useState(readCollapsed);
  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0'); } catch { /* remembered for this page only */ }
  }
  return (
    <aside className="sidebar" data-collapsed={collapsed ? 'true' : 'false'}>
      <div className="brand">
        <span>Noema</span>
        <button type="button" className="icon-button collapse-toggle" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed} onClick={toggle}><Icon name="sidebar" /></button>
      </div>
      <nav aria-label="Main navigation">
        {ITEMS.map(item => {
          const active = pathname === item.to || (item.prefix !== undefined && pathname.startsWith(item.prefix));
          return (
            <Link key={item.to} to={item.to} className={active ? 'nav-item active' : 'nav-item'} aria-current={active ? 'page' : undefined}>
              <Icon name={item.icon} /><span className="nav-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-bottom">
        <button type="button" className="nav-item" onClick={() => openDialog({ kind: 'settings' })}>
          <Icon name="settings" /><span className="nav-label">Settings</span>
        </button>
      </div>
    </aside>
  );
}
```

```tsx
// web/src/shell/StatusLine.tsx
import type { JSX } from 'react';
import { useConnected } from '../domain/connection';
import { useOutboxCount } from '../local/outbox';
import { useSnapshot } from '../state/queries';
import { S } from '../strings';
import { openDialog } from './dialogs';

export function StatusLine(): JSX.Element {
  const connected = useConnected();
  const snapshot = useSnapshot().data ?? null;
  const queued = useOutboxCount();
  return (
    <div className="status-line">
      <span className="local-label">
        <span className={connected ? 'status-dot' : 'status-dot paused'} aria-hidden="true" />
        <span id="connection-label">{connected ? S.connected : S.offline}</span>
      </span>
      <span className="status-summary">{S.statusSummary(snapshot, connected)}</span>
      {queued > 0 && (
        <button type="button" className="text-button" onClick={() => openDialog({ kind: 'outbox' })}>{S.outboxCount(queued)}</button>
      )}
    </div>
  );
}
```

```tsx
// web/src/shell/OfflineNotice.tsx
import type { JSX } from 'react';
import { useConnected } from '../domain/connection';
import { useCaptureDraft } from '../local/drafts';
import { useSnapshot } from '../state/queries';
import { S } from '../strings';

export function OfflineNotice(): JSX.Element | null {
  const connected = useConnected();
  const snapshot = useSnapshot().data;
  const { saveState } = useCaptureDraft();
  if (connected) return null;
  return <div className="offline-banner" role="status">{S.offlineBanner(snapshot !== undefined, saveState === 'error')}</div>;
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npm --prefix web test -- src/shell/Nav.test.tsx src/shell/StatusLine.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/ui/PageHeading.tsx web/src/shell/Nav.tsx web/src/shell/StatusLine.tsx web/src/shell/OfflineNotice.tsx web/src/shell/Nav.test.tsx web/src/shell/StatusLine.test.tsx
git commit -m "feat(web): add navigation, status line and offline notice"
```

### Task 13: `dialogs/Unlock.tsx`

**Files:**
- Create: `web/src/dialogs/Unlock.tsx` (port of `public/app.js:302`)
- Test: `web/src/dialogs/Unlock.test.tsx`

**Interfaces:**
- Consumes: `Dialog` (Task 5); `completeUnlock` (Task 6); `unlock` from `../api/session`; `S.unlockTitle`, `S.unlockHelp`, `S.accessToken`, `S.unlock` from `../strings`; `messageOf` (Task 4); `useQueryClient`.
- Produces: `export function UnlockDialog(props: { onClose: () => void }): JSX.Element;` — a wrong token shows the server message inline (`/api/session` is exempt from the global 401 rule, spec §4.2).

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/dialogs/Unlock.test.tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { polyfillDialog } from '../ui/testing';

vi.mock('../api/session', () => ({ unlock: vi.fn() }));
vi.mock('../shell/unlock', () => ({ completeUnlock: vi.fn(async () => {}) }));
import { unlock } from '../api/session';
import { completeUnlock } from '../shell/unlock';
import { S } from '../strings';
import { UnlockDialog } from './Unlock';

beforeAll(polyfillDialog);
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function renderUnlock(onClose = vi.fn()) {
  const qc = new QueryClient();
  render(<QueryClientProvider client={qc}><UnlockDialog onClose={onClose} /></QueryClientProvider>);
  return { qc, onClose };
}

describe('UnlockDialog', () => {
  it('explains where the token is and focuses the field', () => {
    renderUnlock();
    expect(screen.getByRole('dialog', { name: S.unlockTitle })).toBeTruthy();
    expect(screen.getByText(S.unlockHelp)).toBeTruthy();
    const field = screen.getByLabelText(S.accessToken) as HTMLInputElement;
    expect(field.type).toBe('password');
    expect(field.autocomplete).toBe('current-password');
    expect(document.activeElement).toBe(field);
  });

  it('shows a wrong token inline and keeps the dialog', async () => {
    vi.mocked(unlock).mockRejectedValueOnce(new ApiError('http', 'Invalid access token', 401));
    renderUnlock();
    fireEvent.change(screen.getByLabelText(S.accessToken), { target: { value: 'wrong-token' } });
    fireEvent.click(screen.getByRole('button', { name: S.unlock }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Invalid access token'));
    expect(completeUnlock).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: S.unlock }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('unlocks with the token, then completes (refresh, flush)', async () => {
    vi.mocked(unlock).mockResolvedValueOnce();
    const { qc } = renderUnlock();
    fireEvent.change(screen.getByLabelText(S.accessToken), { target: { value: 'right-token-0123456789abcdef' } });
    fireEvent.click(screen.getByRole('button', { name: S.unlock }));
    await waitFor(() => expect(completeUnlock).toHaveBeenCalledWith(qc));
    expect(unlock).toHaveBeenCalledWith('right-token-0123456789abcdef');
  });

  it('can be dismissed', () => {
    const { onClose } = renderUnlock();
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/dialogs/Unlock.test.tsx`
Expected: FAIL with `Error: Failed to resolve import "./Unlock" from "src/dialogs/Unlock.test.tsx". Does the file exist?`

- [ ] **Step 3: Write the minimal implementation**

```tsx
// web/src/dialogs/Unlock.tsx
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type JSX } from 'react';
import { unlock } from '../api/session';
import { completeUnlock } from '../shell/unlock';
import { S } from '../strings';
import { Dialog } from '../ui/Dialog';
import { messageOf } from '../ui/Toast';

export function UnlockDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const token = String(new FormData(event.currentTarget).get('token') ?? '');
    setBusy(true);
    setError('');
    try {
      await unlock(token);
      await completeUnlock(qc); // closes this dialog
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <Dialog title={S.unlockTitle} onRequestClose={onClose}>
      <p className="small dim">{S.unlockHelp}</p>
      <form onSubmit={submit}>
        <label className="field">{S.accessToken}
          <input type="password" name="token" autoComplete="current-password" required data-autofocus="" />
        </label>
        <p className="field-error" role="alert">{error}</p>
        <div className="dialog-actions"><button className="primary" type="submit" disabled={busy}>{S.unlock}</button></div>
      </form>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- src/dialogs/Unlock.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/dialogs/Unlock.tsx web/src/dialogs/Unlock.test.tsx
git commit -m "feat(web): add Unlock dialog with inline token errors"
```

### Task 14: Router, `AppShell`, `main.tsx`, screen stubs, shell styles — first boot E2E

**Files:**
- Create: `web/src/routes/router.tsx`
- Create: `web/src/shell/AppShell.tsx` (includes `UnlockHost`)
- Create: `web/src/screens/Now.tsx`, `web/src/screens/Plan.tsx` (heading + `OfflineNotice`; completed in Tasks 17–18)
- Create: `web/src/screens/Capture.tsx`, `web/src/screens/Notes.tsx`, `web/src/screens/NoteView.tsx` (heading + `OfflineNotice`; Phase 2b completes them)
- Create: `web/src/styles/shell.css`, `web/src/styles/ui.css` (ported from `experiments/ui-ab/frontend/src/style.css:26-56, 97-135, 250-266` and `theme.css:13-85, 114-116`, demo selectors dropped)
- Modify: `web/src/main.tsx` (replace the whole P1 body, contract §6.6)
- Test: `web/e2e/boot.spec.ts`, `web/e2e/shell.spec.ts`; rerun the existing `web/e2e/outbox.spec.ts` (`01-foundation.md` Task 19: boot flush, lost acknowledgement, spec §8 Upgrade) against the full shell

**Interfaces:**
- Consumes: Tasks 1, 4–13; `createQueryClient` from `./state/queryClient`; `useSnapshot`, `readCachedSnapshot`, `installRefetchTriggers`, `runFlush`, `queryKeys` from `./state/queries`; `boot` from `./api/session`; `onUnauthorized` from `./api/client`; `connection`, `installConnectionListeners`, `useConnected` from `./domain/connection`; `captureDraftStore` from `./local/drafts`; `taskDraftStore` from `./local/taskDraft`; `registerServiceWorker` from `./shell/serviceWorker`; e2e `test`, `expect`, `gotoApp` from `./fixtures`, `startNoema`, `E2E_TOKEN` from `./server`.
- Produces:
  ```ts
  export function createAppRouter(queryClient: QueryClient): Router<…>;   // contract §6.1 (hash history; Register declared)
  export function openModalLink(request: DialogRequest, snapshot: Snapshot | undefined): void;   // new: unknown task → toast(S.taskUnavailable)
  export function AppShell(): JSX.Element;
  export function NowScreen(): JSX.Element; export function PlanScreen(): JSX.Element;
  export function CaptureScreen(): JSX.Element; export function NotesScreen(): JSX.Element; export function NoteViewScreen(): JSX.Element;
  ```
  `main.tsx` follows contract §6.6 except two calls Phase 2b adds (its Task 14): `installPreloadErrorHandler()` and `installCheckpointClose()`. A rejected `start()` renders the `public/app.js:616` fallback ("Could not open the workspace. Check the server and reload.") instead of a blank page.

- [ ] **Step 1: Write the failing E2E tests**

Titles that match a handbook-trace row are that label verbatim (trace U7, U9). Parity row 53 and trace U24 need the Overview and Add task, so they land in Task 22.

```ts
// web/e2e/boot.spec.ts
import { chromium } from '@playwright/test';
import { COPY } from '../src/copy';
import { expect, gotoApp, test } from './fixtures';
import { E2E_TOKEN, startNoema } from './server';

test('the bare origin opens Overview', async ({ page, noema }) => {
  await page.goto(noema.origin + '/');
  await expect(page).toHaveURL(/#\/overview$/);
  await expect(page.locator('#connection-label')).toHaveText('Server connected');
});

test('loopback boot logs in automatically and never shows Unlock', async ({ page, noema }) => {
  await gotoApp(page, noema);
  await expect(page.getByRole('dialog', { name: 'Unlock Noema' })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Good (morning|afternoon|evening)\.$/);
  await expect(page.getByText(COPY.tagline)).toBeVisible();
});

const LEGACY: [string, string, string][] = [
  ['#plan', '#/plan', COPY.plan.title], ['#capture', '#/capture', COPY.capture.title],
  ['#notes', '#/notes', COPY.notes.title], ['#note/abc', '#/note/abc', COPY.notes.title],
];

for (const [legacy, modern, heading] of LEGACY) {
  test(`legacy ${legacy} is rewritten on boot`, async ({ page, noema }) => {
    await page.goto(noema.origin + '/' + legacy);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(modern);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  });
}

test('legacy hashes are rewritten on every hashchange', async ({ page, noema }) => {
  await gotoApp(page, noema);
  await page.evaluate(() => { location.hash = '#plan'; });
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/plan');
  await expect(page.getByRole('heading', { level: 1, name: COPY.plan.title })).toBeVisible();
  await page.evaluate(() => { location.hash = '#overview'; });
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/overview');
});

test('a non-loopback host shows Unlock; a wrong token stays inline; the cookie alone skips Unlock later', async () => {
  const server = await startNoema({ env: { NOEMA_ALLOWED_HOSTS: 'noema.test' } });
  const origin = `http://noema.test:${server.port}`;
  // Plain HTTP, not a secure context: IndexedDB works and `uid()` has its fallback (01-foundation.md Task 14).
  const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP noema.test 127.0.0.1'] });
  try {
    const page = await browser.newPage();
    await page.goto(origin + '/#/overview');
    const unlock = page.getByRole('dialog', { name: 'Unlock Noema' });
    await expect(unlock).toBeVisible();
    await expect(page.locator('#connection-label')).toHaveText('Offline · local drafts');
    await unlock.getByLabel('Access token').fill('not-the-token-0123456789');
    await unlock.getByRole('button', { name: 'Unlock' }).click();
    await expect(unlock.getByRole('alert')).toHaveText('Invalid access token');
    await unlock.getByLabel('Access token').fill(E2E_TOKEN);
    await unlock.getByRole('button', { name: 'Unlock' }).click();
    await expect(unlock).toHaveCount(0);
    await expect(page.locator('#connection-label')).toHaveText('Server connected');
    await page.reload();
    await expect(page.locator('#connection-label')).toHaveText('Server connected');
    await expect(page.getByRole('dialog', { name: 'Unlock Noema' })).toHaveCount(0);
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('a startup failure shows the fallback instead of a blank page (app.js:616)', async ({ page, noema }) => {
  // Fault injection only: the legacy rewrite is start()'s first DOM call.
  await page.addInitScript(() => { history.replaceState = () => { throw new Error('Injected startup failure'); }; });
  await page.goto(noema.origin + '/#plan');
  await expect(page.getByText('Could not open the workspace. Check the server and reload.')).toBeVisible();
});
```

```ts
// web/e2e/shell.spec.ts
import { COPY } from '../src/copy';
import { failFetch } from './faults';
import { expect, gotoApp, seedLocalDb, test } from './fixtures';

test.use({ viewport: { width: 1440, height: 960 } });

test('Navigation shows Overview, Capture, Notes and Tasks with matching accessible names', async ({ page, noema }) => {
  await gotoApp(page, noema);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link')).toHaveText(['Overview', 'Capture', 'Notes', 'Tasks']);
  for (const name of ['Overview', 'Capture', 'Notes', 'Tasks']) await expect(nav.getByRole('link', { name, exact: true })).toHaveCount(1);
  await nav.getByRole('link', { name: 'Tasks' }).click();
  await expect(page).toHaveURL(/#\/plan$/);
  await expect(nav.getByRole('link', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 1, name: COPY.plan.title })).toBeVisible();
});

test('Desktop sidebar collapses to icons and stays collapsed after reload', async ({ page, noema }) => {
  await gotoApp(page, noema);
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  const sidebar = page.locator('.sidebar');
  await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
  expect((await sidebar.boundingBox())!.width).toBeLessThanOrEqual(65);
  await expect(page.getByRole('link', { name: 'Overview', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('#connection-label')).toHaveText('Server connected');
  await expect(page.locator('.sidebar')).toHaveAttribute('data-collapsed', 'true');
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(page.locator('.sidebar')).toHaveAttribute('data-collapsed', 'false');
});

test('n opens Capture only outside fields; Ctrl+K opens Notes', async ({ page, noema }) => {
  await gotoApp(page, noema);
  await page.keyboard.press('n');
  await expect(page).toHaveURL(/#\/capture$/);
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Overview' }).click();
  // Test-only probe field: typing in any field must not navigate.
  await page.evaluate(() => { const probe = document.createElement('input'); probe.id = 'probe'; probe.setAttribute('aria-label', 'Probe'); document.body.append(probe); });
  await page.locator('#probe').focus();
  await page.keyboard.press('n');
  await expect(page).toHaveURL(/#\/overview$/);
  await expect(page.locator('#probe')).toHaveValue('n');
  await page.locator('#probe').blur();
  await page.keyboard.press('Control+k');
  await expect(page).toHaveURL(/#\/notes$/);
});

test('the status line reports offline in words and recovers', async ({ page, noema, context }) => {
  await gotoApp(page, noema);
  await context.setOffline(true);
  await expect(page.locator('#connection-label')).toHaveText('Offline · local drafts');
  await expect(page.getByText('Status unavailable')).toBeVisible();
  await expect(page.locator('.offline-banner')).toContainText('Server disconnected.');
  await context.setOffline(false);
  await expect(page.locator('#connection-label')).toHaveText('Server connected');
  await expect(page.locator('.offline-banner')).toHaveCount(0);
});

test('queued captures show in the shell as "on this device"', async ({ page, noema }) => {
  await seedLocalDb(page, noema.origin, { outbox: [{ id: '0f8fad5b-d9cb-469f-a165-70867728950e', raw: 'Queued thought', task_id: '', files: [] }] });
  await failFetch(page, { path: '/api/captures', fault: { status: 503, body: '{"detail":"Injected outage"}', contentType: 'application/json' } });
  await gotoApp(page, noema);
  await expect(page.getByRole('button', { name: '1 capture on this device' })).toBeVisible();
});

test('the avatar shows the display-name initial and is hidden without a name', async ({ page, noema }) => {
  await gotoApp(page, noema);
  await expect(page.locator('.profile-button .avatar')).toHaveCount(0);
  await noema.api('PATCH', '/api/settings', { display_name: 'vishal' });
  await page.reload();
  await expect(page.locator('.profile-button .avatar')).toHaveText('V');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Good (morning|afternoon|evening), vishal\.$/);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm --prefix web run build && npm --prefix web run e2e -- e2e/boot.spec.ts e2e/shell.spec.ts`
Expected: FAIL — the P1 page renders only `<h1>Noema</h1>`, so the first test fails with `Error: Timed out 5000ms waiting for expect(page).toHaveURL(expected)` (`Expected pattern: /#\/overview$/`).

- [ ] **Step 3: Write the screen stubs**

```tsx
// web/src/screens/Now.tsx  (completed in Task 17)
import type { JSX } from 'react';
import { COPY, greeting } from '../copy';
import { OfflineNotice } from '../shell/OfflineNotice';
import { useSnapshot } from '../state/queries';
import { PageHeading } from '../ui/PageHeading';

export function NowScreen(): JSX.Element {
  const name = useSnapshot().data?.settings.display_name ?? '';
  return <div className="now-page"><PageHeading title={greeting(new Date(), name)} subtitle={COPY.tagline} /><OfflineNotice /></div>;
}
```

```tsx
// web/src/screens/Plan.tsx  (completed in Task 18)
import type { JSX } from 'react';
import { COPY } from '../copy';
import { OfflineNotice } from '../shell/OfflineNotice';
import { PageHeading } from '../ui/PageHeading';

export function PlanScreen(): JSX.Element {
  return <section className="plan-page"><PageHeading title={COPY.plan.title} subtitle={COPY.plan.subtitle} /><OfflineNotice /></section>;
}
```

```tsx
// web/src/screens/Capture.tsx  (Phase 2b completes)
import type { JSX } from 'react';
import { COPY } from '../copy';
import { OfflineNotice } from '../shell/OfflineNotice';
import { PageHeading } from '../ui/PageHeading';

export function CaptureScreen(): JSX.Element {
  return <section className="capture-page"><PageHeading title={COPY.capture.title} subtitle={COPY.capture.subtitle} /><OfflineNotice /></section>;
}
```

```tsx
// web/src/screens/Notes.tsx  (Phase 2b completes)
import type { JSX } from 'react';
import { COPY } from '../copy';
import { OfflineNotice } from '../shell/OfflineNotice';
import { PageHeading } from '../ui/PageHeading';

export function NotesScreen(): JSX.Element {
  return <section className="notes-page"><PageHeading title={COPY.notes.title} subtitle={COPY.notes.subtitle} /><OfflineNotice /></section>;
}
```

```tsx
// web/src/screens/NoteView.tsx  (lazy route; Phase 2b completes)
import type { JSX } from 'react';
import { COPY } from '../copy';
import { OfflineNotice } from '../shell/OfflineNotice';
import { PageHeading } from '../ui/PageHeading';

export function NoteViewScreen(): JSX.Element {
  return <section className="note-page"><PageHeading title={COPY.notes.title} subtitle={COPY.notes.subtitle} /><OfflineNotice /></section>;
}
```

- [ ] **Step 4: Write the router and the shell**

```tsx
// web/src/routes/router.tsx
import type { QueryClient } from '@tanstack/react-query';
import { createHashHistory, createRootRouteWithContext, createRoute, createRouter, lazyRouteComponent, redirect, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, type JSX } from 'react';
import type { Snapshot } from '../api/schemas';
import { CaptureScreen } from '../screens/Capture';
import { NotesScreen } from '../screens/Notes';
import { NowScreen } from '../screens/Now';
import { PlanScreen } from '../screens/Plan';
import { AppShell } from '../shell/AppShell';
import { openDialog, type DialogRequest } from '../shell/dialogs';
import { useSnapshot } from '../state/queries';
import { S } from '../strings';
import { toast } from '../ui/Toast';

export function openModalLink(request: DialogRequest, snapshot: Snapshot | undefined): void {
  if (request.kind === 'task' && !snapshot?.tasks.some(t => t.id === request.id)) {
    toast(S.taskUnavailable); // app.js:289 — truthful error, no fake action
    return;
  }
  openDialog(request);
}

// Cold start only: runtime modal links never reach the router (routes/legacy.ts installModalLinks).
function TaskLinkScreen(): JSX.Element {
  const { id } = taskRoute.useParams();
  const snapshot = useSnapshot().data;
  const navigate = useNavigate();
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current || !snapshot) return; // checked against the first loaded snapshot (spec §4.5)
    handled.current = true;
    openModalLink({ kind: 'task', id }, snapshot);
    void navigate({ to: '/plan', replace: true });
  }, [snapshot, id, navigate]);
  return <PlanScreen />;
}

function SettingsLinkScreen(): JSX.Element {
  const navigate = useNavigate();
  useEffect(() => {
    openDialog({ kind: 'settings' });
    void navigate({ to: '/overview', replace: true });
  }, [navigate]);
  return <NowScreen />;
}

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: AppShell });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', beforeLoad: () => { throw redirect({ to: '/overview', replace: true }); } });
const overviewRoute = createRoute({ getParentRoute: () => rootRoute, path: '/overview', component: NowScreen });
const captureRoute = createRoute({ getParentRoute: () => rootRoute, path: '/capture', component: CaptureScreen });
const notesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/notes', component: NotesScreen });
const noteRoute = createRoute({ getParentRoute: () => rootRoute, path: '/note/$id', component: lazyRouteComponent(() => import('../screens/NoteView'), 'NoteViewScreen') });
const planRoute = createRoute({ getParentRoute: () => rootRoute, path: '/plan', component: PlanScreen });
const taskRoute = createRoute({ getParentRoute: () => rootRoute, path: '/task/$id', component: TaskLinkScreen });
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsLinkScreen });

const routeTree = rootRoute.addChildren([indexRoute, overviewRoute, captureRoute, notesRoute, noteRoute, planRoute, taskRoute, settingsRoute]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({ routeTree, history: createHashHistory(), context: { queryClient } });
}

declare module '@tanstack/react-router' {
  interface Register { router: ReturnType<typeof createAppRouter> }
}
```

```tsx
// web/src/shell/AppShell.tsx
import { Outlet, useRouter } from '@tanstack/react-router';
import { useEffect, type JSX } from 'react';
import { avatarLetter } from '../copy';
import { UnlockDialog } from '../dialogs/Unlock';
import { useConnected } from '../domain/connection';
import { RouteGuards } from '../routes/guards';
import { useSnapshot } from '../state/queries';
import { Icon } from '../ui/Icon';
import { ToastHost } from '../ui/Toast';
import { openDialog } from './dialogs';
import { installKeyboard } from './keyboard';
import { Nav } from './Nav';
import { notifyDueReminders } from './notifications';
import { StatusLine } from './StatusLine';
import { cancelUnlock, useUnlockOpen } from './unlock';

function UnlockHost(): JSX.Element | null {
  return useUnlockOpen() ? <UnlockDialog onClose={cancelUnlock} /> : null;
}

export function AppShell(): JSX.Element {
  const router = useRouter();
  const connected = useConnected();
  const snapshot = useSnapshot().data;
  useEffect(() => installKeyboard(to => router.history.push(to)), [router]);
  useEffect(() => { if (connected && snapshot) notifyDueReminders(snapshot); }, [connected, snapshot]);
  const letter = avatarLetter(snapshot?.settings.display_name ?? '');
  return (
    <div className="app">
      <Nav />
      <div className="workspace">
        <header className="topbar">
          <span className="workspace-label"><span className="desktop-wordmark">Your workspace</span><span className="mobile-wordmark">Noema</span></span>
          <StatusLine />
          <button type="button" className="profile-button" aria-label="Settings" onClick={() => openDialog({ kind: 'settings' })}>
            {letter && <span className="avatar" aria-hidden="true">{letter}</span>}
            <Icon name="settings" size={18} />
          </button>
        </header>
        <main className="content" data-quiet=""><Outlet /></main>
      </div>
      <ToastHost />
      <UnlockHost />
      <RouteGuards />
    </div>
  );
}
```

- [ ] **Step 5: Replace `main.tsx`**

```tsx
// web/src/main.tsx
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { createRoot } from 'react-dom/client';
import { onUnauthorized } from './api/client';
import type { Snapshot } from './api/schemas';
import { boot } from './api/session';
import { connection, installConnectionListeners } from './domain/connection';
import { captureDraftStore } from './local/drafts';
import { taskDraftStore } from './local/taskDraft';
import { installLegacyHashRewrite, installModalLinks, rewriteLegacyHash } from './routes/legacy';
import { createAppRouter, openModalLink } from './routes/router';
import { registerServiceWorker } from './shell/serviceWorker';
import { requestUnlock } from './shell/unlock';
import { createQueryClient } from './state/queryClient';
import { installRefetchTriggers, queryKeys, readCachedSnapshot, runFlush } from './state/queries';
import './styles/base.css';
import './styles/shell.css';
import './styles/ui.css';

function latestSnapshot(qc: QueryClient): Snapshot | undefined {
  return qc.getQueriesData<Snapshot>({ queryKey: ['snapshot'] }).map(([, data]) => data).find(data => data !== undefined);
}

async function start(): Promise<void> {
  const legacy = rewriteLegacyHash(location.hash);
  if (legacy) history.replaceState(null, '', legacy);
  const qc = createQueryClient();
  const [, , cached] = await Promise.allSettled([captureDraftStore.load(), taskDraftStore.load(), readCachedSnapshot()]);
  if (cached.status === 'fulfilled' && cached.value) qc.setQueryData(queryKeys.snapshot(null), cached.value);
  installConnectionListeners();
  installRefetchTriggers(qc);
  const result = await boot();
  if (result.kind === 'ready') {
    qc.setQueryData(queryKeys.snapshot(null), result.snapshot);
    connection.report('state-success');
  }
  if (result.kind === 'locked') requestUnlock();
  onUnauthorized(requestUnlock);
  let router: ReturnType<typeof createAppRouter> | undefined;
  // Installed before createAppRouter so it runs before the router's own popstate listener.
  installModalLinks(() => router!.state.location, request => openModalLink(request, latestSnapshot(qc)));
  router = createAppRouter(qc);
  createRoot(document.getElementById('root')!).render(
    <QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider>,
  );
  installLegacyHashRewrite(to => router!.history.replace(to));
  void runFlush(qc);
  registerServiceWorker();
}

// public/app.js:616 — never leave a blank page when startup itself throws.
function showStartupFailure(): void {
  const main = document.createElement('main');
  main.dataset.quiet = '';
  const title = document.createElement('h1');
  title.textContent = 'Noema';
  const message = document.createElement('p');
  message.textContent = 'Could not open the workspace. Check the server and reload.';
  main.append(title, message);
  document.getElementById('root')?.replaceChildren(main);
}

void start().catch(showStartupFailure);
```

- [ ] **Step 6: Write the shell and control styles**

```css
/* web/src/styles/shell.css — layout by form factor (spec §4.7). Ported from variant B
   style.css:26-56, 250-266 and theme.css:13-45; demo status/caption selectors removed. */
:root { --sidebar: 190px; --sidebar-collapsed: 64px; --reading: 866px; }
body { background: var(--bg); color: var(--text); }
.app { min-height: 100dvh; position: relative; isolation: isolate; background: radial-gradient(120% 90% at 85% 0%, #14161b 0%, transparent 60%), var(--bg); }
.sidebar { position: fixed; inset: 0 auto 0 0; width: var(--sidebar); display: flex; flex-direction: column; padding: 28px 10px 20px; border-right: 1px solid var(--line); background: #0a0b0de6; z-index: 3; }
.brand { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 4px 24px 16px; color: var(--text); font-size: 20px; letter-spacing: 5px; }
.sidebar nav { display: flex; flex-direction: column; gap: 4px; }
.nav-item { position: relative; display: flex; align-items: center; gap: 16px; width: 100%; min-height: 44px; padding: 0 14px; border-radius: var(--radius-small); color: var(--text-dim); font-size: 14px; text-decoration: none; text-align: left; }
.nav-item:hover { background: var(--surface-hover); color: var(--text); }
.nav-item.active { background: var(--surface-active); color: var(--text); }
.nav-item.active::before { content: ''; position: absolute; left: 0; top: 12px; bottom: 12px; width: 2px; border-radius: 2px; background: var(--accent); }
.sidebar-bottom { margin-top: auto; }
.sidebar[data-collapsed='true'] { width: var(--sidebar-collapsed); }
.sidebar[data-collapsed='true'] .brand > span,
.sidebar[data-collapsed='true'] .nav-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.sidebar[data-collapsed='true'] .brand { justify-content: center; padding: 0 0 24px; }
.sidebar[data-collapsed='true'] .nav-item { justify-content: center; padding: 0; }
.workspace { margin-left: var(--sidebar); min-width: 0; }
.sidebar[data-collapsed='true'] + .workspace { margin-left: var(--sidebar-collapsed); }
.topbar { display: flex; align-items: center; gap: 16px; min-height: 64px; padding: 12px 26px 12px 38px; }
.workspace-label { color: var(--muted); font-size: 14px; white-space: nowrap; }
.mobile-wordmark { display: none; }
.status-line { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 6px 14px; margin-left: auto; color: var(--muted); font-size: 13px; }
.local-label { display: inline-flex; align-items: center; gap: 8px; color: var(--text-dim); }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: #aac2b2; }
.status-dot.paused { background: transparent; border: 1px solid var(--muted); }
.profile-button { display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-width: 44px; min-height: 44px; border-radius: var(--radius-small); color: var(--text-dim); }
.avatar { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--line-strong); background: #1b1d23; color: var(--text); font-size: 14px; }
.content { position: relative; max-width: 1450px; padding: 16px 48px 60px 54px; }
.offline-banner { max-width: var(--reading); margin: 16px 0; padding: 12px 16px; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--surface-solid); color: var(--text); font-size: 14px; }

/* Tablet / landscape, 650–1000 px: the sidebar stays. */
@media (max-width: 999.98px) {
  :root { --sidebar: 176px; }
  .topbar { padding-left: 32px; }
  .content { padding: 24px 32px 80px; }
}

/* Phone (< 650 px) and any portrait screen up to 1000 px: one column, bottom navigation. */
@media (max-width: 649.98px), (orientation: portrait) and (max-width: 999.98px) {
  .sidebar, .sidebar[data-collapsed='true'] { inset: auto 0 0 0; width: 100%; height: 68px; flex-direction: row; padding: 0 8px; border-right: 0; border-top: 1px solid var(--line-strong); background: #0a0b0df2; z-index: 8; }
  .brand, .sidebar-bottom { display: none; }
  .sidebar nav { flex-direction: row; justify-content: space-around; width: 100%; gap: 0; }
  .nav-item, .sidebar[data-collapsed='true'] .nav-item { flex-direction: column; justify-content: center; gap: 4px; width: 25%; min-height: 58px; padding: 6px; font-size: 11px; }
  .sidebar[data-collapsed='true'] .nav-label { position: static; width: auto; height: auto; overflow: visible; clip: auto; }
  .nav-item.active::before { display: none; }
  .workspace, .sidebar[data-collapsed='true'] + .workspace { margin-left: 0; }
  .topbar { gap: 10px; padding: 14px 16px; }
  .desktop-wordmark, .status-summary { display: none; }
  .mobile-wordmark { display: inline; color: var(--text); font-size: 20px; letter-spacing: 3px; }
  .content { padding: 20px 16px 110px; }
}
```

```css
/* web/src/styles/ui.css — controls, dialogs and feedback (variant B theme.css:67-85, style.css:97-135). */
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
button:disabled { opacity: .48; cursor: default; }
a { color: var(--accent); }
button:focus-visible, a:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
input, textarea, select { font: inherit; color: var(--text); background-color: #0b0c0f; border: 1px solid var(--line-strong); border-radius: var(--radius-small); padding: 8px 10px; }
textarea { resize: vertical; line-height: 1.6; }
input::placeholder, textarea::placeholder { color: var(--muted); }
.primary, .secondary { display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 44px; padding: 0 18px; border-radius: var(--radius); font-size: 15px; font-weight: 600; white-space: nowrap; }
.primary { border: 1px solid #eef1f6; background: linear-gradient(180deg, #e3e7ee, #c3cad6); color: #0d0f13; }
.secondary { border: 1px solid var(--line-strong); background: #15171c; color: var(--text); }
.quiet-button, .text-button { display: inline-flex; align-items: center; gap: 8px; min-height: 36px; padding: 4px 6px; border-radius: var(--radius-small); color: var(--text-dim); font-size: 14px; }
.text-button { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
.icon-button { display: inline-flex; align-items: center; justify-content: center; min-width: 36px; min-height: 36px; border-radius: var(--radius-small); color: var(--text-dim); }
.icon-button:hover, .quiet-button:hover { background: var(--surface-hover); }
.small { font-size: 13px; }
.dim { color: var(--text-dim); }
.muted { color: var(--muted); }
.eyebrow { margin: 0; font-family: var(--font-label); font-size: 11px; font-weight: 400; letter-spacing: 1.8px; text-transform: uppercase; color: var(--muted); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.page-heading { margin: 8px 0 24px; }
.page-heading h1 { margin: 0; color: var(--text); font: 400 36px/1.22 Inter, sans-serif; letter-spacing: -1.1px; overflow-wrap: anywhere; }
.page-heading p { margin: 8px 0 0; color: var(--muted); font-size: 16px; }
.heading-with-action { display: flex; align-items: center; justify-content: space-between; gap: 24px; max-width: 960px; }
details > summary { display: flex; align-items: center; gap: 8px; min-height: 36px; color: var(--text-dim); cursor: pointer; }
.field { display: block; margin: 14px 0; color: var(--text-dim); font-size: 14px; }
.field input, .field textarea, .field select { display: block; width: 100%; margin-top: 8px; }
.field-error { margin: 8px 0 0; color: #e6bfc5; font-size: 13px; }
.field-error:empty { display: none; }
.notice { margin: 12px 0; padding: 10px 14px; border: 1px solid var(--line-strong); border-radius: var(--radius-small); font-size: 14px; }
.notice.error { border-color: #6e4a52; background: #1f1517; color: #e6bfc5; }
.dialog { width: min(520px, calc(100% - 32px)); max-height: calc(100dvh - 40px); overflow: auto; padding: 26px 28px 22px; border: 1px solid var(--line-strong); border-radius: 12px; background: var(--surface-solid); color: var(--text); box-shadow: var(--highlight), var(--shadow-modal); }
.dialog::backdrop { background: #030304b3; }
.dialog-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
.dialog-heading h2 { margin: 0; font-size: 22px; font-weight: 400; letter-spacing: -.4px; overflow-wrap: anywhere; }
.dialog-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 12px; margin-top: 16px; }
.toast-layer { position: fixed; inset: 78px 34px auto auto; max-width: calc(100% - 32px); margin: 0; padding: 0; border: 0; background: transparent; overflow: visible; pointer-events: none; }
.toast { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--surface-solid); color: var(--text); font-size: 14px; box-shadow: var(--highlight), var(--shadow); pointer-events: auto; }
[role='alert'] > .toast { border-color: #6e4a52; background: #1f1517; color: #e6bfc5; }

@media (max-width: 649.98px) {
  .toast-layer { inset: 74px 16px auto 16px; }
  .page-heading h1 { font-size: 29px; letter-spacing: -.8px; }
  .heading-with-action { display: block; }
  .heading-with-action .primary { margin-top: 16px; }
  .dialog { padding: 22px 18px; }
  .shortcut-help { display: none; }
  /* Touch targets ≥ 44 × 44 px at phone widths (spec §4.7). */
  button, a, select, summary { min-width: 44px; min-height: 44px; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
```

- [ ] **Step 7: Run the unit suite and the E2E test to verify they pass**

Run: `npm --prefix web test && npm --prefix web run build && npm --prefix web run e2e -- e2e/boot.spec.ts e2e/shell.spec.ts e2e/outbox.spec.ts`
Expected: Vitest PASS; build PASS (typecheck, hashes); Playwright `21 passed` (boot 9, shell 6, and the 6 unchanged Phase-1 `outbox.spec.ts` tests, which now flush through the new boot order and show "Saved to …" through `ToastHost`).

- [ ] **Step 8: Commit**

```bash
git add web/src/routes/router.tsx web/src/shell/AppShell.tsx web/src/screens/Now.tsx web/src/screens/Plan.tsx web/src/screens/Capture.tsx web/src/screens/Notes.tsx web/src/screens/NoteView.tsx web/src/styles/shell.css web/src/styles/ui.css web/src/main.tsx web/e2e/boot.spec.ts web/e2e/shell.spec.ts
git commit -m "feat(web): boot the shell with routes, unlock and legacy hashes"
```

### Task 15: `PriorityControl` and `TaskRow` — compact rows, in-place priority, Review result

**Files:**
- Create: `web/src/components/PriorityControl.tsx` (in-place edit of `public/app.js:383, 496`)
- Create: `web/src/components/TaskRow.tsx` (`public/app.js:144-147`, `497-500`; handbook §14 compact rows)
- Create: `web/src/styles/screens.css` (Overview, Tasks and task-dialog rules; variant B `style.css:57-112, 202-216`, `theme.css:52-66, 87-100`)
- Modify: `web/src/main.tsx` (add `import './styles/screens.css';` after the `ui.css` import)
- Test: `web/src/components/TaskRow.test.tsx`

**Interfaces:**
- Consumes: `priorityLabel`, `taskMeta`, `needsReview`, `reviewLink` (Task 3); `Icon`, `toast`, `toastError` (Task 4); `openDialog` (Task 6); `usePatchTask` from `../state/queries`; `S.priorityUpdated`, `S.taskCompleted`, `S.taskReopened` from `../strings`.
- Produces (contract §6.3):
  ```ts
  export function PriorityControl(props: { task: SnapshotTask }): JSX.Element;   // closed select reads `${effective_priority} · ${priorityLabel(priority_source)}`; reason on hover/focus
  export function TaskRow(props: { task: SnapshotTask }): JSX.Element;           // complete/reopen, or "Review result" for review work
  ```

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/components/TaskRow.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRun, makeTask } from '../test/fixtures';

vi.mock('../state/queries', () => ({ usePatchTask: vi.fn() }));
vi.mock('../shell/dialogs', () => ({ openDialog: vi.fn() }));
vi.mock('../ui/Toast', () => ({ toast: vi.fn(), toastError: vi.fn() }));

import { openDialog } from '../shell/dialogs';
import { usePatchTask } from '../state/queries';
import { S } from '../strings';
import { toast, toastError } from '../ui/Toast';
import { PriorityControl } from './PriorityControl';
import { TaskRow } from './TaskRow';

const mutateAsync = vi.fn();
beforeEach(() => {
  mutateAsync.mockReset().mockResolvedValue({});
  vi.mocked(usePatchTask).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<typeof usePatchTask>);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('PriorityControl', () => {
  it.each([
    [{ priority: 'auto', effective_priority: 'medium', priority_source: 'automatic' }, 'medium · Auto · rules'],
    [{ priority: 'auto', effective_priority: 'high', priority_source: 'ai' }, 'high · Auto · AI'],
    [{ priority: 'high', effective_priority: 'high', priority_source: 'you' }, 'high · Set by you'],
    [{ priority: 'auto', effective_priority: 'low', priority_source: 'learned-v3' }, 'low · Auto'],
  ] as const)('shows the effective priority and its source label (%j)', (changes, label) => {
    render(<PriorityControl task={makeTask('t', { title: 'Read', ...changes })} />);
    const select = screen.getByRole('combobox', { name: 'Priority for Read' }) as HTMLSelectElement;
    expect(select.selectedOptions[0].textContent).toBe(label);
  });

  it('exposes the reason as the description shown on hover/focus', () => {
    render(<PriorityControl task={makeTask('t', { title: 'Read', priority_reason: 'This task is blocking another commitment.' })} />);
    expect(screen.getByRole('combobox', { name: 'Priority for Read' }).getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByRole('tooltip').textContent).toBe('This task is blocking another commitment.');
  });

  it('edits in place through the fresh-version patch and confirms', async () => {
    render(<PriorityControl task={makeTask('t', { title: 'Read' })} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Priority for Read' }), { target: { value: 'high' } });
    await waitFor(() => expect(toast).toHaveBeenCalledWith(S.priorityUpdated));
    expect(mutateAsync).toHaveBeenCalledWith({ id: 't', changes: { priority: 'high' } });
  });

  it('reports a failed change as an error and never retries', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('Task changed elsewhere'));
    render(<PriorityControl task={makeTask('t', { title: 'Read' })} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Priority for Read' }), { target: { value: 'low' } });
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledOnce();
  });
});

describe('TaskRow', () => {
  it('shows title, project and state in one compact row', () => {
    render(<TaskRow task={makeTask('t', { title: 'Read the chapter', project: 'Learning', status: 'todo' })} />);
    expect(screen.getByRole('button', { name: /^Read the chapter/ }).textContent).toContain('Learning · To do');
  });

  it('opens task detail from the title', () => {
    render(<TaskRow task={makeTask('t', { title: 'Read the chapter' })} />);
    fireEvent.click(screen.getByRole('button', { name: /^Read the chapter/ }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'task', id: 't' });
  });

  it('completes and reopens with the fresh-version patch', async () => {
    const { rerender } = render(<TaskRow task={makeTask('t', { title: 'Read' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Complete Read' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(S.taskCompleted));
    expect(mutateAsync).toHaveBeenCalledWith({ id: 't', changes: { status: 'done' } });
    rerender(<TaskRow task={makeTask('t', { title: 'Read', status: 'done' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reopen Read' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(S.taskReopened));
    expect(mutateAsync).toHaveBeenLastCalledWith({ id: 't', changes: { status: 'todo' } });
  });

  it('review work leads to the result link, not a checkbox', () => {
    const run = makeRun({ status: 'review', effective_status: 'review', stale: false, session_url: 'https://agent.test/result' });
    render(<TaskRow task={makeTask('t', { title: 'Review fix', runs: [run] })} />);
    const link = screen.getByRole('link', { name: 'Review result ↗' });
    expect(link.getAttribute('href')).toBe('https://agent.test/result');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.queryByRole('button', { name: 'Complete Review fix' })).toBeNull();
  });

  it('review work without a safe link opens the detail instead', () => {
    render(<TaskRow task={makeTask('t', { title: 'Review fix', status: 'review', session_url: 'javascript:alert(1)' })} />);
    expect(screen.queryByRole('link')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Review result' }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'task', id: 't' });
  });

  it('renders HTML in a title as text', () => {
    const { container } = render(<TaskRow task={makeTask('t', { title: '<img src=x onerror=alert(1)>' })} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/components/TaskRow.test.tsx`
Expected: FAIL with `Error: Failed to resolve import "./PriorityControl" from "src/components/TaskRow.test.tsx". Does the file exist?`

- [ ] **Step 3: Write the minimal implementation**

```tsx
// web/src/components/PriorityControl.tsx
import { useId, type JSX } from 'react';
import type { Priority, SnapshotTask } from '../api/schemas';
import { priorityLabel } from '../domain/tasks';
import { usePatchTask } from '../state/queries';
import { S } from '../strings';
import { toast, toastError } from '../ui/Toast';

const MANUAL = ['high', 'medium', 'low'] as const;

export function PriorityControl({ task }: { task: SnapshotTask }): JSX.Element {
  const patch = usePatchTask();
  const reasonId = useId();
  // The selected option always reads "effective · source", so the closed control shows both (spec §4.7).
  const current = `${task.effective_priority} · ${priorityLabel(task.priority_source)}`;

  async function change(priority: Priority) {
    try {
      await patch.mutateAsync({ id: task.id, changes: { priority } });
      toast(S.priorityUpdated);
    } catch (error) {
      toastError(error);
    }
  }

  return (
    <span className={`priority-control priority-${task.effective_priority}`}>
      <select aria-label={`Priority for ${task.title}`} aria-describedby={reasonId} value={task.priority}
        disabled={patch.isPending} onChange={event => void change(event.target.value as Priority)}>
        <option value="auto">{task.priority === 'auto' ? current : 'Automatic'}</option>
        {MANUAL.map(p => <option key={p} value={p}>{task.priority === p ? current : `${p} · Set by you`}</option>)}
      </select>
      <span id={reasonId} role="tooltip" className="priority-reason">{task.priority_reason}</span>
    </span>
  );
}
```

```tsx
// web/src/components/TaskRow.tsx
import type { JSX } from 'react';
import type { SnapshotTask } from '../api/schemas';
import { needsReview, reviewLink, taskMeta } from '../domain/tasks';
import { openDialog } from '../shell/dialogs';
import { usePatchTask } from '../state/queries';
import { S } from '../strings';
import { Icon } from '../ui/Icon';
import { toast, toastError } from '../ui/Toast';
import { PriorityControl } from './PriorityControl';

export function TaskRow({ task }: { task: SnapshotTask }): JSX.Element {
  const patch = usePatchTask();
  const done = task.status === 'done';
  const review = needsReview(task);
  const link = review ? reviewLink(task) : null;
  const open = () => openDialog({ kind: 'task', id: task.id });

  async function toggle() {
    try {
      await patch.mutateAsync({ id: task.id, changes: { status: done ? 'todo' : 'done' } });
      toast(done ? S.taskReopened : S.taskCompleted);
    } catch (error) {
      toastError(error);
    }
  }

  let lead: JSX.Element;
  if (review && link) lead = <a className="review-link text-button" href={link} target="_blank" rel="noopener noreferrer">Review result ↗</a>;
  else if (review) lead = <button type="button" className="review-link text-button" onClick={open}>Review result</button>;
  else lead = (
    <button type="button" className={done ? 'task-check done' : 'task-check'} aria-label={`${done ? 'Reopen' : 'Complete'} ${task.title}`}
      disabled={patch.isPending} onClick={() => void toggle()}>{done && <Icon name="check" size={13} />}</button>
  );

  return (
    <div className="task-row" data-task={task.id}>
      {lead}
      <button type="button" className="task-title" onClick={open}>
        <span>{task.title}</span>
        <small>{taskMeta(task)}</small>
      </button>
      <PriorityControl task={task} />
    </div>
  );
}
```

```css
/* web/src/styles/screens.css — Overview, Tasks and task dialogs. Compact rows, no oversized cards (handbook §10, §14). */
.now-page, .plan-page { max-width: var(--reading); }
.focus-line { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; padding: 12px 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.focus-line .task-title { flex: 0 1 auto; font-size: 16px; }
.focus-kind { color: var(--text-dim); font-size: 13px; }
.focus-line .quiet-button { margin-left: auto; }
.recommendation { margin-top: 12px; padding: 16px 20px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.section-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.recommendation h2 { margin: 10px 0 4px; font-size: 21px; font-weight: 400; overflow-wrap: anywhere; }
.recommendation p { margin: 0; color: var(--text-dim); }
.empty h2 { margin: 8px 0 4px; font-size: 19px; font-weight: 400; }
.inline-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin-top: 14px; }
.needs-you { display: grid; gap: 2px; margin-top: 16px; }
.attention-row { display: grid; gap: 2px; min-height: 44px; padding: 8px 0; border-bottom: 1px solid var(--line); text-align: left; }
.attention-row > span { overflow-wrap: anywhere; }
.attention-row small { color: var(--text-dim); }
.alternatives, .waiting-work, .agent-status { margin-top: 12px; }
.count { display: inline-grid; place-items: center; min-width: 22px; height: 22px; border-radius: 7px; background: var(--surface-active); font-size: 12px; }
.run-row { padding: 8px 0; border-top: 1px solid var(--line); }
.add-later { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; margin-top: 18px; color: var(--text-dim); font-size: 14px; }
.filter-bar { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 16px; }
.filter-chip { min-height: 36px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 999px; color: var(--text-dim); font-size: 13px; }
.filter-chip[aria-pressed='true'] { border-color: var(--accent); background: var(--surface-active); color: var(--text); }
.plan-list { border-top: 1px solid var(--line); }
.plan-header { display: flex; justify-content: space-between; padding: 12px 8px; color: var(--muted); font-family: var(--font-label); font-size: 11px; letter-spacing: 2px; text-transform: uppercase; }
.task-row { display: flex; align-items: center; gap: 14px; padding: 10px 8px; border-top: 1px solid var(--line); }
.task-row:hover { background: var(--surface-hover); }
.task-check { display: grid; place-items: center; flex-shrink: 0; width: 36px; height: 36px; color: var(--accent); }
.task-check::before { content: ''; grid-area: 1 / 1; width: 18px; height: 18px; border: 1px solid #8d94a1; border-radius: 50%; }
.task-check svg { grid-area: 1 / 1; }
.task-check.done::before { border-color: var(--accent); background: #2a2e36; }
.task-title { display: grid; flex: 1; gap: 3px; min-width: 0; color: var(--text); font-size: 14px; text-align: left; }
.task-title > span { overflow-wrap: anywhere; }
.task-title small { color: var(--text-dim); font-size: 12px; overflow-wrap: anywhere; }
.review-link { flex-shrink: 0; font-size: 13px; }
.priority-control { position: relative; display: inline-flex; align-items: center; flex-shrink: 0; gap: 8px; }
.priority-control::before { content: ''; width: 9px; height: 9px; border-radius: 50%; }
.priority-high::before { background: #c98a91; }
.priority-medium::before { background: #c2b08c; }
.priority-low::before { background: #9eaac0; }
.priority-control select { max-width: 200px; font-size: 13px; }
.priority-reason { display: none; position: absolute; top: calc(100% + 6px); right: 0; z-index: 4; width: 240px; padding: 8px 10px; border: 1px solid var(--line-strong); border-radius: var(--radius-small); background: var(--surface-solid); color: var(--text); font-size: 12px; }
.priority-control:hover .priority-reason, .priority-control:focus-within .priority-reason { display: block; }
.task-input-label { display: block; margin-bottom: 8px; color: var(--text-dim); font-size: 16px; }
#task-input { display: block; width: 100%; min-height: 120px; font-size: 17px; }
#task-details { margin-top: 18px; }
.subheading { margin: 20px 0 6px; color: var(--muted); font-family: var(--font-label); font-size: 11px; font-weight: 400; letter-spacing: 1.8px; text-transform: uppercase; }
.original-block { margin: 8px 0; padding: 12px; border: 1px solid var(--line); border-radius: var(--radius-small); background: #08090b; font-size: 13px; white-space: pre-wrap; overflow-wrap: anywhere; }
.run-detail, .token-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 0; border-top: 1px solid var(--line); }
.pill { padding: 2px 10px; border: 1px solid var(--line-strong); border-radius: 999px; color: var(--text-dim); font-size: 12px; }
.token-value { display: block; margin: 6px 0; overflow-wrap: anywhere; }

@media (max-width: 649.98px) {
  .task-row { flex-wrap: wrap; gap: 8px; padding: 8px 2px; }
  .task-check { width: 44px; height: 44px; }
  .task-title { flex-basis: calc(100% - 60px); }
  .priority-control { margin-left: 52px; }
  .priority-control select { max-width: 100%; }
  .focus-line .quiet-button { margin-left: 0; }
}
```

```tsx
// web/src/main.tsx — add after the ui.css import
import './styles/screens.css';
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- src/components/TaskRow.test.tsx && npm --prefix web run build`
Expected: PASS (13 tests); build PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/PriorityControl.tsx web/src/components/TaskRow.tsx web/src/components/TaskRow.test.tsx web/src/styles/screens.css web/src/main.tsx
git commit -m "feat(web): add compact task rows with in-place priority and review links"
```

### Task 16: `TaskFields` — the shared Details fields of Add task and Edit task

**Files:**
- Create: `web/src/components/TaskFields.tsx` (labels and conversions from `public/app.js:304, 313-320`)
- Test: `web/src/components/TaskFields.test.tsx`

**Interfaces:**
- Consumes: `fromLocal`, `localDateInput` from `../domain/format`; `STATUS_LABEL` (Task 3); `Priority`, `SnapshotTask`, `TaskEditable`, `TaskStatus` from `../api/schemas`.
- Produces (*new*):
  ```ts
  export type TaskFieldChange = <K extends keyof TaskEditable>(name: K, value: TaskEditable[K]) => void;
  export function TaskFields(props: { value: Partial<TaskEditable>; onChange: TaskFieldChange; disabled: boolean; tasks: SnapshotTask[]; selfId: string | null }): JSX.Element;
  ```
  Title is not part of it: Add task shows "Title override · optional", Edit shows "Title" (`app.js:323`). Values are controlled, so a field the user never touches keeps its stored value exactly.

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/components/TaskFields.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromLocal } from '../domain/format';
import { makeTask } from '../test/fixtures';
import { TaskFields } from './TaskFields';

afterEach(cleanup);

const tasks = [
  makeTask('self', { title: 'This task', project: 'Research' }),
  makeTask('a', { title: 'Fixture prerequisite', project: 'Research' }),
  makeTask('b', { title: 'Other work', project: 'Applications' }),
];

function renderFields(value = {}, disabled = false) {
  const onChange = vi.fn();
  render(<TaskFields value={value} onChange={onChange} disabled={disabled} tasks={tasks} selfId="self" />);
  return onChange;
}

describe('TaskFields', () => {
  it('shows every optional field with the existing labels and defaults', () => {
    renderFields();
    for (const label of ['Workflow · optional', 'Priority', 'Continue here', 'Status', 'Estimated minutes · optional',
      'Planned day · optional', 'Deadline · optional', 'Available after · optional', 'Context', 'Session or document link · optional']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect((screen.getByLabelText('Priority') as HTMLSelectElement).value).toBe('auto');
    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('todo');
    expect((screen.getByLabelText('Workflow · optional') as HTMLInputElement).placeholder).toBe('Unassigned');
  });

  it('labels manual priority choices as set by me (app.js:304)', () => {
    renderFields();
    const options = [...(screen.getByLabelText('Priority') as HTMLSelectElement).options].map(o => o.textContent);
    expect(options).toEqual(['Automatic', 'High · set by me', 'Medium · set by me', 'Low · set by me']);
  });

  it('converts values like the old form (app.js:313-320)', () => {
    const onChange = renderFields();
    fireEvent.change(screen.getByLabelText('Workflow · optional'), { target: { value: 'Research' } });
    fireEvent.change(screen.getByLabelText('Estimated minutes · optional'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Planned day · optional'), { target: { value: '2026-11-18' } });
    fireEvent.change(screen.getByLabelText('Deadline · optional'), { target: { value: '2026-11-20T10:30' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'parked' } });
    fireEvent.change(screen.getByLabelText('Session or document link · optional'), { target: { value: 'https://example.test/s' } });
    expect(onChange.mock.calls).toEqual([
      ['project', 'Research'], ['estimate_minutes', 25], ['planned_on', '2026-11-18'],
      ['due_at', fromLocal('2026-11-20T10:30')], ['status', 'parked'], ['session_url', 'https://example.test/s'],
    ]);
  });

  it('turns cleared optional values into null', () => {
    const onChange = renderFields({ estimate_minutes: 25, planned_on: '2026-11-18', not_before: '2026-10-01T11:23:45+00:00' });
    fireEvent.change(screen.getByLabelText('Estimated minutes · optional'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Planned day · optional'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Available after · optional'), { target: { value: '' } });
    expect(onChange.mock.calls).toEqual([['estimate_minutes', null], ['planned_on', null], ['not_before', null]]);
  });

  it('lists dependencies without the task itself and returns every selected id', () => {
    const onChange = renderFields();
    const select = screen.getByLabelText(/^Dependencies/) as HTMLSelectElement;
    expect([...select.options].map(o => o.textContent)).toEqual(['Fixture prerequisite', 'Other work']);
    select.options[0].selected = true;
    select.options[1].selected = true;
    fireEvent.change(select);
    expect(onChange).toHaveBeenCalledWith('dependencies', ['a', 'b']);
  });

  it('suggests each existing workflow once', () => {
    const { container } = render(<TaskFields value={{}} onChange={vi.fn()} disabled={false} tasks={tasks} selfId={null} />);
    expect([...container.querySelectorAll('datalist option')].map(o => o.getAttribute('value'))).toEqual(['Research', 'Applications']);
  });

  it('freezes every control while disabled', () => {
    renderFields({}, true);
    for (const control of document.querySelectorAll('input, select, textarea')) expect((control as HTMLInputElement).disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/components/TaskFields.test.tsx`
Expected: FAIL with `Error: Failed to resolve import "./TaskFields" from "src/components/TaskFields.test.tsx". Does the file exist?`

- [ ] **Step 3: Write the minimal implementation**

```tsx
// web/src/components/TaskFields.tsx
import { useId, type JSX } from 'react';
import type { Priority, SnapshotTask, TaskEditable, TaskStatus } from '../api/schemas';
import { fromLocal, localDateInput } from '../domain/format';
import { STATUS_LABEL } from '../domain/tasks';

export type TaskFieldChange = <K extends keyof TaskEditable>(name: K, value: TaskEditable[K]) => void;

const PRIORITY_OPTIONS: [Priority, string][] = [
  ['auto', 'Automatic'], ['high', 'High · set by me'], ['medium', 'Medium · set by me'], ['low', 'Low · set by me'],
];
const STATUSES: TaskStatus[] = ['todo', 'active', 'waiting', 'blocked', 'review', 'parked', 'done'];

export function TaskFields({ value, onChange, disabled, tasks, selfId }: {
  value: Partial<TaskEditable>; onChange: TaskFieldChange; disabled: boolean; tasks: SnapshotTask[]; selfId: string | null;
}): JSX.Element {
  const projectsId = useId();
  const projects = [...new Set(tasks.map(t => t.project))];
  return (
    <div className="form-grid">
      <label className="field">Workflow · optional
        <input name="project" maxLength={80} list={projectsId} placeholder="Unassigned" value={value.project ?? ''} disabled={disabled}
          onChange={e => onChange('project', e.target.value)} />
      </label>
      <datalist id={projectsId}>{projects.map(p => <option key={p} value={p} />)}</datalist>
      <label className="field">Priority
        <select name="priority" value={value.priority ?? 'auto'} disabled={disabled} onChange={e => onChange('priority', e.target.value as Priority)}>
          {PRIORITY_OPTIONS.map(([p, label]) => <option key={p} value={p}>{label}</option>)}
        </select>
      </label>
      <label className="field">Continue here
        <textarea name="next_action" maxLength={1000} value={value.next_action ?? ''} disabled={disabled} onChange={e => onChange('next_action', e.target.value)} />
      </label>
      <label className="field">Status
        <select name="status" value={value.status ?? 'todo'} disabled={disabled} onChange={e => onChange('status', e.target.value as TaskStatus)}>
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </label>
      <label className="field">Estimated minutes · optional
        <input type="number" name="estimate_minutes" min={1} max={1440} value={value.estimate_minutes ?? ''} disabled={disabled}
          onChange={e => onChange('estimate_minutes', e.target.value ? Number(e.target.value) : null)} />
      </label>
      <label className="field">Planned day · optional
        <input type="date" name="planned_on" value={value.planned_on ?? ''} disabled={disabled} onChange={e => onChange('planned_on', e.target.value || null)} />
      </label>
      <label className="field">Deadline · optional
        <input type="datetime-local" name="due_at" value={localDateInput(value.due_at ?? null)} disabled={disabled}
          onChange={e => onChange('due_at', fromLocal(e.target.value))} />
      </label>
      <label className="field">Available after · optional
        <input type="datetime-local" name="not_before" value={localDateInput(value.not_before ?? null)} disabled={disabled}
          onChange={e => onChange('not_before', fromLocal(e.target.value))} />
      </label>
      <label className="field">Dependencies <span className="muted">Select zero or more. Use Ctrl / Cmd for multiple.</span>
        <select name="dependencies" multiple size={3} value={value.dependencies ?? []} disabled={disabled}
          onChange={e => onChange('dependencies', Array.from(e.target.selectedOptions, option => option.value))}>
          {tasks.filter(t => t.id !== selfId).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      </label>
      <label className="field">Context
        <textarea name="detail" maxLength={16000} value={value.detail ?? ''} disabled={disabled} onChange={e => onChange('detail', e.target.value)} />
      </label>
      <label className="field">Session or document link · optional
        <input type="url" name="session_url" placeholder="https://…" value={value.session_url ?? ''} disabled={disabled}
          onChange={e => onChange('session_url', e.target.value)} />
      </label>
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- src/components/TaskFields.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/TaskFields.tsx web/src/components/TaskFields.test.tsx
git commit -m "feat(web): add shared task detail fields with explicit conversions"
```

### Task 17: Overview (`NowScreen`) — progressive disclosure

**Files:**
- Modify: `web/src/screens/Now.tsx` (replace the Task 14 stub; port of `public/app.js:185-210` with the handbook §10 Overview order)
- Create: `web/e2e/db.ts` (test-only SQLite edits of the disposable data dir, like `qa/now_ui_check.py:96-99`)
- Create: `web/e2e/nowSeed.ts` (test-only Overview seeds, port of `qa/now_ui_check.py:64-99`; reused by `plan.spec.ts` and later tasks)
- Test: `web/src/screens/Now.test.tsx`, `web/e2e/now.spec.ts`, `web/e2e/offline.spec.ts`

**Interfaces:**
- Consumes: `greeting`, `COPY` (Task 1); `nowState`, `focusKind` (Task 2); `RUN_LABEL`, `waitingReason` (Task 3); `Icon`, `toastError` (Task 4); `openDialog` (Task 6); `confirmFocusChange` (Task 11); `OfflineNotice`, `PageHeading` (Task 12); `TaskRow` (Task 15); `useSnapshot`, `useTimeBudget`, `useSetFocus` from `../state/queries`; `useConnected`; `age` from `../domain/format`; `S.lastKnown`; `useNavigate`.
- Produces: `export function NowScreen(): JSX.Element;` and, for tests only (new, local to `web/e2e/`):
  ```ts
  export function runSql(dataDir: string, statement: string, params?: (string | number)[]): void;                    // e2e/db.ts
  export type SeedTask = { id: string; title: string; status: string; priority: string; version: number };           // e2e/nowSeed.ts
  export type SeedState = { tasks: SeedTask[]; notes: unknown[]; reminders: { id: string; state: string }[]; focus: { task_id: string; pinned: boolean } | null; runs: { id: string; status: string }[] };
  export const KINDS: readonly ['new', 'available', 'waiting', 'attention', 'complete', 'unknown', 'disconnected']; export type Kind;
  export function task(noema: NoemaServer, title: string, fields?: Record<string, unknown>): Promise<SeedTask>;
  export function serverState(noema: NoemaServer): Promise<SeedState>;
  export function agentRun(noema: NoemaServer, t: SeedTask, event?: 'completed' | 'needs_input', session_url?: string): Promise<{ id: string }>;
  export function ageRun(noema: NoemaServer, runId: string): void;
  export function note(noema: NoemaServer, raw: string): Promise<{ id: string }>;
  export function seed(noema: NoemaServer, kind: Kind): Promise<void>;
  export function nowPage(page: Page): Locator; export function ready(page: Page, mode: string): Promise<void>;
  export function openKind(page: Page, context: BrowserContext, noema: NoemaServer, kind: Kind): Promise<void>;
  export function noHorizontalOverflow(page: Page): Promise<boolean>;
  ```
  Layout order (spec §4.7): greeting + tagline → focus line with provenance → one primary recommendation with a plain reason and Start/Resume → Needs you → Agent reports (compact running summary, collapsed unless status is unknown or disconnected) → Waiting work (collapsed). Alternatives sit collapsed inside the recommendation. Action labels: `Check agent status` (unknown), `Open for review` (attention), `Resume` (the focus), `View next action` (another task while a pin exists — never replaces the pin), `Start` (pins the recommendation; only when nothing is pinned).

- [ ] **Step 1: Write the failing unit test**

```tsx
// web/src/screens/Now.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Focus, Snapshot } from '../api/schemas';
import { makeRun, makeSnapshot, makeTask } from '../test/fixtures';

const h = vi.hoisted(() => ({ navigate: vi.fn(), setFocus: vi.fn(), setBudget: vi.fn(), refetch: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => h.navigate }));
vi.mock('../state/queries', () => ({ useSnapshot: vi.fn(), useTimeBudget: vi.fn(), useSetFocus: vi.fn(), usePatchTask: vi.fn() }));
vi.mock('../domain/connection', () => ({ useConnected: vi.fn() }));
vi.mock('../local/drafts', () => ({ useCaptureDraft: () => ({ saveState: 'saved' }) }));
vi.mock('../shell/dialogs', () => ({ openDialog: vi.fn() }));
vi.mock('../ui/Toast', () => ({ toast: vi.fn(), toastError: vi.fn() }));

import { useConnected } from '../domain/connection';
import { openDialog } from '../shell/dialogs';
import { usePatchTask, useSetFocus, useSnapshot, useTimeBudget } from '../state/queries';
import { NowScreen } from './Now';

const focus = (task_id: string, pinned: boolean, source = 'manual'): NonNullable<Focus> => ({ task_id, pinned, source, updated_at: '2026-10-08T11:00:00+00:00' });

function given(snapshot: Snapshot, { connected = true, budget = null as number | null } = {}) {
  vi.mocked(useSnapshot).mockReturnValue({ data: snapshot, refetch: h.refetch } as unknown as ReturnType<typeof useSnapshot>);
  vi.mocked(useConnected).mockReturnValue(connected);
  vi.mocked(useTimeBudget).mockReturnValue([budget, h.setBudget]);
  vi.mocked(useSetFocus).mockReturnValue({ mutateAsync: h.setFocus } as unknown as ReturnType<typeof useSetFocus>);
  vi.mocked(usePatchTask).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<typeof usePatchTask>);
  render(<NowScreen />);
}
const mode = () => document.querySelector('.now-page')!.getAttribute('data-now-state');

beforeEach(() => h.setFocus.mockResolvedValue(null));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });

describe('NowScreen', () => {
  it('greets with the display name and keeps the tagline', () => {
    given(makeSnapshot({ settings: { ...makeSnapshot().settings, display_name: 'Vishal' } }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good (morning|afternoon|evening), Vishal\.$/);
    expect(screen.getByText('Same chaos. A calmer you.')).toBeTruthy();
  });

  it('a new workspace offers Capture and Add task, and no agent setup', () => {
    given(makeSnapshot());
    expect(mode()).toBe('new');
    expect(screen.getByRole('heading', { name: 'Nothing tracked yet' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Capture a thought' }));
    expect(h.navigate).toHaveBeenCalledWith({ to: '/capture' });
    fireEvent.click(screen.getByRole('button', { name: 'Add a task' }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'task-capture' });
    expect(screen.queryByRole('button', { name: 'Set up agent reporting' })).toBeNull();
  });

  it('"Nothing actionable right now" is a valid result', () => {
    given(makeSnapshot({ tasks: [makeTask('p', { status: 'parked' })] }));
    expect(screen.getByRole('heading', { name: 'Nothing actionable right now' })).toBeTruthy();
  });

  it('one primary recommendation with a plain reason; Start pins it; alternatives stay collapsed', async () => {
    const a = makeTask('a', { title: 'Continue the two-pointer exercise', next_action: 'Check duplicate values.' });
    const b = makeTask('b', { title: 'Read the ownership chapter' });
    given(makeSnapshot({ tasks: [a, b], available: [a, b] }));
    expect(mode()).toBe('available');
    const recommendation = screen.getByRole('region', { name: 'Next action' });
    expect(recommendation.querySelectorAll('h2')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: a.title })).toBeTruthy();
    expect(screen.getByText('Check duplicate values.')).toBeTruthy();
    expect(screen.queryByText(/your estimate/)).toBeNull();
    const alternatives = recommendation.querySelector('details')!;
    expect(alternatives.open).toBe(false);
    expect(alternatives.querySelector('summary')!.textContent).toBe('1 other actionable task');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(h.setFocus).toHaveBeenCalledWith({ taskId: 'a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'task', id: 'a' });
  });

  it('shows an estimate only when one was saved', () => {
    const a = makeTask('a', { estimate_minutes: 25 });
    given(makeSnapshot({ tasks: [a], available: [a] }));
    expect(screen.getByText('25 min · your estimate')).toBeTruthy();
  });

  it('a pin is never replaced from Overview; clearing it asks first', async () => {
    const pin = makeTask('pin', { title: 'Study allocator cleanup', project: 'Research' });
    const other = makeTask('other', { title: 'Other work' });
    given(makeSnapshot({ tasks: [pin, other], available: [other], focus: focus('pin', true) }));
    expect(screen.getByText('Pinned by you · Research').getAttribute('data-focus-kind')).toBe('pinned');
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'View next action' }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'task', id: 'other' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: 'Unpin & clear' }));
    expect(h.setFocus).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Unpin & clear' }));
    await waitFor(() => expect(h.setFocus).toHaveBeenCalledWith({ taskId: null }));
    expect(confirm).toHaveBeenCalledWith('Unpin and clear your current focus?');
  });

  it('labels inferred and selected focus differently; Resume continues the focus', () => {
    const t = makeTask('t', { title: 'Inferred', project: '' });
    given(makeSnapshot({ tasks: [t], focus: focus('t', false, 'context') }));
    expect(screen.getByText('Inferred from window metadata').getAttribute('data-focus-kind')).toBe('inferred');
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'task', id: 't' });
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(h.setFocus).toHaveBeenCalledWith({ taskId: null });
  });

  it('attention outranks available work and the rest appear once under Needs you', () => {
    const q = makeTask('q', { title: 'Answer the question', attention_reason: 'An agent needs your input.' });
    const r = makeTask('r', { title: 'Review the result', attention_reason: 'A result is ready for your review.' });
    const a = makeTask('a', { title: 'Available work' });
    given(makeSnapshot({ tasks: [q, r, a], attention: [q, r], available: [a] }));
    expect(mode()).toBe('attention');
    expect(screen.getByText('Needs you · 2')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open for review' })).toBeTruthy();
    const needsYou = screen.getByRole('region', { name: 'Needs you' });
    expect(needsYou.textContent).toContain('Review the result');
    expect(needsYou.textContent).toContain('A result is ready for your review.');
    expect(needsYou.textContent).not.toContain('Answer the question');
    expect(screen.getByRole('region', { name: 'Next action' }).querySelector('details summary')!.textContent).toBe('1 other actionable task');
  });

  it('disconnected: last-known provenance, no time filter, Retry connection, integration unavailable', () => {
    const t = makeTask('t', { title: 'Cached', project: 'Research' });
    given(makeSnapshot({ tasks: [t], available: [t], focus: focus('t', false) }), { connected: false });
    expect(mode()).toBe('disconnected');
    expect(screen.getByText('Last known · Selected by you · Research')).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Available time' })).toBeNull();
    expect(screen.queryByText(/other actionable task/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
    expect(h.refetch).toHaveBeenCalled();
    const reports = document.querySelector('details.agent-status') as HTMLDetailsElement;
    expect(reports.open).toBe(true);
    expect(document.querySelector('#integration-status')!.textContent).toContain('server disconnected');
  });

  it('the time filter uses only saved estimates', () => {
    const t = makeTask('t');
    given(makeSnapshot({ tasks: [t], available: [t] }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Available time' }), { target: { value: '15' } });
    expect(h.setBudget).toHaveBeenCalledWith(15);
    fireEvent.change(screen.getByRole('combobox', { name: 'Available time' }), { target: { value: '' } });
    expect(h.setBudget).toHaveBeenLastCalledWith(null);
  });

  it('waiting work explains why, and agent reports never claim running for a stale run', () => {
    const dep = makeTask('dep', { title: 'Trace ownership', status: 'waiting' });
    const blocked = makeTask('blocked', { title: 'Test the revised cleanup', blocked_by: ['dep'] });
    const stale = makeRun({ task_id: 'dep', agent: 'Fixture command wrapper', status: 'working', effective_status: 'unknown', stale: true });
    given(makeSnapshot({ tasks: [dep, blocked], runs: [stale] }));
    expect(document.querySelector('details.waiting-work')!.textContent).toContain('Waiting on: Trace ownership');
    const reports = document.querySelector('details.agent-status')!;
    expect(reports.textContent).toContain('Fixture command wrapper · Status unknown');
    expect(reports.textContent).not.toContain('Reported running');
  });

  it('agent setup opens the agents section of Settings', () => {
    const t = makeTask('t');
    given(makeSnapshot({ tasks: [t], available: [t] }));
    fireEvent.click(screen.getByRole('button', { name: 'Set up agent reporting' }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'settings', section: 'agents' });
  });
});
```

- [ ] **Step 2: Write the failing E2E tests (parity rows of `qa/now_ui_check.py`, `experiments/ui-ab/scripts/verify.py`, `qa/browser_check.py:109`, `qa/native_storage_check.py:267`; handbook trace R2, R7, R8, U8)**

Seeds are ported from `qa/now_ui_check.py:64-99`. The computed labels `kind + ' uses real server state'`, `kind + ' preserves the four navigation destinations'` and `kind + ' / ' + label + ' has no horizontal overflow'` become parametrized tests (parity-map rule). The navigation destinations are now Overview/Capture/Notes/Tasks (spec §4.7 labels).

```ts
// web/e2e/db.ts
// Test-only: edits the disposable server's SQLite file, like qa/now_ui_check.py:96-99. Never production data.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../', import.meta.url));

export function runSql(dataDir: string, statement: string, params: (string | number)[] = []): void {
  execFileSync(join(REPO, '.venv/bin/python'), [
    '-c', 'import sqlite3, sys\nc = sqlite3.connect(sys.argv[1])\nc.execute(sys.argv[2], sys.argv[3:])\nc.commit()',
    join(dataDir, 'noema.sqlite3'), statement, ...params.map(String),
  ]);
}
```

```ts
// web/e2e/nowSeed.ts
// Test-only seeds for Overview states (port of qa/now_ui_check.py:64-99).
import { randomUUID } from 'node:crypto';
import type { BrowserContext, Page } from '@playwright/test';
import { runSql } from './db';
import { expect, gotoApp } from './fixtures';
import { E2E_TOKEN, type NoemaServer } from './server';

export type SeedTask = { id: string; title: string; status: string; priority: string; version: number };
export type SeedState = {
  tasks: SeedTask[]; notes: unknown[]; reminders: { id: string; state: string }[];
  focus: { task_id: string; pinned: boolean } | null; runs: { id: string; status: string }[];
};
export const KINDS = ['new', 'available', 'waiting', 'attention', 'complete', 'unknown', 'disconnected'] as const;
export type Kind = (typeof KINDS)[number];

export const task = (noema: NoemaServer, title: string, fields: Record<string, unknown> = {}) => noema.api<SeedTask>('POST', '/api/tasks', { title, ...fields });
export const serverState = (noema: NoemaServer) => noema.api<SeedState>('GET', '/api/state');

export async function agentRun(noema: NoemaServer, t: SeedTask, event?: 'completed' | 'needs_input', session_url = '') {
  const run = await noema.api<{ id: string }>('POST', '/api/runs', { task_id: t.id, agent: 'Fixture command wrapper', session_url });
  if (event) await noema.api('POST', `/api/runs/${run.id}/events`, { event_id: randomUUID(), seq: 1, kind: event, message: 'A fixture result or question, not actual user activity.' });
  return run;
}

export function ageRun(noema: NoemaServer, runId: string): void {
  runSql(noema.dataDir, 'UPDATE runs SET updated_at=? WHERE id=?', [new Date(Date.now() - 5 * 60_000).toISOString(), runId]);
}

export async function note(noema: NoemaServer, raw: string): Promise<{ id: string }> {
  const form = new FormData();
  form.set('payload', JSON.stringify({ capture_id: randomUUID(), raw }));
  const response = await fetch(noema.origin + '/api/captures', { method: 'POST', body: form, headers: { Authorization: 'Bearer ' + E2E_TOKEN, 'X-Noema-Request': '1' } });
  if (!response.ok) throw new Error(`POST /api/captures → ${response.status}`);
  return response.json() as Promise<{ id: string }>;
}

export async function seed(noema: NoemaServer, kind: Kind): Promise<void> {
  if (kind === 'available' || kind === 'disconnected') {
    const chosen = await task(noema, 'Study allocator cleanup', { priority: 'low', next_action: 'Read your original lifetime notes.' });
    await task(noema, 'Continue the two-pointer exercise', { priority: 'high', next_action: 'Check how duplicate values affect the pointer movement.' });
    await task(noema, 'Read the ownership chapter', { priority: 'medium' });
    await noema.api('POST', '/api/focus', { task_id: chosen.id, pinned: false });
  } else if (kind === 'waiting') {
    const traced = await task(noema, 'Trace ownership in the cleanup path', { status: 'waiting' });
    await agentRun(noema, traced);
    await task(noema, 'Test the revised cleanup', { status: 'blocked', dependencies: [traced.id] });
  } else if (kind === 'attention') {
    await agentRun(noema, await task(noema, 'Review the cleanup result', { priority: 'high' }), 'completed');
    await agentRun(noema, await task(noema, 'Answer the boundary-condition question', { priority: 'medium' }), 'needs_input');
  } else if (kind === 'complete') {
    await task(noema, 'Check duplicate handling', { status: 'done' });
    await task(noema, 'Review the allocator result', { status: 'done' });
  } else if (kind === 'unknown') {
    const run = await agentRun(noema, await task(noema, 'Check the missing agent report', { status: 'waiting' }));
    ageRun(noema, run.id);
  }
}

export const nowPage = (page: Page) => page.locator('.now-page');
export const ready = (page: Page, mode: string) => expect(nowPage(page)).toHaveAttribute('data-now-state', mode);

/** Seeds, opens Overview connected, and for 'disconnected' then drops the network (qa/now_ui_check.py:124-136). */
export async function openKind(page: Page, context: BrowserContext, noema: NoemaServer, kind: Kind): Promise<void> {
  await seed(noema, kind);
  await gotoApp(page, noema);
  await ready(page, kind === 'disconnected' ? 'available' : kind);
  if (kind === 'disconnected') {
    await context.setOffline(true);
    await ready(page, 'disconnected');
  }
}

export const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
```

```ts
// web/e2e/now.spec.ts
import { expect, gotoApp, test } from './fixtures';
import { KINDS, ageRun, agentRun, noHorizontalOverflow, note, nowPage, openKind, ready, seed, serverState, task } from './nowSeed';

test.use({ viewport: { width: 1440, height: 960 } });

const VIEWPORTS = [['desktop', { width: 1440, height: 960 }], ['mobile', { width: 390, height: 844 }]] as const;
const recommendation = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Next action' });

for (const kind of KINDS) {
  test(`${kind} uses real server state`, async ({ page, context, noema }) => {
    await openKind(page, context, noema, kind);
    const state = await serverState(noema);
    if (kind === 'new') {
      expect(state.tasks).toHaveLength(0);
    } else if (kind === 'complete') {
      expect(state.tasks.every(t => t.status === 'done')).toBe(true);
      await expect(recommendation(page)).toContainText('All tracked work is complete');
    } else {
      // The page names tasks that exist on the server (collapsed sections included), never fixtures.
      const rendered = (await nowPage(page).textContent()) ?? '';
      expect(state.tasks.some(t => rendered.includes(t.title))).toBe(true);
    }
  });

  test(`${kind} preserves the four navigation destinations`, async ({ page, context, noema }) => {
    await openKind(page, context, noema, kind);
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link')).toHaveText(['Overview', 'Capture', 'Notes', 'Tasks']);
  });

  for (const [label, size] of VIEWPORTS) {
    test(`${kind} / ${label} has no horizontal overflow`, async ({ page, context, noema }) => {
      await openKind(page, context, noema, kind);
      await page.setViewportSize(size);
      await page.locator('h1').scrollIntoViewIfNeeded();
      expect(await noHorizontalOverflow(page)).toBe(true);
    });
  }
}

test('Disconnected cache has no currently actionable alternatives', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'disconnected');
  await expect(page.locator('details.alternatives')).toHaveCount(0);
  await expect(page.locator('[data-focus-kind=manual]')).toContainText('Last known · Selected by you');
  await expect(page.getByRole('combobox', { name: 'Available time' })).toHaveCount(0);
});

test('Disconnected cache does not claim available/completed/connected integrations', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'disconnected');
  await expect(page.locator('#integration-status')).toContainText('server disconnected');
  await expect(page.locator('#connection-label')).toHaveText('Offline · local drafts');
  await expect(recommendation(page)).toContainText('Current status unavailable');
  await expect(page.getByText('Available now', { exact: true })).toHaveCount(0);
  await expect(page.getByText('All tracked work is complete')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry connection' })).toBeVisible();
});

test('Agent and dependency waiting reasons are distinct and real', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'waiting');
  await page.locator('details.waiting-work summary').click();
  await expect(page.locator('details.waiting-work')).toContainText('Waiting on: Trace ownership');
  await expect(page.locator('details.waiting-work')).toContainText('Waiting on an agent report');
});

test('Empty workspace has no agent setup or all-complete claim', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'new');
  await expect(page.getByRole('button', { name: 'Set up agent reporting' })).toHaveCount(0);
  await expect(page.getByText('All tracked work')).toHaveCount(0);
  await note(noema, 'Learning note: I am unsure about ownership. Not a commitment.');
  await page.reload();
  await ready(page, 'notes-only');
  expect((await serverState(noema)).tasks).toHaveLength(0);
});

test('Primary suggestion is singular and alternatives start collapsed', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'available');
  await expect(recommendation(page).locator('h2')).toHaveCount(1);
  await expect(recommendation(page).locator('details.alternatives')).toHaveCount(1);
  await expect(recommendation(page).locator('details.alternatives')).not.toHaveAttribute('open', '');
});

test('No duration, deadline or progress is fabricated', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'available');
  await expect(recommendation(page).locator('.inline-actions .small')).toHaveCount(0);
  await expect(page.getByText(/your estimate|Deadline|% done|progress/i)).toHaveCount(0);
  await expect(page.locator('[data-focus-kind=manual]')).toContainText('Selected by you');
  await page.locator('details.agent-status summary').click();
  await expect(page.locator('#integration-status')).toContainText('connection status unknown');
});

test('Inferred focus is separately labeled', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'available');
  const chosen = (await serverState(noema)).tasks.find(t => t.title === 'Study allocator cleanup')!;
  await noema.api('PATCH', '/api/settings', { observation_enabled: true });
  await noema.api('POST', '/api/context/rules', { app: 'noema-fixture', task_id: chosen.id });
  await noema.api('POST', '/api/context', { app: 'noema-fixture', title: 'Fixture window metadata' });
  await page.reload();
  await expect(page.locator('[data-focus-kind=inferred]')).toContainText('Inferred from window metadata');
});

test('Observer metadata never overrides a pinned focus', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'available');
  const tasks = (await serverState(noema)).tasks;
  const chosen = tasks.find(t => t.title === 'Study allocator cleanup')!;
  const pinned = tasks.find(t => t.title === 'Read the ownership chapter')!;
  await noema.api('PATCH', '/api/settings', { observation_enabled: true });
  await noema.api('POST', '/api/context/rules', { app: 'noema-fixture', task_id: chosen.id });
  await noema.api('POST', '/api/focus', { task_id: pinned.id, pinned: true });
  await noema.api('POST', '/api/context', { app: 'noema-fixture', title: 'Fixture window metadata' });
  await page.reload();
  await expect(page.locator('[data-focus-kind=pinned]')).toContainText('Pinned by you');
  expect((await serverState(noema)).focus).toMatchObject({ task_id: pinned.id, pinned: true });
});

test('Start pins the recommendation only when nothing is pinned', async ({ page, noema }) => {
  const only = await task(noema, 'Read the ownership chapter');
  await gotoApp(page, noema);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect.poll(async () => (await serverState(noema)).focus).toMatchObject({ task_id: only.id, pinned: true });
  await expect(page.locator('[data-focus-kind=pinned]')).toContainText('Pinned by you');
});

test('Completed agent result is still a review task, not completed work', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'attention');
  const state = await serverState(noema);
  expect(state.runs.some(r => r.status === 'review')).toBe(true);
  expect(state.tasks.every(t => t.status !== 'done')).toBe(true);
  await expect(page.getByRole('button', { name: /^Complete Review the cleanup result/ })).toHaveCount(0);
});

test('Zero running agents does not erase a reported question', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'attention');
  await page.locator('details.agent-status summary').click();
  await expect(page.locator('#integration-status')).toContainText('0 running · 1 awaiting input');
});

test('All-complete state has no agent onboarding prompt', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'complete');
  await expect(recommendation(page)).toContainText('All tracked work is complete');
  await expect(page.getByRole('button', { name: 'Set up agent reporting' })).toHaveCount(0);
});

test('Stale integration status is visibly unknown, not running or complete', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'unknown');
  await expect(page.locator('#integration-status')).toContainText('Agent status unknown');
  await expect(recommendation(page).locator('.primary')).toHaveText('Check agent status');
  await expect(page.locator('details.agent-status')).not.toContainText('Reported running');
  await expect(page.getByText('All tracked work is complete')).toHaveCount(0);
});

test('Overview shows focus provenance, one recommendation with its reason, Needs you and a running summary', async ({ page, noema }) => {
  const pinned = await task(noema, 'Study allocator cleanup');
  await noema.api('POST', '/api/focus', { task_id: pinned.id, pinned: true });
  await agentRun(noema, await task(noema, 'Answer the boundary-condition question'), 'needs_input');
  await agentRun(noema, await task(noema, 'Review the cleanup result'), 'completed');
  await agentRun(noema, await task(noema, 'Long agent job'));
  await gotoApp(page, noema);
  await expect(page.locator('.focus-line')).toContainText('Study allocator cleanup');
  await expect(page.locator('[data-focus-kind=pinned]')).toContainText('Pinned by you');
  await expect(recommendation(page).locator('h2')).toHaveText(['Answer the boundary-condition question']);
  await expect(recommendation(page).locator('h2 + p')).toHaveText('An agent needs your input.');
  const needsYou = page.getByRole('region', { name: 'Needs you' });
  await expect(needsYou).toContainText('Review the cleanup result');
  await expect(needsYou).toContainText('A result is ready for your review.');
  await expect(page.locator('details.agent-status')).not.toHaveAttribute('open', '');
  await expect(page.locator('details.agent-status summary')).toHaveText('Agent reports 2');
});

test('Real API-backed overview renders', async ({ page, noema }) => {
  await task(noema, 'Read the ownership chapter', { next_action: 'Start at the borrowing section.' });
  await gotoApp(page, noema);
  await expect(recommendation(page).locator('h2')).toHaveText('Read the ownership chapter');
  await expect(recommendation(page)).toContainText('Start at the borrowing section.');
});

test('Empty, waiting, review and offline/unknown fixture states rendered', async ({ page, context, noema }) => {
  await gotoApp(page, noema);
  await ready(page, 'new');
  expect(await noHorizontalOverflow(page)).toBe(true);
  await seed(noema, 'waiting');
  await page.reload();
  await ready(page, 'waiting');
  expect(await noHorizontalOverflow(page)).toBe(true);
  const waiting = (await serverState(noema)).runs[0];
  await noema.api('POST', `/api/runs/${waiting.id}/events`, { event_id: crypto.randomUUID(), seq: 2, kind: 'completed', message: 'Fixture result.' });
  await page.reload();
  await ready(page, 'attention');
  await expect(page.getByText('A result is ready for your review.').first()).toBeVisible();
  expect(await noHorizontalOverflow(page)).toBe(true);
  await context.setOffline(true);
  await ready(page, 'disconnected');
  expect(await noHorizontalOverflow(page)).toBe(true);
});

test('the time filter never invents an estimate', async ({ page, noema }) => {
  await task(noema, 'No estimate saved');
  await task(noema, 'Long known task', { estimate_minutes: 30 });
  await gotoApp(page, noema);
  await page.getByRole('combobox', { name: 'Available time' }).selectOption('15');
  await ready(page, 'filtered');
  await expect(page.getByRole('heading', { name: 'No work matches this time filter' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Available time' }).selectOption('');
  await ready(page, 'available');
});

test('a stale run is never presented as running in the Overview', async ({ page, noema }) => {
  const t = await task(noema, 'Check the missing agent report', { status: 'waiting' });
  ageRun(noema, (await agentRun(noema, t)).id);
  await gotoApp(page, noema);
  await expect(page.locator('details.agent-status')).toContainText('Fixture command wrapper · Status unknown');
});
```

```ts
// web/e2e/offline.spec.ts
import { expect, test } from './fixtures';
import { openKind, ready } from './nowSeed';

test.use({ viewport: { width: 1440, height: 960 } });

test('Reconnect returns to real available work', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'disconnected');
  await expect(page.locator('#integration-status')).toContainText('server disconnected');
  await context.setOffline(false);
  await ready(page, 'available');
  await expect(page.locator('#connection-label')).toHaveText('Server connected');
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `npm --prefix web test -- src/screens/Now.test.tsx; npm --prefix web run build && npm --prefix web run e2e -- e2e/now.spec.ts e2e/offline.spec.ts`
Expected: FAIL — the Task 14 stub has no recommendation: Vitest reports `TestingLibraryElementError: Unable to find an accessible element with the role "heading" and name "Nothing tracked yet"`; Playwright reports `Error: Timed out 5000ms waiting for expect(locator).toHaveAttribute(expected)` for `data-now-state`.

- [ ] **Step 4: Write the implementation**

```tsx
// web/src/screens/Now.tsx
import { useNavigate } from '@tanstack/react-router';
import type { JSX } from 'react';
import { confirmFocusChange } from '../components/focus';
import { TaskRow } from '../components/TaskRow';
import { COPY, greeting } from '../copy';
import { useConnected } from '../domain/connection';
import { age } from '../domain/format';
import { focusKind, nowState } from '../domain/nowState';
import { RUN_LABEL, waitingReason } from '../domain/tasks';
import { openDialog } from '../shell/dialogs';
import { OfflineNotice } from '../shell/OfflineNotice';
import { useSetFocus, useSnapshot, useTimeBudget } from '../state/queries';
import { S } from '../strings';
import { Icon } from '../ui/Icon';
import { PageHeading } from '../ui/PageHeading';
import { toastError } from '../ui/Toast';

const BUDGETS = [10, 15, 30, 60];
const REPORTED = ['working', 'needs_input', 'unknown'];

export function NowScreen(): JSX.Element {
  const query = useSnapshot();
  const snapshot = query.data ?? null;
  const connected = useConnected();
  const [budget, setBudget] = useTimeBudget();
  const setFocus = useSetFocus();
  const navigate = useNavigate();
  const n = nowState(snapshot, connected, budget);
  const primary = n.primary;
  const focusTask = n.focus;
  const focusRecord = snapshot?.focus ?? null;
  const pinned = focusRecord?.pinned ?? false;
  const tasks = snapshot?.tasks ?? [];
  const runs = snapshot?.runs ?? [];
  const needsYou = connected ? (snapshot?.attention ?? []).filter(t => t.id !== primary?.id) : [];
  const alternatives = n.alternatives.filter(t => !needsYou.some(a => a.id === t.id));
  const reported = runs.filter(r => REPORTED.includes(r.effective_status));
  const openTask = (id: string) => openDialog({ kind: 'task', id });

  async function changeFocus(taskId: string | null) {
    if (!confirmFocusChange(focusRecord, taskId)) return;
    try { await setFocus.mutateAsync({ taskId }); } catch (error) { toastError(error); }
  }

  const eyebrow = !primary ? 'Workspace'
    : n.mode === 'unknown' ? 'Status unknown'
    : n.kind === 'attention' ? `Needs you · ${snapshot?.attention.length ?? 0}`
    : 'Available now';

  let recommendation: JSX.Element;
  if (primary) {
    const reason = n.kind === 'attention' ? primary.attention_reason : primary.next_action || primary.recommendation_reason || 'Continue your selected focus.';
    const startsFocus = n.kind === 'available' && !pinned; // app.js:196 — never replaces a pin
    const label = n.mode === 'unknown' ? 'Check agent status' : n.kind === 'attention' ? 'Open for review'
      : n.kind === 'focus' ? 'Resume' : pinned ? 'View next action' : 'Start';
    recommendation = (
      <>
        <h2>{primary.title}</h2>
        <p>{reason}</p>
        <div className="inline-actions">
          <button type="button" className="primary" onClick={() => (startsFocus ? void changeFocus(primary.id) : openTask(primary.id))}>{label}</button>
          {startsFocus && <button type="button" className="quiet-button" onClick={() => openTask(primary.id)}>Details</button>}
          {primary.estimate_minutes != null && <span className="small dim">{primary.estimate_minutes} min · your estimate</span>}
        </div>
      </>
    );
  } else {
    recommendation = (
      <div className="empty">
        <h2>{n.title}</h2>
        <p>{n.explanation}</p>
        <div className="inline-actions">
          <button type="button" className="secondary" onClick={() => void navigate({ to: '/capture' })}>Capture a thought</button>
          {connected
            ? <button type="button" className="text-button" onClick={() => openDialog({ kind: 'task-capture' })}>Add a task</button>
            : <button type="button" className="text-button" onClick={() => void query.refetch()}>Retry connection</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="now-page" data-now-state={n.mode}>
      <PageHeading title={greeting(new Date(), snapshot?.settings.display_name ?? '')} subtitle={COPY.tagline} />
      <OfflineNotice />
      {focusTask && focusRecord && (
        <div className="focus-line" data-quiet="">
          <span className="eyebrow">Current focus</span>
          <button type="button" className="task-title" onClick={() => openTask(focusTask.id)}>{focusTask.title}</button>
          <span className="focus-kind" data-focus-kind={focusRecord.pinned ? 'pinned' : focusRecord.source === 'context' ? 'inferred' : 'manual'}>
            {(connected ? '' : S.lastKnown) + focusKind(focusRecord) + (focusTask.project ? ' · ' + focusTask.project : '')}
          </span>
          <button type="button" className="quiet-button" onClick={() => void changeFocus(null)}>{pinned ? 'Unpin & clear' : 'Clear'}</button>
        </div>
      )}
      <section className="recommendation" aria-label="Next action" data-quiet="">
        <div className="section-header">
          <span className="eyebrow">{eyebrow}</span>
          {connected && n.open.length > 0 && (
            <select aria-label="Available time" value={budget ?? ''} onChange={e => setBudget(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Any duration</option>
              {BUDGETS.map(v => <option key={v} value={v}>{v} minutes</option>)}
            </select>
          )}
        </div>
        {recommendation}
        {alternatives.length > 0 && (
          <details className="alternatives">
            <summary>{alternatives.length} other actionable task{alternatives.length === 1 ? '' : 's'}</summary>
            {alternatives.map(t => <TaskRow key={t.id} task={t} />)}
          </details>
        )}
      </section>
      {needsYou.length > 0 && (
        <section className="needs-you" aria-label="Needs you">
          <h2 className="eyebrow">Needs you</h2>
          {needsYou.map(t => (
            <button type="button" key={t.id} className="attention-row" onClick={() => openTask(t.id)}>
              <span>{t.title}</span><small>{t.attention_reason}</small>
            </button>
          ))}
        </section>
      )}
      {(tasks.length > 0 || runs.length > 0) && (
        <details className="agent-status" open={n.mode === 'unknown' || !connected}>
          <summary>Agent reports <span className="count">{reported.length}</span></summary>
          <p className="small dim" id="integration-status">{n.integration}</p>
          {reported.map(r => (
            <div className="run-row" key={r.id}>
              <button type="button" className="task-title" onClick={() => openTask(r.task_id)}>
                <span>{tasks.find(t => t.id === r.task_id)?.title ?? r.agent}</span>
                <small>{`${r.agent} · ${RUN_LABEL[r.effective_status]} · last report ${age(r.updated_at)}`}</small>
              </button>
            </div>
          ))}
          {connected && n.open.some(t => t.status !== 'parked') && (
            <>
              <button type="button" className="text-button" onClick={() => openDialog({ kind: 'settings', section: 'agents' })}>Set up agent reporting</button>
              <p className="small muted">Task-scoped tokens and the command wrapper; no automatic agent launch.</p>
            </>
          )}
        </details>
      )}
      {n.waiting.length > 0 && (
        <details className="waiting-work">
          <summary>Waiting work <span className="count">{n.waiting.length}</span></summary>
          {n.waiting.map(t => (
            <div className="run-row" key={t.id}>
              <button type="button" className="task-title" onClick={() => openTask(t.id)}>
                <span>{t.title}</span><small>{waitingReason(t, tasks)}</small>
              </button>
            </div>
          ))}
        </details>
      )}
      {primary && (
        <button type="button" className="add-later" onClick={() => openDialog({ kind: 'task-capture' })}>
          <Icon name="plus" size={16} />Add something for later
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run both to verify they pass**

Run: `npm --prefix web test -- src/screens/Now.test.tsx && npm --prefix web run build && npm --prefix web run e2e -- e2e/now.spec.ts e2e/offline.spec.ts`
Expected: Vitest PASS (12 tests); Playwright `47 passed` (28 parametrized `kind` rows + 18 now rows + 1 offline row).

- [ ] **Step 6: Commit**

```bash
git add web/src/screens/Now.tsx web/src/screens/Now.test.tsx web/e2e/db.ts web/e2e/nowSeed.ts web/e2e/now.spec.ts web/e2e/offline.spec.ts
git commit -m "feat(web): build the Overview with progressive disclosure and honest states"
```


### Task 18: Tasks (`PlanScreen`) — filtered views and compact rows

**Files:**
- Modify: `web/src/screens/Plan.tsx` (replace the Task 14 stub; port of `public/app.js:257-260` with the handbook §14 views)
- Test: `web/src/screens/Plan.test.tsx`, `web/e2e/plan.spec.ts`

**Interfaces:**
- Consumes: `COPY` (Task 1); `TASK_FILTERS`, `filterTasks`, `TaskFilter` (Task 3); `Icon` (Task 4); `openDialog` (Task 6); `OfflineNotice`, `PageHeading` (Task 12); `TaskRow` (Task 15); `useSnapshot`; `useConnected`; `age`; `S.addTask`, `S.lastKnown`.
- Produces: `export function PlanScreen(): JSX.Element;` — chips are toggle buttons (`aria-pressed`), default view **Open**; rows sorted high → low; while disconnected a `Last known · <age>` line marks the cached list.

- [ ] **Step 1: Write the failing unit test**

```tsx
// web/src/screens/Plan.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Snapshot } from '../api/schemas';
import { makeSnapshot, makeTask } from '../test/fixtures';

vi.mock('../state/queries', () => ({ useSnapshot: vi.fn(), usePatchTask: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })) }));
vi.mock('../domain/connection', () => ({ useConnected: vi.fn() }));
vi.mock('../local/drafts', () => ({ useCaptureDraft: () => ({ saveState: 'saved' }) }));
vi.mock('../shell/dialogs', () => ({ openDialog: vi.fn() }));
vi.mock('../ui/Toast', () => ({ toast: vi.fn(), toastError: vi.fn() }));

import { useConnected } from '../domain/connection';
import { age } from '../domain/format';
import { openDialog } from '../shell/dialogs';
import { useSnapshot } from '../state/queries';
import { PlanScreen } from './Plan';

function given(snapshot: Snapshot | undefined, connected = true) {
  vi.mocked(useSnapshot).mockReturnValue({ data: snapshot } as unknown as ReturnType<typeof useSnapshot>);
  vi.mocked(useConnected).mockReturnValue(connected);
  render(<PlanScreen />);
}
const rowTitles = () => [...document.querySelectorAll('.task-row .task-title > span')].map(el => el.textContent);

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('PlanScreen', () => {
  const low = makeTask('low', { title: 'Low work', effective_priority: 'low' });
  const high = makeTask('high', { title: 'High work', effective_priority: 'high' });
  const parked = makeTask('parked', { title: 'Parked idea', status: 'parked' });
  const done = makeTask('done', { title: 'Finished', status: 'done' });
  const snapshot = makeSnapshot({ tasks: [low, parked, done, high], attention: [high], available: [low] });

  it('keeps the variant B heading and offers Add task', () => {
    given(snapshot);
    expect(screen.getByRole('heading', { level: 1, name: 'A little room to plan.' })).toBeTruthy();
    expect(screen.getByText('Keep the next step in view.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'task-capture' });
  });

  it('defaults to Open, sorted high → low, without parked or done', () => {
    given(snapshot);
    expect(screen.getByRole('button', { name: 'Open' }).getAttribute('aria-pressed')).toBe('true');
    expect(rowTitles()).toEqual(['High work', 'Low work']);
  });

  it.each([
    ['Needs you', ['High work']], ['Available now', ['Low work']], ['Parked', ['Parked idea']],
    ['Completed', ['Finished']], ['All', ['High work', 'Parked idea', 'Finished', 'Low work']],
  ])('the %s view', (label, titles) => {
    given(snapshot);
    const views = screen.getByRole('group', { name: 'Task views' });
    fireEvent.click(within(views).getByRole('button', { name: label }));
    expect(within(views).getByRole('button', { name: label }).getAttribute('aria-pressed')).toBe('true');
    expect(rowTitles()).toEqual(titles);
  });

  it('says when a view is empty and offers to add for later', () => {
    given(makeSnapshot());
    expect(screen.getByText('No tasks in this view.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add something for later' }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'task-capture' });
  });

  it('marks a cached list as last known while disconnected', () => {
    given(snapshot, false);
    expect(screen.getByText('Last known · ' + age(snapshot.server_time))).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Server disconnected.');
  });

  it('renders with no snapshot yet', () => {
    given(undefined);
    expect(screen.getByText('No tasks in this view.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Write the failing E2E test (parity rows `browser_check.py:117`, `verify.py:64`; handbook trace R6, U20, U21, U22)**

```ts
// web/e2e/plan.spec.ts
import type { Page } from '@playwright/test';
import { expect, gotoApp, test } from './fixtures';
import { agentRun, serverState, task } from './nowSeed';
import type { NoemaServer } from './server';

type Task = { id: string; title: string; status: string; priority: string; version: number };
const getTask = (noema: NoemaServer, id: string) => noema.api<Task>('GET', `/api/tasks/${id}`);
const rows = (page: Page) => page.locator('.plan-list .task-row');
const view = (page: Page, label: string) => page.getByRole('group', { name: 'Task views' }).getByRole('button', { name: label, exact: true });
const priority = (page: Page, title: string) => page.getByRole('combobox', { name: `Priority for ${title}` });
async function setPriority(page: Page, title: string, value: 'auto' | 'high' | 'medium' | 'low') {
  await priority(page, title).selectOption(value);
  await expect(page.locator('.toast-layer')).toContainText('Priority updated.');
}

test.use({ viewport: { width: 1440, height: 960 } });

test('Needs you, Running, Available now and All filter the task list', async ({ page, noema }) => {
  await task(noema, 'Available todo');
  await task(noema, 'Parked idea', { status: 'parked' });
  await task(noema, 'Finished', { status: 'done' });
  await task(noema, 'Review the fix', { status: 'review' });
  await agentRun(noema, await task(noema, 'Agent task'));
  await gotoApp(page, noema, '#/plan');
  await expect(view(page, 'Open')).toHaveAttribute('aria-pressed', 'true');
  await expect(rows(page)).toHaveCount(3);
  await expect(page.locator('.plan-list')).not.toContainText('Parked idea');
  await view(page, 'Needs you').click();
  await expect(rows(page)).toHaveText([/Review the fix/]);
  await view(page, 'Running').click();
  await expect(rows(page)).toHaveText([/Agent task/]);
  await view(page, 'Available now').click();
  await expect(rows(page)).toHaveCount(2);
  await view(page, 'Parked').click();
  await expect(rows(page)).toHaveText([/Parked idea/]);
  await view(page, 'Completed').click();
  await expect(rows(page)).toHaveText([/Finished/]);
  await view(page, 'All').click();
  await expect(rows(page)).toHaveCount(5);
});

test('Plan rows show task, project, state and priority; due date and estimate only when known', async ({ page, noema }) => {
  await task(noema, 'Bare task', { project: 'Learning' });
  await task(noema, 'Dated task', { project: 'Work', due_at: '2030-01-02T09:30:00+00:00', estimate_minutes: 25 });
  await gotoApp(page, noema, '#/plan');
  const bare = rows(page).filter({ hasText: 'Bare task' });
  await expect(bare.locator('.task-title small')).toHaveText('Learning · To do');
  await expect(bare.getByRole('combobox', { name: 'Priority for Bare task' })).toBeVisible();
  const dated = rows(page).filter({ hasText: 'Dated task' });
  await expect(dated.locator('.task-title small')).toContainText('Work · To do');
  await expect(dated.locator('.task-title small')).toContainText('Due ');
  await expect(dated.locator('.task-title small')).toContainText('25 min · your estimate');
  await expect(bare.locator('.task-title small')).not.toContainText(/Due |min/);
});

test('Priority is editable in place and shows its source and reason', async ({ page, noema }) => {
  await task(noema, 'Read the chapter');
  await gotoApp(page, noema, '#/plan');
  const select = priority(page, 'Read the chapter');
  await expect(select.locator('option:checked')).toHaveText('medium · Auto · rules');
  await select.focus();
  await expect(page.getByRole('tooltip')).toHaveText('No explicit urgency; neutral default.');
  await setPriority(page, 'Read the chapter', 'high');
  await expect(select.locator('option:checked')).toHaveText('high · Set by you');
});

test('Manual priority control persists', async ({ page, noema }) => {
  const t = await task(noema, 'Read the chapter');
  await gotoApp(page, noema, '#/plan');
  await setPriority(page, 'Read the chapter', 'low');
  await expect.poll(async () => (await getTask(noema, t.id)).priority).toBe('low');
  expect((await serverState(noema)).tasks[0]).toMatchObject({ priority: 'low' });
});

test('Manual priority persists after reload', async ({ page, noema }) => {
  await task(noema, 'Practice LeetCode');
  await gotoApp(page, noema, '#/plan');
  await setPriority(page, 'Practice LeetCode', 'high');
  await page.reload();
  await expect(priority(page, 'Practice LeetCode').locator('option:checked')).toHaveText('high · Set by you');
});

test('complete and reopen confirm with a toast; parked is not done', async ({ page, noema }) => {
  const t = await task(noema, 'Check duplicate handling');
  await gotoApp(page, noema, '#/plan');
  await page.getByRole('button', { name: 'Complete Check duplicate handling' }).click();
  await expect(page.locator('.toast-layer')).toContainText('Task completed.');
  await expect.poll(async () => (await getTask(noema, t.id)).status).toBe('done');
  await expect(rows(page)).toHaveCount(0);
  await view(page, 'Completed').click();
  await page.getByRole('button', { name: 'Reopen Check duplicate handling' }).click();
  await expect(page.locator('.toast-layer')).toContainText('Task reopened.');
  await expect.poll(async () => (await getTask(noema, t.id)).status).toBe('todo');
  await view(page, 'Parked').click();
  await expect(rows(page)).toHaveCount(0);
});

test('Review result opens the result or session link', async ({ page, noema }) => {
  const t = await task(noema, 'Review the cleanup result');
  await agentRun(noema, t, 'completed', 'https://agent.example/result');
  await gotoApp(page, noema, '#/plan');
  const link = page.getByRole('link', { name: 'Review result ↗' });
  await expect(link).toHaveAttribute('href', 'https://agent.example/result');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.getByRole('button', { name: 'Complete Review the cleanup result' })).toHaveCount(0);
  expect((await getTask(noema, t.id)).status).not.toBe('done');
});

test('a long unbroken title never scrolls the page sideways at 390 px', async ({ page, noema }) => {
  await task(noema, 'x'.repeat(220));
  await gotoApp(page, noema, '#/plan');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `npm --prefix web test -- src/screens/Plan.test.tsx; npm --prefix web run build && npm --prefix web run e2e -- e2e/plan.spec.ts`
Expected: FAIL — Vitest `TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Add task"`; Playwright `Error: Timed out 5000ms waiting for expect(locator).toHaveCount(expected)` on `.plan-list .task-row`.

- [ ] **Step 4: Write the implementation**

```tsx
// web/src/screens/Plan.tsx
import { useState, type JSX } from 'react';
import { TaskRow } from '../components/TaskRow';
import { COPY } from '../copy';
import { useConnected } from '../domain/connection';
import { age } from '../domain/format';
import { TASK_FILTERS, filterTasks, type TaskFilter } from '../domain/tasks';
import { openDialog } from '../shell/dialogs';
import { OfflineNotice } from '../shell/OfflineNotice';
import { useSnapshot } from '../state/queries';
import { S } from '../strings';
import { Icon } from '../ui/Icon';
import { PageHeading } from '../ui/PageHeading';

export function PlanScreen(): JSX.Element {
  const snapshot = useSnapshot().data;
  const connected = useConnected();
  const [filter, setFilter] = useState<TaskFilter>('open');
  const list = snapshot ? filterTasks(snapshot, filter) : [];
  const addTask = () => openDialog({ kind: 'task-capture' });
  return (
    <section className="plan-page">
      <PageHeading title={COPY.plan.title} subtitle={COPY.plan.subtitle}
        action={<button type="button" className="primary" onClick={addTask}><Icon name="plus" size={18} />{S.addTask}</button>} />
      <OfflineNotice />
      <div className="filter-bar" role="group" aria-label="Task views">
        {TASK_FILTERS.map(f => (
          <button type="button" key={f.id} className="filter-chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>
        ))}
      </div>
      {!connected && snapshot && <p className="eyebrow">{S.lastKnown + age(snapshot.server_time)}</p>}
      <div className="plan-list" data-quiet="">
        <div className="plan-header" aria-hidden="true"><span>Task</span><span>Priority</span></div>
        {list.length
          ? list.map(t => <TaskRow key={t.id} task={t} />)
          : <div className="empty"><p>No tasks in this view.</p><button type="button" className="text-button" onClick={addTask}>Add something for later</button></div>}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Run both to verify they pass**

Run: `npm --prefix web test -- src/screens/Plan.test.tsx && npm --prefix web run build && npm --prefix web run e2e -- e2e/plan.spec.ts`
Expected: Vitest PASS (10 tests); Playwright `8 passed`.

- [ ] **Step 6: Commit**

```bash
git add web/src/screens/Plan.tsx web/src/screens/Plan.test.tsx web/e2e/plan.spec.ts
git commit -m "feat(web): build Tasks with Needs you, Running and Available views"
```

### Task 19: Add task (`TaskCaptureDialog`) and `DialogHost`

**Files:**
- Create: `web/src/dialogs/TaskCapture.tsx` (docs/TASK_CAPTURE.md; port of `public/app.js:295-300, 305-370, 548`; spec §4.4 task capture)
- Create: `web/src/shell/DialogHost.tsx` (`task-capture` case; Task 20 adds `task`; Phase 2b adds the rest)
- Modify: `web/src/shell/AppShell.tsx` (render `<DialogHost />` just before `<UnlockHost />`, so Unlock always stacks on top)
- Test: `web/src/dialogs/TaskCapture.test.tsx`, `web/e2e/task-capture.spec.ts`

**Interfaces:**
- Consumes: `taskDraftStore`, `useTaskDraft` from `../local/taskDraft` (contract §4.3: `submit()` persists `pending` before any HTTP call, checks `id` and `original_input`, freezes on 409/5xx/network/parse, unfreezes on 401/other 4xx); `TaskFields` (Task 16); `Dialog` (Task 5); `toast` (Task 4); `openDialog`, `useDialog`, `closeDialog` (Task 6); `useSnapshot`; `useQueryClient`; strings `S.addTask`, `S.retryAddTask`, `S.editAction`, `S.previousUnconfirmed`, `S.unconfirmedPreserved`, `S.draftNotStored`.
- Produces:
  ```ts
  export function TaskCaptureDialog(props: { onClose: () => void }): JSX.Element;
  export function DialogHost(): JSX.Element | null;
  ```
  Behaviour: one focused multiline input "What do you need to do?", collapsed Details, Enter = newline, Ctrl/Cmd+Enter = submit (not while composing). Inputs are frozen while a submission is pending. Escape, Close and backdrop all `persist()` first and stay open with `S.draftNotStored` if that fails; closing is ignored while a submit is in flight. Success closes back to the previous page, shows a compact confirmation with **Edit**, and never changes focus.

- [ ] **Step 1: Write the failing unit test**

```tsx
// web/src/dialogs/TaskCapture.test.tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSnapshot } from '../test/fixtures';
import { polyfillDialog } from '../ui/testing';

const h = vi.hoisted(() => {
  type Draft = { id: string; raw: string; fields: Record<string, unknown>; pending: null | { capture_id: string; raw: string; local_day: string; details: Record<string, unknown> } };
  type State = { draft: Draft; saveState: string; submitting: boolean; recovered: boolean };
  const fresh = (): State => ({ draft: { id: 'draft-1', raw: '', fields: {}, pending: null }, saveState: 'saved', submitting: false, recovered: true });
  let state = fresh();
  const listeners = new Set<() => void>();
  const set = (next: Partial<State>) => { state = { ...state, ...next }; listeners.forEach(l => l()); };
  const store = {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setRaw: vi.fn((raw: string) => set({ draft: { ...state.draft, raw } })),
    setField: vi.fn(),
    persist: vi.fn(async () => {}),
    submit: vi.fn(),
    statusLabel: vi.fn(() => 'Draft on this device · not added'),
  };
  return { store, set, reset: () => { state = fresh(); }, pending: { capture_id: 'draft-1', raw: 'Review the cleanup path', local_day: '2026-10-10', details: {} } };
});

vi.mock('../local/taskDraft', async () => {
  const { useSyncExternalStore } = await import('react');
  return { taskDraftStore: h.store, useTaskDraft: () => useSyncExternalStore(h.store.subscribe, h.store.getSnapshot) };
});
vi.mock('../state/queries', () => ({ useSnapshot: () => ({ data: makeSnapshot() }) }));
vi.mock('../shell/dialogs', () => ({ openDialog: vi.fn() }));
vi.mock('../ui/Toast', () => ({ toast: vi.fn() }));

import { openDialog } from '../shell/dialogs';
import { S } from '../strings';
import { toast } from '../ui/Toast';
import { TaskCaptureDialog } from './TaskCapture';

beforeAll(polyfillDialog);
beforeEach(() => h.reset());
afterEach(() => { cleanup(); vi.clearAllMocks(); h.store.persist.mockImplementation(async () => {}); });

function renderDialog() {
  const onClose = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}><TaskCaptureDialog onClose={onClose} /></QueryClientProvider>);
  return { onClose, input: screen.getByLabelText('What do you need to do?') as HTMLTextAreaElement };
}
const typeRaw = (input: HTMLTextAreaElement, raw: string) => fireEvent.change(input, { target: { value: raw } });

describe('TaskCaptureDialog', () => {
  it('opens on one focused multiline input with Details collapsed', () => {
    const { input } = renderDialog();
    expect(input.tagName).toBe('TEXTAREA');
    expect(document.activeElement).toBe(input);
    expect((document.querySelector('#task-details') as HTMLDetailsElement).open).toBe(false);
    expect(screen.getByText('Ctrl / ⌘ + Enter to add. Enter starts a new line.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Draft on this device · not added');
  });

  it('typing goes to the draft store; Details fields go to setField', () => {
    const { input } = renderDialog();
    typeRaw(input, 'Review the cleanup path');
    expect(h.store.setRaw).toHaveBeenCalledWith('Review the cleanup path');
    fireEvent.change(screen.getByLabelText('Workflow · optional'), { target: { value: 'Research' } });
    expect(h.store.setField).toHaveBeenCalledWith('project', 'Research');
    fireEvent.change(screen.getByLabelText('Title override · optional'), { target: { value: 'Shorter title' } });
    expect(h.store.setField).toHaveBeenCalledWith('title', 'Shorter title');
  });

  it('plain Enter never submits; Ctrl+Enter does, unless composing', async () => {
    h.store.submit.mockResolvedValue({ ok: false, frozen: false, message: 'x' });
    const { input } = renderDialog();
    typeRaw(input, 'Review the cleanup path');
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true, isComposing: true });
    expect(h.store.submit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(h.store.submit).toHaveBeenCalledOnce());
  });

  it('a confirmed add closes, confirms compactly with Edit, and Edit opens the saved task', async () => {
    h.store.submit.mockResolvedValue({ ok: true, task: { id: 'task-9' }, toast: S.taskAdded });
    const { input, onClose } = renderDialog();
    typeRaw(input, 'Review the cleanup path');
    fireEvent.click(screen.getByRole('button', { name: S.addTask }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    const [message, options] = vi.mocked(toast).mock.calls[0];
    expect(message).toBe(S.taskAdded);
    expect(options?.action?.label).toBe(S.editAction);
    options!.action!.onClick();
    expect(openDialog).toHaveBeenCalledWith({ kind: 'task', id: 'task-9' });
  });

  it('an unconfirmed add stays frozen with Retry add task', async () => {
    h.store.submit.mockImplementation(async () => {
      h.set({ draft: { id: 'draft-1', raw: 'Review the cleanup path', fields: {}, pending: h.pending } });
      return { ok: false, frozen: true, message: S.notConfirmed + S.checkServiceRetry };
    });
    const { input, onClose } = renderDialog();
    typeRaw(input, 'Review the cleanup path');
    fireEvent.click(screen.getByRole('button', { name: S.addTask }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(S.notConfirmed + S.checkServiceRetry));
    expect(screen.getByRole('status').textContent).toBe(S.unconfirmedPreserved);
    expect(screen.getByRole('button', { name: S.retryAddTask })).toBeTruthy();
    expect(input.disabled).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a 401 or other 4xx unfreezes the input', async () => {
    h.store.submit.mockResolvedValue({ ok: false, frozen: false, message: S.notConfirmed + 'Unlock Noema to continue' });
    const { input } = renderDialog();
    typeRaw(input, 'Review the cleanup path');
    fireEvent.click(screen.getByRole('button', { name: S.addTask }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(S.notConfirmed + 'Unlock Noema to continue'));
    expect(input.disabled).toBe(false);
    expect(screen.getByRole('button', { name: S.addTask })).toBeTruthy();
  });

  it('reopening with an unconfirmed attempt shows it frozen with Retry', () => {
    h.set({ draft: { id: 'draft-1', raw: 'Review the cleanup path', fields: {}, pending: h.pending } });
    const { input } = renderDialog();
    expect(input.value).toBe('Review the cleanup path');
    expect(input.disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toBe(S.previousUnconfirmed);
    expect(screen.getByRole('button', { name: S.retryAddTask })).toBeTruthy();
  });

  it('Close, Escape and backdrop save the draft before closing', async () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(h.store.persist).toHaveBeenCalledOnce();
    const dialog = screen.getByRole('dialog', { name: S.addTask });
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));
    expect(h.store.persist).toHaveBeenCalledTimes(2);
  });

  it('stays open with retry advice when the draft cannot be saved', async () => {
    h.store.persist.mockRejectedValue(new DOMException('Injected quota failure', 'QuotaExceededError'));
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(S.draftNotStored));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores Close while a submit is in flight', () => {
    h.set({ submitting: true });
    const { onClose } = renderDialog();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Close dialog' })); });
    expect(h.store.persist).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write the failing E2E test (parity rows of `qa/task_capture_check.py` for Add task, plus `verify.py:42,65,67,80`, `browser_check.py:114`, `now_ui_check.py:173`)**

Every title below is a parity-map label verbatim. Rows that need Task detail or Edit task (`task_capture_check.py:118,124,126,221`) are appended by Tasks 20 and 21. The failure injections are the same ones `qa/task_capture_check.py` uses (an `IDBObjectStore.prototype.put` override for the `task-draft` key, a SQLite trigger, a dropped or forged `/api/task-captures` reply).

```ts
// web/e2e/task-capture.spec.ts
import { chromium, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSql } from './db';
import { failFetch, loseAck } from './faults';
import { expect, gotoApp, readLocalDb, test } from './fixtures';
import { E2E_TOKEN, type NoemaServer } from './server';

type Task = { id: string; title: string; project: string; priority: string; status: string; version: number; planned_on: string | null; due_at: string | null;
  not_before: string | null; original_input: string | null; interpretation: { method?: string; explanation?: string } };
type State = { tasks: Task[]; reminders: unknown[]; focus: { task_id: string; pinned: boolean } | null; capabilities: { organizer: boolean } };
const state = (noema: NoemaServer) => noema.api<State>('GET', '/api/state');
const taskCount = async (noema: NoemaServer) => (await state(noema)).tasks.length;
const byOriginal = async (noema: NoemaServer, raw: string) => (await state(noema)).tasks.find(t => t.original_input === raw);
const addTaskDialog = (page: Page) => page.getByRole('dialog', { name: 'Add task' });
const rawInput = (page: Page) => addTaskDialog(page).getByLabel('What do you need to do?');
const detailsSummary = (page: Page) => addTaskDialog(page).locator('#task-details summary');
async function openAddTask(page: Page) {
  await page.locator('.page-heading').getByRole('button', { name: 'Add task' }).click();
  await expect(addTaskDialog(page)).toBeVisible();
  return addTaskDialog(page);
}
async function addWithKeyboard(page: Page, raw: string) {
  await rawInput(page).fill(raw);
  await rawInput(page).press('Control+Enter');
  await expect(addTaskDialog(page)).toHaveCount(0);
}
// qa/task_capture_check.py:160-162: only the task-draft key fails, so the rest of IndexedDB keeps working.
async function breakTaskDraftStorage(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __put?: typeof IDBObjectStore.prototype.put };
    w.__put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (key === 'task-draft') throw new DOMException('Injected quota failure', 'QuotaExceededError');
      return w.__put!.call(this, value, key);
    };
  });
}
async function repairTaskDraftStorage(page: Page) {
  await page.evaluate(() => { IDBObjectStore.prototype.put = (window as unknown as { __put: typeof IDBObjectStore.prototype.put }).__put; });
}
async function submitWithBrokenDraftStorage(page: Page, raw: string) {
  const dialog = await openAddTask(page);
  await rawInput(page).fill(raw);
  await breakTaskDraftStorage(page);
  await dialog.getByRole('button', { name: 'Add task' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Draft storage failed. Task not added; keep this dialog open and retry.');
  return dialog;
}
async function submitWithServerTrigger(page: Page, noema: NoemaServer, raw: string) {
  runSql(noema.dataDir, "CREATE TRIGGER ui_fail BEFORE INSERT ON task_captures BEGIN SELECT RAISE(ABORT, 'Injected fixture failure'); END");
  const dialog = await openAddTask(page);
  await rawInput(page).fill(raw);
  await dialog.getByRole('button', { name: 'Add task' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Not confirmed added');
  return dialog;
}
async function submitWithLostAck(page: Page, raw: string) {
  const dialog = await openAddTask(page);
  await rawInput(page).fill(raw);
  await dialog.getByRole('button', { name: 'Add task' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Not confirmed added');
  return dialog;
}
async function submitOffline(page: Page, raw: string) {
  const dialog = await openAddTask(page);
  await rawInput(page).fill(raw);
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      if (String(input) === '/api/task-captures') { window.fetch = original; throw new TypeError('Injected offline transport'); }
      return original(input, init);
    };
  });
  await dialog.getByRole('button', { name: 'Add task' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Not confirmed added');
  return dialog;
}

test.use({ viewport: { width: 1200, height: 900 } });

test('One multiline input; no unsupported voice button or mandatory details', async ({ page, noema }) => {
  await gotoApp(page, noema, '#/plan');
  const dialog = await openAddTask(page);
  await expect(rawInput(page)).toBeFocused();
  await expect(dialog.locator('input:visible, select:visible')).toHaveCount(0);
  await expect(dialog.locator('textarea:visible')).toHaveCount(1);
  await expect(dialog.locator('#task-details')).not.toHaveAttribute('open', '');
  await expect(dialog.getByRole('button', { name: /record|voice|microphone/i })).toHaveCount(0);
});

for (const width of [1200, 390]) {
  const viewport = { width, height: width === 390 ? 844 : 900 };
  test(`${width}px layout has no horizontal overflow`, async ({ page, noema }) => {
    await page.setViewportSize(viewport);
    await gotoApp(page, noema, '#/plan');
    const dialog = await openAddTask(page);
    await rawInput(page).fill('Review the cleanup path');
    expect(await dialog.evaluate(d => d.scrollWidth <= d.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`${width}px Details is keyboard reachable`, async ({ page, noema }) => {
    await page.setViewportSize(viewport);
    await gotoApp(page, noema, '#/plan');
    await openAddTask(page);
    await expect(rawInput(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(detailsSummary(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(addTaskDialog(page).locator('#task-details')).toHaveAttribute('open', '');
  });
}

test('Ordinary Enter inserts a newline, never submits', async ({ page, noema }) => {
  await gotoApp(page, noema, '#/plan');
  await openAddTask(page);
  await rawInput(page).fill('Review the cleanup path');
  await rawInput(page).press('End');
  await rawInput(page).press('Enter');
  await expect(rawInput(page)).toHaveValue('Review the cleanup path\n');
  await expect(addTaskDialog(page)).toBeVisible();
  expect(await taskCount(noema)).toBe(0);
});

test('Opening and closing Details preserves input and chosen workflow', async ({ page, noema }) => {
  await gotoApp(page, noema, '#/plan');
  const dialog = await openAddTask(page);
  await rawInput(page).fill('Review the cleanup path');
  await detailsSummary(page).click();
  await dialog.getByLabel('Workflow · optional').fill('Explicit fixture workflow');
  await detailsSummary(page).click();
  await expect(rawInput(page)).toHaveValue('Review the cleanup path');
  await detailsSummary(page).click();
  await expect(dialog.getByLabel('Workflow · optional')).toHaveValue('Explicit fixture workflow');
});

test('Keyboard submit durably creates one task without a model', async ({ page, noema }) => {
  await gotoApp(page, noema, '#/plan');
  const dialog = await openAddTask(page);
  await rawInput(page).fill('Review the cleanup path');
  await detailsSummary(page).click();
  await dialog.getByLabel('Workflow · optional').fill('Explicit fixture workflow');
  await rawInput(page).press('Control+Enter');
  await expect(addTaskDialog(page)).toHaveCount(0);
  const current = await state(noema);
  expect(current.capabilities.organizer).toBe(false);
  expect(current.tasks).toHaveLength(1);
  expect(current.tasks[0]).toMatchObject({ original_input: 'Review the cleanup path', project: 'Explicit fixture workflow' });
  expect(current.focus).toBeNull();
});

test('Compact confirmation includes Edit and does not open full editor', async ({ page, noema }) => {
  await gotoApp(page, noema, '#/plan');
  await openAddTask(page);
  await addWithKeyboard(page, 'Review the cleanup path');
  await expect(page.locator('.toast-layer')).toContainText('Task added.');
  await expect(page.locator('.toast-layer').getByRole('button', { name: 'Edit' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/plan$/);
});

test('Planned day is separate from deadline/reminder/availability', async ({ page, noema }) => {
  await gotoApp(page, noema, '#/plan');
  await openAddTask(page);
  await addWithKeyboard(page, 'Review another cleanup tomorrow');
  const planned = await byOriginal(noema, 'Review another cleanup tomorrow');
  expect(planned?.planned_on).not.toBeNull();
  expect(planned?.due_at).toBeNull();
  expect(planned?.not_before).toBeNull();
  expect((await state(noema)).reminders).toHaveLength(0);
});

test('Accidental dismissal and reload recover task draft and details', async ({ page, noema }) => {
  await gotoApp(page, noema, '#/plan');
  const dialog = await openAddTask(page);
  await rawInput(page).fill('Maybe review Atlas next Friday; not confirmed');
  await detailsSummary(page).click();
  await dialog.getByLabel('Priority').selectOption('low');
  await rawInput(page).press('Escape');
  await expect(addTaskDialog(page)).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#connection-label')).toHaveText('Server connected');
  const again = await openAddTask(page);
  await expect(rawInput(page)).toHaveValue('Maybe review Atlas next Friday; not confirmed');
  await detailsSummary(page).click();
  await expect(again.getByLabel('Priority')).toHaveValue('low');
  expect(await taskCount(noema)).toBe(0);
});

test('Task draft survives close and reload; initially focused; Enter inserts newline', async ({ page, noema }) => {
  await gotoApp(page, noema, '#/plan');
  const dialog = await openAddTask(page);
  await expect(rawInput(page)).toBeFocused();
  await rawInput(page).fill('leetcode by tonight');
  await rawInput(page).press('Enter');
  await expect(rawInput(page)).toHaveValue(/\n$/);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(addTaskDialog(page)).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#connection-label')).toHaveText('Server connected');
  await openAddTask(page);
  await expect(rawInput(page)).toBeFocused();
  await expect(rawInput(page)).toHaveValue('leetcode by tonight\n');
});

test('Actual browser-profile restart recovers task draft', async ({ noema }) => {
  const profile = await mkdtemp(join(tmpdir(), 'noema-task-profile-'));
  try {
    let context = await chromium.launchPersistentContext(profile, { viewport: { width: 1200, height: 900 } });
    let page = context.pages()[0] ?? await context.newPage();
    await gotoApp(page, noema, '#/plan');
    await openAddTask(page);
    await rawInput(page).fill('Draft that survives a restart');
    await addTaskDialog(page).getByRole('button', { name: 'Close', exact: true }).click();
    await expect(addTaskDialog(page)).toHaveCount(0);
    await context.close();
    context = await chromium.launchPersistentContext(profile, { viewport: { width: 1200, height: 900 } });
    page = context.pages()[0] ?? await context.newPage();
    await gotoApp(page, noema, '#/plan');
    await openAddTask(page);
    await expect(rawInput(page)).toHaveValue('Draft that survives a restart');
    expect(await taskCount(noema)).toBe(0);
    await context.close();
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
});

test('Ambiguous workflow/date save without interview or fabricated fields', async ({ page, noema }) => {
  await gotoApp(page, noema, '#/plan');
  const dialog = await openAddTask(page);
  await rawInput(page).fill('Maybe review Atlas next Friday; not confirmed');
  await detailsSummary(page).click();
  await dialog.getByLabel('Priority').selectOption('low');
  await rawInput(page).press('Control+Enter');
  await expect(addTaskDialog(page)).toHaveCount(0);
  const uncertain = await byOriginal(noema, 'Maybe review Atlas next Friday; not confirmed');
  expect(uncertain).toMatchObject({ planned_on: null, due_at: null, not_before: null, project: 'Unassigned', priority: 'low' });
  await expect(page.locator('.toast-layer')).toContainText('Task added. Date wording kept; correct it in Edit if needed.');
});

test('Unsupported input saved with honest unavailable interpretation', async ({ page, noema }) => {
  await gotoApp(page, noema, '#/plan');
  await openAddTask(page);
  await addWithKeyboard(page, 'Compare memory layouts');
  const saved = await byOriginal(noema, 'Compare memory layouts');
  expect(saved).toMatchObject({ title: 'Compare memory layouts', project: 'Unassigned', planned_on: null, due_at: null });
  expect(saved?.interpretation).toMatchObject({ method: 'limited-rules', explanation: '' });
  await expect(page.locator('.toast-layer')).toHaveText(/^Task added\./);
});

test('Repeated submit does not duplicate task', async ({ page, noema }) => {
  await gotoApp(page, noema, '#/plan');
  const dialog = await openAddTask(page);
  await rawInput(page).fill('Idempotent example');
  await dialog.locator('form').evaluate((form: HTMLFormElement) => { form.requestSubmit(); form.requestSubmit(); });
  await expect(addTaskDialog(page)).toHaveCount(0);
  expect(await taskCount(noema)).toBe(1);
});

test('Create task form persists to real SQLite', async ({ page, noema }) => {
  await gotoApp(page, noema, '#/plan');
  await openAddTask(page);
  await addWithKeyboard(page, 'Persist me across a restart');
  await noema.restart();
  expect((await byOriginal(noema, 'Persist me across a restart'))?.title).toBe('Persist me across a restart');
});

test('Add a task opens an implemented form and persists explicit intent', async ({ page, noema }) => {
  await gotoApp(page, noema);
  await page.getByRole('region', { name: 'Next action' }).getByRole('button', { name: 'Add a task' }).click();
  await addWithKeyboard(page, 'Explicitly chosen task');
  expect((await state(noema)).tasks.map(t => t.title)).toEqual(['Explicitly chosen task']);
});

test('Injected storage failure retains input, blocks dismissal and makes no task', async ({ page, noema }) => {
  await gotoApp(page, noema, '#/plan');
  const dialog = await submitWithBrokenDraftStorage(page, 'Retain this on local storage failure');
  await expect(rawInput(page)).toHaveValue('Retain this on local storage failure');
  await expect(rawInput(page)).toBeEnabled();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog.locator('#task-draft-status')).toContainText('Draft not stored');
  await rawInput(page).press('Escape');
  await expect(addTaskDialog(page)).toBeVisible();
  expect(await taskCount(noema)).toBe(0);
});

test('Local storage retry adds exactly once', async ({ page, noema }) => {
  await gotoApp(page, noema, '#/plan');
  const dialog = await submitWithBrokenDraftStorage(page, 'Retain this on local storage failure');
  await repairTaskDraftStorage(page);
  await dialog.getByRole('button', { name: 'Add task' }).click();
  await expect(addTaskDialog(page)).toHaveCount(0);
  expect(await taskCount(noema)).toBe(1);
});

test('Failed submission reports an inline error, retains wording and refuses unsafe close', async ({ page, noema }) => {
  await gotoApp(page, noema, '#/plan');
  const dialog = await submitWithBrokenDraftStorage(page, 'Preserve on failure, with more text');
  await expect(rawInput(page)).toHaveValue('Preserve on failure, with more text');
  const box = (await dialog.boundingBox())!;
  await page.mouse.click(Math.max(2, box.x - 10), Math.max(2, box.y - 10)); // backdrop
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(addTaskDialog(page)).toBeVisible();
  await expect(rawInput(page)).toHaveValue('Preserve on failure, with more text');
});

test('Server storage failure shows no false success and rolls back task', async ({ page, noema }) => {
  await gotoApp(page, noema, '#/plan');
  await submitWithServerTrigger(page, noema, 'Retain on database failure');
  await expect(rawInput(page)).toBeDisabled();
  await expect(rawInput(page)).toHaveValue('Retain on database failure');
  await expect(page.locator('.toast-layer')).not.toContainText('Task added.');
  expect(await taskCount(noema)).toBe(0);
});

test('Server storage retry adds once', async ({ page, noema }) => {
  await gotoApp(page, noema, '#/plan');
  const dialog = await submitWithServerTrigger(page, noema, 'Retain on database failure');
  runSql(noema.dataDir, 'DROP TRIGGER ui_fail');
  await dialog.getByRole('button', { name: 'Retry add task' }).click();
  await expect(addTaskDialog(page)).toHaveCount(0);
  expect(await taskCount(noema)).toBe(1);
});

test('Lost acknowledgement is unconfirmed, not a success', async ({ page, noema }) => {
  await loseAck(page, '/api/task-captures', 1);
  await gotoApp(page, noema, '#/plan');
  await submitWithLostAck(page, 'Retried submission must not duplicate');
  await expect(addTaskDialog(page)).toBeVisible();
  await expect(addTaskDialog(page).getByRole('button', { name: 'Retry add task' })).toBeVisible();
  expect(await taskCount(noema)).toBe(1);
});

test('Retry after actual commit returns same task, never duplicates', async ({ page, noema }) => {
  await loseAck(page, '/api/task-captures', 1);
  await gotoApp(page, noema, '#/plan');
  const dialog = await submitWithLostAck(page, 'Retried submission must not duplicate');
  const committed = (await state(noema)).tasks[0].id;
  await dialog.getByRole('button', { name: 'Retry add task' }).click();
  await expect(addTaskDialog(page)).toHaveCount(0);
  expect((await state(noema)).tasks.map(t => t.id)).toEqual([committed]);
});

test('Injected generic HTTP 200 cannot falsely acknowledge a task', async ({ page, noema }) => {
  await failFetch(page, { path: '/api/task-captures', times: 1, fault: { status: 200, body: '{}', contentType: 'application/json' } });
  await gotoApp(page, noema, '#/plan');
  const dialog = await openAddTask(page);
  await rawInput(page).fill('Generic success is not a task acknowledgement');
  await dialog.getByRole('button', { name: 'Add task' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Not confirmed added');
  expect(await taskCount(noema)).toBe(0);
  await dialog.getByRole('button', { name: 'Retry add task' }).click();
  await expect(addTaskDialog(page)).toHaveCount(0);
  expect(await taskCount(noema)).toBe(1);
});

test('Disconnected task saving retains draft, no task/outbox success', async ({ page, noema }) => {
  await gotoApp(page, noema, '#/plan');
  await submitOffline(page, 'Disconnected task draft, not a queued task');
  await expect(rawInput(page)).toHaveValue('Disconnected task draft, not a queued task');
  expect(await taskCount(noema)).toBe(0);
  expect((await readLocalDb(page)).outbox).toHaveLength(0);
  await expect(page.getByRole('button', { name: /captures? on this device/ })).toHaveCount(0);
});

test('Disconnected draft retry after reload uses durable capture identity', async ({ page, noema }) => {
  await gotoApp(page, noema, '#/plan');
  const dialog = await submitOffline(page, 'Disconnected task draft, not a queued task');
  type Pending = { capture_id: string; raw: string; local_day: string; details: Record<string, unknown> };
  const pending = ((await readLocalDb(page)).taskDraft as { pending: Pending }).pending;
  expect(pending.raw).toBe('Disconnected task draft, not a queued task');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(addTaskDialog(page)).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#connection-label')).toHaveText('Server connected');
  const again = await openAddTask(page);
  await expect(rawInput(page)).toHaveValue('Disconnected task draft, not a queued task');
  await expect(again.locator('#task-draft-status')).toHaveText('Previous save is unconfirmed. Retry the same attempt; this draft is not an offline task queue.');
  await again.getByRole('button', { name: 'Retry add task' }).click();
  await expect(addTaskDialog(page)).toHaveCount(0);
  const tasks = (await state(noema)).tasks;
  expect(tasks).toHaveLength(1);
  // The identity persisted before the first attempt is the one the server stored: replaying it returns this task.
  expect((await noema.api<Task>('POST', '/api/task-captures', pending)).id).toBe(tasks[0].id);
  expect(await taskCount(noema)).toBe(1);
});

test('a 401 unfreezes the input and Unlock stacks over Add task without discarding it', async ({ page, noema }) => {
  await failFetch(page, { path: '/api/task-captures', times: 1, fault: { status: 401, body: '{"detail":"Unlock Noema to continue"}', contentType: 'application/json' } });
  await gotoApp(page, noema, '#/plan');
  const dialog = await openAddTask(page);
  await rawInput(page).fill('Add after unlocking');
  await dialog.getByRole('button', { name: 'Add task' }).click();
  const unlock = page.getByRole('dialog', { name: 'Unlock Noema' });
  await expect(unlock).toBeVisible();
  await unlock.getByLabel('Access token').fill(E2E_TOKEN);
  await unlock.getByRole('button', { name: 'Unlock' }).click();
  await expect(unlock).toHaveCount(0);
  await expect(addTaskDialog(page)).toBeVisible();
  await expect(rawInput(page)).toBeEnabled();
  await expect(rawInput(page)).toHaveValue('Add after unlocking');
  await expect(dialog.getByRole('alert')).toHaveText('Not confirmed added. Your input is preserved. Unlock Noema to continue');
  await dialog.getByRole('button', { name: 'Add task' }).click();
  await expect(addTaskDialog(page)).toHaveCount(0);
  expect(await taskCount(noema)).toBe(1);
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `npm --prefix web test -- src/dialogs/TaskCapture.test.tsx; npm --prefix web run build && npm --prefix web run e2e -- e2e/task-capture.spec.ts`
Expected: FAIL — Vitest `Error: Failed to resolve import "./TaskCapture" from "src/dialogs/TaskCapture.test.tsx". Does the file exist?`; Playwright `Error: Timed out 5000ms waiting for expect(locator).toBeVisible()` for the `Add task` dialog (nothing renders `task-capture` yet).

- [ ] **Step 4: Write the implementation**

```tsx
// web/src/dialogs/TaskCapture.tsx
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent, type JSX, type KeyboardEvent } from 'react';
import { TaskFields } from '../components/TaskFields';
import { taskDraftStore, useTaskDraft } from '../local/taskDraft';
import { openDialog } from '../shell/dialogs';
import { useSnapshot } from '../state/queries';
import { S } from '../strings';
import { Dialog } from '../ui/Dialog';
import { toast } from '../ui/Toast';

export function TaskCaptureDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const { draft, submitting } = useTaskDraft();
  const tasks = useSnapshot().data?.tasks ?? [];
  const qc = useQueryClient();
  const form = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);
  const [notice, setNotice] = useState(() => (draft.pending ? S.previousUnconfirmed : ''));
  const [error, setError] = useState('');
  const frozen = draft.pending !== null || submitting;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || submitting) return;
    inFlight.current = true;
    setError('');
    try {
      const result = await taskDraftStore.submit();
      if (result.ok) {
        onClose();
        void qc.invalidateQueries({ queryKey: ['snapshot'] });
        const id = result.task.id;
        toast(result.toast, { action: { label: S.editAction, onClick: () => openDialog({ kind: 'task', id }) } });
        return;
      }
      setError(result.message);
      setNotice(result.frozen ? S.unconfirmedPreserved : '');
    } finally {
      inFlight.current = false;
    }
  }

  async function requestClose() {
    if (inFlight.current || submitting) return; // app.js:297
    try {
      await taskDraftStore.persist();
      onClose();
    } catch {
      setNotice(S.draftNotStored);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
      event.preventDefault();
      form.current?.requestSubmit();
    }
  }

  return (
    <Dialog title={S.addTask} onRequestClose={() => void requestClose()} className="task-panel">
      <form ref={form} className="task-capture-form" onSubmit={e => void submit(e)} onKeyDown={onKeyDown}>
        <label className="task-input-label" htmlFor="task-input">What do you need to do?</label>
        <textarea id="task-input" name="raw" required maxLength={16000} rows={4} placeholder="Review the cleanup path" data-autofocus=""
          value={draft.raw} disabled={frozen} onChange={e => { setNotice(''); taskDraftStore.setRaw(e.target.value); }} />
        <details id="task-details">
          <summary>Details</summary>
          <label className="field">Title override · optional
            <input name="title" maxLength={240} value={draft.fields.title ?? ''} disabled={frozen}
              onChange={e => { setNotice(''); taskDraftStore.setField('title', e.target.value); }} />
          </label>
          <TaskFields value={draft.fields} disabled={frozen} tasks={tasks} selfId={null}
            onChange={(name, value) => { setNotice(''); taskDraftStore.setField(name, value); }} />
        </details>
        <p className="small muted shortcut-help">Ctrl / ⌘ + Enter to add. Enter starts a new line.</p>
        <p className="small dim" id="task-draft-status" role="status">{notice || taskDraftStore.statusLabel()}</p>
        <p className="field-error" role="alert">{error}</p>
        <div className="dialog-actions">
          <button type="button" className="secondary" disabled={submitting} onClick={() => void requestClose()}>Close</button>
          <button type="submit" className="primary" disabled={submitting}>{draft.pending ? S.retryAddTask : S.addTask}</button>
        </div>
      </form>
    </Dialog>
  );
}
```

```tsx
// web/src/shell/DialogHost.tsx
import type { JSX } from 'react';
import { TaskCaptureDialog } from '../dialogs/TaskCapture';
import { closeDialog, useDialog } from './dialogs';

export function DialogHost(): JSX.Element | null {
  const request = useDialog();
  switch (request?.kind) {
    case 'task-capture': return <TaskCaptureDialog onClose={closeDialog} />;
    default: return null; // Phase 2b adds outbox, settings, note-history and sketch
  }
}
```

```tsx
// web/src/shell/AppShell.tsx — two edits
import { DialogHost } from './DialogHost';
// …and in the returned tree, between <ToastHost /> and <UnlockHost />:
      <ToastHost />
      <DialogHost />
      <UnlockHost />
```

- [ ] **Step 5: Run both to verify they pass**

Run: `npm --prefix web test -- src/dialogs/TaskCapture.test.tsx && npm --prefix web run build && npm --prefix web run e2e -- e2e/task-capture.spec.ts`
Expected: Vitest PASS (10 tests); Playwright `29 passed`.

- [ ] **Step 6: Commit**

```bash
git add web/src/dialogs/TaskCapture.tsx web/src/dialogs/TaskCapture.test.tsx web/src/shell/DialogHost.tsx web/src/shell/AppShell.tsx web/e2e/task-capture.spec.ts
git commit -m "feat(web): add frictionless Add task with unconfirmed-retry safety"
```

### Task 20: Task detail (`TaskDetailDialog`) — next action first, runs, reminders, links

**Files:**
- Create: `web/src/dialogs/TaskDetail.tsx` (port of `public/app.js:371-381, 501, 515-520`; handbook §14 detail order)
- Modify: `web/src/shell/DialogHost.tsx` (add the `task` case)
- Modify: `web/e2e/plan.spec.ts`, `web/e2e/now.spec.ts`, `web/e2e/task-capture.spec.ts` (append the detail-dependent rows)
- Create: `web/e2e/notifications.spec.ts` (contract §9.4)
- Test: `web/src/dialogs/TaskDetail.test.tsx`

**Interfaces:**
- Consumes: `call` from `../api/client`; `TaskSchema` and types from `../api/schemas`; `confirmFocusChange` (Task 11); `PriorityControl` (Task 15); `age`, `dateLabel`, `fromLocal` from `../domain/format`; `RUN_LABEL`, `STATUS_LABEL`, `isSessionUrl` (Task 3); `captureDraftStore` from `../local/drafts`; `rearmReminder` (Task 10); `useSnapshot`, `useSetFocus`, `usePatchTask`, `useEndTracking`, `useCreateReminder`, `useSnoozeReminder`, `useDismissReminder` from `../state/queries`; `Dialog` (Task 5); `toast`, `toastError`, `messageOf` (Task 4); `useNavigate`, `useQuery`.
- Produces: `export function TaskDetailDialog(props: { id: string; onClose: () => void }): JSX.Element;`
  Order: project, priority (with reason), state → **Continue here** (next action) → Context, Waiting on, dates, estimate, capture explanation, original input → actions (Focus on this, Open session, Park/Unpark, Complete/Reopen) → Agent runs → Reminders → Linked learning notes → Connect an agent. A task missing from the snapshot (for example right after a lost post-save refresh) is fetched with `GET /api/tasks/{id}` (local query key `['task', id]`).

- [ ] **Step 1: Write the failing unit test**

```tsx
// web/src/dialogs/TaskDetail.test.tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Focus, Snapshot } from '../api/schemas';
import { fromLocal } from '../domain/format';
import { makeNoteSummary, makeRun, makeSnapshot, makeTask } from '../test/fixtures';
import { polyfillDialog } from '../ui/testing';

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  call: vi.fn(),
  mutations: {} as Record<string, ReturnType<typeof vi.fn>>,
}));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => h.navigate }));
vi.mock('../api/client', async original => ({ ...(await original<typeof import('../api/client')>()), call: h.call }));
vi.mock('../state/queries', () => {
  const mutation = (name: string) => () => ({ mutateAsync: (h.mutations[name] ??= vi.fn(async () => ({}))), isPending: false });
  return {
    useSnapshot: vi.fn(), useSetFocus: mutation('focus'), usePatchTask: mutation('patch'), useEndTracking: mutation('end'),
    useCreateReminder: mutation('create'), useSnoozeReminder: mutation('snooze'), useDismissReminder: mutation('dismiss'), useSaveTask: mutation('save'),
  };
});
vi.mock('../local/drafts', () => ({ captureDraftStore: { setTaskId: vi.fn(async () => {}) } }));
vi.mock('../shell/notifications', () => ({ rearmReminder: vi.fn() }));
vi.mock('../ui/Toast', async original => ({ ...(await original<typeof import('../ui/Toast')>()), toast: vi.fn(), toastError: vi.fn() }));

import { captureDraftStore } from '../local/drafts';
import { rearmReminder } from '../shell/notifications';
import { useSnapshot } from '../state/queries';
import { S } from '../strings';
import { toast } from '../ui/Toast';
import { TaskDetailDialog } from './TaskDetail';

const focus = (task_id: string, pinned: boolean): NonNullable<Focus> => ({ task_id, pinned, source: 'manual', updated_at: '2026-10-08T11:00:00+00:00' });
function show(snapshot: Snapshot | undefined, id = 't') {
  vi.mocked(useSnapshot).mockReturnValue({ data: snapshot } as unknown as ReturnType<typeof useSnapshot>);
  const onClose = vi.fn();
  const view = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TaskDetailDialog id={id} onClose={onClose} /></QueryClientProvider>);
  return { onClose, ...view };
}
const m = (name: string) => h.mutations[name];

beforeAll(polyfillDialog);
beforeEach(() => { for (const key of Object.keys(h.mutations)) delete h.mutations[key]; });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });

describe('TaskDetailDialog', () => {
  it('shows the next action and source context before any activity log', () => {
    const run = makeRun({ agent: 'Fixture command wrapper', status: 'working', effective_status: 'working', stale: false, message: 'Running tests' });
    show(makeSnapshot({ tasks: [makeTask('t', {
      title: 'Review the fix', next_action: 'Check cleanup first.', detail: 'Original concern', original_input: 'review the fix tomorrow',
      interpretation: { explanation: 'Scheduling wording kept in the original.' }, runs: [run],
    })] }));
    const next = screen.getByRole('heading', { name: 'Continue here' });
    const runs = screen.getByRole('heading', { name: 'Agent runs' });
    expect(next.compareDocumentPosition(runs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Check cleanup first.')).toBeTruthy();
    expect(screen.getByText('Original concern')).toBeTruthy();
    expect(screen.getByText('At capture: Scheduling wording kept in the original.')).toBeTruthy();
    expect(screen.getByText('review the fix tomorrow')).toBeTruthy();
    expect(screen.getByText(/Fixture command wrapper · Reported running/)).toBeTruthy();
  });

  it('treats task text and links as untrusted', () => {
    const { container } = show(makeSnapshot({ tasks: [makeTask('t', {
      title: '<b>bold</b>', detail: '<script>alert(1)</script>', session_url: 'javascript:alert(1)',
    })] }));
    expect(screen.getByRole('dialog', { name: '<b>bold</b>' })).toBeTruthy();
    expect(container.ownerDocument.querySelector('dialog script, dialog b')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Open session ↗' })).toBeNull();
  });

  it('opens http(s) session links in a new tab without a referrer', () => {
    show(makeSnapshot({ tasks: [makeTask('t', { session_url: 'https://example.test/session' })] }));
    const link = screen.getByRole('link', { name: 'Open session ↗' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('shows dependencies, dates and the estimate only when known', () => {
    show(makeSnapshot({ tasks: [
      makeTask('t', { blocked_by: ['dep'], planned_on: '2026-10-09', estimate_minutes: 20 }),
      makeTask('dep', { title: 'Trace ownership' }),
    ] }));
    expect(screen.getByText('Waiting on: Trace ownership')).toBeTruthy();
    expect(screen.getByText('Planned day: 2026-10-09 · not a deadline or reminder.')).toBeTruthy();
    expect(screen.getByText('20 min · your estimate')).toBeTruthy();
    expect(screen.queryByText(/^Deadline:/)).toBeNull();
    expect(screen.queryByText(/^Available after:/)).toBeNull();
  });

  it('Focus on this asks before replacing a pin, then opens Overview', async () => {
    const { onClose } = show(makeSnapshot({ tasks: [makeTask('t'), makeTask('pin')], focus: focus('pin', true) }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: 'Focus on this' }));
    expect(m('focus')).not.toHaveBeenCalled(); // the hook mock exists from the first render
    fireEvent.click(screen.getByRole('button', { name: 'Focus on this' }));
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith({ to: '/overview' }));
    expect(m('focus')).toHaveBeenCalledWith({ taskId: 't' });
    expect(onClose).toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledWith('Replace your pinned focus with this task?');
  });

  it.each(['parked', 'done'] as const)('hides Focus on this for %s tasks', status => {
    show(makeSnapshot({ tasks: [makeTask('t', { status })] }));
    expect(screen.queryByRole('button', { name: 'Focus on this' })).toBeNull();
  });

  it('parks, unparks and completes through the fresh-version patch', async () => {
    const { rerender } = show(makeSnapshot({ tasks: [makeTask('t')] }));
    fireEvent.click(screen.getByRole('button', { name: 'Park' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Task parked.'));
    expect(m('patch')).toHaveBeenCalledWith({ id: 't', changes: { status: 'parked' } });
    vi.mocked(useSnapshot).mockReturnValue({ data: makeSnapshot({ tasks: [makeTask('t', { status: 'parked' })] }) } as unknown as ReturnType<typeof useSnapshot>);
    rerender(<QueryClientProvider client={new QueryClient()}><TaskDetailDialog id="t" onClose={vi.fn()} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Unpark' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Task unparked.'));
    expect(m('patch')).toHaveBeenLastCalledWith({ id: 't', changes: { status: 'todo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Complete' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(S.taskCompleted));
  });

  it('End tracking asks first and says it does not stop the agent', async () => {
    const working = makeRun({ id: 'run-1', status: 'working', effective_status: 'working', stale: false });
    const review = makeRun({ id: 'run-2', status: 'review', effective_status: 'review', stale: false });
    show(makeSnapshot({ tasks: [makeTask('t', { runs: [working, review] })] }));
    expect(screen.getAllByRole('button', { name: 'End tracking' })).toHaveLength(1);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: 'End tracking' }));
    expect(m('end')).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'End tracking' }));
    await waitFor(() => expect(m('end')).toHaveBeenCalledWith({ runId: 'run-1' }));
    expect(confirm).toHaveBeenCalledWith('End tracking this run? This does not stop or kill the external agent process.');
  });

  it('adds, snoozes (re-arming notifications) and dismisses reminders', async () => {
    const reminder = { id: 'r1', task_id: 't', at: '2026-10-08T11:00:00+00:00', state: 'due' as const, created_at: '2026-10-08T10:00:00+00:00' };
    show(makeSnapshot({ tasks: [makeTask('t', { reminders: [reminder] })] }));
    fireEvent.change(screen.getByLabelText('Reminder time'), { target: { value: '2026-10-11T09:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add reminder' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Reminder saved.'));
    expect(m('create')).toHaveBeenCalledWith({ taskId: 't', at: fromLocal('2026-10-11T09:30') });
    fireEvent.click(screen.getByRole('button', { name: '+20 min' }));
    await waitFor(() => expect(rearmReminder).toHaveBeenCalledWith('r1'));
    expect(m('snooze')).toHaveBeenCalledWith({ id: 'r1' });
    expect(toast).toHaveBeenCalledWith('Reminder moved forward by 20 minutes.');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(m('dismiss')).toHaveBeenCalledWith({ id: 'r1' }));
  });

  it('shows a rejected reminder inline', async () => {
    // Set before the first render: the hook mock captures h.mutations.create when the component renders.
    h.mutations.create = vi.fn(async () => { throw new Error('Include a timezone offset'); });
    show(makeSnapshot({ tasks: [makeTask('t')] }));
    fireEvent.change(screen.getByLabelText('Reminder time'), { target: { value: '2026-10-11T09:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add reminder' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Include a timezone offset'));
  });

  it('links notes and captures what you learned for this task', async () => {
    const { onClose } = show(makeSnapshot({ tasks: [makeTask('t')], notes: [makeNoteSummary('n1', { title: 'Two pointers', task_id: 't' })] }));
    fireEvent.click(screen.getByRole('button', { name: 'Two pointers ↗' }));
    expect(h.navigate).toHaveBeenCalledWith({ to: '/note/$id', params: { id: 'n1' } });
    fireEvent.click(screen.getByRole('button', { name: '＋ Capture what you learned' }));
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith({ to: '/capture' }));
    expect(captureDraftStore.setTaskId).toHaveBeenCalledWith('t');
    expect(onClose).toHaveBeenCalled();
  });

  it('fetches a task missing from the snapshot, and says when it is unavailable', async () => {
    h.call.mockResolvedValueOnce(makeTask('fresh', { title: 'Edit the acknowledged task' }));
    show(makeSnapshot(), 'fresh');
    expect(await screen.findByRole('dialog', { name: 'Edit the acknowledged task' })).toBeTruthy();
    expect(h.call).toHaveBeenCalledWith('task', expect.anything(), { params: { id: 'fresh' } });
    cleanup();
    h.call.mockRejectedValueOnce(new Error('Task not found'));
    show(makeSnapshot(), 'missing');
    expect(await screen.findByRole('dialog', { name: S.taskUnavailable })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Append the failing E2E rows (handbook trace U23; parity row `task_capture_check.py:221`)**

```ts
// web/e2e/plan.spec.ts — append
test('Task detail shows the next action and source before the activity log', async ({ page, noema }) => {
  const t = await task(noema, 'Review the proposed fix', { next_action: 'Check cleanup first.', detail: 'The slot may still point at the chunk.' });
  await agentRun(noema, t, 'needs_input');
  await gotoApp(page, noema, '#/plan');
  await page.getByRole('button', { name: /^Review the proposed fix/ }).click();
  const detail = page.getByRole('dialog', { name: 'Review the proposed fix' });
  await expect(detail.getByText('Check cleanup first.')).toBeVisible();
  await expect(detail.getByText('The slot may still point at the chunk.')).toBeVisible();
  const order = await detail.evaluate(d => {
    const headings = [...d.querySelectorAll('h3')].map(x => x.textContent);
    return [headings.indexOf('Continue here'), headings.indexOf('Agent runs')];
  });
  expect(order[0]).toBeGreaterThanOrEqual(0);
  expect(order[0]).toBeLessThan(order[1]);
  await expect(detail).toContainText('Needs your input');
  await expect(detail).toContainText('No explicit urgency; neutral default.');
});

test('Escape closes the detail and focus returns to the row', async ({ page, noema }) => {
  await task(noema, 'Read the chapter');
  await gotoApp(page, noema, '#/plan');
  const title = page.getByRole('button', { name: /^Read the chapter/ });
  await title.click();
  await expect(page.getByRole('dialog', { name: 'Read the chapter' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Read the chapter' })).toHaveCount(0);
  await expect(title).toBeFocused();
});

test('End tracking asks first; declining keeps the run', async ({ page, noema }) => {
  const t = await task(noema, 'Long agent job');
  const run = await agentRun(noema, t);
  await gotoApp(page, noema, '#/plan');
  await page.getByRole('button', { name: /^Long agent job/ }).click();
  const detail = page.getByRole('dialog', { name: 'Long agent job' });
  const runStatus = async () => (await serverState(noema)).runs.find(r => r.id === run.id)?.status;
  page.once('dialog', d => { expect(d.message()).toBe('End tracking this run? This does not stop or kill the external agent process.'); void d.dismiss(); });
  await detail.getByRole('button', { name: 'End tracking' }).click();
  expect(await runStatus()).toBe('working');
  page.once('dialog', d => void d.accept());
  await detail.getByRole('button', { name: 'End tracking' }).click();
  await expect.poll(runStatus).toBe('cancelled');
});

test('reminders: add, snooze by 20 minutes, dismiss', async ({ page, noema }) => {
  await task(noema, 'Revisit the allocator');
  await gotoApp(page, noema, '#/plan');
  await page.getByRole('button', { name: /^Revisit the allocator/ }).click();
  const detail = page.getByRole('dialog', { name: 'Revisit the allocator' });
  await detail.getByLabel('Reminder time').fill('2030-01-02T09:30');
  await detail.getByRole('button', { name: 'Add reminder' }).click();
  await expect(page.locator('.toast-layer')).toContainText('Reminder saved.');
  const reminders = async () => (await serverState(noema)).reminders;
  await expect.poll(async () => (await reminders()).length).toBe(1);
  await expect(detail.getByText(/^scheduled · /)).toBeVisible();
  await detail.getByRole('button', { name: '+20 min' }).click();
  await expect(page.locator('.toast-layer')).toContainText('Reminder moved forward by 20 minutes.');
  await detail.getByRole('button', { name: 'Dismiss' }).click();
  await expect.poll(async () => (await reminders()).length).toBe(0);
});

test('Parked is distinct from done and can be unparked', async ({ page, noema }) => {
  const t = await task(noema, 'Someday idea');
  await gotoApp(page, noema, '#/plan');
  await page.getByRole('button', { name: /^Someday idea/ }).click();
  const detail = page.getByRole('dialog', { name: 'Someday idea' });
  await detail.getByRole('button', { name: 'Park' }).click();
  await expect(page.locator('.toast-layer')).toContainText('Task parked.');
  await expect(detail.getByRole('button', { name: 'Unpark' })).toBeVisible();
  await page.keyboard.press('Escape');
  await view(page, 'Parked').click();
  await expect(rows(page)).toHaveText([/Someday idea/]);
  await view(page, 'Completed').click();
  await expect(rows(page)).toHaveCount(0);
  await view(page, 'Parked').click();
  await page.getByRole('button', { name: /^Someday idea/ }).click();
  await page.getByRole('dialog', { name: 'Someday idea' }).getByRole('button', { name: 'Unpark' }).click();
  await expect(page.locator('.toast-layer')).toContainText('Task unparked.');
  await expect.poll(async () => (await getTask(noema, t.id)).status).toBe('todo');
});

test('Focus on this asks before replacing a pin', async ({ page, noema }) => {
  const pinned = await task(noema, 'Pinned work');
  const other = await task(noema, 'Other work');
  await noema.api('POST', '/api/focus', { task_id: pinned.id, pinned: true });
  await gotoApp(page, noema, '#/plan');
  await page.getByRole('button', { name: /^Other work/ }).click();
  const detail = page.getByRole('dialog', { name: 'Other work' });
  page.once('dialog', d => void d.dismiss());
  await detail.getByRole('button', { name: 'Focus on this' }).click();
  expect((await serverState(noema)).focus?.task_id).toBe(pinned.id);
  page.once('dialog', d => void d.accept());
  await detail.getByRole('button', { name: 'Focus on this' }).click();
  await expect(page).toHaveURL(/#\/overview$/);
  expect((await serverState(noema)).focus).toMatchObject({ task_id: other.id, pinned: true });
});

test('session links open only http(s) URLs in a new tab without a referrer', async ({ page, noema }) => {
  await task(noema, 'Linked work', { session_url: 'https://example.test/session' });
  await gotoApp(page, noema, '#/plan');
  await page.getByRole('button', { name: /^Linked work/ }).click();
  const link = page.getByRole('dialog', { name: 'Linked work' }).getByRole('link', { name: 'Open session ↗' });
  await expect(link).toHaveAttribute('href', 'https://example.test/session');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});
```

```ts
// web/e2e/task-capture.spec.ts — append
test('Confirmation Edit opens the saved task even when post-save snapshot failed', async ({ page, noema }) => {
  await gotoApp(page, noema, '#/plan');
  await openAddTask(page);
  await rawInput(page).fill('Edit the acknowledged task despite failed refresh');
  await page.evaluate(() => {
    const original = window.fetch;
    let failNextState = false;
    window.fetch = async (input, init) => {
      if (String(input).startsWith('/api/state') && failNextState) {
        failNextState = false;
        return new Response('{"detail":"Injected outage"}', { status: 503, headers: { 'Content-Type': 'application/json' } });
      }
      const response = await original(input, init);
      if (String(input) === '/api/task-captures') failNextState = true;
      return response;
    };
  });
  await addTaskDialog(page).getByRole('button', { name: 'Add task' }).click();
  await expect(addTaskDialog(page)).toHaveCount(0);
  await page.locator('.toast-layer').getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit the acknowledged task despite failed refresh' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Add task' })).toHaveCount(0);
});
```

These Overview rows need Add task, Task detail and the Tasks screen, so they land here (parity rows `now_ui_check.py:212,217,276`, `verify.py:57,62,68`, `native_storage_check.py:267`; handbook trace R2):

```ts
// web/e2e/now.spec.ts — append
test('Now suggestion cannot silently replace pinned focus', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'available');
  const pinned = (await serverState(noema)).tasks.find(t => t.title === 'Read the ownership chapter')!;
  await noema.api('POST', '/api/focus', { task_id: pinned.id, pinned: true });
  await page.reload();
  await expect(recommendation(page).getByRole('button', { name: 'Start' })).toHaveCount(0);
  await recommendation(page).getByRole('button', { name: 'View next action' }).click();
  await expect(page.getByRole('dialog', { name: 'Continue the two-pointer exercise' })).toBeVisible();
  expect((await serverState(noema)).focus).toMatchObject({ task_id: pinned.id, pinned: true });
});

test('Declining explicit pinned replacement preserves focus', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'available');
  const pinned = (await serverState(noema)).tasks.find(t => t.title === 'Read the ownership chapter')!;
  await noema.api('POST', '/api/focus', { task_id: pinned.id, pinned: true });
  await page.reload();
  await recommendation(page).getByRole('button', { name: 'View next action' }).click();
  const detail = page.getByRole('dialog', { name: 'Continue the two-pointer exercise' });
  page.once('dialog', d => { expect(d.message()).toBe('Replace your pinned focus with this task?'); void d.dismiss(); });
  await detail.getByRole('button', { name: 'Focus on this' }).click();
  await expect(detail).toBeVisible();
  expect((await serverState(noema)).focus).toMatchObject({ task_id: pinned.id, pinned: true });
});

test('Human-attention action opens the real task/result details', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'attention');
  await recommendation(page).getByRole('button', { name: 'Open for review' }).click();
  await expect(page.getByRole('dialog', { name: 'Review the cleanup result' })).toContainText('Fixture command wrapper');
});

test('Mouse submission from Now reveals the new task without jumping the viewport', async ({ page, noema }) => {
  await task(noema, 'Read the ownership chapter');
  await gotoApp(page, noema);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: 'Add something for later' }).click();
  const add = page.getByRole('dialog', { name: 'Add task' });
  await add.getByLabel('What do you need to do?').fill('Check the cleanup path');
  await add.getByRole('button', { name: 'Add task' }).click();
  await expect(add).toHaveCount(0);
  await expect(page.locator('.toast-layer')).toContainText('Task added.');
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await recommendation(page).locator('details.alternatives summary').click();
  await expect(recommendation(page).locator('details.alternatives')).toContainText('Check the cleanup path');
});

test('Saved task is visible and reopenable from Now after reload; pin is preserved', async ({ page, noema }) => {
  const pinned = await task(noema, 'Study allocator cleanup');
  await noema.api('POST', '/api/focus', { task_id: pinned.id, pinned: true });
  await gotoApp(page, noema);
  await page.getByRole('button', { name: 'Add something for later' }).click();
  const add = page.getByRole('dialog', { name: 'Add task' });
  await add.getByLabel('What do you need to do?').fill('Practice LeetCode');
  await add.getByLabel('What do you need to do?').press('Control+Enter');
  await expect(add).toHaveCount(0);
  await page.reload();
  await expect(recommendation(page).locator('h2')).toHaveText('Practice LeetCode');
  await recommendation(page).getByRole('button', { name: 'View next action' }).click();
  await expect(page.getByRole('dialog', { name: 'Practice LeetCode' })).toContainText('Practice LeetCode');
  expect((await serverState(noema)).focus).toMatchObject({ task_id: pinned.id, pinned: true });
  await expect(page.locator('[data-focus-kind=pinned]')).toContainText('Pinned by you');
});

test('Separate focus, next actions and Tasks; colored priorities and manual completion persist without changing pin', async ({ page, noema }) => {
  const pinned = await task(noema, 'Study allocator cleanup');
  await task(noema, 'Inspect the allocator example', { priority: 'high' });
  await task(noema, 'Idempotent example', { priority: 'medium' });
  await noema.api('POST', '/api/focus', { task_id: pinned.id, pinned: true });
  await gotoApp(page, noema);
  await expect(page.locator('.focus-line')).toContainText('Study allocator cleanup');
  await expect(recommendation(page).locator('h2')).toHaveText('Inspect the allocator example');
  const alternatives = recommendation(page).locator('details.alternatives');
  await alternatives.locator('summary').click();
  await expect(alternatives.locator('.priority-control.priority-medium')).toBeVisible();
  await alternatives.getByRole('button', { name: 'Complete Idempotent example' }).click();
  await expect(page.locator('.toast-layer')).toContainText('Task completed.');
  await page.reload();
  expect((await serverState(noema)).tasks.find(t => t.title === 'Idempotent example')?.status).toBe('done');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Tasks' }).click();
  await page.getByRole('group', { name: 'Task views' }).getByRole('button', { name: 'Completed', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reopen Idempotent example' })).toBeVisible();
  expect((await serverState(noema)).focus).toMatchObject({ task_id: pinned.id, pinned: true });
});

test('Server restart retains manual priority, pinned focus and due reminder', async ({ page, noema }) => {
  const t = await task(noema, 'Revisit the allocator');
  await gotoApp(page, noema, '#/plan');
  await page.getByRole('combobox', { name: 'Priority for Revisit the allocator' }).selectOption('high');
  await expect(page.locator('.toast-layer')).toContainText('Priority updated.');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Overview' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('[data-focus-kind=pinned]')).toContainText('Pinned by you');
  await noema.api('POST', '/api/reminders', { task_id: t.id, at: new Date(Date.now() - 60_000).toISOString() });
  await noema.restart();
  await page.reload();
  await expect(page.locator('#connection-label')).toHaveText('Server connected');
  await expect(page.locator('[data-focus-kind=pinned]')).toContainText('Pinned by you');
  await expect(recommendation(page)).toContainText('You asked to revisit this.');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Tasks' }).click();
  await expect(page.getByRole('combobox', { name: 'Priority for Revisit the allocator' }).locator('option:checked')).toHaveText('high · Set by you');
  expect((await serverState(noema)).reminders.map(r => r.state)).toEqual(['due']);
});
```

Task links (parity rows `task_link_check.py:33,34,58,62`; the Python helper opens `/#task/<id>`) and reminder notifications (spec §4.6; contract §9.4 `notifications.spec.ts`) also need the task dialog:

```ts
// web/e2e/plan.spec.ts — append
test('Startup task link opens existing dialog over Plan', async ({ page, noema }) => {
  const t = await task(noema, 'Synthetic linked task', { priority: 'low', next_action: 'Read the saved synthetic action.' });
  await page.goto(`${noema.origin}/#task/${t.id}`);
  const dialog = page.getByRole('dialog', { name: 'Synthetic linked task' });
  await expect(dialog).toContainText('Read the saved synthetic action.');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/plan');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A little room to plan.');
});

test('Task link adds no main navigation/layout', async ({ page, noema }) => {
  const t = await task(noema, 'Synthetic linked task');
  await page.goto(`${noema.origin}/#/task/${t.id}`);
  await expect(page.getByRole('dialog', { name: 'Synthetic linked task' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link')).toHaveCount(4);
  await expect(page.locator('.sidebar')).toHaveCount(1);
  await expect(page.locator('main.content')).toHaveCount(1);
});

test('Task-link navigation never changes pin or manual priority', async ({ page, noema }) => {
  const t = await task(noema, 'Synthetic linked task', { priority: 'low' });
  await noema.api('POST', '/api/focus', { task_id: t.id, pinned: true });
  const before = await serverState(noema);
  await gotoApp(page, noema);
  for (const hash of [`#task/${t.id}`, `#/task/${t.id}`]) {
    await page.evaluate(h => { location.hash = h; }, hash);
    const dialog = page.getByRole('dialog', { name: 'Synthetic linked task' });
    await expect(dialog).toBeVisible();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/overview');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
  const after = await serverState(noema);
  expect(after.focus).toEqual(before.focus);
  expect(after.tasks.find(x => x.id === t.id)?.priority).toBe('low');
});

test('Missing task has truthful error, no fake action', async ({ page, noema }) => {
  await gotoApp(page, noema);
  await page.evaluate(() => { location.hash = '#task/missing-synthetic-task'; });
  await expect(page.locator('.toast-layer')).toHaveText(/Task unavailable\./);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('about:blank'); // force a cold start, not a same-document hash change
  await page.goto(`${noema.origin}/#/task/missing-synthetic-task`);
  await expect(page.locator('.toast-layer')).toHaveText(/Task unavailable\./);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
```

```ts
// web/e2e/notifications.spec.ts
import type { Page } from '@playwright/test';
import { runSql } from './db';
import { expect, gotoApp, test } from './fixtures';
import { serverState, task } from './nowSeed';
import type { NoemaServer } from './server';

type Shown = { title: string; body?: string; tag?: string; icon?: string };

test.beforeEach(async ({ page }) => {
  // Test-only Notification double: records what the page shows; permission is already granted.
  await page.addInitScript(() => {
    localStorage.setItem('noema-notifications', '1');
    const shown: unknown[] = [];
    (window as unknown as { __shown: unknown[] }).__shown = shown;
    class FakeNotification {
      static permission = 'granted';
      static requestPermission = async () => 'granted';
      constructor(title: string, options: NotificationOptions = {}) { shown.push({ title, ...options }); }
    }
    Object.defineProperty(window, 'Notification', { value: FakeNotification, configurable: true, writable: true });
  });
});

const shown = (page: Page) => page.evaluate(() => (window as unknown as { __shown: Shown[] }).__shown);
async function refetch(page: Page) {
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/state' && r.ok());
  await page.evaluate(() => window.dispatchEvent(new Event('noema:service-up')));
  await response;
}
async function dueReminder(noema: NoemaServer, title: string) {
  const t = await task(noema, title);
  const reminder = await noema.api<{ id: string }>('POST', '/api/reminders', { task_id: t.id, at: new Date(Date.now() - 60_000).toISOString() });
  return { t, reminder };
}

test('a due reminder notifies once per page session, tagged with its id and the hashed icon', async ({ page, noema }) => {
  const { reminder } = await dueReminder(noema, 'Revisit the allocator');
  await gotoApp(page, noema);
  await expect.poll(async () => (await shown(page)).length).toBe(1);
  const [first] = await shown(page);
  expect(first).toMatchObject({ title: 'Noema reminder', body: 'Revisit the allocator', tag: reminder.id });
  expect(first.icon).toMatch(/\/assets\/icon-[A-Za-z0-9_-]{8}\.svg$/);
  await refetch(page);
  await refetch(page);
  expect(await shown(page)).toHaveLength(1);
});

test('scheduled reminders never notify', async ({ page, noema }) => {
  const t = await task(noema, 'Later work');
  await noema.api('POST', '/api/reminders', { task_id: t.id, at: '2030-01-02T09:30:00+00:00' });
  await gotoApp(page, noema);
  await refetch(page);
  expect(await shown(page)).toHaveLength(0);
});

test('snoozing a reminder re-arms its notification', async ({ page, noema }) => {
  const { reminder } = await dueReminder(noema, 'Revisit the allocator');
  await gotoApp(page, noema, '#/plan');
  await expect.poll(async () => (await shown(page)).length).toBe(1);
  await page.getByRole('button', { name: /^Revisit the allocator/ }).click();
  await page.getByRole('dialog', { name: 'Revisit the allocator' }).getByRole('button', { name: '+20 min' }).click();
  await expect(page.locator('.toast-layer')).toContainText('Reminder moved forward by 20 minutes.');
  runSql(noema.dataDir, 'UPDATE reminders SET at=? WHERE id=?', [new Date(Date.now() - 60_000).toISOString(), reminder.id]);
  await refetch(page);
  await expect.poll(async () => (await shown(page)).length).toBe(2);
  expect((await serverState(noema)).reminders.map(r => r.state)).toEqual(['due']);
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `npm --prefix web test -- src/dialogs/TaskDetail.test.tsx; npm --prefix web run build && npm --prefix web run e2e -- e2e/plan.spec.ts e2e/now.spec.ts e2e/task-capture.spec.ts e2e/notifications.spec.ts`
Expected: FAIL — Vitest `Error: Failed to resolve import "./TaskDetail" from "src/dialogs/TaskDetail.test.tsx". Does the file exist?`; Playwright: every row that opens a task dialog (the new `plan.spec.ts` rows except "Missing task has truthful error, no fake action", the five appended `now.spec.ts` rows that click a task, the appended `task-capture.spec.ts` row and "snoozing a reminder re-arms its notification") fails with `Error: Timed out 5000ms waiting for expect(locator).toBeVisible()` on the task dialog; earlier rows and the two other notification rows (delivered by Tasks 10 and 14) pass.

- [ ] **Step 4: Write the implementation**

```tsx
// web/src/dialogs/TaskDetail.tsx
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent, type JSX } from 'react';
import { call } from '../api/client';
import { TaskSchema, type Snapshot, type SnapshotTask, type Task, type TaskStatus } from '../api/schemas';
import { confirmFocusChange } from '../components/focus';
import { PriorityControl } from '../components/PriorityControl';
import { age, dateLabel, fromLocal } from '../domain/format';
import { RUN_LABEL, STATUS_LABEL, isSessionUrl } from '../domain/tasks';
import { captureDraftStore } from '../local/drafts';
import { rearmReminder } from '../shell/notifications';
import { useCreateReminder, useDismissReminder, useEndTracking, usePatchTask, useSetFocus, useSnapshot, useSnoozeReminder } from '../state/queries';
import { S } from '../strings';
import { Dialog } from '../ui/Dialog';
import { messageOf, toast, toastError } from '../ui/Toast';

function SessionLink({ url }: { url: string }): JSX.Element | null {
  if (!isSessionUrl(url)) return null; // app.js:27 — http(s) only
  return <a className="text-button" href={url} target="_blank" rel="noopener noreferrer">Open session ↗</a>;
}

function TaskView({ task, snapTask, snapshot, onClose }: {
  task: Task; snapTask: SnapshotTask | undefined; snapshot: Snapshot | undefined; onClose: () => void;
}): JSX.Element {
  const navigate = useNavigate();
  const setFocus = useSetFocus();
  const patch = usePatchTask();
  const endTracking = useEndTracking();
  const createReminder = useCreateReminder();
  const snooze = useSnoozeReminder();
  const dismiss = useDismissReminder();
  const [reminderError, setReminderError] = useState('');
  const tasks = snapshot?.tasks ?? [];
  const linkedNotes = (snapshot?.notes ?? []).filter(n => n.task_id === task.id);
  const focusable = task.status !== 'done' && task.status !== 'parked'; // the server rejects focus on these

  async function focusThis() {
    if (!confirmFocusChange(snapshot?.focus ?? null, task.id)) return;
    try {
      await setFocus.mutateAsync({ taskId: task.id });
      onClose();
      void navigate({ to: '/overview' });
    } catch (error) { toastError(error); }
  }

  async function setStatus(status: TaskStatus, message: string) {
    try {
      await patch.mutateAsync({ id: task.id, changes: { status } });
      toast(message);
    } catch (error) { toastError(error); }
  }

  async function endRun(runId: string) {
    if (!window.confirm('End tracking this run? This does not stop or kill the external agent process.')) return;
    try { await endTracking.mutateAsync({ runId }); } catch (error) { toastError(error); }
  }

  async function addReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const at = fromLocal(String(new FormData(form).get('at') ?? ''));
    if (!at) return;
    setReminderError('');
    try {
      await createReminder.mutateAsync({ taskId: task.id, at });
      form.reset();
      toast('Reminder saved.');
    } catch (error) { setReminderError(messageOf(error)); }
  }

  async function snoozeReminder(id: string) {
    try {
      await snooze.mutateAsync({ id });
      rearmReminder(id);
      toast('Reminder moved forward by 20 minutes.');
    } catch (error) { toastError(error); }
  }

  async function dismissReminder(id: string) {
    try { await dismiss.mutateAsync({ id }); } catch (error) { toastError(error); }
  }

  async function captureForTask() {
    await captureDraftStore.setTaskId(task.id);
    onClose();
    void navigate({ to: '/capture' });
  }

  const parked = task.status === 'parked';
  const done = task.status === 'done';
  return (
    <>
      <div className="inline-actions">
        {task.project && <span className="pill">{task.project}</span>}
        {snapTask && <PriorityControl task={snapTask} />}
        <span className="small muted">{STATUS_LABEL[task.status]}</span>
      </div>
      {snapTask && <p className="small dim">{snapTask.priority_reason}</p>}
      {task.next_action && <><h3 className="subheading">Continue here</h3><p>{task.next_action}</p></>}
      {task.detail && <details open><summary>Context</summary><div className="original-block">{task.detail}</div></details>}
      {snapTask && snapTask.blocked_by.length > 0 && (
        <div className="notice">Waiting on: {snapTask.blocked_by.map(dep => tasks.find(t => t.id === dep)?.title ?? dep).join(', ')}</div>
      )}
      {task.due_at && <p className="small dim">Deadline: {dateLabel(task.due_at)}</p>}
      {task.not_before && <p className="small dim">Available after: {dateLabel(task.not_before)}</p>}
      {task.planned_on && <p className="small dim">Planned day: {task.planned_on} · not a deadline or reminder.</p>}
      {task.estimate_minutes != null && <p className="small dim">{task.estimate_minutes} min · your estimate</p>}
      {task.interpretation.explanation && <p className="small dim">At capture: {task.interpretation.explanation}</p>}
      {task.original_input && (
        <details>
          <summary>Original task input</summary>
          <pre className="original-block">{task.original_input}</pre>
          <p className="small muted">Limited capture rules, not AI interpretation. Your original stays unchanged when you edit.</p>
        </details>
      )}
      <div className="inline-actions">
        {focusable && <button type="button" className="primary" onClick={() => void focusThis()}>Focus on this</button>}
        <SessionLink url={task.session_url} />
        {!done && (
          <button type="button" className="quiet-button" onClick={() => void setStatus(parked ? 'todo' : 'parked', parked ? 'Task unparked.' : 'Task parked.')}>
            {parked ? 'Unpark' : 'Park'}
          </button>
        )}
        <button type="button" className="quiet-button" onClick={() => void setStatus(done ? 'todo' : 'done', done ? S.taskReopened : S.taskCompleted)}>
          {done ? 'Reopen' : 'Complete'}
        </button>
      </div>
      {snapTask && snapTask.runs.length > 0 && (
        <section aria-label="Agent runs">
          <h3 className="subheading">Agent runs</h3>
          {snapTask.runs.map(r => (
            <div className="run-detail" key={r.id}>
              <div className="small">{`${r.agent} · ${RUN_LABEL[r.effective_status]} · ${age(r.updated_at)}`}</div>
              {r.message && <p className="small dim">{r.message}</p>}
              <SessionLink url={r.session_url} />
              {(r.status === 'working' || r.status === 'needs_input') && (
                <button type="button" className="quiet-button small" onClick={() => void endRun(r.id)}>End tracking</button>
              )}
            </div>
          ))}
        </section>
      )}
      <section aria-label="Reminders">
        <h3 className="subheading">Reminders</h3>
        {(snapTask?.reminders ?? []).map(r => (
          <div className="token-row small" key={r.id}>
            <span>{`${r.state} · ${dateLabel(r.at)}`}</span>
            <span>
              <button type="button" className="quiet-button" onClick={() => void snoozeReminder(r.id)}>+20 min</button>
              <button type="button" className="quiet-button" onClick={() => void dismissReminder(r.id)}>Dismiss</button>
            </span>
          </div>
        ))}
        {!done && (
          <form className="inline-actions" onSubmit={e => void addReminder(e)}>
            <input type="datetime-local" name="at" required aria-label="Reminder time" />
            <button type="submit" className="secondary">Add reminder</button>
          </form>
        )}
        <p className="field-error" role="alert">{reminderError}</p>
        <p className="small muted">Times use this device’s timezone. Server-saved reminders survive closing the app; delivery requires a connected client.</p>
      </section>
      <section aria-label="Linked learning notes">
        <h3 className="subheading">Linked learning notes</h3>
        {linkedNotes.length
          ? linkedNotes.map(n => (
            <div key={n.id}>
              <button type="button" className="text-button" onClick={() => { onClose(); void navigate({ to: '/note/$id', params: { id: n.id } }); }}>{n.title} ↗</button>
            </div>
          ))
          : <p className="small muted">No notes linked yet.</p>}
        <button type="button" className="quiet-button small" onClick={() => void captureForTask()}>＋ Capture what you learned</button>
      </section>
      <details>
        <summary>Connect an agent</summary>
        <p className="small muted">Create a task-scoped token in Settings, then wrap your command. Task ID:</p>
        <code className="token-value">{task.id}</code>
        <pre className="original-block">{`python tools/agent.py --task ${task.id} -- your-command`}</pre>
      </details>
    </>
  );
}

export function TaskDetailDialog({ id, onClose }: { id: string; onClose: () => void }): JSX.Element {
  const snapshot = useSnapshot().data;
  const snapTask = snapshot?.tasks.find(t => t.id === id);
  // A just-acknowledged task may be missing from a failed post-save refresh.
  const fetched = useQuery({ queryKey: ['task', id], queryFn: () => call('task', TaskSchema, { params: { id } }), enabled: !snapTask });
  const task = snapTask ?? fetched.data;
  if (!task) {
    return (
      <Dialog title={fetched.isError ? S.taskUnavailable : 'Opening task…'} onRequestClose={onClose}>
        {fetched.isError && <p className="small dim">{messageOf(fetched.error)}</p>}
      </Dialog>
    );
  }
  return (
    <Dialog title={task.title} onRequestClose={onClose}>
      <TaskView task={task} snapTask={snapTask} snapshot={snapshot} onClose={onClose} />
    </Dialog>
  );
}
```

```tsx
// web/src/shell/DialogHost.tsx — add the import and the case
import { TaskDetailDialog } from '../dialogs/TaskDetail';
// inside the switch, before `case 'task-capture'`:
    case 'task': return <TaskDetailDialog key={request.id} id={request.id} onClose={closeDialog} />;
```

- [ ] **Step 5: Run both to verify they pass**

Run: `npm --prefix web test -- src/dialogs/TaskDetail.test.tsx && npm --prefix web run build && npm --prefix web run e2e -- e2e/plan.spec.ts e2e/now.spec.ts e2e/task-capture.spec.ts e2e/notifications.spec.ts`
Expected: Vitest PASS (13 tests); Playwright `105 passed` (plan 19, now 53, task-capture 30, notifications 3).

- [ ] **Step 6: Commit**

```bash
git add web/src/dialogs/TaskDetail.tsx web/src/dialogs/TaskDetail.test.tsx web/src/shell/DialogHost.tsx web/e2e/plan.spec.ts web/e2e/now.spec.ts web/e2e/task-capture.spec.ts web/e2e/notifications.spec.ts
git commit -m "feat(web): add task detail with next action first, runs and reminders"
```

### Task 21: Edit task (`TaskEditForm`) — versioned save, 409 conflict prompt, refetch-safe form

**Files:**
- Create: `web/src/dialogs/TaskEdit.tsx` (port of `public/app.js:331-344`, the Edit task branch of `taskForm`)
- Modify: `web/src/dialogs/TaskDetail.tsx` (an **Edit** action in `TaskView`; `TaskDetailDialog` switches to the editor and titles the dialog "Edit task", like `app.js:333`)
- Test: `web/src/dialogs/TaskEdit.test.tsx`; append to `web/e2e/task-capture.spec.ts` (parity rows `task_capture_check.py:118,124,126`) and `web/e2e/plan.spec.ts` (409 conflict); create `web/e2e/refetch.spec.ts` (spec §8 Refetch)

**Interfaces:**
- Consumes: `editableFields`, `keepTimestamps` (Task 3); `TaskFields`, `TaskFieldChange` (Task 16); `toast`, `messageOf` (Task 4); `useSaveTask` from `../state/queries` (contract §4.6: `{ id, body: TaskUpdateBody }`, `retry: 0`, invalidates `['snapshot']`); `ApiError`, `call` from `../api/client`; `TaskSchema`, `Task`, `TaskEditable`, `SnapshotTask` from `../api/schemas`; `S.taskSaved`, `S.editAction`; `useQueryClient`. E2E: `task`, `serverState` (Task 17 `nowSeed.ts`), `openAddTask`, `rawInput`, `addTaskDialog`, `state` (Task 19 `task-capture.spec.ts`), `getTask` (Task 18 `plan.spec.ts`).
- Produces (*new*): `export function TaskEditForm(props: { task: Task; tasks: SnapshotTask[]; onDone: () => void; onCancel: () => void }): JSX.Element;`
  The form copies the task into local state **once**, when it opens, and saves with the version it opened with (spec §4.3). Untouched `due_at`/`not_before` keep their stored precision (`keepTimestamps`, `app.js:344`). A 409 shows the server sentence (`store.py:183`: "This task changed. Reopen it before saving.") with a **Reopen** button that re-reads the task and loads it into the form; nothing is retried or overwritten. Details start collapsed (`task_capture_check.py:118`).

- [ ] **Step 1: Write the failing unit test**

```tsx
// web/src/dialogs/TaskEdit.test.tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { Task } from '../api/schemas';
import { makeTask } from '../test/fixtures';

const h = vi.hoisted(() => ({ save: vi.fn(), call: vi.fn() }));
vi.mock('../api/client', async original => ({ ...(await original<typeof import('../api/client')>()), call: h.call }));
vi.mock('../state/queries', () => ({ useSaveTask: () => ({ mutateAsync: h.save, isPending: false }) }));
vi.mock('../ui/Toast', async original => ({ ...(await original<typeof import('../ui/Toast')>()), toast: vi.fn() }));

import { S } from '../strings';
import { toast } from '../ui/Toast';
import { TaskEditForm } from './TaskEdit';

const stored = makeTask('t', {
  title: 'Original title', project: 'Research', priority: 'low', detail: 'Retain context', next_action: 'Read saved release order',
  due_at: '2026-11-20T17:22:33+00:00', not_before: '2026-10-01T11:23:45+00:00', planned_on: '2026-11-18', estimate_minutes: 25,
  dependencies: ['dep'], session_url: 'https://example.test/task', version: 4,
});
const tasks = [stored, makeTask('dep', { title: 'Fixture prerequisite' })];

function ui(task: Task, onDone = vi.fn(), onCancel = vi.fn()) {
  return <QueryClientProvider client={new QueryClient()}><TaskEditForm task={task} tasks={tasks} onDone={onDone} onCancel={onCancel} /></QueryClientProvider>;
}
const title = () => screen.getByLabelText('Title') as HTMLInputElement;
const alertText = () => screen.getByRole('alert').textContent;

beforeEach(() => { h.save.mockReset().mockResolvedValue(stored); h.call.mockReset(); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('TaskEditForm', () => {
  it('opens with Details collapsed and the title focused', () => {
    render(ui(stored));
    expect((document.querySelector('#task-details') as HTMLDetailsElement).open).toBe(false);
    expect(document.activeElement).toBe(title());
  });

  it('saves every field with the version it opened with and keeps untouched timestamps exactly', async () => {
    const onDone = vi.fn();
    render(ui(stored, onDone));
    fireEvent.change(title(), { target: { value: 'Manual correction, not an inference' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(h.save).toHaveBeenCalledWith({ id: 't', body: {
      title: 'Manual correction, not an inference', project: 'Research', detail: 'Retain context', next_action: 'Read saved release order',
      status: 'todo', priority: 'low', due_at: '2026-11-20T17:22:33+00:00', not_before: '2026-10-01T11:23:45+00:00', planned_on: '2026-11-18',
      estimate_minutes: 25, dependencies: ['dep'], session_url: 'https://example.test/task', expected_version: 4,
    } });
    expect(toast).toHaveBeenCalledWith(S.taskSaved);
  });

  it('a refetch with newer server data never replaces in-progress input or the opened version', async () => {
    const { rerender } = render(ui(stored));
    fireEvent.change(title(), { target: { value: 'Half-typed' } });
    rerender(ui({ ...stored, title: 'Changed elsewhere', version: 5 }));
    expect(title().value).toBe('Half-typed');
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(h.save).toHaveBeenCalledOnce());
    expect(h.save.mock.calls[0][0].body.expected_version).toBe(4);
  });

  it('a 409 shows the conflict, never retries, and Reopen loads the current version', async () => {
    h.save.mockRejectedValueOnce(new ApiError('http', 'This task changed. Reopen it before saving.', 409));
    h.call.mockResolvedValueOnce({ ...stored, title: 'Changed elsewhere', version: 5 });
    render(ui(stored));
    fireEvent.change(title(), { target: { value: 'My edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(alertText()).toBe('This task changed. Reopen it before saving.'));
    expect(h.save).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(title().value).toBe('Changed elsewhere'));
    expect(h.call).toHaveBeenCalledWith('task', expect.anything(), { params: { id: 't' } });
    expect(screen.queryByRole('button', { name: 'Reopen' })).toBeNull();
    expect(alertText()).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(2));
    expect(h.save.mock.calls[1][0].body).toMatchObject({ title: 'Changed elsewhere', expected_version: 5 });
  });

  it('other errors stay inline without Reopen', async () => {
    h.save.mockRejectedValueOnce(new ApiError('http', 'A task cannot depend on itself', 400));
    render(ui(stored));
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(alertText()).toBe('A task cannot depend on itself'));
    expect(screen.queryByRole('button', { name: 'Reopen' })).toBeNull();
  });

  it('a failed Reopen keeps the form and says why', async () => {
    h.save.mockRejectedValueOnce(new ApiError('http', 'This task changed. Reopen it before saving.', 409));
    h.call.mockRejectedValueOnce(new ApiError('network', 'Server unreachable. Your saved captures remain queued on this device.', null));
    render(ui(stored));
    fireEvent.change(title(), { target: { value: 'My edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(alertText()).toBe('Server unreachable. Your saved captures remain queued on this device.'));
    expect(title().value).toBe('My edit');
  });

  it('Cancel leaves without saving', () => {
    const onCancel = vi.fn();
    render(ui(stored, vi.fn(), onCancel));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(h.save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write the failing E2E tests**

```ts
// web/e2e/task-capture.spec.ts — append (parity rows task_capture_check.py:118,124,126; handbook trace R2)
const EDITABLE = ['title', 'project', 'detail', 'next_action', 'status', 'priority', 'due_at', 'not_before', 'planned_on', 'estimate_minutes', 'dependencies', 'session_url'];
// qa/task_capture_check.py:104-112: a captured task with every field populated through the real API, seconds precision included.
async function fullyPopulated(noema: NoemaServer) {
  const saved = await noema.api<Task>('POST', '/api/task-captures', { capture_id: crypto.randomUUID(), raw: 'Review the cleanup path', local_day: '2026-10-10', details: {} });
  const dependency = await noema.api<Task>('POST', '/api/tasks', { title: 'Fixture prerequisite' });
  const changed = await noema.api<Record<string, unknown>>('PUT', `/api/tasks/${saved.id}`, {
    title: saved.title, project: saved.project, detail: 'Retain context', next_action: 'Read saved release order', status: 'todo', priority: 'low',
    due_at: '2026-11-20T17:22:33+00:00', not_before: '2026-10-01T11:23:45+00:00', planned_on: '2026-11-18', estimate_minutes: 25,
    dependencies: [dependency.id], session_url: 'https://example.test/task', expected_version: saved.version,
  });
  return { saved, changed };
}
async function openEditor(page: Page, title: string) {
  await page.locator('.plan-list').getByRole('button', { name: new RegExp('^' + title) }).click();
  await page.getByRole('dialog', { name: title }).getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit task' });
  await expect(editor).toBeVisible();
  return editor;
}

test('Existing task Details starts collapsed', async ({ page, noema }) => {
  await fullyPopulated(noema);
  await gotoApp(page, noema, '#/plan');
  const editor = await openEditor(page, 'Review the cleanup path');
  await expect(editor.locator('#task-details')).not.toHaveAttribute('open', '');
  await expect(editor.getByLabel('Title', { exact: true })).toBeFocused();
});

test('Collapsed editor preserves every hidden field, exact timestamps and original', async ({ page, noema }) => {
  const { saved, changed } = await fullyPopulated(noema);
  await gotoApp(page, noema, '#/plan');
  const editor = await openEditor(page, 'Review the cleanup path');
  await editor.getByLabel('Title', { exact: true }).fill('Manual correction, not an inference');
  await editor.locator('#task-details summary').click();
  await editor.locator('#task-details summary').click();
  await editor.getByRole('button', { name: 'Save task' }).click();
  await expect(page.locator('.toast-layer')).toContainText('Task saved.');
  const updated = await noema.api<Record<string, unknown>>('GET', `/api/tasks/${saved.id}`);
  for (const key of EDITABLE.filter(k => k !== 'title')) expect(updated[key], key).toEqual(changed[key]);
  expect(updated.title).toBe('Manual correction, not an inference');
  expect(updated.original_input).toBe(saved.original_input);
});

test('Task save never replaces pinned focus', async ({ page, noema }) => {
  const { saved } = await fullyPopulated(noema);
  await noema.api('POST', '/api/focus', { task_id: saved.id, pinned: true });
  const pin = (await state(noema)).focus;
  await gotoApp(page, noema, '#/plan');
  const editor = await openEditor(page, 'Review the cleanup path');
  await editor.getByLabel('Title', { exact: true }).fill('Renamed while pinned');
  await editor.getByRole('button', { name: 'Save task' }).click();
  await expect(page.locator('.toast-layer')).toContainText('Task saved.');
  expect((await state(noema)).focus).toEqual(pin);
  await page.keyboard.press('Escape');
  await openAddTask(page);
  await rawInput(page).fill('A new task while pinned');
  await rawInput(page).press('Control+Enter');
  await expect(addTaskDialog(page)).toHaveCount(0);
  expect((await state(noema)).focus).toEqual(pin);
});
```

```ts
// web/e2e/plan.spec.ts — append
const EDIT_FIELDS = ['title', 'project', 'detail', 'next_action', 'status', 'priority', 'due_at', 'not_before', 'planned_on', 'estimate_minutes', 'dependencies', 'session_url'];
async function changeElsewhere(noema: NoemaServer, id: string, changes: Record<string, unknown>) {
  const fresh = await noema.api<Record<string, unknown>>('GET', `/api/tasks/${id}`);
  await noema.api('PUT', `/api/tasks/${id}`, { ...Object.fromEntries(EDIT_FIELDS.map(k => [k, fresh[k]])), ...changes, expected_version: fresh.version });
}

test('a 409 conflict shows Reopen and never overwrites', async ({ page, noema }) => {
  const t = await task(noema, 'Shared task');
  await gotoApp(page, noema, '#/plan');
  await page.getByRole('button', { name: /^Shared task/ }).click();
  await page.getByRole('dialog', { name: 'Shared task' }).getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit task' });
  await editor.getByLabel('Title', { exact: true }).fill('My stale edit');
  await changeElsewhere(noema, t.id, { title: 'Changed elsewhere' });
  await editor.getByRole('button', { name: 'Save task' }).click();
  await expect(editor.getByRole('alert')).toHaveText('This task changed. Reopen it before saving.');
  expect((await getTask(noema, t.id)).title).toBe('Changed elsewhere');
  await editor.getByRole('button', { name: 'Reopen' }).click();
  await expect(editor.getByLabel('Title', { exact: true })).toHaveValue('Changed elsewhere');
  await editor.getByLabel('Title', { exact: true }).fill('Merged by hand');
  await editor.getByRole('button', { name: 'Save task' }).click();
  await expect(page.locator('.toast-layer')).toContainText('Task saved.');
  expect((await getTask(noema, t.id)).title).toBe('Merged by hand');
});
```

```ts
// web/e2e/refetch.spec.ts
// spec §8 "Refetch: an edit in progress survives a snapshot refetch."
import type { Page } from '@playwright/test';
import { expect, gotoApp, test } from './fixtures';
import { task } from './nowSeed';

const EDIT_FIELDS = ['title', 'project', 'detail', 'next_action', 'status', 'priority', 'due_at', 'not_before', 'planned_on', 'estimate_minutes', 'dependencies', 'session_url'];
async function refetchSnapshot(page: Page) {
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/state' && r.ok());
  await page.evaluate(() => window.dispatchEvent(new Event('noema:service-up')));
  await response;
}

test('an edit in progress survives a snapshot refetch', async ({ page, noema }) => {
  const t = await task(noema, 'Shared task');
  await gotoApp(page, noema, '#/plan');
  await page.getByRole('button', { name: /^Shared task/ }).click();
  await page.getByRole('dialog', { name: 'Shared task' }).getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit task' });
  await editor.getByLabel('Title', { exact: true }).fill('Half-typed title');
  const fresh = await noema.api<Record<string, unknown>>('GET', `/api/tasks/${t.id}`);
  await noema.api('PUT', `/api/tasks/${t.id}`, { ...Object.fromEntries(EDIT_FIELDS.map(k => [k, fresh[k]])), next_action: 'Changed on another device', expected_version: fresh.version });
  await refetchSnapshot(page);
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel('Title', { exact: true })).toHaveValue('Half-typed title');
});

test('Add task input survives a snapshot refetch', async ({ page, noema }) => {
  await gotoApp(page, noema, '#/plan');
  await page.locator('.page-heading').getByRole('button', { name: 'Add task' }).click();
  const add = page.getByRole('dialog', { name: 'Add task' });
  await add.getByLabel('What do you need to do?').fill('Half-typed task');
  await task(noema, 'Created elsewhere');
  await refetchSnapshot(page);
  await expect(page.locator('.plan-list')).toContainText('Created elsewhere');
  await expect(add.getByLabel('What do you need to do?')).toHaveValue('Half-typed task');
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npm --prefix web test -- src/dialogs/TaskEdit.test.tsx; npm --prefix web run build && npm --prefix web run e2e -- e2e/task-capture.spec.ts e2e/plan.spec.ts e2e/refetch.spec.ts`
Expected: FAIL — Vitest `Error: Failed to resolve import "./TaskEdit" from "src/dialogs/TaskEdit.test.tsx". Does the file exist?`; Playwright: the five new edit rows (three `task-capture.spec.ts`, the `plan.spec.ts` conflict row and "an edit in progress survives a snapshot refetch") fail with `Error: locator.click: Timeout` on `getByRole('button', { name: 'Edit', exact: true })` inside the task dialog; "Add task input survives a snapshot refetch" already passes (Task 19 copies the draft once).

- [ ] **Step 4: Write the implementation**

```tsx
// web/src/dialogs/TaskEdit.tsx
// Port of public/app.js:331-344 (Edit task). Server values are copied into the form once, when it opens,
// so a snapshot refetch never replaces in-progress input (spec §4.3).
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type JSX } from 'react';
import { ApiError, call } from '../api/client';
import { TaskSchema, type SnapshotTask, type Task, type TaskEditable } from '../api/schemas';
import { TaskFields } from '../components/TaskFields';
import { editableFields, keepTimestamps } from '../domain/tasks';
import { useSaveTask } from '../state/queries';
import { S } from '../strings';
import { messageOf, toast } from '../ui/Toast';

export function TaskEditForm({ task, tasks, onDone, onCancel }: {
  task: Task; tasks: SnapshotTask[]; onDone: () => void; onCancel: () => void;
}): JSX.Element {
  const save = useSaveTask();
  const qc = useQueryClient();
  const [opened, setOpened] = useState<Task>(task); // the version and stored timestamps this form edits
  const [values, setValues] = useState<TaskEditable>(() => editableFields(task));
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [reopening, setReopening] = useState(false);

  function change<K extends keyof TaskEditable>(name: K, value: TaskEditable[K]): void {
    setValues(current => ({ ...current, [name]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.isPending) return;
    setError('');
    setConflict(false);
    try {
      await save.mutateAsync({ id: opened.id, body: { ...values, ...keepTimestamps(values, opened), expected_version: opened.version } });
      toast(S.taskSaved);
      onDone();
    } catch (err) {
      setError(messageOf(err));
      setConflict(err instanceof ApiError && err.status === 409); // a conflict never overwrites; the user reopens explicitly
    }
  }

  async function reopen() {
    setReopening(true);
    try {
      const fresh = await call('task', TaskSchema, { params: { id: opened.id } });
      setOpened(fresh);
      setValues(editableFields(fresh));
      setError('');
      setConflict(false);
      void qc.invalidateQueries({ queryKey: ['snapshot'] });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setReopening(false);
    }
  }

  return (
    <form className="task-edit-form" onSubmit={e => void submit(e)}>
      <label className="task-input-label">Title
        {/* autoFocus: the dialog is already open, so its mount-time data-autofocus does not apply here. */}
        <input name="title" required maxLength={240} autoFocus value={values.title} onChange={e => change('title', e.target.value)} />
      </label>
      <details id="task-details">
        <summary>Details</summary>
        <TaskFields value={values} onChange={change} disabled={false} tasks={tasks} selfId={opened.id} />
      </details>
      <p className="field-error" role="alert">{error}</p>
      {conflict && <button type="button" className="secondary" disabled={reopening} onClick={() => void reopen()}>Reopen</button>}
      <div className="dialog-actions">
        <button type="button" className="quiet-button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary" disabled={save.isPending}>Save task</button>
      </div>
    </form>
  );
}
```

In `web/src/dialogs/TaskDetail.tsx`:

1. Add to the imports:
```tsx
import { TaskEditForm } from './TaskEdit';
```
2. Change the `TaskView` signature and destructuring to take `onEdit`:
```tsx
function TaskView({ task, snapTask, snapshot, onClose, onEdit }: {
  task: Task; snapTask: SnapshotTask | undefined; snapshot: Snapshot | undefined; onClose: () => void; onEdit: () => void;
}): JSX.Element {
```
3. In the actions row, right after `<SessionLink url={task.session_url} />` (`app.js:375` order: Focus on this, session, Edit):
```tsx
        <button type="button" className="quiet-button" onClick={onEdit}>{S.editAction}</button>
```
4. Replace `TaskDetailDialog` with:
```tsx
export function TaskDetailDialog({ id, onClose }: { id: string; onClose: () => void }): JSX.Element {
  const [editing, setEditing] = useState(false);
  const snapshot = useSnapshot().data;
  const snapTask = snapshot?.tasks.find(t => t.id === id);
  // A just-acknowledged task may be missing from a failed post-save refresh.
  const fetched = useQuery({ queryKey: ['task', id], queryFn: () => call('task', TaskSchema, { params: { id } }), enabled: !snapTask });
  const task = snapTask ?? fetched.data;
  if (!task) {
    return (
      <Dialog title={fetched.isError ? S.taskUnavailable : 'Opening task…'} onRequestClose={onClose}>
        {fetched.isError && <p className="small dim">{messageOf(fetched.error)}</p>}
      </Dialog>
    );
  }
  return (
    <Dialog title={editing ? 'Edit task' : task.title} onRequestClose={onClose}>
      {editing
        ? <TaskEditForm task={task} tasks={snapshot?.tasks ?? []} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
        : <TaskView task={task} snapTask={snapTask} snapshot={snapshot} onClose={onClose} onEdit={() => setEditing(true)} />}
    </Dialog>
  );
}
```

- [ ] **Step 5: Run them to verify they pass**

Run: `npm --prefix web test -- src/dialogs/TaskEdit.test.tsx src/dialogs/TaskDetail.test.tsx && npm --prefix web run build && npm --prefix web run e2e -- e2e/task-capture.spec.ts e2e/plan.spec.ts e2e/refetch.spec.ts`
Expected: Vitest PASS (7 + 13 tests); Playwright `55 passed` (task-capture 33, plan 20, refetch 2).

- [ ] **Step 6: Commit**

```bash
git add web/src/dialogs/TaskEdit.tsx web/src/dialogs/TaskEdit.test.tsx web/src/dialogs/TaskDetail.tsx web/e2e/task-capture.spec.ts web/e2e/plan.spec.ts web/e2e/refetch.spec.ts
git commit -m "feat(web): edit tasks with versioned saves and an explicit conflict reopen"
```

### Task 22: Layout by form factor and accessibility floor (phone touch targets, contrast, keyboard)

**Files:**
- Modify: `web/src/styles/ui.css` (the phone touch-target rule from Task 14, which component classes currently undercut)
- Create: `web/e2e/layout.spec.ts` (parity rows `browser_check.py:147,152`, `now_ui_check.py:176`; handbook trace U1, U24, and the shell part of U10/U12, whose verbatim titles Phase 2b owns in `capture.spec.ts` and `notes.spec.ts`)
- Modify: `web/e2e/shell.spec.ts` (append parity row `verify.py:76` and trace U24 keyboard row; both need the Overview and Add task from Tasks 17 and 19)

**Interfaces:**
- Consumes: `seed`, `openKind`, `task`, `noHorizontalOverflow` (Task 17 `nowSeed.ts`); `gotoApp`, `test`, `expect` (P1 fixtures).
- Produces: no new exports. At phone widths every visible `button`, `a[href]`, `select`, `summary` and `input` is at least 44 × 44 px (spec §4.7). Today `.filter-chip`, `.quiet-button`, `.text-button`, `.icon-button` and `details > summary` set `min-height: 36px` with class selectors, which beat Task 14's type-selector floor.

- [ ] **Step 1: Write the failing E2E tests**

```ts
// web/e2e/layout.spec.ts
import type { Page } from '@playwright/test';
import { expect, gotoApp, test } from './fixtures';
import { noHorizontalOverflow, openKind, seed, task } from './nowSeed';

const LONG = 'Investigate-the-allocator-cleanup-path-without-any-spaces-' + 'x'.repeat(120);

async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>('button, a[href], select, summary, input:not([type="hidden"]), textarea')]
    .map(el => ({ el, box: el.getBoundingClientRect() }))
    .filter(({ el, box }) => box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== 'hidden')
    .filter(({ box }) => box.width < 43.5 || box.height < 43.5)
    .map(({ el, box }) => `${el.tagName.toLowerCase()}.${el.className} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}" ${Math.round(box.width)}×${Math.round(box.height)}`));
}
const sidebarBox = async (page: Page) => (await page.locator('.sidebar').boundingBox())!;

test('Phone layout has no horizontal overflow', async ({ page, noema }) => {
  await seed(noema, 'available');
  await task(noema, LONG);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const hash of ['#/overview', '#/plan']) {
    await gotoApp(page, noema, hash);
    expect(await noHorizontalOverflow(page), hash).toBe(true);
  }
  await page.locator('.page-heading').getByRole('button', { name: 'Add task' }).click();
  await page.getByRole('dialog', { name: 'Add task' }).locator('#task-details summary').click();
  expect(await noHorizontalOverflow(page)).toBe(true);
});

test('Tablet layout has no horizontal overflow', async ({ page, noema }) => {
  await seed(noema, 'available');
  await task(noema, LONG);
  for (const size of [{ width: 1024, height: 768 }, { width: 900, height: 700 }, { width: 820, height: 1180 }]) {
    await page.setViewportSize(size);
    for (const hash of ['#/overview', '#/plan']) {
      await gotoApp(page, noema, hash);
      expect(await noHorizontalOverflow(page), `${size.width}×${size.height} ${hash}`).toBe(true);
    }
  }
});

// Trace U10/U12 titles belong to Phase 2b (capture.spec.ts, notes.spec.ts); these two cover the shell part.
test('Phone width moves the navigation to a bottom bar and gives content the full width', async ({ page, noema }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page, noema);
  const bar = await sidebarBox(page);
  expect(Math.round(bar.y + bar.height)).toBe(844);
  expect(Math.round(bar.width)).toBe(390);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link')).toHaveText(['Overview', 'Capture', 'Notes', 'Tasks']);
  await nav.getByRole('link', { name: 'Capture' }).click();
  const content = (await page.locator('main.content').boundingBox())!;
  expect(Math.round(content.x)).toBe(0);
  expect(Math.round(content.width)).toBe(390); // no sidebar column beside the writing area
  expect(await noHorizontalOverflow(page)).toBe(true);
});

test('Portrait tablet uses the phone bottom bar; landscape tablet keeps the sidebar', async ({ page, noema }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await gotoApp(page, noema);
  let bar = await sidebarBox(page);
  expect(Math.round(bar.y + bar.height)).toBe(1180);
  expect(Math.round(bar.width)).toBe(820);
  await page.setViewportSize({ width: 900, height: 700 }); // tablet landscape keeps the sidebar
  bar = await sidebarBox(page);
  expect(Math.round(bar.x)).toBe(0);
  expect(Math.round(bar.height)).toBe(700);
  expect(bar.width).toBeLessThan(200);
});

test('Readable body/secondary text meets a 4.5 contrast ratio', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'available');
  const ratios = await page.evaluate(() => {
    const lum = (color: string) => {
      const v = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(x => x / 255).map(x => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    };
    const background = lum(getComputedStyle(document.body).backgroundColor);
    return ['.recommendation p', '.focus-kind', '.page-heading p', '#connection-label', '.status-summary', '.recommendation .eyebrow'].map(selector => {
      const el = document.querySelector(selector);
      return [selector, el ? (lum(getComputedStyle(el).color) + 0.05) / (background + 0.05) : 0] as const;
    });
  });
  for (const [selector, ratio] of ratios) expect(ratio, selector).toBeGreaterThanOrEqual(4.5);
});

test('Phone touch targets are at least 44×44 px', async ({ page, context, noema }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openKind(page, context, noema, 'available');
  expect(await smallTargets(page)).toEqual([]);
  await gotoApp(page, noema, '#/plan');
  expect(await smallTargets(page)).toEqual([]);
  await page.locator('.page-heading').getByRole('button', { name: 'Add task' }).click();
  await page.getByRole('dialog', { name: 'Add task' }).locator('#task-details summary').click();
  expect(await smallTargets(page)).toEqual([]);
});

test('Plan rows are compact single lines at desktop width', async ({ page, noema }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  for (const title of ['Read the chapter', 'Review the fix', 'Trace ownership', 'Check duplicates', 'Write the summary']) await task(noema, title, { project: 'Learning' });
  await gotoApp(page, noema, '#/plan');
  const rows = page.locator('.plan-list .task-row');
  await expect(rows).toHaveCount(5);
  for (const row of await rows.all()) {
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(72);
    expect(await row.locator('.task-title > span').evaluate(el => el.getClientRects().length)).toBe(1);
  }
});
```

```ts
// web/e2e/shell.spec.ts — append
test('Every control is keyboard reachable with a visible focus ring', async ({ page, noema }) => {
  await noema.api('POST', '/api/tasks', { title: 'Read the ownership chapter' });
  await gotoApp(page, noema);
  const seen = new Set<string>();
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      return { name: el.getAttribute('aria-label') || el.textContent?.trim() || el.tagName, ring: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2 };
    });
    if (!focused) continue;
    expect(focused.ring, `visible focus ring on ${focused.name}`).toBe(true);
    seen.add(focused.name);
  }
  for (const name of ['Collapse sidebar', 'Overview', 'Capture', 'Notes', 'Tasks', 'Settings', 'Available time', 'Start']) expect(seen.has(name), name).toBe(true);
});

test('Open desktop panel becomes a modal on resize; narrow dialog traps Tab and Escape closes', async ({ page, noema }) => {
  await page.setViewportSize({ width: 1546, height: 835 });
  await gotoApp(page, noema, '#/plan');
  await page.locator('.page-heading').getByRole('button', { name: 'Add task' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add task' });
  expect(await dialog.evaluate(d => d.matches(':modal'))).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await dialog.evaluate(d => d.matches(':modal'))).toBe(true);
  for (let i = 0; i < 14; i += 1) {
    await page.keyboard.press('Tab');
    // The background is inert: focus is inside the dialog or nowhere (headless has no browser chrome), never behind it.
    expect(await dialog.evaluate(d => document.activeElement === document.body || d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm --prefix web run build && npm --prefix web run e2e -- e2e/layout.spec.ts e2e/shell.spec.ts`
Expected: FAIL — only "Phone touch targets are at least 44×44 px" fails, with a diff listing entries such as `button.filter-chip "Open" 64×36` and `summary. "Agent reports 0" 358×36`; the other rows already pass because Tasks 14–19 shipped their layout.

- [ ] **Step 3: Write the implementation**

In `web/src/styles/ui.css`, inside `@media (max-width: 649.98px)`, replace
```css
  /* Touch targets ≥ 44 × 44 px at phone widths (spec §4.7). */
  button, a, select, summary { min-width: 44px; min-height: 44px; }
```
with
```css
  /* Touch targets ≥ 44 × 44 px at phone widths (spec §4.7). !important: an accessibility floor that component classes must not undercut. */
  button, a[href], select, summary, input:not([type='hidden']) { min-width: 44px !important; min-height: 44px !important; }
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npm --prefix web run build && npm --prefix web run e2e -- e2e/layout.spec.ts e2e/shell.spec.ts e2e/now.spec.ts e2e/task-capture.spec.ts`
Expected: Playwright `101 passed` (layout 7, shell 8, now 53, task-capture 33; the last two re-run because their overflow rows depend on the phone rule).

- [ ] **Step 5: Commit**

```bash
git add web/src/styles/ui.css web/e2e/layout.spec.ts web/e2e/shell.spec.ts
git commit -m "fix(web): enforce 44 px phone touch targets and cover layouts by form factor"
```

### Task 23: Handbook trace rows for this phase and the phase gate

**Files:**
- Modify: `docs/superpowers/specs/handbook-trace.md` (append the section below at the end; `01-foundation.md` Task 1 created the file and already names this plan's tasks in its base rows; `04-terrain.md` and `05-electron.md` append their own sections later; only `06-cutover.md` changes the Status column)
- Test: an inline title check (Step 1) that every test title the section cites exists verbatim in the cited file

**Interfaces:**
- Consumes: the test titles written in Tasks 1–22.
- Produces: a `## Phase 2a — Shell, Now, Plan, tasks` table mapping each owned spec §4.7 bullet to its task and test.

- [ ] **Step 1: Write the failing check**

Save as `${TMPDIR:-/tmp}/noema-2a/check_trace.py` (scratch, never committed):
```python
"""Every test title cited by the Phase 2a handbook-trace section must exist verbatim in the cited file."""
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1])
text = (root / 'docs/superpowers/specs/handbook-trace.md').read_text()
marker = '## Phase 2a — Shell, Now, Plan, tasks'
if marker not in text:
    raise SystemExit(f'missing section: {marker}')
missing, checked = [], 0
for line in text.split(marker, 1)[1].splitlines():
    cells = line.split('|')
    if len(cells) < 7 or not cells[1].strip() or cells[1].strip() in ('ID', '---'):
        continue
    current = None
    for token in re.finditer(r'`(web/[^`]+)` ›|"([^"]+)"', cells[5]):
        if token.group(1):
            current = token.group(1)
            continue
        checked += 1
        if current is None or token.group(2) not in (root / current).read_text():
            missing.append(f'{current} › {token.group(2)}')
print(f'checked {checked} titles')
print('\n'.join(missing) or 'all titles present')
raise SystemExit(1 if missing else 0)
```
Run: `mkdir -p "${TMPDIR:-/tmp}/noema-2a" && python3 -I "${TMPDIR:-/tmp}/noema-2a/check_trace.py" /home/p4nic/code/noema`
Expected: FAIL with `missing section: ## Phase 2a — Shell, Now, Plan, tasks`.

- [ ] **Step 2: Append the trace section**

Append to `docs/superpowers/specs/handbook-trace.md`:

```markdown

## Phase 2a — Shell, Now, Plan, tasks

Plan: `docs/superpowers/plans/2026-10-10-react-electron/02-screens-core.md`. IDs are the base rows above with a `2a-` prefix (so a lookup of a base row ID, as the Phase 2b trace update does, still finds exactly one row) and mean "this phase's part of that bullet"; the test column lists the tests this phase owns. AI-assigned priority (spec §11.1) and daily slogans (§11.2) are not built here.

| ID | Spec §4.7 bullet (this phase's part) | Handbook | Task | Test (file › title) | Status |
|---|---|---|---|---|---|
| 2a-R1 | A task exists only through the explicit Add task action; Overview's empty state only offers it | §01, §06, §27 | 17, 19 | `web/e2e/task-capture.spec.ts` › "Add a task opens an implemented form and persists explicit intent"; `web/e2e/now.spec.ts` › "Empty workspace has no agent setup or all-complete claim" | planned |
| 2a-R2 | Nothing silently changes focus: Overview never replaces a pin, Focus on this asks first, task saves, task creation and task links leave the pin | §06, §08, §27 | 11, 17, 20, 21 | `web/e2e/now.spec.ts` › "Now suggestion cannot silently replace pinned focus"; "Declining explicit pinned replacement preserves focus"; "Observer metadata never overrides a pinned focus"; `web/e2e/task-capture.spec.ts` › "Task save never replaces pinned focus"; `web/e2e/plan.spec.ts` › "Task-link navigation never changes pin or manual priority" | planned |
| 2a-R6 | Pins and manual priority overrides win over automatic logic | §07, §08 | 2, 15, 18 | `web/src/domain/nowState.test.ts` › "deriving suggestions never changes a pinned focus"; "another available recommendation does not replace an actionable pin"; `web/e2e/plan.spec.ts` › "Manual priority control persists"; "Manual priority persists after reload" | planned |
| 2a-R7 | A completed run is review work, never Done; a stale run reads as unknown | §07 | 2, 15, 17 | `web/e2e/now.spec.ts` › "Completed agent result is still a review task, not completed work"; "Stale integration status is visibly unknown, not running or complete"; `web/src/domain/nowState.test.ts` › "stale reports do not masquerade as running" | planned |
| 2a-R8 | No fabricated effort, durations, dates or urgency; nothing actionable is a valid result | §08 | 2, 17 | `web/e2e/now.spec.ts` › "No duration, deadline or progress is fabricated"; `web/src/domain/nowState.test.ts` › "time filter never supplies an estimate for a focused task"; "parked work is not complete" | planned |
| 2a-U1 | Compact ordered rows; no oversized cards | §10–§14 | 15, 22 | `web/e2e/layout.spec.ts` › "Plan rows are compact single lines at desktop width" | planned |
| 2a-U2 | Variant B headings, subtitles and tagline kept in `web/src/copy.ts` (decision 18B) | §10 (18B) | 1 | `web/src/copy.test.ts` › "COPY keeps the variant B headings, subtitles and tagline verbatim" | planned |
| 2a-U3 | Greeting from the device clock and `display_name` | §11 | 1, 14, 17 | `web/src/copy.test.ts` › "greeting follows the device clock and display_name"; `web/e2e/shell.spec.ts` › "the avatar shows the display-name initial and is hidden without a name" | planned |
| 2a-U4 | Empty name: greeting without a name; avatar initial or hidden | §11 | 1, 14 | `web/src/copy.test.ts` › "greeting and avatar omit an empty display_name" | planned |
| 2a-U7 | Visible labels Overview, Capture, Notes, Tasks; route ids unchanged | §10 | 12, 14 | `web/e2e/shell.spec.ts` › "Navigation shows Overview, Capture, Notes and Tasks with matching accessible names" | planned |
| 2a-U8 | Overview: focus line with provenance, one recommendation with a plain reason and Start/Resume, Needs you, compact running summary | §08, §10 | 17 | `web/e2e/now.spec.ts` › "Primary suggestion is singular and alternatives start collapsed"; "Overview shows focus provenance, one recommendation with its reason, Needs you and a running summary"; "Inferred focus is separately labeled" | planned |
| 2a-U9 | Desktop sidebar collapses to icons, remembered per device | §10, §11 | 12 | `web/e2e/shell.spec.ts` › "Desktop sidebar collapses to icons and stays collapsed after reload" | planned |
| 2a-U10 | Phone: bottom navigation; the content column takes the full width (shell part; Capture full-screen is Phase 2b) | §12 | 14, 22 | `web/e2e/layout.spec.ts` › "Phone width moves the navigation to a bottom bar and gives content the full width"; "Phone layout has no horizontal overflow" | planned |
| 2a-U12 | Portrait collapses to the phone column; tablet landscape keeps the sidebar (shell part; the Notes pane is Phase 2b) | §13 | 14, 22 | `web/e2e/layout.spec.ts` › "Portrait tablet uses the phone bottom bar; landscape tablet keeps the sidebar"; "Tablet layout has no horizontal overflow" | planned |
| 2a-U17 | Storage-state labels in the shell: queued is never shown as draft or saved on server | §20 | 12 | `web/src/shell/StatusLine.test.tsx` › "keeps queued, draft and saved-on-server labels distinct in the shell (handbook §20)" | planned |
| 2a-U20 | Task rows: task, project, state, priority; due date and estimate only when known | §14 | 3, 15, 18 | `web/e2e/plan.spec.ts` › "Plan rows show task, project, state and priority; due date and estimate only when known" | planned |
| 2a-U21 | Priority editable in place; label from `priority_source`, unknown sources read Auto; reason on hover/focus and in detail | §08, §14 | 3, 15, 20 | `web/src/domain/tasks.test.ts` › "priorityLabel maps automatic/rules, ai, you and unknown sources"; `web/e2e/plan.spec.ts` › "Priority is editable in place and shows its source and reason"; "Task detail shows the next action and source before the activity log" | planned |
| 2a-U22 | Filtered views Needs you, Running, Available now, All | §14 | 3, 18 | `web/e2e/plan.spec.ts` › "Needs you, Running, Available now and All filter the task list" | planned |
| 2a-U23 | Detail: next action and source first; dependencies, dates and session links; Review result leads to the link; park/unpark | §07, §09, §14 | 15, 20 | `web/e2e/plan.spec.ts` › "Task detail shows the next action and source before the activity log"; "Review result opens the result or session link"; "Parked is distinct from done and can be unparked" | planned |
| 2a-U24 | Keyboard, visible focus, descriptive labels, status without colour, contrast ≥ 4.5, touch targets ≥ 44 px on phones | §14 | 4, 5, 12, 22 | `web/e2e/shell.spec.ts` › "Every control is keyboard reachable with a visible focus ring"; `web/e2e/layout.spec.ts` › "Readable body/secondary text meets a 4.5 contrast ratio"; "Phone touch targets are at least 44×44 px"; `web/src/shell/StatusLine.test.tsx` › "labels the connection in words, not colour alone" | planned |
```

- [ ] **Step 3: Run the check to verify it passes**

Run: `python3 -I "${TMPDIR:-/tmp}/noema-2a/check_trace.py" /home/p4nic/code/noema`
Expected: PASS — `checked 44 titles` and `all titles present`.

- [ ] **Step 4: Run the phase gate**

Run: `cd /home/p4nic/code/noema && npm --prefix web ci && npm --prefix web run build && npm --prefix web test && npm --prefix web run e2e && .venv/bin/python -m pytest` (the web gate, contract §0)
Expected: every command exits 0 (all Vitest files, a hashed production build, every Playwright spec present so far, all Python tests).

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/handbook-trace.md
git commit -m "docs: trace Phase 2a handbook bullets to their tests"
```

### Task 24 (runs after Phase 2b): Task links over Capture and note edit, and agent setup

This task needs Phase 2b's Capture editor (label "Rough learning note"), the note editor (**Edit**, field "Note") and the Settings agents section, so it runs after `03-screens-capture-notes.md` is complete. The mechanism it proves was built in Task 7 (`installModalLinks`): a runtime modal link restores the previous URL before the router sees it, so the screen underneath never unmounts. The `settings_link_check.py` rows (parity 123–129) are Phase 2b's (`settings.spec.ts`, its Task 13) and are not repeated here.

**Files:**
- Modify: `web/e2e/plan.spec.ts` (add one import line at the top; append parity rows `task_link_check.py:43,44,54,55`, rows 158–161, whose parity target is this file)
- Modify: `web/e2e/now.spec.ts` (append parity row `now_ui_check.py:196`, row 104, which needs Phase 2b's Settings agents section)
- Modify (only if a row fails): `web/src/routes/legacy.ts`

**Interfaces:**
- Consumes: `createNote` from `./screenTest` (Phase 2b Task 5); `task`, `serverState`, `openKind` (Task 17 `nowSeed.ts`); `gotoApp`, `test`, `expect` (P1 fixtures); Phase 2b's Settings dialog (title "Your workspace", agents section labels "Label", "Allowed tasks · agent tokens", button "Create token", `.token-value`).
- Produces: no new exports.

- [ ] **Step 1: Write the E2E tests**

Add to the imports at the top of `web/e2e/plan.spec.ts`:
```ts
import { createNote } from './screenTest';
```
Append to `web/e2e/plan.spec.ts`:
```ts
// The Python helper opens /#task/<id> in a running tab (spec §4.5). A link must never unmount the screen underneath.
const openLink = (page: Page, hash: string) => page.evaluate(h => { location.hash = h; }, hash);
const captureEditor = (page: Page) => page.getByLabel('Rough learning note');

async function taskLinkOverCapture(page: Page, noema: NoemaServer) {
  const t = await task(noema, 'Synthetic linked task', { priority: 'low' });
  await gotoApp(page, noema, '#/capture');
  await captureEditor(page).fill('Synthetic unsaved capture stays untouched.');
  await openLink(page, `#task/${t.id}`);
  const dialog = page.getByRole('dialog', { name: 'Synthetic linked task' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
}

async function taskLinkOverNoteEdit(page: Page, noema: NoemaServer) {
  const t = await task(noema, 'Synthetic linked task');
  const note = await createNote(noema, 'Synthetic saved note original.');
  await gotoApp(page, noema, `#/note/${note.id}`);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Note', { exact: true }).fill('Synthetic unsaved note edit.');
  await openLink(page, `#task/${t.id}`);
  const dialog = page.getByRole('dialog', { name: 'Synthetic linked task' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  return note;
}

test('Task link preserves unsaved Capture and route', async ({ page, noema }) => {
  await taskLinkOverCapture(page, noema);
  await expect(captureEditor(page)).toHaveValue('Synthetic unsaved capture stays untouched.');
  expect(await page.evaluate(() => location.hash)).toBe('#/capture');
});

test('Opening task never ingests a learning-note draft', async ({ page, noema }) => {
  await taskLinkOverCapture(page, noema);
  expect((await serverState(noema)).notes).toEqual([]);
});

test('Task link preserves note-edit text and route', async ({ page, noema }) => {
  const note = await taskLinkOverNoteEdit(page, noema);
  await expect(page.getByLabel('Note', { exact: true })).toHaveValue('Synthetic unsaved note edit.');
  expect(await page.evaluate(() => location.hash)).toBe(`#/note/${note.id}`);
});

test('Saved note original is unchanged', async ({ page, noema }) => {
  const note = await taskLinkOverNoteEdit(page, noema);
  expect((await noema.api<{ raw: string }>('GET', `/api/notes/${note.id}`)).raw).toBe('Synthetic saved note original.');
});
```

```ts
// web/e2e/now.spec.ts — append
test('Agent setup creates a real task-scoped token', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'available');
  await page.locator('details.agent-status summary').click();
  await page.getByRole('button', { name: 'Set up agent reporting' }).click();
  const dialog = page.getByRole('dialog', { name: 'Your workspace' });
  await dialog.getByLabel('Label').fill('Isolated UI token');
  const first = (await serverState(noema)).tasks[0];
  await dialog.getByLabel('Allowed tasks · agent tokens').selectOption([first.id]);
  await dialog.getByRole('button', { name: 'Create token' }).click();
  await expect(dialog.locator('.token-value')).toHaveText(/\S{20,}/);
  await expect.poll(async () => (await noema.api<{ name: string; scope: string }[]>('GET', '/api/tokens')).map(t => [t.name, t.scope])).toEqual([['Isolated UI token', 'agent']]);
});
```

- [ ] **Step 2: Run them**

Run: `npm --prefix web run build && npm --prefix web run e2e -- e2e/plan.spec.ts e2e/now.spec.ts`
Expected: PASS (`78 passed`: plan 24, now 54). These rows were written last because they need Phase 2b's screens, not because new code is missing: the behaviour comes from Tasks 7 and 17 and Phase 2b's Settings. If a task-link row fails because a screen unmounted, the router saw the link: check that `installModalLinks` is still installed before `createAppRouter` in `web/src/main.tsx` and that Phase 2b's screens did not add their own `hashchange`/`popstate` navigation; fix it in `web/src/routes/legacy.ts` and rerun.

- [ ] **Step 3: Commit**

```bash
git add web/e2e/plan.spec.ts web/e2e/now.spec.ts
git commit -m "test(web): prove task links never disturb open editors; agent setup issues a scoped token"
```

## Spec coverage

| Spec requirement (in this phase's scope) | Task |
|---|---|
| §4.2 Boot: `GET /api/state`, only on a 401 `POST /api/session {token:''}`, only on a second 401 Unlock (P2 `boot()`, wired in `main.tsx`) | 14 (boot.spec "loopback boot logs in automatically and never shows Unlock") |
| §4.2 `/api/session` exempt from the global 401 rule; wrong token is an inline field error | 13, 14 |
| §4.2 Unlock stacks over any open dialog and does not discard it | 6, 19 (E2E "a 401 unfreezes the input and Unlock stacks over Add task without discarding it") |
| §4.2 After unlock: refresh the snapshot, then flush the outbox | 6 |
| §4.2 A 401 during task capture unfreezes the input | 19 |
| §4.3 The UI never automatically retries a mutation | 15 ("never retries"), 19, 21 ("never retries") |
| §4.3 Every edit carries `expected_version`; a 409 shows a conflict prompt and never overwrites | 21 |
| §4.3 Complete/reopen/priority re-read the task and PUT with the fresh version (`usePatchTask`) | 15, 20 |
| §4.3 Refetches never replace in-progress input (TaskDetail edit, TaskCapture copy server data only when they open) | 19, 21 (`refetch.spec.ts`) |
| §4.3 While disconnected the last snapshot is shown with "Last known · " labels | 17, 18 |
| §4.4 Task capture: `pending` persisted before HTTP; "Draft storage failed. Task not added" | 19 |
| §4.4 Inputs frozen while pending; ack needs `id` and `original_input === raw` | 19 |
| §4.4 409/5xx/network stay frozen with "Retry add task"; 401/other 4xx unfreeze | 19 |
| §4.4 Escape, Close and backdrop save the draft first; a failed save keeps the dialog open; Close blocked while submitting | 19 |
| §4.4 Flush deletes only after a 2xx; 4xx stores `error`; 401/5xx/network stop without marking; triggers incl. `online` (boot and reconnect, seen through the shell) | `01-foundation.md` Task 19 (`outbox.spec.ts`), rerun against the full shell in Task 14; Task 14 (`shell.spec.ts` queued-capture indicator); the Outbox dialog is Phase 2b Task 8 |
| §4.4 "Saved to {folder}" only after a server acknowledgement for exactly one flushed item | `01-foundation.md` Task 19 (`outbox.spec.ts`), shown through `ToastHost` from Task 14 |
| §4.4 Labels and toasts copied verbatim from `public/app.js` | 4, 12, 13, 19, 20 |
| §4.5 Routes `#/overview` (default), `#/capture`, `#/notes`, `#/note/$id`, `#/plan`; modal `#/task/$id`, `#/settings` | 14 |
| §4.5 Modal opens replace the URL with the underlying route; cold start `#/task/$id` over Plan, `#/settings` over Overview | 7, 14, 20 ("Startup task link opens existing dialog over Plan") |
| §4.5 "Task unavailable." checked against the first loaded snapshot | 14, 20 ("Missing task has truthful error, no fake action") |
| §4.5 Legacy forms rewritten on boot and on every `hashchange` | 7, 14 |
| §4.5 Navigation guards and `beforeunload` (mechanism; Phase 2b registers the three guards) | 8 |
| §4.5 Keyboard: `n` (no dialog, no modifier, outside fields), Ctrl/Cmd+K, IME respected | 9, 14 |
| §4.5 Ctrl/Cmd+Enter submits Add task; plain Enter inserts a newline | 19 |
| §4.6 Remove demo content (fixtures, `DEMO_CLOCK`, hard-coded name and "V" avatar, demo labels, `?fixture=`/`?host=`, "Tonight", example code/SVG) | 1, 4 (icons without demo glyphs), 12 (no demo status/caption), 14 |
| §4.6 Nav accessible names match the visible text | 12, 14 |
| §4.6 Dialogs keep the focus trap, `inert` background, Escape and focus restore | 5, 20 ("Escape closes the detail and focus returns to the row"), 22 |
| §4.6 Toasts `role=status aria-live=polite`; errors `role=alert` | 4 |
| §4.6 Status never by colour alone; contrast ≥ 4.5:1 | 12, 22 |
| §4.6 No `dangerouslySetInnerHTML` with user content (task text is React text) | 15, 20; the Markdown renderer is Phase 2b Task 9 |
| §4.6 Notifications: `noema-notifications`, `state==='due'` only, once per id per session, snooze re-arms, tag = reminder id, hashed icon | 10, 20 (`notifications.spec.ts`) |
| §4.7 Product rules: notes and tasks separate; nothing silently changes priorities, deadlines or focus | 11, 17, 19, 20, 21 |
| §4.7 Pins and manual priority overrides win | 2, 11, 15, 17, 18 |
| §4.7 A completed run creates review work, never Done; a stale run reads as unknown | 2, 3, 15, 17 |
| §4.7 No fabricated effort/durations/dates/urgency; "Nothing actionable right now" is valid | 2, 3, 17 |
| §4.7 Look: minimal, compact ordered rows, limited accent, no oversized cards (variant B `theme.css`, `style.css`, `icons.tsx` reused, demo stripped) | 4, 12, 14, 15, 22 |
| §4.7 Slogans/headings/tagline kept in `web/src/copy.ts` (18B) | 1, 14, 17, 18 |
| §4.7 Greeting "Good morning/afternoon/evening, {name}." from the device clock; no name when empty; avatar initial or hidden | 1, 14, 17 |
| §4.7 Visible labels Overview, Capture, Notes, Tasks; route ids unchanged | 12, 14 |
| §4.7 Overview progressive disclosure (focus line + provenance, one recommendation + plain reason + Start/Resume, Needs you, compact running summary, rest on request) | 17 |
| §4.7 Layout: desktop collapsible sidebar remembered in localStorage | 12, 14 |
| §4.7 Layout: phone bottom navigation; tablet/landscape sidebar; portrait collapses to the phone column | 14, 22 |
| §4.7 Storage-state labels distinct (shell part: queued vs draft vs saved on server) | 12 |
| §4.7 Tasks: compact rows (task, project, state, priority); due date and estimate only when known | 3, 15, 18 |
| §4.7 Priority editable in place; "Auto · rules" / "Auto · AI" / "Set by you", unknown → "Auto"; `priority_reason` on hover/focus and in detail | 3, 15, 20 |
| §4.7 Filtered views Needs you, Running, Available now, All | 3, 18 |
| §4.7 Dependencies, not-before dates and session links in task detail; next action and source context before any activity log | 16, 20, 21 |
| §4.7 Review result leads to the result or session link, not a checkbox | 3, 15 |
| §4.7 Park/unpark; parked distinct from done | 3, 18, 20 |
| §4.7 Accessibility: keyboard navigation, visible focus, descriptive labels, touch targets ≥ 44×44 px at phone widths | 9, 12, 14, 22 |
| §4.7 Traceability rows in `handbook-trace.md` | 23 |
| §5 Shell: connection label, outbox indicator "N captures on this device", integration status | 12, 14 |
| §5 Now: focus provenance ("Pinned by you" / "Inferred from window metadata" / "Selected by you"), one primary, alternatives, attention, runs, waiting, time budget from saved estimates only, agent setup | 2 (22 `now_state` cases), 17 |
| §5 Focus pin/clear with confirmation before replacing or clearing a pin | 11, 17, 20 |
| §5 Plan: rows by state with project, priority (source label), due/planned dates; complete/reopen | 3, 15, 18 |
| §5 Add task (`docs/TASK_CAPTURE.md`) | 16, 19 |
| §5 Task detail: all fields, dependencies, runs, needs-input, session links (http/https, `noopener noreferrer`), reminders, linked capture | 16, 20, 21 |
| §5 Reminders: add, snooze 20 min, dismiss, notifications | 10, 20 |
| §5 Runs: needs-input/review/failed/stale, end tracking with the "does not stop the external agent" confirmation | 3, 17, 20 |
| §5 Unlock | 13, 14 |
| §5 Outbox dialog | Phase 2b Task 8 (this plan ships the shell button that opens it, Task 12) |
| §5 Desktop close checkpoint (page side) | Phase 2b Task 14 |
| §6.2 `vite:preloadError`: save drafts, then offer a reload | Phase 2b Task 14 |
| §6.3 Close contract page side | Phase 2b Task 14 |
| §8 Parity rows `tests/now_state.test.cjs` (22) | 2 |
| §8 Parity rows `qa/now_ui_check.py` (except `:163` Capture, `:222,228,235,241` Settings/kitten and `:252,260,266` terrain, owned elsewhere) | 17, 20, 22, 24 |
| §8 Parity rows `qa/task_capture_check.py` (except `:250`, Capture) | 19, 20, 21 |
| §8 Parity rows `qa/task_link_check.py` | 20, 24 |
| §8 Parity rows `qa/settings_link_check.py` | Phase 2b Task 13 (`settings.spec.ts`); this plan builds the in-place link mechanism (Task 7) and the cold-start `/settings` route (Task 14) |
| §8 Parity rows `verify.py:42,57,62,64,65,67,68,76,80,83`, `browser_check.py:109,114,117,147,152`, `native_storage_check.py:267` | 17, 18, 19, 20, 22 (rows `browser_check.py:141` and `native_storage_check.py:197,204,254,266` are `01-foundation.md` Task 19's `outbox.spec.ts`) |
| §8 Upgrade: old-shape outbox item uploads exactly once with its original id | `01-foundation.md` Task 19 (`outbox.spec.ts`), rerun in Task 14 |
| §8 Refetch: an edit in progress survives a snapshot refetch | 21 |
| §8 Cookie-only access: a non-loopback Host with a valid cookie never shows Unlock | `01-foundation.md` Task 19 (`serving.spec.ts`); Task 14 (boot.spec: Unlock, then the cookie alone after reload) |
| §8 CSP: zero violations (P1 auto fixture runs in every spec of this phase) | all E2E tasks |

Deliberately skipped (ponytail): AI-assigned priority (§11.1) and daily slogans (§11.2); no `guards.spec.ts` (Phase 2b registers the guards and tests them in `capture.spec.ts`/`notes.spec.ts`; Task 8 unit-tests the mechanism); no Firefox project; no persistence of the Plan filter across reloads (not in `app.js` or the spec).
