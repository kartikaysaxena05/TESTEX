/**
 * @file apps/desktop/src/renderer/features/failures/EvidenceInspectionPanel.tsx
 * Authoritative Failure Evidence Inspection Panel (V6 Phase 75).
 * Displays normalized steps, expected vs actual assertions, screenshots, console logs,
 * network captures, DOM state, retry histories, locator healing, and cryptographic integrity reports.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  FailureEvidencePackageDto,
  FailureEvidenceIntegrityReportDto,
  FailureEvidenceArtifactContentDto,
} from '@ai-quality/contracts';

interface EvidenceInspectionPanelProps {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly onPackageUpdated?: (pkg: FailureEvidencePackageDto) => void;
}

type EvidenceTab =
  'STEP_ASSERTION' | 'SCREENSHOTS' | 'CONSOLE' | 'NETWORK' | 'DOM_ENV' | 'RETRIES_HEALING';

export function EvidenceInspectionPanel({
  projectId,
  failureCaseId,
  onPackageUpdated,
}: EvidenceInspectionPanelProps): React.JSX.Element {
  const [evidencePackage, setEvidencePackage] = useState<FailureEvidencePackageDto | null>(null);
  const [integrityReport, setIntegrityReport] = useState<FailureEvidenceIntegrityReportDto | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<EvidenceTab>('STEP_ASSERTION');
  const [error, setError] = useState<string | null>(null);
  const [selectedArtifactContent, setSelectedArtifactContent] =
    useState<FailureEvidenceArtifactContentDto | null>(null);
  const [_isLoadingContent, setIsLoadingContent] = useState<boolean>(false);

  const activeCaseRef = useRef<string>(failureCaseId);

  useEffect(() => {
    activeCaseRef.current = failureCaseId;
    setEvidencePackage(null);
    setIntegrityReport(null);
    setSelectedArtifactContent(null);
    setActiveTab('STEP_ASSERTION');
    setError(null);
  }, [failureCaseId]);

  const loadEvidencePackage = useCallback(async () => {
    if (!window.desktop?.failures) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const res = await window.desktop.failures.getEvidencePackage({
        projectId,
        failureCaseId,
      });

      if (activeCaseRef.current !== failureCaseId) return;

      if (res.ok) {
        setEvidencePackage(res.data);
        onPackageUpdated?.(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      if (activeCaseRef.current === failureCaseId) {
        setError(err instanceof Error ? err.message : 'Failed to load evidence package.');
      }
    } finally {
      if (activeCaseRef.current === failureCaseId) {
        setIsLoading(false);
      }
    }
  }, [projectId, failureCaseId, onPackageUpdated]);

  useEffect(() => {
    loadEvidencePackage();
  }, [loadEvidencePackage]);

  const handleVerifyIntegrity = async () => {
    if (!window.desktop?.failures || isVerifying) return;

    try {
      setIsVerifying(true);
      const res = await window.desktop.failures.verifyEvidenceIntegrity({
        projectId,
        failureCaseId,
      });

      if (activeCaseRef.current !== failureCaseId) return;

      if (res.ok) {
        setIntegrityReport(res.data);
        // Refresh evidence package to update integrity statuses
        await loadEvidencePackage();
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      if (activeCaseRef.current === failureCaseId) {
        setError(err instanceof Error ? err.message : 'Verification failed.');
      }
    } finally {
      if (activeCaseRef.current === failureCaseId) {
        setIsVerifying(false);
      }
    }
  };

  const handleViewArtifactContent = async (referenceId: string) => {
    if (!window.desktop?.failures) return;

    try {
      setIsLoadingContent(true);
      const res = await window.desktop.failures.getEvidenceArtifactContent({
        projectId,
        failureCaseId,
        referenceId,
      });

      if (activeCaseRef.current !== failureCaseId) return;

      if (res.ok) {
        setSelectedArtifactContent(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      if (activeCaseRef.current === failureCaseId) {
        setError(err instanceof Error ? err.message : 'Failed to load artifact content.');
      }
    } finally {
      if (activeCaseRef.current === failureCaseId) {
        setIsLoadingContent(false);
      }
    }
  };

  if (isLoading) {
    return (
      <div
        data-testid="evidence-panel-loading"
        className="p-6 bg-slate-900 border border-slate-800 rounded-lg text-center text-slate-400 text-xs animate-pulse"
      >
        Ingesting & validating evidence from authoritative V5 execution...
      </div>
    );
  }

  if (error) {
    return (
      <div
        data-testid="evidence-panel-error"
        className="p-4 bg-rose-950/40 border border-rose-800 text-rose-300 rounded-lg text-xs"
      >
        <p className="font-bold">Evidence Error:</p>
        <p>{error}</p>
        <button
          onClick={loadEvidencePackage}
          className="mt-2 px-3 py-1 bg-rose-800/60 hover:bg-rose-700 text-rose-100 rounded text-xs transition"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!evidencePackage) {
    return (
      <div
        data-testid="evidence-panel-empty"
        className="p-6 bg-slate-900 border border-slate-800 rounded-lg text-center text-slate-500 text-xs italic"
      >
        No evidence package available for this failure case.
      </div>
    );
  }

  const completenessColor =
    evidencePackage.completeness === 'COMPLETE'
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
      : evidencePackage.completeness === 'PARTIAL'
        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
        : evidencePackage.completeness === 'MINIMAL'
          ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
          : 'bg-rose-500/20 text-rose-300 border-rose-500/40';

  const integrityColor =
    evidencePackage.integrityStatus === 'VERIFIED'
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
      : evidencePackage.integrityStatus === 'UNVERIFIED'
        ? 'bg-slate-700/50 text-slate-300 border-slate-600'
        : 'bg-rose-500/20 text-rose-300 border-rose-500/40';

  return (
    <div
      data-testid="evidence-inspection-panel"
      className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden space-y-4"
    >
      {/* Header bar: Completeness, Integrity, Signature */}
      <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Evidence Ingestion
          </span>
          <span
            data-testid="evidence-completeness-badge"
            className={`px-2 py-0.5 rounded text-[11px] font-bold border ${completenessColor}`}
          >
            {evidencePackage.completeness}
          </span>
          <span
            data-testid="evidence-integrity-badge"
            className={`px-2 py-0.5 rounded text-[11px] font-bold border ${integrityColor}`}
          >
            {evidencePackage.integrityStatus}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div
            data-testid="failure-signature-display"
            className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 border border-slate-700/60 rounded text-xs font-mono text-cyan-300"
            title="Deterministic SHA-256 Technical Failure Signature"
          >
            <span className="text-slate-500 font-sans text-[10px] uppercase font-bold">Sig:</span>
            <span>{evidencePackage.failureSignature}</span>
          </div>

          <button
            onClick={handleVerifyIntegrity}
            disabled={isVerifying}
            data-testid="verify-integrity-btn"
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-semibold rounded border border-slate-700 transition"
          >
            {isVerifying ? 'Verifying...' : '⚡ Verify SHA-256'}
          </button>
        </div>
      </div>

      {/* Integrity Report Alert if any issues */}
      {integrityReport && integrityReport.overallIntegrity !== 'VERIFIED' && (
        <div
          data-testid="integrity-alert-banner"
          className="mx-4 p-3 bg-rose-950/50 border border-rose-800 text-rose-200 rounded text-xs space-y-1"
        >
          <div className="font-bold flex items-center justify-between">
            <span>⚠ Integrity Issues Detected</span>
            <span>
              Missing: {integrityReport.itemsMissing} | Corrupt/Mismatch:{' '}
              {integrityReport.itemsCorrupt}
            </span>
          </div>
          <p className="text-[11px] text-rose-300">
            One or more physical artifacts failed cryptographic SHA-256 byte comparison or were
            missing from disk.
          </p>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="px-4 border-b border-slate-800 flex items-center gap-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab('STEP_ASSERTION')}
          data-testid="tab-step-assertion"
          className={`px-3 py-1.5 text-xs font-semibold border-b-2 transition ${
            activeTab === 'STEP_ASSERTION'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Failed Step & Assertion
        </button>

        <button
          onClick={() => setActiveTab('SCREENSHOTS')}
          data-testid="tab-screenshots"
          className={`px-3 py-1.5 text-xs font-semibold border-b-2 transition ${
            activeTab === 'SCREENSHOTS'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Screenshots ({evidencePackage.screenshots.length})
        </button>

        <button
          onClick={() => setActiveTab('CONSOLE')}
          data-testid="tab-console"
          className={`px-3 py-1.5 text-xs font-semibold border-b-2 transition ${
            activeTab === 'CONSOLE'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Console Logs ({evidencePackage.consoleMessages.length})
        </button>

        <button
          onClick={() => setActiveTab('NETWORK')}
          data-testid="tab-network"
          className={`px-3 py-1.5 text-xs font-semibold border-b-2 transition ${
            activeTab === 'NETWORK'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Network Captures ({evidencePackage.networkRecords.length})
        </button>

        <button
          onClick={() => setActiveTab('DOM_ENV')}
          data-testid="tab-dom-env"
          className={`px-3 py-1.5 text-xs font-semibold border-b-2 transition ${
            activeTab === 'DOM_ENV'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          DOM & Environment
        </button>

        <button
          onClick={() => setActiveTab('RETRIES_HEALING')}
          data-testid="tab-retries-healing"
          className={`px-3 py-1.5 text-xs font-semibold border-b-2 transition ${
            activeTab === 'RETRIES_HEALING'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Retries & Healing ({evidencePackage.retryHistory.length})
        </button>
      </div>

      {/* Tab Contents */}
      <div className="p-4">
        {/* 1. Step & Assertion Tab */}
        {activeTab === 'STEP_ASSERTION' && (
          <div data-testid="tab-content-step-assertion" className="space-y-4">
            {evidencePackage.failedStep ? (
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 rounded font-bold">
                      Step #{evidencePackage.failedStep.stepIndex + 1}
                    </span>
                    <span className="font-mono text-cyan-300 font-bold">
                      {evidencePackage.failedStep.actionType}
                    </span>
                  </div>
                  {evidencePackage.failedStep.durationMs && (
                    <span className="text-slate-400">
                      {evidencePackage.failedStep.durationMs} ms
                    </span>
                  )}
                </div>

                {evidencePackage.failedStep.targetSummary && (
                  <p className="text-slate-300">
                    <span className="text-slate-500 font-semibold">Target: </span>
                    <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-300 font-mono text-[11px]">
                      {evidencePackage.failedStep.targetSummary}
                    </code>
                  </p>
                )}

                {evidencePackage.failedStep.errorMessage && (
                  <div className="p-2.5 bg-rose-950/30 border border-rose-900/50 rounded font-mono text-[11px] text-rose-300 whitespace-pre-wrap">
                    {evidencePackage.failedStep.errorMessage}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-slate-400 italic">No failed step recorded.</div>
            )}

            {evidencePackage.expectedVsActual && (
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded space-y-2 text-xs">
                <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
                  Expected vs Actual Outcome
                </h4>
                <div className="grid grid-cols-2 gap-3 font-mono text-[11px]">
                  <div className="p-2.5 bg-emerald-950/20 border border-emerald-800/40 rounded">
                    <span className="text-emerald-400 font-sans font-bold block mb-1">
                      Expected:
                    </span>
                    <div className="text-emerald-200 whitespace-pre-wrap break-all">
                      {typeof evidencePackage.expectedVsActual.expectedValue === 'object'
                        ? JSON.stringify(evidencePackage.expectedVsActual.expectedValue, null, 2)
                        : String(evidencePackage.expectedVsActual.expectedValue ?? 'N/A')}
                    </div>
                  </div>
                  <div className="p-2.5 bg-rose-950/20 border border-rose-800/40 rounded">
                    <span className="text-rose-400 font-sans font-bold block mb-1">Actual:</span>
                    <div className="text-rose-200 whitespace-pre-wrap break-all">
                      {typeof evidencePackage.expectedVsActual.actualValue === 'object'
                        ? JSON.stringify(evidencePackage.expectedVsActual.actualValue, null, 2)
                        : String(evidencePackage.expectedVsActual.actualValue ?? 'N/A')}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. Screenshots Tab */}
        {activeTab === 'SCREENSHOTS' && (
          <div data-testid="tab-content-screenshots" className="space-y-4">
            {evidencePackage.screenshots.length === 0 ? (
              <div className="text-xs text-slate-400 italic py-4 text-center">
                No screenshot artifacts attached to this execution.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {evidencePackage.screenshots.map(ref => (
                  <div
                    key={ref.id}
                    className="p-3 bg-slate-950/60 border border-slate-800 rounded space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-slate-300 truncate">{ref.logicalName}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          ref.integrityStatus === 'VERIFIED'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {ref.integrityStatus}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>{ref.byteSize ? `${Math.round(ref.byteSize / 1024)} KB` : ''}</span>
                      <button
                        onClick={() => handleViewArtifactContent(ref.id)}
                        className="px-2 py-0.5 bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 rounded transition"
                      >
                        View Image
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3. Console Logs Tab */}
        {activeTab === 'CONSOLE' && (
          <div data-testid="tab-content-console" className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Status: {evidencePackage.consoleAvailability}</span>
              <span>{evidencePackage.consoleMessages.length} messages</span>
            </div>

            {evidencePackage.consoleAvailability === 'NOT_CAPTURED' ? (
              <div className="text-xs text-slate-400 italic py-4 text-center">
                Console logs were not captured for this execution.
              </div>
            ) : evidencePackage.consoleAvailability === 'CAPTURED_EMPTY' ||
              evidencePackage.consoleMessages.length === 0 ? (
              <div className="text-xs text-slate-400 italic py-4 text-center">
                Console log stream was captured and was completely empty.
              </div>
            ) : (
              <div className="space-y-1 font-mono text-[11px] max-h-80 overflow-y-auto p-2 bg-slate-950/80 rounded border border-slate-800">
                {evidencePackage.consoleMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`py-0.5 px-1.5 rounded flex items-start gap-2 ${
                      msg.level === 'error'
                        ? 'bg-rose-950/30 text-rose-300'
                        : msg.level === 'warn' || msg.level === 'warning'
                          ? 'bg-amber-950/30 text-amber-300'
                          : 'text-slate-300'
                    }`}
                  >
                    <span className="uppercase text-[9px] px-1 bg-slate-800 rounded font-bold">
                      {msg.level}
                    </span>
                    <span className="flex-1 whitespace-pre-wrap break-all">{msg.message}</span>
                    {msg.isRedacted && (
                      <span className="text-[9px] text-amber-400 font-sans">[Redacted]</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4. Network Captures Tab */}
        {activeTab === 'NETWORK' && (
          <div data-testid="tab-content-network" className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Status: {evidencePackage.networkAvailability}</span>
              <span>{evidencePackage.networkRecords.length} requests</span>
            </div>

            {evidencePackage.networkAvailability === 'NOT_CAPTURED' ? (
              <div className="text-xs text-slate-400 italic py-4 text-center">
                Network requests were not captured for this execution.
              </div>
            ) : evidencePackage.networkAvailability === 'CAPTURED_EMPTY' ||
              evidencePackage.networkRecords.length === 0 ? (
              <div className="text-xs text-slate-400 italic py-4 text-center">
                Network capture was active but recorded zero requests.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {evidencePackage.networkRecords.map((req, idx) => (
                  <div
                    key={idx}
                    className="p-2 bg-slate-950/60 border border-slate-800/80 rounded flex items-center justify-between text-xs font-mono"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          req.isFailed || (req.statusCode && req.statusCode >= 400)
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-emerald-500/20 text-emerald-300'
                        }`}
                      >
                        {req.statusCode ?? 'ERR'}
                      </span>
                      <span className="text-cyan-400 font-bold">{req.method}</span>
                      <span className="text-slate-300 truncate" title={req.url}>
                        {req.url}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {req.isRedacted && (
                        <span className="text-[10px] text-amber-400 font-sans">[Redacted]</span>
                      )}
                      {req.durationMs && (
                        <span className="text-[10px] text-slate-400">{req.durationMs}ms</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 5. DOM & Environment Tab */}
        {activeTab === 'DOM_ENV' && (
          <div data-testid="tab-content-dom-env" className="space-y-4 text-xs">
            {/* DOM Snapshot Fragment */}
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded space-y-2">
              <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
                Target DOM Fragment ({evidencePackage.domAvailability})
              </h4>
              {evidencePackage.domEvidence ? (
                <div className="space-y-1">
                  <p className="text-slate-300">
                    <span className="text-slate-500">Locator: </span>
                    <code className="text-cyan-300 font-mono">
                      {evidencePackage.domEvidence.locator ?? 'N/A'}
                    </code>
                  </p>
                  {evidencePackage.domEvidence.htmlFragment && (
                    <div className="mt-2 p-2 bg-slate-900 border border-slate-800 rounded font-mono text-[11px] text-amber-200 overflow-x-auto whitespace-pre-wrap max-h-48">
                      {evidencePackage.domEvidence.htmlFragment}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-slate-400 italic">No DOM snapshot fragment captured.</p>
              )}
            </div>

            {/* Execution Environment */}
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded space-y-2">
              <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
                Execution Environment
              </h4>
              <div className="grid grid-cols-2 gap-2 text-slate-300">
                <div>
                  <span className="text-slate-500">Browser Engine: </span>
                  <span className="font-mono text-cyan-300">
                    {evidencePackage.environment.browserEngine}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Base URL: </span>
                  <span className="font-mono text-slate-300">
                    {evidencePackage.environment.baseUrl ?? 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Operating System: </span>
                  <span>{evidencePackage.environment.operatingSystem ?? 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Viewport: </span>
                  <span className="font-mono">
                    {evidencePackage.environment.viewport
                      ? `${evidencePackage.environment.viewport.width}x${evidencePackage.environment.viewport.height}`
                      : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 6. Retries & Healing Tab */}
        {activeTab === 'RETRIES_HEALING' && (
          <div data-testid="tab-content-retries-healing" className="space-y-4 text-xs">
            {/* Retry History */}
            <div className="space-y-2">
              <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
                Execution Attempts ({evidencePackage.retryHistory.length})
              </h4>
              {evidencePackage.retryHistory.length === 0 ? (
                <p className="text-slate-400 italic">Single execution attempt without retries.</p>
              ) : (
                <div className="space-y-1">
                  {evidencePackage.retryHistory.map((retry, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-slate-950/60 border border-slate-800 rounded flex items-center justify-between"
                    >
                      <span className="font-bold text-slate-200">Attempt #{retry.attempt}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          retry.status === 'PASSED'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {retry.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Healing Records */}
            <div className="space-y-2">
              <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
                Self-Healing Attempts ({evidencePackage.healingRecords.length})
              </h4>
              {evidencePackage.healingRecords.length === 0 ? (
                <p className="text-slate-400 italic">No self-healing was attempted or triggered.</p>
              ) : (
                <div className="space-y-1.5">
                  {evidencePackage.healingRecords.map((heal, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-slate-950/60 border border-slate-800 rounded space-y-1 font-mono text-[11px]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300">{heal.originalSelector}</span>
                        <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded font-sans text-[10px] font-bold">
                          {heal.healingResult}
                        </span>
                      </div>
                      {heal.selectedCandidate && (
                        <p className="text-emerald-300">
                          Healed: <span>{heal.selectedCandidate}</span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Artifact Preview Modal */}
      {selectedArtifactContent && (
        <div
          data-testid="artifact-preview-modal"
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        >
          <div className="bg-slate-900 border border-slate-700 rounded-lg max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-slate-200 truncate">
                {selectedArtifactContent.logicalName}
              </span>
              <button
                onClick={() => setSelectedArtifactContent(null)}
                className="text-slate-400 hover:text-slate-200 text-xs px-2 py-1 bg-slate-800 rounded"
              >
                ✕ Close
              </button>
            </div>

            <div className="p-4 flex-1 overflow-auto flex items-center justify-center bg-slate-950/50">
              {selectedArtifactContent.contentBase64 ? (
                <img
                  src={`data:${selectedArtifactContent.mimeType};base64,${selectedArtifactContent.contentBase64}`}
                  alt={selectedArtifactContent.logicalName}
                  className="max-w-full max-h-[65vh] object-contain rounded border border-slate-800"
                />
              ) : selectedArtifactContent.contentText ? (
                <pre className="w-full text-xs font-mono text-slate-300 whitespace-pre-wrap bg-slate-900 p-3 rounded border border-slate-800">
                  {selectedArtifactContent.contentText}
                </pre>
              ) : (
                <p className="text-xs text-slate-400 italic">No preview available for artifact.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
