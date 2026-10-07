/**
 * @file apps/desktop/src/renderer/features/failures/PatchApprovalCard.tsx
 * UI component for Human Approval, Reject & Apply Workflow (V7 Phase 104).
 * Enforces mandatory human decision gate before any patch touches workspace files.
 * Provides explicit approve/reject controls, patch immutability guarantees,
 * repository drift defense, atomic apply confirmation, and full audit trail.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  DefectPatchApprovalDto,
  PatchApprovalStatusDto,
  PatchRejectionReasonDto,
  PatchApprovalAuditEntryDto,
} from '@ai-quality/contracts';
import { PatchRollbackCard } from './PatchRollbackCard.js';

export interface PatchApprovalCardProps {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly patchProposalId?: string;
  readonly onApprovalChanged?: (approval: DefectPatchApprovalDto) => void;
}

export const PatchApprovalCard: React.FC<PatchApprovalCardProps> = ({
  projectId,
  failureCaseId,
  patchProposalId,
  onApprovalChanged,
}) => {
  const [approvals, setApprovals] = useState<readonly DefectPatchApprovalDto[]>([]);
  const [activeApproval, setActiveApproval] = useState<DefectPatchApprovalDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [isRejecting, setIsRejecting] = useState<boolean>(false);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Review & Modals
  const [reviewComment, setReviewComment] = useState<string>('');
  const [showRejectModal, setShowRejectModal] = useState<boolean>(false);
  const [rejectionReason, setRejectionReason] = useState<PatchRejectionReasonDto>('INCORRECT_FIX');
  const [rejectionDetails, setRejectionDetails] = useState<string>('');
  const [showApplyModal, setShowApplyModal] = useState<boolean>(false);
  const [showAuditTrail, setShowAuditTrail] = useState<boolean>(false);
  const [showDiff, setShowDiff] = useState<boolean>(false);

  const activeProjectRef = useRef(projectId);
  const activeFailureRef = useRef(failureCaseId);

  useEffect(() => {
    activeProjectRef.current = projectId;
    activeFailureRef.current = failureCaseId;
  }, [projectId, failureCaseId]);

  const loadApprovals = useCallback(async () => {
    const bridge = window.desktop?.patchApproval;
    if (!bridge) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await bridge.list({
        projectId,
        failureCaseId,
        patchProposalId,
      });

      if (activeProjectRef.current !== projectId || activeFailureRef.current !== failureCaseId) {
        return;
      }

      if (res.ok) {
        setApprovals(res.data);
        const latest = res.data[0] ?? null;
        setActiveApproval(latest);
        if (latest && onApprovalChanged) {
          onApprovalChanged(latest);
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
  }, [projectId, failureCaseId, patchProposalId, onApprovalChanged]);

  useEffect(() => {
    void loadApprovals();
  }, [loadApprovals]);

  const handleApprove = async () => {
    if (!activeApproval) return;
    const bridge = window.desktop?.patchApproval;
    if (!bridge) return;

    setIsApproving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await bridge.approve({
        projectId,
        approvalId: activeApproval.id,
        reviewComment: reviewComment.trim() || undefined,
        reviewedBy: 'HUMAN_REVIEWER',
      });

      if (res.ok) {
        setActiveApproval(res.data);
        setSuccessMessage('Patch proposal approved. Ready for controlled workspace application.');
        if (onApprovalChanged) {
          onApprovalChanged(res.data);
        }
        void loadApprovals();
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!activeApproval) return;
    const bridge = window.desktop?.patchApproval;
    if (!bridge) return;

    setIsRejecting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await bridge.reject({
        projectId,
        approvalId: activeApproval.id,
        rejectionReason,
        rejectionDetails: rejectionDetails.trim() || undefined,
        reviewedBy: 'HUMAN_REVIEWER',
      });

      if (res.ok) {
        setActiveApproval(res.data);
        setShowRejectModal(false);
        setSuccessMessage('Patch rejected. Source code remains 100% untouched.');
        if (onApprovalChanged) {
          onApprovalChanged(res.data);
        }
        void loadApprovals();
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRejecting(false);
    }
  };

  const handleApply = async () => {
    if (!activeApproval) return;
    const bridge = window.desktop?.patchApproval;
    if (!bridge) return;

    setIsApplying(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await bridge.apply({
        projectId,
        approvalId: activeApproval.id,
        appliedBy: 'HUMAN_REVIEWER',
      });

      if (res.ok) {
        setActiveApproval(res.data);
        setShowApplyModal(false);
        setSuccessMessage(
          `Patch successfully applied to workspace (${res.data.filesModifiedCount} files modified). Zero git commits or pushes made.`,
        );
        if (onApprovalChanged) {
          onApprovalChanged(res.data);
        }
        void loadApprovals();
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsApplying(false);
    }
  };

  const getStatusBadge = (status: PatchApprovalStatusDto) => {
    switch (status) {
      case 'PENDING_REVIEW':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            Pending Human Review
          </span>
        );
      case 'APPROVED':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            Approved (Ready to Apply)
          </span>
        );
      case 'REJECTED':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
            Rejected (Untouched)
          </span>
        );
      case 'APPLYING':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 animate-pulse">
            Applying to Workspace...
          </span>
        );
      case 'APPLIED':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
            Applied to Workspace
          </span>
        );
      case 'APPLY_FAILED':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-500/20 text-red-300 border border-red-500/30">
            Apply Failed (Rolled Back)
          </span>
        );
      case 'SUPERSEDED':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-500/20 text-slate-300 border border-slate-500/30">
            Superseded
          </span>
        );
      case 'ROLLED_BACK':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-orange-500/20 text-orange-300 border border-orange-500/30">
            Rolled Back (S2 == S0)
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-700 text-slate-300">
            {status}
          </span>
        );
    }
  };

  if (!activeApproval && !isLoading && approvals.length === 0) {
    return (
      <div className="mt-4 p-4 rounded-lg border border-slate-800 bg-slate-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Phase 104 — Human Approval, Reject & Apply Workflow
            </span>
          </div>
          <span className="text-xs text-slate-500">Awaiting Validation (Phase 103)</span>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Once the candidate patch completes Phase 103 sandbox validation with outcome VALID, the
          mandatory human decision gate will be unlocked here for review.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900 overflow-hidden shadow-md">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
        <div className="flex items-center space-x-3">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Phase 104: Human Decision Gate
          </span>
          {activeApproval && getStatusBadge(activeApproval.status)}
        </div>
        {activeApproval && (
          <div className="text-[11px] text-slate-400 font-mono">
            Rev: {activeApproval.baseRevision.substring(0, 8)}
          </div>
        )}
      </div>

      {/* Safety Invariant Notice */}
      <div className="px-4 py-2 bg-amber-950/20 border-b border-amber-900/30 flex items-center space-x-2 text-[11px] text-amber-300">
        <span className="font-semibold">Safety Invariant:</span>
        <span>
          AI-generated patches NEVER apply automatically. Explicit human review and approval are
          mandatorily enforced before any workspace file modification.
        </span>
      </div>

      {/* Messages */}
      {error && (
        <div className="m-4 p-3 rounded bg-rose-950/50 border border-rose-800 text-xs text-rose-300 flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-200 ml-2 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {successMessage && (
        <div className="m-4 p-3 rounded bg-emerald-950/50 border border-emerald-800 text-xs text-emerald-300 flex items-center justify-between">
          <span>{successMessage}</span>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-400 hover:text-emerald-200 ml-2 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Active Approval Content */}
      {activeApproval && (
        <div className="p-4 space-y-4">
          {/* Metadata Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                Patch Hash (Immutability)
              </div>
              <div
                className="text-xs font-mono text-slate-200 mt-0.5 truncate"
                title={activeApproval.reviewedPatchHash}
              >
                {activeApproval.reviewedPatchHash.substring(0, 12)}...
              </div>
            </div>

            <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                Base Revision
              </div>
              <div className="text-xs font-mono text-slate-200 mt-0.5">
                {activeApproval.baseRevision.substring(0, 12)}
              </div>
            </div>

            <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Reviewer</div>
              <div className="text-xs text-slate-200 mt-0.5">
                {activeApproval.reviewedBy ?? 'Awaiting Human'}
              </div>
            </div>

            <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                Files Affected
              </div>
              <div className="text-xs text-slate-200 mt-0.5">
                {activeApproval.affectedFiles.length > 0
                  ? `${activeApproval.affectedFiles.length} file(s)`
                  : 'N/A'}
              </div>
            </div>
          </div>

          {/* Rejection Details Banner if REJECTED */}
          {activeApproval.status === 'REJECTED' && (
            <div className="p-3 rounded bg-rose-950/30 border border-rose-900 text-xs text-rose-300 space-y-1">
              <div className="font-semibold flex items-center space-x-2">
                <span>Reason: {activeApproval.rejectionReason}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-900/50 text-rose-200">
                  Workspace 100% Untouched
                </span>
              </div>
              {activeApproval.rejectionDetails && (
                <div className="text-slate-300 text-[11px]">{activeApproval.rejectionDetails}</div>
              )}
              {activeApproval.reviewedAt && (
                <div className="text-[10px] text-slate-500">
                  Rejected on {new Date(activeApproval.reviewedAt).toLocaleString()} by{' '}
                  {activeApproval.reviewedBy}
                </div>
              )}
            </div>
          )}

          {/* Applied Details Banner if APPLIED */}
          {activeApproval.status === 'APPLIED' && (
            <div className="p-3 rounded bg-purple-950/30 border border-purple-900 text-xs text-purple-300 space-y-1">
              <div className="font-semibold flex items-center justify-between">
                <span>Successfully Applied to Local Workspace</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/50 text-purple-200">
                  0 Commits / 0 Pushes
                </span>
              </div>
              <div className="text-[11px] text-slate-300">
                Modified {activeApproval.filesModifiedCount} files (+{activeApproval.linesAdded}, -
                {activeApproval.linesRemoved} lines).
              </div>
              {activeApproval.appliedAt && (
                <div className="text-[10px] text-slate-500">
                  Applied on {new Date(activeApproval.appliedAt).toLocaleString()} by{' '}
                  {activeApproval.appliedBy}
                </div>
              )}
            </div>
          )}

          {/* Diff View Toggle */}
          {activeApproval.appliedUnifiedDiff && (
            <div>
              <button
                onClick={() => setShowDiff(!showDiff)}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-medium flex items-center space-x-1"
              >
                <span>{showDiff ? '▼ Hide Applied Diff' : '► Show Applied Diff'}</span>
              </button>
              {showDiff && (
                <pre className="mt-2 p-3 bg-slate-950 border border-slate-800 rounded font-mono text-[11px] text-slate-300 overflow-x-auto max-h-60">
                  {activeApproval.appliedUnifiedDiff}
                </pre>
              )}
            </div>
          )}

          {/* Action Controls */}
          {activeApproval.status === 'PENDING_REVIEW' && (
            <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-3">
              <div className="text-xs font-semibold text-slate-300">Human Review & Decision</div>
              <textarea
                value={reviewComment}
                onChange={e => setReviewComment(e.target.value)}
                placeholder="Optional review notes or decision context..."
                rows={2}
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
              <div className="flex items-center justify-end space-x-3">
                <button
                  onClick={() => setShowRejectModal(true)}
                  disabled={isRejecting || isApproving}
                  className="px-3 py-1.5 rounded text-xs bg-rose-700/30 hover:bg-rose-700/50 text-rose-300 border border-rose-700 font-semibold disabled:opacity-50"
                >
                  Reject Patch
                </button>
                <button
                  onClick={handleApprove}
                  disabled={isApproving || isRejecting}
                  className="px-4 py-1.5 rounded text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold disabled:opacity-50"
                >
                  {isApproving ? 'Approving...' : 'Approve Patch'}
                </button>
              </div>
            </div>
          )}

          {activeApproval.status === 'APPROVED' && (
            <div className="p-3 rounded bg-emerald-950/20 border border-emerald-800/40 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-emerald-300">
                  Patch Approved for Application
                </div>
                <div className="text-[11px] text-slate-400">
                  Verified by {activeApproval.reviewedBy ?? 'Reviewer'}. Click apply to modify
                  workspace files.
                </div>
              </div>
              <button
                onClick={() => setShowApplyModal(true)}
                disabled={isApplying}
                className="px-4 py-1.5 rounded text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow disabled:opacity-50"
              >
                Apply to Workspace
              </button>
            </div>
          )}

          {/* Audit Trail Toggle */}
          <div>
            <button
              onClick={() => setShowAuditTrail(!showAuditTrail)}
              className="text-xs text-slate-400 hover:text-slate-200 font-medium flex items-center space-x-1"
            >
              <span>{showAuditTrail ? '▼ Hide Audit History' : '► Show Audit History'}</span>
            </button>
            {showAuditTrail && (
              <div className="mt-2 space-y-1.5 p-3 bg-slate-950 border border-slate-800 rounded">
                {activeApproval.auditTrail.map((entry: PatchApprovalAuditEntryDto) => (
                  <div
                    key={entry.id}
                    className="text-[11px] flex items-center justify-between text-slate-400"
                  >
                    <span className="font-mono text-cyan-400">{entry.eventType}</span>
                    <span className="text-slate-300">{entry.actor}</span>
                    <span className="text-slate-500 text-[10px]">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Patch Rollback & Recovery (Phase 105) */}
      {activeApproval &&
        (activeApproval.status === 'APPLIED' || activeApproval.status === 'ROLLED_BACK') && (
          <PatchRollbackCard
            projectId={projectId}
            failureCaseId={failureCaseId}
            approval={activeApproval}
            onRollbackComplete={() => {
              void loadApprovals();
            }}
          />
        )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-5 max-w-md w-full shadow-2xl space-y-4">
            <h4 className="text-sm font-semibold text-slate-100">Reject Patch Proposal</h4>
            <p className="text-xs text-slate-400">
              Rejecting this patch permanently closes it. The repository and source files will
              remain 100% untouched.
            </p>

            <div>
              <label className="block text-xs text-slate-300 mb-1">Rejection Reason</label>
              <select
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value as PatchRejectionReasonDto)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
              >
                <option value="INCORRECT_FIX">Incorrect Fix</option>
                <option value="TOO_RISKY">Too Risky</option>
                <option value="WRONG_ROOT_CAUSE">Wrong Root Cause</option>
                <option value="UNNECESSARY_CHANGE">Unnecessary Change</option>
                <option value="NEEDS_MANUAL_REPAIR">Needs Manual Repair</option>
                <option value="ARCHITECTURE_CONCERN">Architecture Concern</option>
                <option value="OTHER">Other Reason</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">Details / Explanation</label>
              <textarea
                value={rejectionDetails}
                onChange={e => setRejectionDetails(e.target.value)}
                placeholder="Explain why the patch was rejected..."
                rows={3}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowRejectModal(false)}
                disabled={isRejecting}
                className="px-3 py-1.5 rounded text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={isRejecting}
                className="px-3 py-1.5 rounded text-xs bg-rose-600 hover:bg-rose-500 text-white font-semibold disabled:opacity-50"
              >
                {isRejecting ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Apply Confirmation Modal */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-5 max-w-md w-full shadow-2xl space-y-4">
            <h4 className="text-sm font-semibold text-slate-100">
              Apply Approved Patch to Workspace
            </h4>
            <div className="text-xs text-slate-300 space-y-2">
              <p>You are about to apply the approved patch to your local workspace files.</p>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded space-y-1 font-mono text-[11px] text-slate-400">
                <div>Hash: {activeApproval?.reviewedPatchHash.substring(0, 12)}...</div>
                <div>Base Rev: {activeApproval?.baseRevision.substring(0, 12)}</div>
              </div>
              <div className="p-2.5 bg-amber-950/30 border border-amber-800/40 rounded text-[11px] text-amber-300">
                <strong>Important:</strong> Changes will be written directly to your workspace
                files. No git commit, push, or PR will be performed. You can inspect git status and
                diff afterwards.
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowApplyModal(false)}
                disabled={isApplying}
                className="px-3 py-1.5 rounded text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={isApplying}
                className="px-4 py-1.5 rounded text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold disabled:opacity-50"
              >
                {isApplying ? 'Applying Atomically...' : 'Confirm & Apply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
