/**
 * @file apps/desktop/src/renderer/features/agent-approval/HumanApprovalCard.tsx
 * Codex-style Human Approval Gate Card for V10 Phase 155.
 */

import React, { useState } from 'react';
import type { ApprovalRequestDto, ApprovalRiskLevel } from '@ai-quality/contracts';
import { Badge, Button, Textarea } from '../../ui/index.js';

export interface HumanApprovalCardProps {
  readonly approval: ApprovalRequestDto;
  readonly onApprove: (approvalId: string) => Promise<void> | void;
  readonly onReject: (approvalId: string, reason?: string) => Promise<void> | void;
  readonly onCancelTask?: (approvalId: string) => Promise<void> | void;
  readonly onReviewChanges?: (approval: ApprovalRequestDto) => void;
  readonly isSubmitting?: boolean;
  readonly className?: string;
}

function getRiskBadgeVariant(risk: ApprovalRiskLevel): 'neutral' | 'warning' | 'danger' | 'info' {
  switch (risk) {
    case 'CRITICAL':
      return 'danger';
    case 'HIGH':
      return 'danger';
    case 'MEDIUM':
      return 'warning';
    case 'LOW':
    default:
      return 'neutral';
  }
}

function getStatusBadgeLabel(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'Awaiting approval';
    case 'APPROVED':
      return 'Approved';
    case 'REJECTED':
      return 'Rejected';
    case 'EXPIRED':
      return 'Expired';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status;
  }
}

export function HumanApprovalCard({
  approval,
  onApprove,
  onReject,
  onCancelTask,
  onReviewChanges,
  isSubmitting = false,
  className = '',
}: HumanApprovalCardProps): React.JSX.Element {
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectionInput, setShowRejectionInput] = useState(false);

  const isPending = approval.status === 'PENDING';
  const isDestructive =
    approval.riskLevel === 'CRITICAL' ||
    approval.approvalType === 'FILE_DELETE' ||
    approval.approvalType === 'RELEASE_ACTION';

  const handleRejectClick = () => {
    if (
      !showRejectionInput &&
      (approval.riskLevel === 'HIGH' || approval.riskLevel === 'CRITICAL')
    ) {
      setShowRejectionInput(true);
      return;
    }
    onReject(approval.id, rejectionReason.trim() || undefined);
  };

  return (
    <div
      className={`rounded-lg border bg-neutral-900 text-neutral-100 overflow-hidden shadow-md transition-all ${
        isPending
          ? isDestructive
            ? 'border-red-500/70 bg-red-950/20'
            : 'border-amber-500/60 bg-amber-950/20'
          : 'border-neutral-800 bg-neutral-900/60'
      } ${className}`}
      data-testid={`approval-card-${approval.id}`}
    >
      {/* Top Banner / Status Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-950/60">
        <div className="flex items-center gap-2.5">
          <span
            className={`font-semibold text-xs tracking-wider uppercase ${
              isPending
                ? isDestructive
                  ? 'text-red-400 font-bold'
                  : 'text-amber-400'
                : 'text-neutral-400'
            }`}
          >
            {isPending ? 'Human Approval Required' : 'Approval Gate Decision'}
          </span>
          <Badge variant={getRiskBadgeVariant(approval.riskLevel)} className="text-[10px]">
            {`${approval.riskLevel} RISK`}
          </Badge>
          <span className="text-[10px] text-neutral-400 font-mono">{approval.approvalType}</span>
        </div>

        <Badge
          variant={
            approval.status === 'APPROVED'
              ? 'success'
              : approval.status === 'PENDING'
                ? 'warning'
                : 'danger'
          }
          className="text-[11px]"
          data-testid="approval-status-badge"
        >
          {getStatusBadgeLabel(approval.status)}
        </Badge>
      </div>

      <div className="p-4 space-y-3.5">
        {/* Destructive Action Warning */}
        {isDestructive && isPending && (
          <div
            className="p-2.5 rounded bg-red-950/50 border border-red-500/40 text-red-200 text-xs flex items-center gap-2"
            data-testid="approval-destructive-warning"
          >
            <span className="font-bold text-red-400">Destructive Action Warning:</span>
            <span>
              This operation may permanently delete files or modify core production data. Review
              details thoroughly before approving.
            </span>
          </div>
        )}

        {/* Action Title & Why Approval is Required */}
        <div>
          <h3 className="text-sm font-semibold text-neutral-100" data-testid="approval-title">
            {approval.title}
          </h3>
          <p className="text-xs text-neutral-300 mt-1" data-testid="approval-reason">
            <span className="text-neutral-400 font-medium">Why required: </span>
            {approval.description ||
              'Agent requires human authorization to perform sensitive operations.'}
          </p>
        </div>

        {/* Tool & Command Details */}
        <div className="grid grid-cols-2 gap-2 text-xs bg-neutral-950/70 p-3 rounded border border-neutral-800/80">
          <div>
            <span className="text-neutral-500 block text-[11px]">Tool being used:</span>
            <span className="font-mono text-neutral-200" data-testid="approval-tool">
              {approval.affectedTools[0] || 'Autonomous Agent'}
            </span>
          </div>
          <div>
            <span className="text-neutral-500 block text-[11px]">Affected Project:</span>
            <span className="font-mono text-neutral-400 text-[11px]" data-testid="approval-project">
              {approval.projectId}
            </span>
          </div>
          <div className="col-span-2 pt-1 border-t border-neutral-800/60">
            <span className="text-neutral-500 block text-[11px]">Requested Action / Command:</span>
            <span
              className="font-mono text-amber-200 text-xs break-all"
              data-testid="approval-action"
            >
              {approval.requestedAction}
            </span>
          </div>
        </div>

        {/* Affected Files */}
        {approval.affectedFiles && approval.affectedFiles.length > 0 && (
          <div>
            <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wide block mb-1">
              {`Affected Files (${approval.affectedFiles.length})`}
            </span>
            <ul
              className="space-y-1 max-h-24 overflow-y-auto"
              data-testid="approval-affected-files"
            >
              {approval.affectedFiles.map((file, idx) => (
                <li
                  key={idx}
                  className="text-xs font-mono bg-neutral-950/60 px-2 py-1 rounded text-neutral-300 border border-neutral-800/60"
                >
                  {file}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Payload / Input Inspection */}
        {approval.requestedInput && Object.keys(approval.requestedInput).length > 0 && (
          <div>
            <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wide block mb-1">
              Parameters & Safe Payload
            </span>
            <pre className="text-[11px] font-mono bg-neutral-950/90 p-2.5 rounded text-neutral-300 max-h-28 overflow-y-auto border border-neutral-800/60">
              {JSON.stringify(approval.requestedInput, null, 2)}
            </pre>
          </div>
        )}

        {/* Decision reason for decided requests */}
        {approval.responseReason && (
          <div className="text-xs p-2 rounded bg-neutral-950 border border-neutral-800 text-neutral-300">
            <span className="text-neutral-500 font-medium">Decision note: </span>
            {approval.responseReason}
          </div>
        )}

        {/* Rejection input for pending requests */}
        {isPending && showRejectionInput && (
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-medium text-neutral-300">
              Reason for rejection (optional feedback for agent):
            </label>
            <Textarea
              value={rejectionReason}
              onChange={e => setRejectionReason(e.target.value)}
              placeholder="e.g. Do not delete production files, try alternative migration..."
              rows={2}
              className="text-xs bg-neutral-950"
              data-testid="approval-rejection-reason-input"
            />
          </div>
        )}

        {/* Action Buttons */}
        {isPending && (
          <div className="flex items-center justify-between pt-2 border-t border-neutral-800">
            {onCancelTask ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onCancelTask(approval.id)}
                disabled={isSubmitting}
                className="text-xs text-neutral-400 hover:text-neutral-200"
                data-testid="approval-cancel-task-btn"
              >
                Cancel Task
              </Button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              {onReviewChanges && (approval.approvalType === 'CODE_PATCH' || approval.approvalType === 'FILE_WRITE' || approval.affectedFiles.length > 0) && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onReviewChanges(approval)}
                  disabled={isSubmitting}
                  className="text-xs text-cyan-400 border border-cyan-500/30 hover:bg-cyan-950/40"
                  data-testid="approval-review-changes-btn"
                >
                  Review Changes
                </Button>
              )}
              <Button
                size="sm"
                variant="danger"
                onClick={handleRejectClick}
                disabled={isSubmitting}
                className="text-xs"
                data-testid="approval-reject-btn"
              >
                Reject
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => onApprove(approval.id)}
                disabled={isSubmitting}
                className="text-xs"
                data-testid="approval-approve-btn"
              >
                Approve
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
