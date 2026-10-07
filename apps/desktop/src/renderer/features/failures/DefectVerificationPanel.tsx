/**
 * @file apps/desktop/src/renderer/features/failures/DefectVerificationPanel.tsx
 * UI component for Automated Failed-Test Rerun & Fix Verification (V7 Phase 98).
 * Provides interactive verification execution controls, mode selection (HISTORICAL vs CURRENT),
 * live rerun progress, E1 vs E2 comparison view, failure signature diff, and attempt history.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  VerificationMode,
  VerificationOutcome,
  DefectVerificationAttemptDto,
  VerificationSummaryDto,
} from '@ai-quality/contracts';

export interface DefectVerificationPanelProps {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly reverificationId?: string | null;
  readonly onVerificationComplete?: (summary: VerificationSummaryDto) => void;
}

export const DefectVerificationPanel: React.FC<DefectVerificationPanelProps> = ({
  projectId,
  failureCaseId,
  reverificationId,
  onVerificationComplete,
}) => {
  const [mode, setMode] = useState<VerificationMode>('HISTORICAL');
  const [maxAttempts, setMaxAttempts] = useState<number>(1);
  const [attempts, setAttempts] = useState<readonly DefectVerificationAttemptDto[]>([]);
  const [selectedAttempt, setSelectedAttempt] = useState<DefectVerificationAttemptDto | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isLoadingAttempts, setIsLoadingAttempts] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<VerificationSummaryDto | null>(null);

  // Guards against project/defect switch race conditions
  const activeProjectRef = useRef(projectId);
  const activeBugRef = useRef(failureCaseId);

  useEffect(() => {
    activeProjectRef.current = projectId;
    activeBugRef.current = failureCaseId;
  }, [projectId, failureCaseId]);

  const loadAttempts = useCallback(async () => {
    const bridge = window.desktop?.verification;
    if (!bridge) return;

    setIsLoadingAttempts(true);
    setError(null);
    try {
      const res = await bridge.getAttempts({
        projectId,
        failureCaseId,
        reverificationId: reverificationId || undefined,
      });

      if (activeProjectRef.current !== projectId || activeBugRef.current !== failureCaseId) return;

      if (res.ok) {
        setAttempts(res.data);
        if (res.data.length > 0) {
          setSelectedAttempt(res.data[res.data.length - 1] || null);
        }
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      if (activeProjectRef.current === projectId && activeBugRef.current === failureCaseId) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (activeProjectRef.current === projectId && activeBugRef.current === failureCaseId) {
        setIsLoadingAttempts(false);
      }
    }
  }, [projectId, failureCaseId, reverificationId]);

  useEffect(() => {
    void loadAttempts();
  }, [loadAttempts]);

  const handleRunVerification = async () => {
    const bridge = window.desktop?.verification;
    if (!bridge) return;

    setIsRunning(true);
    setError(null);

    try {
      const res = await bridge.execute({
        projectId,
        failureCaseId,
        reverificationId: reverificationId || undefined,
        mode,
        maxAttempts,
        actor: 'USER',
      });

      if (activeProjectRef.current !== projectId || activeBugRef.current !== failureCaseId) return;

      if (res.ok) {
        setSummary(res.data);
        setAttempts(res.data.attempts);
        const latest = res.data.attempts[res.data.attempts.length - 1];
        if (latest) {
          setSelectedAttempt(latest);
        }
        if (onVerificationComplete) {
          onVerificationComplete(res.data);
        }
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      if (activeProjectRef.current === projectId && activeBugRef.current === failureCaseId) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (activeProjectRef.current === projectId && activeBugRef.current === failureCaseId) {
        setIsRunning(false);
      }
    }
  };

  const handleCancelVerification = async () => {
    const bridge = window.desktop?.verification;
    if (!bridge) return;

    try {
      await bridge.cancel({
        projectId,
        failureCaseId,
        reason: 'Cancelled by user from Verification Panel',
        actor: 'USER',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const getOutcomeBadgeClass = (outcome?: VerificationOutcome | null): string => {
    switch (outcome) {
      case 'VERIFIED_FIXED':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-700';
      case 'STILL_FAILING':
        return 'bg-rose-950/80 text-rose-300 border-rose-700';
      case 'DIFFERENT_FAILURE':
        return 'bg-amber-950/80 text-amber-300 border-amber-700';
      case 'BLOCKED':
        return 'bg-yellow-950/80 text-yellow-300 border-yellow-700';
      case 'CANCELLED':
        return 'bg-slate-800 text-slate-400 border-slate-700';
      case 'EXECUTION_ERROR':
        return 'bg-red-950/80 text-red-300 border-red-700';
      case 'INCONCLUSIVE':
      default:
        return 'bg-slate-900 text-slate-300 border-slate-700';
    }
  };

  return (
    <div
      data-testid="defect-verification-panel"
      className="mt-4 p-4 bg-slate-900/90 border border-slate-800 rounded-lg space-y-4"
    >
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            Automated Failed-Test Rerun & Fix Verification
            {isRunning && (
              <span
                data-testid="verification-running-indicator"
                className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium bg-cyan-950/80 text-cyan-300 border border-cyan-700 rounded-full animate-pulse"
              >
                Rerunning Test...
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-400">
            Executes a new verification run (E2) and deterministically compares against the original
            failure (E1).
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Mode Selector */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-400">Mode:</span>
            <select
              data-testid="verification-mode-select"
              value={mode}
              disabled={isRunning}
              onChange={e => setMode(e.target.value as VerificationMode)}
              className="bg-slate-950 text-slate-200 border border-slate-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-cyan-500"
            >
              <option value="HISTORICAL">Historical Version (E1)</option>
              <option value="CURRENT">Current Test Version</option>
            </select>
          </div>

          {/* Max Attempts */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-400">Attempts:</span>
            <select
              data-testid="verification-max-attempts-select"
              value={maxAttempts}
              disabled={isRunning}
              onChange={e => setMaxAttempts(Number(e.target.value))}
              className="bg-slate-950 text-slate-200 border border-slate-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-cyan-500"
            >
              <option value={1}>1 attempt</option>
              <option value={2}>2 attempts</option>
              <option value={3}>3 attempts</option>
              <option value={5}>5 attempts</option>
            </select>
          </div>

          {isRunning ? (
            <button
              type="button"
              data-testid="cancel-verification-btn"
              onClick={handleCancelVerification}
              className="px-3 py-1.5 bg-rose-700 hover:bg-rose-600 text-white text-xs rounded font-medium transition-colors"
            >
              Cancel Rerun
            </button>
          ) : (
            <button
              type="button"
              data-testid="run-verification-btn"
              onClick={handleRunVerification}
              className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white text-xs rounded font-medium transition-colors flex items-center gap-1.5"
            >
              <span>▶</span> Run Verification
            </button>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          data-testid="verification-error-alert"
          className="p-3 bg-rose-950/60 border border-rose-800 rounded text-xs text-rose-300"
        >
          <strong>Verification Error:</strong> {error}
        </div>
      )}

      {/* Latest Outcome / Summary Banner */}
      {summary && (
        <div
          data-testid="verification-summary-banner"
          className={`p-3 rounded-lg border text-xs flex flex-wrap items-center justify-between gap-2 ${getOutcomeBadgeClass(
            summary.latestOutcome,
          )}`}
        >
          <div>
            <div className="font-semibold text-sm flex items-center gap-2">
              Outcome: <span data-testid="verification-outcome-badge">{summary.latestOutcome}</span>
            </div>
            <p className="text-[11px] opacity-90 mt-0.5">
              Attempts: {summary.totalAttempts} | Passes: {summary.factualMetrics.passes} | Same
              Failures: {summary.factualMetrics.sameFailures} | Different Failures:{' '}
              {summary.factualMetrics.differentFailures} | Blocked: {summary.factualMetrics.blocked}
            </p>
          </div>
          {summary.factualMetrics.environmentDrift && (
            <span
              data-testid="environment-drift-badge"
              className="px-2 py-0.5 bg-amber-900/60 text-amber-200 border border-amber-600 rounded text-[10px] font-medium"
            >
              Environment Drift Detected
            </span>
          )}
        </div>
      )}

      {/* Comparison Details for Selected Attempt */}
      {selectedAttempt ? (
        <div
          data-testid="verification-comparison-details"
          className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg space-y-3"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-slate-200">
              Attempt #{selectedAttempt.attemptNumber} Comparison (
              {selectedAttempt.verificationMode} Mode)
            </h4>
            <span
              data-testid="attempt-status-badge"
              className={`px-2 py-0.5 text-[10px] font-semibold border rounded ${getOutcomeBadgeClass(
                selectedAttempt.status,
              )}`}
            >
              {selectedAttempt.status}
            </span>
          </div>

          {/* Test Version Difference Notice */}
          {selectedAttempt.testVersionDifference && (
            <div
              data-testid="test-version-diff-notice"
              className="text-[11px] p-2 bg-blue-950/50 border border-blue-800/80 rounded text-blue-300"
            >
              ℹ️ {selectedAttempt.testVersionDifference}
            </div>
          )}

          {/* Blocker reason if blocked */}
          {selectedAttempt.blockerReason && (
            <div
              data-testid="blocker-reason-notice"
              className="text-[11px] p-2 bg-yellow-950/50 border border-yellow-800 rounded text-yellow-300"
            >
              ⚠️ <strong>Blocked:</strong> {selectedAttempt.blockerReason}
            </div>
          )}

          {/* Signature & Step Match Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            {/* Failure Signature Diff */}
            <div className="p-2 bg-slate-900 rounded border border-slate-800 space-y-1">
              <span className="font-semibold text-slate-400 text-[11px] block">
                Failure Signatures
              </span>
              <div className="text-[11px] font-mono">
                <span className="text-slate-400">Original (E1): </span>
                <span data-testid="original-signature" className="text-slate-200">
                  {selectedAttempt.originalFailureSignature || 'None'}
                </span>
              </div>
              <div className="text-[11px] font-mono">
                <span className="text-slate-400">Verification (E2): </span>
                <span data-testid="verification-signature" className="text-slate-200">
                  {selectedAttempt.verificationFailureSignature || 'None (Passed)'}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                Signature Match:{' '}
                <span
                  data-testid="signature-match-indicator"
                  className={
                    selectedAttempt.isSignatureMatch
                      ? 'text-rose-400 font-semibold'
                      : 'text-emerald-400'
                  }
                >
                  {selectedAttempt.isSignatureMatch ? 'YES (Matching Error)' : 'NO'}
                </span>
              </div>
            </div>

            {/* Failing Step Diff */}
            <div className="p-2 bg-slate-900 rounded border border-slate-800 space-y-1">
              <span className="font-semibold text-slate-400 text-[11px] block">
                Failing Step Correlation
              </span>
              <div className="text-[11px]">
                <span className="text-slate-400">Original Failed Step: </span>
                <span data-testid="original-failed-step" className="text-slate-200">
                  {selectedAttempt.originalFailedStepAction || 'None'}
                </span>
              </div>
              <div className="text-[11px]">
                <span className="text-slate-400">Verification Failed Step: </span>
                <span data-testid="verification-failed-step" className="text-slate-200">
                  {selectedAttempt.verificationFailedStepAction ||
                    (selectedAttempt.status === 'VERIFIED_FIXED' ? 'None (All Passed)' : 'None')}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                Environment Status:{' '}
                <span data-testid="env-equivalence-status" className="text-slate-200 font-mono">
                  {selectedAttempt.environmentEquivalence || 'UNKNOWN'}
                </span>
              </div>
            </div>
          </div>

          {/* Step Comparison Table */}
          {Array.isArray(selectedAttempt.stepComparisonJson) &&
            selectedAttempt.stepComparisonJson.length > 0 && (
              <div className="mt-2 space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 block">
                  Step Execution Comparison
                </span>
                <div className="max-h-48 overflow-y-auto border border-slate-800 rounded">
                  <table className="w-full text-[11px] text-left">
                    <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 sticky top-0">
                      <tr>
                        <th className="px-2 py-1">#</th>
                        <th className="px-2 py-1">Action</th>
                        <th className="px-2 py-1">Original (E1)</th>
                        <th className="px-2 py-1">Verification (E2)</th>
                        <th className="px-2 py-1">Match</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900">
                      {selectedAttempt.stepComparisonJson.map((step: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-900/50">
                          <td className="px-2 py-1 font-mono text-slate-500">
                            {step.stepIndex ?? idx + 1}
                          </td>
                          <td className="px-2 py-1 text-slate-300 max-w-[200px] truncate">
                            {step.action}
                          </td>
                          <td className="px-2 py-1">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] ${
                                step.originalStatus === 'PASSED'
                                  ? 'bg-emerald-950 text-emerald-400'
                                  : 'bg-rose-950 text-rose-400'
                              }`}
                            >
                              {step.originalStatus}
                            </span>
                          </td>
                          <td className="px-2 py-1">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] ${
                                step.verificationStatus === 'PASSED'
                                  ? 'bg-emerald-950 text-emerald-400'
                                  : 'bg-rose-950 text-rose-400'
                              }`}
                            >
                              {step.verificationStatus}
                            </span>
                          </td>
                          <td className="px-2 py-1 text-[10px]">
                            {step.isMatchingFailure ? (
                              <span className="text-rose-400 font-semibold">Same Failure</span>
                            ) : step.verificationStatus === 'PASSED' ? (
                              <span className="text-emerald-400">Fixed</span>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
        </div>
      ) : (
        !isLoadingAttempts &&
        !isRunning && (
          <div className="p-4 text-center text-xs text-slate-500 italic bg-slate-950/40 rounded border border-slate-900">
            No verification attempts have been run for this defect yet. Click "Run Verification"
            above to rerun the test.
          </div>
        )
      )}

      {/* Attempts History Table */}
      {attempts.length > 0 && (
        <div
          data-testid="verification-attempts-history"
          className="space-y-1 pt-2 border-t border-slate-800"
        >
          <div className="flex items-center justify-between text-xs">
            <h4 className="font-semibold text-slate-300">Attempt History ({attempts.length})</h4>
            <span className="text-[11px] text-slate-500">Click row to view comparison</span>
          </div>

          <div className="border border-slate-800 rounded overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-3 py-1.5">Attempt</th>
                  <th className="px-3 py-1.5">Mode</th>
                  <th className="px-3 py-1.5">Outcome</th>
                  <th className="px-3 py-1.5">Duration</th>
                  <th className="px-3 py-1.5">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {attempts.map(att => (
                  <tr
                    key={att.id}
                    data-testid={`attempt-row-${att.attemptNumber}`}
                    onClick={() => setSelectedAttempt(att)}
                    className={`cursor-pointer transition-colors ${
                      selectedAttempt?.id === att.id
                        ? 'bg-slate-800/80 font-medium'
                        : 'hover:bg-slate-900/50'
                    }`}
                  >
                    <td className="px-3 py-1.5 font-mono text-slate-300">#{att.attemptNumber}</td>
                    <td className="px-3 py-1.5 text-slate-400">{att.verificationMode}</td>
                    <td className="px-3 py-1.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${getOutcomeBadgeClass(
                          att.status,
                        )}`}
                      >
                        {att.status}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-slate-400 text-[11px]">
                      {att.executionDurationMs != null ? `${att.executionDurationMs}ms` : '-'}
                    </td>
                    <td className="px-3 py-1.5 text-slate-500 text-[11px]">
                      {new Date(att.createdAt).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
