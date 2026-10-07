/**
 * @file apps/desktop/src/renderer/features/failures/PostFixSyncCard.tsx
 * UI component for Post-Fix Jira & Notification Updates (V7 Phase 107).
 * Displays synchronization state, Jira comment/transition status, email notification delivery,
 * evidence references, and bounded retry controls for failed sub-operations.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  PostFixSyncRecordDto,
  PostFixSyncStatus,
  PostFixSyncOutcome,
} from '@ai-quality/contracts';

export interface PostFixSyncCardProps {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly reverificationId?: string | null;
  readonly jiraIssueKey?: string | null;
  readonly onSyncComplete?: (record: PostFixSyncRecordDto) => void;
}

export const PostFixSyncCard: React.FC<PostFixSyncCardProps> = ({
  projectId,
  failureCaseId,
  reverificationId,
  jiraIssueKey,
  onSyncComplete,
}) => {
  const [activeRecord, setActiveRecord] = useState<PostFixSyncRecordDto | null>(null);
  const [history, setHistory] = useState<readonly PostFixSyncRecordDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [customNote, setCustomNote] = useState<string>('');
  const [notifyAssignee, setNotifyAssignee] = useState<boolean>(true);
  const [forceTransition, setForceTransition] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  const activeProjectRef = useRef(projectId);
  const activeFailureRef = useRef(failureCaseId);

  useEffect(() => {
    activeProjectRef.current = projectId;
    activeFailureRef.current = failureCaseId;
  }, [projectId, failureCaseId]);

  const loadSyncData = useCallback(async () => {
    const bridge = window.desktop?.postFix;
    if (!bridge) return;

    setIsLoading(true);
    setError(null);

    try {
      const historyRes = await bridge.listHistory({
        projectId,
        failureCaseId,
        limit: 10,
      });

      if (
        activeProjectRef.current === projectId &&
        activeFailureRef.current === failureCaseId &&
        historyRes.ok
      ) {
        setHistory(historyRes.data);
        if (historyRes.data.length > 0) {
          setActiveRecord(historyRes.data[0] ?? null);
        } else {
          setActiveRecord(null);
        }
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
    void loadSyncData();
  }, [loadSyncData]);

  const handleExecute = async () => {
    const bridge = window.desktop?.postFix;
    if (!bridge || !reverificationId) return;

    setIsExecuting(true);
    setError(null);

    try {
      const res = await bridge.execute({
        projectId,
        failureCaseId,
        reverificationId,
        customNote: customNote.trim() || undefined,
        notifyAssignee,
        forceTransition,
        actor: 'USER',
      });

      if (activeProjectRef.current !== projectId || activeFailureRef.current !== failureCaseId) return;

      if (res.ok) {
        setActiveRecord(res.data);
        setCustomNote('');
        void loadSyncData();
        onSyncComplete?.(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      if (activeProjectRef.current === projectId && activeFailureRef.current === failureCaseId) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (activeProjectRef.current === projectId && activeFailureRef.current === failureCaseId) {
        setIsExecuting(false);
      }
    }
  };

  const handleRetry = async () => {
    const bridge = window.desktop?.postFix;
    if (!bridge || !activeRecord) return;

    setIsRetrying(true);
    setError(null);

    try {
      const res = await bridge.retry({
        projectId,
        syncRecordId: activeRecord.id,
        actor: 'USER',
      });

      if (activeProjectRef.current !== projectId || activeFailureRef.current !== failureCaseId) return;

      if (res.ok) {
        setActiveRecord(res.data);
        void loadSyncData();
        onSyncComplete?.(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      if (activeProjectRef.current === projectId && activeFailureRef.current === failureCaseId) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (activeProjectRef.current === projectId && activeFailureRef.current === failureCaseId) {
        setIsRetrying(false);
      }
    }
  };

  const getStatusBadge = (status?: PostFixSyncStatus) => {
    switch (status) {
      case 'SUCCESS':
        return (
          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
            SUCCESS
          </span>
        );
      case 'PARTIAL_SUCCESS':
        return (
          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-950 text-amber-300 border border-amber-800">
            PARTIAL SUCCESS
          </span>
        );
      case 'FAILED':
        return (
          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-rose-950 text-rose-300 border border-rose-800">
            FAILED
          </span>
        );
      case 'SKIPPED':
        return (
          <span className="px-2 py-0.5 text-xs font-medium rounded bg-slate-800 text-slate-400 border border-slate-700">
            SKIPPED
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 text-xs font-medium rounded bg-slate-800 text-slate-400 border border-slate-700">
            NOT SYNCED
          </span>
        );
    }
  };

  const getOutcomeBadge = (outcome?: PostFixSyncOutcome) => {
    switch (outcome) {
      case 'VERIFIED_FIXED':
        return (
          <span className="px-2 py-0.5 text-[11px] font-mono font-medium rounded bg-emerald-900/50 text-emerald-300 border border-emerald-700/50">
            VERIFIED FIXED
          </span>
        );
      case 'STILL_FAILING':
        return (
          <span className="px-2 py-0.5 text-[11px] font-mono font-medium rounded bg-rose-900/50 text-rose-300 border border-rose-700/50">
            STILL FAILING
          </span>
        );
      case 'REGRESSION_DETECTED':
        return (
          <span className="px-2 py-0.5 text-[11px] font-mono font-medium rounded bg-amber-900/50 text-amber-300 border border-amber-700/50">
            REGRESSION DETECTED
          </span>
        );
      case 'BLOCKED':
        return (
          <span className="px-2 py-0.5 text-[11px] font-mono font-medium rounded bg-yellow-900/50 text-yellow-300 border border-yellow-700/50">
            BLOCKED
          </span>
        );
      case 'INCONCLUSIVE':
        return (
          <span className="px-2 py-0.5 text-[11px] font-mono font-medium rounded bg-slate-800 text-slate-300 border border-slate-700">
            INCONCLUSIVE
          </span>
        );
      default:
        return outcome ? (
          <span className="px-2 py-0.5 text-[11px] font-mono font-medium rounded bg-slate-800 text-slate-400 border border-slate-700">
            {outcome}
          </span>
        ) : null;
    }
  };

  const isRetryable =
    activeRecord &&
    (activeRecord.overallStatus === 'PARTIAL_SUCCESS' || activeRecord.overallStatus === 'FAILED');

  return (
    <div
      data-testid="post-fix-sync-card"
      className="bg-slate-900 border border-slate-800 rounded-lg p-4 mt-4 text-slate-100 shadow-sm space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="text-sm font-semibold text-slate-200">
              Post-Fix Jira & Notification Updates
            </h3>
            <span className="text-[10px] px-1.5 py-0.5 bg-indigo-950 text-indigo-300 rounded border border-indigo-800 font-mono">
              Phase 107
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Synchronizes authoritative reverification outcomes to Jira issues and dispatches QA notifications.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {jiraIssueKey && (
            <span
              data-testid="jira-key-badge"
              className="text-xs px-2 py-0.5 bg-blue-950/80 text-blue-300 border border-blue-800 rounded font-mono"
            >
              {jiraIssueKey}
            </span>
          )}
          {getStatusBadge(activeRecord?.overallStatus)}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          data-testid="post-fix-error-banner"
          className="p-3 bg-rose-950/60 border border-rose-800/80 rounded text-xs text-rose-200 flex items-start space-x-2"
        >
          <span className="font-bold shrink-0">Error:</span>
          <span>{error}</span>
        </div>
      )}

      {/* Current State / Overview */}
      {activeRecord ? (
        <div className="space-y-3 bg-slate-950/60 border border-slate-800/80 rounded-md p-3 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-slate-400">Outcome:</span>
              {getOutcomeBadge(activeRecord.outcome)}
            </div>
            <div className="text-slate-500 text-[11px]">
              Synchronized at {new Date(activeRecord.completedAt || activeRecord.createdAt).toLocaleTimeString()}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800/60">
            {/* Jira Sub-Operation Status */}
            <div className="space-y-1.5 bg-slate-900/60 p-2.5 rounded border border-slate-800/60">
              <span className="font-semibold text-slate-300">Jira Update</span>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-400">Comment:</span>
                <span
                  data-testid="jira-comment-status"
                  className={`font-mono ${
                    activeRecord.jiraCommentStatus === 'COMMENT_POSTED'
                      ? 'text-emerald-400'
                      : activeRecord.jiraCommentStatus === 'FAILED'
                        ? 'text-rose-400'
                        : 'text-slate-500'
                  }`}
                >
                  {activeRecord.jiraCommentStatus}
                </span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-400">Transition:</span>
                <span
                  data-testid="jira-transition-status"
                  className={`font-mono ${
                    activeRecord.jiraTransitionStatus === 'TRANSITIONED'
                      ? 'text-emerald-400'
                      : activeRecord.jiraTransitionStatus === 'FAILED'
                        ? 'text-rose-400'
                        : activeRecord.jiraTransitionStatus === 'TRANSITION_UNAVAILABLE'
                          ? 'text-amber-400'
                          : 'text-slate-500'
                  }`}
                >
                  {activeRecord.jiraTransitionStatus}
                </span>
              </div>
              {activeRecord.jiraToStatus && (
                <div className="text-[10px] text-slate-400">
                  Target Status: <span className="font-mono text-slate-200">{activeRecord.jiraToStatus}</span>
                </div>
              )}
              {activeRecord.jiraError && (
                <p className="text-[10px] text-rose-400 truncate mt-1" title={activeRecord.jiraError}>
                  {activeRecord.jiraError}
                </p>
              )}
            </div>

            {/* Notification Sub-Operation Status */}
            <div className="space-y-1.5 bg-slate-900/60 p-2.5 rounded border border-slate-800/60">
              <span className="font-semibold text-slate-300">Notification Delivery</span>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-400">Status:</span>
                <span
                  data-testid="notification-status"
                  className={`font-mono ${
                    activeRecord.notificationStatus === 'SENT'
                      ? 'text-emerald-400'
                      : activeRecord.notificationStatus === 'FAILED'
                        ? 'text-rose-400'
                        : 'text-slate-500'
                  }`}
                >
                  {activeRecord.notificationStatus}
                </span>
              </div>
              {activeRecord.notificationRecipient && (
                <div className="text-[10px] text-slate-400 truncate" title={activeRecord.notificationRecipient}>
                  To: <span className="font-mono text-slate-200">{activeRecord.notificationRecipient}</span>
                </div>
              )}
              {activeRecord.evidenceCount > 0 && (
                <div className="text-[10px] text-slate-400">
                  Attached Evidence: <span className="font-mono text-slate-200">{activeRecord.evidenceCount} items</span>
                </div>
              )}
              {activeRecord.notificationError && (
                <p className="text-[10px] text-rose-400 truncate mt-1" title={activeRecord.notificationError}>
                  {activeRecord.notificationError}
                </p>
              )}
            </div>
          </div>

          {activeRecord.retryCount > 0 && (
            <div className="text-[10px] text-slate-500 text-right">
              Retried: {activeRecord.retryCount} times
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs text-slate-500 bg-slate-950/40 p-3 rounded border border-slate-800/50">
          No synchronization record found for this verification. Click below to publish verification facts to Jira and notify assignees.
        </div>
      )}

      {/* Execution Form */}
      <div className="space-y-3 pt-1">
        <div>
          <label className="block text-xs text-slate-300 mb-1">
            Custom Engineering Note (optional)
          </label>
          <input
            type="text"
            data-testid="custom-note-input"
            value={customNote}
            onChange={e => setCustomNote(e.target.value)}
            placeholder="e.g. Verified on build #1042 with regression test suite passed"
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center space-x-6 text-xs text-slate-300">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              data-testid="notify-assignee-toggle"
              checked={notifyAssignee}
              onChange={e => setNotifyAssignee(e.target.checked)}
              className="rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-0"
            />
            <span>Notify Defect Assignee / QA Owner</span>
          </label>

          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              data-testid="force-transition-toggle"
              checked={forceTransition}
              onChange={e => setForceTransition(e.target.checked)}
              className="rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-0"
            />
            <span>Force Workflow Transition</span>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <button
            type="button"
            data-testid="toggle-history-button"
            onClick={() => setShowHistory(!showHistory)}
            className="text-xs text-slate-400 hover:text-slate-300 underline"
          >
            {showHistory ? 'Hide History' : `Show History (${history.length})`}
          </button>

          <div className="flex items-center space-x-2">
            {isRetryable && (
              <button
                type="button"
                data-testid="retry-sync-button"
                onClick={handleRetry}
                disabled={isRetrying || isLoading}
                className="px-3 py-1.5 rounded text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50 transition"
              >
                {isRetrying ? 'Retrying Failed...' : 'Retry Failed Updates'}
              </button>
            )}

            <button
              type="button"
              data-testid="execute-sync-button"
              onClick={handleExecute}
              disabled={isExecuting || isLoading || !reverificationId}
              className="px-4 py-1.5 rounded text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition"
            >
              {isExecuting ? 'Updating Jira...' : 'Update Jira & Notify'}
            </button>
          </div>
        </div>
      </div>

      {/* History Timeline */}
      {showHistory && (
        <div
          data-testid="post-fix-history-panel"
          className="mt-3 pt-3 border-t border-slate-800 space-y-2"
        >
          <h4 className="text-xs font-semibold text-slate-300">Synchronization History</h4>
          {history.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No sync records available.</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {history.map(item => (
                <div
                  key={item.id}
                  data-testid="history-item"
                  className="text-xs p-2 bg-slate-950/80 rounded border border-slate-800/80 flex items-start justify-between"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-slate-300">{item.overallStatus}</span>
                      {getOutcomeBadge(item.outcome)}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Jira: {item.jiraCommentStatus} / {item.jiraTransitionStatus} | Notif: {item.notificationStatus}
                    </div>
                    {item.customNote && (
                      <div className="text-[10px] text-slate-400 italic">"{item.customNote}"</div>
                    )}
                  </div>
                  <div className="text-right text-[10px] text-slate-500 shrink-0 ml-2">
                    <span>{item.actor}</span>
                    <span className="block">{new Date(item.createdAt).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
