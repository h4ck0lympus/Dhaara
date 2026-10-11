// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../local/drafts', () => ({
  captureDraftStore: { addFiles: vi.fn(async () => []), getSnapshot: vi.fn(() => ({ saving: false })) },
}));
vi.mock('../ui/Toast', async importOriginal => ({ ...(await importOriginal<typeof import('../ui/Toast')>()), toast: vi.fn() }));

import { captureDraftStore } from '../local/drafts';
import { S } from '../strings';
import { toast } from '../ui/Toast';
import {
  RECORDER_TEXT,
  RECORD_AUTO_STOP_BYTES,
  formatElapsed,
  pickMimeType,
  recordingFileName,
  useRecorder,
} from './Recorder';

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static isTypeSupported(type: string): boolean {
    return type === 'audio/webm';
  }
  state: RecordingState = 'inactive';
  mimeType: string;
  timeslice = 0;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly stream: MediaStream, readonly options: MediaRecorderOptions) {
    this.mimeType = options.mimeType ?? '';
    FakeRecorder.instances.push(this);
  }
  start(timeslice: number) { this.timeslice = timeslice; this.state = 'recording'; }
  pause() { this.state = 'paused'; }
  resume() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.onstop?.(); }
  emit(data: Blob) { this.ondataavailable?.({ data }); }
}

const track = { stop: vi.fn() };
const stream = { getTracks: () => [track] } as unknown as MediaStream;
let getUserMedia: ReturnType<typeof vi.fn>;

function setMediaDevices(value: unknown) {
  Object.defineProperty(navigator, 'mediaDevices', { value, configurable: true });
}

beforeEach(() => {
  FakeRecorder.instances = [];
  getUserMedia = vi.fn(async () => stream);
  setMediaDevices({ getUserMedia });
  vi.stubGlobal('MediaRecorder', FakeRecorder);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('recorder helpers', () => {
  it('prefers webm/opus, then webm, then ogg/opus, then mp4 (app.js:425)', () => {
    expect(pickMimeType(() => true)).toBe('audio/webm;codecs=opus');
    expect(pickMimeType(type => type === 'audio/webm')).toBe('audio/webm');
    expect(pickMimeType(type => type.startsWith('audio/ogg'))).toBe('audio/ogg;codecs=opus');
    expect(pickMimeType(type => type === 'audio/mp4')).toBe('audio/mp4');
    expect(pickMimeType(() => false)).toBeUndefined();
  });

  it('names recordings by time and container (app.js:432-434)', () => {
    const at = new Date('2026-10-10T12:34:56.789Z');
    expect(recordingFileName('audio/webm;codecs=opus', at)).toBe('voice-2026-10-10T12-34-56-789Z.webm');
    expect(recordingFileName('audio/ogg;codecs=opus', at)).toBe('voice-2026-10-10T12-34-56-789Z.ogg');
    expect(recordingFileName('audio/mp4', at)).toBe('voice-2026-10-10T12-34-56-789Z.m4a');
  });

  it('formats elapsed time as m:ss', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(61_999)).toBe('1:01');
    expect(formatElapsed(3_600_000)).toBe('60:00');
    expect(formatElapsed(-5)).toBe('0:00');
  });
});

describe('useRecorder', () => {
  it('never touches the microphone until start()', async () => {
    const { result } = renderHook(() => useRecorder());
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('idle');
    expect(result.current.status).toBe(RECORDER_TEXT.idle);
    await act(() => result.current.start());
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    const [recorder] = FakeRecorder.instances;
    expect(recorder.options).toEqual({ mimeType: 'audio/webm', audioBitsPerSecond: 64_000 });
    expect(recorder.timeslice).toBe(1_000);
    expect(result.current.phase).toBe('recording');
  });

  it('a second start while recording does not open a second stream', async () => {
    const { result } = renderHook(() => useRecorder());
    await act(() => result.current.start());
    await act(() => result.current.start());
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(FakeRecorder.instances).toHaveLength(1);
  });

  it('explains when recording is unsupported or the microphone is refused', async () => {
    setMediaDevices(undefined);
    const { result } = renderHook(() => useRecorder());
    await act(() => result.current.start());
    expect(toast).toHaveBeenCalledWith(RECORDER_TEXT.unsupported, { tone: 'error' });
    setMediaDevices({ getUserMedia: vi.fn(async () => { throw new Error('Permission denied'); }) });
    await act(() => result.current.start());
    expect(toast).toHaveBeenCalledWith('Microphone unavailable: Permission denied', { tone: 'error' });
    expect(result.current.phase).toBe('idle');
  });

  it('counts elapsed time only while recording, not while paused', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
    const { result } = renderHook(() => useRecorder());
    await act(() => result.current.start());
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(result.current.elapsedMs).toBe(3_000);
    expect(result.current.status).toBe('0:03 · recording locally');
    act(() => result.current.pause());
    expect(result.current.phase).toBe('paused');
    expect(FakeRecorder.instances[0].state).toBe('paused');
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(result.current.elapsedMs).toBe(3_000);
    expect(result.current.status).toBe('0:03 · paused');
    act(() => result.current.resume());
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(result.current.elapsedMs).toBe(5_000);
    expect(result.current.phase).toBe('recording');
  });

  it('Stop adds one voice file to the capture draft and releases the microphone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T12:34:56.789Z'));
    const { result } = renderHook(() => useRecorder());
    await act(() => result.current.start());
    FakeRecorder.instances[0].emit(new Blob(['abc'], { type: 'audio/webm' }));
    act(() => result.current.stop());
    await waitFor(() => expect(result.current.status).toBe(RECORDER_TEXT.added));
    expect(track.stop).toHaveBeenCalled();
    const [[files]] = vi.mocked(captureDraftStore.addFiles).mock.calls;
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('voice-2026-10-10T12-34-56-789Z.webm');
    expect(files[0].type).toBe('audio/webm');
    expect(result.current.phase).toBe('idle');
    expect(result.current.elapsedMs).toBe(0);
  });

  it('an empty recording adds nothing', async () => {
    const { result } = renderHook(() => useRecorder());
    await act(() => result.current.start());
    act(() => result.current.stop());
    await waitFor(() => expect(result.current.phase).toBe('idle'));
    expect(captureDraftStore.addFiles).not.toHaveBeenCalled();
    expect(result.current.status).toBe(RECORDER_TEXT.idle);
  });

  it('auto-stops just over 30 MB and says so (app.js:428)', async () => {
    const { result } = renderHook(() => useRecorder());
    await act(() => result.current.start());
    const [recorder] = FakeRecorder.instances;
    act(() => recorder.emit({ size: RECORD_AUTO_STOP_BYTES } as Blob));
    expect(recorder.state).toBe('recording');
    act(() => recorder.emit({ size: 1 } as Blob));
    expect(recorder.state).toBe('inactive');
    expect(toast).toHaveBeenCalledWith(RECORDER_TEXT.limit);
    await waitFor(() => expect(captureDraftStore.addFiles).toHaveBeenCalledTimes(1));
  });

  it('reports a draft rejection instead of claiming the recording was added', async () => {
    vi.mocked(captureDraftStore.addFiles).mockResolvedValueOnce([
      { code: 'total-too-large', name: 'voice.webm', message: 'Keep each capture under 60 MB in total.' },
    ]);
    const { result } = renderHook(() => useRecorder());
    await act(() => result.current.start());
    FakeRecorder.instances[0].emit(new Blob(['abc'], { type: 'audio/webm' }));
    act(() => result.current.stop());
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Keep each capture under 60 MB in total.', { tone: 'error' }));
    expect(result.current.status).toBe(RECORDER_TEXT.idle);
  });

  it('keeps a recording staged (no "added" claim) while a save is in flight, then adds it on the next start', async () => {
    vi.mocked(captureDraftStore.getSnapshot).mockReturnValueOnce({ saving: true } as never);
    const { result } = renderHook(() => useRecorder());
    await act(() => result.current.start());
    FakeRecorder.instances[0].emit(new Blob(['abc'], { type: 'audio/webm' }));
    act(() => result.current.stop());
    await waitFor(() => expect(result.current.status).toBe(S.finishingLocalSave));
    expect(captureDraftStore.addFiles).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalledWith(RECORDER_TEXT.added);
    await act(() => result.current.start());
    expect(captureDraftStore.addFiles).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it('unmounting while recording stops the recorder so the audio still reaches the draft', async () => {
    const { result, unmount } = renderHook(() => useRecorder());
    await act(() => result.current.start());
    FakeRecorder.instances[0].emit(new Blob(['abc'], { type: 'audio/webm' }));
    unmount();
    expect(FakeRecorder.instances[0].state).toBe('inactive');
    await waitFor(() => expect(captureDraftStore.addFiles).toHaveBeenCalledTimes(1));
  });
});
