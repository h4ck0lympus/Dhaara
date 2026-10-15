import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: 'dist/test-results',
  reporter: 'list',
  globalSetup: './e2e/sway.ts',
  use: { trace: 'retain-on-failure' },
});
