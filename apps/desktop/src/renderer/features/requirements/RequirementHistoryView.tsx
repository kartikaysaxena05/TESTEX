/**
 * @file apps/desktop/src/renderer/features/requirements/RequirementHistoryView.tsx
 * Version history, visual text/token diffs, structured semantic comparisons, and version restore UI.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  RequirementHistoryDto,
  RequirementVersionDto,
  RequirementDiffDto,
  RequirementDto,
} from '@ai-quality/contracts';
import { Button, Badge } from '../../ui/index.js';

interface RequirementHistoryViewProps {
  readonly projectId: string;
  readonly requirementId: string;
  readonly onRequirementRestored?: (req: RequirementDto) => void;
}

export function RequirementHistoryView({
  projectId,
  requirementId,
  onRequirementRestored,
}: RequirementHistoryViewProps): React.JSX.Element {
  const [history, setHistory] = useState<RequirementHistoryDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Version comparison state
  const [sourceVersion, setSourceVersion] = useState<number | null>(null);
  const [targetVersion, setTargetVersion] = useState<number | null>(null);
  const [diff, setDiff] = useState<RequirementDiffDto | null>(null);
  const [comparing, setComparing] = useState(false);

  // Restore version state
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
  const [restoreReason, setRestoreReason] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!window.desktop?.requirements) return;
    setLoading(true);
    setError(null);
    try {
      const res = await window.desktop.requirements.getHistory({
        projectId,
        requirementId,
      });
      if (res.ok) {
        setHistory(res.data);
        if (res.data.versions.length >= 2) {
          setSourceVersion(res.data.versions[1]?.versionNumber ?? 1);
          setTargetVersion(res.data.versions[0]?.versionNumber ?? 2);
        } else if (res.data.versions.length === 1) {
          setSourceVersion(res.data.versions[0]?.versionNumber ?? 1);
          setTargetVersion(res.data.versions[0]?.versionNumber ?? 1);
        }
      } else {
        setError(res.error.message ?? 'Failed to load version history.');
      }
    } catch {
      setError('An unexpected error occurred while loading history.');
    } finally {
      setLoading(false);
    }
  }, [projectId, requirementId]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const handleCompare = useCallback(async () => {
    if (!window.desktop?.requirements) return;
    if (sourceVersion === null || targetVersion === null) return;
    setComparing(true);
    setError(null);
    try {
      const res = await window.desktop.requirements.compareVersions({
        projectId,
        requirementId,
        sourceVersionNumber: sourceVersion,
        targetVersionNumber: targetVersion,
      });
      if (res.ok) {
        setDiff(res.data);
      } else {
        setError(res.error.message ?? 'Failed to compare versions.');
      }
    } catch {
      setError('Failed to compare versions.');
    } finally {
      setComparing(false);
    }
  }, [projectId, requirementId, sourceVersion, targetVersion]);

  useEffect(() => {
    if (sourceVersion !== null && targetVersion !== null && sourceVersion !== targetVersion) {
      void handleCompare();
    } else {
      setDiff(null);
    }
  }, [sourceVersion, targetVersion, handleCompare]);

  const handleRestore = async (versionNumber: number) => {
    if (!window.desktop?.requirements) return;
    setIsRestoring(true);
    setError(null);
    try {
      const res = await window.desktop.requirements.restoreVersion({
        projectId,
        requirementId,
        versionNumberToRestore: versionNumber,
        restoreReason: restoreReason.trim() || undefined,
      });
      if (res.ok) {
        setRestoringVersion(null);
        setRestoreReason('');
        await fetchHistory();
        if (onRequirementRestored) {
          onRequirementRestored(res.data.requirement);
        }
      } else {
        setError(res.error.message ?? 'Failed to restore version.');
      }
    } catch {
      setError('An unexpected error occurred while restoring version.');
    } finally {
      setIsRestoring(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-xs text-neutral-400">Loading version history...</div>
    );
  }

  return (
    <div className="space-y-4 text-xs text-neutral-300">
      {error && (
        <div className="p-3 bg-red-950/50 border border-red-800/80 rounded text-red-200">
          {error}
        </div>
      )}

      {/* Version timeline list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between font-medium text-neutral-400">
          <span>Version History ({history?.totalVersions ?? 0} versions)</span>
          <div className="flex items-center gap-2 text-[11px]">
            <span>Diff:</span>
            <select
              value={sourceVersion ?? ''}
              onChange={e => setSourceVersion(Number(e.target.value))}
              className="bg-neutral-800 border border-neutral-700 text-neutral-200 rounded px-2 py-0.5"
            >
              {history?.versions.map(v => (
                <option key={`src-${v.versionNumber}`} value={v.versionNumber}>
                  v{v.versionNumber} ({v.changeKind})
                </option>
              ))}
            </select>
            <span>vs</span>
            <select
              value={targetVersion ?? ''}
              onChange={e => setTargetVersion(Number(e.target.value))}
              className="bg-neutral-800 border border-neutral-700 text-neutral-200 rounded px-2 py-0.5"
            >
              {history?.versions.map(v => (
                <option key={`tgt-${v.versionNumber}`} value={v.versionNumber}>
                  v{v.versionNumber} ({v.changeKind})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          {history?.versions.map((ver: RequirementVersionDto) => {
            const isCurrent = ver.versionNumber === history.currentVersionNumber;
            return (
              <div
                key={ver.id}
                className={`p-2.5 rounded-lg border flex items-center justify-between gap-3 ${
                  isCurrent
                    ? 'bg-sky-950/30 border-sky-800/60'
                    : 'bg-neutral-950/60 border-neutral-800'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold font-mono text-neutral-200">
                      v{ver.versionNumber}
                    </span>
                    <Badge variant={ver.changeKind === 'CREATED' ? 'success' : 'neutral'}>
                      {ver.changeKind}
                    </Badge>
                    {isCurrent && <Badge variant="info">Current</Badge>}
                    <span className="text-neutral-400 text-[11px]">
                      {new Date(ver.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {ver.changeReason && (
                    <div className="text-neutral-400 italic">&ldquo;{ver.changeReason}&rdquo;</div>
                  )}
                  {ver.changedFields.length > 0 && (
                    <div className="text-neutral-400 text-[10px]">
                      Changed: {ver.changedFields.join(', ')}
                    </div>
                  )}
                </div>

                {!isCurrent && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setRestoringVersion(ver.versionNumber)}
                  >
                    Restore
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Restore Confirmation Modal */}
      {restoringVersion !== null && (
        <div className="p-3.5 bg-neutral-900 border border-amber-800/80 rounded-lg space-y-2.5">
          <div className="font-semibold text-amber-300">
            Restore Requirement to Version {restoringVersion}?
          </div>
          <p className="text-neutral-400 text-[11px]">
            Restoring creates a brand-new immutable version (v
            {(history?.currentVersionNumber ?? 1) + 1}) with the historical content. Past history is
            never altered.
          </p>
          <input
            type="text"
            placeholder="Reason for restoring (optional)"
            value={restoreReason}
            onChange={e => setRestoreReason(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-700 text-neutral-200 rounded px-2.5 py-1 text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setRestoringVersion(null);
                setRestoreReason('');
              }}
              disabled={isRestoring}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => handleRestore(restoringVersion)}
              disabled={isRestoring}
            >
              {isRestoring ? 'Restoring...' : 'Confirm Restore'}
            </Button>
          </div>
        </div>
      )}

      {/* Diff comparison view */}
      {comparing && <div className="p-3 text-center text-neutral-400">Computing diff...</div>}

      {diff && (
        <div className="space-y-3 border-t border-neutral-800 pt-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-neutral-200">
              Comparison: v{diff.sourceVersionNumber} &rarr; v{diff.targetVersionNumber}
            </span>
            {diff.isNoOp ? (
              <Badge variant="neutral">No Changes</Badge>
            ) : (
              <Badge variant="warning">{diff.changeKinds.join(', ')}</Badge>
            )}
          </div>

          {/* Structured semantic diff highlights */}
          {diff.structuredDiff.some(d => d.isChanged) && (
            <div className="space-y-1 bg-neutral-950/80 p-2.5 rounded border border-neutral-800">
              <div className="font-medium text-neutral-400 text-[11px] mb-1">
                Structured Field Changes:
              </div>
              {diff.structuredDiff
                .filter(d => d.isChanged)
                .map(d => (
                  <div key={d.field} className="flex items-center gap-2 text-[11px]">
                    <span className="font-mono text-neutral-400">{d.field}:</span>
                    <span className="line-through text-red-400">
                      {String(d.oldValue ?? 'none')}
                    </span>
                    <span>&rarr;</span>
                    <span className="text-emerald-400 font-medium">
                      {String(d.newValue ?? 'none')}
                    </span>
                  </div>
                ))}
            </div>
          )}

          {/* Token-level text diff */}
          <div>
            <div className="font-medium text-neutral-400 text-[11px] mb-1.5">
              Original Text Token Diff:
            </div>
            <div className="p-3 bg-neutral-950 border border-neutral-800 rounded font-mono leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
              {diff.textDiff.map((tok, idx) => {
                if (tok.type === 'ADDED') {
                  return (
                    <span
                      key={idx}
                      className="bg-emerald-950 text-emerald-300 border-b border-emerald-500 px-0.5 rounded"
                    >
                      {tok.value}
                    </span>
                  );
                }
                if (tok.type === 'REMOVED') {
                  return (
                    <span
                      key={idx}
                      className="bg-red-950 text-red-300 line-through border-b border-red-500 px-0.5 rounded opacity-80"
                    >
                      {tok.value}
                    </span>
                  );
                }
                return (
                  <span key={idx} className="text-neutral-300">
                    {tok.value}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
