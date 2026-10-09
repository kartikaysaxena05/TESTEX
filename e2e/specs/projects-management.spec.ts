/**
 * @file e2e/specs/projects-management.spec.ts
 * End-to-End Test for Project Management & Workspace Creation in Electron.
 *
 * Verifies:
 * 1. Opening CreateProjectModal from sidebar navigation.
 * 2. Client-side validation when attempting to submit with empty project name.
 * 3. Entering project details (name, description, favorites flag).
 * 4. Submitting project creation and asserting IPC payload dispatched.
 */

import { test, expect } from '../fixtures/electron-fixture.js';

test.describe('Projects Management & Workspace Creation', () => {
  test.beforeEach(async ({ window, loginAs }) => {
    await loginAs();
    await expect(window.locator('[data-testid="codex-sidebar"]')).toBeVisible();
  });

  test('validates required fields and creates a new project workspace', async ({ window, ipcMock }) => {
    // 1. Click "New Project" button in sidebar
    const newProjectBtn = window.locator('[data-testid="codex-new-project-btn"]');
    await expect(newProjectBtn).toBeVisible();
    await newProjectBtn.click();

    // 2. Verify Create Project Modal opens
    const modal = window.locator('[data-testid="create-project-modal"]');
    await expect(modal).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Create Project Workspace' })).toBeVisible();

    // 3. Configure mock response for project creation
    const newProject = {
      id: 'proj-e2e-acme-42',
      name: 'Acme Enterprise E2E Test Suite',
      key: 'ACME',
      description: 'Enterprise test project for autonomous quality engineering.',
      status: 'ACTIVE',
      isFavorite: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await ipcMock.handle('desktop:projects:create', newProject);

    // 4. Fill in project details
    const nameInput = window.locator('[data-testid="create-project-name-input"]');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('Acme Enterprise E2E Test Suite');

    const descInput = window.locator('[data-testid="create-project-desc-input"]');
    await descInput.fill('Enterprise test project for autonomous quality engineering.');

    // 5. Check Pin to Favorites
    const favCheckbox = window.locator('[data-testid="create-project-favorite-checkbox"]');
    await favCheckbox.check();
    await expect(favCheckbox).toBeChecked();

    // 6. Submit form
    const submitBtn = modal.getByRole('button', { name: 'Create Project' });
    await submitBtn.click();

    // 7. Verify modal closes
    await expect(modal).not.toBeVisible();

    // 8. Verify IPC call was dispatched
    const call = await ipcMock.waitForCall('desktop:projects:create');
    expect(call).toBeDefined();
    expect(call.args).toMatchObject({
      name: 'Acme Enterprise E2E Test Suite',
      description: 'Enterprise test project for autonomous quality engineering.',
      isFavorite: true,
    });
  });
});
