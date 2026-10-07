/**
 * @file apps/desktop/src/renderer/features/agent-approval/useApprovalGate.ts
 * React hook for managing Human Approval Gates (V10 Phase 155).
 */

import { useState, useEffect, useCallback } from 'react';
import type { ApprovalRequestDto } from '@ai-quality/contracts';

export interface UseApprovalGateProps {
  readonly projectId: string | null;
  readonly taskId?: string | null;
  readonly threadId?: string | null;
}

export interface UseApprovalGateResult {
  readonly pendingApproval: ApprovalRequestDto | null;
  readonly history: readonly ApprovalRequestDto[];
  readonly isLoading: boolean;
  readonly isSubmitting: boolean;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
  readonly approve: (approvalId: string, reason?: string) => Promise<boolean>;
  readonly reject: (approvalId: string, reason?: string) => Promise<boolean>;
  readonly cancel: (approvalId: string, reason?: string) => Promise<boolean>;
}

export function useApprovalGate({
  projectId,
  taskId,
  threadId,
}: UseApprovalGateProps): UseApprovalGateResult {
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequestDto | null>(null);
  const [history, setHistory] = useState<readonly ApprovalRequestDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getBridge = () => {
    if (typeof window === 'undefined') return null;
    return (window as any).desktop?.approval ?? (window as any).desktopBridge?.approval ?? null;
  };

  const refresh = useCallback(async () => {
    if (!projectId) {
      setPendingApproval(null);
      setHistory([]);
      return;
    }

    const bridge = getBridge();
    if (!bridge) return;

    setIsLoading(true);
    setError(null);

    try {
      // 1. Fetch pending approval
      const pendingRes = await bridge.getPending({
        projectId,
        taskId: taskId ?? undefined,
        threadId: threadId ?? undefined,
      });

      if (pendingRes.ok) {
        setPendingApproval(pendingRes.data);
      }

      // 2. Fetch history
      const listRes = await bridge.list({
        projectId,
        taskId: taskId ?? undefined,
        threadId: threadId ?? undefined,
      });

      if (listRes.ok) {
        setHistory(listRes.data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [projectId, taskId, threadId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const approve = useCallback(
    async (approvalId: string, reason?: string): Promise<boolean> => {
      if (!projectId) return false;
      const bridge = getBridge();
      if (!bridge) return false;

      setIsSubmitting(true);
      setError(null);
      try {
        const res = await bridge.approve({
          projectId,
          approvalId,
          reason,
        });

        if (res.ok) {
          await refresh();
          return true;
        } else {
          setError(res.error?.message ?? 'Failed to approve request');
          return false;
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [projectId, refresh],
  );

  const reject = useCallback(
    async (approvalId: string, reason?: string): Promise<boolean> => {
      if (!projectId) return false;
      const bridge = getBridge();
      if (!bridge) return false;

      setIsSubmitting(true);
      setError(null);
      try {
        const res = await bridge.reject({
          projectId,
          approvalId,
          reason,
        });

        if (res.ok) {
          await refresh();
          return true;
        } else {
          setError(res.error?.message ?? 'Failed to reject request');
          return false;
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [projectId, refresh],
  );

  const cancel = useCallback(
    async (approvalId: string, reason?: string): Promise<boolean> => {
      if (!projectId) return false;
      const bridge = getBridge();
      if (!bridge) return false;

      setIsSubmitting(true);
      setError(null);
      try {
        const res = await bridge.cancel({
          projectId,
          approvalId,
          reason,
        });

        if (res.ok) {
          await refresh();
          return true;
        } else {
          setError(res.error?.message ?? 'Failed to cancel approval request');
          return false;
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [projectId, refresh],
  );

  return {
    pendingApproval,
    history,
    isLoading,
    isSubmitting,
    error,
    refresh,
    approve,
    reject,
    cancel,
  };
}
