/**
 * @file apps/desktop/src/renderer/features/failures/DefectReverificationCard.tsx
 * UI component for Defect Reverification Foundation (V7 Phase 97).
 * Displays reverification status, eligibility, historical provenance, production safety, and audit timeline.
 * Strictly excludes execution controls (no 'Run Test' or 'Mark Fixed').
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  DefectReverificationDto,
  ReverificationAuditEventDto,
  EvaluateReverificationEligibilityOutputDto,
} from '@ai-quality/contracts';
import { DefectVerificationPanel } from './DefectVerificationPanel.js';
import { QuickFixEligibilityCard } from './QuickFixEligibilityCard.js';
import { DefectLocalizationCard } from './DefectLocalizationCard.js';
import { PatchProposalCard } from './PatchProposalCard.js';
import { PostFixSyncCard } from './PostFixSyncCard.js';
import { RepairAuditTrailCard } from './RepairAuditTrailCard.js';

export interface DefectReverificationCardProps {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly bugReportId?: string | null;
  readonly jiraIssueKey?: string | null;
}

export const DefectReverificationCard: React.FC<DefectReverificationCardProps> = ({
  projectId,
  failureCaseId,
  bugReportId: _bugReportId,
  jiraIssueKey,
}) => {
  const [reverificationState, setReverificationState] = useState<DefectReverificationDto | null>(
    null,
  );
  const [eligibilityData, setEligibilityData] =
    useState<EvaluateReverificationEligibilityOutputDto | null>(null);
  const [auditEvents, setAuditEvents] = useState<readonly ReverificationAuditEventDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuditHistory, setShowAuditHistory] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);

  // References to protect against project/bug switch race conditions (Prompt Section 32, 33)
  const activeProjectRef = useRef(projectId);
  const activeBugRef = useRef(failureCaseId);

  useEffect(() => {
    activeProjectRef.current = projectId;
    activeBugRef.current = failureCaseId;
  }, [projectId, failureCaseId]);

  const loadReverificationState = useCallback(async () => {
    const bridge = window.desktop?.reverification;
    if (!bridge) return;

    setIsLoading(true);
    setError(null);
    try {
      const stateRes = await bridge.getState({ projectId, failureCaseId });
      if (activeProjectRef.current !== projectId || activeBugRef.current !== failureCaseId) return;

      if (stateRes.ok) {
        setReverificationState(stateRes.data);
        if (stateRes.data) {
          const eventsRes = await bridge.listAuditEvents({
            projectId,
            reverificationId: stateRes.data.id,
          });
          if (
            activeProjectRef.current === projectId &&
            activeBugRef.current === failureCaseId &&
            eventsRes.ok
          ) {
            setAuditEvents(eventsRes.data);
          }
        }
      } else {
        setError(stateRes.error.message);
      }

      const evalRes = await bridge.evaluateEligibility({
        projectId,
        failureCaseId,
        triggerType: 'MANUAL_REQUEST',
      });
      if (
        activeProjectRef.current === projectId &&
        activeBugRef.current === failureCaseId &&
        evalRes.ok
      ) {
        setEligibilityData(evalRes.data);
      }
    } catch (err) {
      if (activeProjectRef.current === projectId && activeBugRef.current === failureCaseId) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (activeProjectRef.current === projectId && activeBugRef.current === failureCaseId) {
        setIsLoading(false);
      }
    }
  }, [projectId, failureCaseId]);

  useEffect(() => {
    loadReverificationState();
  }, [loadReverificationState]);

  const handlePrepareReverification = async () => {
    const bridge = window.desktop?.reverification;
    if (!bridge) return;

    setIsProcessing(true);
    setError(null);
    try {
      const res = await bridge.createRequest({
        projectId,
        failureCaseId,
        triggerType: 'MANUAL_REQUEST',
        actor: 'USER',
      });
      if (activeProjectRef.current === projectId && activeBugRef.current === failureCaseId) {
        if (res.ok) {
          setReverificationState(res.data);
          const eventsRes = await bridge.listAuditEvents({
            projectId,
            reverificationId: res.data.id,
          });
          if (eventsRes.ok) setAuditEvents(eventsRes.data);
        } else {
          setError(res.error.message);
        }
      }
    } catch (err) {
      if (activeProjectRef.current === projectId && activeBugRef.current === failureCaseId) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (activeProjectRef.current === projectId && activeBugRef.current === failureCaseId) {
        setIsProcessing(false);
      }
    }
  };

  const handleCancelReverification = async () => {
    if (!reverificationState) return;
    const bridge = window.desktop?.reverification;
    if (!bridge) return;

    setIsProcessing(true);
    setError(null);
    try {
      const res = await bridge.cancel({
        projectId,
        reverificationId: reverificationState.id,
        reason: cancelReason || 'Cancelled by user request in workspace.',
        actor: 'USER',
      });
      if (activeProjectRef.current === projectId && activeBugRef.current === failureCaseId) {
        if (res.ok) {
          setReverificationState(res.data);
          setShowCancelModal(false);
          setCancelReason('');
          const eventsRes = await bridge.listAuditEvents({
            projectId,
            reverificationId: res.data.id,
          });
          if (eventsRes.ok) setAuditEvents(eventsRes.data);
        } else {
          setError(res.error.message);
        }
      }
    } catch (err) {
      if (activeProjectRef.current === projectId && activeBugRef.current === failureCaseId) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (activeProjectRef.current === projectId && activeBugRef.current === failureCaseId) {
        setIsProcessing(false);
      }
    }
  };

  const status = reverificationState?.status || 'DRAFT';
  const eligibility = eligibilityData?.eligibility || reverificationState?.eligibility || 'UNKNOWN';
  const reasons = eligibilityData?.reasons || reverificationState?.eligibilityReasons || [];
  const safetyStatus =
    eligibilityData?.safetyStatus || reverificationState?.safetyStatus || 'UNKNOWN';
  const originalTestVersion =
    reverificationState?.originalTestCaseVersionNumber ??
    eligibilityData?.originalTestCaseVersionNumber ??
    1;
  const selectedTestVersion =
    reverificationState?.selectedTestCaseVersionNumber ??
    eligibilityData?.selectedTestCaseVersionNumber ??
    1;

  return (
    <div
      data-testid="defect-reverification-card"
      className="defect-reverification-card p-4 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 shadow-md space-y-4 my-4"
    >
      {/* Card Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-3">
          <h3 className="text-base font-semibold text-slate-200">
            Defect Reverification Foundation
          </h3>
          <span
            data-testid="reverification-status-badge"
            className={`px-2.5 py-0.5 text-xs font-semibold rounded-full uppercase tracking-wider ${
              status === 'READY'
                ? 'bg-emerald-900/60 text-emerald-400 border border-emerald-700/50'
                : status === 'BLOCKED'
                  ? 'bg-rose-900/60 text-rose-400 border border-rose-700/50'
                  : status === 'SUPERSEDED'
                    ? 'bg-amber-900/60 text-amber-400 border border-amber-700/50'
                    : status === 'CANCELLED'
                      ? 'bg-slate-700 text-slate-300 border border-slate-600'
                      : 'bg-blue-900/60 text-blue-400 border border-blue-700/50'
            }`}
          >
            {status}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <span
            data-testid="reverification-eligibility-badge"
            className={`px-2 py-0.5 text-xs font-medium rounded ${
              eligibility === 'ELIGIBLE'
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                : eligibility === 'BLOCKED'
                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            Eligibility: {eligibility}
          </span>
          <button
            type="button"
            onClick={loadReverificationState}
            disabled={isLoading || isProcessing}
            className="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition border border-slate-700"
            title="Refresh eligibility status"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div
          data-testid="reverification-error-banner"
          className="p-3 bg-rose-950/80 border border-rose-800 text-rose-200 text-sm rounded flex items-start justify-between"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-200 text-xs font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Grid of Key Metadata */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs bg-slate-950/40 p-3 rounded border border-slate-800/80">
        <div>
          <span className="text-slate-400 block">Original Test Version:</span>
          <span
            data-testid="original-test-version"
            className="font-mono font-semibold text-slate-200"
          >
            v{originalTestVersion} (Preserved)
          </span>
        </div>

        <div>
          <span className="text-slate-400 block">Selected Test Version:</span>
          <span data-testid="selected-test-version" className="font-mono text-slate-200">
            v{selectedTestVersion}
          </span>
        </div>

        <div>
          <span className="text-slate-400 block">Production Safety:</span>
          <span
            data-testid="safety-status-badge"
            className={`font-semibold ${
              safetyStatus === 'SAFE' ? 'text-emerald-400' : 'text-rose-400 font-bold'
            }`}
          >
            {safetyStatus}
          </span>
        </div>

        <div>
          <span className="text-slate-400 block">Jira Defect Link:</span>
          <span data-testid="jira-issue-key" className="font-mono text-cyan-400">
            {jiraIssueKey || 'None (Internal Only)'}
          </span>
        </div>

        <div>
          <span className="text-slate-400 block">Requirement:</span>
          <span
            data-testid="requirement-provenance"
            className="font-mono text-slate-300 truncate block"
          >
            {reverificationState?.requirementKey ||
              reverificationState?.requirementId ||
              'Not Linked'}
          </span>
        </div>

        <div>
          <span className="text-slate-400 block">Fix Reference:</span>
          <span data-testid="fix-reference" className="font-mono text-slate-300 truncate block">
            {reverificationState?.fixReference || 'UNKNOWN (No commit/PR)'}
          </span>
        </div>

        <div>
          <span className="text-slate-400 block">Trigger:</span>
          <span data-testid="trigger-type" className="text-slate-300">
            {reverificationState?.triggerType || 'MANUAL_REQUEST'}
          </span>
        </div>

        <div>
          <span className="text-slate-400 block">Requested By:</span>
          <span className="text-slate-300">{reverificationState?.requestedBy || 'SYSTEM'}</span>
        </div>
      </div>

      {/* Eligibility Reasons Callout */}
      {reasons.length > 0 && (
        <div className="bg-slate-950/60 p-3 rounded border border-slate-800 text-xs space-y-1">
          <span className="font-semibold text-slate-300 block">
            Factual Eligibility Evaluation:
          </span>
          <ul
            data-testid="eligibility-reasons-list"
            className="list-disc list-inside space-y-0.5 text-slate-400"
          >
            {reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Safety Alert if Blocked */}
      {reverificationState?.safetyReason && (
        <div
          data-testid="safety-alert"
          className="p-2.5 bg-amber-950/40 border border-amber-800/80 text-amber-200 text-xs rounded"
        >
          <span className="font-semibold block">Safety Guard:</span>
          {reverificationState.safetyReason}
        </div>
      )}

      {/* Action Controls */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800">
        <div className="flex items-center space-x-2">
          <button
            type="button"
            data-testid="prepare-reverification-btn"
            onClick={handlePrepareReverification}
            disabled={isProcessing || isLoading}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded transition shadow"
          >
            {isProcessing ? 'Preparing...' : 'Prepare Reverification'}
          </button>

          {reverificationState &&
            reverificationState.status !== 'CANCELLED' &&
            reverificationState.status !== 'SUPERSEDED' && (
              <button
                type="button"
                data-testid="cancel-reverification-btn"
                onClick={() => setShowCancelModal(true)}
                disabled={isProcessing}
                className="px-3 py-1.5 bg-rose-800 hover:bg-rose-700 disabled:opacity-50 text-rose-100 text-xs font-medium rounded transition"
              >
                Cancel Reverification
              </button>
            )}

          <button
            type="button"
            data-testid="toggle-audit-btn"
            onClick={() => setShowAuditHistory(!showAuditHistory)}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded transition border border-slate-700"
          >
            {showAuditHistory ? 'Hide Audit History' : `Audit History (${auditEvents.length})`}
          </button>
        </div>

        <span className="text-[11px] text-slate-500 italic">
          Execution reserved for Phase 98 automated rerun
        </span>
      </div>

      {/* Cancellation Modal */}
      {showCancelModal && (
        <div
          data-testid="cancellation-modal"
          className="p-3 bg-slate-950 border border-rose-700 rounded space-y-2"
        >
          <span className="text-xs font-semibold text-rose-300 block">
            Confirm Reverification Cancellation
          </span>
          <input
            type="text"
            data-testid="cancel-reason-input"
            placeholder="Reason for cancellation (required)"
            value={cancelReason}
            onChange={e => setCancelReason(e.target.value)}
            className="w-full px-2.5 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200"
          />
          <div className="flex justify-end space-x-2 pt-1">
            <button
              type="button"
              onClick={() => setShowCancelModal(false)}
              className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200"
            >
              Back
            </button>
            <button
              type="button"
              data-testid="confirm-cancel-btn"
              onClick={handleCancelReverification}
              disabled={isProcessing || !cancelReason.trim()}
              className="px-3 py-1 bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white text-xs rounded font-medium"
            >
              Confirm Cancel
            </button>
          </div>
        </div>
      )}

      {/* Audit History Timeline */}
      {showAuditHistory && (
        <div
          data-testid="audit-history-panel"
          className="mt-3 pt-3 border-t border-slate-800 space-y-2"
        >
          <h4 className="text-xs font-semibold text-slate-300">Audit Event Timeline</h4>
          {auditEvents.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No audit events recorded.</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {auditEvents.map(evt => (
                <div
                  key={evt.id}
                  data-testid="audit-event-item"
                  className="text-xs p-2 bg-slate-950/80 rounded border border-slate-800/80 flex items-start justify-between"
                >
                  <div>
                    <span className="font-semibold text-slate-300">{evt.action}</span>
                    {evt.fromStatus && evt.toStatus && (
                      <span className="text-slate-500 ml-1.5 font-mono text-[10px]">
                        ({evt.fromStatus} → {evt.toStatus})
                      </span>
                    )}
                    {evt.reason && (
                      <p className="text-slate-400 text-[11px] mt-0.5">{evt.reason}</p>
                    )}
                  </div>
                  <div className="text-right text-[10px] text-slate-500 shrink-0 ml-2">
                    <span>{evt.actor}</span>
                    <span className="block">{new Date(evt.createdAt).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Automated Failed-Test Rerun & Fix Verification (V7 Phase 98) */}
      <DefectVerificationPanel
        projectId={projectId}
        failureCaseId={failureCaseId}
        reverificationId={reverificationState?.id}
        onVerificationComplete={() => {
          void loadReverificationState();
        }}
      />

      {/* AI Quick-Fix Eligibility & Safety Analysis (V7 Phase 99) */}
      <QuickFixEligibilityCard projectId={projectId} failureCaseId={failureCaseId} />

      {/* Repository-Aware Defect Localization (V7 Phase 100) */}
      <DefectLocalizationCard projectId={projectId} failureCaseId={failureCaseId} />

      {/* Limited AI Patch Generation (V7 Phase 101) */}
      <PatchProposalCard projectId={projectId} failureCaseId={failureCaseId} />

      {/* Post-Fix Jira & Notification Updates (V7 Phase 107) */}
      <PostFixSyncCard
        projectId={projectId}
        failureCaseId={failureCaseId}
        reverificationId={reverificationState?.id}
        jiraIssueKey={jiraIssueKey}
      />

      {/* Complete Repair & Reverification Audit Trail (V7 Phase 108) */}
      <RepairAuditTrailCard
        projectId={projectId}
        failureCaseId={failureCaseId}
      />
    </div>
  );
};
