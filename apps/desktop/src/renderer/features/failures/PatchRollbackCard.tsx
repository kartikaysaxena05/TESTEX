/**
 * @file apps/desktop/src/renderer/features/failures/PatchRollbackCard.tsx
 * Interactive inspection and management card for V7 Phase 105 Patch Rollback & Recovery.
 * Provides dry-run planning, conflict inspection, atomic rollback execution,
 * hash comparison (S0, S1, S2), post-rollback test verification, and recovery controls.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  DefectPatchApprovalDto,
  DefectPatchRollbackDto,
  PatchRollbackPlanResultDto,
  RollbackConflictItemDto,
} from '@ai-quality/contracts';

interface PatchRollbackCardProps {
  projectId: string;
  failureCaseId: string;
  approval: DefectPatchApprovalDto;
  onRollbackComplete?: (rollback: DefectPatchRollbackDto) => void;
}

export const PatchRollbackCard: React.FC<PatchRollbackCardProps> = ({
  projectId,
  failureCaseId,
  approval,
  onRollbackComplete,
}) => {
  const [rollback, setRollback] = useState<DefectPatchRollbackDto | null>(null);
  const [plan, setPlan] = useState<PatchRollbackPlanResultDto | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [rollbackReason, setRollbackReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccessMessage] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [showAudit, setShowAudit] = useState(false);

  // Load existing rollback record if present
  const loadRollback = useCallback(async () => {
    const bridge = window.desktop?.patchRollback;
    if (!bridge) return;

    setIsLoading(true);
    try {
      const res = await bridge.get({
        projectId,
        approvalId: approval.id,
      });
      if (res.ok && res.data) {
        setRollback(res.data);
      }
    } catch {
      // Ignore load error
    } finally {
      setIsLoading(false);
    }
  }, [projectId, approval.id]);

  useEffect(() => {
    void loadRollback();
  }, [loadRollback]);

  // Plan / Dry-run
  const handlePlan = async () => {
    const bridge = window.desktop?.patchRollback;
    if (!bridge) return;

    setIsPlanning(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await bridge.plan({
        projectId,
        approvalId: approval.id,
      });

      if (res.ok) {
        setPlan(res.data);
        if (res.data.canRollback) {
          setSuccessMessage('Dry-run verification passed: 0 conflicts. Ready for rollback.');
        } else {
          setError(
            `Rollback blocked: ${res.data.conflicts.length} conflict(s) detected. User edits overlap patch content.`,
          );
        }
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsPlanning(false);
    }
  };

  // Execute Rollback
  const handleExecute = async () => {
    const bridge = window.desktop?.patchRollback;
    if (!bridge) return;

    setIsExecuting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await bridge.execute({
        projectId,
        approvalId: approval.id,
        rollbackReason: rollbackReason.trim() || undefined,
        rollbackRequestedBy: 'HUMAN_OPERATOR',
        dryRun: false,
      });

      if (res.ok) {
        setRollback(res.data);
        setShowConfirmModal(false);
        setSuccessMessage(
          'Rollback completed successfully. Patch-owned lines restored to S0 baseline.',
        );
        if (onRollbackComplete) {
          onRollbackComplete(res.data);
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

  // Resume Recovery
  const handleResume = async () => {
    if (!rollback) return;
    const bridge = window.desktop?.patchRollback;
    if (!bridge) return;

    setIsResuming(true);
    setError(null);

    try {
      const res = await bridge.resumeRecovery({
        projectId,
        rollbackId: rollback.id,
      });

      if (res.ok) {
        setRollback(res.data);
        setSuccessMessage('Recovery completed: Files restored from recovery point snapshot.');
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsResuming(false);
    }
  };

  const getRollbackBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            Rollback Completed (S2 == S0)
          </span>
        );
      case 'CONFLICT_BLOCKED':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
            Conflict Blocked
          </span>
        );
      case 'RECOVERY_REQUIRED':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
            Recovery Required
          </span>
        );
      case 'APPLYING':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 animate-pulse">
            Applying Rollback...
          </span>
        );
      case 'FAILED':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-500/20 text-red-300 border border-red-500/30">
            Rollback Failed (Restored)
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

  return (
    <div className="mt-4 p-4 rounded-lg border border-slate-800 bg-slate-900/60 shadow-lg space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center space-x-2">
            <h4 className="text-sm font-semibold text-slate-200">
              Patch Rollback & Recovery Engine
            </h4>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
              Phase 105
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Non-destructive reverse patching. Restores patch lines to baseline while preserving
            independent user edits.
          </p>
        </div>

        <div>
          {rollback ? (
            getRollbackBadge(rollback.status)
          ) : approval.status === 'ROLLED_BACK' ? (
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-orange-500/20 text-orange-300 border border-orange-500/30">
              Rolled Back
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-400">
              Rollback Ready
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded text-xs text-rose-300 space-y-1">
          <div className="font-semibold flex items-center space-x-1">
            <span>⚠</span>
            <span>{error}</span>
          </div>
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-800/50 rounded text-xs text-emerald-300 flex items-center space-x-2">
          <span>✓</span>
          <span>{success}</span>
        </div>
      )}

      {/* Conflicts Banner */}
      {plan && !plan.canRollback && plan.conflicts.length > 0 && (
        <div className="p-3 bg-amber-950/40 border border-amber-800/50 rounded text-xs text-amber-200 space-y-2">
          <div className="font-semibold text-amber-300 flex items-center space-x-1.5">
            <span>⛔</span>
            <span>Rollback Blocked to Prevent Corruption</span>
          </div>
          <p className="text-[11px] text-amber-300/80">
            Subsequent modifications overlap with the patch lines. Rollback will not overwrite user
            work.
          </p>
          <div className="space-y-1.5 pt-1">
            {plan.conflicts.map((c, i) => (
              <div
                key={i}
                className="p-2 bg-slate-950/60 rounded border border-amber-900/40 text-[11px]"
              >
                <div className="font-mono font-semibold text-amber-400">
                  [{c.type}] {c.filePath}
                  {c.startLine ? ` (lines ${c.startLine}-${c.endLine ?? c.startLine})` : ''}
                </div>
                <div className="text-slate-300 mt-0.5">{c.details}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Existing Rollback Details */}
      {rollback && (
        <div className="space-y-3 bg-slate-950/40 p-3 rounded border border-slate-800/60">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-slate-500">Rollback Status:</span>{' '}
              <span className="text-slate-200 font-semibold">{rollback.status}</span>
            </div>
            <div>
              <span className="text-slate-500">Requested By:</span>{' '}
              <span className="text-slate-200">{rollback.rollbackRequestedBy}</span>
            </div>
            <div>
              <span className="text-slate-500">Restored Files:</span>{' '}
              <span className="text-slate-200 font-mono">
                {rollback.restoredFiles.length} file(s)
              </span>
            </div>
            <div>
              <span className="text-slate-500">Preserved Unrelated:</span>{' '}
              <span className="text-emerald-400 font-mono">
                {rollback.preservedUnrelatedFiles.length} file(s)
              </span>
            </div>
            {rollback.originalFailureReoccurred !== undefined && (
              <div className="col-span-2 flex items-center space-x-2 pt-1">
                <span className="text-slate-500">Post-Rollback Reverification:</span>
                {rollback.originalFailureReoccurred ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Defect Re-occurrence Verified (S0 Behavior Restored)
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Unexpected Test State
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Cryptographic Hashes Comparison */}
          {rollback.postRollbackHashes && Object.keys(rollback.postRollbackHashes).length > 0 && (
            <div className="pt-2 border-t border-slate-800 text-xs">
              <div className="text-slate-400 font-semibold mb-1">
                Cryptographic Invariant (S2 == S0)
              </div>
              <div className="space-y-1 font-mono text-[11px]">
                {Object.entries(rollback.postRollbackHashes).map(([file, s2Hash]) => {
                  const s0Hash = rollback.targetPrePatchHashes[file];
                  const s1Hash = rollback.preRollbackHashes[file];
                  const matchesBaseline = s0Hash === s2Hash;
                  return (
                    <div
                      key={file}
                      className="p-2 bg-slate-900/60 rounded border border-slate-800 space-y-0.5"
                    >
                      <div className="text-slate-300 font-semibold">{file}</div>
                      <div className="text-slate-400">
                        S0 (Baseline): <span className="text-slate-300">{s0Hash?.slice(0, 12)}...</span>
                      </div>
                      <div className="text-slate-400">
                        S1 (Patched): <span className="text-purple-300">{s1Hash?.slice(0, 12)}...</span>
                      </div>
                      <div className="text-slate-400 flex items-center space-x-2">
                        <span>
                          S2 (Rolled Back):{' '}
                          <span className="text-emerald-300">{s2Hash?.slice(0, 12)}...</span>
                        </span>
                        {matchesBaseline && (
                          <span className="text-[10px] text-emerald-400 font-sans font-semibold">
                            (Exact Match S2 ≡ S0)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Reverse Diff Toggle */}
          {rollback.reverseDiff && (
            <div className="pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowDiff(!showDiff)}
                className="text-xs text-cyan-400 hover:text-cyan-300 underline"
              >
                {showDiff ? 'Hide Reverse Diff' : 'View Reverse Diff'}
              </button>
              {showDiff && (
                <pre className="mt-2 p-2 bg-slate-950 border border-slate-800 rounded font-mono text-[11px] text-slate-300 overflow-x-auto max-h-60">
                  {rollback.reverseDiff}
                </pre>
              )}
            </div>
          )}

          {/* Recovery Required Alert & Action */}
          {rollback.status === 'RECOVERY_REQUIRED' && (
            <div className="p-3 bg-rose-950/60 border border-rose-700 rounded space-y-2">
              <div className="text-xs font-semibold text-rose-200">
                Interrupted Rollback Detected
              </div>
              <p className="text-[11px] text-rose-300/80">
                An operation was interrupted mid-write. The content-addressed recovery point is
                intact.
              </p>
              <button
                onClick={handleResume}
                disabled={isResuming}
                className="px-3 py-1.5 rounded text-xs bg-rose-600 hover:bg-rose-500 text-white font-semibold disabled:opacity-50"
              >
                {isResuming ? 'Restoring Files...' : 'Resume Recovery from Snapshot'}
              </button>
            </div>
          )}

          {/* Audit Trail */}
          <div className="pt-2 border-t border-slate-800">
            <button
              onClick={() => setShowAudit(!showAudit)}
              className="text-xs text-slate-400 hover:text-slate-300 underline"
            >
              {showAudit
                ? 'Hide Rollback Audit Trail'
                : `View Rollback Audit Trail (${rollback.auditTrail.length} events)`}
            </button>
            {showAudit && (
              <div className="mt-2 space-y-1 font-mono text-[11px] bg-slate-950 p-2 rounded border border-slate-800 max-h-48 overflow-y-auto">
                {rollback.auditTrail.map((ev, i) => (
                  <div key={i} className="flex justify-between text-slate-400 py-0.5">
                    <span className="text-cyan-400 font-semibold">{ev.eventType}</span>
                    <span className="text-slate-300">{ev.actor}</span>
                    <span className="text-slate-500 text-[10px]">
                      {new Date(ev.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons (when patch is applied and not already rolled back) */}
      {!rollback && approval.status === 'APPLIED' && (
        <div className="flex items-center space-x-3 pt-2">
          <button
            onClick={handlePlan}
            disabled={isPlanning || isExecuting}
            className="px-3 py-1.5 rounded text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold disabled:opacity-50"
          >
            {isPlanning ? 'Analyzing Workspace...' : 'Dry-Run & Conflict Check'}
          </button>

          <button
            onClick={() => setShowConfirmModal(true)}
            disabled={isPlanning || isExecuting}
            className="px-3 py-1.5 rounded text-xs bg-rose-600 hover:bg-rose-500 text-white font-semibold shadow disabled:opacity-50"
          >
            Execute Rollback
          </button>
        </div>
      )}

      {/* Rollback Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-5 max-w-md w-full shadow-2xl space-y-4">
            <h4 className="text-sm font-semibold text-slate-100">
              Confirm Patch Rollback to Baseline
            </h4>
            <div className="text-xs text-slate-300 space-y-2">
              <p>
                This action will revert patch-owned modifications back to the S0 pre-patch
                baseline.
              </p>
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded space-y-1 font-mono text-[11px] text-slate-400">
                <div>Patch Hash: {approval.reviewedPatchHash.slice(0, 12)}...</div>
                <div>Files Affected: {approval.affectedFiles.join(', ') || 'N/A'}</div>
              </div>
              <div className="p-2.5 bg-cyan-950/30 border border-cyan-800/40 rounded text-[11px] text-cyan-300">
                <strong>Safety Guarantee:</strong> Independent user changes in other files or
                non-overlapping lines will be strictly preserved. A content-addressed recovery
                point is created before writing.
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">
                Rollback Reason (optional)
              </label>
              <textarea
                value={rollbackReason}
                onChange={e => setRollbackReason(e.target.value)}
                placeholder="Why is this patch being rolled back? (e.g. unexpected test failure, regression)"
                rows={2}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={isExecuting}
                className="px-3 py-1.5 rounded text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleExecute}
                disabled={isExecuting}
                className="px-3 py-1.5 rounded text-xs bg-rose-600 hover:bg-rose-500 text-white font-semibold disabled:opacity-50"
              >
                {isExecuting ? 'Rolling Back...' : 'Confirm & Revert'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
