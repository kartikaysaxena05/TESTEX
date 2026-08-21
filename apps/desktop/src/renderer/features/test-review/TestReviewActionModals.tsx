/**
 * @file apps/desktop/src/renderer/features/test-review/TestReviewActionModals.tsx
 * Action dialogs for Phase 56 Test Review (Approve, Reject, Regenerate).
 */

import React, { useState } from 'react';
import type { TestCaseRejectionReason } from '@ai-quality/contracts';

interface ApproveModalProps {
  readonly isOpen: boolean;
  readonly testCaseKey: string;
  readonly versionNumber: number;
  readonly isSubmitting: boolean;
  readonly onClose: () => void;
  readonly onApprove: (comment?: string) => Promise<void>;
}

export const ApproveModal: React.FC<ApproveModalProps> = ({
  isOpen,
  testCaseKey,
  versionNumber,
  isSubmitting,
  onClose,
  onApprove,
}) => {
  const [comment, setComment] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onApprove(comment.trim() || undefined);
    setComment('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              ✓
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Approve Test Case Version {versionNumber}
              </h3>
              <p className="text-xs text-slate-400">{testCaseKey}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-sm text-slate-300">
            Approving version{' '}
            <span className="font-semibold text-emerald-400 font-mono">v{versionNumber}</span> marks
            this specific test design as accepted and ready for coverage verification.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Reviewer Notes (Optional)
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="E.g., Approved after verifying against checkout specification..."
              rows={3}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-1.5 shadow-sm"
            >
              {isSubmitting ? 'Approving...' : `Approve v${versionNumber}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface RejectModalProps {
  readonly isOpen: boolean;
  readonly testCaseKey: string;
  readonly versionNumber: number;
  readonly isSubmitting: boolean;
  readonly onClose: () => void;
  readonly onReject: (reason: TestCaseRejectionReason, comment?: string) => Promise<void>;
}

const REJECTION_REASONS: { value: TestCaseRejectionReason; label: string }[] = [
  { value: 'INVALID_EXPECTED_RESULT', label: 'Invalid Expected Result / State Assertion' },
  { value: 'UNSUPPORTED_ASSUMPTION', label: 'Unsupported Assumption / Fabricated Behavior' },
  { value: 'INCORRECT_PRECONDITION', label: 'Incorrect Precondition or Initial State' },
  { value: 'POOR_TEST_DATA', label: 'Inadequate or Unrealistic Test Data' },
  { value: 'DUPLICATE_TEST', label: 'Duplicate Test Coverage' },
  { value: 'NOT_RELEVANT', label: 'Not Relevant to Requirement Objective' },
  { value: 'INSUFFICIENT_COVERAGE', label: 'Insufficient Step / Boundary Coverage' },
  { value: 'REQUIREMENT_AMBIGUOUS', label: 'Requirement Itself is Ambiguous' },
  { value: 'OTHER', label: 'Other Review Finding' },
];

export const RejectModal: React.FC<RejectModalProps> = ({
  isOpen,
  testCaseKey,
  versionNumber,
  isSubmitting,
  onClose,
  onReject,
}) => {
  const [reason, setReason] = useState<TestCaseRejectionReason>('INVALID_EXPECTED_RESULT');
  const [comment, setComment] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onReject(reason, comment.trim() || undefined);
    setComment('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold">
              ✕
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Reject Test Case Version {versionNumber}
              </h3>
              <p className="text-xs text-slate-400">{testCaseKey}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Rejection Category <span className="text-rose-400">*</span>
            </label>
            <select
              value={reason}
              onChange={e => setReason(e.target.value as TestCaseRejectionReason)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
            >
              {REJECTION_REASONS.map(r => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Feedback / Detailed Explanation
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Explain why this version is rejected so the author or AI generator can refine it..."
              rows={3}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition flex items-center gap-1.5 shadow-sm"
            >
              {isSubmitting ? 'Rejecting...' : `Reject v${versionNumber}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface RegenerateModalProps {
  readonly isOpen: boolean;
  readonly testCaseKey: string;
  readonly versionNumber: number;
  readonly isSubmitting: boolean;
  readonly onClose: () => void;
  readonly onRegenerate: (reason: string, reviewerInstructions?: string) => Promise<void>;
}

export const RegenerateModal: React.FC<RegenerateModalProps> = ({
  isOpen,
  testCaseKey,
  versionNumber,
  isSubmitting,
  onClose,
  onRegenerate,
}) => {
  const [reason, setReason] = useState('Regenerate against updated requirement context');
  const [instructions, setInstructions] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    await onRegenerate(reason.trim(), instructions.trim() || undefined);
    setReason('Regenerate against updated requirement context');
    setInstructions('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
              ↻
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">Regenerate AI Test Case</h3>
              <p className="text-xs text-slate-400">
                {testCaseKey} (Current: v{versionNumber})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="p-3 bg-indigo-950/40 border border-indigo-900/60 rounded-lg text-xs text-indigo-300 leading-relaxed">
            <span className="font-semibold text-indigo-200">AI Provenance & Grounding:</span>{' '}
            Regeneration will run through the structured prompt pipeline with live RAG evidence
            retrieval and schema validation. A new immutable version{' '}
            <span className="font-mono font-bold">v{versionNumber + 1}</span> will be created in
            DRAFT status.
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Reason for Regeneration <span className="text-indigo-400">*</span>
            </label>
            <input
              type="text"
              required
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="E.g., Requirement version updated, refine boundary steps..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Reviewer Regeneration Instructions (Optional Guidance)
            </label>
            <textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              placeholder="Provide specific hints (e.g., Focus on lock-out after 5 invalid attempts)..."
              rows={3}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !reason.trim()}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-1.5 shadow-sm"
            >
              {isSubmitting ? 'Regenerating...' : `Generate v${versionNumber + 1}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
