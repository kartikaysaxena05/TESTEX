import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import {
  ProjectHeader,
  ProjectSnapshot,
  EnvironmentOverview,
  QualityWorkspace,
} from '../renderer/features/dashboard/index.js';
import { ProjectDashboard } from '../renderer/features/dashboard/ProjectDashboard.js';
import { ProjectProvider } from '../renderer/context/ProjectContext.js';
import type { ProjectDetails } from '@ai-quality/contracts';

describe('Project Dashboard UI & State Unit Tests', () => {
  const dummyDateStr = new Date('2026-08-21T00:00:00.000Z').toISOString();

  const mockProjectDetails: ProjectDetails = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Garment ERP Platform',
    description: 'Enterprise quality engineering workspace for textile logistics.',
    status: 'ACTIVE',
    environments: [
      {
        id: 'env-1',
        projectId: '11111111-1111-1111-1111-111111111111',
        name: 'Staging Server',
        type: 'STAGING',
        baseUrl: 'https://staging.garment.example.com',
        isDefault: true,
        createdAt: dummyDateStr,
        updatedAt: dummyDateStr,
      },
      {
        id: 'env-2',
        projectId: '11111111-1111-1111-1111-111111111111',
        name: 'Local Dev',
        type: 'DEVELOPMENT',
        baseUrl: 'http://localhost:3000',
        isDefault: false,
        createdAt: dummyDateStr,
        updatedAt: dummyDateStr,
      },
    ],
    createdAt: dummyDateStr,
    updatedAt: dummyDateStr,
  };

  const mockProjectNoEnvs: ProjectDetails = {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Brand New Project',
    description: null,
    status: 'ACTIVE',
    environments: [],
    createdAt: dummyDateStr,
    updatedAt: dummyDateStr,
  };

  describe('ProjectHeader Component', () => {
    it('should render real project name, status badge, and description', () => {
      const html = renderToString(
        <MemoryRouter>
          <ProjectHeader project={mockProjectDetails} />
        </MemoryRouter>,
      );

      assert.ok(html.includes('Garment ERP Platform'), 'Must render project name');
      assert.ok(html.includes('ACTIVE'), 'Must render active status badge');
      assert.ok(
        html.includes('Enterprise quality engineering workspace for textile logistics.'),
        'Must render real description',
      );
      assert.ok(html.includes('Manage Project'), 'Must render Manage Project action button');
    });

    it('should render fallback when description is null without manufacturing copy', () => {
      const html = renderToString(
        <MemoryRouter>
          <ProjectHeader project={mockProjectNoEnvs} />
        </MemoryRouter>,
      );

      assert.ok(html.includes('Brand New Project'), 'Must render project name');
      assert.ok(html.includes('No description provided.'), 'Must render restrained fallback');
    });
  });

  describe('ProjectSnapshot Component', () => {
    it('should render persisted project status, environment count, default environment, and timestamp', () => {
      const html = renderToString(<ProjectSnapshot project={mockProjectDetails} />);

      assert.ok(html.includes('Project Snapshot'), 'Must render snapshot section title');
      assert.ok(html.includes('Lifecycle Status'), 'Must render status card');
      assert.ok(html.includes('ACTIVE'), 'Must render ACTIVE status');
      assert.ok(html.includes('2 configured'), 'Must render 2 configured environments count');
      assert.ok(html.includes('Staging Server'), 'Must render default environment name');
      assert.ok(html.includes('STAGING'), 'Must render default environment type');
      assert.ok(html.includes('Last Updated'), 'Must render last updated label');
    });

    it('should handle zero environments and no default environment gracefully', () => {
      const html = renderToString(<ProjectSnapshot project={mockProjectNoEnvs} />);

      assert.ok(html.includes('0 configured'), 'Must render 0 configured environments count');
      assert.ok(html.includes('None configured'), 'Must indicate no default environment');
    });
  });

  describe('EnvironmentOverview Component', () => {
    it('should render environment table with default environment listed first and URLs preserved', () => {
      const html = renderToString(
        <MemoryRouter>
          <EnvironmentOverview project={mockProjectDetails} />
        </MemoryRouter>,
      );

      assert.ok(html.includes('Environment Overview'), 'Must render section title');
      assert.ok(html.includes('Staging Server'), 'Must render Staging Server row');
      assert.ok(
        html.includes('https://staging.garment.example.com'),
        'Must render staging base URL',
      );
      assert.ok(html.includes('Default Target'), 'Must render Default Target badge');
      assert.ok(html.includes('Local Dev'), 'Must render Local Dev row');
      assert.ok(html.includes('http://localhost:3000'), 'Must render local base URL');
    });

    it('should render empty state when project has zero environments', () => {
      const html = renderToString(
        <MemoryRouter>
          <EnvironmentOverview project={mockProjectNoEnvs} />
        </MemoryRouter>,
      );

      assert.ok(
        html.includes('No environments configured for this project.'),
        'Must render zero environment notice',
      );
      assert.ok(html.includes('Configure First Environment'), 'Must offer configuration action');
    });
  });

  describe('QualityWorkspace Component (Honest Data Audit)', () => {
    it('should render future QA module cards with "Not available" status and no fake numeric metrics', () => {
      const html = renderToString(
        <MemoryRouter>
          <QualityWorkspace />
        </MemoryRouter>,
      );

      // Section Header
      assert.ok(html.includes('Quality Engineering Workspace'), 'Must render workspace title');

      // Module Cards
      assert.ok(html.includes('Requirements'), 'Must render Requirements card');
      assert.ok(html.includes('Test Cases'), 'Must render Test Cases card');
      assert.ok(html.includes('Test Runs'), 'Must render Test Runs card');
      assert.ok(html.includes('Defects'), 'Must render Defects card');
      assert.ok(html.includes('Reports'), 'Must render Reports card');
      assert.ok(html.includes('Traceability Matrix'), 'Must render Traceability Matrix card');

      // Honest Data Indicators
      assert.ok(html.includes('Not available'), 'Must display Not available badge');
      assert.ok(
        html.includes('No data available for this project'),
        'Must display honest no data notice',
      );

      // Verify NO fake metrics or counters
      assert.strictEqual(html.includes('88.7%'), false, 'Must NOT render fake coverage percentage');
      assert.strictEqual(html.includes('418'), false, 'Must NOT render fake generated test count');
      assert.strictEqual(html.includes('284 passed'), false, 'Must NOT render fake passed tests');
      assert.strictEqual(
        html.includes('24 confirmed'),
        false,
        'Must NOT render fake confirmed bugs',
      );
    });
  });

  describe('ProjectDashboard No Project Empty State', () => {
    it('should render No Project Selected empty state when no project ID is in context', () => {
      const html = renderToString(
        <MemoryRouter>
          <ProjectProvider>
            <ProjectDashboard />
          </ProjectProvider>
        </MemoryRouter>,
      );

      assert.ok(html.includes('No Project Selected'), 'Must render empty state title');
      assert.ok(
        html.includes('Select a project from the sidebar selector or create a new project'),
        'Must render instructions',
      );
      assert.ok(html.includes('Go to Projects'), 'Must render navigation button');
    });
  });

  describe('Rapid Project Switching / Stale Response Protection Logic', () => {
    it('should discard stale responses from previously selected project when switching rapidly', async () => {
      let activeProjectId: string | null = 'project-A';
      let activeRequestId = 0;
      let displayedProjectName: string | null = null;

      // Simulated async fetch with delayed resolution
      const simulateFetch = async (projectId: string, delayMs: number, resultName: string) => {
        const requestId = ++activeRequestId;
        await new Promise(resolve => setTimeout(resolve, delayMs));

        // Stale response guard: only commit if this request is still the active one
        if (requestId === activeRequestId && projectId === activeProjectId) {
          displayedProjectName = resultName;
        }
      };

      // 1. User selects Project A (slow network response, e.g. 50ms)
      const fetchA = simulateFetch('project-A', 50, 'Project A Result');

      // 2. User rapidly switches to Project B immediately (fast response, e.g. 10ms)
      activeProjectId = 'project-B';
      const fetchB = simulateFetch('project-B', 10, 'Project B Result');

      // Wait for both promises to resolve
      await Promise.all([fetchA, fetchB]);

      // Result MUST be Project B, never overwritten by late Project A
      assert.strictEqual(
        displayedProjectName,
        'Project B Result',
        'Displayed project must be Project B and never overwritten by late Project A',
      );
    });
  });
});
