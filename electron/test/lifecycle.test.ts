import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MANAGED_PORT, LifecycleError, MESSAGES, ackMatches, exitCodeError, identityMatches, managedPort, prepareWorkspace,
} from '../src/lifecycle.js';

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dhara-workspace-'));
const INSTANCE = 'a'.repeat(64);
const EXPECTED = { instance: INSTANCE, pid: 4242, workspace: '/data/ws', port: 8765 };
const ack = (changes: Record<string, unknown> = {}) => JSON.stringify({ protocol: 2, ...EXPECTED, ...changes });

function thrown(run: () => unknown): LifecycleError {
  try {
    run();
  } catch (error) {
    if (error instanceof LifecycleError) return error;
    throw error;
  }
  throw new Error('Expected a LifecycleError');
}

describe('managedPort', () => {
  it('is 8765 unless the explicit test flag is set', () => {
    expect(managedPort({})).toBe(DEFAULT_MANAGED_PORT);
    expect(managedPort({ DHARA_ELECTRON_TEST_PORT: '9100' })).toBe(8765);
    expect(managedPort({ DHARA_ELECTRON_TEST: 'yes', DHARA_ELECTRON_TEST_PORT: '9100' })).toBe(8765);
    expect(managedPort({ DHARA_ELECTRON_TEST: '1', DHARA_ELECTRON_TEST_PORT: '9100' })).toBe(9100);
  });

  it('accepts the bounds 1024 and 65535', () => {
    expect(managedPort({ DHARA_ELECTRON_TEST: '1', DHARA_ELECTRON_TEST_PORT: '1024' })).toBe(1024);
    expect(managedPort({ DHARA_ELECTRON_TEST: '1', DHARA_ELECTRON_TEST_PORT: '65535' })).toBe(65535);
  });

  it.each(['', '80', '1023', '65536', '9100x', ' 9100', '9.5', '-9100'])('ignores the invalid test port %j', (value) => {
    expect(managedPort({ DHARA_ELECTRON_TEST: '1', DHARA_ELECTRON_TEST_PORT: value })).toBe(8765);
  });
});

describe('prepareWorkspace (service.rs:53-66, spec §6.4.1)', () => {
  it('resolves against cwd, creates the directory 0700 and returns the canonical path', () => {
    const cwd = temp();
    const workspace = prepareWorkspace('ws', cwd);
    expect(workspace).toBe(fs.realpathSync(path.join(cwd, 'ws')));
    expect(fs.statSync(workspace).mode & 0o777).toBe(0o700);
  });

  it('leaves an existing directory mode alone', () => {
    const cwd = temp();
    fs.mkdirSync(path.join(cwd, 'ws'), { mode: 0o755 });
    fs.chmodSync(path.join(cwd, 'ws'), 0o755);
    prepareWorkspace('ws', cwd);
    expect(fs.statSync(path.join(cwd, 'ws')).mode & 0o777).toBe(0o755);
  });

  it('canonicalises a symlinked workspace', () => {
    const cwd = temp();
    fs.mkdirSync(path.join(cwd, 'real'));
    fs.symlinkSync(path.join(cwd, 'real'), path.join(cwd, 'link'));
    expect(prepareWorkspace('link', cwd)).toBe(fs.realpathSync(path.join(cwd, 'real')));
  });

  it.each(['', '/', 'ws/..', '.', '..'])('refuses %j: no final component', (value) => {
    const error = thrown(() => prepareWorkspace(value, temp()));
    expect([error.code, error.message]).toEqual(['workspace', MESSAGES.noDir]);
  });

  it('refuses a path that is a regular file', () => {
    const cwd = temp();
    fs.writeFileSync(path.join(cwd, 'file'), 'not a directory');
    const error = thrown(() => prepareWorkspace('file', cwd));
    expect([error.code, error.message]).toEqual(['workspace', MESSAGES.createDir]);
  });
});

describe('exitCodeError (spec §6.4.3 exit codes)', () => {
  it.each([
    [10, 'workspace-locked', MESSAGES.workspaceLocked],
    [11, 'port-in-use', MESSAGES.portInUse],
    [12, 'invalid-lease', MESSAGES.startupExit],
    [1, 'startup-exit', MESSAGES.startupExit],
    [null, 'startup-exit', MESSAGES.startupExit],
  ] as const)('maps %j', (code, expectedCode, message) => {
    const error = exitCodeError(code);
    expect([error.code, error.message]).toEqual([expectedCode, message]);
  });
});

describe('ackMatches (spec §6.4.4)', () => {
  it('accepts exactly the five expected keys and values', () => {
    expect(ackMatches(ack(), EXPECTED)).toBe(true);
  });

  it.each([
    ['an extra key', ack({ extra: true })],
    ['protocol 1', ack({ protocol: 1 })],
    ['another instance', ack({ instance: 'b'.repeat(64) })],
    ['another pid', ack({ pid: 1 })],
    ['a string pid', ack({ pid: '4242' })],
    ['another workspace', ack({ workspace: '/data/other' })],
    ['another port', ack({ port: 8766 })],
    ['a missing key', JSON.stringify({ protocol: 2, instance: INSTANCE, pid: 4242, workspace: '/data/ws' })],
    ['an array', '[]'],
    ['null', 'null'],
    ['not JSON', 'ready'],
  ])('rejects %s', (_label, line) => {
    expect(ackMatches(line, EXPECTED)).toBe(false);
  });
});

describe('identityMatches (spec §6.4.4)', () => {
  const expected = { instance: INSTANCE, pid: 4242 };

  it('accepts exactly {protocol:2, instance, pid}', () => {
    expect(identityMatches({ protocol: 2, instance: INSTANCE, pid: 4242 }, expected)).toBe(true);
  });

  it.each([
    ['the workspace', { protocol: 2, instance: INSTANCE, pid: 4242, workspace: '/data/ws' }],
    ['protocol 1', { protocol: 1, instance: INSTANCE, pid: 4242 }],
    ['another pid', { protocol: 2, instance: INSTANCE, pid: 1 }],
    ['another instance', { protocol: 2, instance: 'f'.repeat(64), pid: 4242 }],
    ['null', null],
  ])('rejects a body with %s', (_label, body) => {
    expect(identityMatches(body, expected)).toBe(false);
  });
});
