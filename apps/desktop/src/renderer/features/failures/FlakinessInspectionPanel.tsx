/**
 * @file apps/desktop/src/renderer/features/failures/FlakinessInspectionPanel.tsx
 * Flakiness Detection & Reproducibility Intelligence Inspection Panel (V6 Phase 79).
 * Displays flakiness classification, stability state, reproducibility ratio,
 * multi-attempt comparison matrix, staleness status, and reanalysis audit history.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  FlakinessAnalysisDto,
  FlakinessState,
  StabilityState,
  FlakinessAttemptSummaryDto,
} from '@ai-quality/contracts';

interface FlakinessInspectionPanelProps {
  readonly projectId: string;
  readonly failureCaseId: string;
}

const FLAKINESS_BADGE_STYLES: Record<
  FlakinessState,
  { bg: string; text: string; border: string; label: string }
> = {
  STABLE_FAILURE: {
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    border: 'border-red-500/30',
    label: 'Stable Failure',
  },
  STABLE_PASS: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    label: 'Stable Pass',
  },
  FLAKY_CANDIDATE: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    label: 'Flaky Candidate (Single Alternation)',
  },
  CONFIRMED_FLAKY: {
    bg: 'bg-rose-500/15',
    text: 'text-rose-400',
    border: 'border-rose-500/40',
    label: 'Confirmed Flaky (>= 3 Attempts)',
  },
  INCONCLUSIVE: {
    bg: 'bg-slate-500/10',
    text: 'text-slate-400',
    border: 'border-slate-500/30',
    label: 'Inconclusive',
  },
  INSUFFICIENT_EVIDENCE: {
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-400',
    border: 'border-yellow-500/30',
    label: 'Insufficient Evidence',
  },
  ENVIRONMENT_VARIABILITY: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-400',
    border: 'border-orange-500/30',
    label: 'Environment Variability',
  },
  EXECUTION_VARIABILITY: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
    label: 'Execution Variability',
  },
};

const STABILITY_BADGE_STYLES: Record<
  StabilityState,
  { bg: string; text: string; border: string; label: string }
> = {
  STABLE: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    label: 'STABLE',
  },
  INTERMITTENT: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    label: 'INTERMITTENT',
  },
  UNSTABLE: {
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    border: 'border-rose-500/30',
    label: 'UNSTABLE',
  },
  UNKNOWN: {
    bg: 'bg-slate-500/10',
    text: 'text-slate-400',
    border: 'border-slate-500/30',
    label: 'UNKNOWN',
  },
};

export function FlakinessInspectionPanel({
  projectId,
  failureCaseId,
}: FlakinessInspectionPanelProps): React.JSX.Element {
  const [analysis, setAnalysis] = useState<FlakinessAnalysisDto | null>(null);
  const [history, setHistory] = useState<readonly FlakinessAnalysisDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showReanalyzeModal, setShowReanalyzeModal] = useState<boolean>(false);
  const [reanalyzeReason, setReanalyzeReason] = useState<string>('');
  const [maxAttempts, setMaxAttempts] = useState<number>(3);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  const activeCaseRef = useRef<string>(failureCaseId);
  const activeProjectRef = useRef<string>(projectId);

  useEffect(() => {
    activeCaseRef.current = failureCaseId;
    activeProjectRef.current = projectId;
    setAnalysis(null);
    setHistory([]);
    setError(null);
    setShowReanalyzeModal(false);
  }, [projectId, failureCaseId]);

  const loadFlakinessData = useCallback(async () => {
    if (!window.desktop?.failures) {
      setIsLoading(false);
      return;
    }

    try {
      setError(null);
      const [currentRes, historyRes] = await Promise.all([
        window.desktop.failures.getFlakinessAnalysis({ projectId, failureCaseId }),
        window.desktop.failures.listFlakinessHistory({ projectId, failureCaseId }),
      ]);

      if (activeCaseRef.current !== failureCaseId || activeProjectRef.current !== projectId) {
        return;
      }

      if (currentRes.ok) {
        setAnalysis(currentRes.data);
      }
      if (historyRes.ok) {
        setHistory(historyRes.data);
      }
    } catch (err) {
      if (activeCaseRef.current === failureCaseId && activeProjectRef.current === projectId) {
        setError(err instanceof Error ? err.message : 'Failed to load flakiness analysis.');
      }
    } finally {
      if (activeCaseRef.current === failureCaseId && activeProjectRef.current === projectId) {
        setIsLoading(false);
      }
    }
  }, [projectId, failureCaseId]);

  useEffect(() => {
    setIsLoading(true);
    loadFlakinessData();
  }, [loadFlakinessData]);

  const handleRunAnalysis = async (force: boolean = false) => {
    if (!window.desktop?.failures || isAnalyzing) return;

    try {
      setIsAnalyzing(true);
      setError(null);

      const boundedAttempts = Math.min(Math.max(0, maxAttempts), 3);

      const res = force
        ? await window.desktop.failures.reanalyzeFlakiness({
            projectId,
            failureCaseId,
            reanalysisReason: reanalyzeReason.trim() || 'Manual reanalysis requested by operator',
            maxAdditionalAttempts: boundedAttempts,
          })
        : await window.desktop.failures.analyzeFlakiness({
            projectId,
            failureCaseId,
            maxAdditionalAttempts: boundedAttempts,
          });

      if (res.ok) {
        setAnalysis(res.data);
        setShowReanalyzeModal(false);
        setReanalyzeReason('');
        await loadFlakinessData();
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to evaluate flakiness.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (isLoading) {
    return (
      <div
        data-testid="flakiness-loading"
        className="p-6 text-center text-xs text-slate-400 bg-slate-900/40 rounded-lg border border-slate-800"
      >
        <span className="animate-pulse">
          Loading flakiness detection and reproducibility intelligence...
        </span>
      </div>
    );
  }

  const isBlocked = analysis?.flakinessState === 'INCONCLUSIVE' && analysis.evidenceGaps.length > 0;

  return (
    <div data-testid="flakiness-inspection-panel" className="space-y-4">
      {/* Action Header */}
      <div className="flex items-center justify-between bg-slate-900/60 p-3 rounded-lg border border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">
            Flakiness Detection & Reproducibility Intelligence
          </h3>
          <p className="text-xs text-slate-400">
            Multi-attempt execution analysis and controlled reproduction verification
          </p>
        </div>
        <div className="flex items-center gap-2">
          {analysis ? (
            <button
              type="button"
              onClick={() => setShowReanalyzeModal(true)}
              disabled={isAnalyzing}
              data-testid="btn-reanalyze-flakiness"
              className="px-3 py-1.5 bg-amber-600/30 hover:bg-amber-600/40 text-amber-200 text-xs font-semibold rounded border border-amber-500/40 transition disabled:opacity-50"
            >
              {isAnalyzing ? 'Analyzing...' : 'Reanalyze Flakiness'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleRunAnalysis(false)}
              disabled={isAnalyzing}
              data-testid="btn-run-flakiness-analysis"
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded shadow-sm transition disabled:opacity-50"
            >
              {isAnalyzing ? 'Analyzing...' : 'Run Flakiness Analysis'}
            </button>
          )}
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHistory(prev => !prev)}
              data-testid="btn-toggle-flakiness-history"
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded border border-slate-700 transition"
            >
              {showHistory ? 'Hide History' : `History (${history.length})`}
            </button>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          data-testid="flakiness-error-banner"
          className="p-3 bg-red-950/40 border border-red-800/60 rounded-lg text-xs text-red-300 flex items-center justify-between"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-200 font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Staleness Banner */}
      {analysis?.isStale && (
        <div
          data-testid="flakiness-stale-banner"
          className="p-3 bg-yellow-950/40 border border-yellow-800/60 rounded-lg text-xs text-yellow-300 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <span className="font-bold">⚠️ Analysis Stale:</span>
            <span>
              {analysis.stalenessReason ||
                'Underlying executions, reproductions, or integrity decisions have changed.'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowReanalyzeModal(true)}
            data-testid="btn-stale-reanalyze"
            className="px-2.5 py-1 bg-yellow-600/40 hover:bg-yellow-600/60 text-yellow-100 rounded text-xs font-semibold border border-yellow-500/40 transition"
          >
            Refresh Analysis
          </button>
        </div>
      )}

      {/* Blocked / Evidence Gaps Alert */}
      {isBlocked && (
        <div
          data-testid="flakiness-blocked-banner"
          className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-lg text-xs text-rose-300 space-y-1"
        >
          <div className="font-bold flex items-center gap-1.5">
            <span>⛔ Analysis Guarded / Inconclusive:</span>
            <span>
              Flakiness classification requires additional evidence or resolution of blockers:
            </span>
          </div>
          <ul className="list-disc list-inside text-rose-200/90 pl-1 space-y-0.5">
            {analysis.evidenceGaps.map((reason: string, idx: number) => (
              <li key={idx}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings Banner */}
      {analysis && analysis.warnings.length > 0 && (
        <div
          data-testid="flakiness-warnings-banner"
          className="p-3 bg-amber-950/30 border border-amber-800/40 rounded-lg text-xs text-amber-200 space-y-1"
        >
          <div className="font-semibold flex items-center gap-1.5">
            <span>⚠️ Evaluation Warnings:</span>
          </div>
          <ul className="list-disc list-inside text-amber-200/80 pl-1 space-y-0.5">
            {analysis.warnings.map((warn: string, idx: number) => (
              <li key={idx}>{warn}</li>
            ))}
          </ul>
        </div>
      )}

      {!analysis && !error && (
        <div
          data-testid="flakiness-empty-state"
          className="p-8 text-center text-xs text-slate-400 bg-slate-900/30 rounded-lg border border-slate-800/80"
        >
          No flakiness analysis has been performed on this failure case yet. Click{' '}
          <strong className="text-slate-300">Run Flakiness Analysis</strong> above to evaluate
          attempt history and controlled reproductions.
        </div>
      )}

      {analysis && (
        <>
          {/* Top Classification Badges & Metric Tiles */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* Flakiness State */}
            <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Flakiness State
              </span>
              <div>
                <span
                  data-testid="badge-flakiness-state"
                  className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold border ${
                    FLAKINESS_BADGE_STYLES[analysis.flakinessState]?.bg || 'bg-slate-800'
                  } ${FLAKINESS_BADGE_STYLES[analysis.flakinessState]?.text || 'text-slate-300'} ${
                    FLAKINESS_BADGE_STYLES[analysis.flakinessState]?.border || 'border-slate-700'
                  }`}
                >
                  {FLAKINESS_BADGE_STYLES[analysis.flakinessState]?.label ||
                    analysis.flakinessState}
                </span>
              </div>
            </div>

            {/* Stability State */}
            <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Stability State
              </span>
              <div>
                <span
                  data-testid="badge-stability-state"
                  className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold border ${
                    STABILITY_BADGE_STYLES[analysis.stabilityState]?.bg || 'bg-slate-800'
                  } ${STABILITY_BADGE_STYLES[analysis.stabilityState]?.text || 'text-slate-300'} ${
                    STABILITY_BADGE_STYLES[analysis.stabilityState]?.border || 'border-slate-700'
                  }`}
                >
                  {STABILITY_BADGE_STYLES[analysis.stabilityState]?.label ||
                    analysis.stabilityState}
                </span>
              </div>
            </div>

            {/* Reproducibility Ratio */}
            <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Reproducibility Ratio
              </span>
              <div className="flex items-baseline gap-1.5">
                <span
                  data-testid="text-reproducibility-ratio"
                  className="text-base font-bold text-slate-100"
                >
                  {analysis.reproducibilityRatio !== null
                    ? `${(analysis.reproducibilityRatio * 100).toFixed(1)}%`
                    : 'N/A'}
                </span>
                <span className="text-[10px] text-slate-400">
                  ({analysis.passCount}P / {analysis.failCount}F)
                </span>
              </div>
            </div>

            {/* Comparable Attempts */}
            <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400">Valid Attempts</span>
              <div className="flex items-baseline gap-1.5">
                <span
                  data-testid="text-valid-attempts"
                  className="text-base font-bold text-slate-100"
                >
                  {analysis.validAttemptCount}
                </span>
                <span className="text-[10px] text-slate-400">
                  / {analysis.attemptCount} total (
                  {analysis.attemptCount - analysis.validAttemptCount} filtered)
                </span>
              </div>
            </div>
          </div>

          {/* Explanation Section */}
          <div className="p-3 bg-slate-900/40 rounded-lg border border-slate-800 space-y-2">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Deterministic Evaluation Explanation
            </h4>
            <p
              data-testid="flakiness-explanation"
              className="text-xs text-slate-300 leading-relaxed"
            >
              {analysis.analysisExplanation || 'Deterministic rule evaluation complete.'}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[10px] text-slate-400 border-t border-slate-800/80">
              <div>
                <span className="font-semibold text-slate-300">Analysis Fingerprint: </span>
                <span data-testid="analysis-fingerprint" className="font-mono text-slate-400">
                  {analysis.analysisFingerprint.substring(0, 16)}...
                </span>
              </div>
              <div>
                <span className="font-semibold text-slate-300">Policy: </span>
                <span>v{analysis.flakinessPolicyVersion}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-300">Engine: </span>
                <span>v{analysis.analysisVersion}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-300">Analyzed At: </span>
                <span>{new Date(analysis.evaluatedAt).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Attempt Comparison Matrix */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Multi-Attempt Comparison Matrix ({analysis.attemptTimeline.length} Attempts)
              </h4>
              <span className="text-[10px] text-slate-400">
                Comparable: {analysis.validAttemptCount} | Filtered Out:{' '}
                {analysis.attemptCount - analysis.validAttemptCount}
              </span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/40">
              <table
                className="w-full text-left text-xs border-collapse"
                data-testid="attempts-table"
              >
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-semibold text-[11px]">
                    <th className="py-2 px-3">#</th>
                    <th className="py-2 px-3">Source</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3">Eligibility</th>
                    <th className="py-2 px-3">Environment</th>
                    <th className="py-2 px-3">Signature Match</th>
                    <th className="py-2 px-3">Step Match</th>
                    <th className="py-2 px-3">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {analysis.attemptTimeline.map(
                    (attempt: FlakinessAttemptSummaryDto, idx: number) => (
                      <tr
                        key={attempt.attemptId || idx}
                        data-testid={`attempt-row-${idx}`}
                        className={`hover:bg-slate-900/30 transition ${
                          !attempt.isEligible ? 'opacity-60 bg-slate-950/80' : ''
                        }`}
                      >
                        <td className="py-2 px-3 font-mono text-slate-400">
                          {attempt.attemptNumber}
                        </td>
                        <td className="py-2 px-3 text-slate-300">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                            {attempt.source}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              attempt.status === 'PASSED'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-red-500/10 text-red-400 border border-red-500/20'
                            }`}
                          >
                            {attempt.status}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          {attempt.isEligible ? (
                            <span className="text-emerald-400 font-semibold text-[11px]">
                              Eligible
                            </span>
                          ) : (
                            <div className="space-y-0.5">
                              <span className="text-rose-400 font-semibold text-[11px]">
                                Filtered Out
                              </span>
                              {attempt.ineligibilityReason && (
                                <p className="text-[10px] text-slate-400 italic">
                                  {attempt.ineligibilityReason}
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-300 text-[11px]">
                          <span
                            className={`px-1 py-0.5 rounded text-[10px] ${
                              attempt.environmentEquivalence === 'EXACT'
                                ? 'text-emerald-400 bg-emerald-500/10'
                                : attempt.environmentEquivalence === 'EQUIVALENT'
                                  ? 'text-blue-400 bg-blue-500/10'
                                  : 'text-amber-400 bg-amber-500/10'
                            }`}
                          >
                            {attempt.environmentEquivalence}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-300 text-[11px]">
                          {attempt.status === 'PASSED' ? (
                            <span className="text-slate-400">—</span>
                          ) : attempt.isSignatureMatch === true ? (
                            <span className="text-emerald-400">Match</span>
                          ) : attempt.isSignatureMatch === false ? (
                            <span className="text-rose-400">Diverged</span>
                          ) : (
                            <span className="text-slate-400">N/A</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-300 text-[11px]">
                          {attempt.status === 'PASSED' ? (
                            <span className="text-slate-400">—</span>
                          ) : attempt.isStepMatch === true ? (
                            <span className="text-emerald-400">
                              Step #{attempt.failedStepIndex}
                            </span>
                          ) : attempt.isStepMatch === false ? (
                            <span className="text-rose-400">
                              Diff Step #{attempt.failedStepIndex}
                            </span>
                          ) : (
                            <span className="text-slate-400">N/A</span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-400 text-[11px]">
                          {attempt.durationMs ? `${attempt.durationMs}ms` : '—'}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Historical Analyses Drawer */}
      {showHistory && history.length > 0 && (
        <div
          data-testid="flakiness-history-drawer"
          className="p-3 bg-slate-900/60 rounded-lg border border-slate-800 space-y-2"
        >
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Flakiness Audit & Reanalysis History ({history.length})
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {history.map(item => (
              <div
                key={item.id}
                className="p-2.5 bg-slate-950/60 border border-slate-800 rounded flex flex-col gap-1 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                        FLAKINESS_BADGE_STYLES[item.flakinessState]?.bg || 'bg-slate-800'
                      } ${FLAKINESS_BADGE_STYLES[item.flakinessState]?.text || 'text-slate-300'} ${
                        FLAKINESS_BADGE_STYLES[item.flakinessState]?.border || 'border-slate-700'
                      }`}
                    >
                      {item.flakinessState}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Pass Rate:{' '}
                      {item.passRate !== null ? `${(item.passRate * 100).toFixed(0)}%` : 'N/A'} |
                      Repro Ratio:{' '}
                      {item.reproducibilityRatio !== null
                        ? `${(item.reproducibilityRatio * 100).toFixed(0)}%`
                        : 'N/A'}
                    </span>
                    {item.isAuthoritative && (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1 py-0.2 rounded font-bold">
                        AUTHORITATIVE
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {new Date(item.evaluatedAt).toLocaleString()}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-slate-400 truncate">
                  SHA: {item.analysisFingerprint}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reanalyze Modal */}
      {showReanalyzeModal && (
        <div
          data-testid="modal-reanalyze-flakiness"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-slate-900 border border-slate-700 rounded-lg max-w-md w-full p-4 space-y-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-slate-200">Trigger Flakiness Reanalysis</h3>
              <button
                type="button"
                onClick={() => setShowReanalyzeModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Re-evaluating flakiness aggregates primary execution, V5 retries, and Phase 76
              controlled reproduction attempts with deterministic reproducibility scoring.
            </p>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">
                Reanalysis Reason <span className="text-rose-400">*</span>
              </label>
              <textarea
                value={reanalyzeReason}
                onChange={e => setReanalyzeReason(e.target.value)}
                placeholder="Reason for triggering reanalysis (e.g. additional reproductions completed, environment stabilized)..."
                data-testid="input-reanalyze-reason"
                className="w-full h-20 px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">
                Bounded Additional Reproduction Attempts (0 - 3)
              </label>
              <input
                type="number"
                min="0"
                max="3"
                value={maxAttempts}
                onChange={e => setMaxAttempts(Number(e.target.value))}
                data-testid="input-max-attempts"
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              />
              <p className="text-[10px] text-slate-400">
                If reproduction history is under 3 attempts, this will automatically invoke
                controlled reproductions (max 3).
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowReanalyzeModal(false)}
                disabled={isAnalyzing}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleRunAnalysis(true)}
                disabled={isAnalyzing || !reanalyzeReason.trim()}
                data-testid="btn-confirm-reanalyze"
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded shadow-sm disabled:opacity-50 transition"
              >
                {isAnalyzing ? 'Reanalyzing...' : 'Confirm Reanalysis'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
