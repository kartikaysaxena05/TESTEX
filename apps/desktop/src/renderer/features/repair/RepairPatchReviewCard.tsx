/**
 * @file apps/desktop/src/renderer/features/repair/RepairPatchReviewCard.tsx
 * Codex-style interactive Patch Review Card for V10 Phase 149 (Repair/Patch Tool).
 * Allows developers to safely review generated diffs, view bounds and reason,
 * and approve, reject, cancel, or apply patches with strict human oversight.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  RepairPatchToolOutputDto,
  RepairPatchStatus,
} from '@ai-quality/contracts';

export interface RepairPatchReviewCardProps {
  readonly projectId: string;
  readonly proposalId: string;
  readonly taskId?: string;
  readonly onStatusChange?: (updatedPatch: RepairPatchToolOutputDto) => void;
}

export const RepairPatchReviewCard: React.FC<RepairPatchReviewCardProps> = ({
  projectId,
  proposalId,
  taskId,
  onStatusChange,
}) => {
  const [patch, setPatch] = useState<RepairPatchToolOutputDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [showRejectInput, setShowRejectInput] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadPatch = useCallback(async () => {
    const bridge = window.desktop?.repairPatch;
    if (!bridge) {
      setError('Desktop repairPatch bridge is unavailable.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await bridge.get({ projectId, proposalId });
      if (res.ok) {
        setPatch(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [projectId, proposalId]);

  useEffect(() => {
    void loadPatch();
  }, [loadPatch]);

  const handleApprove = async () => {
    const bridge = window.desktop?.repairPatch;
    if (!bridge || !patch) return;

    setIsSubmitting(true);
    setError(null);
    setActionMessage(null);

    try {
      const res = await bridge.approve({
        projectId,
        proposalId: patch.proposalId,
        reviewComment: 'Approved via RepairPatchReviewCard',
      });

      if (res.ok) {
        setPatch(res.data);
        setActionMessage('Patch successfully approved.');
        onStatusChange?.(res.data);
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
    const bridge = window.desktop?.repairPatch;
    if (!bridge || !patch) return;

    if (!rejectReason.trim()) {
      setError('Please provide a reason for rejecting the patch.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setActionMessage(null);

    try {
      const res = await bridge.reject({
        projectId,
        proposalId: patch.proposalId,
        rejectionReason: 'OTHER',
        rejectionDetails: rejectReason.trim(),
      });

      if (res.ok) {
        setPatch(res.data);
        setShowRejectInput(false);
        setRejectReason('');
        setActionMessage('Patch has been rejected.');
        onStatusChange?.(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    const bridge = window.desktop?.repairPatch;
    if (!bridge || !patch) return;

    setIsSubmitting(true);
    setError(null);
    setActionMessage(null);

    try {
      const res = await bridge.cancel({
        projectId,
        proposalId: patch.proposalId,
        reason: 'Cancelled by user',
      });

      if (res.ok) {
        setPatch(res.data);
        setActionMessage('Patch cancelled.');
        onStatusChange?.(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApply = async () => {
    const bridge = window.desktop?.repairPatch;
    if (!bridge || !patch) return;

    setIsSubmitting(true);
    setError(null);
    setActionMessage(null);

    try {
      const res = await bridge.apply({
        projectId,
        proposalId: patch.proposalId,
      });

      if (res.ok) {
        setPatch(res.data);
        setActionMessage('Patch safely applied to workspace.');
        onStatusChange?.(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: RepairPatchStatus) => {
    const statusStyles: Record<RepairPatchStatus, { bg: string; text: string; border: string }> = {
      PROPOSED: { bg: 'bg-blue-900/30', text: 'text-blue-400', border: 'border-blue-700/50' },
      WAITING_FOR_APPROVAL: { bg: 'bg-amber-900/30', text: 'text-amber-400', border: 'border-amber-700/50' },
      APPROVED: { bg: 'bg-emerald-900/30', text: 'text-emerald-400', border: 'border-emerald-700/50' },
      REJECTED: { bg: 'bg-rose-900/30', text: 'text-rose-400', border: 'border-rose-700/50' },
      APPLIED: { bg: 'bg-teal-900/30', text: 'text-teal-400', border: 'border-teal-700/50' },
      CANCELLED: { bg: 'bg-zinc-800', text: 'text-zinc-400', border: 'border-zinc-700' },
      FAILED: { bg: 'bg-red-950/40', text: 'text-red-400', border: 'border-red-800/50' },
    };

    const style = statusStyles[status] ?? { bg: 'bg-zinc-800', text: 'text-zinc-300', border: 'border-zinc-700' };

    return (
      <span
        data-testid="patch-status-badge"
        className={`px-2.5 py-0.5 text-xs font-mono font-medium rounded-full border ${style.bg} ${style.text} ${style.border}`}
      >
        {status}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 text-sm animate-pulse" data-testid="patch-review-loading">
        Loading patch review...
      </div>
    );
  }

  if (error && !patch) {
    return (
      <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-sm" data-testid="patch-review-error">
        <p className="font-semibold mb-1">Failed to load patch:</p>
        <p>{error}</p>
        <button
          onClick={() => void loadPatch()}
          className="mt-3 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!patch) return null;

  return (
    <div
      data-testid="repair-patch-review-card"
      className="p-5 rounded-xl bg-zinc-900/90 border border-zinc-800 font-sans text-zinc-100 flex flex-col gap-4 shadow-xl backdrop-blur-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold tracking-wide text-zinc-100 flex items-center gap-2">
            <span>Repair Patch Review</span>
            <span className="text-xs text-zinc-400 font-mono">({patch.proposalId.slice(0, 8)})</span>
          </h3>
          {getStatusBadge(patch.status)}
        </div>
        <div className="text-xs text-zinc-400 font-mono">
          Task: <span className="text-zinc-300">{patch.taskId ?? taskId ?? 'N/A'}</span>
        </div>
      </div>

      {/* Messages */}
      {actionMessage && (
        <div className="p-2.5 text-xs rounded bg-emerald-950/40 border border-emerald-800/50 text-emerald-300" data-testid="patch-action-message">
          {actionMessage}
        </div>
      )}
      {error && (
        <div className="p-2.5 text-xs rounded bg-rose-950/40 border border-rose-800/50 text-rose-300" data-testid="patch-action-error">
          {error}
        </div>
      )}

      {/* Details */}
      <div className="grid grid-cols-2 gap-4 text-xs bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/50">
        <div>
          <span className="text-zinc-500 uppercase font-medium">Defect / Failure</span>
          <p className="text-zinc-200 font-mono mt-0.5">{patch.defectId ?? patch.failureId ?? 'N/A'}</p>
        </div>
        <div>
          <span className="text-zinc-500 uppercase font-medium">Target Files</span>
          <p className="text-zinc-200 font-mono mt-0.5">{patch.targetFiles.join(', ')}</p>
        </div>
        <div className="col-span-2">
          <span className="text-zinc-500 uppercase font-medium">Rationale</span>
          <p className="text-zinc-300 mt-0.5 leading-relaxed">{patch.reason}</p>
        </div>
      </div>

      {/* Diff View */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span className="font-semibold uppercase tracking-wider text-zinc-400">Unified Diff</span>
          <span className="font-mono text-[11px] text-zinc-500">
            {patch.patch.split('\n').length} lines
          </span>
        </div>
        <pre
          data-testid="patch-diff-content"
          className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 text-xs font-mono leading-relaxed overflow-x-auto text-zinc-300 max-h-72 select-text"
        >
          {patch.patch.split('\n').map((line: string, idx: number) => {
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
      </div>

      {/* Rejection Input */}
      {showRejectInput && (
        <div className="p-3 bg-rose-950/20 border border-rose-900/40 rounded-lg flex flex-col gap-2">
          <label className="text-xs text-rose-300 font-medium">Rejection Reason:</label>
          <input
            type="text"
            data-testid="reject-reason-input"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Broken test case or regression risk"
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500"
          />
          <div className="flex justify-end gap-2 mt-1">
            <button
              onClick={() => setShowRejectInput(false)}
              disabled={isSubmitting}
              className="px-2.5 py-1 text-xs rounded text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </button>
            <button
              data-testid="confirm-reject-button"
              onClick={() => void handleReject()}
              disabled={isSubmitting || !rejectReason.trim()}
              className="px-3 py-1 text-xs rounded bg-rose-600 hover:bg-rose-500 text-white font-medium disabled:opacity-50"
            >
              Confirm Rejection
            </button>
          </div>
        </div>
      )}

      {/* Action Controls */}
      <div className="flex items-center justify-between border-t border-zinc-800/80 pt-3 mt-1">
        <div className="flex gap-2">
          {patch.status === 'WAITING_FOR_APPROVAL' && !showRejectInput && (
            <>
              <button
                data-testid="reject-button"
                onClick={() => setShowRejectInput(true)}
                disabled={isSubmitting}
                className="px-3 py-1.5 rounded text-xs font-medium bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 transition-colors disabled:opacity-50"
              >
                Reject Patch
              </button>
              <button
                data-testid="cancel-button"
                onClick={() => void handleCancel()}
                disabled={isSubmitting}
                className="px-3 py-1.5 rounded text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          )}
        </div>

        <div className="flex gap-2">
          {patch.status === 'WAITING_FOR_APPROVAL' && (
            <button
              data-testid="approve-button"
              onClick={() => void handleApprove()}
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-colors disabled:opacity-50"
            >
              Approve Patch
            </button>
          )}

          {patch.status === 'APPROVED' && (
            <button
              data-testid="apply-button"
              onClick={() => void handleApply()}
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white shadow transition-colors disabled:opacity-50"
            >
              Apply to Workspace
            </button>
          )}

          {patch.status === 'APPLIED' && (
            <span className="text-xs text-teal-400 font-medium py-1 px-2">
              ✓ Applied to Workspace
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
