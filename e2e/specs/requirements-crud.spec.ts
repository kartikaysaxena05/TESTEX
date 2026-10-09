/**
 * @file e2e/specs/requirements-crud.spec.ts
 * End-to-End Test for Requirement Lifecycle and Add/Edit Modal.
 *
 * Verifies:
 * 1. Opening the AddEditRequirementModal via the "+ Add Requirement" button.
 * 2. Proper closure of modal via Escape key without React hook crashes.
 * 3. Entering requirement key, title, description, type, and priority.
 * 4. Submitting the requirement and verifying IPC message dispatched with expected payload.
 */

import { test, expect } from '../fixtures/electron-fixture.js';

test.describe('Requirements Feature & Add/Edit Modal Lifecycle', () => {
  test.beforeEach(async ({ window, loginAs }) => {
    // 1. Authenticate into the Electron application shell
    await loginAs();
    await expect(window.locator('[data-testid="codex-sidebar"]')).toBeVisible();

    // 2. Select the active project
    const projectItem = window.getByRole('button', { name: 'SQE Core Platform' });
    await expect(projectItem).toBeVisible();
    await projectItem.click();

    // 3. Navigate to Requirements screen
    const sidebar = window.locator('[data-testid="codex-sidebar"]');
    await sidebar.getByRole('link', { name: 'Requirements' }).click();
    await expect(window.getByRole('heading', { name: 'Requirement Intelligence', level: 1 })).toBeVisible();
  });

  test('opens AddEditRequirementModal and closes cleanly via Escape key', async ({ window }) => {
    // Click + Add Requirement button
    await window.getByRole('button', { name: '+ Add Requirement' }).click();

    // Modal heading must be visible
    const modalHeading = window.getByRole('heading', { name: 'Add Manual Requirement' });
    await expect(modalHeading).toBeVisible();

    // Verify key input is present
    await expect(window.locator('#req-key-input')).toBeVisible();

    // Press Escape key
    await window.keyboard.press('Escape');

    // Modal must close cleanly and no error boundary or crash should be present
    await expect(modalHeading).not.toBeVisible();
    await expect(window.locator('[data-testid="screen-error-boundary"]')).not.toBeVisible();
  });

  test('creates a new requirement with custom type and priority', async ({ window, ipcMock }) => {
    // Setup mock handler for creation
    await ipcMock.handle('desktop:requirements:create', {
      id: 'req-e2e-new-2',
      projectId: 'proj-e2e-sqe',
      requirementKey: 'REQ-002',
      title: 'Biometric Two-Factor Authentication',
      originalText: 'The system must require biometric or TOTP secondary authentication for enterprise access.',
      type: 'SECURITY',
      priority: 'CRITICAL',
      status: 'ACTIVE',
      currentVersionNumber: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Click + Add Requirement
    await window.getByRole('button', { name: '+ Add Requirement' }).click();

    // Enter title
    const titleInput = window.locator('#req-title-input');
    await expect(titleInput).toBeVisible();
    await titleInput.fill('Biometric Two-Factor Authentication');

    // Enter description
    const textInput = window.locator('#req-text-input');
    await textInput.fill('The system must require biometric or TOTP secondary authentication for enterprise access.');

    // Select Type: SECURITY
    const typeSelect = window.locator('#req-type-select');
    await typeSelect.selectOption('SECURITY');

    // Select Priority: CRITICAL
    const prioritySelect = window.locator('#req-priority-select');
    await prioritySelect.selectOption('CRITICAL');

    // Submit form by clicking Create Requirement button
    const submitBtn = window.getByRole('button', { name: 'Create Requirement' });
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // Verify modal closes
    await expect(window.getByRole('heading', { name: 'Add Manual Requirement' })).not.toBeVisible();

    // Verify IPC message was recorded
    const createCall = await ipcMock.waitForCall('desktop:requirements:create');
    expect(createCall).toBeDefined();
    expect(createCall.args).toMatchObject({
      title: 'Biometric Two-Factor Authentication',
      type: 'SECURITY',
      priority: 'CRITICAL',
    });
  });
});
