/**
 * @file apps/desktop/src/main/ipc/agent-loop-handlers.test.ts
 * Unit tests for V10 Phase 153 Agent Execution Loop IPC handlers.
 * Verifies untrusted origin rejection, authentication, schema validation, and AgentLoop delegation.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleAgentLoopStart,
  handleAgentLoopResume,
  handleAgentLoopCancel,
  handleAgentLoopGetStatus,
  setAgentLoopForTest,
} from './agent-loop-handlers.js';
import { setAuthServiceForTest, setSecureStorageForTest } from './auth-handlers.js';
import {
  AgentLoop,
  AgentLoopNotFoundError,
  AgentLoopInvalidStateError,
  AgentLoopConcurrentExecutionError,
  AgentLoopCrossProjectAccessError,
  type AuthenticationService,
} from '@ai-quality/core';
import type { AgentLoopRunResultDto, AgentLoopStateDto } from '@ai-quality/contracts';
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

describe('V10 Phase 153 Agent Execution Loop IPC Handlers', () => {
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const testUserId = 'user-uuid-1111-2222';
  const testThreadId = 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb';
  const testTaskId = 'cccccccc-1111-1111-1111-cccccccccccc';

  const mockRunResultDto: AgentLoopRunResultDto = {
    taskId: testTaskId,
    status: 'COMPLETED',
    stepsCompleted: 3,
    toolCallsExecuted: 2,
    planStatus: 'COMPLETED',
    durationMs: 420,
  };

  const mockStateDto: AgentLoopStateDto = {
    taskId: testTaskId,
    threadId: testThreadId,
    projectId: testProjectId,
    status: 'RUNNING',
    currentStepSequence: 2,
    totalStepsExecuted: 1,
    toolCallsCount: 1,
    consecutiveFailures: 0,
    startedAt: new Date().toISOString(),
    completedAt: null,
    durationMs: 150,
  };

  const createTrustedEvent = (): IpcMainInvokeEvent =>
    ({
      senderFrame: {
        parent: null,
        url: 'app://renderer/index.html',
      },
    }) as unknown as IpcMainInvokeEvent;

  const createUntrustedEvent = (): IpcMainInvokeEvent =>
    ({
      senderFrame: {
        parent: null,
        url: 'https://malicious-external-site.com',
      },
    }) as unknown as IpcMainInvokeEvent;

  beforeEach(() => {
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

    setSecureStorageForTest(new MockSecureStorage());
    setAuthServiceForTest(mockAuthService);
  });

  it('1. should reject startAgentLoop from untrusted sender origin', async () => {
    const result = await handleAgentLoopStart(createUntrustedEvent(), {
      projectId: testProjectId,
      threadId: testThreadId,
      taskId: testTaskId,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error?.code, 'UNAUTHORIZED_SENDER');
  });

  it('2. should reject startAgentLoop with invalid schema parameters', async () => {
    const result = await handleAgentLoopStart(createTrustedEvent(), {
      projectId: 'not-a-uuid',
      threadId: testThreadId,
      taskId: testTaskId,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error?.code, 'VALIDATION_ERROR');
  });

  it('3. should delegate valid startAgentLoop to AgentLoop', async () => {
    let capturedInput: any = null;
    let capturedUserId: string | null = null;

    const mockLoop = {
      run: async (input: any, userId: string) => {
        capturedInput = input;
        capturedUserId = userId;
        return mockRunResultDto;
      },
    } as unknown as AgentLoop;

    setAgentLoopForTest(mockLoop);

    const result = await handleAgentLoopStart(createTrustedEvent(), {
      projectId: testProjectId,
      threadId: testThreadId,
      taskId: testTaskId,
    });

    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.data, mockRunResultDto);
    assert.strictEqual(capturedUserId, testUserId);
    assert.strictEqual(capturedInput.taskId, testTaskId);
  });

  it('4. should map domain errors from startAgentLoop (e.g. concurrent execution)', async () => {
    const mockLoop = {
      run: async () => {
        throw new AgentLoopConcurrentExecutionError(testTaskId);
      },
    } as unknown as AgentLoop;

    setAgentLoopForTest(mockLoop);

    const result = await handleAgentLoopStart(createTrustedEvent(), {
      projectId: testProjectId,
      threadId: testThreadId,
      taskId: testTaskId,
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error?.code, 'AGENT_LOOP_CONCURRENT_EXECUTION');
  });

  it('5. should delegate resumeAgentLoop to AgentLoop', async () => {
    let capturedInput: any = null;

    const mockLoop = {
      resume: async (input: any) => {
        capturedInput = input;
        return mockRunResultDto;
      },
    } as unknown as AgentLoop;

    setAgentLoopForTest(mockLoop);

    const result = await handleAgentLoopResume(createTrustedEvent(), {
      projectId: testProjectId,
      threadId: testThreadId,
      taskId: testTaskId,
    });

    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.data, mockRunResultDto);
    assert.strictEqual(capturedInput.taskId, testTaskId);
  });

  it('6. should map invalid state error on resume', async () => {
    const mockLoop = {
      resume: async () => {
        throw new AgentLoopInvalidStateError('COMPLETED', 'RUNNING');
      },
    } as unknown as AgentLoop;

    setAgentLoopForTest(mockLoop);

    const result = await handleAgentLoopResume(createTrustedEvent(), {
      projectId: testProjectId,
      threadId: testThreadId,
      taskId: testTaskId,
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error?.code, 'AGENT_LOOP_INVALID_STATE');
  });

  it('7. should delegate cancelAgentLoop to AgentLoop', async () => {
    let capturedInput: any = null;

    const mockLoop = {
      cancel: async (input: any) => {
        capturedInput = input;
        return {
          ...mockRunResultDto,
          status: 'CANCELLED',
        };
      },
    } as unknown as AgentLoop;

    setAgentLoopForTest(mockLoop);

    const result = await handleAgentLoopCancel(createTrustedEvent(), {
      projectId: testProjectId,
      threadId: testThreadId,
      taskId: testTaskId,
      reason: 'User cancelled via UI button',
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data?.status, 'CANCELLED');
    assert.strictEqual(capturedInput.reason, 'User cancelled via UI button');
  });

  it('8. should delegate getAgentLoopStatus to AgentLoop', async () => {
    const mockLoop = {
      getStatus: async () => mockStateDto,
    } as unknown as AgentLoop;

    setAgentLoopForTest(mockLoop);

    const result = await handleAgentLoopGetStatus(createTrustedEvent(), {
      projectId: testProjectId,
      taskId: testTaskId,
    });

    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.data, mockStateDto);
  });

  it('9. should handle not found error cleanly', async () => {
    const mockLoop = {
      getStatus: async () => {
        throw new AgentLoopNotFoundError('Task not found');
      },
    } as unknown as AgentLoop;

    setAgentLoopForTest(mockLoop);

    const result = await handleAgentLoopGetStatus(createTrustedEvent(), {
      projectId: testProjectId,
      taskId: testTaskId,
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error?.code, 'AGENT_LOOP_NOT_FOUND');
  });

  it('10. should map cross project access error', async () => {
    const mockLoop = {
      run: async () => {
        throw new AgentLoopCrossProjectAccessError();
      },
    } as unknown as AgentLoop;

    setAgentLoopForTest(mockLoop);

    const result = await handleAgentLoopStart(createTrustedEvent(), {
      projectId: testProjectId,
      threadId: testThreadId,
      taskId: testTaskId,
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error?.code, 'AGENT_LOOP_CROSS_PROJECT_ACCESS');
  });
});
