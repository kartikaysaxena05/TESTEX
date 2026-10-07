/**
 * @file apps/desktop/src/renderer/features/failures/DefectLocalizationCard.tsx
 * UI component for Repository-Aware Defect Localization (V7 Phase 100).
 * Displays evidence-backed candidate files, symbols, revision drift, traceability,
 * and safe read-only source inspection.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  CandidateSourceContentDto,
  RankedDefectCandidateDto,
  RepositoryDefectLocalizationDto,
  RepositoryRevisionStateDto,
} from '@ai-quality/contracts';

export interface DefectLocalizationCardProps {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly onLocalizationUpdated?: (localization: RepositoryDefectLocalizationDto) => void;
}

export const DefectLocalizationCard: React.FC<DefectLocalizationCardProps> = ({
  projectId,
  failureCaseId,
  onLocalizationUpdated,
}) => {
  const [localization, setLocalization] = useState<RepositoryDefectLocalizationDto | null>(null);
  const [history, setHistory] = useState<readonly RepositoryDefectLocalizationDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLocalizing, setIsLocalizing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Read-only source inspector modal state
  const [inspectingCandidate, setInspectingCandidate] = useState<{
    filePath: string;
    startLine?: number | null;
    endLine?: number | null;
  } | null>(null);
  const [sourceContent, setSourceContent] = useState<CandidateSourceContentDto | null>(null);
  const [isLoadingSource, setIsLoadingSource] = useState<boolean>(false);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const activeProjectRef = useRef(projectId);
  const activeFailureRef = useRef(failureCaseId);

  useEffect(() => {
    activeProjectRef.current = projectId;
    activeFailureRef.current = failureCaseId;
  }, [projectId, failureCaseId]);

  const loadLocalization = useCallback(async () => {
    const bridge = window.desktop?.defectLocalization;
    if (!bridge) return;

    setIsLoading(true);
    setError(null);

    try {
      const [currentRes, historyRes] = await Promise.all([
        bridge.getLocalization({ projectId, failureCaseId }),
        bridge.listLocalizations({ projectId, failureCaseId }),
      ]);

      if (activeProjectRef.current !== projectId || activeFailureRef.current !== failureCaseId) {
        return;
      }

      if (currentRes.ok) {
        setLocalization(currentRes.data);
      } else {
        setError(currentRes.error.message);
      }

      if (historyRes.ok) {
        setHistory(historyRes.data);
      }
    } catch (err) {
      if (activeProjectRef.current === projectId && activeFailureRef.current === failureCaseId) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (activeProjectRef.current === projectId && activeFailureRef.current === failureCaseId) {
        setIsLoading(false);
      }
    }
  }, [projectId, failureCaseId]);

  useEffect(() => {
    void loadLocalization();
  }, [loadLocalization]);

  const handleLocalize = async (forceRelocalize = false) => {
    const bridge = window.desktop?.defectLocalization;
    if (!bridge) return;

    setIsLocalizing(true);
    setError(null);

    try {
      const res = await bridge.localize({
        projectId,
        failureCaseId,
        actor: 'USER',
        forceRelocalize,
      });

      if (activeProjectRef.current !== projectId || activeFailureRef.current !== failureCaseId) {
        return;
      }

      if (res.ok) {
        setLocalization(res.data);
        onLocalizationUpdated?.(res.data);
        void loadLocalization();
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      if (activeProjectRef.current === projectId && activeFailureRef.current === failureCaseId) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (activeProjectRef.current === projectId && activeFailureRef.current === failureCaseId) {
        setIsLocalizing(false);
      }
    }
  };

  const handleInspectSource = async (
    filePath: string,
    startLine?: number | null,
    endLine?: number | null,
  ) => {
    const bridge = window.desktop?.defectLocalization;
    if (!bridge) return;

    setInspectingCandidate({ filePath, startLine, endLine });
    setIsLoadingSource(true);
    setSourceError(null);
    setSourceContent(null);

    try {
      const res = await bridge.inspectCandidateSource({
        projectId,
        failureCaseId,
        filePath,
        startLine: startLine ?? undefined,
        endLine: endLine ?? undefined,
      });

      if (res.ok) {
        setSourceContent(res.data);
      } else {
        setSourceError(res.error.message);
      }
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingSource(false);
    }
  };

  const getRevisionBadgeColor = (state: RepositoryRevisionStateDto): string => {
    switch (state) {
      case 'EXACT_REVISION':
        return 'bg-emerald-50 text-emerald-700 border-emerald-300';
      case 'EQUIVALENT_REVISION':
        return 'bg-blue-50 text-blue-700 border-blue-300';
      case 'DRIFTED_REVISION':
        return 'bg-amber-50 text-amber-700 border-amber-300';
      case 'HISTORICAL_REVISION_UNAVAILABLE':
      case 'UNKNOWN':
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  const getPriorityBadgeColor = (priority: string): string => {
    switch (priority) {
      case 'HIGH_PRIORITY_CANDIDATE':
        return 'bg-red-50 text-red-700 border-red-300';
      case 'MEDIUM_PRIORITY_CANDIDATE':
        return 'bg-amber-50 text-amber-700 border-amber-300';
      case 'LOW_PRIORITY_CANDIDATE':
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <span>Repository Defect Localization</span>
            <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              Phase 100
            </span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Pinpoints repository files, symbols, routes, and services responsible for this defect
            using verified runtime evidence.
          </p>
        </div>

        <button
          onClick={() => void handleLocalize(!!localization)}
          disabled={isLocalizing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded shadow-sm transition"
        >
          {isLocalizing ? (
            <>
              <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>Analyzing Repository...</span>
            </>
          ) : (
            <span>{localization ? 'Relocalize Defect' : 'Localize Defect in Repository'}</span>
          )}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {error}
        </div>
      )}

      {isLoading && !localization && (
        <div className="py-6 text-center text-xs text-slate-500">
          Loading repository localization status...
        </div>
      )}

      {!isLoading && !localization && (
        <div className="py-6 text-center text-xs text-slate-500 bg-slate-50 rounded border border-dashed border-slate-200">
          No repository defect localization recorded yet. Click &quot;Localize Defect in
          Repository&quot; to begin.
        </div>
      )}

      {localization && (
        <div className="space-y-4">
          {/* Repository & Revision Header */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs bg-slate-50 p-3 rounded border border-slate-200">
            <div>
              <span className="text-slate-400 block text-[11px]">Revision State</span>
              <span
                className={`inline-block mt-0.5 px-1.5 py-0.5 rounded border text-[11px] font-medium ${getRevisionBadgeColor(
                  localization.revisionState,
                )}`}
              >
                {localization.revisionState}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Branch</span>
              <span className="font-mono text-slate-800">
                {localization.branchName ?? 'unknown'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Analyzed Commit</span>
              <span className="font-mono text-slate-800">
                {localization.repositoryRevision.slice(0, 10)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Failure Time Commit</span>
              <span className="font-mono text-slate-800">
                {localization.failureTimeRevision
                  ? localization.failureTimeRevision.slice(0, 10)
                  : 'N/A'}
              </span>
            </div>
          </div>

          {/* Drift Banner if drifted */}
          {localization.isDrifted && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex items-start gap-2">
              <span className="font-semibold">⚠️ Repository Drift Detected:</span>
              <span>{localization.driftDetails}</span>
            </div>
          )}

          {/* Top Candidate Spotlight */}
          {localization.rankedCandidates[0] && (
            <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider">
                  Top Responsible Candidate
                </span>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded border font-medium ${getPriorityBadgeColor(
                    localization.rankedCandidates[0].priorityStatus,
                  )}`}
                >
                  {localization.rankedCandidates[0].priorityStatus}
                </span>
              </div>

              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-sm font-bold text-slate-900 font-mono">
                    {localization.rankedCandidates[0].filePath}
                  </div>
                  {localization.rankedCandidates[0].symbolName && (
                    <div className="text-xs text-indigo-900 font-mono font-semibold mt-0.5">
                      symbol: {localization.rankedCandidates[0].symbolName}()
                      {localization.rankedCandidates[0].startLine &&
                        ` (lines ${localization.rankedCandidates[0].startLine}–${localization.rankedCandidates[0].endLine})`}
                    </div>
                  )}
                </div>

                <div className="text-right">
                  <span className="text-lg font-bold text-indigo-700">
                    {Math.round(localization.rankedCandidates[0].score * 100)}%
                  </span>
                  <span className="text-[10px] text-slate-500 block">Evidence Score</span>
                </div>
              </div>

              <p className="text-xs text-slate-700 whitespace-pre-line bg-white/70 p-2.5 rounded border border-indigo-100">
                {localization.rankedCandidates[0].relevanceExplanation}
              </p>

              <div className="flex justify-end pt-1">
                <button
                  onClick={() =>
                    handleInspectSource(
                      localization.rankedCandidates[0]!.filePath,
                      localization.rankedCandidates[0]!.startLine,
                      localization.rankedCandidates[0]!.endLine,
                    )
                  }
                  className="px-2.5 py-1 text-xs font-medium text-indigo-700 bg-white border border-indigo-300 rounded hover:bg-indigo-50 shadow-sm"
                >
                  Inspect Source (Read-Only)
                </button>
              </div>
            </div>
          )}

          {/* Traceability Trail */}
          <div className="p-3 bg-slate-50 rounded border border-slate-200 text-xs space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block">
              Traceability Provenance Trail
            </span>
            <div className="flex items-center gap-2 text-slate-700 flex-wrap">
              <span className="px-2 py-0.5 bg-white border rounded font-mono text-[11px]">
                Req: {localization.traceability.requirementKey ?? 'N/A'}
              </span>
              <span>&rarr;</span>
              <span className="px-2 py-0.5 bg-white border rounded font-mono text-[11px]">
                Test: {localization.traceability.testCaseKey ?? 'N/A'}
              </span>
              <span>&rarr;</span>
              <span className="px-2 py-0.5 bg-white border rounded font-mono text-[11px]">
                Step: {localization.traceability.failedStepAction ?? 'N/A'}
              </span>
              <span>&rarr;</span>
              <span className="px-2 py-0.5 bg-indigo-100 border border-indigo-300 rounded font-mono text-[11px] font-semibold text-indigo-900">
                Candidate: {localization.topCandidateFilePath ?? 'N/A'}
              </span>
            </div>
          </div>

          {/* Ranked Candidates Table */}
          {localization.rankedCandidates.length > 1 && (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-700 block">
                All Ranked Candidates ({localization.rankedCandidates.length})
              </span>
              <div className="overflow-x-auto border border-slate-200 rounded">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-medium">
                    <tr>
                      <th className="px-3 py-1.5 text-left w-8">#</th>
                      <th className="px-3 py-1.5 text-left">Candidate File</th>
                      <th className="px-3 py-1.5 text-left">Symbol</th>
                      <th className="px-3 py-1.5 text-left">Type</th>
                      <th className="px-3 py-1.5 text-right">Score</th>
                      <th className="px-3 py-1.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {localization.rankedCandidates.map(c => (
                      <tr key={`${c.rank}-${c.filePath}`} className="hover:bg-slate-50">
                        <td className="px-3 py-1.5 font-bold text-slate-400">{c.rank}</td>
                        <td className="px-3 py-1.5 font-mono text-slate-800">{c.filePath}</td>
                        <td className="px-3 py-1.5 font-mono text-slate-600">
                          {c.symbolName ? `${c.symbolName}()` : '—'}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px]">
                            {c.candidateType}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right font-bold text-slate-700">
                          {Math.round(c.score * 100)}%
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <button
                            onClick={() => handleInspectSource(c.filePath, c.startLine, c.endLine)}
                            className="text-indigo-600 hover:text-indigo-900 underline"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Phase 100 Boundary Notice */}
          <div className="p-2.5 bg-slate-100 rounded text-[11px] text-slate-600 border border-slate-200 flex items-center justify-between">
            <span>
              🔒 <strong>Phase 100 Boundary</strong>: Defect localization is read-only. Source-code
              modification and automated patch generation are strictly owned by Phase 101.
            </span>
            <span className="text-slate-400 text-[10px]">
              v{localization.localizationVersion} • {localization.durationMs ?? 0}ms
            </span>
          </div>
        </div>
      )}

      {/* Read-Only Source Inspection Modal */}
      {inspectingCandidate && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col border border-slate-300">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <div>
                <h4 className="text-sm font-semibold text-slate-900 font-mono">
                  {inspectingCandidate.filePath}
                </h4>
                <span className="text-[11px] text-slate-500">
                  Read-only repository preview (Lines {inspectingCandidate.startLine ?? 1}–
                  {inspectingCandidate.endLine ?? 'end'})
                </span>
              </div>
              <button
                onClick={() => setInspectingCandidate(null)}
                className="text-slate-400 hover:text-slate-600 text-lg px-2"
              >
                &times;
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 bg-slate-900 text-slate-100 font-mono text-xs">
              {isLoadingSource && (
                <div className="text-center py-8 text-slate-400">Loading source preview...</div>
              )}

              {sourceError && (
                <div className="p-3 bg-red-900/50 border border-red-700 text-red-200 rounded">
                  {sourceError}
                </div>
              )}

              {sourceContent && (
                <pre className="overflow-x-auto whitespace-pre">
                  <code>{sourceContent.content}</code>
                </pre>
              )}
            </div>

            <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <span>
                🔒 Read-Only Inspection. Source code editing and patch generation are disabled.
              </span>
              <button
                onClick={() => setInspectingCandidate(null)}
                className="px-3 py-1 bg-white border border-slate-300 rounded hover:bg-slate-50 font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
