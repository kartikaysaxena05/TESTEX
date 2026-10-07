/**
 * @file apps/desktop/src/renderer/features/agent-threads/AgentThreadsView.tsx
 * UI foundation for V10 Phase 142 Task / Conversation / Thread Model.
 * Provides thread navigation, task lifecycle controls (Cancel, Retry, Resume),
 * message stream inspection, execution step tracking, and tool-call record view.
 */

import React, { useState } from 'react';
import { useAgentThreads, type UseAgentThreadsResult } from './useAgentThreads.js';
import { Button, Badge, Card, Spinner, Alert, Input, Textarea, Separator } from '../../ui/index.js';
import type { AgentThreadTaskStatus } from '@ai-quality/contracts';
import { AgentActivityStreamView } from '../agent-activity/index.js';
import {
  HumanApprovalCard,
  ApprovalHistoryView,
  useApprovalGate,
} from '../agent-approval/index.js';
import { FileReviewWorkspace } from '../file-review/index.js';

export interface AgentThreadsViewProps {
  readonly projectId: string | null;
  readonly hookOverride?: UseAgentThreadsResult;
  readonly defaultTab?: 'activity' | 'steps' | 'approvals' | 'reviews' | 'workflow';
}

function getStatusBadgeVariant(
  status: AgentThreadTaskStatus,
): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'COMPLETED':
      return 'success';
    case 'RUNNING':
    case 'PLANNING':
      return 'info';
    case 'WAITING_FOR_APPROVAL':
    case 'PAUSED':
    case 'INTERRUPTED':
      return 'warning';
    case 'FAILED':
    case 'CANCELLED':
    case 'STOPPED':
      return 'danger';
    case 'QUEUED':
    default:
      return 'neutral';
  }
}

export function AgentThreadsView({
  projectId,
  hookOverride,
  defaultTab,
}: AgentThreadsViewProps): React.JSX.Element {
  const hook = useAgentThreads(projectId);
  const {
    threads,
    activeThread,
    activeThreadId,
    tasks,
    activeTask,
    messages,
    executionSteps,
    toolCalls,
    recoverableTasks,
    isLoading,
    isCreatingTask,
    error,
    selectThread,
    selectTask,
    createThread,
    archiveThread,
    createTask,
    cancelTask,
    stopTask,
    pauseTask,
    retryTask,
    resumeTask,
    isControlActionPending,
    pendingControlActionTaskId,
    pendingApprovals,
    decideApproval,
    activeWorkflowReport,
    approveWorkflowFix,
    rejectWorkflowFix,
  } = hookOverride ?? hook;

  const [newThreadTitle, setNewThreadTitle] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskInstruction, setTaskInstruction] = useState('');
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [activeTaskTab, setActiveTaskTab] = useState<
    'activity' | 'steps' | 'approvals' | 'reviews' | 'workflow'
  >(defaultTab ?? 'activity');

  const approvalGate = useApprovalGate({
    projectId,
    taskId: activeTask?.id,
    threadId: activeThreadId,
  });

  const displayedThreads = threads.filter(t => (showArchived ? true : t.status === 'ACTIVE'));

  const handleCreateThreadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newThreadTitle.trim()) return;
    await createThread(newThreadTitle.trim());
    setNewThreadTitle('');
  };

  const handleCreateTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !taskInstruction.trim()) return;
    await createTask(taskTitle.trim(), taskInstruction.trim());
    setTaskTitle('');
    setTaskInstruction('');
    setShowNewTaskForm(false);
  };

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full p-8 text-neutral-400">
        Please select a project to view agent threads and tasks.
      </div>
    );
  }

  return (
    <div
      className="flex h-full w-full bg-neutral-900 text-neutral-100 overflow-hidden"
      data-testid="agent-threads-view"
    >
      {/* LEFT SIDEBAR: Threads List & Controls */}
      <aside className="w-80 border-r border-neutral-800 flex flex-col bg-neutral-950">
        <div className="p-4 border-b border-neutral-800 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-neutral-200">Agent Threads</h2>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowArchived(!showArchived)}
              className="text-xs"
            >
              {showArchived ? 'Active Only' : 'Show All'}
            </Button>
          </div>

          <form onSubmit={handleCreateThreadSubmit} className="flex gap-2">
            <Input
              value={newThreadTitle}
              onChange={e => setNewThreadTitle(e.target.value)}
              placeholder="New thread title..."
              className="text-sm"
            />
            <Button type="submit" size="sm" variant="primary" disabled={!newThreadTitle.trim()}>
              + New
            </Button>
          </form>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading && threads.length === 0 ? (
            <div className="flex items-center justify-center p-6 text-neutral-500">
              <Spinner size="sm" />
              <span className="ml-2 text-xs">Loading threads...</span>
            </div>
          ) : displayedThreads.length === 0 ? (
            <div className="p-6 text-center text-xs text-neutral-500">
              No threads found. Create one above to begin.
            </div>
          ) : (
            displayedThreads.map(thread => {
              const isSelected = thread.id === activeThreadId;
              const isArchived = thread.status === 'ARCHIVED';
              return (
                <div
                  key={thread.id}
                  onClick={() => selectThread(thread.id)}
                  className={`p-3 rounded-lg cursor-pointer transition-colors border ${
                    isSelected
                      ? 'bg-neutral-800/80 border-cyan-500/50'
                      : 'bg-neutral-900/50 border-neutral-800/60 hover:bg-neutral-800/40'
                  }`}
                  data-testid={`thread-item-${thread.id}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm truncate text-neutral-200">
                      {thread.title}
                    </span>
                    {isArchived ? (
                      <Badge variant="neutral" className="text-[10px]">
                        Archived
                      </Badge>
                    ) : (
                      <Badge variant="info" className="text-[10px]">
                        Active
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-2 text-[11px] text-neutral-400">
                    <span>{new Date(thread.createdAt).toLocaleDateString()}</span>
                    {!isArchived && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          archiveThread(thread.id);
                        }}
                        className="text-neutral-500 hover:text-red-400 text-[10px] underline"
                      >
                        Archive
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col overflow-hidden bg-neutral-900">
        {error && (
          <div className="p-3 border-b border-red-900/50 bg-red-950/40">
            <Alert variant="danger">{error}</Alert>
          </div>
        )}

        {!activeThread ? (
          <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">
            Select or create a thread to view its tasks and execution history.
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* THREAD HEADER */}
            <header className="p-4 border-b border-neutral-800 bg-neutral-950/60 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-lg font-bold text-neutral-100">{activeThread.title}</h1>
                  <Badge
                    variant={activeThread.status === 'ACTIVE' ? 'info' : 'neutral'}
                    className="text-xs"
                  >
                    {activeThread.status}
                  </Badge>
                </div>
                <p className="text-xs text-neutral-400 mt-1">
                  Thread ID: <code className="text-neutral-300">{activeThread.id}</code>
                </p>
              </div>

              {activeThread.status === 'ACTIVE' && (
                <Button
                  size="sm"
                  onClick={() => setShowNewTaskForm(!showNewTaskForm)}
                  variant={showNewTaskForm ? 'secondary' : 'primary'}
                >
                  {showNewTaskForm ? 'Cancel' : '+ New Task'}
                </Button>
              )}
            </header>

            {/* NEW TASK FORM DRAWER / PANEL */}
            {showNewTaskForm && (
              <div className="p-4 border-b border-neutral-800 bg-neutral-950/90">
                <form onSubmit={handleCreateTaskSubmit} className="space-y-3 max-w-2xl">
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">
                      Task Title
                    </label>
                    <Input
                      value={taskTitle}
                      onChange={e => setTaskTitle(e.target.value)}
                      placeholder="e.g. Verify Login Validation Flow"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">
                      Task Instruction
                    </label>
                    <Textarea
                      value={taskInstruction}
                      onChange={e => setTaskInstruction(e.target.value)}
                      placeholder="Detailed instructions for the autonomous quality agent..."
                      rows={3}
                      required
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={isCreatingTask || !taskTitle.trim()}
                    >
                      {isCreatingTask ? <Spinner size="sm" /> : 'Enqueue Task'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setShowNewTaskForm(false)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {/* 2-COLUMN WORKSPACE: Tasks & Steps on Left, Messages on Right */}
            <div className="flex-1 flex overflow-hidden">
              {/* TASKS & EXECUTION DETAILS */}
              <section className="w-1/2 border-r border-neutral-800 flex flex-col overflow-hidden">
                <div className="p-3 border-b border-neutral-800 bg-neutral-950/40 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    Tasks & Execution
                  </h3>
                  <span className="text-xs text-neutral-500">{tasks.length} tasks</span>
                </div>

                {/* Tasks List */}
                {/* RECOVERABLE TASKS BANNER (Minimal Codex-style recovery experience) */}
                {((recoverableTasks && recoverableTasks.length > 0) ||
                  tasks.some(t => t.isRecoverable)) && (
                  <div
                    className="p-3 bg-amber-950/30 border-b border-amber-900/40 space-y-2"
                    data-testid="recoverable-tasks-section"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                        <span className="text-xs font-semibold text-amber-200 uppercase tracking-wider">
                          Recoverable Tasks (
                          {recoverableTasks && recoverableTasks.length > 0
                            ? recoverableTasks.length
                            : tasks.filter(t => t.isRecoverable).length}
                          )
                        </span>
                      </div>
                      <Badge variant="warning" className="text-[10px]">
                        Interrupted
                      </Badge>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {(recoverableTasks && recoverableTasks.length > 0
                        ? recoverableTasks
                        : tasks
                            .filter(t => t.isRecoverable)
                            .map(t => ({
                              taskId: t.id,
                              threadId: t.threadId,
                              projectId: t.projectId,
                              taskTitle: t.title,
                              status: t.status,
                              isRecoverable: t.isRecoverable,
                              interruptedAt: t.interruptedAt,
                              retryCount: t.retryCount,
                              maxRetries: t.maxRetries,
                              attemptNumber: t.attemptNumber,
                              lastCompletedStepTitle: null as string | null,
                              completedStepCount: 0,
                              pendingStepCount: 0,
                              canResume: true,
                              canRetry: t.retryCount < t.maxRetries,
                              canCancel: true,
                              lastCheckpointSeq: t.lastCheckpointSeq,
                            }))
                      ).map(rec => {
                        const isRecActionPending =
                          isControlActionPending && pendingControlActionTaskId === rec.taskId;
                        return (
                          <div
                            key={rec.taskId}
                            className="p-2.5 rounded bg-neutral-900/80 border border-amber-900/40 text-xs space-y-1.5"
                            data-testid={`recoverable-task-${rec.taskId}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-neutral-200 truncate">
                                {rec.taskTitle}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <Badge variant="warning" className="text-[10px]">
                                  {rec.status === 'INTERRUPTED' ? 'Interrupted' : 'Recoverable'}
                                </Badge>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-1 text-[11px] text-neutral-400">
                              <div>
                                <span className="text-neutral-500">Last step: </span>
                                <span className="text-neutral-300 font-mono">
                                  {rec.lastCompletedStepTitle ?? 'None'}
                                </span>
                              </div>
                              <div>
                                <span className="text-neutral-500">Interrupted: </span>
                                <span className="text-neutral-300">
                                  {rec.interruptedAt
                                    ? new Date(rec.interruptedAt).toLocaleTimeString()
                                    : 'Recently'}
                                </span>
                              </div>
                              <div>
                                <span className="text-neutral-500">Retries: </span>
                                <span className="text-neutral-300">
                                  {rec.retryCount} / {rec.maxRetries}
                                </span>
                              </div>
                              <div>
                                <span className="text-neutral-500">Completed steps: </span>
                                <span className="text-neutral-300">{rec.completedStepCount}</span>
                              </div>
                            </div>

                            <div className="flex gap-2 justify-end pt-1">
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => resumeTask(rec.taskId)}
                                disabled={isControlActionPending || !rec.canResume}
                                className="text-[10px]"
                                data-testid={`recovery-resume-btn-${rec.taskId}`}
                              >
                                {isRecActionPending ? 'Resuming...' : 'Resume'}
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => retryTask(rec.taskId)}
                                disabled={isControlActionPending || !rec.canRetry}
                                className="text-[10px] text-amber-400"
                                data-testid={`recovery-retry-btn-${rec.taskId}`}
                              >
                                {isRecActionPending ? 'Retrying...' : 'Retry'}
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => cancelTask(rec.taskId)}
                                disabled={isControlActionPending || !rec.canCancel}
                                className="text-[10px]"
                                data-testid={`recovery-cancel-btn-${rec.taskId}`}
                              >
                                {isRecActionPending ? 'Cancelling...' : 'Cancel'}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="max-h-64 overflow-y-auto p-3 space-y-2 border-b border-neutral-800 bg-neutral-950/20">
                  {tasks.length === 0 ? (
                    <div className="text-xs text-neutral-500 p-2 text-center">
                      No tasks in this thread yet.
                    </div>
                  ) : (
                    tasks.map(task => {
                      const isTaskSelected = task.id === activeTask?.id;
                      const isActionPending =
                        isControlActionPending && pendingControlActionTaskId === task.id;
                      const canCancel =
                        task.status === 'RUNNING' ||
                        task.status === 'PLANNING' ||
                        task.status === 'QUEUED' ||
                        task.status === 'PAUSED' ||
                        task.status === 'WAITING_FOR_APPROVAL' ||
                        task.status === 'INTERRUPTED' ||
                        task.isRecoverable;
                      const canStop =
                        task.status === 'RUNNING' ||
                        task.status === 'PLANNING' ||
                        task.status === 'QUEUED' ||
                        task.status === 'PAUSED' ||
                        task.status === 'WAITING_FOR_APPROVAL';
                      const canPause = task.status === 'RUNNING';
                      const canRetry =
                        task.status === 'FAILED' ||
                        task.status === 'CANCELLED' ||
                        task.status === 'STOPPED' ||
                        task.status === 'INTERRUPTED';
                      const canResume =
                        task.status === 'WAITING_FOR_APPROVAL' ||
                        task.status === 'PAUSED' ||
                        task.status === 'INTERRUPTED' ||
                        (task.status === 'FAILED' && task.isRecoverable);

                      return (
                        <Card
                          key={task.id}
                          onClick={() => selectTask(task.id)}
                          className={`cursor-pointer transition-colors p-3 ${
                            isTaskSelected
                              ? 'border-cyan-500/60 bg-neutral-800/60'
                              : 'border-neutral-800 hover:bg-neutral-800/30'
                          }`}
                          data-testid={`task-item-${task.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-sm text-neutral-200">
                              {task.title}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {task.isRecoverable && task.status !== 'INTERRUPTED' && (
                                <Badge
                                  variant="warning"
                                  className="text-[10px]"
                                  data-testid={`task-recoverable-badge-${task.id}`}
                                >
                                  Recoverable
                                </Badge>
                              )}
                              <Badge
                                variant={getStatusBadgeVariant(task.status)}
                                className="text-[10px]"
                              >
                                {task.status}
                              </Badge>
                            </div>
                          </div>
                          <p className="text-xs text-neutral-400 mt-1 line-clamp-2">
                            {task.instruction}
                          </p>
                          {task.interruptedAt && (
                            <div
                              className="text-[10px] text-amber-400/90 mt-1"
                              data-testid={`task-interrupted-at-${task.id}`}
                            >
                              Interrupted: {new Date(task.interruptedAt).toLocaleTimeString()}
                            </div>
                          )}

                          <div className="flex items-center justify-between mt-3 text-[11px] text-neutral-400">
                            <span>
                              Retries: {task.retryCount}
                              {task.parentTaskId
                                ? ` (Child of ${task.parentTaskId.slice(0, 8)})`
                                : ''}
                            </span>
                            <div
                              className="flex gap-2 flex-wrap justify-end"
                              onClick={e => e.stopPropagation()}
                            >
                              {canPause && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => pauseTask(task.id)}
                                  disabled={isControlActionPending}
                                  className="text-[10px] text-amber-300 border-amber-600/40"
                                  data-testid={`task-pause-btn-${task.id}`}
                                >
                                  {isActionPending ? 'Pausing...' : 'Pause'}
                                </Button>
                              )}
                              {canResume && (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => resumeTask(task.id)}
                                  disabled={isControlActionPending}
                                  className="text-[10px]"
                                  data-testid={`task-resume-btn-${task.id}`}
                                >
                                  {isActionPending ? 'Resuming...' : 'Resume'}
                                </Button>
                              )}
                              {canStop && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => stopTask(task.id)}
                                  disabled={isControlActionPending}
                                  className="text-[10px] text-orange-400 border-orange-600/40"
                                  data-testid={`task-stop-btn-${task.id}`}
                                >
                                  {isActionPending ? 'Stopping...' : 'Stop'}
                                </Button>
                              )}
                              {canRetry && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => retryTask(task.id)}
                                  disabled={isControlActionPending}
                                  className="text-[10px] text-amber-400"
                                  data-testid={`task-retry-btn-${task.id}`}
                                >
                                  {isActionPending ? 'Retrying...' : 'Retry'}
                                </Button>
                              )}
                              {canCancel && (
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => cancelTask(task.id)}
                                  disabled={isControlActionPending}
                                  className="text-[10px]"
                                  data-testid={`task-cancel-btn-${task.id}`}
                                >
                                  {isActionPending ? 'Cancelling...' : 'Cancel'}
                                </Button>
                              )}
                            </div>
                          </div>
                        </Card>
                      );
                    })
                  )}
                </div>

                {/* Tab Switcher: Live Activity vs Steps */}
                {activeTask && (
                  <div className="flex items-center border-b border-neutral-800 bg-neutral-900/60 px-3 py-1.5 gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTaskTab('activity')}
                      className={`text-xs px-2.5 py-1 rounded transition-colors font-medium ${
                        activeTaskTab === 'activity'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                      data-testid="tab-activity-stream"
                    >
                      Live Activity Stream
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTaskTab('steps')}
                      className={`text-xs px-2.5 py-1 rounded transition-colors font-medium ${
                        activeTaskTab === 'steps'
                          ? 'bg-neutral-800 text-neutral-200 border border-neutral-700'
                          : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                      data-testid="tab-execution-steps"
                    >
                      Steps & Records ({executionSteps.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTaskTab('approvals')}
                      className={`text-xs px-2.5 py-1 rounded transition-colors font-medium ${
                        activeTaskTab === 'approvals'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                      data-testid="tab-approvals"
                    >
                      Approvals{' '}
                      {approvalGate.pendingApproval ? '(!)' : `(${approvalGate.history.length})`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTaskTab('reviews')}
                      className={`text-xs px-2.5 py-1 rounded transition-colors font-medium ${
                        activeTaskTab === 'reviews'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                      data-testid="tab-reviews"
                    >
                      Review Workspace
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTaskTab('workflow')}
                      className={`text-xs px-2.5 py-1 rounded transition-colors font-medium ${
                        activeTaskTab === 'workflow'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                          : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                      data-testid="tab-workflow"
                    >
                      Workflow & Fix Report{' '}
                      {activeWorkflowReport ? `(${activeWorkflowReport.workflowStatus})` : ''}
                    </button>
                  </div>
                )}

                {/* Execution Steps, Live Activity, Reviews & Human Approval Gates */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {activeTask ? (
                    activeTaskTab === 'workflow' ? (
                      <div className="space-y-4 text-xs" data-testid="workflow-report-content">
                        {activeWorkflowReport ? (
                          <Card className="p-4 space-y-4 border-neutral-800 bg-neutral-900/60">
                            {/* Header */}
                            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                              <div>
                                <h4 className="font-semibold text-neutral-100 text-sm">
                                  Autonomous Test + Fix Workflow
                                </h4>
                                <p className="text-neutral-400 text-xs mt-0.5">
                                  {activeWorkflowReport.originalRequest}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant={
                                    activeWorkflowReport.workflowStatus === 'COMPLETED'
                                      ? 'success'
                                      : activeWorkflowReport.workflowStatus === 'FAILED'
                                        ? 'danger'
                                        : activeWorkflowReport.workflowStatus ===
                                            'WAITING_FOR_APPROVAL'
                                          ? 'warning'
                                          : 'info'
                                  }
                                  data-testid="workflow-status-badge"
                                >
                                  {activeWorkflowReport.workflowStatus}
                                </Badge>
                                {activeWorkflowReport.finalStatus && (
                                  <Badge
                                    variant={
                                      activeWorkflowReport.finalStatus === 'FIXED_AND_VERIFIED' ||
                                      activeWorkflowReport.finalStatus === 'NO_FIX_NEEDED'
                                        ? 'success'
                                        : activeWorkflowReport.finalStatus ===
                                            'NON_APPLICATION_FAILURE'
                                          ? 'warning'
                                          : 'danger'
                                    }
                                    data-testid="workflow-final-status-badge"
                                  >
                                    {activeWorkflowReport.finalStatus}
                                  </Badge>
                                )}
                                <Badge
                                  variant={activeWorkflowReport.releaseReady ? 'success' : 'danger'}
                                  data-testid="workflow-release-ready-badge"
                                >
                                  {activeWorkflowReport.releaseReady
                                    ? 'RELEASE READY'
                                    : 'RELEASE BLOCKED'}
                                </Badge>
                              </div>
                            </div>

                            {/* Plan Summary */}
                            {activeWorkflowReport.planSummary && (
                              <div className="p-2.5 rounded bg-neutral-950/40 border border-neutral-800">
                                <span className="font-medium text-neutral-300">Plan Summary: </span>
                                <span className="text-neutral-400">
                                  {activeWorkflowReport.planSummary}
                                </span>
                              </div>
                            )}

                            {/* HUMAN APPROVAL ACTION FOR WORKFLOW */}
                            {activeWorkflowReport.workflowStatus === 'WAITING_FOR_APPROVAL' &&
                              activeWorkflowReport.proposedPatch && (
                                <div
                                  className="p-3.5 rounded-lg border border-amber-600/50 bg-amber-950/30 space-y-3"
                                  data-testid="workflow-approval-box"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-semibold text-amber-200">
                                      Human Approval Required for Proposed Code Patch
                                    </span>
                                    <Badge variant="warning">WAITING_FOR_APPROVAL</Badge>
                                  </div>
                                  <p className="text-neutral-300 text-xs">
                                    Inspect the proposed fix below. You must approve the patch
                                    before it can be applied in the sandbox and reverified.
                                  </p>
                                  {/* Proposed Diff Preview */}
                                  <div className="p-2 rounded bg-neutral-950 font-mono text-[11px] overflow-x-auto border border-neutral-800">
                                    <div className="text-neutral-500 mb-1">
                                      Files:{' '}
                                      {activeWorkflowReport.proposedPatch.affectedFiles?.join(', ')}
                                    </div>
                                    <pre className="text-neutral-300 whitespace-pre-wrap">
                                      {activeWorkflowReport.proposedPatch.diff}
                                    </pre>
                                  </div>

                                  {/* Action Buttons */}
                                  <div className="flex items-center gap-3 pt-2">
                                    <Button
                                      size="sm"
                                      variant="primary"
                                      className="bg-emerald-600 hover:bg-emerald-500 text-white"
                                      onClick={async () => {
                                        await approveWorkflowFix(activeTask.id);
                                      }}
                                      disabled={isControlActionPending}
                                      data-testid="workflow-approve-btn"
                                    >
                                      Approve & Reverify Fix
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="danger"
                                      onClick={async () => {
                                        await rejectWorkflowFix(activeTask.id);
                                      }}
                                      disabled={isControlActionPending}
                                      data-testid="workflow-reject-btn"
                                    >
                                      Reject Fix
                                    </Button>
                                  </div>
                                </div>
                              )}

                            {/* Failure Intelligence & Root Cause */}
                            {activeWorkflowReport.failureClassification && (
                              <div className="grid grid-cols-2 gap-3">
                                <div className="p-2.5 rounded bg-neutral-950/40 border border-neutral-800 space-y-1">
                                  <span className="font-semibold text-neutral-300">
                                    Failure Intelligence:
                                  </span>
                                  <div className="text-neutral-400">
                                    Domain: {activeWorkflowReport.failureClassification.domain}
                                  </div>
                                  <div className="text-neutral-400">
                                    Class:{' '}
                                    {activeWorkflowReport.failureClassification.classification}
                                  </div>
                                  {activeWorkflowReport.failureClassification.explanation && (
                                    <div className="text-neutral-500 text-[11px]">
                                      {activeWorkflowReport.failureClassification.explanation}
                                    </div>
                                  )}
                                </div>
                                {activeWorkflowReport.rootCauseAnalysis && (
                                  <div className="p-2.5 rounded bg-neutral-950/40 border border-neutral-800 space-y-1">
                                    <span className="font-semibold text-neutral-300">
                                      Root-Cause Analysis:
                                    </span>
                                    <div className="text-neutral-400">
                                      Hypothesis:{' '}
                                      {activeWorkflowReport.rootCauseAnalysis.hypothesis}
                                    </div>
                                    <div className="text-neutral-400">
                                      Files:{' '}
                                      {activeWorkflowReport.rootCauseAnalysis.affectedFiles?.join(
                                        ', ',
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Reverification Results */}
                            {activeWorkflowReport.beforeAfterResults && (
                              <div className="p-2.5 rounded bg-neutral-950/40 border border-neutral-800 space-y-1">
                                <span className="font-semibold text-neutral-300">
                                  Reverification & Fix Validation:
                                </span>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge
                                    variant={
                                      activeWorkflowReport.beforeAfterResults.reverificationPassed
                                        ? 'success'
                                        : 'danger'
                                    }
                                    data-testid="reverification-badge"
                                  >
                                    {activeWorkflowReport.beforeAfterResults.reverificationPassed
                                      ? 'PASSED'
                                      : 'FAILED'}
                                  </Badge>
                                  <span className="text-neutral-400">
                                    {activeWorkflowReport.beforeAfterResults.afterResult}
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* Regression Retest */}
                            {activeWorkflowReport.regressionResults && (
                              <div className="p-2.5 rounded bg-neutral-950/40 border border-neutral-800 space-y-1">
                                <span className="font-semibold text-neutral-300">
                                  Targeted Regression Suite:
                                </span>
                                <div className="text-neutral-400">
                                  Run: {activeWorkflowReport.regressionResults.totalRun} | Passed:{' '}
                                  {activeWorkflowReport.regressionResults.passed} | Failed:{' '}
                                  {activeWorkflowReport.regressionResults.failed}
                                </div>
                              </div>
                            )}

                            {/* Unresolved Issues */}
                            {activeWorkflowReport.unresolvedIssues &&
                              activeWorkflowReport.unresolvedIssues.length > 0 && (
                                <div className="p-2.5 rounded bg-rose-950/30 border border-rose-900/40 space-y-1">
                                  <span className="font-semibold text-rose-300">
                                    Unresolved Issues:
                                  </span>
                                  <ul className="list-disc list-inside text-rose-200 text-xs">
                                    {activeWorkflowReport.unresolvedIssues.map((issue, idx) => (
                                      <li key={idx}>{issue}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                          </Card>
                        ) : (
                          <div className="p-4 text-center text-neutral-500">
                            No autonomous workflow report for this task.
                          </div>
                        )}
                      </div>
                    ) : activeTaskTab === 'reviews' ? (
                      <div className="h-full" data-testid="task-reviews-tab-content">
                        <FileReviewWorkspace
                          projectId={projectId ?? ''}
                          threadId={activeThread?.id}
                          taskId={activeTask.id}
                          taskTitle={activeTask.title}
                          threadTitle={activeThread?.title}
                          className="h-full border-0"
                        />
                      </div>
                    ) : activeTaskTab === 'approvals' ? (
                      <div className="space-y-4">
                        {approvalGate.pendingApproval && (
                          <HumanApprovalCard
                            approval={approvalGate.pendingApproval}
                            onApprove={async id => {
                              await approvalGate.approve(id);
                              if (activeTask) void resumeTask(activeTask.id);
                            }}
                            onReject={async (id, reason) => {
                              await approvalGate.reject(id, reason);
                            }}
                            onCancelTask={async () => {
                              if (activeTask) void cancelTask(activeTask.id);
                            }}
                            onReviewChanges={() => setActiveTaskTab('reviews')}
                            isSubmitting={approvalGate.isSubmitting}
                          />
                        )}
                        <ApprovalHistoryView
                          history={approvalGate.history}
                          isLoading={approvalGate.isLoading}
                        />
                      </div>
                    ) : activeTaskTab === 'activity' ? (
                      <div className="space-y-4 h-full flex flex-col">
                        {approvalGate.pendingApproval && (
                          <HumanApprovalCard
                            approval={approvalGate.pendingApproval}
                            onApprove={async id => {
                              await approvalGate.approve(id);
                              if (activeTask) void resumeTask(activeTask.id);
                            }}
                            onReject={async (id, reason) => {
                              await approvalGate.reject(id, reason);
                            }}
                            onCancelTask={async () => {
                              if (activeTask) void cancelTask(activeTask.id);
                            }}
                            onReviewChanges={() => setActiveTaskTab('reviews')}
                            isSubmitting={approvalGate.isSubmitting}
                          />
                        )}
                        <AgentActivityStreamView
                          projectId={projectId}
                          taskId={activeTask.id}
                          className="flex-1 border-0 bg-transparent rounded-none"
                        />
                      </div>
                    ) : (
                      <>
                        {approvalGate.pendingApproval && (
                          <HumanApprovalCard
                            approval={approvalGate.pendingApproval}
                            onApprove={async id => {
                              await approvalGate.approve(id);
                              if (activeTask) void resumeTask(activeTask.id);
                            }}
                            onReject={async (id, reason) => {
                              await approvalGate.reject(id, reason);
                            }}
                            onCancelTask={async () => {
                              if (activeTask) void cancelTask(activeTask.id);
                            }}
                            onReviewChanges={() => setActiveTaskTab('reviews')}
                            isSubmitting={approvalGate.isSubmitting}
                          />
                        )}
                        {/* HUMAN APPROVAL ACTION BANNER (Phase 144) */}
                        {(() => {
                          const firstPending = pendingApprovals[0];
                          if (!firstPending) return null;
                          return (
                            <div
                              className="p-3.5 rounded-lg border border-amber-500/50 bg-amber-950/30 text-amber-200 space-y-3"
                              data-testid="agent-tool-approval-banner"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-xs tracking-wide uppercase text-amber-400">
                                    Human Approval Required
                                  </span>
                                  <Badge variant="warning" className="text-[10px]">
                                    {firstPending.permissionLevel}
                                  </Badge>
                                </div>
                                <span className="text-[10px] text-amber-400/80 font-mono">
                                  {firstPending.toolName}
                                </span>
                              </div>

                              <p className="text-xs text-neutral-300">
                                {firstPending.reason ||
                                  `Agent requested authorization to run operation '${firstPending.requestedOperation}'.`}
                              </p>

                              {firstPending.inputPayload &&
                                Object.keys(firstPending.inputPayload).length > 0 && (
                                  <pre className="text-[11px] font-mono bg-neutral-950/80 p-2 rounded text-neutral-300 max-h-24 overflow-y-auto">
                                    {JSON.stringify(firstPending.inputPayload, null, 2)}
                                  </pre>
                                )}

                              <div className="flex gap-2 justify-end pt-1">
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => decideApproval(firstPending.id, 'REJECT')}
                                  data-testid="agent-tool-approval-reject-btn"
                                  className="text-xs"
                                >
                                  Reject
                                </Button>
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => decideApproval(firstPending.id, 'APPROVE')}
                                  data-testid="agent-tool-approval-approve-btn"
                                  className="text-xs"
                                >
                                  Approve & Continue
                                </Button>
                              </div>
                            </div>
                          );
                        })()}

                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                            Execution Steps ({executionSteps.length})
                          </h4>
                          {executionSteps.length === 0 ? (
                            <div className="text-xs text-neutral-500 p-2 bg-neutral-950/30 rounded border border-neutral-800">
                              No execution steps recorded yet.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {executionSteps.map(step => (
                                <div
                                  key={step.id}
                                  className="p-2.5 rounded bg-neutral-950/50 border border-neutral-800 text-xs"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-mono text-neutral-300">
                                      #{step.sequence} {step.title}
                                    </span>
                                    <Badge variant="neutral" className="text-[10px]">
                                      {step.status}
                                    </Badge>
                                  </div>
                                  {step.error && (
                                    <div className="text-red-400 text-[11px] mt-1 font-mono">
                                      Error: {step.error}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <Separator />

                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                            Tool Call Records ({toolCalls.length})
                          </h4>
                          {toolCalls.length === 0 ? (
                            <div className="text-xs text-neutral-500 p-2 bg-neutral-950/30 rounded border border-neutral-800">
                              No tool calls recorded yet.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {toolCalls.map(tc => (
                                <div
                                  key={tc.id}
                                  className="p-2.5 rounded bg-neutral-950/50 border border-neutral-800 text-xs font-mono"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-cyan-400 font-bold">{tc.toolName}</span>
                                    <Badge variant="neutral" className="text-[10px]">
                                      {tc.status}
                                    </Badge>
                                  </div>
                                  <div className="mt-1 text-neutral-400 text-[11px] truncate">
                                    Args: {JSON.stringify(tc.input)}
                                  </div>
                                  {tc.durationMs !== null && tc.durationMs !== undefined && (
                                    <div className="text-[10px] text-neutral-500 mt-1">
                                      Duration: {tc.durationMs}ms
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )
                  ) : (
                    <div className="text-xs text-neutral-500 text-center p-4">
                      Select a task above to inspect steps and tool execution records.
                    </div>
                  )}
                </div>
              </section>

              {/* MESSAGES STREAM ON RIGHT */}
              <section className="w-1/2 flex flex-col overflow-hidden bg-neutral-950/30">
                <div className="p-3 border-b border-neutral-800 bg-neutral-950/40 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    Thread Message Stream
                  </h3>
                  <span className="text-xs text-neutral-500">{messages.length} messages</span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.length === 0 ? (
                    <div className="text-xs text-neutral-500 text-center p-8">
                      No messages recorded in this thread yet.
                    </div>
                  ) : (
                    messages.map(msg => (
                      <div
                        key={msg.id}
                        className={`p-3 rounded-lg border text-sm ${
                          msg.role === 'USER'
                            ? 'bg-cyan-950/20 border-cyan-800/40 ml-4'
                            : msg.role === 'ASSISTANT'
                              ? 'bg-neutral-900 border-neutral-800 mr-4'
                              : msg.role === 'ERROR'
                                ? 'bg-red-950/20 border-red-900/40'
                                : 'bg-neutral-950/60 border-neutral-800/60 font-mono text-xs'
                        }`}
                        data-testid={`message-${msg.id}`}
                      >
                        <div className="flex items-center justify-between mb-1 text-[11px] text-neutral-400">
                          <span className="font-semibold">{msg.role}</span>
                          <span>
                            #{msg.sequence} • {new Date(msg.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap text-neutral-200">{msg.content}</p>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
