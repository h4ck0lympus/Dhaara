import { describe, expect, it } from 'vitest';
import { SKETCH_UNDO_LIMIT, pushUndo } from './Sketch';

describe('pushUndo', () => {
  it('keeps at most 12 steps, dropping the oldest (app.js:449)', () => {
    let stack: number[] = [];
    for (let step = 1; step <= 15; step += 1) stack = pushUndo(stack, step);
    expect(SKETCH_UNDO_LIMIT).toBe(12);
    expect(stack).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it('does not mutate the previous stack', () => {
    const before = [1, 2];
    const after = pushUndo(before, 3);
    expect(before).toEqual([1, 2]);
    expect(after).toEqual([1, 2, 3]);
  });
});
