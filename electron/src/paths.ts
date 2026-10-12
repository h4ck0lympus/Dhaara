import fs from 'node:fs';
import path from 'node:path';

/** Joins without normalising, so a trailing '..' still has no final component (main.rs:80-86). */
export function absolutePath(value: string, cwd: string): string {
  if (value === '' || path.isAbsolute(value)) return value;   // '' stays empty and is rejected by hasFinalComponent
  return `${cwd.replace(/\/+$/, '')}/${value}`;
}

/** Rust Path::file_name() is None for '', '/', and a final '.' or '..' (lib.rs:76, service.rs:54). */
export function hasFinalComponent(value: string): boolean {
  const last = path.basename(value);
  return last !== '' && last !== '.' && last !== '..';
}

/** mkdir -p with 0700; chmod only when newly created. Returns the failing step, or null. */
export function ensurePrivateDir(dir: string): 'create' | 'protect' | null {
  const existed = fs.existsSync(dir);
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch {
    return 'create';
  }
  if (existed) return null;
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    return 'protect';
  }
  return null;
}
