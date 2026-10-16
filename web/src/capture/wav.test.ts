import { describe, expect, it } from 'vitest';
import { WAV_RATE, downsample, encodeWav, level } from './wav';

const text = (bytes: Uint8Array, at: number, n: number) => String.fromCharCode(...bytes.slice(at, at + n));

describe('wav', () => {
  it('writes a valid 16 kHz mono 16-bit header and sample data', () => {
    const bytes = encodeWav([new Float32Array([0, 1, -1]), new Float32Array([0.5])], WAV_RATE);
    const view = new DataView(bytes.buffer);
    expect([text(bytes, 0, 4), text(bytes, 8, 4), text(bytes, 12, 4), text(bytes, 36, 4)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect([view.getUint16(20, true), view.getUint16(22, true), view.getUint32(24, true), view.getUint16(34, true)]).toEqual([1, 1, 16000, 16]);
    expect(view.getUint32(40, true)).toBe(8);
    expect(view.getUint32(4, true)).toBe(36 + 8);
    expect([0, 1, 2, 3].map(i => view.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32768, 16383]);
  });

  it('clips out-of-range samples', () => {
    const view = new DataView(encodeWav([new Float32Array([3, -3])], WAV_RATE).buffer);
    expect([view.getInt16(44, true), view.getInt16(46, true)]).toEqual([32767, -32768]);
  });

  it('downsamples 48 kHz to 16 kHz by averaging and leaves lower rates alone', () => {
    expect([...downsample(new Float32Array([0.3, 0.6, 0.9, 0, 0, 0]), 48000)]).toEqual([expect.closeTo(0.6), 0]);
    const low = new Float32Array([1, 2]);
    expect(downsample(low, 8000)).toBe(low);
    expect(encodeWav([new Float32Array(48000)], 48000).length).toBe(44 + 16000 * 2);
  });

  it('empty audio is a header only', () => {
    expect(encodeWav([], 44100).length).toBe(44);
  });

  it('level is 0 for silence and capped at 1', () => {
    expect(level(new Float32Array(10))).toBe(0);
    expect(level(new Float32Array([1, -1]))).toBe(1);
    expect(level(new Float32Array(0))).toBe(0);
  });
});
