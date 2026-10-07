/**
 * @file packages/core/src/verification/verification-contract.test.ts
 * Tests for contracts, Zod schemas, domain bounds, and DTO validation (V7 Phase 98).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  verificationOutcomeSchema,
  verificationModeSchema,
  defectVerificationAttemptDtoSchema,
  verificationSummaryDtoSchema,
  executeVerificationInputSchema,
  getVerificationAttemptsInputSchema,
  getVerificationComparisonInputSchema,
  cancelVerificationInputSchema,
  DESKTOP_CHANNELS,
} from '@ai-quality/contracts';
import { VERIFICATION_BOUNDS } from './verification-types.js';

describe('Defect Verification Contracts & Schemas (Phase 98)', () => {
  it('validates all VerificationOutcome enum values', () => {
    const validOutcomes = [
      'VERIFIED_FIXED',
      'STILL_FAILING',
      'DIFFERENT_FAILURE',
      'BLOCKED',
      'INCONCLUSIVE',
      'CANCELLED',
      'EXECUTION_ERROR',
    ];
    for (const outcome of validOutcomes) {
      assert.equal(verificationOutcomeSchema.parse(outcome), outcome);
    }
    assert.throws(() => verificationOutcomeSchema.parse('INVALID_OUTCOME'));
    assert.throws(() => verificationOutcomeSchema.parse('PASSED'));
  });

  it('validates all VerificationMode enum values', () => {
    assert.equal(verificationModeSchema.parse('HISTORICAL'), 'HISTORICAL');
    assert.equal(verificationModeSchema.parse('CURRENT'), 'CURRENT');
    assert.throws(() => verificationModeSchema.parse('FUTURE'));
  });

  it('validates domain bounds constants', () => {
    assert.equal(VERIFICATION_BOUNDS.MIN_ATTEMPTS, 1);
    assert.equal(VERIFICATION_BOUNDS.MAX_ATTEMPTS, 5);
    assert.equal(VERIFICATION_BOUNDS.DEFAULT_TIMEOUT_MS, 30000);
    assert.equal(VERIFICATION_BOUNDS.LOCK_TIMEOUT_MS, 120000);
  });

  it('validates executeVerificationInputSchema with default values', () => {
    const parsed = executeVerificationInputSchema.parse({
      projectId: '00000000-0000-0000-0000-000000000001',
      failureCaseId: '00000000-0000-0000-0000-000000000002',
    });

    assert.equal(parsed.mode, 'HISTORICAL');
    assert.equal(parsed.maxAttempts, 1);
    assert.equal(parsed.actor, 'USER');
    assert.equal(parsed.projectId, '00000000-0000-0000-0000-000000000001');
    assert.equal(parsed.failureCaseId, '00000000-0000-0000-0000-000000000002');
  });

  it('rejects executeVerificationInputSchema when maxAttempts exceeds 5', () => {
    assert.throws(() => {
      executeVerificationInputSchema.parse({
        projectId: '00000000-0000-0000-0000-000000000001',
        failureCaseId: '00000000-0000-0000-0000-000000000002',
        maxAttempts: 6,
      });
    });
  });

  it('rejects executeVerificationInputSchema with invalid UUIDs', () => {
    assert.throws(() => {
      executeVerificationInputSchema.parse({
        projectId: 'invalid-uuid',
        failureCaseId: '00000000-0000-0000-0000-000000000002',
      });
    });
  });

  it('validates getVerificationAttemptsInputSchema', () => {
    const parsed = getVerificationAttemptsInputSchema.parse({
      projectId: '00000000-0000-0000-0000-000000000001',
      failureCaseId: '00000000-0000-0000-0000-000000000002',
      reverificationId: '00000000-0000-0000-0000-000000000003',
    });
    assert.equal(parsed.reverificationId, '00000000-0000-0000-0000-000000000003');
  });

  it('validates getVerificationComparisonInputSchema', () => {
    const parsed = getVerificationComparisonInputSchema.parse({
      projectId: '00000000-0000-0000-0000-000000000001',
      failureCaseId: '00000000-0000-0000-0000-000000000002',
      attemptId: '00000000-0000-0000-0000-000000000004',
    });
    assert.equal(parsed.attemptId, '00000000-0000-0000-0000-000000000004');
  });

  it('validates cancelVerificationInputSchema', () => {
    const parsed = cancelVerificationInputSchema.parse({
      projectId: '00000000-0000-0000-0000-000000000001',
      failureCaseId: '00000000-0000-0000-0000-000000000002',
      reason: 'User cancelled via UI',
    });
    assert.equal(parsed.reason, 'User cancelled via UI');
    assert.equal(parsed.actor, 'USER');

    assert.throws(() => {
      cancelVerificationInputSchema.parse({
        projectId: '00000000-0000-0000-0000-000000000001',
        failureCaseId: '00000000-0000-0000-0000-000000000002',
        reason: '',
      });
    });
  });

  it('validates defectVerificationAttemptDtoSchema', () => {
    const sampleAttempt = {
      id: '00000000-0000-0000-0000-000000000010',
      projectId: '00000000-0000-0000-0000-000000000001',
      reverificationId: '00000000-0000-0000-0000-000000000002',
      failureCaseId: '00000000-0000-0000-0000-000000000003',
      originalExecutionId: '00000000-0000-0000-0000-000000000004',
      verificationExecutionId: '00000000-0000-0000-0000-000000000005',
      verificationMode: 'HISTORICAL' as const,
      testCaseId: '00000000-0000-0000-0000-000000000006',
      originalTestCaseVersionNumber: 1,
      verificationTestCaseVersionNumber: 1,
      attemptNumber: 1,
      browserEngine: 'chromium',
      status: 'VERIFIED_FIXED' as const,
      originalFailureSignature: 'sig-abc-123',
      verificationFailureSignature: null,
      isSignatureMatch: false,
      environmentEquivalence: 'EXACT' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = defectVerificationAttemptDtoSchema.parse(sampleAttempt);
    assert.equal(parsed.status, 'VERIFIED_FIXED');
    assert.equal(parsed.isSignatureMatch, false);
  });

  it('validates verificationSummaryDtoSchema', () => {
    const summary = {
      failureCaseId: '00000000-0000-0000-0000-000000000001',
      reverificationId: '00000000-0000-0000-0000-000000000002',
      projectId: '00000000-0000-0000-0000-000000000003',
      totalAttempts: 1,
      latestAttemptNumber: 1,
      latestOutcome: 'VERIFIED_FIXED' as const,
      isFixed: true,
      isStillFailing: false,
      isBlocked: false,
      isInconclusive: false,
      environmentEquivalence: 'EXACT' as const,
      attempts: [],
      factualMetrics: {
        attemptsRequested: 1,
        attemptsStarted: 1,
        attemptsCompleted: 1,
        passes: 1,
        sameFailures: 0,
        differentFailures: 0,
        blocked: 0,
        cancelled: 0,
        executionErrors: 0,
        environmentDrift: false,
      },
    };

    const parsed = verificationSummaryDtoSchema.parse(summary);
    assert.equal(parsed.isFixed, true);
    assert.equal(parsed.factualMetrics.passes, 1);
  });

  it('contains expected verification IPC channel constants', () => {
    assert.equal(DESKTOP_CHANNELS.VERIFICATION_EXECUTE, 'desktop:verification:execute');
    assert.equal(DESKTOP_CHANNELS.VERIFICATION_GET_ATTEMPTS, 'desktop:verification:get-attempts');
    assert.equal(
      DESKTOP_CHANNELS.VERIFICATION_GET_COMPARISON,
      'desktop:verification:get-comparison',
    );
    assert.equal(DESKTOP_CHANNELS.VERIFICATION_CANCEL, 'desktop:verification:cancel');
  });
});
