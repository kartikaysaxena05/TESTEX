/**
 * @file apps/desktop/src/renderer/features/coverage/TraceabilityMatrixView.tsx
 * Forward Requirement Traceability Matrix (RTM) interactive table with filtering, search,
 * dimension tags, and deep-drilldown drawer.
 */

import React, { useState } from 'react';
import type {
  CoverageDimension,
  RequirementCoverageStatus,
  TraceabilityMatrixRowDto,
} from '@ai-quality/contracts';
import { Card, Badge, Input, Select, Button, Table } from '../../ui/index.js';

interface TraceabilityMatrixViewProps {
  readonly rows: readonly TraceabilityMatrixRowDto[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly isLoading?: boolean;
  readonly search: string;
  readonly statusFilter: RequirementCoverageStatus | '';
  readonly missingDimensionFilter: CoverageDimension | '';
  readonly onSearchChange: (val: string) => void;
  readonly onStatusFilterChange: (val: RequirementCoverageStatus | '') => void;
  readonly onMissingDimensionFilterChange: (val: CoverageDimension | '') => void;
  readonly onPageChange: (newPage: number) => void;
  readonly onRefresh: () => void;
}

export function TraceabilityMatrixView({
  rows,
  total,
  page,
  pageSize,
  isLoading = false,
  search,
  statusFilter,
  missingDimensionFilter,
  onSearchChange,
  onStatusFilterChange,
  onMissingDimensionFilterChange,
  onPageChange,
  onRefresh,
}: TraceabilityMatrixViewProps): React.JSX.Element {
  const [expandedReqId, setExpandedReqId] = useState<string | null>(null);

  const totalPages = Math.ceil(total / pageSize) || 1;

  const toggleExpand = (reqId: string) => {
    setExpandedReqId(prev => (prev === reqId ? null : reqId));
  };

  const getStatusBadge = (status: RequirementCoverageStatus): React.JSX.Element => {
    switch (status) {
      case 'COVERED':
        return <Badge variant="success">COVERED</Badge>;
      case 'PARTIALLY_COVERED':
        return <Badge variant="warning">PARTIAL</Badge>;
      case 'UNCOVERED':
        return <Badge variant="danger">UNCOVERED</Badge>;
      case 'NOT_APPLICABLE':
        return <Badge variant="neutral">N/A</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Header */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-4 bg-card border rounded-lg shadow-sm">
        <div className="flex-1 min-w-[240px]">
          <Input
            placeholder="Search by requirement key, title, or text..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="w-full text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <div className="w-40">
            <Select
              value={statusFilter}
              onChange={e => onStatusFilterChange(e.target.value as RequirementCoverageStatus | '')}
              className="text-xs"
            >
              <option value="">All Statuses</option>
              <option value="COVERED">Covered</option>
              <option value="PARTIALLY_COVERED">Partially Covered</option>
              <option value="UNCOVERED">Uncovered</option>
              <option value="NOT_APPLICABLE">Not Applicable</option>
            </Select>
          </div>

          {/* Missing Dimension Filter */}
          <div className="w-44">
            <Select
              value={missingDimensionFilter}
              onChange={e => onMissingDimensionFilterChange(e.target.value as CoverageDimension | '')}
              className="text-xs"
            >
              <option value="">All Missing Dimensions</option>
              <option value="POSITIVE">Missing Positive</option>
              <option value="NEGATIVE">Missing Negative</option>
              <option value="BOUNDARY">Missing Boundary</option>
              <option value="VALIDATION">Missing Validation</option>
              <option value="SECURITY">Missing Security</option>
            </Select>
          </div>

          <Button variant="secondary" size="sm" onClick={onRefresh} disabled={isLoading} className="text-xs">
            ↻ Refresh
          </Button>
        </div>
      </div>

      {/* Main RTM Table */}
      <Card className="overflow-hidden border shadow-sm">
        <div className="overflow-x-auto">
          <Table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="p-3 text-left font-semibold w-10" />
                <th className="p-3 text-left font-semibold">Requirement</th>
                <th className="p-3 text-left font-semibold w-24">Priority</th>
                <th className="p-3 text-left font-semibold w-28">Status</th>
                <th className="p-3 text-left font-semibold w-28">Coverage %</th>
                <th className="p-3 text-left font-semibold">Required Dimensions</th>
                <th className="p-3 text-left font-semibold">Covered Dimensions</th>
                <th className="p-3 text-left font-semibold w-24">Tests</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    {isLoading ? 'Loading Traceability Matrix...' : 'No requirements match the selected filters.'}
                  </td>
                </tr>
              ) : (
                rows.map(row => {
                  const isExpanded = expandedReqId === row.requirementId;
                  return (
                    <React.Fragment key={row.requirementId}>
                      <tr
                        onClick={() => toggleExpand(row.requirementId)}
                        className={`hover:bg-muted/40 cursor-pointer transition-colors ${
                          isExpanded ? 'bg-muted/30 font-medium' : ''
                        }`}
                      >
                        <td className="p-3 text-center text-muted-foreground">
                          {isExpanded ? '▼' : '▶'}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-primary">
                              {row.requirementKey}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              v{row.requirementVersion}
                            </span>
                          </div>
                          <div className="text-foreground line-clamp-1 mt-0.5">
                            {row.requirementTitle}
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge variant="neutral" className="text-[10px]">
                            {row.requirementPriority}
                          </Badge>
                        </td>
                        <td className="p-3">{getStatusBadge(row.coverageStatus)}</td>
                        <td className="p-3">
                          {row.coveragePercentage !== null ? (
                            <div className="space-y-1">
                              <span className="font-bold">{row.coveragePercentage}%</span>
                              <div className="w-16 bg-muted rounded-full h-1 overflow-hidden">
                                <div
                                  className="bg-primary h-1 rounded-full"
                                  style={{ width: `${Math.min(100, row.coveragePercentage)}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {row.requiredDimensions.length > 0 ? (
                              row.requiredDimensions.map(d => (
                                <span
                                  key={d}
                                  className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono"
                                >
                                  {d}
                                </span>
                              ))
                            ) : (
                              <span className="text-muted-foreground text-[11px]">—</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {row.coveredDimensions.map(d => (
                              <span
                                key={d}
                                className="px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[10px] font-semibold"
                              >
                                {d}
                              </span>
                            ))}
                            {row.missingDimensions.map(d => (
                              <span
                                key={d}
                                className="px-1 py-0.5 rounded bg-rose-500/10 text-rose-600 border border-rose-500/20 text-[10px] line-through font-semibold"
                              >
                                {d}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="text-xs">
                            <span className="font-bold text-foreground">{row.eligibleTestCount}</span>
                            <span className="text-muted-foreground"> / {row.totalLinkedTestCount}</span>
                          </div>
                          {row.staleTestCount > 0 && (
                            <span className="text-[10px] text-amber-500 block">
                              {row.staleTestCount} stale
                            </span>
                          )}
                          {row.rejectedTestCount > 0 && (
                            <span className="text-[10px] text-rose-500 block">
                              {row.rejectedTestCount} rejected
                            </span>
                          )}
                        </td>
                      </tr>

                      {/* Expandable Drilldown Drawer */}
                      {isExpanded && (
                        <tr className="bg-muted/10">
                          <td colSpan={8} className="p-4 border-b">
                            <div className="space-y-3 bg-card p-4 rounded-lg border">
                              <div className="flex items-center justify-between">
                                <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                  Linked Test Cases ({row.linkedTests.length})
                                </h5>
                                <span className="text-xs text-muted-foreground">
                                  Requirement Version: v{row.requirementVersion} (Current: v
                                  {row.currentRequirementVersion})
                                </span>
                              </div>

                              {row.linkedTests.length === 0 ? (
                                <div className="p-4 text-center text-muted-foreground text-xs bg-muted/30 rounded border border-dashed">
                                  No test cases are currently linked to this requirement.
                                </div>
                              ) : (
                                <div className="divide-y border rounded overflow-hidden">
                                  {row.linkedTests.map(lt => (
                                    <div
                                      key={lt.traceId}
                                      className="p-2.5 flex items-center justify-between text-xs hover:bg-muted/30"
                                    >
                                      <div className="space-y-0.5">
                                        <div className="flex items-center gap-2">
                                          <span className="font-mono font-bold text-primary">
                                            {lt.testCaseKey}
                                          </span>
                                          <Badge variant="neutral" className="text-[10px]">
                                            {lt.testCaseType}
                                          </Badge>
                                          <Badge variant="neutral" className="text-[10px]">
                                            {lt.testCasePriority}
                                          </Badge>
                                          {lt.isStale && (
                                            <Badge variant="warning" className="text-[10px]">
                                              STALE ({lt.staleReason || 'v-lag'})
                                            </Badge>
                                          )}
                                          {lt.isValidationRejected && (
                                            <Badge variant="danger" className="text-[10px]">
                                              REJECTED
                                            </Badge>
                                          )}
                                        </div>
                                        <div className="text-foreground font-medium">
                                          {lt.testCaseTitle}
                                        </div>
                                      </div>

                                      <div className="text-right text-[11px] text-muted-foreground">
                                        <div>Linked at v{lt.requirementVersionNumber}</div>
                                        <div className="font-mono">{lt.traceOrigin}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </Table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between p-3 border-t bg-muted/20 text-xs text-muted-foreground">
          <div>
            Showing {rows.length > 0 ? (page - 1) * pageSize + 1 : 0} to{' '}
            {Math.min(page * pageSize, total)} of {total} requirements
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1 || isLoading}
              onClick={() => onPageChange(page - 1)}
              className="text-xs"
            >
              Previous
            </Button>
            <span>
              Page {page} of {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages || isLoading}
              onClick={() => onPageChange(page + 1)}
              className="text-xs"
            >
              Next
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
