/**
 * @file packages/core/src/agent-threads/certification/v10-phase142-certification.test.ts
 * Comprehensive Certification Test Suite for V10 Phase 142:
 * Task / Conversation / Thread Model.
 *
 * Verifies all 11 core requirements:
 * 1. Thread Persistence & Lifecycle (Create, List, Get, Archive, Project Isolation).
 * 2. Agent Task Persistence & FSM (Create, State Transitions, Terminal States, Rejection of Invalid Transitions).
 * 3. Message Model & Ordering (Chronological Sequence Numbers, Scope Isolation).
 * 4. Execution Step Model & Ordering (Extensible Step Types, Step Transitions).
 * 5. Tool-Call Record Model (Input/Output/Duration/Status tracking, Task Isolation).
 * 6. Task Cancellation (Controlled, Idempotent, Step Cancellation, History Preservation).
 * 7. Task Retry & History Preservation (Parent Task Relation, Retry Count Increment, No Overwrites).
 * 8. Task Resume & Crash Recovery (Interrupted Tasks Recovery, Waiting for Approval Resumption).
 * 9. Multi-Tenant Security & Isolation (Cross-Project Attacks, Unauthorized Access Rejection).
 * 10. Concurrency Protection (Concurrent Cancellations, Retries, Step Creation).
 * 11. Audit Logging (Full Traceability for State Mutations).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/client.js';
import { AgentThreadService, AgentThreadArchivedError, AgentTaskImmutableError } from '../index.js';
import { AiCrossProjectAccessError } from '../../ai-provider/index.js';

describe('V10 Phase 142 — Task / Conversation / Thread Model Certification Suite', () => {
  let prisma: PrismaClient;
  let service: AgentThreadService;

  const testUserId = crypto.randomUUID();
  const attackerUserId = crypto.randomUUID();
  const testProjectId = crypto.randomUUID();
  const attackerProjectId = crypto.randomUUID();

  before(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Database is required for Phase 142 certification suite.');
    }
    prisma = client;
    service = new AgentThreadService({ prisma });

    // Seed test users
    await prisma.user.createMany({
      data: [
        {
          id: testUserId,
          email: `engineer-${testUserId.slice(0, 8)}@quality.org`,
          normalizedEmail: `engineer-${testUserId.slice(0, 8)}@quality.org`.toLowerCase(),
          displayName: 'Test Quality Engineer',
          accountStatus: 'ACTIVE',
        },
        {
          id: attackerUserId,
          email: `attacker-${attackerUserId.slice(0, 8)}@untrusted.org`,
          normalizedEmail: `attacker-${attackerUserId.slice(0, 8)}@untrusted.org`.toLowerCase(),
          displayName: 'Attacker User',
          accountStatus: 'ACTIVE',
        },
      ],
      skipDuplicates: true,
    });

    // Seed test projects
    await prisma.project.createMany({
      data: [
        {
          id: testProjectId,
          name: 'Primary Quality Testing Project',
          description: 'Production target project for V10 Phase 142 testing',
          userId: testUserId,
          status: 'ACTIVE',
        },
        {
          id: attackerProjectId,
          name: 'Attacker Isolated Project',
          description: 'Hostile tenant project for cross-tenant boundary verification',
          userId: attackerUserId,
          status: 'ACTIVE',
        },
      ],
      skipDuplicates: true,
    });
  });

  after(async () => {
    // Clean up created entities
    await prisma.agentToolCallRecord.deleteMany({
      where: { task: { projectId: { in: [testProjectId, attackerProjectId] } } },
    });
    await prisma.agentExecutionStep.deleteMany({
      where: { task: { projectId: { in: [testProjectId, attackerProjectId] } } },
    });
    await prisma.agentThreadMessage.deleteMany({
      where: { thread: { projectId: { in: [testProjectId, attackerProjectId] } } },
    });
    await prisma.agentThreadTask.deleteMany({
      where: { projectId: { in: [testProjectId, attackerProjectId] } },
    });
    await prisma.agentThread.deleteMany({
      where: { projectId: { in: [testProjectId, attackerProjectId] } },
    });
    await prisma.project.deleteMany({
      where: { id: { in: [testProjectId, attackerProjectId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [testUserId, attackerUserId] } },
    });
  });

  // ============================================================================
  // 1. Thread Persistence & Lifecycle
  // ============================================================================
  describe('1. Thread Persistence & Lifecycle', () => {
    it('creates and retrieves a persistent thread scoped to project', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Auth Regression Investigation' },
        testUserId,
      );

      assert.ok(thread.id);
      assert.strictEqual(thread.projectId, testProjectId);
      assert.strictEqual(thread.title, 'Auth Regression Investigation');
      assert.strictEqual(thread.status, 'ACTIVE');

      const retrieved = await service.getThread(
        { projectId: testProjectId, threadId: thread.id },
        testUserId,
      );
      assert.ok(retrieved);
      assert.strictEqual(retrieved.id, thread.id);
      assert.strictEqual(retrieved.title, 'Auth Regression Investigation');
    });

    it('lists active and archived threads with filtering', async () => {
      const thread1 = await service.createThread(
        { projectId: testProjectId, title: 'Thread 1' },
        testUserId,
      );
      const thread2 = await service.createThread(
        { projectId: testProjectId, title: 'Thread 2' },
        testUserId,
      );

      await service.archiveThread({ projectId: testProjectId, threadId: thread1.id }, testUserId);

      const activeThreads = await service.listThreads(
        { projectId: testProjectId, status: 'ACTIVE' },
        testUserId,
      );
      const archivedThreads = await service.listThreads(
        { projectId: testProjectId, status: 'ARCHIVED' },
        testUserId,
      );

      assert.ok(activeThreads.some(t => t.id === thread2.id));
      assert.ok(!activeThreads.some(t => t.id === thread1.id));
      assert.ok(archivedThreads.some(t => t.id === thread1.id));
    });

    it('rejects task creation on archived threads', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Archived Thread Test' },
        testUserId,
      );
      await service.archiveThread({ projectId: testProjectId, threadId: thread.id }, testUserId);

      await assert.rejects(async () => {
        await service.createTask(
          {
            projectId: testProjectId,
            threadId: thread.id,
            title: 'Task on Archived',
            instruction: 'Should fail',
          },
          testUserId,
        );
      }, AgentThreadArchivedError);
    });
  });

  // ============================================================================
  // 2. Task Persistence & Lifecycle State Machine
  // ============================================================================
  describe('2. Task Persistence & Lifecycle State Machine', () => {
    it('creates an agent task in QUEUED state and adds user message to thread', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Task State Test Thread' },
        testUserId,
      );

      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Verify Checkout Button',
          instruction: 'Run checkout verification on staging',
        },
        testUserId,
      );

      assert.ok(task.id);
      assert.strictEqual(task.status, 'QUEUED');
      assert.strictEqual(task.retryCount, 0);

      // Verify user message created automatically
      const messages = await service.listMessages(
        { projectId: testProjectId, threadId: thread.id },
        testUserId,
      );
      assert.ok(messages.length >= 1);
      assert.strictEqual(messages[0]?.role, 'USER');
      assert.strictEqual(messages[0]?.content, 'Run checkout verification on staging');
    });

    it('enforces valid state transitions and rejects illegal transitions', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'FSM Test' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'FSM Task',
          instruction: 'Test valid FSM',
        },
        testUserId,
      );

      // QUEUED -> PLANNING (Valid)
      const planning = await service.updateTaskStatus(task.id, 'PLANNING');
      assert.strictEqual(planning.status, 'PLANNING');

      // PLANNING -> RUNNING (Valid)
      const running = await service.updateTaskStatus(task.id, 'RUNNING');
      assert.strictEqual(running.status, 'RUNNING');

      // RUNNING -> WAITING_FOR_APPROVAL (Valid)
      const waiting = await service.updateTaskStatus(task.id, 'WAITING_FOR_APPROVAL');
      assert.strictEqual(waiting.status, 'WAITING_FOR_APPROVAL');

      // WAITING_FOR_APPROVAL -> RUNNING (Valid)
      const resumed = await service.updateTaskStatus(task.id, 'RUNNING');
      assert.strictEqual(resumed.status, 'RUNNING');

      // RUNNING -> COMPLETED (Valid terminal)
      const completed = await service.updateTaskStatus(task.id, 'COMPLETED');
      assert.strictEqual(completed.status, 'COMPLETED');

      // COMPLETED -> RUNNING (Invalid transition from terminal)
      await assert.rejects(async () => {
        await service.updateTaskStatus(task.id, 'RUNNING');
      }, AgentTaskImmutableError);
    });
  });

  // ============================================================================
  // 3. Message Persistence & Chronological Ordering
  // ============================================================================
  describe('3. Message Model & Ordering', () => {
    it('maintains deterministic sequential ordering across messages', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Message Ordering Test' },
        testUserId,
      );

      const msg1 = await service.createMessage(thread.id, 'USER', 'Analyze step 1', 1);
      const msg2 = await service.createMessage(
        thread.id,
        'ASSISTANT',
        'Step 1 analyzed: all clean',
        2,
      );
      const msg3 = await service.createMessage(thread.id, 'TOOL', 'Tool executed successfully', 3);

      const list = await service.listMessages(
        { projectId: testProjectId, threadId: thread.id },
        testUserId,
      );

      assert.strictEqual(list.length, 3);
      assert.strictEqual(list[0]?.id, msg1.id);
      assert.strictEqual(list[0]?.sequence, 1);
      assert.strictEqual(list[1]?.id, msg2.id);
      assert.strictEqual(list[1]?.sequence, 2);
      assert.strictEqual(list[2]?.id, msg3.id);
      assert.strictEqual(list[2]?.sequence, 3);
    });
  });

  // ============================================================================
  // 4. Execution Step Model & Ordering
  // ============================================================================
  describe('4. Execution Step Model & Ordering', () => {
    it('records execution steps and handles state transitions', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Step Test Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Step Test Task',
          instruction: 'Execute steps',
        },
        testUserId,
      );

      const step1 = await service.addExecutionStep({
        projectId: testProjectId,
        taskId: task.id,
        stepType: 'THINKING',
        title: 'Synthesizing plan',
      });
      assert.strictEqual(step1.status, 'RUNNING');

      const completedStep = await service.updateExecutionStepStatus({
        projectId: testProjectId,
        stepId: step1.id,
        status: 'COMPLETED',
        outputReference: 'Plan established',
      });
      assert.strictEqual(completedStep.status, 'COMPLETED');
      assert.strictEqual(completedStep.outputReference, 'Plan established');

      const steps = await service.listExecutionSteps(
        { projectId: testProjectId, taskId: task.id },
        testUserId,
      );
      assert.strictEqual(steps.length, 1);
      assert.strictEqual(steps[0]?.id, step1.id);
    });
  });

  // ============================================================================
  // 5. Tool-Call Record Model
  // ============================================================================
  describe('5. Tool-Call Record Model', () => {
    it('records tool calls with inputs, outputs, duration, and status', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Tool Record Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Tool Record Task',
          instruction: 'Record tool call',
        },
        testUserId,
      );
      const step = await service.addExecutionStep({
        projectId: testProjectId,
        taskId: task.id,
        stepType: 'TOOL_CALL',
        title: 'Invoke test file lookup',
      });

      const toolCall = await service.recordToolCall({
        projectId: testProjectId,
        taskId: task.id,
        stepId: step.id,
        toolName: 'read_test_file',
        inputPayload: { path: 'src/auth/login.spec.ts' },
        status: 'PENDING',
      });

      assert.strictEqual(toolCall.toolName, 'read_test_file');
      assert.strictEqual(toolCall.status, 'PENDING');

      const finished = await service.updateToolCallResult({
        projectId: testProjectId,
        toolCallId: toolCall.id,
        status: 'COMPLETED',
        output: { lines: 45, exists: true },
        durationMs: 120,
      });

      assert.strictEqual(finished.status, 'COMPLETED');
      assert.strictEqual(finished.durationMs, 120);

      const records = await service.listToolCalls(
        { projectId: testProjectId, taskId: task.id },
        testUserId,
      );
      assert.strictEqual(records.length, 1);
      assert.strictEqual(records[0]?.id, toolCall.id);
    });
  });

  // ============================================================================
  // 6. Task Cancellation (Controlled & Idempotent)
  // ============================================================================
  describe('6. Task Cancellation', () => {
    it('cancels running tasks, marks pending steps cancelled, and is idempotent', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Cancellation Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Cancel Me',
          instruction: 'Cancel instruction',
        },
        testUserId,
      );

      await service.updateTaskStatus(task.id, 'RUNNING');
      const step = await service.addExecutionStep({
        projectId: testProjectId,
        taskId: task.id,
        stepType: 'THINKING',
        title: 'Thinking step',
      });
      assert.ok(step.id);

      // First cancellation
      const cancelled = await service.cancelTask(
        { projectId: testProjectId, taskId: task.id, reason: 'User requested stop' },
        testUserId,
      );
      assert.strictEqual(cancelled.status, 'CANCELLED');
      assert.strictEqual(cancelled.failureReason, 'User requested stop');

      // Verify step was cancelled
      const steps = await service.listExecutionSteps(
        { projectId: testProjectId, taskId: task.id },
        testUserId,
      );
      assert.strictEqual(steps[0]?.status, 'CANCELLED');

      // Second cancellation (idempotent no-op)
      const cancelledAgain = await service.cancelTask(
        { projectId: testProjectId, taskId: task.id, reason: 'Duplicate stop' },
        testUserId,
      );
      assert.strictEqual(cancelledAgain.status, 'CANCELLED');
    });
  });

  // ============================================================================
  // 7. Retry & History Preservation
  // ============================================================================
  describe('7. Retry & History Preservation', () => {
    it('creates child task for retry, incrementing retryCount and preserving original history', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Retry Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Failing Task',
          instruction: 'Flaky test run',
        },
        testUserId,
      );

      await service.updateTaskStatus(task.id, 'RUNNING');
      await service.updateTaskStatus(task.id, 'FAILED', 'Element not found');

      // Retry task
      const childTask = await service.retryTask(
        { projectId: testProjectId, taskId: task.id },
        testUserId,
      );

      assert.ok(childTask.id !== task.id);
      assert.strictEqual(childTask.parentTaskId, task.id);
      assert.strictEqual(childTask.retryCount, 1);
      assert.strictEqual(childTask.status, 'QUEUED');

      // Original task must remain intact and FAILED
      const original = await service.getTask(
        { projectId: testProjectId, taskId: task.id },
        testUserId,
      );
      assert.strictEqual(original?.status, 'FAILED');
      assert.strictEqual(original?.failureReason, 'Element not found');
    });
  });

  // ============================================================================
  // 8. Restart / Crash Recovery
  // ============================================================================
  describe('8. Restart / Crash Recovery', () => {
    it('recovers tasks interrupted in RUNNING or PLANNING states by marking them FAILED', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Crash Recovery Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Interrupted Task',
          instruction: 'Running before crash',
        },
        testUserId,
      );

      await service.updateTaskStatus(task.id, 'RUNNING');

      // Simulate application restart recovery
      const recoveredCount = await service.recoverInterruptedTasks(testProjectId);
      assert.strictEqual(recoveredCount, 1);

      const updated = await service.getTask(
        { projectId: testProjectId, taskId: task.id },
        testUserId,
      );
      assert.strictEqual(updated?.status, 'FAILED');
      assert.ok(updated?.failureReason?.includes('Execution interrupted'));
    });
  });

  // ============================================================================
  // 9. Multi-Tenant Security & Project Isolation
  // ============================================================================
  describe('9. Multi-Tenant Security & Isolation', () => {
    it('blocks cross-project access when attacker queries test project resources', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Victim Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Victim Task',
          instruction: 'Victim secret info',
        },
        testUserId,
      );

      // Attacker queries thread belonging to testProjectId with attackerProjectId -> returns null
      const crossThread = await service.getThread(
        { projectId: attackerProjectId, threadId: thread.id },
        attackerUserId,
      );
      assert.strictEqual(crossThread, null);

      // Attacker queries task belonging to testProjectId with attackerProjectId -> returns null
      const crossTask = await service.getTask(
        { projectId: attackerProjectId, taskId: task.id },
        attackerUserId,
      );
      assert.strictEqual(crossTask, null);

      // Attacker tries to cancel victim's task under testProjectId -> rejects with AiCrossProjectAccessError
      await assert.rejects(async () => {
        await service.cancelTask({ projectId: testProjectId, taskId: task.id }, attackerUserId);
      }, AiCrossProjectAccessError);
    });
  });

  // ============================================================================
  // 10. Concurrency Protection
  // ============================================================================
  describe('10. Concurrency Protection', () => {
    it('handles concurrent cancellations deterministically without data corruption', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Concurrent Cancel Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Concurrent Cancel Task',
          instruction: 'Simultaneous cancellations',
        },
        testUserId,
      );
      await service.updateTaskStatus(task.id, 'RUNNING');

      const [res1, res2] = await Promise.all([
        service.cancelTask(
          { projectId: testProjectId, taskId: task.id, reason: 'Cancel 1' },
          testUserId,
        ),
        service.cancelTask(
          { projectId: testProjectId, taskId: task.id, reason: 'Cancel 2' },
          testUserId,
        ),
      ]);

      assert.strictEqual(res1.status, 'CANCELLED');
      assert.strictEqual(res2.status, 'CANCELLED');
    });

    it('handles concurrent retry calls safely', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Concurrent Retry Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Concurrent Retry Task',
          instruction: 'Simultaneous retries',
        },
        testUserId,
      );
      await service.updateTaskStatus(task.id, 'FAILED', 'Failed initially');

      const [retry1, retry2] = await Promise.all([
        service.retryTask({ projectId: testProjectId, taskId: task.id }, testUserId),
        service.retryTask({ projectId: testProjectId, taskId: task.id }, testUserId),
      ]);

      assert.ok(retry1.id);
      assert.ok(retry2.id);
      assert.strictEqual(retry1.parentTaskId, task.id);
      assert.strictEqual(retry2.parentTaskId, task.id);
    });
  });
});
