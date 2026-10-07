/**
 * @file apps/desktop/src/renderer/features/failures/AiClassificationInspectionPanel.tsx
 * AI-Assisted Failure Classification & Reasoning Inspection Panel (V6 Phase 82).
 * Displays advisory AI classification, agreement state against deterministic pipeline,
 * calibrated confidence metrics, explainable basis, supporting/contradicting evidence,
 * alternative hypotheses, and provenance audit controls.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  FailureAiAssessmentDto,
  ClassificationAgreement,
  AiConfidenceLevel,
  FailureCategory,
} from '@ai-quality/contracts';

interface AiClassificationInspectionPanelProps {
  readonly projectId: string;
  readonly failureCaseId: string;
}

const CATEGORY_STYLES: Record<
  FailureCategory,
  { bg: string; text: string; border: string; label: string; icon: string }
> = {
  APPLICATION_FAILURE: {
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    border: 'border-rose-500/30',
    label: 'Application Failure',
    icon: '🐛',
  },
  AUTOMATION_FAILURE: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    label: 'Automation / Selector Failure',
    icon: '🤖',
  },
  TEST_DATA_FAILURE: {
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-400',
    border: 'border-cyan-500/30',
    label: 'Test Data Failure',
    icon: '📊',
  },
  ENVIRONMENT_FAILURE: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-400',
    border: 'border-orange-500/30',
    label: 'Environment Failure',
    icon: '🌐',
  },
  REQUIREMENT_AMBIGUITY: {
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-400',
    border: 'border-indigo-500/30',
    label: 'Requirement Ambiguity',
    icon: '❓',
  },
  INVALID_TEST: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
    label: 'Invalid Test Design',
    icon: '⚠️',
  },
  BLOCKED_EXECUTION: {
    bg: 'bg-slate-500/10',
    text: 'text-slate-400',
    border: 'border-slate-500/30',
    label: 'Blocked Execution',
    icon: '🚫',
  },
  UNKNOWN: {
    bg: 'bg-slate-500/10',
    text: 'text-slate-400',
    border: 'border-slate-500/30',
    label: 'Unknown',
    icon: '❔',
  },
  INCONCLUSIVE: {
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-400',
    border: 'border-yellow-500/30',
    label: 'Inconclusive Signal',
    icon: '⚖️',
  },
};

const AGREEMENT_STYLES: Record<
  ClassificationAgreement,
  { bg: string; text: string; border: string; label: string; icon: string }
> = {
  AGREES: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    label: 'Agrees with Deterministic Baseline',
    icon: '✅',
  },
  DISAGREES: {
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    border: 'border-rose-500/30',
    label: 'Disagrees with Deterministic Baseline',
    icon: '⚠️',
  },
  PARTIAL_AGREEMENT: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    label: 'Partial Agreement (Inconclusive Baseline)',
    icon: '🔄',
  },
  NOT_COMPARABLE: {
    bg: 'bg-slate-500/10',
    text: 'text-slate-400',
    border: 'border-slate-500/30',
    label: 'No Baseline Comparison',
    icon: 'ℹ️',
  },
};

const CONFIDENCE_STYLES: Record<AiConfidenceLevel, { bg: string; text: string; border: string }> = {
  VERY_HIGH: { bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/40' },
  HIGH: { bg: 'bg-blue-500/20', text: 'text-blue-300', border: 'border-blue-500/40' },
  MEDIUM: { bg: 'bg-amber-500/20', text: 'text-amber-300', border: 'border-amber-500/40' },
  LOW: { bg: 'bg-orange-500/20', text: 'text-orange-300', border: 'border-orange-500/40' },
  VERY_LOW: { bg: 'bg-rose-500/20', text: 'text-rose-300', border: 'border-rose-500/40' },
};

export const AiClassificationInspectionPanel: React.FC<AiClassificationInspectionPanelProps> = ({
  projectId,
  failureCaseId,
}) => {
  const [assessment, setAssessment] = useState<FailureAiAssessmentDto | null>(null);
  const [history, setHistory] = useState<readonly FailureAiAssessmentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [showReassessModal, setShowReassessModal] = useState(false);
  const [reassessReason, setReassessReason] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchAssessment = useCallback(async () => {
    if (!window.desktop?.failures) return;
    try {
      setLoading(true);
      setError(null);

      const result = await window.desktop.failures.getAiAssessment({
        projectId,
        failureCaseId,
      });

      if (!isMounted.current) return;

      if (!result.ok) {
        setError(result.error?.message ?? 'Failed to load AI assessment.');
        setAssessment(null);
      } else {
        setAssessment(result.data);
      }
    } catch (err: unknown) {
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : String(err));
        setAssessment(null);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [projectId, failureCaseId]);

  const fetchHistory = useCallback(async () => {
    if (!window.desktop?.failures) return;
    try {
      const result = await window.desktop.failures.listAiAssessmentHistory({
        projectId,
        failureCaseId,
      });
      if (isMounted.current && result.ok) {
        setHistory(result.data);
      }
    } catch {
      // Graceful fallback for history fetch
    }
  }, [projectId, failureCaseId]);

  useEffect(() => {
    fetchAssessment();
    fetchHistory();
  }, [fetchAssessment, fetchHistory]);

  const handleAssess = async () => {
    if (!window.desktop?.failures) return;
    try {
      setEvaluating(true);
      setError(null);

      const result = await window.desktop.failures.assessWithAi({
        projectId,
        failureCaseId,
      });

      if (!isMounted.current) return;

      if (!result.ok) {
        setError(result.error?.message ?? 'AI classification assessment failed.');
      } else {
        setAssessment(result.data);
        fetchHistory();
      }
    } catch (err: unknown) {
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (isMounted.current) {
        setEvaluating(false);
      }
    }
  };

  const handleReassess = async () => {
    if (!reassessReason.trim() || !window.desktop?.failures) return;

    try {
      setEvaluating(true);
      setError(null);

      const result = await window.desktop.failures.reassessWithAi({
        projectId,
        failureCaseId,
        reanalysisReason: reassessReason.trim(),
      });

      if (!isMounted.current) return;

      if (!result.ok) {
        setError(result.error?.message ?? 'Reassessment failed.');
      } else {
        setAssessment(result.data);
        setShowReassessModal(false);
        setReassessReason('');
        fetchHistory();
      }
    } catch (err: unknown) {
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (isMounted.current) {
        setEvaluating(false);
      }
    }
  };

  if (loading) {
    return (
      <div
        className="flex items-center justify-center p-8 bg-slate-900/50 rounded-lg border border-slate-800"
        data-testid="ai-reasoning-loading"
      >
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <span className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          <span>Loading AI reasoning assessment...</span>
        </div>
      </div>
    );
  }

  const categoryStyle = assessment
    ? (CATEGORY_STYLES[assessment.aiCategory] ?? CATEGORY_STYLES.UNKNOWN)
    : CATEGORY_STYLES.UNKNOWN;
  const agreementStyle = assessment
    ? (AGREEMENT_STYLES[assessment.agreementState] ?? AGREEMENT_STYLES.NOT_COMPARABLE)
    : AGREEMENT_STYLES.NOT_COMPARABLE;
  const confidenceStyle = assessment
    ? (CONFIDENCE_STYLES[assessment.confidenceLevel] ?? CONFIDENCE_STYLES.MEDIUM)
    : CONFIDENCE_STYLES.MEDIUM;

  return (
    <div className="space-y-4" data-testid="ai-classification-panel">
      {/* Top Banner & Action Controls */}
      <div className="flex items-center justify-between p-3 bg-slate-900/60 rounded-lg border border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <span>🤖</span>
            <span>AI-Assisted Classification & Reasoning</span>
            <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-mono">
              Phase 82 Advisory
            </span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Advisory semantic intelligence layer over deterministic execution & telemetry facts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {assessment && (
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              data-testid="toggle-ai-history-btn"
              className="px-2.5 py-1 text-xs text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 transition"
            >
              📜 History ({history.length})
            </button>
          )}
          {assessment ? (
            <button
              type="button"
              onClick={() => setShowReassessModal(true)}
              disabled={evaluating}
              data-testid="reassess-ai-btn"
              className="px-3 py-1 text-xs font-semibold text-indigo-300 hover:text-indigo-100 bg-indigo-600/20 hover:bg-indigo-600/30 rounded border border-indigo-500/40 transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {evaluating ? (
                <>
                  <span className="w-3 h-3 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin" />
                  <span>Re-assessing...</span>
                </>
              ) : (
                <>
                  <span>🔄</span>
                  <span>Re-assess with AI</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleAssess}
              disabled={evaluating}
              data-testid="assess-ai-btn"
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded shadow transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {evaluating ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Reasoning...</span>
                </>
              ) : (
                <>
                  <span>✨</span>
                  <span>Classify with AI</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 flex items-center gap-2"
          data-testid="ai-reasoning-error"
        >
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Empty State */}
      {!assessment && !error && (
        <div
          className="p-8 text-center bg-slate-900/40 rounded-lg border border-dashed border-slate-800"
          data-testid="ai-reasoning-empty"
        >
          <div className="text-3xl mb-2">🤖</div>
          <h4 className="text-sm font-semibold text-slate-300">No AI Assessment Recorded</h4>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Click &quot;Classify with AI&quot; to synthesize diagnostic evidence, console errors,
            DOM excerpts, and deterministic baselines into a calibrated classification.
          </p>
          <button
            type="button"
            onClick={handleAssess}
            disabled={evaluating}
            className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded transition disabled:opacity-50"
          >
            Run AI Assessment Now
          </button>
        </div>
      )}

      {/* Primary Assessment Display */}
      {assessment && (
        <div className="space-y-4">
          {/* Staleness Notice */}
          {assessment.isStale && (
            <div
              className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300 flex items-center justify-between"
              data-testid="ai-staleness-banner"
            >
              <div className="flex items-center gap-2">
                <span>⚠️</span>
                <div>
                  <span className="font-semibold">Assessment is Stale:</span>{' '}
                  <span>
                    {assessment.stalenessReason ?? 'Upstream diagnostic evidence has changed.'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowReassessModal(true)}
                className="px-2 py-0.5 text-xs bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded font-semibold text-amber-200"
              >
                Re-assess
              </button>
            </div>
          )}

          {/* Key Classification Metrics Card */}
          <div className="p-4 bg-slate-900/70 rounded-lg border border-slate-800 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* AI Category */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  AI Category
                </span>
                <div
                  className={`p-2.5 rounded border ${categoryStyle.bg} ${categoryStyle.border} flex items-center gap-2`}
                >
                  <span className="text-lg">{categoryStyle.icon}</span>
                  <div>
                    <div className={`text-sm font-bold ${categoryStyle.text}`}>
                      {categoryStyle.label}
                    </div>
                    {assessment.aiSubcategory && (
                      <div className="text-[11px] text-slate-400 font-mono">
                        {assessment.aiSubcategory}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Agreement State */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Baseline Agreement
                </span>
                <div
                  className={`p-2.5 rounded border ${agreementStyle.bg} ${agreementStyle.border} flex items-center gap-2`}
                >
                  <span className="text-lg">{agreementStyle.icon}</span>
                  <div>
                    <div className={`text-xs font-bold ${agreementStyle.text}`}>
                      {agreementStyle.label}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      State: {assessment.agreementState}
                    </div>
                  </div>
                </div>
              </div>

              {/* Confidence Tier */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Calibrated Confidence
                </span>
                <div
                  className={`p-2.5 rounded border ${confidenceStyle.bg} ${confidenceStyle.border} space-y-1`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold ${confidenceStyle.text}`}>
                      {assessment.confidenceLevel}
                    </span>
                    <span className="text-xs font-mono text-slate-300">
                      {(assessment.confidenceScore * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-indigo-400 h-full rounded-full transition-all"
                      style={{ width: `${Math.round(assessment.confidenceScore * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Human Explanation Summary */}
            <div className="p-3 bg-slate-800/40 rounded border border-slate-700/50 space-y-1.5">
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>💬</span>
                <span>Executive Summary</span>
              </span>
              <p
                className="text-xs text-slate-200 leading-relaxed font-sans"
                data-testid="ai-human-explanation"
              >
                {assessment.humanExplanation}
              </p>
            </div>

            {/* Detailed Technical Reasoning */}
            <div className="p-3 bg-slate-800/20 rounded border border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>🔍</span>
                <span>Primary Technical Reasoning</span>
              </span>
              <p
                className="text-xs text-slate-300 leading-relaxed font-mono whitespace-pre-wrap"
                data-testid="ai-primary-reasoning"
              >
                {assessment.primaryReasoning}
              </p>
            </div>
          </div>

          {/* Evidence Citations: Supporting & Contradicting Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Supporting Evidence */}
            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>🟢</span>
                <span>Supporting Evidence ({assessment.supportingEvidence.length})</span>
              </h4>
              {assessment.supportingEvidence.length === 0 ? (
                <div className="text-xs text-slate-500 italic">
                  No explicit supporting evidence cited.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {assessment.supportingEvidence.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-slate-800/40 rounded border border-slate-700/40 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="font-semibold text-emerald-300">
                          {item.evidenceType ?? 'Signal'}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                          {item.significance}
                        </span>
                      </div>
                      <p className="text-slate-300">{item.fact}</p>
                      {item.sourceEvidenceKey && (
                        <div className="text-[10px] text-slate-500 font-mono">
                          Key: {item.sourceEvidenceKey}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Contradicting Evidence */}
            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>🔴</span>
                <span>
                  Contradicting / Counter Signals ({assessment.contradictingEvidence.length})
                </span>
              </h4>
              {assessment.contradictingEvidence.length === 0 ? (
                <div className="text-xs text-slate-500 italic">
                  No contradicting signals detected.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {assessment.contradictingEvidence.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-slate-800/40 rounded border border-rose-500/20 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="font-semibold text-rose-300">
                          {item.evidenceType ?? 'Counter-Signal'}
                        </span>
                      </div>
                      <p className="text-slate-300">{item.fact}</p>
                      <p className="text-rose-400 text-[11px] italic">
                        Tension: {item.tensionDescription}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Alternative Hypotheses */}
          {assessment.alternativeHypotheses.length > 0 && (
            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <span>💡</span>
                <span>
                  Alternative Hypotheses Evaluated ({assessment.alternativeHypotheses.length})
                </span>
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {assessment.alternativeHypotheses.map((alt, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-slate-800/30 rounded border border-slate-800 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-indigo-300">{alt.category}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                        {alt.plausibility}
                      </span>
                    </div>
                    <p className="text-slate-300 text-[11px]">{alt.rationale}</p>
                    {alt.disqualifyingFactor && (
                      <p className="text-slate-400 text-[10px] italic">
                        Disqualifier: {alt.disqualifyingFactor}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Confidence Calibration Basis Breakdown */}
          {assessment.confidenceBasis.length > 0 && (
            <div className="p-3 bg-slate-900/40 rounded-lg border border-slate-800/80 space-y-1.5">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>📐</span>
                <span>Explainable Confidence Calibration Factors</span>
              </h4>
              <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
                {assessment.confidenceBasis.map((factor, idx) => (
                  <li key={idx} className="leading-tight">
                    {factor}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Audit Provenance & Lineage Footer */}
          <div className="p-3 bg-slate-950/60 rounded border border-slate-800/60 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400">
            <div className="flex items-center gap-4 font-mono">
              <span>
                Model:{' '}
                <strong className="text-slate-300">
                  {assessment.modelProvider} / {assessment.modelName}
                </strong>
              </span>
              <span>Prompt v{assessment.promptVersion}</span>
              <span>Schema v{assessment.schemaVersion}</span>
              {assessment.reanalysisCount > 0 && (
                <span className="text-indigo-400 font-semibold">
                  Reanalyzed ({assessment.reanalysisCount}x)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 font-mono">
              <span>Fingerprint:</span>
              <span className="text-slate-300" title={assessment.assessmentFingerprint}>
                {assessment.assessmentFingerprint.slice(0, 12)}...
              </span>
            </div>
          </div>
        </div>
      )}

      {/* History Drawer */}
      {showHistory && (
        <div
          className="p-3 bg-slate-900/80 rounded-lg border border-slate-700/60 space-y-2"
          data-testid="ai-history-drawer"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Assessment Revision History
            </h4>
            <button
              type="button"
              onClick={() => setShowHistory(false)}
              className="text-slate-400 hover:text-slate-200 text-xs"
            >
              ✕ Close
            </button>
          </div>
          {history.length === 0 ? (
            <div className="text-xs text-slate-500 italic">No historical assessments recorded.</div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {history.map(item => (
                <div
                  key={item.id}
                  className={`p-2 rounded border text-xs flex items-center justify-between ${
                    item.isAuthoritative
                      ? 'bg-indigo-950/20 border-indigo-500/30 text-indigo-300'
                      : 'bg-slate-800/30 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-200">{item.aiCategory}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                        {item.agreementState}
                      </span>
                      {item.isAuthoritative && (
                        <span className="text-[10px] font-bold text-emerald-400 uppercase">
                          Authoritative
                        </span>
                      )}
                    </div>
                    {item.reanalysisReason && (
                      <div className="text-[11px] text-slate-400 italic">
                        Reason: {item.reanalysisReason}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-[10px] font-mono text-slate-500">
                    <div>{new Date(item.assessedAt).toLocaleString()}</div>
                    <div>Score: {(item.confidenceScore * 100).toFixed(0)}%</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reassess Modal */}
      {showReassessModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          data-testid="reassess-ai-modal"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-md w-full p-4 space-y-3 shadow-2xl">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <span>🔄</span>
              <span>Re-assess Failure with AI</span>
            </h3>
            <p className="text-xs text-slate-400">
              Provide an audit rationale explaining why re-assessment is required (e.g. newly
              attached evidence, updated reproduction, test fixture repair).
            </p>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Reassessment Reason <span className="text-rose-400">*</span>
              </label>
              <textarea
                value={reassessReason}
                onChange={e => setReassessReason(e.target.value)}
                placeholder="e.g. New network HAR evidence attached; re-evaluating classification."
                rows={3}
                data-testid="reassess-reason-input"
                className="w-full px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowReassessModal(false);
                  setReassessReason('');
                }}
                className="px-3 py-1 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReassess}
                disabled={!reassessReason.trim() || evaluating}
                data-testid="submit-reassess-btn"
                className="px-3 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded disabled:opacity-50 transition"
              >
                {evaluating ? 'Evaluating...' : 'Confirm Reassessment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
