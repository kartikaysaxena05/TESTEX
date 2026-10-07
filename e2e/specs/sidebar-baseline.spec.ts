/**
 * @file e2e/specs/sidebar-baseline.spec.ts
 * Baseline E2E Test for Electron Application.
 *
 * Verifies:
 * 1. Application boots cleanly into the React renderer.
 * 2. IPC messages sent from the React UI are intercepted by the IPC mocking utility.
 * 3. Node.js main process returns dummy data to the renderer.
 * 4. React UI transitions and displays the "SQE Platform" sidebar and branding.
 */

import { test, expect } from '../fixtures/electron-fixture.js';

test.describe('Electron Application E2E Baseline', () => {
  test('boots and displays the "SQE Platform" sidebar', async ({
    window,
    ipcMock,
    loginAs,
  }) => {
    // 1. Verify the React renderer booted into the authentication view
    const authForm = window.locator('[data-testid="auth-form"]');
    await expect(authForm).toBeVisible();

    // 2. Configure dummy data in IPC mock for auth and projects
    const dummyUser = {
      userId: 'usr-lead-qa-42',
      displayName: 'Lead QA Engineer',
      email: 'lead.qa@sqe.platform',
      accountStatus: 'ACTIVE',
      emailVerified: true,
      sessionId: 'sess-sqe-lead-42',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    };

    const dummyProjects = [
      {
        id: 'proj-e2e-sqe-1',
        name: 'SQE Quality Assurance Platform',
        key: 'SQE',
        description: 'Autonomous Quality Engineering Platform',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    await ipcMock.handle('desktop:auth:login', dummyUser);
    await ipcMock.handle('desktop:projects:list', dummyProjects);

    // 3. Trigger login through the React UI
    await loginAs({
      email: dummyUser.email,
      password: 'SecurePassword123!',
    });

    // 4. Verify that the IPC message dispatched by the React UI was intercepted
    const loginCall = await ipcMock.waitForCall('desktop:auth:login');
    expect(loginCall).toBeDefined();
    expect(loginCall.args).toMatchObject({
      email: 'lead.qa@sqe.platform',
      password: 'SecurePassword123!',
    });

    // 5. Verify the "SQE Platform" sidebar is displayed
    const sidebar = window.locator('[data-testid="codex-sidebar"]');
    await expect(sidebar).toBeVisible();

    // 6. Verify the product mark branding renders "SQE Platform"
    const productMark = window.locator('[data-testid="product-mark"]');
    await expect(productMark).toBeVisible();
    await expect(productMark.locator('.product-mark-title')).toHaveText('SQE Platform');
    await expect(window.getByText('SQE Platform')).toBeVisible();

    // 7. Verify the dummy project returned by the IPC mock is rendered in the sidebar
    await expect(sidebar.getByText('SQE Quality Assurance Platform')).toBeVisible();
  });
});
