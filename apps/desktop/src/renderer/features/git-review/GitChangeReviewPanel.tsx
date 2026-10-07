/**
 * @file apps/desktop/src/renderer/features/git-review/GitChangeReviewPanel.tsx
 * Codex-style interactive Git Change Review panel for V10 Phase 150.
 *
 * Displays:
 * - Changed files breakdown (new, modified, deleted, untracked)
 * - Additions and deletions counts with badges
 * - Unified diff with additions (+ green), deletions (- red), hunks (@@ cyan)
 * - Security & secret redactions alerts ([REDACTED_SECRET])
 * - Potentially dangerous / infrastructure file warnings
 * - Clear distinction between proposed versus applied status
 * - Explicit human Approve / Reject decision gate controls
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  AgentGitChangeReviewDto,
  GitWorkingStatusDto,
  ChangeReviewStatus,
} from '@ai-quality/contracts';

export interface GitChangeReviewPanelProps {
  readonly projectId: string;
  readonly taskId?: string;
  readonly reviewId?: string;
  readonly onReviewUpdated?: (review: AgentGitChangeReviewDto) => void;
}

export const GitChangeReviewPanel: React.FC<GitChangeReviewPanelProps> = ({
  projectId,
  taskId,
  reviewId: initialReviewId,
  onReviewUpdated,
}) => {
  const [review, setReview] = useState<AgentGitChangeReviewDto | null>(null);
  const [workingStatus, setWorkingStatus] = useState<GitWorkingStatusDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [showRejectModal, setShowRejectModal] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'DIFF' | 'FILES' | 'STATUS'>('DIFF');

  const loadData = useCallback(async () => {
    const bridge = window.desktop?.gitReview;
    if (!bridge) {
      setError('Git Review desktop bridge unavailable.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const statusRes = await bridge.getStatus({ projectId });
      if (statusRes.ok) {
        setWorkingStatus(statusRes.data);
      }

      if (initialReviewId) {
        const reviewRes = await bridge.getReview({ projectId, reviewId: initialReviewId });
        if (reviewRes.ok && reviewRes.data) {
          setReview(reviewRes.data);
        }
      } else if (taskId) {
        // Auto-create or fetch review for this task
        const createRes = await bridge.createReview({ projectId, taskId });
        if (createRes.ok) {
          setReview(createRes.data);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [projectId, taskId, initialReviewId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleApprove = async () => {
    const bridge = window.desktop?.gitReview;
    if (!bridge || !review) return;

    setIsSubmitting(true);
    setError(null);
    setActionMessage(null);

    try {
      const res = await bridge.approveReview({
        projectId,
        reviewId: review.id,
        decisionComment: 'Approved via Change Review Panel',
      });

      if (res.ok) {
        setReview(res.data);
        setActionMessage('Changes approved successfully. Ready to apply.');
        onReviewUpdated?.(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    const bridge = window.desktop?.gitReview;
    if (!bridge || !review) return;

    if (!rejectReason.trim()) {
      setError('Please provide a reason for rejecting the change review.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setActionMessage(null);

    try {
      const res = await bridge.rejectReview({
        projectId,
        reviewId: review.id,
        reason: rejectReason.trim(),
      });

      if (res.ok) {
        setReview(res.data);
        setShowRejectModal(false);
        setRejectReason('');
        setActionMessage('Changes rejected.');
        onReviewUpdated?.(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: ChangeReviewStatus) => {
    const statusMap: Record<ChangeReviewStatus, { bg: string; text: string; label: string }> = {
      PENDING: { bg: 'bg-amber-950/40 text-amber-300 border-amber-800/60', text: 'text-amber-400', label: 'PROPOSED (PENDING REVIEW)' },
      REVIEWED: { bg: 'bg-blue-950/40 text-blue-300 border-blue-800/60', text: 'text-blue-400', label: 'REVIEWED' },
      APPROVED: { bg: 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60', text: 'text-emerald-400', label: 'APPROVED (READY TO APPLY)' },
      REJECTED: { bg: 'bg-rose-950/40 text-rose-300 border-rose-800/60', text: 'text-rose-400', label: 'REJECTED' },
      APPLIED: { bg: 'bg-teal-950/40 text-teal-300 border-teal-800/60', text: 'text-teal-400', label: 'APPLIED TO REPOSITORY' },
    };

    const style = statusMap[status] ?? { bg: 'bg-zinc-800 text-zinc-300 border-zinc-700', text: 'text-zinc-400', label: status };

    return (
      <span
        data-testid="git-review-status-badge"
        className={`px-2.5 py-0.5 text-xs font-mono font-medium rounded-full border ${style.bg}`}
      >
        {style.label}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-sm animate-pulse" data-testid="git-review-loading">
        Loading Git changes and review...
      </div>
    );
  }

  return (
    <div
      data-testid="git-change-review-panel"
      className="p-5 rounded-xl bg-zinc-900/95 border border-zinc-800 font-sans text-zinc-100 flex flex-col gap-4 shadow-2xl backdrop-blur-md"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold tracking-wide flex items-center gap-2">
            <span>Git Change Review</span>
            {review && <span className="text-xs text-zinc-400 font-mono">({review.id.slice(0, 8)})</span>}
          </h3>
          {review && getStatusBadge(review.status)}
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
          <span>Branch: <strong className="text-zinc-200">{workingStatus?.currentBranch ?? 'HEAD'}</strong></span>
          {workingStatus?.headCommit && (
            <span className="text-zinc-500">({workingStatus.headCommit.slice(0, 7)})</span>
          )}
        </div>
      </div>

      {/* Messages */}
      {actionMessage && (
        <div className="p-2.5 text-xs rounded bg-emerald-950/40 border border-emerald-800/50 text-emerald-300" data-testid="git-review-action-message">
          {actionMessage}
        </div>
      )}
      {error && (
        <div className="p-2.5 text-xs rounded bg-rose-950/40 border border-rose-800/50 text-rose-300" data-testid="git-review-error">
          {error}
        </div>
      )}

      {/* Security Alerts Banner */}
      {review?.analysis.hasSecretRedactions && (
        <div className="p-3 bg-amber-950/30 border border-amber-800/60 rounded-lg text-xs text-amber-200 flex items-start gap-2" data-testid="git-review-secret-warning">
          <span className="font-bold text-amber-400">⚠️ SECRET REDACTION ALERT:</span>
          <span>
            {review.analysis.redactedSecretOccurrences} sensitive credential(s) or token(s) were detected and automatically masked as <code>[REDACTED_SECRET]</code>.
          </span>
        </div>
      )}

      {review?.analysis.potentiallyDangerousFiles && review.analysis.potentiallyDangerousFiles.length > 0 && (
        <div className="p-3 bg-rose-950/30 border border-rose-800/60 rounded-lg text-xs text-rose-200 flex items-start gap-2" data-testid="git-review-danger-warning">
          <span className="font-bold text-rose-400">🚨 SENSITIVE / INFRASTRUCTURE CHANGES:</span>
          <span>
            This changeset modifies sensitive build or CI configuration: {review.analysis.potentiallyDangerousFiles.join(', ')}.
          </span>
        </div>
      )}

      {/* Summary Statistics */}
      {review && (
        <div className="grid grid-cols-4 gap-3 bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/60 text-xs">
          <div>
            <span className="text-zinc-500 uppercase font-medium">Files Changed</span>
            <p className="text-zinc-200 font-mono text-sm mt-0.5">{review.changedFiles.length}</p>
          </div>
          <div>
            <span className="text-zinc-500 uppercase font-medium">Lines Added</span>
            <p className="text-emerald-400 font-mono text-sm mt-0.5">+{review.additions}</p>
          </div>
          <div>
            <span className="text-zinc-500 uppercase font-medium">Lines Deleted</span>
            <p className="text-rose-400 font-mono text-sm mt-0.5">-{review.deletions}</p>
          </div>
          <div>
            <span className="text-zinc-500 uppercase font-medium">Safety Status</span>
            <p className="text-zinc-300 font-mono text-xs mt-0.5">{review.analysis.safetyAssessment}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 text-xs gap-4">
        <button
          onClick={() => setActiveTab('DIFF')}
          className={`pb-2 font-medium transition-colors ${
            activeTab === 'DIFF' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Unified Diff
        </button>
        <button
          onClick={() => setActiveTab('FILES')}
          className={`pb-2 font-medium transition-colors ${
            activeTab === 'FILES' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Files ({review?.changedFiles.length ?? 0})
        </button>
        <button
          onClick={() => setActiveTab('STATUS')}
          className={`pb-2 font-medium transition-colors ${
            activeTab === 'STATUS' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Working Tree Status
        </button>
      </div>

      {/* Tab 1: Diff View */}
      {activeTab === 'DIFF' && review && (
        <div className="flex flex-col gap-2">
          {review.diffContent ? (
            <pre
              data-testid="git-diff-content"
              className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 text-xs font-mono leading-relaxed overflow-x-auto text-zinc-300 max-h-80 select-text"
            >
              {review.diffContent.split('\n').map((line: string, idx: number) => {
                const isAdd = line.startsWith('+') && !line.startsWith('+++');
                const isDel = line.startsWith('-') && !line.startsWith('---');
                const isHunk = line.startsWith('@@');

                return (
                  <div
                    key={idx}
                    className={
                      isAdd
                        ? 'text-emerald-400 bg-emerald-950/20 px-1 -mx-1'
                        : isDel
                        ? 'text-rose-400 bg-rose-950/20 px-1 -mx-1'
                        : isHunk
                        ? 'text-cyan-400 bg-cyan-950/20 px-1 -mx-1 font-semibold'
                        : 'text-zinc-400'
                    }
                  >
                    {line || ' '}
                  </div>
                );
              })}
            </pre>
          ) : (
            <div className="p-6 text-center text-xs text-zinc-500 bg-zinc-950/40 rounded-lg border border-zinc-800">
              No differences detected. Working tree matches base revision.
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Changed Files List */}
      {activeTab === 'FILES' && review && (
        <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
          {review.changedFiles.map((file, idx) => (
            <div
              key={idx}
              className="p-2.5 rounded bg-zinc-950/60 border border-zinc-800 flex items-center justify-between text-xs"
            >
              <span className="font-mono text-zinc-200">{file}</span>
              <div className="flex gap-2">
                {review.analysis.potentiallyDangerousFiles.includes(file) && (
                  <span className="px-2 py-0.5 rounded text-[10px] bg-rose-950/60 text-rose-300 border border-rose-800/50">
                    DANGEROUS
                  </span>
                )}
                {review.analysis.dependencyConfigFiles.includes(file) && (
                  <span className="px-2 py-0.5 rounded text-[10px] bg-amber-950/60 text-amber-300 border border-amber-800/50">
                    CONFIG
                  </span>
                )}
                {review.analysis.testFiles.includes(file) && (
                  <span className="px-2 py-0.5 rounded text-[10px] bg-purple-950/60 text-purple-300 border border-purple-800/50">
                    TEST
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 3: Working Status */}
      {activeTab === 'STATUS' && workingStatus && (
        <div className="flex flex-col gap-3 text-xs bg-zinc-950/60 p-3 rounded-lg border border-zinc-800">
          <div>
            <span className="text-zinc-500">Repository Root:</span>{' '}
            <span className="font-mono text-zinc-300">{workingStatus.repositoryRoot}</span>
          </div>
          <div>
            <span className="text-zinc-500">Total Changed Files:</span>{' '}
            <span className="font-mono text-zinc-300">{workingStatus.totalChangedFiles}</span>
          </div>
          <div>
            <span className="text-zinc-500">Staged Files:</span>{' '}
            <span className="font-mono text-zinc-300">{workingStatus.stagedFiles.length}</span>
          </div>
          <div>
            <span className="text-zinc-500">Unstaged Files:</span>{' '}
            <span className="font-mono text-zinc-300">{workingStatus.unstagedFiles.length}</span>
          </div>
          <div>
            <span className="text-zinc-500">Untracked Files:</span>{' '}
            <span className="font-mono text-zinc-300">{workingStatus.untrackedFiles.length}</span>
          </div>
        </div>
      )}

      {/* Rejection Modal / Input */}
      {showRejectModal && (
        <div className="p-3 bg-rose-950/20 border border-rose-900/40 rounded-lg flex flex-col gap-2">
          <label className="text-xs text-rose-300 font-medium">Rejection Reason:</label>
          <input
            type="text"
            data-testid="git-review-reject-input"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Incomplete test coverage or unauthorized dependency bump"
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500"
          />
          <div className="flex justify-end gap-2 mt-1">
            <button
              onClick={() => setShowRejectModal(false)}
              disabled={isSubmitting}
              className="px-2.5 py-1 text-xs rounded text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </button>
            <button
              data-testid="git-review-confirm-reject"
              onClick={() => void handleReject()}
              disabled={isSubmitting || !rejectReason.trim()}
              className="px-3 py-1 text-xs rounded bg-rose-600 hover:bg-rose-500 text-white font-medium disabled:opacity-50"
            >
              Confirm Rejection
            </button>
          </div>
        </div>
      )}

      {/* Human Decision Controls */}
      {review && (
        <div className="flex items-center justify-between border-t border-zinc-800/80 pt-3 mt-1">
          <div className="text-xs text-zinc-400">
            {review.status === 'PENDING' && (
              <span>⚠️ Explicit human review required before applying changes.</span>
            )}
            {review.status === 'APPROVED' && (
              <span className="text-emerald-400">✓ Changes approved by operator.</span>
            )}
            {review.status === 'REJECTED' && (
              <span className="text-rose-400">✗ Changes rejected.</span>
            )}
          </div>

          <div className="flex gap-2">
            {review.status === 'PENDING' && !showRejectModal && (
              <>
                <button
                  data-testid="git-review-reject-button"
                  onClick={() => setShowRejectModal(true)}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 rounded text-xs font-medium bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 transition-colors disabled:opacity-50"
                >
                  Reject Changes
                </button>
                <button
                  data-testid="git-review-approve-button"
                  onClick={() => void handleApprove()}
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-colors disabled:opacity-50"
                >
                  Approve Changes
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
