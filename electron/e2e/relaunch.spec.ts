import { test, expect } from '@playwright/test';
import { startNoema, type NoemaServer } from '../../web/e2e/server.js';
import { killAll, launchNoema, waitConnected, windowCount } from './fixtures.js';

let noema: NoemaServer;
test.beforeEach(async () => { noema = await startNoema(); });
test.afterEach(async () => { await killAll(); await noema.stop(); });

// Regression: a relaunch after a confirmed exit must own the single-instance lock and show a window (not silently exit 0 as a "second instance").
test('relaunching on the same profile after a confirmed exit always shows a window', async () => {
  let profile: string | undefined;
  for (let round = 0; round < 5; round += 1) {
    const run = await launchNoema(['--server', noema.origin], { profile });
    profile = run.profile;
    await waitConnected(run.window);
    expect(await windowCount(run.app)).toBe(1);
    await run.app.close();
  }
});
