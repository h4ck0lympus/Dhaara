import { useEffect, useRef, useState, type JSX } from 'react';
import { KITTY_GREY, KITTY_H, KITTY_PALETTE, KITTY_W, kittyFrame, kittyLabel, type KittyStatus } from '../domain/kitty';

const FRAME_MS = 420;
const HEART = ['.h.h.', 'hhhhh', '.hhh.', '..h..'];

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The pixel kitty. Hovering pets it; the canvas keeps 390 pixels cheap to draw at any size. */
export function KittySprite({ status, width, motion = true }: { status: KittyStatus; width: number; motion?: boolean }): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState(0);
  const [petted, setPetted] = useState(false);
  const animate = motion && !reducedMotion() && status.state !== 'offline';
  useEffect(() => {
    if (!animate) return;
    const timer = window.setInterval(() => setFrame(f => f + 1), FRAME_MS);
    return () => window.clearInterval(timer);
  }, [animate]);
  const { pixels, hop } = kittyFrame(status.state, frame, petted);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const palette = status.state === 'offline' ? KITTY_GREY : KITTY_PALETTE;
    ctx.clearRect(0, 0, KITTY_W, KITTY_H);
    pixels.forEach((row, y) => [...row].forEach((ch, x) => {
      if (!palette[ch]) return;
      ctx.fillStyle = palette[ch];
      ctx.fillRect(x, y, 1, 1);
    }));
  }, [pixels.join(''), status.state]);
  const unit = width / KITTY_W;
  const happy = petted && status.state !== 'offline';
  const badge = status.state === 'needs-you' ? String(Math.min(status.count, 99)) : status.state === 'reminder' ? String(Math.min(status.count, 99)) : status.state === 'offline' ? '–' : '';
  return (
    <div className="kitty" role="img" aria-label={kittyLabel(status, petted)} data-state={status.state}
      onPointerEnter={() => setPetted(true)} onPointerLeave={() => setPetted(false)}
      style={{ width, height: Math.round(width * KITTY_H / KITTY_W), opacity: status.state === 'offline' ? 0.6 : 1 }}>
      <canvas ref={canvas} width={KITTY_W} height={KITTY_H} className={happy && animate ? 'kitty-canvas purring' : 'kitty-canvas'}
        style={{ transform: hop ? `translateY(${-unit}px)` : undefined }} />
      {happy && animate && [8, 14].map((left, i) => (
        <span key={left} aria-hidden="true" className={i ? 'kitty-heart late' : 'kitty-heart'} style={{ left: unit * left, top: -unit * (4 + i), width: unit * 5, height: unit * 4 }}>
          {HEART.join('').split('').map((ch, j) => <i key={j} style={{ background: ch === 'h' ? '#f07a93' : 'transparent' }} />)}
        </span>
      ))}
      {badge && <span className={`kitty-badge ${status.state}`} style={{ top: -unit * 2, right: -unit, minWidth: Math.max(14, unit * 5), height: Math.max(14, unit * 5), fontSize: Math.max(9, unit * 3.6) }}>{badge}</span>}
    </div>
  );
}
