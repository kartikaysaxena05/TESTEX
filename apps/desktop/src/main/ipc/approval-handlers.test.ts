/**
 * @file apps/desktop/src/main/ipc/approval-handlers.test.ts
 * Privileged IPC boundary unit tests for V10 Phase 155: Human Approval Gates.
 * Verifies untrusted sender origin rejection, user authentication, schema validation,
 * all IPC action handlers, and error mapping to DesktopResult contracts.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import { EventEmitter } from 'node:events';
import {
  handleCreateApproval,
  handleGetApproval,
  handleListApprovals,
  handleApproveApproval,
  handleRejectApproval,
  handleCancelApproval,
  handleGetPendingApproval,
  handleGetApprovalAuditHistory,
  setApprovalServiceForTest,
} from './approval-handlers.js';
import { setAuthServiceForTest, setSecureStorageForTest } from './auth-handlers.js';
import {
  ApprovalNotFoundError,
  ApprovalAlreadyDecidedError,
  ApprovalExpiredError,
  ApprovalCancelledError,
  ApprovalActionModifiedError,
  ApprovalUnauthorizedError,
  ApprovalValidationError,
  type AuthenticationService,
} from '@ai-quality/core';
import type {
  ApprovalRequestDto,
  ApprovalAuditLogDto,
  StructuredApprovalDecisionDto,
} from '@ai-quality/contracts';
import type { IDesktopSecureStorage } from '../secure-storage/desktop-secure-storage.js';

class MockSecureStorage implements IDesktopSecureStorage {
  public token: string | null = 'mock-valid-session-token';
  public async storeSessionToken(token: string): Promise<void> {
    this.token = token;
  }
  public async retrieveSessionToken(): Promise<string | null> {
    return this.token;
  }
  public async clearSessionToken(): Promise<void> {
    this.token = null;
  }
}

class MockWebContents extends EventEmitter {
  public id = 42;
  private destroyed = false;

  public isDestroyed(): boolean {
    return this.destroyed;
  }

  public destroy(): void {
    this.destroyed = true;
    this.emit('destroyed');
  }
}

describe('V10 Phase 155 Agent Approval IPC Handlers', () => {
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const testThreadId = 'cccccccc-1111-1111-1111-cccccccccccc';
  const testTaskId = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
  const testApprovalId = '99999999-9999-9999-9999-999999999999';
  const notFoundApprovalId = '00000000-0000-0000-0000-000000000000';
  const decidedApprovalId = '88888888-8888-8888-8888-888888888888';
  const expiredApprovalId = '77777777-7777-7777-7777-777777777777';
  const cancelledApprovalId = '66666666-6666-6666-6666-666666666666';
  const modifiedApprovalId = '55555555-5555-5555-5555-555555555555';
  const testUserId = 'user-uuid-1111-2222';

  let mockSender: MockWebContents;
  let mockSecureStorage: MockSecureStorage;
  let mockApprovalService: any;

  const createTrustedEvent = (sender: any = mockSender): IpcMainInvokeEvent =>
    ({
      senderFrame: {
        parent: null,
        url: 'app://renderer/index.html',
      },
      sender,
    }) as unknown as IpcMainInvokeEvent;

  const createUntrustedEvent = (sender: any = mockSender): IpcMainInvokeEvent =>
    ({
      senderFrame: {
        parent: null,
        url: 'https://evil-untrusted-site.com',
      },
      sender,
    }) as unknown as IpcMainInvokeEvent;

  const sampleApprovalDto: ApprovalRequestDto = {
    id: testApprovalId,
    userId: testUserId,
    projectId: testProjectId,
    threadId: testThreadId,
    taskId: testTaskId,
    executionStepId: null,
    approvalType: 'FILE_WRITE',
    title: 'Modify Source Code',
    description: 'Edit code file',
    riskLevel: 'HIGH',
    requestedAction: 'file.write',
    requestedInput: { path: 'src/main.ts' },
    affectedFiles: ['src/main.ts'],
    affectedTools: ['file.write'],
    status: 'PENDING',
    actionHash: 'abc123hash',
    requestedAt: '2026-10-06T10:00:00.000Z',
    respondedAt: null,
    respondedBy: null,
    expiresAt: '2026-10-07T10:00:00.000Z',
    responseReason: null,
    metadata: {},
    createdAt: '2026-10-06T10:00:00.000Z',
    updatedAt: '2026-10-06T10:00:00.000Z',
  };

  beforeEach(() => {
    mockSender = new MockWebContents();
    mockSecureStorage = new MockSecureStorage();
    setSecureStorageForTest(mockSecureStorage);

    const mockAuthService = {
      validateSession: async (token: string) => {
        if (token === 'mock-valid-session-token') {
          return {
            id: 'session-id',
            userId: testUserId,
            token,
            expiresAt: new Date(Date.now() + 3600000),
            createdAt: new Date(),
          };
        }
        return null;
      },
    } as unknown as AuthenticationService;
    setAuthServiceForTest(mockAuthService);

    mockApprovalService = {
      createRequest: async (input: any, userId: string): Promise<ApprovalRequestDto> => {
        if (userId !== testUserId) {
          throw new ApprovalUnauthorizedError('Unauthorized user');
        }
        return { ...sampleApprovalDto, ...input };
      },
      getRequest: async (input: any, userId: string): Promise<ApprovalRequestDto> => {
        if (userId !== testUserId) {
          throw new ApprovalUnauthorizedError('Unauthorized user');
        }
        if (input.approvalId === notFoundApprovalId) {
          throw new ApprovalNotFoundError(input.approvalId);
        }
        return sampleApprovalDto;
      },
      listRequests: async (input: any, userId: string): Promise<ApprovalRequestDto[]> => {
        if (userId !== testUserId) {
          throw new ApprovalUnauthorizedError('Unauthorized user');
        }
        return [sampleApprovalDto];
      },
      getPendingRequest: async (input: any, userId: string): Promise<ApprovalRequestDto | null> => {
        if (userId !== testUserId) {
          throw new ApprovalUnauthorizedError('Unauthorized user');
        }
        return sampleApprovalDto;
      },
      approve: async (input: any, userId: string): Promise<ApprovalRequestDto> => {
        if (userId !== testUserId) {
          throw new ApprovalUnauthorizedError('Unauthorized user');
        }
        if (input.approvalId === decidedApprovalId) {
          throw new ApprovalAlreadyDecidedError(input.approvalId, 'APPROVED');
        }
        if (input.approvalId === expiredApprovalId) {
          throw new ApprovalExpiredError(input.approvalId);
        }
        if (input.approvalId === cancelledApprovalId) {
          throw new ApprovalCancelledError(input.approvalId);
        }
        if (input.approvalId === modifiedApprovalId) {
          throw new ApprovalActionModifiedError(input.approvalId, 'hash1', 'hash2');
        }
        const updated: ApprovalRequestDto = {
          ...sampleApprovalDto,
          status: 'APPROVED',
          respondedBy: userId,
          respondedAt: new Date().toISOString(),
        };
        return updated;
      },
      reject: async (input: any, userId: string): Promise<ApprovalRequestDto> => {
        if (userId !== testUserId) {
          throw new ApprovalUnauthorizedError('Unauthorized user');
        }
        const updated: ApprovalRequestDto = {
          ...sampleApprovalDto,
          status: 'REJECTED',
          respondedBy: userId,
          respondedAt: new Date().toISOString(),
          responseReason: input.reason ?? null,
        };
        return updated;
      },
      cancel: async (input: any, userId: string): Promise<ApprovalRequestDto> => {
        if (userId !== testUserId) {
          throw new ApprovalUnauthorizedError('Unauthorized user');
        }
        return {
          ...sampleApprovalDto,
          status: 'CANCELLED',
          responseReason: input.reason ?? null,
        };
      },
      getAuditHistory: async (input: any, userId: string): Promise<readonly ApprovalAuditLogDto[]> => {
        if (userId !== testUserId) {
          throw new ApprovalUnauthorizedError('Unauthorized user');
        }
        return [
          {
            id: 'audit-1',
            approvalId: input.approvalId,
            projectId: input.projectId,
            threadId: testThreadId,
            taskId: testTaskId,
            userId,
            eventType: 'APPROVAL_CREATED',
            actorType: 'USER',
            actorId: userId,
            transition: 'NONE -> PENDING',
            timestamp: '2026-10-06T10:00:00.000Z',
            metadata: {},
          },
        ];
      },
    };

    setApprovalServiceForTest(mockApprovalService);
  });

  // 1. Untrusted sender origin rejection
  it('should reject invocations from untrusted sender frame', async () => {
    const untrustedEvent = createUntrustedEvent();
    const result = await handleGetApproval(untrustedEvent, {
      projectId: testProjectId,
      approvalId: testApprovalId,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  // 2. Unauthenticated caller rejection
  it('should reject invocations when user session is invalid or missing', async () => {
    mockSecureStorage.token = null;
    const trustedEvent = createTrustedEvent();
    const result = await handleGetApproval(trustedEvent, {
      projectId: testProjectId,
      approvalId: testApprovalId,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'APPROVAL_UNAUTHORIZED');
    }
  });

  // 3. Schema validation rejection
  it('should reject invalid input schemas with VALIDATION_ERROR', async () => {
    const trustedEvent = createTrustedEvent();
    // Missing required fields
    const result = await handleCreateApproval(trustedEvent, {
      projectId: 'not-a-uuid',
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'VALIDATION_ERROR');
    }
  });

  // 4. Create approval
  it('should create approval request successfully via handleCreateApproval', async () => {
    const trustedEvent = createTrustedEvent();
    const result = await handleCreateApproval(trustedEvent, {
      projectId: testProjectId,
      threadId: testThreadId,
      taskId: testTaskId,
      approvalType: 'FILE_WRITE',
      title: 'Write code file',
      description: 'Modify code',
      riskLevel: 'HIGH',
      requestedAction: 'file.write',
      requestedInput: { path: 'src/main.ts' },
      affectedFiles: ['src/main.ts'],
      affectedTools: ['file.write'],
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.status, 'PENDING');
      assert.equal(result.data.approvalType, 'FILE_WRITE');
    }
  });

  // 5. Get approval & list approvals
  it('should get approval and list approvals successfully', async () => {
    const trustedEvent = createTrustedEvent();

    const getRes = await handleGetApproval(trustedEvent, {
      projectId: testProjectId,
      approvalId: testApprovalId,
    });
    assert.equal(getRes.ok, true);
    if (getRes.ok && getRes.data) {
      assert.equal(getRes.data.id, testApprovalId);
    }

    const listRes = await handleListApprovals(trustedEvent, {
      projectId: testProjectId,
      taskId: testTaskId,
    });
    assert.equal(listRes.ok, true);
    if (listRes.ok) {
      assert.equal(listRes.data.length, 1);
    }
  });

  // 6. Get pending approval
  it('should get pending approval successfully', async () => {
    const trustedEvent = createTrustedEvent();
    const res = await handleGetPendingApproval(trustedEvent, {
      projectId: testProjectId,
      taskId: testTaskId,
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.ok(res.data);
      assert.equal(res.data?.status, 'PENDING');
    }
  });

  // 7. Approve approval
  it('should approve approval successfully via handleApproveApproval', async () => {
    const trustedEvent = createTrustedEvent();
    const res = await handleApproveApproval(trustedEvent, {
      projectId: testProjectId,
      approvalId: testApprovalId,
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.status, 'APPROVED');
    }
  });

  // 8. Reject approval
  it('should reject approval successfully via handleRejectApproval', async () => {
    const trustedEvent = createTrustedEvent();
    const res = await handleRejectApproval(trustedEvent, {
      projectId: testProjectId,
      approvalId: testApprovalId,
      reason: 'Rejected by security reviewer',
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.status, 'REJECTED');
      assert.equal(res.data.responseReason, 'Rejected by security reviewer');
    }
  });

  // 9. Cancel approval
  it('should cancel approval successfully via handleCancelApproval', async () => {
    const trustedEvent = createTrustedEvent();
    const res = await handleCancelApproval(trustedEvent, {
      projectId: testProjectId,
      approvalId: testApprovalId,
      reason: 'User cancelled task',
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.status, 'CANCELLED');
    }
  });

  // 10. Audit history
  it('should return audit history via handleGetApprovalAuditHistory', async () => {
    const trustedEvent = createTrustedEvent();
    const res = await handleGetApprovalAuditHistory(trustedEvent, {
      projectId: testProjectId,
      approvalId: testApprovalId,
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.length, 1);
      assert.equal(res.data[0]!.eventType, 'APPROVAL_CREATED');
    }
  });

  // 11. Error code mappings
  describe('Error code mappings', () => {
    it('maps ApprovalNotFoundError to APPROVAL_NOT_FOUND', async () => {
      const res = await handleGetApproval(createTrustedEvent(), {
        projectId: testProjectId,
        approvalId: notFoundApprovalId,
      });
      assert.equal(res.ok, false);
      if (!res.ok) assert.equal(res.error.code, 'APPROVAL_NOT_FOUND');
    });

    it('maps ApprovalAlreadyDecidedError to APPROVAL_ALREADY_DECIDED', async () => {
      const res = await handleApproveApproval(createTrustedEvent(), {
        projectId: testProjectId,
        approvalId: decidedApprovalId,
      });
      assert.equal(res.ok, false);
      if (!res.ok) assert.equal(res.error.code, 'APPROVAL_ALREADY_DECIDED');
    });

    it('maps ApprovalExpiredError to APPROVAL_EXPIRED', async () => {
      const res = await handleApproveApproval(createTrustedEvent(), {
        projectId: testProjectId,
        approvalId: expiredApprovalId,
      });
      assert.equal(res.ok, false);
      if (!res.ok) assert.equal(res.error.code, 'APPROVAL_EXPIRED');
    });

    it('maps ApprovalCancelledError to APPROVAL_CANCELLED', async () => {
      const res = await handleApproveApproval(createTrustedEvent(), {
        projectId: testProjectId,
        approvalId: cancelledApprovalId,
      });
      assert.equal(res.ok, false);
      if (!res.ok) assert.equal(res.error.code, 'APPROVAL_CANCELLED');
    });

    it('maps ApprovalActionModifiedError to APPROVAL_ACTION_MODIFIED', async () => {
      const res = await handleApproveApproval(createTrustedEvent(), {
        projectId: testProjectId,
        approvalId: modifiedApprovalId,
      });
      assert.equal(res.ok, false);
      if (!res.ok) assert.equal(res.error.code, 'APPROVAL_ACTION_MODIFIED');
    });
  });
});
