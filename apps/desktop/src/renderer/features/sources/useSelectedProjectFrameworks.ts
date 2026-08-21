/**
 * @file apps/desktop/src/renderer/features/sources/useSelectedProjectFrameworks.ts
 * React hook managing framework and dependency profile inspection with deterministic stale-response protection.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { FrameworkProfileDto } from '@ai-quality/contracts';

export interface UseSelectedProjectFrameworksResult {
  readonly frameworkProfile: FrameworkProfileDto | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly refreshFrameworkProfile: () => Promise<void>;
}

export function useSelectedProjectFrameworks(
  projectId: string | null,
  hasSourceAttached: boolean,
): UseSelectedProjectFrameworksResult {
  const [frameworkProfile, setFrameworkProfile] = useState<FrameworkProfileDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const requestGenRef = useRef<number>(0);

  const refreshFrameworkProfile = useCallback(async () => {
    if (!projectId || !hasSourceAttached) {
      setFrameworkProfile(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const currentGen = ++requestGenRef.current;
    setIsLoading(true);
    setError(null);

    try {
      if (!window.desktop?.sources?.frameworks?.get) {
        if (currentGen === requestGenRef.current) {
          setIsLoading(false);
        }
        return;
      }

      const result = await window.desktop.sources.frameworks.get(projectId);
      if (currentGen !== requestGenRef.current) {
        return;
      }

      if (result.ok) {
        setFrameworkProfile(result.data);
        setError(null);
      } else {
        setError(result.error.message);
      }
    } catch {
      if (currentGen === requestGenRef.current) {
        setError('Failed to fetch framework and dependency profile.');
      }
    } finally {
      if (currentGen === requestGenRef.current) {
        setIsLoading(false);
      }
    }
  }, [projectId, hasSourceAttached]);

  useEffect(() => {
    void refreshFrameworkProfile();
  }, [refreshFrameworkProfile]);

  return {
    frameworkProfile,
    isLoading,
    error,
    refreshFrameworkProfile,
  };
}
