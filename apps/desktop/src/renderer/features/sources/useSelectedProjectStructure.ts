/**
 * @file apps/desktop/src/renderer/features/sources/useSelectedProjectStructure.ts
 * React hook managing repository structure discovery with deterministic stale-response protection.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SourceStructureDto } from '@ai-quality/contracts';

export interface UseSelectedProjectStructureResult {
  readonly structure: SourceStructureDto | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly refreshStructure: () => Promise<void>;
}

export function useSelectedProjectStructure(
  projectId: string | null,
  hasSourceAttached: boolean,
): UseSelectedProjectStructureResult {
  const [structure, setStructure] = useState<SourceStructureDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const requestGenRef = useRef<number>(0);

  const refreshStructure = useCallback(async () => {
    if (!projectId || !hasSourceAttached) {
      setStructure(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const currentGen = ++requestGenRef.current;
    setIsLoading(true);
    setError(null);

    try {
      if (!window.desktop?.sources?.structure?.get) {
        if (currentGen === requestGenRef.current) {
          setIsLoading(false);
        }
        return;
      }

      const result = await window.desktop.sources.structure.get(projectId);
      if (currentGen !== requestGenRef.current) {
        return;
      }

      if (result.ok) {
        setStructure(result.data);
        setError(null);
      } else {
        setError(result.error.message);
      }
    } catch {
      if (currentGen === requestGenRef.current) {
        setError('Failed to fetch repository structure.');
      }
    } finally {
      if (currentGen === requestGenRef.current) {
        setIsLoading(false);
      }
    }
  }, [projectId, hasSourceAttached]);

  useEffect(() => {
    void refreshStructure();
  }, [refreshStructure]);

  return {
    structure,
    isLoading,
    error,
    refreshStructure,
  };
}
