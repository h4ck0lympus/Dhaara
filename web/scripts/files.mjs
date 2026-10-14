// Shared by the build-check scripts: every file under dir, as sorted posix paths relative to dir.
import { readdirSync } from 'node:fs';
import { sep } from 'node:path';

export const listFiles = (dir) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `${entry.parentPath}${sep}${entry.name}`.slice(dir.length).split(sep).filter(Boolean).join('/'))
    .sort();
