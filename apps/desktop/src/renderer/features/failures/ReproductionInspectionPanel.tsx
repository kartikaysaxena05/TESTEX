/**
 * @file apps/desktop/src/renderer/features/failures/ReproductionInspectionPanel.tsx
 * Authoritative Failure Reproduction & Reproducibility Verification Panel (V6 Phase 76).
 * Displays controlled re-execution controls, attempt history, exact historical test version
 * confirmation, environment drift analysis, step-by-step diffs, failure signature comparison,
 * and strict immutability verification of the original V5 execution.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  FailureReproductionAttemptDto,
  ReproducibilitySummaryDto,
  FailureReproductionOutcome,
  EnvironmentEquivalenceStatus,
  ReproductionStepComparisonDto,
} from '@ai-quality/contracts';

interface ReproductionInspectionPanelProps {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly originalExecutionId?: string;
}

export function ReproductionInspectionPanel({
  projectId,
  failureCaseId,
  originalExecutionId,
}: ReproductionInspectionPanelProps): React.JSX.Element {
  const [summary, setSummary] = useState<ReproducibilitySummaryDto | null>(null);
  const [attempts, setAttempts] = useState<readonly FailureReproductionAttemptDto[]>([]);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Configuration options
  const [maxAttempts, setMaxAttempts] = useState<number>(1);
  const [browserEngine, setBrowserEngine] = useState<'chromium' | 'firefox' | 'webkit'>('chromium');

  const activeCaseRef = useRef<string>(failureCaseId);

  useEffect(() => {
    activeCaseRef.current = failureCaseId;
    setSummary(null);
    setAttempts([]);
    setSelectedAttemptId(null);
    setError(null);
  }, [failureCaseId]);

  const loadReproductionData = useCallback(async () => {
    if (!window.desktop?.failures) {
      setIsLoading(false);
      return;
    }

    try {
      setError(null);
      const [summaryRes, attemptsRes] = await Promise.all([
        window.desktop.failures.getReproducibilitySummary({ projectId, failureCaseId }),
        window.desktop.failures.getReproductionAttempts({ projectId, failureCaseId }),
      ]);

      if (activeCaseRef.current !== failureCaseId) return;

      if (summaryRes.ok) {
        setSummary(summaryRes.data);
      }
      if (attemptsRes.ok) {
        setAttempts(attemptsRes.data);
        if (attemptsRes.data.length > 0 && !selectedAttemptId) {
          const first = attemptsRes.data[0];
          if (first) setSelectedAttemptId(first.id);
        }
      }
    } catch (err) {
      if (activeCaseRef.current === failureCaseId) {
        setError(err instanceof Error ? err.message : 'Failed to load reproduction data.');
      }
    } finally {
      if (activeCaseRef.current === failureCaseId) {
        setIsLoading(false);
      }
    }
  }, [projectId, failureCaseId, selectedAttemptId]);

  useEffect(() => {
    setIsLoading(true);
    loadReproductionData();
  }, [loadReproductionData]);

  const handleExecuteReproduction = async () => {
    if (!window.desktop?.failures || isExecuting) return;

    try {
      setIsExecuting(true);
      setError(null);

      const res = await window.desktop.failures.executeReproduction({
        projectId,
        failureCaseId,
        maxAttempts,
        browserEngine,
      });

      if (activeCaseRef.current !== failureCaseId) return;

      if (res.ok) {
        setSummary(res.data);
        const attemptsRes = await window.desktop.failures.getReproductionAttempts({
          projectId,
          failureCaseId,
        });
        if (attemptsRes.ok) {
          setAttempts(attemptsRes.data);
          const first = attemptsRes.data[0];
          if (first) setSelectedAttemptId(first.id);
        }
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      if (activeCaseRef.current === failureCaseId) {
        setError(err instanceof Error ? err.message : 'Reproduction execution failed.');
      }
    } finally {
      if (activeCaseRef.current === failureCaseId) {
        setIsExecuting(false);
      }
    }
  };

  const handleCancelReproduction = async () => {
    if (!window.desktop?.failures) return;

    try {
      setError(null);
      const res = await window.desktop.failures.cancelReproduction({
        projectId,
        failureCaseId,
      });

      if (res.ok && activeCaseRef.current === failureCaseId) {
        await loadReproductionData();
      } else if (!res.ok) {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel reproduction.');
    }
  };

  const selectedAttempt = attempts.find(a => a.id === selectedAttemptId) ?? attempts[0] ?? null;

  const getOutcomeBadge = (outcome: FailureReproductionOutcome) => {
    switch (outcome) {
      case 'REPRODUCED':
        return (
          <span
            data-testid="outcome-reproduced"
            className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
          >
            REPRODUCED
          </span>
        );
      case 'NOT_REPRODUCED':
        return (
          <span
            data-testid="outcome-not-reproduced"
            className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30"
          >
            NOT REPRODUCED (PASSED)
          </span>
        );
      case 'BLOCKED':
        return (
          <span
            data-testid="outcome-blocked"
            className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-orange-500/20 text-orange-300 border border-orange-500/30"
          >
            BLOCKED
          </span>
        );
      case 'INCONCLUSIVE':
        return (
          <span
            data-testid="outcome-inconclusive"
            className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30"
          >
            INCONCLUSIVE
          </span>
        );
      case 'EXECUTION_ERROR':
        return (
          <span
            data-testid="outcome-execution-error"
            className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30"
          >
            EXECUTION ERROR
          </span>
        );
      case 'CANCELLED':
        return (
          <span
            data-testid="outcome-cancelled"
            className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-zinc-500/20 text-zinc-400 border border-zinc-500/30"
          >
            CANCELLED
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-500/20 text-slate-300">
            {outcome}
          </span>
        );
    }
  };

  const getEnvEquivalenceBadge = (status: EnvironmentEquivalenceStatus) => {
    switch (status) {
      case 'EXACT':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            EXACT MATCH
          </span>
        );
      case 'EQUIVALENT':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
            EQUIVALENT
          </span>
        );
      case 'DRIFTED':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            ENV DRIFTED
          </span>
        );
      case 'INCOMPATIBLE':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
            INCOMPATIBLE
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-500/20 text-slate-400">
            UNKNOWN
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-lg text-xs text-slate-400 flex items-center justify-center gap-2">
        <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        Loading reproduction and verification data...
      </div>
    );
  }

  return (
    <div
      data-testid="reproduction-inspection-panel"
      className="p-4 bg-slate-900/60 border border-slate-800 rounded-lg space-y-4"
    >
      {/* Header & Overall Summary */}
      <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Failure Reproduction & Verification (V6 Phase 76)
            </h3>
            {summary && getOutcomeBadge(summary.overallOutcome)}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Controlled re-execution under reconstructed historical conditions. Original execution E1
            remains strictly immutable.
          </p>
        </div>

        {/* Execution Controls */}
        <div className="flex items-center gap-2">
          {isExecuting ? (
            <button
              onClick={handleCancelReproduction}
              data-testid="cancel-repro-btn"
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded shadow transition"
            >
              Cancel Running
            </button>
          ) : (
            <button
              onClick={handleExecuteReproduction}
              disabled={isExecuting}
              data-testid="execute-repro-btn"
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded shadow transition flex items-center gap-1.5"
            >
              <span>▶</span> Execute Reproduction
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* Execution Config Bar */}
      <div className="p-2.5 bg-slate-950/40 border border-slate-800/80 rounded flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Max Attempts:</span>
            <select
              value={maxAttempts}
              onChange={e => setMaxAttempts(Number(e.target.value))}
              disabled={isExecuting}
              aria-label="Max Attempts"
              className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-200"
            >
              <option value={1}>1 Attempt</option>
              <option value={2}>2 Attempts</option>
              <option value={3}>3 Attempts</option>
              <option value={5}>5 Attempts</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Engine:</span>
            <select
              value={browserEngine}
              onChange={e => setBrowserEngine(e.target.value as 'chromium' | 'firefox' | 'webkit')}
              disabled={isExecuting}
              aria-label="Browser Engine"
              className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-200"
            >
              <option value="chromium">Chromium</option>
              <option value="firefox">Firefox</option>
              <option value="webkit">WebKit</option>
            </select>
          </div>
        </div>

        {/* Verification Summary Stats */}
        {summary && (
          <div className="flex items-center gap-3 font-mono text-[11px]">
            <span className="text-slate-400">
              Completed:{' '}
              <strong className="text-slate-200">
                {summary.attemptsCompleted}/{summary.attemptsRequested}
              </strong>
            </span>
            <span className="text-slate-400">
              Ratio:{' '}
              <strong
                className={summary.reproducibilityRatio > 0 ? 'text-emerald-400' : 'text-slate-300'}
              >
                {Math.round(summary.reproducibilityRatio * 100)}%
              </strong>
            </span>
            <span className="text-slate-400">
              Eq Failures: <strong className="text-rose-400">{summary.equivalentFailures}</strong>
            </span>
            <span className="text-slate-400">
              Passes: <strong className="text-blue-400">{summary.passes}</strong>
            </span>
            {summary.environmentDriftDetected && (
              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold uppercase">
                ENV DRIFT
              </span>
            )}
          </div>
        )}
      </div>

      {/* Attempts List & Detailed View */}
      {attempts.length === 0 ? (
        <div className="p-6 bg-slate-950/30 border border-dashed border-slate-800 rounded text-center text-xs text-slate-400 space-y-1">
          <p className="font-semibold text-slate-300">No reproduction attempts executed yet</p>
          <p className="text-[11px]">
            Click &quot;Execute Reproduction&quot; above to re-run the test case under reconstructed
            environment profiles and verify reproducibility.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Attempts Selector Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-800">
            {attempts.map(attempt => (
              <button
                key={attempt.id}
                onClick={() => setSelectedAttemptId(attempt.id)}
                className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-2 border transition ${
                  selectedAttempt?.id === attempt.id
                    ? 'bg-slate-800 text-slate-100 border-slate-600 shadow-sm'
                    : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <span>Attempt #{attempt.attemptNumber}</span>
                {getOutcomeBadge(attempt.status)}
              </button>
            ))}
          </div>

          {/* Selected Attempt Detailed Breakdown */}
          {selectedAttempt && (
            <div className="space-y-3">
              {/* Immutability & Traceability Card */}
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-200 flex items-center gap-1.5">
                    <span className="text-emerald-400">🛡</span> Execution Immutability Verification
                  </h4>
                  <div className="flex items-center gap-2">
                    {getEnvEquivalenceBadge(selectedAttempt.environmentEquivalence)}
                    {getOutcomeBadge(selectedAttempt.status)}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono">
                  <div className="p-2 bg-slate-900/80 rounded border border-slate-800">
                    <span className="text-slate-400 block text-[10px] uppercase font-sans">
                      Original Execution (Immutable E1)
                    </span>
                    <span className="text-slate-200 break-all">
                      {selectedAttempt.originalExecutionId || originalExecutionId || 'N/A'}
                    </span>
                    <div className="text-[10px] text-slate-500 font-sans mt-0.5">
                      Historical Test Version: v{selectedAttempt.testCaseVersionNumber}
                    </div>
                  </div>

                  <div className="p-2 bg-slate-900/80 rounded border border-slate-800">
                    <span className="text-slate-400 block text-[10px] uppercase font-sans">
                      Reproduction Execution (New E2)
                    </span>
                    <span className="text-indigo-300 break-all">
                      {selectedAttempt.reproductionExecutionId || 'Pending / In-flight'}
                    </span>
                    <div className="text-[10px] text-slate-500 font-sans mt-0.5">
                      Duration: {selectedAttempt.durationMs ?? 0}ms | Engine:{' '}
                      {selectedAttempt.browserEngine}
                    </div>
                  </div>
                </div>

                {/* Failure Signature Match */}
                <div className="p-2 bg-slate-900/80 rounded border border-slate-800 space-y-1 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-sans text-[10px] uppercase">
                      Failure Signature Comparison
                    </span>
                    <span
                      className={`font-bold px-1.5 py-0.2 rounded text-[10px] ${
                        selectedAttempt.isSignatureMatch
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {selectedAttempt.isSignatureMatch ? 'MATCHED' : 'DIFFERENT / MISMATCH'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 font-mono text-[10px]">
                    <div>
                      <span className="text-slate-500">Original Sig:</span>{' '}
                      <span className="text-slate-300">
                        {selectedAttempt.originalFailureSignature?.slice(0, 16) ?? 'None'}...
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Repro Sig:</span>{' '}
                      <span className="text-slate-300">
                        {selectedAttempt.reproductionFailureSignature?.slice(0, 16) ?? 'None'}...
                      </span>
                    </div>
                  </div>
                </div>

                {/* Blocker Reason if Blocked */}
                {selectedAttempt.blockerReason && (
                  <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded text-[11px] text-amber-300">
                    <strong>Blocker:</strong> {selectedAttempt.blockerReason}
                  </div>
                )}
              </div>

              {/* Step Execution Comparison */}
              {(() => {
                const stepComparisons = Array.isArray(selectedAttempt.stepComparison)
                  ? selectedAttempt.stepComparison
                  : [];
                return (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Step-by-Step Execution Diff ({stepComparisons.length} steps)
                    </h4>
                    {stepComparisons.length === 0 ? (
                      <div className="text-xs text-slate-500 italic">No step comparisons recorded.</div>
                    ) : (
                      <div className="border border-slate-800 rounded-lg overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase font-mono">
                            <tr>
                              <th className="p-2">#</th>
                              <th className="p-2">Action / Command</th>
                              <th className="p-2">Original (E1)</th>
                              <th className="p-2">Repro (E2)</th>
                              <th className="p-2 text-right">Match</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                            {stepComparisons.map(
                              (step: ReproductionStepComparisonDto) => (
                            <tr
                              key={step.stepIndex}
                              className={`hover:bg-slate-800/40 transition ${
                                !step.isMatch ? 'bg-rose-500/5' : ''
                              }`}
                            >
                              <td className="p-2 font-mono text-slate-400">{step.stepIndex + 1}</td>
                              <td className="p-2 font-mono text-slate-200 max-w-xs truncate">
                                {step.targetSummary || step.actionType}
                              </td>
                              <td className="p-2">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    step.originalStatus === 'PASSED'
                                      ? 'bg-emerald-500/20 text-emerald-300'
                                      : 'bg-rose-500/20 text-rose-300'
                                  }`}
                                >
                                  {step.originalStatus}
                                </span>
                              </td>
                              <td className="p-2">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    step.reproductionStatus === 'PASSED'
                                      ? 'bg-emerald-500/20 text-emerald-300'
                                      : 'bg-rose-500/20 text-rose-300'
                                  }`}
                                >
                                  {step.reproductionStatus}
                                </span>
                              </td>
                              <td className="p-2 text-right font-mono text-[11px]">
                                {step.isMatch ? (
                                  <span className="text-emerald-400">✓ MATCH</span>
                                ) : (
                                  <span className="text-rose-400">✗ DIFF</span>
                                )}
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

              {/* Assertion Comparison */}
              {selectedAttempt.assertionComparison && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Assertion Outcome Diff
                  </h4>
                  <div className="p-2.5 bg-slate-950/50 border border-slate-800 rounded text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200">
                        {selectedAttempt.assertionComparison.assertionType || 'Assertion'} (
                        {selectedAttempt.assertionComparison.operator || 'eq'})
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          selectedAttempt.assertionComparison.isMatch
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {selectedAttempt.assertionComparison.isMatch ? 'MATCHED' : 'MISMATCH'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-400">
                      <div>
                        Original Expected:{' '}
                        {String(selectedAttempt.assertionComparison.originalExpected ?? 'N/A')} |
                        Actual:{' '}
                        {String(selectedAttempt.assertionComparison.originalActual ?? 'N/A')}
                      </div>
                      <div>
                        Repro Expected:{' '}
                        {String(selectedAttempt.assertionComparison.reproductionExpected ?? 'N/A')}{' '}
                        | Actual:{' '}
                        {String(selectedAttempt.assertionComparison.reproductionActual ?? 'N/A')}
                      </div>
                    </div>
                    {selectedAttempt.assertionComparison.diffSummary && (
                      <div className="text-[11px] text-amber-300 font-mono">
                        {selectedAttempt.assertionComparison.diffSummary}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Environment Drift Comparison */}
              {selectedAttempt.environmentComparison && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Reconstructed Environment Profile Diff
                  </h4>
                  <div className="p-2.5 bg-slate-950/60 border border-slate-800 rounded text-xs space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Equivalence Status:</span>
                      {getEnvEquivalenceBadge(selectedAttempt.environmentComparison.status)}
                    </div>
                    {Array.isArray(selectedAttempt.environmentComparison.driftItems) &&
                    selectedAttempt.environmentComparison.driftItems.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        <span className="text-amber-400 text-[10px] font-bold block">
                          Detected Drift Parameters:
                        </span>
                        {selectedAttempt.environmentComparison.driftItems.map(
                          (item: string, i: number) => (
                            <div
                              key={i}
                              className="text-[11px] font-mono text-slate-300 pl-2 border-l-2 border-amber-500/40"
                            >
                              {item}
                            </div>
                          ),
                        )}
                      </div>
                    ) : (
                      <div className="text-[11px] text-emerald-400 font-mono">
                        ✓ All reconstructed environment parameters match historical execution.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
