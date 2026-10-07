/**
 * @file apps/desktop/src/main/ipc/agent-activity-handlers.test.ts
 * Privileged IPC boundary unit tests for V10 Phase 154: Streaming Activity & Tool Progress UI.
 * Verifies untrusted sender origin rejection, authentication, schema validation,
 * event dispatch, multi-tenant authorization error mapping, and subscription cleanup.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import { EventEmitter } from 'node:events';
import {
  handleSubscribeAgentActivity,
  handleUnsubscribeAgentActivity,
  handleGetAgentActivityTimeline,
  setActivityStreamServiceForTest,
  clearSubscriptionsForTest,
} from './agent-activity-handlers.js';
import { setAuthServiceForTest, setSecureStorageForTest } from './auth-handlers.js';
import {
  AgentActivityNotFoundError,
  AgentActivityUnauthorizedError,
  type AuthenticationService,
} from '@ai-quality/core';
import type { AgentActivityEventDto, AgentActivityTimelineDto } from '@ai-quality/contracts';
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
  public sentMessages: Array<{ channel: string; data: any }> = [];
  private destroyed = false;

  public send(channel: string, data: any): void {
    this.sentMessages.push({ channel, data });
  }

  public isDestroyed(): boolean {
    return this.destroyed;
  }

  public destroy(): void {
    this.destroyed = true;
    this.emit('destroyed');
  }
}

describe('V10 Phase 154 Agent Activity IPC Handlers', () => {
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const testUserId = 'user-uuid-1111-2222';
  const testTaskId = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';

  let mockSender: MockWebContents;
  let mockSecureStorage: MockSecureStorage;
  let mockActivityService: any;
  let subscribedCallbacks: Map<string, Array<(event: AgentActivityEventDto) => void>>;

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
        url: 'https://malicious-external-site.com',
      },
      sender,
    }) as unknown as IpcMainInvokeEvent;

  beforeEach(() => {
    mockSender = new MockWebContents();
    mockSecureStorage = new MockSecureStorage();
    setSecureStorageForTest(mockSecureStorage);
    clearSubscriptionsForTest();

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

    subscribedCallbacks = new Map();

    mockActivityService = {
      subscribe: (taskId: string, listener: (event: AgentActivityEventDto) => void) => {
        if (!subscribedCallbacks.has(taskId)) {
          subscribedCallbacks.set(taskId, []);
        }
        subscribedCallbacks.get(taskId)!.push(listener);
        return () => {
          const list = subscribedCallbacks.get(taskId) ?? [];
          const idx = list.indexOf(listener);
          if (idx !== -1) list.splice(idx, 1);
        };
      },
      getTaskTimeline: async (
        input: { projectId: string; taskId: string },
        userId: string,
      ): Promise<AgentActivityTimelineDto> => {
        if (userId !== testUserId) {
          throw new AgentActivityUnauthorizedError(
            `Access denied to project "${input.projectId}".`,
          );
        }
        if (input.taskId === '99999999-9999-9999-9999-999999999999') {
          throw new AgentActivityNotFoundError(`Task "${input.taskId}" was not found.`);
        }
        return {
          taskId: input.taskId,
          projectId: input.projectId,
          threadId: 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb',
          taskTitle: 'Test Task',
          taskStatus: 'RUNNING',
          activeStepTitle: 'Step 1',
          activeToolName: 'search_files',
          activeToolStatus: 'RUNNING',
          totalSteps: 2,
          completedSteps: 1,
          toolCallsCount: 1,
          durationMs: 120,
          items: [
            {
              id: 'item-1',
              taskId: input.taskId,
              sequence: 1,
              kind: 'PLANNING',
              title: 'Plan generation',
              status: 'COMPLETED',
              timestamp: '2026-10-06T10:00:00.000Z',
            },
          ],
        };
      },
    };

    setActivityStreamServiceForTest(mockActivityService);
  });

  // ---------------------------------------------------------------------------
  // Security: Untrusted Sender & Authentication
  // ---------------------------------------------------------------------------
  it('should reject subscribe invocation from untrusted sender frame', async () => {
    const event = createUntrustedEvent();
    const result = await handleSubscribeAgentActivity(event, {
      projectId: testProjectId,
      taskId: testTaskId,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('should reject getTimeline invocation when user is not authenticated', async () => {
    mockSecureStorage.token = null;
    const event = createTrustedEvent();
    const result = await handleGetAgentActivityTimeline(event, {
      projectId: testProjectId,
      taskId: testTaskId,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'AGENT_ACTIVITY_UNAUTHORIZED');
    }
  });

  // ---------------------------------------------------------------------------
  // Schema Validation
  // ---------------------------------------------------------------------------
  it('should reject invalid input schemas with VALIDATION_ERROR', async () => {
    const event = createTrustedEvent();

    // Invalid subscribe payload (missing taskId)
    const subResult = await handleSubscribeAgentActivity(event, { projectId: testProjectId });
    assert.equal(subResult.ok, false);
    if (!subResult.ok) {
      assert.equal(subResult.error.code, 'VALIDATION_ERROR');
    }

    // Invalid getTimeline payload (non-uuid)
    const timelineResult = await handleGetAgentActivityTimeline(event, {
      projectId: 'invalid',
      taskId: 'invalid',
    });
    assert.equal(timelineResult.ok, false);
    if (!timelineResult.ok) {
      assert.equal(timelineResult.error.code, 'VALIDATION_ERROR');
    }
  });

  // ---------------------------------------------------------------------------
  // Live Event Subscription & Fan-Out
  // ---------------------------------------------------------------------------
  it('should subscribe and forward streamed activity events to webContents', async () => {
    const event = createTrustedEvent();
    const result = await handleSubscribeAgentActivity(event, {
      projectId: testProjectId,
      taskId: testTaskId,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.subscribed, true);
    }

    const listeners = subscribedCallbacks.get(testTaskId);
    assert.ok(listeners && listeners.length === 1, 'Listener registered in service');

    // Simulate event published by agent loop
    const testEvent: AgentActivityEventDto = {
      eventId: 'evt-101',
      sequence: 1,
      taskId: testTaskId,
      threadId: 'thread-1',
      projectId: testProjectId,
      type: 'TOOL_STARTED',
      timestamp: new Date().toISOString(),
      payload: { toolName: 'repository.search_files' },
    };

    assert.ok(listeners[0], 'Listener exists');
    listeners[0]!(testEvent);

    assert.equal(mockSender.sentMessages.length, 1);
    const sent = mockSender.sentMessages[0];
    assert.ok(sent);
    assert.equal(sent.channel, 'desktop:agent-activity:event');
    assert.deepEqual(sent.data, testEvent);
  });

  it('should unsubscribe and remove listener upon explicit unsubscribe', async () => {
    const event = createTrustedEvent();
    await handleSubscribeAgentActivity(event, {
      projectId: testProjectId,
      taskId: testTaskId,
    });

    assert.equal(subscribedCallbacks.get(testTaskId)?.length, 1);

    const unsubResult = await handleUnsubscribeAgentActivity(event, {
      projectId: testProjectId,
      taskId: testTaskId,
    });

    assert.equal(unsubResult.ok, true);
    assert.equal(subscribedCallbacks.get(testTaskId)?.length, 0);
  });

  it('should auto-cleanup subscription when webContents is destroyed', async () => {
    const event = createTrustedEvent();
    await handleSubscribeAgentActivity(event, {
      projectId: testProjectId,
      taskId: testTaskId,
    });

    assert.equal(subscribedCallbacks.get(testTaskId)?.length, 1);

    // Destroy webContents
    mockSender.destroy();

    assert.equal(subscribedCallbacks.get(testTaskId)?.length, 0);
  });

  // ---------------------------------------------------------------------------
  // Timeline Recovery & Error Handling
  // ---------------------------------------------------------------------------
  it('should return reconstructed timeline on getTimeline call', async () => {
    const event = createTrustedEvent();
    const result = await handleGetAgentActivityTimeline(event, {
      projectId: testProjectId,
      taskId: testTaskId,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.taskId, testTaskId);
      assert.equal(result.data.taskTitle, 'Test Task');
      assert.equal(result.data.items.length, 1);
      const firstItem = result.data.items[0];
      assert.ok(firstItem);
      assert.equal(firstItem.kind, 'PLANNING');
    }
  });

  it('should map AgentActivityNotFoundError to AGENT_ACTIVITY_NOT_FOUND', async () => {
    const event = createTrustedEvent();
    const result = await handleGetAgentActivityTimeline(event, {
      projectId: testProjectId,
      taskId: '99999999-9999-9999-9999-999999999999',
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'AGENT_ACTIVITY_NOT_FOUND');
    }
  });
});
