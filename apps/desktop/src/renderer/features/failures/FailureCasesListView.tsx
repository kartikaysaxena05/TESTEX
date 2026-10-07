/**
 * @file apps/desktop/src/renderer/features/failures/FailureCasesListView.tsx
 * Interactive Failure Intelligence foundation view displaying authoritative failure cases,
 * linked V5 execution evidence references, and controlled analysis lifecycle state machine actions.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  FailureCaseDto,
  FailureCaseStatus,
  FailureAnalysisRunDto,
  FailureEvidenceReferenceDto,
} from '@ai-quality/contracts';
import { EvidenceInspectionPanel } from './EvidenceInspectionPanel.js';
import { ReproductionInspectionPanel } from './ReproductionInspectionPanel.js';
import { ClassificationInspectionPanel } from './ClassificationInspectionPanel.js';
import { FlakinessInspectionPanel } from './FlakinessInspectionPanel.js';
import { DomainSeparationInspectionPanel } from './DomainSeparationInspectionPanel.js';
import { TechnicalLocalizationInspectionPanel } from './TechnicalLocalizationInspectionPanel.js';
import { AiClassificationInspectionPanel } from './AiClassificationInspectionPanel.js';
import { RootCauseInspectionPanel } from './RootCauseInspectionPanel.js';
import { ImpactAssessmentInspectionPanel } from './ImpactAssessmentInspectionPanel.js';
import { DefectClusteringInspectionPanel } from './DefectClusteringInspectionPanel.js';
import { ConfidenceExplainabilityInspectionPanel } from './ConfidenceExplainabilityInspectionPanel.js';
import { StructuredBugReportPanel } from './StructuredBugReportPanel.js';

interface FailureCasesListViewProps {
  readonly projectId: string;
}

export function FailureCasesListView({ projectId }: FailureCasesListViewProps): React.JSX.Element {
  const [cases, setCases] = useState<readonly FailureCaseDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<FailureCaseDto | null>(null);
  const [selectedCaseRuns, setSelectedCaseRuns] = useState<readonly FailureAnalysisRunDto[]>([]);
  const [_selectedCaseEvidence, setSelectedCaseEvidence] = useState<
    readonly FailureEvidenceReferenceDto[]
  >([]);
  const [_isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<FailureCaseStatus | 'ALL'>('ALL');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [activeDetailsTab, setActiveDetailsTab] = useState<
    | 'EVIDENCE'
    | 'REPRODUCTION'
    | 'CLASSIFICATION'
    | 'FLAKINESS'
    | 'DOMAIN'
    | 'LOCALIZATION'
    | 'AI_REASONING'
    | 'ROOT_CAUSE'
    | 'IMPACT'
    | 'CLUSTERING'
    | 'CONFIDENCE'
    | 'BUG_REPORT'
  >('EVIDENCE');

  const activeProjectIdRef = useRef<string>(projectId);
  const activeSelectedCaseIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeProjectIdRef.current = projectId;
    setSelectedCase(null);
    setSelectedCaseRuns([]);
    setSelectedCaseEvidence([]);
    activeSelectedCaseIdRef.current = null;
  }, [projectId]);

  const loadFailureCases = useCallback(async () => {
    if (!window.desktop?.failures) {
      setIsLoading(false);
      return;
    }

    try {
      setError(null);
      const res = await window.desktop.failures.listCases({
        projectId,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        page: 1,
        pageSize: 50,
      });

      // Guard against project switch race
      if (activeProjectIdRef.current !== projectId) {
        return;
      }

      if (res.ok) {
        setCases(res.data.items);
        if (res.data.items.length > 0 && !activeSelectedCaseIdRef.current) {
          const first = res.data.items[0];
          if (first) {
            handleSelectCase(first);
          }
        }
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      if (activeProjectIdRef.current === projectId) {
        setError(err instanceof Error ? err.message : 'Failed to load failure cases.');
      }
    } finally {
      if (activeProjectIdRef.current === projectId) {
        setIsLoading(false);
      }
    }
  }, [projectId, statusFilter]);

  useEffect(() => {
    setIsLoading(true);
    loadFailureCases();
  }, [loadFailureCases]);

  const handleSelectCase = useCallback(async (failureCase: FailureCaseDto) => {
    setSelectedCase(failureCase);
    activeSelectedCaseIdRef.current = failureCase.id;
    setIsLoadingDetails(true);

    if (!window.desktop?.failures) {
      setIsLoadingDetails(false);
      return;
    }

    try {
      const [runsRes, evidenceRes] = await Promise.all([
        window.desktop.failures.listRuns({
          projectId: failureCase.projectId,
          failureCaseId: failureCase.id,
        }),
        window.desktop.failures.listEvidenceReferences({
          projectId: failureCase.projectId,
          failureCaseId: failureCase.id,
        }),
      ]);

      // Guard against failure case switch race and project switch race
      if (
        activeProjectIdRef.current !== failureCase.projectId ||
        activeSelectedCaseIdRef.current !== failureCase.id
      ) {
        return;
      }

      if (runsRes.ok) {
        setSelectedCaseRuns(runsRes.data);
      }
      if (evidenceRes.ok) {
        setSelectedCaseEvidence(evidenceRes.data);
      }
    } catch (err) {
      if (
        activeProjectIdRef.current === failureCase.projectId &&
        activeSelectedCaseIdRef.current === failureCase.id
      ) {
        console.error('Failed to load failure case details:', err);
      }
    } finally {
      if (
        activeProjectIdRef.current === failureCase.projectId &&
        activeSelectedCaseIdRef.current === failureCase.id
      ) {
        setIsLoadingDetails(false);
      }
    }
  }, []);

  const handleStartAnalysis = async (caseId: string) => {
    if (!window.desktop?.failures) return;
    try {
      setActionInProgress('start');
      const res = await window.desktop.failures.startAnalysis({
        projectId,
        failureCaseId: caseId,
        analyzerVersion: '1.0.0',
        triggerSource: 'MANUAL_UI',
      });

      if (res.ok) {
        await loadFailureCases();
        const updated = await window.desktop.failures.getCase({ projectId, failureCaseId: caseId });
        if (updated.ok) {
          handleSelectCase(updated.data);
        }
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start analysis.');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCompleteAnalysis = async (caseId: string, runId: string) => {
    if (!window.desktop?.failures) return;
    try {
      setActionInProgress('complete');
      const res = await window.desktop.failures.completeAnalysis({
        projectId,
        failureCaseId: caseId,
        analysisRunId: runId,
      });

      if (res.ok) {
        await loadFailureCases();
        const updated = await window.desktop.failures.getCase({ projectId, failureCaseId: caseId });
        if (updated.ok) {
          handleSelectCase(updated.data);
        }
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete analysis.');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleFailAnalysis = async (caseId: string, runId: string) => {
    if (!window.desktop?.failures) return;
    try {
      setActionInProgress('fail');
      const res = await window.desktop.failures.failAnalysis({
        projectId,
        failureCaseId: caseId,
        analysisRunId: runId,
        failureReason: 'Analysis interrupted or failed verification.',
      });

      if (res.ok) {
        await loadFailureCases();
        const updated = await window.desktop.failures.getCase({ projectId, failureCaseId: caseId });
        if (updated.ok) {
          handleSelectCase(updated.data);
        }
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to report analysis failure.');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCancelAnalysis = async (caseId: string) => {
    if (!window.desktop?.failures) return;
    try {
      setActionInProgress('cancel');
      const res = await window.desktop.failures.cancelAnalysis({
        projectId,
        failureCaseId: caseId,
        reason: 'Cancelled by user.',
      });

      if (res.ok) {
        await loadFailureCases();
        handleSelectCase(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel analysis.');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleMarkStale = async (caseId: string) => {
    if (!window.desktop?.failures) return;
    try {
      setActionInProgress('stale');
      const res = await window.desktop.failures.markStale({
        projectId,
        failureCaseId: caseId,
        reason: 'Marked stale manually from dashboard.',
      });

      if (res.ok) {
        await loadFailureCases();
        handleSelectCase(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark case as stale.');
    } finally {
      setActionInProgress(null);
    }
  };

  const getStatusBadge = (status: FailureCaseStatus, isStale: boolean) => {
    if (isStale) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
          STALE
        </span>
      );
    }

    switch (status) {
      case 'PENDING':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-500/20 text-slate-300 border border-slate-500/30">
            PENDING
          </span>
        );
      case 'READY':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30">
            READY
          </span>
        );
      case 'ANALYZING':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30 animate-pulse">
            ANALYZING
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            COMPLETED
          </span>
        );
      case 'FAILED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30">
            FAILED
          </span>
        );
      case 'BLOCKED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-orange-500/20 text-orange-300 border border-orange-500/30">
            BLOCKED
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-zinc-500/20 text-zinc-400 border border-zinc-500/30">
            CANCELLED
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-500/20 text-slate-300">
            {status}
          </span>
        );
    }
  };

  const getTriggerBadge = (status: string) => {
    switch (status) {
      case 'FAILED':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300">
            FAIL
          </span>
        );
      case 'AUTOMATION_ERROR':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300">
            AUTO ERROR
          </span>
        );
      case 'BLOCKED':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-300">
            BLOCKED
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-500/20 text-slate-300">
            {status}
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center p-12 text-slate-400"
        data-testid="failure-cases-loading"
      >
        <svg
          className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-400"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span>Loading failure intelligence cases...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="failure-cases-container">
      {/* Error Alert */}
      {error && (
        <div className="p-3 bg-rose-950/40 border border-rose-800 rounded-lg flex items-center justify-between text-xs text-rose-300">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-200">
            ✕
          </button>
        </div>
      )}

      {/* Filter and Summary Bar */}
      <div className="flex items-center justify-between bg-slate-900/60 p-3 rounded-lg border border-slate-800">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-300">Filter Status:</span>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded px-2.5 py-1 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">All Statuses ({cases.length})</option>
            <option value="PENDING">PENDING</option>
            <option value="READY">READY</option>
            <option value="ANALYZING">ANALYZING</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="FAILED">FAILED</option>
            <option value="BLOCKED">BLOCKED</option>
            <option value="STALE">STALE</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadFailureCases()}
            className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Main Grid: Cases List + Detail Pane */}
      {cases.length === 0 ? (
        <div
          className="text-center py-12 bg-slate-900/30 rounded-xl border border-slate-800/80 p-8"
          data-testid="failure-cases-empty"
        >
          <div className="w-12 h-12 rounded-full bg-slate-800/60 text-slate-400 flex items-center justify-center mx-auto mb-3">
            ✓
          </div>
          <h3 className="text-sm font-semibold text-slate-200">No Failure Cases</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
            There are no abnormal test execution failures requiring failure intelligence analysis
            for this project.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          {/* Left Column: Failure Cases List */}
          <div
            className="col-span-5 space-y-2 max-h-[700px] overflow-y-auto pr-1"
            data-testid="failure-cases-list"
          >
            {cases.map(item => {
              const isSelected = selectedCase?.id === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelectCase(item)}
                  data-testid="failure-case-item"
                  data-case-id={item.id}
                  className={`p-3 rounded-lg border cursor-pointer transition text-left ${
                    isSelected
                      ? 'bg-blue-950/30 border-blue-600/70 shadow-sm'
                      : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-800/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      {getTriggerBadge(item.triggeringExecutionStatus)}
                      <span className="text-xs font-bold text-slate-200 truncate">
                        {item.testCaseKey ? `[${item.testCaseKey}] ` : ''}
                        {item.title}
                      </span>
                    </div>
                    {getStatusBadge(item.status, item.isStale)}
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2 mb-2">
                    {item.failureSummary || item.errorMessage || 'No error details recorded'}
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/60">
                    <span>Attempts: {item.analysisAttemptCount}</span>
                    <span>{new Date(item.createdAt).toLocaleTimeString()}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: Selected Failure Case Detail */}
          <div
            className="col-span-7 bg-slate-900/50 border border-slate-800 rounded-lg p-4 space-y-4"
            data-testid="failure-case-detail"
          >
            {selectedCase ? (
              <>
                {/* Header */}
                <div className="border-b border-slate-800 pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        {getTriggerBadge(selectedCase.triggeringExecutionStatus)}
                        <h2 className="text-sm font-bold text-slate-100">
                          {selectedCase.testCaseKey ? `[${selectedCase.testCaseKey}] ` : ''}
                          {selectedCase.title}
                        </h2>
                      </div>
                      <p className="text-xs text-slate-400">
                        Execution:{' '}
                        <span className="font-mono text-slate-300">{selectedCase.executionId}</span>
                      </p>
                    </div>
                    <div>{getStatusBadge(selectedCase.status, selectedCase.isStale)}</div>
                  </div>
                </div>

                {/* Failure Summary & Diagnostics */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Failure Evidence Context
                  </h4>
                  <div className="p-3 bg-slate-950/70 border border-slate-800/90 rounded font-mono text-xs text-rose-300 space-y-1">
                    {selectedCase.errorCode && <div>Error Code: {selectedCase.errorCode}</div>}
                    <div>
                      {selectedCase.failureSummary ||
                        selectedCase.errorMessage ||
                        'No diagnostic message available.'}
                    </div>
                  </div>
                </div>

                {/* Lifecycle Actions */}
                <div className="p-3 bg-slate-800/40 border border-slate-800 rounded-lg space-y-2">
                  <h4 className="text-xs font-bold text-slate-300">Analysis Lifecycle Controls</h4>
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedCase.status !== 'ANALYZING' && (
                      <button
                        onClick={() => handleStartAnalysis(selectedCase.id)}
                        disabled={actionInProgress !== null}
                        data-testid="start-analysis-btn"
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded shadow transition"
                      >
                        {selectedCase.analysisAttemptCount > 0
                          ? '↻ Re-Run Analysis'
                          : '▶ Start Analysis'}
                      </button>
                    )}

                    {selectedCase.status === 'ANALYZING' && selectedCase.currentAnalysisRunId && (
                      <>
                        <button
                          onClick={() =>
                            handleCompleteAnalysis(
                              selectedCase.id,
                              selectedCase.currentAnalysisRunId!,
                            )
                          }
                          disabled={actionInProgress !== null}
                          data-testid="complete-analysis-btn"
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded shadow transition"
                        >
                          ✓ Complete Analysis
                        </button>
                        <button
                          onClick={() =>
                            handleFailAnalysis(selectedCase.id, selectedCase.currentAnalysisRunId!)
                          }
                          disabled={actionInProgress !== null}
                          data-testid="fail-analysis-btn"
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold rounded shadow transition"
                        >
                          ✕ Mark Analysis Failed
                        </button>
                      </>
                    )}

                    {selectedCase.status === 'COMPLETED' && !selectedCase.isStale && (
                      <button
                        onClick={() => handleMarkStale(selectedCase.id)}
                        disabled={actionInProgress !== null}
                        data-testid="mark-stale-btn"
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold rounded shadow transition"
                      >
                        ⚠ Mark Stale
                      </button>
                    )}

                    {selectedCase.status !== 'CANCELLED' && selectedCase.status !== 'COMPLETED' && (
                      <button
                        onClick={() => handleCancelAnalysis(selectedCase.id)}
                        disabled={actionInProgress !== null}
                        data-testid="cancel-analysis-btn"
                        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 text-xs font-semibold rounded transition"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>

                {/* Inspection Panels Switcher (V6 Phase 75 & 76) */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                    <button
                      type="button"
                      onClick={() => setActiveDetailsTab('EVIDENCE')}
                      data-testid="tab-evidence"
                      className={`px-3 py-1.5 rounded text-xs font-semibold transition ${
                        activeDetailsTab === 'EVIDENCE'
                          ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                      }`}
                    >
                      📦 Evidence Package (Phase 75)
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDetailsTab('REPRODUCTION')}
                      data-testid="tab-reproduction"
                      className={`px-3 py-1.5 rounded text-xs font-semibold transition ${
                        activeDetailsTab === 'REPRODUCTION'
                          ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                      }`}
                    >
                      🔬 Reproduction & Verification (Phase 76)
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDetailsTab('CLASSIFICATION')}
                      data-testid="tab-classification"
                      className={`px-3 py-1.5 rounded text-xs font-semibold transition ${
                        activeDetailsTab === 'CLASSIFICATION'
                          ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                      }`}
                    >
                      🏷️ Classification (Phase 77)
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDetailsTab('FLAKINESS')}
                      data-testid="tab-flakiness"
                      className={`px-3 py-1.5 rounded text-xs font-semibold transition ${
                        activeDetailsTab === 'FLAKINESS'
                          ? 'bg-amber-600/20 text-amber-300 border border-amber-500/30 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                      }`}
                    >
                      🎲 Flakiness (Phase 79)
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDetailsTab('DOMAIN')}
                      data-testid="tab-domain"
                      className={`px-3 py-1.5 rounded text-xs font-semibold transition ${
                        activeDetailsTab === 'DOMAIN'
                          ? 'bg-rose-600/20 text-rose-300 border border-rose-500/30 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                      }`}
                    >
                      🛡️ Failure Domain (Phase 80)
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDetailsTab('LOCALIZATION')}
                      data-testid="tab-localization"
                      className={`px-3 py-1.5 rounded text-xs font-semibold transition ${
                        activeDetailsTab === 'LOCALIZATION'
                          ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                      }`}
                    >
                      📍 Technical Cause (Phase 81)
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDetailsTab('AI_REASONING')}
                      data-testid="tab-ai-reasoning"
                      className={`px-3 py-1.5 rounded text-xs font-semibold transition ${
                        activeDetailsTab === 'AI_REASONING'
                          ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                      }`}
                    >
                      🤖 AI Reasoning (Phase 82)
                    </button>
                    <button
                      onClick={() => setActiveDetailsTab('ROOT_CAUSE')}
                      data-testid="tab-root-cause"
                      className={`px-3 py-1.5 rounded text-xs font-semibold transition ${
                        activeDetailsTab === 'ROOT_CAUSE'
                          ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                      }`}
                    >
                      🔍 Root Cause (Phase 83)
                    </button>
                    <button
                      onClick={() => setActiveDetailsTab('IMPACT')}
                      data-testid="tab-impact"
                      className={`px-3 py-1.5 rounded text-xs font-semibold transition ${
                        activeDetailsTab === 'IMPACT'
                          ? 'bg-rose-600/20 text-rose-300 border border-rose-500/30 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                      }`}
                    >
                      💥 Severity & Impact (Phase 84)
                    </button>
                    <button
                      onClick={() => setActiveDetailsTab('CLUSTERING')}
                      data-testid="tab-clustering"
                      className={`px-3 py-1.5 rounded text-xs font-semibold transition ${
                        activeDetailsTab === 'CLUSTERING'
                          ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                      }`}
                    >
                      🧩 Defect Clusters (Phase 85)
                    </button>
                    <button
                      onClick={() => setActiveDetailsTab('CONFIDENCE')}
                      data-testid="tab-confidence"
                      className={`px-3 py-1.5 rounded text-xs font-semibold transition ${
                        activeDetailsTab === 'CONFIDENCE'
                          ? 'bg-amber-600/20 text-amber-300 border border-amber-500/30 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                      }`}
                    >
                      🎯 Confidence & Explainability (Phase 86)
                    </button>
                    <button
                      onClick={() => setActiveDetailsTab('BUG_REPORT')}
                      data-testid="tab-bug-report"
                      className={`px-3 py-1.5 rounded text-xs font-semibold transition ${
                        activeDetailsTab === 'BUG_REPORT'
                          ? 'bg-rose-600/20 text-rose-300 border border-rose-500/30 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                      }`}
                    >
                      🐞 Bug Report (Phase 87)
                    </button>
                  </div>

                  {activeDetailsTab === 'EVIDENCE' && (
                    <EvidenceInspectionPanel
                      projectId={projectId}
                      failureCaseId={selectedCase.id}
                      onPackageUpdated={pkg => {
                        if (selectedCase && selectedCase.id === pkg.failureCaseId) {
                          setSelectedCase(prev =>
                            prev
                              ? {
                                  ...prev,
                                  failureSignature: pkg.failureSignature,
                                  evidenceCompleteness: pkg.completeness,
                                }
                              : null,
                          );
                        }
                      }}
                    />
                  )}
                  {activeDetailsTab === 'REPRODUCTION' && (
                    <ReproductionInspectionPanel
                      projectId={projectId}
                      failureCaseId={selectedCase.id}
                      originalExecutionId={selectedCase.executionId}
                    />
                  )}
                  {activeDetailsTab === 'CLASSIFICATION' && (
                    <ClassificationInspectionPanel
                      projectId={projectId}
                      failureCaseId={selectedCase.id}
                    />
                  )}
                  {activeDetailsTab === 'FLAKINESS' && (
                    <FlakinessInspectionPanel
                      projectId={projectId}
                      failureCaseId={selectedCase.id}
                    />
                  )}
                  {activeDetailsTab === 'DOMAIN' && (
                    <DomainSeparationInspectionPanel
                      projectId={projectId}
                      failureCaseId={selectedCase.id}
                    />
                  )}
                  {activeDetailsTab === 'LOCALIZATION' && (
                    <TechnicalLocalizationInspectionPanel
                      projectId={projectId}
                      failureCaseId={selectedCase.id}
                    />
                  )}
                  {activeDetailsTab === 'AI_REASONING' && (
                    <AiClassificationInspectionPanel
                      projectId={projectId}
                      failureCaseId={selectedCase.id}
                    />
                  )}
                  {activeDetailsTab === 'ROOT_CAUSE' && (
                    <RootCauseInspectionPanel
                      projectId={projectId}
                      failureCaseId={selectedCase.id}
                    />
                  )}
                  {activeDetailsTab === 'IMPACT' && (
                    <ImpactAssessmentInspectionPanel
                      projectId={projectId}
                      failureCaseId={selectedCase.id}
                    />
                  )}
                  {activeDetailsTab === 'CLUSTERING' && (
                    <DefectClusteringInspectionPanel
                      projectId={projectId}
                      failureCaseId={selectedCase.id}
                    />
                  )}
                  {activeDetailsTab === 'CONFIDENCE' && (
                    <ConfidenceExplainabilityInspectionPanel
                      projectId={projectId}
                      failureCaseId={selectedCase.id}
                    />
                  )}
                  {activeDetailsTab === 'BUG_REPORT' && (
                    <StructuredBugReportPanel
                      projectId={projectId}
                      failureCaseId={selectedCase.id}
                    />
                  )}
                </div>

                {/* Analysis Runs History */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Analysis Runs & Attempts ({selectedCaseRuns.length})
                  </h4>
                  {selectedCaseRuns.length === 0 ? (
                    <div className="text-xs text-slate-400 italic py-2">
                      No analysis attempts have been executed yet.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {selectedCaseRuns.map(run => (
                        <div
                          key={run.id}
                          className="p-2 bg-slate-950/50 border border-slate-800/80 rounded flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-200">
                              Attempt #{run.attemptNumber}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              v{run.analyzerVersion}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              ({run.triggerSource})
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300">
                              {run.status}
                            </span>
                            {run.durationMs && (
                              <span className="text-[10px] text-slate-400">{run.durationMs}ms</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-48 text-xs text-slate-400">
                Select a failure case to view details and lifecycle controls.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
