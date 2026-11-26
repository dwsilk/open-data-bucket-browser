import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the built app, kept out of `npm test`.
 *
 * The specs intercept the dataset index and the S3 listing with fixtures, so
 * they need no network and give the same result every run. They still need a
 * build, and `npm run build` runs the indexer when `public/data/` is empty,
 * which does reach the network.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 300_000,
  },
});
