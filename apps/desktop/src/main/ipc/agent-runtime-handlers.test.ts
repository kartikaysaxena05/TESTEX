/**
 * @file apps/desktop/src/main/ipc/agent-runtime-handlers.test.ts
 * Security and validation unit tests for V10 Phase 141 Agent Runtime IPC handlers.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleCreateAgentRuntimeTask,
  handleGetAgentRuntimeTask,
  handleCancelAgentRuntimeTask,
  handleGetAgentRuntimeTaskEvents,
  setAgentRuntimeServiceForTest,
} from './agent-runtime-handlers.js';
import {
  setAuthServiceForTest,
  setSecureStorageForTest,
} from './auth-handlers.js';
import {
  AgentRuntimeService,
  AgentRuntimeError,
  AgentTimeoutError,
  AgentCancelledError,
  AgentInvalidStateTransitionError,
  AgentUnauthorizedToolError,
  AiCrossProjectAccessError,
  type AuthenticationService,
} from '@ai-quality/core';
import type {
  AgentRuntimeTaskDto,
  AgentRuntimeTaskEventDto,
  CreateAgentRuntimeTaskInputDto,
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

describe('V10 Phase 141 Agent Runtime IPC Handlers', () => {
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const testTaskId = '22222222-2222-2222-2222-222222222222';
  const testUserId = 'user-uuid-1111-2222';

  const mockTask: AgentRuntimeTaskDto = {
    id: testTaskId,
    projectId: testProjectId,
    userRequest: 'Run end-to-end checkout regression',
    state: 'THINKING',
    currentIteration: 1,
    maxIterations: 10,
    timeoutMs: 60000,
    providerId: 'OLLAMA',
    modelId: 'llama3',
    toolCalls: [],
    result: null,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
  };

  const mockEvents: AgentRuntimeTaskEventDto[] = [
    {
      id: '33333333-3333-3333-3333-333333333333',
      taskId: testTaskId,
      projectId: testProjectId,
      eventType: 'TASK_CREATED',
      newState: 'IDLE',
      payload: {},
      timestamp: new Date().toISOString(),
    },
  ];

  let mockSecureStorage: MockSecureStorage;

  const trustedEvent = {
    senderFrame: {
      parent: null,
      url: 'app://renderer/index.html',
    },
  } as unknown as IpcMainInvokeEvent;

  const untrustedEvent = {
    senderFrame: {
      parent: null,
      url: 'https://attacker.evil.com/exploit',
    },
  } as unknown as IpcMainInvokeEvent;

  beforeEach(() => {
    mockSecureStorage = new MockSecureStorage();
    setSecureStorageForTest(mockSecureStorage);

    const mockAuthService = {
      validateSession: async () => ({
        userId: testUserId,
        email: 'test@example.com',
        displayName: 'Test User',
        accountStatus: 'ACTIVE',
        emailVerified: true,
        sessionId: 'session-1234',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }),
    } as unknown as AuthenticationService;
    setAuthServiceForTest(mockAuthService);
  });

  describe('handleCreateAgentRuntimeTask', () => {
    it('rejects untrusted sender frame', async () => {
      const result = await handleCreateAgentRuntimeTask(untrustedEvent, {
        projectId: testProjectId,
        userRequest: 'Verify flow',
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'UNAUTHORIZED_SENDER');
    });

    it('requires authentication', async () => {
      mockSecureStorage.token = null;
      const result = await handleCreateAgentRuntimeTask(trustedEvent, {
        projectId: testProjectId,
        userRequest: 'Verify flow',
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'AUTHENTICATION_FAILED');
    });

    it('validates required fields using Zod schema', async () => {
      const result = await handleCreateAgentRuntimeTask(trustedEvent, {
        projectId: 'not-a-uuid',
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'VALIDATION_ERROR');
    });

    it('creates agent runtime task successfully', async () => {
      const mockService = {
        createTask: async (input: CreateAgentRuntimeTaskInputDto, userId?: string) => {
          assert.strictEqual(input.projectId, testProjectId);
          assert.strictEqual(userId, testUserId);
          return mockTask;
        },
      } as unknown as AgentRuntimeService;

      const result = await handleCreateAgentRuntimeTask(
        trustedEvent,
        {
          projectId: testProjectId,
          userRequest: 'Run end-to-end checkout regression',
        },
        mockService,
      );

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.data?.id, testTaskId);
      assert.strictEqual(result.data?.state, 'THINKING');
    });

    it('handles cross-project access rejection', async () => {
      const mockService = {
        createTask: async () => {
          throw new AiCrossProjectAccessError('Cross project access forbidden');
        },
      } as unknown as AgentRuntimeService;

      const result = await handleCreateAgentRuntimeTask(
        trustedEvent,
        {
          projectId: testProjectId,
          userRequest: 'Run flow',
        },
        mockService,
      );

      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'AI_CROSS_PROJECT_ACCESS');
    });
  });

  describe('handleGetAgentRuntimeTask', () => {
    it('returns task from service', async () => {
      const mockService = {
        getTask: async (input: { projectId: string; taskId: string }, userId?: string) => {
          assert.strictEqual(input.projectId, testProjectId);
          assert.strictEqual(input.taskId, testTaskId);
          assert.strictEqual(userId, testUserId);
          return mockTask;
        },
      } as unknown as AgentRuntimeService;

      const result = await handleGetAgentRuntimeTask(
        trustedEvent,
        { projectId: testProjectId, taskId: testTaskId },
        mockService,
      );

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.data?.id, testTaskId);
    });
  });

  describe('handleCancelAgentRuntimeTask', () => {
    it('cancels task via service', async () => {
      const mockService = {
        cancelTask: async () => {
          return { ...mockTask, state: 'CANCELLED' as const };
        },
      } as unknown as AgentRuntimeService;

      const result = await handleCancelAgentRuntimeTask(
        trustedEvent,
        { projectId: testProjectId, taskId: testTaskId, reason: 'Stop requested' },
        mockService,
      );

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.data?.state, 'CANCELLED');
    });
  });

  describe('handleGetAgentRuntimeTaskEvents', () => {
    it('returns events list from service', async () => {
      const mockService = {
        getTaskEvents: async () => {
          return mockEvents;
        },
      } as unknown as AgentRuntimeService;

      const result = await handleGetAgentRuntimeTaskEvents(
        trustedEvent,
        { projectId: testProjectId, taskId: testTaskId },
        mockService,
      );

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.data?.length, 1);
      assert.strictEqual(result.data?.[0]?.eventType, 'TASK_CREATED');
    });
  });
});
