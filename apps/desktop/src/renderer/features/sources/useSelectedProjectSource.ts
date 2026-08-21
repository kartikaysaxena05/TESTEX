/**
 * @file apps/desktop/src/renderer/features/sources/useSelectedProjectSource.ts
 * React hook managing source attachment lifecycle with deterministic stale-response protection.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ProjectSourceDto } from '@ai-quality/contracts';

export interface UseSelectedProjectSourceResult {
  readonly source: ProjectSourceDto | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly refreshSource: () => Promise<void>;
  readonly attachLocalDirectory: () => Promise<{ cancelled: boolean; success: boolean }>;
  readonly detachSource: () => Promise<boolean>;
  readonly validateSource: () => Promise<void>;
  readonly refreshMetadata: () => Promise<void>;
}

export function useSelectedProjectSource(projectId: string | null): UseSelectedProjectSourceResult {
  const [source, setSource] = useState<ProjectSourceDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Request generation counter to discard stale async responses on rapid project switching
  const requestGenRef = useRef<number>(0);

  const refreshSource = useCallback(async () => {
    if (!projectId) {
      setSource(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const currentGen = ++requestGenRef.current;
    setIsLoading(true);
    setError(null);

    try {
      if (!window.desktop?.sources?.get) {
        if (currentGen === requestGenRef.current) {
          setIsLoading(false);
        }
        return;
      }

      const result = await window.desktop.sources.get(projectId);
      if (currentGen !== requestGenRef.current) {
        return;
      }

      if (result.ok) {
        setSource(result.data);
        setError(null);
      } else {
        setError(result.error.message);
      }
    } catch {
      if (currentGen === requestGenRef.current) {
        setError('Failed to fetch project source attachment.');
      }
    } finally {
      if (currentGen === requestGenRef.current) {
        setIsLoading(false);
      }
    }
  }, [projectId]);

  useEffect(() => {
    void refreshSource();
  }, [refreshSource]);

  const attachLocalDirectory = useCallback(async () => {
    if (!projectId || !window.desktop?.sources?.attachLocalDirectory) {
      return { cancelled: true, success: false };
    }

    setError(null);
    try {
      const result = await window.desktop.sources.attachLocalDirectory(projectId);
      if (result.ok) {
        if (result.data.cancelled) {
          return { cancelled: true, success: false };
        }
        setSource(result.data.source);
        return { cancelled: false, success: true };
      } else {
        setError(result.error.message);
        return { cancelled: false, success: false };
      }
    } catch {
      setError('Failed to attach local project directory.');
      return { cancelled: false, success: false };
    }
  }, [projectId]);

  const detachSource = useCallback(async () => {
    if (!projectId || !window.desktop?.sources?.detach) {
      return false;
    }

    setError(null);
    try {
      const result = await window.desktop.sources.detach(projectId);
      if (result.ok) {
        setSource(null);
        return true;
      } else {
        setError(result.error.message);
        return false;
      }
    } catch {
      setError('Failed to detach project source.');
      return false;
    }
  }, [projectId]);

  const validateSource = useCallback(async () => {
    if (!projectId || !window.desktop?.sources?.validate) {
      return;
    }

    try {
      const result = await window.desktop.sources.validate(projectId);
      if (result.ok) {
        setSource(result.data);
      } else {
        setError(result.error.message);
      }
    } catch {
      setError('Failed to validate source directory.');
    }
  }, [projectId]);

  const refreshMetadata = useCallback(async () => {
    if (!projectId || !window.desktop?.sources?.refreshMetadata) {
      return;
    }

    try {
      const result = await window.desktop.sources.refreshMetadata(projectId);
      if (result.ok) {
        setSource(result.data);
      } else {
        setError(result.error.message);
      }
    } catch {
      setError('Failed to refresh source metadata.');
    }
  }, [projectId]);

  return {
    source,
    isLoading,
    error,
    refreshSource,
    attachLocalDirectory,
    detachSource,
    validateSource,
    refreshMetadata,
  };
}
