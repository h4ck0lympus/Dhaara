import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROFILE_MESSAGES, prepareProfile, resolveProfile } from '../src/profile.js';

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'noema-profile-'));

describe('resolveProfile (lib.rs:58-71)', () => {
  it('uses --profile, resolved against cwd', () => {
    expect(resolveProfile('prof', {}, '/home/u')).toBe('/home/u/prof');
    expect(resolveProfile('/abs/prof', {}, '/home/u')).toBe('/abs/prof');
  });

  it('defaults to an absolute $XDG_DATA_HOME/noema/electron', () => {
    expect(resolveProfile(null, { XDG_DATA_HOME: '/xdg', HOME: '/h' }, '/c')).toBe('/xdg/noema/electron');
  });

  it('ignores a relative XDG_DATA_HOME and falls back to ~/.local/share', () => {
    expect(resolveProfile(null, { XDG_DATA_HOME: 'rel', HOME: '/h' }, '/c')).toBe('/h/.local/share/noema/electron');
    expect(resolveProfile(null, { HOME: '/h' }, '/c')).toBe('/h/.local/share/noema/electron');
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
