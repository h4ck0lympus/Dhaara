import { describe, expect, it } from 'vitest';
import { CLOSED_SIZE, COMPANION_MARGIN, OPEN_SIZE, companionBounds, parseCompanionMessage } from '../src/companion-protocol.js';

describe('parseCompanionMessage', () => {
  it.each([
    [{ type: 'resize', open: true }, { type: 'resize', open: true }],
    [{ type: 'visible', visible: false }, { type: 'visible', visible: false }],
    [{ type: 'open-app', path: '/task/abc123' }, { type: 'open-app', path: '/task/abc123' }],
    [{ type: 'open-app', path: '/notes?note=n1' }, { type: 'open-app', path: '/notes?note=n1' }],
  ])('accepts %j', (input, expected) => expect(parseCompanionMessage(input)).toEqual(expected));

  it.each([
    null, 'resize', 42, {}, { type: 'resize', open: 'yes' }, { type: 'visible' }, { type: 'quit' },
    { type: 'open-app', path: 'https://evil.test' }, { type: 'open-app', path: '//evil.test/x' }, { type: 'open-app', path: '/a/../../etc' },
    { type: 'open-app', path: '/x"; alert(1)' }, { type: 'open-app', path: '/' + 'a'.repeat(300) }, { type: 'open-app', path: 7 },
  ])('rejects %j', input => expect(parseCompanionMessage(input)).toBeNull());
});

describe('companionBounds', () => {
  const area = { x: 0, y: 30, width: 1920, height: 1050 };
  it('anchors bottom-right with a margin, closed and open', () => {
    expect(companionBounds(area, false)).toEqual({ x: 1920 - CLOSED_SIZE.width - COMPANION_MARGIN, y: 30 + 1050 - CLOSED_SIZE.height - COMPANION_MARGIN, ...CLOSED_SIZE });
    expect(companionBounds(area, true)).toEqual({ x: 1920 - OPEN_SIZE.width - COMPANION_MARGIN, y: 30 + 1050 - OPEN_SIZE.height - COMPANION_MARGIN, ...OPEN_SIZE });
  });
  it('stays inside a small or offset work area', () => {
    expect(companionBounds({ x: 100, y: 50, width: 300, height: 400 }, true)).toEqual({ x: 100, y: 50, width: 300, height: 400 });
  });
});
