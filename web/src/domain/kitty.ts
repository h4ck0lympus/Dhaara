import type { Snapshot } from '../api/schemas';

export type KittyState = 'needs-you' | 'reminder' | 'working' | 'focus' | 'sleeping' | 'offline';
export type KittyStatus = { state: KittyState; count: number; summary: string };

export const KITTY_W = 26;
export const KITTY_H = 15;

/** What the kitty shows. Order: offline › needs you › reminder › working › focus › asleep. Quiet hides alerts. */
export function kittyStatus(snapshot: Snapshot | undefined, connected: boolean, quiet: boolean): KittyStatus {
  if (!connected || !snapshot) return { state: 'offline', count: 0, summary: 'Offline · showing last known' };
  const dueReminder = (t: Snapshot['tasks'][number]) => t.reminders.some(r => r.state === 'due');
  const needs = snapshot.attention.filter(t => !dueReminder(t)).length;
  const reminders = snapshot.attention.filter(dueReminder).length;
  const working = snapshot.runs.filter(r => r.effective_status === 'working').length;
  const parts = [needs && `${needs} need you`, reminders && `${reminders} reminder${reminders === 1 ? '' : 's'} due`, working && `${working} working`].filter(Boolean);
  const summary = parts.length ? parts.join(' · ') : snapshot.focus ? 'Focused' : 'All quiet';
  if (quiet) return { state: 'sleeping', count: 0, summary: `Quiet · ${summary}` };
  if (needs) return { state: 'needs-you', count: needs, summary };
  if (reminders) return { state: 'reminder', count: reminders, summary };
  if (working) return { state: 'working', count: 0, summary };
  if (snapshot.focus) return { state: 'focus', count: 0, summary };
  return { state: 'sleeping', count: 0, summary };
}

// A white loaf cat peeking over an edge: o outline, k fur, b blue shade, p toe beans, z sleep pixels.
const BASE = [
  '......o...........o.......',
  '.....oko.........oko......',
  '.....okkooooooooookko.....',
  '....okkkkkkkkkkkkkkkko....',
  '....okkkkkkkkkkkkkkkkko...',
  '...okkkkkkkkkkkkkkkkkkbo..',
  '...okkookkkkkkkkkkookkbo..',
  '...okkookkkkkkkkkkookkbo..',
  '...okkkkkkokkkokkkkkkkbo..',
  '..ookkkkkkkokokkkkkkkkbo..',
  '.okkkokkkkkkkkkkkkoooobbo.',
  'okpkkokkkkkkkkkkkokkkkobo.',
  'opkpkobbbbbbbbbbbokpkpkoo.',
  '.okkko.oooooooooookpkpko..',
  '..ooo.............ooooo...',
];
const LEFT_PAW = { rows: [10, 11, 12, 13, 14], cols: [0, 1, 2, 3, 4, 5] };
const RIGHT_PAW = { rows: [10, 11, 12, 13, 14], cols: [17, 18, 19, 20, 21, 22, 23] };

export type KittyFrame = { pixels: string[]; hop: boolean };

/** One animation frame as rows of palette letters. Pure, so every state and frame is testable. */
export function kittyFrame(state: KittyState, frame: number, petted: boolean): KittyFrame {
  const grid = BASE.map(row => row.split(''));
  const put = (r: number, c: number, ch: string) => { if (grid[r] && c >= 0 && c < KITTY_W) grid[r][c] = ch; };
  const pick = <T,>(frames: T[]) => frames[frame % frames.length];
  const eyes = (kind: 'open' | 'wide' | 'half' | 'shut' | 'happy') => {
    for (const c of [6, 7, 18, 19]) { put(6, c, 'k'); put(7, c, 'k'); }
    if (kind === 'happy') {
      for (const [l, r] of [[5, 8], [17, 20]]) { put(7, l, 'o'); put(6, l + 1, 'o'); put(6, l + 2, 'o'); put(7, r, 'o'); }
      for (const c of [4, 5, 20, 21]) put(9, c, 'p');
      return;
    }
    for (const c of [6, 7, 18, 19]) {
      if (kind === 'open') { put(6, c, 'o'); put(7, c, 'o'); }
      if (kind === 'wide') { put(5, c, 'o'); put(6, c, 'o'); put(7, c, 'o'); }
      if (kind === 'half') { put(6, c, 'b'); put(7, c, 'o'); }
      if (kind === 'shut') put(8, c, 'o');
    }
  };
  const lift = ({ rows, cols }: { rows: number[]; cols: number[] }, by: number) => {
    const snap = rows.map(r => cols.map(c => BASE[r][c]));
    rows.forEach(r => cols.forEach(c => put(r, c, '.')));
    rows.forEach((r, i) => cols.forEach((c, j) => { if (snap[i][j] !== '.') put(r - by, c, snap[i][j]); }));
  };
  let hop = false;
  if (petted && state !== 'offline') {
    lift(pick([true, false]) ? LEFT_PAW : RIGHT_PAW, 1);
    eyes('happy');
  } else if (state === 'sleeping') {
    eyes('shut');
    pick([[[3, 23]], [[2, 24], [4, 23]], [[1, 25], [3, 24]]]).forEach(([r, c]) => put(r, c, 'z'));
  } else if (state === 'working') {
    eyes(pick(['open', 'open', 'open', 'open', 'shut'] as const));
    if (pick([true, false])) lift(RIGHT_PAW, 1);
  } else if (state === 'needs-you') {
    eyes('wide');
    hop = pick([false, true]);
  } else if (state === 'reminder') {
    eyes('open');
    if (pick([false, true])) lift({ rows: [9, ...LEFT_PAW.rows], cols: LEFT_PAW.cols }, 2);
  } else if (state === 'focus') {
    eyes(pick(['half', 'half', 'half', 'half', 'half', 'shut'] as const));
  } else {
    eyes('shut');
  }
  return { pixels: grid.map(row => row.join('')), hop };
}

export const KITTY_PALETTE: Record<string, string> = { o: '#17181d', k: '#ffffff', b: '#c8daf2', p: '#f4a6b7', z: '#8fb3ff' };
export const KITTY_GREY: Record<string, string> = { o: '#4a4e57', k: '#c9ccd2', b: '#a7abb3', p: '#a7abb3', z: '#a7abb3' };

export function kittyLabel(status: KittyStatus, petted: boolean): string {
  if (petted && status.state !== 'offline') return 'Kitty purring: happy to be petted';
  return { 'needs-you': `Kitty alert: ${status.count} need you`, reminder: 'Kitty waving: a reminder is due', working: 'Kitty tapping: agents are working',
    focus: 'Kitty calm: you are focused', sleeping: 'Kitty asleep: nothing needs you', offline: 'Kitty dimmed: Dhara is offline' }[status.state];
}
