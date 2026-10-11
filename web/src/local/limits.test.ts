import { describe, expect, it } from 'vitest';
import { S } from '../strings';
import type { StoredFile } from './db';
import { ACCEPT_ATTR, MAX_FILE_BYTES, MAX_TOTAL_BYTES, validateFiles } from './limits';

const MB = 1024 * 1024;
// validateFiles reads only name, type and size, so large files need no real bytes.
const file = (name: string, type: string, size = 10) => ({ name, type, size }) as unknown as File;
const stored = (size: number): StoredFile => ({ name: 'kept.png', blob: { size } as Blob });

describe('validateFiles (spec §4.4)', () => {
  it('accepts exactly the server allowlist, ignoring MIME parameters', () => {
    const types = ['image/png', 'image/jpeg', 'image/webp', 'audio/wav', 'audio/ogg', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/mpeg'];
    const { accepted, rejections } = validateFiles([], types.map((type, i) => file(`f${i}`, type)));
    expect(rejections).toEqual([]);
    expect(accepted.map((f) => f.name)).toEqual(types.map((_, i) => `f${i}`));
    expect(ACCEPT_ATTR).toBe('image/png,image/jpeg,image/webp,audio/wav,audio/ogg,audio/webm,audio/mp4,audio/mpeg');
  });

  it('rejects other types with their own message and keeps going', () => {
    const { accepted, rejections } = validateFiles([], [file('a.gif', 'image/gif'), file('b.webm', 'video/webm'), file('c', ''), file('d.png', 'image/png')]);
    expect(rejections.map((r) => [r.code, r.name, r.message])).toEqual([
      ['unsupported-type', 'a.gif', S.unsupportedType],
      ['unsupported-type', 'b.webm', S.unsupportedType],
      ['unsupported-type', 'c', S.unsupportedType],
    ]);
    expect(accepted.map((f) => f.name)).toEqual(['d.png']);
  });

  it('allows 32 MB per file and rejects one byte more, naming the file', () => {
    const { accepted, rejections } = validateFiles([], [file('ok.wav', 'audio/wav', MAX_FILE_BYTES), file('big.wav', 'audio/wav', MAX_FILE_BYTES + 1)]);
    expect(accepted.map((f) => f.name)).toEqual(['ok.wav']);
    expect(rejections).toEqual([{ code: 'too-large', name: 'big.wav', message: 'big.wav exceeds 32 MB.' }]);
  });

  it('keeps the total strictly under 60 MB, counting files already attached', () => {
    const { accepted, rejections } = validateFiles([stored(30 * MB)], [file('a.wav', 'audio/wav', 29 * MB), file('b.wav', 'audio/wav', MB), file('c.png', 'image/png', MB - 1)]);
    expect(accepted.map((f) => f.name)).toEqual(['a.wav', 'c.png']);
    expect(rejections).toEqual([{ code: 'total-too-large', name: 'b.wav', message: S.totalTooLarge }]);
    expect(30 * MB + 29 * MB + MB - 1).toBeLessThan(MAX_TOTAL_BYTES);
  });

  it('stops at 12 attachments with one message', () => {
    const existing = Array.from({ length: 10 }, () => stored(1));
    const { accepted, rejections } = validateFiles(existing, ['1', '2', '3', '4'].map((n) => file(`${n}.png`, 'image/png')));
    expect(accepted.map((f) => f.name)).toEqual(['1.png', '2.png']);
    expect(rejections).toEqual([{ code: 'too-many', name: '3.png', message: S.tooManyFiles }]);
  });

  it('names an unnamed pasted image visual.png', () => {
    expect(validateFiles([], [file('', 'image/png')]).accepted[0].name).toBe('visual.png');
  });
});
