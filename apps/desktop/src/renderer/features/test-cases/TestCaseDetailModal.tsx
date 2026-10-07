/**
 * @file apps/desktop/src/renderer/features/test-cases/TestCaseDetailModal.tsx
 * Modal dialog for inspecting a canonical Structured Test Case with validation status and hallucination findings.
 */

import type {
  RequirementTestTraceDto,
  TestCaseDetailDto,
  TestCaseValidationDto,
  ExecutableTestPlanDto,
} from '@ai-quality/contracts';
import React, { useEffect, useState } from 'react';

interface TestCaseDetailModalProps {
  readonly testCase: TestCaseDetailDto;
  readonly onClose: () => void;
  readonly onDelete?: (testCaseId: string) => void;
}

export const TestCaseDetailModal: React.FC<TestCaseDetailModalProps> = ({
  testCase,
  onClose,
  onDelete,
}) => {
  const [validation, setValidation] = useState<TestCaseValidationDto | null>(null);
  const [traces, setTraces] = useState<readonly RequirementTestTraceDto[]>([]);
  const [plan, setPlan] = useState<ExecutableTestPlanDto | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [compilerError, setCompilerError] = useState<string | null>(null);
  const [isEnqueueingRun, setIsEnqueueingRun] = useState<boolean>(false);
  const [enqueueRunSuccess, setEnqueueRunSuccess] = useState<string | null>(null);
  const [enqueueRunError, setEnqueueRunError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'validation' | 'traceability' | 'plan'>(
    'details',
  );

  useEffect(() => {
    let isMounted = true;
    const fetchLatestValidation = async () => {
      if (!window.desktop?.testValidation) return;
      try {
        const res = await window.desktop.testValidation.getLatest({
          projectId: testCase.projectId,
          testCaseId: testCase.id,
        });
        if (isMounted && res.ok && res.data) {
          setValidation(res.data);
        }
      } catch (err: unknown) {
        console.error('Failed to load validation:', err);
      }
    };

    const fetchTraces = async () => {
      if (!window.desktop?.traceability) return;
      try {
        const res = await window.desktop.traceability.listByTestCase({
          projectId: testCase.projectId,
          testCaseId: testCase.id,
        });
        if (isMounted && res.ok) {
          setTraces(res.data.traces);
        }
      } catch (err: unknown) {
        console.error('Failed to load traces:', err);
      }
    };

    const fetchPlan = async () => {
      if (!window.desktop?.planCompiler) return;
      try {
        const res = await window.desktop.planCompiler.getByTestCase({
          projectId: testCase.projectId,
          testCaseId: testCase.id,
        });
        if (isMounted && res.ok && res.data) {
          setPlan(res.data);
        }
      } catch (err: unknown) {
        console.error('Failed to load executable plan:', err);
      }
    };

    fetchLatestValidation();
    fetchTraces();
    fetchPlan();
    return () => {
      isMounted = false;
    };
  }, [testCase.id, testCase.projectId]);

  const handleCompilePlan = async (previewOnly = false) => {
    if (!window.desktop?.planCompiler) return;
    setIsCompiling(true);
    setCompilerError(null);
    try {
      const res = previewOnly
        ? await window.desktop.planCompiler.preview({
            projectId: testCase.projectId,
            testCaseId: testCase.id,
          })
        : await window.desktop.planCompiler.compile({
            projectId: testCase.projectId,
            testCaseId: testCase.id,
            forceRecompile: true,
          });

      if (res.ok) {
        setPlan(res.data);
        setActiveTab('plan');
      } else {
        setCompilerError(res.error.message);
      }
    } catch (err: unknown) {
      setCompilerError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCompiling(false);
    }
  };

  const handleEnqueueRun = async () => {
    if (!window.desktop?.testRuns) return;
    setIsEnqueueingRun(true);
    setEnqueueRunError(null);
    setEnqueueRunSuccess(null);
    try {
      const res = await window.desktop.testRuns.enqueue({
        projectId: testCase.projectId,
        testCaseId: testCase.id,
      });
      if (res.ok) {
        setEnqueueRunSuccess(
          `Test run enqueued successfully! ID: ${res.data.id.slice(0, 8)}... (Status: ${res.data.status})`,
        );
      } else {
        setEnqueueRunError(res.error.message);
      }
    } catch (err: unknown) {
      setEnqueueRunError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsEnqueueingRun(false);
    }
  };

  const handleRunValidation = async () => {
    if (!window.desktop?.testValidation) return;
    setIsValidating(true);
    setValidationError(null);
    try {
      const res = await window.desktop.testValidation.validateTestCase({
        projectId: testCase.projectId,
        testCaseId: testCase.id,
      });
      if (res.ok) {
        setValidation(res.data);
        setActiveTab('validation');
      } else {
        setValidationError(res.error.message);
      }
    } catch (err: unknown) {
      setValidationError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsValidating(false);
    }
  };

  const getTypeBadgeClass = (type: string) => {
    switch (type) {
      case 'POSITIVE':
        return 'bg-emerald-950 text-emerald-300 border-emerald-800';
      case 'NEGATIVE':
        return 'bg-rose-950 text-rose-300 border-rose-800';
      case 'BOUNDARY':
        return 'bg-amber-950 text-amber-300 border-amber-800';
      case 'VALIDATION':
        return 'bg-purple-950 text-purple-300 border-purple-800';
      case 'SECURITY':
        return 'bg-red-950 text-red-300 border-red-800';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const getPriorityBadgeClass = (priority: string) => {
    switch (priority) {
      case 'CRITICAL':
        return 'bg-red-900 text-red-200 border-red-700';
      case 'HIGH':
        return 'bg-orange-900 text-orange-200 border-orange-700';
      case 'MEDIUM':
        return 'bg-blue-900 text-blue-200 border-blue-700';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const getValidationBadge = (v: TestCaseValidationDto | null) => {
    if (!v) {
      return (
        <span className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
          NOT VALIDATED
        </span>
      );
    }
    if (v.isStale) {
      return (
        <span className="rounded border border-amber-800 bg-amber-950/80 px-2 py-0.5 text-xs font-bold text-amber-300">
          STALE
        </span>
      );
    }
    switch (v.status) {
      case 'VALID':
        return (
          <span className="rounded border border-emerald-700 bg-emerald-950 px-2 py-0.5 text-xs font-bold text-emerald-300">
            ✓ VALID
          </span>
        );
      case 'REVIEW_REQUIRED':
        return (
          <span className="rounded border border-amber-700 bg-amber-950 px-2 py-0.5 text-xs font-bold text-amber-300">
            ⚠ REVIEW REQUIRED
          </span>
        );
      case 'REJECTED':
        return (
          <span className="rounded border border-rose-700 bg-rose-950 px-2 py-0.5 text-xs font-bold text-rose-300">
            ✕ REJECTED
          </span>
        );
      default:
        return (
          <span className="rounded border border-red-800 bg-red-950 px-2 py-0.5 text-xs text-red-300">
            ERROR
          </span>
        );
    }
  };

  const getSeverityBadgeClass = (severity: string) => {
    switch (severity) {
      case 'BLOCKER':
        return 'bg-rose-900 text-rose-100 border-rose-600 font-extrabold';
      case 'ERROR':
        return 'bg-rose-950 text-rose-300 border-rose-800 font-bold';
      case 'WARNING':
        return 'bg-amber-950 text-amber-300 border-amber-800';
      case 'INFO':
        return 'bg-cyan-950 text-cyan-300 border-cyan-800';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-slate-800 bg-slate-950/80 px-6 py-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-3">
              <span className="rounded bg-indigo-900/60 px-2 py-0.5 font-mono text-sm font-bold text-indigo-300 border border-indigo-700">
                {testCase.testCaseKey}
              </span>
              <span
                className={`rounded border px-2 py-0.5 text-xs font-semibold ${getTypeBadgeClass(
                  testCase.type,
                )}`}
              >
                {testCase.type}
              </span>
              <span
                className={`rounded border px-2 py-0.5 text-xs font-medium ${getPriorityBadgeClass(
                  testCase.priority,
                )}`}
              >
                {testCase.priority}
              </span>
              {getValidationBadge(validation)}
            </div>
            <h2 className="text-lg font-bold text-slate-100">{testCase.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-6 py-2">
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveTab('details')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition ${
                activeTab === 'details'
                  ? 'bg-slate-800 text-slate-100 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Test Case Details
            </button>
            <button
              onClick={() => setActiveTab('validation')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded transition ${
                activeTab === 'validation'
                  ? 'bg-slate-800 text-slate-100 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>AI Validation & Hallucination Controls</span>
              {validation && validation.findings.length > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    validation.status === 'REJECTED'
                      ? 'bg-rose-900 text-rose-200'
                      : 'bg-amber-900 text-amber-200'
                  }`}
                >
                  {validation.findings.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('traceability')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded transition ${
                activeTab === 'traceability'
                  ? 'bg-slate-800 text-slate-100 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Traceability ({traces.length})</span>
              {traces.some(t => t.isStale) && (
                <span className="rounded-full bg-amber-900 text-amber-200 px-1.5 py-0.2 text-[10px] font-bold">
                  Stale
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('plan')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded transition ${
                activeTab === 'plan'
                  ? 'bg-slate-800 text-slate-100 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Executable Plan</span>
              {plan && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    plan.status === 'VALID'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : plan.status === 'INVALID'
                        ? 'bg-rose-950 text-rose-300 border border-rose-800'
                        : 'bg-amber-950 text-amber-300 border border-amber-800'
                  }`}
                >
                  {plan.status}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleCompilePlan(true)}
              disabled={isCompiling}
              className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700 transition disabled:opacity-50"
            >
              Preview Plan
            </button>
            <button
              onClick={() => handleCompilePlan(false)}
              disabled={isCompiling}
              className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500 transition disabled:opacity-50 flex items-center space-x-1.5"
            >
              {isCompiling ? (
                <span>Compiling...</span>
              ) : (
                <>
                  <span>⚙ Compile Plan</span>
                </>
              )}
            </button>
            <button
              onClick={handleRunValidation}
              disabled={isValidating}
              className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500 transition disabled:opacity-50 flex items-center space-x-1.5"
            >
              {isValidating ? (
                <span>Validating...</span>
              ) : (
                <>
                  <span>⚡ Validate</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Compiler Error Banner */}
        {compilerError && (
          <div className="bg-rose-950/80 border-b border-rose-800 px-6 py-2 text-xs text-rose-300">
            Plan Compilation Error: {compilerError}
          </div>
        )}

        {/* Validation Error Banner */}
        {validationError && (
          <div className="bg-rose-950/80 border-b border-rose-800 px-6 py-2 text-xs text-rose-300">
            Validation Error: {validationError}
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm text-slate-200">
          {activeTab === 'traceability' ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Linked Source Requirements (Reverse Traceability)
                  </h4>
                  <span className="text-xs font-mono text-slate-400">
                    {traces.length} {traces.length === 1 ? 'link' : 'links'}
                  </span>
                </div>

                {traces.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">
                    No requirement links recorded for this test case.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {traces.map(trace => (
                      <div
                        key={trace.id}
                        className={`rounded-lg border p-3 text-xs space-y-2 ${
                          trace.isStale
                            ? 'bg-amber-950/10 border-amber-800/50'
                            : 'bg-slate-900/60 border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-800/40">
                              {trace.requirementKey}
                            </span>
                            <span className="font-medium text-slate-200">
                              {trace.requirementTitle}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                              {trace.origin}
                            </span>
                            {trace.isStale ? (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                                ⚠️ STALE ({trace.staleReason ?? 'VERSION_ADVANCED'})
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                                ✓ CURRENT
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
                          <div>
                            Generated at Requirement Version:{' '}
                            <strong className="text-slate-200">
                              v{trace.requirementVersionNumber}
                            </strong>
                            {trace.currentRequirementVersionNumber !==
                              trace.requirementVersionNumber && (
                              <span className="text-amber-400 ml-1">
                                (Current Requirement Version: v
                                {trace.currentRequirementVersionNumber})
                              </span>
                            )}
                          </div>
                          {trace.scenarioKey && (
                            <div>
                              Scenario:{' '}
                              <span className="font-mono text-indigo-300">{trace.scenarioKey}</span>
                            </div>
                          )}
                          {trace.generationRunId && (
                            <div>
                              Run ID:{' '}
                              <span className="font-mono text-slate-400">
                                {trace.generationRunId.slice(0, 8)}...
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'validation' ? (
            <div className="space-y-4">
              {validation ? (
                <>
                  {/* Validation Summary Card */}
                  <div
                    className={`rounded-lg border p-4 text-xs ${
                      validation.status === 'VALID'
                        ? 'border-emerald-800 bg-emerald-950/30'
                        : validation.status === 'REVIEW_REQUIRED'
                          ? 'border-amber-800 bg-amber-950/30'
                          : 'border-rose-800 bg-rose-950/30'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold uppercase tracking-wider text-slate-300">
                        Verdict: {validation.status}
                      </span>
                      <span className="text-slate-400 font-mono text-[11px]">
                        Validator: {validation.validatorVersion} (
                        {new Date(validation.createdAt).toLocaleTimeString()})
                      </span>
                    </div>
                    <p className="text-slate-200">{validation.summary}</p>
                    {validation.isStale && (
                      <div className="mt-2 text-amber-300 font-medium">
                        ⚠ Warning: {validation.staleReason}
                      </div>
                    )}

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-slate-800">
                      <div className="rounded bg-slate-900/60 p-2 text-center">
                        <div className="text-slate-400 text-[10px]">Total Findings</div>
                        <div className="font-bold text-slate-200 font-mono">
                          {validation.metrics.totalFindings}
                        </div>
                      </div>
                      <div className="rounded bg-slate-900/60 p-2 text-center">
                        <div className="text-slate-400 text-[10px]">Blockers / Errors</div>
                        <div className="font-bold text-rose-400 font-mono">
                          {validation.metrics.blockerCount + validation.metrics.errorCount}
                        </div>
                      </div>
                      <div className="rounded bg-slate-900/60 p-2 text-center">
                        <div className="text-slate-400 text-[10px]">Warnings</div>
                        <div className="font-bold text-amber-400 font-mono">
                          {validation.metrics.warningCount}
                        </div>
                      </div>
                      <div className="rounded bg-slate-900/60 p-2 text-center">
                        <div className="text-slate-400 text-[10px]">Grounded</div>
                        <div className="font-bold text-emerald-400 font-mono">
                          {validation.metrics.grounded ? 'YES' : 'NO'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Findings List */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Validation Findings ({validation.findings.length})
                    </h4>
                    {validation.findings.length > 0 ? (
                      <div className="space-y-2">
                        {validation.findings.map(f => (
                          <div
                            key={f.id}
                            className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs space-y-1.5"
                          >
                            <div className="flex items-center space-x-2">
                              <span
                                className={`rounded border px-2 py-0.5 text-[10px] ${getSeverityBadgeClass(
                                  f.severity,
                                )}`}
                              >
                                {f.severity}
                              </span>
                              <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-300 border border-slate-700">
                                {f.code}
                              </span>
                              {f.fieldPath && (
                                <span className="font-mono text-[10px] text-indigo-300">
                                  [{f.fieldPath}]
                                </span>
                              )}
                            </div>
                            <div className="text-slate-200 font-medium">{f.message}</div>
                            {f.evidence && (
                              <div className="rounded bg-slate-900 p-2 font-mono text-[11px] text-slate-400">
                                <span className="text-slate-500 font-sans">Evidence: </span>
                                {f.evidence}
                              </div>
                            )}
                            {f.suggestedAction && (
                              <div className="text-[11px] text-emerald-400">
                                <span className="font-semibold">Suggested Action: </span>
                                {f.suggestedAction}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded border border-emerald-800/60 bg-emerald-950/20 p-4 text-xs text-emerald-300">
                        ✓ No findings detected. All claims in this test case are grounded in the
                        authoritative source requirement and context.
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-8 text-center text-xs text-slate-400 space-y-3">
                  <p>This test case has not been validated against its source requirement yet.</p>
                  <button
                    onClick={handleRunValidation}
                    disabled={isValidating}
                    className="rounded bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition"
                  >
                    Run Hallucination & Grounding Check
                  </button>
                </div>
              )}
            </div>
          ) : activeTab === 'plan' ? (
            <div className="space-y-4">
              {plan ? (
                <>
                  {/* Plan Header Card */}
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`rounded px-2.5 py-0.5 text-xs font-bold border ${
                            plan.status === 'VALID'
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                              : plan.status === 'INVALID'
                                ? 'bg-rose-950 text-rose-300 border-rose-700'
                                : 'bg-amber-950 text-amber-300 border-amber-700'
                          }`}
                        >
                          STATUS: {plan.status}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-semibold border ${
                            plan.isExecutable
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                              : 'bg-rose-950/80 text-rose-300 border-rose-800'
                          }`}
                        >
                          {plan.isExecutable ? '✓ EXECUTABLE' : '✕ NOT EXECUTABLE'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-3 text-xs font-mono text-slate-400">
                        <span>Compiler: v{plan.compilerVersion}</span>
                        <span>Schema: v{plan.planSchemaVersion}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-slate-400">Plan Fingerprint (SHA-256): </span>
                        <code className="font-mono text-[11px] text-cyan-300 break-all bg-slate-900 px-1.5 py-0.5 rounded">
                          {plan.planFingerprint}
                        </code>
                      </div>
                      <div className="text-right md:text-right">
                        <span className="text-slate-400">Compiled At: </span>
                        <span className="text-slate-200">
                          {new Date(plan.compiledAt).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCompilePlan(false)}
                          disabled={isCompiling}
                          className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
                        >
                          {isCompiling ? 'Recompiling...' : 'Recompile Plan'}
                        </button>
                      </div>

                      {plan.isExecutable && (
                        <button
                          type="button"
                          onClick={handleEnqueueRun}
                          disabled={isEnqueueingRun}
                          className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow transition flex items-center gap-1.5"
                        >
                          <span>
                            {isEnqueueingRun ? 'Enqueueing...' : '▶ Enqueue Execution Run'}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>

                  {enqueueRunSuccess && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs rounded-lg flex items-center justify-between">
                      <span>✓ {enqueueRunSuccess}</span>
                      <button
                        type="button"
                        onClick={() => setEnqueueRunSuccess(null)}
                        className="text-emerald-400 hover:text-emerald-200"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {enqueueRunError && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs rounded-lg flex items-center justify-between">
                      <span>✕ {enqueueRunError}</span>
                      <button
                        type="button"
                        onClick={() => setEnqueueRunError(null)}
                        className="text-rose-400 hover:text-rose-200"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {/* Compilation Diagnostics (if any) */}
                  {plan.diagnostics.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Compilation Diagnostics ({plan.diagnostics.length})
                      </h4>
                      <div className="space-y-2">
                        {plan.diagnostics.map((d, i) => (
                          <div
                            key={i}
                            className={`rounded-lg border p-3 text-xs space-y-1 ${
                              d.severity === 'ERROR'
                                ? 'bg-rose-950/40 border-rose-800/80 text-rose-200'
                                : d.severity === 'WARNING'
                                  ? 'bg-amber-950/40 border-amber-800/80 text-amber-200'
                                  : 'bg-cyan-950/40 border-cyan-800/80 text-cyan-200'
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              <span className="font-bold px-1.5 py-0.2 rounded text-[10px] bg-slate-900 border border-slate-700">
                                {d.severity}
                              </span>
                              <span className="font-mono font-semibold text-[11px]">{d.code}</span>
                              {d.stepSequence && (
                                <span className="text-slate-400">Step {d.stepSequence}</span>
                              )}
                            </div>
                            <div className="font-medium text-slate-100">{d.message}</div>
                            <div className="text-[11px] text-slate-400">Reason: {d.reason}</div>
                            {d.suggestedAction && (
                              <div className="text-[11px] text-emerald-300">
                                Action: {d.suggestedAction}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Preconditions */}
                  {plan.preconditions.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Execution Preconditions ({plan.preconditions.length})
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {plan.preconditions.map(p => (
                          <div
                            key={p.id}
                            className="rounded border border-slate-800 bg-slate-950/40 p-2.5 text-xs flex items-start space-x-2"
                          >
                            <span className="rounded bg-indigo-950 text-indigo-300 border border-indigo-800 px-1.5 py-0.5 text-[10px] font-mono shrink-0">
                              {p.category}
                            </span>
                            <span className="text-slate-300">{p.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Executable Steps */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Compiled Executable Actions ({plan.steps.length})
                    </h4>
                    <div className="overflow-hidden rounded-lg border border-slate-800">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px]">
                          <tr>
                            <th className="p-2.5 w-12 text-center">#</th>
                            <th className="p-2.5 w-28">Action</th>
                            <th className="p-2.5">Target Descriptor</th>
                            <th className="p-2.5">Input Value / Secret Ptr</th>
                            <th className="p-2.5">Step Assertions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 bg-slate-900/60 font-mono">
                          {plan.steps.map(s => (
                            <tr key={s.id} className="hover:bg-slate-800/40 transition">
                              <td className="p-2.5 text-center text-slate-500 font-bold">
                                {s.sequence}
                              </td>
                              <td className="p-2.5">
                                <span
                                  className={`rounded px-2 py-0.5 text-[10px] font-bold border ${
                                    s.action === 'NAVIGATE'
                                      ? 'bg-purple-950 text-purple-300 border-purple-800'
                                      : s.action === 'CLICK'
                                        ? 'bg-blue-950 text-blue-300 border-blue-800'
                                        : s.action === 'FILL'
                                          ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                          : s.action === 'SELECT'
                                            ? 'bg-amber-950 text-amber-300 border-amber-800'
                                            : s.action === 'CHECK' || s.action === 'UNCHECK'
                                              ? 'bg-teal-950 text-teal-300 border-teal-800'
                                              : s.action === 'UPLOAD'
                                                ? 'bg-rose-950 text-rose-300 border-rose-800'
                                                : 'bg-slate-800 text-slate-300 border-slate-700'
                                  }`}
                                >
                                  {s.action}
                                </span>
                              </td>
                              <td className="p-2.5 text-slate-200">
                                {s.target ? (
                                  <div className="space-y-0.5 text-[11px]">
                                    <div className="font-sans font-medium text-slate-100">
                                      {s.target.name || s.target.route || s.target.semanticHint}
                                    </div>
                                    <div className="text-[10px] text-slate-400">
                                      kind: <span className="text-indigo-300">{s.target.kind}</span>
                                      {s.target.role && (
                                        <>
                                          {' '}
                                          | role:{' '}
                                          <span className="text-cyan-300">{s.target.role}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-slate-500 italic">None</span>
                                )}
                              </td>
                              <td className="p-2.5 text-slate-300">
                                {s.value ? (
                                  <div className="text-[11px]">
                                    {s.value.kind === 'SECRET_REFERENCE' ? (
                                      <span className="rounded bg-amber-950/80 px-1.5 py-0.5 text-amber-300 border border-amber-800/60 font-mono">
                                        🔒 [SECRET: {s.value.keyName || s.value.secretRef}]
                                      </span>
                                    ) : s.value.kind === 'VARIABLE' ? (
                                      <span className="text-sky-300">
                                        &#123;&#123;{s.value.variableName}&#125;&#125;
                                      </span>
                                    ) : (
                                      <span className="text-emerald-300">"{s.value.value}"</span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-600 italic">-</span>
                                )}
                              </td>
                              <td className="p-2.5 text-slate-300">
                                {s.assertions.length > 0 ? (
                                  <div className="space-y-1 text-[10px]">
                                    {s.assertions.map(a => (
                                      <div
                                        key={a.id}
                                        className="rounded bg-slate-950 p-1 border border-slate-800 text-slate-300"
                                      >
                                        <span className="font-bold text-amber-300">{a.type}: </span>
                                        <span>{a.description}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-slate-600 italic">None</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* All Top-level Assertions */}
                  {plan.assertions.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Verification Expectations ({plan.assertions.length})
                      </h4>
                      <div className="space-y-1.5">
                        {plan.assertions.map(a => (
                          <div
                            key={a.id}
                            className="rounded border border-slate-800 bg-slate-950/40 p-2.5 text-xs flex items-center justify-between"
                          >
                            <div className="flex items-center space-x-2">
                              <span className="rounded bg-amber-950 text-amber-300 border border-amber-800 px-1.5 py-0.5 text-[10px] font-mono">
                                {a.type}
                              </span>
                              <span className="text-slate-200">{a.description}</span>
                            </div>
                            {a.stepSequence && (
                              <span className="text-[10px] text-slate-500 font-mono">
                                Step {a.stepSequence}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-8 text-center text-xs text-slate-400 space-y-3">
                  <p>No executable plan has been compiled for this test case version yet.</p>
                  <button
                    onClick={() => handleCompilePlan(false)}
                    disabled={isCompiling}
                    className="rounded bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition"
                  >
                    ⚙ Compile Executable Plan
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Provenance Banner */}
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400">
                {testCase.sourceRequirementKey && (
                  <div className="flex items-center space-x-1">
                    <span className="text-slate-500">Source Req:</span>
                    <span className="font-mono font-semibold text-indigo-300">
                      {testCase.sourceRequirementKey}
                    </span>
                    {testCase.sourceRequirementVersionNumber && (
                      <span className="text-slate-500">
                        (v{testCase.sourceRequirementVersionNumber})
                      </span>
                    )}
                  </div>
                )}
                {testCase.sourceScenarioKey && (
                  <div className="flex items-center space-x-1">
                    <span className="text-slate-500">• Scenario:</span>
                    <span className="font-mono text-slate-300">{testCase.sourceScenarioKey}</span>
                  </div>
                )}
                {testCase.providerId && (
                  <div className="flex items-center space-x-1">
                    <span className="text-slate-500">• AI Provider:</span>
                    <span className="font-mono text-slate-300">
                      {testCase.providerId} / {testCase.model}
                    </span>
                  </div>
                )}
                <div className="flex items-center space-x-1 ml-auto text-slate-500">
                  <span>Created: {new Date(testCase.createdAt).toLocaleString()}</span>
                </div>
              </div>

              {/* Objective */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Objective
                </h4>
                <p className="rounded border border-slate-800 bg-slate-950/30 p-3 text-slate-200">
                  {testCase.objective}
                </p>
              </div>

              {/* Preconditions */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                  <span>Preconditions ({testCase.preconditions.length})</span>
                </h4>
                {testCase.preconditions.length > 0 ? (
                  <div className="space-y-1.5">
                    {testCase.preconditions.map(p => (
                      <div
                        key={p.id}
                        className="flex items-start space-x-2 rounded border border-slate-800 bg-slate-950/40 p-2.5 text-xs"
                      >
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                          #{p.sequenceOrder}
                        </span>
                        <span className="rounded bg-indigo-950 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300 border border-indigo-800">
                          {p.category}
                        </span>
                        <span className="flex-1 text-slate-200">{p.description}</span>
                        {p.reviewRequired && (
                          <span className="rounded bg-rose-950 px-1.5 py-0.5 text-[10px] font-bold text-rose-300 border border-rose-800">
                            Review Req
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded border border-slate-800 bg-slate-950/20 p-3 text-xs text-slate-500 italic">
                    No explicit preconditions defined.
                  </div>
                )}
              </div>

              {/* Steps */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                  <span>Test Steps ({testCase.steps.length})</span>
                </h4>
                <div className="overflow-hidden rounded-lg border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 font-semibold text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-2.5 w-12 text-center">#</th>
                        <th className="p-2.5">Action</th>
                        <th className="p-2.5">Expected Result</th>
                        <th className="p-2.5 w-48">Test Data / State</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                      {testCase.steps.map(s => (
                        <tr key={s.id} className="hover:bg-slate-800/40 transition">
                          <td className="p-2.5 text-center font-mono text-slate-400 font-bold">
                            {s.stepNumber}
                          </td>
                          <td className="p-2.5 font-medium text-slate-200">{s.action}</td>
                          <td className="p-2.5 text-slate-300">
                            {s.expectedResult || (
                              <span className="text-slate-600 italic">None</span>
                            )}
                          </td>
                          <td className="p-2.5 text-slate-400">
                            {s.testDataSummary && (
                              <div className="text-[11px] font-mono text-emerald-300">
                                {s.testDataSummary}
                              </div>
                            )}
                            {s.stateChangeFrom && s.stateChangeTo && (
                              <div className="text-[10px] text-cyan-400">
                                {s.stateEntity ? `${s.stateEntity}: ` : ''}
                                {s.stateChangeFrom} → {s.stateChangeTo}
                              </div>
                            )}
                            {!s.testDataSummary && !s.stateChangeFrom && (
                              <span className="text-slate-600 italic">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Test Data */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                  <span>Test Data Items ({testCase.testData.length})</span>
                </h4>
                {testCase.testData.length > 0 ? (
                  <div className="overflow-hidden rounded-lg border border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 font-semibold text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="p-2.5 w-12 text-center">#</th>
                          <th className="p-2.5">Name</th>
                          <th className="p-2.5">Data Type</th>
                          <th className="p-2.5">Origin</th>
                          <th className="p-2.5">Value / Constraint</th>
                          <th className="p-2.5">Confidence</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 bg-slate-900/60 font-mono">
                        {testCase.testData.map(d => (
                          <tr key={d.id} className="hover:bg-slate-800/40 transition">
                            <td className="p-2.5 text-center text-slate-500 font-bold">
                              {d.sequenceOrder}
                            </td>
                            <td className="p-2.5 font-bold text-slate-200">{d.name}</td>
                            <td className="p-2.5 text-indigo-300">{d.dataType}</td>
                            <td className="p-2.5 text-slate-400">{d.origin}</td>
                            <td className="p-2.5 text-slate-300">
                              {d.value !== undefined && d.value !== null ? (
                                <span className="text-emerald-300">{JSON.stringify(d.value)}</span>
                              ) : d.constraint ? (
                                <span className="text-amber-300">{d.constraint}</span>
                              ) : (
                                <span className="text-slate-600 italic">None</span>
                              )}
                            </td>
                            <td className="p-2.5 text-[11px] text-slate-400">{d.confidence}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded border border-slate-800 bg-slate-950/20 p-3 text-xs text-slate-500 italic">
                    No specific test data items required.
                  </div>
                )}
              </div>

              {/* Overall Expected Result */}
              {testCase.overallExpectedResult && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Overall Expected Result
                  </h4>
                  <pre className="rounded border border-slate-800 bg-slate-950/40 p-3 text-xs font-mono text-cyan-200 whitespace-pre-wrap">
                    {testCase.overallExpectedResult}
                  </pre>
                </div>
              )}

              {/* Assumptions & Unknowns */}
              {(testCase.assumptions.length > 0 || testCase.unknowns.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-800 text-xs">
                  {testCase.assumptions.length > 0 && (
                    <div className="rounded border border-slate-800 bg-slate-950/30 p-3">
                      <div className="font-semibold text-slate-300 mb-1">
                        Assumptions ({testCase.assumptions.length}):
                      </div>
                      <ul className="list-inside list-disc space-y-0.5 text-slate-400 text-[11px]">
                        {testCase.assumptions.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {testCase.unknowns.length > 0 && (
                    <div className="rounded border border-amber-800/60 bg-amber-950/20 p-3">
                      <div className="font-semibold text-amber-300 mb-1">
                        Explicit Unknowns ({testCase.unknowns.length}):
                      </div>
                      <ul className="list-inside list-disc space-y-0.5 text-amber-200 text-[11px]">
                        {testCase.unknowns.map((u, i) => (
                          <li key={i}>
                            <span className="font-medium text-amber-100">{u.name}:</span> {u.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/90 px-6 py-3">
          <div>
            {onDelete && (
              <button
                onClick={() => onDelete(testCase.id)}
                className="rounded border border-rose-800/80 bg-rose-950/40 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-900/60 transition"
              >
                Delete Test Case
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded bg-slate-800 px-4 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
