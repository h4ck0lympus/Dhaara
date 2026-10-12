import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: 'dist/test-results',   // dist/ is already gitignored (contract §10)
  reporter: 'list',
  globalSetup: './e2e/sway.ts',     // private headless Sway: the suite never touches the owner's session
  use: { trace: 'retain-on-failure' },
});
