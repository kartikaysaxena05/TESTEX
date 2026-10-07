/**
 * @file apps/desktop/src/renderer/features/failures/DomainSeparationInspectionPanel.tsx
 * Failure Domain Separation Inspection Panel (V6 Phase 80).
 * Displays authoritative failure domain (Application Defect Candidate vs
 * Automation / Test-Data / Environment failure), exclusion reasons,
 * conflicting signals, rules applied, and re-evaluation audit controls.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { FailureDomainSeparationDto, FailureDomain } from '@ai-quality/contracts';

interface DomainSeparationInspectionPanelProps {
  readonly projectId: string;
  readonly failureCaseId: string;
}

const DOMAIN_BADGE_STYLES: Record<
  FailureDomain,
  { bg: string; text: string; border: string; label: string; icon: string }
> = {
  APPLICATION_DEFECT_CANDIDATE: {
    bg: 'bg-rose-500/15',
    text: 'text-rose-400',
    border: 'border-rose-500/40',
    label: 'Application Defect Candidate',
    icon: '🐛',
  },
  AUTOMATION_FAILURE: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    label: 'Automation Failure',
    icon: '⚙️',
  },
  TEST_DATA_FAILURE: {
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-400',
    border: 'border-indigo-500/30',
    label: 'Test-Data Failure',
    icon: '📦',
  },
  ENVIRONMENT_FAILURE: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-400',
    border: 'border-orange-500/30',
    label: 'Environment Failure',
    icon: '🌐',
  },
  BLOCKED: {
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    border: 'border-red-500/30',
    label: 'Blocked',
    icon: '🚫',
  },
  INCONCLUSIVE: {
    bg: 'bg-slate-500/10',
    text: 'text-slate-400',
    border: 'border-slate-500/30',
    label: 'Inconclusive',
    icon: '⚖️',
  },
  UNKNOWN: {
    bg: 'bg-zinc-500/10',
    text: 'text-zinc-400',
    border: 'border-zinc-500/30',
    label: 'Unknown (Insufficient Evidence)',
    icon: '❓',
  },
};

export function DomainSeparationInspectionPanel({
  projectId,
  failureCaseId,
}: DomainSeparationInspectionPanelProps): React.JSX.Element {
  const [separation, setSeparation] = useState<FailureDomainSeparationDto | null>(null);
  const [history, setHistory] = useState<readonly FailureDomainSeparationDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [isReevaluating, setIsReevaluating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showReevaluateModal, setShowReevaluateModal] = useState<boolean>(false);
  const [reevaluateReason, setReevaluateReason] = useState<string>('');
  const [showHistory, setShowHistory] = useState<boolean>(false);

  // Protect against project / failure case switch races
  const activeProjectIdRef = useRef<string>(projectId);
  const activeFailureCaseIdRef = useRef<string>(failureCaseId);

  useEffect(() => {
    activeProjectIdRef.current = projectId;
    activeFailureCaseIdRef.current = failureCaseId;
  }, [projectId, failureCaseId]);

  const loadSeparation = useCallback(async () => {
    if (!window.desktop?.failures) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await window.desktop.failures.getDomainSeparation({
        projectId,
        failureCaseId,
      });

      if (
        activeProjectIdRef.current !== projectId ||
        activeFailureCaseIdRef.current !== failureCaseId
      ) {
        return;
      }

      if (res.ok) {
        setSeparation(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err: unknown) {
      if (
        activeProjectIdRef.current !== projectId ||
        activeFailureCaseIdRef.current !== failureCaseId
      ) {
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [projectId, failureCaseId]);

  const loadHistory = useCallback(async () => {
    if (!window.desktop?.failures) {
      return;
    }
    try {
      const res = await window.desktop.failures.listDomainSeparationHistory({
        projectId,
        failureCaseId,
      });
      if (
        activeProjectIdRef.current === projectId &&
        activeFailureCaseIdRef.current === failureCaseId &&
        res.ok
      ) {
        setHistory(res.data);
      }
    } catch {
      // Non-critical audit history failure
    }
  }, [projectId, failureCaseId]);

  useEffect(() => {
    void loadSeparation();
    void loadHistory();
  }, [loadSeparation, loadHistory]);

  const handleSeparate = async () => {
    if (!window.desktop?.failures || isEvaluating) return;
    setIsEvaluating(true);
    setError(null);
    try {
      const res = await window.desktop.failures.separateFailureDomain({
        projectId,
        failureCaseId,
      });
      if (
        activeProjectIdRef.current === projectId &&
        activeFailureCaseIdRef.current === failureCaseId
      ) {
        if (res.ok) {
          setSeparation(res.data);
          void loadHistory();
        } else {
          setError(res.error.message);
        }
      }
    } catch (err: unknown) {
      if (
        activeProjectIdRef.current === projectId &&
        activeFailureCaseIdRef.current === failureCaseId
      ) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleReevaluate = async () => {
    if (!window.desktop?.failures || isReevaluating) return;
    if (!reevaluateReason.trim()) {
      setError('Please specify a re-evaluation reason.');
      return;
    }

    setIsReevaluating(true);
    setError(null);
    try {
      const res = await window.desktop.failures.reevaluateDomainSeparation({
        projectId,
        failureCaseId,
        reevaluationReason: reevaluateReason.trim(),
      });
      if (
        activeProjectIdRef.current === projectId &&
        activeFailureCaseIdRef.current === failureCaseId
      ) {
        if (res.ok) {
          setSeparation(res.data);
          setShowReevaluateModal(false);
          setReevaluateReason('');
          void loadHistory();
        } else {
          setError(res.error.message);
        }
      }
    } catch (err: unknown) {
      if (
        activeProjectIdRef.current === projectId &&
        activeFailureCaseIdRef.current === failureCaseId
      ) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setIsReevaluating(false);
    }
  };

  if (isLoading) {
    return (
      <div
        data-testid="domain-separation-loading"
        className="p-6 text-sm text-slate-400 flex items-center gap-2"
      >
        <span className="inline-block animate-spin">⌛</span> Loading failure domain separation...
      </div>
    );
  }

  const badge = separation ? DOMAIN_BADGE_STYLES[separation.domain] : DOMAIN_BADGE_STYLES.UNKNOWN;

  return (
    <div data-testid="domain-separation-panel" className="p-6 space-y-6 text-slate-200">
      {/* Header / Actions */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <span>🛡️</span> Failure Domain Separation
            <span className="text-xs font-normal text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
              Phase 80
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Exclusion-backed attribution distinguishing application defects from automation,
            test-data, and environment failures.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {separation ? (
            <button
              data-testid="domain-reevaluate-button"
              onClick={() => setShowReevaluateModal(true)}
              disabled={isReevaluating || isEvaluating}
              className="px-3 py-1.5 text-xs font-medium rounded bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 transition disabled:opacity-50"
            >
              {isReevaluating ? 'Re-evaluating...' : 'Re-evaluate Domain'}
            </button>
          ) : (
            <button
              data-testid="domain-separate-button"
              onClick={handleSeparate}
              disabled={isEvaluating}
              className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {isEvaluating ? (
                <>
                  <span className="animate-spin">⌛</span> Separating...
                </>
              ) : (
                'Determine Failure Domain'
              )}
            </button>
          )}
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div
          data-testid="domain-separation-error"
          className="p-3 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400"
        >
          {error}
        </div>
      )}

      {/* Real-time Staleness Warning */}
      {separation?.isStale && (
        <div
          data-testid="domain-staleness-warning"
          className="p-3 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-300 flex items-center justify-between"
        >
          <div>
            <span className="font-semibold">⚠️ Domain Decision Stale:</span> Newer execution,
            reproduction, or classification data has been recorded since this analysis was
            evaluated.
          </div>
          <button
            onClick={() => setShowReevaluateModal(true)}
            className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded text-amber-200 text-xs transition"
          >
            Re-evaluate Now
          </button>
        </div>
      )}

      {/* Empty State */}
      {!separation ? (
        <div className="p-8 text-center border border-dashed border-slate-800 rounded-lg space-y-3">
          <div className="text-3xl">🛡️</div>
          <div className="text-sm font-medium text-slate-300">No Domain Separation Evaluated</div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Execute failure domain separation to evaluate whether this test failure is attributable
            to an actual application defect or external test automation / environment factors.
          </p>
          <button
            data-testid="domain-initial-trigger-button"
            onClick={handleSeparate}
            disabled={isEvaluating}
            className="px-4 py-2 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-500 transition disabled:opacity-50"
          >
            {isEvaluating ? 'Evaluating Evidence...' : 'Run Failure Domain Separation'}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Top Domain Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-lg md:col-span-2 space-y-2">
              <div className="text-xs font-medium text-slate-400">Authoritative Failure Domain</div>
              <div className="flex items-center gap-3">
                <span
                  data-testid="domain-badge"
                  className={`inline-flex items-center gap-1.5 px-3 py-1 text-sm font-semibold rounded-full border ${badge.bg} ${badge.text} ${badge.border}`}
                >
                  <span>{badge.icon}</span>
                  <span>{badge.label}</span>
                </span>
                {separation.domainSubreason && (
                  <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                    {separation.domainSubreason}
                  </span>
                )}
              </div>
              <p data-testid="domain-primary-rationale" className="text-xs text-slate-300 pt-1">
                {separation.primaryRationale}
              </p>
            </div>

            <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-lg space-y-2">
              <div className="text-xs font-medium text-slate-400">Analysis Digest & Rules</div>
              <div className="text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Rules Engine:</span>
                  <span className="font-mono text-slate-300">
                    v{separation.separationRulesVersion}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Re-evaluations:</span>
                  <span className="text-slate-300">{separation.reevaluationCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Evaluated:</span>
                  <span className="text-slate-300">
                    {new Date(separation.evaluatedAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Conflicting signals alert if any */}
          {separation.conflictingSignals && separation.conflictingSignals.length > 0 && (
            <div
              data-testid="domain-conflicts-alert"
              className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-lg space-y-2"
            >
              <div className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
                <span>⚠️</span> Conflicting Domain Signals Detected
              </div>
              <ul className="text-xs text-rose-300/90 list-disc list-inside space-y-1">
                {separation.conflictingSignals.map((conflict, i) => (
                  <li key={i}>{conflict}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Why This Domain Won */}
          <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-lg space-y-2">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
              Why This Domain (Decision Explanation)
            </h3>
            <pre
              data-testid="domain-decision-explanation"
              className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed bg-slate-950/60 p-3 rounded border border-slate-800/80"
            >
              {separation.decisionExplanation}
            </pre>
          </div>

          {/* Excluded Domains Matrix */}
          <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-lg space-y-3">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
              Excluded Alternative Domains (Exclusion-First Proof)
            </h3>
            <div className="overflow-x-auto">
              <table
                data-testid="excluded-domains-table"
                className="w-full text-left text-xs border border-slate-800"
              >
                <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-2.5 font-medium">Domain</th>
                    <th className="p-2.5 font-medium">Status</th>
                    <th className="p-2.5 font-medium">Exclusion Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {[
                    'AUTOMATION_FAILURE',
                    'TEST_DATA_FAILURE',
                    'ENVIRONMENT_FAILURE',
                    'APPLICATION_DEFECT_CANDIDATE',
                  ]
                    .filter(d => d !== separation.domain)
                    .map(d => {
                      const isExcluded = separation.excludedDomains.includes(d as FailureDomain);
                      const reason =
                        separation.exclusionReasons[d] || 'Excluded by deterministic priority.';
                      return (
                        <tr key={d} className="hover:bg-slate-800/30">
                          <td className="p-2.5 text-slate-300 font-semibold">{d}</td>
                          <td className="p-2.5">
                            {isExcluded ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                EXCLUDED
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400">
                                N/A
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-slate-400 font-sans">{reason}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cryptographic Fingerprint */}
          <div className="p-3 bg-slate-950/40 border border-slate-800/60 rounded flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono">
              Fingerprint:{' '}
              <span className="text-slate-300">{separation.separationFingerprint}</span>
            </span>
            <span className="text-slate-500">SHA-256 (Canonical & Redacted)</span>
          </div>

          {/* Audit History Toggle */}
          {history.length > 1 && (
            <div className="pt-2">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="text-xs text-blue-400 hover:text-blue-300 transition flex items-center gap-1"
              >
                <span>{showHistory ? '▼' : '▶'}</span>
                <span>Audit History ({history.length} evaluation records)</span>
              </button>

              {showHistory && (
                <div className="mt-3 space-y-2">
                  {history.map((record, index) => (
                    <div
                      key={record.id}
                      className="p-3 bg-slate-900/60 border border-slate-800 rounded text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-200">
                          #{history.length - index}: {record.domain}
                        </span>
                        <span className="text-slate-500">
                          {new Date(record.evaluatedAt).toLocaleString()}
                        </span>
                      </div>
                      {record.reevaluationReason && (
                        <div className="text-slate-400">
                          <span className="font-medium text-slate-500">Reason:</span>{' '}
                          {record.reevaluationReason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Re-evaluation Modal */}
      {showReevaluateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg max-w-md w-full p-5 space-y-4 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <span>🔄</span> Re-evaluate Failure Domain Separation
            </h3>
            <p className="text-xs text-slate-400">
              Please state why this domain decision is being re-evaluated. The explanation will be
              preserved in the audit history.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Re-evaluation Rationale
              </label>
              <textarea
                value={reevaluateReason}
                onChange={e => setReevaluateReason(e.target.value)}
                placeholder="e.g. Infrastructure network instability fixed; re-evaluating application assertion mismatch"
                rows={3}
                className="w-full text-xs bg-slate-950 border border-slate-700 rounded p-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowReevaluateModal(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleReevaluate}
                disabled={isReevaluating || !reevaluateReason.trim()}
                className="px-3 py-1.5 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-500 transition disabled:opacity-50"
              >
                {isReevaluating ? 'Evaluating...' : 'Confirm Re-evaluation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
