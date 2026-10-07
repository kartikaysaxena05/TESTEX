/**
 * @file apps/desktop/src/renderer/features/project-context/useProjectContext.ts
 * React hook for managing authoritative unified project context, source detection,
 * lifecycle state, freshness, and cache invalidation (V8 Phase 123).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  ProjectContextDto,
  ProjectContextStatusDto,
  DetectedProjectSourcesDto,
} from '@ai-quality/contracts';

export interface UseProjectContextResult {
  readonly context: ProjectContextDto | null;
  readonly status: ProjectContextStatusDto | null;
  readonly isLoading: boolean;
  readonly isRefreshing: boolean;
  readonly isDetecting: boolean;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
  readonly detect: () => Promise<DetectedProjectSourcesDto | null>;
  readonly invalidate: (reason?: string) => Promise<void>;
  readonly reload: () => Promise<void>;
}

export function useProjectContext(projectId: string | null): UseProjectContextResult {
  const [context, setContext] = useState<ProjectContextDto | null>(null);
  const [status, setStatus] = useState<ProjectContextStatusDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const requestGenRef = useRef<number>(0);

  const reload = useCallback(async () => {
    if (!projectId) {
      setContext(null);
      setStatus(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const currentGen = ++requestGenRef.current;
    setIsLoading(true);
    setError(null);

    try {
      if (!window.desktop?.projectContext?.get) {
        if (currentGen === requestGenRef.current) {
          setIsLoading(false);
        }
        return;
      }

      const [ctxRes, statusRes] = await Promise.all([
        window.desktop.projectContext.get({ projectId }),
        window.desktop.projectContext.getStatus
          ? window.desktop.projectContext.getStatus({ projectId })
          : Promise.resolve({
              ok: false as const,
              error: { code: 'NOT_IMPLEMENTED', message: '' },
            }),
      ]);

      if (currentGen !== requestGenRef.current) return;

      if (ctxRes.ok) {
        setContext(ctxRes.data);
        setError(null);
      } else {
        setError(ctxRes.error.message);
      }

      if (statusRes.ok) {
        setStatus(statusRes.data);
      }
    } catch (err: unknown) {
      if (currentGen === requestGenRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load project context.');
      }
    } finally {
      if (currentGen === requestGenRef.current) {
        setIsLoading(false);
      }
    }
  }, [projectId]);

  const refresh = useCallback(async () => {
    if (!projectId || !window.desktop?.projectContext?.refresh) return;

    setIsRefreshing(true);
    setError(null);

    try {
      const res = await window.desktop.projectContext.refresh({ projectId });
      if (res.ok) {
        setContext(res.data);
        if (window.desktop?.projectContext?.getStatus) {
          const statusRes = await window.desktop.projectContext.getStatus({ projectId });
          if (statusRes.ok) setStatus(statusRes.data);
        }
      } else {
        setError(res.error.message);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to refresh project context.');
    } finally {
      setIsRefreshing(false);
    }
  }, [projectId]);

  const detect = useCallback(async (): Promise<DetectedProjectSourcesDto | null> => {
    if (!projectId || !window.desktop?.projectContext?.detect) return null;

    setIsDetecting(true);
    setError(null);

    try {
      const res = await window.desktop.projectContext.detect({ projectId });
      if (res.ok) {
        // Automatically reload context after successful detection
        await reload();
        return res.data;
      } else {
        setError(res.error.message);
        return null;
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to detect project sources.');
      return null;
    } finally {
      setIsDetecting(false);
    }
  }, [projectId, reload]);

  const invalidate = useCallback(
    async (reason?: string) => {
      if (!projectId || !window.desktop?.projectContext?.invalidate) return;

      try {
        const res = await window.desktop.projectContext.invalidate({
          projectId,
          reason: reason ?? 'Manually invalidated by user',
        });
        if (res.ok) {
          setContext(res.data);
          if (window.desktop?.projectContext?.getStatus) {
            const statusRes = await window.desktop.projectContext.getStatus({ projectId });
            if (statusRes.ok) setStatus(statusRes.data);
          }
        } else {
          setError(res.error.message);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to invalidate context.');
      }
    },
    [projectId],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    context,
    status,
    isLoading,
    isRefreshing,
    isDetecting,
    error,
    refresh,
    detect,
    invalidate,
    reload,
  };
}
