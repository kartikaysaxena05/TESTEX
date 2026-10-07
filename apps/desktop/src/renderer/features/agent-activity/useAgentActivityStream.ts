/**
 * @file apps/desktop/src/renderer/features/agent-activity/useAgentActivityStream.ts
 * React hook for live streaming agent activity & tool progress.
 *
 * Handles:
 * 1. Automatic recovery of persisted activity timeline on mount/reconnect.
 * 2. Subscription to live desktop activity events via Electron IPC.
 * 3. Event deduplication and strictly monotonic ordering.
 * 4. Incremental state updates without full-list destruction.
 * 5. Auto-scroll tracking and manual scroll detection.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  AgentActivityTimelineDto,
  AgentActivityEventDto,
  AgentActivityItemDto,
  DesktopResult,
} from '@ai-quality/contracts';

function findLastIndex<T>(arr: readonly T[] | T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    const item = arr[i];
    if (item !== undefined && predicate(item)) {
      return i;
    }
  }
  return -1;
}

export interface UseAgentActivityStreamOptions {
  readonly projectId: string | null;
  readonly taskId: string | null;
  readonly autoScrollInitial?: boolean;
}

export interface UseAgentActivityStreamResult {
  readonly timeline: AgentActivityTimelineDto | null;
  readonly isLoading: boolean;
  readonly isSubscribed: boolean;
  readonly error: string | null;
  readonly autoScroll: boolean;
  readonly isUserScrolledUp: boolean;
  readonly scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  readonly setAutoScroll: (enabled: boolean) => void;
  readonly resumeAutoScroll: () => void;
  readonly handleScroll: () => void;
  readonly refresh: () => Promise<void>;
}

const MAX_RENDERED_ITEMS = 250;

export function useAgentActivityStream({
  projectId,
  taskId,
  autoScrollInitial = true,
}: UseAgentActivityStreamOptions): UseAgentActivityStreamResult {
  const [timeline, setTimeline] = useState<AgentActivityTimelineDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(autoScrollInitial);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState<boolean>(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const processedEventIdsRef = useRef<Set<string>>(new Set());
  const lastSequenceRef = useRef<number>(0);

  // 1. Recover Persisted Timeline from Database
  const loadTimeline = useCallback(async () => {
    if (!projectId || !taskId) {
      setTimeline(null);
      setIsLoading(false);
      return;
    }

    const bridge = window.desktop?.agentActivity;
    if (!bridge) {
      setError('Agent activity bridge unavailable.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await bridge.getTimeline({ projectId, taskId });
      if (res.ok) {
        setTimeline(res.data);
        // Track already loaded item IDs to avoid re-adding
        for (const item of res.data.items) {
          processedEventIdsRef.current.add(item.id);
        }
      } else {
        setError(res.error?.message ?? 'Failed to load task activity timeline.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [projectId, taskId]);

  // 2. Incremental Event Processing
  const handleLiveEvent = useCallback(
    (event: AgentActivityEventDto) => {
      if (!event || event.taskId !== taskId) return;

      // Deduplication check
      if (processedEventIdsRef.current.has(event.eventId)) {
        return;
      }
      processedEventIdsRef.current.add(event.eventId);

      // Sequence monotonicity check
      if (event.sequence <= lastSequenceRef.current) {
        // Out of order or stale duplicate
        return;
      }
      lastSequenceRef.current = event.sequence;

      setTimeline(prev => {
        if (!prev) {
          // Timeline not loaded yet; will be populated by initial getTimeline call
          return prev;
        }

        const p = event.payload;
        const timestamp = event.timestamp;
        let updatedItems = [...prev.items];
        let newActiveToolName = prev.activeToolName;
        let newActiveToolStatus = prev.activeToolStatus;
        let newActiveStepTitle = prev.activeStepTitle;
        let newTaskStatus = prev.taskStatus;
        let newCurrentStepSeq = prev.currentStepSequence;

        switch (event.type) {
          case 'TASK_STARTED': {
            newTaskStatus = (p.status as any) || 'RUNNING';
            break;
          }

          case 'STEP_STARTED': {
            newActiveStepTitle = (p.title as string) || null;
            newCurrentStepSeq = (p.sequence as number) || prev.currentStepSequence;
            const stepItem: AgentActivityItemDto = {
              id: `event-${event.eventId}`,
              taskId: event.taskId,
              sequence: updatedItems.length,
              kind: 'ANALYSIS',
              title: `Step ${p.sequence}: ${p.title}`,
              description: (p.objective as string) || (p.title as string),
              status: 'RUNNING',
              stepId: (p.stepId as string) || null,
              toolName: (p.toolAction as string) || null,
              toolStatus: null,
              inputSummary: null,
              resultSummary: null,
              error: null,
              durationMs: null,
              startedAt: timestamp,
              completedAt: null,
              timestamp,
            };
            updatedItems.push(stepItem);
            break;
          }

          case 'TOOL_STARTED': {
            newActiveToolName = (p.toolName as string) || null;
            newActiveToolStatus = 'RUNNING';
            const toolItem: AgentActivityItemDto = {
              id: `event-${event.eventId}`,
              taskId: event.taskId,
              sequence: updatedItems.length,
              kind: 'TOOL_EXECUTION',
              title: `Tool: ${p.toolName}`,
              description: `Executing tool ${p.toolName}`,
              status: 'RUNNING',
              stepId: (p.stepId as string) || null,
              toolName: (p.toolName as string) || null,
              toolStatus: 'RUNNING',
              inputSummary: (p.inputSummary as Record<string, unknown>) || null,
              resultSummary: null,
              error: null,
              durationMs: null,
              startedAt: timestamp,
              completedAt: null,
              timestamp,
            };
            updatedItems.push(toolItem);
            break;
          }

          case 'TOOL_COMPLETED': {
            newActiveToolStatus = 'SUCCESS';
            // Find running tool card and update it
            const lastToolIdx = findLastIndex(
              updatedItems,
              i =>
                i.kind === 'TOOL_EXECUTION' && i.toolName === p.toolName && i.status === 'RUNNING',
            );
            if (lastToolIdx >= 0) {
              const existing = updatedItems[lastToolIdx]!;
              updatedItems[lastToolIdx] = {
                ...existing,
                status: 'COMPLETED',
                toolStatus: 'SUCCESS',
                durationMs: (p.durationMs as number) || null,
                resultSummary: p.resultSummary ?? null,
                completedAt: timestamp,
              };
            }
            break;
          }

          case 'TOOL_FAILED': {
            newActiveToolStatus = 'FAILED';
            const lastToolIdx = findLastIndex(
              updatedItems,
              i =>
                i.kind === 'TOOL_EXECUTION' && i.toolName === p.toolName && i.status === 'RUNNING',
            );
            if (lastToolIdx >= 0) {
              const existing = updatedItems[lastToolIdx]!;
              updatedItems[lastToolIdx] = {
                ...existing,
                status: 'FAILED',
                toolStatus: 'FAILED',
                durationMs: (p.durationMs as number) || null,
                error: (p.error as string) || 'Tool failed',
                completedAt: timestamp,
              };
            }
            break;
          }

          case 'STEP_UPDATED': {
            // Update matching step item
            const lastStepIdx = findLastIndex(
              updatedItems,
              i => i.kind === 'ANALYSIS' && i.stepId === p.stepId,
            );
            if (lastStepIdx >= 0) {
              const existing = updatedItems[lastStepIdx]!;
              updatedItems[lastStepIdx] = {
                ...existing,
                status: (p.status as string) || 'COMPLETED',
                durationMs: (p.durationMs as number) || null,
                completedAt: timestamp,
              };
            }
            break;
          }

          case 'APPROVAL_REQUIRED': {
            newTaskStatus = 'WAITING_FOR_APPROVAL';
            const approvalItem: AgentActivityItemDto = {
              id: `event-${event.eventId}`,
              taskId: event.taskId,
              sequence: updatedItems.length,
              kind: 'APPROVAL_WAITING',
              title: `Authorization Required: ${p.toolName}`,
              description:
                (p.reason as string) || `Action paused: tool requires user authorization`,
              status: 'PENDING',
              stepId: null,
              toolName: (p.toolName as string) || null,
              toolStatus: 'RUNNING',
              inputSummary: null,
              resultSummary: null,
              error: null,
              durationMs: null,
              startedAt: timestamp,
              completedAt: null,
              timestamp,
            };
            updatedItems.push(approvalItem);
            break;
          }

          case 'TASK_COMPLETED': {
            newTaskStatus = 'COMPLETED';
            newActiveToolName = null;
            newActiveToolStatus = null;
            updatedItems.push({
              id: `event-${event.eventId}`,
              taskId: event.taskId,
              sequence: updatedItems.length,
              kind: 'COMPLETION',
              title: 'Task Completed',
              description: 'All steps executed successfully.',
              status: 'COMPLETED',
              stepId: null,
              toolName: null,
              toolStatus: null,
              inputSummary: null,
              resultSummary: null,
              error: null,
              durationMs: (p.durationMs as number) || null,
              startedAt: timestamp,
              completedAt: timestamp,
              timestamp,
            });
            break;
          }

          case 'TASK_FAILED': {
            newTaskStatus = 'FAILED';
            newActiveToolName = null;
            newActiveToolStatus = null;
            updatedItems.push({
              id: `event-${event.eventId}`,
              taskId: event.taskId,
              sequence: updatedItems.length,
              kind: 'FAILURE',
              title: 'Task Failed',
              description: (p.failureReason as string) || 'Task execution failed.',
              status: 'FAILED',
              stepId: null,
              toolName: null,
              toolStatus: null,
              inputSummary: null,
              resultSummary: null,
              error: (p.failureReason as string) || null,
              durationMs: (p.durationMs as number) || null,
              startedAt: timestamp,
              completedAt: timestamp,
              timestamp,
            });
            break;
          }

          case 'TASK_CANCELLED': {
            newTaskStatus = 'CANCELLED';
            newActiveToolName = null;
            newActiveToolStatus = null;
            updatedItems.push({
              id: `event-${event.eventId}`,
              taskId: event.taskId,
              sequence: updatedItems.length,
              kind: 'CANCELLATION',
              title: 'Task Cancelled',
              description: (p.reason as string) || 'Task execution was cancelled.',
              status: 'CANCELLED',
              stepId: null,
              toolName: null,
              toolStatus: null,
              inputSummary: null,
              resultSummary: null,
              error: null,
              durationMs: (p.durationMs as number) || null,
              startedAt: timestamp,
              completedAt: timestamp,
              timestamp,
            });
            break;
          }
        }

        // Bound array size to prevent memory bloat in huge runs
        if (updatedItems.length > MAX_RENDERED_ITEMS) {
          updatedItems = updatedItems.slice(-MAX_RENDERED_ITEMS);
        }

        return {
          ...prev,
          taskStatus: newTaskStatus,
          activeStepTitle: newActiveStepTitle,
          activeToolName: newActiveToolName,
          activeToolStatus: newActiveToolStatus,
          currentStepSequence: newCurrentStepSeq,
          items: updatedItems,
          durationMs: (p.durationMs as number) || prev.durationMs,
        };
      });
    },
    [taskId],
  );

  // 3. Connect/Subscribe Lifecycle
  useEffect(() => {
    let active = true;
    processedEventIdsRef.current.clear();
    lastSequenceRef.current = 0;

    if (!projectId || !taskId) {
      setTimeline(null);
      setIsSubscribed(false);
      return;
    }

    void loadTimeline();

    const bridge = window.desktop?.agentActivity;
    if (!bridge) {
      return;
    }

    let unsubscribed = false;

    bridge
      .subscribe({ projectId, taskId }, (event: AgentActivityEventDto) => {
        if (active && !unsubscribed) {
          handleLiveEvent(event);
        }
      })
      .then((res: DesktopResult<{ readonly subscribed: true }>) => {
        if (active && res.ok) {
          setIsSubscribed(true);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      active = false;
      unsubscribed = true;
      setIsSubscribed(false);
      bridge.unsubscribe({ projectId, taskId }).catch(() => {});
    };
  }, [projectId, taskId, loadTimeline, handleLiveEvent]);

  // 4. Auto-Scroll Logic
  useEffect(() => {
    if (!autoScroll || isUserScrolledUp) return;

    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [timeline?.items.length, autoScroll, isUserScrolledUp]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isAtBottom = distanceFromBottom < 40;

    if (isAtBottom) {
      setIsUserScrolledUp(false);
    } else {
      setIsUserScrolledUp(true);
    }
  }, []);

  const resumeAutoScroll = useCallback(() => {
    setIsUserScrolledUp(false);
    setAutoScroll(true);
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, []);

  return {
    timeline,
    isLoading,
    isSubscribed,
    error,
    autoScroll,
    isUserScrolledUp,
    scrollContainerRef,
    setAutoScroll,
    resumeAutoScroll,
    handleScroll,
    refresh: loadTimeline,
  };
}
