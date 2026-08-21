/**
 * @file apps/desktop/src/renderer/features/sources/useSelectedProjectChanges.ts
 * React hook managing baseline vs current repository change set inspection.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { RepositoryChangeSetDto } from '@ai-quality/contracts';

export interface UseSelectedProjectChangesResult {
  readonly changeSet: RepositoryChangeSetDto | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly refreshChanges: () => Promise<void>;
}

export function useSelectedProjectChanges(
  projectId: string | null,
  hasSourceAttached: boolean,
): UseSelectedProjectChangesResult {
  const [changeSet, setChangeSet] = useState<RepositoryChangeSetDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const requestGenRef = useRef<number>(0);

  const fetchChanges = useCallback(async () => {
    if (!projectId || !hasSourceAttached) {
      setChangeSet(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const currentGen = ++requestGenRef.current;
    setIsLoading(true);
    setError(null);

    try {
      if (!window.desktop?.sources?.changes?.get) {
        if (requestGenRef.current === currentGen) setIsLoading(false);
        return;
      }

      const res = await window.desktop.sources.changes.get(projectId);
      if (requestGenRef.current !== currentGen) return;

      if (res.ok) {
        setChangeSet(res.data);
        setError(null);
      } else {
        setError(res.error.message);
      }
    } catch {
      if (requestGenRef.current === currentGen) {
        setError('Failed to fetch repository changes.');
      }
    } finally {
      if (requestGenRef.current === currentGen) {
        setIsLoading(false);
      }
    }
  }, [projectId, hasSourceAttached]);

  const refreshChanges = useCallback(async () => {
    if (!projectId || !hasSourceAttached) return;

    const currentGen = ++requestGenRef.current;
    setIsLoading(true);
    setError(null);

    try {
      if (!window.desktop?.sources?.changes?.refresh) {
        if (requestGenRef.current === currentGen) setIsLoading(false);
        return;
      }

      const res = await window.desktop.sources.changes.refresh(projectId);
      if (requestGenRef.current !== currentGen) return;

      if (res.ok) {
        setChangeSet(res.data);
        setError(null);
      } else {
        setError(res.error.message);
      }
    } catch {
      if (requestGenRef.current === currentGen) {
        setError('Failed to refresh repository changes.');
      }
    } finally {
      if (requestGenRef.current === currentGen) {
        setIsLoading(false);
      }
    }
  }, [projectId, hasSourceAttached]);

  useEffect(() => {
    fetchChanges();
  }, [fetchChanges]);

  return {
    changeSet,
    isLoading,
    error,
    refreshChanges,
  };
}
