import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
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
      name: 'Staging Server',
      type: 'STAGING',
      baseUrl: 'https://staging.example.com',
      isDefault: true,
      createdAt: dummyDateStr,
      updatedAt: dummyDateStr,
    },
    createdAt: dummyDateStr,
    updatedAt: dummyDateStr,
  };

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
      assert.ok(html.includes('Configure target URLs and endpoints'), 'Must render description');
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
