/**
 * @file apps/desktop/src/renderer/features/failures/ClassificationInspectionPanel.tsx
 * Authoritative Failure Taxonomy & Deterministic Classification Panel (V6 Phase 77).
 * Displays primary deterministic category, subcategory, rule explanations,
 * supporting evidence, conflicting signals, versioning, and reclassification audit history.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  FailureClassificationDto,
  FailureCategory,
  ClassificationDecisionIntegrityDto,
} from '@ai-quality/contracts';

interface ClassificationInspectionPanelProps {
  readonly projectId: string;
  readonly failureCaseId: string;
}

export function ClassificationInspectionPanel({
  projectId,
  failureCaseId,
}: ClassificationInspectionPanelProps): React.JSX.Element {
  const [classification, setClassification] = useState<FailureClassificationDto | null>(null);
  const [integrity, setIntegrity] = useState<ClassificationDecisionIntegrityDto | null>(null);
  const [history, setHistory] = useState<readonly FailureClassificationDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isClassifying, setIsClassifying] = useState<boolean>(false);
  const [isEvaluatingIntegrity, setIsEvaluatingIntegrity] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reclassifyReason, setReclassifyReason] = useState<string>('');
  const [showReclassifyModal, setShowReclassifyModal] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  const activeCaseRef = useRef<string>(failureCaseId);
  const activeProjectRef = useRef<string>(projectId);

  useEffect(() => {
    activeCaseRef.current = failureCaseId;
    activeProjectRef.current = projectId;
    setClassification(null);
    setIntegrity(null);
    setHistory([]);
    setError(null);
    setShowReclassifyModal(false);
  }, [projectId, failureCaseId]);

  const loadClassificationData = useCallback(async () => {
    if (!window.desktop?.failures) {
      setIsLoading(false);
      return;
    }

    try {
      setError(null);
      const [currRes, histRes, integRes] = await Promise.all([
        window.desktop.failures.getClassification({ projectId, failureCaseId }),
        window.desktop.failures.listClassificationHistory({ projectId, failureCaseId }),
        window.desktop.failures.getDecisionIntegrity({ projectId, failureCaseId }),
      ]);

      if (activeCaseRef.current !== failureCaseId || activeProjectRef.current !== projectId) {
        return;
      }

      if (currRes.ok) {
        setClassification(currRes.data);
      }
      if (histRes.ok) {
        setHistory(histRes.data);
      }
      if (integRes?.ok) {
        setIntegrity(integRes.data);
      }
    } catch (err) {
      if (activeCaseRef.current === failureCaseId && activeProjectRef.current === projectId) {
        setError(err instanceof Error ? err.message : 'Failed to load classification data.');
      }
    } finally {
      if (activeCaseRef.current === failureCaseId && activeProjectRef.current === projectId) {
        setIsLoading(false);
      }
    }
  }, [projectId, failureCaseId]);

  useEffect(() => {
    setIsLoading(true);
    loadClassificationData();
  }, [loadClassificationData]);

  const handleEvaluateIntegrity = async (force: boolean = false) => {
    if (!window.desktop?.failures || isEvaluatingIntegrity) return;

    try {
      setIsEvaluatingIntegrity(true);
      setError(null);
      const res = force
        ? await window.desktop.failures.recomputeDecisionIntegrity({
            projectId,
            failureCaseId,
            classificationId: classification?.id,
          })
        : await window.desktop.failures.evaluateDecisionIntegrity({
            projectId,
            failureCaseId,
            classificationId: classification?.id,
          });

      if (activeCaseRef.current !== failureCaseId || activeProjectRef.current !== projectId) {
        return;
      }

      if (res.ok) {
        setIntegrity(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      if (activeCaseRef.current === failureCaseId && activeProjectRef.current === projectId) {
        setError(err instanceof Error ? err.message : 'Integrity evaluation failed.');
      }
    } finally {
      if (activeCaseRef.current === failureCaseId && activeProjectRef.current === projectId) {
        setIsEvaluatingIntegrity(false);
      }
    }
  };

  const handleRunClassification = async (force: boolean = false) => {
    if (!window.desktop?.failures || isClassifying) return;

    try {
      setIsClassifying(true);
      setError(null);

      const res = force
        ? await window.desktop.failures.reclassify({
            projectId,
            failureCaseId,
            reclassificationReason: reclassifyReason.trim() || 'Manual reclassification requested.',
          })
        : await window.desktop.failures.classify({
            projectId,
            failureCaseId,
          });

      if (activeCaseRef.current !== failureCaseId || activeProjectRef.current !== projectId) {
        return;
      }

      if (res.ok) {
        setClassification(res.data);
        setShowReclassifyModal(false);
        setReclassifyReason('');
        await loadClassificationData();
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      if (activeCaseRef.current === failureCaseId && activeProjectRef.current === projectId) {
        setError(err instanceof Error ? err.message : 'Classification request failed.');
      }
    } finally {
      if (activeCaseRef.current === failureCaseId && activeProjectRef.current === projectId) {
        setIsClassifying(false);
      }
    }
  };

  const getCategoryBadgeClass = (category: FailureCategory): string => {
    switch (category) {
      case 'APPLICATION_FAILURE':
        return 'bg-red-950/80 text-red-300 border-red-700/70';
      case 'AUTOMATION_FAILURE':
        return 'bg-purple-950/80 text-purple-300 border-purple-700/70';
      case 'ENVIRONMENT_FAILURE':
        return 'bg-amber-950/80 text-amber-300 border-amber-700/70';
      case 'TEST_DATA_FAILURE':
        return 'bg-orange-950/80 text-orange-300 border-orange-700/70';
      case 'REQUIREMENT_AMBIGUITY':
      case 'INVALID_TEST':
        return 'bg-sky-950/80 text-sky-300 border-sky-700/70';
      case 'BLOCKED_EXECUTION':
        return 'bg-slate-900 text-slate-300 border-slate-700';
      case 'INCONCLUSIVE':
        return 'bg-yellow-950/80 text-yellow-300 border-yellow-700/70';
      case 'UNKNOWN':
      default:
        return 'bg-zinc-900 text-zinc-400 border-zinc-700';
    }
  };

  const getSignalStrengthBadgeClass = (strength: string): string => {
    switch (strength) {
      case 'DEFINITIVE':
        return 'bg-emerald-950/70 text-emerald-300 border-emerald-800';
      case 'STRONG':
        return 'bg-blue-950/70 text-blue-300 border-blue-800';
      case 'INDICATIVE':
      default:
        return 'bg-slate-800/70 text-slate-300 border-slate-700';
    }
  };

  const getIntegrityBadgeClass = (state: string): string => {
    switch (state) {
      case 'VALID':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-700/70';
      case 'STALE':
        return 'bg-amber-950/80 text-amber-300 border-amber-700/70';
      case 'INVALIDATED':
        return 'bg-red-950/80 text-red-300 border-red-700/70';
      case 'CONFLICTED':
        return 'bg-rose-950/80 text-rose-300 border-rose-700/70';
      case 'INSUFFICIENT':
        return 'bg-yellow-950/80 text-yellow-300 border-yellow-700/70';
      case 'BLOCKED':
      default:
        return 'bg-slate-900 text-slate-300 border-slate-700';
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 bg-slate-900/60 border border-slate-800 rounded text-center text-xs text-slate-400">
        Loading deterministic failure classification...
      </div>
    );
  }

  return (
    <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-lg space-y-4 text-xs">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h3 className="font-semibold text-sm text-slate-200 flex items-center gap-2">
            🏷️ Deterministic Failure Classification
            <span className="text-[10px] text-slate-400 font-mono">
              (v{classification?.classifierVersion ?? '1.0.0'} / tax v
              {classification?.taxonomyVersion ?? '1.0.0'})
            </span>
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Objective taxonomy derived from execution evidence and reproduction facts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {classification && (
            <button
              onClick={() => setShowReclassifyModal(true)}
              disabled={isClassifying}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs border border-slate-700 transition"
            >
              Reclassify
            </button>
          )}
          {!classification && (
            <button
              onClick={() => handleRunClassification(false)}
              disabled={isClassifying}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium transition"
            >
              {isClassifying ? 'Classifying...' : 'Classify Now'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-2.5 bg-red-950/50 border border-red-800/80 rounded text-red-300 text-xs">
          ⚠️ {error}
        </div>
      )}

      {/* No Classification State */}
      {!classification && (
        <div className="p-6 bg-slate-950/50 border border-slate-800/80 rounded text-center space-y-2">
          <p className="text-slate-300 font-medium">
            No deterministic classification computed yet.
          </p>
          <p className="text-slate-500 text-[11px]">
            Run deterministic classification to evaluate factual execution evidence and Phase 76
            reproduction records against the rule precedence engine.
          </p>
          <button
            onClick={() => handleRunClassification(false)}
            disabled={isClassifying}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium text-xs transition"
          >
            {isClassifying ? 'Evaluating Rules...' : 'Run Deterministic Classification'}
          </button>
        </div>
      )}

      {/* Authoritative Classification Summary */}
      {classification && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Primary Category Card */}
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded space-y-2">
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                Primary Category
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-1 rounded text-xs font-bold border ${getCategoryBadgeClass(
                    classification.category,
                  )}`}
                >
                  {classification.category.replace(/_/g, ' ')}
                </span>
                {classification.subcategory && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                    {classification.subcategory.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-400">
                Primary Rule:{' '}
                <span className="font-mono text-indigo-300">{classification.primaryRuleId}</span>
              </div>
            </div>

            {/* Authoritative Status & Meta */}
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded space-y-2">
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                Classification Audit
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Status:</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  ✓ Authoritative Active
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Classified At:</span>
                <span className="text-slate-300 font-mono">
                  {new Date(classification.createdAt).toLocaleString()}
                </span>
              </div>
              {classification.reclassificationReason && (
                <div className="text-[11px] text-slate-300 pt-1 border-t border-slate-800/80">
                  <span className="text-slate-400">Reason: </span>
                  {classification.reclassificationReason}
                </div>
              )}
            </div>
          </div>

          {/* Matched Rules and Factual Explanations */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
              Matched Rules & Explanations ({classification.ruleExplanations.length})
            </h4>

            <div className="space-y-2">
              {classification.ruleExplanations.map(exp => (
                <div
                  key={exp.ruleId}
                  className="p-3 bg-slate-950/80 border border-slate-800 rounded space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-indigo-400">{exp.ruleId}</span>
                      <span className="text-slate-200 font-medium">{exp.ruleName}</span>
                    </div>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${getSignalStrengthBadgeClass(
                        exp.signalStrength,
                      )}`}
                    >
                      {exp.signalStrength}
                    </span>
                  </div>

                  <p className="text-slate-300 text-[11px] leading-relaxed">{exp.explanation}</p>

                  {exp.supportingEvidence.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-slate-900">
                      <div className="text-[10px] text-slate-400 font-medium">
                        Supporting Evidence:
                      </div>
                      <ul className="list-disc list-inside text-[11px] text-slate-400 space-y-0.5">
                        {exp.supportingEvidence.map((item, idx) => (
                          <li key={idx} className="truncate">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Conflicting Signals Warning (if any) */}
          {classification.conflictingRuleIds.length > 0 && (
            <div className="p-3 bg-amber-950/40 border border-amber-800/80 rounded space-y-1.5">
              <div className="font-bold text-amber-300 flex items-center gap-1.5 text-xs">
                ⚠️ Conflicting Secondary Signals Detected
              </div>
              <p className="text-slate-300 text-[11px]">
                The following rules from differing categories also matched evidence signals but were
                resolved via strict rule precedence:
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {classification.conflictingRuleIds.map(ruleId => (
                  <span
                    key={ruleId}
                    className="px-2 py-0.5 bg-amber-900/50 text-amber-200 border border-amber-700/60 rounded text-[10px] font-mono"
                  >
                    {ruleId}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* V6 Phase 78: Decision Integrity & Arbitration Card */}
          <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5 text-xs">
                  🛡️ Decision Integrity & Arbitration
                </span>
                {integrity && (
                  <span
                    className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${getIntegrityBadgeClass(
                      integrity.decisionState,
                    )}`}
                  >
                    {integrity.decisionState}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {integrity ? (
                  <button
                    onClick={() => handleEvaluateIntegrity(true)}
                    disabled={isEvaluatingIntegrity}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] border border-slate-700 transition"
                  >
                    {isEvaluatingIntegrity ? 'Recomputing...' : 'Recompute Integrity'}
                  </button>
                ) : (
                  <button
                    onClick={() => handleEvaluateIntegrity(false)}
                    disabled={isEvaluatingIntegrity}
                    className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] transition"
                  >
                    {isEvaluatingIntegrity ? 'Evaluating...' : 'Evaluate Integrity'}
                  </button>
                )}
              </div>
            </div>

            {integrity ? (
              <div className="space-y-2.5">
                {/* State Badges Grid */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2 bg-slate-900/60 border border-slate-800/80 rounded space-y-0.5">
                    <div className="text-[10px] text-slate-400">Freshness</div>
                    <div className="text-xs font-semibold text-slate-200">
                      {integrity.evidenceFreshnessState}
                    </div>
                  </div>
                  <div className="p-2 bg-slate-900/60 border border-slate-800/80 rounded space-y-0.5">
                    <div className="text-[10px] text-slate-400">Consistency</div>
                    <div className="text-xs font-semibold text-slate-200">
                      {integrity.consistencyState}
                    </div>
                  </div>
                  <div className="p-2 bg-slate-900/60 border border-slate-800/80 rounded space-y-0.5">
                    <div className="text-[10px] text-slate-400">Arbitration</div>
                    <div className="text-xs font-semibold text-slate-200">
                      {integrity.arbitrationState}
                    </div>
                  </div>
                </div>

                {/* Fingerprint & Snapshot Details */}
                <div className="space-y-1 bg-slate-900/40 p-2.5 rounded border border-slate-800/60 font-mono text-[10px]">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Fingerprint:</span>
                    <span
                      className="text-indigo-300 truncate max-w-[280px]"
                      title={integrity.decisionFingerprint}
                    >
                      {integrity.decisionFingerprint}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Evidence Pkg:</span>
                    <span
                      className="text-slate-300 truncate max-w-[280px]"
                      title={integrity.evidencePackageIdentity}
                    >
                      {integrity.evidencePackageIdentity.slice(0, 16)}... (v
                      {integrity.evidencePackageVersion})
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Repro Snapshot:</span>
                    <span
                      className="text-slate-300 truncate max-w-[280px]"
                      title={integrity.reproductionSnapshotIdentity}
                    >
                      {integrity.reproductionSnapshotIdentity.slice(0, 16)}... (v
                      {integrity.reproductionSummaryVersion})
                    </span>
                  </div>
                </div>

                {/* Blocking Reasons (if any) */}
                {integrity.blockingReasons.length > 0 && (
                  <div className="p-2 bg-red-950/30 border border-red-800/60 rounded space-y-1">
                    <div className="text-[11px] font-bold text-red-300">Blocking Reasons:</div>
                    <ul className="list-disc list-inside space-y-0.5 text-[10px] text-red-200">
                      {integrity.blockingReasons.map((reason, idx) => (
                        <li key={idx}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Warning Reasons (if any) */}
                {integrity.warningReasons.length > 0 && (
                  <div className="p-2 bg-amber-950/30 border border-amber-800/60 rounded space-y-1">
                    <div className="text-[11px] font-bold text-amber-300">Warning Reasons:</div>
                    <ul className="list-disc list-inside space-y-0.5 text-[10px] text-amber-200">
                      {integrity.warningReasons.map((warn, idx) => (
                        <li key={idx}>{warn}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Material Changes (if any) */}
                {integrity.materialChangesJson && integrity.materialChangesJson.length > 0 && (
                  <div className="p-2 bg-indigo-950/30 border border-indigo-800/60 rounded space-y-1">
                    <div className="text-[11px] font-bold text-indigo-300">
                      Material Changes Since Classification:
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-[10px] text-indigo-200">
                      {integrity.materialChangesJson.map((change, idx) => (
                        <li key={idx}>{change}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-slate-500 text-[11px]">
                No decision integrity evaluation recorded yet for this classification.
              </div>
            )}
          </div>

          {/* Reclassification History Drawer Toggle */}
          {history.length > 1 && (
            <div className="pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowHistory(prev => !prev)}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition"
              >
                {showHistory ? '▼ Hide' : '▶ Show'} Classification History Revisions (
                {history.length - 1} superseded)
              </button>

              {showHistory && (
                <div className="mt-2 space-y-1.5">
                  {history
                    .filter(h => h.id !== classification.id)
                    .map(item => (
                      <div
                        key={item.id}
                        className="p-2 bg-slate-950/40 border border-slate-800/80 rounded text-[11px] flex items-center justify-between"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-300">
                              {item.category.replace(/_/g, ' ')}
                            </span>
                            <span className="text-slate-500 font-mono text-[10px]">
                              {item.primaryRuleId}
                            </span>
                          </div>
                          {item.reclassificationReason && (
                            <div className="text-slate-400 text-[10px]">
                              Reason: {item.reclassificationReason}
                            </div>
                          )}
                        </div>
                        <span className="text-slate-500 font-mono text-[10px]">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Reclassification Modal */}
      {showReclassifyModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-5 max-w-md w-full space-y-4">
            <h4 className="font-bold text-slate-200 text-sm">Reclassify Failure Case</h4>
            <p className="text-slate-400 text-xs">
              Re-evaluates the failure case against all deterministic rules. A new authoritative
              classification will be recorded and the prior revision will be preserved in the audit
              trail.
            </p>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-300">
                Reason for Reclassification (Mandatory)
              </label>
              <textarea
                value={reclassifyReason}
                onChange={e => setReclassifyReason(e.target.value)}
                placeholder="e.g. New reproduction attempt completed; environment reached verified state..."
                className="w-full h-20 p-2 bg-slate-950 border border-slate-700 rounded text-slate-200 text-xs focus:border-indigo-500 focus:outline-none resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setShowReclassifyModal(false);
                  setReclassifyReason('');
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRunClassification(true)}
                disabled={!reclassifyReason.trim() || isClassifying}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded text-xs font-medium transition"
              >
                {isClassifying ? 'Reclassifying...' : 'Confirm Reclassification'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
