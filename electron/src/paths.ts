import fs from 'node:fs';
import path from 'node:path';

export function absolutePath(value: string, cwd: string): string {
  if (value === '' || path.isAbsolute(value)) return value;
  return `${cwd.replace(/\/+$/, '')}/${value}`;
}

export function hasFinalComponent(value: string): boolean {
  const last = path.basename(value);
  return last !== '' && last !== '.' && last !== '..';
}

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
