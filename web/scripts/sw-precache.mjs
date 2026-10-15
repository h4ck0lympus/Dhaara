import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listFiles } from './files.mjs';

const dist = process.argv[2] ?? 'dist';
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const names = listFiles(dist).filter((name) => name !== 'sw.js' && !name.endsWith('.map'));
if (!names.includes('index.html')) fail(`No index.html in ${dist}; run vite build first`);
const urls = names.map((name) => (name === 'index.html' ? '/' : `/${name}`)).sort();
const hash = createHash('sha256').update(urls.join('\n'));
for (const url of urls) hash.update(readFileSync(join(dist, url === '/' ? 'index.html' : url.slice(1))));
const cache = `dhara-shell-${hash.digest('hex').slice(0, 12)}`;

const swPath = join(dist, 'sw.js');
const worker = readFileSync(swPath, 'utf8');
if (worker.startsWith('const CACHE=')) fail(`${swPath} already has a precache header; rebuild before injecting again`);
writeFileSync(swPath, `const CACHE="${cache}";const PRECACHE=${JSON.stringify(urls)};\n${worker}`);
console.log(`${swPath}: ${cache}, ${urls.length} URLs`);
