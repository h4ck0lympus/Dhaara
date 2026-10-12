import { afterEach, describe, expect, it } from 'vitest';
import { CliError, DEFAULT_SERVER, HELP_TEXT, parseArgs, userArgv, validateServer } from '../src/cli.js';

const CWD = '/home/user/launch';
const REPO = '/repo';
const parse = (argv: string[], env: NodeJS.ProcessEnv = {}) => parseArgs(argv, CWD, REPO, env);
const realPlatform = process.platform;

function cliError(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof CliError) return error.message;
    throw error;
  }
  throw new Error('Expected a CliError');
}

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform });
});

describe('validateServer (lib.rs:12-29, tests 107-126)', () => {
  it('returns the origin of a literal loopback http URL', () => {
    expect(validateServer('http://127.0.0.1:8765/')).toBe('http://127.0.0.1:8765');
    expect(validateServer('http://[::1]:8765')).toBe('http://[::1]:8765');
    expect(validateServer('http://127.0.0.2:8765')).toBe('http://127.0.0.2:8765');
  });

  it.each([
    'http://localhost:8765',
    'https://127.0.0.1',
    'http://example.com',
    'http://192.168.1.1',
    'http://0.0.0.0:8765',
    'http://[::ffff:127.0.0.1]:8765',
    'http://[::2]:8765',
    'http://user:secret@127.0.0.1',
    'http://user@127.0.0.1',
    'http://127.0.0.1/api',
    'http://127.0.0.1?x',
    'http://127.0.0.1/?',
    'http://127.0.0.1#x',
    'http://127.0.0.1/#',
  ])('rejects %j', (value) => {
    expect(cliError(() => validateServer(value))).toBe('Use a literal loopback HTTP URL, e.g. http://127.0.0.1:8765');
  });

  it('keeps the Rust wording for an unparsable URL', () => {
    expect(cliError(() => validateServer('not a url'))).toBe('Invalid service URL');
  });
});

describe('userArgv', () => {
  it('drops Chromium/Node switches before the app path and the app path itself', () => {
    expect(userArgv(['/e', '--inspect=0', '--remote-debugging-port=0', '/x/dist/main.js', '--profile', 'p'], true)).toEqual(['--profile', 'p']);
    expect(userArgv(['/e', '.', '--manage-service'], true)).toEqual(['--manage-service']);
    expect(userArgv(['/e'], true)).toEqual([]);
  });

  it('keeps everything after the binary in a packaged app', () => {
    expect(userArgv(['/opt/noema', '--server', 'http://127.0.0.1:8765'], false)).toEqual(['--server', 'http://127.0.0.1:8765']);
  });
});

describe('parseArgs (main.rs:12-108)', () => {
  it('uses the main.rs defaults', () => {
    expect(parse([])).toEqual({
      server: DEFAULT_SERVER,
      profile: null,
      manageService: false,
      dataDir: null,
      python: '/repo/.venv/bin/python',
      entryPoint: '/repo/run.py',
      startupTimeoutMs: 15_000,
    });
  });

  it('returns help, but only after earlier arguments parsed', () => {
    expect(parse(['--help'])).toBe('help');
    expect(HELP_TEXT).toContain('--manage-service --data-dir');
    expect(cliError(() => parse(['--bogus', '--help']))).toBe('Unknown argument; use --help. No token file is needed by the webview.');
  });

  it.each([
    ['--server', '--server needs a URL'],
    ['--profile', '--profile needs a path'],
    ['--data-dir', '--data-dir needs a path'],
    ['--python', '--python needs a path'],
    ['--entry-point', '--entry-point needs a path'],
    ['--startup-timeout', '--startup-timeout needs seconds'],
  ])('%s without a value fails with the main.rs wording', (flag, message) => {
    expect(cliError(() => parse([flag]))).toBe(message);
  });

  it.each(['constructor', '__proto__', '--Server', '-server'])('rejects the unknown argument %j', (arg) => {
    expect(cliError(() => parse([arg]))).toBe('Unknown argument; use --help. No token file is needed by the webview.');
  });

  // Rust f64::from_str grammar (main.rs:38-42): no whitespace, hex or digit separators, which Number() would accept.
  it.each(['abc', '', ' ', ' 5', '5 ', '0x10', '1_0', '1e'])('rejects the non-numeric timeout %j', (value) => {
    expect(cliError(() => parse(['--startup-timeout', value]))).toBe('Invalid startup timeout');
  });

  // Rust parses inf/infinity/nan, then the range check rejects them (main.rs:62-64).
  it.each(['0.05', '61', 'Infinity', 'inf', 'NaN', '-1', '0'])('rejects the out-of-range timeout %j', (value) => {
    expect(cliError(() => parse(['--startup-timeout', value]))).toBe('Use a startup timeout from 0.1 to 60 seconds');
  });

  it('accepts the timeout bounds and the other Rust float forms', () => {
    const ms = (value: string) => (parse(['--startup-timeout', value]) as { startupTimeoutMs: number }).startupTimeoutMs;
    expect([ms('0.1'), ms('60'), ms('+.5'), ms('5.'), ms('1e1')]).toEqual([100, 60_000, 500, 5_000, 10_000]);
  });

  it('validates --server before the managed rules', () => {
    expect(cliError(() => parse(['--server', 'http://localhost:8765']))).toBe('Use a literal loopback HTTP URL, e.g. http://127.0.0.1:8765');
  });

  it('rejects --data-dir without --manage-service', () => {
    expect(cliError(() => parse(['--data-dir', 'ws']))).toBe('--data-dir requires explicit --manage-service; external mode never owns a service');
  });

  it('requires --data-dir in managed mode', () => {
    expect(cliError(() => parse(['--manage-service']))).toBe('Managed mode requires an explicit --data-dir; no implicit real notebook');
  });

  it('pins managed mode to http://127.0.0.1:8765', () => {
    expect(cliError(() => parse(['--manage-service', '--data-dir', 'ws', '--server', 'http://127.0.0.1:9100'])))
      .toBe('Managed mode uses http://127.0.0.1:8765 only');
    expect(cliError(() => parse(['--manage-service', '--data-dir', 'ws', '--server', 'http://[::1]:8765'])))
      .toBe('Managed mode uses http://127.0.0.1:8765 only');
    expect(cliError(() => parse(['--manage-service', '--data-dir', 'ws', '--server', 'http://127.0.0.1:9100'], { NOEMA_ELECTRON_TEST_PORT: '9100' })))
      .toBe('Managed mode uses http://127.0.0.1:8765 only');
  });

  it('accepts the test port only with the explicit test flag', () => {
    const options = parse(['--manage-service', '--data-dir', 'ws', '--server', 'http://127.0.0.1:9100'], { NOEMA_ELECTRON_TEST: '1', NOEMA_ELECTRON_TEST_PORT: '9100' });
    expect(options).toMatchObject({ server: 'http://127.0.0.1:9100', manageService: true });
  });

  it('is Linux-only in managed mode', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    expect(cliError(() => parse(['--manage-service', '--data-dir', 'ws']))).toBe('Managed development mode is supported only on Linux');
  });

  it('resolves relative python, entry and data paths against cwd without normalising', () => {
    expect(parse(['--manage-service', '--data-dir', 'ws/..', '--python', 'py', '--entry-point', 'tools/run.py', '--profile', 'prof'])).toEqual({
      server: DEFAULT_SERVER,
      profile: 'prof',
      manageService: true,
      dataDir: '/home/user/launch/ws/..',
      python: '/home/user/launch/py',
      entryPoint: '/home/user/launch/tools/run.py',
      startupTimeoutMs: 15_000,
    });
  });

  it('lets the last repeated flag win, as main.rs did', () => {
    expect((parse(['--server', 'http://127.0.0.1:1', '--server', 'http://127.0.0.1:2']) as { server: string }).server).toBe('http://127.0.0.1:2');
  });
});
