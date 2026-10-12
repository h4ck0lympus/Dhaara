import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Child processes: PR_SET_PDEATHSIG follows the spawning *thread*, so tests spawn from a forked
    // worker's main thread, never from a worker_threads pool.
    pool: 'forks',
    testTimeout: 45_000,
    hookTimeout: 45_000,
  },
});
