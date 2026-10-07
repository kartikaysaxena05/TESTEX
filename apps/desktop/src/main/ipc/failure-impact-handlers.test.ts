/**
 * @file apps/desktop/src/main/ipc/failure-impact-handlers.test.ts
 * Unit and security tests for Severity, Priority & Impact IPC handlers (V6 Phase 84).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleAssessImpact,
  handleGetImpactAssessment,
  handleReassessImpact,
  handleListImpactHistory,
  setSharedFailureImpactAssessmentService,
} from './failure-handlers.js';
import type { FailureImpactAssessmentService } from '@ai-quality/core';
import type { FailureImpactAssessmentDto } from '@ai-quality/contracts';

describe('Severity, Priority & Impact IPC Handlers (V6 Phase 84)', () => {
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

  const mockImpactDto: FailureImpactAssessmentDto = {
    id: crypto.randomUUID(),
    projectId: testProjectId,
    failureCaseId: testFailureCaseId,
    testCaseId: testTestCaseId,
    testCaseVersionNumber: 1,
    failureAnalysisRunId: null,
    deterministicClassificationId: null,
    technicalLocalizationId: null,
    domainSeparationId: null,
    aiAssessmentId: null,
    rootCauseAnalysisId: null,

    severity: 'HIGH',
    severityRuleId: 'SEV_HIGH_MAJOR_WORKFLOW_BLOCKED_001',
    severityRationale: 'Major workflow blocked without workaround.',
    severityReasons: ['Persistent HTTP 500 error encountered.'],

    priority: 'P1_URGENT',
    priorityRuleId: 'PRI_P1_URGENT_001',
    priorityRationale: 'High defect severity requires urgent release resolution.',
    priorityReasons: ['Confirmed reproducible failure on core checkout.'],

    releaseRecommendation: 'BLOCK_RELEASE',
    releaseRecommendationRationale:
      'High severity defect without verified workaround blocks release candidate.',

    userImpact: 'ALL_USERS',
    userImpactDetails: 'All users unable to checkout.',
    functionalImpact: 'Checkout impaired.',
    businessImpact: 'Direct revenue loss.',
    businessCriticality: 'HIGH',
    dataImpact: 'NO_DATA_IMPACT',
    dataImpactDetails: null,
    securityImpact: 'NONE_PROVEN',
    securityImpactDetails: null,
    availabilityImpact: 'MODULE_UNAVAILABLE',
    integrationImpact: 'No integrations impacted.',
    blastRadius: 'SINGLE_MODULE',
    workaroundStatus: 'NO_WORKAROUND',
    workaroundDetails: null,

    supportingEvidence: [],
    conflictingSignals: [],
    unknownFactors: [],

    severityModelVersion: '1.0.0',
    priorityModelVersion: '1.0.0',
    impactModelVersion: '1.0.0',
    assessmentFingerprint: 'a'.repeat(64),

    isAuthoritative: true,
    isStale: false,
    stalenessReason: null,
    reassessmentCount: 0,
    lastReassessedAt: null,
    reassessmentReason: null,
    supersededById: null,

    assessedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  let mockService: FailureImpactAssessmentService;

  beforeEach(() => {
    mockService = {
      assessImpact: async () => mockImpactDto,
      getImpactAssessment: async () => mockImpactDto,
      reassessImpact: async () => ({ ...mockImpactDto, reassessmentCount: 1 }),
      listImpactHistory: async () => [mockImpactDto],
    } as unknown as FailureImpactAssessmentService;

    setSharedFailureImpactAssessmentService(mockService);
  });

  it('1. Rejects untrusted IPC sender on assessImpact', async () => {
    const res = await handleAssessImpact(untrustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('2. Rejects invalid schema payload on assessImpact', async () => {
    const res = await handleAssessImpact(trustedEvent, {
      projectId: 'not-a-uuid',
      failureCaseId: testFailureCaseId,
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'VALIDATION_ERROR');
    }
  });

  it('3. Successfully invokes assessImpact with valid input', async () => {
    const res = await handleAssessImpact(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.id, mockImpactDto.id);
      assert.equal(res.data.severity, 'HIGH');
      assert.equal(res.data.priority, 'P1_URGENT');
    }
  });

  it('4. Successfully invokes getImpactAssessment', async () => {
    const res = await handleGetImpactAssessment(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.ok(res.data);
      assert.equal(res.data.id, mockImpactDto.id);
    }
  });

  it('5. Successfully invokes reassessImpact with valid reason', async () => {
    const res = await handleReassessImpact(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
      reassessmentReason: 'QA lead verified absence of workaround',
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.reassessmentCount, 1);
    }
  });

  it('6. Successfully invokes listImpactHistory', async () => {
    const res = await handleListImpactHistory(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.length, 1);
      assert.equal(res.data[0]?.id, mockImpactDto.id);
    }
  });
});
