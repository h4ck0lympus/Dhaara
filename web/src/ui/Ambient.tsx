import type { JSX } from 'react';

const WAVES: [string, number][] = [
  ['M0 190 C 220 120, 420 230, 640 150 S 1000 40, 1200 90', .42],
  ['M0 200 C 220 135, 420 238, 640 162 S 1000 55, 1200 104', .34],
  ['M0 210 C 220 150, 420 246, 640 174 S 1000 70, 1200 118', .27],
  ['M0 220 C 220 165, 420 254, 640 186 S 1000 85, 1200 132', .2],
  ['M0 230 C 220 180, 420 262, 640 198 S 1000 100, 1200 146', .14],
  ['M0 180 C 220 105, 420 222, 640 138 S 1000 25, 1200 76', .22],
  ['M0 170 C 220 90, 420 214, 640 126 S 1000 10, 1200 62', .12],
];

export function Waves({ motion }: { motion: boolean }): JSX.Element {
  return (
    <svg className="ambient-waves" data-motion={motion} aria-hidden="true" viewBox="0 0 1200 260" preserveAspectRatio="none">
      <g fill="none" strokeLinecap="round" strokeWidth="1.6" strokeDasharray="0 7">
        {WAVES.map(([d, alpha], i) => <path key={d} d={d} style={{ stroke: `rgb(var(--acc) / ${alpha})`, animationDelay: `${-2 * i}s, ${-1.2 * i}s` }} />)}
      </g>
    </svg>
  );
}

export function Swirl({ motion }: { motion: boolean }): JSX.Element {
  return <div className="ambient-swirl" data-motion={motion} aria-hidden="true" />;
}
