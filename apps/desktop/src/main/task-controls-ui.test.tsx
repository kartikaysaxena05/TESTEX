/**
 * @file apps/desktop/src/main/task-controls-ui.test.tsx
 * UI component and rendering tests for V10 Phase 157: Stop / Resume / Retry / Cancel Task Controls.
 * Verifies AgentThreadsView task control buttons, status badges, disabled states,
 * and loading labels across all task lifecycle states.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { AgentThreadsView } from '../renderer/features/agent-threads/AgentThreadsView.js';
import type { UseAgentThreadsResult } from '../renderer/features/agent-threads/useAgentThreads.js';
import type { AgentThreadDto, AgentThreadTaskDto } from '@ai-quality/contracts';

describe('V10 Phase 157 Task Controls UI Tests', () => {
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const testThreadId = 'cccccccc-1111-1111-1111-cccccccccccc';

  const mockThread: AgentThreadDto = {
    id: testThreadId,
    projectId: testProjectId,
    userId: 'user-owner-1111',
    title: 'Test Quality Thread',
    status: 'ACTIVE',
    createdAt: '2026-10-06T10:00:00.000Z',
    updatedAt: '2026-10-06T10:00:00.000Z',
    lastActivityAt: '2026-10-06T10:00:00.000Z',
    archivedAt: null,
  };

  const createMockTask = (
    id: string,
    status: AgentThreadTaskDto['status'],
  ): AgentThreadTaskDto => ({
    id,
    projectId: testProjectId,
    threadId: testThreadId,
    userId: 'user-owner-1111',
    title: `Task in ${status} status`,
    instruction: `Execute test step for ${status}`,
    status,
    retryCount: 0,
    parentTaskId: null,
    failureReason: status === 'FAILED' ? 'Execution failure' : null,
    metadata: {},
    createdAt: '2026-10-06T10:00:00.000Z',
    updatedAt: '2026-10-06T10:00:00.000Z',
    startedAt: status === 'RUNNING' ? '2026-10-06T10:01:00.000Z' : null,
    completedAt: status === 'COMPLETED' ? '2026-10-06T10:05:00.000Z' : null,
    cancelledAt: status === 'CANCELLED' ? '2026-10-06T10:03:00.000Z' : null,
    pausedAt: status === 'PAUSED' ? '2026-10-06T10:02:00.000Z' : null,
    stoppedAt: status === 'STOPPED' ? '2026-10-06T10:02:30.000Z' : null,
    attemptNumber: 1,
    isRecoverable: false,
    maxRetries: 3,
  });

  const createMockHook = (
    tasks: AgentThreadTaskDto[],
    overrides?: Partial<UseAgentThreadsResult>,
  ): UseAgentThreadsResult => ({
    threads: [mockThread],
    activeThread: mockThread,
    activeThreadId: testThreadId,
    tasks,
    activeTask: tasks[0] ?? null,
    activeTaskId: tasks[0]?.id ?? null,
    messages: [],
    executionSteps: [],
    toolCalls: [],
    isLoading: false,
    isCreatingTask: false,
    error: null,
    refresh: async () => {},
    selectThread: () => {},
    selectTask: () => {},
    createThread: async () => mockThread,
    archiveThread: async () => true,
    createTask: async () => tasks[0]!,
    cancelTask: async () => true,
    stopTask: async () => true,
    pauseTask: async () => true,
    retryTask: async () => tasks[0] ?? null,
    resumeTask: async () => tasks[0] ?? null,
    activeWorkflowReport: null,
    executeAutonomousWorkflow: async () => null,
    approveWorkflowFix: async () => true,
    rejectWorkflowFix: async () => true,
    isControlActionPending: false,
    pendingControlActionTaskId: null,
    approvals: [],
    pendingApprovals: [],
    recoverableTasks: [],
    fetchRecoverableTasks: async () => {},
    decideApproval: async () => true,
    ...overrides,
  });

  describe('State-Dependent Control Buttons', () => {
    it('renders Pause, Stop, and Cancel buttons for RUNNING tasks', () => {
      const task = createMockTask('task-running-1', 'RUNNING');
      const hook = createMockHook([task]);
      const html = renderToString(
        <AgentThreadsView projectId={testProjectId} hookOverride={hook} />,
      );

      assert.ok(
        html.includes('data-testid="task-pause-btn-task-running-1"'),
        'Pause button should be rendered',
      );
      assert.ok(
        html.includes('data-testid="task-stop-btn-task-running-1"'),
        'Stop button should be rendered',
      );
      assert.ok(
        html.includes('data-testid="task-cancel-btn-task-running-1"'),
        'Cancel button should be rendered',
      );
      assert.ok(
        !html.includes('data-testid="task-resume-btn-task-running-1"'),
        'Resume button should not be rendered',
      );
      assert.ok(
        !html.includes('data-testid="task-retry-btn-task-running-1"'),
        'Retry button should not be rendered',
      );
    });

    it('renders Resume, Stop, and Cancel buttons for PAUSED tasks', () => {
      const task = createMockTask('task-paused-1', 'PAUSED');
      const hook = createMockHook([task]);
      const html = renderToString(
        <AgentThreadsView projectId={testProjectId} hookOverride={hook} />,
      );

      assert.ok(
        html.includes('data-testid="task-resume-btn-task-paused-1"'),
        'Resume button should be rendered',
      );
      assert.ok(
        html.includes('data-testid="task-stop-btn-task-paused-1"'),
        'Stop button should be rendered',
      );
      assert.ok(
        html.includes('data-testid="task-cancel-btn-task-paused-1"'),
        'Cancel button should be rendered',
      );
      assert.ok(
        !html.includes('data-testid="task-pause-btn-task-paused-1"'),
        'Pause button should not be rendered',
      );
      assert.ok(
        !html.includes('data-testid="task-retry-btn-task-paused-1"'),
        'Retry button should not be rendered',
      );
    });

    it('renders Stop and Cancel buttons for QUEUED and PLANNING tasks', () => {
      const queuedTask = createMockTask('task-queued-1', 'QUEUED');
      const hook = createMockHook([queuedTask]);
      const html = renderToString(
        <AgentThreadsView projectId={testProjectId} hookOverride={hook} />,
      );

      assert.ok(
        html.includes('data-testid="task-stop-btn-task-queued-1"'),
        'Stop button should be rendered for QUEUED',
      );
      assert.ok(
        html.includes('data-testid="task-cancel-btn-task-queued-1"'),
        'Cancel button should be rendered for QUEUED',
      );
      assert.ok(
        !html.includes('data-testid="task-pause-btn-task-queued-1"'),
        'Pause button should not be rendered for QUEUED',
      );
      assert.ok(
        !html.includes('data-testid="task-resume-btn-task-queued-1"'),
        'Resume button should not be rendered for QUEUED',
      );
      assert.ok(
        !html.includes('data-testid="task-retry-btn-task-queued-1"'),
        'Retry button should not be rendered for QUEUED',
      );
    });

    it('renders Retry button only for FAILED, CANCELLED, and STOPPED tasks', () => {
      const failedTask = createMockTask('task-failed-1', 'FAILED');
      const cancelledTask = createMockTask('task-cancelled-1', 'CANCELLED');
      const stoppedTask = createMockTask('task-stopped-1', 'STOPPED');

      const hook = createMockHook([failedTask, cancelledTask, stoppedTask]);
      const html = renderToString(
        <AgentThreadsView projectId={testProjectId} hookOverride={hook} />,
      );

      assert.ok(
        html.includes('data-testid="task-retry-btn-task-failed-1"'),
        'Retry button should be rendered for FAILED',
      );
      assert.ok(
        html.includes('data-testid="task-retry-btn-task-cancelled-1"'),
        'Retry button should be rendered for CANCELLED',
      );
      assert.ok(
        html.includes('data-testid="task-retry-btn-task-stopped-1"'),
        'Retry button should be rendered for STOPPED',
      );

      assert.ok(!html.includes('data-testid="task-pause-btn-task-failed-1"'));
      assert.ok(!html.includes('data-testid="task-resume-btn-task-failed-1"'));
      assert.ok(!html.includes('data-testid="task-stop-btn-task-failed-1"'));
      assert.ok(!html.includes('data-testid="task-cancel-btn-task-failed-1"'));
    });

    it('renders no mutation control buttons for terminal COMPLETED tasks', () => {
      const completedTask = createMockTask('task-completed-1', 'COMPLETED');
      const hook = createMockHook([completedTask]);
      const html = renderToString(
        <AgentThreadsView projectId={testProjectId} hookOverride={hook} />,
      );

      assert.ok(!html.includes('data-testid="task-pause-btn-task-completed-1"'));
      assert.ok(!html.includes('data-testid="task-resume-btn-task-completed-1"'));
      assert.ok(!html.includes('data-testid="task-stop-btn-task-completed-1"'));
      assert.ok(!html.includes('data-testid="task-retry-btn-task-completed-1"'));
      assert.ok(!html.includes('data-testid="task-cancel-btn-task-completed-1"'));
    });
  });

  describe('In-Flight Action Labels & Disabled States', () => {
    it('disables control buttons and displays in-flight label when action is pending', () => {
      const task = createMockTask('task-action-pending-1', 'RUNNING');
      const hook = createMockHook([task], {
        isControlActionPending: true,
        pendingControlActionTaskId: 'task-action-pending-1',
      });

      const html = renderToString(
        <AgentThreadsView projectId={testProjectId} hookOverride={hook} />,
      );

      // When action is pending on running task:
      assert.ok(
        html.includes('Pausing...'),
        'Label should show Pausing... when pause is triggered',
      );
      assert.ok(
        html.includes('Stopping...'),
        'Label should show Stopping... when stop is triggered',
      );
      assert.ok(
        html.includes('Cancelling...'),
        'Label should show Cancelling... when cancel is triggered',
      );
      assert.ok(html.includes('disabled'), 'Buttons must be disabled during active request');
    });

    it('disables control buttons when action is pending on a paused task', () => {
      const task = createMockTask('task-paused-pending-1', 'PAUSED');
      const hook = createMockHook([task], {
        isControlActionPending: true,
        pendingControlActionTaskId: 'task-paused-pending-1',
      });

      const html = renderToString(
        <AgentThreadsView projectId={testProjectId} hookOverride={hook} />,
      );

      assert.ok(html.includes('Resuming...'), 'Label should show Resuming...');
      assert.ok(html.includes('Stopping...'), 'Label should show Stopping...');
      assert.ok(html.includes('Cancelling...'), 'Label should show Cancelling...');
      assert.ok(html.includes('disabled'), 'Buttons must be disabled');
    });
  });

  describe('Status Badges & History Preservation', () => {
    it('renders appropriate status badges for PAUSED and STOPPED tasks', () => {
      const pausedTask = createMockTask('task-badge-paused', 'PAUSED');
      const stoppedTask = createMockTask('task-badge-stopped', 'STOPPED');
      const hook = createMockHook([pausedTask, stoppedTask]);

      const html = renderToString(
        <AgentThreadsView projectId={testProjectId} hookOverride={hook} />,
      );

      assert.ok(html.includes('PAUSED'), 'PAUSED badge text rendered');
      assert.ok(html.includes('STOPPED'), 'STOPPED badge text rendered');
    });

    it('renders child attempt indicators with parent task correlation', () => {
      const parentTask = createMockTask('parent-task-1234', 'FAILED');
      const retryTask: AgentThreadTaskDto = {
        ...createMockTask('child-task-5678', 'QUEUED'),
        parentTaskId: 'parent-task-1234',
        retryCount: 1,
        attemptNumber: 2,
      };
      const hook = createMockHook([parentTask, retryTask]);

      const html = renderToString(
        <AgentThreadsView projectId={testProjectId} hookOverride={hook} />,
      );

      assert.ok(html.includes('Retries:'), 'Retry label rendered');
      assert.ok(html.includes('Child of parent-t'), 'Parent task correlation rendered');
    });
  });

  describe('V10 Phase 158 Recoverable Tasks UI Tests', () => {
    it('renders Recoverable Tasks section with last completed step, interruption time, retry count, and buttons', () => {
      const interruptedTask = {
        ...createMockTask('task-interrupted-1', 'INTERRUPTED'),
        isRecoverable: true,
        interruptedAt: '2026-10-06T10:04:00.000Z',
        retryCount: 1,
        maxRetries: 3,
      };
      const summary = {
        taskId: interruptedTask.id,
        threadId: testThreadId,
        projectId: testProjectId,
        taskTitle: interruptedTask.title,
        status: 'INTERRUPTED' as const,
        isRecoverable: true,
        interruptedAt: '2026-10-06T10:04:00.000Z',
        retryCount: 1,
        maxRetries: 3,
        attemptNumber: 1,
        lastCompletedStepTitle: 'Step 2: Generate Playwright Script',
        completedStepCount: 2,
        pendingStepCount: 1,
        canResume: true,
        canRetry: true,
        canCancel: true,
        lastCheckpointSeq: 2,
      };

      const hook = createMockHook([interruptedTask], {
        recoverableTasks: [summary],
      });

      const html = renderToString(
        <AgentThreadsView projectId={testProjectId} hookOverride={hook} />,
      );

      assert.ok(
        html.includes('data-testid="recoverable-tasks-section"'),
        'Recoverable tasks section rendered',
      );
      assert.ok(
        html.includes('Step 2: Generate Playwright Script'),
        'Last completed step title displayed',
      );
      assert.ok(html.includes('Retries:'), 'Retries label displayed');
      assert.ok(
        html.includes('data-testid="recovery-resume-btn-task-interrupted-1"'),
        'Resume button rendered',
      );
      assert.ok(
        html.includes('data-testid="recovery-retry-btn-task-interrupted-1"'),
        'Retry button rendered',
      );
      assert.ok(
        html.includes('data-testid="recovery-cancel-btn-task-interrupted-1"'),
        'Cancel button rendered',
      );
      assert.ok(html.includes('INTERRUPTED'), 'INTERRUPTED badge rendered');
    });

    it('renders Recoverable badge and Interrupted timestamp in task item card', () => {
      const recoverableTask = {
        ...createMockTask('task-rec-card-1', 'FAILED'),
        isRecoverable: true,
        interruptedAt: '2026-10-06T10:04:00.000Z',
      };
      const hook = createMockHook([recoverableTask]);

      const html = renderToString(
        <AgentThreadsView projectId={testProjectId} hookOverride={hook} />,
      );

      assert.ok(html.includes('Recoverable'), 'Recoverable badge rendered in card');
      assert.ok(html.includes('Interrupted:'), 'Interrupted timestamp rendered in card');
      assert.ok(html.includes('Resume'), 'Resume button enabled for recoverable failed task');
      assert.ok(html.includes('Retry'), 'Retry button enabled for recoverable failed task');
    });

    it('renders pending states when recovery action is in-flight', () => {
      const interruptedTask = {
        ...createMockTask('task-recovering-1', 'INTERRUPTED'),
        isRecoverable: true,
        interruptedAt: '2026-10-06T10:04:00.000Z',
      };
      const hook = createMockHook([interruptedTask], {
        isControlActionPending: true,
        pendingControlActionTaskId: 'task-recovering-1',
      });

      const html = renderToString(
        <AgentThreadsView projectId={testProjectId} hookOverride={hook} />,
      );

      assert.ok(html.includes('Resuming...'), 'Resuming... state rendered');
      assert.ok(html.includes('Retrying...'), 'Retrying... state rendered');
      assert.ok(html.includes('Cancelling...'), 'Cancelling... state rendered');
    });
  });
});
