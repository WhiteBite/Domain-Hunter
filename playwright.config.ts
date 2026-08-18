import { defineConfig } from '@playwright/test';

/**
 * E2E configuration — runs against the built dist/index.html over file://.
 * No webServer/baseURL: specs navigate to file:// URLs directly via distUrl().
 * workers: 1 + fullyParallel: false — serial execution for localStorage
 * determinism (dh:v1:* keys are shared per origin under file://).
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report' }]],
  use: {
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
