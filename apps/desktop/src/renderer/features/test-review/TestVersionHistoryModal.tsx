/**
 * @file apps/desktop/src/renderer/features/test-review/TestVersionHistoryModal.tsx
 * Version history and audit trail timeline modal (Phase 56).
 */

import React, { useEffect, useState } from 'react';
import type { TestCaseReviewEventDto, TestCaseVersionDto } from '@ai-quality/contracts';

interface TestVersionHistoryModalProps {
  readonly isOpen: boolean;
  readonly projectId: string;
  readonly testCaseId: string;
  readonly testCaseKey: string;
  readonly onClose: () => void;
  readonly onSelectVersionForDiff?: (fromVersion: number, toVersion: number) => void;
}

export const TestVersionHistoryModal: React.FC<TestVersionHistoryModalProps> = ({
  isOpen,
  projectId,
  testCaseId,
  testCaseKey,
  onClose,
  onSelectVersionForDiff,
}) => {
  const [versions, setVersions] = useState<readonly TestCaseVersionDto[]>([]);
  const [events, setEvents] = useState<readonly TestCaseReviewEventDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fromVer, setFromVer] = useState<number>(1);
  const [toVer, setToVer] = useState<number>(1);

  useEffect(() => {
    if (!isOpen || !window.desktop?.testReview) return;
    const fetchHistory = async () => {
      try {
        setLoading(true);
        setError(null);
        if (!window.desktop?.testReview) return;
        const res = await window.desktop.testReview.getHistory({
          projectId,
          testCaseId,
        });
        if (res.ok) {
          setVersions(res.data.versions);
          setEvents(res.data.reviewEvents);
          if (res.data.versions.length >= 2) {
            setFromVer(res.data.versions[res.data.versions.length - 2]?.versionNumber ?? 1);
            setToVer(res.data.versions[res.data.versions.length - 1]?.versionNumber ?? 1);
          } else if (res.data.versions.length === 1) {
            setFromVer(res.data.versions[0]?.versionNumber ?? 1);
            setToVer(res.data.versions[0]?.versionNumber ?? 1);
          }
        } else {
          setError(res.error.message);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [isOpen, projectId, testCaseId]);

  if (!isOpen) return null;

  const handleCompareClick = () => {
    if (onSelectVersionForDiff && fromVer !== toVer) {
      onSelectVersionForDiff(fromVer, toVer);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
              ⏱
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Version History & Audit Trail
              </h3>
              <p className="text-xs text-slate-400 font-mono">{testCaseKey}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Diff Selector Bar */}
        {versions.length >= 2 && (
          <div className="px-5 py-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">Compare:</span>
              <select
                value={fromVer}
                onChange={e => setFromVer(Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono focus:outline-none"
              >
                {versions.map(v => (
                  <option key={v.versionNumber} value={v.versionNumber}>
                    v{v.versionNumber} ({v.sourceType})
                  </option>
                ))}
              </select>
              <span className="text-slate-500 font-bold">→</span>
              <select
                value={toVer}
                onChange={e => setToVer(Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono focus:outline-none"
              >
                {versions.map(v => (
                  <option key={v.versionNumber} value={v.versionNumber}>
                    v{v.versionNumber} ({v.sourceType})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              disabled={fromVer === toVer}
              onClick={handleCompareClick}
              className={`px-3 py-1 rounded font-semibold transition ${
                fromVer === toVer
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm'
              }`}
            >
              View Diff (v{fromVer} ↔ v{toVer})
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {loading && (
            <div className="text-center py-10 text-xs text-slate-400">
              Loading version history and audit trail...
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300">
              {error}
            </div>
          )}

          {!loading && !error && (
            <>
              {/* Version Snapshots */}
              <div>
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
                  Immutable Versions ({versions.length})
                </h4>
                <div className="space-y-3">
                  {[...versions].reverse().map(v => (
                    <div
                      key={v.versionNumber}
                      className="p-4 bg-slate-950/60 border border-slate-800 rounded-lg space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-slate-800 text-slate-200">
                            v{v.versionNumber}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              v.sourceType === 'HUMAN_EDIT'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : v.sourceType === 'AI_REGENERATION'
                                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                  : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            }`}
                          >
                            {v.sourceType}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              v.reviewStatus === 'APPROVED'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : v.reviewStatus === 'REJECTED'
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {v.reviewStatus}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500">
                          {new Date(v.createdAt).toLocaleString()}
                        </span>
                      </div>

                      <div className="text-xs font-medium text-slate-200">{v.title}</div>

                      {v.changeReason && (
                        <p className="text-xs text-slate-400 bg-slate-900/60 p-2 rounded border border-slate-800/80">
                          <span className="text-slate-500 font-semibold">Change Reason:</span>{' '}
                          {v.changeReason}
                        </p>
                      )}

                      <div className="flex items-center gap-4 text-[11px] text-slate-500 pt-1">
                        <span>Steps: {v.steps.length}</span>
                        <span>Preconditions: {v.preconditions.length}</span>
                        <span>Test Data: {v.testData.length}</span>
                        {v.createdByActorId && <span>Actor: {v.createdByActorId}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Review Audit Events */}
              <div>
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
                  Review & Governance Audit Trail ({events.length})
                </h4>
                {events.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No review events logged yet.</p>
                ) : (
                  <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                    {[...events].reverse().map(e => (
                      <div key={e.id} className="relative">
                        <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-slate-700 border-2 border-slate-900" />
                        <div className="p-3 bg-slate-950/40 border border-slate-800/80 rounded-lg text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-1.5 py-0.2 rounded font-bold text-[10px] ${
                                  e.action === 'APPROVED'
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : e.action === 'REJECTED'
                                      ? 'bg-rose-500/20 text-rose-400'
                                      : e.action === 'EDITED'
                                        ? 'bg-amber-500/20 text-amber-400'
                                        : 'bg-indigo-500/20 text-indigo-400'
                                }`}
                              >
                                {e.action}
                              </span>
                              <span className="font-mono text-slate-400">v{e.versionNumber}</span>
                              <span className="text-slate-500">by {e.actorId}</span>
                            </div>
                            <span className="text-[10px] text-slate-500">
                              {new Date(e.createdAt).toLocaleString()}
                            </span>
                          </div>

                          {e.rejectionReason && (
                            <p className="text-rose-400 font-semibold text-[11px]">
                              Reason: {e.rejectionReason}
                            </p>
                          )}

                          {e.comment && <p className="text-slate-300 italic">"{e.comment}"</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
