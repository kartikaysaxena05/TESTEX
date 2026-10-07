/**
 * @file apps/desktop/src/main/ipc/agent-tool-permission-handlers.test.ts
 * Security, authentication, validation and delegation unit tests for V10 Phase 144 Tool Permission IPC handlers.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleListToolApprovals,
  handleGetToolApproval,
  handleDecideToolApproval,
  handleListToolAuditLogs,
  setAgentPermissionServiceForTest,
} from './agent-tool-permission-handlers.js';
import { setAuthServiceForTest, setSecureStorageForTest } from './auth-handlers.js';
import {
  AgentPermissionService,
  AgentToolApprovalNotFoundError,
  AgentToolApprovalAlreadyDecidedError,
  AiCrossProjectAccessError,
  type AuthenticationService,
} from '@ai-quality/core';
import type {
  AgentToolApprovalDto,
  AgentToolAuditLogDto,
  DecideAgentToolApprovalInputDto,
  GetAgentToolApprovalInputDto,
  ListAgentToolApprovalsInputDto,
  ListAgentToolAuditLogsInputDto,
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

describe('V10 Phase 144 Agent Tool Permission IPC Handlers', () => {
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const testUserId = 'user-uuid-1111-2222';
  const testTaskId = '22222222-2222-2222-2222-222222222222';
  const testApprovalId = '33333333-3333-3333-3333-333333333333';

  const mockApprovalDto: AgentToolApprovalDto = {
    id: testApprovalId,
    taskId: testTaskId,
    threadId: '44444444-4444-4444-4444-444444444444',
    projectId: testProjectId,
    userId: testUserId,
    toolName: 'terminal.run',
    requestedOperation: 'Execute bash command',
    permissionLevel: 'APPROVAL_REQUIRED',
    status: 'PENDING',
    inputPayload: { command: 'npm test' },
    reason: 'Operation requires human authorization.',
    decisionReason: null,
    approvedBy: null,
    approvedAt: null,
    rejectedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockAuditLogDto: AgentToolAuditLogDto = {
    id: '55555555-5555-5555-5555-555555555555',
    taskId: testTaskId,
    threadId: '44444444-4444-4444-4444-444444444444',
    projectId: testProjectId,
    userId: testUserId,
    toolName: 'terminal.run',
    requestedOperation: 'Execute bash command',
    permissionLevel: 'APPROVAL_REQUIRED',
    decision: 'APPROVAL_REQUESTED',
    reason: 'Created approval request',
    metadata: { input: { command: 'npm test' } },
    timestamp: new Date().toISOString(),
  };

  const validEvent = {
    senderFrame: {
      url: 'app://renderer/index.html',
      origin: 'app://renderer',
      parent: null,
    },
    sender: {
      id: 1,
    },
  } as unknown as IpcMainInvokeEvent;

  const untrustedEvent = {
    senderFrame: {
      url: 'https://evil.attacker.com',
      origin: 'https://evil.attacker.com',
      parent: null,
    },
    sender: {
      id: 99,
    },
  } as unknown as IpcMainInvokeEvent;

  let mockPermissionService: any;
  let mockAuthService: any;
  let mockSecureStorage: MockSecureStorage;

  beforeEach(() => {
    mockSecureStorage = new MockSecureStorage();
    setSecureStorageForTest(mockSecureStorage);

    mockAuthService = {
      validateSession: async () => ({
        userId: testUserId,
        email: 'test@example.com',
        displayName: 'Test User',
        accountStatus: 'ACTIVE',
        emailVerified: true,
        sessionId: 'sess-1',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }),
    };
    setAuthServiceForTest(mockAuthService as unknown as AuthenticationService);

    mockPermissionService = {
      listApprovals: async () => [mockApprovalDto],
      getApproval: async () => mockApprovalDto,
      decideApproval: async () => ({
        ...mockApprovalDto,
        status: 'APPROVED',
        approvedBy: testUserId,
        approvedAt: new Date().toISOString(),
      }),
      listAuditLogs: async () => [mockAuditLogDto],
    };
    setAgentPermissionServiceForTest(mockPermissionService as unknown as AgentPermissionService);
  });

  describe('Security & Sender Validation', () => {
    it('rejects untrusted sender on listApprovals', async () => {
      const result = await handleListToolApprovals(untrustedEvent, { projectId: testProjectId });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects untrusted sender on getApproval', async () => {
      const result = await handleGetToolApproval(untrustedEvent, {
        projectId: testProjectId,
        approvalId: testApprovalId,
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects untrusted sender on decideApproval', async () => {
      const result = await handleDecideToolApproval(untrustedEvent, {
        projectId: testProjectId,
        approvalId: testApprovalId,
        decision: 'APPROVE',
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects untrusted sender on listAuditLogs', async () => {
      const result = await handleListToolAuditLogs(untrustedEvent, { projectId: testProjectId });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'UNAUTHORIZED_SENDER');
    });
  });

  describe('Input Validation', () => {
    it('rejects malformed UUID on listApprovals', async () => {
      const result = await handleListToolApprovals(validEvent, {
        projectId: 'not-a-uuid',
      } as unknown as ListAgentToolApprovalsInputDto);
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'VALIDATION_ERROR');
    });

    it('rejects invalid decision enum on decideApproval', async () => {
      const result = await handleDecideToolApproval(validEvent, {
        projectId: testProjectId,
        approvalId: testApprovalId,
        decision: 'INVALID_DECISION' as any,
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'VALIDATION_ERROR');
    });
  });

  describe('Successful Delegation', () => {
    it('lists approvals successfully', async () => {
      const result = await handleListToolApprovals(validEvent, { projectId: testProjectId });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.data?.length, 1);
      assert.strictEqual(result.data?.[0]?.id, testApprovalId);
    });

    it('gets approval details successfully', async () => {
      const result = await handleGetToolApproval(validEvent, {
        projectId: testProjectId,
        approvalId: testApprovalId,
      });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.data?.id, testApprovalId);
    });

    it('decides approval successfully (APPROVE)', async () => {
      const result = await handleDecideToolApproval(validEvent, {
        projectId: testProjectId,
        approvalId: testApprovalId,
        decision: 'APPROVE',
        reason: 'Authorized for testing',
      });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.data?.status, 'APPROVED');
    });

    it('lists audit logs successfully', async () => {
      const result = await handleListToolAuditLogs(validEvent, { projectId: testProjectId });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.data?.length, 1);
      assert.strictEqual(result.data?.[0]?.decision, 'APPROVAL_REQUESTED');
    });
  });

  describe('Error Mapping', () => {
    it('maps AgentToolApprovalNotFoundError to TOOL_APPROVAL_NOT_FOUND', async () => {
      mockPermissionService.getApproval = async () => {
        throw new AgentToolApprovalNotFoundError(testApprovalId);
      };

      const result = await handleGetToolApproval(validEvent, {
        projectId: testProjectId,
        approvalId: testApprovalId,
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'TOOL_APPROVAL_NOT_FOUND');
    });

    it('maps AgentToolApprovalAlreadyDecidedError to TOOL_APPROVAL_ALREADY_DECIDED', async () => {
      mockPermissionService.decideApproval = async () => {
        throw new AgentToolApprovalAlreadyDecidedError(testApprovalId, 'APPROVED');
      };

      const result = await handleDecideToolApproval(validEvent, {
        projectId: testProjectId,
        approvalId: testApprovalId,
        decision: 'APPROVE',
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'TOOL_APPROVAL_ALREADY_DECIDED');
    });

    it('maps AiCrossProjectAccessError to AI_CROSS_PROJECT_ACCESS', async () => {
      mockPermissionService.decideApproval = async () => {
        throw new AiCrossProjectAccessError('Cross project violation');
      };

      const result = await handleDecideToolApproval(validEvent, {
        projectId: testProjectId,
        approvalId: testApprovalId,
        decision: 'APPROVE',
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'AI_CROSS_PROJECT_ACCESS');
    });
  });
});
