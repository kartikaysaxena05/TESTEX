/**
 * @file apps/desktop/src/renderer/features/failures/PatchProposalCard.tsx
 * UI component for Limited AI Patch Generation (V7 Phase 101).
 * Displays minimal, evidence-backed patch proposals, unified diffs, risk assessment,
 * and exact snapshot bindings.
 * Strictly proposal-only: no apply/commit/push/deploy controls.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  DefectPatchProposalDto,
  PatchProposalStatusDto,
  PatchRiskLevelDto,
} from '@ai-quality/contracts';
import { PatchSandboxCard } from './PatchSandboxCard.js';
import { PatchValidationCard } from './PatchValidationCard.js';
import { PatchApprovalCard } from './PatchApprovalCard.js';

export interface PatchProposalCardProps {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly onProposalGenerated?: (proposal: DefectPatchProposalDto) => void;
}

export const PatchProposalCard: React.FC<PatchProposalCardProps> = ({
  projectId,
  failureCaseId,
  onProposalGenerated,
}) => {
  const [currentProposal, setCurrentProposal] = useState<DefectPatchProposalDto | null>(null);
  const [proposalsHistory, setProposalsHistory] = useState<readonly DefectPatchProposalDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isWithdrawing, setIsWithdrawing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [userGuidance, setUserGuidance] = useState<string>('');
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [withdrawReason, setWithdrawReason] = useState<string>('');
  const [showWithdrawModal, setShowWithdrawModal] = useState<boolean>(false);

  const activeProjectRef = useRef(projectId);
  const activeFailureRef = useRef(failureCaseId);

  useEffect(() => {
    activeProjectRef.current = projectId;
    activeFailureRef.current = failureCaseId;
  }, [projectId, failureCaseId]);

  const loadProposals = useCallback(async () => {
    const bridge = window.desktop?.patchProposal;
    if (!bridge) return;

    setIsLoading(true);
    setError(null);

    try {
      const [currentRes, listRes] = await Promise.all([
        bridge.get({ projectId, failureCaseId }),
        bridge.list({ projectId, failureCaseId }),
      ]);

      if (activeProjectRef.current !== projectId || activeFailureRef.current !== failureCaseId) {
        return;
      }

      if (currentRes.ok) {
        setCurrentProposal(currentRes.data);
      } else {
        setError(currentRes.error.message);
      }

      if (listRes.ok) {
        setProposalsHistory(listRes.data);
      }
    } catch (err) {
      if (activeProjectRef.current === projectId && activeFailureRef.current === failureCaseId) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (activeProjectRef.current === projectId && activeFailureRef.current === failureCaseId) {
        setIsLoading(false);
      }
    }
  }, [projectId, failureCaseId]);

  useEffect(() => {
    void loadProposals();
  }, [loadProposals]);

  const handleGenerate = async (forceRegenerate = false) => {
    const bridge = window.desktop?.patchProposal;
    if (!bridge) return;

    setIsGenerating(true);
    setError(null);

    try {
      const res = await bridge.generate({
        projectId,
        failureCaseId,
        userGuidance: userGuidance.trim() || undefined,
        forceRegenerate,
      });

      if (activeProjectRef.current !== projectId || activeFailureRef.current !== failureCaseId) {
        return;
      }

      if (res.ok) {
        setCurrentProposal(res.data);
        onProposalGenerated?.(res.data);
        void loadProposals();
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      if (activeProjectRef.current === projectId && activeFailureRef.current === failureCaseId) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (activeProjectRef.current === projectId && activeFailureRef.current === failureCaseId) {
        setIsGenerating(false);
      }
    }
  };

  const handleWithdraw = async () => {
    if (!currentProposal) return;
    const bridge = window.desktop?.patchProposal;
    if (!bridge) return;

    setIsWithdrawing(true);
    setError(null);

    try {
      const res = await bridge.withdraw({
        projectId,
        proposalId: currentProposal.id,
        reason: withdrawReason.trim() || 'Withdrawn by user',
      });

      if (activeProjectRef.current !== projectId || activeFailureRef.current !== failureCaseId) {
        return;
      }

      if (res.ok) {
        setCurrentProposal(res.data);
        setShowWithdrawModal(false);
        setWithdrawReason('');
        void loadProposals();
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      if (activeProjectRef.current === projectId && activeFailureRef.current === failureCaseId) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (activeProjectRef.current === projectId && activeFailureRef.current === failureCaseId) {
        setIsWithdrawing(false);
      }
    }
  };

  const getStatusBadge = (status: PatchProposalStatusDto) => {
    switch (status) {
      case 'PROPOSED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800">
            PROPOSED
          </span>
        );
      case 'SUPERSEDED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            SUPERSEDED
          </span>
        );
      case 'WITHDRAWN':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-950/60 text-amber-400 border border-amber-800">
            WITHDRAWN
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-950/60 text-rose-400 border border-rose-800">
            REJECTED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            {status}
          </span>
        );
    }
  };

  const getRiskBadge = (risk: PatchRiskLevelDto) => {
    switch (risk) {
      case 'LOW':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-950/40 text-emerald-300 border border-emerald-800/60">
            LOW RISK
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-950/40 text-amber-300 border border-amber-800/60">
            MEDIUM RISK
          </span>
        );
      case 'HIGH':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-orange-950/40 text-orange-300 border border-orange-800/60">
            HIGH RISK
          </span>
        );
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-950/50 text-rose-300 border border-rose-800">
            CRITICAL RISK
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="mt-4 border border-slate-700 bg-slate-900 rounded-lg p-5 text-slate-100 shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded bg-indigo-950 text-indigo-400 border border-indigo-800">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-medium text-slate-100 flex items-center gap-2">
              Limited AI Patch Proposal
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                Phase 101
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Controlled, evidence-grounded source code patch proposals with strict size boundaries
            </p>
          </div>
        </div>

        {/* Status and Version Badge */}
        {currentProposal && (
          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-400">v{currentProposal.proposalVersion}</span>
            {getStatusBadge(currentProposal.status)}
            {getRiskBadge(currentProposal.riskLevel)}
          </div>
        )}
      </div>

      {/* Critical Safety Boundary Banner */}
      <div className="mb-4 p-2.5 rounded border border-blue-900/50 bg-blue-950/30 text-blue-300 text-xs flex items-center space-x-2">
        <svg
          className="w-4 h-4 shrink-0 text-blue-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>
          <strong>Proposal Only Boundary:</strong> Phase 101 strictly generates a validated
          proposal. Authoritative source files, Git branches, and working tree remain completely
          unchanged.
        </span>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-4 p-3 rounded border border-rose-800 bg-rose-950/40 text-rose-300 text-xs flex items-start space-x-2">
          <svg
            className="w-4 h-4 mt-0.5 shrink-0 text-rose-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="flex-1">
            <span className="font-semibold">Generation Blocked / Error:</span> {error}
          </div>
        </div>
      )}

      {/* Empty State / Prompt for Generation */}
      {!currentProposal && !isLoading && (
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-6 text-center">
          <div className="max-w-md mx-auto">
            <p className="text-sm text-slate-300 mb-1">
              No patch proposal generated yet for this defect.
            </p>
            <p className="text-xs text-slate-500 mb-4">
              Requires Phase 99 Quick-Fix Eligibility (status: ELIGIBLE) and Phase 100 Repository
              Localization.
            </p>

            <div className="mb-3 text-left">
              <label htmlFor="user-guidance-input" className="block text-xs text-slate-400 mb-1">
                Optional Repair Guidance / Constraints:
              </label>
              <input
                id="user-guidance-input"
                type="text"
                value={userGuidance}
                onChange={e => setUserGuidance(e.target.value)}
                placeholder="e.g., Allow age 18 in validation condition"
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              onClick={() => handleGenerate(false)}
              disabled={isGenerating}
              className="inline-flex items-center px-4 py-2 rounded text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors shadow"
            >
              {isGenerating ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Synthesizing Patch Proposal...
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4 mr-1.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  Generate Patch Proposal
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Active Proposal Inspection Details */}
      {currentProposal && (
        <div className="space-y-4">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-950/60 p-3 rounded-lg border border-slate-800 text-xs">
            <div>
              <span className="text-slate-500 block">Repository Revision</span>
              <span className="font-mono text-slate-300">
                {currentProposal.repositoryRevision.substring(0, 10)}
              </span>
              {currentProposal.isDrifted && (
                <span className="text-amber-400 text-[10px] block">DRIFTED</span>
              )}
            </div>
            <div>
              <span className="text-slate-500 block">Files Affected</span>
              <span className="text-slate-300 font-semibold">
                {currentProposal.targetFiles.length} file(s)
              </span>
              <span className="text-slate-500 text-[10px] block truncate">
                {currentProposal.targetFiles.join(', ')}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Lines Added / Removed</span>
              <span className="text-emerald-400 font-semibold">+{currentProposal.linesAdded}</span>
              {' / '}
              <span className="text-rose-400 font-semibold">-{currentProposal.linesRemoved}</span>
              <span className="text-slate-500 text-[10px] block">
                ({currentProposal.totalChangedLines} changed)
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Synthesizer Model</span>
              <span className="text-slate-300 truncate block">
                {currentProposal.generationModel}
              </span>
              {currentProposal.generationDurationMs && (
                <span className="text-slate-500 text-[10px] block">
                  {currentProposal.generationDurationMs} ms
                </span>
              )}
            </div>
          </div>

          {/* Unified Diff View */}
          <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950">
            <div className="bg-slate-850 px-3 py-2 border-b border-slate-800 flex items-center justify-between text-xs">
              <span className="font-mono text-slate-300 font-semibold flex items-center gap-1.5">
                <svg
                  className="w-3.5 h-3.5 text-indigo-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
                    clipRule="evenodd"
                  />
                </svg>
                Proposed Unified Diff
              </span>
              <span className="text-slate-500 text-[11px]">Read-Only Sandbox Diff</span>
            </div>

            <div className="p-3 font-mono text-xs overflow-x-auto max-h-72 leading-5">
              {currentProposal.unifiedDiff.split('\n').map((line, idx) => {
                let lineClass = 'text-slate-400';
                if (line.startsWith('+') && !line.startsWith('+++')) {
                  lineClass = 'bg-emerald-950/40 text-emerald-300 font-semibold';
                } else if (line.startsWith('-') && !line.startsWith('---')) {
                  lineClass = 'bg-rose-950/40 text-rose-300 font-semibold';
                } else if (line.startsWith('@@')) {
                  lineClass = 'bg-sky-950/30 text-sky-400';
                } else if (line.startsWith('---') || line.startsWith('+++')) {
                  lineClass = 'text-slate-300 font-bold';
                }

                return (
                  <div key={idx} className={`px-2 py-0.5 rounded-sm ${lineClass}`}>
                    {line || ' '}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rationale & Expected Behavior */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-950/40 p-3 rounded border border-slate-800">
              <span className="text-slate-400 font-semibold block mb-1">Proposed Rationale:</span>
              <p className="text-slate-300 leading-relaxed">{currentProposal.rationale}</p>
            </div>
            <div className="bg-slate-950/40 p-3 rounded border border-slate-800">
              <span className="text-slate-400 font-semibold block mb-1">
                Expected Behavior Change:
              </span>
              <p className="text-slate-300 leading-relaxed">
                {currentProposal.assumptions.length > 0 && (
                  <span className="block mb-1 text-slate-400">
                    <strong>Assumptions:</strong> {currentProposal.assumptions.join('; ')}
                  </span>
                )}
                {currentProposal.riskFactors.length > 0 && (
                  <span className="block text-amber-300/90">
                    <strong>Risk Factors:</strong> {currentProposal.riskFactors.join('; ')}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Test References (Phase 102 Handoff) */}
          {currentProposal.testReferences.length > 0 && (
            <div className="p-3 bg-slate-950/40 rounded border border-slate-800 text-xs">
              <span className="text-slate-400 font-semibold block mb-1.5 flex items-center gap-1.5">
                <svg
                  className="w-3.5 h-3.5 text-emerald-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Verification Test References (Targeted for Phase 102 Sandbox Validation):
              </span>
              <div className="space-y-1">
                {currentProposal.testReferences.map((testRef, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-slate-300 pl-2 border-l border-emerald-800"
                  >
                    <div>
                      <span className="font-semibold text-slate-200">
                        {testRef.testCaseKey ? `[${testRef.testCaseKey}] ` : ''}
                        {testRef.testTitle}
                      </span>
                      <span className="text-slate-400 block text-[11px]">{testRef.relevance}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Toolbar */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleGenerate(true)}
                disabled={isGenerating}
                className="inline-flex items-center px-3 py-1.5 rounded text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50 transition-colors border border-slate-700"
              >
                {isGenerating ? 'Regenerating...' : 'Regenerate Proposal'}
              </button>

              {currentProposal.status === 'PROPOSED' && (
                <button
                  onClick={() => setShowWithdrawModal(true)}
                  disabled={isWithdrawing}
                  className="inline-flex items-center px-3 py-1.5 rounded text-xs font-semibold bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 disabled:opacity-50 transition-colors border border-amber-800/80"
                >
                  Withdraw Proposal
                </button>
              )}
            </div>

            {proposalsHistory.length > 1 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="text-xs text-indigo-400 hover:text-indigo-300 underline"
              >
                {showHistory ? 'Hide History' : `View History (${proposalsHistory.length})`}
              </button>
            )}
          </div>

          {/* History Accordion */}
          {showHistory && (
            <div className="mt-3 p-3 bg-slate-950 rounded border border-slate-800 space-y-2 text-xs">
              <span className="font-semibold text-slate-300 block">Proposal History:</span>
              {proposalsHistory.map(hist => (
                <div
                  key={hist.id}
                  className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800"
                >
                  <div className="flex items-center space-x-2">
                    <span className="text-slate-400">v{hist.proposalVersion}</span>
                    {getStatusBadge(hist.status)}
                    <span className="text-slate-400 font-mono text-[11px]">
                      {hist.repositoryRevision.substring(0, 8)}
                    </span>
                  </div>
                  <div className="text-slate-500 text-[10px]">
                    {new Date(hist.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Phase 102: Secure Patch Sandbox & Change Isolation */}
          <PatchSandboxCard
            projectId={projectId}
            failureCaseId={failureCaseId}
            patchProposalId={currentProposal.id}
          />

          {/* Phase 103: Patch Validation & Before/After Testing */}
          <PatchValidationCard
            projectId={projectId}
            failureCaseId={failureCaseId}
            patchProposalId={currentProposal.id}
          />

          {/* Phase 104: Human Approval, Reject & Apply Workflow */}
          <PatchApprovalCard
            projectId={projectId}
            failureCaseId={failureCaseId}
            patchProposalId={currentProposal.id}
          />
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-5 max-w-sm w-full shadow-xl">
            <h4 className="text-sm font-semibold text-slate-100 mb-2">Withdraw Patch Proposal</h4>
            <p className="text-xs text-slate-400 mb-3">
              Are you sure you want to withdraw this proposal? It will be marked as WITHDRAWN and
              not proceed to sandbox validation.
            </p>
            <input
              type="text"
              value={withdrawReason}
              onChange={e => setWithdrawReason(e.target.value)}
              placeholder="Reason for withdrawal"
              className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 mb-4 focus:outline-none focus:border-amber-500"
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowWithdrawModal(false)}
                className="px-3 py-1.5 rounded text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleWithdraw}
                disabled={isWithdrawing}
                className="px-3 py-1.5 rounded text-xs bg-amber-600 hover:bg-amber-500 text-white font-semibold disabled:opacity-50"
              >
                {isWithdrawing ? 'Withdrawing...' : 'Confirm Withdraw'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
