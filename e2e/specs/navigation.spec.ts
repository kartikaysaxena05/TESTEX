/**
 * @file e2e/specs/navigation.spec.ts
 * End-to-End Navigation Test for the Electron Desktop Application.
 *
 * Verifies that the QA engineer can navigate seamlessly across all core quality engineering
 * screens using the Codex left navigation bar, with active route indicators and view transitions.
 */

import { test, expect } from '../fixtures/electron-fixture.js';

test.describe('Electron Application Core Navigation', () => {
  test.beforeEach(async ({ window, loginAs }) => {
    // 1. Authenticate into the Electron application shell
    await loginAs();
    await expect(window.locator('[data-testid="codex-sidebar"]')).toBeVisible();

    // 2. Select the active project from the sidebar
    const projectItem = window.getByRole('button', { name: 'SQE Core Platform' });
    await expect(projectItem).toBeVisible();
    await projectItem.click();
  });

  test('navigates to Requirements screen and displays requirements table and metrics', async ({ window }) => {
    const sidebar = window.locator('[data-testid="codex-sidebar"]');
    
    // Click Requirements link in the navigation
    await sidebar.getByRole('link', { name: 'Requirements' }).click();

    // Verify URL route transitioned
    await expect(window).toHaveURL(/.*requirements/);

    // Verify Requirements screen heading is visible
    await expect(window.getByRole('heading', { name: 'Requirement Intelligence', level: 1 })).toBeVisible();

    // Verify action buttons are rendered
    await expect(window.getByRole('button', { name: '+ Add Requirement' })).toBeVisible();
    await expect(window.getByRole('button', { name: 'Refresh' })).toBeVisible();

    // Verify the mock requirement REQ-001 appears in table
    await expect(window.getByText('REQ-001')).toBeVisible();
    await expect(window.getByText('User Authentication Workflow')).toBeVisible();
  });

  test('navigates to Tests (Test Cases) screen', async ({ window }) => {
    const sidebar = window.locator('[data-testid="codex-sidebar"]');
    
    // Click Tests link
    await sidebar.getByRole('link', { name: 'Tests' }).click();

    // Verify route transitioned
    await expect(window).toHaveURL(/.*test-cases/);

    // Verify Test Cases switcher tabs are visible
    await expect(window.getByRole('button', { name: 'Canonical Test Cases' })).toBeVisible();
    await expect(window.getByRole('button', { name: /Review, Governance/ })).toBeVisible();

    // Verify TC-001 appears
    await expect(window.getByText('TC-001')).toBeVisible();
    await expect(window.getByText('Verify Login with Valid Credentials')).toBeVisible();
  });

  test('navigates to Test Runs screen', async ({ window }) => {
    const sidebar = window.locator('[data-testid="codex-sidebar"]');
    
    // Click Test Runs link
    await sidebar.getByRole('link', { name: 'Test Runs' }).click();

    // Verify route transitioned
    await expect(window).toHaveURL(/.*test-runs/);

    // Verify Test Runs header and badge are visible
    await expect(window.getByRole('heading', { name: 'Autonomous Web Test Runs', level: 1 })).toBeVisible();
    await expect(window.getByText('Playwright Orchestrator')).toBeVisible();
  });

  test('navigates to Settings screen and inspects configuration tabs', async ({ window }) => {
    const sidebar = window.locator('[data-testid="codex-sidebar"]');
    
    // Click Settings link
    await sidebar.getByRole('link', { name: 'Settings' }).click();

    // Verify route transitioned
    await expect(window).toHaveURL(/.*settings/);

    // Verify settings navigation tabs are visible
    await expect(window.getByRole('tab', { name: 'Profile' })).toBeVisible();
    await expect(window.getByRole('tab', { name: 'Appearance' })).toBeVisible();
    await expect(window.getByRole('tab', { name: 'Preferences' })).toBeVisible();
  });
});
