/**
 * @file apps/desktop/src/main/projects-ui.test.tsx
 * Comprehensive unit and rendering tests for Projects screen and project dialogs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ProjectsScreen } from '../renderer/screens/ProjectsScreen.js';
import { CreateProjectDialog } from '../renderer/screens/projects/CreateProjectDialog.js';
import { EditProjectDialog } from '../renderer/screens/projects/EditProjectDialog.js';
import { ProjectEnvironmentsDialog } from '../renderer/screens/projects/ProjectEnvironmentsDialog.js';
import { ProjectProvider } from '../renderer/context/ProjectContext.js';
import { ProjectSelector } from '../renderer/components/ProjectSelector.js';
import type { ProjectSummary } from '@ai-quality/contracts';

describe('Project UI Component Unit Tests', () => {
  const dummyDateStr = new Date('2026-01-01T00:00:00.000Z').toISOString();

  const mockProject: ProjectSummary = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'E-Commerce Platform',
    description: 'Autonomous web quality test project',
    status: 'ACTIVE',
    environmentCount: 2,
    defaultEnvironment: {
      id: '22222222-2222-2222-2222-222222222222',
      projectId: '11111111-1111-1111-1111-111111111111',
      targetApplicationId: null,
      name: 'Staging Server',
      type: 'STAGING',
      baseUrl: 'https://staging.example.com',
      isDefault: true,
      isEnabled: true,
      isProduction: false,
      productionSafetyPolicy: 'PROHIBITED',
      browserEngine: 'chromium',
      headless: true,
      viewportWidth: 1280,
      viewportHeight: 720,
      locale: null,
      timezoneId: null,
      colorScheme: 'light',
      ignoreHttpsErrors: false,
      permissions: [],
      extraHeaders: null,
      variables: null,
      secretReferences: null,
      notes: null,
      createdAt: dummyDateStr,
      updatedAt: dummyDateStr,
    },
    createdAt: dummyDateStr,
    updatedAt: dummyDateStr,
  };

  describe('ProjectsScreen Redesign & Components', () => {
    it('should render Projects header, title, description, and + New Project button', () => {
      const html = renderToString(
        <MemoryRouter>
          <ProjectProvider>
            <ProjectsScreen />
          </ProjectProvider>
        </MemoryRouter>,
      );

      assert.ok(html.includes('Projects'), 'Must render page title');
      assert.ok(
        html.includes('Manage software quality engineering workspaces'),
        'Must render description',
      );
      assert.ok(html.includes('+ New Project'), 'Must render + New Project CTA');
      assert.ok(html.includes('data-testid="project-totals"'), 'Must render real totals badge');
    });

    it('should render Search, Environment Filter, and Sort dropdown controls in Toolbar', () => {
      const html = renderToString(
        <MemoryRouter>
          <ProjectProvider>
            <ProjectsScreen />
          </ProjectProvider>
        </MemoryRouter>,
      );

      assert.ok(html.includes('data-testid="project-search-input"'), 'Must render search input');
      assert.ok(html.includes('data-testid="project-env-filter"'), 'Must render env filter');
      assert.ok(html.includes('data-testid="project-sort-select"'), 'Must render sort select');
      assert.ok(html.includes('Recently Updated'), 'Must include Recently Updated sort option');
      assert.ok(
        html.includes('Configured Environments'),
        'Must include Configured Environments filter option',
      );
    });

    it('should render Active and Archived tabs with role="tablist"', () => {
      const html = renderToString(
        <MemoryRouter>
          <ProjectProvider>
            <ProjectsScreen />
          </ProjectProvider>
        </MemoryRouter>,
      );

      assert.ok(html.includes('data-testid="tab-active"'), 'Must render active tab');
      assert.ok(html.includes('data-testid="tab-archived"'), 'Must render archived tab');
      assert.ok(html.includes('role="tablist"'), 'Must include accessible tablist role');
    });

    it('should render high-density table with semantic headers', () => {
      const html = renderToString(
        <MemoryRouter>
          <ProjectProvider>
            <ProjectsScreen />
          </ProjectProvider>
        </MemoryRouter>,
      );

      assert.ok(html.includes('projects-table'), 'Must render table');
      assert.ok(html.includes('>Project<'), 'Must render Project column header');
      assert.ok(html.includes('>Environment<'), 'Must render Environment column header');
      assert.ok(html.includes('>Updated<'), 'Must render Updated column header');
      assert.ok(html.includes('>Status<'), 'Must render Status column header');
      assert.ok(html.includes('>Actions<'), 'Must render Actions column header');
    });
  });

  describe('CreateProjectDialog', () => {
    it('should render dialog form with name and description fields when open', () => {
      const html = renderToString(
        <ProjectProvider>
          <CreateProjectDialog isOpen={true} onClose={() => {}} />
        </ProjectProvider>,
      );

      assert.ok(html.includes('Create New Project'), 'Must render dialog title');
      assert.ok(html.includes('Project Name'), 'Must render name field label');
      assert.ok(html.includes('Description'), 'Must render description field label');
      assert.ok(html.includes('Create Project'), 'Must render submit button');
    });

    it('should render nothing when isOpen is false', () => {
      const html = renderToString(
        <ProjectProvider>
          <CreateProjectDialog isOpen={false} onClose={() => {}} />
        </ProjectProvider>,
      );
      assert.strictEqual(html, '');
    });
  });

  describe('EditProjectDialog', () => {
    it('should render dialog form with current project name when open', () => {
      const html = renderToString(
        <ProjectProvider>
          <EditProjectDialog project={mockProject} isOpen={true} onClose={() => {}} />
        </ProjectProvider>,
      );

      assert.ok(
        html.includes('Edit Project: E-Commerce Platform'),
        'Must render edit dialog title',
      );
      assert.ok(html.includes('Save Changes'), 'Must render save button');
    });
  });

  describe('ProjectEnvironmentsDialog', () => {
    it('should render environments dialog structure when open', () => {
      const html = renderToString(
        <ProjectProvider>
          <ProjectEnvironmentsDialog project={mockProject} isOpen={true} onClose={() => {}} />
        </ProjectProvider>,
      );

      assert.ok(
        html.includes('Environments: E-Commerce Platform'),
        'Must render environments dialog title',
      );
      assert.ok(
        html.includes('Configure target web applications, URLs, browsers, viewports'),
        'Must render description',
      );
    });
  });

  describe('ProjectSelector', () => {
    it('should render select control inside ProjectProvider', () => {
      const html = renderToString(
        <ProjectProvider>
          <ProjectSelector />
        </ProjectProvider>,
      );

      assert.ok(html.includes('data-testid="project-selector"'), 'Must render selector container');
      assert.ok(html.includes('Current Project'), 'Must render label');
      assert.ok(html.includes('form-select'), 'Must render select element');
    });
  });
});
