import { readdirSync } from 'node:fs';
import { sep } from 'node:path';

export const listFiles = (dir) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `${entry.parentPath}${sep}${entry.name}`.slice(dir.length).split(sep).filter(Boolean).join('/'))
    .sort();
