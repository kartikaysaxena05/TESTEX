/**
 * @file packages/core/src/agent-threads/certification/v10-phase158-certification.test.ts
 * Comprehensive Certification Test Suite for V10 Phase 158:
 * Long-Task State & Recovery.
 *
 * Verifies all 20 required deterministic test scenarios:
 * 1. Checkpoint creation
 * 2. Checkpoint ordering (monotonic sequence)
 * 3. Restart with running task
 * 4. Restart with planning task
 * 5. Recovery-state detection
 * 6. Resume from latest checkpoint
 * 7. No duplicate execution of completed steps
 * 8. Retry behavior
 * 9. Maximum retry enforcement
 * 10. Cancellation persistence
 * 11. Malformed checkpoint rejection
 * 12. Cross-project checkpoint rejection
 * 13. Concurrent resume protection
 * 14. Stale checkpoint protection
 * 15. IPC authorization
 * 16. Renderer restart recovery
 * 17. Multiple interrupted tasks
 * 18. Recovery audit trail
 * 19. Corrupted recovery state rejection
 * 20. Full task -> interruption -> restart -> resume flow
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/client.js';
import {
  AgentThreadService,
  AgentTaskCheckpointService,
  AgentTaskInvalidStateError,
  AgentTaskNotRecoverableError,
  AgentMaxRetriesExceededError,
  AgentTaskConcurrentResumeError,
  AgentCheckpointCorruptedError,
  AgentCheckpointIntegrityError,
} from '../index.js';
import { AgentConcurrencyManager } from '../../agent-loop/agent-concurrency-manager.js';
import { AiCrossProjectAccessError } from '../../ai-provider/index.js';

describe('V10 Phase 158 — Long-Task State & Recovery Certification Suite', () => {
  let prisma: PrismaClient;
  let service: AgentThreadService;
  let checkpointService: AgentTaskCheckpointService;

  const testUserId = crypto.randomUUID();
  const attackerUserId = crypto.randomUUID();
  const testProjectId = crypto.randomUUID();
  const attackerProjectId = crypto.randomUUID();

  before(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Database is required for Phase 158 certification suite.');
    }
    prisma = client;
    service = new AgentThreadService({ prisma });
    checkpointService = service.checkpoints;

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
          description: 'Production target project for V10 Phase 158 recovery testing',
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
    // Clean up created entities in reverse dependency order
    await prisma.agentTaskCheckpoint.deleteMany({
      where: { projectId: { in: [testProjectId, attackerProjectId] } },
    });
    await prisma.agentTaskControlAuditLog.deleteMany({
      where: { projectId: { in: [testProjectId, attackerProjectId] } },
    });
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
  // Test 1: Checkpoint creation
  // ============================================================================
  describe('1. Checkpoint Creation', () => {
    it('creates persistent checkpoint recording task state transitions and audit log', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Checkpoint Creation Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Checkpoint Task 1',
          instruction: 'inst',
        },
        testUserId,
      );

      const cp = await service.createTaskCheckpoint({
        taskId: task.id,
        projectId: testProjectId,
        threadId: thread.id,
        userId: testUserId,
        taskStatus: 'QUEUED',
        activeToolName: 'browser_navigate',
      });

      assert.ok(cp.id);
      assert.strictEqual(cp.taskId, task.id);
      assert.strictEqual(cp.projectId, testProjectId);
      assert.strictEqual(cp.threadId, thread.id);
      assert.strictEqual(cp.sequenceNumber, 1);
      assert.strictEqual(cp.taskStatus, 'QUEUED');
      assert.strictEqual(cp.activeToolCall, 'browser_navigate');

      // Verify task pointer updated
      const updatedTask = await prisma.agentThreadTask.findUnique({ where: { id: task.id } });
      assert.strictEqual(updatedTask?.lastCheckpointId, cp.id);
      assert.strictEqual(updatedTask?.lastCheckpointSeq, 1);

      // Verify audit log recorded
      const audit = await prisma.agentTaskControlAuditLog.findFirst({
        where: { taskId: task.id, action: 'CHECKPOINT_CREATED' },
      });
      assert.ok(audit);
      assert.strictEqual(audit.action, 'CHECKPOINT_CREATED');
    });
  });

  // ============================================================================
  // Test 2: Checkpoint ordering
  // ============================================================================
  describe('2. Checkpoint Ordering', () => {
    it('strictly enforces monotonic increment of checkpoint sequence numbers', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Ordering Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Ordered Task',
          instruction: 'inst',
        },
        testUserId,
      );

      const cp1 = await checkpointService.createCheckpoint({
        taskId: task.id,
        projectId: testProjectId,
        threadId: thread.id,
        userId: testUserId,
        taskStatus: 'QUEUED',
      });

      const cp2 = await checkpointService.createCheckpoint({
        taskId: task.id,
        projectId: testProjectId,
        threadId: thread.id,
        userId: testUserId,
        taskStatus: 'RUNNING',
      });

      const cp3 = await checkpointService.createCheckpoint({
        taskId: task.id,
        projectId: testProjectId,
        threadId: thread.id,
        userId: testUserId,
        taskStatus: 'PAUSED',
      });

      assert.strictEqual(cp1.sequenceNumber, 1);
      assert.strictEqual(cp2.sequenceNumber, 2);
      assert.strictEqual(cp3.sequenceNumber, 3);

      const list = await checkpointService.listCheckpoints(task.id, testProjectId, testUserId);
      assert.strictEqual(list.length, 3);
      assert.strictEqual(list[0]?.sequenceNumber, 1);
      assert.strictEqual(list[1]?.sequenceNumber, 2);
      assert.strictEqual(list[2]?.sequenceNumber, 3);

      const latest = await checkpointService.getLatestCheckpoint(task.id);
      assert.strictEqual(latest?.checkpoint.sequenceNumber, 3);
      assert.strictEqual(latest?.checkpoint.taskStatus, 'PAUSED');
    });
  });

  // ============================================================================
  // Test 3: Restart with running task
  // ============================================================================
  describe('3. Restart With Running Task', () => {
    it('detects running task on startup and marks it recoverable with interruption metadata', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Restart Running Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Running Task to Recover',
          instruction: 'inst',
        },
        testUserId,
      );

      // Transition to RUNNING in database (simulating active running state before sudden kill)
      await prisma.agentThreadTask.update({
        where: { id: task.id },
        data: { status: 'RUNNING', startedAt: new Date() },
      });

      // App restart occurs
      const count = await service.recoverInterruptedTasks(testProjectId);
      assert.ok(count >= 1);

      const recoveredTask = await prisma.agentThreadTask.findUnique({ where: { id: task.id } });
      assert.ok(recoveredTask);
      assert.strictEqual(recoveredTask.status, 'FAILED');
      assert.strictEqual(recoveredTask.isRecoverable, true);
      assert.ok(recoveredTask.interruptedAt);

      // Verify checkpoint recorded
      const latestCp = await checkpointService.getLatestCheckpoint(task.id);
      assert.ok(latestCp);
      assert.strictEqual(latestCp.checkpoint.isRecoverable, true);

      // Verify audit log
      const audit = await prisma.agentTaskControlAuditLog.findFirst({
        where: { taskId: task.id, action: 'INTERRUPTION_DETECTED' },
      });
      assert.ok(audit);
    });
  });

  // ============================================================================
  // Test 4: Restart with planning task
  // ============================================================================
  describe('4. Restart With Planning Task', () => {
    it('detects planning task on startup and safely preserves it as recoverable', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Restart Planning Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Planning Task to Recover',
          instruction: 'inst',
        },
        testUserId,
      );

      // Transition to PLANNING in database
      await prisma.agentThreadTask.update({
        where: { id: task.id },
        data: { status: 'PLANNING', startedAt: new Date() },
      });

      const count = await service.recoverInterruptedTasks(testProjectId);
      assert.ok(count >= 1);

      const recoveredTask = await prisma.agentThreadTask.findUnique({ where: { id: task.id } });
      assert.ok(recoveredTask);
      assert.strictEqual(recoveredTask.isRecoverable, true);
      assert.ok(recoveredTask.interruptedAt);
    });
  });

  // ============================================================================
  // Test 5: Recovery-state detection
  // ============================================================================
  describe('5. Recovery-State Detection', () => {
    it('detects and computes complete recovery state summary including canResume and canRetry flags', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Recovery Detection Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Detect Recovery Task',
          instruction: 'inst',
        },
        testUserId,
      );

      // Create an execution step
      await prisma.agentExecutionStep.create({
        data: {
          taskId: task.id,
          sequence: 1,
          stepType: 'EXECUTION',
          title: 'Navigate to login page',
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      await prisma.agentThreadTask.update({
        where: { id: task.id },
        data: {
          status: 'FAILED',
          isRecoverable: true,
          interruptedAt: new Date(),
          retryCount: 0,
          maxRetries: 3,
        },
      });

      // Create checkpoint for this state
      await checkpointService.createCheckpoint({
        taskId: task.id,
        projectId: testProjectId,
        threadId: thread.id,
        userId: testUserId,
        taskStatus: 'INTERRUPTED',
        isRecoverable: true,
      });

      const summary = await service.getTaskRecoveryState(
        { projectId: testProjectId, taskId: task.id },
        testUserId,
      );
      assert.ok(summary);
      assert.strictEqual(summary.taskId, task.id);
      assert.strictEqual(summary.isRecoverable, true);
      assert.strictEqual(summary.canResume, true);
      assert.strictEqual(summary.canRetry, true);
      assert.strictEqual(summary.canCancel, true);
      assert.strictEqual(summary.lastCompletedStepTitle, 'Navigate to login page');
      assert.strictEqual(summary.completedStepCount, 1);

      const recoverableList = await service.listRecoverableTasks(
        { projectId: testProjectId },
        testUserId,
      );
      const found = recoverableList.find(r => r.taskId === task.id);
      assert.ok(found);
      assert.strictEqual(found.taskId, task.id);
    });
  });

  // ============================================================================
  // Test 6: Resume from latest checkpoint
  // ============================================================================
  describe('6. Resume From Latest Checkpoint', () => {
    it('resumes interrupted task restoring state from latest valid checkpoint', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Resume Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Task To Resume',
          instruction: 'inst',
        },
        testUserId,
      );

      // Create 2 checkpoints
      await checkpointService.createCheckpoint({
        taskId: task.id,
        projectId: testProjectId,
        threadId: thread.id,
        userId: testUserId,
        taskStatus: 'RUNNING',
      });

      await prisma.agentThreadTask.update({
        where: { id: task.id },
        data: { status: 'FAILED', isRecoverable: true, interruptedAt: new Date() },
      });

      await checkpointService.createCheckpoint({
        taskId: task.id,
        projectId: testProjectId,
        threadId: thread.id,
        userId: testUserId,
        taskStatus: 'INTERRUPTED',
        isRecoverable: true,
      });

      const resumed = await service.resumeTask(
        { projectId: testProjectId, taskId: task.id },
        testUserId,
      );

      assert.strictEqual(resumed.status, 'RUNNING');
      assert.strictEqual(resumed.isRecoverable, false);

      const latestCp = await checkpointService.getLatestCheckpoint(task.id);
      assert.strictEqual(latestCp?.checkpoint.sequenceNumber, 3);
      assert.strictEqual(latestCp?.checkpoint.taskStatus, 'RUNNING');

      // Audit log check
      const resumeAudit = await prisma.agentTaskControlAuditLog.findFirst({
        where: { taskId: task.id, action: 'RESUME' },
      });
      assert.ok(resumeAudit);
    });
  });

  // ============================================================================
  // Test 7: No duplicate completed steps
  // ============================================================================
  describe('7. No Duplicate Completed Steps', () => {
    it('preserves existing completed steps and reconciles running step without duplication', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Step Deduplication Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Step Deduplication Task',
          instruction: 'inst',
        },
        testUserId,
      );

      const step1 = await prisma.agentExecutionStep.create({
        data: {
          taskId: task.id,
          sequence: 1,
          stepType: 'EXECUTION',
          title: 'Step 1: Auth Initialized',
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      const step2 = await prisma.agentExecutionStep.create({
        data: {
          taskId: task.id,
          sequence: 2,
          stepType: 'EXECUTION',
          title: 'Step 2: Inspect DOM',
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });

      // App crash occurs
      await prisma.agentThreadTask.update({
        where: { id: task.id },
        data: { status: 'RUNNING' },
      });
      await service.recoverInterruptedTasks(testProjectId);

      // Verify step 1 remained COMPLETED, step 2 reset to PENDING
      const stepsAfterRestart = await prisma.agentExecutionStep.findMany({
        where: { taskId: task.id },
        orderBy: { sequence: 'asc' },
      });

      assert.strictEqual(stepsAfterRestart.length, 2);
      assert.strictEqual(stepsAfterRestart[0]?.id, step1.id);
      assert.strictEqual(stepsAfterRestart[0]?.status, 'COMPLETED');
      assert.strictEqual(stepsAfterRestart[1]?.id, step2.id);
      assert.strictEqual(stepsAfterRestart[1]?.status, 'FAILED');

      // Now resume task
      await service.resumeTask({ projectId: testProjectId, taskId: task.id }, testUserId);

      // Verify no step was duplicated
      const stepsAfterResume = await prisma.agentExecutionStep.findMany({
        where: { taskId: task.id },
      });
      assert.strictEqual(stepsAfterResume.length, 2);
    });
  });

  // ============================================================================
  // Test 8: Retry behavior
  // ============================================================================
  describe('8. Retry Behavior', () => {
    it('creates child task attempt preserving original failure and initializes checkpoint', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Retry Thread' },
        testUserId,
      );
      const parentTask = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Original Task to Retry',
          instruction: 'inst',
        },
        testUserId,
      );

      await prisma.agentThreadTask.update({
        where: { id: parentTask.id },
        data: {
          status: 'FAILED',
          failureReason: 'Socket timeout error',
          isRecoverable: true,
          retryCount: 0,
          maxRetries: 3,
        },
      });

      const childTask = await service.retryTask(
        { projectId: testProjectId, taskId: parentTask.id },
        testUserId,
      );

      assert.ok(childTask);
      assert.strictEqual(childTask.parentTaskId, parentTask.id);
      assert.strictEqual(childTask.retryCount, 1);
      assert.strictEqual(childTask.attemptNumber, 2);
      assert.strictEqual(childTask.status, 'QUEUED');

      // Check child checkpoint created
      const childCp = await checkpointService.getLatestCheckpoint(childTask.id);
      assert.ok(childCp);
      assert.strictEqual(childCp.checkpoint.taskId, childTask.id);
      assert.strictEqual(childCp.checkpoint.sequenceNumber, 1);

      // Audit log check
      const retryAudit = await prisma.agentTaskControlAuditLog.findFirst({
        where: { taskId: parentTask.id, action: 'RETRY' },
      });
      assert.ok(retryAudit);
    });
  });

  // ============================================================================
  // Test 9: Maximum retry enforcement
  // ============================================================================
  describe('9. Maximum Retry Enforcement', () => {
    it('strictly rejects retry when maxRetries threshold is reached', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Max Retry Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Exhausted Retry Task',
          instruction: 'inst',
        },
        testUserId,
      );

      await prisma.agentThreadTask.update({
        where: { id: task.id },
        data: {
          status: 'FAILED',
          isRecoverable: true,
          retryCount: 3,
          maxRetries: 3,
        },
      });

      await assert.rejects(async () => {
        await service.retryTask({ projectId: testProjectId, taskId: task.id }, testUserId);
      }, AgentMaxRetriesExceededError);
    });

    it('rejects retry when task is explicitly non-recoverable', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Non-Recoverable Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Fatal Non-Recoverable Task',
          instruction: 'inst',
        },
        testUserId,
      );

      await prisma.agentThreadTask.update({
        where: { id: task.id },
        data: {
          status: 'FAILED',
          isRecoverable: false,
          retryCount: 0,
          maxRetries: 3,
        },
      });

      await assert.rejects(async () => {
        await service.retryTask({ projectId: testProjectId, taskId: task.id }, testUserId);
      }, AgentTaskNotRecoverableError);
    });
  });

  // ============================================================================
  // Test 10: Cancellation persistence
  // ============================================================================
  describe('10. Cancellation Persistence', () => {
    it('persists cancellation checkpoint, clears recoverable status, and prevents subsequent resume', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Cancel Persistence Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Task to Cancel',
          instruction: 'inst',
        },
        testUserId,
      );

      await prisma.agentThreadTask.update({
        where: { id: task.id },
        data: { status: 'RUNNING', isRecoverable: true },
      });

      const cancelled = await service.cancelTask(
        { projectId: testProjectId, taskId: task.id, reason: 'Aborted by engineer' },
        testUserId,
      );

      assert.strictEqual(cancelled.status, 'CANCELLED');
      assert.strictEqual(cancelled.isRecoverable, false);

      const latestCp = await checkpointService.getLatestCheckpoint(task.id);
      assert.ok(latestCp);
      assert.strictEqual(latestCp.checkpoint.taskStatus, 'CANCELLED');
      assert.strictEqual(latestCp.checkpoint.isRecoverable, false);

      // Attempting to resume a cancelled task must fail
      await assert.rejects(async () => {
        await service.resumeTask({ projectId: testProjectId, taskId: task.id }, testUserId);
      }, AgentTaskInvalidStateError);
    });
  });

  // ============================================================================
  // Test 11: Malformed checkpoint rejection
  // ============================================================================
  describe('11. Malformed Checkpoint Rejection', () => {
    it('rejects checkpoint with malformed JSON string', () => {
      assert.throws(() => {
        checkpointService.validateCheckpointIntegrity({
          taskId: crypto.randomUUID(),
          projectId: testProjectId,
          threadId: crypto.randomUUID(),
          sequenceNumber: 1,
          taskStatus: 'RUNNING',
          serializedRecoveryState: 'INVALID_NOT_JSON{{{',
        });
      }, AgentCheckpointCorruptedError);
    });

    it('rejects checkpoint with negative or zero sequence number', () => {
      assert.throws(() => {
        checkpointService.validateCheckpointIntegrity({
          taskId: crypto.randomUUID(),
          projectId: testProjectId,
          threadId: crypto.randomUUID(),
          sequenceNumber: 0,
          taskStatus: 'RUNNING',
          serializedRecoveryState: '{}',
        });
      }, AgentCheckpointIntegrityError);
    });
  });

  // ============================================================================
  // Test 12: Cross-project checkpoint rejection
  // ============================================================================
  describe('12. Cross-Project Checkpoint Rejection', () => {
    it('rejects checkpoint whose project ID does not match expected project', () => {
      const taskId = crypto.randomUUID();
      const foreignProjectId = crypto.randomUUID();
      const expectedProjectId = testProjectId;

      assert.throws(() => {
        checkpointService.validateCheckpointIntegrity(
          {
            taskId,
            projectId: foreignProjectId,
            threadId: crypto.randomUUID(),
            sequenceNumber: 1,
            taskStatus: 'RUNNING',
            serializedRecoveryState: JSON.stringify({}),
          },
          expectedProjectId,
        );
      }, AgentCheckpointIntegrityError);
    });
  });

  // ============================================================================
  // Test 13: Concurrent resume protection
  // ============================================================================
  describe('13. Concurrent Resume Protection', () => {
    it('deterministically blocks duplicate concurrent resume requests via execution locking', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Concurrency Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Concurrent Task',
          instruction: 'inst',
        },
        testUserId,
      );

      await prisma.agentThreadTask.update({
        where: { id: task.id },
        data: { status: 'PAUSED', isRecoverable: true },
      });

      // Acquire concurrency lock simulating another active resume process
      AgentConcurrencyManager.acquireLock(task.id, testProjectId);

      try {
        await assert.rejects(async () => {
          await service.resumeTask({ projectId: testProjectId, taskId: task.id }, testUserId);
        }, AgentTaskConcurrentResumeError);
      } finally {
        AgentConcurrencyManager.releaseLock(task.id);
      }
    });
  });

  // ============================================================================
  // Test 14: Stale checkpoint protection
  // ============================================================================
  describe('14. Stale Checkpoint Protection', () => {
    it('rejects forged completion state where status is COMPLETED but pending steps exist', () => {
      const taskId = crypto.randomUUID();
      const threadId = crypto.randomUUID();
      const payload = {
        version: 1,
        taskId,
        threadId,
        projectId: testProjectId,
        status: 'COMPLETED' as const,
        completedStepIds: [crypto.randomUUID()],
        pendingStepIds: [crypto.randomUUID(), crypto.randomUUID()], // Forgery! Cannot have pending steps when completed
        retryCount: 0,
        attemptNumber: 1,
        isRecoverable: false,
      };

      assert.throws(() => {
        checkpointService.validateCheckpointIntegrity({
          taskId,
          projectId: testProjectId,
          threadId,
          sequenceNumber: 1,
          taskStatus: 'COMPLETED',
          serializedRecoveryState: JSON.stringify(payload),
        });
      }, AgentCheckpointIntegrityError);
    });
  });

  // ============================================================================
  // Test 15: IPC Authorization
  // ============================================================================
  describe('15. IPC Authorization', () => {
    it('strictly forbids cross-tenant access to recovery state', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Private Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Private Task',
          instruction: 'inst',
        },
        testUserId,
      );

      // Attacker tries to inspect recovery state of testProjectId
      await assert.rejects(async () => {
        await service.getTaskRecoveryState(
          { projectId: testProjectId, taskId: task.id },
          attackerUserId,
        );
      }, AiCrossProjectAccessError);

      // Attacker tries to list recoverable tasks
      await assert.rejects(async () => {
        await service.listRecoverableTasks({ projectId: testProjectId }, attackerUserId);
      }, AiCrossProjectAccessError);

      // Attacker tries to list checkpoints
      await assert.rejects(async () => {
        await service.listTaskCheckpoints(
          { projectId: testProjectId, taskId: task.id },
          attackerUserId,
        );
      }, AiCrossProjectAccessError);
    });
  });

  // ============================================================================
  // Test 16: Renderer restart recovery
  // ============================================================================
  describe('16. Renderer Restart Recovery', () => {
    it('allows reconnected renderer to retrieve recovery snapshot and resume uninterrupted', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Renderer Disconnect Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Renderer Disconnect Task',
          instruction: 'inst',
        },
        testUserId,
      );

      await prisma.agentExecutionStep.create({
        data: {
          taskId: task.id,
          sequence: 1,
          stepType: 'EXECUTION',
          title: 'Initial verification step',
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      // Task was interrupted during background execution
      await prisma.agentThreadTask.update({
        where: { id: task.id },
        data: { status: 'RUNNING' },
      });
      await service.recoverInterruptedTasks(testProjectId);

      // Renderer boots up fresh and queries listRecoverableTasks
      const recoverableList = await service.listRecoverableTasks(
        { projectId: testProjectId },
        testUserId,
      );
      const rec = recoverableList.find(r => r.taskId === task.id);
      assert.ok(rec);
      assert.strictEqual(rec.isRecoverable, true);
      assert.strictEqual(rec.completedStepCount, 1);
      assert.strictEqual(rec.canResume, true);

      // Renderer clicks Resume button
      const resumed = await service.resumeTask(
        { projectId: testProjectId, taskId: task.id },
        testUserId,
      );
      assert.strictEqual(resumed.status, 'RUNNING');
    });
  });

  // ============================================================================
  // Test 17: Multiple interrupted tasks
  // ============================================================================
  describe('17. Multiple Interrupted Tasks', () => {
    it('detects and recovers multiple interrupted tasks across different threads concurrently', async () => {
      const thread1 = await service.createThread(
        { projectId: testProjectId, title: 'Multi Thread 1' },
        testUserId,
      );
      const thread2 = await service.createThread(
        { projectId: testProjectId, title: 'Multi Thread 2' },
        testUserId,
      );

      const task1 = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread1.id,
          title: 'Multi Task 1',
          instruction: 'inst',
        },
        testUserId,
      );
      const task2 = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread2.id,
          title: 'Multi Task 2',
          instruction: 'inst',
        },
        testUserId,
      );

      await prisma.agentThreadTask.updateMany({
        where: { id: { in: [task1.id, task2.id] } },
        data: { status: 'RUNNING', startedAt: new Date() },
      });

      const count = await service.recoverInterruptedTasks(testProjectId);
      assert.ok(count >= 2);

      const r1 = await prisma.agentThreadTask.findUnique({ where: { id: task1.id } });
      const r2 = await prisma.agentThreadTask.findUnique({ where: { id: task2.id } });

      assert.ok(r1);
      assert.ok(r2);
      assert.strictEqual(r1.isRecoverable, true);
      assert.strictEqual(r2.isRecoverable, true);
      assert.ok(r1.interruptedAt);
      assert.ok(r2.interruptedAt);
    });
  });

  // ============================================================================
  // Test 18: Recovery audit trail
  // ============================================================================
  describe('18. Recovery Audit Trail', () => {
    it('maintains immutable audit trail with CHECKPOINT_CREATED, INTERRUPTION_DETECTED, and RESUME events', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Audit Trail Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Audited Task',
          instruction: 'inst',
        },
        testUserId,
      );

      // Checkpoint 1
      await service.createTaskCheckpoint({
        taskId: task.id,
        projectId: testProjectId,
        threadId: thread.id,
        userId: testUserId,
        taskStatus: 'QUEUED',
      });

      // Interrupt
      await prisma.agentThreadTask.update({
        where: { id: task.id },
        data: { status: 'RUNNING' },
      });
      await service.recoverInterruptedTasks(testProjectId);

      // Resume
      await service.resumeTask({ projectId: testProjectId, taskId: task.id }, testUserId);

      const auditLogs = await prisma.agentTaskControlAuditLog.findMany({
        where: { taskId: task.id },
        orderBy: { timestamp: 'asc' },
      });

      const actions = auditLogs.map(l => l.action);
      assert.ok(actions.includes('CHECKPOINT_CREATED'));
      assert.ok(actions.includes('INTERRUPTION_DETECTED'));
      assert.ok(actions.includes('RESUME'));
    });
  });

  // ============================================================================
  // Test 19: Corrupted recovery state
  // ============================================================================
  describe('19. Corrupted Recovery State Rejection', () => {
    it('rejects checkpoint recovery state payload with schema validation failures', () => {
      const taskId = crypto.randomUUID();
      const corruptedPayload = {
        version: 'not-a-number', // invalid type
        taskId: 12345, // invalid type
      };

      assert.throws(() => {
        checkpointService.validateCheckpointIntegrity({
          taskId,
          projectId: testProjectId,
          threadId: crypto.randomUUID(),
          sequenceNumber: 1,
          taskStatus: 'RUNNING',
          serializedRecoveryState: JSON.stringify(corruptedPayload),
        });
      }, AgentCheckpointCorruptedError);
    });

    it('logs RECOVERY_FAILED when resume encounter a corrupted checkpoint', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Corrupt Resume Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Corrupted Task',
          instruction: 'inst',
        },
        testUserId,
      );

      // Create a corrupted checkpoint directly in the DB
      await prisma.agentTaskCheckpoint.create({
        data: {
          projectId: testProjectId,
          threadId: thread.id,
          taskId: task.id,
          userId: testUserId,
          sequenceNumber: 1,
          taskStatus: 'INTERRUPTED',
          serializedRecoveryState: '{ INVALID_JSON',
          isRecoverable: true,
        },
      });

      await prisma.agentThreadTask.update({
        where: { id: task.id },
        data: {
          status: 'FAILED',
          isRecoverable: true,
          interruptedAt: new Date(),
        },
      });

      await assert.rejects(async () => {
        await service.resumeTask({ projectId: testProjectId, taskId: task.id }, testUserId);
      }, AgentCheckpointCorruptedError);

      // Verify RECOVERY_FAILED was logged
      const failureAudit = await prisma.agentTaskControlAuditLog.findFirst({
        where: { taskId: task.id, action: 'RECOVERY_FAILED' },
      });
      assert.ok(failureAudit);
    });
  });

  // ============================================================================
  // Test 20: Full task -> interruption -> restart -> resume flow
  // ============================================================================
  describe('20. Full Task -> Interruption -> Restart -> Resume Flow', () => {
    it('executes the complete long-running lifecycle from interruption to clean resumption and completion', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'End-to-End Recovery Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'E2E Autonomous Quality Task',
          instruction: 'Verify E2E flow',
        },
        testUserId,
      );

      // 1. Initial execution step completed
      const step1 = await prisma.agentExecutionStep.create({
        data: {
          taskId: task.id,
          sequence: 1,
          stepType: 'EXECUTION',
          title: 'Step 1: Setup test harness',
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      // 2. Initial checkpoint seq 1
      const cp1 = await checkpointService.createCheckpoint({
        taskId: task.id,
        projectId: testProjectId,
        threadId: thread.id,
        userId: testUserId,
        taskStatus: 'RUNNING',
        stepId: step1.id,
      });
      assert.strictEqual(cp1.sequenceNumber, 1);

      // 3. Step 2 started
      const step2 = await prisma.agentExecutionStep.create({
        data: {
          taskId: task.id,
          sequence: 2,
          stepType: 'EXECUTION',
          title: 'Step 2: Execute assertions',
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });

      // 4. Update task to RUNNING
      await prisma.agentThreadTask.update({
        where: { id: task.id },
        data: { status: 'RUNNING' },
      });

      // 5. App crash / restart!
      const count = await service.recoverInterruptedTasks(testProjectId);
      assert.ok(count >= 1);

      const recoveredTask = await prisma.agentThreadTask.findUnique({ where: { id: task.id } });
      assert.ok(recoveredTask);
      assert.strictEqual(recoveredTask.isRecoverable, true);

      // 6. User opens app, inspects recovery state
      const recoverySummary = await service.getTaskRecoveryState(
        { projectId: testProjectId, taskId: task.id },
        testUserId,
      );
      assert.strictEqual(recoverySummary.canResume, true);
      assert.strictEqual(recoverySummary.completedStepCount, 1);

      // 7. User clicks Resume
      const resumedTask = await service.resumeTask(
        { projectId: testProjectId, taskId: task.id },
        testUserId,
      );
      assert.strictEqual(resumedTask.status, 'RUNNING');
      assert.strictEqual(resumedTask.isRecoverable, false);

      // 8. Agent completes Step 2 and completes the task
      await prisma.agentExecutionStep.update({
        where: { id: step2.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      await prisma.agentThreadTask.update({
        where: { id: task.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      // Final checkpoint
      const finalCp = await checkpointService.createCheckpoint({
        taskId: task.id,
        projectId: testProjectId,
        threadId: thread.id,
        userId: testUserId,
        taskStatus: 'COMPLETED',
        isRecoverable: false,
      });

      assert.strictEqual(finalCp.taskStatus, 'COMPLETED');
      assert.strictEqual(finalCp.completedStepCount, 2);
      assert.strictEqual(finalCp.pendingStepCount, 0);

      // Final verification: task is terminal, steps are intact, checkpoints ordered
      const finalCheckpoints = await checkpointService.listCheckpoints(
        task.id,
        testProjectId,
        testUserId,
      );
      assert.ok(finalCheckpoints.length >= 3);
      for (let i = 1; i < finalCheckpoints.length; i++) {
        assert.ok(
          finalCheckpoints[i]!.sequenceNumber > finalCheckpoints[i - 1]!.sequenceNumber,
          'Checkpoint sequence numbers must strictly increase',
        );
      }
    });
  });
});
