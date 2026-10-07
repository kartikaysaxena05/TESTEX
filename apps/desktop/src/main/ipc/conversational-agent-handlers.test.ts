/**
 * @file apps/desktop/src/main/ipc/conversational-agent-handlers.test.ts
 * Privileged IPC Handler Tests for V8 Phase 124 Conversational AI Testing Agent.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleCreateAgentSession,
  handleGetAgentSession,
  handleListAgentSessions,
  handleDeleteAgentSession,
  handleSendAgentMessage,
  handleApproveAgentAction,
  handleAgentRunControl,
  handleGetAgentEvidence,
  setConversationalAgentServiceForTest,
} from './conversational-agent-handlers.js';
import { setAuthServiceForTest, setSecureStorageForTest } from './auth-handlers.js';
import {
  AgentSessionNotFoundError,
  AgentAccessDeniedError,
  AgentInvalidRequestError,
  AgentToolFailedError,
  AgentApprovalRequiredError,
  AgentRunNotFoundError,
  AgentEvidenceNotFoundError,
  AgentExecutionFailedError,
  type ConversationalAgentService,
  type AuthenticationService,
} from '@ai-quality/core';
import type {
  AgentSessionDto,
  AgentMessageResponseDto,
  AgentActionApprovalResultDto,
  AgentRunControlResultDto,
  AgentEvidenceQueryResultDto,
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

describe('Phase 124 Conversational Agent IPC Handlers & Security Tests', () => {
  const dummyDateStr = new Date('2026-01-01T00:00:00.000Z').toISOString();
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const testSessionId = '22222222-2222-2222-2222-222222222222';
  const testUserId = 'user-uuid-1111-2222';

  const mockSession: AgentSessionDto = {
    id: testSessionId,
    projectId: testProjectId,
    userId: testUserId,
    title: 'Testing Login Flow',
    status: 'IDLE',
    approvalState: 'NOT_REQUIRED',
    activeRunId: null,
    currentTaskId: null,
    metadata: {},
    messages: [],
    createdAt: dummyDateStr,
    updatedAt: dummyDateStr,
  };

  const mockMessageResponse: AgentMessageResponseDto = {
    userMessage: {
      id: 'msg-1',
      sessionId: testSessionId,
      role: 'USER',
      content: 'Test the login flow',
      createdAt: dummyDateStr,
    },
    agentMessage: {
      id: 'msg-2',
      sessionId: testSessionId,
      role: 'ASSISTANT',
      content: 'Execution completed. All 2 steps passed.',
      createdAt: dummyDateStr,
    },
    task: null,
    activities: [],
    sessionStatus: 'COMPLETED',
  };

  const mockApprovalResult: AgentActionApprovalResultDto = {
    sessionId: testSessionId,
    approvalState: 'APPROVED',
    status: 'COMPLETED',
    message: 'Action approved and executed.',
  };

  const testRunId = '33333333-3333-3333-3333-333333333333';

  const mockRunControlResult: AgentRunControlResultDto = {
    sessionId: testSessionId,
    runId: testRunId,
    action: 'START',
    success: true,
    runStatus: 'RUNNING',
    message: 'Test run started successfully.',
  };

  const mockEvidenceResult: AgentEvidenceQueryResultDto = {
    runId: testRunId,
    testCaseKey: 'TC-LOGIN-001',
    requirementKey: 'REQ-LOGIN-001',
    verdict: 'FAILED',
    evidenceItems: [],
    failureAnalysis: {
      rootCause: 'HTTP 500',
      failureSignature: 'SIG-500',
      classification: 'PRODUCT_DEFECT',
      suggestedFix: 'Fix auth endpoint',
    },
    naturalLanguageExplanation: 'Test failed on Step 2 with HTTP 500.',
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
      url: 'https://malicious-website.com/evil.html',
    },
  } as unknown as IpcMainInvokeEvent;

  beforeEach(() => {
    mockSecureStorage = new MockSecureStorage();
    setSecureStorageForTest(mockSecureStorage);

    const mockAuthService = {
      validateSession: async (token: string) => {
        if (token === 'mock-valid-session-token') {
          return {
            userId: testUserId,
            email: 'test@example.com',
            sessionId: 'mock-session-id',
          };
        }
        throw new Error('Invalid session token');
      },
    } as unknown as AuthenticationService;
    setAuthServiceForTest(mockAuthService);
  });

  // =========================================================================
  // Invariant 1: Sender Frame Security
  // =========================================================================

  it('rejects untrusted sender frames with UNAUTHORIZED_SENDER', async () => {
    const result = await handleCreateAgentSession(untrustedEvent, {
      projectId: testProjectId,
      title: 'Untrusted session',
    });

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
      assert.ok(result.error.message.includes('Untrusted IPC sender'));
    }
  });

  // =========================================================================
  // Invariant 2: Authentication Enforcement
  // =========================================================================

  it('rejects unauthenticated requests with UNAUTHORIZED', async () => {
    mockSecureStorage.token = null; // simulate no token stored

    const result = await handleCreateAgentSession(trustedEvent, {
      projectId: testProjectId,
      title: 'Unauthenticated session',
    });

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'UNAUTHORIZED');
    }
  });

  // =========================================================================
  // Invariant 3: Payload Validation (Zod Schemas)
  // =========================================================================

  it('rejects invalid payload (malformed projectId) with AGENT_INVALID_REQUEST', async () => {
    const result = await handleCreateAgentSession(trustedEvent, {
      projectId: 'invalid-not-a-uuid',
      title: 'Bad UUID',
    } as any);

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'AGENT_INVALID_REQUEST');
    }
  });

  // =========================================================================
  // Invariant 4: Session Lifecycle IPC Handlers
  // =========================================================================

  it('creates an agent session successfully', async () => {
    const mockService = {
      createSession: async (input: any, userId: string) => {
        assert.strictEqual(input.projectId, testProjectId);
        assert.strictEqual(userId, testUserId);
        return mockSession;
      },
    } as unknown as ConversationalAgentService;
    setConversationalAgentServiceForTest(mockService);

    const result = await handleCreateAgentSession(trustedEvent, {
      projectId: testProjectId,
      title: 'Testing Login Flow',
    });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.data.id, testSessionId);
      assert.strictEqual(result.data.title, 'Testing Login Flow');
    }
  });

  it('gets an agent session successfully', async () => {
    const mockService = {
      getSession: async (input: any, userId: string) => {
        assert.strictEqual(input.sessionId, testSessionId);
        assert.strictEqual(input.projectId, testProjectId);
        return mockSession;
      },
    } as unknown as ConversationalAgentService;
    setConversationalAgentServiceForTest(mockService);

    const result = await handleGetAgentSession(trustedEvent, {
      sessionId: testSessionId,
      projectId: testProjectId,
    });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.data.id, testSessionId);
    }
  });

  it('lists agent sessions successfully', async () => {
    const mockService = {
      listSessions: async (input: any) => {
        assert.strictEqual(input.projectId, testProjectId);
        return [mockSession];
      },
    } as unknown as ConversationalAgentService;
    setConversationalAgentServiceForTest(mockService);

    const result = await handleListAgentSessions(trustedEvent, {
      projectId: testProjectId,
    });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.data.length, 1);
      assert.strictEqual(result.data[0]?.id, testSessionId);
    }
  });

  it('deletes an agent session successfully', async () => {
    let deletedSessionId = '';
    const mockService = {
      deleteSession: async (sessionId: string, projectId: string) => {
        deletedSessionId = sessionId;
      },
    } as unknown as ConversationalAgentService;
    setConversationalAgentServiceForTest(mockService);

    const result = await handleDeleteAgentSession(trustedEvent, {
      sessionId: testSessionId,
      projectId: testProjectId,
    });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(deletedSessionId, testSessionId);
      assert.strictEqual(result.data.sessionId, testSessionId);
      assert.strictEqual(result.data.success, true);
    }
  });

  // =========================================================================
  // Invariant 5: Messaging & Natural Language Testing
  // =========================================================================

  it('sends an agent message and receives response', async () => {
    const mockService = {
      handleUserMessage: async (input: any, userId: string) => {
        assert.strictEqual(input.sessionId, testSessionId);
        assert.strictEqual(input.content, 'Test the login flow');
        return mockMessageResponse;
      },
    } as unknown as ConversationalAgentService;
    setConversationalAgentServiceForTest(mockService);

    const result = await handleSendAgentMessage(trustedEvent, {
      sessionId: testSessionId,
      projectId: testProjectId,
      content: 'Test the login flow',
    });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.data.sessionStatus, 'COMPLETED');
      assert.ok(result.data.agentMessage.content.includes('Execution completed'));
    }
  });

  // =========================================================================
  // Invariant 6: Action Approval
  // =========================================================================

  it('handles action approval decision', async () => {
    const mockService = {
      handleApproval: async (input: any, userId: string) => {
        assert.strictEqual(input.approved, true);
        return mockApprovalResult;
      },
    } as unknown as ConversationalAgentService;
    setConversationalAgentServiceForTest(mockService);

    const result = await handleApproveAgentAction(trustedEvent, {
      sessionId: testSessionId,
      projectId: testProjectId,
      approved: true,
      reason: 'User approved execution',
    });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.data.approvalState, 'APPROVED');
    }
  });

  // =========================================================================
  // Invariant 7: Run Controls (START, CANCEL, RETRY, STOP)
  // =========================================================================

  it('handles run controls (e.g. CANCEL action)', async () => {
    const mockService = {
      handleRunControl: async (input: any, userId: string) => {
        assert.strictEqual(input.action, 'CANCEL');
        return {
          ...mockRunControlResult,
          action: 'CANCEL',
          runStatus: 'CANCELLED',
        };
      },
    } as unknown as ConversationalAgentService;
    setConversationalAgentServiceForTest(mockService);

    const result = await handleAgentRunControl(trustedEvent, {
      sessionId: testSessionId,
      projectId: testProjectId,
      action: 'CANCEL',
      runId: testRunId,
    });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.data.action, 'CANCEL');
      assert.strictEqual(result.data.runStatus, 'CANCELLED');
    }
  });

  // =========================================================================
  // Invariant 8: Grounded Evidence Queries
  // =========================================================================

  it('queries evidence and failure intelligence', async () => {
    const mockService = {
      queryEvidence: async (input: any, userId: string) => {
        assert.strictEqual(input.query, 'Why did this test fail?');
        return mockEvidenceResult;
      },
    } as unknown as ConversationalAgentService;
    setConversationalAgentServiceForTest(mockService);

    const result = await handleGetAgentEvidence(trustedEvent, {
      projectId: testProjectId,
      runId: testRunId,
      query: 'Why did this test fail?',
    });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.data.verdict, 'FAILED');
      assert.strictEqual(result.data.failureAnalysis?.classification, 'PRODUCT_DEFECT');
      assert.ok(result.data.naturalLanguageExplanation?.includes('HTTP 500'));
    }
  });

  // =========================================================================
  // Invariant 9: Domain Error Mapping
  // =========================================================================

  it('maps domain errors to corresponding DesktopErrorCode envelopes', async () => {
    const errorMappings: Array<[Error, string]> = [
      [new AgentSessionNotFoundError('s-1'), 'AGENT_SESSION_NOT_FOUND'],
      [new AgentAccessDeniedError('p-1', 'Denied'), 'AGENT_ACCESS_DENIED'],
      [new AgentInvalidRequestError('Invalid'), 'AGENT_INVALID_REQUEST'],
      [new AgentToolFailedError('tool', 'Failed'), 'AGENT_TOOL_FAILED'],
      [new AgentApprovalRequiredError('tool', 'Requires approval'), 'AGENT_APPROVAL_REQUIRED'],
      [new AgentRunNotFoundError('r-1'), 'AGENT_RUN_NOT_FOUND'],
      [new AgentEvidenceNotFoundError('e-1'), 'AGENT_EVIDENCE_NOT_FOUND'],
      [new AgentExecutionFailedError('Exec failed'), 'AGENT_EXECUTION_FAILED'],
    ];

    for (const [errInstance, expectedCode] of errorMappings) {
      const mockService = {
        getSession: async () => {
          throw errInstance;
        },
      } as unknown as ConversationalAgentService;
      setConversationalAgentServiceForTest(mockService);

      const result = await handleGetAgentSession(trustedEvent, {
        sessionId: testSessionId,
        projectId: testProjectId,
      });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, expectedCode);
      }
    }
  });
});
