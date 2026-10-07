/**
 * @file packages/core/src/post-fix/post-fix-contract.test.ts
 * Contract, schema, DTO, and error hierarchy validation for V7 Phase 107.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DESKTOP_CHANNELS,
  postFixSyncOutcomeSchema,
  postFixSyncStatusSchema,
  postFixJiraUpdateStatusSchema,
  postFixNotificationDeliveryStatusSchema,
  executePostFixSyncInputSchema,
  retryPostFixSyncInputSchema,
  getPostFixSyncStatusInputSchema,
  listPostFixSyncHistoryInputSchema,
  postFixSyncRecordDtoSchema,
  postFixSyncAuditDtoSchema,
} from '@ai-quality/contracts';
import {
  PostFixSyncError,
  PostFixSyncNotFoundError,
  PostFixReverificationNotFoundError,
  PostFixJiraLinkNotFoundError,
  PostFixProjectMismatchError,
  PostFixValidationError,
  PostFixUnauthoritativeVerificationError,
  PostFixConcurrentSyncError,
  PostFixInvalidTransitionError,
  PostFixJiraRateLimitedError,
  PostFixJiraAuthFailedError,
  PostFixNotificationFailedError,
} from './post-fix-errors.js';
import { POST_FIX_SYNC_VERSION, POST_FIX_BOUNDS } from './post-fix-types.js';

describe('V7 Phase 107 Post-Fix Contracts & Schemas', () => {
  it('validates DESKTOP_CHANNELS for post-fix sync', () => {
    assert.equal(DESKTOP_CHANNELS.POST_FIX_SYNC_EXECUTE, 'desktop:post-fix:sync-execute');
    assert.equal(DESKTOP_CHANNELS.POST_FIX_SYNC_RETRY, 'desktop:post-fix:sync-retry');
    assert.equal(DESKTOP_CHANNELS.POST_FIX_SYNC_GET_STATUS, 'desktop:post-fix:sync-get-status');
    assert.equal(DESKTOP_CHANNELS.POST_FIX_SYNC_LIST_HISTORY, 'desktop:post-fix:sync-list-history');
  });

  it('validates postFixSyncOutcomeSchema values', () => {
    const validOutcomes = [
      'VERIFIED_FIXED',
      'STILL_FAILING',
      'REGRESSION_DETECTED',
      'BLOCKED',
      'INCONCLUSIVE',
      'ROLLED_BACK',
      'CANCELLED',
    ];
    for (const outcome of validOutcomes) {
      assert.equal(postFixSyncOutcomeSchema.parse(outcome), outcome);
    }
    assert.throws(() => postFixSyncOutcomeSchema.parse('INVALID_OUTCOME'));
  });

  it('validates postFixSyncStatusSchema values', () => {
    const validStatuses = ['SUCCESS', 'PARTIAL_SUCCESS', 'FAILED', 'SKIPPED'];
    for (const status of validStatuses) {
      assert.equal(postFixSyncStatusSchema.parse(status), status);
    }
    assert.throws(() => postFixSyncStatusSchema.parse('UNKNOWN'));
  });

  it('validates postFixJiraUpdateStatusSchema values', () => {
    const valid = ['COMMENT_POSTED', 'TRANSITIONED', 'TRANSITION_UNAVAILABLE', 'SKIPPED', 'FAILED'];
    for (const val of valid) {
      assert.equal(postFixJiraUpdateStatusSchema.parse(val), val);
    }
  });

  it('validates postFixNotificationDeliveryStatusSchema values', () => {
    const valid = ['SENT', 'SUPPRESSED', 'SKIPPED', 'FAILED'];
    for (const val of valid) {
      assert.equal(postFixNotificationDeliveryStatusSchema.parse(val), val);
    }
  });

  it('validates executePostFixSyncInputSchema parsing and validation', () => {
    const valid = {
      projectId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      failureCaseId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      reverificationId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      customNote: 'Verified on build #42',
      notifyAssignee: true,
      forceTransition: false,
      actor: 'qa-engineer@corp.com',
    };
    const parsed = executePostFixSyncInputSchema.parse(valid);
    assert.equal(parsed.projectId, valid.projectId);
    assert.equal(parsed.notifyAssignee, true);

    // Rejects non-UUID
    assert.throws(() => executePostFixSyncInputSchema.parse({ ...valid, projectId: 'not-a-uuid' }));
  });

  it('validates retryPostFixSyncInputSchema', () => {
    const valid = {
      projectId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      syncRecordId: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
      actor: 'qa-engineer@corp.com',
    };
    const parsed = retryPostFixSyncInputSchema.parse(valid);
    assert.equal(parsed.syncRecordId, valid.syncRecordId);
    assert.throws(() => retryPostFixSyncInputSchema.parse({ ...valid, syncRecordId: 'bad' }));
  });

  it('validates getPostFixSyncStatusInputSchema and listPostFixSyncHistoryInputSchema', () => {
    const getValid = {
      projectId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      syncRecordId: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
    };
    assert.equal(getPostFixSyncStatusInputSchema.parse(getValid).syncRecordId, getValid.syncRecordId);

    const listValid = {
      projectId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      failureCaseId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      limit: 25,
      offset: 0,
    };
    assert.equal(listPostFixSyncHistoryInputSchema.parse(listValid).limit, 25);
  });

  it('validates postFixSyncRecordDtoSchema and audit schema roundtrip', () => {
    const audit = {
      id: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
      projectId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      syncRecordId: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
      action: 'SYNC_COMPLETED',
      status: 'SUCCESS',
      actor: 'SYSTEM',
      detailsJson: { info: 'ok' },
      createdAt: new Date().toISOString(),
    };
    const parsedAudit = postFixSyncAuditDtoSchema.parse(audit);
    assert.equal(parsedAudit.action, 'SYNC_COMPLETED');

    const record = {
      id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
      projectId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      failureCaseId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      reverificationId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      idempotencyKey: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      outcome: 'VERIFIED_FIXED',
      overallStatus: 'SUCCESS',
      jiraIssueKey: 'PROJ-123',
      jiraCommentStatus: 'COMMENT_POSTED',
      jiraCommentId: '10042',
      jiraTransitionStatus: 'TRANSITIONED',
      jiraFromStatus: 'In Progress',
      jiraToStatus: 'Ready for QA',
      jiraTransitionId: '31',
      notificationStatus: 'SENT',
      notificationRecipient: 'lead@corp.com',
      notificationSubject: '[VERIFIED FIXED] PROJ-123',
      evidenceCount: 2,
      evidenceReferencesJson: [{ type: 'SCREENSHOT', name: 'after.png' }],
      retryCount: 0,
      actor: 'SYSTEM',
      customNote: 'Verified cleanly',
      detailsJson: {},
      requestedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      audits: [parsedAudit],
    };
    const parsedRecord = postFixSyncRecordDtoSchema.parse(record);
    assert.equal(parsedRecord.overallStatus, 'SUCCESS');
    assert.equal(parsedRecord.outcome, 'VERIFIED_FIXED');
    assert.equal(parsedRecord.audits.length, 1);
  });

  it('validates error hierarchy and code mappings', () => {
    const notFound = new PostFixSyncNotFoundError('rec-1');
    assert.equal(notFound.code, 'POST_FIX_SYNC_NOT_FOUND');
    assert.ok(notFound instanceof PostFixSyncError);

    const reverifNotFound = new PostFixReverificationNotFoundError('rev-1');
    assert.equal(reverifNotFound.code, 'POST_FIX_REVERIFICATION_NOT_FOUND');

    const jiraNotFound = new PostFixJiraLinkNotFoundError('fc-1');
    assert.equal(jiraNotFound.code, 'POST_FIX_JIRA_LINK_NOT_FOUND');

    const projectMismatch = new PostFixProjectMismatchError('mismatch');
    assert.equal(projectMismatch.code, 'POST_FIX_PROJECT_MISMATCH');

    const unauthoritative = new PostFixUnauthoritativeVerificationError('unverified');
    assert.equal(unauthoritative.code, 'POST_FIX_UNAUTHORITATIVE_VERIFICATION');

    const concurrent = new PostFixConcurrentSyncError('sync locked');
    assert.equal(concurrent.code, 'POST_FIX_CONCURRENT_SYNC_ERROR');

    const invalidTransition = new PostFixInvalidTransitionError('bad transition');
    assert.equal(invalidTransition.code, 'POST_FIX_INVALID_TRANSITION');

    const rateLimited = new PostFixJiraRateLimitedError('rate limited', 60);
    assert.equal(rateLimited.code, 'POST_FIX_JIRA_RATE_LIMITED');
    assert.equal(rateLimited.retryAfterSeconds, 60);

    const authFailed = new PostFixJiraAuthFailedError('bad token');
    assert.equal(authFailed.code, 'POST_FIX_JIRA_AUTH_FAILED');

    const notifFailed = new PostFixNotificationFailedError('smtp error');
    assert.equal(notifFailed.code, 'POST_FIX_NOTIFICATION_FAILED');

    const validationErr = new PostFixValidationError('invalid input');
    assert.equal(validationErr.code, 'POST_FIX_VALIDATION_ERROR');
  });

  it('validates bounds and version policy constants', () => {
    assert.equal(POST_FIX_SYNC_VERSION, '1.0.0');
    assert.equal(POST_FIX_BOUNDS.MAX_CUSTOM_NOTE_LENGTH, 1000);
    assert.equal(POST_FIX_BOUNDS.MAX_COMMENT_LENGTH, 30000);
    assert.equal(POST_FIX_BOUNDS.MAX_EVIDENCE_REFERENCES, 50);
    assert.equal(POST_FIX_BOUNDS.MAX_RETRIES, 3);
  });
});
