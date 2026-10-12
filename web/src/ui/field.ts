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
