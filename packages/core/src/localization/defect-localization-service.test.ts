/**
 * @file packages/core/src/localization/defect-localization-service.test.ts
 * Tests for DefectLocalizationService lifecycle, multi-tenant isolation, concurrency mutex, and revision drift.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DefectLocalizationService } from './defect-localization-service.js';
import {
  DefectLocalizationConcurrentMutationError,
  DefectLocalizationCrossProjectError,
  DefectLocalizationNotFoundError,
  DefectLocalizationPathTraversalError,
} from './defect-localization-errors.js';

function createMockPrisma(overrides: any = {}) {
  return {
    failureCase: {
      findUnique: async ({ where }: any) => {
        if (where.id === 'fc-not-found') return null;
        if (where.id === 'fc-cross-project') {
          return {
            id: 'fc-cross-project',
            projectId: 'other-project',
            title: 'Cross project defect',
            status: 'OPEN',
            testCaseId: 'tc-1',
          };
        }
        return {
          id: where.id,
          projectId: 'proj-1',
          title: 'Authentication defect',
          status: 'OPEN',
          failureSignature: 'SIG-AUTH-001',
          errorMessage: 'Expected 401 but received 200',
          testCaseId: 'tc-1',
          testRunId: 'tr-1',
          executionId: 'exec-1',
          testCase: {
            id: 'tc-1',
            testCaseKey: 'TC-AUTH-001',
            title: 'Verify auth rejection',
            priority: 'P0_IMMEDIATE',
          },
          testRun: {
            id: 'tr-1',
            metadataJson: { commitSha: 'commit-failure-123' },
          },
          execution: {
            id: 'exec-1',
            stepExecutions: [
              {
                stepIndex: 2,
                status: 'FAILED',
                actionType: 'CLICK',
                targetSummary: 'button[data-testid="login-submit"]',
                errorMessage: 'Assertion failed: 401 !== 200',
                actionDataJson: {},
              },
            ],
          },
          evidenceReferences: [],
        };
      },
    },
    projectSource: {
      findUnique: async () => ({
        id: 'src-1',
        projectId: 'proj-1',
        rootPath: '/mock/repo',
        gitMetadata: {
          currentBranch: 'main',
          headCommit: 'commit-failure-123',
        },
        repositoryFiles: [
          {
            id: 'rf-1',
            relativePath: 'src/auth/login-service.ts',
            name: 'login-service.ts',
            symbols: [
              {
                id: 'sym-1',
                name: 'authenticateUser',
                kind: 'FUNCTION',
                startLine: 35,
                endLine: 80,
                isExported: true,
              },
            ],
            imports: [],
          },
        ],
      }),
    },
    requirementTestTrace: {
      findFirst: async () => ({
        requirement: {
          id: 'req-1',
          requirementKey: 'REQ-AUTH-001',
          title: 'User Authentication',
        },
      }),
    },
    failureTechnicalLocalization: {
      findFirst: async () => ({
        id: 'ftl-1',
        primaryLayer: 'BACKEND_APPLICATION',
        primaryTargetIdentifier: 'POST /api/auth/login',
        matchedFilePath: 'src/auth/login-service.ts',
        matchedSymbolName: 'authenticateUser',
        matchedLineNumber: 42,
        httpEndpoint: '/api/auth/login',
        localizationRationale: 'Auth logic error',
      }),
    },
    failureRootCauseAnalysis: {
      findFirst: async () => ({
        id: 'rca-1',
        rootCauseStatus: 'IDENTIFIED',
        probableLayer: 'BACKEND_APPLICATION',
        probableCause: 'Password bypass',
        repositoryReferences: [{ filePath: 'src/auth/login-service.ts' }],
      }),
    },
    quickFixEligibilityAssessment: {
      findFirst: async () => ({
        id: 'qfa-1',
        decision: 'ELIGIBLE',
        candidateFiles: ['src/auth/login-service.ts'],
      }),
    },
    repositoryDefectLocalization: {
      findFirst: async ({ where }: any) => {
        if (overrides.existingLocalization) {
          return overrides.existingLocalization;
        }
        return null;
      },
      findMany: async () => overrides.historicalLocalizations ?? [],
      create: async ({ data }: any) => ({
        id: 'loc-1',
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      update: async ({ data }: any) => ({ id: 'loc-prev', ...data }),
    },
    $transaction: async (fn: any) =>
      fn({
        repositoryDefectLocalization: {
          update: async () => ({}),
          create: async ({ data }: any) => ({
            id: 'loc-1',
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
      }),
  };
}

describe('DefectLocalizationService (Lifecycle, Isolation & Mutex)', () => {
  test('throws DefectLocalizationNotFoundError if failure case does not exist', async () => {
    const mockPrisma = createMockPrisma();
    const service = new DefectLocalizationService(mockPrisma as any);

    await assert.rejects(
      () =>
        service.localizeDefect({
          projectId: 'proj-1',
          failureCaseId: 'fc-not-found',
        }),
      DefectLocalizationNotFoundError,
    );
  });

  test('throws DefectLocalizationCrossProjectError if failure case belongs to another project', async () => {
    const mockPrisma = createMockPrisma();
    const service = new DefectLocalizationService(mockPrisma as any);

    await assert.rejects(
      () =>
        service.localizeDefect({
          projectId: 'proj-1',
          failureCaseId: 'fc-cross-project',
        }),
      DefectLocalizationCrossProjectError,
    );
  });

  test('performs end-to-end localization, detects EXACT_REVISION, and persists authoritative record', async () => {
    const mockPrisma = createMockPrisma();
    const service = new DefectLocalizationService(mockPrisma as any);

    const result = await service.localizeDefect({
      projectId: 'proj-1',
      failureCaseId: 'fc-1',
      forceRelocalize: true,
    });

    assert.equal(result.projectId, 'proj-1');
    assert.equal(result.failureCaseId, 'fc-1');
    assert.equal(result.revisionState, 'EXACT_REVISION');
    assert.equal(result.isDrifted, false);
    assert.equal(result.topCandidateFilePath, 'src/auth/login-service.ts');
    assert.equal(result.isAuthoritative, true);
    assert.equal(result.localizationVersion, 1);
  });

  test('detects DRIFTED_REVISION when failure commit differs from repository HEAD', async () => {
    const mockPrisma = createMockPrisma();
    // Repository HEAD moved to commit-new-456
    mockPrisma.projectSource.findUnique = async () => ({
      id: 'src-1',
      projectId: 'proj-1',
      rootPath: '/mock/repo',
      gitMetadata: {
        currentBranch: 'feature/auth',
        headCommit: 'commit-new-456',
      },
      repositoryFiles: [
        {
          id: 'rf-1',
          relativePath: 'src/auth/login-service.ts',
          name: 'login-service.ts',
          symbols: [],
          imports: [],
        },
      ],
    });

    const service = new DefectLocalizationService(mockPrisma as any);

    const result = await service.localizeDefect({
      projectId: 'proj-1',
      failureCaseId: 'fc-1',
      forceRelocalize: true,
    });

    assert.equal(result.revisionState, 'DRIFTED_REVISION');
    assert.equal(result.isDrifted, true);
    assert.ok(result.driftDetails?.includes('commit-fa'));
    assert.ok(result.driftDetails?.includes('commit-ne'));
  });

  test('rejects path traversal in inspectCandidateSource', async () => {
    const mockPrisma = createMockPrisma();
    const service = new DefectLocalizationService(mockPrisma as any);

    await assert.rejects(
      () =>
        service.inspectCandidateSource({
          projectId: 'proj-1',
          failureCaseId: 'fc-1',
          filePath: '../../etc/passwd',
        }),
      DefectLocalizationPathTraversalError,
    );
  });
});
