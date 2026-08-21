/**
 * @file apps/desktop/src/renderer/features/sources/useSelectedProjectRunConfig.ts
 * React hook managing run configuration, candidate selection, and target URL updates.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { RunConfigurationProfileDto } from '@ai-quality/contracts';

export interface UseSelectedProjectRunConfigResult {
  readonly profile: RunConfigurationProfileDto | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly detectRunConfig: () => Promise<void>;
  readonly selectCandidate: (candidateId: string) => Promise<void>;
  readonly updateTargetUrl: (targetUrl: string | null) => Promise<void>;
}

export function useSelectedProjectRunConfig(
  projectId: string | null,
  hasSourceAttached: boolean,
): UseSelectedProjectRunConfigResult {
  const [profile, setProfile] = useState<RunConfigurationProfileDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const requestGenRef = useRef<number>(0);

  const fetchProfile = useCallback(async () => {
    if (!projectId || !hasSourceAttached) {
      setProfile(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const currentGen = ++requestGenRef.current;
    setIsLoading(true);
    setError(null);

    try {
      if (!window.desktop?.sources?.runConfiguration?.get) {
        if (requestGenRef.current === currentGen) setIsLoading(false);
        return;
      }

      const res = await window.desktop.sources.runConfiguration.get(projectId);
      if (requestGenRef.current !== currentGen) return;

      if (res.ok) {
        setProfile(res.data);
        setError(null);
      } else {
        setError(res.error.message);
      }
    } catch {
      if (requestGenRef.current === currentGen) {
        setError('Failed to fetch run configuration.');
      }
    } finally {
      if (requestGenRef.current === currentGen) {
        setIsLoading(false);
      }
    }
  }, [projectId, hasSourceAttached]);

  const detectRunConfig = useCallback(async () => {
    if (!projectId || !hasSourceAttached) return;

    const currentGen = ++requestGenRef.current;
    setIsLoading(true);
    setError(null);

    try {
      if (!window.desktop?.sources?.runConfiguration?.detect) {
        if (requestGenRef.current === currentGen) setIsLoading(false);
        return;
      }

      const res = await window.desktop.sources.runConfiguration.detect(projectId);
      if (requestGenRef.current !== currentGen) return;

      if (res.ok) {
        setProfile(res.data);
        setError(null);
      } else {
        setError(res.error.message);
      }
    } catch {
      if (requestGenRef.current === currentGen) {
        setError('Failed to detect run configuration.');
      }
    } finally {
      if (requestGenRef.current === currentGen) {
        setIsLoading(false);
      }
    }
  }, [projectId, hasSourceAttached]);

  const selectCandidate = useCallback(
    async (candidateId: string) => {
      if (!projectId || !hasSourceAttached) return;

      try {
        if (!window.desktop?.sources?.runConfiguration?.select) return;
        const res = await window.desktop.sources.runConfiguration.select({
          projectId,
          candidateId,
        });
        if (res.ok) {
          await fetchProfile();
        } else {
          setError(res.error.message);
        }
      } catch {
        setError('Failed to select run configuration.');
      }
    },
    [projectId, hasSourceAttached, fetchProfile],
  );

  const updateTargetUrl = useCallback(
    async (targetUrl: string | null) => {
      if (!projectId || !hasSourceAttached) return;

      try {
        if (!window.desktop?.sources?.runConfiguration?.updateTargetUrl) return;
        const res = await window.desktop.sources.runConfiguration.updateTargetUrl({
          projectId,
          targetUrl,
        });
        if (res.ok) {
          await fetchProfile();
        } else {
          setError(res.error.message);
        }
      } catch {
        setError('Failed to update target URL.');
      }
    },
    [projectId, hasSourceAttached, fetchProfile],
  );

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return {
    profile,
    isLoading,
    error,
    detectRunConfig,
    selectCandidate,
    updateTargetUrl,
  };
}
