/**
 * @file apps/desktop/src/renderer/features/requirements/RequirementQualityView.tsx
 * Component for displaying, explaining, reviewing, and re-analyzing requirement quality,
 * testability status, ambiguity findings, and deterministic clarification questions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  RequirementQualityAnalysisDto,
  RequirementTestabilityStatus,
  QualityFindingSeverity,
  QualityFindingReviewStatus,
} from '@ai-quality/contracts';

interface RequirementQualityViewProps {
  readonly projectId: string;
  readonly requirementId: string;
}

export const RequirementQualityView: React.FC<RequirementQualityViewProps> = ({
  projectId,
  requirementId,
}) => {
  const [analysis, setAnalysis] = useState<RequirementQualityAnalysisDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [dismissRationale, setDismissRationale] = useState<string>('');
  const [clarificationText, setClarificationText] = useState<string>('');

  const fetchAnalysis = useCallback(async () => {
    if (!window.desktop?.requirements) return;
    try {
      setLoading(true);
      setError(null);
      const res = await window.desktop.requirements.getQualityAnalysis({
        projectId,
        requirementId,
      });

      if (res.ok) {
        setAnalysis(res.data);
      } else {
        setError(res.error.message);
      }
    } catch {
      setError('Failed to load requirement quality analysis.');
    } finally {
      setLoading(false);
    }
  }, [projectId, requirementId]);

  useEffect(() => {
    void fetchAnalysis();
  }, [fetchAnalysis]);

  const handleAnalyze = async () => {
    if (!window.desktop?.requirements) return;
    try {
      setActionLoading(true);
      setError(null);
      const res = await window.desktop.requirements.analyzeQuality({
        projectId,
        requirementId,
      });

      if (res.ok) {
        setAnalysis(res.data);
      } else {
        setError(res.error.message);
      }
    } catch {
      setError('Failed to analyze requirement quality.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReanalyze = async () => {
    if (!window.desktop?.requirements) return;
    try {
      setActionLoading(true);
      setError(null);
      const res = await window.desktop.requirements.reanalyzeQuality({
        projectId,
        requirementId,
      });

      if (res.ok) {
        setAnalysis(res.data);
      } else {
        setError(res.error.message);
      }
    } catch {
      setError('Failed to re-analyze requirement quality.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReviewFinding = async (
    findingId: string,
    reviewStatus: QualityFindingReviewStatus,
    rationale?: string | null,
    response?: string | null,
  ) => {
    if (!window.desktop?.requirements) return;
    try {
      setActionLoading(true);
      setError(null);
      const res = await window.desktop.requirements.reviewQualityFinding({
        projectId,
        requirementId,
        findingId,
        reviewStatus,
        reviewRationale: rationale ?? null,
        clarificationResponse: response ?? null,
      });

      if (res.ok) {
        // Refresh analysis to reflect updated findings & open count
        await fetchAnalysis();
        setSelectedFindingId(null);
        setDismissRationale('');
        setClarificationText('');
      } else {
        setError(res.error.message);
      }
    } catch {
      setError('Failed to update quality finding review status.');
    } finally {
      setActionLoading(false);
    }
  };

  const getTestabilityBadge = (status: RequirementTestabilityStatus) => {
    switch (status) {
      case 'TESTABLE':
        return {
          bg: 'bg-emerald-500/10',
          text: 'text-emerald-400',
          border: 'border-emerald-500/30',
        };
      case 'PARTIALLY_TESTABLE':
        return { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' };
      case 'NOT_TESTABLE':
        return { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' };
      default:
        return { bg: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-500/30' };
    }
  };

  const getSeverityBadge = (severity: QualityFindingSeverity) => {
    switch (severity) {
      case 'ERROR':
        return { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' };
      case 'WARNING':
        return { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' };
      case 'INFO':
      default:
        return { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' };
    }
  };

  const getReviewStatusBadge = (reviewStatus: QualityFindingReviewStatus) => {
    switch (reviewStatus) {
      case 'OPEN':
        return { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' };
      case 'ACKNOWLEDGED':
        return { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' };
      case 'DISMISSED':
      default:
        return { bg: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-500/30' };
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6">
        <div className="flex items-center gap-3 text-zinc-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-indigo-400" />
          <span className="text-sm">Loading requirement quality analysis...</span>
        </div>
      </div>
    );
  }

  if (error && !analysis) {
    return (
      <div className="rounded-xl border border-red-900/30 bg-red-950/20 p-6">
        <div className="text-sm font-medium text-red-400">Quality Analysis Error</div>
        <div className="mt-1 text-xs text-red-300/80">{error}</div>
        <button
          type="button"
          onClick={() => void fetchAnalysis()}
          className="mt-3 rounded-lg border border-red-800/50 bg-red-900/30 px-3 py-1.5 text-xs text-red-200 hover:bg-red-900/50"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 p-8 text-center">
        <div
          className="mx-auto flex items-center justify-center rounded-full bg-zinc-900 text-zinc-400"
          style={{ width: '48px', height: '48px', minWidth: '48px', minHeight: '48px', flexShrink: 0 }}
        >
          <svg
            width="24"
            height="24"
            style={{ width: '24px', height: '24px', minWidth: '24px', minHeight: '24px', flexShrink: 0 }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h3 className="mt-3 text-sm font-medium text-zinc-200">Unanalyzed Requirement</h3>
        <p className="mt-1 text-xs text-zinc-400 max-w-md mx-auto">
          Run deterministic quality analysis to assess testability, detect ambiguities, identify
          missing details, and generate clarification questions.
        </p>
        <button
          type="button"
          disabled={actionLoading}
          onClick={() => void handleAnalyze()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-indigo-600/50 bg-indigo-600/20 px-4 py-2 text-xs font-medium text-indigo-300 hover:bg-indigo-600/30 transition-colors disabled:opacity-50"
        >
          {actionLoading ? 'Analyzing...' : 'Analyze Quality & Testability'}
        </button>
      </div>
    );
  }

  const testabilityStyle = getTestabilityBadge(analysis.testabilityStatus);
  const errorCount = analysis.findings.filter(f => f.severity === 'ERROR').length;
  const warningCount = analysis.findings.filter(f => f.severity === 'WARNING').length;
  const dismissedCount = analysis.findings.filter(f => f.reviewStatus === 'DISMISSED').length;
  const acknowledgedCount = analysis.findings.filter(f => f.reviewStatus === 'ACKNOWLEDGED').length;

  return (
    <div className="space-y-4">
      {/* Staleness Banner */}
      {analysis.isStale && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-300">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              <svg
                className="h-4 w-4 shrink-0 text-amber-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
              <span>
                <strong>Analysis Stale:</strong> The requirement text was modified since this
                quality analysis was performed.
              </span>
            </div>
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => void handleReanalyze()}
              className="rounded-md border border-amber-500/40 bg-amber-500/20 px-2.5 py-1 text-xs font-medium text-amber-200 hover:bg-amber-500/30 disabled:opacity-50"
            >
              {actionLoading ? 'Updating...' : 'Re-analyze Now'}
            </button>
          </div>
        </div>
      )}

      {/* Main Analysis Card */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-5">
        {/* Header Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border ${testabilityStyle.bg} ${testabilityStyle.text} ${testabilityStyle.border}`}
            >
              {analysis.testabilityStatus.replace('_', ' ')}
            </span>

            {analysis.qualityScore !== null && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono bg-zinc-900 border border-zinc-700 text-zinc-200">
                Quality Score: {analysis.qualityScore}/100
              </span>
            )}

            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-zinc-900 text-zinc-400 border border-zinc-800">
              {analysis.analysisMethod.replace('_', ' ')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => void handleReanalyze()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-50"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {actionLoading ? 'Analyzing...' : 'Re-analyze'}
            </button>
          </div>
        </div>

        {/* Metric Summary Counters */}
        <div className="grid grid-cols-2 gap-2 pt-4 sm:grid-cols-4 sm:gap-3">
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-2.5 text-center">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
              Open Findings
            </div>
            <div className="text-base font-semibold text-amber-400">
              {analysis.openFindingsCount}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-2.5 text-center">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
              Errors
            </div>
            <div className="text-base font-semibold text-red-400">{errorCount}</div>
          </div>
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-2.5 text-center">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
              Warnings
            </div>
            <div className="text-base font-semibold text-amber-400">{warningCount}</div>
          </div>
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-2.5 text-center">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
              Reviewed / Dismissed
            </div>
            <div className="text-base font-semibold text-zinc-300">
              {acknowledgedCount + dismissedCount}
            </div>
          </div>
        </div>

        {/* Clarification Questions */}
        {analysis.clarificationQuestions.length > 0 && (
          <div className="mt-5 rounded-lg border border-indigo-950/60 bg-indigo-950/20 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-300 font-mono">
              <svg
                className="h-4 w-4 text-indigo-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Clarification Prompts for Stakeholders
            </div>
            <ul className="mt-2 space-y-1.5 pl-5 list-disc text-xs text-indigo-200/90">
              {analysis.clarificationQuestions.map((q, idx) => (
                <li key={idx}>{q}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Findings List */}
        <div className="mt-6 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono">
            Detailed Quality Findings ({analysis.findings.length})
          </div>

          {analysis.findings.length === 0 ? (
            <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/30 p-4 text-center text-xs text-emerald-400">
              ✓ No quality, testability, or ambiguity issues detected. Requirement meets
              deterministic criteria.
            </div>
          ) : (
            analysis.findings.map(f => {
              const sev = getSeverityBadge(f.severity);
              const rev = getReviewStatusBadge(f.reviewStatus);
              const isSelected = selectedFindingId === f.id;

              return (
                <div
                  key={f.id}
                  className={`rounded-lg border p-4 transition-colors ${
                    f.reviewStatus === 'DISMISSED'
                      ? 'border-zinc-800/50 bg-zinc-950/30 opacity-70'
                      : 'border-zinc-800 bg-zinc-900/40'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${sev.bg} ${sev.text} ${sev.border}`}
                      >
                        {f.severity}
                      </span>
                      <span className="text-xs font-mono font-medium text-zinc-200">{f.code}</span>
                      <span className="text-[10px] font-mono text-zinc-500">[{f.category}]</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono border ${rev.bg} ${rev.text} ${rev.border}`}
                      >
                        {f.reviewStatus}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedFindingId(isSelected ? null : f.id)}
                        className="rounded px-2 py-0.5 text-[11px] text-zinc-400 hover:text-zinc-200 border border-zinc-700 bg-zinc-800"
                      >
                        {isSelected ? 'Cancel' : 'Review'}
                      </button>
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-zinc-300">{f.message}</p>

                  {f.evidenceText && (
                    <div className="mt-2 text-xs">
                      <span className="text-zinc-500 font-mono">Evidence: </span>
                      <code className="rounded bg-zinc-900 border border-zinc-700 px-1.5 py-0.5 text-zinc-200 font-mono">
                        "{f.evidenceText}"
                      </code>
                      {f.startOffset !== null && f.endOffset !== null && (
                        <span className="ml-2 text-[10px] text-zinc-500 font-mono">
                          (offset {f.startOffset}..{f.endOffset})
                        </span>
                      )}
                    </div>
                  )}

                  {f.suggestedClarification && (
                    <div className="mt-2 text-xs text-indigo-300/90">
                      <span className="font-semibold text-indigo-400">
                        Suggested Clarification:{' '}
                      </span>
                      {f.suggestedClarification}
                    </div>
                  )}

                  {f.reviewRationale && (
                    <div className="mt-2 rounded bg-zinc-950/80 border border-zinc-800 p-2 text-xs text-zinc-400">
                      <span className="font-semibold text-zinc-300">Review Rationale: </span>
                      {f.reviewRationale}
                    </div>
                  )}

                  {f.clarificationResponse && (
                    <div className="mt-2 rounded bg-indigo-950/30 border border-indigo-900/40 p-2 text-xs text-indigo-200">
                      <span className="font-semibold text-indigo-300">
                        Clarification Response:{' '}
                      </span>
                      {f.clarificationResponse}
                    </div>
                  )}

                  {/* Inline Review Action Form */}
                  {isSelected && (
                    <div className="mt-3 border-t border-zinc-800/80 pt-3 space-y-3">
                      <div>
                        <label className="block text-[11px] font-mono text-zinc-400">
                          Dismissal Rationale / Review Note (Optional)
                        </label>
                        <input
                          type="text"
                          value={dismissRationale}
                          onChange={e => setDismissRationale(e.target.value)}
                          placeholder="e.g. Acceptable for Phase 1 MVP"
                          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-200 focus:border-indigo-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-mono text-zinc-400">
                          Record Clarification Response (Optional)
                        </label>
                        <input
                          type="text"
                          value={clarificationText}
                          onChange={e => setClarificationText(e.target.value)}
                          placeholder="e.g. Maximum latency is 200 milliseconds"
                          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-200 focus:border-indigo-500 focus:outline-none"
                        />
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() =>
                            void handleReviewFinding(
                              f.id,
                              'ACKNOWLEDGED',
                              dismissRationale || f.reviewRationale,
                              clarificationText || f.clarificationResponse,
                            )
                          }
                          className="rounded bg-blue-600/20 border border-blue-500/40 px-3 py-1 text-xs font-medium text-blue-300 hover:bg-blue-600/30 disabled:opacity-50"
                        >
                          Acknowledge
                        </button>
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() =>
                            void handleReviewFinding(
                              f.id,
                              'DISMISSED',
                              dismissRationale || f.reviewRationale,
                              clarificationText || f.clarificationResponse,
                            )
                          }
                          className="rounded bg-zinc-800 border border-zinc-600 px-3 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
                        >
                          Dismiss Finding
                        </button>
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => void handleReviewFinding(f.id, 'OPEN', null, null)}
                          className="rounded bg-amber-600/20 border border-amber-500/40 px-3 py-1 text-xs font-medium text-amber-300 hover:bg-amber-600/30 disabled:opacity-50"
                        >
                          Reset to Open
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
