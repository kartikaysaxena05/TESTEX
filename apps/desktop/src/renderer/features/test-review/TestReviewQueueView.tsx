/**
 * @file apps/desktop/src/renderer/features/test-review/TestReviewQueueView.tsx
 * Primary workspace and queue for Phase 56 Test Review, Approval, Regeneration & Versioning.
 */

import React, { useEffect, useState } from 'react';
import type { TestReviewQueueItemDto, TestReviewStatus } from '@ai-quality/contracts';
import { TestReviewDetailModal } from './TestReviewDetailModal.js';

interface TestReviewQueueViewProps {
  readonly projectId: string;
  readonly onNavigateToRequirement?: (requirementId: string) => void;
}

export const TestReviewQueueView: React.FC<TestReviewQueueViewProps> = ({
  projectId,
  onNavigateToRequirement,
}) => {
  const [items, setItems] = useState<readonly TestReviewQueueItemDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [stalenessFilter, setStalenessFilter] = useState<'ALL' | 'STALE' | 'CURRENT'>('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedTestCaseId, setSelectedTestCaseId] = useState<string | null>(null);

  const fetchQueue = async () => {
    if (!window.desktop?.testReview) return;
    try {
      setLoading(true);
      setError(null);

      const isReqStaleParam =
        stalenessFilter === 'STALE' ? true : stalenessFilter === 'CURRENT' ? false : undefined;

      const res = await window.desktop.testReview.listQueue({
        projectId,
        reviewStatus: statusFilter !== 'ALL' ? (statusFilter as TestReviewStatus) : undefined,
        isRequirementStale: isReqStaleParam,
        search: search.trim() || undefined,
        page,
        pageSize,
      });

      if (res.ok) {
        setItems(res.data.items);
        setTotal(res.data.total);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [projectId, statusFilter, stalenessFilter, page]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchQueue();
  };

  // Metrics
  const draftCount = items.filter(
    i => i.reviewStatus === 'DRAFT' || i.reviewStatus === 'IN_REVIEW',
  ).length;
  const approvedCount = items.filter(i => i.reviewStatus === 'APPROVED').length;
  const staleCount = items.filter(i => i.isRequirementStale).length;
  const rejectedCount = items.filter(i => i.reviewStatus === 'REJECTED').length;

  return (
    <div className="space-y-5">
      {/* Header & Metrics */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Test Review & Governance Workspace</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Review, approve, reject, edit, and regenerate AI-generated test cases with strict
              version immutability and provenance.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchQueue()}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition flex items-center gap-1.5 shadow-sm"
          >
            ↻ Refresh Queue
          </button>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1">
            <span className="text-[11px] text-slate-400 font-medium">Pending Review</span>
            <div className="text-xl font-bold text-amber-400">{draftCount}</div>
          </div>
          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1">
            <span className="text-[11px] text-slate-400 font-medium">Approved Tests</span>
            <div className="text-xl font-bold text-emerald-400">{approvedCount}</div>
          </div>
          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1">
            <span className="text-[11px] text-slate-400 font-medium">Outdated / Stale Req</span>
            <div className="text-xl font-bold text-amber-500">{staleCount}</div>
          </div>
          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1">
            <span className="text-[11px] text-slate-400 font-medium">Rejected Tests</span>
            <div className="text-xl font-bold text-rose-400">{rejectedCount}</div>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-3 bg-slate-900/40 border border-slate-800 rounded-xl flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-medium">Status:</span>
          <select
            value={statusFilter}
            onChange={e => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="IN_REVIEW">In Review</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>

          <span className="text-slate-400 font-medium ml-2">Requirement:</span>
          <select
            value={stalenessFilter}
            onChange={e => {
              setStalenessFilter(e.target.value as any);
              setPage(1);
            }}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none"
          >
            <option value="ALL">All Requirements</option>
            <option value="STALE">Stale Requirements (Needs Regen)</option>
            <option value="CURRENT">Up to Date</option>
          </select>
        </div>

        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search test key, title, or objective..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 placeholder-slate-500 w-64 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-sm transition"
          >
            Search
          </button>
        </form>
      </div>

      {/* Error display */}
      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/50">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold">
              <th className="p-3">Test Case Key</th>
              <th className="p-3">Title</th>
              <th className="p-3">Version</th>
              <th className="p-3">Review Status</th>
              <th className="p-3">Source Requirement</th>
              <th className="p-3">Validation</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400">
                  Loading review queue...
                </td>
              </tr>
            )}

            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-500 italic">
                  No test cases match the current filter criteria.
                </td>
              </tr>
            )}

            {!loading &&
              items.map(item => (
                <tr
                  key={item.testCaseId}
                  className="hover:bg-slate-800/30 transition group cursor-pointer"
                  onClick={() => setSelectedTestCaseId(item.testCaseId)}
                >
                  <td className="p-3 font-mono font-bold text-blue-400 whitespace-nowrap">
                    {item.testCaseKey}
                  </td>
                  <td className="p-3 max-w-xs truncate text-slate-200 font-medium">{item.title}</td>
                  <td className="p-3 font-mono text-slate-300 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded bg-slate-800 font-bold text-[11px]">
                      v{item.currentVersionNumber}
                    </span>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        item.reviewStatus === 'APPROVED'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : item.reviewStatus === 'REJECTED'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {item.reviewStatus}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        {item.sourceRequirementId && onNavigateToRequirement ? (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              onNavigateToRequirement(item.sourceRequirementId!);
                            }}
                            className="font-mono text-blue-400 hover:text-blue-300 font-semibold underline text-left"
                          >
                            {item.sourceRequirementKey ?? '—'}
                          </button>
                        ) : (
                          <span className="font-mono text-slate-300 font-semibold">
                            {item.sourceRequirementKey ?? '—'}
                          </span>
                        )}
                        {item.isRequirementStale && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            ⚠ Stale Req (v{item.sourceRequirementVersionNumber} ➔ v
                            {item.currentRequirementVersionNumber})
                          </span>
                        )}
                        {!item.isRequirementStale && item.sourceRequirementKey && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-slate-400">
                            v{item.sourceRequirementVersionNumber}
                          </span>
                        )}
                      </div>
                      {item.sourceRequirementTitle && (
                        <div className="text-[11px] text-slate-400 truncate max-w-xs">
                          {item.sourceRequirementTitle}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    {item.latestValidationStatus ? (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                          item.latestValidationStatus === 'VALID'
                            ? 'text-emerald-400'
                            : item.latestValidationStatus === 'REJECTED'
                              ? 'text-rose-400'
                              : 'text-amber-400'
                        }`}
                      >
                        {item.latestValidationStatus}
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td
                    className="p-3 text-right whitespace-nowrap"
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedTestCaseId(item.testCaseId)}
                      className="px-2.5 py-1 rounded bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 font-semibold transition text-xs shadow-sm"
                    >
                      Review & Actions →
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        {/* Pagination Bar */}
        <div className="p-3 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div>
            Showing {items.length} of {total} test cases
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage(prev => Math.max(1, prev - 1))}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition"
            >
              Previous
            </button>
            <span className="font-mono text-slate-300">
              Page {page} of {Math.max(1, Math.ceil(total / pageSize))}
            </span>
            <button
              type="button"
              disabled={page * pageSize >= total || loading}
              onClick={() => setPage(prev => prev + 1)}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Full Detail Modal */}
      {selectedTestCaseId && (
        <TestReviewDetailModal
          isOpen={true}
          projectId={projectId}
          testCaseId={selectedTestCaseId}
          onClose={() => setSelectedTestCaseId(null)}
          onUpdated={() => {
            fetchQueue();
          }}
        />
      )}
    </div>
  );
};
