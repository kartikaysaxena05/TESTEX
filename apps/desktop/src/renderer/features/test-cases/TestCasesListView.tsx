/**
 * @file apps/desktop/src/renderer/features/test-cases/TestCasesListView.tsx
 * UI View for managing and inspecting canonical project Test Cases.
 */

import type {
  TestCaseDto,
  TestCaseDetailDto,
  TestCaseType,
  TestCasePriority,
} from '@ai-quality/contracts';
import React, { useEffect, useState } from 'react';
import { TestCaseDetailModal } from './TestCaseDetailModal.js';

interface TestCasesListViewProps {
  readonly projectId: string;
  readonly onNavigateToRequirement?: (requirementId: string) => void;
}

export const TestCasesListView: React.FC<TestCasesListViewProps> = ({
  projectId,
  onNavigateToRequirement,
}) => {
  const [items, setItems] = useState<readonly TestCaseDto[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(25);
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTestCase, setSelectedTestCase] = useState<TestCaseDetailDto | null>(null);

  const fetchTestCases = async () => {
    if (!window.desktop?.testCases) return;
    try {
      setLoading(true);
      setError(null);
      const res = await window.desktop.testCases.list({
        projectId,
        type: typeFilter !== 'ALL' ? (typeFilter as TestCaseType) : undefined,
        priority: priorityFilter !== 'ALL' ? (priorityFilter as TestCasePriority) : undefined,
        search: searchQuery.trim() || undefined,
        page,
        pageSize,
        sortBy: 'testCaseKey',
        sortDirection: 'asc',
      });

      if (res.ok) {
        setItems(res.data.items);
        setTotal(res.data.total);
      } else {
        setError(res.error.message);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDetail = async (testCaseId: string) => {
    if (!window.desktop?.testCases) return;
    try {
      setLoading(true);
      const res = await window.desktop.testCases.getById({
        projectId,
        testCaseId,
      });
      if (res.ok && res.data) {
        setSelectedTestCase(res.data);
      } else if (!res.ok) {
        setError(res.error.message);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (testCaseId: string) => {
    if (!window.desktop?.testCases) return;
    if (!confirm('Are you sure you want to delete this test case?')) return;
    try {
      setLoading(true);
      const res = await window.desktop.testCases.delete({
        projectId,
        testCaseId,
      });
      if (res.ok) {
        setSelectedTestCase(null);
        await fetchTestCases();
      } else {
        setError(res.error.message);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTestCases();
  }, [projectId, page, typeFilter, priorityFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchTestCases();
  };

  const getTypeBadgeClass = (type: string) => {
    switch (type) {
      case 'POSITIVE':
        return 'bg-emerald-950 text-emerald-300 border-emerald-800';
      case 'NEGATIVE':
        return 'bg-rose-950 text-rose-300 border-rose-800';
      case 'BOUNDARY':
        return 'bg-amber-950 text-amber-300 border-amber-800';
      case 'VALIDATION':
        return 'bg-purple-950 text-purple-300 border-purple-800';
      case 'SECURITY':
        return 'bg-red-950 text-red-300 border-red-800';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const getPriorityBadgeClass = (priority: string) => {
    switch (priority) {
      case 'CRITICAL':
        return 'bg-red-900 text-red-200 border-red-700';
      case 'HIGH':
        return 'bg-orange-900 text-orange-200 border-orange-700';
      case 'MEDIUM':
        return 'bg-blue-900 text-blue-200 border-blue-700';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Structured Test Cases</h1>
          <p className="text-xs text-slate-400">
            Canonical, durable, multi-tenant Test Cases with ordered steps, preconditions, and test
            data.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={fetchTestCases}
            disabled={loading}
            className="rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-950/50 p-3 text-xs text-red-300">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <form
          onSubmit={handleSearchSubmit}
          className="flex flex-1 items-center space-x-2 min-w-[200px]"
        >
          <input
            type="text"
            placeholder="Search by Key, Title, or Objective..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-hidden"
          />
          <button
            type="submit"
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition"
          >
            Search
          </button>
        </form>

        <div className="flex items-center space-x-2">
          <label className="text-xs text-slate-400 font-medium">Type:</label>
          <select
            value={typeFilter}
            onChange={e => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:outline-hidden"
          >
            <option value="ALL">All Types</option>
            <option value="POSITIVE">Positive</option>
            <option value="NEGATIVE">Negative</option>
            <option value="BOUNDARY">Boundary</option>
            <option value="VALIDATION">Validation</option>
            <option value="SECURITY">Security</option>
            <option value="PERFORMANCE">Performance</option>
            <option value="SMOKE">Smoke</option>
            <option value="REGRESSION">Regression</option>
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <label className="text-xs text-slate-400 font-medium">Priority:</label>
          <select
            value={priorityFilter}
            onChange={e => {
              setPriorityFilter(e.target.value);
              setPage(1);
            }}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:outline-hidden"
          >
            <option value="ALL">All Priorities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
      </div>

      {/* Test Cases Table */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/80 shadow-md">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-800 bg-slate-950 font-semibold text-slate-400">
            <tr>
              <th className="p-3 w-28">Key</th>
              <th className="p-3">Title & Objective</th>
              <th className="p-3 w-24">Type</th>
              <th className="p-3 w-20">Priority</th>
              <th className="p-3 w-28">Source Req</th>
              <th className="p-3 w-24 text-center">Structure</th>
              <th className="p-3 w-28">Created</th>
              <th className="p-3 w-20 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {items.length > 0 ? (
              items.map(tc => (
                <tr
                  key={tc.id}
                  onClick={() => handleOpenDetail(tc.id)}
                  className="cursor-pointer hover:bg-slate-800/50 transition"
                >
                  <td className="p-3 font-mono font-bold text-indigo-400">{tc.testCaseKey}</td>
                  <td className="p-3">
                    <div className="font-semibold text-slate-200">{tc.title}</div>
                    <div className="text-[11px] text-slate-400 line-clamp-1">{tc.objective}</div>
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${getTypeBadgeClass(
                        tc.type,
                      )}`}
                    >
                      {tc.type}
                    </span>
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${getPriorityBadgeClass(
                        tc.priority,
                      )}`}
                    >
                      {tc.priority}
                    </span>
                  </td>
                  <td className="p-3">
                    {tc.sourceRequirementKey ? (
                      <span
                        onClick={e => {
                          e.stopPropagation();
                          if (tc.sourceRequirementId && onNavigateToRequirement) {
                            onNavigateToRequirement(tc.sourceRequirementId);
                          }
                        }}
                        className="font-mono text-indigo-300 hover:underline cursor-pointer"
                      >
                        {tc.sourceRequirementKey}
                      </span>
                    ) : (
                      <span className="text-slate-600 italic">None</span>
                    )}
                  </td>
                  <td className="p-3 text-center text-[11px] text-slate-400">
                    <span title="Steps">{tc.stepCount} steps</span> •{' '}
                    <span title="Preconditions">{tc.preconditionCount} prec</span>
                  </td>
                  <td className="p-3 text-slate-500 text-[11px]">
                    {new Date(tc.createdAt).toLocaleDateString()}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleOpenDetail(tc.id);
                      }}
                      className="rounded bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-indigo-600 hover:text-white transition"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-400">
                  {loading ? (
                    'Loading test cases...'
                  ) : (
                    <div className="space-y-1">
                      <p className="font-medium text-slate-300">No test cases found</p>
                      <p className="text-xs text-slate-500">
                        Generate specifications for requirements and persist them as canonical Test
                        Cases.
                      </p>
                    </div>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {total > pageSize && (
          <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950 px-4 py-2 text-xs text-slate-400">
            <div>
              Showing {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} of {total}
            </div>
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40"
              >
                Prev
              </button>
              <span className="px-2 font-mono">Page {page}</span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page * pageSize >= total}
                className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedTestCase && (
        <TestCaseDetailModal
          testCase={selectedTestCase}
          onClose={() => setSelectedTestCase(null)}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
};
