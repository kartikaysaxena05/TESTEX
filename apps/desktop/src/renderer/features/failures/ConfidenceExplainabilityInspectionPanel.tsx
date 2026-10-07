/**
 * @file apps/desktop/src/renderer/features/failures/ConfidenceExplainabilityInspectionPanel.tsx
 * Confidence Scoring, Explainability & Evidence Attribution Inspection Panel (V6 Phase 86).
 *
 * Displays:
 * - Overall confidence score & semantic band badge (VERY_LOW to VERY_HIGH)
 * - Domain confidences (Classification, Root Cause, Reproducibility, Severity, Duplicate)
 * - Epistemic evidence attribution matrix (FACT, DETERMINISTIC_INFERENCE, AI_INFERENCE, CONTRADICTORY, UNKNOWN)
 * - Double-count protected canonical evidence items
 * - Dynamic staleness detection banner
 * - Component score breakdown with weights & penalties
 * - Human-readable explanation with claim-to-evidence validation
 * - Audit revision history
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  ConfidenceAssessmentDto,
  EvidenceAttributionDto,
  ConfidenceBandDto,
} from '@ai-quality/contracts';

interface ConfidenceExplainabilityInspectionPanelProps {
  readonly projectId: string;
  readonly failureCaseId: string;
}

const BAND_STYLES: Record<
  ConfidenceBandDto,
  { bg: string; text: string; border: string; label: string; icon: string }
> = {
  VERY_HIGH: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    label: 'Very High Confidence (80–100%)',
    icon: '🛡️',
  },
  HIGH: {
    bg: 'bg-teal-500/10',
    text: 'text-teal-400',
    border: 'border-teal-500/30',
    label: 'High Confidence (60–79%)',
    icon: '✅',
  },
  MEDIUM: {
    bg: 'bg-sky-500/10',
    text: 'text-sky-400',
    border: 'border-sky-500/30',
    label: 'Medium Confidence (40–59%)',
    icon: '⚖️',
  },
  LOW: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    label: 'Low Confidence (20–39%)',
    icon: '⚠️',
  },
  VERY_LOW: {
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    border: 'border-rose-500/30',
    label: 'Very Low Confidence (0–19%)',
    icon: '🛑',
  },
};

export const ConfidenceExplainabilityInspectionPanel: React.FC<
  ConfidenceExplainabilityInspectionPanelProps
> = ({ projectId, failureCaseId }) => {
  const [assessment, setAssessment] = useState<ConfidenceAssessmentDto | null>(null);
  const [attributions, setAttributions] = useState<readonly EvidenceAttributionDto[]>([]);
  const [history, setHistory] = useState<readonly ConfidenceAssessmentDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isReassessing, setIsReassessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeEpistemicFilter, setActiveEpistemicFilter] = useState<string>('ALL');
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [reassessReason, setReassessReason] = useState<string>('');
  const [showReassessModal, setShowReassessModal] = useState<boolean>(false);

  const activeCaseIdRef = useRef<string>(failureCaseId);

  const loadData = useCallback(async () => {
    if (!window.desktop?.failures) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Fetch or compute authoritative assessment
      const res = await window.desktop.failures.getConfidence({
        projectId,
        failureCaseId,
      });

      if (activeCaseIdRef.current !== failureCaseId) return;

      if (res.ok && res.data) {
        setAssessment(res.data);
      } else if (res.ok && !res.data) {
        // Automatically assess if not yet assessed
        const assessRes = await window.desktop.failures.assessConfidence({
          projectId,
          failureCaseId,
        });
        if (activeCaseIdRef.current === failureCaseId && assessRes.ok) {
          setAssessment(assessRes.data);
        } else if (!assessRes.ok) {
          setError(assessRes.error.message || 'Failed to compute confidence assessment.');
        }
      } else if (!res.ok) {
        setError(res.error.message || 'Failed to load confidence assessment.');
      }

      // Fetch attributions
      if (window.desktop?.failures) {
        const attrRes = await window.desktop.failures.listEvidenceAttributions({
          projectId,
          failureCaseId,
        });
        if (activeCaseIdRef.current === failureCaseId && attrRes.ok) {
          setAttributions(attrRes.data);
        }
      }
    } catch (err: unknown) {
      if (activeCaseIdRef.current === failureCaseId) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (activeCaseIdRef.current === failureCaseId) {
        setIsLoading(false);
      }
    }
  }, [projectId, failureCaseId]);

  useEffect(() => {
    activeCaseIdRef.current = failureCaseId;
    loadData();
  }, [projectId, failureCaseId, loadData]);

  const handleReassess = async () => {
    if (!reassessReason.trim() || !window.desktop?.failures) return;
    try {
      setIsReassessing(true);
      setError(null);
      const res = await window.desktop.failures.reassessConfidence({
        projectId,
        failureCaseId,
        reason: reassessReason.trim(),
      });
      if (res.ok) {
        setAssessment(res.data);
        setShowReassessModal(false);
        setReassessReason('');
        // Refresh attributions
        if (window.desktop?.failures) {
          const attrRes = await window.desktop.failures.listEvidenceAttributions({
            projectId,
            failureCaseId,
          });
          if (attrRes.ok) setAttributions(attrRes.data);
        }
      } else {
        setError(res.error.message || 'Failed to reassess confidence.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsReassessing(false);
    }
  };

  const handleOpenHistory = async () => {
    if (!window.desktop?.failures) return;
    try {
      const res = await window.desktop.failures.listConfidenceHistory({
        projectId,
        failureCaseId,
      });
      if (res.ok) {
        setHistory(res.data);
        setShowHistoryModal(true);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400 space-x-3">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Calculating confidence scores & evidence attribution...</span>
      </div>
    );
  }

  if (error && !assessment) {
    return (
      <div className="p-6 bg-rose-950/20 border border-rose-800/40 rounded-lg text-rose-300 text-sm flex items-center justify-between">
        <span>{error}</span>
        <button
          onClick={loadData}
          className="px-3 py-1 bg-rose-800/40 hover:bg-rose-700/50 rounded text-xs font-semibold"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="p-8 text-center text-slate-400">
        <p className="text-sm">No confidence assessment available for this failure case.</p>
        <button
          onClick={loadData}
          className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold"
        >
          Compute Confidence
        </button>
      </div>
    );
  }

  const bandStyle = BAND_STYLES[assessment.confidenceBand] || BAND_STYLES.MEDIUM;

  const filteredAttributions =
    activeEpistemicFilter === 'ALL'
      ? attributions
      : attributions.filter(a => a.epistemicType === activeEpistemicFilter);

  return (
    <div className="space-y-6" data-testid="confidence-inspection-panel">
      {/* Dynamic Staleness Banner */}
      {assessment.isStale && (
        <div className="p-4 bg-amber-950/30 border border-amber-500/40 rounded-lg flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-xl">⚠️</span>
            <div>
              <h4 className="text-sm font-bold text-amber-300">Confidence Assessment is Stale</h4>
              <p className="text-xs text-amber-200/80">
                {assessment.stalenessReason ||
                  'Underlying evidence or analysis artifacts updated since last calculation.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setReassessReason('Stale assessment auto-recalculation');
              setShowReassessModal(true);
            }}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs rounded transition"
          >
            Re-assess Now
          </button>
        </div>
      )}

      {/* Top Header & Overall Score Gauge */}
      <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
        <div className="flex items-center space-x-5">
          <div className="relative flex items-center justify-center">
            <div className="w-24 h-24 rounded-full border-4 border-slate-700/60 flex flex-col items-center justify-center bg-slate-950/70">
              <span className="text-2xl font-black text-slate-100">
                {(assessment.overallConfidence * 100).toFixed(0)}%
              </span>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Overall
              </span>
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${bandStyle.bg} ${bandStyle.text} ${bandStyle.border}`}
              >
                {bandStyle.icon} {bandStyle.label}
              </span>
              <span className="text-xs text-slate-400">Revision #{assessment.revision}</span>
            </div>
            <h3 className="text-lg font-bold text-slate-100 mt-1">Multi-Domain Confidence</h3>
            <p className="text-xs text-slate-400 max-w-md mt-0.5">
              Calibrated against factual execution telemetry, deterministic classification rules,
              and verified code references.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleOpenHistory}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded border border-slate-700 transition"
          >
            📜 History ({assessment.revision})
          </button>
          <button
            onClick={() => setShowReassessModal(true)}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded transition shadow"
          >
            🎯 Re-assess
          </button>
        </div>
      </div>

      {/* Domain Confidence Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <DomainScoreCard
          title="Classification"
          score={assessment.classificationConfidence}
          icon="🏷️"
          weight="30%"
        />
        <DomainScoreCard
          title="Root Cause"
          score={assessment.rootCauseConfidence}
          icon="🔍"
          weight="25%"
        />
        <DomainScoreCard
          title="Reproducibility"
          score={assessment.reproducibilityConfidence}
          icon="🔁"
          weight="20%"
        />
        <DomainScoreCard
          title="Severity & Impact"
          score={assessment.severityConfidence}
          icon="💥"
          weight="15%"
        />
        <DomainScoreCard
          title="Duplicate / Cluster"
          score={assessment.duplicateConfidence}
          icon="🧩"
          weight="10%"
        />
      </div>

      {/* Component Breakdown Table */}
      <div className="p-5 bg-slate-900/40 border border-slate-800/80 rounded-xl space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-200">Component Scoring Breakdown</h4>
          <span className="text-xs text-slate-400">
            Engine Version: {assessment.confidenceEngineVersion}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Component</th>
                <th className="py-2.5 px-3">Weight</th>
                <th className="py-2.5 px-3">Score</th>
                <th className="py-2.5 px-3">Evidence Signals</th>
                <th className="py-2.5 px-3">Rationale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {assessment.componentBreakdown.map(c => (
                <tr key={c.component} className="hover:bg-slate-800/20">
                  <td className="py-2.5 px-3 font-semibold text-slate-200">{c.component}</td>
                  <td className="py-2.5 px-3 text-slate-400">{(c.weight * 100).toFixed(0)}%</td>
                  <td className="py-2.5 px-3 font-bold">
                    <span
                      className={
                        c.score >= 0.8
                          ? 'text-emerald-400'
                          : c.score >= 0.5
                            ? 'text-amber-400'
                            : 'text-rose-400'
                      }
                    >
                      {(c.score * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-300">
                    <div className="flex items-center space-x-2">
                      <span className="text-emerald-400 font-medium">+{c.supportingCount}</span>
                      {c.contradictingCount > 0 && (
                        <span className="text-rose-400 font-medium">-{c.contradictingCount}</span>
                      )}
                      {c.missingCount > 0 && (
                        <span className="text-amber-400 font-medium">?{c.missingCount}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-400">{c.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Epistemic Evidence Attribution Matrix */}
      <div className="p-5 bg-slate-900/40 border border-slate-800/80 rounded-xl space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-slate-200">Evidence Attribution Matrix</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Links each conclusion to verified project evidence with double-count prevention.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 bg-slate-950/70 p-1 rounded-lg border border-slate-800">
            {[
              'ALL',
              'FACT',
              'DETERMINISTIC_INFERENCE',
              'AI_INFERENCE',
              'CONTRADICTORY',
              'UNKNOWN',
            ].map(type => (
              <button
                key={type}
                onClick={() => setActiveEpistemicFilter(type)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                  activeEpistemicFilter === type
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {type.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Conclusion</th>
                <th className="py-2.5 px-3">Epistemic Type</th>
                <th className="py-2.5 px-3">Relationship</th>
                <th className="py-2.5 px-3">Strength</th>
                <th className="py-2.5 px-3">Subsystem</th>
                <th className="py-2.5 px-3">Evidence Reason & Grounding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredAttributions.map(attr => (
                <tr key={attr.id} className="hover:bg-slate-800/20">
                  <td className="py-2.5 px-3 font-semibold text-slate-200">
                    {attr.conclusionType}
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        attr.epistemicType === 'FACT'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : attr.epistemicType === 'DETERMINISTIC_INFERENCE'
                            ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                            : attr.epistemicType === 'AI_INFERENCE'
                              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                              : attr.epistemicType === 'CONTRADICTORY'
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                      }`}
                    >
                      {attr.epistemicType}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-medium">
                    <span
                      className={
                        attr.relationship === 'SUPPORTS'
                          ? 'text-emerald-400'
                          : attr.relationship === 'CONTRADICTS'
                            ? 'text-rose-400'
                            : 'text-amber-400'
                      }
                    >
                      {attr.relationship}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-300">{attr.supportStrength}</td>
                  <td className="py-2.5 px-3 text-slate-400 text-[11px] font-mono">
                    {attr.sourceSubsystem}
                  </td>
                  <td className="py-2.5 px-3 text-slate-300">
                    <p>{attr.reason}</p>
                    <span className="text-[10px] text-slate-500 font-mono">
                      Key: {attr.canonicalEvidenceKey}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredAttributions.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500 italic">
                    No evidence attributions match the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Human-Readable Explanation */}
      <div className="p-5 bg-slate-900/40 border border-slate-800/80 rounded-xl space-y-3">
        <h4 className="text-sm font-bold text-slate-200">Human-Readable Grounded Explanation</h4>
        <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-lg text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-mono overflow-x-auto max-h-96 overflow-y-auto">
          {assessment.humanExplanation}
        </div>
      </div>

      {/* Reassess Modal */}
      {showReassessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-100">Re-assess Failure Confidence</h3>
            <p className="text-xs text-slate-400">
              Provide an auditable reason for recomputing confidence and generating a new revision.
            </p>
            <input
              type="text"
              value={reassessReason}
              onChange={e => setReassessReason(e.target.value)}
              placeholder="e.g. Ingested new reproduction logs or updated code baseline"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowReassessModal(false)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleReassess}
                disabled={isReassessing || !reassessReason.trim()}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded flex items-center space-x-2"
              >
                {isReassessing && (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                <span>Re-assess</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revision History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-100">Confidence Revision History</h3>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-800/80">
              {history.map(h => (
                <div key={h.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-200">Revision #{h.revision}</span>
                      {h.isAuthoritative && (
                        <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 text-[10px] font-bold rounded">
                          Authoritative
                        </span>
                      )}
                      <span className="text-slate-400">
                        {new Date(h.assessedAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-slate-400 mt-1">
                      Reason: {h.recalculationReason || 'Initial baseline calculation'}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-black text-slate-100">
                      {(h.overallConfidence * 100).toFixed(0)}%
                    </span>
                    <p className="text-[10px] text-slate-400">{h.confidenceBand}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DomainScoreCard: React.FC<{
  title: string;
  score: number | null | undefined;
  icon: string;
  weight: string;
}> = ({ title, score, icon, weight }) => {
  const isAvailable = score !== null && score !== undefined;
  const percentage = isAvailable ? (score * 100).toFixed(0) : 'N/A';

  return (
    <div className="p-3.5 bg-slate-900/50 border border-slate-800/80 rounded-lg flex flex-col justify-between space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-base">{icon}</span>
        <span className="text-[10px] text-slate-400 font-mono">Weight {weight}</span>
      </div>
      <div>
        <span className="text-xs text-slate-400 font-medium block">{title}</span>
        <span
          className={`text-lg font-black ${
            isAvailable
              ? score >= 0.7
                ? 'text-emerald-400'
                : score >= 0.4
                  ? 'text-amber-400'
                  : 'text-rose-400'
              : 'text-slate-500'
          }`}
        >
          {percentage === 'N/A' ? 'N/A' : `${percentage}%`}
        </span>
      </div>
    </div>
  );
};
