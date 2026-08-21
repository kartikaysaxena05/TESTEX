/**
 * @file apps/desktop/src/renderer/features/requirements/useSelectedProjectRequirements.ts
 * React hook managing requirement listing, filtering, search, pagination, summary metrics, and CRUD operations.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  RequirementDto,
  RequirementSummaryDto,
  RequirementType,
  RequirementPriority,
  RequirementStatus,
  PaginatedResult,
  CreateRequirementInput,
  UpdateRequirementInput,
} from '@ai-quality/contracts';

export interface RequirementFilterState {
  readonly status?: RequirementStatus;
  readonly type?: RequirementType;
  readonly priority?: RequirementPriority;
  readonly searchQuery?: string;
  readonly page: number;
  readonly pageSize: number;
}

export function useSelectedProjectRequirements(projectId: string | null) {
  const [data, setData] = useState<PaginatedResult<RequirementDto> | null>(null);
  const [summary, setSummary] = useState<RequirementSummaryDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<RequirementFilterState>({
    page: 1,
    pageSize: 50,
  });

  const activeRequestRef = useRef<number>(0);

  const fetchRequirements = useCallback(async () => {
    if (!projectId || !window.desktop?.requirements) {
      setData(null);
      setSummary(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    const currentReqId = ++activeRequestRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const [listResult, summaryResult] = await Promise.all([
        window.desktop.requirements.list({
          projectId,
          page: filters.page,
          pageSize: filters.pageSize,
          status: filters.status,
          type: filters.type,
          priority: filters.priority,
          searchQuery: filters.searchQuery,
        }),
        window.desktop.requirements.getSummary(projectId),
      ]);

      // Guard against stale asynchronous responses
      if (currentReqId !== activeRequestRef.current) {
        return;
      }

      if (listResult.ok && summaryResult.ok) {
        setData(listResult.data);
        setSummary(summaryResult.data);
        setError(null);
      } else {
        const errMsg =
          (!listResult.ok ? listResult.error.message : null) ||
          (!summaryResult.ok ? summaryResult.error.message : null) ||
          'Failed to load requirements.';
        setError(errMsg);
      }
    } catch (err) {
      if (currentReqId === activeRequestRef.current) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      }
    } finally {
      if (currentReqId === activeRequestRef.current) {
        setIsLoading(false);
      }
    }
  }, [projectId, filters]);

  useEffect(() => {
    void fetchRequirements();
  }, [fetchRequirements]);

  const createRequirement = useCallback(
    async (
      input: Omit<CreateRequirementInput, 'projectId'>,
    ): Promise<{ ok: boolean; error?: string; data?: RequirementDto }> => {
      if (!projectId || !window.desktop?.requirements) {
        return { ok: false, error: 'No project selected.' };
      }

      try {
        const result = await window.desktop.requirements.create({
          ...input,
          projectId,
        });

        if (result.ok) {
          await fetchRequirements();
          return { ok: true, data: result.data };
        } else {
          return { ok: false, error: result.error.message };
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to create requirement.',
        };
      }
    },
    [projectId, fetchRequirements],
  );

  const updateRequirement = useCallback(
    async (
      requirementId: string,
      input: Omit<UpdateRequirementInput, 'projectId' | 'requirementId'>,
    ): Promise<{ ok: boolean; error?: string; data?: RequirementDto }> => {
      if (!projectId || !window.desktop?.requirements) {
        return { ok: false, error: 'No project selected.' };
      }

      try {
        const result = await window.desktop.requirements.update({
          ...input,
          projectId,
          requirementId,
        });

        if (result.ok) {
          await fetchRequirements();
          return { ok: true, data: result.data };
        } else {
          return { ok: false, error: result.error.message };
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to update requirement.',
        };
      }
    },
    [projectId, fetchRequirements],
  );

  const activateRequirement = useCallback(
    async (requirementId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!projectId || !window.desktop?.requirements) {
        return { ok: false, error: 'No project selected.' };
      }

      try {
        const result = await window.desktop.requirements.activate({
          projectId,
          requirementId,
        });

        if (result.ok) {
          await fetchRequirements();
          return { ok: true };
        } else {
          return { ok: false, error: result.error.message };
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to activate requirement.',
        };
      }
    },
    [projectId, fetchRequirements],
  );

  const deprecateRequirement = useCallback(
    async (requirementId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!projectId || !window.desktop?.requirements) {
        return { ok: false, error: 'No project selected.' };
      }

      try {
        const result = await window.desktop.requirements.deprecate({
          projectId,
          requirementId,
        });

        if (result.ok) {
          await fetchRequirements();
          return { ok: true };
        } else {
          return { ok: false, error: result.error.message };
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to deprecate requirement.',
        };
      }
    },
    [projectId, fetchRequirements],
  );

  const draftRequirement = useCallback(
    async (requirementId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!projectId || !window.desktop?.requirements) {
        return { ok: false, error: 'No project selected.' };
      }

      try {
        const result = await window.desktop.requirements.draft({
          projectId,
          requirementId,
        });

        if (result.ok) {
          await fetchRequirements();
          return { ok: true };
        } else {
          return { ok: false, error: result.error.message };
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to move requirement to draft.',
        };
      }
    },
    [projectId, fetchRequirements],
  );

  const archiveRequirement = useCallback(
    async (requirementId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!projectId || !window.desktop?.requirements) {
        return { ok: false, error: 'No project selected.' };
      }

      try {
        const result = await window.desktop.requirements.archive({
          projectId,
          requirementId,
        });

        if (result.ok) {
          await fetchRequirements();
          return { ok: true };
        } else {
          return { ok: false, error: result.error.message };
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to archive requirement.',
        };
      }
    },
    [projectId, fetchRequirements],
  );

  const restoreRequirement = useCallback(
    async (requirementId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!projectId || !window.desktop?.requirements) {
        return { ok: false, error: 'No project selected.' };
      }

      try {
        const result = await window.desktop.requirements.restore({
          projectId,
          requirementId,
        });

        if (result.ok) {
          await fetchRequirements();
          return { ok: true };
        } else {
          return { ok: false, error: result.error.message };
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to restore requirement.',
        };
      }
    },
    [projectId, fetchRequirements],
  );

  const deleteRequirement = useCallback(
    async (requirementId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!projectId || !window.desktop?.requirements) {
        return { ok: false, error: 'No project selected.' };
      }

      try {
        const result = await window.desktop.requirements.delete({
          projectId,
          requirementId,
        });

        if (result.ok) {
          await fetchRequirements();
          return { ok: true };
        } else {
          return { ok: false, error: result.error.message };
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to delete requirement.',
        };
      }
    },
    [projectId, fetchRequirements],
  );

  const setPage = useCallback((page: number) => {
    setFilters(prev => ({ ...prev, page }));
  }, []);

  const updateFilters = useCallback(
    (newFilters: Partial<Omit<RequirementFilterState, 'page' | 'pageSize'>>) => {
      setFilters(prev => ({ ...prev, ...newFilters, page: 1 }));
    },
    [],
  );

  const clearFilters = useCallback(() => {
    setFilters({ page: 1, pageSize: 50 });
  }, []);

  return {
    requirements: data?.items ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? 1,
    pageSize: data?.pageSize ?? 50,
    totalPages: data?.totalPages ?? 1,
    summary,
    isLoading,
    error,
    filters,
    setPage,
    updateFilters,
    clearFilters,
    refetch: fetchRequirements,
    createRequirement,
    updateRequirement,
    activateRequirement,
    deprecateRequirement,
    draftRequirement,
    archiveRequirement,
    restoreRequirement,
    deleteRequirement,
  };
}
