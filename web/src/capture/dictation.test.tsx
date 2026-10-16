// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DICTATION_TEXT, elapsed, useDictation } from './dictation';

let processor: { onaudioprocess: ((e: unknown) => void) | null; connect: ReturnType<typeof vi.fn> };
let stopTrack: ReturnType<typeof vi.fn>;
let closed: boolean;

beforeEach(() => {
  vi.useFakeTimers();
  stopTrack = vi.fn(); closed = false;
  processor = { onaudioprocess: null, connect: vi.fn() };
  class FakeContext {
    sampleRate = 16000;
    destination = {};
    createMediaStreamSource() { return { connect: vi.fn() }; }
    createScriptProcessor() { return processor; }
    close() { closed = true; return Promise.resolve(); }
  }
  vi.stubGlobal('AudioContext', FakeContext);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] })) } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const feed = (values: number[]) => act(() => { processor.onaudioprocess!({ inputBuffer: { getChannelData: () => new Float32Array(values) } }); });

describe('useDictation', () => {
  it('records, counts seconds, shows levels and stops into WAV bytes', async () => {
    const { result } = renderHook(() => useDictation());
    await act(async () => { await result.current.start(); });
    expect(result.current.phase).toBe('recording');
    feed([0.5, -0.5, 0.5, -0.5]);
    feed([0, 0]);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.seconds).toBe(2);
    expect(result.current.levels.at(-2)).toBeGreaterThan(0);
    let bytes: Uint8Array | null = null;
    act(() => { bytes = result.current.stop(); });
    expect(result.current.phase).toBe('recorded');
    expect(bytes!.length).toBe(44 + 6 * 2);
    expect(result.current.audio()).toBe(bytes);
    expect(stopTrack).toHaveBeenCalled();
    expect(closed).toBe(true);
  });

  it('stops by itself at the time limit', async () => {
    const { result } = renderHook(() => useDictation(3));
    await act(async () => { await result.current.start(); });
    act(() => { vi.advanceTimersByTime(3000); });
    act(() => { vi.runOnlyPendingTimers(); });
    expect(result.current.phase).toBe('recorded');
  });

  it('reset discards the recording and releases the microphone', async () => {
    const { result } = renderHook(() => useDictation());
    await act(async () => { await result.current.start(); });
    act(() => result.current.reset());
    expect(result.current.phase).toBe('idle');
    expect(result.current.audio()).toBeNull();
    expect(stopTrack).toHaveBeenCalled();
  });

  it('explains a refused or missing microphone', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => { throw new Error('denied'); }) } });
    const { result } = renderHook(() => useDictation());
    await act(async () => { await result.current.start(); });
    expect(result.current.error).toBe(DICTATION_TEXT.denied);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    await act(async () => { await result.current.start(); });
    expect(result.current.error).toBe(DICTATION_TEXT.unsupported);
    expect(result.current.phase).toBe('idle');
  });

  it('formats elapsed time', () => {
    expect([elapsed(0), elapsed(7), elapsed(65)]).toEqual(['0:00', '0:07', '1:05']);
  });
});
