/**
 * @file packages/core/src/reverification/reverification-contract.test.ts
 * Tests for contracts, Zod schemas, and DTO validation (V7 Phase 97).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  reverificationStatusSchema,
  reverificationEligibilitySchema,
  reverificationTriggerTypeSchema,
  defectReverificationDtoSchema,
  reverificationAuditEventDtoSchema,
  evaluateReverificationEligibilityInputSchema,
  createReverificationRequestInputSchema,
  generateReverificationPlanInputSchema,
  cancelReverificationInputSchema,
  listReverificationAuditEventsInputSchema,
  getReverificationStateInputSchema,
  DESKTOP_CHANNELS,
} from '@ai-quality/contracts';

describe('Defect Reverification Contracts & Schemas (Phase 97)', () => {
  it('validates all ReverificationStatus enum values', () => {
    const validStatuses = [
      'DRAFT',
      'ELIGIBILITY_CHECK',
      'READY',
      'BLOCKED',
      'PENDING_EXECUTION',
      'EXECUTING',
      'COMPLETED',
      'CANCELLED',
      'SUPERSEDED',
    ];
    for (const s of validStatuses) {
      assert.equal(reverificationStatusSchema.parse(s), s);
    }
    assert.throws(() => reverificationStatusSchema.parse('UNKNOWN_STATUS'));
  });

  it('validates all ReverificationEligibility enum values', () => {
    const validEligibilities = ['ELIGIBLE', 'NOT_ELIGIBLE', 'BLOCKED', 'UNKNOWN'];
    for (const e of validEligibilities) {
      assert.equal(reverificationEligibilitySchema.parse(e), e);
    }
    assert.throws(() => reverificationEligibilitySchema.parse('INVALID'));
  });

  it('validates all ReverificationTriggerType enum values', () => {
    const validTriggers = [
      'EXTERNAL_ISSUE_FIXED',
      'EXTERNAL_ISSUE_RESOLVED',
      'MANUAL_REQUEST',
      'PATCH_APPLIED',
      'SOURCE_CHANGE_DETECTED',
      'BUG_STATUS_CHANGED',
    ];
    for (const t of validTriggers) {
      assert.equal(reverificationTriggerTypeSchema.parse(t), t);
    }
    assert.throws(() => reverificationTriggerTypeSchema.parse('UNKNOWN_TRIGGER'));
  });

  it('validates input DTO schemas strictly', () => {
    const validProjectId = '00000000-0000-0000-0000-000000000001';
    const validFailureCaseId = '00000000-0000-0000-0000-000000000002';
    const validReverificationId = '00000000-0000-0000-0000-000000000003';

    const stateInput = getReverificationStateInputSchema.parse({
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });
    assert.equal(stateInput.projectId, validProjectId);

    const evalInput = evaluateReverificationEligibilityInputSchema.parse({
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
      triggerType: 'MANUAL_REQUEST',
    });
    assert.equal(evalInput.triggerType, 'MANUAL_REQUEST');

    const createInput = createReverificationRequestInputSchema.parse({
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
      actor: 'TEST_USER',
    });
    assert.equal(createInput.actor, 'TEST_USER');

    const cancelInput = cancelReverificationInputSchema.parse({
      projectId: validProjectId,
      reverificationId: validReverificationId,
      reason: 'Defect rejected by engineering',
    });
    assert.equal(cancelInput.reason, 'Defect rejected by engineering');

    const listEventsInput = listReverificationAuditEventsInputSchema.parse({
      projectId: validProjectId,
      reverificationId: validReverificationId,
    });
    assert.equal(listEventsInput.reverificationId, validReverificationId);

    const planInput = generateReverificationPlanInputSchema.parse({
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
      reverificationId: validReverificationId,
    });
    assert.equal(planInput.failureCaseId, validFailureCaseId);

    // Validate DTO schemas
    assert.ok(defectReverificationDtoSchema);
    assert.ok(reverificationAuditEventDtoSchema);

    // Rejection of invalid UUIDs
    assert.throws(() =>
      getReverificationStateInputSchema.parse({
        projectId: 'invalid-uuid',
        failureCaseId: validFailureCaseId,
      }),
    );
  });

  it('exposes all required Phase 97 desktop IPC channels', () => {
    assert.equal(DESKTOP_CHANNELS.REVERIFICATION_GET_STATE, 'desktop:reverification:get-state');
    assert.equal(
      DESKTOP_CHANNELS.REVERIFICATION_EVALUATE_ELIGIBILITY,
      'desktop:reverification:evaluate-eligibility',
    );
    assert.equal(
      DESKTOP_CHANNELS.REVERIFICATION_CREATE_REQUEST,
      'desktop:reverification:create-request',
    );
    assert.equal(
      DESKTOP_CHANNELS.REVERIFICATION_GENERATE_PLAN,
      'desktop:reverification:generate-plan',
    );
    assert.equal(DESKTOP_CHANNELS.REVERIFICATION_CANCEL, 'desktop:reverification:cancel');
    assert.equal(
      DESKTOP_CHANNELS.REVERIFICATION_LIST_AUDIT_EVENTS,
      'desktop:reverification:list-audit-events',
    );
  });
});
