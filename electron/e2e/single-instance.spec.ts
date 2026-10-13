import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test, expect } from '@playwright/test';
import { startDhara } from '../../web/e2e/server.js';
import { ELECTRON_BIN, MAIN, killAll, launchDhara, waitConnected, windowCount } from './fixtures.js';

test.afterEach(killAll);

test('a second instance focuses the first and exits 0 without using its own arguments', async () => {
  const dhara = await startDhara();
  try {
    const first = await launchDhara(['--server', dhara.origin]);
    await waitConnected(first.window);
    await first.app.evaluate(({ app }) => {
      const g = globalThis as typeof globalThis & { __secondInstances?: number };
      g.__secondInstances = 0;
      app.on('second-instance', () => { g.__secondInstances! += 1; });
    });
    const second = spawn(ELECTRON_BIN, [MAIN, '--profile', first.profile, '--server', 'http://127.0.0.1:9'], { stdio: 'ignore' });
    const [code] = await once(second, 'exit');
    expect(code).toBe(0);
    await expect.poll(() => first.app.evaluate(() => (globalThis as typeof globalThis & { __secondInstances?: number }).__secondInstances)).toBe(1);
    expect(await windowCount(first.app)).toBe(1);
    expect(new URL(first.window.url()).origin).toBe(dhara.origin);
  } finally {
    await dhara.stop();
  }
});
