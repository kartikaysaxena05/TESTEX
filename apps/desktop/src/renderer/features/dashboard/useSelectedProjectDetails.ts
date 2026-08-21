/**
 * @file apps/desktop/src/renderer/features/dashboard/useSelectedProjectDetails.ts
 * Custom hook to load and manage selected project details with stale response protection.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useProject } from '../../context/ProjectContext.js';
import type { ProjectDetails, DatabaseStatusState } from '@ai-quality/contracts';

export interface UseSelectedProjectDetailsResult {
  readonly selectedProjectId: string | null;
  readonly project: ProjectDetails | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly dbStatus: DatabaseStatusState;
  readonly refresh: () => Promise<void>;
}

export function useSelectedProjectDetails(): UseSelectedProjectDetailsResult {
  const { selectedProjectId, setSelectedProjectId } = useProject();

  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(selectedProjectId));
  const [error, setError] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<DatabaseStatusState>('connected');

  // Request generation counter to prevent race conditions & stale responses on rapid project switching
  const requestCounterRef = useRef<number>(0);

  const fetchDetails = useCallback(
    async (projectId: string | null) => {
      const currentRequestId = ++requestCounterRef.current;

      // Check database connection state
      if (window.desktop?.database?.getStatus) {
        try {
          const dbRes = await window.desktop.database.getStatus();
          if (currentRequestId === requestCounterRef.current && dbRes.ok) {
            setDbStatus(dbRes.data.status);
            if (dbRes.data.status === 'unavailable' || dbRes.data.status === 'not-configured') {
              setIsLoading(false);
              setProject(null);
              return;
            }
          }
        } catch {
          if (currentRequestId === requestCounterRef.current) {
            setDbStatus('unavailable');
            setIsLoading(false);
            setProject(null);
            return;
          }
        }
      }

      if (!projectId) {
        if (currentRequestId === requestCounterRef.current) {
          setProject(null);
          setIsLoading(false);
          setError(null);
        }
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        if (!window.desktop?.projects?.get) {
          throw new Error('Project fetching is not supported in this environment.');
        }

        const res = await window.desktop.projects.get(projectId);

        // Verify that this is still the active request
        if (currentRequestId !== requestCounterRef.current) {
          return; // Discard stale response
        }

        if (res.ok) {
          setProject(res.data);
          setError(null);
        } else {
          setProject(null);
          if (res.error.code === 'PROJECT_NOT_FOUND') {
            // The project was deleted or missing from the database; reset selection
            setSelectedProjectId(null);
            setError('The selected project no longer exists in the database.');
          } else {
            setError(res.error.message);
          }
        }
      } catch (err) {
        if (currentRequestId === requestCounterRef.current) {
          setProject(null);
          setError(err instanceof Error ? err.message : 'Failed to load project details.');
        }
      } finally {
        if (currentRequestId === requestCounterRef.current) {
          setIsLoading(false);
        }
      }
    },
    [setSelectedProjectId],
  );

  useEffect(() => {
    void fetchDetails(selectedProjectId);
  }, [selectedProjectId, fetchDetails]);

  const refresh = useCallback(async () => {
    await fetchDetails(selectedProjectId);
  }, [selectedProjectId, fetchDetails]);

  return {
    selectedProjectId,
    project,
    isLoading,
    error,
    dbStatus,
    refresh,
  };
}
