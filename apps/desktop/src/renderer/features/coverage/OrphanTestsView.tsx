/**
 * @file apps/desktop/src/renderer/features/coverage/OrphanTestsView.tsx
 * Dedicated Orphan Tests Audit view listing untraced test cases that have 0 requirement links.
 */

import React from 'react';
import type { OrphanTestCaseDto } from '@ai-quality/contracts';
import { Card, Badge, Button, Table } from '../../ui/index.js';

interface OrphanTestsViewProps {
  readonly orphans: readonly OrphanTestCaseDto[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly isLoading?: boolean;
  readonly onPageChange: (newPage: number) => void;
  readonly onRefresh: () => void;
}

export function OrphanTestsView({
  orphans,
  total,
  page,
  pageSize,
  isLoading = false,
  onPageChange,
  onRefresh,
}: OrphanTestsViewProps): React.JSX.Element {
  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div className="space-y-4">
      {/* Informational Alert Header */}
      <Card className="p-4 bg-amber-500/5 border border-amber-500/20 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 text-amber-600 rounded-full font-bold">⚠</div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                Orphan Test Cases Audit ({total})
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                These test cases exist in the project repository but have no validated traceability link to any Requirement.
              </p>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={onRefresh} disabled={isLoading} className="text-xs">
            ↻ Refresh Audit
          </Button>
        </div>
      </Card>

      {/* Orphans Table */}
      <Card className="overflow-hidden border shadow-sm">
        <div className="overflow-x-auto">
          <Table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="p-3 text-left font-semibold">Test Case</th>
                <th className="p-3 text-left font-semibold w-28">Type</th>
                <th className="p-3 text-left font-semibold w-24">Priority</th>
                <th className="p-3 text-left font-semibold w-24">Status</th>
                <th className="p-3 text-left font-semibold w-32">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orphans.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    {isLoading ? 'Checking for orphan test cases...' : '🎉 No orphan test cases found! All project test cases are traced to requirements.'}
                  </td>
                </tr>
              ) : (
                orphans.map(tc => (
                  <tr key={tc.id} className="hover:bg-muted/30">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-primary">{tc.key}</span>
                        <Badge variant="warning" className="text-[10px]">
                          UNTRACED
                        </Badge>
                      </div>
                      <div className="text-foreground line-clamp-1 mt-0.5 font-medium">
                        {tc.title}
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge variant="neutral" className="text-[10px]">
                        {tc.type}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant="neutral" className="text-[10px]">
                        {tc.priority}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant="neutral" className="text-[10px]">
                        {tc.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {new Date(tc.createdAt).toLocaleDateString()}
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
            Showing {orphans.length > 0 ? (page - 1) * pageSize + 1 : 0} to{' '}
            {Math.min(page * pageSize, total)} of {total} orphan test cases
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
