/**
 * @file apps/desktop/src/renderer/features/conversational-agent/useConversationalAgent.ts
 * React hook managing state and actions for V8 Phase 124 Conversational AI Testing Agent.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  AgentSessionDto,
  AgentMessageDto,
  AgentTaskDto,
  AgentPlanDto,
  AgentActivityDto,
  AgentRunControlAction,
  AgentRunControlResultDto,
  AgentEvidenceQueryResultDto,
  AgentActionApprovalResultDto,
} from '@ai-quality/contracts';

export interface PendingApprovalInfo {
  readonly taskId?: string;
  readonly action: string;
  readonly description: string;
  readonly environment?: string;
}

export interface UseConversationalAgentResult {
  readonly sessions: readonly AgentSessionDto[];
  readonly activeSession: AgentSessionDto | null;
  readonly activeSessionId: string | null;
  readonly isLoading: boolean;
  readonly isSending: boolean;
  readonly error: string | null;
  readonly activities: readonly AgentActivityDto[];
  readonly activePlan: AgentPlanDto | null;
  readonly activeTask: AgentTaskDto | null;
  readonly runStatus: AgentRunControlResultDto | null;
  readonly evidenceResult: AgentEvidenceQueryResultDto | null;
  readonly pendingApproval: PendingApprovalInfo | null;
  readonly createSession: (title?: string) => Promise<AgentSessionDto | null>;
  readonly selectSession: (sessionId: string) => Promise<void>;
  readonly deleteSession: (sessionId: string) => Promise<void>;
  readonly sendMessage: (content: string) => Promise<void>;
  readonly approveAction: (approved: boolean, reason?: string) => Promise<AgentActionApprovalResultDto | null>;
  readonly runControl: (action: AgentRunControlAction, runId?: string, reason?: string) => Promise<AgentRunControlResultDto | null>;
  readonly queryEvidence: (query: string, runId?: string) => Promise<AgentEvidenceQueryResultDto | null>;
  readonly refresh: () => Promise<void>;
}

export function useConversationalAgent(projectId: string | null): UseConversationalAgentResult {
  const [sessions, setSessions] = useState<readonly AgentSessionDto[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<AgentSessionDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [activities, setActivities] = useState<readonly AgentActivityDto[]>([]);
  const [activePlan, setActivePlan] = useState<AgentPlanDto | null>(null);
  const [activeTask, setActiveTask] = useState<AgentTaskDto | null>(null);
  const [runStatus, setRunStatus] = useState<AgentRunControlResultDto | null>(null);
  const [evidenceResult, setEvidenceResult] = useState<AgentEvidenceQueryResultDto | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApprovalInfo | null>(null);

  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fetch all sessions for active project
  const loadSessions = useCallback(async () => {
    if (!projectId || !window.desktop?.conversationalAgent?.listSessions) {
      setSessions([]);
      setActiveSession(null);
      setActiveSessionId(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await window.desktop.conversationalAgent.listSessions({ projectId });
      if (!isMountedRef.current) return;

      if (res.ok) {
        setSessions(res.data);
        if (res.data.length > 0) {
          if (!activeSessionId || !res.data.some((s) => s.id === activeSessionId)) {
            const first = res.data[0];
            if (first) {
              setActiveSessionId(first.id);
              setActiveSession(first);
            }
          }
        } else {
          setActiveSessionId(null);
          setActiveSession(null);
        }
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [projectId, activeSessionId]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  // Load single session details when activeSessionId changes
  const selectSession = useCallback(
    async (sessionId: string) => {
      if (!projectId || !window.desktop?.conversationalAgent?.getSession) return;

      setActiveSessionId(sessionId);
      setError(null);

      try {
        const res = await window.desktop.conversationalAgent.getSession({
          sessionId,
          projectId,
        });
        if (!isMountedRef.current) return;

        if (res.ok) {
          setActiveSession(res.data);

          if (res.data.currentTask) {
            setActiveTask(res.data.currentTask);
            if (res.data.currentTask.plan) {
              setActivePlan(res.data.currentTask.plan);
            }
            if (res.data.currentTask.approvalState === 'PENDING') {
              setPendingApproval({
                taskId: res.data.currentTask.id,
                action: res.data.currentTask.plan?.steps.find((s) => s.requiresApproval)?.action ?? 'Approval Required',
                description: res.data.currentTask.plan?.approvalReason ?? res.data.currentTask.userPrompt,
                environment: res.data.currentTask.plan?.approvalReason?.includes('PRODUCTION') ? 'PRODUCTION' : undefined,
              });
            } else {
              setPendingApproval(null);
            }
          } else {
            setActiveTask(null);
            setPendingApproval(null);
          }
        } else {
          setError(res.error.message);
        }
      } catch (err) {
        if (isMountedRef.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    },
    [projectId],
  );

  const createSession = useCallback(
    async (title?: string): Promise<AgentSessionDto | null> => {
      if (!projectId || !window.desktop?.conversationalAgent?.createSession) return null;

      setError(null);
      setIsLoading(true);

      try {
        const res = await window.desktop.conversationalAgent.createSession({
          projectId,
          title: title ?? `Testing Session ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        });

        if (!isMountedRef.current) return null;

        if (res.ok) {
          const newSession = res.data;
          setSessions((prev) => [newSession, ...prev]);
          setActiveSessionId(newSession.id);
          setActiveSession(newSession);
          setActivities([]);
          setActivePlan(null);
          setActiveTask(null);
          setPendingApproval(null);
          return newSession;
        } else {
          setError(res.error.message);
          return null;
        }
      } catch (err) {
        if (isMountedRef.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
        return null;
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [projectId],
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      if (!projectId || !window.desktop?.conversationalAgent?.deleteSession) return;

      setError(null);
      try {
        const res = await window.desktop.conversationalAgent.deleteSession({
          sessionId,
          projectId,
        });

        if (!isMountedRef.current) return;

        if (res.ok) {
          setSessions((prev) => prev.filter((s) => s.id !== sessionId));
          if (activeSessionId === sessionId) {
            setActiveSessionId(null);
            setActiveSession(null);
            setActivities([]);
            setActivePlan(null);
            setActiveTask(null);
            setPendingApproval(null);
          }
        } else {
          setError(res.error.message);
        }
      } catch (err) {
        if (isMountedRef.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    },
    [projectId, activeSessionId],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!projectId || !content.trim()) return;

      let currentSessionId = activeSessionId;
      if (!currentSessionId) {
        const created = await createSession();
        if (!created) return;
        currentSessionId = created.id;
      }

      if (!window.desktop?.conversationalAgent?.sendMessage) return;

      setIsSending(true);
      setError(null);

      const tempUserMsg: AgentMessageDto = {
        id: `temp-${Date.now()}`,
        sessionId: currentSessionId,
        role: 'USER',
        content,
        createdAt: new Date().toISOString(),
      };

      setActiveSession((prev) =>
        prev
          ? {
              ...prev,
              status: 'THINKING',
              messages: [...prev.messages, tempUserMsg],
            }
          : null,
      );

      try {
        const res = await window.desktop.conversationalAgent.sendMessage({
          sessionId: currentSessionId,
          projectId,
          content,
        });

        if (!isMountedRef.current) return;

        if (res.ok) {
          const resp = res.data;
          setActivities(resp.activities ?? []);
          const plan = resp.agentMessage.plan ?? resp.task?.plan ?? null;
          if (plan) setActivePlan(plan);
          if (resp.task) setActiveTask(resp.task);

          setActiveSession((prev) => {
            if (!prev) return null;
            const messagesWithoutTemp = prev.messages.filter((m) => m.id !== tempUserMsg.id);
            return {
              ...prev,
              status: resp.sessionStatus,
              messages: [...messagesWithoutTemp, resp.userMessage, resp.agentMessage],
              currentTask: resp.task ?? prev.currentTask,
            };
          });

          if (resp.task && resp.task.approvalState === 'PENDING') {
            setPendingApproval({
              taskId: resp.task.id,
              action: plan?.steps.find((s) => s.requiresApproval)?.action ?? 'Tool Execution',
              description: plan?.approvalReason ?? resp.task.userPrompt,
              environment: plan?.approvalReason?.includes('PRODUCTION') ? 'PRODUCTION' : undefined,
            });
          } else if (plan?.requiresApproval) {
            setPendingApproval({
              action: plan.steps.find((s) => s.requiresApproval)?.action ?? 'Action Step',
              description: plan.approvalReason ?? 'Action requires approval',
              environment: plan.approvalReason?.includes('PRODUCTION') ? 'PRODUCTION' : undefined,
            });
          } else {
            setPendingApproval(null);
          }
        } else {
          setError(res.error.message);
          setActiveSession((prev) => (prev ? { ...prev, status: 'IDLE' } : null));
        }
      } catch (err) {
        if (isMountedRef.current) {
          setError(err instanceof Error ? err.message : String(err));
          setActiveSession((prev) => (prev ? { ...prev, status: 'IDLE' } : null));
        }
      } finally {
        if (isMountedRef.current) {
          setIsSending(false);
        }
      }
    },
    [projectId, activeSessionId, createSession],
  );

  const approveAction = useCallback(
    async (approved: boolean, reason?: string): Promise<AgentActionApprovalResultDto | null> => {
      if (!projectId || !activeSessionId || !window.desktop?.conversationalAgent?.approveAction) {
        return null;
      }

      setError(null);
      try {
        const res = await window.desktop.conversationalAgent.approveAction({
          sessionId: activeSessionId,
          projectId,
          approved,
          reason,
        });

        if (!isMountedRef.current) return null;

        if (res.ok) {
          setPendingApproval(null);
          setActiveSession((prev) =>
            prev
              ? {
                  ...prev,
                  approvalState: res.data.approvalState,
                  status: res.data.status,
                }
              : null,
          );
          return res.data;
        } else {
          setError(res.error.message);
          return null;
        }
      } catch (err) {
        if (isMountedRef.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
        return null;
      }
    },
    [projectId, activeSessionId],
  );

  const runControl = useCallback(
    async (action: AgentRunControlAction, runId?: string, reason?: string): Promise<AgentRunControlResultDto | null> => {
      if (!projectId || !activeSessionId || !window.desktop?.conversationalAgent?.runControl) {
        return null;
      }

      setError(null);
      try {
        const res = await window.desktop.conversationalAgent.runControl({
          sessionId: activeSessionId,
          projectId,
          action,
          runId,
          reason,
        });

        if (!isMountedRef.current) return null;

        if (res.ok) {
          setRunStatus(res.data);
          if (res.data.runStatus) {
            setActiveSession((prev) => (prev ? { ...prev, activeRunId: res.data.runId ?? prev.activeRunId } : null));
          }
          return res.data;
        } else {
          setError(res.error.message);
          return null;
        }
      } catch (err) {
        if (isMountedRef.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
        return null;
      }
    },
    [projectId, activeSessionId],
  );

  const queryEvidence = useCallback(
    async (query: string, runId?: string): Promise<AgentEvidenceQueryResultDto | null> => {
      if (!projectId || !window.desktop?.conversationalAgent?.getEvidence) {
        return null;
      }

      setError(null);
      try {
        const res = await window.desktop.conversationalAgent.getEvidence({
          projectId,
          runId: runId ?? activeSession?.activeRunId ?? undefined,
          query,
        });

        if (!isMountedRef.current) return null;

        if (res.ok) {
          setEvidenceResult(res.data);
          return res.data;
        } else {
          setError(res.error.message);
          return null;
        }
      } catch (err) {
        if (isMountedRef.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
        return null;
      }
    },
    [projectId, activeSession?.activeRunId],
  );

  return {
    sessions,
    activeSession,
    activeSessionId,
    isLoading,
    isSending,
    error,
    activities,
    activePlan,
    activeTask,
    runStatus,
    evidenceResult,
    pendingApproval,
    createSession,
    selectSession,
    deleteSession,
    sendMessage,
    approveAction,
    runControl,
    queryEvidence,
    refresh: loadSessions,
  };
}
