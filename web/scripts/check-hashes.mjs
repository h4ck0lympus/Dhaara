import { basename, join } from 'node:path';
import { listFiles } from './files.mjs';

const dist = process.argv[2] ?? 'dist';
const HASHED = /-[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+$/;
let files;
try {
  files = listFiles(join(dist, 'assets'));
} catch {
  console.error(`No assets directory in ${dist}; run vite build first`);
  process.exit(1);
}
const unhashed = files.map((file) => basename(file)).filter((name) => !HASHED.test(name));
for (const name of unhashed) console.error(`Unhashed asset: ${name}`);
process.exit(unhashed.length > 0 ? 1 : 0);
