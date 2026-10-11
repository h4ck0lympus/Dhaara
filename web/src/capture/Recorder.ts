import { useEffect, useRef, useState } from 'react';
import { captureDraftStore } from '../local/drafts';
import { S } from '../strings';
import { messageOf, toast } from '../ui/Toast';
import { toastRejections } from './Attachments';

export const RECORDER_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'] as const;   // app.js:425
export const RECORD_BITS_PER_SECOND = 64_000;
export const RECORD_TIMESLICE_MS = 1_000;
export const RECORD_AUTO_STOP_BYTES = 30 * 1024 * 1024;   // app.js:428

export const RECORDER_TEXT = {
  idle: 'Audio stays local until you save.',   // app.js:212
  added: 'Recording added. Save when ready.',   // app.js:435
  unsupported: 'Recording requires a supported browser on localhost or HTTPS. You can still attach an audio file.',   // app.js:422
  unavailable: (message: string) => `Microphone unavailable: ${message}`,   // app.js:440
  failed: 'Recording failed. Stop and check your microphone.',   // app.js:437
  limit: 'Recording stopped near the 32 MB limit. Save this part before continuing.',   // app.js:428
} as const;

export type RecorderPhase = 'idle' | 'starting' | 'recording' | 'paused';
export type RecorderState = {
  phase: RecorderPhase;
  elapsedMs: number;
  status: string;
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
};

export function pickMimeType(isSupported: (type: string) => boolean): string | undefined {
  return RECORDER_MIME_TYPES.find(type => isSupported(type));
}

export function recordingExtension(type: string): 'ogg' | 'm4a' | 'webm' {
  return type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';   // app.js:432
}

export function recordingFileName(type: string, at: Date): string {
  return `voice-${at.toISOString().replace(/[:.]/g, '-')}.${recordingExtension(type)}`;   // app.js:434
}

export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

type Session = {
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  total: number;
  accumulated: number;
  runStartedAt: number;
};

function stopTracks(stream: MediaStream): void {
  stream.getTracks().forEach(track => track.stop());
}

export function useRecorder(): RecorderState {
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [status, setStatus] = useState<string>(RECORDER_TEXT.idle);
  const session = useRef<Session | null>(null);
  const starting = useRef(false);
  const mounted = useRef(true);
  const staged = useRef<File | null>(null);   // a finished recording waiting for an in-flight save; never dropped

  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = setInterval(() => {
      const current = session.current;
      if (current) setElapsedMs(current.accumulated + Date.now() - current.runStartedAt);
    }, 500);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Navigation away is blocked while recording; if Capture unmounts anyway, Stop still delivers the audio to the draft store.
      const current = session.current;
      if (current && current.recorder.state !== 'inactive') current.recorder.stop();
    };
  }, []);

  async function finish(current: Session): Promise<void> {
    stopTracks(current.stream);
    const type = current.recorder.mimeType || 'audio/webm';
    const blob = new Blob(current.chunks, { type });
    session.current = null;
    setPhase('idle');
    setElapsedMs(0);
    if (!blob.size) {
      setStatus(RECORDER_TEXT.idle);
      return;
    }
    staged.current = new File([blob], recordingFileName(type, new Date()), { type });
    await flushStaged();
  }

  // addFiles silently accepts nothing while a save is in flight, so keep the file and retry on the next start().
  async function flushStaged(): Promise<void> {
    const file = staged.current;
    if (!file) return;
    if (captureDraftStore.getSnapshot().saving) {
      setStatus(S.finishingLocalSave);
      return;
    }
    staged.current = null;
    const rejections = await captureDraftStore.addFiles([file]);
    toastRejections(rejections);
    setStatus(rejections.length ? RECORDER_TEXT.idle : RECORDER_TEXT.added);
  }

  async function start(): Promise<void> {
    if (starting.current || session.current) return;
    await flushStaged();
    if (staged.current) return;   // still saving; the status says so
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast(RECORDER_TEXT.unsupported, { tone: 'error' });
      return;
    }
    starting.current = true;
    setPhase('starting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      starting.current = false;
      setPhase('idle');
      toast(RECORDER_TEXT.unavailable(messageOf(error)), { tone: 'error' });
      return;
    }
    if (!mounted.current) {
      starting.current = false;
      stopTracks(stream);
      return;
    }
    const mimeType = pickMimeType(type => MediaRecorder.isTypeSupported(type));
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType
        ? { mimeType, audioBitsPerSecond: RECORD_BITS_PER_SECOND }
        : { audioBitsPerSecond: RECORD_BITS_PER_SECOND });
    } catch (error) {
      starting.current = false;
      stopTracks(stream);
      setPhase('idle');
      toast(RECORDER_TEXT.unavailable(messageOf(error)), { tone: 'error' });
      return;
    }
    const current: Session = { recorder, stream, chunks: [], total: 0, accumulated: 0, runStartedAt: Date.now() };
    recorder.ondataavailable = event => {
      if (!event.data.size) return;
      current.chunks.push(event.data);
      current.total += event.data.size;
      if (current.total > RECORD_AUTO_STOP_BYTES && recorder.state !== 'inactive') {
        recorder.stop();
        toast(RECORDER_TEXT.limit);
      }
    };
    recorder.onstop = () => { void finish(current); };
    recorder.onerror = () => {
      toast(RECORDER_TEXT.failed, { tone: 'error' });
      stopTracks(stream);
    };
    recorder.start(RECORD_TIMESLICE_MS);
    session.current = current;
    starting.current = false;
    setElapsedMs(0);
    setPhase('recording');
  }

  function pause(): void {
    const current = session.current;
    if (!current || current.recorder.state !== 'recording') return;
    current.recorder.pause();
    current.accumulated += Date.now() - current.runStartedAt;
    setElapsedMs(current.accumulated);
    setPhase('paused');
  }

  function resume(): void {
    const current = session.current;
    if (!current || current.recorder.state !== 'paused') return;
    current.recorder.resume();
    current.runStartedAt = Date.now();
    setPhase('recording');
  }

  function stop(): void {
    const current = session.current;
    if (current && current.recorder.state !== 'inactive') current.recorder.stop();
  }

  const shownStatus = phase === 'recording'
    ? `${formatElapsed(elapsedMs)} · recording locally`   // app.js:439
    : phase === 'paused'
      ? `${formatElapsed(elapsedMs)} · paused`
      : status;
  return { phase, elapsedMs, status: shownStatus, start, pause, resume, stop };
}
