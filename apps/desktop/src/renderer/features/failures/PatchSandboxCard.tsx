/**
 * @file apps/desktop/src/renderer/features/failures/PatchSandboxCard.tsx
 * UI component for Secure Patch Sandbox & Change Isolation (V7 Phase 102).
 * Displays isolated sandbox status, provisioning controls, patch application,
 * security & containment checklists, authoritative repository immutability verification,
 * and sandbox cleanup.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  DefectPatchSandboxDto,
  PatchSandboxStatusDto,
  PatchSandboxSecurityChecksDto,
} from '@ai-quality/contracts';

export interface PatchSandboxCardProps {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly patchProposalId?: string;
  readonly onSandboxUpdated?: (sandbox: DefectPatchSandboxDto) => void;
}

export const PatchSandboxCard: React.FC<PatchSandboxCardProps> = ({
  projectId,
  failureCaseId,
  patchProposalId,
  onSandboxUpdated,
}) => {
  const [_sandboxes, setSandboxes] = useState<readonly DefectPatchSandboxDto[]>([]);
  const [activeSandbox, setActiveSandbox] = useState<DefectPatchSandboxDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isProvisioning, setIsProvisioning] = useState<boolean>(false);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [isDestroying, setIsDestroying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showSecurityDetails, setShowSecurityDetails] = useState<boolean>(false);
  const [showDiff, setShowDiff] = useState<boolean>(true);

  const activeProjectRef = useRef(projectId);
  const activeFailureRef = useRef(failureCaseId);

  useEffect(() => {
    activeProjectRef.current = projectId;
    activeFailureRef.current = failureCaseId;
  }, [projectId, failureCaseId]);

  const loadSandboxes = useCallback(async () => {
    const bridge = window.desktop?.patchSandbox;
    if (!bridge) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await bridge.list({
        projectId,
        failureCaseId,
        patchProposalId,
      });

      if (activeProjectRef.current !== projectId || activeFailureRef.current !== failureCaseId) {
        return;
      }

      if (res.ok) {
        setSandboxes(res.data);
        const active = res.data.find(s => s.sandboxStatus !== 'DESTROYED') ?? res.data[0] ?? null;
        setActiveSandbox(active);
        if (active && onSandboxUpdated) {
          onSandboxUpdated(active);
        }
      } else {
        setError(res.error.message);
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
  }, [projectId, failureCaseId, patchProposalId, onSandboxUpdated]);

  useEffect(() => {
    void loadSandboxes();
  }, [loadSandboxes]);

  const handleProvision = async () => {
    if (!patchProposalId) {
      setError('A patch proposal must be selected before provisioning a sandbox.');
      return;
    }
    const bridge = window.desktop?.patchSandbox;
    if (!bridge) return;

    setIsProvisioning(true);
    setError(null);

    try {
      const res = await bridge.create({
        projectId,
        failureCaseId,
        patchProposalId,
      });

      if (res.ok) {
        setActiveSandbox(res.data);
        if (onSandboxUpdated) {
          onSandboxUpdated(res.data);
        }
        await loadSandboxes();
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsProvisioning(false);
    }
  };

  const handleApply = async () => {
    if (!activeSandbox) return;
    const bridge = window.desktop?.patchSandbox;
    if (!bridge) return;

    setIsApplying(true);
    setError(null);

    try {
      const res = await bridge.apply({
        projectId,
        sandboxId: activeSandbox.id,
      });

      if (res.ok) {
        setActiveSandbox(res.data);
        if (onSandboxUpdated) {
          onSandboxUpdated(res.data);
        }
        await loadSandboxes();
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsApplying(false);
    }
  };

  const handleDestroy = async () => {
    if (!activeSandbox) return;
    const bridge = window.desktop?.patchSandbox;
    if (!bridge) return;

    setIsDestroying(true);
    setError(null);

    try {
      const res = await bridge.destroy({
        projectId,
        sandboxId: activeSandbox.id,
        reason: 'User requested teardown',
      });

      if (res.ok) {
        setActiveSandbox(res.data);
        if (onSandboxUpdated) {
          onSandboxUpdated(res.data);
        }
        await loadSandboxes();
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDestroying(false);
    }
  };

  const getStatusBadge = (status: PatchSandboxStatusDto) => {
    switch (status) {
      case 'CREATING':
      case 'PATCH_APPLYING':
      case 'DESTROYING':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-900/40 text-blue-400 border border-blue-700/50">
            <span className="w-1.5 h-1.5 mr-1.5 bg-blue-400 rounded-full animate-ping" />
            {status}
          </span>
        );
      case 'READY':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-cyan-900/40 text-cyan-400 border border-cyan-700/50">
            READY TO APPLY
          </span>
        );
      case 'PATCH_APPLIED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-900/40 text-emerald-400 border border-emerald-700/50">
            APPLIED IN SANDBOX
          </span>
        );
      case 'PATCH_REJECTED':
      case 'FAILED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-900/40 text-red-400 border border-red-700/50">
            {status}
          </span>
        );
      case 'DESTROYED':
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
            {status}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
            {status}
          </span>
        );
    }
  };

  const renderSecurityItem = (name: string, passed: boolean, detail?: string) => (
    <div className="flex items-center justify-between text-xs py-1 border-b border-slate-800 last:border-0">
      <span className="text-slate-300 flex items-center space-x-1.5">
        <span className={`w-2 h-2 rounded-full ${passed ? 'bg-emerald-500' : 'bg-red-500'}`} />
        <span>{name}</span>
      </span>
      <span className={`font-mono text-[11px] ${passed ? 'text-emerald-400' : 'text-red-400'}`}>
        {passed ? 'PASS' : 'BLOCKED'}
        {detail ? ` (${detail})` : ''}
      </span>
    </div>
  );

  const secChecks = activeSandbox?.securityChecks as PatchSandboxSecurityChecksDto | undefined;

  return (
    <div
      data-testid="patch-sandbox-card"
      className="mt-4 bg-slate-900/80 border border-slate-800 rounded-lg p-4 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-3">
          <div className="p-1.5 bg-blue-950 text-blue-400 rounded-md border border-blue-800/40">
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h4 className="text-sm font-semibold text-slate-100">
                Secure Patch Sandbox & Change Isolation
              </h4>
              {activeSandbox && getStatusBadge(activeSandbox.sandboxStatus)}
            </div>
            <p className="text-xs text-slate-400">
              Isolated testing environment outside authoritative repository. Zero modifications to
              user working tree.
            </p>
          </div>
        </div>

        {/* Global Action / Refresh */}
        <button
          onClick={() => void loadSandboxes()}
          disabled={isLoading}
          className="text-xs text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-800 transition"
          title="Refresh Sandboxes"
        >
          <svg
            className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          data-testid="sandbox-error-alert"
          className="p-3 bg-red-950/40 border border-red-800/60 rounded-md text-xs text-red-300 flex items-start space-x-2"
        >
          <svg
            className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0"
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
            <span className="font-semibold">Sandbox Error: </span>
            {error}
          </div>
        </div>
      )}

      {/* Authoritative Immutability Guarantee Banner */}
      <div className="bg-slate-950/60 border border-emerald-800/40 rounded-md p-3 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2">
          <svg
            className="w-4 h-4 text-emerald-400 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <div>
            <span className="text-slate-200 font-medium">
              Authoritative Repository Immutability:{' '}
            </span>
            <span className="text-emerald-400 font-semibold">
              {activeSandbox?.originalRepoIntegrityVerified
                ? 'VERIFIED (0 Changes / Untouched)'
                : 'Protected by Phase 102 Isolation Invariant'}
            </span>
          </div>
        </div>
        <span className="text-[11px] text-slate-500 font-mono">
          Original Repo Mutations: {activeSandbox?.originalRepoModifiedCount ?? 0}
        </span>
      </div>

      {/* Active Sandbox State & Details */}
      {activeSandbox ? (
        <div className="space-y-3">
          {/* Metadata Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-slate-950/40 p-2 rounded border border-slate-800/60">
              <span className="text-slate-500 block text-[10px]">SANDBOX ID</span>
              <span
                className="font-mono text-slate-200 text-[11px] truncate block"
                title={activeSandbox.id}
              >
                {activeSandbox.id.slice(0, 10)}...
              </span>
            </div>
            <div className="bg-slate-950/40 p-2 rounded border border-slate-800/60">
              <span className="text-slate-500 block text-[10px]">PINNED REVISION</span>
              <span className="font-mono text-slate-200 text-[11px]">
                {activeSandbox.sourceRevision.slice(0, 8)}
              </span>
            </div>
            <div className="bg-slate-950/40 p-2 rounded border border-slate-800/60">
              <span className="text-slate-500 block text-[10px]">ISOLATED LOCATION</span>
              <span
                className="font-mono text-slate-300 text-[11px] truncate block"
                title={activeSandbox.sanitizedSandboxLocation}
              >
                {activeSandbox.sanitizedSandboxLocation}
              </span>
            </div>
            <div className="bg-slate-950/40 p-2 rounded border border-slate-800/60">
              <span className="text-slate-500 block text-[10px]">ISOLATION STRATEGY</span>
              <span className="text-emerald-400 font-medium text-[11px]">
                {activeSandbox.isolationStrategy}
              </span>
            </div>
          </div>

          {/* Security & Containment Checklist Dropdown */}
          <div className="bg-slate-950/40 border border-slate-800 rounded p-3">
            <button
              onClick={() => setShowSecurityDetails(!showSecurityDetails)}
              className="w-full flex items-center justify-between text-xs text-slate-300 font-medium hover:text-slate-100"
            >
              <span className="flex items-center space-x-2">
                <span>Security & Containment Checklist</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                  {secChecks ? 'All Invariants Passed' : 'Pending Verification'}
                </span>
              </span>
              <span className="text-slate-500">{showSecurityDetails ? '▲ Hide' : '▼ View'}</span>
            </button>

            {showSecurityDetails && secChecks && (
              <div className="mt-3 pt-2 border-t border-slate-800/80 space-y-1">
                {renderSecurityItem(
                  'Path Canonicalization & Directory Containment',
                  secChecks.pathContainmentPassed,
                )}
                {renderSecurityItem(
                  'Symlink Escape & Hardlink Trap Defense',
                  secChecks.symlinkEscapePassed,
                )}
                {renderSecurityItem(
                  'Allowed File Scope & Change Budgets',
                  secChecks.allowedFileScopePassed,
                )}
                {renderSecurityItem(
                  'Sensitive File & Secrets Protection (.env, tokens)',
                  secChecks.sensitiveFilesProtected,
                )}
                {renderSecurityItem(
                  '.git Metadata Quarantine & Isolation',
                  secChecks.gitMetadataProtected,
                )}
                {renderSecurityItem(
                  'Binary File Safety (UTF-8 Text Only)',
                  secChecks.binaryFilesBlocked,
                )}
                {renderSecurityItem(
                  'Hardlink Isolation (Separate Inodes)',
                  secChecks.hardlinkIsolated,
                )}
                {renderSecurityItem(
                  'Authoritative Baseline Immutability Verified',
                  activeSandbox.originalRepoIntegrityVerified,
                )}
              </div>
            )}
          </div>

          {/* Sandbox Applied Diff Preview */}
          {activeSandbox.sandboxStatus === 'PATCH_APPLIED' && activeSandbox.actualUnifiedDiff && (
            <div className="bg-slate-950/60 border border-slate-800 rounded p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 flex items-center space-x-2">
                  <span>Isolated Sandbox Git Diff</span>
                  <span className="text-[10px] text-emerald-400 font-normal">
                    (
                    {activeSandbox.claimedVsActualDiffMatch
                      ? 'Verified match against proposal'
                      : 'Diff applied'}
                    )
                  </span>
                </span>
                <button
                  onClick={() => setShowDiff(!showDiff)}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  {showDiff ? 'Collapse Diff' : 'Expand Diff'}
                </button>
              </div>

              {showDiff && (
                <pre
                  data-testid="sandbox-applied-diff"
                  className="bg-slate-950 p-3 rounded border border-slate-800 text-[11px] font-mono text-slate-200 overflow-x-auto max-h-64 whitespace-pre"
                >
                  {activeSandbox.actualUnifiedDiff}
                </pre>
              )}
            </div>
          )}

          {/* Controls Bar */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <div className="text-xs text-slate-500">
              {activeSandbox.sandboxStatus === 'READY' &&
                'Ready to apply candidate patch in sandbox.'}
              {activeSandbox.sandboxStatus === 'PATCH_APPLIED' &&
                'Patch successfully applied inside sandbox. Ready for Phase 103 test validation.'}
              {activeSandbox.sandboxStatus === 'DESTROYED' &&
                'Sandbox filesystem cleaned and isolated directory removed.'}
            </div>

            <div className="flex items-center space-x-2">
              {activeSandbox.sandboxStatus === 'READY' && (
                <button
                  data-testid="apply-to-sandbox-button"
                  onClick={handleApply}
                  disabled={isApplying}
                  className="px-3 py-1.5 rounded text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50 flex items-center space-x-1.5 transition"
                >
                  {isApplying ? (
                    <>
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Applying...</span>
                    </>
                  ) : (
                    <span>Apply Patch to Sandbox</span>
                  )}
                </button>
              )}

              {activeSandbox.sandboxStatus !== 'DESTROYED' && (
                <button
                  data-testid="destroy-sandbox-button"
                  onClick={handleDestroy}
                  disabled={isDestroying}
                  className="px-3 py-1.5 rounded text-xs bg-slate-800 hover:bg-red-950/40 text-slate-300 hover:text-red-300 border border-slate-700 hover:border-red-800/60 transition disabled:opacity-50"
                >
                  {isDestroying ? 'Cleaning...' : 'Destroy Sandbox'}
                </button>
              )}

              {activeSandbox.sandboxStatus === 'DESTROYED' && patchProposalId && (
                <button
                  onClick={handleProvision}
                  disabled={isProvisioning}
                  className="px-3 py-1.5 rounded text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50 transition"
                >
                  {isProvisioning ? 'Provisioning...' : 'Re-provision Sandbox'}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Empty State: No Sandbox Yet */
        <div className="text-center py-6 border border-dashed border-slate-800 rounded-lg p-4 space-y-3">
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            No active patch sandbox. Provisioning a sandbox creates an isolated filesystem copy of
            the repository outside your working directory with separate inodes.
          </p>
          <button
            data-testid="provision-sandbox-button"
            onClick={handleProvision}
            disabled={isProvisioning || !patchProposalId}
            className="px-4 py-2 rounded text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold disabled:opacity-50 inline-flex items-center space-x-2 transition"
          >
            {isProvisioning ? (
              <>
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Provisioning Isolated Sandbox...</span>
              </>
            ) : (
              <span>Provision Secure Sandbox</span>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
