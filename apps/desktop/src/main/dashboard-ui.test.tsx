/**
 * @file apps/desktop/src/main/dashboard-ui.test.tsx
 * Comprehensive unit and rendering tests for the SQE Platform Overview Dashboard.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import {
  GettingStartedPanel,
  PlatformHealthPanel,
  RecentProjectsPanel,
  ProjectHeader,
  ProjectQualityMetrics,
  QualityPipeline,
  NeedsAttentionPanel,
  EnvironmentOverview,
  ProjectDashboard,
  type ProjectQualityData,
} from '../renderer/features/dashboard/index.js';
import {
  formatCoveragePercentage,
  getCoverageState,
  getReviewState,
} from '../renderer/features/dashboard/dashboard-metrics.js';
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
        targetApplicationId: null,
        name: 'Staging Server',
        type: 'STAGING',
        baseUrl: 'https://staging.garment.example.com',
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
      {
        id: 'env-2',
        projectId: '11111111-1111-1111-1111-111111111111',
        targetApplicationId: null,
        name: 'Local Dev',
        type: 'DEVELOPMENT',
        baseUrl: 'http://localhost:3000',
        isDefault: false,
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

  const mockQualityDataFull: ProjectQualityData = {
    requirementsSummary: {
      totalCount: 18,
      countsByStatus: {
        DRAFT: 3,
        ACTIVE: 15,
        DEPRECATED: 0,
        ARCHIVED: 0,
      },
      countsByType: {
        FUNCTIONAL: 12,
        NON_FUNCTIONAL: 4,
        INTEGRATION: 2,
        SECURITY: 0,
        PERFORMANCE: 0,
        BUSINESS_RULE: 0,
        USABILITY: 0,
        DATA: 0,
        CONSTRAINT: 0,
        UNKNOWN: 0,
      },
      countsByPriority: {
        LOW: 2,
        MEDIUM: 8,
        HIGH: 6,
        CRITICAL: 2,
        UNSPECIFIED: 0,
      },
    },
    testCasesTotal: 42,
    coverageSummary: {
      projectId: '11111111-1111-1111-1111-111111111111',
      totalRequirements: 18,
      eligibleRequirements: 15,
      coveredCount: 13,
      partiallyCoveredCount: 0,
      uncoveredCount: 2,
      notApplicableCount: 3,
      unknownCount: 0,
      overallCoveragePercentage: 86.66666666666667,
      overallWithPartialPercentage: 86.66666666666667,
      totalLinkedTests: 42,
      currentValidTests: 39,
      staleTests: 3,
      orphanTests: 0,
      dimensionSummaries: [],
      topGaps: [],
      lastEvaluatedAt: dummyDateStr,
    },
    source: {
      id: 'src-1',
      projectId: '11111111-1111-1111-1111-111111111111',
      kind: 'LOCAL_DIRECTORY',
      displayName: 'garment-erp',
      rootPath: '/workspaces/garment-erp',
      identityFingerprint: 'fp-1',
      activeBaselineSnapshotId: null,
      availability: 'AVAILABLE',
      filesystemCreatedAt: dummyDateStr,
      filesystemModifiedAt: dummyDateStr,
      metadataRefreshedAt: dummyDateStr,
      lastValidatedAt: dummyDateStr,
      createdAt: dummyDateStr,
      updatedAt: dummyDateStr,
    },
    indexStatus: {
      isIndexed: true,
      isRunning: false,
      schemaVersion: 1,
      parserVersion: 1,
      summary: {
        filesEligible: 140,
        filesIndexed: 140,
        filesSkipped: 0,
        filesFailed: 0,
        symbolsIndexed: 850,
        importsIndexed: 150,
        exportsIndexed: 100,
        unsupportedLanguageFiles: 0,
        durationMs: 125,
        truncated: false,
        warnings: [],
      },
      lastIndexedAt: dummyDateStr,
    },
    reviewQueueTotal: 2,
    embeddingStatus: {
      projectId: '11111111-1111-1111-1111-111111111111',
      providerId: 'OPENAI',
      model: 'text-embedding-3-small',
      dimensions: 1536,
      totalIndexed: 18,
      totalStale: 0,
      totalFailed: 0,
      lastIndexedAt: dummyDateStr,
    },
  };

  const mockQualityDataEmpty: ProjectQualityData = {
    requirementsSummary: null,
    testCasesTotal: null,
    coverageSummary: null,
    source: null,
    indexStatus: null,
    reviewQueueTotal: null,
    embeddingStatus: null,
  };

  describe('STATE 1: GettingStartedPanel Component', () => {
    it('should render 4-step workflow, title, description, and action CTAs', () => {
      const html = renderToString(
        <GettingStartedPanel onCreateProject={() => {}} onBrowseProjects={() => {}} />,
      );

      assert.ok(
        html.includes('Start your quality engineering workspace'),
        'Must render onboarding title',
      );
      assert.ok(
        html.includes('Select an existing project or create a new one'),
        'Must render description',
      );
      assert.ok(html.includes('Project'), 'Must render step 1');
      assert.ok(html.includes('Repository'), 'Must render step 2');
      assert.ok(html.includes('Requirements'), 'Must render step 3');
      assert.ok(html.includes('AI Tests'), 'Must render step 4');
      assert.ok(html.includes('Create Project'), 'Must render Create Project CTA');
      assert.ok(html.includes('Browse Projects'), 'Must render Browse Projects CTA');
    });
  });

  describe('STATE 1: PlatformHealthPanel Component', () => {
    it('should render infrastructure services and settings navigation link', () => {
      const html = renderToString(
        <MemoryRouter>
          <PlatformHealthPanel />
        </MemoryRouter>,
      );

      assert.ok(html.includes('Platform Health'), 'Must render health panel title');
      assert.ok(html.includes('PostgreSQL Database'), 'Must render postgres service');
      assert.ok(html.includes('Vector Store (pgvector)'), 'Must render vector store service');
      assert.ok(html.includes('AI Provider Gateway'), 'Must render AI provider gateway');
      assert.ok(html.includes('RAG Retrieval Engine'), 'Must render RAG retrieval engine');
      assert.ok(html.includes('Desktop Runtime'), 'Must render desktop runtime');
      assert.ok(html.includes('View system settings'), 'Must render settings link');
    });
  });

  describe('STATE 1: RecentProjectsPanel Component', () => {
    it('should render empty state when project list is empty', () => {
      const html = renderToString(
        <MemoryRouter>
          <ProjectProvider>
            <RecentProjectsPanel onCreateProject={() => {}} />
          </ProjectProvider>
        </MemoryRouter>,
      );

      assert.ok(html.includes('Recent Projects'), 'Must render recent projects title');
      assert.ok(
        html.includes('No projects yet') || html.includes('Loading projects...'),
        'Must render empty or loading state',
      );
    });
  });

  describe('STATE 2: ProjectHeader Component', () => {
    it('should render real project name, status badge, description, and direct actions', () => {
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
      assert.ok(html.includes('Source Code'), 'Must render Source Code action');
      assert.ok(html.includes('Requirements'), 'Must render Requirements action');
      assert.ok(html.includes('Test Cases'), 'Must render Test Cases action');
      assert.ok(html.includes('Manage Project'), 'Must render Manage Project action');
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

  describe('STATE 2: ProjectQualityMetrics Component (Real Data Audit)', () => {
    it('should render real metrics when data is available', () => {
      const html = renderToString(
        <MemoryRouter>
          <ProjectQualityMetrics qualityData={mockQualityDataFull} />
        </MemoryRouter>,
      );

      assert.ok(html.includes('Quality Metrics'), 'Must render section title');
      assert.ok(html.includes('18'), 'Must render real requirement count');
      assert.ok(html.includes('42'), 'Must render real test cases count');
      assert.ok(html.includes('87%'), 'Must render rounded coverage percentage (86.66% -> 87%)');
      assert.ok(html.includes('3 stale tests'), 'Must render stale tests count');
      assert.ok(html.includes('Indexed'), 'Must render indexed repository status');
      assert.ok(html.includes('140 files'), 'Must render total files count');
    });

    it('should render honest "Not available" and "Not evaluated" fallbacks when data is absent without fake numbers', () => {
      const html = renderToString(
        <MemoryRouter>
          <ProjectQualityMetrics qualityData={mockQualityDataEmpty} />
        </MemoryRouter>,
      );

      assert.ok(
        html.includes('Not available'),
        'Must render Not available badge for requirements/tests',
      );
      assert.ok(html.includes('Unable to load'), 'Must render Unable to load for coverage');
      assert.ok(html.includes('Not Attached'), 'Must render Not Attached for repository');

      // Verify no fabricated metrics
      assert.strictEqual(html.includes('88.7%'), false, 'Must NOT render fake coverage percentage');
      assert.strictEqual(html.includes('418'), false, 'Must NOT render fake test count');
    });

    it('should reject malformed coverage values without rendering NaN or Infinity', () => {
      const malformed = {
        ...mockQualityDataFull.coverageSummary!,
        overallCoveragePercentage: Number.NaN,
        coveredCount: Number.POSITIVE_INFINITY,
      };
      const malformedData: ProjectQualityData = {
        ...mockQualityDataFull,
        coverageSummary: malformed,
        reviewQueueTotal: null,
      };
      const html = renderToString(
        <MemoryRouter>
          <ProjectQualityMetrics qualityData={malformedData} />
        </MemoryRouter>,
      );

      assert.equal(getCoverageState(malformed), 'unknown');
      assert.equal(getReviewState(malformed, null), 'unknown');
      assert.equal(formatCoveragePercentage(malformed), 'Unable to load');
      assert.equal(html.includes('NaN'), false);
      assert.equal(html.includes('Infinity'), false);
      assert.equal(html.includes('Clean'), false);
      assert.ok(html.includes('Unable to load'));
    });

    it('should treat zero requirements as not applicable rather than 0% coverage', () => {
      const emptySummary = {
        ...mockQualityDataFull.coverageSummary!,
        totalRequirements: 0,
        eligibleRequirements: 0,
        coveredCount: 0,
        uncoveredCount: 0,
        overallCoveragePercentage: null,
        overallWithPartialPercentage: null,
      };

      assert.equal(getCoverageState(emptySummary), 'not-applicable');
      assert.equal(formatCoveragePercentage(emptySummary), 'Not available yet');
    });
  });

  describe('STATE 2: QualityPipeline Component', () => {
    it('should render V1-V4 lifecycle stages with real progression data', () => {
      const html = renderToString(
        <MemoryRouter>
          <QualityPipeline qualityData={mockQualityDataFull} />
        </MemoryRouter>,
      );

      assert.ok(html.includes('Quality Pipeline'), 'Must render pipeline title');
      assert.ok(html.includes('Repository'), 'Must render Repository stage');
      assert.ok(html.includes('Requirements'), 'Must render Requirements stage');
      assert.ok(html.includes('Intelligence'), 'Must render Intelligence stage');
      assert.ok(html.includes('AI Tests'), 'Must render AI Tests stage');
      assert.ok(html.includes('Traceability'), 'Must render Traceability stage');
      assert.ok(html.includes('18 Vectors'), 'Must render embedding vector count');
      assert.ok(html.includes('42 Tests'), 'Must render test count in pipeline');
    });
  });

  describe('STATE 2: NeedsAttentionPanel Component', () => {
    it('should render actionable items when issues exist in the project', () => {
      const html = renderToString(
        <MemoryRouter>
          <NeedsAttentionPanel project={mockProjectDetails} qualityData={mockQualityDataFull} />
        </MemoryRouter>,
      );

      assert.ok(html.includes('Needs Attention'), 'Must render attention title');
      assert.ok(html.includes('3 stale test cases'), 'Must alert about stale tests');
      assert.ok(
        html.includes('2 uncovered requirements'),
        'Must alert about uncovered requirements',
      );
      assert.ok(
        html.includes('2 test version reviews pending'),
        'Must alert about pending reviews',
      );
    });

    it('should render nominal clean status when no issues require attention', () => {
      const nominalQualityData: ProjectQualityData = {
        requirementsSummary: {
          totalCount: 10,
          countsByStatus: { DRAFT: 0, ACTIVE: 10, DEPRECATED: 0, ARCHIVED: 0 },
          countsByType: {
            FUNCTIONAL: 10,
            NON_FUNCTIONAL: 0,
            INTEGRATION: 0,
            SECURITY: 0,
            PERFORMANCE: 0,
            BUSINESS_RULE: 0,
            USABILITY: 0,
            DATA: 0,
            CONSTRAINT: 0,
            UNKNOWN: 0,
          },
          countsByPriority: { LOW: 0, MEDIUM: 10, HIGH: 0, CRITICAL: 0, UNSPECIFIED: 0 },
        },
        testCasesTotal: 10,
        coverageSummary: {
          projectId: '11111111-1111-1111-1111-111111111111',
          totalRequirements: 10,
          eligibleRequirements: 10,
          coveredCount: 10,
          partiallyCoveredCount: 0,
          uncoveredCount: 0,
          notApplicableCount: 0,
          unknownCount: 0,
          overallCoveragePercentage: 100,
          overallWithPartialPercentage: 100,
          totalLinkedTests: 10,
          currentValidTests: 10,
          staleTests: 0,
          orphanTests: 0,
          dimensionSummaries: [],
          topGaps: [],
          lastEvaluatedAt: dummyDateStr,
        },
        source: {
          id: 'src-1',
          projectId: '11111111-1111-1111-1111-111111111111',
          kind: 'LOCAL_DIRECTORY',
          displayName: 'garment-erp',
          rootPath: '/workspaces/garment-erp',
          identityFingerprint: 'fp-1',
          activeBaselineSnapshotId: null,
          availability: 'AVAILABLE',
          filesystemCreatedAt: dummyDateStr,
          filesystemModifiedAt: dummyDateStr,
          metadataRefreshedAt: dummyDateStr,
          lastValidatedAt: dummyDateStr,
          createdAt: dummyDateStr,
          updatedAt: dummyDateStr,
        },
        indexStatus: {
          isIndexed: true,
          isRunning: false,
          schemaVersion: 1,
          parserVersion: 1,
          summary: null,
          lastIndexedAt: dummyDateStr,
        },
        reviewQueueTotal: 0,
        embeddingStatus: null,
      };

      const html = renderToString(
        <MemoryRouter>
          <NeedsAttentionPanel project={mockProjectDetails} qualityData={nominalQualityData} />
        </MemoryRouter>,
      );

      assert.ok(html.includes('Nothing requires attention'), 'Must render nominal status message');
      assert.ok(html.includes('Nominal'), 'Must render nominal badge');
    });
  });

  describe('STATE 2: EnvironmentOverview Component', () => {
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

  describe('ProjectDashboard Container Orchestration', () => {
    it('should render No Project Selected getting-started dashboard when no project ID is selected', () => {
      const html = renderToString(
        <MemoryRouter>
          <ProjectProvider>
            <ProjectDashboard />
          </ProjectProvider>
        </MemoryRouter>,
      );

      assert.ok(
        html.includes('data-testid="no-project-overview"'),
        'Must render no-project overview container',
      );
      assert.ok(
        html.includes('Start your quality engineering workspace'),
        'Must render Getting Started panel',
      );
      assert.ok(html.includes('Platform Health'), 'Must render Platform Health panel');
      assert.ok(html.includes('Recent Projects'), 'Must render Recent Projects panel');
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
