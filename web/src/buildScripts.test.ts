import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const created: string[] = [];
afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeDist(files: Record<string, string>): string {
  const dist = mkdtempSync(join(tmpdir(), 'dhara-dist-'));
  created.push(dist);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dist, name)), { recursive: true });
    writeFileSync(join(dist, name), content);
  }
  return dist;
}

function run(script: 'check-hashes.mjs' | 'sw-precache.mjs', dist: string) {
  return spawnSync(process.execPath, [`scripts/${script}`, dist], { encoding: 'utf8' });
}

const SHELL = {
  'index.html': '<!doctype html><div id="root"></div>',
  'assets/index-AbCd1234.js': 'export {};',
  'assets/index-AbCd1234.js.map': '{}',
  'manifest.webmanifest': '{"id":"/"}',
  'icon.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
  'sw.js': "self.addEventListener('install', () => {});\n",
};

describe('check-hashes.mjs', () => {
  it('accepts a dist whose assets all carry an 8-character content hash', () => {
    const result = run('check-hashes.mjs', makeDist({ 'assets/index-AbCd1234.js': '', 'assets/IBMPlexSans-400-a_b-C9d0.woff2': '' }));
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('rejects and names every unhashed asset', () => {
    const result = run('check-hashes.mjs', makeDist({ 'assets/index-AbCd1234.js': '', 'assets/logo.svg': '', 'assets/app-abc.js': '' }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unhashed asset: logo.svg');
    expect(result.stderr).toContain('Unhashed asset: app-abc.js');
    expect(result.stderr).not.toContain('index-AbCd1234.js');
  });

  it('fails when dist/assets is missing', () => {
    const result = run('check-hashes.mjs', makeDist({ 'index.html': '' }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('No assets directory');
  });
});

describe('sw-precache.mjs', () => {
  it('prepends the cache name and the list of every shipped file except sw.js and source maps', () => {
    const dist = makeDist(SHELL);
    expect(run('sw-precache.mjs', dist).status).toBe(0);
    const urls = ['/', '/assets/index-AbCd1234.js', '/icon.svg', '/manifest.webmanifest'];
    const hash = createHash('sha256').update(urls.join('\n'));
    for (const name of ['index.html', 'assets/index-AbCd1234.js', 'icon.svg', 'manifest.webmanifest']) hash.update(readFileSync(join(dist, name)));
    const [header, ...rest] = readFileSync(join(dist, 'sw.js'), 'utf8').split('\n');
    expect(header).toBe(`const CACHE="dhara-shell-${hash.digest('hex').slice(0, 12)}";const PRECACHE=${JSON.stringify(urls)};`);
    expect(rest.join('\n')).toBe(SHELL['sw.js']);
  });

  it('changes the cache name when any shipped file changes', () => {
    const before = makeDist(SHELL);
    const after = makeDist({ ...SHELL, 'icon.svg': '<svg xmlns="http://www.w3.org/2000/svg" id="new"/>' });
    run('sw-precache.mjs', before);
    run('sw-precache.mjs', after);
    const cacheOf = (dist: string) => readFileSync(join(dist, 'sw.js'), 'utf8').split('"')[1];
    expect(cacheOf(before)).toMatch(/^dhara-shell-[0-9a-f]{12}$/);
    expect(cacheOf(after)).not.toBe(cacheOf(before));
  });

  it('refuses to inject a second header into the same sw.js', () => {
    const dist = makeDist(SHELL);
    expect(run('sw-precache.mjs', dist).status).toBe(0);
    const second = run('sw-precache.mjs', dist);
    expect(second.status).toBe(1);
    expect(second.stderr).toContain('already has a precache header');
  });

  it('refuses a dist without index.html', () => {
    const { 'index.html': _index, ...withoutIndex } = SHELL;
    const result = run('sw-precache.mjs', makeDist(withoutIndex));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('No index.html');
  });
});
