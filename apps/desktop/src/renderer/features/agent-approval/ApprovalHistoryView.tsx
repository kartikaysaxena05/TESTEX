/**
 * @file apps/desktop/src/renderer/features/agent-approval/ApprovalHistoryView.tsx
 * Immutable approval history view for V10 Phase 155.
 */

import React from 'react';
import type { ApprovalRequestDto, ApprovalRiskLevel } from '@ai-quality/contracts';
import { Badge, EmptyState } from '../../ui/index.js';

export interface ApprovalHistoryViewProps {
  readonly history: readonly ApprovalRequestDto[];
  readonly isLoading?: boolean;
  readonly className?: string;
}

function getRiskBadgeVariant(risk: ApprovalRiskLevel): 'neutral' | 'warning' | 'danger' | 'info' {
  switch (risk) {
    case 'CRITICAL':
    case 'HIGH':
      return 'danger';
    case 'MEDIUM':
      return 'warning';
    case 'LOW':
    default:
      return 'neutral';
  }
}

function getStatusBadgeVariant(status: string): 'neutral' | 'success' | 'danger' | 'warning' {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
      return 'danger';
    case 'EXPIRED':
    case 'CANCELLED':
      return 'neutral';
    case 'PENDING':
    default:
      return 'warning';
  }
}

export function ApprovalHistoryView({
  history,
  isLoading = false,
  className = '',
}: ApprovalHistoryViewProps): React.JSX.Element {
  if (isLoading) {
    return (
      <div
        className="p-6 text-center text-xs text-neutral-400"
        data-testid="approval-history-loading"
      >
        Loading approval history...
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <EmptyState
        title="No Approval History"
        description="No sensitive operations requiring human approval have been requested for this task or thread."
        className="py-8"
        data-testid="approval-history-empty"
      />
    );
  }

  return (
    <div className={`space-y-3 ${className}`} data-testid="approval-history-view">
      <div className="flex items-center justify-between pb-1 border-b border-neutral-800">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          {`Approval Decisions & Audit History (${history.length})`}
        </h4>
        <span className="text-[10px] text-neutral-500 font-mono">Immutable Record</span>
      </div>

      <div className="space-y-2.5">
        {history.map(item => {
          const isDecided = item.status !== 'PENDING';
          return (
            <div
              key={item.id}
              className="p-3.5 rounded-lg border border-neutral-800 bg-neutral-950/60 text-xs space-y-2"
              data-testid={`approval-history-item-${item.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-neutral-200">{item.title}</span>
                    <Badge variant={getRiskBadgeVariant(item.riskLevel)} className="text-[9px]">
                      {item.riskLevel}
                    </Badge>
                    <span className="text-[10px] text-neutral-400 font-mono">
                      {item.approvalType}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-neutral-400 break-all block">
                    {item.requestedAction}
                  </span>
                </div>

                <Badge
                  variant={getStatusBadgeVariant(item.status)}
                  className="text-[10px] shrink-0"
                  data-testid="history-item-status"
                >
                  {item.status}
                </Badge>
              </div>

              {/* Timestamp & Decision Audit Details */}
              <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-400 pt-1 border-t border-neutral-800/60">
                <div>
                  <span className="text-neutral-500">Requested: </span>
                  <span>{new Date(item.requestedAt).toLocaleString()}</span>
                </div>
                {item.respondedAt && (
                  <div>
                    <span className="text-neutral-500">Decided: </span>
                    <span>{new Date(item.respondedAt).toLocaleString()}</span>
                  </div>
                )}
                {item.respondedBy && (
                  <div>
                    <span className="text-neutral-500">Responder: </span>
                    <span className="font-mono text-neutral-300">{item.respondedBy}</span>
                  </div>
                )}
                <div>
                  <span className="text-neutral-500">Action Hash: </span>
                  <span className="font-mono text-neutral-400 truncate block max-w-[150px]">
                    {item.actionHash}
                  </span>
                </div>
              </div>

              {/* Rejection / Decision Reason */}
              {item.responseReason && (
                <div className="p-2 rounded bg-neutral-900 border border-neutral-800 text-[11px] text-neutral-300">
                  <span className="text-neutral-400 font-medium">Decision note: </span>
                  {item.responseReason}
                </div>
              )}

              {/* Affected Files & Tools summary */}
              {item.affectedFiles.length > 0 && (
                <div className="text-[11px] text-neutral-400 flex flex-wrap gap-1 items-center">
                  <span className="text-neutral-500">Affected files: </span>
                  {item.affectedFiles.map((file, idx) => (
                    <span
                      key={idx}
                      className="px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800 font-mono text-[10px] text-neutral-300"
                    >
                      {file}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
