/**
 * @file apps/desktop/src/renderer/features/sources/useSelectedProjectTechnology.ts
 * React hook managing programming language and technology profile inspection with deterministic stale-response protection.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { TechnologyProfileDto } from '@ai-quality/contracts';

export interface UseSelectedProjectTechnologyResult {
  readonly technologyProfile: TechnologyProfileDto | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly refreshTechnologyProfile: () => Promise<void>;
}

export function useSelectedProjectTechnology(
  projectId: string | null,
  hasSourceAttached: boolean,
): UseSelectedProjectTechnologyResult {
  const [technologyProfile, setTechnologyProfile] = useState<TechnologyProfileDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const requestGenRef = useRef<number>(0);

  const refreshTechnologyProfile = useCallback(async () => {
    if (!projectId || !hasSourceAttached) {
      setTechnologyProfile(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const currentGen = ++requestGenRef.current;
    setIsLoading(true);
    setError(null);

    try {
      if (!window.desktop?.sources?.technology?.get) {
        if (currentGen === requestGenRef.current) {
          setIsLoading(false);
        }
        return;
      }

      const result = await window.desktop.sources.technology.get(projectId);
      if (currentGen !== requestGenRef.current) {
        return;
      }

      if (result.ok) {
        setTechnologyProfile(result.data);
        setError(null);
      } else {
        setError(result.error.message);
      }
    } catch {
      if (currentGen === requestGenRef.current) {
        setError('Failed to fetch technology profile.');
      }
    } finally {
      if (currentGen === requestGenRef.current) {
        setIsLoading(false);
      }
    }
  }, [projectId, hasSourceAttached]);

  useEffect(() => {
    void refreshTechnologyProfile();
  }, [refreshTechnologyProfile]);

  return {
    technologyProfile,
    isLoading,
    error,
    refreshTechnologyProfile,
  };
}
