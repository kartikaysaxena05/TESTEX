/**
 * @file apps/desktop/src/renderer/features/requirements/RequirementEvidenceView.tsx
 * UI component for matching, reviewing, managing, and securely previewing Repository Evidence linked to requirements.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  RequirementRepositoryEvidenceDto,
  RepositoryEvidenceStatus,
  EvidencePreviewDto,
} from '@ai-quality/contracts';

interface RequirementEvidenceViewProps {
  readonly projectId: string;
  readonly requirementId: string;
}

export const RequirementEvidenceView: React.FC<RequirementEvidenceViewProps> = ({
  projectId,
  requirementId,
}) => {
  const [evidenceList, setEvidenceList] = useState<readonly RequirementRepositoryEvidenceDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Preview state
  const [previewItem, setPreviewItem] = useState<RequirementRepositoryEvidenceDto | null>(null);
  const [previewData, setPreviewData] = useState<EvidencePreviewDto | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);

  // Review state
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewRationale, setReviewRationale] = useState<string>('');

  const fetchEvidence = useCallback(async () => {
    if (!window.desktop?.requirements) return;
    try {
      setLoading(true);
      setError(null);
      const res = await window.desktop.requirements.getRepositoryEvidence({
        projectId,
        requirementId,
      });

      if (res.ok) {
        setEvidenceList(res.data);
      } else {
        setError(res.error.message);
      }
    } catch {
      setError('Failed to load repository evidence.');
    } finally {
      setLoading(false);
    }
  }, [projectId, requirementId]);

  useEffect(() => {
    void fetchEvidence();
  }, [fetchEvidence]);

  const handleMatch = async () => {
    if (!window.desktop?.requirements) return;
    try {
      setActionLoading(true);
      setError(null);
      const res = await window.desktop.requirements.matchRepositoryEvidence({
        projectId,
        requirementId,
      });

      if (res.ok) {
        setEvidenceList(res.data.candidateEvidence);
      } else {
        setError(res.error.message);
      }
    } catch {
      setError('Failed to match repository evidence.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReview = async (evidenceId: string, status: RepositoryEvidenceStatus) => {
    if (!window.desktop?.requirements) return;
    try {
      setActionLoading(true);
      setError(null);
      const res = await window.desktop.requirements.reviewRepositoryEvidence({
        projectId,
        evidenceId,
        status,
        reviewRationale: reviewRationale.trim() || null,
      });

      if (res.ok) {
        setReviewingId(null);
        setReviewRationale('');
        await fetchEvidence();
      } else {
        setError(res.error.message);
      }
    } catch {
      setError('Failed to review repository evidence.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (evidenceId: string) => {
    if (!window.desktop?.requirements) return;
    if (!confirm('Are you sure you want to remove this evidence link?')) return;

    try {
      setActionLoading(true);
      setError(null);
      const res = await window.desktop.requirements.deleteRepositoryEvidence({
        projectId,
        evidenceId,
      });

      if (res.ok) {
        await fetchEvidence();
      } else {
        setError(res.error.message);
      }
    } catch {
      setError('Failed to delete repository evidence.');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePreview = async (ev: RequirementRepositoryEvidenceDto) => {
    if (!window.desktop?.requirements) return;
    try {
      setPreviewItem(ev);
      setPreviewLoading(true);
      const res = await window.desktop.requirements.previewRepositoryEvidence({
        projectId,
        evidenceId: ev.id,
      });

      if (res.ok) {
        setPreviewData(res.data);
      } else {
        setError(res.error.message);
        setPreviewItem(null);
      }
    } catch {
      setError('Failed to load secure file preview.');
      setPreviewItem(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-xs text-neutral-400">Loading repository evidence...</div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-950/50 border border-red-800 rounded-lg text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-neutral-400">
          {evidenceList.length} Evidence Candidate{evidenceList.length === 1 ? '' : 's'} Linked
        </div>
        <button
          type="button"
          onClick={handleMatch}
          disabled={actionLoading}
          className="px-2.5 py-1 text-xs font-medium bg-sky-900/80 hover:bg-sky-800 text-sky-200 rounded transition-colors disabled:opacity-50"
        >
          {actionLoading ? 'Matching Evidence...' : 'Match Repository Evidence'}
        </button>
      </div>

      {/* Evidence List */}
      {evidenceList.length === 0 ? (
        <div className="p-4 bg-neutral-950/60 border border-neutral-800/80 rounded-lg text-center text-xs text-neutral-500">
          No repository evidence candidates mapped yet. Click "Match Repository Evidence" to index
          source code evidence deterministically.
        </div>
      ) : (
        <div className="space-y-2.5">
          {evidenceList.map(ev => (
            <div
              key={ev.id}
              className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Score Badge */}
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded font-mono ${
                        ev.evidenceScore >= 7
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-sky-950 text-sky-300 border border-sky-800'
                      }`}
                    >
                      Score: {ev.evidenceScore}/10
                    </span>

                    {/* Evidence Type */}
                    <span className="font-mono text-xs font-semibold text-purple-300 bg-purple-950/60 border border-purple-800/40 px-2 py-0.5 rounded">
                      {ev.evidenceType}
                    </span>

                    {/* Symbol / File path */}
                    <span className="text-xs font-mono text-neutral-200 font-medium">
                      {ev.filePath}
                      {ev.symbolName ? ` → ${ev.symbolName}` : ''}
                      {ev.lineStart ? ` (L${ev.lineStart}-${ev.lineEnd ?? ev.lineStart})` : ''}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      ev.status === 'CONFIRMED'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : ev.status === 'REJECTED'
                          ? 'bg-red-950 text-red-400 border border-red-800'
                          : 'bg-neutral-800 text-neutral-300 border border-neutral-700'
                    }`}
                  >
                    {ev.status}
                  </span>
                  <span className="text-[10px] font-mono text-neutral-400 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800">
                    {ev.matchMethod}
                  </span>
                </div>
              </div>

              {/* Staleness and Missing warnings */}
              {ev.isStale && (
                <div className="text-[11px] text-amber-400/90 bg-amber-950/30 border border-amber-800/40 px-2 py-1 rounded">
                  ⚡ Stale: Requirement text or repository file hash changed since matching.
                </div>
              )}
              {ev.isMissingInSnapshot && (
                <div className="text-[11px] text-rose-400/90 bg-rose-950/30 border border-rose-800/40 px-2 py-1 rounded">
                  ⚠️ File no longer present in active repository index.
                </div>
              )}

              {/* Review Rationale */}
              {ev.reviewRationale && (
                <div className="text-xs text-neutral-300 italic">
                  Review Rationale: {ev.reviewRationale}
                </div>
              )}

              {/* Footer and Actions */}
              <div className="flex items-center justify-between pt-1 border-t border-neutral-800/60 text-[11px]">
                <div className="flex flex-wrap gap-1.5">
                  {ev.reasonCodes.map((code, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] font-mono text-neutral-400 bg-neutral-900 px-1.5 py-0.5 rounded"
                    >
                      {code}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePreview(ev)}
                    className="px-2 py-0.5 text-xs text-sky-400 hover:text-sky-300 underline"
                  >
                    Preview Source
                  </button>

                  {reviewingId === ev.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        placeholder="Rationale..."
                        value={reviewRationale}
                        onChange={e => setReviewRationale(e.target.value)}
                        className="px-2 py-0.5 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-200"
                      />
                      <button
                        type="button"
                        onClick={() => handleReview(ev.id, 'CONFIRMED')}
                        className="px-2 py-0.5 bg-emerald-800 text-emerald-100 rounded hover:bg-emerald-700"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReview(ev.id, 'REJECTED')}
                        className="px-2 py-0.5 bg-red-800 text-red-100 rounded hover:bg-red-700"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => setReviewingId(null)}
                        className="px-1.5 py-0.5 text-neutral-400"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <>
                      {ev.status === 'CANDIDATE' && (
                        <button
                          type="button"
                          onClick={() => setReviewingId(ev.id)}
                          className="px-2 py-0.5 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded"
                        >
                          Review
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(ev.id)}
                        className="px-1.5 py-0.5 text-xs text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Secure Source Preview Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-3xl bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden my-8">
            <div className="px-5 py-3.5 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-sky-400">
                  {previewItem.filePath}
                </span>
                {previewData && (
                  <span className="text-[11px] text-neutral-400">
                    (Lines {previewData.lineStart}–{previewData.lineEnd} of {previewData.totalLines}
                    )
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setPreviewItem(null);
                  setPreviewData(null);
                }}
                className="text-neutral-400 hover:text-neutral-200"
              >
                ✕
              </button>
            </div>

            <div className="p-4 max-h-[70vh] overflow-y-auto font-mono text-xs text-neutral-200 bg-neutral-950">
              {previewLoading ? (
                <div className="py-8 text-center text-neutral-500">Loading secure preview...</div>
              ) : previewData ? (
                <pre className="whitespace-pre overflow-x-auto leading-relaxed">
                  {previewData.content}
                </pre>
              ) : (
                <div className="py-8 text-center text-neutral-500">Preview not available.</div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-neutral-800 bg-neutral-950/60 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setPreviewItem(null);
                  setPreviewData(null);
                }}
                className="px-3 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
