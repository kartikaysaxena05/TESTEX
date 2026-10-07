/**
 * @file apps/desktop/src/renderer/features/failures/ImpactAssessmentInspectionPanel.tsx
 * Severity, Priority & Impact Intelligence Inspection Panel (V6 Phase 84).
 * Displays independent technical severity, operational priority, release recommendation,
 * 9 impact dimensions, supporting evidence, conflicting signals, and audit lineage.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  FailureImpactAssessmentDto,
  DefectSeverityDto,
  DefectPriorityDto,
  ReleaseRecommendationDto,
} from '@ai-quality/contracts';

interface ImpactAssessmentInspectionPanelProps {
  readonly projectId: string;
  readonly failureCaseId: string;
}

const SEVERITY_STYLES: Record<
  DefectSeverityDto,
  { bg: string; text: string; border: string; label: string; icon: string }
> = {
  CRITICAL: {
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    border: 'border-rose-500/30',
    label: 'Critical Severity',
    icon: '🔥',
  },
  HIGH: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-400',
    border: 'border-orange-500/30',
    label: 'High Severity',
    icon: '⚠️',
  },
  MEDIUM: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    label: 'Medium Severity',
    icon: '⚡',
  },
  LOW: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    label: 'Low Severity',
    icon: '🟢',
  },
  NOT_APPLICABLE: {
    bg: 'bg-slate-500/10',
    text: 'text-slate-400',
    border: 'border-slate-500/30',
    label: 'Not Applicable (Operational)',
    icon: '⚪',
  },
  UNKNOWN: {
    bg: 'bg-zinc-500/10',
    text: 'text-zinc-400',
    border: 'border-zinc-500/30',
    label: 'Unknown Severity',
    icon: '❔',
  },
};

const PRIORITY_STYLES: Record<
  DefectPriorityDto,
  { bg: string; text: string; border: string; label: string; icon: string }
> = {
  P0_IMMEDIATE: {
    bg: 'bg-red-500/15',
    text: 'text-red-400 font-bold',
    border: 'border-red-500/40',
    label: 'P0 — Immediate Blocker',
    icon: '🚨',
  },
  P1_URGENT: {
    bg: 'bg-orange-500/15',
    text: 'text-orange-300 font-semibold',
    border: 'border-orange-500/30',
    label: 'P1 — Urgent Release Fix',
    icon: '🟠',
  },
  P2_NORMAL: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    label: 'P2 — Normal Fix Queue',
    icon: '🔵',
  },
  P3_LOW: {
    bg: 'bg-slate-500/10',
    text: 'text-slate-400',
    border: 'border-slate-500/30',
    label: 'P3 — Low Priority Backlog',
    icon: '⚪',
  },
  UNKNOWN: {
    bg: 'bg-zinc-500/10',
    text: 'text-zinc-400',
    border: 'border-zinc-500/30',
    label: 'Unknown Priority',
    icon: '❔',
  },
};

const RELEASE_STYLES: Record<
  ReleaseRecommendationDto,
  { bg: string; text: string; border: string; label: string; icon: string }
> = {
  BLOCK_RELEASE: {
    bg: 'bg-red-500/20',
    text: 'text-red-300',
    border: 'border-red-500/50',
    label: 'BLOCK RELEASE',
    icon: '⛔',
  },
  REVIEW_REQUIRED: {
    bg: 'bg-amber-500/20',
    text: 'text-amber-300',
    border: 'border-amber-500/50',
    label: 'REVIEW REQUIRED',
    icon: '⚠️',
  },
  NON_BLOCKING: {
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-300',
    border: 'border-emerald-500/50',
    label: 'NON-BLOCKING',
    icon: '✅',
  },
  UNKNOWN: {
    bg: 'bg-slate-500/20',
    text: 'text-slate-300',
    border: 'border-slate-500/50',
    label: 'UNKNOWN RELEASE IMPACT',
    icon: '❔',
  },
};

export const ImpactAssessmentInspectionPanel: React.FC<ImpactAssessmentInspectionPanelProps> = ({
  projectId,
  failureCaseId,
}) => {
  const [assessment, setAssessment] = useState<FailureImpactAssessmentDto | null>(null);
  const [history, setHistory] = useState<readonly FailureImpactAssessmentDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAssessing, setIsAssessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showReassessModal, setShowReassessModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [reassessReason, setReassessReason] = useState('');
  const [releaseBlockingOverride, setReleaseBlockingOverride] = useState<boolean | null>(null);
  const [environmentOverride, setEnvironmentOverride] = useState('');

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadAssessment = useCallback(async () => {
    if (!window.desktop?.failures?.getImpactAssessment) {
      setErrorMessage('Desktop bridge not available.');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage(null);
      const res = await window.desktop.failures.getImpactAssessment({ projectId, failureCaseId });
      if (!isMountedRef.current) return;

      if (res.ok) {
        setAssessment(res.data);
      } else {
        setErrorMessage(res.error.message);
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [projectId, failureCaseId]);

  useEffect(() => {
    loadAssessment();
  }, [loadAssessment]);

  const handleAssess = async () => {
    if (!window.desktop?.failures?.assessImpact) return;
    try {
      setIsAssessing(true);
      setErrorMessage(null);
      const res = await window.desktop.failures.assessImpact({
        projectId,
        failureCaseId,
        environmentOverride: environmentOverride.trim() || undefined,
        releaseBlockingOverride: releaseBlockingOverride ?? undefined,
      });
      if (!isMountedRef.current) return;

      if (res.ok) {
        setAssessment(res.data);
      } else {
        setErrorMessage(res.error.message);
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      if (isMountedRef.current) {
        setIsAssessing(false);
      }
    }
  };

  const handleReassess = async () => {
    if (!window.desktop?.failures?.reassessImpact) return;
    if (!reassessReason.trim()) {
      alert('Please enter a rationale for re-assessment.');
      return;
    }

    try {
      setIsAssessing(true);
      setErrorMessage(null);
      const res = await window.desktop.failures.reassessImpact({
        projectId,
        failureCaseId,
        reassessmentReason: reassessReason.trim(),
        environmentOverride: environmentOverride.trim() || undefined,
        releaseBlockingOverride: releaseBlockingOverride ?? undefined,
      });
      if (!isMountedRef.current) return;

      if (res.ok) {
        setAssessment(res.data);
        setShowReassessModal(false);
        setReassessReason('');
      } else {
        setErrorMessage(res.error.message);
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      if (isMountedRef.current) {
        setIsAssessing(false);
      }
    }
  };

  const handleLoadHistory = async () => {
    if (!window.desktop?.failures?.listImpactHistory) return;
    try {
      const res = await window.desktop.failures.listImpactHistory({ projectId, failureCaseId });
      if (res.ok) {
        setHistory(res.data);
        setShowHistoryModal(true);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-400 space-y-3">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Loading Severity & Impact assessment...</span>
      </div>
    );
  }

  if (errorMessage && !assessment) {
    return (
      <div className="p-6 bg-red-950/20 border border-red-500/30 rounded-lg text-red-300 space-y-3">
        <div className="flex items-center space-x-2 font-semibold text-red-400">
          <span>⚠️</span>
          <span>Failed to Load Impact Assessment</span>
        </div>
        <p className="text-sm font-mono bg-red-950/40 p-3 rounded border border-red-500/20">
          {errorMessage}
        </p>
        <button
          onClick={loadAssessment}
          className="px-3 py-1.5 bg-red-800/40 hover:bg-red-800/60 text-red-200 text-xs rounded border border-red-500/40 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="p-8 border border-dashed border-slate-700/60 rounded-xl text-center space-y-4 bg-slate-900/20">
        <div className="text-3xl">💥</div>
        <div>
          <h4 className="text-sm font-semibold text-slate-200">No Severity & Impact Assessment</h4>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Analyze technical defect severity, operational resolution priority, and 9-dimensional
            impact factors.
          </p>
        </div>
        <button
          onClick={handleAssess}
          disabled={isAssessing}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow transition inline-flex items-center space-x-2"
        >
          {isAssessing ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Assessing Impact...</span>
            </>
          ) : (
            <>
              <span>⚡</span>
              <span>Assess Severity, Priority & Impact (Phase 84)</span>
            </>
          )}
        </button>
      </div>
    );
  }

  const sevStyle = SEVERITY_STYLES[assessment.severity] || SEVERITY_STYLES.UNKNOWN;
  const priStyle = PRIORITY_STYLES[assessment.priority] || PRIORITY_STYLES.UNKNOWN;
  const relStyle = RELEASE_STYLES[assessment.releaseRecommendation] || RELEASE_STYLES.UNKNOWN;

  return (
    <div className="space-y-6" data-testid="impact-inspection-panel">
      {/* Staleness Notification */}
      {assessment.isStale && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between text-amber-300 text-xs">
          <div className="flex items-center space-x-2">
            <span>⚠️</span>
            <span>
              <strong>Assessment is Stale:</strong>{' '}
              {assessment.stalenessReason ?? 'Upstream failure telemetry changed.'}
            </span>
          </div>
          <button
            onClick={() => setShowReassessModal(true)}
            className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded font-medium transition"
          >
            Re-assess Now
          </button>
        </div>
      )}

      {/* Top Banner: Severity vs Priority Separation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Severity */}
        <div className={`p-4 rounded-xl border ${sevStyle.bg} ${sevStyle.border} space-y-2`}>
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
              Defect Severity
            </span>
            <span className="text-lg">{sevStyle.icon}</span>
          </div>
          <div className={`text-xl font-bold ${sevStyle.text}`}>{sevStyle.label}</div>
          <div className="text-xs text-slate-300">{assessment.severityRationale}</div>
          <div className="text-[10px] font-mono text-slate-400 pt-1">
            Rule: {assessment.severityRuleId}
          </div>
        </div>

        {/* Priority */}
        <div className={`p-4 rounded-xl border ${priStyle.bg} ${priStyle.border} space-y-2`}>
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
              Resolution Priority
            </span>
            <span className="text-lg">{priStyle.icon}</span>
          </div>
          <div className={`text-xl font-bold ${priStyle.text}`}>{priStyle.label}</div>
          <div className="text-xs text-slate-300">{assessment.priorityRationale}</div>
          <div className="text-[10px] font-mono text-slate-400 pt-1">
            Rule: {assessment.priorityRuleId}
          </div>
        </div>

        {/* Release Recommendation */}
        <div className={`p-4 rounded-xl border ${relStyle.bg} ${relStyle.border} space-y-2`}>
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
              Release Impact
            </span>
            <span className="text-lg">{relStyle.icon}</span>
          </div>
          <div className={`text-xl font-bold ${relStyle.text}`}>{relStyle.label}</div>
          <div className="text-xs text-slate-300">{assessment.releaseRecommendationRationale}</div>
          <div className="text-[10px] text-slate-400 pt-1">
            Criticality: {assessment.businessCriticality}
          </div>
        </div>
      </div>

      {/* 9 Impact Dimensions Grid */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
        <h4 className="text-xs uppercase tracking-wider text-slate-400 font-semibold flex items-center space-x-2">
          <span>📐</span>
          <span>9-Dimensional Impact Evaluation</span>
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* 1. User Impact */}
          <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-800/80 space-y-1">
            <span className="text-slate-400 font-medium">User Impact Scope</span>
            <div className="font-semibold text-slate-200">{assessment.userImpact}</div>
            <p className="text-slate-400 text-[11px]">
              {assessment.userImpactDetails || 'No scope details recorded.'}
            </p>
          </div>

          {/* 2. Data Impact */}
          <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-800/80 space-y-1">
            <span className="text-slate-400 font-medium">Data Integrity Impact</span>
            <div className="font-semibold text-amber-300">{assessment.dataImpact}</div>
            <p className="text-slate-400 text-[11px]">
              {assessment.dataImpactDetails || 'No data mutations corrupted.'}
            </p>
          </div>

          {/* 3. Security Impact */}
          <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-800/80 space-y-1">
            <span className="text-slate-400 font-medium">Security & Privacy</span>
            <div className="font-semibold text-rose-300">{assessment.securityImpact}</div>
            <p className="text-slate-400 text-[11px]">
              {assessment.securityImpactDetails || 'No security bypass identified.'}
            </p>
          </div>

          {/* 4. Availability Impact */}
          <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-800/80 space-y-1">
            <span className="text-slate-400 font-medium">Availability Impact</span>
            <div className="font-semibold text-sky-300">{assessment.availabilityImpact}</div>
            <p className="text-slate-400 text-[11px]">{assessment.functionalImpact}</p>
          </div>

          {/* 5. Blast Radius */}
          <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-800/80 space-y-1">
            <span className="text-slate-400 font-medium">Blast Radius</span>
            <div className="font-semibold text-purple-300">{assessment.blastRadius}</div>
            <p className="text-slate-400 text-[11px]">{assessment.integrationImpact}</p>
          </div>

          {/* 6. Workaround Status */}
          <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-800/80 space-y-1">
            <span className="text-slate-400 font-medium">Workaround Viability</span>
            <div className="font-semibold text-teal-300">{assessment.workaroundStatus}</div>
            <p className="text-slate-400 text-[11px]">
              {assessment.workaroundDetails || 'Standard workflow operative.'}
            </p>
          </div>
        </div>

        {/* Business Impact Summary */}
        <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/60 text-xs space-y-1">
          <span className="text-slate-400 font-medium">Business / Process Impact</span>
          <p className="text-slate-300">{assessment.businessImpact}</p>
        </div>
      </div>

      {/* Primary Reasons & Supporting Evidence */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Severity & Priority Reasons */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
          <h4 className="text-xs uppercase tracking-wider text-slate-400 font-semibold flex items-center space-x-2">
            <span>📋</span>
            <span>Deterministic Rule Justifications</span>
          </h4>
          <div className="space-y-2 text-xs">
            <div>
              <span className="text-slate-400 font-medium block mb-1">Severity Determinants:</span>
              <ul className="list-disc list-inside space-y-1 text-slate-300 pl-1">
                {assessment.severityReasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
            <div className="pt-2 border-t border-slate-800">
              <span className="text-slate-400 font-medium block mb-1">Priority Determinants:</span>
              <ul className="list-disc list-inside space-y-1 text-slate-300 pl-1">
                {assessment.priorityReasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Supporting Evidence Items */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
          <h4 className="text-xs uppercase tracking-wider text-slate-400 font-semibold flex items-center space-x-2">
            <span>🔍</span>
            <span>Supporting Diagnostic Evidence</span>
          </h4>
          {assessment.supportingEvidence.length === 0 ? (
            <div className="text-xs text-slate-500 italic">
              No structured evidence items recorded.
            </div>
          ) : (
            <div className="space-y-2 text-xs">
              {assessment.supportingEvidence.map((ev, i) => (
                <div
                  key={i}
                  className="p-2 bg-slate-950/40 rounded border border-slate-800/80 space-y-1"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-mono text-indigo-400">{ev.sourceType}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
                      {ev.significance}
                    </span>
                  </div>
                  <div className="text-slate-300">{ev.fact}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Conflicting Signals & Unknown Factors */}
      {(assessment.conflictingSignals.length > 0 || assessment.unknownFactors.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {assessment.conflictingSignals.length > 0 && (
            <div className="p-4 bg-amber-950/20 border border-amber-500/30 rounded-xl space-y-2 text-xs">
              <div className="flex items-center space-x-2 text-amber-400 font-semibold">
                <span>⚡</span>
                <span>Conflicting Signals Detected</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-amber-200/90 pl-1">
                {assessment.conflictingSignals.map((sig, i) => (
                  <li key={i}>{sig}</li>
                ))}
              </ul>
            </div>
          )}
          {assessment.unknownFactors.length > 0 && (
            <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl space-y-2 text-xs">
              <div className="flex items-center space-x-2 text-slate-400 font-semibold">
                <span>❔</span>
                <span>Missing / Unknown Factors</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
                {assessment.unknownFactors.map((uf, i) => (
                  <li key={i}>{uf}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Actions & Provenance Audit Footer */}
      <div className="flex flex-wrap items-center justify-between pt-4 border-t border-slate-800 text-xs text-slate-500">
        <div className="flex items-center space-x-3">
          <span>Assessed: {new Date(assessment.assessedAt).toLocaleString()}</span>
          <span>•</span>
          <span className="font-mono text-[11px]">
            Fingerprint: {assessment.assessmentFingerprint.slice(0, 8)}...
          </span>
          <span>•</span>
          <span>Revisions: {assessment.reassessmentCount}</span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleLoadHistory}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
          >
            History Lineage
          </button>
          <button
            onClick={() => setShowReassessModal(true)}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium shadow transition"
          >
            Re-assess Impact
          </button>
        </div>
      </div>

      {/* Re-assess Modal */}
      {showReassessModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-semibold text-slate-200">
              Re-assess Severity, Priority & Impact
            </h3>
            <p className="text-xs text-slate-400">
              Provide an audit rationale and optional operational overrides. Re-assessing creates a
              new authoritative revision while preserving historical lineage.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Reassessment Reason (Required):</label>
                <textarea
                  value={reassessReason}
                  onChange={e => setReassessReason(e.target.value)}
                  placeholder="e.g., QA lead updated criticality, verified workaround, or reviewed new telemetry."
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-indigo-500 h-20 resize-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  Environment Override (Optional):
                </label>
                <input
                  type="text"
                  value={environmentOverride}
                  onChange={e => setEnvironmentOverride(e.target.value)}
                  placeholder="e.g. PRODUCTION, STAGING, DEV"
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="releaseBlockToggle"
                  checked={releaseBlockingOverride === true}
                  onChange={e => setReleaseBlockingOverride(e.target.checked ? true : null)}
                  className="rounded bg-slate-950 border-slate-700"
                />
                <label htmlFor="releaseBlockToggle" className="text-slate-300">
                  Force Release Blocking Override
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowReassessModal(false)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition"
              >
                Cancel
              </button>
              <button
                onClick={handleReassess}
                disabled={isAssessing || !reassessReason.trim()}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded text-xs font-semibold shadow transition"
              >
                {isAssessing ? 'Re-assessing...' : 'Confirm Re-assessment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Lineage Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-6 space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-slate-200">
                Impact Assessment History Lineage
              </h3>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                ✕ Close
              </button>
            </div>

            <div className="overflow-y-auto space-y-3 flex-1 pr-1 text-xs">
              {history.length === 0 ? (
                <div className="text-slate-500 italic p-4 text-center">
                  No history records found.
                </div>
              ) : (
                history.map(item => (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-lg border ${
                      item.isAuthoritative
                        ? 'bg-indigo-950/20 border-indigo-500/40'
                        : 'bg-slate-950/40 border-slate-800/80 text-slate-400'
                    } space-y-1.5`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-slate-200">
                          {item.severity} / {item.priority}
                        </span>
                        {item.isAuthoritative && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300 font-medium">
                            Authoritative
                          </span>
                        )}
                        {item.isStale && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 font-medium">
                            Stale
                          </span>
                        )}
                      </div>
                      <span className="text-slate-500 text-[11px]">
                        {new Date(item.assessedAt).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-slate-300 text-[11px]">{item.severityRationale}</p>

                    {item.reassessmentReason && (
                      <p className="text-indigo-300/80 text-[11px] italic">
                        Reason: {item.reassessmentReason}
                      </p>
                    )}

                    <div className="text-[10px] font-mono text-slate-500 pt-1 flex items-center justify-between">
                      <span>Fingerprint: {item.assessmentFingerprint.slice(0, 12)}...</span>
                      {item.supersededById && (
                        <span>Superseded by: {item.supersededById.slice(0, 8)}...</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
