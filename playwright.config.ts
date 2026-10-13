// End-to-end tests (ADR-043). They drive the BUILT app (`npm run build`, then `vite preview`) in Route replay mode.
// This is a headless desktop Chromium run. It is NOT a phone, NOT iOS Safari, and NOT a real GPS: it never replaces KOS 13.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4173',
    // Blocked by default so page.route() can replace the dataset file; offline.spec.ts turns it on for itself.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'desktop-chromium-headless' }],
  webServer: {
    // Serves the existing dist/ build. Run `npm run build` first (the `test:e2e` script does).
    command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
