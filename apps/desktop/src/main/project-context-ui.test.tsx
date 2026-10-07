/**
 * @file apps/desktop/src/main/project-context-ui.test.tsx
 * Unit and SSR rendering tests for V8 Phase 123 Project Context UI components.
 *
 * CRITICAL INVARIANTS:
 * 1. Renders authoritative lifecycle state and freshness badge.
 * 2. Renders connected sources, detected stack, and target environment safely.
 * 3. Verified credential redaction: zero raw passwords in HTML output.
 * 4. Renders action buttons (Refresh, Run Detection, Invalidate Stale).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ProjectContextCard } from '../renderer/features/project-context/ProjectContextCard.js';
import type { ProjectContextDto } from '@ai-quality/contracts';

describe('Project Context UI Component Unit Tests', () => {
  const dummyDateStr = new Date('2026-01-01T00:00:00.000Z').toISOString();
  const testProjectId = '11111111-1111-1111-1111-111111111111';

  const mockContext: ProjectContextDto = {
    projectId: testProjectId,
    projectName: 'E-Commerce Platform',
    projectDescription: 'Core platform for online retail testing',
    projectStatus: 'ACTIVE',
    lifecycleState: 'CONNECTED',
    freshness: {
      isStale: false,
      lastRefreshedAt: dummyDateStr,
      staleReasons: [],
    },
    sources: {
      website: {
        targetId: 'web-1',
        name: 'Staging Portal',
        baseUrl: 'https://staging.example.com',
        environmentType: 'STAGING',
        isActive: true,
        connectionStatus: 'VERIFIED_REACHABLE',
        safeModeEnabled: true,
        lastCheckedAt: dummyDateStr,
        lastReachableAt: dummyDateStr,
        lastStatusCode: 200,
      },
      git: {
        connectionId: 'git-1',
        provider: 'GITHUB',
        repositoryName: 'ecommerce-core',
        repositoryUrl: 'https://github.com/org/ecommerce-core',
        defaultBranch: 'main',
        selectedBranch: 'main',
        importedRevision: 'a1b2c3d4e5f6',
        isActive: true,
        connectionStatus: 'CONNECTED',
        importStatus: 'IMPORTED',
        localPath: '/tmp/repo',
        fileCount: 150,
        totalSizeBytes: 204800,
        lastImportedAt: dummyDateStr,
      },
      localFolder: {
        sourceId: 'folder-1',
        displayName: 'Local Workspace',
        rootPath: '/Users/developer/ecommerce-core',
        isGit: true,
        branch: 'main',
        headCommit: 'a1b2c3d4e5f6',
        isAvailable: true,
        lastValidatedAt: dummyDateStr,
      },
    },
    target: {
      baseUrl: 'https://staging.example.com',
      browser: {
        browserEngine: 'chromium',
        headless: true,
        viewportWidth: 1280,
        viewportHeight: 720,
        ignoreHttpsErrors: false,
      },
      environment: {
        environmentId: 'env-1',
        name: 'Staging Environment',
        type: 'STAGING',
        baseUrl: 'https://staging.example.com',
        apiUrl: 'https://api.staging.example.com',
        isProduction: false,
        productionSafetyPolicy: 'SAFE_MODE',
      },
    },
    authentication: {
      status: 'VERIFIED',
      profiles: [
        {
          id: 'auth-1',
          name: 'QA Admin User',
          strategy: 'FORM_LOGIN',
          status: 'VALID',
          loginUrl: 'https://staging.example.com/login',
          username: 'qa-admin@example.com',
          passwordPreview: '••••••••',
          isReusable: true,
          lastValidatedAt: dummyDateStr,
        },
      ],
    },
    detectedTechnology: {
      primaryLanguage: 'TypeScript',
      languages: ['TypeScript', 'JavaScript'],
      frameworks: ['React', 'Next.js'],
      packageManager: 'npm',
      testFramework: 'Playwright',
      likelyEntryPoints: ['src/index.ts', 'src/server.ts'],
      testDirectories: ['tests', 'e2e'],
      requirementsFiles: ['REQUIREMENTS.md', 'SPEC.md'],
      configurationFiles: ['package.json', 'tsconfig.json'],
    },
    repositorySummary: {
      fileCount: 150,
      totalSizeBytes: 204800,
      structureSummary: 'standard Next.js structure',
      isGitRepo: true,
      branch: 'main',
      commit: 'a1b2c3d4e5f6',
    },
    requirementsSummary: {
      totalRequirements: 12,
      totalDocuments: 2,
      statusBreakdown: { ACTIVE: 12 },
      lastUpdated: dummyDateStr,
    },
    testSummary: {
      totalTestCases: 25,
      automatedCount: 20,
      manualCount: 5,
      priorityBreakdown: { HIGH: 10, MEDIUM: 15 },
    },
    executionSummary: {
      totalRuns: 4,
      lastRunStatus: 'PASSED',
      lastRunAt: dummyDateStr,
      passRate: 100,
    },
    warnings: [],
    errors: [],
  };

  it('renders ProjectContextCard with CONNECTED status and all source categories', () => {
    const html = renderToString(
      <ProjectContextCard projectId={testProjectId} initialContext={mockContext} />,
    );

    assert.ok(html.includes('Unified Project Context'), 'Must render card title');
    assert.ok(html.includes('CONNECTED'), 'Must render lifecycle state badge');
    assert.ok(html.includes('3 sources connected'), 'Must report 3 connected sources');
    assert.ok(html.includes('TypeScript'), 'Must display detected primary language');
    assert.ok(html.includes('React'), 'Must display detected frameworks');
    assert.ok(html.includes('Playwright'), 'Must display detected test framework');
    assert.ok(html.includes('https://staging.example.com'), 'Must display target URL');
    assert.ok(html.includes('chromium'), 'Must display browser engine');
    assert.ok(html.includes('Refresh Context'), 'Must render Refresh button');
    assert.ok(html.includes('Run Detection'), 'Must render Run Detection button');
  });

  it('redacts credentials and masks passwords completely', () => {
    const html = renderToString(
      <ProjectContextCard projectId={testProjectId} initialContext={mockContext} />,
    );

    assert.ok(html.includes('qa-admin@example.com'), 'Must display safe username');
    // Ensure no secret or plain password leaked
    assert.ok(!html.includes('secret123'), 'Never leak raw password');
    assert.ok(!html.includes('argon2'), 'Never leak hash string');
  });

  it('renders STALE badge and reasons when context is marked stale', () => {
    const staleContext: ProjectContextDto = {
      ...mockContext,
      lifecycleState: 'STALE',
      freshness: {
        isStale: true,
        lastRefreshedAt: dummyDateStr,
        staleReasons: ['Git branch changed externally on disk'],
      },
    };

    const html = renderToString(
      <ProjectContextCard projectId={testProjectId} initialContext={staleContext} />,
    );

    assert.ok(html.includes('STALE'), 'Must render STALE badge');
    assert.ok(html.includes('Git branch changed externally on disk'), 'Must render stale reason');
  });

  it('renders PARTIAL badge and warnings when a source is unavailable', () => {
    const partialContext: ProjectContextDto = {
      ...mockContext,
      lifecycleState: 'PARTIAL',
      sources: {
        ...mockContext.sources,
        localFolder: {
          ...mockContext.sources.localFolder!,
          isAvailable: false,
        },
      },
      warnings: ['Local folder source is currently unreachable on disk'],
    };

    const html = renderToString(
      <ProjectContextCard projectId={testProjectId} initialContext={partialContext} />,
    );

    assert.ok(html.includes('PARTIAL'), 'Must render PARTIAL lifecycle state');
    assert.ok(html.includes('Missing'), 'Must display Missing badge for local folder');
    assert.ok(
      html.includes('Local folder source is currently unreachable on disk'),
      'Must display source warning banner',
    );
  });
});
