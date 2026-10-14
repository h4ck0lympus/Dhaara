# Phase 3 — Terrain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the experiment's per-vertex WebGL1 stroke field with a two-pass WebGL2 terrain. The terrain draws at 12 fps through `setTimeout` on a 0.5× backing store. It is static by default and pauses when the window is hidden, blurred or idle. Its alpha is exactly 0 under every reading or editing surface. It meets the spec §7 CPU/iGPU budget, measured once at cutover.

**Architecture:** `web/src/ui/field.ts` holds the pure logic: the state machine, constants, grid, quality step-down, backing size and quiet-rect packing. Vitest tests it in Node. `web/src/ui/fieldShaders.ts` holds four GLSL ES 3.00 strings:
- a height pass that renders 120×70 packed height/slope/comb values into an RGBA16F texture, falling back to RGBA8;
- an instanced stroke pass that reads that texture with `texelFetch`.

`web/src/ui/BackgroundField.tsx` owns the WebGL2 context, the timer loop, the observers and the `?e2e=1` seam. `AppShell` mounts it as its first child with `motion = snapshot.settings.motion ?? false`. Chromium Playwright tests read pixels through the seam to check the behaviour.

**Tech Stack:** React 19.3.0, TypeScript 5.9.3 (strict), Vite 6.4.4, Vitest 5.0.3 (+ jsdom 30.1.2, @testing-library/react 16.3.3), Playwright 1.64.0 (Chromium), WebGL2 / GLSL ES 3.00. The budget run uses the throwaway Python harness (decision 13B).

**Spec:** /home/p4nic/code/noema/docs/superpowers/specs/2026-10-10-react-electron-migration-design.md (sections §1 success criterion "terrain meets the measured budget", §2 decisions 7A/16B/13B, §4.7 Motion + Compute, §7 entirely, §8 unit "field" + `?e2e=1` seam rule, §9 TEST_REPORT terrain numbers) · **Contract:** /home/p4nic/code/noema/docs/superpowers/plans/2026-10-10-react-electron/00-contract.md

Contract naming note: the contract's phase table calls this phase **P5** (file `05-terrain.md`). This file is the same plan under the name the orchestrator uses (`04-terrain.md`, spec phase 3). Ownership follows contract §10, row P5. The sibling plans in this directory are named by spec phase, not by contract id: foundation (contract P1 + P2) = the `01-…` plan, shell and screens (contract P3 + P4) = `02-screens-core.md` and `03-screens-capture-notes.md`, Electron (contract P6, Electron rows) = the `05-…` plan, cutover (contract P6, cutover rows) = `06-cutover.md`.

## Prerequisites (which earlier phase files must be complete)

Each item is checked before Task 1. If any is missing, stop and report it; do not create it here.

- **Foundation (`01-…`, contract P1 + P2) complete.** It provides:
  - the `feat/react-electron` branch and the `web/` scaffold: `package.json` scripts, `vite.config.ts` with `test.include ['src/**/*.test.{ts,tsx}']`, `tsconfig.json` strict with `types: ["vite/client"]`, `playwright.config.ts`;
  - `web/index.html` with `<div id="root">`;
  - `web/src/globals.d.ts`, which declares `window.__noemaField?: { frames: number; readPixel(x, y): Promise<[number, number, number, number]> }`;
  - `web/e2e/server.ts`, which exports `startNoema`/`NoemaServer` with `api(method, path, body)`. That helper fetches `origin + path` (`01-foundation.md` Task 8, `fetch(origin + path, …)`), so the path **includes** `/api`: this plan passes `'/api/settings'`, like every sibling plan;
  - `web/e2e/fixtures.ts`, which exports `test`/`expect`/`gotoApp` (contract §9.2);
  - `docs/superpowers/specs/handbook-trace.md`;
  - `useSnapshot()` in `web/src/state/queries.ts` and `SettingsSchema.motion: boolean`.
- **`02-screens-core.md` (contract P3) complete.** It provides:
  - `web/src/shell/AppShell.tsx` (its Task 14). Its root is `<div className="app">`, it already reads `const snapshot = useSnapshot().data;`, and the `.app` rule in `web/src/styles/shell.css` carries `position: relative; isolation: isolate`, so a `z-index:-1` child paints above the app background. Task 7's screenshot test verifies this.
  - `web/src/ui/Dialog.tsx`, a native `<dialog>` with `data-quiet`, closed by Escape;
  - routes `#/overview|capture|notes|plan|settings`, each screen with an `<h1>` (`PageHeading`);
  - `StatusLine` showing "Server connected";
  - Nav label "Capture";
  - `COPY.capture.title` "Capture a thought.";
  - `web/e2e/shell.spec.ts` and `web/e2e/boot.spec.ts`.
- **`03-screens-capture-notes.md` (rest of contract P4) complete.** It provides:
  - screens whose reading and editing surfaces carry `data-quiet` (contract §0);
  - a Settings dialog whose motion checkbox keeps the accessible name **"Enable background motion"** and saves on change (`public/app.js:458,468`, parity).
- **Task 9 only:** the Electron plan (`05-…`) complete: `npm --prefix electron run build` succeeds and `electron/` launches with `--server` and `--profile`.

## Global Constraints (one line each, exact values copied verbatim from the spec that apply to this phase)

- "WebGL2 is required. Without WebGL2, the field shows the existing static fallback (`data-state="unsupported"`) and draws nothing animated."
- "A fragment shader renders height and slope for the 120×70 grid into an `RGBA16F` texture (`EXT_color_buffer_float`). If that extension is missing, it uses `RGBA8` with packed values. This is 8,400 `field()` evaluations per frame"
- "Instanced strokes (`drawArraysInstanced`, one instance per grid point, 2 vertices each) sample the height texture with `texelFetch`. The base and tip vertices share one fetch result."
- "`antialias: false`, `preserveDrawingBuffer: false`."
- "The backing store is 0.5× device pixels, upscaled with CSS."
- "Frames are scheduled with `setTimeout` at 12 fps. There is no `requestAnimationFrame` loop."
- "`QUALITY_STEPS` and slow-frame step-down are kept, driven by the measured draw time."
- "Recomputed by a `ResizeObserver` on the observed elements, plus a `MutationObserver` on the app root (childList, subtree) and the existing scroll listener. The 500 ms polling is removed."
- "A test opens a dialog and asserts the quiet rects update."
- "**Invariant:** the alpha under the reading column is 0. The pixel test reads it through the test seam below."
- "Inputs: `supported`, `documentHidden`, `windowBlurred`, `idle`, `reducedMotion`, `motionSetting`."
- "`static` (reduced motion, or the motion setting off); `paused` (hidden, blurred, or 60 s with no `pointermove`, `keydown`, `wheel`, `touchstart` or `focus`); `animated`. Each state is exposed as `data-state`."
- "The motion setting **defaults to off**, matching the server." (`noema/store.py:100` `'motion': False`)
- "`field.test.mjs` is rewritten for the new signature and grid, and ported to Vitest."
- "`window.__noemaField = {frames, readPixel(x, y)}`, present only when the page URL has `?e2e=1`. `readPixel` runs inside the draw callback. It ships but is inert without the flag."
- "No production test hooks are added, except the `?e2e=1` terrain seam." (§8)
- Budget: "whole Electron app process tree; Iris Xe; private headless Sway gles2; 1440×900 at scale 1; motion on, reduced motion off; 30 s samples, same method as the benchmark".
- Budget rows: "Animated … < 3% | < 6%", "Paused: idle timeout or blur | < 1% | ~0%", "Hidden | < 1% | 0%".
- "The budget is measured once at cutover with the scratch harness and recorded in TEST_REPORT."
- Handbook / §4.7: "**Motion:** slow, sparse and optional. It is absent when hidden or when reduced motion is set (§10, §21). The terrain stays inside the app and never under reading or editing surfaces."
- §4.7 Compute: "The quiet background target is < 1% of one core, which matches the paused/hidden budget in §7."
- Contract §0: "Every reading or editing surface … carries the attribute `data-quiet`. The terrain quiet selector is `[data-quiet]`."
- `01-foundation.md` Task 1 (binding): a parity-map or handbook-trace row's target test title is the source label verbatim. Terrain rows: parity 41, 113, 114, 115 and trace U25, all in `web/e2e/terrain.spec.ts`.
- Contract §0: commits use `git add <exact paths>` plus a Conventional Commit message. Each message ends with the attribution trailer that the executing session supplies; append it to every `-m` below.

## Review Focus (the five input classes/failure modes most likely to bite a user that the spec implies; for each, the owning task must include a test for it)

1. **Reading surfaces overlapping strokes.** Typical cases:
   - more quiet surfaces than the 6 shader slots, or nested ones;
   - a dialog that mounts or opens after the last measurement;
   - a surface that grows without a DOM mutation;
   - a surface scrolled into view.

   Any of these can leave strokes under text. Owners: Task 3 (`removeContained`, 7 nested surfaces fit the 6 slots), Task 4 (alpha is exactly 0 inside a rect) and Task 7 (dialog/MutationObserver, ResizeObserver and scroll pixel tests, plus the alpha-0 test on every route at 1440 px and 390 px).
2. **GPU capability variance.** Cases: no WebGL2, no `EXT_color_buffer_float` or an incomplete float framebuffer, and context loss mid-session. Any of these must leave the app usable and the state honest. Owners: Task 5 (jsdom unsupported test), Task 6 (no-WebGL2 E2E, context-loss E2E) and Task 7 (RGBA8 fallback draws and keeps alpha 0).
3. **Lifecycle inputs that must stop CPU/GPU work.** Cases: motion setting off (the default), reduced motion, a hidden document, window blur, and 60 s without input. Burning CPU in these states breaks the "< 1% of one core" target. Owners: Task 1 (all 64 input combinations), Task 6 (an E2E test per input, with frames counted) and Task 9 (measured budget).
4. **Viewport and pixel-ratio edge cases.** Cases: phone width, DPR 0/NaN/2/3, a zero-size viewport, and the CSS↔backing-pixel mapping used by both the shader and `readPixel`. Owners: Task 2 (`backingSize` cases) and Task 7 (alpha-0 test at 390×844).
5. **Slow devices and resume.** Cases: draw-time spikes must step quality down only after sustained slowness, never below the last step, and never thrash. Resuming after a pause must not jump the terrain. Owners: Task 2 (`stepQuality` hysteresis and floor) and Task 5 (time clamp `MAX_STEP_MS`, checked in source by Task 5's scheduling test).

---

### Task 1: Terrain state machine and constants (`field.ts`, part 1)

**Files:**
- Create: `web/src/ui/field.ts`
- Test: `web/src/ui/field.test.ts` (create; port of `experiments/ui-ab/scripts/field.test.mjs:4-8` for the new six-input signature)

**Interfaces:**
- Consumes: nothing.
- Produces (contract §7, exact):
  ```ts
  export type FieldState = 'animated' | 'static' | 'paused' | 'unsupported';
  export type FieldInputs = { supported: boolean; documentHidden: boolean; windowBlurred: boolean; idle: boolean; reducedMotion: boolean; motionSetting: boolean };
  export function fieldState(inputs: FieldInputs): FieldState;
  export const GRID_COLUMNS = 120, GRID_ROWS = 70, QUIET_SLOTS = 6;
  export const QUALITY_STEPS = [1, 0.75, 0.55] as const;
  export const FRAME_INTERVAL_MS = 1000 / 12, IDLE_TIMEOUT_MS = 60_000, BACKING_SCALE = 0.5;
  export const QUIET_SELECTOR = '[data-quiet]';
  export type Rect = { left: number; top: number; width: number; height: number };
  ```

- [ ] **Step 1: Write the failing test**

Create `web/src/ui/field.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  BACKING_SCALE,
  FRAME_INTERVAL_MS,
  GRID_COLUMNS,
  GRID_ROWS,
  IDLE_TIMEOUT_MS,
  QUALITY_STEPS,
  QUIET_SELECTOR,
  QUIET_SLOTS,
  fieldState,
  type FieldInputs,
} from './field';

const LIVE: FieldInputs = {
  supported: true,
  documentHidden: false,
  windowBlurred: false,
  idle: false,
  reducedMotion: false,
  motionSetting: true,
};

function allInputs(): FieldInputs[] {
  const keys = ['supported', 'documentHidden', 'windowBlurred', 'idle', 'reducedMotion', 'motionSetting'] as const;
  return Array.from({ length: 1 << keys.length }, (_, bits) =>
    Object.fromEntries(keys.map((key, i) => [key, Boolean(bits & (1 << i))])) as FieldInputs,
  );
}

describe('fieldState', () => {
  it('animates only when supported, motion is on, reduced motion is off and the window is visible, focused and recently used', () => {
    expect(fieldState(LIVE)).toBe('animated');
  });

  it('reports unsupported whenever WebGL2 is missing, whatever else is true', () => {
    for (const inputs of allInputs()) {
      if (!inputs.supported) expect(fieldState(inputs)).toBe('unsupported');
    }
  });

  it('is static when the motion setting is off (the server default) or reduced motion is set', () => {
    expect(fieldState({ ...LIVE, motionSetting: false })).toBe('static');
    expect(fieldState({ ...LIVE, reducedMotion: true })).toBe('static');
    expect(fieldState({ ...LIVE, reducedMotion: true, documentHidden: true })).toBe('static');
    expect(fieldState({ ...LIVE, motionSetting: false, idle: true, windowBlurred: true })).toBe('static');
  });

  it('pauses when the document is hidden, the window is blurred or the user is idle', () => {
    expect(fieldState({ ...LIVE, documentHidden: true })).toBe('paused');
    expect(fieldState({ ...LIVE, windowBlurred: true })).toBe('paused');
    expect(fieldState({ ...LIVE, idle: true })).toBe('paused');
  });

  it('never animates while any stopping or pausing input is set (all 64 combinations)', () => {
    for (const inputs of allInputs()) {
      const stopped =
        !inputs.supported || inputs.reducedMotion || !inputs.motionSetting ||
        inputs.documentHidden || inputs.windowBlurred || inputs.idle;
      expect(fieldState(inputs) === 'animated', JSON.stringify(inputs)).toBe(!stopped);
    }
  });
});

describe('field constants (spec §7)', () => {
  it('uses the 120×70 grid, 12 fps, a 60 s idle timeout, a 0.5× backing store and the [data-quiet] selector', () => {
    expect([GRID_COLUMNS, GRID_ROWS]).toEqual([120, 70]);
    expect(GRID_COLUMNS * GRID_ROWS).toBe(8400);
    expect(FRAME_INTERVAL_MS).toBeCloseTo(83.333, 3);
    expect(IDLE_TIMEOUT_MS).toBe(60_000);
    expect(BACKING_SCALE).toBe(0.5);
    expect(QUIET_SELECTOR).toBe('[data-quiet]');
    expect(QUIET_SLOTS).toBe(6);
    expect(QUALITY_STEPS).toEqual([1, 0.75, 0.55]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix web test -- src/ui/field.test.ts`
Expected: FAIL with `Failed to resolve import "./field" from "src/ui/field.test.ts". Does the file exist?`

- [ ] **Step 3: Minimal implementation**

Create `web/src/ui/field.ts`:
```ts
/** Pure helpers for the terrain background (spec §7). No DOM or WebGL access, so Vitest covers them in Node. */
export type FieldState = 'animated' | 'static' | 'paused' | 'unsupported';
export type FieldInputs = {
  supported: boolean;
  documentHidden: boolean;
  windowBlurred: boolean;
  idle: boolean;
  reducedMotion: boolean;
  motionSetting: boolean;
};
export type Rect = { left: number; top: number; width: number; height: number };

export const GRID_COLUMNS = 120, GRID_ROWS = 70, QUIET_SLOTS = 6;
export const QUALITY_STEPS = [1, 0.75, 0.55] as const;
export const FRAME_INTERVAL_MS = 1000 / 12, IDLE_TIMEOUT_MS = 60_000, BACKING_SCALE = 0.5;
export const QUIET_SELECTOR = '[data-quiet]';

export function fieldState(inputs: FieldInputs): FieldState {
  if (!inputs.supported) return 'unsupported';
  if (inputs.reducedMotion || !inputs.motionSetting) return 'static';
  if (inputs.documentHidden || inputs.windowBlurred || inputs.idle) return 'paused';
  return 'animated';
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npm --prefix web test -- src/ui/field.test.ts`
Expected: PASS, `Tests  6 passed (6)`.

- [ ] **Step 5: Commit**

```bash
git add web/src/ui/field.ts web/src/ui/field.test.ts
git commit -m "feat(web): add terrain state machine and constants"
```

---

### Task 2: Grid instances, quality step-down and backing size (`field.ts`, part 2)

**Files:**
- Modify: `web/src/ui/field.ts` (append after `fieldState`, end of file)
- Test: `web/src/ui/field.test.ts` (append; port of `field.test.mjs:9-32`: the `fieldDetail` cases at :9-21 become `gridSize`/`backingSize` cases because the 120×70 grid, 12 fps and 0.5× backing replace per-device detail, and the `buildGrid` case at :22-32 becomes `buildInstances` for the instanced `[u, v, seed]` layout)

**Interfaces:**
- Consumes: `GRID_COLUMNS`, `GRID_ROWS`, `QUALITY_STEPS`, `BACKING_SCALE` (Task 1).
- Produces:
  - contract §7, exact:
    ```ts
    export function buildInstances(columns: number, rows: number): Float32Array;   // [u, v, seed] per grid point; RangeError below 2×2
    export function stepQuality(state: { quality: number; slow: number }, drawMs: number): { quality: number; slow: number };   // quality = index into QUALITY_STEPS
    ```
  - **local additions** (this phase's file only, contract §10):
    ```ts
    export type GridSize = { columns: number; rows: number };
    export function gridSize(step: number): GridSize;   // GRID_* × step, step clamped to [last QUALITY_STEP, 1]; NaN → 1; each side ≥ 2
    export const SLOW_DRAW_MS = 8, SLOW_DRAWS_TO_STEP = 20;
    export function backingSize(cssWidth: number, cssHeight: number, devicePixelRatio: number): { width: number; height: number; scale: number };   // scale = (dpr>0 && finite ? dpr : 1) × BACKING_SCALE; sides ≥ 1
    ```

- [ ] **Step 1: Write the failing test**

Append to `web/src/ui/field.test.ts`:
```ts
import { SLOW_DRAWS_TO_STEP, SLOW_DRAW_MS, backingSize, buildInstances, gridSize, stepQuality } from './field';

describe('buildInstances', () => {
  it('emits [u, v, seed] per grid point in row order with normalized coordinates and stable seeds', () => {
    const grid = buildInstances(3, 2);
    expect(grid).toBeInstanceOf(Float32Array);
    expect(grid.length).toBe(3 * 2 * 3);
    expect([grid[0], grid[1]]).toEqual([0, 0]);
    expect([grid[3], grid[4]]).toEqual([0.5, 0]);
    expect([grid.at(-3), grid.at(-2)]).toEqual([1, 1]);
    for (let i = 0; i < grid.length; i += 3) {
      for (const value of [grid[i], grid[i + 1]]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      expect(grid[i + 2]).toBeGreaterThanOrEqual(0);
      expect(grid[i + 2]).toBeLessThan(1);
    }
    expect(buildInstances(3, 2)).toEqual(grid);
  });

  it('covers the full 120×70 grid with one instance per point', () => {
    expect(buildInstances(GRID_COLUMNS, GRID_ROWS).length).toBe(8400 * 3);
  });

  it('rejects grids below 2×2 and non-integer sizes', () => {
    expect(() => buildInstances(1, 5)).toThrow(RangeError);
    expect(() => buildInstances(5, 0)).toThrow(RangeError);
    expect(() => buildInstances(Number.NaN, 5)).toThrow(RangeError);
    expect(() => buildInstances(2.5, 5)).toThrow(RangeError);
  });
});

describe('gridSize', () => {
  it('maps each quality step to a smaller grid', () => {
    expect(QUALITY_STEPS.map((step) => gridSize(step))).toEqual([
      { columns: 120, rows: 70 },
      { columns: 90, rows: 53 },
      { columns: 66, rows: 39 },
    ]);
  });

  it('never goes below the last step or above full detail', () => {
    expect(gridSize(0)).toEqual(gridSize(QUALITY_STEPS[QUALITY_STEPS.length - 1]));
    expect(gridSize(4)).toEqual(gridSize(1));
    expect(gridSize(Number.NaN)).toEqual(gridSize(1));
  });
});

describe('stepQuality', () => {
  const slow = SLOW_DRAW_MS + 1;
  const fast = SLOW_DRAW_MS / 2;

  it('steps down one level only after more than 20 consecutive slow draws, then resets the counter', () => {
    let state = { quality: 0, slow: 0 };
    for (let i = 0; i < SLOW_DRAWS_TO_STEP; i++) state = stepQuality(state, slow);
    expect(state).toEqual({ quality: 0, slow: SLOW_DRAWS_TO_STEP });
    state = stepQuality(state, slow);
    expect(state).toEqual({ quality: 1, slow: 0 });
  });

  it('lets fast draws pay back slow ones so an occasional hitch never steps down', () => {
    let state = { quality: 0, slow: 0 };
    for (let i = 0; i < 200; i++) state = stepQuality(state, i % 2 ? slow : fast);
    expect(state.quality).toBe(0);
    expect(stepQuality({ quality: 0, slow: 0 }, fast)).toEqual({ quality: 0, slow: 0 });
  });

  it('never steps below the last quality level and keeps the counter bounded', () => {
    let state = { quality: QUALITY_STEPS.length - 1, slow: 0 };
    for (let i = 0; i < 1000; i++) state = stepQuality(state, slow);
    expect(state).toEqual({ quality: QUALITY_STEPS.length - 1, slow: SLOW_DRAWS_TO_STEP + 1 });
  });
});

describe('backingSize', () => {
  it('renders at half the device pixels', () => {
    expect(backingSize(1440, 900, 1)).toEqual({ width: 720, height: 450, scale: 0.5 });
    expect(backingSize(1440, 900, 2)).toEqual({ width: 1440, height: 900, scale: 1 });
    expect(backingSize(390, 844, 3)).toEqual({ width: 585, height: 1266, scale: 1.5 });
  });

  it('falls back to a pixel ratio of 1 and never returns an empty buffer', () => {
    expect(backingSize(1440, 900, 0)).toEqual({ width: 720, height: 450, scale: 0.5 });
    expect(backingSize(1440, 900, Number.NaN)).toEqual({ width: 720, height: 450, scale: 0.5 });
    expect(backingSize(0, 0, 1)).toEqual({ width: 1, height: 1, scale: 0.5 });
    expect(backingSize(1, 1, 1)).toEqual({ width: 1, height: 1, scale: 0.5 });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix web test -- src/ui/field.test.ts`
Expected: FAIL. The new suites error because `buildInstances`, `gridSize`, `stepQuality` and `backingSize` are not exported (`TypeError: … is not a function`), and `SLOW_DRAW_MS` is `undefined`. The six Task 1 tests still pass.

- [ ] **Step 3: Minimal implementation**

Append to `web/src/ui/field.ts`:
```ts
export type GridSize = { columns: number; rows: number };
export const SLOW_DRAW_MS = 8, SLOW_DRAWS_TO_STEP = 20;

/** One instance per grid point: [u, v, seed], row order (experiments field.ts:27-37 without the duplicated base/tip vertex). */
export function buildInstances(columns: number, rows: number): Float32Array {
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 2 || rows < 2) {
    throw new RangeError('Field grid needs at least 2x2 points');
  }
  const data = new Float32Array(columns * rows * 3);
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      data[i++] = c / (columns - 1);
      data[i++] = r / (rows - 1);
      data[i++] = fract(Math.sin(c * 12.9898 + r * 78.233) * 43758.5453);
    }
  }
  return data;
}

export function gridSize(step: number): GridSize {
  const last = QUALITY_STEPS[QUALITY_STEPS.length - 1];
  const scale = Number.isFinite(step) ? Math.min(1, Math.max(last, step)) : 1;
  return {
    columns: Math.max(2, Math.round(GRID_COLUMNS * scale)),
    rows: Math.max(2, Math.round(GRID_ROWS * scale)),
  };
}

// shortcut: drawMs is CPU submit time only (GPU time needs EXT_disjoint_timer_query_webgl2); upgrade if the Task 9 budget run shows GPU-bound frames.
export function stepQuality(state: { quality: number; slow: number }, drawMs: number): { quality: number; slow: number } {
  const slow = drawMs > SLOW_DRAW_MS
    ? Math.min(state.slow + 1, SLOW_DRAWS_TO_STEP + 1)
    : Math.max(0, state.slow - 1);
  if (slow > SLOW_DRAWS_TO_STEP && state.quality < QUALITY_STEPS.length - 1) {
    return { quality: state.quality + 1, slow: 0 };
  }
  return { quality: state.quality, slow };
}

export function backingSize(cssWidth: number, cssHeight: number, devicePixelRatio: number): { width: number; height: number; scale: number } {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const scale = ratio * BACKING_SCALE;
  return {
    width: Math.max(1, Math.round(cssWidth * scale)),
    height: Math.max(1, Math.round(cssHeight * scale)),
    scale,
  };
}

function fract(value: number): number {
  return value - Math.floor(value);
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npm --prefix web test -- src/ui/field.test.ts`
Expected: PASS, `Tests  16 passed (16)`.

- [ ] **Step 5: Commit**

```bash
git add web/src/ui/field.ts web/src/ui/field.test.ts
git commit -m "feat(web): add terrain grid, quality step-down and backing size helpers"
```

---

### Task 3: Quiet-rect packing (`field.ts`, part 3)

**Files:**
- Modify: `web/src/ui/field.ts` (append, end of file)
- Test: `web/src/ui/field.test.ts` (append; `packQuietRects` test copied verbatim from `field.test.mjs:33-47`)

**Interfaces:**
- Consumes: `Rect`, `QUIET_SLOTS` (Task 1).
- Produces:
  - contract §7: `export function packQuietRects(rects: Rect[], viewportWidth: number, viewportHeight: number): Float32Array;` (unchanged from `experiments/ui-ab/frontend/src/field.ts:40-53`);
  - **local addition:** `export function removeContained(rects: Rect[]): Rect[];`. It drops every rect fully inside another; of identical rects it keeps the first. Order is otherwise preserved.

- [ ] **Step 1: Write the failing test**

Append to `web/src/ui/field.test.ts`:
```ts
import { packQuietRects, removeContained } from './field';

describe('packQuietRects', () => {
  it('clips rectangles to the viewport, drops empty or offscreen ones and keeps the largest', () => {
    const packed = packQuietRects([
      { left: -20, top: 10, width: 120, height: 50 },
      { left: 900, top: 900, width: 200, height: 200 },
      { left: 10, top: 2000, width: 300, height: 300 },
      { left: 0, top: 0, width: 0, height: 40 },
      { left: 0, top: 0, width: Number.NaN, height: 40 },
    ], 1000, 1000);
    expect(packed.length).toBe(QUIET_SLOTS * 4);
    expect([...packed.slice(0, 8)]).toEqual([900, 900, 100, 100, 0, 10, 100, 50]);
    expect(packed.slice(8).every((value) => value === 0)).toBe(true);
    const many = packQuietRects(
      Array.from({ length: QUIET_SLOTS + 3 }, (_, i) => ({ left: 0, top: 0, width: 10 + i, height: 10 })),
      100,
      100,
    );
    expect(many[2]).toBe(10 + QUIET_SLOTS + 2);
    expect(many[(QUIET_SLOTS - 1) * 4 + 2]).toBe(13);
    expect(packQuietRects([], 0, 0).every((value) => value === 0)).toBe(true);
  });
});

describe('removeContained', () => {
  const main = { left: 100, top: 0, width: 800, height: 900 };

  it('drops surfaces nested inside another and keeps partial overlaps', () => {
    const heading = { left: 120, top: 20, width: 400, height: 60 };
    const dialog = { left: 600, top: 200, width: 600, height: 400 };
    expect(removeContained([heading, main, dialog])).toEqual([main, dialog]);
  });

  it('keeps exactly one of several identical surfaces', () => {
    expect(removeContained([main, { ...main }, { ...main }])).toEqual([main]);
  });

  it('keeps disjoint surfaces and ignores non-finite ones for containment', () => {
    const left = { left: 0, top: 0, width: 50, height: 50 };
    const right = { left: 60, top: 0, width: 50, height: 50 };
    const broken = { left: Number.NaN, top: 0, width: 10, height: 10 };
    expect(removeContained([left, right, broken])).toEqual([left, right, broken]);
  });

  it('lets an outer surface with seven nested ones fit the six shader slots', () => {
    const outer = { left: 0, top: 0, width: 1000, height: 1000 };
    const nested = Array.from({ length: 7 }, (_, i) => ({ left: 10 + i, top: 10 + i, width: 100, height: 100 }));
    const packed = packQuietRects(removeContained([...nested, outer]), 1000, 1000);
    expect([...packed.slice(0, 4)]).toEqual([0, 0, 1000, 1000]);
    expect(packed.slice(4).every((value) => value === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix web test -- src/ui/field.test.ts`
Expected: FAIL. The `packQuietRects` and `removeContained` suites error with `TypeError: … is not a function`. The earlier 16 tests pass.

- [ ] **Step 3: Minimal implementation**

Append to `web/src/ui/field.ts`:
```ts
/** Visible content rectangles packed for the shader, largest first, clipped to the viewport. Unused slots are zero. (experiments field.ts:40-53, unchanged) */
export function packQuietRects(rects: Rect[], viewportWidth: number, viewportHeight: number): Float32Array {
  const packed = new Float32Array(QUIET_SLOTS * 4);
  const visible = rects
    .map((rect) => {
      const left = Math.max(0, rect.left), top = Math.max(0, rect.top);
      const right = Math.min(viewportWidth, rect.left + rect.width), bottom = Math.min(viewportHeight, rect.top + rect.height);
      return { left, top, width: right - left, height: bottom - top };
    })
    .filter((rect) => Number.isFinite(rect.width + rect.height) && rect.width > 1 && rect.height > 1)
    .sort((a, b) => b.width * b.height - a.width * a.height)
    .slice(0, QUIET_SLOTS);
  visible.forEach((rect, i) => packed.set([rect.left, rect.top, rect.width, rect.height], i * 4));
  return packed;
}

/** Nested surfaces (a heading inside the main column) would use up QUIET_SLOTS and push a disjoint dialog out. */
export function removeContained(rects: Rect[]): Rect[] {
  return rects.filter((rect, i) =>
    !rects.some((other, j) => j !== i && contains(other, rect) && (j < i || !contains(rect, other))),
  );
}

function contains(outer: Rect, inner: Rect): boolean {
  return outer.left <= inner.left && outer.top <= inner.top &&
    outer.left + outer.width >= inner.left + inner.width &&
    outer.top + outer.height >= inner.top + inner.height;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npm --prefix web test -- src/ui/field.test.ts`
Expected: PASS, `Tests  21 passed (21)`.

- [ ] **Step 5: Commit**

```bash
git add web/src/ui/field.ts web/src/ui/field.test.ts
git commit -m "feat(web): add quiet-rect packing for the terrain"
```

---

### Task 4: Two-pass WebGL2 shaders (`fieldShaders.ts`)

**Files:**
- Create: `web/src/ui/fieldShaders.ts`. This ports `experiments/ui-ab/frontend/src/BackgroundField.tsx:8-62`:
  - `field()` and the camera math move into the height pass;
  - the shading math moves into the stroke pass;
  - the pointer swell and parallax (`:14,26,29` and `:79,128,148-151`) are dropped: they need a redraw on every `pointermove`, which spec §7's 12 fps timer and state machine do not provide, and they are not a spec §7 input. The camera becomes the fixed `EYE` (`pointer = 0`);
  - the quiet mix changes from `mix(.2,1.,calm)` to plain `calm`, which gives alpha 0.
- Test: `web/src/ui/fieldShaders.test.ts` (create)

**Interfaces:**
- Consumes: `QUIET_SLOTS` (Task 1).
- Produces (contract §7): `export const HEIGHT_VERTEX: string, HEIGHT_FRAGMENT: string, STROKE_VERTEX: string, STROKE_FRAGMENT: string;`. All four are GLSL ES 3.00.
- Uniforms and attributes Task 5 binds:
  - height program: `time` (float), `aspect` (float), `grid` (vec2 = columns-1, rows-1);
  - stroke program: attribute `point` at location 0 (vec3 = u, v, seed; divisor 1), `heights` (sampler2D unit 0), `aspect` (float), `size` (ivec2 = columns, rows), `quiet` (vec4[QUIET_SLOTS], CSS px), `backing` (float = canvas.height), `scale` (float = backing px per CSS px), `strength` (float).
- Packing: `R = height/5 + .5`, `GB = slope/8 + .5` (clamped), `A = fract(comb/TAU)`. Both formats store the same normalized values, so one decoder serves RGBA16F and RGBA8.

- [ ] **Step 1: Write the failing test**

Create `web/src/ui/fieldShaders.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { QUIET_SLOTS } from './field';
import { HEIGHT_FRAGMENT, HEIGHT_VERTEX, STROKE_FRAGMENT, STROKE_VERTEX } from './fieldShaders';

const ALL = { HEIGHT_VERTEX, HEIGHT_FRAGMENT, STROKE_VERTEX, STROKE_FRAGMENT };

describe('terrain shaders', () => {
  it('are GLSL ES 3.00 with the version directive on the very first line', () => {
    for (const [name, source] of Object.entries(ALL)) {
      expect(source.startsWith('#version 300 es\n'), name).toBe(true);
    }
  });

  it('evaluate the terrain only in the height pass, once per grid point, never per vertex', () => {
    expect(HEIGHT_FRAGMENT).toContain('float field(vec2 p,float t)');
    expect(STROKE_VERTEX).not.toContain('field(');
  });

  it('read heights with texelFetch from an instanced stroke pass', () => {
    expect(STROKE_VERTEX).toContain('texelFetch(heights');
    expect(STROKE_VERTEX).toContain('gl_VertexID');
    expect(STROKE_VERTEX).not.toMatch(/\btexture\(/);
  });

  it('size the quiet uniform to the packed slots and make alpha exactly 0 inside a quiet rect', () => {
    expect(STROKE_FRAGMENT).toContain(`uniform vec4 quiet[${QUIET_SLOTS}]`);
    expect(STROKE_FRAGMENT).toContain('smoothstep(2.,112.,');
    expect(STROKE_FRAGMENT).not.toContain('mix(.2');
    expect(STROKE_FRAGMENT).toContain('discard');
  });

  it('pack and unpack heights with the same range constants in both passes', () => {
    for (const source of [HEIGHT_FRAGMENT, STROKE_VERTEX]) {
      expect(source).toContain('HEIGHT_RANGE=5.,SLOPE_RANGE=8.,TAU=6.2831853');
    }
  });

  it('never use GLSL ES reserved words as identifiers', () => {
    for (const source of Object.values(ALL)) {
      expect(source).not.toMatch(/\b(packed|sample|input|output|filter|half|fixed)\b/);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix web test -- src/ui/fieldShaders.test.ts`
Expected: FAIL with `Failed to resolve import "./fieldShaders" from "src/ui/fieldShaders.test.ts". Does the file exist?`

- [ ] **Step 3: Minimal implementation**

Create `web/src/ui/fieldShaders.ts`:
```ts
import { QUIET_SLOTS } from './field';

/* Shared by both passes (DRY): the camera ray to the ground plane and the height packing ranges.
   Camera constants and math are ported from experiments/ui-ab/frontend/src/BackgroundField.tsx:17-27. */
const SHARED = `
const float H=4.2,P=.78,F=.62;
const float HEIGHT_RANGE=5.,SLOPE_RANGE=8.,TAU=6.2831853;
const vec3 UP=vec3(0.,cos(P),sin(P)),FORWARD=vec3(0.,-sin(P),cos(P)),EYE=vec3(0.,H,0.);
vec2 gridNdc(vec2 uv){return (uv*2.-1.)*vec2(1.18,1.14);}
vec3 groundAt(vec2 ndc,float aspect){
 vec3 ray=vec3(ndc.x*F*aspect,0.,0.)+UP*ndc.y*F+FORWARD;
 return EYE+ray*(EYE.y/max(-ray.y,.05));
}
`;

/** Full-screen triangle from gl_VertexID; no buffers. */
export const HEIGHT_VERTEX = `#version 300 es
void main(){
 vec2 corner=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
 gl_Position=vec4(corner*2.-1.,0.,1.);
}
`;

/** One texel per grid point: the 8,400 field() evaluations per frame (spec §7). Values are normalized so RGBA8 works too. */
export const HEIGHT_FRAGMENT = `#version 300 es
precision highp float;
${SHARED}
uniform float time,aspect;
uniform vec2 grid;
out vec4 outHeight;
float field(vec2 p,float t){
 vec2 q=p+vec2(sin(p.y*.21+t*.11)*2.1,cos(p.x*.17-t*.09)*2.4);
 return sin(q.x*.33+t*.23)*.9+cos(q.y*.41-t*.17)*.7+sin((q.x+q.y)*.57+t*.31)*.32+cos(q.x*.9-q.y*.6)*.1;
}
void main(){
 vec3 ground=groundAt(gridNdc(floor(gl_FragCoord.xy)/grid),aspect);
 vec2 drift=ground.xz+vec2(0.,time*.42);
 float height=field(drift,time);
 vec2 slope=vec2(field(drift+vec2(.06,0.),time)-field(drift-vec2(.06,0.),time),field(drift+vec2(0.,.06),time)-field(drift-vec2(0.,.06),time))/.12;
 float comb=field(drift*.35+9.,time*.5)*2.4;
 outHeight=vec4(clamp(height/HEIGHT_RANGE+.5,0.,1.),clamp(slope/SLOPE_RANGE+.5,0.,1.),fract(comb/TAU));
}
`;

/** Instanced: 2 vertices (base gl_VertexID 0, tip 1) per grid point, both fetching the same texel. */
export const STROKE_VERTEX = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
${SHARED}
layout(location=0) in vec3 point;
uniform sampler2D heights;
uniform float aspect;
uniform ivec2 size;
out float shade;
void main(){
 float end=float(gl_VertexID);
 vec4 t=texelFetch(heights,clamp(ivec2(round(point.xy*vec2(size-1))),ivec2(0),size-1),0);
 float height=(t.x-.5)*HEIGHT_RANGE;
 vec2 slope=(t.yz-.5)*SLOPE_RANGE;
 float comb=t.w*TAU;
 vec2 ndc=gridNdc(point.xy);
 vec3 ground=groundAt(ndc,aspect);
 vec3 normal=normalize(vec3(-slope.x,1.,-slope.y));
 float steep=smoothstep(.12,1.05,length(slope));
 vec3 direction=normalize(normal+vec3(cos(comb),0.,sin(comb))*(.35+steep*.6));
 vec3 world=vec3(ground.x,height,ground.z)+direction*end*(.025+steep*.7)*(.5+point.z);
 vec3 view=world-EYE;
 float depth=dot(view,FORWARD);
 float light=max(dot(normal,normalize(vec3(-.55,.62,-.56))),0.);
 shade=(.07+1.1*pow(light,2.4))*mix(.32,1.,end)*exp(-depth*.055)*(.72+.28*smoothstep(-.6,.9,height));
 shade*=.55+.45*smoothstep(-1.,.6,ndc.x+ndc.y*.6);
 gl_Position=depth<.2?vec4(2.,2.,2.,1.):vec4(view.x/(F*aspect),dot(view,UP)/F,0.,depth);
}
`;

/** Quiet rects are CSS px; gl_FragCoord is backing px (scale = backing px per CSS px). */
export const STROKE_FRAGMENT = `#version 300 es
precision highp float;
uniform vec4 quiet[${QUIET_SLOTS}];
uniform float backing,scale,strength;
in float shade;
out vec4 outColor;
void main(){
 vec2 at=vec2(gl_FragCoord.x,backing-gl_FragCoord.y)/scale;
 float calm=1.;
 for(int i=0;i<${QUIET_SLOTS};i++){
  vec4 r=quiet[i];
  if(r.z<1.)continue;
  vec2 d=abs(at-(r.xy+r.zw*.5))-r.zw*.5;
  // 0 inside the rect and 2 CSS px beyond it (one backing pixel at 0.5x): the reading column stays at alpha 0.
  calm=min(calm,smoothstep(2.,112.,length(max(d,0.))+min(max(d.x,d.y),0.)));
 }
 float alpha=shade*strength*calm;
 if(alpha<=0.)discard;
 outColor=vec4(vec3(.84,.86,.9),alpha);
}
`;
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npm --prefix web test -- src/ui/fieldShaders.test.ts`
Expected: PASS, `Tests  6 passed (6)`.

- [ ] **Step 5: Commit**

```bash
git add web/src/ui/fieldShaders.ts web/src/ui/fieldShaders.test.ts
git commit -m "feat(web): add two-pass WebGL2 terrain shaders"
```

---

### Task 5: `BackgroundField` component, CSS and unit tests

**Files:**
- Create: `web/src/ui/BackgroundField.tsx`. This ports `experiments/ui-ab/frontend/src/BackgroundField.tsx:64-168`, with these changes:
  - WebGL2 replaces WebGL1;
  - `setTimeout` replaces the rAF loop at :118-130;
  - observers replace `setInterval(refreshQuiet,500)` at :156;
  - the context options change from :82 to the spec values.
- Create: `web/src/styles/field.css` (ports `experiments/ui-ab/frontend/src/theme.css:15`, plus the unsupported rule)
- Test: `web/src/ui/BackgroundField.test.tsx` (create; jsdom)

**Interfaces:**
- Consumes:
  - Tasks 1–4: `fieldState`, `FieldInputs`, `FieldState`, `GridSize`, `QUALITY_STEPS`, `FRAME_INTERVAL_MS`, `IDLE_TIMEOUT_MS`, `QUIET_SELECTOR`, `backingSize`, `buildInstances`, `gridSize`, `packQuietRects`, `removeContained`, `stepQuality`, and the four shader strings;
  - P1 `globals.d.ts`: `window.__noemaField`.
- Produces (contract §7): `export function BackgroundField(props: { motion: boolean })`. It renders `<canvas class="background-field" aria-hidden="true">`, and the effect sets `data-state` to a `FieldState`. It installs `window.__noemaField` only when `new URLSearchParams(location.search).get('e2e') === '1'` and deletes it on unmount.
- Seam behaviour:
  - `readPixel(x, y)` takes CSS px and resolves `[r, g, b, a]` (0–255) from inside the next `draw()`.
  - When no frame timer is pending, it schedules one `draw()` with `setTimeout(0)`, so all reads issued in one task share one draw and one `readPixels`.
  - It rejects with `Error('The field is not drawing')` while unsupported or after unmount.

- [ ] **Step 1: Write the failing test**

Create `web/src/ui/BackgroundField.test.tsx`:
```tsx
// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackgroundField } from './BackgroundField';
// Vite's ?raw import (typed by vite/client) gives the source text without needing Node types in src/.
import SOURCE from './BackgroundField.tsx?raw';

function withoutWebGl2() {
  return vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('BackgroundField', () => {
  it('requests WebGL2 without antialiasing or a preserved drawing buffer', () => {
    const getContext = withoutWebGl2();
    render(<BackgroundField motion={false} />);
    expect(getContext).toHaveBeenCalledWith('webgl2', expect.objectContaining({ antialias: false, preserveDrawingBuffer: false }));
  });

  it('shows the static fallback state without WebGL2 and stays decorative, whatever the motion setting', () => {
    withoutWebGl2();
    const { container, rerender } = render(<BackgroundField motion />);
    const canvas = container.querySelector('canvas');
    expect(canvas?.className).toBe('background-field');
    expect(canvas?.getAttribute('aria-hidden')).toBe('true');
    expect(canvas?.dataset.state).toBe('unsupported');
    rerender(<BackgroundField motion={false} />);
    expect(canvas?.dataset.state).toBe('unsupported');
  });

  it('installs no test seam without ?e2e=1', () => {
    withoutWebGl2();
    render(<BackgroundField motion />);
    expect(window.__noemaField).toBeUndefined();
  });

  it('installs the seam only with ?e2e=1, rejects reads while not drawing, and removes it on unmount', async () => {
    withoutWebGl2();
    window.history.replaceState(null, '', '/?e2e=1');
    const { unmount } = render(<BackgroundField motion />);
    expect(window.__noemaField?.frames).toBe(0);
    await expect(window.__noemaField!.readPixel(0, 0)).rejects.toThrow('The field is not drawing');
    unmount();
    expect(window.__noemaField).toBeUndefined();
  });

  it('schedules frames with setTimeout only: no requestAnimationFrame loop and no quiet-rect polling', () => {
    expect(SOURCE).not.toContain('requestAnimationFrame');
    expect(SOURCE).not.toContain('setInterval');
    expect(SOURCE).toContain('window.setTimeout(tick, FRAME_INTERVAL_MS)');
    expect(SOURCE).toContain('Math.min(now - last, MAX_STEP_MS)');
  });

  it('recomputes quiet rects from a ResizeObserver, a MutationObserver on the app root and scroll', () => {
    expect(SOURCE).toContain('new ResizeObserver(onQuietChange)');
    expect(SOURCE).toContain('{ childList: true, subtree: true }');
    expect(SOURCE).toContain("window.addEventListener('scroll', onQuietChange, LISTEN)");
  });

  it('renders the height pass into RGBA16F when EXT_color_buffer_float is available and falls back to packed RGBA8', () => {
    expect(SOURCE).toContain("gl.getExtension('EXT_color_buffer_float') !== null");
    expect(SOURCE).toContain('float ? gl.RGBA16F : gl.RGBA8');
    expect(SOURCE).toContain('gl.drawArraysInstanced(gl.LINES, 0, 2, grid.columns * grid.rows)');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix web test -- src/ui/BackgroundField.test.tsx`
Expected: FAIL with `Failed to resolve import "./BackgroundField" from "src/ui/BackgroundField.test.tsx". Does the file exist?`

- [ ] **Step 3: Write the CSS**

Create `web/src/styles/field.css`:
```css
/* Terrain canvas: a fixed decorative layer inside the app (spec §7). The backing store is 0.5x; CSS upscales it. */
.background-field {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
  pointer-events: none;
}

/* Without WebGL2 the app's own background is the static fallback; nothing animated is drawn. */
.background-field[data-state='unsupported'] {
  display: none;
}
```

- [ ] **Step 4: Write the component**

Create `web/src/ui/BackgroundField.tsx`:
```tsx
import { useEffect, useRef } from 'react';
import '../styles/field.css';
import {
  FRAME_INTERVAL_MS,
  IDLE_TIMEOUT_MS,
  QUALITY_STEPS,
  QUIET_SELECTOR,
  backingSize,
  buildInstances,
  fieldState,
  gridSize,
  packQuietRects,
  removeContained,
  stepQuality,
  type FieldInputs,
  type FieldState,
  type GridSize,
} from './field';
import { HEIGHT_FRAGMENT, HEIGHT_VERTEX, STROKE_FRAGMENT, STROKE_VERTEX } from './fieldShaders';

const CONTEXT_OPTIONS: WebGLContextAttributes = {
  alpha: true,
  antialias: false,
  depth: false,
  stencil: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  powerPreference: 'low-power',
};
const STATIC_TIME = 21.5;     // experiments BackgroundField.tsx:6
const TIME_PER_MS = 0.00011;  // experiments BackgroundField.tsx:123
const MAX_STEP_MS = 100;      // experiments BackgroundField.tsx:123: a resume never jumps the terrain
const ACTIVITY_EVENTS = ['pointermove', 'keydown', 'wheel', 'touchstart', 'focus'] as const;
const LISTEN = { capture: true, passive: true } as const;

type Pixel = [number, number, number, number];
type PixelRead = { x: number; y: number; resolve(pixel: Pixel): void; reject(error: Error): void };
type Uniforms<K extends string> = Record<K, WebGLUniformLocation | null>;
type Resources = {
  height: WebGLProgram;
  stroke: WebGLProgram;
  heightUniforms: Uniforms<'time' | 'aspect' | 'grid'>;
  strokeUniforms: Uniforms<'heights' | 'aspect' | 'size' | 'quiet' | 'backing' | 'scale' | 'strength'>;
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  instances: WebGLBuffer;
  vao: WebGLVertexArrayObject;
  float: boolean;
};
type Controller = { setMotion(on: boolean): void; stop(): void };

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Field shader allocation failed');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Field shader failed');
  return shader;
}

function link(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('Field program allocation failed');
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Field program failed');
  return program;
}

function locate<K extends string>(gl: WebGL2RenderingContext, program: WebGLProgram, names: readonly K[]): Uniforms<K> {
  return Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)])) as Uniforms<K>;
}

function createResources(gl: WebGL2RenderingContext): Resources | null {
  try {
    const height = link(gl, HEIGHT_VERTEX, HEIGHT_FRAGMENT);
    const stroke = link(gl, STROKE_VERTEX, STROKE_FRAGMENT);
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    const instances = gl.createBuffer();
    const vao = gl.createVertexArray();
    if (!texture || !framebuffer || !instances || !vao) throw new Error('Field buffers unavailable');
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.bindVertexArray(null);
    return {
      height,
      stroke,
      heightUniforms: locate(gl, height, ['time', 'aspect', 'grid'] as const),
      strokeUniforms: locate(gl, stroke, ['heights', 'aspect', 'size', 'quiet', 'backing', 'scale', 'strength'] as const),
      texture,
      framebuffer,
      instances,
      vao,
      float: gl.getExtension('EXT_color_buffer_float') !== null,
    };
  } catch (error) {
    console.warn(error);
    return null;
  }
}

function heightTarget(gl: WebGL2RenderingContext, r: Resources, grid: GridSize, float: boolean): boolean {
  gl.bindTexture(gl.TEXTURE_2D, r.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, float ? gl.RGBA16F : gl.RGBA8, grid.columns, grid.rows, 0, gl.RGBA, float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, r.framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, r.texture, 0);
  const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return complete;
}

function allocateGrid(gl: WebGL2RenderingContext, r: Resources, grid: GridSize): boolean {
  gl.bindBuffer(gl.ARRAY_BUFFER, r.instances);
  gl.bufferData(gl.ARRAY_BUFFER, buildInstances(grid.columns, grid.rows), gl.STATIC_DRAW);
  if (r.float && heightTarget(gl, r, grid, true)) return true;
  r.float = false; // RGBA16F missing or not renderable here: packed RGBA8 (spec §7)
  return heightTarget(gl, r, grid, false);
}

function startField(canvas: HTMLCanvasElement, motion: boolean): Controller {
  const inputs: FieldInputs = {
    supported: false,
    documentHidden: document.hidden,
    windowBlurred: !document.hasFocus(),
    idle: false,
    reducedMotion: false,
    motionSetting: motion,
  };
  const reads: PixelRead[] = [];
  const e2e = new URLSearchParams(window.location.search).get('e2e') === '1';
  let resources: Resources | null = null;
  let frames = 0, frameTimer = 0, seamTimer = 0, idleTimer = 0;

  function rejectReads(): void {
    for (const read of reads.splice(0)) read.reject(new Error('The field is not drawing'));
  }
  function readPixel(x: number, y: number): Promise<Pixel> {
    return new Promise((resolve, reject) => {
      if (!resources) {
        reject(new Error('The field is not drawing'));
        return;
      }
      reads.push({ x, y, resolve, reject });
      // Animated frames answer on their next tick; otherwise one draw answers every read queued in this task.
      if (!frameTimer && !seamTimer) seamTimer = window.setTimeout(() => { seamTimer = 0; draw(); }, 0);
    });
  }
  if (e2e) window.__noemaField = { get frames() { return frames; }, readPixel };

  const context = canvas.getContext('webgl2', CONTEXT_OPTIONS);
  if (!context) {
    canvas.dataset.state = fieldState(inputs);
    return {
      setMotion() {},
      stop() {
        if (e2e) delete window.__noemaField;
      },
    };
  }
  const gl: WebGL2RenderingContext = context;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  inputs.reducedMotion = reduced.matches;
  let cssWidth = 1, cssHeight = 1, scale = 1;
  let quality = { quality: 0, slow: 0 };
  let grid: GridSize = gridSize(QUALITY_STEPS[0]);
  let quiet = packQuietRects([], 0, 0);
  let time = STATIC_TIME, last = 0;
  let lastActivity = performance.now();

  function prepare(): void {
    resources = createResources(gl);
    if (resources && !allocateGrid(gl, resources, grid)) resources = null;
    inputs.supported = resources !== null;
  }

  function answerReads(): void {
    if (reads.length === 0) return;
    const width = canvas.width, height = canvas.height;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    for (const read of reads.splice(0)) {
      const bx = Math.min(width - 1, Math.max(0, Math.floor(read.x * scale)));
      const by = Math.min(height - 1, Math.max(0, height - 1 - Math.floor(read.y * scale)));
      const i = (by * width + bx) * 4;
      read.resolve([pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]]);
    }
  }

  function draw(): number {
    const r = resources;
    if (!r) return 0;
    const started = performance.now();
    gl.bindFramebuffer(gl.FRAMEBUFFER, r.framebuffer);
    gl.viewport(0, 0, grid.columns, grid.rows);
    gl.disable(gl.BLEND);
    gl.useProgram(r.height);
    gl.uniform1f(r.heightUniforms.time, time);
    gl.uniform1f(r.heightUniforms.aspect, cssWidth / cssHeight);
    gl.uniform2f(r.heightUniforms.grid, grid.columns - 1, grid.rows - 1);
    gl.bindVertexArray(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
    gl.useProgram(r.stroke);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, r.texture);
    const u = r.strokeUniforms;
    gl.uniform1i(u.heights, 0);
    gl.uniform1f(u.aspect, cssWidth / cssHeight);
    gl.uniform2i(u.size, grid.columns, grid.rows);
    gl.uniform4fv(u.quiet, quiet);
    gl.uniform1f(u.backing, canvas.height);
    gl.uniform1f(u.scale, scale);
    gl.uniform1f(u.strength, cssWidth < 700 ? 0.75 : 1);
    gl.bindVertexArray(r.vao);
    gl.drawArraysInstanced(gl.LINES, 0, 2, grid.columns * grid.rows);
    gl.bindVertexArray(null);
    frames++;
    const drawMs = performance.now() - started;
    answerReads();
    return drawMs;
  }

  function regrid(): void {
    grid = gridSize(QUALITY_STEPS[quality.quality]);
    if (resources && !allocateGrid(gl, resources, grid)) {
      resources = null;
      inputs.supported = false;
      apply();
    }
  }

  function tick(): void {
    frameTimer = 0;
    const now = performance.now();
    if (last) time += Math.min(now - last, MAX_STEP_MS) * TIME_PER_MS;
    last = now;
    const before = quality.quality;
    quality = stepQuality(quality, draw());
    if (quality.quality !== before) regrid();
    if (fieldState(inputs) === 'animated') frameTimer = window.setTimeout(tick, FRAME_INTERVAL_MS);
  }

  function measureQuiet(): boolean {
    const rects = removeContained(Array.from(document.querySelectorAll(QUIET_SELECTOR), (element) => element.getBoundingClientRect()));
    const next = packQuietRects(rects, cssWidth, cssHeight);
    const changed = next.some((value, i) => Math.abs(value - quiet[i]) > 0.5);
    quiet = next;
    return changed;
  }

  function apply(): void {
    const state: FieldState = fieldState(inputs);
    canvas.dataset.state = state;
    window.clearTimeout(frameTimer);
    frameTimer = 0;
    last = 0;
    if (state === 'unsupported') {
      rejectReads();
      return;
    }
    if (state === 'static') time = STATIC_TIME;
    measureQuiet(); // a resize can move quiet surfaces without resizing them, which the ResizeObserver misses
    if (state === 'animated') tick();
    else draw(); // static or paused: one frame (a resize clears the canvas); it also answers pending seam reads
  }

  function onQuietChange(): void {
    if (!resources || document.hidden) return;
    const state = canvas.dataset.state;
    if (measureQuiet() && (state === 'static' || state === 'paused')) draw();
  }

  function resize(): void {
    cssWidth = Math.max(1, window.innerWidth);
    cssHeight = Math.max(1, window.innerHeight);
    const backing = backingSize(cssWidth, cssHeight, window.devicePixelRatio);
    canvas.width = backing.width;
    canvas.height = backing.height;
    scale = backing.scale;
    apply();
  }

  function onVisibility(): void {
    inputs.documentHidden = document.hidden;
    apply();
  }
  function onReduced(): void {
    inputs.reducedMotion = reduced.matches;
    apply();
  }
  function onBlur(event: Event): void {
    if (event.target !== window) return;
    inputs.windowBlurred = true;
    apply();
  }
  function onActivity(event: Event): void {
    lastActivity = performance.now();
    const windowFocus = event.type === 'focus' && event.target === window;
    const changed = inputs.idle || (windowFocus && inputs.windowBlurred);
    if (windowFocus) inputs.windowBlurred = false;
    inputs.idle = false;
    if (!idleTimer) idleTimer = window.setTimeout(checkIdle, IDLE_TIMEOUT_MS);
    if (changed) apply();
  }
  function checkIdle(): void {
    idleTimer = 0;
    const quietFor = performance.now() - lastActivity;
    if (quietFor >= IDLE_TIMEOUT_MS) {
      inputs.idle = true;
      apply();
      return;
    }
    idleTimer = window.setTimeout(checkIdle, IDLE_TIMEOUT_MS - quietFor);
  }
  function onLost(event: Event): void {
    event.preventDefault();
    resources = null;
    inputs.supported = false;
    apply();
  }
  function onRestored(): void {
    prepare();
    apply();
  }

  const resizeObserver = new ResizeObserver(onQuietChange);
  function observeQuiet(): void {
    resizeObserver.disconnect();
    document.querySelectorAll(QUIET_SELECTOR).forEach((element) => resizeObserver.observe(element));
  }
  const mutationObserver = new MutationObserver(() => {
    observeQuiet();
    onQuietChange();
  });

  prepare();
  observeQuiet();
  mutationObserver.observe(document.getElementById('root') ?? document.body, { childList: true, subtree: true });
  ACTIVITY_EVENTS.forEach((type) => window.addEventListener(type, onActivity, LISTEN));
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', resize);
  window.addEventListener('scroll', onQuietChange, LISTEN);
  document.addEventListener('visibilitychange', onVisibility);
  reduced.addEventListener('change', onReduced);
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  idleTimer = window.setTimeout(checkIdle, IDLE_TIMEOUT_MS);
  resize();

  return {
    setMotion(on) {
      if (inputs.motionSetting === on) return;
      inputs.motionSetting = on;
      apply();
    },
    stop() {
      window.clearTimeout(frameTimer);
      window.clearTimeout(seamTimer);
      window.clearTimeout(idleTimer);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      ACTIVITY_EVENTS.forEach((type) => window.removeEventListener(type, onActivity, LISTEN));
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', onQuietChange, LISTEN);
      document.removeEventListener('visibilitychange', onVisibility);
      reduced.removeEventListener('change', onReduced);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      resources = null;
      rejectReads();
      if (e2e) delete window.__noemaField;
    },
  };
}

/** Monochrome stroke terrain. Decorative only: it never takes input, and it stays calm under every [data-quiet] surface. */
export function BackgroundField({ motion }: { motion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<Controller | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = startField(canvas, motion);
    controllerRef.current = controller;
    return () => {
      controller.stop();
      controllerRef.current = null;
    };
    // The context is created once per mount; motion changes go through setMotion below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    controllerRef.current?.setMotion(motion);
  }, [motion]);
  return <canvas ref={canvasRef} className="background-field" aria-hidden="true" />;
}
```

- [ ] **Step 5: Run the unit tests and the type check**

Run: `npm --prefix web test -- src/ui/BackgroundField.test.tsx && npm --prefix web run typecheck`
Expected: PASS, `Tests  7 passed (7)`, and `tsc --noEmit` exits 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/ui/BackgroundField.tsx web/src/ui/BackgroundField.test.tsx web/src/styles/field.css
git commit -m "feat(web): render the terrain with WebGL2 instanced strokes"
```

---

### Task 6: Mount in `AppShell` and E2E-test the state machine

**Files:**
- Modify: `web/src/shell/AppShell.tsx` (created by `02-screens-core.md` Task 14; contract §7 gives P5 this one edit). Two places change:
  - the import block: one line before `import { Icon } from '../ui/Icon';`;
  - the first child of `<div className="app">` in the `AppShell` return, before `<Nav />`. `AppShell` already holds `const snapshot = useSnapshot().data;`, which is reused.
- Test: `web/e2e/terrain.spec.ts` (create)

**Interfaces:**
- Consumes:
  - `BackgroundField` (Task 5);
  - `useSnapshot()` (P2);
  - `test`, `expect`, `gotoApp(page, noema, hash)` (P1 `web/e2e/fixtures.ts`, contract §9.2);
  - `NoemaServer.api`, `origin` (P1 `web/e2e/server.ts`);
  - `window.__noemaField` (P1 globals).
- Produces: the canvas mounted as the first child of the AppShell root, with `motion={snapshot?.settings.motion ?? false}`. Test titles bound verbatim by `parity-map.md` rows 41, 114, 115 and `handbook-trace.md` U25 (`01-foundation.md` Task 1): "Terrain animates, stays static with reduced motion, pauses when hidden, and does not capture input", "Reduced motion stops the actual animation timer", "Injected hidden-document event stops animation". In `terrain.spec.ts` it adds the helpers `FIELD`, `openField(page, noema, hash?)`, `enableMotion(noema)`, `frames(page)`, `expectState(page, state)` and `setHidden(page, hidden)`, which Task 7 reuses.

- [ ] **Step 1: Write the failing E2E tests**

Create `web/e2e/terrain.spec.ts`:
```ts
import type { Page } from '@playwright/test';
import { expect, gotoApp, test } from './fixtures';
import type { NoemaServer } from './server';

const FIELD = 'canvas.background-field';

test.use({ viewport: { width: 1440, height: 900 } });

/** gotoApp loads origin + '/' + hash, so a '?e2e=1' prefix turns the seam on. Fonts are awaited so a late layout shift cannot redraw a static frame mid-test. */
async function openField(page: Page, noema: NoemaServer, hash = '#/overview'): Promise<void> {
  await gotoApp(page, noema, `?e2e=1${hash}`);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

async function enableMotion(noema: NoemaServer): Promise<void> {
  await noema.api('PATCH', '/api/settings', { motion: true });   // the helper takes the full path
}

function frames(page: Page): Promise<number> {
  return page.evaluate(() => window.__noemaField!.frames);
}

async function expectState(page: Page, state: 'animated' | 'static' | 'paused' | 'unsupported'): Promise<void> {
  await expect(page.locator(FIELD)).toHaveAttribute('data-state', state);
}

async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (value ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test.describe('terrain state machine', () => {
  test('motion defaults off: one static frame inside the app, no frame timer', async ({ page, noema }) => {
    await openField(page, noema);
    await expect(page.locator(`#root ${FIELD}`)).toHaveCount(1);
    await expectState(page, 'static');
    const before = await frames(page);
    await page.waitForTimeout(1000);
    expect(await frames(page)).toBe(before);
  });

  test('motion on animates at 12 fps through setTimeout', async ({ page, noema }) => {
    await enableMotion(noema);
    await openField(page, noema);
    await expectState(page, 'animated');
    const before = await frames(page);
    await page.waitForTimeout(2000);
    const drawn = (await frames(page)) - before;
    expect(drawn).toBeGreaterThanOrEqual(16);
    expect(drawn).toBeLessThanOrEqual(26);
  });

  // Parity-map row 41 (experiments/ui-ab/scripts/verify.py:41), title verbatim.
  test('Terrain animates, stays static with reduced motion, pauses when hidden, and does not capture input', async ({ page, noema }) => {
    await enableMotion(noema);
    await openField(page, noema);
    await expectState(page, 'animated');
    const start = await frames(page);
    await expect.poll(() => frames(page)).toBeGreaterThan(start + 1);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expectState(page, 'static');
    let before = await frames(page);
    await page.waitForTimeout(350);
    expect(await frames(page)).toBe(before);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expectState(page, 'animated');
    await setHidden(page, true);
    await expectState(page, 'paused');
    before = await frames(page);
    await page.waitForTimeout(350);
    expect(await frames(page)).toBe(before);
    await setHidden(page, false);
    await expectState(page, 'animated');
    expect(await page.locator(FIELD).evaluate((canvas) => getComputedStyle(canvas).pointerEvents)).toBe('none');
    // Hit testing skips the canvas everywhere, including the corner where no app surface covers it.
    expect(await page.evaluate(() => [[2, 2], [innerWidth / 2, innerHeight / 2], [innerWidth - 2, innerHeight - 2]]
      .every(([x, y]) => !document.elementFromPoint(x, y)?.matches('canvas.background-field')))).toBe(true);
  });

  // Parity-map row 114 (qa/now_ui_check.py:260) and handbook-trace U25, title verbatim.
  test('Reduced motion stops the actual animation timer', async ({ page, noema }) => {
    await enableMotion(noema);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openField(page, noema);
    await expectState(page, 'static');
    const before = await frames(page);
    await page.waitForTimeout(1000);
    expect(await frames(page)).toBe(before);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expectState(page, 'animated');
  });

  // Parity-map row 115 (qa/now_ui_check.py:266), title verbatim.
  test('Injected hidden-document event stops animation', async ({ page, noema }) => {
    await enableMotion(noema);
    await openField(page, noema);
    await expectState(page, 'animated');
    await setHidden(page, true);
    await expectState(page, 'paused');
    const before = await frames(page);
    await page.waitForTimeout(1000);
    expect(await frames(page)).toBe(before);
    await setHidden(page, false);
    await expectState(page, 'animated');
    await expect.poll(() => frames(page)).toBeGreaterThan(before);
  });

  test('window blur pauses and window focus resumes', async ({ page, noema }) => {
    await enableMotion(noema);
    await openField(page, noema);
    await expectState(page, 'animated');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expectState(page, 'paused');
    const before = await frames(page);
    await page.waitForTimeout(500);
    expect(await frames(page)).toBe(before);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expectState(page, 'animated');
  });

  test('sixty seconds without input pauses and pointer input resumes', async ({ page, noema }) => {
    await enableMotion(noema);
    await page.clock.install();
    await openField(page, noema);
    await expectState(page, 'animated');
    // Restart the 60 s window from a known instant, so page-load time cannot push the 59 s check past the timeout.
    await page.mouse.move(10, 10);
    await page.clock.fastForward(59_000);
    await expectState(page, 'animated');
    await page.clock.fastForward(2_000);
    await expectState(page, 'paused');
    await page.mouse.move(40, 40);
    await expectState(page, 'animated');
  });

  test('turning motion on in Settings animates without a reload', async ({ page, noema }) => {
    await openField(page, noema);
    await expectState(page, 'static');
    await page.evaluate(() => { location.hash = '#/settings'; });
    await page.getByLabel('Enable background motion').check();
    await expectState(page, 'animated');
  });

  test('without WebGL2 the static fallback shows and the app stays usable', async ({ page, noema }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, options?: unknown) {
        return type === 'webgl2' ? null : original.call(this, type, options);
      } as typeof original;
    });
    await enableMotion(noema);
    await openField(page, noema);
    await expectState(page, 'unsupported');
    await expect(page.locator(FIELD)).toBeHidden();
    await expect(page.evaluate(() => window.__noemaField!.readPixel(1, 1))).rejects.toThrow('The field is not drawing');
    await page.getByRole('navigation').getByText('Capture', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Capture a thought.' })).toBeVisible();
  });

  test('a lost WebGL context falls back to unsupported and a restored one resumes', async ({ page, noema }) => {
    await enableMotion(noema);
    await openField(page, noema);
    await expectState(page, 'animated');
    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas.background-field')!;
      const lose = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
      (window as unknown as { __lose: WEBGL_lose_context }).__lose = lose;
      lose.loseContext();
    });
    await expectState(page, 'unsupported');
    await page.evaluate(() => (window as unknown as { __lose: WEBGL_lose_context }).__lose.restoreContext());
    await expectState(page, 'animated');
  });

  test('the test seam is absent without ?e2e=1', async ({ page, noema }) => {
    await gotoApp(page, noema);
    await expectState(page, 'static');
    expect(await page.evaluate(() => window.__noemaField === undefined)).toBe(true);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npm --prefix web run build && npm --prefix web run e2e -- e2e/terrain.spec.ts`
Expected: FAIL. The first test reports `Error: Timed out 5000ms waiting for expect(locator).toHaveCount(expected)`, `Expected: 1, Received: 0`, and every test fails because `canvas.background-field` is not in the page.

- [ ] **Step 3: Mount the field in AppShell**

In `web/src/shell/AppShell.tsx`, replace
```tsx
import { Icon } from '../ui/Icon';
```
with
```tsx
import { BackgroundField } from '../ui/BackgroundField';
import { Icon } from '../ui/Icon';
```
and replace
```tsx
    <div className="app">
      <Nav />
```
with (contract §7, exact; the canvas sits inside the app root, before the Nav)
```tsx
    <div className="app">
      <BackgroundField motion={snapshot?.settings.motion ?? false} />
      <Nav />
```
If either old text is not found exactly once (`grep -c` on each line), stop and report it: the shell plan changed `AppShell` and this edit must be re-derived from that plan.

- [ ] **Step 4: Run them and watch them pass**

Run: `npm --prefix web run build && npm --prefix web run e2e -- e2e/terrain.spec.ts`
Expected: PASS, `11 passed`.

- [ ] **Step 5: Run the existing shell suites for regressions**

Run: `npm --prefix web test && npm --prefix web run e2e -- e2e/shell.spec.ts e2e/boot.spec.ts`
Expected: PASS. All Vitest files pass and `shell.spec.ts` and `boot.spec.ts` pass unchanged.

- [ ] **Step 6: Commit**

```bash
git add web/src/shell/AppShell.tsx web/e2e/terrain.spec.ts
git commit -m "feat(web): mount the terrain in the app shell with E2E state tests"
```

---

### Task 7: E2E pixel tests: alpha-0 invariant, quiet-rect updates, RGBA8 fallback, compositing

**Files:**
- Modify: `web/e2e/terrain.spec.ts` (append after the `terrain state machine` describe block, end of file)
- Test: same file.

**Interfaces:**
- Consumes: `FIELD`, `openField`, `enableMotion`, `expectState` (Task 6) and `window.__noemaField.readPixel` (Task 5).
- Produces these spec-local helpers:
  ```ts
  type Box = { left: number; top: number; width: number; height: number };
  function centerBox(page: Page): Box;   // 300×300 CSS px around the viewport centre
  function litIn(page: Page, box: Box, step?: number): Promise<{ total: number; lit: number }>;   // grid of readPixel calls inside box, lit = alpha > 0
  function quietPixels(page: Page, step?: number): Promise<{ total: number; lit: number }>;      // every backing pixel (step 2 CSS px) more than 1 px inside any [data-quiet] rect
  function stripQuiet(page: Page): Promise<void>;   // removes every data-quiet, then dispatches resize so the field re-measures and redraws
  function expectQuietEverywhere(page: Page, noema: NoemaServer, viewport: { width: number; height: number }): Promise<void>;   // motion on, every route, alpha 0 under every quiet surface for 2 frames
  ```
- Test titles that `docs/superpowers/specs/parity-map.md` (row 113) and `handbook-trace.md` (U25) bind verbatim: "Dot field never paints over the reading surface".

- [ ] **Step 1: Write the pixel tests**

Append to `web/e2e/terrain.spec.ts`:
```ts
type Box = { left: number; top: number; width: number; height: number };

function centerBox(page: Page): Box {
  const viewport = page.viewportSize()!;
  return { left: viewport.width / 2 - 150, top: viewport.height / 2 - 150, width: 300, height: 300 };
}

function litIn(page: Page, box: Box, step = 6): Promise<{ total: number; lit: number }> {
  return page.evaluate(async ({ box, step }) => {
    const field = window.__noemaField!;
    const reads: Promise<[number, number, number, number]>[] = [];
    for (let y = box.top + step / 2; y < box.top + box.height; y += step) {
      for (let x = box.left + step / 2; x < box.left + box.width; x += step) {
        if (x >= 0 && y >= 0 && x < innerWidth && y < innerHeight) reads.push(field.readPixel(x, y));
      }
    }
    const pixels = await Promise.all(reads);
    return { total: pixels.length, lit: pixels.filter((pixel) => pixel[3] > 0).length };
  }, { box, step });
}

// step 2 CSS px = every backing pixel at DPR 1 (0.5× store), so a 1-px stroke under a quiet surface cannot slip between samples.
function quietPixels(page: Page, step = 2): Promise<{ total: number; lit: number }> {
  return page.evaluate(async (step) => {
    const field = window.__noemaField!;
    const rects = Array.from(document.querySelectorAll('[data-quiet]'), (element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 1 && rect.height > 1);
    const reads: Promise<[number, number, number, number]>[] = [];
    for (let y = step / 2; y < innerHeight; y += step) {
      for (let x = step / 2; x < innerWidth; x += step) {
        const inside = rects.some((r) => x > r.left + 1 && x < r.right - 1 && y > r.top + 1 && y < r.bottom - 1);
        if (inside) reads.push(field.readPixel(x, y));
      }
    }
    const pixels = await Promise.all(reads);
    return { total: pixels.length, lit: pixels.filter((pixel) => pixel[3] > 0).length };
  }, step);
}

async function stripQuiet(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll('[data-quiet]').forEach((element) => element.removeAttribute('data-quiet'));
    window.dispatchEvent(new Event('resize'));
  });
}

const ROUTES = ['#/overview', '#/capture', '#/notes', '#/plan', '#/settings'] as const;

/** Alpha 0 under every [data-quiet] surface on every route, over two animated frames per route. */
async function expectQuietEverywhere(page: Page, noema: NoemaServer, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await enableMotion(noema);
  await openField(page, noema);
  await expectState(page, 'animated');
  for (const hash of ROUTES) {
    await page.evaluate((next) => { location.hash = next; }, hash);
    await expect(hash === '#/settings' ? page.locator('dialog[open]') : page.locator('h1').first()).toBeVisible();
    await expect.poll(async () => (await quietPixels(page)).lit, { message: hash }).toBe(0);
    for (let frame = 0; frame < 2; frame++) {
      const counts = await quietPixels(page);
      expect(counts.total, hash).toBeGreaterThan(0);
      expect(counts.lit, hash).toBe(0);
    }
  }
}

test.describe('terrain pixels', () => {
  // Parity-map row 113 (qa/now_ui_check.py:252) and handbook-trace U25, title verbatim.
  test('Dot field never paints over the reading surface', async ({ page, noema }) => {
    await expectQuietEverywhere(page, noema, { width: 1440, height: 900 });
  });

  test('Dot field never paints over the reading surface at phone width', async ({ page, noema }) => {
    await expectQuietEverywhere(page, noema, { width: 390, height: 844 });
  });

  // A standalone <dialog data-quiet> (the shape contract §6.2 gives every app dialog), mounted and unmounted the way
  // React does it. The app's Settings route is not used here: it re-mounts the Now screen on open, which would put
  // data-quiet back on the main column and hide whether the dialog itself was measured.
  test('opening and closing a dialog updates the quiet rects', async ({ page, noema }) => {
    await openField(page, noema);
    await expectState(page, 'static');
    await stripQuiet(page);
    const open = () => page.evaluate(() => {
      const dialog = document.createElement('dialog');
      dialog.id = 'quiet-dialog';
      dialog.setAttribute('data-quiet', '');
      Object.assign(dialog.style, { width: '320px', height: '320px', padding: '0', border: '0' });
      document.getElementById('root')!.append(dialog);
      dialog.showModal();
    });
    await open();
    const box = (await page.locator('#quiet-dialog').boundingBox())!;
    const inner = { left: box.x + 2, top: box.y + 2, width: box.width - 4, height: box.height - 4 };
    await expect.poll(async () => (await litIn(page, inner)).lit).toBe(0);
    await page.evaluate(() => {
      const dialog = document.getElementById('quiet-dialog') as HTMLDialogElement;
      dialog.close();
      dialog.remove();
    });
    await expect.poll(async () => (await litIn(page, inner)).lit).toBeGreaterThan(0);
    await open();
    await expect.poll(async () => (await litIn(page, inner)).lit).toBe(0);
  });

  test('resizing a quiet surface without a DOM mutation updates the quiet rects', async ({ page, noema }) => {
    await openField(page, noema);
    await stripQuiet(page);
    const box = centerBox(page);
    await expect.poll(async () => (await litIn(page, box)).lit).toBeGreaterThan(0);
    await page.evaluate((b) => {
      const probe = document.createElement('div');
      probe.id = 'quiet-probe';
      probe.setAttribute('data-quiet', '');
      Object.assign(probe.style, { position: 'fixed', left: `${b.left}px`, top: `${b.top}px`, width: '0px', height: '0px' });
      document.getElementById('root')!.append(probe);
    }, box);
    await expect.poll(async () => (await litIn(page, box)).lit).toBeGreaterThan(0);
    await page.evaluate((b) => {
      const probe = document.getElementById('quiet-probe')!;
      probe.style.width = `${b.width}px`;
      probe.style.height = `${b.height}px`;
    }, box);
    await expect.poll(async () => (await litIn(page, box)).lit).toBe(0);
  });

  test('scrolling a quiet surface into view updates the quiet rects', async ({ page, noema }) => {
    await openField(page, noema);
    await stripQuiet(page);
    const box = centerBox(page);
    await page.evaluate((b) => {
      const scroller = document.createElement('div');
      scroller.id = 'quiet-scroller';
      Object.assign(scroller.style, { position: 'fixed', inset: '0', overflow: 'auto', pointerEvents: 'none' });
      const spacer = document.createElement('div');
      Object.assign(spacer.style, { position: 'relative', height: `${innerHeight * 3}px` });
      const surface = document.createElement('div');
      surface.setAttribute('data-quiet', '');
      Object.assign(surface.style, {
        position: 'absolute', left: `${b.left}px`, top: `${innerHeight * 2 + b.top}px`, width: `${b.width}px`, height: `${b.height}px`,
      });
      spacer.append(surface);
      scroller.append(spacer);
      document.getElementById('root')!.append(scroller);
    }, box);
    await expect.poll(async () => (await litIn(page, box)).lit).toBeGreaterThan(0);
    await page.evaluate(() => { document.getElementById('quiet-scroller')!.scrollTop = innerHeight * 2; });
    await expect.poll(async () => (await litIn(page, box)).lit).toBe(0);
  });

  test('the packed RGBA8 height texture draws when EXT_color_buffer_float is missing', async ({ page, noema }) => {
    await page.addInitScript(() => {
      const original = WebGL2RenderingContext.prototype.getExtension;
      WebGL2RenderingContext.prototype.getExtension = function (this: WebGL2RenderingContext, name: string) {
        if (name === 'EXT_color_buffer_float') {
          (window as unknown as { __floatBlocked: boolean }).__floatBlocked = true;
          return null;
        }
        return original.call(this, name);
      } as typeof original;
    });
    await openField(page, noema);
    await expectState(page, 'static');
    expect(await page.evaluate(() => (window as unknown as { __floatBlocked?: boolean }).__floatBlocked)).toBe(true);
    await expect.poll(async () => (await quietPixels(page)).lit).toBe(0);
    await stripQuiet(page);
    await expect.poll(async () => (await litIn(page, centerBox(page))).lit).toBeGreaterThan(0);
  });

  test('the terrain is visible in the composited page, not hidden behind the app background', async ({ page, noema }) => {
    await openField(page, noema);
    await stripQuiet(page);
    const box = centerBox(page);
    await expect.poll(async () => (await litIn(page, box)).lit).toBeGreaterThan(0);
    const clip = { x: box.left, y: box.top, width: box.width, height: box.height };
    const withField = await page.screenshot({ clip, animations: 'disabled' });
    await page.locator(FIELD).evaluate((canvas) => { (canvas as HTMLCanvasElement).style.visibility = 'hidden'; });
    const without = await page.screenshot({ clip, animations: 'disabled' });
    expect(withField.equals(without)).toBe(false);
  });
});
```

- [ ] **Step 2: Run them**

Run: `npm --prefix web run build && npm --prefix web run e2e -- e2e/terrain.spec.ts -g "terrain pixels"`
Expected: PASS, `7 passed`. These tests pin behaviour Task 5 already implements, so they pass on the first run.

If a test fails, the failure points to a defect to fix in the shared code; never loosen the assertion:
- **Composited test reports identical screenshots:** the AppShell root paints an opaque background over the canvas. Confirm that the `.app` rule in `web/src/styles/shell.css` includes `position: relative; isolation: isolate` (prerequisite). If it does not, stop and report it to the owner: `shell.css` belongs to the shell plan (contract §10), not to this phase.
- **An alpha-0 test reports `lit > 0` under a quiet surface:** inspect the coordinate mapping. `at` in `STROKE_FRAGMENT` and `bx`/`by` in `answerReads` must use the same `scale`.

- [ ] **Step 3: Run the full web gate**

Run: `cd /home/p4nic/code/noema && npm --prefix web ci && npm --prefix web run build && npm --prefix web test && npm --prefix web run e2e && .venv/bin/python -m pytest` (the web gate, contract §0)
Expected: PASS. Every Vitest file passes, every Playwright spec passes (18 in `terrain.spec.ts`), and the `csp` fixture records zero violations.

- [ ] **Step 4: Commit**

```bash
git add web/e2e/terrain.spec.ts
git commit -m "test(web): verify terrain quiet rects and alpha-0 invariant with pixel reads"
```

---

### Task 8: Handbook traceability rows

**Files:**
- Modify: `docs/superpowers/specs/handbook-trace.md` (created by `01-foundation.md` Task 1 Step 8; append one section at end of file; existing rows, including U25 and C2, are not edited). The orchestrator assigned these rows to this phase; contract §10 lists no P5 edit of this file, so the change is append-only.

**Interfaces:**
- Consumes: the test titles from Tasks 1–7; the foundation table format (`| ID | Spec §4.7 bullet | Handbook | Owning plan task | Test (file › title) | Status |`, status `planned`, `01-foundation.md` Step 8); the parser in `06-cutover.md` Task 11 (any table whose header has a `Status` cell; a row turns `green` when a repo path such as `web/e2e/terrain.spec.ts` in it exists).
- Produces: section `## Terrain detail (04-terrain.md)` with rows `U25.1`–`U25.7`. They refine U25 (owned by this phase; its two titles are implemented verbatim in Tasks 6 and 7) and add the animated-budget row. Spec §4.7 Compute ("quiet background < 1% of one core") is already row C2 and is not repeated. `U25.7` names no test file on purpose: `06-cutover.md` Task 11 Step 5 points the terrain-budget row at `tests/test_cutover_docs.py::test_test_report_records_terrain_budget`.

- [ ] **Step 1: Append the rows**

Append to `docs/superpowers/specs/handbook-trace.md`:
```markdown

## Terrain detail (04-terrain.md)

Refines U25. Test titles are the ones Tasks 1–7 of `04-terrain.md` create.

| ID | Spec §4.7 bullet | Handbook | Owning plan task | Test (file › title) | Status |
|---|---|---|---|---|---|
| U25.1 | Motion is optional and off by default (matches the server default `motion: False`) | §10 | 04-terrain.md Tasks 1, 6 | `web/src/ui/field.test.ts` › "is static when the motion setting is off (the server default) or reduced motion is set"; `web/e2e/terrain.spec.ts` › "motion defaults off: one static frame inside the app, no frame timer"; "turning motion on in Settings animates without a reload" | planned |
| U25.2 | Motion is slow and sparse: 12 fps through `setTimeout`, a 120×70 grid, no `requestAnimationFrame` loop | §10, §21 | 04-terrain.md Tasks 1, 2, 5, 6 | `web/src/ui/BackgroundField.test.tsx` › "schedules frames with setTimeout only: no requestAnimationFrame loop and no quiet-rect polling"; `web/src/ui/field.test.ts` › "covers the full 120×70 grid with one instance per point"; `web/e2e/terrain.spec.ts` › "motion on animates at 12 fps through setTimeout" | planned |
| U25.3 | Motion is absent when hidden, blurred or idle for 60 s | §10, §21 | 04-terrain.md Tasks 1, 6 | `web/src/ui/field.test.ts` › "pauses when the document is hidden, the window is blurred or the user is idle"; `web/e2e/terrain.spec.ts` › "Injected hidden-document event stops animation"; "window blur pauses and window focus resumes"; "sixty seconds without input pauses and pointer input resumes" | planned |
| U25.4 | Motion is absent when reduced motion is set | §10 | 04-terrain.md Tasks 1, 6 | `web/e2e/terrain.spec.ts` › "Reduced motion stops the actual animation timer"; "Terrain animates, stays static with reduced motion, pauses when hidden, and does not capture input" | planned |
| U25.5 | The terrain stays inside the app and never under reading or editing surfaces (alpha 0 under every `[data-quiet]`) | §10, §27 | 04-terrain.md Tasks 3, 4, 6, 7 | `web/e2e/terrain.spec.ts` › "Dot field never paints over the reading surface"; "Dot field never paints over the reading surface at phone width"; "opening and closing a dialog updates the quiet rects"; "resizing a quiet surface without a DOM mutation updates the quiet rects"; "scrolling a quiet surface into view updates the quiet rects"; `web/src/ui/fieldShaders.test.ts` › "size the quiet uniform to the packed slots and make alpha exactly 0 inside a quiet rect" | planned |
| U25.6 | Motion is optional: without WebGL2 or after context loss the app stays fully usable | §10 | 04-terrain.md Tasks 5, 6 | `web/src/ui/BackgroundField.test.tsx` › "shows the static fallback state without WebGL2 and stays decorative, whatever the motion setting"; `web/e2e/terrain.spec.ts` › "without WebGL2 the static fallback shows and the app stays usable"; "a lost WebGL context falls back to unsupported and a restored one resumes" | planned |
| U25.7 | The animated terrain meets the measured budget (< 3% of one core, < 6% iGPU) | §21 | 04-terrain.md Task 9; 06-cutover.md Task 11 | `docs/TEST_REPORT.md` › Terrain budget, Animated row | planned |
```

- [ ] **Step 2: Verify the section is present exactly once with seven rows**

Run:
```bash
grep -c '^## Terrain detail (04-terrain.md)$' docs/superpowers/specs/handbook-trace.md
sed -n '/^## Terrain detail (04-terrain.md)$/,$p' docs/superpowers/specs/handbook-trace.md | grep -c '^| U25\.[1-7] .*| planned |$'
```
Expected: `1`, then `7`.

- [ ] **Step 3: Check every quoted title exists in the tests**

Run:
```bash
sed -n '/^## Terrain detail (04-terrain.md)$/,$p' docs/superpowers/specs/handbook-trace.md \
 | grep -o '"[^"]*"' | tr -d '"' | sort -u | while read -r t; do grep -rqF -- "'${t}'" web/src/ui web/e2e/terrain.spec.ts || echo "MISSING $t"; done
```
Expected: no output. Every title is matched with the single quotes the test files use, so a partial title cannot pass.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/handbook-trace.md
git commit -m "docs: trace terrain handbook rules to tasks and tests"
```

---

### Task 9: Cutover budget measurement (run once, after the Electron plan is executed)

This task runs **at cutover**: after the Electron plan (`05-…`), and before `06-cutover.md`'s documentation pass and the owner's merge. The harness is throwaway (decision 13B); its two new files live only in the scratch directory and are never committed. Only `docs/TEST_REPORT.md` changes in the repo. `06-cutover.md` owns that file's §9 rewrite and must keep this section.

This is the **single** spec §7 measurement ("measured once at cutover"). `06-cutover.md` relies on it: its Task 1 counts `## Terrain budget · ` headings in `docs/TEST_REPORT.md`, its Task 9 runs this exact procedure once only if the count is 0, and `tests/test_cutover_docs.py::test_test_report_records_terrain_budget` parses the section this task writes (heading `^## Terrain budget · \d{4}-\d{2}-\d{2}$`, rows `| Animated: … | <cpu> (< <budget>) | <gpu> (< <budget>) | <mib> | PASS or FAIL |`, then `**Overall: PASS**` or `**Overall: FAIL**`). Before Step 1, run `grep -c '^## Terrain budget · ' docs/TEST_REPORT.md`: if it prints `1` or more, the budget was already measured; stop and do not run it again.

**Files:**
- Create (scratch, not committed):
  - `/home/p4nic/code/noema/qa/bench/terrain.py`
  - `/home/p4nic/code/noema/qa/bench/terrain_summary.py`
- Modify: `docs/TEST_REPORT.md` (append the generated section at end of file)
- Test: the run itself. Its pass/fail lines come from the spec §7 budget table.

**Interfaces:**
- Consumes:
  - from `bench.py`, used unchanged: `Sway` (private headless Sway, `gles2`), `Host.scoped`, `Host._spawn`, `Host.wait_mapped`, `Host.main_view`, `Host.pids`, `Host.roots`, `Host.stop`, `sample(host, seconds, label=…)` (fields `status`, `cpu_pct_one_core`, `gpu_pct_app`, `cg_host_only_nonfile_mib_median`; `pss_mib_median` is not used because the recorded benchmark runs show it `null` when PSS is unreadable), `keyboard(sway)` (vkbd: `'x'` = Escape), `record(kind, **data)`, and `bench.OUT` (env `BENCH_OUT`);
  - from the repo: `electron/` (Electron plan, contract P6) and `run.py`.
- Produces:
  - `NoemaHost(Host)`. It adapts `Host` for the new app. The upstream `Host.__init__` launched the experiment's `dist-host/hosts/electron/main.mjs` against `scripts/serve.py`. `NoemaHost` instead:
    - starts `run.py` on a temporary data dir in its own systemd scope;
    - turns motion on through `PATCH /api/settings`;
    - launches the real Electron app in external mode with a throwaway `--profile`.

    Only the Electron scope is in `self.procs`, so `sample()` measures **the Electron app process tree only**, as the budget specifies.
  - The window is mapped on Wayland because the private Sway sets `WAYLAND_DISPLAY`/`XDG_SESSION_TYPE=wayland` and no `DISPLAY`. No Chromium switch is passed, because the Electron CLI (spec §6.3) rejects unknown arguments.

- [ ] **Step 1: Check the preconditions**

Run:
```bash
B=/home/p4nic/code/noema/qa/bench
test -f $B/bench.py && test -x $B/vkbd && test -f /home/p4nic/code/noema/experiments/ui-ab/node_modules/electron/path.txt \
 && test -f /home/p4nic/code/noema/qa/process_sample.py && test -f /home/p4nic/code/noema/electron/node_modules/electron/path.txt \
 && ! ss -ltn | grep -q ':8799 ' && echo READY
npm --prefix /home/p4nic/code/noema/web run build && npm --prefix /home/p4nic/code/noema/electron run build
```
Expected: `READY`, then both builds exit 0.

If `READY` is missing, stop and report the missing piece to the owner. Two cases:
- `bench.py` imports `experiments/ui-ab/node_modules/electron/path.txt` at module load;
- the scratch directory is session-local and may be gone; the owner must then restore the harness.

Do not rebuild the harness inside the repo.

- [ ] **Step 2: Write the adapter**

Create `$B/terrain.py`:
```python
#!/usr/bin/env python3
"""THROWAWAY terrain budget run for spec §7 (decision 13B: never committed).

Reuses bench.py's private headless Sway, process-tree sampler and virtual keyboard. Samples only the
Electron app process tree; the run.py service runs in its own scope and is excluded, as the budget says.
"""
import json, os, shutil, subprocess, sys, tempfile, threading, time, urllib.request
from pathlib import Path

import bench
from bench import Host, Sway, keyboard, record, sample

bench.SWAY_CONFIG = bench.SWAY_CONFIG.replace('mode 1440x960', 'mode 1440x900')  # spec §7: 1440×900 at scale 1
REPO = Path('/home/p4nic/code/noema')
ELECTRON = REPO / 'electron/node_modules/electron/dist' / (REPO / 'electron/node_modules/electron/path.txt').read_text().strip()
PORT = 8799
ORIGIN = f'http://127.0.0.1:{PORT}'
TOKEN = 'terrain-bench-token-0123456789abcdef'


class NoemaHost(Host):
    """The real Electron app (external mode) against run.py on a throwaway data dir and profile."""

    def __init__(self, sway):
        self.name, self.sway, self.procs, self.logs, self.units = 'noema', sway, {}, {}, []
        self.run_id = 'terrain-' + os.urandom(6).hex()
        bench.RUN_IDS.append(self.run_id)
        self.t0 = time.monotonic()
        self.data = Path(tempfile.mkdtemp(prefix='noema-terrain-data-'))
        self.profile = Path(tempfile.mkdtemp(prefix='noema-terrain-profile-'))
        # Inherited NOEMA_* (models, tokens, data dir) must not reach the service, as in web/e2e/server.ts childEnv.
        self.env = {k: v for k, v in sway.env.items() if not k.startswith('NOEMA_')} | {'NOEMA_ACCESS_TOKEN': TOKEN}
        self.service = subprocess.Popen(
            self.scoped('service', [str(REPO / '.venv/bin/python'), str(REPO / 'run.py'), '--host', '127.0.0.1',
                                    '--port', str(PORT), '--data-dir', str(self.data)]),
            cwd=REPO, env=self.env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            self.wait_health()
            self.api('PATCH', '/api/settings', {'motion': True})
            self.procs['shell'] = self._spawn('shell', [str(ELECTRON), str(REPO / 'electron'),
                                                        '--server', ORIGIN, '--profile', str(self.profile)])
        except BaseException:
            self.stop()  # never leak the scoped service or the temp dirs when startup fails
            raise

    def api(self, method, path, body):
        request = urllib.request.Request(ORIGIN + path, data=json.dumps(body).encode(), method=method, headers={
            'Authorization': f'Bearer {TOKEN}', 'X-Noema-Request': '1', 'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=5) as response:
            return json.loads(response.read())

    def wait_health(self, timeout=15):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.service.poll() is not None:
                raise RuntimeError('run.py exited during startup')
            try:
                with urllib.request.urlopen(ORIGIN + '/api/health', timeout=1):
                    return
            except OSError:
                time.sleep(.2)
        raise RuntimeError('run.py never became healthy')

    def stop(self, timeout=8):
        super().stop(timeout)
        if self.service.poll() is None:
            self.service.terminate()
            try:
                self.service.wait(timeout)
            except subprocess.TimeoutExpired:
                self.service.kill(); self.service.wait()
        shutil.rmtree(self.data, ignore_errors=True)
        shutil.rmtree(self.profile, ignore_errors=True)


def frames_change(sway, tag):
    shots = bench.OUT / 'terrain-shots'
    shots.mkdir(exist_ok=True)
    first, second = shots / f'{tag}-1.png', shots / f'{tag}-2.png'
    if not sway.grim(first):
        raise RuntimeError('grim failed')
    time.sleep(1)
    if not sway.grim(second):
        raise RuntimeError('grim failed')
    return first.read_bytes() != second.read_bytes()


def run(runs=3):
    for i in range(runs):
        sway, host = Sway('gles2'), None
        try:
            host = NoemaHost(sway)
            if not host.wait_mapped():
                raise RuntimeError('Electron window never mapped on the private Sway')
            time.sleep(10)
            view = host.main_view()
            sway.msg(f'[pid={view["pid"]}] focus')
            k, send = keyboard(sway)
            res = {'rect': view['rect']}
            send('x')  # Escape with no dialog open: an input event that changes nothing in the app
            res['animated_frames_change'] = frames_change(sway, f'{host.run_id}-animated')
            stop = threading.Event()

            def poke():
                while not stop.wait(5):
                    send('x')

            poker = threading.Thread(target=poke, daemon=True)
            poker.start()
            try:
                res['animated'] = sample(host, 30, label='animated')
            finally:
                stop.set(); poker.join()
            k.stdin.close(); k.wait(5)
            time.sleep(65)  # IDLE_TIMEOUT_MS (60 s) plus margin, with no input
            res['paused_frames_change'] = frames_change(sway, f'{host.run_id}-paused')
            res['paused'] = sample(host, 30, label='paused-idle')
            sway.msg(f'[pid={view["pid"]}] move scratchpad')
            time.sleep(5)
            res['hidden_views_visible'] = [v.get('visible') for v in sway.views() if v['pid'] in set(host.pids())]
            res['hidden'] = sample(host, 30, label='hidden')
            record('terrain', run=i, alive=host.alive(), **res)
        except Exception as error:  # noqa: BLE001
            record('terrain', run=i, ok=False, err=repr(error)[:300])
        finally:
            if host:
                host.stop()
            sway.stop()
            time.sleep(2)


if __name__ == '__main__':
    run(int(sys.argv[1]) if len(sys.argv) > 1 else 3)
```

- [ ] **Step 3: Write the summariser**

Create `$B/terrain_summary.py`:
```python
#!/usr/bin/env python3
"""THROWAWAY: turn terrain.py results into the TEST_REPORT section (spec §7 budget)."""
import datetime, json, statistics, sys
from pathlib import Path

OUT = Path(sys.argv[1])
BUDGET = {'animated': (3.0, 6.0), 'paused': (1.0, 0.5), 'hidden': (1.0, 0.05)}  # spec §7: (CPU % of one core, iGPU busy %)
rows = [json.loads(line) for line in (OUT / 'results.jsonl').read_text().splitlines() if line.strip()]
terrain = [r for r in rows if r.get('kind') == 'terrain']
# A run counts only when every sample saw the whole Electron tree (process_sample status 'sampled', not 'incomplete').
runs = [r for r in terrain if all(r.get(state, {}).get('status') == 'sampled' for state in BUDGET)]
failed = [r for r in terrain if r not in runs]
if len(runs) < 3:
    sys.exit(f'Need 3 complete runs, have {len(runs)} ({len(failed)} failed or incomplete); see {OUT / "results.jsonl"}')
LABEL = {'animated': 'Animated: focused, Escape key every 5 s',
         'paused': 'Paused: 65 s without input (idle timeout)',
         'hidden': 'Hidden: blurred in the Sway scratchpad (document.hidden stays false on Wayland)'}


def median(key, state):
    return round(statistics.median(r[state][key] for r in runs), 2)


lines = [f'## Terrain budget · {datetime.date.today().isoformat()}', '',
         'Spec §7 method: Electron app process tree only (the run.py service is excluded), private headless Sway '
         '(gles2, Iris Xe), 1440×900 at scale 1, motion on, reduced motion off, 30 s samples, median of 3 runs. '
         'Harness: the throwaway bench.py plus terrain.py (decision 13B), not committed.', '',
         '| State | CPU % of one core (budget) | iGPU busy % (budget) | Electron non-file MiB (cgroup) | Result |',
         '|---|---|---|---|---|']
passed = True
for state, (cpu_max, gpu_max) in BUDGET.items():
    cpu, gpu, mib = median('cpu_pct_one_core', state), median('gpu_pct_app', state), median('cg_host_only_nonfile_mib_median', state)
    ok = cpu < cpu_max and gpu < gpu_max
    passed = passed and ok
    lines.append(f'| {LABEL[state]} | {cpu} (< {cpu_max}) | {gpu} (< {gpu_max}) | {mib} | {"PASS" if ok else "FAIL"} |')
changed = sum(bool(r['animated_frames_change']) for r in runs)
frozen = sum(not r['paused_frames_change'] for r in runs)
lines += ['',
          f'Screen check: animated frames changed in {changed}/{len(runs)} runs (gating: proves motion was really on); '
          f'paused frames were identical in {frozen}/{len(runs)} runs (informational: any CSS animation in the app also changes the screen, '
          'and a terrain that kept drawing would already fail the Paused CPU row).',
          f'Hidden-view visibility flags: {[r["hidden_views_visible"] for r in runs]}. Failed runs discarded: {len(failed)}.',
          'iGPU budgets: paused "~0%" is read as < 0.5%, hidden "0%" as < 0.05% (sampling rounding). '
          'The handbook §21 memory figure (Electron plus service) is measured separately by the cutover phase.',
          f'**Overall: {"PASS" if passed and changed == len(runs) else "FAIL"}**', '']
print('\n'.join(lines))
```

- [ ] **Step 4: Run the measurement (about 10 minutes)**

Run:
```bash
cd /home/p4nic/code/noema/qa/bench
rm -rf out-terrain   # results.jsonl appends; a leftover attempt would otherwise be summarised with this run
BENCH_OUT=$PWD/out-terrain timeout 1500 python3 terrain.py 3
python3 terrain_summary.py out-terrain
```
Expected: three `{"kind": "terrain", "run": N, … "alive": true …}` lines. The summary then prints a table whose last line is `**Overall: PASS**`.

If it prints `FAIL`, continue with Step 5 anyway: spec §7 says the result is recorded. Then stop and report the failing row to the owner. Spec §1 makes the budget a success criterion, so cutover stays blocked until the owner decides. Do not tune the thresholds.

- [ ] **Step 5: Record the numbers**

Run:
```bash
cd /home/p4nic/code/noema/qa/bench
python3 terrain_summary.py out-terrain > out-terrain/section.md \
 && { echo; cat out-terrain/section.md; } >> /home/p4nic/code/noema/docs/TEST_REPORT.md
grep -c '^## Terrain budget · ' /home/p4nic/code/noema/docs/TEST_REPORT.md
```
Expected: `1`. The summary is written to a file first, so a run with fewer than 3 complete samples appends nothing (the summariser exits non-zero with the reason).

- [ ] **Step 6: Check the record parses the way the cutover test expects**

Run:
```bash
python3 - <<'PY'
import re
c = open('/home/p4nic/code/noema/docs/TEST_REPORT.md', encoding='utf-8').read()
assert re.search(r'^## Terrain budget · \d{4}-\d{2}-\d{2}$', c, re.M)
for state in ('Animated', 'Paused', 'Hidden'):
    assert re.search(rf'^\| {state}: [^|]+ \| [0-9.]+ \(< [0-9.]+\) \| [0-9.]+ \(< [0-9.]+\) \| [0-9.]+ \| (?:PASS|FAIL) \|$', c, re.M), state
assert re.search(r'^\*\*Overall: (?:PASS|FAIL)\*\*$', c, re.M)
print('terrain record OK')
PY
```
Expected: `terrain record OK` (the same regexes as `06-cutover.md` Task 9's `test_test_report_records_terrain_budget`).

- [ ] **Step 7: Commit**

```bash
git add docs/TEST_REPORT.md
git commit -m "docs: record terrain budget measurement"
```

---

## Spec coverage

| Spec requirement in scope | Task |
|---|---|
| §7 WebGL2 required; without it the static fallback, `data-state="unsupported"`, nothing animated | 1, 5 (jsdom unsupported test, `field.css` hides the canvas), 6 (E2E no-WebGL2, context loss) |
| §7 Height pass: fragment shader renders height/slope for the 120×70 grid into RGBA16F (`EXT_color_buffer_float`) | 1 (grid constants), 4 (`HEIGHT_FRAGMENT`), 5 (`heightTarget` RGBA16F + framebuffer completeness check) |
| §7 RGBA8 with packed values when the extension is missing | 4 (shared normalized packing), 5 (`allocateGrid` fallback), 7 (E2E with the extension blocked) |
| §7 8,400 `field()` evaluations per frame, not per vertex | 1 (8,400 constant), 4 (`field(` only in the height pass) |
| §7 Stroke pass: `drawArraysInstanced`, one instance per grid point, 2 vertices, `texelFetch`, shared fetch | 2 (`buildInstances`), 4 (`STROKE_VERTEX`), 5 (`drawArraysInstanced(gl.LINES, 0, 2, …)`) |
| §7 `antialias: false`, `preserveDrawingBuffer: false` | 5 (unit test asserts the context options) |
| §7 Backing store 0.5× device pixels, upscaled with CSS | 2 (`backingSize`), 5 (`field.css` 100% size), 7 (`readPixel` mapping in alpha-0 tests) |
| §7 `setTimeout` at 12 fps, no `requestAnimationFrame` loop | 1 (`FRAME_INTERVAL_MS`), 5 (source test), 6 (E2E 16–26 frames in 2 s) |
| §7 `QUALITY_STEPS` and slow-frame step-down kept, driven by measured draw time | 1, 2 (`gridSize`, `stepQuality`), 5 (`tick` → `regrid`) |
| §7 Quiet rects: ResizeObserver + MutationObserver on the app root (childList, subtree) + scroll; 500 ms polling removed | 3, 5 (source tests), 7 (resize, dialog and scroll E2E) |
| §7 A test opens a dialog and asserts the quiet rects update | 7 ("opening and closing a dialog updates the quiet rects") |
| §7 Invariant: alpha under the reading column is 0, read through the seam | 3 (`removeContained`), 4 (shader zero-alpha), 7 (every route, 1440 and 390 px, 2 frames) |
| §7 State machine inputs, the four states, `data-state` | 1 (all 64 combinations), 5, 6 (one E2E per input) |
| §7 Paused after 60 s with no `pointermove`, `keydown`, `wheel`, `touchstart`, `focus` | 1 (`IDLE_TIMEOUT_MS`), 5 (`ACTIVITY_EVENTS`), 6 (fake-clock E2E), 9 (paused sample after 65 s) |
| §7 Motion setting defaults to off, matching the server | 6 ("motion defaults off…", Settings toggle) |
| §7 `field.test.mjs` rewritten for the new signature and grid, ported to Vitest | 1, 2, 3 |
| §7 Test seam `window.__noemaField = {frames, readPixel}`, only with `?e2e=1`, `readPixel` inside draw, inert without the flag | 5 (unit), 6 (absent without the flag), 7 (all pixel tests) |
| §7 Budget (Electron tree, Iris Xe, headless Sway gles2, 1440×900, 30 s, three states) measured once at cutover and recorded in TEST_REPORT | 9 (the single run; `06-cutover.md` Tasks 1 and 9 check the record and run this procedure only if it has not run) |
| §8 Unit "field: state machine, grid, quiet-rect packing"; §8 only production hook is the `?e2e=1` seam | 1, 2, 3, 5 |
| §4.7 Motion: slow, sparse, optional; absent when hidden or reduced motion; inside the app; never under reading/editing surfaces | 1, 2, 5, 6, 7, 8 |
| §4.7 Compute: quiet background < 1% of one core (= the paused/hidden budget) | 9 |
| §4.7 Traceability rows in `handbook-trace.md` (foundation format, `planned` status that `06-cutover.md` Task 11 flips) | 8 |
| §8 parity gate: parity-map rows 41, 113, 114, 115 and trace U25 name `web/e2e/terrain.spec.ts` titles verbatim | 6 (rows 41, 114, 115), 7 (row 113) |
| §1 success criterion: "The WebGL terrain meets the measured budget in §7" | 9 (FAIL blocks cutover and is reported to the owner) |
| Contract §7: `AppShell` renders `<BackgroundField motion={snapshot?.settings.motion ?? false}/>` as its first child | 6 |
