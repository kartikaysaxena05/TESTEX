/**
 * @file apps/desktop/src/main/ipc/terminal-handlers.test.ts
 * Unit tests for V10 Phase 151 terminal IPC handlers.
 * Verifies untrusted origin rejection, authentication, schema validation, and gateway delegation.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleExecuteTerminal,
  handleGetTerminalExecution,
  handleListTerminalExecutions,
  handleApproveTerminalExecution,
  handleRejectTerminalExecution,
  handleCancelTerminalExecution,
  setTerminalGatewayForTest,
} from './terminal-handlers.js';
import { setAuthServiceForTest, setSecureStorageForTest } from './auth-handlers.js';
import {
  TerminalCommandGateway,
  TerminalSelfApprovalForbiddenError,
  AiCrossProjectAccessError,
  type AuthenticationService,
} from '@ai-quality/core';
import type { AgentTerminalExecutionDto } from '@ai-quality/contracts';
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

describe('V10 Phase 151 Terminal Gateway IPC Handlers', () => {
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const testUserId = 'user-uuid-1111-2222';
  const testExecutionId = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
  const testTaskId = 'cccccccc-1111-1111-1111-cccccccccccc';

  const mockExecutionDto: AgentTerminalExecutionDto = {
    id: testExecutionId,
    projectId: testProjectId,
    taskId: testTaskId,
    threadId: 'dddddddd-1111-1111-1111-dddddddddddd',
    stepId: null,
    command: 'node -v',
    workingDirectory: '/path/to/project',
    status: 'COMPLETED',
    policyDecision: 'SAFE',
    policyReason: 'Safe node inspection',
    exitCode: 0,
    stdout: 'v20.0.0\n',
    stderr: '',
    durationMs: 45,
    timedOut: false,
    cancelled: false,
    timeoutMs: 30000,
    maxOutputBytes: 524288,
    approvedBy: null,
    approvedAt: null,
    metadata: {},
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  let mockSecureStorage: MockSecureStorage;
  let mockAuthService: AuthenticationService;
  let mockGateway: Partial<TerminalCommandGateway>;

  beforeEach(() => {
    mockSecureStorage = new MockSecureStorage();
    setSecureStorageForTest(mockSecureStorage);

    mockAuthService = {
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

    mockGateway = {
      executeCommand: async (_input: any, _userId: string) => mockExecutionDto,
      getExecution: async (_input: any, _userId: string) => mockExecutionDto,
      listExecutions: async (_input: any, _userId: string) => [mockExecutionDto],
      approveExecution: async (input: any, _userId: string) => {
        if (input.approvedBy && (input.approvedBy.toLowerCase().startsWith('agent') || input.approvedBy.toLowerCase().startsWith('ai_'))) {
          throw new TerminalSelfApprovalForbiddenError(input.approvedBy);
        }
        return {
          ...mockExecutionDto,
          status: 'COMPLETED',
          approvedBy: input.approvedBy ?? 'HUMAN_OPERATOR',
        };
      },
      rejectExecution: async (_input: any, _userId: string) => ({
        ...mockExecutionDto,
        status: 'BLOCKED',
      }),
      cancelExecution: async (_input: any, _userId: string) => ({
        ...mockExecutionDto,
        status: 'CANCELLED',
        cancelled: true,
      }),
    };

    setTerminalGatewayForTest(mockGateway as TerminalCommandGateway);
  });

  const validEvent = {
    senderFrame: {
      parent: null,
      url: 'app://renderer/index.html',
    },
  } as unknown as IpcMainInvokeEvent;

  const untrustedEvent = {
    senderFrame: {
      parent: null,
      url: 'http://evil-origin.com/attack.html',
    },
  } as unknown as IpcMainInvokeEvent;

  it('rejects untrusted sender frame origin across all terminal channels', async () => {
    const resExec = await handleExecuteTerminal(untrustedEvent, {
      projectId: testProjectId,
      taskId: testTaskId,
      command: 'node -v',
    });
    assert.equal(resExec.ok, false);
    if (!resExec.ok) assert.equal(resExec.error.code, 'UNAUTHORIZED_SENDER');

    const resGet = await handleGetTerminalExecution(untrustedEvent, {
      projectId: testProjectId,
      executionId: testExecutionId,
    });
    assert.equal(resGet.ok, false);
    if (!resGet.ok) assert.equal(resGet.error.code, 'UNAUTHORIZED_SENDER');

    const resApprove = await handleApproveTerminalExecution(untrustedEvent, {
      projectId: testProjectId,
      executionId: testExecutionId,
    });
    assert.equal(resApprove.ok, false);
    if (!resApprove.ok) assert.equal(resApprove.error.code, 'UNAUTHORIZED_SENDER');

    const resReject = await handleRejectTerminalExecution(untrustedEvent, {
      projectId: testProjectId,
      executionId: testExecutionId,
      reason: 'Rejected',
    });
    assert.equal(resReject.ok, false);
    if (!resReject.ok) assert.equal(resReject.error.code, 'UNAUTHORIZED_SENDER');

    const resCancel = await handleCancelTerminalExecution(untrustedEvent, {
      projectId: testProjectId,
      executionId: testExecutionId,
    });
    assert.equal(resCancel.ok, false);
    if (!resCancel.ok) assert.equal(resCancel.error.code, 'UNAUTHORIZED_SENDER');
  });

  it('rejects unauthenticated requests when session is missing', async () => {
    mockSecureStorage.token = null;
    const res = await handleExecuteTerminal(validEvent, {
      projectId: testProjectId,
      taskId: testTaskId,
      command: 'node -v',
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.error.code, 'AUTHENTICATION_FAILED');
  });

  it('validates malformed input schemas cleanly', async () => {
    const res = await handleExecuteTerminal(validEvent, {
      projectId: 'not-a-uuid',
      taskId: testTaskId,
      command: 'node -v',
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.error.code, 'VALIDATION_ERROR');
  });

  it('handles execute terminal command successfully', async () => {
    const res = await handleExecuteTerminal(validEvent, {
      projectId: testProjectId,
      taskId: testTaskId,
      command: 'node -v',
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.status, 'COMPLETED');
      assert.equal(res.data.exitCode, 0);
    }
  });

  it('handles get terminal execution successfully', async () => {
    const res = await handleGetTerminalExecution(validEvent, {
      projectId: testProjectId,
      executionId: testExecutionId,
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data?.id, testExecutionId);
    }
  });

  it('handles list terminal executions successfully', async () => {
    const res = await handleListTerminalExecutions(validEvent, {
      projectId: testProjectId,
      taskId: testTaskId,
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.length, 1);
    }
  });

  it('prevents agent self-approval via IPC boundary', async () => {
    const res = await handleApproveTerminalExecution(validEvent, {
      projectId: testProjectId,
      executionId: testExecutionId,
      approvedBy: 'agent_coder_v1',
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'INVALID_REQUEST');
      assert.ok(res.error.message.includes('Self-approval forbidden'));
    }
  });

  it('approves terminal execution with human operator identity', async () => {
    const res = await handleApproveTerminalExecution(validEvent, {
      projectId: testProjectId,
      executionId: testExecutionId,
      approvedBy: 'operator@internal.corp',
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.approvedBy, 'operator@internal.corp');
    }
  });

  it('rejects terminal execution with reason', async () => {
    const res = await handleRejectTerminalExecution(validEvent, {
      projectId: testProjectId,
      executionId: testExecutionId,
      reason: 'Unsafe command requested',
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.status, 'BLOCKED');
    }
  });

  it('cancels terminal execution cleanly', async () => {
    const res = await handleCancelTerminalExecution(validEvent, {
      projectId: testProjectId,
      executionId: testExecutionId,
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.status, 'CANCELLED');
    }
  });

  it('sanitizes cross-project access violations cleanly', async () => {
    mockGateway.executeCommand = async () => {
      throw new AiCrossProjectAccessError('Cannot access project of another tenant.');
    };
    const res = await handleExecuteTerminal(validEvent, {
      projectId: testProjectId,
      taskId: testTaskId,
      command: 'node -v',
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'AI_CROSS_PROJECT_ACCESS');
    }
  });
});
