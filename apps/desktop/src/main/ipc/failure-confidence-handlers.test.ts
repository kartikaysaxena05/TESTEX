/**
 * @file apps/desktop/src/main/ipc/failure-confidence-handlers.test.ts
 * Unit and security tests for Confidence Assessment IPC handlers (V6 Phase 86).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleAssessConfidence,
  handleGetConfidence,
  handleReassessConfidence,
  handleListConfidenceHistory,
  handleListEvidenceAttributions,
  setSharedConfidenceAssessmentService,
} from './failure-handlers.js';
import type { ConfidenceAssessmentService } from '@ai-quality/core';
import type { ConfidenceAssessmentDto, EvidenceAttributionDto } from '@ai-quality/contracts';

describe('Confidence Assessment IPC Handlers (V6 Phase 86)', () => {
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
  const testAssessmentId = crypto.randomUUID();

  const mockAssessmentDto: ConfidenceAssessmentDto = {
    id: testAssessmentId,
    projectId: testProjectId,
    failureCaseId: testFailureCaseId,
    revision: 1,
    isAuthoritative: true,
    supersededById: null,
    supersedesId: null,
    overallConfidence: 0.885,
    confidenceBand: 'VERY_HIGH',
    classificationConfidence: 0.95,
    reproducibilityConfidence: 0.9,
    rootCauseConfidence: 0.85,
    severityConfidence: 0.8,
    duplicateConfidence: 0.95,
    componentBreakdown: [
      {
        component: 'EVIDENCE_INTEGRITY',
        score: 1.0,
        weight: 0.15,
        applicable: true,
        description: 'Verified SHA-256',
        supportingCount: 2,
        contradictingCount: 0,
        missingCount: 0,
      },
    ],
    supportingFactors: ['Deterministic rule match'],
    penalties: [],
    missingFactors: [],
    contradictions: [],
    deterministicFacts: ['Screenshot verified'],
    aiInferences: [],
    humanExplanation: '# Confidence Assessment\nOverall: 88.5%',
    confidenceFingerprint: 'a'.repeat(64),
    confidenceEngineVersion: '1.0.0',
    scoringPolicyVersion: '2026.1',
    explanationVersion: '1.0.0',
    isStale: false,
    stalenessReason: null,
    recalculationReason: null,
    assessedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    attributions: [],
  };

  const mockAttributionDto: EvidenceAttributionDto = {
    id: crypto.randomUUID(),
    confidenceAssessmentId: testAssessmentId,
    projectId: testProjectId,
    failureCaseId: testFailureCaseId,
    conclusionType: 'CLASSIFICATION',
    conclusionValue: 'APPLICATION_FAILURE',
    evidenceReferenceId: null,
    evidenceType: 'DETERMINISTIC_RULE',
    relationship: 'SUPPORTS',
    supportStrength: 'DECISIVE',
    sourceSubsystem: 'PHASE_77_CLASSIFICATION',
    reason: 'Rule matched application error',
    epistemicType: 'DETERMINISTIC_INFERENCE',
    canonicalEvidenceKey: 'classification:application_failure',
    createdAt: new Date().toISOString(),
  };

  const mockService = {
    assessConfidence: async () => mockAssessmentDto,
    getConfidence: async () => mockAssessmentDto,
    reassessConfidence: async () => ({ ...mockAssessmentDto, revision: 2 }),
    listConfidenceHistory: async () => [mockAssessmentDto],
    listEvidenceAttributions: async () => [mockAttributionDto],
  } as unknown as ConfidenceAssessmentService;

  beforeEach(() => {
    setSharedConfidenceAssessmentService(mockService);
  });

  describe('handleAssessConfidence', () => {
    it('rejects untrusted sender frame', async () => {
      const res = await handleAssessConfidence(untrustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });
      assert.strictEqual(res.ok, false);
      assert.strictEqual((res as any).error.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects invalid payload', async () => {
      const res = await handleAssessConfidence(trustedEvent, {
        projectId: 'invalid-uuid',
      });
      assert.strictEqual(res.ok, false);
      assert.strictEqual((res as any).error.code, 'VALIDATION_ERROR');
    });

    it('successfully assesses confidence for trusted frame', async () => {
      const res = await handleAssessConfidence(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });
      assert.strictEqual(res.ok, true);
      assert.strictEqual((res as any).data.overallConfidence, 0.885);
      assert.strictEqual((res as any).data.confidenceBand, 'VERY_HIGH');
    });
  });

  describe('handleGetConfidence', () => {
    it('rejects untrusted sender frame', async () => {
      const res = await handleGetConfidence(untrustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });
      assert.strictEqual(res.ok, false);
      assert.strictEqual((res as any).error.code, 'UNAUTHORIZED_SENDER');
    });

    it('returns confidence assessment for valid input', async () => {
      const res = await handleGetConfidence(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });
      assert.strictEqual(res.ok, true);
      assert.strictEqual((res as any).data.id, testAssessmentId);
    });
  });

  describe('handleReassessConfidence', () => {
    it('rejects untrusted sender frame', async () => {
      const res = await handleReassessConfidence(untrustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
        reason: 'Recalculation test',
      });
      assert.strictEqual(res.ok, false);
      assert.strictEqual((res as any).error.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects missing reason', async () => {
      const res = await handleReassessConfidence(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
        reason: '',
      });
      assert.strictEqual(res.ok, false);
      assert.strictEqual((res as any).error.code, 'VALIDATION_ERROR');
    });

    it('successfully reassesses with reason', async () => {
      const res = await handleReassessConfidence(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
        reason: 'New reproduction data available',
      });
      assert.strictEqual(res.ok, true);
      assert.strictEqual((res as any).data.revision, 2);
    });
  });

  describe('handleListConfidenceHistory', () => {
    it('rejects untrusted sender frame', async () => {
      const res = await handleListConfidenceHistory(untrustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });
      assert.strictEqual(res.ok, false);
      assert.strictEqual((res as any).error.code, 'UNAUTHORIZED_SENDER');
    });

    it('returns history list for trusted frame', async () => {
      const res = await handleListConfidenceHistory(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });
      assert.strictEqual(res.ok, true);
      assert.strictEqual((res as any).data.length, 1);
    });
  });

  describe('handleListEvidenceAttributions', () => {
    it('rejects untrusted sender frame', async () => {
      const res = await handleListEvidenceAttributions(untrustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });
      assert.strictEqual(res.ok, false);
      assert.strictEqual((res as any).error.code, 'UNAUTHORIZED_SENDER');
    });

    it('returns attributions list for trusted frame', async () => {
      const res = await handleListEvidenceAttributions(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });
      assert.strictEqual(res.ok, true);
      assert.strictEqual((res as any).data.length, 1);
      assert.strictEqual((res as any).data[0].conclusionType, 'CLASSIFICATION');
    });
  });
});
