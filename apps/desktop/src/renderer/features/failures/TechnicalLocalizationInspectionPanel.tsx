/**
 * @file apps/desktop/src/renderer/features/failures/TechnicalLocalizationInspectionPanel.tsx
 * Failure Evidence Correlation & Technical Cause Localization Inspection Panel (V6 Phase 81).
 * Displays authoritative technical layer, primary/secondary targets, correlated event timeline,
 * repository route linkage, correlation signals, conflicting signals, and audit controls.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  FailureTechnicalLocalizationDto,
  TechnicalLayer,
  SignalStrength,
} from '@ai-quality/contracts';

interface TechnicalLocalizationInspectionPanelProps {
  readonly projectId: string;
  readonly failureCaseId: string;
}

const LAYER_BADGE_STYLES: Record<
  TechnicalLayer,
  { bg: string; text: string; border: string; label: string; icon: string }
> = {
  BACKEND_API: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    label: 'Backend API',
    icon: '⚡',
  },
  BACKEND_SERVICE: {
    bg: 'bg-teal-500/10',
    text: 'text-teal-400',
    border: 'border-teal-500/30',
    label: 'Backend Service',
    icon: '⚙️',
  },
  DATABASE: {
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-400',
    border: 'border-cyan-500/30',
    label: 'Database Operation',
    icon: '🗄️',
  },
  FRONTEND_UI: {
    bg: 'bg-violet-500/10',
    text: 'text-violet-400',
    border: 'border-violet-500/30',
    label: 'Frontend UI',
    icon: '🖥️',
  },
  FRONTEND_STATE: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
    label: 'Frontend State',
    icon: '🧠',
  },
  FRONTEND_NETWORK_CLIENT: {
    bg: 'bg-sky-500/10',
    text: 'text-sky-400',
    border: 'border-sky-500/30',
    label: 'Frontend Network Client',
    icon: '📡',
  },
  AUTHENTICATION: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    label: 'Authentication',
    icon: '🔐',
  },
  AUTHORIZATION: {
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    border: 'border-rose-500/30',
    label: 'Authorization',
    icon: '🛡️',
  },
  EXTERNAL_SERVICE: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-400',
    border: 'border-orange-500/30',
    label: 'External Service',
    icon: '☁️',
  },
  BROWSER_AUTOMATION: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    label: 'Browser Automation',
    icon: '🤖',
  },
  TEST_INFRASTRUCTURE: {
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-400',
    border: 'border-yellow-500/30',
    label: 'Test Infrastructure',
    icon: '🏗️',
  },
  TEST_DATA: {
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-400',
    border: 'border-indigo-500/30',
    label: 'Test Data',
    icon: '📦',
  },
  ENVIRONMENT: {
    bg: 'bg-lime-500/10',
    text: 'text-lime-400',
    border: 'border-lime-500/30',
    label: 'Environment',
    icon: '🌐',
  },
  MULTI_LAYER: {
    bg: 'bg-pink-500/10',
    text: 'text-pink-400',
    border: 'border-pink-500/30',
    label: 'Multi-Layer Manifestation',
    icon: '🔀',
  },
  UNKNOWN: {
    bg: 'bg-zinc-500/10',
    text: 'text-zinc-400',
    border: 'border-zinc-500/30',
    label: 'Unknown Layer',
    icon: '❓',
  },
};

const SIGNAL_STRENGTH_BADGES: Record<SignalStrength, { bg: string; text: string }> = {
  DIRECT: { bg: 'bg-emerald-500/20 text-emerald-300', text: 'DIRECT' },
  STRONG: { bg: 'bg-blue-500/20 text-blue-300', text: 'STRONG' },
  SUPPORTING: { bg: 'bg-violet-500/20 text-violet-300', text: 'SUPPORTING' },
  WEAK: { bg: 'bg-slate-500/20 text-slate-300', text: 'WEAK' },
  UNKNOWN: { bg: 'bg-zinc-500/20 text-zinc-400', text: 'UNKNOWN' },
};

export function TechnicalLocalizationInspectionPanel({
  projectId,
  failureCaseId,
}: TechnicalLocalizationInspectionPanelProps): React.JSX.Element {
  const [localization, setLocalization] = useState<FailureTechnicalLocalizationDto | null>(null);
  const [history, setHistory] = useState<readonly FailureTechnicalLocalizationDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(
    () => typeof window !== 'undefined' && !!window.desktop?.failures,
  );
  const [isLocalizing, setIsLocalizing] = useState<boolean>(false);
  const [isRelocalizing, setIsRelocalizing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showRelocalizeModal, setShowRelocalizeModal] = useState<boolean>(false);
  const [relocalizeReason, setRelocalizeReason] = useState<string>('');
  const [showHistory, setShowHistory] = useState<boolean>(false);

  const activeProjectIdRef = useRef<string>(projectId);
  const activeFailureCaseIdRef = useRef<string>(failureCaseId);

  useEffect(() => {
    activeProjectIdRef.current = projectId;
    activeFailureCaseIdRef.current = failureCaseId;
  }, [projectId, failureCaseId]);

  const loadLocalization = useCallback(async () => {
    if (!window.desktop?.failures) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const [resLoc, resHist] = await Promise.all([
        window.desktop.failures.getTechnicalLocalization({ projectId, failureCaseId }),
        window.desktop.failures.listLocalizationHistory({ projectId, failureCaseId }),
      ]);

      if (
        activeProjectIdRef.current !== projectId ||
        activeFailureCaseIdRef.current !== failureCaseId
      ) {
        return;
      }

      if (!resLoc.ok) {
        setError(resLoc.error.message);
      } else {
        setLocalization(resLoc.data);
      }

      if (resHist.ok) {
        setHistory(resHist.data);
      }
    } catch (err: unknown) {
      if (
        activeProjectIdRef.current === projectId &&
        activeFailureCaseIdRef.current === failureCaseId
      ) {
        setError(err instanceof Error ? err.message : 'Failed to load localization.');
      }
    } finally {
      if (
        activeProjectIdRef.current === projectId &&
        activeFailureCaseIdRef.current === failureCaseId
      ) {
        setIsLoading(false);
      }
    }
  }, [projectId, failureCaseId]);

  useEffect(() => {
    void loadLocalization();
  }, [loadLocalization]);

  const handleLocalize = async () => {
    if (!window.desktop?.failures || isLocalizing) return;
    setIsLocalizing(true);
    setError(null);

    try {
      const res = await window.desktop.failures.localizeTechnicalCause({
        projectId,
        failureCaseId,
      });
      if (!res.ok) {
        setError(res.error.message);
      } else {
        setLocalization(res.data);
        const resHist = await window.desktop.failures.listLocalizationHistory({
          projectId,
          failureCaseId,
        });
        if (resHist.ok) {
          setHistory(resHist.data);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Localization failed.');
    } finally {
      setIsLocalizing(false);
    }
  };

  const handleRelocalize = async () => {
    if (!window.desktop?.failures || isRelocalizing || !relocalizeReason.trim()) return;
    setIsRelocalizing(true);
    setError(null);

    try {
      const res = await window.desktop.failures.relocalizeTechnicalCause({
        projectId,
        failureCaseId,
        relocalizationReason: relocalizeReason.trim(),
      });
      if (!res.ok) {
        setError(res.error.message);
      } else {
        setLocalization(res.data);
        setShowRelocalizeModal(false);
        setRelocalizeReason('');
        const resHist = await window.desktop.failures.listLocalizationHistory({
          projectId,
          failureCaseId,
        });
        if (resHist.ok) {
          setHistory(resHist.data);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Re-localization failed.');
    } finally {
      setIsRelocalizing(false);
    }
  };

  if (isLoading) {
    return (
      <div
        className="p-6 bg-slate-900/60 border border-slate-800 rounded-lg text-slate-400 text-sm flex items-center justify-center gap-2"
        data-testid="localization-loading"
      >
        <span className="inline-block animate-spin">⏳</span>
        <span>Analyzing failure evidence timeline and correlating technical cause...</span>
      </div>
    );
  }

  const badgeStyle = localization
    ? (LAYER_BADGE_STYLES[localization.primaryLayer] ?? LAYER_BADGE_STYLES.UNKNOWN)
    : LAYER_BADGE_STYLES.UNKNOWN;

  return (
    <div
      className="p-4 bg-slate-900/70 border border-slate-800/80 rounded-lg space-y-4"
      data-testid="technical-localization-panel"
    >
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-200">
            📍 Failure Evidence Correlation & Technical Localization (Phase 81)
          </span>
          {localization && (
            <span
              data-testid="primary-layer-badge"
              className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border}`}
            >
              <span>{badgeStyle.icon}</span>
              <span>{badgeStyle.label}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHistory(prev => !prev)}
              className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition"
              data-testid="btn-toggle-localization-history"
            >
              📜 Audit History ({history.length})
            </button>
          )}

          {localization ? (
            <button
              type="button"
              onClick={() => setShowRelocalizeModal(true)}
              className="px-3 py-1 text-xs bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 rounded transition font-medium"
              data-testid="btn-relocalize-trigger"
            >
              🔄 Re-evaluate Localization
            </button>
          ) : (
            <button
              type="button"
              onClick={handleLocalize}
              disabled={isLocalizing}
              className="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded transition font-medium disabled:opacity-50"
              data-testid="btn-localize-trigger"
            >
              {isLocalizing ? 'Correlating Evidence...' : '📍 Localize Technical Cause'}
            </button>
          )}
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div
          className="p-3 bg-red-950/40 border border-red-800 text-red-300 rounded text-xs"
          data-testid="localization-error-alert"
        >
          {error}
        </div>
      )}

      {/* Staleness banner */}
      {localization?.isStale && (
        <div
          className="p-3 bg-amber-950/30 border border-amber-800/80 text-amber-300 rounded text-xs flex items-center justify-between gap-2"
          data-testid="localization-staleness-banner"
        >
          <div>
            <span className="font-bold">⚠️ Localization Stale: </span>
            <span>{localization.stalenessReason || 'Underlying evidence has been updated.'}</span>
          </div>
          <button
            type="button"
            onClick={() => setShowRelocalizeModal(true)}
            className="px-2 py-0.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded text-2xs uppercase tracking-wider transition"
          >
            Re-evaluate
          </button>
        </div>
      )}

      {/* Main Content */}
      {!localization ? (
        <div className="p-8 text-center bg-slate-950/30 rounded border border-dashed border-slate-800">
          <p className="text-slate-400 text-xs mb-3">
            No technical cause localization has been performed yet for this failure case.
          </p>
          <button
            type="button"
            onClick={handleLocalize}
            disabled={isLocalizing}
            className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded transition"
            data-testid="btn-localize-empty"
          >
            {isLocalizing ? 'Correlating Evidence...' : 'Localize Technical Cause Now'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Primary Localization Card */}
          <div className="p-3.5 bg-slate-950/50 border border-slate-800 rounded-lg space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-slate-300 uppercase tracking-wider text-2xs">
                Primary Target Localization
              </span>
              <span className="text-slate-400 font-mono text-2xs">
                Target Type:{' '}
                <span className="text-slate-200">{localization.primaryTargetType}</span>
              </span>
            </div>

            <div
              className="p-2.5 bg-slate-900 border border-slate-800 rounded font-mono text-xs text-purple-300 break-all"
              data-testid="primary-target-identifier"
            >
              {localization.primaryTargetIdentifier}
            </div>

            {/* Rationale */}
            <div
              className="text-xs text-slate-300 leading-relaxed bg-slate-900/40 p-2 rounded border border-slate-800/60"
              data-testid="localization-rationale"
            >
              <span className="font-semibold text-slate-200">Rationale: </span>
              {localization.localizationRationale}
            </div>

            {/* HTTP / DOM / Repository Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 text-2xs">
              {localization.httpEndpoint && (
                <div className="p-2 bg-slate-900/80 rounded border border-slate-800">
                  <span className="text-slate-400 block mb-0.5">HTTP Endpoint</span>
                  <span className="font-mono text-slate-200 font-bold">
                    {localization.httpMethod ?? 'GET'} {localization.httpEndpoint}
                  </span>
                  {localization.httpStatusCode && (
                    <span className="ml-2 px-1.5 py-0.5 bg-rose-500/20 text-rose-300 rounded font-mono">
                      {localization.httpStatusCode}
                    </span>
                  )}
                </div>
              )}

              {localization.domSelector && (
                <div className="p-2 bg-slate-900/80 rounded border border-slate-800">
                  <span className="text-slate-400 block mb-0.5">DOM Selector / Element</span>
                  <span className="font-mono text-slate-200 break-all">
                    {localization.domSelector}
                  </span>
                </div>
              )}

              {localization.matchedFilePath && (
                <div
                  className="p-2 bg-slate-900/80 rounded border border-slate-800 col-span-full"
                  data-testid="repo-linkage-card"
                >
                  <span className="text-slate-400 block mb-0.5">
                    Linked Repository Source (V2 Intelligence)
                  </span>
                  <span className="font-mono text-emerald-400 font-medium">
                    {localization.matchedFilePath}
                    {localization.matchedSymbolName && ` -> ${localization.matchedSymbolName}()`}
                    {localization.matchedLineNumber && ` (line ${localization.matchedLineNumber})`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Chronological Event Timeline */}
          {localization.timelineSummary.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span>Correlated Event Timeline ({localization.timelineSummary.length})</span>
                <span className="text-slate-400 font-normal text-2xs">
                  Step ➔ Network ➔ Console ➔ DOM ➔ Assertion
                </span>
              </h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {localization.timelineSummary.map(evt => (
                  <div
                    key={evt.eventId}
                    className="p-2 bg-slate-950/40 border border-slate-800/80 rounded flex items-start gap-2.5 text-xs hover:border-slate-700 transition"
                    data-testid={`timeline-event-${evt.eventId}`}
                  >
                    <span className="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded font-mono text-2xs shrink-0">
                      +{evt.relativeTimeMs}ms
                    </span>
                    <span className="px-1.5 py-0.5 bg-purple-950/50 text-purple-300 border border-purple-800/60 rounded font-mono text-2xs shrink-0">
                      {evt.eventType}
                    </span>
                    <span className="text-slate-300 text-xs break-all leading-snug">
                      {evt.summary}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Correlation Signals */}
          {localization.correlationSignals.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Correlation Signals ({localization.correlationSignals.length})
              </h4>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {localization.correlationSignals.map(sig => {
                  const strengthBadge =
                    SIGNAL_STRENGTH_BADGES[sig.strength] ?? SIGNAL_STRENGTH_BADGES.UNKNOWN;
                  return (
                    <div
                      key={sig.signalId}
                      className="p-2 bg-slate-950/40 border border-slate-800/80 rounded text-xs space-y-1"
                      data-testid={`correlation-signal-${sig.signalId}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-200">{sig.signalType}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-2xs font-bold ${strengthBadge.bg}`}
                        >
                          {strengthBadge.text}
                        </span>
                      </div>
                      <div className="text-slate-400 text-2xs font-mono">
                        Layer: <span className="text-slate-300">{sig.technicalLayer}</span> |
                        Target: <span className="text-slate-300">{sig.targetType}</span> (
                        {sig.targetIdentity})
                      </div>
                      <div className="text-slate-300 text-2xs">{sig.explanation}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Conflicting Signals Box */}
          {localization.conflictingSignals.length > 0 && (
            <div
              className="p-3 bg-amber-950/20 border border-amber-800/60 rounded space-y-1.5"
              data-testid="conflicting-signals-box"
            >
              <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <span>⚠️</span>
                <span>Conflicting Signals Detected ({localization.conflictingSignals.length})</span>
              </div>
              <div className="space-y-1">
                {localization.conflictingSignals.map(sig => (
                  <div key={sig.signalId} className="text-2xs text-amber-200/90 leading-relaxed">
                    <span className="font-semibold">{sig.signalType}: </span>
                    {sig.explanation}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata footer */}
          <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-2xs text-slate-400 font-mono">
            <span>Fingerprint: {localization.localizationFingerprint.slice(0, 16)}...</span>
            <span>Evaluated: {new Date(localization.localizedAt).toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* History Drawer */}
      {showHistory && (
        <div
          className="p-3 bg-slate-950 border border-slate-800 rounded space-y-2"
          data-testid="localization-history-drawer"
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-300">
            <span>Re-evaluation Audit Trail</span>
            <button
              type="button"
              onClick={() => setShowHistory(false)}
              className="text-slate-400 hover:text-slate-200"
            >
              ✕
            </button>
          </div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {history.map(item => (
              <div
                key={item.id}
                className={`p-2 rounded text-2xs border ${
                  item.isAuthoritative
                    ? 'bg-purple-950/30 border-purple-800/60'
                    : 'bg-slate-900 border-slate-800 opacity-70'
                }`}
              >
                <div className="flex items-center justify-between font-bold">
                  <span className="text-slate-200">
                    Attempt #{item.relocalizationCount} — {item.primaryLayer}
                  </span>
                  <span className="text-slate-400 font-mono">
                    {new Date(item.localizedAt).toLocaleString()}
                  </span>
                </div>
                {item.relocalizationReason && (
                  <div className="text-slate-300 mt-1 italic">
                    Reason: "{item.relocalizationReason}"
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Re-evaluate Modal */}
      {showRelocalizeModal && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          data-testid="modal-relocalize-localization"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-md w-full p-4 space-y-3 shadow-xl">
            <h3 className="text-sm font-bold text-slate-200">
              Re-evaluate Technical Cause Localization
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Re-correlating evidence will ingest newly available artifacts, evaluate the latest
              domain separation state, and generate a new immutable authoritative localization
              record.
            </p>
            <div>
              <label className="block text-2xs font-semibold text-slate-300 mb-1">
                Reason for Re-evaluation <span className="text-rose-400">*</span>
              </label>
              <textarea
                value={relocalizeReason}
                onChange={e => setRelocalizeReason(e.target.value)}
                placeholder="e.g. New network trace uploaded, or source code indexed"
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
                data-testid="input-relocalize-reason"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowRelocalizeModal(false);
                  setRelocalizeReason('');
                }}
                className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRelocalize}
                disabled={isRelocalizing || !relocalizeReason.trim()}
                className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded transition disabled:opacity-50"
                data-testid="btn-confirm-relocalize"
              >
                {isRelocalizing ? 'Re-evaluating...' : 'Confirm Re-evaluation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
