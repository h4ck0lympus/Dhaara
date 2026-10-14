import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { listSourceFiles } from './test/sourceFiles';
import { z } from './zod';

const SRC = fileURLToPath(new URL('.', import.meta.url));

describe('zod entry point', () => {
  it('runs zod without JIT so the CSP never sees new Function', () => {
    expect(z.config().jitless).toBe(true);
  });

  it('is the only module that imports the zod package', () => {
    const offenders = listSourceFiles(SRC)
      .filter((file) => relative(SRC, file) !== 'zod.ts')
      .filter((file) => /from ['"]zod['"]/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
