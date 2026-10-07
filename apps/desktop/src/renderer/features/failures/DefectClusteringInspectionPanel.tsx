/**
 * @file apps/desktop/src/renderer/features/failures/DefectClusteringInspectionPanel.tsx
 * Duplicate Failure Detection & Defect Clustering Inspection Panel (V6 Phase 85).
 * Displays cluster membership, duplicate relationship, matched & contradictory signals,
 * cluster members, and provides merge, split, manual override, and audit history capabilities.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  DefectClusterDto,
  DefectClusterMembershipDto,
  DefectClusterHistoryDto,
  DuplicateRelationshipTypeDto,
  DefectClusterStatusDto,
} from '@ai-quality/contracts';

interface DefectClusteringInspectionPanelProps {
  readonly projectId: string;
  readonly failureCaseId: string;
}

const RELATIONSHIP_STYLES: Record<
  DuplicateRelationshipTypeDto,
  { bg: string; text: string; border: string; label: string; icon: string }
> = {
  EXACT_DUPLICATE: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    label: 'Exact Duplicate',
    icon: '🎯',
  },
  PROBABLE_DUPLICATE: {
    bg: 'bg-sky-500/10',
    text: 'text-sky-400',
    border: 'border-sky-500/30',
    label: 'Probable Duplicate',
    icon: '🧩',
  },
  RELATED_FAILURE: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    label: 'Related Failure',
    icon: '🔗',
  },
  DISTINCT_FAILURE: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
    label: 'Distinct Failure',
    icon: '🛡️',
  },
  INCONCLUSIVE: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-400',
    border: 'border-orange-500/30',
    label: 'Inconclusive',
    icon: '❓',
  },
  INSUFFICIENT_EVIDENCE: {
    bg: 'bg-zinc-500/10',
    text: 'text-zinc-400',
    border: 'border-zinc-500/30',
    label: 'Insufficient Evidence',
    icon: '⚪',
  },
};

const STATUS_STYLES: Record<DefectClusterStatusDto, { bg: string; text: string; label: string }> = {
  ACTIVE: { bg: 'bg-emerald-500/20 text-emerald-300', text: 'text-emerald-400', label: 'Active' },
  RESOLVED: { bg: 'bg-cyan-500/20 text-cyan-300', text: 'text-cyan-400', label: 'Resolved' },
  RECURRED: { bg: 'bg-rose-500/20 text-rose-300', text: 'text-rose-400', label: 'Recurred' },
  MERGED: { bg: 'bg-purple-500/20 text-purple-300', text: 'text-purple-400', label: 'Merged' },
  SPLIT: { bg: 'bg-amber-500/20 text-amber-300', text: 'text-amber-400', label: 'Split' },
  ARCHIVED: { bg: 'bg-slate-500/20 text-slate-300', text: 'text-slate-400', label: 'Archived' },
};

export const DefectClusteringInspectionPanel: React.FC<DefectClusteringInspectionPanelProps> = ({
  projectId,
  failureCaseId,
}) => {
  const [membership, setMembership] = useState<DefectClusterMembershipDto | null>(null);
  const [cluster, setCluster] = useState<DefectClusterDto | null>(null);
  const [allClusters, setAllClusters] = useState<readonly DefectClusterDto[]>([]);
  const [history, setHistory] = useState<readonly DefectClusterHistoryDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals state
  const [showMergeModal, setShowMergeModal] = useState<boolean>(false);
  const [showSplitModal, setShowSplitModal] = useState<boolean>(false);
  const [showOverrideModal, setShowOverrideModal] = useState<boolean>(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState<boolean>(false);

  // Form states
  const [mergeTargetId, setMergeTargetId] = useState<string>('');
  const [mergeReason, setMergeReason] = useState<string>('');
  const [splitSelectedIds, setSplitSelectedIds] = useState<string[]>([]);
  const [splitReason, setSplitReason] = useState<string>('');
  const [overrideAction, setOverrideAction] = useState<'MOVE' | 'DETACH'>('MOVE');
  const [overrideTargetId, setOverrideTargetId] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState<string>('');

  const isMountedRef = useRef<boolean>(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadData = useCallback(async () => {
    if (!window.desktop?.failures) return;
    const desktopFailures = window.desktop.failures;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      // 1. Fetch membership for this failure case
      const memRes = await desktopFailures.getFailureMembership({
        projectId,
        failureCaseId,
      });

      if (!isMountedRef.current) return;

      if (!memRes.ok) {
        setErrorMessage(memRes.error.message);
        setIsLoading(false);
        return;
      }

      setMembership(memRes.data);

      if (memRes.data) {
        // 2. Fetch parent cluster details with members
        const clusterRes = await desktopFailures.getCluster({
          projectId,
          clusterId: memRes.data.clusterId,
        });

        if (isMountedRef.current && clusterRes.ok) {
          setCluster(clusterRes.data);
        }
      } else {
        setCluster(null);
      }

      // 3. Fetch all project clusters for modal pickers
      const allRes = await desktopFailures.listClusters({ projectId });
      if (isMountedRef.current && allRes.ok) {
        setAllClusters(allRes.data);
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
        setErrorMessage(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [projectId, failureCaseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRunClustering = async () => {
    if (!window.desktop?.failures) return;
    setIsActionLoading(true);
    setErrorMessage(null);

    try {
      const res = await window.desktop.failures.clusterDefects({
        projectId,
        failureCaseIds: [failureCaseId],
      });

      if (!res.ok) {
        setErrorMessage(res.error.message);
      } else {
        await loadData();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleMergeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cluster || !mergeTargetId || !mergeReason.trim() || !window.desktop?.failures) return;

    setIsActionLoading(true);
    try {
      const res = await window.desktop.failures.mergeClusters({
        projectId,
        sourceClusterId: cluster.id,
        targetClusterId: mergeTargetId,
        reason: mergeReason.trim(),
      });

      if (!res.ok) {
        setErrorMessage(res.error.message);
      } else {
        setShowMergeModal(false);
        setMergeReason('');
        await loadData();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleSplitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !cluster ||
      splitSelectedIds.length === 0 ||
      !splitReason.trim() ||
      !window.desktop?.failures
    )
      return;

    setIsActionLoading(true);
    try {
      const res = await window.desktop.failures.splitCluster({
        projectId,
        clusterId: cluster.id,
        failureCaseIdsToExtract: splitSelectedIds,
        reason: splitReason.trim(),
      });

      if (!res.ok) {
        setErrorMessage(res.error.message);
      } else {
        setShowSplitModal(false);
        setSplitSelectedIds([]);
        setSplitReason('');
        await loadData();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideReason.trim() || !window.desktop?.failures) return;

    setIsActionLoading(true);
    try {
      const res = await window.desktop.failures.overrideMembership({
        projectId,
        failureCaseId,
        targetClusterId: overrideAction === 'MOVE' ? overrideTargetId : null,
        action: overrideAction,
        reason: overrideReason.trim(),
      });

      if (!res.ok) {
        setErrorMessage(res.error.message);
      } else {
        setShowOverrideModal(false);
        setOverrideReason('');
        await loadData();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleLoadHistory = async () => {
    if (!cluster || !window.desktop?.failures) return;
    try {
      const res = await window.desktop.failures.listClusterHistory({
        projectId,
        clusterId: cluster.id,
      });
      if (res.ok) {
        setHistory(res.data);
        setShowHistoryDrawer(true);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400">
        <div className="animate-spin h-6 w-6 border-2 border-primary-500 border-t-transparent rounded-full mr-3" />
        <span>Loading defect cluster intelligence...</span>
      </div>
    );
  }

  const relStyle = membership
    ? RELATIONSHIP_STYLES[membership.relationshipType] || RELATIONSHIP_STYLES.INSUFFICIENT_EVIDENCE
    : null;
  const statusStyle = cluster ? STATUS_STYLES[cluster.clusterStatus] || STATUS_STYLES.ACTIVE : null;

  return (
    <div className="space-y-6" data-testid="defect-clustering-inspection-panel">
      {/* Error Message */}
      {errorMessage && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 text-sm flex items-center justify-between">
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-400 hover:text-rose-200 text-xs uppercase ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Unassigned / Empty State */}
      {!membership || !cluster ? (
        <div className="p-8 border border-dashed border-slate-700/60 rounded-xl text-center space-y-4 bg-slate-900/40">
          <div className="text-4xl">🧩</div>
          <h3 className="text-lg font-medium text-slate-200">No Defect Cluster Formed Yet</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            This failure has not yet been assigned to a defect cluster. Run duplicate detection to
            group it with identical or related application defect manifestations.
          </p>
          <button
            onClick={handleRunClustering}
            disabled={isActionLoading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg shadow disabled:opacity-50 inline-flex items-center space-x-2"
          >
            {isActionLoading ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                <span>Clustering Failures...</span>
              </>
            ) : (
              <>
                <span>Detect & Cluster Defect</span>
              </>
            )}
          </button>
        </div>
      ) : (
        <>
          {/* Header Card */}
          <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <span className="px-2.5 py-1 text-xs font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded">
                  {cluster.clusterKey}
                </span>
                <h2 className="text-base font-semibold text-slate-100">{cluster.title}</h2>
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusStyle?.bg}`}>
                  {statusStyle?.label}
                </span>
                {membership.isRepresentative && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full flex items-center space-x-1">
                    <span>👑</span>
                    <span>Representative Failure</span>
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleRunClustering}
                  disabled={isActionLoading}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded border border-slate-700 flex items-center space-x-1.5"
                  title="Re-run duplicate clustering for this project"
                >
                  <span>🔄</span>
                  <span>Recluster</span>
                </button>
                <button
                  onClick={() => setShowMergeModal(true)}
                  disabled={isActionLoading || allClusters.length <= 1}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded border border-slate-700 flex items-center space-x-1.5"
                >
                  <span>🔗</span>
                  <span>Merge</span>
                </button>
                <button
                  onClick={() => setShowSplitModal(true)}
                  disabled={isActionLoading || (cluster.memberships?.length || 0) <= 1}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded border border-slate-700 flex items-center space-x-1.5"
                >
                  <span>✂️</span>
                  <span>Split</span>
                </button>
                <button
                  onClick={() => setShowOverrideModal(true)}
                  disabled={isActionLoading}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded border border-slate-700 flex items-center space-x-1.5"
                >
                  <span>⚙️</span>
                  <span>Override</span>
                </button>
                <button
                  onClick={handleLoadHistory}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded border border-slate-700 flex items-center space-x-1.5"
                >
                  <span>📜</span>
                  <span>History</span>
                </button>
              </div>
            </div>

            {/* Relationship Banner */}
            <div
              className={`p-3.5 rounded-lg border flex items-center justify-between ${relStyle?.bg} ${relStyle?.border}`}
            >
              <div className="flex items-center space-x-3">
                <span className="text-xl">{relStyle?.icon}</span>
                <div>
                  <div className="text-xs uppercase font-bold tracking-wider text-slate-400">
                    Cluster Relationship
                  </div>
                  <div className={`text-sm font-semibold ${relStyle?.text}`}>{relStyle?.label}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase font-bold tracking-wider text-slate-400">
                  Similarity Score
                </div>
                <div className="text-sm font-mono font-bold text-slate-200">
                  {Math.round(membership.similarityScore * 100)}% ({membership.relationshipStrength}
                  )
                </div>
              </div>
            </div>

            {/* Why Grouped Explanation */}
            <div className="p-3 bg-slate-950/50 rounded-lg border border-slate-800/80 space-y-1">
              <div className="text-xs font-semibold uppercase text-slate-400">
                Relationship Justification
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{membership.explanation}</p>
            </div>
          </div>

          {/* Matched & Contradictory Signals */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Matched Signals */}
            <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-400 uppercase tracking-wide">
                <span>✅</span>
                <span>Matched Evidence Signals ({membership.matchedSignals.length})</span>
              </div>
              {membership.matchedSignals.length === 0 ? (
                <div className="text-xs text-slate-500 italic">No matching signals recorded.</div>
              ) : (
                <div className="space-y-2">
                  {membership.matchedSignals.map((sig, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-emerald-500/5 border border-emerald-500/20 rounded text-xs text-slate-300 space-y-0.5"
                    >
                      <div className="font-mono text-emerald-400 text-[11px] font-semibold">
                        {sig.signal}
                      </div>
                      <div className="text-slate-400 text-[11px]">{sig.description}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Contradictory Signals */}
            <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center space-x-2 text-xs font-semibold text-rose-400 uppercase tracking-wide">
                <span>⚠️</span>
                <span>Contradictory Signals ({membership.contradictorySignals.length})</span>
              </div>
              {membership.contradictorySignals.length === 0 ? (
                <div className="text-xs text-slate-500 italic">
                  Zero contradictory signals detected.
                </div>
              ) : (
                <div className="space-y-2">
                  {membership.contradictorySignals.map((sig, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-rose-500/5 border border-rose-500/20 rounded text-xs text-slate-300 space-y-0.5"
                    >
                      <div className="font-mono text-rose-400 text-[11px] font-semibold flex items-center justify-between">
                        <span>{sig.signal}</span>
                        {sig.severity && (
                          <span className="text-[10px] px-1 bg-rose-500/20 rounded uppercase">
                            {sig.severity}
                          </span>
                        )}
                      </div>
                      <div className="text-slate-400 text-[11px]">{sig.description}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cluster Metadata Grid */}
          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-3">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Cluster Metadata & Aggregates
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 bg-slate-950/60 rounded border border-slate-800/80">
                <div className="text-slate-500 text-[11px]">Active Members</div>
                <div className="text-slate-200 font-semibold mt-0.5">
                  {cluster.memberCount} failures
                </div>
              </div>
              <div className="p-2.5 bg-slate-950/60 rounded border border-slate-800/80">
                <div className="text-slate-500 text-[11px]">Probable Layer</div>
                <div className="text-slate-200 font-semibold mt-0.5">
                  {cluster.probableLayer || 'UNKNOWN'}
                </div>
              </div>
              <div className="p-2.5 bg-slate-950/60 rounded border border-slate-800/80">
                <div className="text-slate-500 text-[11px]">Severity Summary</div>
                <div className="text-slate-200 font-semibold mt-0.5">
                  {cluster.severitySummary || 'UNKNOWN'}
                </div>
              </div>
              <div className="p-2.5 bg-slate-950/60 rounded border border-slate-800/80">
                <div className="text-slate-500 text-[11px]">Priority Summary</div>
                <div className="text-slate-200 font-semibold mt-0.5">
                  {cluster.prioritySummary || 'UNKNOWN'}
                </div>
              </div>
            </div>

            {/* Affected Routes & Requirements */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 text-xs">
              <div className="p-2.5 bg-slate-950/60 rounded border border-slate-800/80 space-y-1">
                <div className="text-slate-500 text-[11px]">Affected Routes</div>
                {cluster.affectedRoutes.length === 0 ? (
                  <div className="text-slate-500 italic text-[11px]">None recorded</div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {cluster.affectedRoutes.map((route, i) => (
                      <span
                        key={i}
                        className="px-1.5 py-0.5 font-mono text-[10px] bg-slate-800 text-slate-300 rounded"
                      >
                        {route}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-2.5 bg-slate-950/60 rounded border border-slate-800/80 space-y-1">
                <div className="text-slate-500 text-[11px]">Affected Requirements</div>
                {cluster.affectedRequirements.length === 0 ? (
                  <div className="text-slate-500 italic text-[11px]">None linked</div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {cluster.affectedRequirements.map((req, i) => (
                      <span
                        key={i}
                        className="px-1.5 py-0.5 font-mono text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded"
                      >
                        {req}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Cluster Members Table */}
          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wide">
              <span>Cluster Member Failures ({cluster.memberships?.length || 0})</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 px-3">Failure Case</th>
                    <th className="py-2 px-3">Relationship</th>
                    <th className="py-2 px-3">Score</th>
                    <th className="py-2 px-3">Error / Signature</th>
                    <th className="py-2 px-3 text-right">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {(cluster.memberships || []).map(m => {
                    const isCurrent = m.failureCaseId === failureCaseId;
                    const mRelStyle = RELATIONSHIP_STYLES[m.relationshipType];

                    return (
                      <tr
                        key={m.id}
                        className={`hover:bg-slate-800/40 ${isCurrent ? 'bg-indigo-500/10' : ''}`}
                      >
                        <td className="py-2 px-3">
                          <div className="font-medium text-slate-200">
                            {m.failureCase?.title || m.failureCaseId}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500">
                            {m.failureCaseId}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-2 py-0.5 text-[10px] rounded-full border ${mRelStyle?.bg} ${mRelStyle?.text} ${mRelStyle?.border}`}
                          >
                            {mRelStyle?.label}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-300">
                          {Math.round(m.similarityScore * 100)}%
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-400 max-w-xs truncate">
                          {m.failureCase?.failureSignature ||
                            m.failureCase?.errorMessage ||
                            'No signature'}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {m.isRepresentative ? (
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded">
                              👑 Representative
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-500">Member</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Merge Modal */}
      {showMergeModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-semibold text-slate-100">
              Merge Cluster {cluster?.clusterKey}
            </h3>
            <p className="text-xs text-slate-400">
              Select target cluster to merge this cluster into. All active members will be
              reassigned.
            </p>
            <form onSubmit={handleMergeSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Target Cluster
                </label>
                <select
                  value={mergeTargetId}
                  onChange={e => setMergeTargetId(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200"
                >
                  <option value="">Select target cluster...</option>
                  {allClusters
                    .filter(c => c.id !== cluster?.id && c.clusterStatus === 'ACTIVE')
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        {c.clusterKey} — {c.title} ({c.memberCount} members)
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Audit Reason
                </label>
                <textarea
                  value={mergeReason}
                  onChange={e => setMergeReason(e.target.value)}
                  required
                  placeholder="Operator rationale for cluster merge..."
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 h-20"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMergeModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isActionLoading || !mergeTargetId || !mergeReason.trim()}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded disabled:opacity-50"
                >
                  {isActionLoading ? 'Merging...' : 'Confirm Merge'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Split Modal */}
      {showSplitModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-semibold text-slate-100">
              Split Cluster {cluster?.clusterKey}
            </h3>
            <p className="text-xs text-slate-400">
              Select members to extract into a new independent defect cluster.
            </p>
            <form onSubmit={handleSplitSubmit} className="space-y-4">
              <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-800 rounded p-2">
                {(cluster?.memberships || []).map(m => (
                  <label key={m.id} className="flex items-center space-x-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={splitSelectedIds.includes(m.failureCaseId)}
                      onChange={e => {
                        if (e.target.checked) {
                          setSplitSelectedIds([...splitSelectedIds, m.failureCaseId]);
                        } else {
                          setSplitSelectedIds(
                            splitSelectedIds.filter(id => id !== m.failureCaseId),
                          );
                        }
                      }}
                    />
                    <span className="truncate">{m.failureCase?.title || m.failureCaseId}</span>
                  </label>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Audit Reason
                </label>
                <textarea
                  value={splitReason}
                  onChange={e => setSplitReason(e.target.value)}
                  required
                  placeholder="Operator rationale for splitting cluster..."
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 h-20"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSplitModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isActionLoading || splitSelectedIds.length === 0 || !splitReason.trim()}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded disabled:opacity-50"
                >
                  {isActionLoading ? 'Splitting...' : 'Confirm Split'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Override Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-semibold text-slate-100">Manual Membership Override</h3>
            <p className="text-xs text-slate-400">
              Manually move this failure to a different cluster or detach it.
            </p>
            <form onSubmit={handleOverrideSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Action</label>
                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-1.5 text-xs text-slate-200">
                    <input
                      type="radio"
                      checked={overrideAction === 'MOVE'}
                      onChange={() => setOverrideAction('MOVE')}
                    />
                    <span>Move to another cluster</span>
                  </label>
                  <label className="flex items-center space-x-1.5 text-xs text-slate-200">
                    <input
                      type="radio"
                      checked={overrideAction === 'DETACH'}
                      onChange={() => setOverrideAction('DETACH')}
                    />
                    <span>Detach from cluster</span>
                  </label>
                </div>
              </div>

              {overrideAction === 'MOVE' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Target Cluster
                  </label>
                  <select
                    value={overrideTargetId}
                    onChange={e => setOverrideTargetId(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200"
                  >
                    <option value="">Select target cluster...</option>
                    {allClusters
                      .filter(c => c.id !== cluster?.id && c.clusterStatus === 'ACTIVE')
                      .map(c => (
                        <option key={c.id} value={c.id}>
                          {c.clusterKey} — {c.title}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Override Justification
                </label>
                <textarea
                  value={overrideReason}
                  onChange={e => setOverrideReason(e.target.value)}
                  required
                  placeholder="Operator reason for manual override..."
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 h-20"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOverrideModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    isActionLoading ||
                    !overrideReason.trim() ||
                    (overrideAction === 'MOVE' && !overrideTargetId)
                  }
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded disabled:opacity-50"
                >
                  {isActionLoading ? 'Saving...' : 'Apply Override'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Drawer */}
      {showHistoryDrawer && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-end z-50">
          <div className="bg-slate-900 border-l border-slate-700 w-full max-w-md h-full p-6 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-100">
                Cluster Audit Trail: {cluster?.clusterKey}
              </h3>
              <button
                onClick={() => setShowHistoryDrawer(false)}
                className="text-slate-400 hover:text-slate-200 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 pt-2">
              {history.length === 0 ? (
                <div className="text-xs text-slate-500 italic">No historical events recorded.</div>
              ) : (
                history.map(item => (
                  <div
                    key={item.id}
                    className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-mono font-bold text-indigo-400">{item.eventType}</span>
                      <span className="text-slate-500">
                        {new Date(item.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-slate-300">{item.reason}</div>
                    <div className="text-[10px] text-slate-500">Actor: {item.actor}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
