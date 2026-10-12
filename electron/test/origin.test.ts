import { describe, expect, it } from 'vitest';
import { downloadAllowed, externalLinkAllowed, sameOrigin } from '../src/origin.js';

const BASE = 'http://127.0.0.1:8765';

describe('sameOrigin (lib.rs:127-142)', () => {
  it('allows the service origin, including hash routes', () => {
    expect(sameOrigin(BASE, 'http://127.0.0.1:8765/#capture')).toBe(true);
    expect(sameOrigin(BASE, 'http://127.0.0.1:8765/#/note/abc')).toBe(true);
  });

  it.each([
    'http://127.0.0.1:9000/',
    'http://localhost:8765/',
    'http://127.0.0.1.evil.com:8765',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,x',
    'http://user@127.0.0.1:8765',
    'http://:secret@127.0.0.1:8765/',
    'https://127.0.0.1:8765/',
    'not a url',
    '',
  ])('denies %j', (target) => {
    expect(sameOrigin(BASE, target)).toBe(false);
  });

  it('denies everything when the server itself does not parse', () => {
    expect(sameOrigin('nope', 'http://127.0.0.1:8765/')).toBe(false);
  });
});

describe('downloadAllowed (lib.rs:143-150)', () => {
  it('allows service URLs and service blobs', () => {
    expect(downloadAllowed(BASE, 'blob:http://127.0.0.1:8765/abcd')).toBe(true);
    expect(downloadAllowed(BASE, 'http://127.0.0.1:8765/api/export')).toBe(true);
  });

  it.each([
    'blob:https://example.com/abcd',
    'file:///etc/passwd',
    'data:text/plain,x',
    'blob:null/abcd',
    'http://127.0.0.1:9000/api/export',
  ])('denies %j', (target) => {
    expect(downloadAllowed(BASE, target)).toBe(false);
  });
});

describe('externalLinkAllowed (lib.rs:151-163)', () => {
  it.each(['https://example.com/session', 'http://example.com/'])('allows %j', (target) => {
    expect(externalLinkAllowed(target)).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'file:///tmp/file',
    'mailto:a@b.c',
    'https://token@example.com',
    'https://:pw@example.com/',
    'data:text/html,x',
    'ftp://example.com/',
    'not a url',
  ])('denies %j', (target) => {
    expect(externalLinkAllowed(target)).toBe(false);
  });
});
