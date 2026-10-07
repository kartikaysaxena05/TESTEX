/**
 * @file apps/desktop/src/renderer/features/coverage/ReverseTraceabilityView.tsx
 * Reverse Traceability table (Test Case -> Requirements) with orphan test filtering and staleness alerts.
 */

import React from 'react';
import type { ReverseTraceabilityItemDto } from '@ai-quality/contracts';
import { Card, Badge, Input, Checkbox, Button, Table } from '../../ui/index.js';

interface ReverseTraceabilityViewProps {
  readonly items: readonly ReverseTraceabilityItemDto[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalOrphans: number;
  readonly search: string;
  readonly orphansOnly: boolean;
  readonly isLoading?: boolean;
  readonly onSearchChange: (val: string) => void;
  readonly onOrphansOnlyToggle: (val: boolean) => void;
  readonly onPageChange: (newPage: number) => void;
  readonly onRefresh: () => void;
}

export function ReverseTraceabilityView({
  items,
  total,
  page,
  pageSize,
  totalOrphans,
  search,
  orphansOnly,
  isLoading = false,
  onSearchChange,
  onOrphansOnlyToggle,
  onPageChange,
  onRefresh,
}: ReverseTraceabilityViewProps): React.JSX.Element {
  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div className="space-y-4">
      {/* Filters & Actions */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-4 bg-card border rounded-lg shadow-sm">
        <div className="flex-1 min-w-[240px]">
          <Input
            placeholder="Search test cases by key, title, or objective..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="w-full text-xs"
          />
        </div>

        <div className="flex items-center gap-4">
          <Checkbox
            label={`Orphan Tests Only (${totalOrphans})`}
            checked={orphansOnly}
            onChange={e => onOrphansOnlyToggle(e.target.checked)}
          />

          <Button variant="secondary" size="sm" onClick={onRefresh} disabled={isLoading} className="text-xs">
            ↻ Refresh
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <Card className="overflow-hidden border shadow-sm">
        <div className="overflow-x-auto">
          <Table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="p-3 text-left font-semibold">Test Case</th>
                <th className="p-3 text-left font-semibold w-24">Type</th>
                <th className="p-3 text-left font-semibold w-24">Priority</th>
                <th className="p-3 text-left font-semibold w-24">Status</th>
                <th className="p-3 text-left font-semibold">Linked Requirements</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    {isLoading ? 'Loading reverse traceability...' : 'No test cases match the selected filters.'}
                  </td>
                </tr>
              ) : (
                items.map(item => (
                  <tr key={item.testCaseId} className="hover:bg-muted/30">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-primary">
                          {item.testCaseKey}
                        </span>
                        {item.isOrphan && (
                          <Badge variant="warning" className="text-[10px]">
                            ORPHAN (0 REQS)
                          </Badge>
                        )}
                      </div>
                      <div className="text-foreground line-clamp-1 mt-0.5 font-medium">
                        {item.testCaseTitle}
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge variant="neutral" className="text-[10px]">
                        {item.testCaseType}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant="neutral" className="text-[10px]">
                        {item.testCasePriority}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant="neutral" className="text-[10px]">
                        {item.testCaseStatus}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {item.linkedRequirements.length === 0 ? (
                        <span className="text-muted-foreground italic text-[11px]">
                          No requirement links. This test is untraced.
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {item.linkedRequirements.map(lr => (
                            <div
                              key={lr.traceId}
                              className={`p-1.5 rounded border text-[11px] flex items-center gap-1.5 ${
                                lr.isStale
                                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
                                  : 'bg-muted/40 border-muted text-foreground'
                              }`}
                            >
                              <span className="font-mono font-bold">{lr.requirementKey}</span>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                v{lr.requirementVersionNumber}
                              </span>
                              {lr.isStale && (
                                <span className="text-[9px] font-bold uppercase bg-amber-500/20 px-1 rounded text-amber-600">
                                  STALE
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between p-3 border-t bg-muted/20 text-xs text-muted-foreground">
          <div>
            Showing {items.length > 0 ? (page - 1) * pageSize + 1 : 0} to{' '}
            {Math.min(page * pageSize, total)} of {total} test cases
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
