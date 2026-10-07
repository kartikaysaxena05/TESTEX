/**
 * @file packages/core/src/audit/repair-audit-contract.test.ts
 * Contract and schema tests for V7 Phase 108 Complete Repair & Reverification Audit Trail.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  repairAuditActorTypeSchema,
  repairAuditEventTypeSchema,
  repairSessionStatusSchema,
  repairAuditEventDtoSchema,
  repairSessionDtoSchema,
  repairAuditTimelineDtoSchema,
  getRepairTimelineInputSchema,
  getRepairSessionInputSchema,
  listRepairSessionsInputSchema,
  exportRepairTimelineInputSchema,
  recordRepairAuditEventInputSchema,
} from '@ai-quality/contracts';
import {
  RepairAuditError,
  AuditSessionNotFoundError,
  AuditEventNotFoundError,
  AuditImmutabilityViolationError,
  AuditProjectMismatchError,
  AuditValidationError,
  AuditConcurrentMutationError,
  AuditExportFailedError,
  AUDIT_BOUNDS,
  REPAIR_AUDIT_VERSION,
} from './index.js';

describe('V7 Phase 108 - Repair Audit Trail Contract & Schemas', () => {
  const validUuid1 = '11111111-1111-1111-1111-111111111111';
  const validUuid2 = '22222222-2222-2222-2222-222222222222';
  const validUuid3 = '33333333-3333-3333-3333-333333333333';

  it('validates actor type enum', () => {
    const validActors = [
      'USER',
      'AI',
      'SYSTEM',
      'TEST_ENGINE',
      'JIRA_INTEGRATION',
      'NOTIFICATION_SERVICE',
      'REPAIR_ENGINE',
    ];
    for (const actor of validActors) {
      assert.equal(repairAuditActorTypeSchema.parse(actor), actor);
    }
    assert.throws(() => repairAuditActorTypeSchema.parse('INVALID_ACTOR'));
  });

  it('validates event type enum', () => {
    const validTypes = [
      'FAILURE_CREATED',
      'BUG_REPORT_CREATED',
      'JIRA_ISSUE_CREATED',
      'JIRA_ISSUE_LINKED',
      'ENGINEER_ASSIGNED',
      'REVERIFICATION_STARTED',
      'REVERIFICATION_COMPLETED',
      'QUICK_FIX_EVALUATED',
      'QUICK_FIX_APPROVED_FOR_GENERATION',
      'DEFECT_LOCALIZED',
      'PATCH_PROPOSED',
      'PATCH_VALIDATION_STARTED',
      'PATCH_VALIDATION_COMPLETED',
      'PATCH_REJECTED',
      'PATCH_APPROVED',
      'PATCH_APPLIED',
      'PATCH_APPLY_FAILED',
      'RETEST_STARTED',
      'RETEST_COMPLETED',
      'ROLLBACK_STARTED',
      'ROLLBACK_COMPLETED',
      'CHANGE_IMPACT_ANALYZED',
      'REGRESSION_SELECTION_CREATED',
      'POST_FIX_STATUS_UPDATED',
      'NOTIFICATION_SENT',
      'REPAIR_SESSION_COMPLETED',
    ];
    for (const type of validTypes) {
      assert.equal(repairAuditEventTypeSchema.parse(type), type);
    }
    assert.throws(() => repairAuditEventTypeSchema.parse('NON_EXISTENT_TYPE'));
  });

  it('validates session status enum', () => {
    const validStatuses = [
      'ACTIVE',
      'PATCH_APPROVED',
      'PATCH_APPLIED',
      'VERIFIED',
      'REVERTED',
      'FAILED',
      'CANCELLED',
      'COMPLETED',
    ];
    for (const status of validStatuses) {
      assert.equal(repairSessionStatusSchema.parse(status), status);
    }
    assert.throws(() => repairSessionStatusSchema.parse('NOT_A_STATUS'));
  });

  it('validates recordRepairAuditEventInputSchema', () => {
    const validInput = {
      projectId: validUuid1,
      failureCaseId: validUuid2,
      eventType: 'POST_FIX_STATUS_UPDATED',
      actorType: 'USER',
      actorId: 'qa-engineer@enterprise.org',
      sourceComponent: 'audit-workspace',
      reason: 'Manual sanity verification note',
      correlationId: validUuid3,
    };
    const parsed = recordRepairAuditEventInputSchema.parse(validInput);
    assert.equal(parsed.projectId, validUuid1);
    assert.equal(parsed.eventType, 'POST_FIX_STATUS_UPDATED');
    assert.equal(parsed.actorType, 'USER');

    // Rejects non-UUID
    assert.throws(() =>
      recordRepairAuditEventInputSchema.parse({
        ...validInput,
        projectId: 'not-a-uuid',
      }),
    );

    // Rejects empty actorId
    assert.throws(() =>
      recordRepairAuditEventInputSchema.parse({
        ...validInput,
        actorId: '',
      }),
    );
  });

  it('validates getRepairTimelineInputSchema with bounds and defaults', () => {
    const valid = getRepairTimelineInputSchema.parse({
      projectId: validUuid1,
      failureCaseId: validUuid2,
    });
    assert.equal(valid.limit, AUDIT_BOUNDS.DEFAULT_TIMELINE_LIMIT);
    assert.equal(valid.offset, 0);

    const customized = getRepairTimelineInputSchema.parse({
      projectId: validUuid1,
      failureCaseId: validUuid2,
      limit: 250,
      offset: 50,
      actorTypeFilter: ['USER'],
    });
    assert.equal(customized.limit, 250);
    assert.equal(customized.offset, 50);
    assert.deepEqual(customized.actorTypeFilter, ['USER']);

    // Rejects limit exceeding max bound
    assert.throws(() =>
      getRepairTimelineInputSchema.parse({
        projectId: validUuid1,
        failureCaseId: validUuid2,
        limit: 1000,
      }),
    );
  });

  it('validates exportRepairTimelineInputSchema defaults', () => {
    const input = exportRepairTimelineInputSchema.parse({
      projectId: validUuid1,
      failureCaseId: validUuid2,
    });
    assert.equal(input.format, 'JSON');

    const markdownInput = exportRepairTimelineInputSchema.parse({
      projectId: validUuid1,
      failureCaseId: validUuid2,
      format: 'MARKDOWN',
    });
    assert.equal(markdownInput.format, 'MARKDOWN');
  });

  it('preserves error hierarchy rooted in RepairAuditError and validates schema DTOs', () => {
    assert.equal(REPAIR_AUDIT_VERSION, '1.0.0');

    const sessionNotFound = new AuditSessionNotFoundError('Session missing');
    assert.ok(sessionNotFound instanceof RepairAuditError);
    assert.equal(sessionNotFound.code, 'AUDIT_SESSION_NOT_FOUND');

    const eventNotFound = new AuditEventNotFoundError('Event missing');
    assert.ok(eventNotFound instanceof RepairAuditError);
    assert.equal(eventNotFound.code, 'AUDIT_EVENT_NOT_FOUND');

    const immutabilityViolation = new AuditImmutabilityViolationError(
      'Audit records are immutable',
    );
    assert.ok(immutabilityViolation instanceof RepairAuditError);
    assert.equal(immutabilityViolation.code, 'AUDIT_IMMUTABILITY_VIOLATION');

    const projectMismatch = new AuditProjectMismatchError('Cross-project access forbidden');
    assert.ok(projectMismatch instanceof RepairAuditError);
    assert.equal(projectMismatch.code, 'AUDIT_PROJECT_MISMATCH');

    const validationErr = new AuditValidationError('Bad input');
    assert.ok(validationErr instanceof RepairAuditError);
    assert.equal(validationErr.code, 'AUDIT_VALIDATION_ERROR');

    const concurrentErr = new AuditConcurrentMutationError('Conflict');
    assert.ok(concurrentErr instanceof RepairAuditError);
    assert.equal(concurrentErr.code, 'AUDIT_CONCURRENT_MUTATION');

    const exportErr = new AuditExportFailedError('Export failed');
    assert.ok(exportErr instanceof RepairAuditError);
    assert.equal(exportErr.code, 'AUDIT_EXPORT_FAILED');

    // Validate DTO and query schemas
    const parsedSessionInput = getRepairSessionInputSchema.parse({
      projectId: validUuid1,
      sessionIdOrKey: validUuid1,
    });
    assert.equal(parsedSessionInput.sessionIdOrKey, validUuid1);

    const parsedListInput = listRepairSessionsInputSchema.parse({
      projectId: validUuid1,
    });
    assert.equal(parsedListInput.limit, 20);

    const nowIso = new Date().toISOString();
    const sampleSession = repairSessionDtoSchema.parse({
      id: validUuid1,
      projectId: validUuid1,
      failureCaseId: validUuid1,
      sessionKey: 'RS-TEST-001',
      status: 'ACTIVE',
      totalEventsCount: 1,
      startedAt: nowIso,
      completedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    assert.equal(sampleSession.sessionKey, 'RS-TEST-001');

    const sampleEvent = repairAuditEventDtoSchema.parse({
      id: validUuid1,
      sessionId: validUuid1,
      projectId: validUuid1,
      failureCaseId: validUuid1,
      sequenceNumber: 1,
      eventType: 'FAILURE_CREATED',
      actorType: 'SYSTEM',
      actorId: 'system',
      previousState: null,
      newState: 'ACTIVE',
      correlationId: validUuid1,
      causationId: null,
      idempotencyKey: 'idem-123',
      evidenceReferences: [],
      sourceComponent: 'TEST',
      timestamp: nowIso,
      createdAt: nowIso,
    });
    assert.equal(sampleEvent.sequenceNumber, 1);

    const sampleTimeline = repairAuditTimelineDtoSchema.parse({
      projectId: validUuid1,
      failureCaseId: validUuid1,
      session: sampleSession,
      events: [sampleEvent],
      totalEvents: 1,
      generatedAt: nowIso,
    });
    assert.equal(sampleTimeline.totalEvents, 1);
  });
});
