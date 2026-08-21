/**
 * @file apps/desktop/src/renderer/features/requirements/RequirementImpactView.tsx
 * Change impact candidate visualization and human review interface.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  RequirementImpactsResultDto,
  RequirementImpactCandidateDto,
  RequirementImpactStatus,
} from '@ai-quality/contracts';
import { Button, Badge, type BadgeVariant } from '../../ui/index.js';

interface RequirementImpactViewProps {
  readonly projectId: string;
  readonly requirementId: string;
}

export function RequirementImpactView({
  projectId,
  requirementId,
}: RequirementImpactViewProps): React.JSX.Element {
  const [impactData, setImpactData] = useState<RequirementImpactsResultDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Review modal state
  const [activeReviewCandidate, setActiveReviewCandidate] =
    useState<RequirementImpactCandidateDto | null>(null);
  const [reviewStatus, setReviewStatus] = useState<RequirementImpactStatus>('REVIEWED');
  const [reviewRationale, setReviewRationale] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const fetchImpact = useCallback(async () => {
    if (!window.desktop?.requirements) return;
    setLoading(true);
    setError(null);
    try {
      const res = await window.desktop.requirements.getChangeImpact({
        projectId,
        requirementId,
      });
      if (res.ok) {
        setImpactData(res.data);
      } else {
        setError(res.error.message ?? 'Failed to load change impact candidates.');
      }
    } catch {
      setError('An unexpected error occurred while loading change impact.');
    } finally {
      setLoading(false);
    }
  }, [projectId, requirementId]);

  useEffect(() => {
    void fetchImpact();
  }, [fetchImpact]);

  const handleReviewSubmit = async () => {
    if (!window.desktop?.requirements) return;
    if (!activeReviewCandidate) return;
    setSubmittingReview(true);
    setError(null);
    try {
      const res = await window.desktop.requirements.reviewChangeImpact({
        projectId,
        impactId: activeReviewCandidate.id,
        status: reviewStatus,
        reviewRationale: reviewRationale.trim() || undefined,
      });
      if (res.ok) {
        setActiveReviewCandidate(null);
        setReviewRationale('');
        await fetchImpact();
      } else {
        setError(res.error.message ?? 'Failed to update impact review.');
      }
    } catch {
      setError('An unexpected error occurred while updating review.');
    } finally {
      setSubmittingReview(false);
    }
  };

  const getImpactTypeVariant = (type: string): BadgeVariant => {
    switch (type) {
      case 'DEPENDENT_REQUIREMENT':
        return 'danger';
      case 'CONFLICT_REVIEW':
        return 'warning';
      case 'REPOSITORY_EVIDENCE':
        return 'info';
      case 'CONSTRAINED_REQUIREMENT':
        return 'warning';
      case 'CHILD_REQUIREMENT':
      case 'PARENT_REQUIREMENT':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  const getStatusVariant = (status: string): BadgeVariant => {
    switch (status) {
      case 'OPEN':
        return 'warning';
      case 'ACTION_REQUIRED':
        return 'danger';
      case 'REVIEWED':
        return 'success';
      case 'NOT_IMPACTED':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-xs text-neutral-400">
        Analyzing change impact candidates...
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs text-neutral-300">
      {error && (
        <div className="p-3 bg-red-950/50 border border-red-800/80 rounded text-red-200">
          {error}
        </div>
      )}

      {/* Summary Header */}
      <div className="flex items-center justify-between font-medium text-neutral-400">
        <span>
          Change Impact for Version v{impactData?.versionNumber ?? 1} (
          {impactData?.totalCandidates ?? 0} candidates, {impactData?.openCount ?? 0} open)
        </span>
        <Button size="sm" variant="secondary" onClick={fetchImpact}>
          Re-Analyze
        </Button>
      </div>

      {impactData?.candidates.length === 0 ? (
        <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-lg text-center text-neutral-400">
          No potentially impacted requirements or repository evidence detected for this version.
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {impactData?.candidates.map((cand: RequirementImpactCandidateDto) => (
            <div
              key={cand.id}
              className="p-3 bg-neutral-950/60 border border-neutral-800 rounded-lg space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant={getImpactTypeVariant(cand.impactType)}>{cand.impactType}</Badge>
                  <Badge variant={getStatusVariant(cand.status)}>{cand.status}</Badge>
                  <span className="text-[11px] font-mono text-neutral-400">
                    Depth {cand.depth} &bull; {cand.reasonCode}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setActiveReviewCandidate(cand);
                    setReviewStatus(cand.status);
                    setReviewRationale(cand.reviewRationale ?? '');
                  }}
                >
                  Review
                </Button>
              </div>

              {/* Target info */}
              {cand.targetRequirementKey ? (
                <div className="text-neutral-200 font-medium flex items-center gap-2">
                  <span className="font-mono text-sky-400 font-bold">
                    {cand.targetRequirementKey}
                  </span>
                  <span className="line-clamp-1">{cand.targetRequirementTitle}</span>
                </div>
              ) : cand.repositoryEvidencePath ? (
                <div className="text-neutral-200 font-mono text-[11px] flex items-center gap-2">
                  <span className="text-emerald-400">{cand.repositoryEvidencePath}</span>
                  {cand.repositoryEvidenceSymbol && (
                    <span className="text-amber-400">#{cand.repositoryEvidenceSymbol}</span>
                  )}
                </div>
              ) : null}

              {/* Review notes if any */}
              {cand.reviewRationale && (
                <div className="text-neutral-400 text-[11px] italic bg-neutral-900/60 p-1.5 rounded border border-neutral-800/80">
                  Review rationale: {cand.reviewRationale}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Review Dialog */}
      {activeReviewCandidate && (
        <div className="p-3.5 bg-neutral-900 border border-neutral-700 rounded-lg space-y-3">
          <div className="font-semibold text-neutral-200">
            Review Impact Candidate:{' '}
            {activeReviewCandidate.targetRequirementKey ||
              activeReviewCandidate.repositoryEvidencePath}
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-neutral-400">Impact Assessment Status:</label>
            <select
              value={reviewStatus}
              onChange={e => setReviewStatus(e.target.value as RequirementImpactStatus)}
              className="w-full bg-neutral-950 border border-neutral-700 text-neutral-200 rounded px-2.5 py-1 text-xs"
            >
              <option value="OPEN">OPEN (Unresolved)</option>
              <option value="REVIEWED">REVIEWED (Verified safe)</option>
              <option value="ACTION_REQUIRED">ACTION_REQUIRED (Needs modification)</option>
              <option value="NOT_IMPACTED">NOT_IMPACTED (False positive)</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-neutral-400">
              Review Rationale / Notes (optional):
            </label>
            <textarea
              rows={2}
              value={reviewRationale}
              onChange={e => setReviewRationale(e.target.value)}
              placeholder="Explain rationale for this impact assessment..."
              className="w-full bg-neutral-950 border border-neutral-700 text-neutral-200 rounded px-2.5 py-1 text-xs resize-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setActiveReviewCandidate(null)}
              disabled={submittingReview}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleReviewSubmit}
              disabled={submittingReview}
            >
              {submittingReview ? 'Saving...' : 'Save Decision'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
