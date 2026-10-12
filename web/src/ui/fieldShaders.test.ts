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
