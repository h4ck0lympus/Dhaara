import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  workers: 4,
  retries: 0,
  timeout: 60_000, // each test starts its own Python service; the service-worker tests start two
  expect: { timeout: 15_000 }, // four workers each start a Python service: a 5 s default misses slow-but-correct renders
  use: { trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
