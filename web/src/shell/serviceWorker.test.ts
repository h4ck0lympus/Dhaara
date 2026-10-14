import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerServiceWorker } from './serviceWorker';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function productionBuild(mode = 'production') {
  vi.stubEnv('DEV', false);
  vi.stubEnv('MODE', mode);
}

describe('registerServiceWorker', () => {
  it('registers /sw.js in a production build and swallows a rejected registration', async () => {
    productionBuild();
    const register = vi.fn(() => Promise.reject(new Error('SecurityError')));
    vi.stubGlobal('navigator', { serviceWorker: { register } });
    expect(() => registerServiceWorker()).not.toThrow();
    expect(register).toHaveBeenCalledWith('/sw.js');
    await Promise.resolve();
  });

  it('never registers from the development watch build, whose sw.js has no precache header', () => {
    productionBuild('development');
    const register = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { serviceWorker: { register } });
    registerServiceWorker();
    expect(register).not.toHaveBeenCalled();
  });

  it('does nothing where service workers are unavailable (plain-HTTP non-loopback origin)', () => {
    productionBuild();
    vi.stubGlobal('navigator', {});
    expect(() => registerServiceWorker()).not.toThrow();
  });
});
