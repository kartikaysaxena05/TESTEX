/**
 * @file apps/desktop/src/renderer/features/failures/RootCauseInspectionPanel.tsx
 * Root-Cause Analysis & Probable Layer Identification Inspection Panel (V6 Phase 83).
 * Displays evidence-grounded probable root-cause hypotheses, probable software layers,
 * anti-hallucination verified repository references, affected execution paths, alternative
 * hypotheses, limitations, uncertainties, and provenance audit lineage.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  FailureRootCauseAnalysisDto,
  RootCauseProbableLayer,
  RootCauseStatus,
} from '@ai-quality/contracts';

interface RootCauseInspectionPanelProps {
  readonly projectId: string;
  readonly failureCaseId: string;
}

const LAYER_STYLES: Record<
  RootCauseProbableLayer,
  { bg: string; text: string; border: string; label: string; icon: string }
> = {
  FRONTEND: {
    bg: 'bg-sky-500/10',
    text: 'text-sky-400',
    border: 'border-sky-500/30',
    label: 'Frontend / Client-Side UI',
    icon: '🖥️',
  },
  BACKEND: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    label: 'Backend / Server Logic',
    icon: '⚙️',
  },
  API: {
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-400',
    border: 'border-indigo-500/30',
    label: 'API / Contract Interface',
    icon: '🔌',
  },
  DATABASE: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    label: 'Database / Persistence',
    icon: '🗄️',
  },
  AUTHENTICATION: {
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    border: 'border-rose-500/30',
    label: 'Authentication / Identity',
    icon: '🔑',
  },
  AUTHORIZATION: {
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    border: 'border-red-500/30',
    label: 'Authorization / Permissions',
    icon: '🛡️',
  },
  VALIDATION: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-400',
    border: 'border-orange-500/30',
    label: 'Input Validation / Schema',
    icon: '📋',
  },
  BUSINESS_LOGIC: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
    label: 'Business Logic / Domain Rules',
    icon: '🧠',
  },
  NETWORK: {
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-400',
    border: 'border-cyan-500/30',
    label: 'Network / Connectivity',
    icon: '🌐',
  },
  CONFIGURATION: {
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-400',
    border: 'border-yellow-500/30',
    label: 'Configuration / Feature Flags',
    icon: '🔧',
  },
  INFRASTRUCTURE: {
    bg: 'bg-teal-500/10',
    text: 'text-teal-400',
    border: 'border-teal-500/30',
    label: 'Infrastructure / Platform',
    icon: '🏗️',
  },
  TEST_AUTOMATION: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    label: 'Test Automation / Framework',
    icon: '🤖',
  },
  TEST_DATA: {
    bg: 'bg-pink-500/10',
    text: 'text-pink-400',
    border: 'border-pink-500/30',
    label: 'Test Data / Fixtures',
    icon: '📊',
  },
  ENVIRONMENT: {
    bg: 'bg-fuchsia-500/10',
    text: 'text-fuchsia-400',
    border: 'border-fuchsia-500/30',
    label: 'Target Environment / Browser',
    icon: '🌍',
  },
  THIRD_PARTY_DEPENDENCY: {
    bg: 'bg-violet-500/10',
    text: 'text-violet-400',
    border: 'border-violet-500/30',
    label: 'Third-Party Dependency / Gateway',
    icon: '📦',
  },
  UNKNOWN: {
    bg: 'bg-slate-500/10',
    text: 'text-slate-400',
    border: 'border-slate-500/30',
    label: 'Unknown Layer',
    icon: '❔',
  },
  MULTI_LAYER: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-300',
    border: 'border-purple-500/30',
    label: 'Multi-Layer Cross-Cutting',
    icon: '🔀',
  },
};

const STATUS_STYLES: Record<
  RootCauseStatus,
  { bg: string; text: string; border: string; label: string; icon: string }
> = {
  SUPPORTED_HYPOTHESIS: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    label: 'Evidence-Supported Hypothesis',
    icon: '🎯',
  },
  MULTIPLE_PLAUSIBLE_CAUSES: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    label: 'Multiple Plausible Causes',
    icon: '⚖️',
  },
  INSUFFICIENT_EVIDENCE: {
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    border: 'border-rose-500/30',
    label: 'Insufficient Evidence',
    icon: '⚠️',
  },
  NO_REPOSITORY_CONTEXT: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    label: 'No Connected Repository (Live Web Target)',
    icon: '🌐',
  },
  NOT_APPLICABLE: {
    bg: 'bg-slate-500/10',
    text: 'text-slate-400',
    border: 'border-slate-500/30',
    label: 'Not Applicable',
    icon: '🚫',
  },
  INCONCLUSIVE: {
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-400',
    border: 'border-yellow-500/30',
    label: 'Inconclusive Signal',
    icon: '❓',
  },
};

export const RootCauseInspectionPanel: React.FC<RootCauseInspectionPanelProps> = ({
  projectId,
  failureCaseId,
}) => {
  const [analysis, setAnalysis] = useState<FailureRootCauseAnalysisDto | null>(null);
  const [history, setHistory] = useState<readonly FailureRootCauseAnalysisDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [showReanalyzeModal, setShowReanalyzeModal] = useState<boolean>(false);
  const [reanalysisReason, setReanalysisReason] = useState<string>('');

  const activeProjectIdRef = useRef<string>(projectId);
  const activeFailureCaseIdRef = useRef<string>(failureCaseId);

  useEffect(() => {
    activeProjectIdRef.current = projectId;
    activeFailureCaseIdRef.current = failureCaseId;
  }, [projectId, failureCaseId]);

  const loadData = useCallback(async () => {
    if (!window.desktop?.failures) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await window.desktop.failures.getRootCauseAnalysis({
        projectId,
        failureCaseId,
      });

      if (
        activeProjectIdRef.current !== projectId ||
        activeFailureCaseIdRef.current !== failureCaseId
      ) {
        return;
      }

      if (!res.ok) {
        setError(res.error.message);
        setAnalysis(null);
      } else {
        setAnalysis(res.data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [projectId, failureCaseId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleAnalyze = async () => {
    if (!window.desktop?.failures) return;
    setIsAnalyzing(true);
    setError(null);

    try {
      const res = await window.desktop.failures.analyzeRootCause({
        projectId,
        failureCaseId,
      });

      if (
        activeProjectIdRef.current !== projectId ||
        activeFailureCaseIdRef.current !== failureCaseId
      ) {
        return;
      }

      if (!res.ok) {
        setError(res.error.message);
      } else {
        setAnalysis(res.data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReanalyze = async () => {
    if (!reanalysisReason.trim() || !window.desktop?.failures) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const res = await window.desktop.failures.reanalyzeRootCause({
        projectId,
        failureCaseId,
        reanalysisReason: reanalysisReason.trim(),
      });

      if (
        activeProjectIdRef.current !== projectId ||
        activeFailureCaseIdRef.current !== failureCaseId
      ) {
        return;
      }

      if (!res.ok) {
        setError(res.error.message);
      } else {
        setAnalysis(res.data);
        setShowReanalyzeModal(false);
        setReanalysisReason('');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleLoadHistory = async () => {
    if (!window.desktop?.failures) return;
    try {
      const res = await window.desktop.failures.listRootCauseHistory({
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
      <div className="p-6 bg-slate-900/50 rounded-lg border border-slate-800 text-center">
        <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-slate-600 border-t-blue-500 mb-2" />
        <p className="text-xs text-slate-400">Loading Root-Cause Analysis...</p>
      </div>
    );
  }

  if (error && !analysis) {
    return (
      <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-xs">
        <div className="font-semibold mb-1">Root-Cause Analysis Error</div>
        <div>{error}</div>
        <button
          onClick={() => void loadData()}
          className="mt-3 px-3 py-1 bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 rounded text-xs transition"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="p-8 bg-slate-900/40 rounded-xl border border-slate-800 text-center space-y-4">
        <div className="text-3xl">🔍</div>
        <div>
          <h3 className="text-sm font-semibold text-slate-200">No Root-Cause Analysis Available</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Synthesize all failure evidence, technical localization, domain separation, and
            repository intelligence into an evidence-supported root-cause hypothesis and probable
            software layer.
          </p>
        </div>
        <div>
          <button
            onClick={() => void handleAnalyze()}
            disabled={isAnalyzing}
            data-testid="analyze-root-cause-button"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow transition disabled:opacity-50 inline-flex items-center gap-2"
          >
            {isAnalyzing ? (
              <>
                <div className="animate-spin rounded-full h-3 w-3 border-2 border-white/40 border-t-white" />
                <span>Formulating Root-Cause Hypothesis...</span>
              </>
            ) : (
              <>
                <span>🔬</span>
                <span>Analyze Root Cause</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  const layerStyle = LAYER_STYLES[analysis.probableLayer] ?? LAYER_STYLES.UNKNOWN;
  const statusStyle = STATUS_STYLES[analysis.rootCauseStatus] ?? STATUS_STYLES.INCONCLUSIVE;

  return (
    <div className="space-y-6" data-testid="root-cause-inspection-panel">
      {/* Staleness Banner */}
      {analysis.isStale && (
        <div
          data-testid="root-cause-stale-banner"
          className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between text-xs text-amber-300"
        >
          <div className="flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <div>
              <span className="font-semibold">Analysis Stale: </span>
              {analysis.stalenessReason ||
                'Pipeline baseline data was updated after this hypothesis was formed.'}
            </div>
          </div>
          <button
            onClick={() => setShowReanalyzeModal(true)}
            className="px-3 py-1 bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 rounded font-medium transition"
          >
            Re-analyze
          </button>
        </div>
      )}

      {/* Main Hypothesis Header Card */}
      <div className="p-5 bg-slate-900/60 rounded-xl border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border flex items-center gap-1.5 ${layerStyle.bg} ${layerStyle.text} ${layerStyle.border}`}
              data-testid="probable-layer-badge"
            >
              <span>{layerStyle.icon}</span>
              <span>Layer: {layerStyle.label}</span>
            </span>

            <span
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border flex items-center gap-1.5 ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
              data-testid="root-cause-status-badge"
            >
              <span>{statusStyle.icon}</span>
              <span>{statusStyle.label}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleLoadHistory()}
              className="px-2.5 py-1 text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded text-xs transition"
            >
              📜 History ({analysis.reanalysisCount})
            </button>
            <button
              onClick={() => setShowReanalyzeModal(true)}
              disabled={isAnalyzing}
              className="px-3 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30 rounded text-xs font-semibold transition disabled:opacity-50"
            >
              {isAnalyzing ? 'Analyzing...' : 'Re-analyze'}
            </button>
          </div>
        </div>

        {/* Component & Endpoint */}
        {(analysis.probableComponent || analysis.relatedEndpoint) && (
          <div className="flex flex-wrap gap-4 text-xs text-slate-300 bg-slate-800/40 p-3 rounded-lg border border-slate-800">
            {analysis.probableComponent && (
              <div>
                <span className="text-slate-400">Suspected Component: </span>
                <span className="font-mono font-semibold text-slate-200">
                  {analysis.probableComponent}
                </span>
              </div>
            )}
            {analysis.relatedEndpoint && (
              <div>
                <span className="text-slate-400">Related Endpoint: </span>
                <span className="font-mono font-semibold text-slate-200">
                  {analysis.relatedEndpoint}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Primary Probable Cause */}
        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
            Probable Root Cause
          </h4>
          <div
            className="text-sm font-medium text-slate-100 bg-slate-800/30 p-3.5 rounded-lg border border-slate-800/60 leading-relaxed whitespace-pre-wrap"
            data-testid="probable-cause-text"
          >
            {analysis.probableCause}
          </div>
        </div>

        {/* Human Explanation */}
        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
            Human-Readable Explanation
          </h4>
          <div
            className="text-xs text-slate-300 bg-slate-800/20 p-3.5 rounded-lg border border-slate-800/40 leading-relaxed whitespace-pre-wrap"
            data-testid="human-explanation-text"
          >
            {analysis.humanExplanation}
          </div>
        </div>
      </div>

      {/* Repository References Section */}
      <div className="p-5 bg-slate-900/60 rounded-xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <span>📁 Verified Repository References</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400">
              {analysis.repositoryReferences.length}
            </span>
          </h4>
          <span
            className={`text-[10px] px-2 py-0.5 rounded font-semibold border ${
              analysis.repositoryContextAvailable
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
            }`}
          >
            {analysis.repositoryContextAvailable
              ? 'Repository Connected'
              : 'No Connected Repository'}
          </span>
        </div>

        {!analysis.repositoryContextAvailable ? (
          <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300">
            <span className="font-semibold">Zero-Repository Live Target: </span>
            This project does not have a connected source code repository. Root-cause hypothesis was
            derived strictly from HTTP telemetry, DOM captures, and runtime execution facts without
            speculative or hallucinated files.
          </div>
        ) : analysis.repositoryReferences.length === 0 ? (
          <div className="text-xs text-slate-400 italic py-2">
            No specific repository files directly implicated in the root-cause hypothesis.
          </div>
        ) : (
          <div className="space-y-2" data-testid="repository-references-list">
            {analysis.repositoryReferences.map((ref, idx) => (
              <div
                key={idx}
                className="p-3 bg-slate-800/40 border border-slate-800 rounded-lg text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="font-mono font-semibold text-blue-400 flex items-center gap-1.5">
                    <span>📄</span>
                    <span>{ref.filePath}</span>
                    {ref.symbolName && (
                      <span className="text-amber-300">
                        ::{ref.symbolName}
                        {ref.symbolKind ? ` (${ref.symbolKind})` : ''}
                      </span>
                    )}
                  </div>
                  {(ref.startLine || ref.endLine) && (
                    <span className="text-[10px] font-mono text-slate-400">
                      Lines {ref.startLine ?? 1}–{ref.endLine ?? ref.startLine}
                    </span>
                  )}
                </div>
                <div className="text-slate-300 text-[11px] leading-relaxed">{ref.relevance}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Affected Execution Path */}
      {analysis.affectedExecutionPath.length > 0 && (
        <div className="p-5 bg-slate-900/60 rounded-xl border border-slate-800 space-y-3">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Affected Execution Path
          </h4>
          <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-300 font-mono bg-slate-800/30 p-3.5 rounded-lg border border-slate-800/40">
            {analysis.affectedExecutionPath.map((step, idx) => (
              <li key={idx} className="leading-relaxed">
                <span className="text-slate-200">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Supporting & Contradicting Evidence Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Supporting Evidence */}
        <div className="p-5 bg-slate-900/60 rounded-xl border border-slate-800 space-y-3">
          <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
            <span>✅ Supporting Evidence</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {analysis.supportingEvidence.length}
            </span>
          </h4>
          {analysis.supportingEvidence.length === 0 ? (
            <div className="text-xs text-slate-400 italic">No specific facts recorded.</div>
          ) : (
            <div className="space-y-2">
              {analysis.supportingEvidence.map(ev => (
                <div
                  key={ev.id}
                  className="p-3 bg-slate-800/30 border border-slate-800/60 rounded-lg text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-slate-200 font-medium">{ev.fact}</span>
                    <span className="text-[10px] uppercase font-bold text-emerald-400/80">
                      {ev.significance}
                    </span>
                  </div>
                  {ev.evidenceType && (
                    <div className="text-[10px] text-slate-400">Type: {ev.evidenceType}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Contradicting Evidence */}
        <div className="p-5 bg-slate-900/60 rounded-xl border border-slate-800 space-y-3">
          <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
            <span>⚖️ Contradicting Evidence & Tensions</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              {analysis.contradictingEvidence.length}
            </span>
          </h4>
          {analysis.contradictingEvidence.length === 0 ? (
            <div className="text-xs text-slate-400 italic">
              No unresolved contradicting evidence identified.
            </div>
          ) : (
            <div className="space-y-2">
              {analysis.contradictingEvidence.map(ev => (
                <div
                  key={ev.id}
                  className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg text-xs space-y-1"
                >
                  <div className="text-amber-200 font-medium">{ev.fact}</div>
                  <div className="text-[11px] text-amber-300/80 italic">
                    Tension: {ev.tensionDescription}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Alternative Hypotheses */}
      {analysis.alternativeHypotheses.length > 0 && (
        <div className="p-5 bg-slate-900/60 rounded-xl border border-slate-800 space-y-3">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Alternative Hypotheses Considered ({analysis.alternativeHypotheses.length})
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {analysis.alternativeHypotheses.map((alt, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-slate-800/30 border border-slate-800 rounded-lg text-xs space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">Layer: {alt.layer}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                      alt.plausibility === 'HIGH'
                        ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                        : alt.plausibility === 'MEDIUM'
                          ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                          : 'bg-slate-500/10 text-slate-300 border-slate-500/30'
                    }`}
                  >
                    {alt.plausibility} PLAUSIBILITY
                  </span>
                </div>
                <div className="text-slate-300 font-medium">{alt.probableCause}</div>
                <div className="text-slate-400 text-[11px]">{alt.rationale}</div>
                {alt.disqualifyingFactor && (
                  <div className="text-rose-300/80 text-[11px] italic bg-rose-500/5 p-2 rounded border border-rose-500/10">
                    Disqualifier: {alt.disqualifyingFactor}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Limitations & Uncertainties */}
      {(analysis.limitations.length > 0 || analysis.uncertainties.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {analysis.limitations.length > 0 && (
            <div className="p-4 bg-slate-900/40 rounded-lg border border-slate-800/80 space-y-2">
              <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Analysis Limitations
              </h5>
              <ul className="list-disc list-inside text-xs text-slate-300 space-y-1">
                {analysis.limitations.map((lim, idx) => (
                  <li key={idx}>{lim}</li>
                ))}
              </ul>
            </div>
          )}
          {analysis.uncertainties.length > 0 && (
            <div className="p-4 bg-slate-900/40 rounded-lg border border-slate-800/80 space-y-2">
              <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Uncertainties & Missing Data
              </h5>
              <ul className="list-disc list-inside text-xs text-slate-300 space-y-1">
                {analysis.uncertainties.map((unc, idx) => (
                  <li key={idx}>{unc}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Provenance & Audit Footer */}
      <div className="p-4 bg-slate-950/40 rounded-lg border border-slate-800/60 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            Model:{' '}
            <strong className="text-slate-300">
              {analysis.modelProvider}/{analysis.modelName}
            </strong>
          </span>
          <span>•</span>
          <span>
            Prompt: <strong className="text-slate-300">v{analysis.promptVersion}</strong>
          </span>
          <span>•</span>
          <span title={analysis.rootCauseFingerprint}>
            Fingerprint:{' '}
            <code className="text-slate-400 font-mono">
              {analysis.rootCauseFingerprint.slice(0, 12)}…
            </code>
          </span>
        </div>
        <div>
          Formulated:{' '}
          <span className="text-slate-300">{new Date(analysis.analyzedAt).toLocaleString()}</span>
        </div>
      </div>

      {/* Re-analyze Modal */}
      {showReanalyzeModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-slate-200">Re-analyze Root Cause</h3>
            <p className="text-xs text-slate-400">
              Provide a reason for triggering a fresh root-cause formulation (e.g. new evidence
              attached, deployment rolled back, or locator updated).
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Reanalysis Reason
              </label>
              <textarea
                value={reanalysisReason}
                onChange={e => setReanalysisReason(e.target.value)}
                rows={3}
                placeholder="e.g. Re-evaluating after reviewing backend application logs..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setShowReanalyzeModal(false);
                  setReanalysisReason('');
                }}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleReanalyze()}
                disabled={isAnalyzing || !reanalysisReason.trim()}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold transition disabled:opacity-50"
              >
                {isAnalyzing ? 'Re-analyzing...' : 'Confirm Re-analysis'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-6 space-y-4 max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-200">
                Root-Cause Analysis History ({history.length})
              </h3>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                ✕ Close
              </button>
            </div>
            <div className="overflow-y-auto space-y-3 pr-1 flex-1">
              {history.map(item => (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-lg border text-xs space-y-2 ${
                    item.isAuthoritative
                      ? 'bg-blue-950/20 border-blue-500/40'
                      : 'bg-slate-800/30 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-200">
                        {item.probableLayer} — {item.rootCauseStatus}
                      </span>
                      {item.isAuthoritative && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          Current Authoritative
                        </span>
                      )}
                    </div>
                    <span className="text-slate-400 text-[10px]">
                      {new Date(item.analyzedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-slate-300 line-clamp-2">{item.probableCause}</div>
                  {item.reanalysisReason && (
                    <div className="text-[11px] text-amber-300/80 italic">
                      Reason: {item.reanalysisReason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
