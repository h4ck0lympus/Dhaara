import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir } from './proc.js';

// Plain CommonJS, loaded the way the bundled Electron loads it in Node mode (no Vite transform, no TypeScript).
const require = createRequire(import.meta.url);
type Stat = { uid: number; mode: number };
type Facts = { stat(file: string): Stat | null; userns(): boolean; uid: number };
type Input = { env: NodeJS.ProcessEnv; argv: string[]; exe: string; dataHome: string; bundledHelper: string; facts: Facts };
type Decision = { env: NodeJS.ProcessEnv; message?: undefined } | { message: string; env?: undefined };
const launch = require('../../release/launch.cjs') as {
  EXIT_REFUSED: number; NO_SANDBOX: string; SYSTEM_HELPER: string;
  dataHome(env: NodeJS.ProcessEnv): string;
  helperMessage(target: string): string;
  ownerMessage(builtFor: number, uid: number): string;
  decide(input: Input): Decision;
};

const EXE = '/mnt/usr/lib/dhara/dhara';
const BUNDLED = '/mnt/usr/lib/dhara/resources/chrome-sandbox';
const SETUID_ROOT: Stat = { uid: 0, mode: 0o104755 };
const OWN_EXE: Record<string, Stat> = { [EXE]: { uid: 1000, mode: 0o100755 } };
const BASE = { HOME: '/h', PATH: '/bin', ELECTRON_RUN_AS_NODE: '1' };
const facts = (files: Record<string, Stat>, userns = false, uid = 1000): Facts => ({ stat: (file) => files[file] ?? null, userns: () => userns, uid });
const decide = (overrides: Partial<Input>) => launch.decide({ env: BASE, argv: [], exe: EXE, dataHome: '/h/.local/share', bundledHelper: BUNDLED, facts: facts(OWN_EXE), ...overrides });

describe('release/launch.cjs decide (packaging spec §5)', () => {
  it('refuses --no-sandbox before anything else', () => {
    expect(decide({ argv: ['--data-dir', 'x', '--no-sandbox'], facts: facts(OWN_EXE, true) })).toEqual({ message: 'Dhara: --no-sandbox is not supported.' });
    expect(launch.NO_SANDBOX).toBe('Dhara: --no-sandbox is not supported.');
    expect(launch.EXIT_REFUSED).toBe(3);
  });

  it('rule 1: keeps an explicit CHROME_DEVEL_SANDBOX and drops ELECTRON_RUN_AS_NODE', () => {
    expect(decide({ env: { ...BASE, CHROME_DEVEL_SANDBOX: '/x' } })).toEqual({ env: { HOME: '/h', PATH: '/bin', CHROME_DEVEL_SANDBOX: '/x' } });
  });

  it('rule 2: needs no helper when unprivileged user namespaces work, whoever owns the binary', () => {
    expect(decide({ facts: facts({ [EXE]: { uid: 0, mode: 0o100755 } }, true) })).toEqual({ env: { HOME: '/h', PATH: '/bin' } });
  });

  it('rule 3: exports the first root-owned setuid helper, the user one before the system one', () => {
    const both = { ...OWN_EXE, '/h/.local/share/dhara/chrome-sandbox': SETUID_ROOT, '/opt/google/chrome/chrome-sandbox': SETUID_ROOT };
    expect(decide({ facts: facts(both) })).toEqual({ env: { HOME: '/h', PATH: '/bin', CHROME_DEVEL_SANDBOX: '/h/.local/share/dhara/chrome-sandbox' } });
    expect(decide({ facts: facts({ ...OWN_EXE, '/opt/google/chrome/chrome-sandbox': SETUID_ROOT }) }))
      .toEqual({ env: { HOME: '/h', PATH: '/bin', CHROME_DEVEL_SANDBOX: '/opt/google/chrome/chrome-sandbox' } });
    expect(launch.SYSTEM_HELPER).toBe('/opt/google/chrome/chrome-sandbox');
  });

  it('rule 3 ignores a helper that is not root-owned or not setuid', () => {
    const home = tempDir('dhara-launch-');
    const wrong = { ...OWN_EXE, [path.join(home, 'dhara', 'chrome-sandbox')]: { uid: 1000, mode: 0o104755 }, '/opt/google/chrome/chrome-sandbox': { uid: 0, mode: 0o100755 } };
    expect(decide({ dataHome: home, facts: facts(wrong) })).toEqual({ message: launch.helperMessage(path.join(home, 'dhara', 'chrome-sandbox')) });
  });

  it('rule 4: copies the bundled helper under <dataHome>/dhara (0700) and prints the one-time line for that copy', () => {
    const root = tempDir('dhara-launch-');
    const bundled = path.join(root, 'chrome-sandbox');
    fs.writeFileSync(bundled, 'helper bytes');
    const home = path.join(root, 'share');
    const target = path.join(home, 'dhara', 'chrome-sandbox');
    expect(decide({ dataHome: home, bundledHelper: bundled })).toEqual({ message: [
      "Dhara: Chromium's sandbox helper must be owned by root on this system. Run once:",
      `  sudo chown root:root ${target} && sudo chmod 4755 ${target}`,
      'then start Dhara again. (Dhara never runs without the sandbox.)',
      'If your home directory is mounted nosuid, install that file as /opt/google/chrome/chrome-sandbox instead.',
    ].join('\n') });
    expect(fs.statSync(path.join(home, 'dhara')).mode & 0o777).toBe(0o700);
    expect(fs.readFileSync(target, 'utf8')).toBe('helper bytes');   // user-owned and not setuid: rule 3 ignores it until the line above has run
    expect(fs.statSync(target).mode & 0o777).toBe(0o755);
  });

  it('rule 0: a helper is unusable when the mounted binary belongs to another user id', () => {
    const foreign = { [EXE]: { uid: 0, mode: 0o100755 }, '/opt/google/chrome/chrome-sandbox': SETUID_ROOT };
    const message = 'Dhara: this AppImage was built for user id 0 and you are user id 1000, so Chromium would ignore the sandbox helper. Extract it once (--appimage-extract) and start squashfs-root/AppRun.';
    expect(launch.ownerMessage(0, 1000)).toBe(message);
    expect(decide({ facts: facts(foreign) })).toEqual({ message });
    expect(decide({ env: { ...BASE, CHROME_DEVEL_SANDBOX: '/x' }, facts: facts(foreign) })).toEqual({ message });
  });

  it('dataHome mirrors profile.ts without throwing', () => {
    expect(launch.dataHome({ XDG_DATA_HOME: '/xdg', HOME: '/h' })).toBe('/xdg');
    expect(launch.dataHome({ XDG_DATA_HOME: 'rel', HOME: '/h' })).toBe('/h/.local/share');
    expect(launch.dataHome({ HOME: '/h' })).toBe('/h/.local/share');
  });
});
