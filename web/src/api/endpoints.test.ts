import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { listSourceFiles } from '../test/sourceFiles';
import { ENDPOINTS, endpointPath, type Replay } from './endpoints';

const SRC = fileURLToPath(new URL('..', import.meta.url));
// Spec §4.3 "Every other UI mutation is sent once per user action", verbatim (POST/DELETE pairs expanded).
const SPEC_ONCE_PER_ACTION = [
  'POST /api/focus', 'PUT /api/tasks/{id}', 'PUT /api/notes/{id}', 'POST /api/notes/{id}/restore/{v}',
  'POST /api/notes/{id}/suggestions/{sid}/apply', 'POST /api/notes/{id}/organize', 'POST /api/notes/{id}/transcribe',
  'POST /api/reminders', 'POST /api/reminders/{id}/snooze', 'DELETE /api/reminders/{id}', 'POST /api/runs/{id}/end-tracking',
  'PATCH /api/settings', 'POST /api/context/rules', 'DELETE /api/context/rules/{id}',
  'POST /api/tokens', 'DELETE /api/tokens/{id}', 'POST /api/session', 'DELETE /api/session',
];
const normalise = (route: string) => route.replace(/\{\w+\}|:\w+/g, '{}');

function routes(replay: Replay): string[] {
  return Object.values(ENDPOINTS)
    .filter((spec) => spec.replay === replay)
    .map((spec) => normalise(`${spec.method} /api${spec.path}`))
    .sort();
}

describe('replay policy (spec §4.3)', () => {
  it('sends exactly the spec list once per user action', () => {
    expect(routes('once-per-action')).toEqual(SPEC_ONCE_PER_ACTION.map(normalise).sort());
  });

  it('replays only the two capture endpoints, by key', () => {
    expect(routes('idempotent-by-key')).toEqual(['POST /api/captures', 'POST /api/task-captures']);
  });

  it('calls fetch( only from api/client.ts (tests excluded)', () => {
    const offenders = listSourceFiles(SRC)
      .map((file) => relative(SRC, file))
      .filter((file) => file !== join('api', 'client.ts') && !/\.test\.tsx?$/.test(file) && !file.startsWith('test/'))
      .filter((file) => /\bfetch\(/.test(readFileSync(join(SRC, file), 'utf8')));
    expect(offenders).toEqual([]);
  });
});

describe('endpointPath', () => {
  it('encodes path parameters and appends defined query values', () => {
    expect(endpointPath('noteRestore', { id: 'a/b', version: 3 })).toBe('/notes/a%2Fb/restore/3');
    expect(endpointPath('state', {}, { minutes: 30 })).toBe('/state?minutes=30');
    expect(endpointPath('state', {}, { minutes: undefined })).toBe('/state');
    expect(endpointPath('search', {}, { q: 'heap & tcache' })).toBe('/search?q=heap+%26+tcache');
  });

  it('refuses a missing path parameter instead of sending a wrong URL', () => {
    expect(() => endpointPath('task')).toThrow('Missing path parameter id');
  });
});
