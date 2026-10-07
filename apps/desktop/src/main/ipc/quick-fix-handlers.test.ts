/**
 * @file apps/desktop/src/main/ipc/quick-fix-handlers.test.ts
 * Main process IPC handler tests for AI Quick-Fix Eligibility & Safety (V7 Phase 99).
 * Verifies untrusted sender rejection, frame validation, schema parsing, and domain error sanitization.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleEvaluateQuickFixEligibility,
  handleGetQuickFixAssessment,
  handleListQuickFixAssessments,
  setQuickFixEligibilityService,
} from './quick-fix-handlers.js';
import {
  QuickFixNotFoundError,
  QuickFixCrossProjectError,
  QuickFixBlockedError,
} from '@ai-quality/core';
import type { QuickFixEligibilityAssessmentDto } from '@ai-quality/contracts';

describe('QuickFix IPC Handlers (Phase 99)', () => {
  const fakeTrustedEvent: IpcMainInvokeEvent = {
    senderFrame: {
      parent: null,
      url: 'app://renderer/index.html',
    } as any,
  } as IpcMainInvokeEvent;

  const fakeUntrustedEvent: IpcMainInvokeEvent = {
    senderFrame: {
      parent: {} as any,
      url: 'https://attacker.site/index.html',
    } as any,
  } as IpcMainInvokeEvent;

  const validProjectId = '11111111-1111-1111-1111-111111111111';
  const validFailureCaseId = '22222222-2222-2222-2222-222222222222';
  const validAssessmentId = '33333333-3333-3333-3333-333333333333';

  const mockAssessmentDto: QuickFixEligibilityAssessmentDto = {
    id: validAssessmentId,
    projectId: validProjectId,
    failureCaseId: validFailureCaseId,
    decision: 'ELIGIBLE',
    riskLevel: 'LOW',
    confidenceScore: 0.95,
    summary: 'Clean small scope defect is eligible for quick fix.',
    reasons: ['Passed all checks.'],
    matchedRules: ['QF_SMALL_SCOPE_ELIGIBLE_001'],
    blockingRules: [],
    candidateFiles: ['src/button.ts'],
    candidateSymbols: [],
    blastRadius: {
      totalDependentFiles: 1,
      totalDependentSymbols: 2,
      affectedModules: ['root'],
    },
    requiredTests: [],
    riskFactors: {
      isSecuritySensitive: false,
      isAuthOrPermission: false,
      isFinancialOrPayment: false,
      isDbMigrationOrSchema: false,
      isDependencyChange: false,
      isProductionConfigOrCi: false,
      isDataDestructive: false,
      isPublicApiBreaking: false,
      isDirtyWorktree: false,
      isLargeScope: false,
    },
    gitState: {
      isClean: true,
      modifiedFiles: [],
      untrackedFiles: [],
    },
    gitClean: true,
    isSuperseded: false,
    evaluatedBy: 'SYSTEM',
    evaluatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    setQuickFixEligibilityService(null);
  });

  it('rejects untrusted sender for evaluateEligibility', async () => {
    const res = await handleEvaluateQuickFixEligibility(fakeUntrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('returns VALIDATION_ERROR on malformed input schema', async () => {
    const res = await handleEvaluateQuickFixEligibility(fakeTrustedEvent, {
      projectId: 'invalid-uuid',
      failureCaseId: validFailureCaseId,
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'VALIDATION_ERROR');
    }
  });

  it('handles evaluateEligibility successfully', async () => {
    const mockService = {
      evaluateEligibility: async () => mockAssessmentDto,
    } as any;
    setQuickFixEligibilityService(mockService);

    const res = await handleEvaluateQuickFixEligibility(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.id, validAssessmentId);
      assert.equal(res.data.decision, 'ELIGIBLE');
    }
  });

  it('sanitizes domain error QUICK_FIX_NOT_FOUND', async () => {
    const mockService = {
      evaluateEligibility: async () => {
        throw new QuickFixNotFoundError(validFailureCaseId);
      },
    } as any;
    setQuickFixEligibilityService(mockService);

    const res = await handleEvaluateQuickFixEligibility(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'QUICK_FIX_NOT_FOUND');
    }
  });

  it('sanitizes domain error QUICK_FIX_CROSS_PROJECT', async () => {
    const mockService = {
      getAssessment: async () => {
        throw new QuickFixCrossProjectError();
      },
    } as any;
    setQuickFixEligibilityService(mockService);

    const res = await handleGetQuickFixAssessment(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'QUICK_FIX_CROSS_PROJECT');
    }
  });

  it('handles listAssessments successfully', async () => {
    const mockService = {
      listAssessments: async () => [mockAssessmentDto],
    } as any;
    setQuickFixEligibilityService(mockService);

    const res = await handleListQuickFixAssessments(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.length, 1);
      assert.equal(res.data[0]?.id, validAssessmentId);
    }
  });
});
