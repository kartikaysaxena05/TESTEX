/**
 * @file apps/desktop/src/renderer/features/failures/QuickFixEligibilityCard.tsx
 * UI component for AI Quick-Fix Eligibility & Safety Analysis (V7 Phase 99).
 * Displays candidate fix scope, blast radius, git state, 16 safety rule evaluations,
 * and deterministic eligibility decisions.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  QuickFixEligibilityAssessmentDto,
  QuickFixEligibilityDecisionDto,
  QuickFixRiskLevelDto,
} from '@ai-quality/contracts';

export interface QuickFixEligibilityCardProps {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly onAssessmentUpdated?: (assessment: QuickFixEligibilityAssessmentDto) => void;
}

export const QuickFixEligibilityCard: React.FC<QuickFixEligibilityCardProps> = ({
  projectId,
  failureCaseId,
  onAssessmentUpdated,
}) => {
  const [assessment, setAssessment] = useState<QuickFixEligibilityAssessmentDto | null>(null);
  const [history, setHistory] = useState<readonly QuickFixEligibilityAssessmentDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const activeProjectRef = useRef(projectId);
  const activeFailureRef = useRef(failureCaseId);

  useEffect(() => {
    activeProjectRef.current = projectId;
    activeFailureRef.current = failureCaseId;
  }, [projectId, failureCaseId]);

  const loadAssessment = useCallback(async () => {
    const bridge = window.desktop?.quickFix;
    if (!bridge) return;

    setIsLoading(true);
    setError(null);

    try {
      const [currentRes, historyRes] = await Promise.all([
        bridge.getAssessment({ projectId, failureCaseId }),
        bridge.listAssessments({ projectId, failureCaseId }),
      ]);

      if (activeProjectRef.current !== projectId || activeFailureRef.current !== failureCaseId) {
        return;
      }

      if (currentRes.ok) {
        setAssessment(currentRes.data);
      } else {
        setError(currentRes.error.message);
      }

      if (historyRes.ok) {
        setHistory(historyRes.data);
      }
    } catch (err) {
      if (activeProjectRef.current === projectId && activeFailureRef.current === failureCaseId) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (activeProjectRef.current === projectId && activeFailureRef.current === failureCaseId) {
        setIsLoading(false);
      }
    }
  }, [projectId, failureCaseId]);

  useEffect(() => {
    void loadAssessment();
  }, [loadAssessment]);

  const handleEvaluate = async () => {
    const bridge = window.desktop?.quickFix;
    if (!bridge) return;

    setIsEvaluating(true);
    setError(null);

    try {
      const res = await bridge.evaluateEligibility({
        projectId,
        failureCaseId,
        actor: 'USER',
      });

      if (activeProjectRef.current !== projectId || activeFailureRef.current !== failureCaseId) {
        return;
      }

      if (res.ok) {
        setAssessment(res.data);
        onAssessmentUpdated?.(res.data);
        void loadAssessment();
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      if (activeProjectRef.current === projectId && activeFailureRef.current === failureCaseId) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (activeProjectRef.current === projectId && activeFailureRef.current === failureCaseId) {
        setIsEvaluating(false);
      }
    }
  };

  const getDecisionBadge = (decision: QuickFixEligibilityDecisionDto) => {
    switch (decision) {
      case 'ELIGIBLE':
        return (
          <span
            data-testid="decision-badge"
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-500/50"
          >
            ELIGIBLE
          </span>
        );
      case 'NOT_ELIGIBLE':
        return (
          <span
            data-testid="decision-badge"
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950/60 text-rose-300 border border-rose-500/50"
          >
            NOT ELIGIBLE
          </span>
        );
      case 'NEEDS_HUMAN_REVIEW':
        return (
          <span
            data-testid="decision-badge"
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/60 text-amber-300 border border-amber-500/50"
          >
            NEEDS HUMAN REVIEW
          </span>
        );
      case 'INSUFFICIENT_EVIDENCE':
        return (
          <span
            data-testid="decision-badge"
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-950/60 text-sky-300 border border-sky-500/50"
          >
            INSUFFICIENT EVIDENCE
          </span>
        );
      case 'BLOCKED':
        return (
          <span
            data-testid="decision-badge"
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-950/80 text-red-400 border border-red-600/70"
          >
            BLOCKED BY SAFETY
          </span>
        );
      default:
        return (
          <span
            data-testid="decision-badge"
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-800 text-neutral-300 border border-neutral-700"
          >
            {decision}
          </span>
        );
    }
  };

  const getRiskBadge = (level: QuickFixRiskLevelDto) => {
    switch (level) {
      case 'LOW':
        return <span className="text-xs font-medium text-emerald-400">Risk: LOW</span>;
      case 'MEDIUM':
        return <span className="text-xs font-medium text-amber-400">Risk: MEDIUM</span>;
      case 'HIGH':
        return <span className="text-xs font-medium text-orange-400">Risk: HIGH</span>;
      case 'CRITICAL':
        return <span className="text-xs font-bold text-rose-500">Risk: CRITICAL</span>;
      default:
        return <span className="text-xs text-neutral-400">Risk: {level}</span>;
    }
  };

  return (
    <div
      data-testid="quick-fix-card"
      className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 shadow-lg space-y-4"
    >
      {/* Header & Controls */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
            AI Quick-Fix Eligibility & Safety Analysis
            {assessment && getDecisionBadge(assessment.decision)}
          </h3>
          <p className="text-xs text-neutral-400 mt-0.5">
            Phase 99: Deterministic multi-rule safety inspection and candidate scope qualification.
          </p>
        </div>

        <button
          type="button"
          data-testid="evaluate-quick-fix-btn"
          disabled={isEvaluating}
          onClick={handleEvaluate}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-xs font-medium text-white transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {isEvaluating ? (
            <>
              <svg
                className="animate-spin h-3.5 w-3.5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Evaluating...
            </>
          ) : assessment ? (
            'Re-evaluate Eligibility'
          ) : (
            'Evaluate Quick-Fix Eligibility'
          )}
        </button>
      </div>

      {/* Safety Policy Constraint Disclaimer */}
      <div
        data-testid="phase99-boundary-notice"
        className="bg-neutral-950/80 border border-neutral-800 rounded px-3 py-2 text-xs text-neutral-400 flex items-center gap-2"
      >
        <span className="text-amber-400 font-semibold">Strict Boundary:</span>
        Analysis and certification only. AI patch generation, source code editing, Git commits, and
        autonomous repair are strictly prohibited in Phase 99.
      </div>

      {error && (
        <div
          data-testid="quick-fix-error"
          className="p-3 bg-red-950/40 border border-red-800/60 rounded text-xs text-red-300"
        >
          {error}
        </div>
      )}

      {isLoading && !assessment ? (
        <div className="py-6 text-center text-xs text-neutral-500">
          Loading quick-fix assessment state...
        </div>
      ) : !assessment ? (
        <div
          data-testid="quick-fix-empty-state"
          className="py-6 text-center border border-dashed border-neutral-800 rounded text-xs text-neutral-500 space-y-2"
        >
          <p>No quick-fix eligibility assessment recorded yet.</p>
          <p className="text-neutral-400">
            Click &quot;Evaluate Quick-Fix Eligibility&quot; to inspect candidate scope, blast
            radius, Git state, and 16 safety policies.
          </p>
        </div>
      ) : (
        <div className="space-y-4 text-xs">
          {/* Summary / Primary Reason Banner */}
          <div className="bg-neutral-950/50 p-3 rounded border border-neutral-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-medium text-neutral-300">Assessment Summary:</span>
              <div className="flex items-center gap-3">
                {getRiskBadge(assessment.riskLevel)}
                <span className="text-neutral-400">
                  Confidence: {Math.round(assessment.confidenceScore * 100)}%
                </span>
              </div>
            </div>
            <p className="text-neutral-300" data-testid="assessment-summary">
              {assessment.summary}
            </p>
          </div>

          {/* Key Metric Grids */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Candidate Scope */}
            <div className="bg-neutral-950 p-3 rounded border border-neutral-800 space-y-1">
              <div className="text-neutral-400 font-medium">Candidate Scope:</div>
              <div className="text-neutral-200 font-semibold" data-testid="scope-metrics">
                {assessment.candidateFiles.length} file(s), {assessment.candidateSymbols.length}{' '}
                symbol(s)
              </div>
              <div className="text-neutral-500 text-[11px] truncate">
                {assessment.candidateFiles.length > 0
                  ? assessment.candidateFiles.join(', ')
                  : 'No candidate files identified'}
              </div>
            </div>

            {/* Blast Radius */}
            <div className="bg-neutral-950 p-3 rounded border border-neutral-800 space-y-1">
              <div className="text-neutral-400 font-medium">Blast Radius:</div>
              <div className="text-neutral-200 font-semibold" data-testid="blast-radius-metrics">
                {assessment.blastRadius.totalDependentFiles} dependent file(s)
              </div>
              <div className="text-neutral-500 text-[11px]">
                {assessment.blastRadius.highRiskDependents &&
                assessment.blastRadius.highRiskDependents.length > 0 ? (
                  <span className="text-rose-400">
                    High risk: {assessment.blastRadius.highRiskDependents.join(', ')}
                  </span>
                ) : (
                  <span>
                    Modules: {assessment.blastRadius.affectedModules.join(', ') || 'root'}
                  </span>
                )}
              </div>
            </div>

            {/* Git State */}
            <div className="bg-neutral-950 p-3 rounded border border-neutral-800 space-y-1">
              <div className="text-neutral-400 font-medium">Git Working Tree:</div>
              <div className="flex items-center gap-2" data-testid="git-state-metrics">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    assessment.gitClean ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                <span className="text-neutral-200 font-semibold">
                  {assessment.gitClean ? 'Clean Worktree' : 'Uncommitted Changes'}
                </span>
              </div>
              <div className="text-neutral-500 text-[11px] truncate">
                Branch: {assessment.gitBranch || 'N/A'} (
                {assessment.gitCommitSha?.slice(0, 7) || 'HEAD'})
              </div>
            </div>
          </div>

          {/* Blocking Rules & Warnings */}
          {assessment.blockingRules.length > 0 && (
            <div className="bg-rose-950/30 border border-rose-800/50 rounded p-3 space-y-1">
              <div className="text-rose-300 font-medium">Safety Policy Violations (Blocking):</div>
              <ul className="list-disc list-inside text-rose-400 space-y-0.5">
                {assessment.blockingRules.map(rule => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Matched Rules Overview */}
          <div className="space-y-1.5">
            <div className="text-neutral-400 font-medium">
              Rules Evaluation ({assessment.matchedRules.length} / 16 satisfied):
            </div>
            <div className="flex flex-wrap gap-1.5" data-testid="matched-rules-list">
              {assessment.matchedRules.map(rule => (
                <span
                  key={rule}
                  className="px-2 py-0.5 rounded text-[10px] font-mono bg-neutral-800 text-neutral-300 border border-neutral-700"
                >
                  ✓ {rule}
                </span>
              ))}
            </div>
          </div>

          {/* Required Verification Tests */}
          {assessment.requiredTests.length > 0 && (
            <div className="bg-neutral-950 p-3 rounded border border-neutral-800 space-y-1.5">
              <div className="text-neutral-400 font-medium">
                Required Regression Verification Tests ({assessment.requiredTests.length}):
              </div>
              <ul className="divide-y divide-neutral-800/60">
                {assessment.requiredTests.map(test => (
                  <li
                    key={test.testId || test.testName}
                    className="py-1 flex items-center justify-between"
                  >
                    <span className="text-neutral-200">{test.testName}</span>
                    <span className="text-[10px] text-neutral-400 font-mono">{test.testType}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* History Footer */}
          {history.length > 1 && (
            <div className="text-[11px] text-neutral-500 pt-2 border-t border-neutral-800/60 flex items-center justify-between">
              <span>Assessment lineage: #{assessment.id.slice(0, 8)}</span>
              <span>Total evaluations on this defect: {history.length}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
