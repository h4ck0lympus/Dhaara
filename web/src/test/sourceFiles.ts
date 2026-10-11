import { readdirSync } from 'node:fs';
import { join } from 'node:path';

// Every .ts/.tsx file under dir, recursively (source-scanning guard tests).
export function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listSourceFiles(join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(dir, entry.name)] : [],
  );
}
