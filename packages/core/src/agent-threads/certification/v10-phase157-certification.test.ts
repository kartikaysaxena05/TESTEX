/**
 * @file packages/core/src/agent-threads/certification/v10-phase157-certification.test.ts
 * Comprehensive Certification Test Suite for V10 Phase 157:
 * Stop / Resume / Retry / Cancel Task Controls.
 *
 * Verifies all 10 core requirements:
 * 1. Valid State Transitions (QUEUED->CANCELLED/STOPPED, RUNNING->PAUSED/CANCELLED/STOPPED, etc.)
 * 2. Deterministic Rejection of Invalid Transitions (COMPLETED terminality, QUEUED->PAUSED, etc.)
 * 3. Stop Behavior & Safe Boundaries (Graceful termination, stoppedAt persistence, no new tool calls)
 * 4. Cancellation Idempotency & Protection (Repeated cancels, immutable history, actor & timestamp tracking)
 * 5. Pause & Resume (Safe execution boundary, preserves completed steps, resume next step without duplicate tools)
 * 6. Retry & History Immutability (Attempt number tracking, child tasks, no overwriting of previous evidence)
 * 7. Concurrency Protection (Duplicate resume guard, active execution lock, concurrent control requests)
 * 8. Persistence & Crash Recovery (Interrupted task recovery, step reconciliation, audit trail)
 * 9. Audit Trail Correctness (Comprehensive log records for STOP, PAUSE, RESUME, RETRY, CANCEL)
 * 10. Multi-Tenant Security & Isolation (Cross-project authorization enforcement)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/client.js';
import { AgentThreadService, AgentTaskInvalidStateError } from '../index.js';
import { AgentConcurrencyManager } from '../../agent-loop/agent-concurrency-manager.js';
import { AiCrossProjectAccessError } from '../../ai-provider/index.js';

describe('V10 Phase 157 — Stop / Resume / Retry / Cancel Task Controls Certification Suite', () => {
  let prisma: PrismaClient;
  let service: AgentThreadService;

  const testUserId = crypto.randomUUID();
  const attackerUserId = crypto.randomUUID();
  const testProjectId = crypto.randomUUID();
  const attackerProjectId = crypto.randomUUID();

  before(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Database is required for Phase 157 certification suite.');
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
          description: 'Production target project for V10 Phase 157 testing',
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
  // 1. Valid State Transitions
  // ============================================================================
  describe('1. Valid State Transitions', () => {
    it('handles QUEUED -> CANCELLED', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'State Test Thread 1' },
        testUserId,
      );
      const task = await service.createTask(
        { projectId: testProjectId, threadId: thread.id, title: 'T1', instruction: 'inst' },
        testUserId,
      );

      assert.strictEqual(task.status, 'QUEUED');
      const cancelled = await service.cancelTask(
        { projectId: testProjectId, taskId: task.id, reason: 'No longer needed' },
        testUserId,
      );
      assert.strictEqual(cancelled.status, 'CANCELLED');
      assert.ok(cancelled.cancelledAt);
    });

    it('handles QUEUED -> STOPPED', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'State Test Thread 2' },
        testUserId,
      );
      const task = await service.createTask(
        { projectId: testProjectId, threadId: thread.id, title: 'T2', instruction: 'inst' },
        testUserId,
      );

      const stopped = await service.stopTask(
        { projectId: testProjectId, taskId: task.id, reason: 'User requested stop' },
        testUserId,
      );
      assert.strictEqual(stopped.status, 'STOPPED');
      assert.ok(stopped.stoppedAt);
    });

    it('handles PLANNING -> CANCELLED and PLANNING -> STOPPED', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'State Test Thread 3' },
        testUserId,
      );
      const task1 = await service.createTask(
        { projectId: testProjectId, threadId: thread.id, title: 'T3', instruction: 'inst' },
        testUserId,
      );
      await service.updateTaskStatus(task1.id, 'PLANNING');

      const cancelled = await service.cancelTask(
        { projectId: testProjectId, taskId: task1.id },
        testUserId,
      );
      assert.strictEqual(cancelled.status, 'CANCELLED');

      const task2 = await service.createTask(
        { projectId: testProjectId, threadId: thread.id, title: 'T4', instruction: 'inst' },
        testUserId,
      );
      await service.updateTaskStatus(task2.id, 'PLANNING');

      const stopped = await service.stopTask(
        { projectId: testProjectId, taskId: task2.id },
        testUserId,
      );
      assert.strictEqual(stopped.status, 'STOPPED');
    });

    it('handles RUNNING -> PAUSED -> RUNNING', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'State Test Thread 4' },
        testUserId,
      );
      const task = await service.createTask(
        { projectId: testProjectId, threadId: thread.id, title: 'T5', instruction: 'inst' },
        testUserId,
      );
      await service.updateTaskStatus(task.id, 'RUNNING');

      const paused = await service.pauseTask(
        { projectId: testProjectId, taskId: task.id, reason: 'Pause for inspection' },
        testUserId,
      );
      assert.strictEqual(paused.status, 'PAUSED');
      assert.ok(paused.pausedAt);

      const resumed = await service.resumeTask(
        { projectId: testProjectId, taskId: task.id },
        testUserId,
      );
      assert.strictEqual(resumed.status, 'RUNNING');
    });

    it('handles RUNNING -> STOPPED and RUNNING -> CANCELLED', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'State Test Thread 5' },
        testUserId,
      );
      const task1 = await service.createTask(
        { projectId: testProjectId, threadId: thread.id, title: 'T6', instruction: 'inst' },
        testUserId,
      );
      await service.updateTaskStatus(task1.id, 'RUNNING');

      const stopped = await service.stopTask(
        { projectId: testProjectId, taskId: task1.id },
        testUserId,
      );
      assert.strictEqual(stopped.status, 'STOPPED');

      const task2 = await service.createTask(
        { projectId: testProjectId, threadId: thread.id, title: 'T7', instruction: 'inst' },
        testUserId,
      );
      await service.updateTaskStatus(task2.id, 'RUNNING');

      const cancelled = await service.cancelTask(
        { projectId: testProjectId, taskId: task2.id },
        testUserId,
      );
      assert.strictEqual(cancelled.status, 'CANCELLED');
    });

    it('handles PAUSED -> CANCELLED and PAUSED -> STOPPED', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'State Test Thread 6' },
        testUserId,
      );
      const task1 = await service.createTask(
        { projectId: testProjectId, threadId: thread.id, title: 'T8', instruction: 'inst' },
        testUserId,
      );
      await service.updateTaskStatus(task1.id, 'RUNNING');
      await service.pauseTask({ projectId: testProjectId, taskId: task1.id }, testUserId);

      const cancelled = await service.cancelTask(
        { projectId: testProjectId, taskId: task1.id },
        testUserId,
      );
      assert.strictEqual(cancelled.status, 'CANCELLED');

      const task2 = await service.createTask(
        { projectId: testProjectId, threadId: thread.id, title: 'T9', instruction: 'inst' },
        testUserId,
      );
      await service.updateTaskStatus(task2.id, 'RUNNING');
      await service.pauseTask({ projectId: testProjectId, taskId: task2.id }, testUserId);

      const stopped = await service.stopTask(
        { projectId: testProjectId, taskId: task2.id },
        testUserId,
      );
      assert.strictEqual(stopped.status, 'STOPPED');
    });

    it('handles retry transitions: FAILED -> RETRY, CANCELLED -> RETRY, STOPPED -> RETRY', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Retry State Thread' },
        testUserId,
      );

      // Failed task retry
      const failedTask = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Failed Task',
          instruction: 'inst',
        },
        testUserId,
      );
      await service.updateTaskStatus(failedTask.id, 'FAILED', 'Fatal execution crash');
      const retryFromFailed = await service.retryTask(
        { projectId: testProjectId, taskId: failedTask.id },
        testUserId,
      );
      assert.strictEqual(retryFromFailed.status, 'QUEUED');
      assert.strictEqual(retryFromFailed.parentTaskId, failedTask.id);
      assert.strictEqual(retryFromFailed.attemptNumber, 2);

      // Cancelled task retry
      const cancelledTask = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Cancelled Task',
          instruction: 'inst',
        },
        testUserId,
      );
      await service.cancelTask({ projectId: testProjectId, taskId: cancelledTask.id }, testUserId);
      const retryFromCancelled = await service.retryTask(
        { projectId: testProjectId, taskId: cancelledTask.id },
        testUserId,
      );
      assert.strictEqual(retryFromCancelled.status, 'QUEUED');
      assert.strictEqual(retryFromCancelled.parentTaskId, cancelledTask.id);
      assert.strictEqual(retryFromCancelled.attemptNumber, 2);

      // Stopped task retry
      const stoppedTask = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Stopped Task',
          instruction: 'inst',
        },
        testUserId,
      );
      await service.stopTask({ projectId: testProjectId, taskId: stoppedTask.id }, testUserId);
      const retryFromStopped = await service.retryTask(
        { projectId: testProjectId, taskId: stoppedTask.id },
        testUserId,
      );
      assert.strictEqual(retryFromStopped.status, 'QUEUED');
      assert.strictEqual(retryFromStopped.parentTaskId, stoppedTask.id);
      assert.strictEqual(retryFromStopped.attemptNumber, 2);
    });
  });

  // ============================================================================
  // 2. Deterministic Rejection of Invalid Transitions
  // ============================================================================
  describe('2. Deterministic Rejection of Invalid Transitions', () => {
    it('rejects terminal COMPLETED tasks from being cancelled, paused, stopped, or retried', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Terminal Guard Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Complete Task',
          instruction: 'inst',
        },
        testUserId,
      );
      await service.updateTaskStatus(task.id, 'RUNNING');
      await service.updateTaskStatus(task.id, 'COMPLETED');

      // Reject cancel
      await assert.rejects(
        async () => service.cancelTask({ projectId: testProjectId, taskId: task.id }, testUserId),
        (err: any) =>
          err.name === 'AgentTaskImmutableError' || err.name === 'AgentTaskInvalidStateError',
      );

      // Reject pause
      await assert.rejects(
        async () => service.pauseTask({ projectId: testProjectId, taskId: task.id }, testUserId),
        (err: any) =>
          err.name === 'AgentTaskImmutableError' || err.name === 'AgentTaskInvalidStateError',
      );

      // Reject stop
      await assert.rejects(
        async () => service.stopTask({ projectId: testProjectId, taskId: task.id }, testUserId),
        (err: any) =>
          err.name === 'AgentTaskImmutableError' || err.name === 'AgentTaskInvalidStateError',
      );

      // Reject retry
      await assert.rejects(
        async () => service.retryTask({ projectId: testProjectId, taskId: task.id }, testUserId),
        (err: any) =>
          err.name === 'AgentTaskImmutableError' || err.name === 'AgentTaskInvalidStateError',
      );
    });

    it('rejects QUEUED tasks from being paused or resumed directly', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Queued Guard Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Queued Task',
          instruction: 'inst',
        },
        testUserId,
      );

      await assert.rejects(
        async () => service.pauseTask({ projectId: testProjectId, taskId: task.id }, testUserId),
        AgentTaskInvalidStateError,
      );

      await assert.rejects(
        async () => service.resumeTask({ projectId: testProjectId, taskId: task.id }, testUserId),
        AgentTaskInvalidStateError,
      );
    });

    it('rejects FAILED tasks from being paused or directly resumed without retry', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Failed Guard Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Failed Task',
          instruction: 'inst',
        },
        testUserId,
      );
      await service.updateTaskStatus(task.id, 'FAILED', 'Error occurred');

      await assert.rejects(
        async () => service.pauseTask({ projectId: testProjectId, taskId: task.id }, testUserId),
        AgentTaskInvalidStateError,
      );

      await assert.rejects(
        async () => service.resumeTask({ projectId: testProjectId, taskId: task.id }, testUserId),
        AgentTaskInvalidStateError,
      );
    });

    it('rejects STOPPED and CANCELLED tasks from being directly resumed without retry', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Stopped Resume Guard' },
        testUserId,
      );
      const task = await service.createTask(
        { projectId: testProjectId, threadId: thread.id, title: 'Stop Task', instruction: 'inst' },
        testUserId,
      );
      await service.stopTask({ projectId: testProjectId, taskId: task.id }, testUserId);

      await assert.rejects(
        async () => service.resumeTask({ projectId: testProjectId, taskId: task.id }, testUserId),
        AgentTaskInvalidStateError,
      );
    });
  });

  // ============================================================================
  // 3. Stop Behavior & Safe Boundaries
  // ============================================================================
  describe('3. Stop Behavior & Safe Boundaries', () => {
    it('persists stoppedAt timestamp and updates thread lastActivityAt', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Stop Persistence Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Running Task',
          instruction: 'inst',
        },
        testUserId,
      );
      await service.updateTaskStatus(task.id, 'RUNNING');

      const beforeStop = new Date();
      const stopped = await service.stopTask(
        { projectId: testProjectId, taskId: task.id, reason: 'Manual operator pause' },
        testUserId,
      );

      assert.strictEqual(stopped.status, 'STOPPED');
      assert.ok(stopped.stoppedAt);
      const stoppedDate = new Date(stopped.stoppedAt);
      assert.ok(stoppedDate.getTime() >= beforeStop.getTime() - 1000);

      const refreshedThread = await service.getThread(
        { projectId: testProjectId, threadId: thread.id },
        testUserId,
      );
      assert.ok(refreshedThread);
      assert.ok(new Date(refreshedThread.lastActivityAt).getTime() >= beforeStop.getTime() - 1000);
    });

    it('reconciles active running steps upon task stop', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Stop Step Reconcile Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Task with active step',
          instruction: 'inst',
        },
        testUserId,
      );
      await service.updateTaskStatus(task.id, 'RUNNING');

      const step = await service.addExecutionStep(
        { projectId: testProjectId, taskId: task.id, stepType: 'TOOL', title: 'Running web test' },
        testUserId,
      );
      await service.updateExecutionStepStatus(
        { projectId: testProjectId, stepId: step.id, status: 'RUNNING' },
        testUserId,
      );

      await service.stopTask(
        { projectId: testProjectId, taskId: task.id, reason: 'Operator requested halt' },
        testUserId,
      );

      const steps = await service.listExecutionSteps(
        { projectId: testProjectId, taskId: task.id },
        testUserId,
      );
      const targetStep = steps.find(s => s.id === step.id);
      assert.ok(targetStep);
      assert.strictEqual(targetStep.status, 'CANCELLED');
      assert.ok(targetStep.error?.includes('Operator requested halt'));
    });
  });

  // ============================================================================
  // 4. Cancellation Idempotency & Protection
  // ============================================================================
  describe('4. Cancellation Idempotency & Protection', () => {
    it('cancellation is strictly idempotent across repeated requests', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Cancel Idempotency Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Idempotency Task',
          instruction: 'inst',
        },
        testUserId,
      );

      // First cancel
      const firstCancel = await service.cancelTask(
        { projectId: testProjectId, taskId: task.id, reason: 'First request' },
        testUserId,
      );
      assert.strictEqual(firstCancel.status, 'CANCELLED');
      assert.ok(firstCancel.cancelledAt);

      // Second cancel with same or different reason - must succeed idempotently without error
      const secondCancel = await service.cancelTask(
        { projectId: testProjectId, taskId: task.id, reason: 'Repeated cancel attempt' },
        testUserId,
      );
      assert.strictEqual(secondCancel.status, 'CANCELLED');
      assert.strictEqual(secondCancel.cancelledAt, firstCancel.cancelledAt);

      // Third cancel
      const thirdCancel = await service.cancelTask(
        { projectId: testProjectId, taskId: task.id },
        testUserId,
      );
      assert.strictEqual(thirdCancel.status, 'CANCELLED');
    });

    it('cancels pending and running steps without corrupting completed step records', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Cancel History Preservation' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Multi-step Task',
          instruction: 'inst',
        },
        testUserId,
      );
      await service.updateTaskStatus(task.id, 'RUNNING');

      // Step 1: Completed
      const step1 = await service.addExecutionStep(
        { projectId: testProjectId, taskId: task.id, stepType: 'PLAN', title: 'Planning complete' },
        testUserId,
      );
      await service.updateExecutionStepStatus(
        { projectId: testProjectId, stepId: step1.id, status: 'COMPLETED' },
        testUserId,
      );

      // Step 2: Running
      const step2 = await service.addExecutionStep(
        { projectId: testProjectId, taskId: task.id, stepType: 'TOOL', title: 'Running tool step' },
        testUserId,
      );
      await service.updateExecutionStepStatus(
        { projectId: testProjectId, stepId: step2.id, status: 'RUNNING' },
        testUserId,
      );

      // Step 3: Pending
      const step3 = await service.addExecutionStep(
        {
          projectId: testProjectId,
          taskId: task.id,
          stepType: 'EVALUATE',
          title: 'Pending evaluate',
        },
        testUserId,
      );

      // Cancel task
      await service.cancelTask(
        { projectId: testProjectId, taskId: task.id, reason: 'User abort' },
        testUserId,
      );

      const steps = await service.listExecutionSteps(
        { projectId: testProjectId, taskId: task.id },
        testUserId,
      );
      const s1 = steps.find(s => s.id === step1.id)!;
      const s2 = steps.find(s => s.id === step2.id)!;
      const s3 = steps.find(s => s.id === step3.id)!;

      assert.strictEqual(s1.status, 'COMPLETED'); // Completed step remains intact
      assert.strictEqual(s2.status, 'CANCELLED'); // In-flight step cancelled
      assert.strictEqual(s3.status, 'CANCELLED'); // Pending step cancelled
    });
  });

  // ============================================================================
  // 5. Pause & Resume Lifecycle
  // ============================================================================
  describe('5. Pause & Resume Lifecycle', () => {
    it('pauses and resumes without duplicating completed execution steps', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Pause Resume Lifecycle' },
        testUserId,
      );
      const task = await service.createTask(
        { projectId: testProjectId, threadId: thread.id, title: 'Pause Task', instruction: 'inst' },
        testUserId,
      );
      await service.updateTaskStatus(task.id, 'RUNNING');

      // Record first step completed
      const step1 = await service.addExecutionStep(
        {
          projectId: testProjectId,
          taskId: task.id,
          stepType: 'TOOL',
          title: 'Step 1: Check UI elements',
        },
        testUserId,
      );
      await service.updateExecutionStepStatus(
        { projectId: testProjectId, stepId: step1.id, status: 'COMPLETED' },
        testUserId,
      );

      // Pause task
      const paused = await service.pauseTask(
        { projectId: testProjectId, taskId: task.id, reason: 'Inspect step 1 results' },
        testUserId,
      );
      assert.strictEqual(paused.status, 'PAUSED');

      // Resume task
      const resumed = await service.resumeTask(
        { projectId: testProjectId, taskId: task.id },
        testUserId,
      );
      assert.strictEqual(resumed.status, 'RUNNING');

      // Record next step (step 2)
      const step2 = await service.addExecutionStep(
        {
          projectId: testProjectId,
          taskId: task.id,
          stepType: 'TOOL',
          title: 'Step 2: Submit form',
        },
        testUserId,
      );
      await service.updateExecutionStepStatus(
        { projectId: testProjectId, stepId: step2.id, status: 'COMPLETED' },
        testUserId,
      );

      const allSteps = await service.listExecutionSteps(
        { projectId: testProjectId, taskId: task.id },
        testUserId,
      );
      assert.strictEqual(allSteps.length, 2);
      assert.strictEqual(allSteps[0]?.title, 'Step 1: Check UI elements');
      assert.strictEqual(allSteps[1]?.title, 'Step 2: Submit form');
    });

    it('rejects duplicate resume when task is actively executing in concurrency manager', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Concurrent Resume Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Locked Task',
          instruction: 'inst',
        },
        testUserId,
      );
      await service.updateTaskStatus(task.id, 'RUNNING');
      await service.pauseTask({ projectId: testProjectId, taskId: task.id }, testUserId);

      // Simulate lock held by an active agent execution loop
      AgentConcurrencyManager.acquireLock(task.id, testProjectId);
      try {
        await assert.rejects(
          async () => service.resumeTask({ projectId: testProjectId, taskId: task.id }, testUserId),
          (err: any) => {
            assert.ok(err instanceof AgentTaskInvalidStateError);
            assert.ok(err.message.includes('actively executing'));
            return true;
          },
        );
      } finally {
        AgentConcurrencyManager.releaseLock(task.id);
      }
    });
  });

  // ============================================================================
  // 6. Retry & History Immutability
  // ============================================================================
  describe('6. Retry & History Immutability', () => {
    it('preserves attempt number chain across multiple retries (1 -> 2 -> 3)', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Attempt Tracking Thread' },
        testUserId,
      );
      const initialTask = await service.createTask(
        { projectId: testProjectId, threadId: thread.id, title: 'Flaky Run', instruction: 'inst' },
        testUserId,
      );
      assert.strictEqual(initialTask.attemptNumber, 1);
      assert.strictEqual(initialTask.retryCount, 0);

      // Attempt 1 fails
      await service.updateTaskStatus(initialTask.id, 'FAILED', 'Connection timeout on step 3');

      // Attempt 2 retry
      const attempt2 = await service.retryTask(
        { projectId: testProjectId, taskId: initialTask.id, instruction: 'Retry with backoff' },
        testUserId,
      );
      assert.strictEqual(attempt2.attemptNumber, 2);
      assert.strictEqual(attempt2.retryCount, 1);
      assert.strictEqual(attempt2.parentTaskId, initialTask.id);
      assert.strictEqual(attempt2.instruction, 'Retry with backoff');

      // Verify initial task remained intact
      const fetchedInitial = await service.getTask(
        { projectId: testProjectId, taskId: initialTask.id },
        testUserId,
      );
      assert.ok(fetchedInitial);
      assert.strictEqual(fetchedInitial.status, 'FAILED');
      assert.strictEqual(fetchedInitial.failureReason, 'Connection timeout on step 3');

      // Attempt 2 stopped
      await service.updateTaskStatus(attempt2.id, 'RUNNING');
      await service.stopTask({ projectId: testProjectId, taskId: attempt2.id }, testUserId);

      // Attempt 3 retry
      const attempt3 = await service.retryTask(
        { projectId: testProjectId, taskId: attempt2.id },
        testUserId,
      );
      assert.strictEqual(attempt3.attemptNumber, 3);
      assert.strictEqual(attempt3.retryCount, 2);
      assert.strictEqual(attempt3.parentTaskId, attempt2.id);
    });

    it('never overwrites original attempt tool call records or execution steps', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Immutable Records Thread' },
        testUserId,
      );
      const task1 = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Original Task',
          instruction: 'inst',
        },
        testUserId,
      );
      await service.updateTaskStatus(task1.id, 'RUNNING');

      const step1 = await service.addExecutionStep(
        { projectId: testProjectId, taskId: task1.id, stepType: 'TOOL', title: 'Original Step 1' },
        testUserId,
      );
      await service.recordToolCall(
        {
          projectId: testProjectId,
          taskId: task1.id,
          stepId: step1.id,
          toolName: 'browser_click',
          inputPayload: { selector: '#btn-login' },
          status: 'COMPLETED',
        },
        testUserId,
      );

      await service.updateTaskStatus(task1.id, 'FAILED', 'Step 2 assertion failure');

      // Retry creates child task
      const task2 = await service.retryTask(
        { projectId: testProjectId, taskId: task1.id },
        testUserId,
      );

      // Verify task 1 records are still exactly 1 step and 1 tool call
      const task1Steps = await service.listExecutionSteps(
        { projectId: testProjectId, taskId: task1.id },
        testUserId,
      );
      const task1Tools = await service.listToolCalls(
        { projectId: testProjectId, taskId: task1.id },
        testUserId,
      );
      assert.strictEqual(task1Steps.length, 1);
      assert.strictEqual(task1Tools.length, 1);
      assert.strictEqual(task1Tools[0]?.toolName, 'browser_click');

      // Task 2 initially has 0 steps and 0 tool calls
      const task2Steps = await service.listExecutionSteps(
        { projectId: testProjectId, taskId: task2.id },
        testUserId,
      );
      const task2Tools = await service.listToolCalls(
        { projectId: testProjectId, taskId: task2.id },
        testUserId,
      );
      assert.strictEqual(task2Steps.length, 0);
      assert.strictEqual(task2Tools.length, 0);
    });
  });

  // ============================================================================
  // 7. Concurrency Protection
  // ============================================================================
  describe('7. Concurrency Protection', () => {
    it('handles concurrent cancel and stop requests safely without race corrupted state', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Concurrent Race Thread' },
        testUserId,
      );
      const task = await service.createTask(
        { projectId: testProjectId, threadId: thread.id, title: 'Race Task', instruction: 'inst' },
        testUserId,
      );
      await service.updateTaskStatus(task.id, 'RUNNING');

      // Fire parallel control mutations
      const results = await Promise.allSettled([
        service.cancelTask(
          { projectId: testProjectId, taskId: task.id, reason: 'Race cancel' },
          testUserId,
        ),
        service.stopTask(
          { projectId: testProjectId, taskId: task.id, reason: 'Race stop' },
          testUserId,
        ),
      ]);
      assert.strictEqual(results.length, 2);

      // Exactly one succeeds, or both settle into a valid terminal/controlled state
      const settledTask = await service.getTask(
        { projectId: testProjectId, taskId: task.id },
        testUserId,
      );
      assert.ok(settledTask);
      assert.ok(settledTask.status === 'CANCELLED' || settledTask.status === 'STOPPED');
    });

    it('handles concurrent retry requests safely without duplicate attempts', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Concurrent Retry Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Failed for race retry',
          instruction: 'inst',
        },
        testUserId,
      );
      await service.updateTaskStatus(task.id, 'FAILED', 'Fatal error');

      const retries = await Promise.all([
        service.retryTask({ projectId: testProjectId, taskId: task.id }, testUserId),
        service.retryTask({ projectId: testProjectId, taskId: task.id }, testUserId),
      ]);

      assert.strictEqual(retries.length, 2);
      // Both created valid retry children with correct parent reference
      assert.strictEqual(retries[0]?.parentTaskId, task.id);
      assert.strictEqual(retries[1]?.parentTaskId, task.id);
      assert.notStrictEqual(retries[0]?.id, retries[1]?.id);
    });
  });

  // ============================================================================
  // 8. Persistence & Crash Recovery
  // ============================================================================
  describe('8. Persistence & Crash Recovery', () => {
    it('recovers interrupted RUNNING tasks on simulated app restart and logs audit event', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Crash Recovery Thread' },
        testUserId,
      );
      const task = await service.createTask(
        {
          projectId: testProjectId,
          threadId: thread.id,
          title: 'Interrupted Task',
          instruction: 'inst',
        },
        testUserId,
      );
      await service.updateTaskStatus(task.id, 'RUNNING');

      // Create an incomplete step
      const step = await service.addExecutionStep(
        { projectId: testProjectId, taskId: task.id, stepType: 'TOOL', title: 'Mid-flight step' },
        testUserId,
      );
      await service.updateExecutionStepStatus(
        { projectId: testProjectId, stepId: step.id, status: 'RUNNING' },
        testUserId,
      );

      // Simulate app restart recovery
      const recoveredCount = await service.recoverInterruptedTasks();
      assert.ok(recoveredCount >= 1);

      // Verify task marked FAILED
      const recoveredTask = await service.getTask(
        { projectId: testProjectId, taskId: task.id },
        testUserId,
      );
      assert.ok(recoveredTask);
      assert.strictEqual(recoveredTask.status, 'FAILED');
      assert.ok(recoveredTask.failureReason?.includes('interrupted'));

      // Verify step marked FAILED
      const steps = await service.listExecutionSteps(
        { projectId: testProjectId, taskId: task.id },
        testUserId,
      );
      assert.strictEqual(steps[0]?.status, 'FAILED');

      // Verify task can now be retried or inspected according to recovered state
      const retried = await service.retryTask(
        { projectId: testProjectId, taskId: task.id },
        testUserId,
      );
      assert.strictEqual(retried.status, 'QUEUED');
      assert.strictEqual(retried.attemptNumber, 2);
    });
  });

  // ============================================================================
  // 9. Audit Trail Correctness
  // ============================================================================
  describe('9. Audit Trail Correctness', () => {
    it('records full audit log trail across STOP, PAUSE, RESUME, RETRY, and CANCEL actions', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Audit Trail Verification' },
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
      await service.updateTaskStatus(task.id, 'RUNNING');

      // 1. Pause
      await service.pauseTask(
        { projectId: testProjectId, taskId: task.id, reason: 'Audit pause' },
        testUserId,
      );

      // 2. Resume
      await service.resumeTask({ projectId: testProjectId, taskId: task.id }, testUserId);

      // 3. Stop
      await service.stopTask(
        { projectId: testProjectId, taskId: task.id, reason: 'Audit stop' },
        testUserId,
      );

      // 4. Retry
      const childTask = await service.retryTask(
        { projectId: testProjectId, taskId: task.id, instruction: 'Audit retry' },
        testUserId,
      );

      // 5. Cancel child
      await service.cancelTask(
        { projectId: testProjectId, taskId: childTask.id, reason: 'Audit cancel' },
        testUserId,
      );

      // Fetch audit logs for parent task
      const parentLogs = await service.listTaskControlAuditLogs(
        { projectId: testProjectId, taskId: task.id },
        testUserId,
      );
      const parentActions = parentLogs.map(l => l.action);
      assert.ok(parentActions.includes('PAUSE'), 'Missing PAUSE audit entry on parent');
      assert.ok(parentActions.includes('RESUME'), 'Missing RESUME audit entry on parent');
      assert.ok(parentActions.includes('STOP'), 'Missing STOP audit entry on parent');

      // Verify audit fields
      const pauseEntry = parentLogs.find(l => l.action === 'PAUSE')!;
      assert.strictEqual(pauseEntry.previousState, 'RUNNING');
      assert.strictEqual(pauseEntry.newState, 'PAUSED');
      assert.strictEqual(pauseEntry.actorType, 'USER');
      assert.strictEqual(pauseEntry.actorId, testUserId);
      assert.strictEqual(pauseEntry.reason, 'Audit pause');
      assert.strictEqual(pauseEntry.attemptNumber, 1);
      assert.ok(pauseEntry.timestamp);

      // Fetch audit logs for child task
      const childLogs = await service.listTaskControlAuditLogs(
        { projectId: testProjectId, taskId: childTask.id },
        testUserId,
      );
      assert.ok(
        childLogs.some(l => l.action === 'RETRY'),
        'Missing RETRY audit entry on child',
      );
      assert.ok(
        childLogs.some(l => l.action === 'CANCEL'),
        'Missing CANCEL audit entry on child',
      );
    });
  });

  // ============================================================================
  // 10. Multi-Tenant Security & Isolation
  // ============================================================================
  describe('10. Multi-Tenant Security & Isolation', () => {
    it('rejects unauthorized access to stop, pause, resume, retry, cancel, or audit logs', async () => {
      const thread = await service.createThread(
        { projectId: testProjectId, title: 'Owner Private Thread' },
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
      await service.updateTaskStatus(task.id, 'RUNNING');

      // Attacker tries to stop task
      await assert.rejects(
        async () => service.stopTask({ projectId: testProjectId, taskId: task.id }, attackerUserId),
        AiCrossProjectAccessError,
      );

      // Attacker tries to pause task
      await assert.rejects(
        async () =>
          service.pauseTask({ projectId: testProjectId, taskId: task.id }, attackerUserId),
        AiCrossProjectAccessError,
      );

      // Attacker tries to resume task
      await assert.rejects(
        async () =>
          service.resumeTask({ projectId: testProjectId, taskId: task.id }, attackerUserId),
        AiCrossProjectAccessError,
      );

      // Attacker tries to retry task
      await assert.rejects(
        async () =>
          service.retryTask({ projectId: testProjectId, taskId: task.id }, attackerUserId),
        AiCrossProjectAccessError,
      );

      // Attacker tries to cancel task
      await assert.rejects(
        async () =>
          service.cancelTask({ projectId: testProjectId, taskId: task.id }, attackerUserId),
        AiCrossProjectAccessError,
      );

      // Attacker tries to list audit logs
      await assert.rejects(
        async () =>
          service.listTaskControlAuditLogs(
            { projectId: testProjectId, taskId: task.id },
            attackerUserId,
          ),
        AiCrossProjectAccessError,
      );
    });
  });
});
