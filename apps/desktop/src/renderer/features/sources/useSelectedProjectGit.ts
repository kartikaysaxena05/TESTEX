/**
 * @file apps/desktop/src/renderer/features/sources/useSelectedProjectGit.ts
 * React hook managing Git status lifecycle with deterministic stale-response protection.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { GitStatusDto } from '@ai-quality/contracts';

export interface UseSelectedProjectGitResult {
  readonly gitStatus: GitStatusDto | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly refreshGitStatus: () => Promise<void>;
}

export function useSelectedProjectGit(
  projectId: string | null,
  hasSourceAttached: boolean,
): UseSelectedProjectGitResult {
  const [gitStatus, setGitStatus] = useState<GitStatusDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const requestGenRef = useRef<number>(0);

  const refreshGitStatus = useCallback(async () => {
    if (!projectId || !hasSourceAttached) {
      setGitStatus(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const currentGen = ++requestGenRef.current;
    setIsLoading(true);
    setError(null);

    try {
      if (!window.desktop?.sources?.git?.get) {
        if (currentGen === requestGenRef.current) {
          setIsLoading(false);
        }
        return;
      }

      const result = await window.desktop.sources.git.get(projectId);
      if (currentGen !== requestGenRef.current) {
        return;
      }

      if (result.ok) {
        setGitStatus(result.data);
        setError(null);
      } else {
        setError(result.error.message);
      }
    } catch {
      if (currentGen === requestGenRef.current) {
        setError('Failed to fetch Git repository status.');
      }
    } finally {
      if (currentGen === requestGenRef.current) {
        setIsLoading(false);
      }
    }
  }, [projectId, hasSourceAttached]);

  useEffect(() => {
    void refreshGitStatus();
  }, [refreshGitStatus]);

  return {
    gitStatus,
    isLoading,
    error,
    refreshGitStatus,
  };
}
