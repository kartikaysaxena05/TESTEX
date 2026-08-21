/**
 * @file apps/desktop/src/renderer/features/sources/useSelectedProjectSnapshots.ts
 * React hook managing repository snapshots and baseline selection.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { RepositorySnapshotDto } from '@ai-quality/contracts';

export interface UseSelectedProjectSnapshotsResult {
  readonly snapshots: readonly RepositorySnapshotDto[];
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly createSnapshot: (label?: string | null) => Promise<void>;
  readonly setBaseline: (snapshotId: string) => Promise<void>;
  readonly deleteSnapshot: (snapshotId: string) => Promise<void>;
  readonly refreshSnapshots: () => Promise<void>;
}

export function useSelectedProjectSnapshots(
  projectId: string | null,
  hasSourceAttached: boolean,
): UseSelectedProjectSnapshotsResult {
  const [snapshots, setSnapshots] = useState<readonly RepositorySnapshotDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const requestGenRef = useRef<number>(0);

  const fetchSnapshots = useCallback(async () => {
    if (!projectId || !hasSourceAttached) {
      setSnapshots([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const currentGen = ++requestGenRef.current;
    setIsLoading(true);
    setError(null);

    try {
      if (!window.desktop?.sources?.snapshots?.list) {
        if (requestGenRef.current === currentGen) setIsLoading(false);
        return;
      }

      const res = await window.desktop.sources.snapshots.list(projectId);
      if (requestGenRef.current !== currentGen) return;

      if (res.ok) {
        setSnapshots(res.data);
        setError(null);
      } else {
        setError(res.error.message);
      }
    } catch {
      if (requestGenRef.current === currentGen) {
        setError('Failed to fetch repository snapshots.');
      }
    } finally {
      if (requestGenRef.current === currentGen) {
        setIsLoading(false);
      }
    }
  }, [projectId, hasSourceAttached]);

  const createSnapshot = useCallback(
    async (label?: string | null) => {
      if (!projectId || !hasSourceAttached) return;

      setIsLoading(true);
      setError(null);

      try {
        if (!window.desktop?.sources?.snapshots?.create) {
          setIsLoading(false);
          return;
        }
        const res = await window.desktop.sources.snapshots.create({
          projectId,
          label: label ?? null,
        });
        if (res.ok) {
          await fetchSnapshots();
        } else {
          setError(res.error.message);
          setIsLoading(false);
        }
      } catch {
        setError('Failed to create repository snapshot.');
        setIsLoading(false);
      }
    },
    [projectId, hasSourceAttached, fetchSnapshots],
  );

  const setBaseline = useCallback(
    async (snapshotId: string) => {
      if (!projectId || !hasSourceAttached) return;

      try {
        if (!window.desktop?.sources?.snapshots?.setBaseline) return;
        const res = await window.desktop.sources.snapshots.setBaseline({
          projectId,
          snapshotId,
        });
        if (res.ok) {
          await fetchSnapshots();
        } else {
          setError(res.error.message);
        }
      } catch {
        setError('Failed to set active baseline.');
      }
    },
    [projectId, hasSourceAttached, fetchSnapshots],
  );

  const deleteSnapshot = useCallback(
    async (snapshotId: string) => {
      if (!projectId || !hasSourceAttached) return;

      try {
        if (!window.desktop?.sources?.snapshots?.delete) return;
        const res = await window.desktop.sources.snapshots.delete({
          projectId,
          snapshotId,
        });
        if (res.ok) {
          await fetchSnapshots();
        } else {
          setError(res.error.message);
        }
      } catch {
        setError('Failed to delete snapshot.');
      }
    },
    [projectId, hasSourceAttached, fetchSnapshots],
  );

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  return {
    snapshots,
    isLoading,
    error,
    createSnapshot,
    setBaseline,
    deleteSnapshot,
    refreshSnapshots: fetchSnapshots,
  };
}
