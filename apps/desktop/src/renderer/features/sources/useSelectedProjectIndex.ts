/**
 * @file apps/desktop/src/renderer/features/sources/useSelectedProjectIndex.ts
 * React hook managing repository index status and refresh lifecycle with stale-response protection.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { RepositoryIndexStatusDto } from '@ai-quality/contracts';

export interface UseSelectedProjectIndexResult {
  readonly indexStatus: RepositoryIndexStatusDto | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly refreshIndex: () => Promise<void>;
}

export function useSelectedProjectIndex(
  projectId: string | null,
  hasSourceAttached: boolean,
): UseSelectedProjectIndexResult {
  const [indexStatus, setIndexStatus] = useState<RepositoryIndexStatusDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const requestGenRef = useRef<number>(0);

  const fetchIndexStatus = useCallback(async () => {
    if (!projectId || !hasSourceAttached) {
      setIndexStatus(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const currentGen = ++requestGenRef.current;
    setIsLoading(true);
    setError(null);

    try {
      if (!window.desktop?.sources?.index?.getStatus) {
        if (requestGenRef.current === currentGen) {
          setIsLoading(false);
        }
        return;
      }

      const result = await window.desktop.sources.index.getStatus(projectId);

      if (requestGenRef.current !== currentGen) {
        return;
      }

      if (result.ok) {
        setIndexStatus(result.data);
        setError(null);
      } else {
        setError(result.error.message);
      }
    } catch {
      if (requestGenRef.current === currentGen) {
        setError('Failed to fetch repository index status.');
      }
    } finally {
      if (requestGenRef.current === currentGen) {
        setIsLoading(false);
      }
    }
  }, [projectId, hasSourceAttached]);

  const refreshIndex = useCallback(async () => {
    if (!projectId || !hasSourceAttached) return;

    const currentGen = ++requestGenRef.current;
    setIsLoading(true);
    setError(null);

    try {
      if (!window.desktop?.sources?.index?.refresh) {
        if (requestGenRef.current === currentGen) {
          setIsLoading(false);
        }
        return;
      }

      const result = await window.desktop.sources.index.refresh(projectId);

      if (requestGenRef.current !== currentGen) {
        return;
      }

      if (result.ok) {
        setIndexStatus(result.data);
        setError(null);
      } else {
        setError(result.error.message);
      }
    } catch {
      if (requestGenRef.current === currentGen) {
        setError('Failed to refresh repository index.');
      }
    } finally {
      if (requestGenRef.current === currentGen) {
        setIsLoading(false);
      }
    }
  }, [projectId, hasSourceAttached]);

  useEffect(() => {
    fetchIndexStatus();
  }, [fetchIndexStatus]);

  return {
    indexStatus,
    isLoading,
    error,
    refreshIndex,
  };
}
