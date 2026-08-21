/**
 * @file apps/desktop/src/renderer/features/sources/useSelectedProjectClassification.ts
 * React hook managing source file classification profile inspection with deterministic stale-response protection.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ClassificationProfileDto } from '@ai-quality/contracts';

export interface UseSelectedProjectClassificationResult {
  readonly classificationProfile: ClassificationProfileDto | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly refreshClassificationProfile: () => Promise<void>;
}

export function useSelectedProjectClassification(
  projectId: string | null,
  hasSourceAttached: boolean,
): UseSelectedProjectClassificationResult {
  const [classificationProfile, setClassificationProfile] =
    useState<ClassificationProfileDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const requestGenRef = useRef<number>(0);

  const refreshClassificationProfile = useCallback(async () => {
    if (!projectId || !hasSourceAttached) {
      setClassificationProfile(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const currentGen = ++requestGenRef.current;
    setIsLoading(true);
    setError(null);

    try {
      if (!window.desktop?.sources?.classification?.get) {
        if (currentGen === requestGenRef.current) {
          setIsLoading(false);
        }
        return;
      }

      const result = await window.desktop.sources.classification.get(projectId);
      if (currentGen !== requestGenRef.current) {
        return;
      }

      if (result.ok) {
        setClassificationProfile(result.data);
        setError(null);
      } else {
        setError(result.error.message);
      }
    } catch {
      if (currentGen === requestGenRef.current) {
        setError('Failed to fetch source file classification profile.');
      }
    } finally {
      if (currentGen === requestGenRef.current) {
        setIsLoading(false);
      }
    }
  }, [projectId, hasSourceAttached]);

  useEffect(() => {
    refreshClassificationProfile();
  }, [refreshClassificationProfile]);

  return {
    classificationProfile,
    isLoading,
    error,
    refreshClassificationProfile,
  };
}
