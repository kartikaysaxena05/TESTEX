/**
 * @file apps/desktop/src/renderer/features/agent-threads/useAgentThreads.ts
 * React hook managing state, IPC interactions, and lifecycle for V10 Phase 142 Agent Threads & Tasks.
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  AgentThreadDto,
  AgentThreadTaskDto,
  AgentThreadMessageDto,
  AgentExecutionStepDto,
  AgentToolCallRecordDto,
  AgentToolApprovalDto,
  TaskRecoverySummaryDto,
  AgentAutonomousWorkflowReportDto,
} from '@ai-quality/contracts';

export interface UseAgentThreadsResult {
  readonly threads: readonly AgentThreadDto[];
  readonly activeThread: AgentThreadDto | null;
  readonly activeThreadId: string | null;
  readonly tasks: readonly AgentThreadTaskDto[];
  readonly activeTask: AgentThreadTaskDto | null;
  readonly activeTaskId: string | null;
  readonly messages: readonly AgentThreadMessageDto[];
  readonly executionSteps: readonly AgentExecutionStepDto[];
  readonly toolCalls: readonly AgentToolCallRecordDto[];
  readonly approvals: readonly AgentToolApprovalDto[];
  readonly pendingApprovals: readonly AgentToolApprovalDto[];
  readonly recoverableTasks: readonly TaskRecoverySummaryDto[];
  readonly activeWorkflowReport: AgentAutonomousWorkflowReportDto | null;
  readonly isLoading: boolean;
  readonly isCreatingTask: boolean;
  readonly error: string | null;
  readonly selectThread: (threadId: string) => void;
  readonly selectTask: (taskId: string) => void;
  readonly createThread: (title?: string) => Promise<AgentThreadDto | null>;
  readonly archiveThread: (threadId: string) => Promise<boolean>;
  readonly createTask: (title: string, instruction: string) => Promise<AgentThreadTaskDto | null>;
  readonly cancelTask: (taskId: string, reason?: string) => Promise<boolean>;
  readonly stopTask: (taskId: string, reason?: string) => Promise<boolean>;
  readonly pauseTask: (taskId: string, reason?: string) => Promise<boolean>;
  readonly retryTask: (taskId: string) => Promise<AgentThreadTaskDto | null>;
  readonly resumeTask: (taskId: string) => Promise<AgentThreadTaskDto | null>;
  readonly fetchRecoverableTasks: () => Promise<void>;
  readonly isControlActionPending: boolean;
  readonly pendingControlActionTaskId: string | null;
  readonly decideApproval: (
    approvalId: string,
    decision: 'APPROVE' | 'REJECT',
    reason?: string,
  ) => Promise<boolean>;
  readonly executeAutonomousWorkflow: (
    instruction: string,
    targetTestId?: string,
  ) => Promise<AgentAutonomousWorkflowReportDto | null>;
  readonly approveWorkflowFix: (taskId: string, reason?: string) => Promise<boolean>;
  readonly rejectWorkflowFix: (taskId: string, reason?: string) => Promise<boolean>;
  readonly refresh: () => Promise<void>;
}

export function useAgentThreads(projectId: string | null): UseAgentThreadsResult {
  const [threads, setThreads] = useState<readonly AgentThreadDto[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<readonly AgentThreadTaskDto[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeWorkflowReport, setActiveWorkflowReport] =
    useState<AgentAutonomousWorkflowReportDto | null>(null);
  const [messages, setMessages] = useState<readonly AgentThreadMessageDto[]>([]);
  const [executionSteps, setExecutionSteps] = useState<readonly AgentExecutionStepDto[]>([]);
  const [toolCalls, setToolCalls] = useState<readonly AgentToolCallRecordDto[]>([]);
  const [approvals, setApprovals] = useState<readonly AgentToolApprovalDto[]>([]);
  const [recoverableTasks, setRecoverableTasks] = useState<readonly TaskRecoverySummaryDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isControlActionPending, setIsControlActionPending] = useState(false);
  const [pendingControlActionTaskId, setPendingControlActionTaskId] = useState<string | null>(null);

  // Fetch threads for project
  const fetchThreads = useCallback(async () => {
    if (!projectId || !window.desktop?.agentThread) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await window.desktop.agentThread.listThreads({ projectId });
      if (res.ok) {
        setThreads(res.data);
        if (res.data.length > 0 && !activeThreadId) {
          const first = res.data[0];
          if (first) {
            setActiveThreadId(first.id);
          }
        }
      } else {
        setError(res.error?.message ?? 'Failed to load threads');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching threads');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, activeThreadId]);

  // Fetch tasks and messages for active thread
  const fetchThreadDetails = useCallback(async () => {
    if (!projectId || !activeThreadId || !window.desktop?.agentThread) return;
    try {
      const [tasksRes, messagesRes] = await Promise.all([
        window.desktop.agentThread.listTasks({ projectId, threadId: activeThreadId }),
        window.desktop.agentThread.listMessages({ projectId, threadId: activeThreadId }),
      ]);

      if (tasksRes.ok) {
        setTasks(tasksRes.data);
        if (tasksRes.data.length > 0 && !activeTaskId) {
          const firstTask = tasksRes.data[0];
          if (firstTask) {
            setActiveTaskId(firstTask.id);
          }
        } else if (tasksRes.data.length === 0) {
          setActiveTaskId(null);
        }
      }

      if (messagesRes.ok) {
        setMessages(messagesRes.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching thread details');
    }
  }, [projectId, activeThreadId, activeTaskId]);

  // Fetch execution steps and tool calls for active task
  const fetchTaskDetails = useCallback(async () => {
    if (!projectId || !activeTaskId || !window.desktop?.agentThread) {
      setExecutionSteps([]);
      setToolCalls([]);
      setApprovals([]);
      setActiveWorkflowReport(null);
      return;
    }
    try {
      const [stepsRes, toolsRes, approvalsRes, reportRes] = await Promise.all([
        window.desktop.agentThread.listExecutionSteps({ projectId, taskId: activeTaskId }),
        window.desktop.agentThread.listToolCalls({ projectId, taskId: activeTaskId }),
        window.desktop?.agentToolPermissions?.listApprovals
          ? window.desktop.agentToolPermissions.listApprovals({ projectId, taskId: activeTaskId })
          : Promise.resolve({ ok: true, data: [] as readonly AgentToolApprovalDto[] }),
        window.desktop.agentThread.getAutonomousWorkflowReport
          ? window.desktop.agentThread.getAutonomousWorkflowReport({
              projectId,
              taskId: activeTaskId,
            })
          : Promise.resolve({ ok: true, data: null }),
      ]);

      if (stepsRes.ok && stepsRes.data) {
        setExecutionSteps(stepsRes.data);
      }
      if (toolsRes.ok && toolsRes.data) {
        setToolCalls(toolsRes.data);
      }
      if (approvalsRes.ok && approvalsRes.data) {
        setApprovals(approvalsRes.data);
      }
      if (reportRes.ok) {
        setActiveWorkflowReport(reportRes.data ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching task details');
    }
  }, [projectId, activeTaskId]);

  const fetchRecoverableTasks = useCallback(async () => {
    if (!projectId || !window.desktop?.agentThread?.listRecoverableTasks) {
      setRecoverableTasks([]);
      return;
    }
    try {
      const res = await window.desktop.agentThread.listRecoverableTasks({
        projectId,
        threadId: activeThreadId ?? undefined,
      });
      if (res.ok) {
        setRecoverableTasks(res.data);
      }
    } catch {
      // Non-blocking for recoverable tasks listing
    }
  }, [projectId, activeThreadId]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  useEffect(() => {
    fetchThreadDetails();
  }, [fetchThreadDetails]);

  useEffect(() => {
    fetchTaskDetails();
  }, [fetchTaskDetails]);

  useEffect(() => {
    fetchRecoverableTasks();
  }, [fetchRecoverableTasks]);

  const selectThread = useCallback((threadId: string) => {
    setActiveThreadId(threadId);
    setActiveTaskId(null);
  }, []);

  const selectTask = useCallback((taskId: string) => {
    setActiveTaskId(taskId);
  }, []);

  const createThread = useCallback(
    async (title?: string): Promise<AgentThreadDto | null> => {
      if (!projectId || !window.desktop?.agentThread) return null;
      setError(null);
      try {
        const res = await window.desktop.agentThread.createThread({
          projectId,
          title: title || 'New Agent Thread',
        });
        if (res.ok) {
          setThreads(prev => [res.data, ...prev]);
          setActiveThreadId(res.data.id);
          setActiveTaskId(null);
          return res.data;
        } else {
          setError(res.error.message ?? 'Failed to create thread');
          return null;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error creating thread');
        return null;
      }
    },
    [projectId],
  );

  const archiveThread = useCallback(
    async (threadId: string): Promise<boolean> => {
      if (!projectId || !window.desktop?.agentThread) return false;
      setError(null);
      try {
        const res = await window.desktop.agentThread.archiveThread({ projectId, threadId });
        if (res.ok) {
          setThreads(prev =>
            prev.map(t => (t.id === threadId ? { ...t, status: 'ARCHIVED' as const } : t)),
          );
          return true;
        } else {
          setError(res.error.message ?? 'Failed to archive thread');
          return false;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error archiving thread');
        return false;
      }
    },
    [projectId],
  );

  const createTask = useCallback(
    async (title: string, instruction: string): Promise<AgentThreadTaskDto | null> => {
      if (!projectId || !activeThreadId || !window.desktop?.agentThread) return null;
      setIsCreatingTask(true);
      setError(null);
      try {
        const res = await window.desktop.agentThread.createTask({
          projectId,
          threadId: activeThreadId,
          title,
          instruction,
        });
        if (res.ok) {
          setTasks(prev => [res.data, ...prev]);
          setActiveTaskId(res.data.id);
          await fetchThreadDetails();
          return res.data;
        } else {
          setError(res.error.message ?? 'Failed to create task');
          return null;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error creating task');
        return null;
      } finally {
        setIsCreatingTask(false);
      }
    },
    [projectId, activeThreadId, fetchThreadDetails],
  );

  const cancelTask = useCallback(
    async (taskId: string, reason?: string): Promise<boolean> => {
      if (!projectId || !window.desktop?.agentThread) return false;
      setIsControlActionPending(true);
      setPendingControlActionTaskId(taskId);
      setError(null);
      try {
        const res = await window.desktop.agentThread.cancelTask({
          projectId,
          taskId,
          reason,
        });
        if (res.ok) {
          setTasks(prev => prev.map(t => (t.id === taskId ? res.data : t)));
          await fetchTaskDetails();
          await fetchRecoverableTasks();
          return true;
        } else {
          setError(res.error.message ?? 'Failed to cancel task');
          return false;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error cancelling task');
        return false;
      } finally {
        setIsControlActionPending(false);
        setPendingControlActionTaskId(null);
      }
    },
    [projectId, fetchTaskDetails, fetchRecoverableTasks],
  );

  const stopTask = useCallback(
    async (taskId: string, reason?: string): Promise<boolean> => {
      if (!projectId || !window.desktop?.agentThread) return false;
      setIsControlActionPending(true);
      setPendingControlActionTaskId(taskId);
      setError(null);
      try {
        const res = await window.desktop.agentThread.stopTask({
          projectId,
          taskId,
          reason,
        });
        if (res.ok) {
          setTasks(prev => prev.map(t => (t.id === taskId ? res.data : t)));
          await fetchTaskDetails();
          await fetchRecoverableTasks();
          return true;
        } else {
          setError(res.error.message ?? 'Failed to stop task');
          return false;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error stopping task');
        return false;
      } finally {
        setIsControlActionPending(false);
        setPendingControlActionTaskId(null);
      }
    },
    [projectId, fetchTaskDetails, fetchRecoverableTasks],
  );

  const pauseTask = useCallback(
    async (taskId: string, reason?: string): Promise<boolean> => {
      if (!projectId || !window.desktop?.agentThread) return false;
      setIsControlActionPending(true);
      setPendingControlActionTaskId(taskId);
      setError(null);
      try {
        const res = await window.desktop.agentThread.pauseTask({
          projectId,
          taskId,
          reason,
        });
        if (res.ok) {
          setTasks(prev => prev.map(t => (t.id === taskId ? res.data : t)));
          await fetchTaskDetails();
          await fetchRecoverableTasks();
          return true;
        } else {
          setError(res.error.message ?? 'Failed to pause task');
          return false;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error pausing task');
        return false;
      } finally {
        setIsControlActionPending(false);
        setPendingControlActionTaskId(null);
      }
    },
    [projectId, fetchTaskDetails, fetchRecoverableTasks],
  );

  const retryTask = useCallback(
    async (taskId: string): Promise<AgentThreadTaskDto | null> => {
      if (!projectId || !window.desktop?.agentThread) return null;
      setIsControlActionPending(true);
      setPendingControlActionTaskId(taskId);
      setError(null);
      try {
        const res = await window.desktop.agentThread.retryTask({
          projectId,
          taskId,
        });
        if (res.ok) {
          setTasks(prev => [res.data, ...prev]);
          setActiveTaskId(res.data.id);
          await fetchThreadDetails();
          await fetchRecoverableTasks();
          return res.data;
        } else {
          setError(res.error.message ?? 'Failed to retry task');
          return null;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error retrying task');
        return null;
      } finally {
        setIsControlActionPending(false);
        setPendingControlActionTaskId(null);
      }
    },
    [projectId, fetchThreadDetails, fetchRecoverableTasks],
  );

  const resumeTask = useCallback(
    async (taskId: string): Promise<AgentThreadTaskDto | null> => {
      if (!projectId || !window.desktop?.agentThread) return null;
      setIsControlActionPending(true);
      setPendingControlActionTaskId(taskId);
      setError(null);
      try {
        const res = await window.desktop.agentThread.resumeTask({
          projectId,
          taskId,
        });
        if (res.ok) {
          setTasks(prev => prev.map(t => (t.id === taskId ? res.data : t)));
          await fetchTaskDetails();
          await fetchRecoverableTasks();
          return res.data;
        } else {
          setError(res.error.message ?? 'Failed to resume task');
          return null;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error resuming task');
        return null;
      } finally {
        setIsControlActionPending(false);
        setPendingControlActionTaskId(null);
      }
    },
    [projectId, fetchTaskDetails, fetchRecoverableTasks],
  );

  const decideApproval = useCallback(
    async (
      approvalId: string,
      decision: 'APPROVE' | 'REJECT',
      reason?: string,
    ): Promise<boolean> => {
      if (!projectId || !window.desktop?.agentToolPermissions?.decideApproval) return false;
      setError(null);
      try {
        const res = await window.desktop.agentToolPermissions.decideApproval({
          projectId,
          approvalId,
          decision,
          reason,
        });
        if (res.ok) {
          await fetchThreadDetails();
          await fetchTaskDetails();
          return true;
        } else {
          setError(res.error?.message ?? 'Failed to submit approval decision');
          return false;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error deciding approval');
        return false;
      }
    },
    [projectId, fetchThreadDetails, fetchTaskDetails],
  );

  const executeAutonomousWorkflow = useCallback(
    async (
      instruction: string,
      targetTestId?: string,
    ): Promise<AgentAutonomousWorkflowReportDto | null> => {
      if (
        !projectId ||
        !activeThreadId ||
        !window.desktop?.agentThread?.executeAutonomousWorkflow
      ) {
        setError('Agent thread system is not available.');
        return null;
      }
      setIsCreatingTask(true);
      setError(null);
      try {
        const res = await window.desktop.agentThread.executeAutonomousWorkflow({
          projectId,
          threadId: activeThreadId,
          instruction,
          targetTestId,
        });
        if (res.ok) {
          setActiveWorkflowReport(res.data);
          setActiveTaskId(res.data.taskId);
          await fetchThreadDetails();
          await fetchTaskDetails();
          return res.data;
        } else {
          setError(res.error?.message ?? 'Failed to execute autonomous workflow');
          return null;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error executing autonomous workflow');
        return null;
      } finally {
        setIsCreatingTask(false);
      }
    },
    [projectId, activeThreadId, fetchThreadDetails, fetchTaskDetails],
  );

  const approveWorkflowFix = useCallback(
    async (taskId: string, reason?: string): Promise<boolean> => {
      if (!projectId || !window.desktop?.agentThread?.approveWorkflowFix) return false;
      setIsControlActionPending(true);
      setPendingControlActionTaskId(taskId);
      setError(null);
      try {
        const res = await window.desktop.agentThread.approveWorkflowFix({
          projectId,
          taskId,
          decisionReason: reason,
        });
        if (res.ok) {
          setActiveWorkflowReport(res.data);
          await fetchThreadDetails();
          await fetchTaskDetails();
          return true;
        } else {
          setError(res.error?.message ?? 'Failed to approve workflow fix');
          return false;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error approving workflow fix');
        return false;
      } finally {
        setIsControlActionPending(false);
        setPendingControlActionTaskId(null);
      }
    },
    [projectId, fetchThreadDetails, fetchTaskDetails],
  );

  const rejectWorkflowFix = useCallback(
    async (taskId: string, reason?: string): Promise<boolean> => {
      if (!projectId || !window.desktop?.agentThread?.rejectWorkflowFix) return false;
      setIsControlActionPending(true);
      setPendingControlActionTaskId(taskId);
      setError(null);
      try {
        const res = await window.desktop.agentThread.rejectWorkflowFix({
          projectId,
          taskId,
          rejectionReason: reason,
        });
        if (res.ok) {
          setActiveWorkflowReport(res.data);
          await fetchThreadDetails();
          await fetchTaskDetails();
          return true;
        } else {
          setError(res.error?.message ?? 'Failed to reject workflow fix');
          return false;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error rejecting workflow fix');
        return false;
      } finally {
        setIsControlActionPending(false);
        setPendingControlActionTaskId(null);
      }
    },
    [projectId, fetchThreadDetails, fetchTaskDetails],
  );

  const refresh = useCallback(async () => {
    await fetchThreads();
    await fetchThreadDetails();
    await fetchTaskDetails();
    await fetchRecoverableTasks();
  }, [fetchThreads, fetchThreadDetails, fetchTaskDetails, fetchRecoverableTasks]);

  const activeThread = threads.find(t => t.id === activeThreadId) ?? null;
  const activeTask = tasks.find(t => t.id === activeTaskId) ?? null;
  const pendingApprovals = approvals.filter(a => a.status === 'PENDING');

  return {
    threads,
    activeThread,
    activeThreadId,
    tasks,
    activeTask,
    activeTaskId,
    messages,
    executionSteps,
    toolCalls,
    approvals,
    pendingApprovals,
    recoverableTasks,
    activeWorkflowReport,
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
    fetchRecoverableTasks,
    isControlActionPending,
    pendingControlActionTaskId,
    decideApproval,
    executeAutonomousWorkflow,
    approveWorkflowFix,
    rejectWorkflowFix,
    refresh,
  };
}
