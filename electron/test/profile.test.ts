import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adoptLegacyProfile, legacyProfile, PROFILE_MESSAGES, prepareProfile, resolveProfile } from '../src/profile.js';

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'noema-profile-'));

describe('resolveProfile (lib.rs:58-71)', () => {
  it('uses --profile, resolved against cwd', () => {
    expect(resolveProfile('prof', {}, '/home/u')).toBe('/home/u/prof');
    expect(resolveProfile('/abs/prof', {}, '/home/u')).toBe('/abs/prof');
  });

  it('defaults to an absolute $XDG_DATA_HOME/dhara/electron', () => {
    expect(resolveProfile(null, { XDG_DATA_HOME: '/xdg', HOME: '/h' }, '/c')).toBe('/xdg/dhara/electron');
  });

  it('ignores a relative XDG_DATA_HOME and falls back to ~/.local/share', () => {
    expect(resolveProfile(null, { XDG_DATA_HOME: 'rel', HOME: '/h' }, '/c')).toBe('/h/.local/share/dhara/electron');
    expect(resolveProfile(null, { HOME: '/h' }, '/c')).toBe('/h/.local/share/dhara/electron');
  });

  it('fails without any base directory', () => {
    expect(() => resolveProfile(null, {}, '/c')).toThrow(PROFILE_MESSAGES.noHome);
  });
});

describe('prepareProfile (lib.rs:75-87, 164-182)', () => {
  it('creates a new profile with mode 0700', () => {
    const profile = path.join(temp(), 'electron');
    prepareProfile(profile);
    expect(fs.statSync(profile).mode & 0o777).toBe(0o700);
  });

  it('keeps an existing profile, its mode and its data', () => {
    const profile = temp();
    fs.chmodSync(profile, 0o750);
    fs.writeFileSync(path.join(profile, 'retained'), 'draft');
    prepareProfile(profile);
    expect(fs.statSync(profile).mode & 0o777).toBe(0o750);
    expect(fs.readFileSync(path.join(profile, 'retained'), 'utf8')).toBe('draft');
  });

  it.each(['', '/', '/tmp/x/..', '.'])('refuses %j: not a dedicated directory', (value) => {
    expect(() => prepareProfile(value)).toThrow(PROFILE_MESSAGES.dedicated);
  });

  it('reports a profile path that is a file', () => {
    const file = path.join(temp(), 'file');
    fs.writeFileSync(file, 'x');
    expect(() => prepareProfile(file)).toThrow(PROFILE_MESSAGES.create);
  });

  it('rejects an empty --profile instead of using the launch directory', () => {
    expect(() => prepareProfile(resolveProfile('', {}, temp()))).toThrow(PROFILE_MESSAGES.dedicated);
  });
});

describe('adoptLegacyProfile (rename spec §4.6)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function home() {
    const root = temp();
    const legacy = path.join(root, '.local/share/noema/electron');   // rename-shim: the pre-rename default
    fs.mkdirSync(legacy, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(legacy, 'Cookies'), 'session');
    return { env: { HOME: root }, legacy };
  }

  it('moves the old default profile to the new path once, data and mode included', () => {
    const { env, legacy } = home();
    const log = vi.fn<(line: string) => void>();
    const profile = resolveProfile(null, env, '/c');
    expect(profile).toBe(path.join(env.HOME, '.local/share/dhara/electron'));
    expect(legacyProfile(env)).toBe(legacy);
    expect(adoptLegacyProfile(profile, legacy, log)).toBe(profile);
    expect(fs.readFileSync(path.join(profile, 'Cookies'), 'utf8')).toBe('session');
    expect(fs.existsSync(legacy)).toBe(false);
    expect(fs.statSync(profile).mode & 0o777).toBe(0o700);
    expect(log).not.toHaveBeenCalled();
    expect(adoptLegacyProfile(profile, legacy, log)).toBe(profile);   // next launch: nothing to move
  });

  it('never moves over an existing new profile', () => {
    const { env, legacy } = home();
    const profile = resolveProfile(null, env, '/c');
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(path.join(profile, 'Cookies'), 'newer');
    expect(adoptLegacyProfile(profile, legacy, vi.fn())).toBe(profile);
    expect(fs.readFileSync(path.join(profile, 'Cookies'), 'utf8')).toBe('newer');
    expect(fs.existsSync(path.join(legacy, 'Cookies'))).toBe(true);
  });

  it('keeps using the old path and logs one line when the rename fails (another filesystem)', () => {
    const { env, legacy } = home();
    const log = vi.fn<(line: string) => void>();
    const profile = resolveProfile(null, env, '/c');
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw Object.assign(new Error('EXDEV: cross-device link not permitted'), { code: 'EXDEV' });
    });
    expect(adoptLegacyProfile(profile, legacy, log)).toBe(legacy);
    expect(fs.existsSync(path.join(legacy, 'Cookies'))).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatch(/^Dhara: could not move the profile from .* to .* \(EXDEV\); using the old location$/);
  });
});
