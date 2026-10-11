import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from './zod';

const SRC = fileURLToPath(new URL('.', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? sourceFiles(join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(dir, entry.name)] : [],
  );
}

describe('zod entry point', () => {
  it('runs zod without JIT so the CSP never sees new Function', () => {
    expect(z.config().jitless).toBe(true);
  });

  it('is the only module that imports the zod package', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => relative(SRC, file) !== 'zod.ts')
      .filter((file) => /from ['"]zod['"]/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
