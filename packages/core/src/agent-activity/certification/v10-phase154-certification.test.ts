/**
 * @file packages/core/src/agent-activity/certification/v10-phase154-certification.test.ts
 * Comprehensive certification test suite for V10 Phase 154: Streaming Activity / Tool Progress UI.
 *
 * Requirements Certified:
 * 1. Event schema validation across all event types
 * 2. Monotonic event sequence ordering per task
 * 3. Bounded circular buffer per task with capacity capping
 * 4. Comprehensive secret redaction and payload sanitization
 * 5. Reconnect & recovery from persistent database models
 * 6. Multi-tenant project and user isolation
 * 7. Live event subscription, fan-out, unsubscription, and error isolation
 * 8. AgentLoop lifecycle streaming integration (Task -> Steps -> Tools -> Completion)
 * 9. Approval pause event propagation
 * 10. Cancellation event emission and status fidelity
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  agentActivityEventSchema,
  agentActivityEventTypeSchema,
  agentActivityTimelineSchema,
  type AgentActivityEventDto,
} from '@ai-quality/contracts';
import {
  AgentActivityStreamService,
  sanitizeActivityPayload,
  sanitizeErrorMessage,
  AgentActivityNotFoundError,
  AgentActivityUnauthorizedError,
} from '../index.js';
import { AgentLoop } from '../../agent-loop/agent-loop.js';
import { AgentThreadService } from '../../agent-threads/agent-thread-service.js';
import { AgentPlanService } from '../../agent-planning/agent-plan-service.js';
import { ToolRegistryService } from '../../agent-tools/agent-tool-registry.js';
import { AgentPermissionService } from '../../agent-permissions/agent-permission-service.js';

describe('V10 Phase 154: Streaming Activity & Tool Progress UI Certification Suite', () => {
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const otherProjectId = '22222222-2222-2222-2222-222222222222';
  const testUserId = 'user-owner-1111';
  const otherUserId = 'user-other-2222';
  const testThreadId = 'cccccccc-1111-1111-1111-cccccccccccc';
  const testTaskId = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
  const otherTaskId = 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb';

  // In-memory mock database state
  let mockProjects: Array<{ id: string; userId: string }>;
  let mockThreads: Array<any>;
  let mockTasks: Array<any>;
  let mockExecutionSteps: Array<any>;
  let mockToolCalls: Array<any>;
  let mockApprovals: Array<any>;
  let mockPlans: Array<any>;
  let mockPlanSteps: Array<any>;
  let mockMessages: Array<any>;
  let mockAuditLogs: Array<any>;

  let mockPrisma: any;
  let service: AgentActivityStreamService;

  beforeEach(() => {
    AgentLoop.clearStateForTest();
    AgentActivityStreamService.clearStateForTest();

    mockProjects = [
      { id: testProjectId, userId: testUserId },
      { id: otherProjectId, userId: otherUserId },
    ];

    mockThreads = [
      {
        id: testThreadId,
        projectId: testProjectId,
        userId: testUserId,
        title: 'Debug Thread',
        status: 'ACTIVE',
        lastActivityAt: new Date(),
      },
    ];

    mockTasks = [
      {
        id: testTaskId,
        projectId: testProjectId,
        threadId: testThreadId,
        userId: testUserId,
        title: 'Execute test plan and diagnose bug',
        instruction: 'Diagnose shopping cart error and run tests',
        status: 'QUEUED',
        failureReason: null,
        retryCount: 0,
        parentTaskId: null,
        metadata: {},
        createdAt: new Date('2026-10-06T10:00:00.000Z'),
        updatedAt: new Date('2026-10-06T10:00:00.000Z'),
        startedAt: new Date('2026-10-06T10:00:00.000Z'),
        completedAt: null,
        cancelledAt: null,
      },
      {
        id: otherTaskId,
        projectId: otherProjectId,
        threadId: 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb',
        userId: otherUserId,
        title: 'Other task in different project',
        instruction: 'Do unauthorized work',
        status: 'QUEUED',
        failureReason: null,
        retryCount: 0,
        parentTaskId: null,
        metadata: {},
        createdAt: new Date('2026-10-06T10:00:00.000Z'),
        updatedAt: new Date('2026-10-06T10:00:00.000Z'),
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
      },
    ];

    mockExecutionSteps = [];
    mockToolCalls = [];
    mockApprovals = [];
    mockPlans = [];
    mockPlanSteps = [];
    mockMessages = [];
    mockAuditLogs = [];

    mockPrisma = {
      $transaction: async (cb: any) => cb(mockPrisma),
      project: {
        findFirst: async ({ where }: any) => {
          return (
            mockProjects.find(
              p => p.id === where.id && (!where.userId || p.userId === where.userId),
            ) || null
          );
        },
        findUnique: async ({ where }: any) => {
          return mockProjects.find(p => p.id === where.id) || null;
        },
      },
      agentThread: {
        findFirst: async ({ where }: any) => {
          return (
            mockThreads.find(
              t => t.id === where.id && (!where.projectId || t.projectId === where.projectId),
            ) || null
          );
        },
        findUnique: async ({ where }: any) => {
          return mockThreads.find(t => t.id === where.id) || null;
        },
        update: async ({ where, data }: any) => {
          const t = mockThreads.find(x => x.id === where.id);
          if (t) Object.assign(t, data);
          return t;
        },
      },
      agentThreadTask: {
        findFirst: async ({ where }: any) => {
          const task = mockTasks.find(
            t => t.id === where.id && (!where.projectId || t.projectId === where.projectId),
          );
          if (!task) return null;
          const executionSteps = mockExecutionSteps
            .filter(s => s.taskId === task.id)
            .sort((a, b) => a.sequence - b.sequence);
          const toolCalls = mockToolCalls
            .filter(c => c.taskId === task.id)
            .sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
          return {
            ...task,
            executionSteps,
            toolCalls,
          };
        },
        findUnique: async ({ where }: any) => {
          return mockTasks.find(t => t.id === where.id) || null;
        },
        update: async ({ where, data }: any) => {
          const task = mockTasks.find(t => t.id === where.id);
          if (task) {
            Object.assign(task, data);
            task.updatedAt = new Date();
          }
          return task;
        },
      },
      agentExecutionStep: {
        findMany: async ({ where }: any) => {
          return mockExecutionSteps
            .filter(s => s.taskId === where.taskId)
            .sort((a, b) => a.sequence - b.sequence);
        },
        findUnique: async ({ where }: any) => {
          const s = mockExecutionSteps.find(x => x.id === where.id);
          if (!s) return null;
          return { ...s, task: mockTasks.find(t => t.id === s.taskId) };
        },
        create: async ({ data }: any) => {
          const step = {
            id: `step-${mockExecutionSteps.length + 1}`,
            startedAt: new Date(),
            completedAt: null,
            ...data,
          };
          mockExecutionSteps.push(step);
          return step;
        },
        update: async ({ where, data }: any) => {
          const step = mockExecutionSteps.find(s => s.id === where.id);
          if (step) Object.assign(step, data);
          return step;
        },
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const s of mockExecutionSteps) {
            if (s.taskId === where.taskId && (!where.status || s.status === where.status)) {
              Object.assign(s, data);
              count++;
            }
          }
          return { count };
        },
        count: async ({ where }: any) => {
          return mockExecutionSteps.filter(s => s.taskId === where.taskId).length;
        },
      },
      agentToolCallRecord: {
        findMany: async ({ where }: any) => {
          return mockToolCalls
            .filter(c => c.taskId === where.taskId)
            .sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
        },
        create: async ({ data }: any) => {
          const call = {
            id: `tool-${mockToolCalls.length + 1}`,
            createdAt: new Date(),
            ...data,
          };
          mockToolCalls.push(call);
          return call;
        },
        findUnique: async ({ where }: any) => {
          const call = mockToolCalls.find(c => c.id === where.id);
          if (!call) return null;
          return { ...call, task: mockTasks.find(t => t.id === call.taskId) };
        },
        update: async ({ where, data }: any) => {
          const call = mockToolCalls.find(c => c.id === where.id);
          if (call) Object.assign(call, data);
          return call;
        },
        count: async ({ where }: any) => {
          return mockToolCalls.filter(c => c.taskId === where.taskId).length;
        },
      },
      agentToolApproval: {
        findMany: async ({ where }: any) => {
          return mockApprovals
            .filter(a => a.taskId === where.taskId)
            .sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
        },
        findFirst: async ({ where }: any) => {
          return (
            mockApprovals.find(
              a =>
                (!where.taskId || a.taskId === where.taskId) &&
                (!where.toolName || a.toolName === where.toolName) &&
                (!where.status || a.status === where.status),
            ) || null
          );
        },
        create: async ({ data }: any) => {
          const app = {
            id: `appr-${mockApprovals.length + 1}`,
            createdAt: new Date(),
            ...data,
          };
          mockApprovals.push(app);
          return app;
        },
        update: async ({ where, data }: any) => {
          const a = mockApprovals.find(x => x.id === where.id);
          if (a) Object.assign(a, data);
          return a;
        },
      },
      agentThreadMessage: {
        create: async ({ data }: any) => {
          const msg = {
            id: `msg-${mockMessages.length + 1}`,
            createdAt: new Date(),
            ...data,
          };
          mockMessages.push(msg);
          return msg;
        },
        count: async ({ where }: any) => {
          return mockMessages.filter(m => m.threadId === where.threadId).length;
        },
      },
      agentToolAuditLog: {
        create: async ({ data }: any) => {
          const log = { id: `log-${mockAuditLogs.length + 1}`, ...data, createdAt: new Date() };
          mockAuditLogs.push(log);
          return log;
        },
      },
      authAuditLog: {
        create: async () => ({ id: 'audit-log-id' }),
      },
      agentPlan: {
        findFirst: async ({ where, orderBy }: any) => {
          let list = [...mockPlans];
          if (where.taskId) list = list.filter(p => p.taskId === where.taskId);
          if (where.projectId) list = list.filter(p => p.projectId === where.projectId);
          if (where.isActive !== undefined) list = list.filter(p => p.isActive === where.isActive);
          if (orderBy?.version === 'desc') {
            list.sort((a, b) => b.version - a.version);
          }
          const item = list[0];
          if (!item) return null;
          const steps = mockPlanSteps
            .filter(s => s.planId === item.id)
            .sort((a, b) => a.sequence - b.sequence);
          return { ...item, steps };
        },
        findUnique: async ({ where }: any) => {
          const plan = mockPlans.find(p => p.id === where.id);
          if (!plan) return null;
          const steps = mockPlanSteps
            .filter(s => s.planId === plan.id)
            .sort((a, b) => a.sequence - b.sequence);
          return { ...plan, steps };
        },
        findUniqueOrThrow: async ({ where }: any) => {
          const plan = mockPlans.find(p => p.id === where.id);
          if (!plan) throw new Error(`Plan ${where.id} not found`);
          const steps = mockPlanSteps
            .filter(s => s.planId === plan.id)
            .sort((a, b) => a.sequence - b.sequence);
          return { ...plan, steps };
        },
        create: async ({ data }: any) => {
          const plan = {
            id: `plan-${mockPlans.length + 1}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data,
          };
          mockPlans.push(plan);
          return plan;
        },
        update: async ({ where, data }: any) => {
          const plan = mockPlans.find(p => p.id === where.id);
          if (plan) Object.assign(plan, data);
          const steps = mockPlanSteps
            .filter(s => s.planId === where.id)
            .sort((a, b) => a.sequence - b.sequence);
          return { ...plan, steps };
        },
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const plan of mockPlans) {
            if (where.taskId && plan.taskId !== where.taskId) continue;
            if (where.isActive !== undefined && plan.isActive !== where.isActive) continue;
            Object.assign(plan, data, { updatedAt: new Date() });
            count++;
          }
          return { count };
        },
      },
      agentPlanStep: {
        findMany: async ({ where }: any) => {
          return mockPlanSteps.filter(s => s.planId === where.planId);
        },
        create: async ({ data }: any) => {
          const step = {
            id: `plan-step-${mockPlanSteps.length + 1}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data,
          };
          mockPlanSteps.push(step);
          return step;
        },
        createMany: async ({ data }: any) => {
          for (const item of data) {
            mockPlanSteps.push({
              id: `plan-step-${mockPlanSteps.length + 1}`,
              createdAt: new Date(),
              updatedAt: new Date(),
              ...item,
            });
          }
          return { count: data.length };
        },
        update: async ({ where, data }: any) => {
          const s = mockPlanSteps.find(x => x.id === where.id);
          if (s) Object.assign(s, data);
          return s;
        },
      },
    };

    service = new AgentActivityStreamService({ prisma: mockPrisma });
  });

  // ---------------------------------------------------------------------------
  // 1. Event Schema Validation
  // ---------------------------------------------------------------------------
  it('1. should validate all 11 event types strictly and reject malformed schemas', () => {
    const validEventTypes = [
      'TASK_STARTED',
      'STEP_STARTED',
      'STEP_UPDATED',
      'TOOL_STARTED',
      'TOOL_PROGRESS',
      'TOOL_COMPLETED',
      'TOOL_FAILED',
      'APPROVAL_REQUIRED',
      'TASK_COMPLETED',
      'TASK_FAILED',
      'TASK_CANCELLED',
    ] as const;

    for (const eventType of validEventTypes) {
      assert.doesNotThrow(() => agentActivityEventTypeSchema.parse(eventType));

      const eventPayload: AgentActivityEventDto = {
        eventId: randomUUID(),
        taskId: testTaskId,
        threadId: testThreadId,
        projectId: testProjectId,
        sequence: 1,
        type: eventType,
        payload: { sample: 'value' },
        timestamp: new Date().toISOString(),
      };

      const validated = agentActivityEventSchema.parse(eventPayload);
      assert.equal(validated.type, eventType);
      assert.equal(validated.taskId, testTaskId);
    }

    // Malformed events must throw
    assert.throws(
      () =>
        agentActivityEventSchema.parse({
          eventId: '',
          taskId: testTaskId,
          sequence: -1,
          type: 'INVALID_EVENT_TYPE',
          payload: {},
          timestamp: 'invalid-date',
        }),
      /Invalid/,
    );
  });

  // ---------------------------------------------------------------------------
  // 2. Monotonic Event Ordering
  // ---------------------------------------------------------------------------
  it('2. should assign strictly monotonic sequence numbers per task', async () => {
    const evt1 = await service.publish({
      taskId: testTaskId,
      threadId: testThreadId,
      projectId: testProjectId,
      type: 'TASK_STARTED',
      payload: { status: 'RUNNING' },
    });
    const evt2 = await service.publish({
      taskId: testTaskId,
      threadId: testThreadId,
      projectId: testProjectId,
      type: 'STEP_STARTED',
      payload: { stepId: 's1', sequence: 1 },
    });
    const evt3 = await service.publish({
      taskId: testTaskId,
      threadId: testThreadId,
      projectId: testProjectId,
      type: 'TOOL_STARTED',
      payload: { toolName: 'repo.search' },
    });
    const evt4 = await service.publish({
      taskId: testTaskId,
      threadId: testThreadId,
      projectId: testProjectId,
      type: 'TOOL_COMPLETED',
      payload: { toolName: 'repo.search' },
    });

    assert.equal(evt1.sequence, 1);
    assert.equal(evt2.sequence, 2);
    assert.equal(evt3.sequence, 3);
    assert.equal(evt4.sequence, 4);

    // Independent task starts from sequence 1
    const otherEvt = await service.publish({
      taskId: otherTaskId,
      threadId: 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb',
      projectId: otherProjectId,
      type: 'TASK_STARTED',
      payload: { status: 'RUNNING' },
    });
    assert.equal(otherEvt.sequence, 1);

    // Continuing testTaskId increments to 5
    const evt5 = await service.publish({
      taskId: testTaskId,
      threadId: testThreadId,
      projectId: testProjectId,
      type: 'TASK_COMPLETED',
      payload: {},
    });
    assert.equal(evt5.sequence, 5);
  });

  // ---------------------------------------------------------------------------
  // 3. Circular Buffer Bounds & Event Retention
  // ---------------------------------------------------------------------------
  it('3. should enforce circular buffer capacity and prune oldest events when limit exceeded', async () => {
    const smallBufferService = new AgentActivityStreamService({
      prisma: mockPrisma,
      maxHistoryPerTask: 5,
    });

    for (let i = 1; i <= 8; i++) {
      await smallBufferService.publish({
        taskId: testTaskId,
        threadId: testThreadId,
        projectId: testProjectId,
        type: 'TOOL_PROGRESS',
        payload: { step: i },
      });
    }

    const inMemory = smallBufferService.getRecentEvents(testTaskId);
    assert.equal(inMemory.length, 5);
    // Sequence numbers should be the latest 5: 4, 5, 6, 7, 8
    assert.equal(inMemory[0]?.sequence, 4);
    assert.equal(inMemory[4]?.sequence, 8);
  });

  // ---------------------------------------------------------------------------
  // 4. Secret Redaction & Sanitization
  // ---------------------------------------------------------------------------
  it('4. should sanitize passwords, api keys, auth tokens, and sensitive headers from event payloads', () => {
    const rawPayload = {
      user: 'alice',
      password: 'superSecretPassword123!',
      apiKey: 'sk-proj-98471928471928371982',
      nested: {
        authorizationToken: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz',
        cookieHeader: 'connect.sid=s%3A_secret_cookie',
        databasePassword: 'pg_root_secret_pw',
      },
      safeArray: ['hello', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token123'],
    };

    const sanitized = sanitizeActivityPayload(rawPayload);

    assert.equal((sanitized as any).user, 'alice');
    assert.ok(
      (sanitized as any).password === '[REDACTED]' || (sanitized as any).password === '***',
    );
    assert.ok((sanitized as any).apiKey === '[REDACTED]' || (sanitized as any).apiKey === '***');
    assert.ok(
      (sanitized as any).nested.authorizationToken === '[REDACTED]' ||
        (sanitized as any).nested.authorizationToken === '***',
    );
    assert.ok(
      (sanitized as any).nested.cookieHeader === '[REDACTED]' ||
        (sanitized as any).nested.cookieHeader === '***',
    );
    assert.ok(
      (sanitized as any).nested.databasePassword === '[REDACTED]' ||
        (sanitized as any).nested.databasePassword === '***',
    );
    assert.equal((sanitized as any).safeArray[0], 'hello');
    assert.ok(!(sanitized as any).safeArray[1].includes('token123'));
  });

  it('5. should sanitize error messages containing passwords and bearer tokens', () => {
    const rawError =
      'Connection refused for postgres://user:SuperSecretPassword@localhost:5432 with Authorization Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token';

    const clean = sanitizeErrorMessage(rawError);
    assert.ok(!clean.includes('SuperSecretPassword'));
    assert.ok(!clean.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'));
    assert.ok(clean.includes('[REDACTED]') || clean.includes('***'));
  });

  // ---------------------------------------------------------------------------
  // 5. Reconnect & Recovery: Reconstructing Timeline from Persistence
  // ---------------------------------------------------------------------------
  it('6. should reconstruct full activity timeline from persistence on reconnect', async () => {
    // Populate mock database with persisted task execution artifacts
    mockExecutionSteps.push(
      {
        id: 'step-1',
        taskId: testTaskId,
        sequence: 1,
        title: 'Analyze Codebase',
        objective: 'Search for shopping cart total logic',
        status: 'COMPLETED',
        toolAction: 'repo.search',
        durationMs: 250,
        startedAt: new Date('2026-10-06T10:01:00.000Z'),
        completedAt: new Date('2026-10-06T10:01:00.250Z'),
        createdAt: new Date('2026-10-06T10:01:00.000Z'),
      },
      {
        id: 'step-2',
        taskId: testTaskId,
        sequence: 2,
        title: 'Run Tests',
        objective: 'Execute cart calculation test suite',
        status: 'RUNNING',
        toolAction: 'test.run',
        durationMs: null,
        startedAt: new Date('2026-10-06T10:02:00.000Z'),
        completedAt: null,
        createdAt: new Date('2026-10-06T10:02:00.000Z'),
      },
    );

    mockToolCalls.push({
      id: 'tool-call-1',
      taskId: testTaskId,
      stepId: 'step-1',
      toolId: 'repository.search_files',
      toolName: 'repository.search_files',
      input: { pattern: 'cart.calculateTotal', secretKey: 'secret-leaked' },
      output: { matches: ['src/cart.ts:42'] },
      status: 'SUCCESS',
      durationMs: 120,
      createdAt: new Date('2026-10-06T10:01:00.050Z'),
    });

    const timeline = await service.getTaskTimeline(
      { projectId: testProjectId, taskId: testTaskId },
      testUserId,
    );

    // Validate DTO structure matches contract
    agentActivityTimelineSchema.parse(timeline);

    assert.equal(timeline.taskId, testTaskId);
    assert.equal(timeline.projectId, testProjectId);
    assert.equal(timeline.activeStepTitle, 'Run Tests');
    assert.equal(timeline.activeToolName, 'test.run');
    assert.equal(timeline.activeToolStatus, 'RUNNING');

    // Should include analysis steps and tool calls in chronological order
    assert.ok(timeline.items.length >= 2);
    const toolItem = timeline.items.find(i => i.kind === 'TOOL_EXECUTION');
    assert.ok(toolItem, 'Tool execution item found');
    assert.equal(toolItem.toolName, 'repository.search_files');
    assert.equal(toolItem.toolStatus, 'SUCCESS');
    assert.equal(toolItem.durationMs, 120);
    // Secret was redacted from inputSummary
    assert.equal((toolItem.inputSummary as any).secretKey, '[REDACTED]');
  });

  // ---------------------------------------------------------------------------
  // 6. Multi-Tenant Project Authorization
  // ---------------------------------------------------------------------------
  it('7. should reject cross-project timeline access with AgentActivityUnauthorizedError', async () => {
    // Attempting to access otherTaskId (belongs to otherProjectId) with testProjectId
    await assert.rejects(
      async () => {
        await service.getTaskTimeline(
          { projectId: testProjectId, taskId: otherTaskId },
          testUserId,
        );
      },
      (err: any) => {
        assert.ok(err instanceof AgentActivityUnauthorizedError);
        assert.match(err.message, /Access denied/);
        return true;
      },
    );

    // Unauthorized user accessing legitimate project task
    await assert.rejects(
      async () => {
        await service.getTaskTimeline(
          { projectId: testProjectId, taskId: testTaskId },
          'unauthorized-rogue-user',
        );
      },
      (err: any) => {
        assert.ok(err instanceof AgentActivityUnauthorizedError);
        return true;
      },
    );
  });

  it('8. should throw AgentActivityNotFoundError when task does not exist', async () => {
    await assert.rejects(
      async () => {
        await service.getTaskTimeline(
          { projectId: testProjectId, taskId: 'non-existent-task-id' },
          testUserId,
        );
      },
      (err: any) => {
        assert.ok(err instanceof AgentActivityNotFoundError);
        return true;
      },
    );
  });

  // ---------------------------------------------------------------------------
  // 7. Live Event Subscriptions, Dispatch, and Error Isolation
  // ---------------------------------------------------------------------------
  it('9. should dispatch events to active subscribers and allow unsubscribing', async () => {
    const received1: AgentActivityEventDto[] = [];
    const received2: AgentActivityEventDto[] = [];

    const unsub1 = service.subscribe(testTaskId, event => {
      received1.push(event);
    });

    const unsub2 = service.subscribe(testTaskId, event => {
      received2.push(event);
    });

    await service.publish({
      taskId: testTaskId,
      threadId: testThreadId,
      projectId: testProjectId,
      type: 'TASK_STARTED',
      payload: { status: 'RUNNING' },
    });
    await service.publish({
      taskId: testTaskId,
      threadId: testThreadId,
      projectId: testProjectId,
      type: 'STEP_STARTED',
      payload: { stepId: 's1' },
    });

    assert.equal(received1.length, 2);
    assert.equal(received2.length, 2);

    // Unsubscribe subscriber 1
    unsub1();

    await service.publish({
      taskId: testTaskId,
      threadId: testThreadId,
      projectId: testProjectId,
      type: 'TASK_COMPLETED',
      payload: { durationMs: 500 },
    });

    assert.equal(received1.length, 2, 'Unsubscribed listener received no new events');
    assert.equal(received2.length, 3, 'Active listener received the completion event');

    unsub2();
  });

  it('10. should isolate subscriber errors without impacting other listeners or throw', async () => {
    const received: AgentActivityEventDto[] = [];

    // Rogue listener that throws on event
    service.subscribe(testTaskId, () => {
      throw new Error('Listener crash');
    });

    // Good listener
    service.subscribe(testTaskId, event => {
      received.push(event);
    });

    await assert.doesNotReject(async () => {
      await service.publish({
        taskId: testTaskId,
        threadId: testThreadId,
        projectId: testProjectId,
        type: 'TOOL_PROGRESS',
        payload: { progress: 50 },
      });
    });

    assert.equal(received.length, 1);
  });

  // ---------------------------------------------------------------------------
  // 8. Approval & Terminal Items in Timeline
  // ---------------------------------------------------------------------------
  it('11. should map approvals, failures, and cancellations into the timeline DTO', async () => {
    // 1. Add approval item
    mockApprovals.push({
      id: 'appr-1',
      taskId: testTaskId,
      toolId: 'terminal.execute',
      toolName: 'terminal.execute',
      arguments: { cmd: 'rm -rf /tmp/cache' },
      status: 'PENDING',
      reason: 'Executing system command requires authorization',
      createdAt: new Date('2026-10-06T10:03:00.000Z'),
    });

    // 2. Mark task as cancelled
    const task = mockTasks.find(t => t.id === testTaskId);
    task.status = 'CANCELLED';
    task.cancelledAt = new Date('2026-10-06T10:04:00.000Z');

    const timeline = await service.getTaskTimeline(
      { projectId: testProjectId, taskId: testTaskId },
      testUserId,
    );

    const approvalItem = timeline.items.find(i => i.kind === 'APPROVAL_WAITING');
    assert.ok(approvalItem, 'Approval item present in timeline');
    assert.equal(approvalItem.toolName, 'terminal.execute');
    assert.equal(approvalItem.status, 'PENDING');

    const cancellationItem = timeline.items.find(i => i.kind === 'CANCELLATION');
    assert.ok(cancellationItem, 'Cancellation item present in timeline');
    assert.equal(cancellationItem.status, 'CANCELLED');
  });

  // ---------------------------------------------------------------------------
  // 9. Integration with AgentLoop
  // ---------------------------------------------------------------------------
  it('12. should stream live activity events during AgentLoop execution', async () => {
    const threadService = new AgentThreadService({ prisma: mockPrisma });
    const planService = new AgentPlanService({ prisma: mockPrisma });
    const permissionService = new AgentPermissionService({ prisma: mockPrisma });
    const toolRegistry = new ToolRegistryService({
      prisma: mockPrisma,
      permissionService,
    });

    // Register test tool
    toolRegistry.registerTool({
      toolId: 'test.live_diagnostic',
      name: 'Run Diagnostic',
      description: 'Test diagnostic tool',
      version: '1.0.0',
      category: 'TESTS',
      permissionLevel: 'READ',
      enabled: true,
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      handler: async () => ({ status: 'passed' }),
    });

    const loop = new AgentLoop({
      prisma: mockPrisma,
      threadService,
      planService,
      toolRegistry,
      activityStream: service,
    });

    const streamedEvents: AgentActivityEventDto[] = [];
    service.subscribe(testTaskId, event => {
      streamedEvents.push(event);
    });

    // Create an active plan with 1 step
    await planService.createPlan(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        summary: 'Live diagnostic plan',
        steps: [
          {
            stepId: 'step-1',
            sequence: 1,
            title: 'Diagnostic Step',
            objective: 'Run test diagnostic',
            toolAction: 'test.live_diagnostic',
            structuredInput: {},
            dependencies: [],
          },
        ],
      },
      testUserId,
    );

    // Run task with synthetic test action
    const runResult = await loop.run(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
      },
      testUserId,
    );

    assert.equal(runResult.status, 'COMPLETED');

    // Verify stream captured expected lifecycle events
    const eventTypes = streamedEvents.map(e => e.type);
    assert.ok(eventTypes.includes('TASK_STARTED'), 'Emitted TASK_STARTED');
    assert.ok(eventTypes.includes('STEP_STARTED'), 'Emitted STEP_STARTED');
    assert.ok(eventTypes.includes('TOOL_STARTED'), 'Emitted TOOL_STARTED');
    assert.ok(eventTypes.includes('TOOL_COMPLETED'), 'Emitted TOOL_COMPLETED');
    assert.ok(eventTypes.includes('STEP_UPDATED'), 'Emitted STEP_UPDATED');
    assert.ok(eventTypes.includes('TASK_COMPLETED'), 'Emitted TASK_COMPLETED');

    // Monotonic sequences
    for (let i = 0; i < streamedEvents.length; i++) {
      assert.equal(streamedEvents[i]!.sequence, i + 1);
    }
  });
});
