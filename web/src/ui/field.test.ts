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
