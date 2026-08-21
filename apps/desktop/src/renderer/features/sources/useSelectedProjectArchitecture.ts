/**
 * @file apps/desktop/src/renderer/features/sources/useSelectedProjectArchitecture.ts
 * React hook managing application architecture profile state and refresh lifecycle with stale-response protection.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ApplicationArchitectureProfileDto } from '@ai-quality/contracts';

export interface UseSelectedProjectArchitectureResult {
  readonly architectureProfile: ApplicationArchitectureProfileDto | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly refreshArchitecture: () => Promise<void>;
}

export function useSelectedProjectArchitecture(
  projectId: string | null,
  hasSourceAttached: boolean,
): UseSelectedProjectArchitectureResult {
  const [architectureProfile, setArchitectureProfile] =
    useState<ApplicationArchitectureProfileDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const requestGenRef = useRef<number>(0);

  const fetchArchitectureProfile = useCallback(async () => {
    if (!projectId || !hasSourceAttached) {
      setArchitectureProfile(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const currentGen = ++requestGenRef.current;
    setIsLoading(true);
    setError(null);

    try {
      if (!window.desktop?.sources?.architecture?.get) {
        if (requestGenRef.current === currentGen) {
          setIsLoading(false);
        }
        return;
      }

      const result = await window.desktop.sources.architecture.get(projectId);

      if (requestGenRef.current !== currentGen) {
        return;
      }

      if (result.ok) {
        setArchitectureProfile(result.data);
        setError(null);
      } else {
        setError(result.error.message);
      }
    } catch {
      if (requestGenRef.current === currentGen) {
        setError('Failed to fetch application architecture profile.');
      }
    } finally {
      if (requestGenRef.current === currentGen) {
        setIsLoading(false);
      }
    }
  }, [projectId, hasSourceAttached]);

  const refreshArchitecture = useCallback(async () => {
    if (!projectId || !hasSourceAttached) return;

    const currentGen = ++requestGenRef.current;
    setIsLoading(true);
    setError(null);

    try {
      if (!window.desktop?.sources?.architecture?.refresh) {
        if (requestGenRef.current === currentGen) {
          setIsLoading(false);
        }
        return;
      }

      const result = await window.desktop.sources.architecture.refresh(projectId);

      if (requestGenRef.current !== currentGen) {
        return;
      }

      if (result.ok) {
        setArchitectureProfile(result.data);
        setError(null);
      } else {
        setError(result.error.message);
      }
    } catch {
      if (requestGenRef.current === currentGen) {
        setError('Failed to refresh application architecture profile.');
      }
    } finally {
      if (requestGenRef.current === currentGen) {
        setIsLoading(false);
      }
    }
  }, [projectId, hasSourceAttached]);

  useEffect(() => {
    fetchArchitectureProfile();
  }, [fetchArchitectureProfile]);

  return {
    architectureProfile,
    isLoading,
    error,
    refreshArchitecture,
  };
}
