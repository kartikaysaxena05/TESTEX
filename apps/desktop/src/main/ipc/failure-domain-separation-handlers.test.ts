/**
 * @file apps/desktop/src/main/ipc/failure-domain-separation-handlers.test.ts
 * Unit and security tests for Failure Domain Separation IPC handlers (V6 Phase 80).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleSeparateFailureDomain,
  handleGetDomainSeparation,
  handleReevaluateDomainSeparation,
  handleListDomainSeparationHistory,
  setSharedFailureDomainSeparationService,
} from './failure-handlers.js';
import type { FailureDomainSeparationService } from '@ai-quality/core';
import type { FailureDomainSeparationDto } from '@ai-quality/contracts';

describe('Failure Domain Separation IPC Handlers (V6 Phase 80)', () => {
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

  const mockDto: FailureDomainSeparationDto = {
    id: crypto.randomUUID(),
    projectId: testProjectId,
    failureCaseId: testFailureCaseId,
    failureAnalysisRunId: null,
    classificationId: null,
    decisionIntegrityId: null,
    flakinessAnalysisId: null,
    testCaseId: testTestCaseId,
    domain: 'APPLICATION_DEFECT_CANDIDATE',
    domainSubreason: null,
    separationRulesVersion: '1.0.0',
    primaryRationale:
      'Deterministic application defect candidate verified against DOM assertion mismatch.',
    decisionExplanation: 'Target element found, but displayed unexpected error state.',
    matchedRuleIds: ['RULE_APP_DEFECT_ASSERTION'],
    excludedDomains: ['AUTOMATION_FAILURE', 'ENVIRONMENT_FAILURE', 'TEST_DATA_FAILURE'],
    exclusionReasons: {
      AUTOMATION_FAILURE: 'Selector syntax valid, runner healthy.',
      ENVIRONMENT_FAILURE: 'Host reachable, HTTP 200 responses.',
      TEST_DATA_FAILURE: 'Test data fixtures present.',
    },
    conflictingSignals: [],
    evidenceReferences: ['ev-ref-1'],
    reproductionSummary: {},
    flakinessSummary: {},
    separationFingerprint:
      'sha256:1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
    isAuthoritative: true,
    isStale: false,
    stalenessReason: null,
    reevaluationCount: 0,
    lastReevaluatedAt: null,
    reevaluationReason: null,
    evaluatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  let mockService: Partial<FailureDomainSeparationService>;

  beforeEach(() => {
    mockService = {
      separateFailureDomain: async () => mockDto,
      getDomainSeparation: async () => mockDto,
      reevaluateDomainSeparation: async (input: any) => ({
        ...mockDto,
        id: crypto.randomUUID(),
        domain: 'AUTOMATION_FAILURE',
        reevaluationReason: input.reevaluationReason,
        reevaluationCount: 1,
      }),
      listDomainSeparationHistory: async () => [],
    };

    setSharedFailureDomainSeparationService(mockService as any);
  });

  it('rejects untrusted sender on handleSeparateFailureDomain', async () => {
    const result = await handleSeparateFailureDomain(untrustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('rejects untrusted sender on handleGetDomainSeparation', async () => {
    const result = await handleGetDomainSeparation(untrustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('rejects untrusted sender on handleReevaluateDomainSeparation', async () => {
    const result = await handleReevaluateDomainSeparation(untrustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
      reevaluationReason: 'Operator requested re-evaluation',
    });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('rejects untrusted sender on handleListDomainSeparationHistory', async () => {
    const result = await handleListDomainSeparationHistory(untrustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('invokes separateFailureDomain cleanly for trusted sender and returns DTO', async () => {
    const result = await handleSeparateFailureDomain(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.data.domain, 'APPLICATION_DEFECT_CANDIDATE');
      assert.strictEqual(result.data.isAuthoritative, true);
      assert.ok(result.data.primaryRationale);
    }
  });

  it('invokes getDomainSeparation cleanly for trusted sender', async () => {
    const result = await handleGetDomainSeparation(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.data?.domain, 'APPLICATION_DEFECT_CANDIDATE');
    }
  });

  it('invokes reevaluateDomainSeparation cleanly for trusted sender with operator reason', async () => {
    const result = await handleReevaluateDomainSeparation(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
      reevaluationReason: 'Operator requested re-evaluation',
    });
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.data.domain, 'AUTOMATION_FAILURE');
      assert.strictEqual(result.data.reevaluationReason, 'Operator requested re-evaluation');
    }
  });

  it('invokes listDomainSeparationHistory cleanly for trusted sender', async () => {
    const result = await handleListDomainSeparationHistory(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.deepStrictEqual(result.data, []);
    }
  });

  it('rejects invalid payload on handleSeparateFailureDomain schema validation', async () => {
    const result = await handleSeparateFailureDomain(trustedEvent, {
      projectId: 'not-a-valid-uuid',
      failureCaseId: testFailureCaseId,
    });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'VALIDATION_ERROR');
    }
  });

  it('rejects invalid payload without reevaluationReason on handleReevaluateDomainSeparation', async () => {
    const result = await handleReevaluateDomainSeparation(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
      reevaluationReason: '', // Empty string violates min(1) validation
    });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'VALIDATION_ERROR');
    }
  });
});
