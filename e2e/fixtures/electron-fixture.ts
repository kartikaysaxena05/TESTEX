/**
 * @file e2e/fixtures/electron-fixture.ts
 * Base Playwright Test Fixture for Electron Application E2E testing.
 *
 * Capabilities:
 * 1. Launches Electron via _electron.launch() with isolated temporary user data directories.
 * 2. Connects to the React renderer window and verifies the DOM root is mounted.
 * 3. Provides an initialized IpcMock instance to intercept messages between React and Node.js main process.
 * 4. Ensures clean process shutdown and filesystem cleanup across every test run.
 */

import { test as base, expect, type Page, type ElectronApplication } from '@playwright/test';
import { _electron } from '@playwright/test';
import { resolve } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { IpcMock } from '../ipc/ipc-mock.js';

export interface ElectronTestFixtures {
  /**
   * Unique temporary user data directory created for the test instance.
   */
  tmpUserDataDir: string;

  /**
   * Launched Electron application instance.
   */
  electronApp: ElectronApplication;

  /**
   * Primary application BrowserWindow / Page running the React renderer.
   */
  window: Page;

  /**
   * IPC Mocking utility bound to the running Electron main process.
   */
  ipcMock: IpcMock;

  /**
   * Helper function to authenticate into the React UI shell using mocked credentials.
   */
  loginAs: (credentials?: { email?: string; password?: string }) => Promise<void>;
}

export const test = base.extend<ElectronTestFixtures>({
  // 1. Isolated user data directory fixture
  tmpUserDataDir: async ({}, use) => {
    const dir = mkdtempSync(resolve(tmpdir(), 'sqe-electron-e2e-'));
    try {
      await use(dir);
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors on locked files
      }
    }
  },

  // 2. Electron Application launch fixture
  electronApp: async ({ tmpUserDataDir }, use) => {
    const projectRoot = process.cwd();
    const mainScript = resolve(projectRoot, 'apps/desktop/dist/main/index.js');

    const app = await _electron.launch({
      args: [mainScript, `--user-data-dir=${tmpUserDataDir}`],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        AI_QUALITY_ELECTRON_SMOKE: '0',
      },
    });

    try {
      await use(app);
    } finally {
      try {
        await app.close();
      } catch {
        // App may have closed during test
      }
    }
  },

  // 3. React renderer window fixture
  window: async ({ electronApp }, use) => {
    const firstWindow = await electronApp.firstWindow();
    await firstWindow.waitForLoadState('domcontentloaded');

    // Wait for React to mount into #root
    await firstWindow.locator('#root').waitFor({ state: 'attached', timeout: 15000 });

    await use(firstWindow);
  },

  // 4. IPC Mock fixture initialized with safe baseline mocks
  ipcMock: async ({ electronApp, window }, use) => {
    const mock = new IpcMock(electronApp);
    await mock.initialize();
    await mock.setupDefaults();
    await use(mock);
  },

  // 5. Convenience helper to log in via React UI form
  loginAs: async ({ window }, use) => {
    const loginFn = async (credentials?: { email?: string; password?: string }) => {
      const email = credentials?.email ?? 'lead.qa@sqe.platform';
      const password = credentials?.password ?? 'Password123!';

      const emailInput = window.locator('[data-testid="input-email"]');
      const passwordInput = window.locator('[data-testid="input-password"]');
      const submitBtn = window.locator('[data-testid="btn-submit"]');

      await emailInput.waitFor({ state: 'visible', timeout: 10000 });
      await emailInput.fill(email);
      await passwordInput.fill(password);
      await submitBtn.click();
    };

    await use(loginFn);
  },
});

export { expect };
