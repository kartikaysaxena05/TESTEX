/**
 * @file apps/desktop/src/renderer/features/file-review/FileReviewWorkspace.tsx
 * Codex-style File & Diff Review Workspace for V10 Phase 156.
 */

import React, { useState } from 'react';
import type { FileReviewStatus } from '@ai-quality/contracts';
import { Badge, Button, Textarea } from '../../ui/index.js';
import { DiffViewer } from './DiffViewer.js';
import { FileViewer } from './FileViewer.js';
import { useFileReview, type UseFileReviewResult } from './useFileReview.js';

export interface FileReviewWorkspaceProps {
  readonly projectId: string;
  readonly threadId?: string;
  readonly taskId?: string;
  readonly taskTitle?: string;
  readonly threadTitle?: string;
  readonly initialReviewId?: string;
  readonly onClose?: () => void;
  readonly className?: string;
  readonly hookOverride?: UseFileReviewResult;
}

function getStatusBadgeVariant(
  status: FileReviewStatus,
): 'warning' | 'success' | 'danger' | 'info' | 'neutral' {
  switch (status) {
    case 'PENDING_REVIEW':
      return 'warning';
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
      return 'danger';
    case 'APPLIED':
      return 'info';
    case 'CANCELLED':
      return 'neutral';
    default:
      return 'neutral';
  }
}

function getStatusLabel(status: FileReviewStatus): string {
  switch (status) {
    case 'PENDING_REVIEW':
      return 'Pending Review';
    case 'APPROVED':
      return 'Approved';
    case 'REJECTED':
      return 'Rejected';
    case 'APPLIED':
      return 'Applied';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status;
  }
}

export function FileReviewWorkspace({
  projectId,
  threadId,
  taskId,
  taskTitle,
  threadTitle,
  initialReviewId,
  onClose,
  className = '',
  hookOverride,
}: FileReviewWorkspaceProps): React.JSX.Element {
  const defaultHook = useFileReview({
    projectId,
    threadId,
    taskId,
    initialReviewId,
  });

  const {
    reviews,
    activeReview,
    selectedFile,
    viewMode,
    fileContent,
    isLoading,
    isSubmitting,
    isFileLoading,
    error,
    fileError,
    setActiveReviewId,
    setSelectedFile,
    setViewMode,
    approveReview,
    rejectReview,
    cancelReview,
    applyReview,
  } = hookOverride ?? defaultHook;

  const [reasonInput, setReasonInput] = useState('');
  const [showReasonBox, setShowReasonBox] = useState(false);
  const [fileSearchQuery, setFileSearchQuery] = useState('');

  const currentStatus = activeReview?.status ?? 'PENDING_REVIEW';
  const isPending = currentStatus === 'PENDING_REVIEW';
  const isApproved = currentStatus === 'APPROVED';
  const isApplied = currentStatus === 'APPLIED';
  const isDecided = currentStatus === 'REJECTED' || currentStatus === 'CANCELLED';

  const handleApprove = async () => {
    await approveReview(reasonInput.trim() || undefined);
    setReasonInput('');
    setShowReasonBox(false);
  };

  const handleReject = async () => {
    if (!showReasonBox) {
      setShowReasonBox(true);
      return;
    }
    await rejectReview(reasonInput.trim() || undefined);
    setReasonInput('');
    setShowReasonBox(false);
  };

  const handleCancel = async () => {
    await cancelReview(reasonInput.trim() || undefined);
    setReasonInput('');
    setShowReasonBox(false);
  };

  const handleApply = async () => {
    await applyReview();
  };

  const filteredFiles = activeReview
    ? activeReview.affectedFiles.filter(f =>
        f.toLowerCase().includes(fileSearchQuery.toLowerCase()),
      )
    : [];

  return (
    <div
      className={`flex flex-col h-full bg-neutral-950 text-neutral-100 rounded-lg border border-neutral-800 shadow-xl overflow-hidden font-sans ${className}`}
      data-testid="file-diff-review-workspace"
    >
      {/* 1. TOP BAR: Task/Thread Context & Review Status */}
      <div className="flex flex-wrap items-center justify-between px-5 py-3 bg-neutral-900 border-b border-neutral-800 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 flex items-center justify-center font-bold text-sm shrink-0">
            Δ
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2
                className="text-sm font-bold text-neutral-100 truncate"
                data-testid="review-workspace-title"
              >
                {activeReview?.title ?? taskTitle ?? 'Code Change Review'}
              </h2>
              {activeReview && (
                <Badge
                  variant={getStatusBadgeVariant(activeReview.status)}
                  className="font-semibold text-[10px]"
                  data-testid="review-status-badge"
                >
                  {getStatusLabel(activeReview.status)}
                </Badge>
              )}
            </div>
            <p className="text-xs text-neutral-400 truncate" title={activeReview?.description}>
              {activeReview?.description ||
                (threadTitle ? `Thread: ${threadTitle}` : 'Review proposed agent patch')}
            </p>
          </div>
        </div>

        {/* Checksum & Close */}
        <div className="flex items-center gap-3">
          {activeReview && (
            <div
              className="text-[11px] font-mono text-neutral-400 bg-neutral-950 px-2.5 py-1 rounded border border-neutral-800 hidden sm:flex items-center gap-1.5"
              title={`SHA-256 Checksum: ${activeReview.diffChecksum}`}
              data-testid="review-checksum-badge"
            >
              <span className="text-neutral-500">SHA:</span>
              <span>{activeReview.diffChecksum.substring(0, 10)}…</span>
            </div>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
              title="Close Workspace"
              data-testid="btn-close-workspace"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div
          className="px-5 py-2.5 bg-red-950/40 border-b border-red-500/30 text-xs text-red-300 flex items-center justify-between"
          data-testid="review-error-banner"
        >
          <span>{error}</span>
        </div>
      )}

      {/* MAIN WORKSPACE SPLIT (Left: Files List, Center: Diff/File Viewer, Right/Bottom: Controls) */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* LEFT PANEL: Changed Files List */}
        <div className="w-full md:w-64 lg:w-72 bg-neutral-900/60 border-b md:border-b-0 md:border-r border-neutral-800 flex flex-col shrink-0">
          <div className="p-3 border-b border-neutral-800">
            <div className="flex items-center justify-between text-xs text-neutral-300 font-semibold mb-2">
              <span>Changed Files ({activeReview?.affectedFiles.length ?? 0})</span>
            </div>
            <input
              type="text"
              placeholder="Filter files..."
              value={fileSearchQuery}
              onChange={e => setFileSearchQuery(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1 text-xs text-neutral-200 outline-none focus:border-cyan-500/50"
              data-testid="input-filter-files"
            />
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-neutral-900/40 p-1">
            {isLoading ? (
              <div className="p-4 text-xs text-neutral-500 text-center">Loading files...</div>
            ) : filteredFiles.length === 0 ? (
              <div className="p-4 text-xs text-neutral-500 text-center">
                {activeReview ? 'No matching files.' : 'No active review selected.'}
              </div>
            ) : (
              filteredFiles.map(filePath => {
                const isSelected = selectedFile === filePath;
                return (
                  <button
                    key={filePath}
                    type="button"
                    onClick={() => setSelectedFile(filePath)}
                    className={`w-full text-left px-3 py-2 rounded text-xs transition-colors flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-cyan-950/30 text-cyan-200 border-l-2 border-cyan-400 font-medium'
                        : 'text-neutral-300 hover:bg-neutral-800/50'
                    }`}
                    data-testid={`file-item-${filePath}`}
                  >
                    <span className="font-mono truncate text-[11px]" title={filePath}>
                      {filePath}
                    </span>
                    <span className="text-[10px] text-neutral-500 shrink-0">Δ</span>
                  </button>
                );
              })
            )}
          </div>

          {/* Multiple Reviews Selector (if task has multiple proposals) */}
          {reviews.length > 1 && (
            <div className="p-2 border-t border-neutral-800 bg-neutral-950/40">
              <span className="text-[10px] text-neutral-400 uppercase font-semibold block mb-1">
                Reviews ({reviews.length})
              </span>
              <select
                value={activeReview?.id ?? ''}
                onChange={e => setActiveReviewId(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 text-neutral-300 text-xs rounded px-2 py-1 outline-none"
                data-testid="reviews-list-dropdown"
              >
                {reviews.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.title} ({r.status})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* CENTER PANEL: Diff / File Viewer */}
        <div className="flex-1 flex flex-col min-w-0 bg-neutral-950">
          {/* Mode Tabs: Diff vs File */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800 bg-neutral-900/40">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode('diff')}
                className={`text-xs px-3 py-1 rounded transition-colors font-medium ${
                  viewMode === 'diff'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
                data-testid="tab-view-diff"
              >
                Proposed Diff
              </button>
              <button
                type="button"
                onClick={() => setViewMode('file')}
                className={`text-xs px-3 py-1 rounded transition-colors font-medium ${
                  viewMode === 'file'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
                data-testid="tab-view-file"
              >
                Project File Inspector (Read-Only)
              </button>
            </div>

            <div className="text-[11px] text-neutral-500 font-mono">
              {viewMode === 'diff' ? 'Unified / Split Review' : 'Safe Read-Only View'}
            </div>
          </div>

          {/* Viewer Area */}
          <div className="flex-1 p-3 overflow-hidden">
            {viewMode === 'diff' ? (
              <DiffViewer
                diffText={activeReview?.originalDiff ?? ''}
                selectedFilePath={selectedFile ?? undefined}
                onSelectFile={setSelectedFile}
                className="h-full"
              />
            ) : (
              <FileViewer
                fileContent={fileContent}
                isLoading={isFileLoading}
                error={fileError}
                className="h-full"
              />
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Review & Approval Controls */}
        <div className="w-full md:w-72 lg:w-80 bg-neutral-900/80 border-t md:border-t-0 md:border-l border-neutral-800 p-4 flex flex-col justify-between shrink-0">
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-neutral-200 uppercase tracking-wider mb-1">
                Review Decision Gate
              </h3>
              <p className="text-[11px] text-neutral-400">
                {isPending
                  ? 'Inspect all changes before authorizing patch application.'
                  : isApproved
                    ? 'Patch is approved and ready to be applied to workspace.'
                    : isApplied
                      ? 'Patch has been successfully applied to the workspace.'
                      : 'Review has been decided.'}
              </p>
            </div>

            {/* Optional Reason / Comment Box */}
            {(showReasonBox || isPending) && (
              <div className="space-y-1.5" data-testid="decision-reason-box">
                <label className="text-[11px] font-medium text-neutral-300">
                  Decision Comment / Rejection Reason
                </label>
                <Textarea
                  value={reasonInput}
                  onChange={e => setReasonInput(e.target.value)}
                  placeholder="Optional comment or rejection instructions..."
                  rows={2}
                  className="w-full text-xs bg-neutral-950 border-neutral-800 text-neutral-200"
                  data-testid="input-decision-reason"
                />
              </div>
            )}

            {/* Decision Controls: Approve, Reject, Cancel */}
            <div className="space-y-2 pt-2">
              <Button
                variant="primary"
                onClick={handleApprove}
                disabled={!isPending || isSubmitting}
                className="w-full justify-center bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs"
                data-testid="btn-approve-review"
              >
                {isSubmitting ? 'Processing...' : 'Approve Proposed Changes'}
              </Button>

              <Button
                variant="danger"
                onClick={handleReject}
                disabled={!isPending || isSubmitting}
                className="w-full justify-center text-xs"
                data-testid="btn-reject-review"
              >
                Reject Changes
              </Button>

              <Button
                variant="secondary"
                onClick={handleCancel}
                disabled={isApplied || isDecided || isSubmitting}
                className="w-full justify-center text-xs"
                data-testid="btn-cancel-review"
              >
                Cancel Review
              </Button>
            </div>

            {/* APPLY BUTTON (Strictly enabled ONLY when APPROVED) */}
            <div className="pt-3 border-t border-neutral-800">
              <Button
                variant="primary"
                onClick={handleApply}
                disabled={!isApproved || isSubmitting}
                className={`w-full justify-center text-xs font-semibold ${
                  isApproved
                    ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
                    : 'bg-neutral-800 text-neutral-500 cursor-not-allowed opacity-60'
                }`}
                data-testid="btn-apply-review"
              >
                {isApplied
                  ? '✓ Patch Already Applied'
                  : isSubmitting
                    ? 'Applying...'
                    : 'Apply Patch to Workspace'}
              </Button>
              {!isApproved && !isApplied && (
                <p className="text-[10px] text-amber-400/80 mt-1.5 text-center font-mono">
                  * Must approve review before changes can be applied.
                </p>
              )}
            </div>
          </div>

          {/* Audit Trail & Metadata Footer */}
          {activeReview && (
            <div className="pt-4 border-t border-neutral-800 text-[11px] text-neutral-400 space-y-1 font-mono">
              <div>Review ID: {activeReview.id.substring(0, 8)}…</div>
              {activeReview.reviewedAt && (
                <div>Reviewed: {new Date(activeReview.reviewedAt).toLocaleTimeString()}</div>
              )}
              {activeReview.decisionReason && (
                <div className="text-neutral-300 italic">"{activeReview.decisionReason}"</div>
              )}
              {activeReview.appliedAt && (
                <div className="text-cyan-400">
                  Applied: {new Date(activeReview.appliedAt).toLocaleTimeString()} (
                  {activeReview.appliedCommit ?? 'commit'})
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
