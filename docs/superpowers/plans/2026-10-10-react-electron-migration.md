# React + Electron migration: plan index

**Spec:** `docs/superpowers/specs/2026-10-10-react-electron-migration-design.md`. The
product source of truth is `docs/Noema-Handbook.md` (spec §4.7).

**Branch:** `feat/react-electron`. There is one cutover merge into `master`, and
only after the owner approves it.

**Status:** draft for owner review. Nothing is committed.

Execute the plans in order. Each phase ends with the gate passing:

```
npm --prefix web ci && npm --prefix web run build && npm --prefix web test && npm --prefix web run e2e && .venv/bin/python -m pytest
```

From Phase 4 onward, add `npm --prefix electron test` before pytest.

| # | Plan | Tasks | Delivers |
|---|---|---|---|
| 0 | `2026-10-10-react-electron/00-contract.md` | — | Binding names, types, file layout, pinned versions, and file ownership per phase. Read this first. |
| 1 | `…/01-foundation.md` | 19 | Parity map and handbook trace, toolchain, FastAPI serving and the 503 page, service worker, Vitest and Playwright harnesses, the whole data layer (API client, schemas, boot, IndexedDB drafts and outbox, query client and mutation hooks), upgrade/SW/CSP/cookie E2E tests |
| 2a | `…/02-screens-core.md` | 24 | Shell and layouts (collapsible sidebar, phone bottom nav), `copy.ts` slogans and greeting, Overview/Now, Tasks/Plan (filtered views, priority source labels), Add task, task detail, reminders and notifications, Unlock, guards and keyboard |
| 2b | `…/03-screens-capture-notes.md` | 15 | Capture (recorder, sketch with pen/eraser/undo/text, attachments), confirmation after Save with Open note / Change folder, Outbox dialog, Notes and note view, Settings (including `display_name` on the backend), close checkpoint |
| 3 | `…/04-terrain.md` | 9 | WebGL2 terrain rework, state machine, `?e2e=1` test seam, the single cutover budget measurement |
| 4 | `…/05-electron.md` | 16 | Electron shell and security handlers, permissions, close contract, protocol-2 managed lifecycle (Node and Python), all lifecycle and `_electron` tests, Electron parity rows |
| 5 | `…/06-cutover.md` | 13 | Deletions, sprite move, docs rewrite, SHA256SUMS, handbook §21 memory check, parity-map and handbook-trace gates, rollback notes, the merge |

**Gates checked in Phase 5:**
- Every row of `docs/superpowers/specs/parity-map.md` is green, or is a
  `drop (approved)`.
- Every spec §4.7 bullet in `docs/superpowers/specs/handbook-trace.md` has a passing
  test.

**Open items for the owner:**
1. Approve or reject the proposed parity drops: rows 28, 29 and 40 (old WebKit
   editor checks). This happens in `06-cutover.md` Task 11 Step 6.
2. Handbook trace U1 ("no excessive glow or ornamental headers") is covered only
   indirectly, by the compact-row height test. Decide whether that is enough.
