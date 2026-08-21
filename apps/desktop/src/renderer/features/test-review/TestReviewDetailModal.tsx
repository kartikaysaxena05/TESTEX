/**
 * @file apps/desktop/src/renderer/features/test-review/TestReviewDetailModal.tsx
 * Full review, inspection, and action detail modal (Phase 56).
 */

import React, { useEffect, useState } from 'react';
import type { TestCaseRejectionReason, TestReviewDetailDto } from '@ai-quality/contracts';
import { ApproveModal, RegenerateModal, RejectModal } from './TestReviewActionModals.js';
import { TestCaseEditorModal } from './TestCaseEditorModal.js';
import { TestVersionHistoryModal } from './TestVersionHistoryModal.js';
import { TestVersionDiffModal } from './TestVersionDiffModal.js';

interface TestReviewDetailModalProps {
  readonly isOpen: boolean;
  readonly projectId: string;
  readonly testCaseId: string;
  readonly initialVersionNumber?: number;
  readonly onClose: () => void;
  readonly onUpdated?: () => void;
}

export const TestReviewDetailModal: React.FC<TestReviewDetailModalProps> = ({
  isOpen,
  projectId,
  testCaseId,
  initialVersionNumber,
  onClose,
  onUpdated,
}) => {
  const [detail, setDetail] = useState<TestReviewDetailDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);

  // Dialog states
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [isRegenerateOpen, setIsRegenerateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [diffParams, setDiffParams] = useState<{ fromVer: number; toVer: number } | null>(null);

  const fetchDetail = async (versionNum?: number) => {
    if (!window.desktop?.testReview) return;
    try {
      setLoading(true);
      setError(null);
      const res = await window.desktop.testReview.getDetail({
        projectId,
        testCaseId,
        versionNumber: versionNum,
      });
      if (res.ok) {
        setDetail(res.data);
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
    if (isOpen) {
      fetchDetail(initialVersionNumber);
    }
  }, [isOpen, projectId, testCaseId, initialVersionNumber]);

  if (!isOpen) return null;

  const handleApprove = async (comment?: string) => {
    if (!detail || !window.desktop?.testReview) return;
    try {
      setActionInProgress(true);
      const res = await window.desktop.testReview.approve({
        projectId,
        testCaseId,
        versionNumber: detail.activeVersion.versionNumber,
        comment,
      });
      if (res.ok) {
        setDetail(res.data);
        setIsApproveOpen(false);
        onUpdated?.();
      } else {
        alert(`Approval failed: ${res.error.message}`);
      }
    } finally {
      setActionInProgress(false);
    }
  };

  const handleReject = async (reason: TestCaseRejectionReason, comment?: string) => {
    if (!detail || !window.desktop?.testReview) return;
    try {
      setActionInProgress(true);
      const res = await window.desktop.testReview.reject({
        projectId,
        testCaseId,
        versionNumber: detail.activeVersion.versionNumber,
        rejectionReason: reason,
        comment,
      });
      if (res.ok) {
        setDetail(res.data);
        setIsRejectOpen(false);
        onUpdated?.();
      } else {
        alert(`Rejection failed: ${res.error.message}`);
      }
    } finally {
      setActionInProgress(false);
    }
  };

  const handleRegenerate = async (reason: string, reviewerInstructions?: string) => {
    if (!detail || !window.desktop?.testReview) return;
    try {
      setActionInProgress(true);
      const res = await window.desktop.testReview.regenerate({
        projectId,
        testCaseId,
        expectedVersionNumber: detail.activeVersion.versionNumber,
        reason,
        reviewerInstructions,
      });
      if (res.ok) {
        setDetail(res.data);
        setIsRegenerateOpen(false);
        onUpdated?.();
      } else {
        alert(`Regeneration failed: ${res.error.message}`);
      }
    } finally {
      setActionInProgress(false);
    }
  };

  const handleSaveEdit = async (editData: any) => {
    if (!window.desktop?.testReview) return;
    try {
      setActionInProgress(true);
      const res = await window.desktop.testReview.edit(editData);
      if (res.ok) {
        setDetail(res.data);
        setIsEditOpen(false);
        onUpdated?.();
      } else {
        alert(`Edit failed: ${res.error.message}`);
      }
    } finally {
      setActionInProgress(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-bold text-blue-400 bg-blue-950/60 border border-blue-800 px-2.5 py-1 rounded">
              {detail?.testCase.testCaseKey ?? '...'}
            </span>
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                {detail?.activeVersion.title ?? 'Test Case Review'}
              </h3>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                <span>Version v{detail?.activeVersion.versionNumber}</span>
                <span>•</span>
                <span
                  className={`font-semibold ${
                    detail?.activeVersion.sourceType === 'HUMAN_EDIT'
                      ? 'text-amber-400'
                      : detail?.activeVersion.sourceType === 'AI_REGENERATION'
                        ? 'text-indigo-400'
                        : 'text-blue-400'
                  }`}
                >
                  {detail?.activeVersion.sourceType}
                </span>
                <span>•</span>
                <span
                  className={`px-1.5 py-0.2 rounded font-bold text-[10px] ${
                    detail?.activeVersion.reviewStatus === 'APPROVED'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : detail?.activeVersion.reviewStatus === 'REJECTED'
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {detail?.activeVersion.reviewStatus}
                </span>
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsHistoryOpen(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition flex items-center gap-1"
            >
              ⏱ History ({detail?.versionsCount ?? 1})
            </button>
            <button
              type="button"
              onClick={() => setIsEditOpen(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition flex items-center gap-1"
            >
              ✏ Edit
            </button>
            <button
              type="button"
              onClick={() => setIsRegenerateOpen(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 border border-indigo-500/30 transition flex items-center gap-1"
            >
              ↻ Regenerate AI
            </button>
            <button
              type="button"
              onClick={() => setIsRejectOpen(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600/20 text-rose-300 hover:bg-rose-600/30 border border-rose-500/30 transition"
            >
              ✕ Reject
            </button>
            <button
              type="button"
              onClick={() => setIsApproveOpen(true)}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow transition"
            >
              ✓ Approve
            </button>
            <button
              type="button"
              onClick={onClose}
              className="ml-2 text-slate-400 hover:text-slate-200 text-lg leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading && (
            <div className="text-center py-12 text-xs text-slate-400">
              Loading test case review details...
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300">
              {error}
            </div>
          )}

          {!loading && !error && detail && (
            <>
              {/* Requirement Staleness Alert */}
              {detail.isRequirementStale && (
                <div className="p-4 bg-amber-950/40 border border-amber-800/80 rounded-xl flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center font-bold text-sm shrink-0">
                    ⚠
                  </div>
                  <div className="text-xs space-y-1">
                    <div className="font-semibold text-amber-200">
                      Requirement Version Advanced (Outdated Test Specification)
                    </div>
                    <p className="text-amber-300/80 leading-relaxed">
                      This test case was authored against version{' '}
                      <span className="font-mono font-bold">
                        v{detail.testCase.sourceRequirementVersionNumber ?? 1}
                      </span>{' '}
                      of requirement{' '}
                      <span className="font-mono font-bold text-amber-200">
                        {detail.currentRequirement?.key}
                      </span>
                      , but the current requirement is now at version{' '}
                      <span className="font-mono font-bold text-amber-200">
                        v{detail.currentRequirement?.versionNumber}
                      </span>
                      . Review requirement diff or trigger AI regeneration.
                    </p>
                  </div>
                </div>
              )}

              {/* Requirement Context Box */}
              {detail.currentRequirement && (
                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-300">
                      Linked Source Requirement: {detail.currentRequirement.key} —{' '}
                      {detail.currentRequirement.title}
                    </span>
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-slate-800 text-slate-300">
                      Current Version: v{detail.currentRequirement.versionNumber}
                    </span>
                  </div>
                  <p className="text-slate-400 line-clamp-2 bg-slate-900/80 p-2.5 rounded border border-slate-800/80 font-mono text-[11px]">
                    {detail.currentRequirement.originalText}
                  </p>
                </div>
              )}

              {/* Objective & Expected Outcome */}
              <div className="p-4 bg-slate-950/40 border border-slate-800/80 rounded-xl space-y-3">
                <div>
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Objective
                  </h4>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    {detail.activeVersion.objective}
                  </p>
                </div>

                {detail.activeVersion.overallExpectedResult && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Overall Expected Result
                    </h4>
                    <p className="text-xs text-emerald-300 font-mono bg-emerald-950/20 p-2.5 rounded border border-emerald-900/40">
                      {detail.activeVersion.overallExpectedResult}
                    </p>
                  </div>
                )}
              </div>

              {/* Preconditions */}
              <div>
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Preconditions ({detail.activeVersion.preconditions.length})
                </h4>
                {detail.activeVersion.preconditions.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No preconditions declared.</p>
                ) : (
                  <div className="space-y-1.5">
                    {detail.activeVersion.preconditions.map(p => (
                      <div
                        key={p.sequenceOrder}
                        className="p-2.5 bg-slate-950/50 border border-slate-800 rounded-lg text-xs flex items-center gap-2"
                      >
                        <span className="font-mono font-bold text-slate-500 text-[11px]">
                          #{p.sequenceOrder}
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-slate-300 font-mono">
                          {p.category}
                        </span>
                        <span className="text-slate-200">{p.description}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Step Sequence */}
              <div>
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Test Steps ({detail.activeVersion.steps.length})
                </h4>
                <div className="border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800 text-xs">
                  {detail.activeVersion.steps.map(step => (
                    <div key={step.stepNumber} className="p-3 bg-slate-950/40 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded font-mono font-bold text-[11px] bg-slate-800 text-slate-200">
                          Step {step.stepNumber}
                        </span>
                        <span className="font-medium text-slate-200">{step.action}</span>
                      </div>
                      {step.expectedResult && (
                        <div className="pl-6 text-[11px] text-emerald-400 flex items-start gap-1">
                          <span className="font-bold text-emerald-500">↳ Expected:</span>
                          <span>{step.expectedResult}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Test Data */}
              <div>
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Test Data & Constraints ({detail.activeVersion.testData.length})
                </h4>
                {detail.activeVersion.testData.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No structured test data bound.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {detail.activeVersion.testData.map(d => (
                      <div
                        key={d.sequenceOrder}
                        className="p-2.5 bg-slate-950/50 border border-slate-800 rounded-lg space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-semibold text-blue-300">{d.name}</span>
                          <span className="text-[10px] text-slate-500">{d.dataType}</span>
                        </div>
                        <div className="font-mono text-[11px] text-slate-300 bg-slate-900/80 px-2 py-1 rounded">
                          {typeof d.valueJson === 'string'
                            ? d.valueJson
                            : JSON.stringify(d.valueJson ?? d.value ?? '')}
                        </div>
                        {d.constraint && (
                          <div className="text-[10px] text-slate-400">
                            Constraint: {d.constraint}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            Close
          </button>
        </div>
      </div>

      {/* Sub-modals */}
      {detail && (
        <>
          <ApproveModal
            isOpen={isApproveOpen}
            testCaseKey={detail.testCase.testCaseKey}
            versionNumber={detail.activeVersion.versionNumber}
            isSubmitting={actionInProgress}
            onClose={() => setIsApproveOpen(false)}
            onApprove={handleApprove}
          />
          <RejectModal
            isOpen={isRejectOpen}
            testCaseKey={detail.testCase.testCaseKey}
            versionNumber={detail.activeVersion.versionNumber}
            isSubmitting={actionInProgress}
            onClose={() => setIsRejectOpen(false)}
            onReject={handleReject}
          />
          <RegenerateModal
            isOpen={isRegenerateOpen}
            testCaseKey={detail.testCase.testCaseKey}
            versionNumber={detail.activeVersion.versionNumber}
            isSubmitting={actionInProgress}
            onClose={() => setIsRegenerateOpen(false)}
            onRegenerate={handleRegenerate}
          />
          <TestCaseEditorModal
            isOpen={isEditOpen}
            projectId={projectId}
            testCaseId={testCaseId}
            initialVersion={detail.activeVersion}
            isSubmitting={actionInProgress}
            onClose={() => setIsEditOpen(false)}
            onSave={handleSaveEdit}
          />
          <TestVersionHistoryModal
            isOpen={isHistoryOpen}
            projectId={projectId}
            testCaseId={testCaseId}
            testCaseKey={detail.testCase.testCaseKey}
            onClose={() => setIsHistoryOpen(false)}
            onSelectVersionForDiff={(from, to) => {
              setIsHistoryOpen(false);
              setDiffParams({ fromVer: from, toVer: to });
            }}
          />
          {diffParams && (
            <TestVersionDiffModal
              isOpen={true}
              projectId={projectId}
              testCaseId={testCaseId}
              testCaseKey={detail.testCase.testCaseKey}
              fromVersionNumber={diffParams.fromVer}
              toVersionNumber={diffParams.toVer}
              onClose={() => setDiffParams(null)}
            />
          )}
        </>
      )}
    </div>
  );
};
