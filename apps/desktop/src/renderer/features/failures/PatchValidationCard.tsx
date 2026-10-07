/**
 * @file apps/desktop/src/renderer/features/failures/PatchValidationCard.tsx
 * UI component for Patch Validation & Before/After Testing (V7 Phase 103).
 * Visualizes before/after differential test results, targeted regression test suite,
 * controlled quality gates (typecheck, lint, build), and scope audit.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  DefectPatchValidationDto,
  PatchValidationOutcomeDto,
  RegressionTestResultDto,
  QualityGateResultDto,
} from '@ai-quality/contracts';

export interface PatchValidationCardProps {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly patchProposalId?: string;
  readonly sandboxId?: string;
  readonly onValidationCompleted?: (validation: DefectPatchValidationDto) => void;
}

export const PatchValidationCard: React.FC<PatchValidationCardProps> = ({
  projectId,
  failureCaseId,
  patchProposalId,
  sandboxId,
  onValidationCompleted,
}) => {
  const [validations, setValidations] = useState<readonly DefectPatchValidationDto[]>([]);
  const [activeValidation, setActiveValidation] = useState<DefectPatchValidationDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [skipQualityGates, setSkipQualityGates] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<
    'comparison' | 'regression' | 'quality_gates' | 'audit'
  >('comparison');

  const activeProjectRef = useRef(projectId);
  const activeFailureRef = useRef(failureCaseId);

  useEffect(() => {
    activeProjectRef.current = projectId;
    activeFailureRef.current = failureCaseId;
  }, [projectId, failureCaseId]);

  const loadValidations = useCallback(async () => {
    const bridge = window.desktop?.patchValidation;
    if (!bridge) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await bridge.list({
        projectId,
        failureCaseId,
        patchProposalId,
        sandboxId,
      });

      if (activeProjectRef.current !== projectId || activeFailureRef.current !== failureCaseId) {
        return;
      }

      if (res.ok) {
        setValidations(res.data);
        const latest = res.data[0] ?? null;
        setActiveValidation(latest);
        if (latest && onValidationCompleted && latest.status === 'COMPLETED') {
          onValidationCompleted(latest);
        }
      } else {
        setError(res.error.message);
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
  }, [projectId, failureCaseId, patchProposalId, sandboxId, onValidationCompleted]);

  useEffect(() => {
    void loadValidations();
  }, [loadValidations]);

  const handleExecuteValidation = async () => {
    if (!patchProposalId) {
      setError('A candidate patch proposal must be generated before validation.');
      return;
    }

    const bridge = window.desktop?.patchValidation;
    if (!bridge) return;

    setIsExecuting(true);
    setError(null);

    try {
      const res = await bridge.execute({
        projectId,
        failureCaseId,
        patchProposalId,
        sandboxId,
        skipQualityGates,
      });

      if (res.ok) {
        setActiveValidation(res.data);
        setValidations(prev => [res.data, ...prev.filter(v => v.id !== res.data.id)]);
        if (onValidationCompleted) {
          onValidationCompleted(res.data);
        }
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCancelValidation = async () => {
    if (!activeValidation) return;
    const bridge = window.desktop?.patchValidation;
    if (!bridge) return;

    setIsCancelling(true);
    try {
      const res = await bridge.cancel({
        projectId,
        validationId: activeValidation.id,
        reason: 'Cancelled by user from desktop dashboard.',
      });

      if (res.ok) {
        setActiveValidation(res.data);
        setValidations(prev => [res.data, ...prev.filter(v => v.id !== res.data.id)]);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCancelling(false);
    }
  };

  const getOutcomeBadgeClass = (outcome: PatchValidationOutcomeDto) => {
    switch (outcome) {
      case 'VALID':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'INVALID':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'INCONCLUSIVE':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'BLOCKED':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'CANCELLED':
        return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
      default:
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    }
  };

  const isRunning =
    activeValidation &&
    [
      'RUNNING_BEFORE',
      'APPLYING_PATCH',
      'RUNNING_AFTER',
      'RUNNING_REGRESSION',
      'RUNNING_QUALITY_GATES',
    ].includes(activeValidation.status);

  return (
    <div
      data-testid="patch-validation-card"
      className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 shadow-sm"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-400">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">
              Patch Validation & Before/After Testing
              {validations.length > 0 && (
                <span className="ml-2 text-xs font-normal text-zinc-400">
                  ({validations.length} run{validations.length === 1 ? '' : 's'})
                </span>
              )}
            </h3>
            <p className="text-xs text-zinc-400">
              Deterministic verification across isolated pre-patch baseline and patched sandbox
              states
            </p>
          </div>
        </div>

        {/* Outcome & Immutability Badges */}
        <div className="flex items-center gap-2">
          {activeValidation && (
            <>
              <span
                data-testid="validation-outcome-badge"
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${getOutcomeBadgeClass(
                  activeValidation.validationOutcome,
                )}`}
              >
                {activeValidation.validationOutcome}
              </span>
              <span
                data-testid="immutability-badge"
                className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-800/80 px-2 py-0.5 text-xs text-zinc-300"
              >
                0 Authoritative Mutations
              </span>
            </>
          )}

          {/* Action Controls */}
          {isRunning ? (
            <button
              data-testid="cancel-validation-button"
              type="button"
              onClick={handleCancelValidation}
              disabled={isCancelling}
              className="inline-flex items-center rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
            >
              {isCancelling ? 'Cancelling...' : 'Cancel'}
            </button>
          ) : (
            <button
              data-testid="execute-validation-button"
              type="button"
              onClick={handleExecuteValidation}
              disabled={isExecuting || !patchProposalId}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {isExecuting ? 'Validating...' : 'Validate Patch'}
            </button>
          )}
        </div>
      </div>

      {/* Options & Error Banner */}
      {error && (
        <div
          data-testid="validation-error-banner"
          className="mt-3 rounded-md border border-rose-500/20 bg-rose-500/10 p-2.5 text-xs text-rose-300"
        >
          {error}
        </div>
      )}

      {/* Execution Options */}
      <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            data-testid="skip-quality-gates-checkbox"
            type="checkbox"
            checked={skipQualityGates}
            onChange={e => setSkipQualityGates(e.target.checked)}
            className="rounded border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-0"
          />
          <span>Skip Quality Gates (Fast-path testing only)</span>
        </label>
        {activeValidation?.executionDurationMs && (
          <span>Duration: {(activeValidation.executionDurationMs / 1000).toFixed(2)}s</span>
        )}
      </div>

      {/* Empty State */}
      {!activeValidation && !isLoading && !isExecuting && (
        <div
          data-testid="no-validation-state"
          className="mt-4 rounded-md border border-dashed border-zinc-800 p-6 text-center text-xs text-zinc-500"
        >
          No patch validation executed yet. Click &quot;Validate Patch&quot; to execute before/after
          testing.
        </div>
      )}

      {/* Active Validation Body */}
      {activeValidation && (
        <div className="mt-4 space-y-4">
          {/* Reason banner */}
          {activeValidation.validationReason && (
            <div
              data-testid="validation-reason"
              className={`rounded-md border p-3 text-xs ${
                activeValidation.validationOutcome === 'VALID'
                  ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300'
                  : activeValidation.validationOutcome === 'INVALID'
                    ? 'border-rose-500/20 bg-rose-500/5 text-rose-300'
                    : 'border-amber-500/20 bg-amber-500/5 text-amber-300'
              }`}
            >
              <div className="font-semibold">{activeValidation.validationReason}</div>
              <div className="mt-1 text-[11px] opacity-80">
                Base Revision: {activeValidation.baseRevision.slice(0, 8)} | Patch Hash:{' '}
                {activeValidation.patchHash.slice(0, 10)}
              </div>
            </div>
          )}

          {/* Navigation Tabs */}
          <div className="flex border-b border-zinc-800 text-xs font-medium">
            <button
              data-testid="tab-comparison"
              type="button"
              onClick={() => setSelectedTab('comparison')}
              className={`border-b-2 px-3 py-1.5 transition-colors ${
                selectedTab === 'comparison'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Before/After Comparison
            </button>
            <button
              data-testid="tab-regression"
              type="button"
              onClick={() => setSelectedTab('regression')}
              className={`border-b-2 px-3 py-1.5 transition-colors ${
                selectedTab === 'regression'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Targeted Regressions ({activeValidation.targetedRegressionTotal})
            </button>
            <button
              data-testid="tab-quality-gates"
              type="button"
              onClick={() => setSelectedTab('quality_gates')}
              className={`border-b-2 px-3 py-1.5 transition-colors ${
                selectedTab === 'quality_gates'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Quality Gates ({activeValidation.qualityGates?.length ?? 0})
            </button>
            <button
              data-testid="tab-audit"
              type="button"
              onClick={() => setSelectedTab('audit')}
              className={`border-b-2 px-3 py-1.5 transition-colors ${
                selectedTab === 'audit'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Scope & Integrity
            </button>
          </div>

          {/* Tab 1: Comparison */}
          {selectedTab === 'comparison' && (
            <div
              data-testid="comparison-panel"
              className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs"
            >
              {/* BEFORE State */}
              <div
                data-testid="before-execution-card"
                className="rounded border border-zinc-800 bg-zinc-950/40 p-3"
              >
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <span className="font-semibold text-zinc-300">BEFORE (Unpatched Baseline)</span>
                  <span
                    data-testid="before-status-badge"
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      activeValidation.beforeStatus === 'FAIL'
                        ? 'bg-rose-500/10 text-rose-400'
                        : 'bg-amber-500/10 text-amber-400'
                    }`}
                  >
                    {activeValidation.beforeStatus}
                  </span>
                </div>
                <div className="mt-2 space-y-1.5 text-zinc-400">
                  <div>
                    <span className="text-zinc-500">Expected:</span>{' '}
                    {activeValidation.beforeExpected ?? 'Defect reproduction condition'}
                  </div>
                  <div>
                    <span className="text-zinc-500">Actual:</span>{' '}
                    <span className="text-rose-300">
                      {activeValidation.beforeActual ?? 'Failure observed in baseline'}
                    </span>
                  </div>
                  {activeValidation.beforeFailureSignature && (
                    <div className="font-mono text-[10px] text-zinc-500">
                      Signature: {activeValidation.beforeFailureSignature.slice(0, 16)}
                    </div>
                  )}
                  {activeValidation.beforeEvidence?.domSnapshot && (
                    <div className="mt-2">
                      <span className="text-zinc-500">DOM Snapshot Snippet:</span>
                      <pre className="mt-1 max-h-24 overflow-x-auto rounded bg-zinc-900 p-1.5 font-mono text-[10px] text-zinc-300">
                        {activeValidation.beforeEvidence.domSnapshot}
                      </pre>
                    </div>
                  )}
                </div>
              </div>

              {/* AFTER State */}
              <div
                data-testid="after-execution-card"
                className="rounded border border-zinc-800 bg-zinc-950/40 p-3"
              >
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <span className="font-semibold text-zinc-300">AFTER (Patched Sandbox)</span>
                  <span
                    data-testid="after-status-badge"
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      activeValidation.afterStatus === 'PASS'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-rose-500/10 text-rose-400'
                    }`}
                  >
                    {activeValidation.afterStatus}
                  </span>
                </div>
                <div className="mt-2 space-y-1.5 text-zinc-400">
                  <div>
                    <span className="text-zinc-500">Expected:</span>{' '}
                    {activeValidation.afterExpected ?? 'Target defect resolved'}
                  </div>
                  <div>
                    <span className="text-zinc-500">Actual:</span>{' '}
                    <span
                      className={
                        activeValidation.afterStatus === 'PASS'
                          ? 'text-emerald-300'
                          : 'text-rose-300'
                      }
                    >
                      {activeValidation.afterActual ?? 'Verified in patched sandbox'}
                    </span>
                  </div>
                  {activeValidation.afterFailureSignature && (
                    <div className="font-mono text-[10px] text-zinc-500">
                      Signature: {activeValidation.afterFailureSignature.slice(0, 16)}
                    </div>
                  )}
                  {activeValidation.afterEvidence?.domSnapshot && (
                    <div className="mt-2">
                      <span className="text-zinc-500">DOM Snapshot Snippet:</span>
                      <pre className="mt-1 max-h-24 overflow-x-auto rounded bg-zinc-900 p-1.5 font-mono text-[10px] text-zinc-300">
                        {activeValidation.afterEvidence.domSnapshot}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Regressions */}
          {selectedTab === 'regression' && (
            <div data-testid="regression-panel" className="space-y-2 text-xs">
              <div className="flex items-center justify-between rounded bg-zinc-950/40 p-2 text-zinc-400">
                <span>Total Evaluated: {activeValidation.targetedRegressionTotal}</span>
                <span className="text-emerald-400">
                  Passed: {activeValidation.targetedRegressionPassed}
                </span>
                <span
                  className={
                    activeValidation.targetedRegressionFailed > 0
                      ? 'font-bold text-rose-400'
                      : 'text-zinc-400'
                  }
                >
                  Failed: {activeValidation.targetedRegressionFailed}
                </span>
              </div>

              {activeValidation.newRegressions && activeValidation.newRegressions.length > 0 ? (
                <div className="space-y-1.5">
                  {activeValidation.newRegressions.map((reg: RegressionTestResultDto) => (
                    <div
                      key={reg.testCaseId}
                      data-testid={`regression-item-${reg.testCaseKey}`}
                      className="flex items-center justify-between rounded border border-rose-500/30 bg-rose-500/10 p-2 text-zinc-200"
                    >
                      <div>
                        <span className="font-semibold text-rose-300">{reg.testCaseKey}</span>:{' '}
                        {reg.testCaseTitle}
                      </div>
                      <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-medium text-rose-300">
                        NEW REGRESSION
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-3 text-center text-emerald-400">
                  ✓ Zero regressions detected across all targeted tests.
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Quality Gates */}
          {selectedTab === 'quality_gates' && (
            <div data-testid="quality-gates-panel" className="space-y-2 text-xs">
              {activeValidation.qualityGates && activeValidation.qualityGates.length > 0 ? (
                activeValidation.qualityGates.map((gate: QualityGateResultDto) => (
                  <div
                    key={gate.checkType}
                    data-testid={`quality-gate-${gate.checkType}`}
                    className="rounded border border-zinc-800 bg-zinc-950/40 p-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-300">{gate.checkType}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          gate.status === 'PASS'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : gate.status === 'FAIL'
                              ? 'bg-rose-500/10 text-rose-400'
                              : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {gate.status}
                      </span>
                    </div>
                    {gate.outputSnippet && (
                      <pre className="mt-1.5 max-h-20 overflow-x-auto rounded bg-zinc-900 p-1 font-mono text-[10px] text-zinc-400">
                        {gate.outputSnippet}
                      </pre>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-zinc-500 text-center p-3">
                  Quality gates were skipped or not configured.
                </div>
              )}
            </div>
          )}

          {/* Tab 4: Scope & Integrity */}
          {selectedTab === 'audit' && (
            <div data-testid="audit-panel" className="space-y-2 text-xs">
              <div className="rounded border border-zinc-800 bg-zinc-950/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Authoritative Repository Clean:</span>
                  <span className="text-emerald-400 font-medium">
                    {activeValidation.originalRepoClean
                      ? '100% UNTOUCHED (0 mutations)'
                      : 'MUTATED'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Same Test Case Verified:</span>
                  <span className="text-zinc-200">
                    {activeValidation.sameTestCaseVerified ? 'YES (Preserved ID)' : 'NO'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Unexpected File Changes:</span>
                  <span
                    className={
                      activeValidation.unexpectedChangesDetected
                        ? 'text-rose-400 font-bold'
                        : 'text-emerald-400'
                    }
                  >
                    {activeValidation.unexpectedChangesDetected ? 'VIOLATIONS DETECTED' : 'NONE'}
                  </span>
                </div>
                {activeValidation.unexpectedFiles &&
                  activeValidation.unexpectedFiles.length > 0 && (
                    <div className="mt-2 rounded bg-rose-500/10 p-2 text-rose-300">
                      <div className="font-semibold">Unexpected files modified:</div>
                      <ul className="list-disc pl-4 mt-1">
                        {activeValidation.unexpectedFiles.map((f: string) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
