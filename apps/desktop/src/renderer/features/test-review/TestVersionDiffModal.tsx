/**
 * @file apps/desktop/src/renderer/features/test-review/TestVersionDiffModal.tsx
 * Side-by-side version comparison modal (Phase 56).
 */

import React, { useEffect, useState } from 'react';
import type { TestVersionDiffDto } from '@ai-quality/contracts';

interface TestVersionDiffModalProps {
  readonly isOpen: boolean;
  readonly projectId: string;
  readonly testCaseId: string;
  readonly testCaseKey: string;
  readonly fromVersionNumber: number;
  readonly toVersionNumber: number;
  readonly onClose: () => void;
}

export const TestVersionDiffModal: React.FC<TestVersionDiffModalProps> = ({
  isOpen,
  projectId,
  testCaseId,
  testCaseKey,
  fromVersionNumber,
  toVersionNumber,
  onClose,
}) => {
  const [diff, setDiff] = useState<TestVersionDiffDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !window.desktop?.testReview) return;
    const fetchDiff = async () => {
      try {
        setLoading(true);
        setError(null);
        if (!window.desktop?.testReview) return;
        const res = await window.desktop.testReview.compareVersions({
          projectId,
          testCaseId,
          fromVersionNumber,
          toVersionNumber,
        });
        if (res.ok) {
          setDiff(res.data);
        } else {
          setError(res.error.message);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };
    fetchDiff();
  }, [isOpen, projectId, testCaseId, fromVersionNumber, toVersionNumber]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
              ⇄
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-slate-100">Version Diff Comparison</h3>
                <span className="px-2 py-0.5 rounded font-mono text-xs font-bold bg-slate-800 text-slate-300">
                  v{fromVersionNumber} ➔ v{toVersionNumber}
                </span>
              </div>
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

        {/* Diff Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {loading && (
            <div className="text-center py-10 text-xs text-slate-400">
              Calculating deterministic structural diff...
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300">
              {error}
            </div>
          )}

          {!loading && !error && diff && (
            <>
              {/* Field Changes */}
              <div>
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Metadata & Spec Changes ({diff.fieldChanges.length})
                </h4>
                {diff.fieldChanges.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No scalar fields modified.</p>
                ) : (
                  <div className="border border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-800 text-xs">
                    {diff.fieldChanges.map((change, idx) => (
                      <div key={idx} className="p-3 bg-slate-950/50 space-y-1">
                        <div className="font-semibold text-slate-300 font-mono">{change.field}</div>
                        <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                          <div className="p-2 bg-rose-950/30 border border-rose-900/50 rounded text-rose-300">
                            <span className="text-rose-500 font-bold block mb-0.5">
                              - v{fromVersionNumber}
                            </span>
                            {String(change.oldValue ?? '(empty)')}
                          </div>
                          <div className="p-2 bg-emerald-950/30 border border-emerald-900/50 rounded text-emerald-300">
                            <span className="text-emerald-500 font-bold block mb-0.5">
                              + v{toVersionNumber}
                            </span>
                            {String(change.newValue ?? '(empty)')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Step Changes */}
              <div>
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Test Step Changes (
                  {diff.stepChanges.modified.length +
                    diff.stepChanges.added.length +
                    diff.stepChanges.removed.length}
                  )
                </h4>
                <div className="space-y-2 text-xs">
                  {diff.stepChanges.modified.map((mod, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-amber-950/20 border border-amber-900/40 rounded-lg space-y-1"
                    >
                      <span className="font-bold text-amber-400 font-mono">
                        Step {mod.stepNumber} Modified
                      </span>
                      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono mt-1">
                        <div className="p-2 bg-rose-950/40 border border-rose-900/50 rounded text-rose-300">
                          <span className="text-rose-500 font-bold block">Action:</span>
                          {mod.old.action}
                          {mod.old.expectedResult && (
                            <>
                              <span className="text-rose-500 font-bold block mt-1">Expected:</span>
                              {mod.old.expectedResult}
                            </>
                          )}
                        </div>
                        <div className="p-2 bg-emerald-950/40 border border-emerald-900/50 rounded text-emerald-300">
                          <span className="text-emerald-500 font-bold block">Action:</span>
                          {mod.current.action}
                          {mod.current.expectedResult && (
                            <>
                              <span className="text-emerald-500 font-bold block mt-1">
                                Expected:
                              </span>
                              {mod.current.expectedResult}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {diff.stepChanges.added.map((add, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-emerald-950/20 border border-emerald-900/40 rounded-lg text-emerald-300"
                    >
                      <span className="font-bold text-emerald-400 font-mono">
                        + Step {add.stepNumber} Added
                      </span>
                      <p className="mt-1 text-[11px]">{add.action}</p>
                    </div>
                  ))}

                  {diff.stepChanges.removed.map((rem, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-rose-950/20 border border-rose-900/40 rounded-lg text-rose-300"
                    >
                      <span className="font-bold text-rose-400 font-mono">
                        - Step {rem.stepNumber} Removed
                      </span>
                      <p className="mt-1 text-[11px] line-through">{rem.action}</p>
                    </div>
                  ))}

                  {diff.stepChanges.modified.length === 0 &&
                    diff.stepChanges.added.length === 0 &&
                    diff.stepChanges.removed.length === 0 && (
                      <p className="text-xs text-slate-500 italic">No test steps modified.</p>
                    )}
                </div>
              </div>

              {/* Precondition Changes */}
              <div>
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Precondition Changes (
                  {diff.preconditionChanges.modified.length +
                    diff.preconditionChanges.added.length +
                    diff.preconditionChanges.removed.length}
                  )
                </h4>
                <div className="space-y-2 text-xs">
                  {diff.preconditionChanges.modified.map((mod, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-amber-950/20 border border-amber-900/40 rounded-lg space-y-1"
                    >
                      <span className="font-bold text-amber-400 font-mono">
                        Precondition #{mod.sequenceOrder} Modified
                      </span>
                      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono mt-1">
                        <div className="p-2 bg-rose-950/40 border border-rose-900/50 rounded text-rose-300">
                          {mod.old.description}
                        </div>
                        <div className="p-2 bg-emerald-950/40 border border-emerald-900/50 rounded text-emerald-300">
                          {mod.current.description}
                        </div>
                      </div>
                    </div>
                  ))}

                  {diff.preconditionChanges.added.map((add, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-emerald-950/20 border border-emerald-900/40 rounded-lg text-emerald-300"
                    >
                      <span className="font-bold text-emerald-400 font-mono">
                        + Precondition #{add.sequenceOrder} Added
                      </span>
                      <p className="mt-1 text-[11px]">{add.description}</p>
                    </div>
                  ))}

                  {diff.preconditionChanges.removed.map((rem, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-rose-950/20 border border-rose-900/40 rounded-lg text-rose-300"
                    >
                      <span className="font-bold text-rose-400 font-mono">
                        - Precondition #{rem.sequenceOrder} Removed
                      </span>
                      <p className="mt-1 text-[11px] line-through">{rem.description}</p>
                    </div>
                  ))}

                  {diff.preconditionChanges.modified.length === 0 &&
                    diff.preconditionChanges.added.length === 0 &&
                    diff.preconditionChanges.removed.length === 0 && (
                      <p className="text-xs text-slate-500 italic">No preconditions modified.</p>
                    )}
                </div>
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
