/**
 * @file apps/desktop/src/main/ipc/post-fix-handlers.test.ts
 * IPC handler tests for Post-Fix Jira & Notification Updates (V7 Phase 107).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleExecutePostFixSync,
  handleRetryPostFixSync,
  handleGetPostFixSyncStatus,
  handleListPostFixSyncHistory,
  setPostFixExternalUpdateService,
} from './post-fix-handlers.js';
import { PostFixSyncNotFoundError } from '@ai-quality/core';
import type { PostFixSyncRecordDto } from '@ai-quality/contracts';

describe('Post-Fix IPC Handlers (Phase 107)', () => {
  const fakeTrustedEvent: IpcMainInvokeEvent = {
    senderFrame: {
      parent: null,
      url: 'app://renderer/index.html',
    } as any,
  } as IpcMainInvokeEvent;

  const fakeUntrustedEvent: IpcMainInvokeEvent = {
    senderFrame: {
      parent: {} as any,
      url: 'https://malicious.origin/attack.html',
    } as any,
  } as IpcMainInvokeEvent;

  const validProjectId = '11111111-1111-1111-1111-111111111111';
  const validFailureCaseId = '22222222-2222-2222-2222-222222222222';
  const validReverificationId = '33333333-3333-3333-3333-333333333333';
  const validSyncRecordId = '44444444-4444-4444-4444-444444444444';

  const mockRecordDto: PostFixSyncRecordDto = {
    id: validSyncRecordId,
    projectId: validProjectId,
    failureCaseId: validFailureCaseId,
    reverificationId: validReverificationId,
    idempotencyKey: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    outcome: 'VERIFIED_FIXED',
    overallStatus: 'SUCCESS',
    jiraIssueKey: 'PROJ-107',
    jiraCommentStatus: 'COMMENT_POSTED',
    jiraCommentId: '10001',
    jiraTransitionStatus: 'TRANSITIONED',
    jiraFromStatus: 'In Progress',
    jiraToStatus: 'Ready for QA',
    notificationStatus: 'SENT',
    notificationRecipient: 'assignee@corp.com',
    evidenceCount: 1,
    evidenceReferencesJson: [],
    retryCount: 0,
    actor: 'SYSTEM',
    detailsJson: {},
    requestedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    audits: [],
  };

  const mockService = {
    executeSync: async () => mockRecordDto,
    retrySync: async () => mockRecordDto,
    getStatus: async (input: { syncRecordId: string }) => {
      if (input.syncRecordId === validSyncRecordId) return mockRecordDto;
      throw new PostFixSyncNotFoundError(input.syncRecordId);
    },
    listHistory: async () => [mockRecordDto],
  } as any;

  beforeEach(() => {
    setPostFixExternalUpdateService(mockService);
  });

  it('rejects untrusted sender on handleExecutePostFixSync', async () => {
    const result = await handleExecutePostFixSync(fakeUntrustedEvent, {});
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'UNAUTHORIZED_SENDER');
  });

  it('validates input schema on handleExecutePostFixSync', async () => {
    const result = await handleExecutePostFixSync(fakeTrustedEvent, {
      projectId: 'not-a-uuid',
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'VALIDATION_ERROR');
  });

  it('executes post-fix sync with trusted sender and valid input', async () => {
    const result = await handleExecutePostFixSync(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
      reverificationId: validReverificationId,
      customNote: 'Verified cleanly',
      actor: 'qa-tester',
    });

    assert.equal(result.ok, true);
    assert.equal(result.data.id, validSyncRecordId);
    assert.equal(result.data.overallStatus, 'SUCCESS');
  });

  it('handles retryPostFixSync with trusted sender and valid input', async () => {
    const result = await handleRetryPostFixSync(fakeTrustedEvent, {
      projectId: validProjectId,
      syncRecordId: validSyncRecordId,
      actor: 'qa-tester',
    });

    assert.equal(result.ok, true);
    assert.equal(result.data.id, validSyncRecordId);
  });

  it('rejects untrusted sender on handleRetryPostFixSync', async () => {
    const result = await handleRetryPostFixSync(fakeUntrustedEvent, {
      projectId: validProjectId,
      syncRecordId: validSyncRecordId,
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'UNAUTHORIZED_SENDER');
  });

  it('gets sync status on handleGetPostFixSyncStatus', async () => {
    const result = await handleGetPostFixSyncStatus(fakeTrustedEvent, {
      projectId: validProjectId,
      syncRecordId: validSyncRecordId,
    });

    assert.equal(result.ok, true);
    assert.equal(result.data?.id, validSyncRecordId);
  });

  it('lists sync history on handleListPostFixSyncHistory', async () => {
    const result = await handleListPostFixSyncHistory(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.length, 1);
      assert.equal(result.data[0]?.id, validSyncRecordId);
    }
  });
});
