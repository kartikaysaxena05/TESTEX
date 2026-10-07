/**
 * @file apps/desktop/src/renderer/features/dashboard/useSelectedProjectDetails.ts
 * Custom hook to load and manage selected project details and real quality metrics with stale response protection.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useProject } from '../../context/ProjectContext.js';
import type {
  ProjectDetails,
  DatabaseStatusState,
  RequirementSummaryDto,
  ProjectCoverageSummaryDto,
  ProjectSourceDto,
  RepositoryIndexStatusDto,
  EmbeddingIndexStatusDto,
} from '@ai-quality/contracts';

export interface ProjectQualityData {
  readonly requirementsSummary: RequirementSummaryDto | null;
  readonly testCasesTotal: number | null;
  readonly coverageSummary: ProjectCoverageSummaryDto | null;
  readonly source: ProjectSourceDto | null;
  readonly indexStatus: RepositoryIndexStatusDto | null;
  readonly reviewQueueTotal: number | null;
  readonly embeddingStatus: EmbeddingIndexStatusDto | null;
}

const INITIAL_QUALITY_DATA: ProjectQualityData = {
  requirementsSummary: null,
  testCasesTotal: null,
  coverageSummary: null,
  source: null,
  indexStatus: null,
  reviewQueueTotal: null,
  embeddingStatus: null,
};

export interface UseSelectedProjectDetailsResult {
  readonly selectedProjectId: string | null;
  readonly project: ProjectDetails | null;
  readonly qualityData: ProjectQualityData;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly dbStatus: DatabaseStatusState;
  readonly refresh: () => Promise<void>;
}

export function useSelectedProjectDetails(): UseSelectedProjectDetailsResult {
  const { selectedProjectId, setSelectedProjectId } = useProject();

  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [qualityData, setQualityData] = useState<ProjectQualityData>(INITIAL_QUALITY_DATA);
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
              setQualityData(INITIAL_QUALITY_DATA);
              return;
            }
          }
        } catch {
          if (currentRequestId === requestCounterRef.current) {
            setDbStatus('unavailable');
            setIsLoading(false);
            setProject(null);
            setQualityData(INITIAL_QUALITY_DATA);
            return;
          }
        }
      }

      if (!projectId) {
        if (currentRequestId === requestCounterRef.current) {
          setProject(null);
          setQualityData(INITIAL_QUALITY_DATA);
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

        // Fetch core project details
        const projectRes = await window.desktop.projects.get(projectId);

        // Verify active request ID to discard stale response
        if (currentRequestId !== requestCounterRef.current) {
          return;
        }

        if (!projectRes.ok) {
          setProject(null);
          setQualityData(INITIAL_QUALITY_DATA);
          if (projectRes.error.code === 'PROJECT_NOT_FOUND') {
            setSelectedProjectId(null);
            setError('The selected project no longer exists in the database.');
          } else {
            setError(projectRes.error.message);
          }
          return;
        }

        setProject(projectRes.data);
        setError(null);

        // Fetch all quality domain metrics concurrently in background
        const [
          reqSummaryRes,
          testCasesRes,
          covSummaryRes,
          sourceRes,
          indexStatusRes,
          reviewQueueRes,
          embeddingStatusRes,
        ] = await Promise.allSettled([
          window.desktop?.requirements?.getSummary
            ? window.desktop.requirements.getSummary(projectId)
            : Promise.resolve(null),
          window.desktop?.testCases?.list
            ? window.desktop.testCases.list({ projectId, pageSize: 1 })
            : Promise.resolve(null),
          window.desktop?.coverage?.getProjectSummary
            ? window.desktop.coverage.getProjectSummary({ projectId })
            : Promise.resolve(null),
          window.desktop?.sources?.get
            ? window.desktop.sources.get(projectId)
            : Promise.resolve(null),
          window.desktop?.sources?.index?.getStatus
            ? window.desktop.sources.index.getStatus(projectId)
            : Promise.resolve(null),
          window.desktop?.testReview?.listQueue
            ? window.desktop.testReview.listQueue({ projectId, pageSize: 1 })
            : Promise.resolve(null),
          window.desktop?.ai?.getEmbeddingIndexStatus
            ? window.desktop.ai.getEmbeddingIndexStatus({ projectId })
            : Promise.resolve(null),
        ]);

        // Discard if project changed during metrics fetching
        if (currentRequestId !== requestCounterRef.current) {
          return;
        }

        setQualityData({
          requirementsSummary:
            reqSummaryRes.status === 'fulfilled' && reqSummaryRes.value && reqSummaryRes.value.ok
              ? reqSummaryRes.value.data
              : null,
          testCasesTotal:
            testCasesRes.status === 'fulfilled' && testCasesRes.value && testCasesRes.value.ok
              ? testCasesRes.value.data.total
              : null,
          coverageSummary:
            covSummaryRes.status === 'fulfilled' && covSummaryRes.value && covSummaryRes.value.ok
              ? covSummaryRes.value.data
              : null,
          source:
            sourceRes.status === 'fulfilled' && sourceRes.value && sourceRes.value.ok
              ? sourceRes.value.data
              : null,
          indexStatus:
            indexStatusRes.status === 'fulfilled' && indexStatusRes.value && indexStatusRes.value.ok
              ? indexStatusRes.value.data
              : null,
          reviewQueueTotal:
            reviewQueueRes.status === 'fulfilled' && reviewQueueRes.value && reviewQueueRes.value.ok
              ? reviewQueueRes.value.data.total
              : null,
          embeddingStatus:
            embeddingStatusRes.status === 'fulfilled' &&
            embeddingStatusRes.value &&
            embeddingStatusRes.value.ok
              ? embeddingStatusRes.value.data
              : null,
        });
      } catch (err) {
        if (currentRequestId === requestCounterRef.current) {
          setProject(null);
          setQualityData(INITIAL_QUALITY_DATA);
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
    qualityData,
    isLoading,
    error,
    dbStatus,
    refresh,
  };
}
