/**
 * @file apps/desktop/src/renderer/screens/TraceabilityScreen.tsx
 * Phase 55 Requirement Traceability Matrix (RTM), Project Coverage Analysis, and Reverse Traceability Workspace.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  CoverageDimension,
  OrphanTestCaseDto,
  ProjectCoverageSummaryDto,
  RequirementCoverageStatus,
  ReverseTraceabilityItemDto,
  TraceabilityMatrixRowDto,
} from '@ai-quality/contracts';
import { useProject } from '../context/ProjectContext.js';
import {
  CoverageSummaryCards,
  CoverageGapsCard,
  TraceabilityMatrixView,
  ReverseTraceabilityView,
  OrphanTestsView,
} from '../features/coverage/index.js';
import { EmptyState, Tabs, TabList, Tab, TabPanel, Button } from '../ui/index.js';

export function TraceabilityScreen(): React.JSX.Element {
  const { selectedProjectId, selectedProject } = useProject();

  const [activeTab, setActiveTab] = useState<string>('matrix');

  // Forward RTM state
  const [summary, setSummary] = useState<ProjectCoverageSummaryDto | null>(null);
  const [matrixRows, setMatrixRows] = useState<readonly TraceabilityMatrixRowDto[]>([]);
  const [matrixTotal, setMatrixTotal] = useState<number>(0);
  const [matrixPage, setMatrixPage] = useState<number>(1);
  const [matrixPageSize] = useState<number>(20);
  const [matrixSearch, setMatrixSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<RequirementCoverageStatus | ''>('');
  const [missingDimensionFilter, setMissingDimensionFilter] = useState<CoverageDimension | ''>('');
  const [isMatrixLoading, setIsMatrixLoading] = useState<boolean>(false);

  // Reverse Traceability state
  const [reverseItems, setReverseItems] = useState<readonly ReverseTraceabilityItemDto[]>([]);
  const [reverseTotal, setReverseTotal] = useState<number>(0);
  const [reverseTotalOrphans, setReverseTotalOrphans] = useState<number>(0);
  const [reversePage, setReversePage] = useState<number>(1);
  const [reversePageSize] = useState<number>(20);
  const [reverseSearch, setReverseSearch] = useState<string>('');
  const [reverseOrphansOnly, setReverseOrphansOnly] = useState<boolean>(false);
  const [isReverseLoading, setIsReverseLoading] = useState<boolean>(false);

  // Orphan Tests Audit state
  const [orphanItems, setOrphanItems] = useState<readonly OrphanTestCaseDto[]>([]);
  const [orphanTotal, setOrphanTotal] = useState<number>(0);
  const [orphanPage, setOrphanPage] = useState<number>(1);
  const [orphanPageSize] = useState<number>(20);
  const [isOrphanLoading, setIsOrphanLoading] = useState<boolean>(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load Forward RTM
  const loadMatrix = useCallback(async () => {
    if (!selectedProjectId || !window.desktop?.coverage?.getTraceabilityMatrix) {
      return;
    }
    setIsMatrixLoading(true);
    setErrorMessage(null);
    try {
      const res = await window.desktop.coverage.getTraceabilityMatrix({
        projectId: selectedProjectId,
        page: matrixPage,
        pageSize: matrixPageSize,
        search: matrixSearch || undefined,
        coverageStatus: statusFilter || undefined,
        missingDimension: missingDimensionFilter || undefined,
      });

      if (res.ok) {
        setMatrixRows(res.data.rows);
        setMatrixTotal(res.data.total);
        setSummary(res.data.summary);
      } else {
        setErrorMessage(res.error.message);
      }
    } catch {
      setErrorMessage('Failed to fetch Traceability Matrix.');
    } finally {
      setIsMatrixLoading(false);
    }
  }, [
    selectedProjectId,
    matrixPage,
    matrixPageSize,
    matrixSearch,
    statusFilter,
    missingDimensionFilter,
  ]);

  // Load Reverse Traceability
  const loadReverseTraceability = useCallback(async () => {
    if (!selectedProjectId || !window.desktop?.coverage?.getReverseTraceability) {
      return;
    }
    setIsReverseLoading(true);
    setErrorMessage(null);
    try {
      const res = await window.desktop.coverage.getReverseTraceability({
        projectId: selectedProjectId,
        page: reversePage,
        pageSize: reversePageSize,
        search: reverseSearch || undefined,
        orphansOnly: reverseOrphansOnly,
      });

      if (res.ok) {
        setReverseItems(res.data.items);
        setReverseTotal(res.data.total);
        setReverseTotalOrphans(res.data.totalOrphans);
      } else {
        setErrorMessage(res.error.message);
      }
    } catch {
      setErrorMessage('Failed to fetch reverse traceability.');
    } finally {
      setIsReverseLoading(false);
    }
  }, [selectedProjectId, reversePage, reversePageSize, reverseSearch, reverseOrphansOnly]);

  // Load Orphan Tests Audit
  const loadOrphanTests = useCallback(async () => {
    if (!selectedProjectId || !window.desktop?.coverage?.getOrphanTests) {
      return;
    }
    setIsOrphanLoading(true);
    setErrorMessage(null);
    try {
      const res = await window.desktop.coverage.getOrphanTests({
        projectId: selectedProjectId,
        page: orphanPage,
        pageSize: orphanPageSize,
      });

      if (res.ok) {
        setOrphanItems(res.data.orphanTestCases);
        setOrphanTotal(res.data.total);
      } else {
        setErrorMessage(res.error.message);
      }
    } catch {
      setErrorMessage('Failed to fetch orphan tests.');
    } finally {
      setIsOrphanLoading(false);
    }
  }, [selectedProjectId, orphanPage, orphanPageSize]);

  // Initial & Dependency Trigger
  useEffect(() => {
    if (selectedProjectId) {
      loadMatrix();
    }
  }, [loadMatrix, selectedProjectId]);

  useEffect(() => {
    if (selectedProjectId && activeTab === 'reverse') {
      loadReverseTraceability();
    }
  }, [loadReverseTraceability, selectedProjectId, activeTab]);

  useEffect(() => {
    if (selectedProjectId && activeTab === 'orphans') {
      loadOrphanTests();
    }
  }, [loadOrphanTests, selectedProjectId, activeTab]);

  if (!selectedProjectId) {
    return (
      <EmptyState
        screenId="traceability-no-project"
        title="No Project Selected"
        description="Select an active project from the top bar to view its Requirement-to-Test Coverage and Traceability Matrix."
      />
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">
            Traceability & Coverage Intelligence
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Requirement Traceability Matrix (RTM), explainable dimension completeness, and
            bidirectional mapping for{' '}
            <span className="font-semibold text-foreground">{selectedProject?.name}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              loadMatrix();
              if (activeTab === 'reverse') loadReverseTraceability();
              if (activeTab === 'orphans') loadOrphanTests();
            }}
            disabled={isMatrixLoading || isReverseLoading || isOrphanLoading}
            className="text-xs"
          >
            ↻ Refresh All Data
          </Button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
          {errorMessage}
        </div>
      )}

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onChange={setActiveTab}>
        <TabList className="border-b mb-6">
          <Tab value="matrix">Forward Matrix & Coverage (RTM)</Tab>
          <Tab value="reverse">Reverse Traceability (Test → Req)</Tab>
          <Tab value="orphans">
            Orphan Tests Audit {reverseTotalOrphans > 0 ? `(${reverseTotalOrphans})` : ''}
          </Tab>
        </TabList>

        {/* Tab 1: Forward RTM */}
        <TabPanel value="matrix">
          <CoverageSummaryCards summary={summary} isLoading={isMatrixLoading} />

          {summary?.topGaps && (
            <CoverageGapsCard
              gaps={summary.topGaps}
              onSelectRequirement={reqId => {
                const targetRow = matrixRows.find(r => r.requirementId === reqId);
                if (targetRow) {
                  setMatrixSearch(targetRow.requirementKey);
                }
              }}
            />
          )}

          <TraceabilityMatrixView
            rows={matrixRows}
            total={matrixTotal}
            page={matrixPage}
            pageSize={matrixPageSize}
            isLoading={isMatrixLoading}
            search={matrixSearch}
            statusFilter={statusFilter}
            missingDimensionFilter={missingDimensionFilter}
            onSearchChange={val => {
              setMatrixSearch(val);
              setMatrixPage(1);
            }}
            onStatusFilterChange={val => {
              setStatusFilter(val);
              setMatrixPage(1);
            }}
            onMissingDimensionFilterChange={val => {
              setMissingDimensionFilter(val);
              setMatrixPage(1);
            }}
            onPageChange={setMatrixPage}
            onRefresh={loadMatrix}
          />
        </TabPanel>

        {/* Tab 2: Reverse Traceability */}
        <TabPanel value="reverse">
          <ReverseTraceabilityView
            items={reverseItems}
            total={reverseTotal}
            page={reversePage}
            pageSize={reversePageSize}
            totalOrphans={reverseTotalOrphans}
            search={reverseSearch}
            orphansOnly={reverseOrphansOnly}
            isLoading={isReverseLoading}
            onSearchChange={val => {
              setReverseSearch(val);
              setReversePage(1);
            }}
            onOrphansOnlyToggle={val => {
              setReverseOrphansOnly(val);
              setReversePage(1);
            }}
            onPageChange={setReversePage}
            onRefresh={loadReverseTraceability}
          />
        </TabPanel>

        {/* Tab 3: Orphan Tests Audit */}
        <TabPanel value="orphans">
          <OrphanTestsView
            orphans={orphanItems}
            total={orphanTotal}
            page={orphanPage}
            pageSize={orphanPageSize}
            isLoading={isOrphanLoading}
            onPageChange={setOrphanPage}
            onRefresh={loadOrphanTests}
          />
        </TabPanel>
      </Tabs>
    </div>
  );
}
