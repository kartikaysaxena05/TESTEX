/**
 * @file packages/core/src/patch/validation/patch-validation-contract.test.ts
 * Contract and schema validation tests for V7 Phase 103 Patch Validation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  defectPatchValidationDtoSchema,
  executePatchValidationInputSchema,
  getPatchValidationInputSchema,
  listPatchValidationsInputSchema,
  cancelPatchValidationInputSchema,
  patchValidationOutcomeSchema,
  patchValidationStatusSchema,
} from '@ai-quality/contracts';
import {
  PatchValidationError,
  PatchValidationNotFoundError,
  PatchValidationInProgressError,
  PatchValidationCrossProjectError,
  PatchValidationSandboxUnavailableError,
  PatchValidationBaselineFailedError,
  PatchValidationInconclusiveError,
  PatchValidationRegressionError,
  PatchValidationQualityGateError,
  PatchValidationScopeViolationError,
  PatchValidationTimeoutError,
  PatchValidationCancelledError,
  PatchValidationImmutabilityViolationError,
} from './validation-errors.js';

describe('Patch Validation Contracts & Schemas', () => {
  const validUuid1 = '11111111-1111-1111-1111-111111111111';
  const validUuid2 = '22222222-2222-2222-2222-222222222222';
  const validUuid3 = '33333333-3333-3333-3333-333333333333';
  const validUuid4 = '44444444-4444-4444-4444-444444444444';
  const validUuid5 = '55555555-5555-5555-5555-555555555555';

  it('validates executePatchValidationInputSchema with defaults', () => {
    const input = {
      projectId: validUuid1,
      failureCaseId: validUuid2,
      patchProposalId: validUuid3,
    };
    const parsed = executePatchValidationInputSchema.parse(input);
    assert.equal(parsed.projectId, validUuid1);
    assert.equal(parsed.failureCaseId, validUuid2);
    assert.equal(parsed.patchProposalId, validUuid3);
    assert.equal(parsed.actor, 'USER');
    assert.equal(parsed.skipQualityGates, false);
    assert.equal(parsed.timeoutMs, 60000);
  });

  it('rejects executePatchValidationInputSchema when UUIDs are invalid', () => {
    const input = {
      projectId: 'not-a-uuid',
      failureCaseId: validUuid2,
      patchProposalId: validUuid3,
    };
    assert.throws(() => executePatchValidationInputSchema.parse(input));
  });

  it('validates getPatchValidationInputSchema and listPatchValidationsInputSchema', () => {
    const getParsed = getPatchValidationInputSchema.parse({
      projectId: validUuid1,
      validationId: validUuid4,
    });
    assert.equal(getParsed.projectId, validUuid1);
    assert.equal(getParsed.validationId, validUuid4);

    const listParsed = listPatchValidationsInputSchema.parse({
      projectId: validUuid1,
      failureCaseId: validUuid2,
    });
    assert.equal(listParsed.projectId, validUuid1);
    assert.equal(listParsed.failureCaseId, validUuid2);
  });

  it('validates cancelPatchValidationInputSchema', () => {
    const cancelParsed = cancelPatchValidationInputSchema.parse({
      projectId: validUuid1,
      validationId: validUuid4,
      reason: 'User cancelled verification run.',
    });
    assert.equal(cancelParsed.projectId, validUuid1);
    assert.equal(cancelParsed.validationId, validUuid4);
    assert.equal(cancelParsed.actor, 'USER');
  });

  it('validates outcomes and statuses against enum schemas', () => {
    assert.equal(patchValidationOutcomeSchema.parse('VALID'), 'VALID');
    assert.equal(patchValidationOutcomeSchema.parse('INVALID'), 'INVALID');
    assert.equal(patchValidationOutcomeSchema.parse('INCONCLUSIVE'), 'INCONCLUSIVE');
    assert.equal(patchValidationOutcomeSchema.parse('BLOCKED'), 'BLOCKED');
    assert.equal(patchValidationOutcomeSchema.parse('CANCELLED'), 'CANCELLED');
    assert.equal(patchValidationOutcomeSchema.parse('EXECUTION_ERROR'), 'EXECUTION_ERROR');
    assert.throws(() => patchValidationOutcomeSchema.parse('RANDOM_STATE'));

    assert.equal(patchValidationStatusSchema.parse('PENDING'), 'PENDING');
    assert.equal(patchValidationStatusSchema.parse('RUNNING_BEFORE'), 'RUNNING_BEFORE');
    assert.equal(patchValidationStatusSchema.parse('COMPLETED'), 'COMPLETED');
  });

  it('validates complete DefectPatchValidationDto schema roundtrip', () => {
    const dto = {
      id: validUuid4,
      projectId: validUuid1,
      failureCaseId: validUuid2,
      patchProposalId: validUuid3,
      sandboxId: validUuid5,
      repositoryId: null,
      testCaseId: validUuid2,
      testCaseVersionId: null,
      testCaseVersionNumber: 1,
      requirementIds: ['REQ-001'],
      status: 'COMPLETED' as const,
      validationOutcome: 'VALID' as const,
      validationReason: 'Target fixed cleanly',
      baseRevision: 'abc12345',
      patchHash: 'hash67890',
      originalRepoModifiedCount: 0,
      originalRepoClean: true,
      targetFailureFixed: true,
      beforeStatus: 'FAIL',
      afterStatus: 'PASS',
      beforeFailureSignature: 'sig-before',
      afterFailureSignature: null,
      beforeExpected: 'Reject invalid credentials',
      beforeActual: 'Accepted invalid credentials',
      afterExpected: 'Reject invalid credentials',
      afterActual: 'Rejected invalid credentials',
      sameTestCaseVerified: true,
      sameTestVersionVerified: true,
      regressionDetected: false,
      targetedRegressionTotal: 2,
      targetedRegressionPassed: 2,
      targetedRegressionFailed: 0,
      newRegressionsCount: 0,
      newRegressions: [],
      preExistingFailuresCount: 0,
      preExistingFailures: [],
      unexpectedChangesDetected: false,
      unexpectedFiles: [],
      typecheckStatus: 'PASS',
      lintStatus: 'PASS',
      formatStatus: 'NOT_RUN',
      buildStatus: 'PASS',
      qualityGates: [],
      beforeExecutionIds: ['exec-1'],
      afterExecutionIds: ['exec-2'],
      beforeEvidence: null,
      afterEvidence: null,
      validatorVersion: '1.0.0',
      executedBy: 'SYSTEM',
      executionDurationMs: 1200,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = defectPatchValidationDtoSchema.parse(dto);
    assert.equal(parsed.id, validUuid4);
    assert.equal(parsed.validationOutcome, 'VALID');
    assert.equal(parsed.targetFailureFixed, true);
  });

  it('properly constructs domain error classes with standard error codes', () => {
    const baseError = new PatchValidationError('base');
    assert.equal(baseError.code, 'VALIDATION_ERROR');

    const notFound = new PatchValidationNotFoundError();
    assert.equal(notFound.code, 'PATCH_VALIDATION_NOT_FOUND');

    const inProgress = new PatchValidationInProgressError('fc-1');
    assert.equal(inProgress.code, 'PATCH_VALIDATION_IN_PROGRESS');

    const crossProject = new PatchValidationCrossProjectError();
    assert.equal(crossProject.code, 'PATCH_VALIDATION_CROSS_PROJECT');

    const immutability = new PatchValidationImmutabilityViolationError();
    assert.equal(immutability.code, 'PATCH_SANDBOX_IMMUTABILITY_VIOLATION');

    const regression = new PatchValidationRegressionError();
    assert.equal(regression.code, 'PATCH_VALIDATION_REGRESSION_DETECTED');

    const timeout = new PatchValidationTimeoutError();
    assert.equal(timeout.code, 'PATCH_VALIDATION_TIMEOUT');

    const sandboxUnavail = new PatchValidationSandboxUnavailableError();
    assert.equal(sandboxUnavail.code, 'PATCH_VALIDATION_SANDBOX_UNAVAILABLE');

    const baselineFailed = new PatchValidationBaselineFailedError();
    assert.equal(baselineFailed.code, 'PATCH_VALIDATION_BEFORE_EXECUTION_FAILED');

    const inconclusive = new PatchValidationInconclusiveError();
    assert.equal(inconclusive.code, 'VALIDATION_ERROR');

    const qualityGate = new PatchValidationQualityGateError();
    assert.equal(qualityGate.code, 'PATCH_VALIDATION_QUALITY_GATE_FAILED');

    const scopeViolation = new PatchValidationScopeViolationError();
    assert.equal(scopeViolation.code, 'PATCH_VALIDATION_UNEXPECTED_CHANGES');

    const cancelled = new PatchValidationCancelledError();
    assert.equal(cancelled.code, 'PATCH_VALIDATION_CANCELLED');
  });
});
