import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BACKING_SCALE,
  FRAME_INTERVAL_MS,
  GRID_COLUMNS,
  GRID_ROWS,
  IDLE_TIMEOUT_MS,
  QUALITY_STEPS,
  QUIET_SELECTOR,
  QUIET_SLOTS,
  SLOW_DRAWS_TO_STEP,
  SLOW_DRAW_MS,
  backingSize,
  buildInstances,
  fieldState,
  gridSize,
  stepQuality,
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

  afterEach(() => vi.useRealTimers());

  it('threshold is 2.4x the target tick interval', () => {
    expect(SLOW_DRAW_MS).toBeCloseTo(2.4 * FRAME_INTERVAL_MS);
  });

  it('steps down one level only after more than 20 consecutive slow ticks, then resets the counter', () => {
    let state = { quality: 0, slow: 0 };
    for (let i = 0; i < SLOW_DRAWS_TO_STEP; i++) state = stepQuality(state, slow);
    expect(state).toEqual({ quality: 0, slow: SLOW_DRAWS_TO_STEP });
    state = stepQuality(state, slow);
    expect(state).toEqual({ quality: 1, slow: 0 });
  });

  it('lets fast ticks pay back slow ones so an occasional hitch never steps down', () => {
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

  // Drives stepQuality with the measured gap between timer ticks, as the render loop does.
  function runTicks(periodMs: number, ticks: number) {
    vi.useFakeTimers();
    let state = { quality: 0, slow: 0 };
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      state = stepQuality(state, now - last);
      last = now;
    }, periodMs);
    vi.advanceTimersByTime(periodMs * ticks);
    clearInterval(id);
    return state;
  }

  it('steps quality down when real ticks arrive late', () => {
    expect(runTicks(SLOW_DRAW_MS + 20, 60).quality).toBeGreaterThan(0);
  });

  it('keeps quality when ticks arrive on time', () => {
    expect(runTicks(FRAME_INTERVAL_MS, 600)).toEqual({ quality: 0, slow: 0 });
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
