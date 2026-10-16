import { useEffect, useRef, useState } from 'react';
import { encodeWav, level } from './wav';

export type DictationPhase = 'idle' | 'recording' | 'recorded';
export const DICTATION_MAX_SECONDS = 300;
export const DICTATION_TEXT = {
  denied: 'Microphone access was refused. Allow it for Dhara and try again.',
  unsupported: 'This window cannot record audio.',
} as const;
const BARS = 18;

/** Records the microphone as 16 kHz WAV for dictation or a voice note. Nothing leaves the page until the caller sends it. */
export function useDictation(maxSeconds = DICTATION_MAX_SECONDS) {
  const [phase, setPhase] = useState<DictationPhase>('idle');
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const live = useRef<{ stream: MediaStream; ctx: AudioContext; chunks: Float32Array[]; timer: number } | null>(null);

  function release() {
    const current = live.current;
    live.current = null;
    if (!current) return null;
    window.clearInterval(current.timer);
    current.stream.getTracks().forEach(track => track.stop());
    void current.ctx.close().catch(() => undefined);
    return current;
  }

  async function start() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined') { setError(DICTATION_TEXT.unsupported); return; }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError(DICTATION_TEXT.denied);
      return;
    }
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];
    processor.onaudioprocess = event => {
      const samples = new Float32Array(event.inputBuffer.getChannelData(0));
      chunks.push(samples);
      setLevels(bars => [...bars.slice(1), level(samples)]);
    };
    source.connect(processor);
    processor.connect(ctx.destination);
    const timer = window.setInterval(() => setSeconds(s => {
      if (s + 1 >= maxSeconds) window.setTimeout(stop, 0);
      return s + 1;
    }), 1000);
    live.current = { stream, ctx, chunks, timer };
    audio.current = null;
    setSeconds(0);
    setPhase('recording');
  }

  function stop(): Uint8Array<ArrayBuffer> | null {
    const current = release();
    if (!current) return audio.current;
    audio.current = encodeWav(current.chunks, current.ctx.sampleRate);
    setPhase('recorded');
    return audio.current;
  }

  function reset() {
    release();
    audio.current = null;
    setSeconds(0);
    setLevels(Array(BARS).fill(0));
    setPhase('idle');
  }

  useEffect(() => () => { release(); }, []);

  return { phase, seconds, levels, error, start, stop, reset, audio: () => audio.current };
}

export function elapsed(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
