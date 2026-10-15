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

export type GridSize = { columns: number; rows: number };
export const SLOW_DRAW_MS = 2.4 * FRAME_INTERVAL_MS, SLOW_DRAWS_TO_STEP = 20;

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

export function stepQuality(state: { quality: number; slow: number }, intervalMs: number): { quality: number; slow: number } {
  const slow = intervalMs > SLOW_DRAW_MS
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

export function packQuietRects(rects: Rect[], viewportWidth: number, viewportHeight: number): Float32Array {
  const packed = new Float32Array(QUIET_SLOTS * 4);
  const area = (rect: Rect) => rect.width * rect.height;
  const visible = rects
    .map((rect) => {
      const left = Math.max(0, rect.left), top = Math.max(0, rect.top);
      const right = Math.min(viewportWidth, rect.left + rect.width), bottom = Math.min(viewportHeight, rect.top + rect.height);
      return { left, top, width: right - left, height: bottom - top };
    })
    .filter((rect) => Number.isFinite(rect.width + rect.height) && rect.width > 1 && rect.height > 1)
    .sort((a, b) => area(b) - area(a));
  while (visible.length > QUIET_SLOTS) {
    const [a, b] = visible.splice(-2);
    const left = Math.min(a.left, b.left), top = Math.min(a.top, b.top);
    visible.push({ left, top, width: Math.max(a.left + a.width, b.left + b.width) - left, height: Math.max(a.top + a.height, b.top + b.height) - top });
    visible.sort((x, y) => area(y) - area(x));
  }
  visible.forEach((rect, i) => packed.set([rect.left, rect.top, rect.width, rect.height], i * 4));
  return packed;
}

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
