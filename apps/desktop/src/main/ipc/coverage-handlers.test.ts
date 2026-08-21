/**
 * @file apps/desktop/src/main/ipc/coverage-handlers.test.ts
 * Unit tests for Coverage Analysis IPC handlers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import type {
  ProjectCoverageSummaryDto,
  RequirementCoverageDetailDto,
  ReverseTraceabilityResultDto,
  TraceabilityMatrixResultDto,
  OrphanTestsResultDto,
} from '@ai-quality/contracts';
import {
  handleGetOrphanTests,
  handleGetProjectCoverageSummary,
  handleGetRequirementCoverage,
  handleGetReverseTraceability,
  handleGetTraceabilityMatrix,
  setCoverageServiceForTesting,
} from './coverage-handlers.js';
import type { CoverageAnalysisService } from '@ai-quality/core';
import { CoverageProjectMismatchError } from '@ai-quality/core';

const fakeEvent = {} as IpcMainInvokeEvent;

const sampleSummary: ProjectCoverageSummaryDto = {
  projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  totalRequirements: 10,
  eligibleRequirements: 10,
  coveredCount: 8,
  partiallyCoveredCount: 1,
  uncoveredCount: 1,
  notApplicableCount: 0,
  unknownCount: 0,
  overallCoveragePercentage: 80,
  overallWithPartialPercentage: 85,
  totalLinkedTests: 15,
  currentValidTests: 14,
  staleTests: 1,
  orphanTests: 0,
  dimensionSummaries: [
    { dimension: 'POSITIVE', requiredCount: 10, coveredCount: 9, percentage: 90 },
    { dimension: 'NEGATIVE', requiredCount: 5, coveredCount: 4, percentage: 80 },
  ],
  topGaps: [],
  lastEvaluatedAt: new Date().toISOString(),
};

const sampleDetail: RequirementCoverageDetailDto = {
  requirementId: '11111111-2222-3333-4444-555555555555',
  requirementKey: 'REQ-001',
  requirementTitle: 'Authentication',
  requirementVersionNumber: 1,
  currentRequirementVersionNumber: 1,
  lifecycleStatus: 'ACTIVE',
  testability: 'TESTABLE',
  coverageStatus: 'COVERED',
  coveragePercentage: 100,
  requiredDimensions: ['POSITIVE', 'NEGATIVE'],
  coveredDimensions: ['POSITIVE', 'NEGATIVE'],
  missingDimensions: [],
  totalLinkedTests: 2,
  eligibleLinkedTests: 2,
  staleLinkedTests: 0,
  rejectedLinkedTests: 0,
  reasonCodes: ['All required dimensions covered.'],
  linkedTestSummaries: [],
  lastEvaluatedAt: new Date().toISOString(),
};

describe('Coverage IPC Handlers', () => {
  it('returns validation error for invalid project payload', async () => {
    const res = await handleGetProjectCoverageSummary(fakeEvent, { projectId: 'invalid-uuid' });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'COVERAGE_VALIDATION_FAILED');
    }
  });

  it('delegates getProjectCoverageSummary successfully', async () => {
    const mockService = {
      getProjectCoverageSummary: async () => sampleSummary,
    } as unknown as CoverageAnalysisService;
    setCoverageServiceForTesting(mockService);

    const res = await handleGetProjectCoverageSummary(fakeEvent, {
      projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.overallCoveragePercentage, 80);
    }
  });

  it('maps CoverageProjectMismatchError to COVERAGE_PROJECT_MISMATCH', async () => {
    const mockService = {
      getProjectCoverageSummary: async () => {
        throw new CoverageProjectMismatchError('Project not found');
      },
    } as unknown as CoverageAnalysisService;
    setCoverageServiceForTesting(mockService);

    const res = await handleGetProjectCoverageSummary(fakeEvent, {
      projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'COVERAGE_PROJECT_MISMATCH');
    }
  });

  it('handles getRequirementCoverage, getTraceabilityMatrix, getReverseTraceability, and getOrphanTests', async () => {
    const matrixRes: TraceabilityMatrixResultDto = {
      rows: [],
      total: 0,
      page: 1,
      pageSize: 20,
      summary: sampleSummary,
    };
    const reverseRes: ReverseTraceabilityResultDto = {
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalOrphans: 0,
    };
    const orphanRes: OrphanTestsResultDto = {
      orphanTestCases: [],
      total: 0,
    };

    const mockService = {
      getRequirementCoverage: async () => sampleDetail,
      getTraceabilityMatrix: async () => matrixRes,
      getReverseTraceability: async () => reverseRes,
      getOrphanTests: async () => orphanRes,
    } as unknown as CoverageAnalysisService;
    setCoverageServiceForTesting(mockService);

    const reqRes = await handleGetRequirementCoverage(fakeEvent, {
      projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      requirementId: '11111111-2222-3333-4444-555555555555',
    });
    assert.equal(reqRes.ok, true);

    const matRes = await handleGetTraceabilityMatrix(fakeEvent, {
      projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    });
    assert.equal(matRes.ok, true);

    const revRes = await handleGetReverseTraceability(fakeEvent, {
      projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    });
    assert.equal(revRes.ok, true);

    const orphRes = await handleGetOrphanTests(fakeEvent, {
      projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    });
    assert.equal(orphRes.ok, true);
  });
});
