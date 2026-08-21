/**
 * @file apps/desktop/src/main/ipc/requirement-quality-handlers.test.ts
 * Unit tests for requirement quality analysis IPC handlers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleAnalyzeQuality,
  handleGetQualityAnalysis,
  handleReviewQualityFinding,
  handleReanalyzeQuality,
  handleBatchAnalyzeQuality,
} from './requirement-quality-handlers.js';
import type { RequirementQualityService } from '@ai-quality/core';
import type {
  RequirementQualityAnalysisDto,
  RequirementQualityFindingDto,
  BatchAnalyzeQualityResultDto,
} from '@ai-quality/contracts';

describe('Requirement Quality IPC Handlers Unit Tests', () => {
  const projectId = '11111111-1111-1111-1111-111111111111';
  const requirementId = '22222222-2222-2222-2222-222222222222';
  const findingId = '33333333-3333-3333-3333-333333333333';

  const mockFinding: RequirementQualityFindingDto = {
    id: findingId,
    analysisId: '44444444-4444-4444-4444-444444444444',
    projectId,
    requirementId,
    code: 'UNDEFINED_TIME_CONSTRAINT',
    category: 'MEASURABILITY',
    severity: 'ERROR',
    message: "The timing term 'quickly' is subjective.",
    evidenceText: 'quickly',
    startOffset: 20,
    endOffset: 27,
    suggestedClarification: 'What is the maximum acceptable response time?',
    reviewStatus: 'OPEN',
    reviewRationale: null,
    clarificationResponse: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockAnalysis: RequirementQualityAnalysisDto = {
    id: '44444444-4444-4444-4444-444444444444',
    projectId,
    requirementId,
    requirementKey: 'REQ-001',
    originalRequirementText: 'The system shall respond quickly.',
    sourceRequirementTextSha256: 'a'.repeat(64),
    analyzerVersion: 'requirement-quality-analyzer-v1',
    testabilityStatus: 'PARTIALLY_TESTABLE',
    qualityScore: 75,
    analysisMethod: 'DETERMINISTIC',
    findingsCount: 1,
    openFindingsCount: 1,
    clarificationQuestions: ['What is the maximum acceptable response time?'],
    findings: [mockFinding],
    isStale: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('handles analyze quality successfully', async () => {
    const mockService = {
      analyzeQuality: async (pId: string, rId: string) => {
        assert.equal(pId, projectId);
        assert.equal(rId, requirementId);
        return mockAnalysis;
      },
    } as unknown as RequirementQualityService;

    const result = await handleAnalyzeQuality({ projectId, requirementId }, mockService);

    assert.deepEqual(result, mockAnalysis);
  });

  it('rejects invalid payload on analyze quality', async () => {
    const mockService = {} as RequirementQualityService;

    await assert.rejects(
      async () => {
        await handleAnalyzeQuality({ projectId: 'not-a-uuid', requirementId }, mockService);
      },
      (err: unknown) => {
        assert.equal((err as Error).name, 'ZodError');
        return true;
      },
    );
  });

  it('handles get quality analysis successfully', async () => {
    const mockService = {
      getQualityAnalysis: async (pId: string, rId: string) => {
        assert.equal(pId, projectId);
        assert.equal(rId, requirementId);
        return mockAnalysis;
      },
    } as unknown as RequirementQualityService;

    const result = await handleGetQualityAnalysis({ projectId, requirementId }, mockService);

    assert.deepEqual(result, mockAnalysis);
  });

  it('handles review quality finding successfully', async () => {
    const mockService = {
      reviewQualityFinding: async (input: {
        projectId: string;
        requirementId: string;
        findingId: string;
        reviewStatus: string;
      }) => {
        assert.equal(input.projectId, projectId);
        assert.equal(input.requirementId, requirementId);
        assert.equal(input.findingId, findingId);
        assert.equal(input.reviewStatus, 'DISMISSED');
        return { ...mockFinding, reviewStatus: 'DISMISSED' };
      },
    } as unknown as RequirementQualityService;

    const result = await handleReviewQualityFinding(
      {
        projectId,
        requirementId,
        findingId,
        reviewStatus: 'DISMISSED',
        reviewRationale: 'Acceptable',
      },
      mockService,
    );

    assert.equal(result.reviewStatus, 'DISMISSED');
  });

  it('handles reanalyze quality successfully', async () => {
    const mockService = {
      reanalyzeQuality: async (pId: string, rId: string) => {
        assert.equal(pId, projectId);
        assert.equal(rId, requirementId);
        return mockAnalysis;
      },
    } as unknown as RequirementQualityService;

    const result = await handleReanalyzeQuality({ projectId, requirementId }, mockService);

    assert.deepEqual(result, mockAnalysis);
  });

  it('handles batch analyze quality successfully', async () => {
    const mockBatchResult: BatchAnalyzeQualityResultDto = {
      analyzedCount: 1,
      failedCount: 0,
      results: [
        {
          requirementId,
          requirementKey: 'REQ-001',
          success: true,
          analysis: mockAnalysis,
        },
      ],
    };

    const mockService = {
      batchAnalyzeQuality: async (pId: string, rIds: readonly string[]) => {
        assert.equal(pId, projectId);
        assert.deepEqual(rIds, [requirementId]);
        return mockBatchResult;
      },
    } as unknown as RequirementQualityService;

    const result = await handleBatchAnalyzeQuality(
      {
        projectId,
        requirementIds: [requirementId],
      },
      mockService,
    );

    assert.deepEqual(result, mockBatchResult);
  });
});
