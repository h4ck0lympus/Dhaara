import { describe, expect, it, vi } from 'vitest';
import { env, LEGACY_PREFIX, PREFIX, STRIPPED_ENV, STRIPPED_NAMES } from '../src/env.js';

describe('env (rename spec §4.1)', () => {
  it('prefers DHARA_<name> and never logs for it', () => {
    const log = vi.fn();
    expect(env('MODEL', { DHARA_MODEL: 'new', NOEMA_MODEL: 'old' }, log)).toBe('new');
    expect(log).not.toHaveBeenCalled();
  });

  it('falls back to NOEMA_<name> with one deprecation line per name and process', () => {
    const log = vi.fn();
    expect(env('ELECTRON_TEST', { NOEMA_ELECTRON_TEST: '1' }, log)).toBe('1');
    expect(env('ELECTRON_TEST', { NOEMA_ELECTRON_TEST: '1' }, log)).toBe('1');
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('Dhara: NOEMA_ELECTRON_TEST is deprecated; set DHARA_ELECTRON_TEST instead');
  });

  it('returns undefined when neither name is set', () => {
    const log = vi.fn();
    expect(env('DATA_DIR', {}, log)).toBeUndefined();
    expect(log).not.toHaveBeenCalled();
  });

  it('strips every optional feature and credential under both prefixes', () => {
    expect(PREFIX).toBe('DHARA_');
    expect(LEGACY_PREFIX).toBe('NOEMA_');
    expect(STRIPPED_ENV).toEqual([...STRIPPED_NAMES.map((name) => PREFIX + name), ...STRIPPED_NAMES.map((name) => LEGACY_PREFIX + name)]);
    expect(STRIPPED_ENV).toContain('NOEMA_ACCESS_TOKEN');
    expect(STRIPPED_ENV).toContain('DHARA_DATA_DIR');
  });
});
