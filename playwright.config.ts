/**
 * @file playwright.config.ts
 * Playwright E2E configuration for Electron Application testing.
 *
 * Configures _electron.launch() runner, timeouts, single-worker execution (essential for Electron desktop shells),
 * and artifact collection.
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  // Electron applications require workers: 1 to prevent display, lock, and port contention
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  outputDir: 'test-results',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
});
