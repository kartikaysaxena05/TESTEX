/**
 * @file apps/desktop/src/main/ipc/agent-thread-handlers.test.ts
 * Security, authentication, validation and delegation unit tests for V10 Phase 142 Agent Thread IPC handlers.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleCreateAgentThread,
  handleListAgentThreads,
  handleArchiveAgentThread,
  handleCreateAgentThreadTask,
  handleGetAgentThreadTask,
  handleCancelAgentThreadTask,
  handleRetryAgentThreadTask,
  handleResumeAgentThreadTask,
  handleStopAgentThreadTask,
  handlePauseAgentThreadTask,
  handleListAgentTaskControlAuditLogs,
  handleListAgentThreadMessages,
  handleListAgentExecutionSteps,
  handleListAgentToolCalls,
  handleGetTaskRecoveryState,
  handleListRecoverableTasks,
  handleListAgentTaskCheckpoints,
  handleExecuteAutonomousWorkflow,
  handleGetAutonomousWorkflowReport,
  handleApproveWorkflowFix,
  handleRejectWorkflowFix,
} from './agent-thread-handlers.js';
import { setAuthServiceForTest, setSecureStorageForTest } from './auth-handlers.js';
import {
  AgentThreadService,
  AgentThreadNotFoundError,
  AgentThreadArchivedError,
  AgentTaskInvalidStateError,
  AiCrossProjectAccessError,
  AutonomousTestingWorkflowService,
  AutonomousWorkflowValidationError,
  type AuthenticationService,
} from '@ai-quality/core';
import type {
  AgentThreadDto,
  AgentThreadTaskDto,
  AgentThreadMessageDto,
  AgentExecutionStepDto,
  AgentToolCallRecordDto,
  AgentTaskCheckpointDto,
  TaskRecoverySummaryDto,
  AgentAutonomousWorkflowReportDto,
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

describe('V10 Phase 142 Agent Thread IPC Handlers', () => {
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const testThreadId = '22222222-2222-2222-2222-222222222222';
  const testTaskId = '33333333-3333-3333-3333-333333333333';
  const testUserId = 'user-uuid-1111-2222';

  const mockThread: AgentThreadDto = {
    id: testThreadId,
    projectId: testProjectId,
    userId: testUserId,
    title: 'Test Quality Thread',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    archivedAt: null,
  };

  const mockTask: AgentThreadTaskDto = {
    id: testTaskId,
    projectId: testProjectId,
    threadId: testThreadId,
    userId: testUserId,
    title: 'Analyze auth regression',
    instruction: 'Review failed login assertions',
    status: 'QUEUED',
    retryCount: 0,
    parentTaskId: null,
    failureReason: null,
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    attemptNumber: 1,
    isRecoverable: false,
    maxRetries: 3,
  };

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
      url: 'https://malicious-site.com',
    },
  } as unknown as IpcMainInvokeEvent;

  beforeEach(() => {
    mockSecureStorage = new MockSecureStorage();
    setSecureStorageForTest(mockSecureStorage);

    const mockAuthService = {
      validateSession: async () => ({
        userId: testUserId,
        email: 'engineer@quality.org',
        displayName: 'Lead Engineer',
        accountStatus: 'ACTIVE',
        emailVerified: true,
        sessionId: 'session-9999',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }),
    } as unknown as AuthenticationService;
    setAuthServiceForTest(mockAuthService);
  });

  describe('Security and Authentication', () => {
    it('rejects untrusted sender for thread creation', async () => {
      const res = await handleCreateAgentThread(untrustedEvent, {
        projectId: testProjectId,
        title: 'Unauthorized thread',
      });
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.error?.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects unauthenticated caller', async () => {
      mockSecureStorage.token = null;
      const res = await handleCreateAgentThread(trustedEvent, {
        projectId: testProjectId,
        title: 'Unauthenticated thread',
      });
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.error?.code, 'AUTHENTICATION_FAILED');
    });

    it('validates schema using Zod for invalid input', async () => {
      const res = await handleCreateAgentThread(trustedEvent, {
        projectId: 'not-a-valid-uuid',
        title: '',
      });
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.error?.code, 'VALIDATION_ERROR');
    });
  });

  describe('Thread Operations', () => {
    it('creates agent thread via service', async () => {
      const mockService = {
        createThread: async (input: { projectId: string; title: string }, userId: string) => {
          assert.strictEqual(input.projectId, testProjectId);
          assert.strictEqual(userId, testUserId);
          return mockThread;
        },
      } as unknown as AgentThreadService;

      const res = await handleCreateAgentThread(
        trustedEvent,
        { projectId: testProjectId, title: 'Test Quality Thread' },
        mockService,
      );

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.data?.id, testThreadId);
    });

    it('lists agent threads via service', async () => {
      const mockService = {
        listThreads: async (input: { projectId: string }, userId: string) => {
          assert.strictEqual(input.projectId, testProjectId);
          assert.strictEqual(userId, testUserId);
          return [mockThread];
        },
      } as unknown as AgentThreadService;

      const res = await handleListAgentThreads(
        trustedEvent,
        { projectId: testProjectId },
        mockService,
      );

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.data?.length, 1);
      assert.strictEqual(res.data?.[0]?.id, testThreadId);
    });

    it('archives thread and handles AgentThreadNotFoundError', async () => {
      const mockService = {
        archiveThread: async () => {
          throw new AgentThreadNotFoundError('Thread not found');
        },
      } as unknown as AgentThreadService;

      const res = await handleArchiveAgentThread(
        trustedEvent,
        { projectId: testProjectId, threadId: testThreadId },
        mockService,
      );

      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.error?.code, 'AGENT_THREAD_NOT_FOUND');
    });
  });

  describe('Task Operations', () => {
    it('creates agent thread task via service', async () => {
      const mockService = {
        createTask: async (input: unknown, userId: string) => {
          assert.strictEqual(userId, testUserId);
          return mockTask;
        },
      } as unknown as AgentThreadService;

      const res = await handleCreateAgentThreadTask(
        trustedEvent,
        {
          projectId: testProjectId,
          threadId: testThreadId,
          title: 'Analyze auth regression',
          instruction: 'Review failed login assertions',
        },
        mockService,
      );

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.data?.id, testTaskId);
    });

    it('maps AgentThreadArchivedError when creating task in archived thread', async () => {
      const mockService = {
        createTask: async () => {
          throw new AgentThreadArchivedError('Thread is archived');
        },
      } as unknown as AgentThreadService;

      const res = await handleCreateAgentThreadTask(
        trustedEvent,
        {
          projectId: testProjectId,
          threadId: testThreadId,
          title: 'Task on archived thread',
          instruction: 'Should fail',
        },
        mockService,
      );

      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.error?.code, 'AGENT_THREAD_ARCHIVED');
    });

    it('cancels task via service', async () => {
      const mockService = {
        cancelTask: async () => ({
          ...mockTask,
          status: 'CANCELLED' as const,
        }),
      } as unknown as AgentThreadService;

      const res = await handleCancelAgentThreadTask(
        trustedEvent,
        { projectId: testProjectId, taskId: testTaskId },
        mockService,
      );

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.data?.status, 'CANCELLED');
    });

    it('retries task via service and handles AgentTaskInvalidStateError', async () => {
      const mockService = {
        retryTask: async () => {
          throw new AgentTaskInvalidStateError(
            'RUNNING',
            'QUEUED',
            'Only FAILED or CANCELLED tasks can be retried',
          );
        },
      } as unknown as AgentThreadService;

      const res = await handleRetryAgentThreadTask(
        trustedEvent,
        { projectId: testProjectId, taskId: testTaskId },
        mockService,
      );

      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.error?.code, 'AGENT_TASK_INVALID_STATE');
    });

    it('maps AiCrossProjectAccessError on cross-project access attempt', async () => {
      const mockService = {
        getTask: async () => {
          throw new AiCrossProjectAccessError('Cross project access forbidden');
        },
      } as unknown as AgentThreadService;

      const res = await handleGetAgentThreadTask(
        trustedEvent,
        { projectId: testProjectId, taskId: testTaskId },
        mockService,
      );

      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.error?.code, 'AI_CROSS_PROJECT_ACCESS');
    });

    it('stops task via service and returns STOPPED status', async () => {
      const mockService = {
        stopTask: async () => ({
          ...mockTask,
          status: 'STOPPED' as const,
          stoppedAt: new Date().toISOString(),
        }),
      } as unknown as AgentThreadService;

      const res = await handleStopAgentThreadTask(
        trustedEvent,
        { projectId: testProjectId, taskId: testTaskId, reason: 'Operator stop' },
        mockService,
      );

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.data?.status, 'STOPPED');
    });

    it('pauses task via service and returns PAUSED status', async () => {
      const mockService = {
        pauseTask: async () => ({
          ...mockTask,
          status: 'PAUSED' as const,
          pausedAt: new Date().toISOString(),
        }),
      } as unknown as AgentThreadService;

      const res = await handlePauseAgentThreadTask(
        trustedEvent,
        { projectId: testProjectId, taskId: testTaskId, reason: 'Operator pause' },
        mockService,
      );

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.data?.status, 'PAUSED');
    });

    it('resumes task via service and returns RUNNING status', async () => {
      const mockService = {
        resumeTask: async () => ({
          ...mockTask,
          status: 'RUNNING' as const,
          startedAt: new Date().toISOString(),
        }),
      } as unknown as AgentThreadService;

      const res = await handleResumeAgentThreadTask(
        trustedEvent,
        { projectId: testProjectId, taskId: testTaskId },
        mockService,
      );

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.data?.status, 'RUNNING');
    });

    it('lists task control audit logs via service', async () => {
      const mockLog = {
        id: '44444444-4444-4444-4444-444444444444',
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        userId: testUserId,
        action: 'PAUSE' as const,
        previousState: 'RUNNING' as const,
        newState: 'PAUSED' as const,
        actorType: 'USER' as const,
        actorId: testUserId,
        attemptNumber: 1,
        reason: 'User paused',
        metadata: {},
        timestamp: new Date().toISOString(),
      };

      const mockService = {
        listTaskControlAuditLogs: async () => [mockLog],
      } as unknown as AgentThreadService;

      const res = await handleListAgentTaskControlAuditLogs(
        trustedEvent,
        { projectId: testProjectId, taskId: testTaskId },
        mockService,
      );

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.data?.length, 1);
      assert.strictEqual(res.data?.[0]?.action, 'PAUSE');
    });
  });

  describe('Messages, Steps & Tool Calls', () => {
    it('lists messages via service', async () => {
      const mockMessage: AgentThreadMessageDto = {
        id: '22222222-2222-2222-2222-222222222222',
        threadId: testThreadId,
        taskId: testTaskId,
        role: 'USER',
        sequence: 1,
        content: 'Review failed login assertions',
        metadata: {},
        createdAt: new Date().toISOString(),
      };

      const mockService = {
        listMessages: async () => [mockMessage],
      } as unknown as AgentThreadService;

      const res = await handleListAgentThreadMessages(
        trustedEvent,
        { projectId: testProjectId, threadId: testThreadId },
        mockService,
      );

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.data?.length, 1);
      assert.strictEqual(res.data?.[0]?.content, 'Review failed login assertions');
    });

    it('lists execution steps via service', async () => {
      const mockStep: AgentExecutionStepDto = {
        id: '22222222-2222-2222-2222-222222222222',
        taskId: testTaskId,
        sequence: 1,
        stepType: 'PLAN',
        title: 'Plan generation',
        status: 'COMPLETED',
        inputReference: null,
        outputReference: null,
        error: null,
        metadata: {},
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      const mockService = {
        listExecutionSteps: async () => [mockStep],
      } as unknown as AgentThreadService;

      const res = await handleListAgentExecutionSteps(
        trustedEvent,
        { projectId: testProjectId, taskId: testTaskId },
        mockService,
      );

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.data?.length, 1);
      assert.strictEqual(res.data?.[0]?.title, 'Plan generation');
    });

    it('lists tool calls via service', async () => {
      const mockToolCall: AgentToolCallRecordDto = {
        id: '22222222-2222-2222-2222-222222222222',
        taskId: testTaskId,
        stepId: '22222222-2222-2222-2222-222222222222',
        toolName: 'read_file',
        input: { path: 'package.json' },
        output: { size: 100 },
        error: null,
        status: 'COMPLETED',
        durationMs: 42,
        metadata: {},
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      const mockService = {
        listToolCalls: async () => [mockToolCall],
      } as unknown as AgentThreadService;

      const res = await handleListAgentToolCalls(
        trustedEvent,
        { projectId: testProjectId, taskId: testTaskId },
        mockService,
      );

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.data?.length, 1);
      assert.strictEqual(res.data?.[0]?.toolName, 'read_file');
    });
  });

  describe('Phase 158: Task Recovery & Checkpoints IPC Handlers', () => {
    const mockRecoverySummary: TaskRecoverySummaryDto = {
      taskId: testTaskId,
      threadId: testThreadId,
      projectId: testProjectId,
      taskTitle: 'Analyze auth regression',
      status: 'INTERRUPTED',
      isRecoverable: true,
      interruptedAt: new Date().toISOString(),
      retryCount: 1,
      maxRetries: 3,
      attemptNumber: 1,
      lastCompletedStepTitle: 'Step 1: Inspect session storage',
      completedStepCount: 1,
      pendingStepCount: 2,
      canResume: true,
      canRetry: true,
      canCancel: true,
      lastCheckpointSeq: 1,
    };

    const mockCheckpoint: AgentTaskCheckpointDto = {
      id: '55555555-5555-5555-5555-555555555555',
      projectId: testProjectId,
      threadId: testThreadId,
      taskId: testTaskId,
      userId: testUserId,
      stepId: null,
      sequenceNumber: 1,
      taskStatus: 'INTERRUPTED',
      serializedRecoveryState: JSON.stringify({
        stepIndex: 1,
        completedStepIds: ['step-1'],
        pendingStepIds: ['step-2', 'step-3'],
        activeToolCall: null,
        executionHistory: [],
        resumedFromCheckpointId: null,
      }),
      activeToolCall: null,
      completedStepCount: 1,
      pendingStepCount: 2,
      retryCount: 1,
      isRecoverable: true,
      createdAt: new Date().toISOString(),
    };

    it('handleGetTaskRecoveryState returns recovery summary when authenticated and valid', async () => {
      const mockService = {
        getTaskRecoveryState: async () => mockRecoverySummary,
      } as unknown as AgentThreadService;

      const res = await handleGetTaskRecoveryState(
        trustedEvent,
        { projectId: testProjectId, taskId: testTaskId },
        mockService,
      );

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.data?.taskId, testTaskId);
      assert.strictEqual(res.data?.isRecoverable, true);
      assert.strictEqual(res.data?.status, 'INTERRUPTED');
      assert.strictEqual(res.data?.canResume, true);
    });

    it('handleGetTaskRecoveryState rejects unauthorized requests', async () => {
      mockSecureStorage.token = null;
      const res = await handleGetTaskRecoveryState(
        trustedEvent,
        { projectId: testProjectId, taskId: testTaskId },
        {} as AgentThreadService,
      );

      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.error?.code, 'AUTHENTICATION_FAILED');
      mockSecureStorage.token = 'mock-valid-session-token';
    });

    it('handleListRecoverableTasks lists recoverable tasks for project', async () => {
      const mockService = {
        listRecoverableTasks: async () => [mockRecoverySummary],
      } as unknown as AgentThreadService;

      const res = await handleListRecoverableTasks(
        trustedEvent,
        { projectId: testProjectId, threadId: testThreadId },
        mockService,
      );

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.data?.length, 1);
      assert.strictEqual(res.data?.[0]?.taskId, testTaskId);
      assert.strictEqual(res.data?.[0]?.lastCompletedStepTitle, 'Step 1: Inspect session storage');
    });

    it('handleListAgentTaskCheckpoints lists ordered checkpoints for a task', async () => {
      const mockService = {
        listTaskCheckpoints: async () => [mockCheckpoint],
      } as unknown as AgentThreadService;

      const res = await handleListAgentTaskCheckpoints(
        trustedEvent,
        { projectId: testProjectId, taskId: testTaskId },
        mockService,
      );

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.data?.length, 1);
      assert.strictEqual(res.data?.[0]?.sequenceNumber, 1);
      assert.strictEqual(res.data?.[0]?.taskStatus, 'INTERRUPTED');
    });
  });

  describe('Phase 159: Autonomous Workflow IPC Handlers', () => {
    const mockWorkflowReport: AgentAutonomousWorkflowReportDto = {
      id: '00000000-0000-0000-0000-000000000001',
      taskId: testTaskId,
      projectId: testProjectId,
      threadId: testThreadId,
      userId: testUserId,
      workflowStatus: 'WAITING_FOR_APPROVAL',
      finalStatus: null,
      releaseReady: false,
      originalRequest: 'Test the login flow and fix any simple application bugs.',
      planSummary: 'Intake -> Plan -> Execute -> Analyze -> Propose Fix -> Verify',
      testsExecuted: [],
      requirementsCovered: [],
      failuresFound: [],
      evidenceReferences: {
        screenshotUrls: [],
        traceUrls: [],
        consoleLogCount: 0,
        networkEventCount: 0,
      },
      failureClassification: {
        classification: 'APPLICATION_DEFECT',
        domain: 'APPLICATION_DEFECT',
        confidenceScore: 0.95,
        isFlaky: false,
      },
      rootCauseAnalysis: {
        hypothesis: 'Null check missing',
        affectedFiles: ['src/login.ts'],
        confidence: 0.95,
        errorStack: 'AssertionError',
      },
      proposedPatch: {
        proposalId: '00000000-0000-0000-0000-000000000123',
        affectedFiles: ['src/login.ts'],
        diff: '--- a/src/login.ts\n+++ b/src/login.ts\n@@ -1 +1 @@\n-old\n+new',
      },
      approvalDecision: null,
      beforeAfterResults: null,
      regressionResults: null,
      unresolvedIssues: [],
      auditTrail: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('handleExecuteAutonomousWorkflow rejects untrusted sender', async () => {
      const res = await handleExecuteAutonomousWorkflow(untrustedEvent, {
        projectId: testProjectId,
        threadId: testThreadId,
        instruction: 'Test login flow',
      });
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.error?.code, 'UNAUTHORIZED_SENDER');
    });

    it('handleExecuteAutonomousWorkflow rejects unauthenticated caller', async () => {
      mockSecureStorage.token = null;
      const res = await handleExecuteAutonomousWorkflow(trustedEvent, {
        projectId: testProjectId,
        threadId: testThreadId,
        instruction: 'Test login flow',
      });
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.error?.code, 'AUTHENTICATION_FAILED');
      mockSecureStorage.token = 'mock-valid-session-token';
    });

    it('handleExecuteAutonomousWorkflow delegates to service successfully', async () => {
      const mockWorkflowService = {
        executeWorkflow: async () => mockWorkflowReport,
      } as unknown as AutonomousTestingWorkflowService;

      const res = await handleExecuteAutonomousWorkflow(
        trustedEvent,
        {
          projectId: testProjectId,
          threadId: testThreadId,
          instruction: 'Test the login flow and fix any simple application bugs.',
        },
        mockWorkflowService,
      );

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.data?.workflowStatus, 'WAITING_FOR_APPROVAL');
      assert.strictEqual(res.data?.proposedPatch?.proposalId, '00000000-0000-0000-0000-000000000123');
    });

    it('handleGetAutonomousWorkflowReport returns report for valid task', async () => {
      const mockWorkflowService = {
        getWorkflowReport: async () => mockWorkflowReport,
      } as unknown as AutonomousTestingWorkflowService;

      const res = await handleGetAutonomousWorkflowReport(
        trustedEvent,
        {
          projectId: testProjectId,
          taskId: testTaskId,
        },
        mockWorkflowService,
      );

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.data?.id, '00000000-0000-0000-0000-000000000001');
    });

    it('handleApproveWorkflowFix delegates approval to workflow service', async () => {
      const approvedReport: AgentAutonomousWorkflowReportDto = {
        ...mockWorkflowReport,
        workflowStatus: 'COMPLETED',
        finalStatus: 'FIXED_AND_VERIFIED',
        releaseReady: true,
      };
      const mockWorkflowService = {
        approveWorkflowFix: async () => approvedReport,
      } as unknown as AutonomousTestingWorkflowService;

      const res = await handleApproveWorkflowFix(
        trustedEvent,
        {
          projectId: testProjectId,
          taskId: testTaskId,
          decisionReason: 'Verified safe fix',
        },
        mockWorkflowService,
      );

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.data?.finalStatus, 'FIXED_AND_VERIFIED');
      assert.strictEqual(res.data?.releaseReady, true);
    });

    it('handleRejectWorkflowFix delegates rejection to workflow service', async () => {
      const rejectedReport: AgentAutonomousWorkflowReportDto = {
        ...mockWorkflowReport,
        workflowStatus: 'COMPLETED',
        finalStatus: 'APPROVAL_REJECTED',
        releaseReady: false,
      };
      const mockWorkflowService = {
        rejectWorkflowFix: async () => rejectedReport,
      } as unknown as AutonomousTestingWorkflowService;

      const res = await handleRejectWorkflowFix(
        trustedEvent,
        {
          projectId: testProjectId,
          taskId: testTaskId,
          rejectionReason: 'Diff modifies untested file',
        },
        mockWorkflowService,
      );

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.data?.finalStatus, 'APPROVAL_REJECTED');
      assert.strictEqual(res.data?.releaseReady, false);
    });

    it('maps AutonomousWorkflowValidationError properly', async () => {
      const mockWorkflowService = {
        executeWorkflow: async () => {
          throw new AutonomousWorkflowValidationError('Instruction cannot be empty');
        },
      } as unknown as AutonomousTestingWorkflowService;

      const res = await handleExecuteAutonomousWorkflow(
        trustedEvent,
        {
          projectId: testProjectId,
          threadId: testThreadId,
          instruction: 'Valid instruction for zod parse',
        },
        mockWorkflowService,
      );

      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.error?.code, 'WORKFLOW_VALIDATION_ERROR');
    });
  });
});
