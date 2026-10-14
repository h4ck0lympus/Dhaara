import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { absolutePath, ensurePrivateDir, hasFinalComponent } from '../src/paths.js';

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dhara-paths-'));
const mode = (file: string) => fs.statSync(file).mode & 0o777;

describe('absolutePath (main.rs:79-86)', () => {
  it('joins relative paths to cwd without normalising', () => {
    expect(absolutePath('ws/..', '/home/u')).toBe('/home/u/ws/..');
    expect(absolutePath('ws', '/')).toBe('/ws');
    expect(absolutePath('ws', '/home/u/')).toBe('/home/u/ws');
    expect(absolutePath('/abs/ws', '/home/u')).toBe('/abs/ws');
  });

  it('keeps an empty value empty so it is still rejected later', () => {
    expect(absolutePath('', '/home/u')).toBe('');
  });
});

describe('hasFinalComponent (Rust Path::file_name)', () => {
  it.each(['/a/b', 'b', '/a/b/'])('accepts %j', (value) => {
    expect(hasFinalComponent(value)).toBe(true);
  });

  it.each(['', '/', '/a/..', '..', '.', '/a/.'])('rejects %j', (value) => {
    expect(hasFinalComponent(value)).toBe(false);
  });
});

describe('ensurePrivateDir (lib.rs:79-87, service.rs:57-64)', () => {
  it('creates a missing directory with mode 0700', () => {
    const dir = path.join(temp(), 'new');
    expect(ensurePrivateDir(dir)).toBeNull();
    expect(mode(dir)).toBe(0o700);
  });

  it('never chmods an existing directory', () => {
    const dir = temp();
    fs.chmodSync(dir, 0o755);
    expect(ensurePrivateDir(dir)).toBeNull();
    expect(mode(dir)).toBe(0o755);
  });

  it('reports create for a path that is a file', () => {
    const file = path.join(temp(), 'file');
    fs.writeFileSync(file, 'x');
    expect(ensurePrivateDir(file)).toBe('create');
  });

  it.skipIf(process.getuid?.() === 0)('reports create under an unwritable parent', () => {
    const parent = temp();
    fs.chmodSync(parent, 0o500);
    try {
      expect(ensurePrivateDir(path.join(parent, 'child'))).toBe('create');
    } finally {
      fs.chmodSync(parent, 0o700);
    }
  });
});
