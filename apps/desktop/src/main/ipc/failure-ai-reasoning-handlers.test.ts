/**
 * @file apps/desktop/src/main/ipc/failure-ai-reasoning-handlers.test.ts
 * Unit and security tests for AI-Assisted Failure Classification IPC handlers (V6 Phase 82).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleAssessFailureWithAi,
  handleGetFailureAiAssessment,
  handleReassessFailureWithAi,
  handleListFailureAiAssessmentHistory,
  setSharedFailureAiReasoningService,
} from './failure-handlers.js';
import type { FailureAiReasoningService } from '@ai-quality/core';
import type { FailureAiAssessmentDto } from '@ai-quality/contracts';

describe('AI-Assisted Failure Classification IPC Handlers (V6 Phase 82)', () => {
  function createMockEvent(isMainFrame = true): IpcMainInvokeEvent {
    return {
      senderFrame: {
        parent: isMainFrame ? null : ({} as any),
        url: isMainFrame ? 'app://renderer/index.html' : 'https://malicious-site.com',
      },
    } as unknown as IpcMainInvokeEvent;
  }

  const trustedEvent = createMockEvent(true);
  const untrustedEvent = createMockEvent(false);

  const testProjectId = crypto.randomUUID();
  const testFailureCaseId = crypto.randomUUID();
  const testTestCaseId = crypto.randomUUID();

  const mockAssessmentDto: FailureAiAssessmentDto = {
    id: crypto.randomUUID(),
    projectId: testProjectId,
    failureCaseId: testFailureCaseId,
    testCaseId: testTestCaseId,
    testCaseVersionNumber: 1,
    failureAnalysisRunId: null,
    deterministicClassificationId: null,
    technicalLocalizationId: null,
    domainSeparationId: null,

    aiCategory: 'APPLICATION_FAILURE',
    aiSubcategory: 'HTTP_ERROR_RESPONSE',
    agreementState: 'AGREES',
    confidenceLevel: 'HIGH',
    confidenceScore: 0.89,
    confidenceBasis: ['Complete evidence factor: 85%'],

    primaryReasoning: 'Application returned HTTP 500 on valid input payload.',
    humanExplanation: 'A defect in the backend application crashed the request handler.',
    supportingEvidence: [
      {
        id: 'ev-ipc-1',
        fact: 'HTTP 500 status returned from API',
        significance: 'CRITICAL',
        evidenceType: 'NETWORK_LOG',
      },
    ],
    contradictingEvidence: [],
    alternativeHypotheses: [],
    uncertainties: [],

    modelProvider: 'fake',
    modelName: 'mock-classifier-v1',
    promptVersion: '1.0.0',
    schemaVersion: '1.0.0',
    assessmentFingerprint: 'a'.repeat(64),

    isAuthoritative: true,
    isStale: false,
    stalenessReason: null,
    reanalysisCount: 0,
    lastReanalyzedAt: null,
    reanalysisReason: null,
    supersededById: null,

    assessedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  let mockService: FailureAiReasoningService;

  beforeEach(() => {
    mockService = {
      assessFailureWithAi: async () => mockAssessmentDto,
      getAiAssessment: async () => mockAssessmentDto,
      reassessFailureWithAi: async () => ({
        ...mockAssessmentDto,
        id: crypto.randomUUID(),
        reanalysisCount: 1,
        reanalysisReason: 'Retest requested',
      }),
      listAiAssessmentHistory: async () => [mockAssessmentDto],
    } as unknown as FailureAiReasoningService;

    setSharedFailureAiReasoningService(mockService);
  });

  describe('Security & Sender Validation', () => {
    it('rejects untrusted sender on handleAssessFailureWithAi', async () => {
      const result = await handleAssessFailureWithAi(untrustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });

      assert.equal(result.ok, false);
      assert.equal(result.error?.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects untrusted sender on handleGetFailureAiAssessment', async () => {
      const result = await handleGetFailureAiAssessment(untrustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });

      assert.equal(result.ok, false);
      assert.equal(result.error?.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects untrusted sender on handleReassessFailureWithAi', async () => {
      const result = await handleReassessFailureWithAi(untrustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
        reanalysisReason: 'Valid reason',
      });

      assert.equal(result.ok, false);
      assert.equal(result.error?.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects untrusted sender on handleListFailureAiAssessmentHistory', async () => {
      const result = await handleListFailureAiAssessmentHistory(untrustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });

      assert.equal(result.ok, false);
      assert.equal(result.error?.code, 'UNAUTHORIZED_SENDER');
    });
  });

  describe('Schema Validation', () => {
    it('rejects invalid payload without projectId', async () => {
      const result = await handleAssessFailureWithAi(trustedEvent, {
        failureCaseId: testFailureCaseId,
      });

      assert.equal(result.ok, false);
      assert.equal(result.error?.code, 'VALIDATION_ERROR');
    });

    it('rejects reassessment when reanalysisReason is missing or empty', async () => {
      const result = await handleReassessFailureWithAi(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
        reanalysisReason: '', // Empty reason!
      });

      assert.equal(result.ok, false);
      assert.equal(result.error?.code, 'VALIDATION_ERROR');
    });
  });

  describe('Successful Invocation', () => {
    it('invokes assessFailureWithAi and returns structured result', async () => {
      const result = await handleAssessFailureWithAi(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });

      assert.equal(result.ok, true);
      assert.equal(result.data?.id, mockAssessmentDto.id);
      assert.equal(result.data?.aiCategory, 'APPLICATION_FAILURE');
      assert.equal(result.data?.agreementState, 'AGREES');
    });

    it('invokes getAiAssessment and returns DTO', async () => {
      const result = await handleGetFailureAiAssessment(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });

      assert.equal(result.ok, true);
      assert.equal(result.data?.id, mockAssessmentDto.id);
    });

    it('invokes reassessFailureWithAi with audit reason and returns updated DTO', async () => {
      const result = await handleReassessFailureWithAi(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
        reanalysisReason: 'Retest after bugfix',
      });

      assert.equal(result.ok, true);
      assert.equal(result.data?.reanalysisCount, 1);
      assert.equal(result.data?.reanalysisReason, 'Retest requested');
    });

    it('invokes listAiAssessmentHistory and returns history array', async () => {
      const result = await handleListFailureAiAssessmentHistory(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });

      assert.equal(result.ok, true);
      assert.equal(result.data?.length, 1);
    });
  });
});
