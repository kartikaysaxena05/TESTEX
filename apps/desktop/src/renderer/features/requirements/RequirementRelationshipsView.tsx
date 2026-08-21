/**
 * @file apps/desktop/src/renderer/features/requirements/RequirementRelationshipsView.tsx
 * UI component for proposing, reviewing, visualizing, and managing Requirement ↔ Requirement relationships.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  RequirementRelationshipDto,
  RequirementRelationshipType,
  RelationshipStatus,
  DependencyCycleDto,
  RequirementDto,
} from '@ai-quality/contracts';

interface RequirementRelationshipsViewProps {
  readonly projectId: string;
  readonly requirementId: string;
}

const RELATIONSHIP_TYPES: readonly RequirementRelationshipType[] = [
  'DEPENDS_ON',
  'REQUIRED_BY',
  'REFINES',
  'REFINED_BY',
  'PARENT_OF',
  'CHILD_OF',
  'CONSTRAINS',
  'CONSTRAINED_BY',
  'RELATED_TO',
  'CONFLICTS_WITH',
  'DUPLICATES',
  'OVERLAPS_WITH',
];

export const RequirementRelationshipsView: React.FC<RequirementRelationshipsViewProps> = ({
  projectId,
  requirementId,
}) => {
  const [relationships, setRelationships] = useState<readonly RequirementRelationshipDto[]>([]);
  const [cycles, setCycles] = useState<readonly DependencyCycleDto[]>([]);
  const [otherRequirements, setOtherRequirements] = useState<readonly RequirementDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Manual addition state
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [manualTargetId, setManualTargetId] = useState<string>('');
  const [manualType, setManualType] = useState<RequirementRelationshipType>('DEPENDS_ON');
  const [manualRationale, setManualRationale] = useState<string>('');

  // Review state
  const [reviewingRelId, setReviewingRelId] = useState<string | null>(null);
  const [reviewRationale, setReviewRationale] = useState<string>('');

  const fetchData = useCallback(async () => {
    if (!window.desktop?.requirements) return;
    try {
      setLoading(true);
      setError(null);

      const [relsRes, graphRes, listRes] = await Promise.all([
        window.desktop.requirements.getRelationships({ projectId, requirementId }),
        window.desktop.requirements.getRelationshipGraph({ projectId, requirementId }),
        window.desktop.requirements.list({ projectId, pageSize: 100 }),
      ]);

      if (relsRes.ok) {
        setRelationships(relsRes.data);
      } else {
        setError(relsRes.error.message);
      }

      if (graphRes.ok) {
        setCycles(graphRes.data.cycles);
      }

      if (listRes.ok) {
        setOtherRequirements(listRes.data.items.filter(r => r.id !== requirementId));
      }
    } catch {
      setError('Failed to load relationships.');
    } finally {
      setLoading(false);
    }
  }, [projectId, requirementId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handlePropose = async () => {
    if (!window.desktop?.requirements) return;
    try {
      setActionLoading(true);
      setError(null);
      const res = await window.desktop.requirements.proposeRelationships({
        projectId,
        requirementId,
      });

      if (res.ok) {
        await fetchData();
      } else {
        setError(res.error.message);
      }
    } catch {
      setError('Failed to propose relationships.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.desktop?.requirements || !manualTargetId) return;

    try {
      setActionLoading(true);
      setError(null);
      const res = await window.desktop.requirements.createManualRelationship({
        projectId,
        sourceRequirementId: requirementId,
        targetRequirementId: manualTargetId,
        relationshipType: manualType,
        reviewRationale: manualRationale.trim() || null,
      });

      if (res.ok) {
        setShowAddForm(false);
        setManualTargetId('');
        setManualRationale('');
        await fetchData();
      } else {
        setError(res.error.message);
      }
    } catch {
      setError('Failed to create manual relationship.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReview = async (relId: string, status: RelationshipStatus) => {
    if (!window.desktop?.requirements) return;
    try {
      setActionLoading(true);
      setError(null);
      const res = await window.desktop.requirements.reviewRelationship({
        projectId,
        relationshipId: relId,
        status,
        reviewRationale: reviewRationale.trim() || null,
      });

      if (res.ok) {
        setReviewingRelId(null);
        setReviewRationale('');
        await fetchData();
      } else {
        setError(res.error.message);
      }
    } catch {
      setError('Failed to review relationship.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (relId: string) => {
    if (!window.desktop?.requirements) return;
    if (!confirm('Are you sure you want to delete this relationship?')) return;

    try {
      setActionLoading(true);
      setError(null);
      const res = await window.desktop.requirements.deleteRelationship({
        projectId,
        relationshipId: relId,
      });

      if (res.ok) {
        await fetchData();
      } else {
        setError(res.error.message);
      }
    } catch {
      setError('Failed to delete relationship.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-xs text-neutral-400">
        Loading requirement relationships...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-950/50 border border-red-800 rounded-lg text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Dependency Cycles Alert */}
      {cycles.length > 0 && (
        <div className="p-3.5 bg-amber-950/40 border border-amber-800/80 rounded-lg space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-bold text-xs">⚠️ DEPENDENCY CYCLE DETECTED</span>
            <span className="text-[10px] bg-amber-900/60 text-amber-300 px-1.5 py-0.5 rounded font-mono">
              {cycles.length} Cycle{cycles.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-1">
            {cycles.map((cycle, idx) => (
              <div
                key={idx}
                className="text-xs font-mono text-amber-200/90 pl-2 border-l border-amber-700/60"
              >
                {cycle.pathDescription}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-neutral-400">
          {relationships.length} Relationship{relationships.length === 1 ? '' : 's'} Mapped
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePropose}
            disabled={actionLoading}
            className="px-2.5 py-1 text-xs font-medium bg-sky-900/80 hover:bg-sky-800 text-sky-200 rounded transition-colors disabled:opacity-50"
          >
            {actionLoading ? 'Proposing...' : 'Propose Relationships'}
          </button>
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-2.5 py-1 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded transition-colors"
          >
            {showAddForm ? 'Cancel' : '+ Add Manual'}
          </button>
        </div>
      </div>

      {/* Manual Relationship Form */}
      {showAddForm && (
        <form
          onSubmit={handleCreateManual}
          className="p-3.5 bg-neutral-950 border border-neutral-800 rounded-lg space-y-3"
        >
          <h4 className="text-xs font-semibold text-neutral-200 uppercase tracking-wider">
            Create Manual Relationship
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-neutral-400 mb-1">Target Requirement</label>
              <select
                value={manualTargetId}
                onChange={e => setManualTargetId(e.target.value)}
                required
                className="w-full px-2.5 py-1.5 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-200"
              >
                <option value="">Select target requirement...</option>
                {otherRequirements.map(req => (
                  <option key={req.id} value={req.id}>
                    {req.requirementKey} — {req.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-neutral-400 mb-1">Relationship Type</label>
              <select
                value={manualType}
                onChange={e => setManualType(e.target.value as RequirementRelationshipType)}
                className="w-full px-2.5 py-1.5 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-200 font-mono"
              >
                {RELATIONSHIP_TYPES.map(type => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-neutral-400 mb-1">Rationale (Optional)</label>
            <input
              type="text"
              value={manualRationale}
              onChange={e => setManualRationale(e.target.value)}
              placeholder="Why does this relationship exist?"
              className="w-full px-2.5 py-1.5 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-200"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1 text-xs text-neutral-400 hover:text-neutral-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={actionLoading || !manualTargetId}
              className="px-3 py-1 text-xs font-medium bg-emerald-800 hover:bg-emerald-700 text-emerald-100 rounded disabled:opacity-50"
            >
              Confirm & Save
            </button>
          </div>
        </form>
      )}

      {/* Relationships List */}
      {relationships.length === 0 ? (
        <div className="p-4 bg-neutral-950/60 border border-neutral-800/80 rounded-lg text-center text-xs text-neutral-500">
          No relationships found for this requirement. Click "Propose Relationships" to detect
          references automatically or add one manually.
        </div>
      ) : (
        <div className="space-y-2.5">
          {relationships.map(rel => {
            const isSource = rel.sourceRequirementId === requirementId;
            const otherKey = isSource ? rel.targetRequirementKey : rel.sourceRequirementKey;
            const otherTitle = isSource ? rel.targetRequirementTitle : rel.sourceRequirementTitle;

            return (
              <div
                key={rel.id}
                className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-sky-400 bg-sky-950/60 border border-sky-800/40 px-2 py-0.5 rounded">
                      {isSource ? rel.sourceRequirementKey : rel.targetRequirementKey}
                    </span>
                    <span className="text-xs text-neutral-400">➔</span>
                    <span className="font-mono text-xs font-semibold text-indigo-300 bg-indigo-950/60 border border-indigo-800/40 px-2 py-0.5 rounded">
                      {rel.relationshipType}
                    </span>
                    <span className="text-xs text-neutral-400">➔</span>
                    <span className="font-mono text-xs font-bold text-sky-400 bg-sky-950/60 border border-sky-800/40 px-2 py-0.5 rounded">
                      {otherKey}
                    </span>
                    <span className="text-xs text-neutral-300 truncate max-w-xs" title={otherTitle}>
                      {otherTitle}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Status Badge */}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        rel.status === 'CONFIRMED'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : rel.status === 'REJECTED'
                            ? 'bg-red-950 text-red-400 border border-red-800'
                            : 'bg-neutral-800 text-neutral-300 border border-neutral-700'
                      }`}
                    >
                      {rel.status}
                    </span>
                    <span className="text-[10px] font-mono text-neutral-400 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800">
                      {rel.detectionMethod}
                    </span>
                  </div>
                </div>

                {/* Staleness alert */}
                {rel.isStale && (
                  <div className="text-[11px] text-amber-400/90 bg-amber-950/30 border border-amber-800/40 px-2 py-1 rounded">
                    ⚡ Requirement text changed since relationship detection. Re-propose or confirm.
                  </div>
                )}

                {/* Evidence & Rationale */}
                {rel.evidence && (
                  <div className="text-xs text-neutral-400 font-mono bg-neutral-900/60 p-1.5 rounded border border-neutral-800/60">
                    {rel.evidence}
                  </div>
                )}
                {rel.reviewRationale && (
                  <div className="text-xs text-neutral-300 italic">
                    Review Rationale: {rel.reviewRationale}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-1 border-t border-neutral-800/60 text-[11px]">
                  <div className="flex gap-1.5">
                    {rel.reasonCodes.map((code, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] font-mono text-neutral-400 bg-neutral-900 px-1.5 py-0.5 rounded"
                      >
                        {code}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {reviewingRelId === rel.id ? (
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
                          onClick={() => handleReview(rel.id, 'CONFIRMED')}
                          className="px-2 py-0.5 bg-emerald-800 text-emerald-100 rounded hover:bg-emerald-700"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReview(rel.id, 'REJECTED')}
                          className="px-2 py-0.5 bg-red-800 text-red-100 rounded hover:bg-red-700"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => setReviewingRelId(null)}
                          className="px-1.5 py-0.5 text-neutral-400"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <>
                        {rel.status === 'PROPOSED' && (
                          <button
                            type="button"
                            onClick={() => setReviewingRelId(rel.id)}
                            className="px-2 py-0.5 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded"
                          >
                            Review
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(rel.id)}
                          className="px-1.5 py-0.5 text-xs text-red-400 hover:text-red-300"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
