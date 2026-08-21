/**
 * @file apps/desktop/src/renderer/features/requirements/RequirementCandidatesModal.tsx
 * Modal for deterministic requirement candidate detection, interactive review, and atomic import.
 */

import React, { useState, useEffect, useCallback, useId } from 'react';
import {
  type RequirementDocumentDto,
  type RequirementCandidateDto,
  type CandidateReviewStatus,
} from '@ai-quality/contracts';
import { Dialog } from '../../ui/Dialog.js';
import { Button } from '../../ui/Button.js';
import { Badge, type BadgeVariant } from '../../ui/Badge.js';
import { Spinner } from '../../ui/Spinner.js';
import { Alert } from '../../ui/Alert.js';
import { EmptyState } from '../../ui/EmptyState.js';

export interface RequirementCandidatesModalProps {
  readonly isOpen: boolean;
  readonly projectId: string;
  readonly document: RequirementDocumentDto | null;
  readonly isArchivedProject?: boolean;
  readonly onClose: () => void;
  readonly onImportSuccess?: () => void;
}

export function RequirementCandidatesModal({
  isOpen,
  projectId,
  document,
  isArchivedProject = false,
  onClose,
  onImportSuccess,
}: RequirementCandidatesModalProps) {
  const [candidates, setCandidates] = useState<readonly RequirementCandidateDto[]>([]);
  const [counts, setCounts] = useState({
    totalCount: 0,
    pendingCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    importedCount: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [activeTab, setActiveTab] = useState<CandidateReviewStatus | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [expandedReasonsId, setExpandedReasonsId] = useState<string | null>(null);
  const searchInputId = useId();

  const loadCandidates = useCallback(async () => {
    if (!document) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (!window.desktop?.requirementCandidates?.list) {
        throw new Error('Requirement candidate API is not available.');
      }
      const res = await window.desktop.requirementCandidates.list({
        projectId,
        documentId: document.id,
        status: activeTab,
        search: searchQuery.trim() || undefined,
      });

      if (res.ok) {
        setCandidates(res.data.candidates);
        setCounts({
          totalCount: res.data.totalCount,
          pendingCount: res.data.pendingCount,
          approvedCount: res.data.approvedCount,
          rejectedCount: res.data.rejectedCount,
          importedCount: res.data.importedCount,
        });
      } else {
        setErrorMessage(res.error.message || 'Failed to load requirement candidates.');
      }
    } catch {
      setErrorMessage('Unexpected error loading requirement candidates.');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, document, activeTab, searchQuery]);

  useEffect(() => {
    if (isOpen && document) {
      void loadCandidates();
    } else {
      setCandidates([]);
      setEditingCandidateId(null);
      setErrorMessage(null);
      setSuccessMessage(null);
      setShowImportDialog(false);
    }
  }, [isOpen, document, loadCandidates]);

  const handleDetect = async (force = false) => {
    if (!document || isArchivedProject) return;
    setIsDetecting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (!window.desktop?.requirementCandidates?.detect) {
        throw new Error('Requirement candidate detection API is not available.');
      }
      const res = await window.desktop.requirementCandidates.detect({
        projectId,
        documentId: document.id,
        force,
      });

      if (res.ok) {
        setSuccessMessage(`Detected ${res.data.length} requirement candidates.`);
        await loadCandidates();
      } else {
        setErrorMessage(
          res.error.message || 'Detection failed. Ensure document extraction exists.',
        );
      }
    } catch {
      setErrorMessage('Unexpected error triggering candidate detection.');
    } finally {
      setIsDetecting(false);
    }
  };

  const handleSetStatus = async (
    candidateIds: string[],
    status: 'PENDING' | 'APPROVED' | 'REJECTED',
  ) => {
    if (isArchivedProject || candidateIds.length === 0) return;
    setErrorMessage(null);

    try {
      if (!window.desktop?.requirementCandidates?.setStatus) {
        throw new Error('Requirement candidate status API is not available.');
      }
      const res = await window.desktop.requirementCandidates.setStatus({
        projectId,
        candidateIds,
        status,
      });

      if (res.ok) {
        await loadCandidates();
      } else {
        setErrorMessage(res.error.message || 'Failed to update candidate status.');
      }
    } catch {
      setErrorMessage('Unexpected error updating candidate status.');
    }
  };

  const handleSaveEdit = async (candidateId: string) => {
    if (isArchivedProject || !editText.trim()) return;
    setErrorMessage(null);

    try {
      if (!window.desktop?.requirementCandidates?.update) {
        throw new Error('Requirement candidate update API is not available.');
      }
      const res = await window.desktop.requirementCandidates.update({
        projectId,
        candidateId,
        reviewedText: editText.trim(),
      });

      if (res.ok) {
        setEditingCandidateId(null);
        setEditText('');
        await loadCandidates();
      } else {
        setErrorMessage(res.error.message || 'Failed to save candidate edit.');
      }
    } catch {
      setErrorMessage('Unexpected error saving candidate edit.');
    }
  };

  const handleImportApproved = async () => {
    if (!document || isArchivedProject) return;
    setIsImporting(true);
    setErrorMessage(null);

    try {
      if (!window.desktop?.requirementCandidates?.import) {
        throw new Error('Requirement candidate import API is not available.');
      }
      const res = await window.desktop.requirementCandidates.import({
        projectId,
        documentId: document.id,
      });

      if (res.ok) {
        setShowImportDialog(false);
        setSuccessMessage(
          `Successfully imported ${res.data.importedCount} approved requirement(s) in Draft status.`,
        );
        await loadCandidates();
        onImportSuccess?.();
      } else {
        setErrorMessage(res.error.message || 'Failed to import approved candidates.');
      }
    } catch {
      setErrorMessage('Unexpected error importing approved candidates.');
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen || !document) return null;

  const getStatusBadgeVariant = (status: CandidateReviewStatus): BadgeVariant => {
    switch (status) {
      case 'APPROVED':
        return 'success';
      case 'REJECTED':
        return 'danger';
      case 'IMPORTED':
        return 'info';
      case 'PENDING':
      default:
        return 'warning';
    }
  };

  const pendingCandidateIds = candidates.filter(c => c.reviewStatus === 'PENDING').map(c => c.id);

  return (
    <>
      <Dialog
        open={isOpen && !showImportDialog}
        onClose={onClose}
        title={`Requirement Candidates: ${document.originalFileName}`}
        className="max-w-5xl max-h-[92vh] flex flex-col"
      >
        <div className="flex flex-col space-y-4 overflow-y-auto pr-1">
          {/* Header Summary & Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-900/60 rounded-lg border border-slate-800 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-slate-400">
                Total: <strong className="text-white font-medium">{counts.totalCount}</strong>
              </span>
              <span className="text-amber-400">
                Pending: <strong>{counts.pendingCount}</strong>
              </span>
              <span className="text-emerald-400">
                Approved: <strong>{counts.approvedCount}</strong>
              </span>
              <span className="text-rose-400">
                Rejected: <strong>{counts.rejectedCount}</strong>
              </span>
              <span className="text-blue-400">
                Imported: <strong>{counts.importedCount}</strong>
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={isDetecting || isLoading || isArchivedProject}
                onClick={() => void handleDetect(counts.totalCount > 0)}
              >
                {isDetecting ? (
                  <span className="flex items-center space-x-1.5">
                    <Spinner size="sm" />
                    <span>Detecting...</span>
                  </span>
                ) : counts.totalCount > 0 ? (
                  'Re-detect'
                ) : (
                  'Detect Candidates'
                )}
              </Button>

              <Button
                variant="primary"
                size="sm"
                disabled={counts.approvedCount === 0 || isArchivedProject || isImporting}
                onClick={() => setShowImportDialog(true)}
              >
                Import Approved ({counts.approvedCount})
              </Button>
            </div>
          </div>

          {/* Alerts */}
          {errorMessage && (
            <Alert variant="danger" title="Error">
              {errorMessage}
            </Alert>
          )}

          {successMessage && (
            <Alert variant="success" title="Success">
              {successMessage}
            </Alert>
          )}

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex space-x-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
              {(['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'IMPORTED'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1 rounded transition-colors font-medium ${
                    activeTab === tab
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab === 'ALL'
                    ? `All (${counts.totalCount})`
                    : `${tab.charAt(0) + tab.slice(1).toLowerCase()} (${
                        tab === 'PENDING'
                          ? counts.pendingCount
                          : tab === 'APPROVED'
                            ? counts.approvedCount
                            : tab === 'REJECTED'
                              ? counts.rejectedCount
                              : counts.importedCount
                      })`}
                </button>
              ))}
            </div>

            <div className="flex items-center space-x-2">
              <input
                id={searchInputId}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search candidates..."
                className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-48"
              />

              {!isArchivedProject && pendingCandidateIds.length > 0 && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleSetStatus(pendingCandidateIds, 'APPROVED')}
                  >
                    Approve All ({pendingCandidateIds.length})
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => void handleSetStatus(pendingCandidateIds, 'REJECTED')}
                  >
                    Reject All
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Candidates Stream */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <Spinner size="md" />
              <p className="text-sm text-slate-400">Loading candidates...</p>
            </div>
          )}

          {!isLoading && candidates.length === 0 && (
            <EmptyState
              title={
                counts.totalCount === 0
                  ? 'No Candidates Detected Yet'
                  : 'No Candidates Match Filter'
              }
              description={
                counts.totalCount === 0
                  ? 'Run candidate detection to discover requirement candidates with transparent detection evidence.'
                  : 'Try changing your search query or selecting a different status filter.'
              }
              action={
                counts.totalCount === 0 && !isArchivedProject ? (
                  <Button
                    variant="primary"
                    onClick={() => void handleDetect(false)}
                    disabled={isDetecting}
                  >
                    {isDetecting ? 'Detecting...' : 'Detect Candidates Now'}
                  </Button>
                ) : undefined
              }
            />
          )}

          {!isLoading && candidates.length > 0 && (
            <div className="space-y-3">
              {candidates.map(candidate => {
                const isEditing = editingCandidateId === candidate.id;
                const isReasonsExpanded = expandedReasonsId === candidate.id;

                return (
                  <div
                    key={candidate.id}
                    className="p-3.5 bg-slate-900/80 rounded-lg border border-slate-800 space-y-2.5 transition-colors hover:border-slate-700 text-xs"
                  >
                    {/* Top Row: External Key, Status, Score, Provenance */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        {candidate.externalKey && (
                          <Badge variant="info">
                            <strong>{candidate.externalKey}</strong>
                          </Badge>
                        )}
                        <Badge variant={getStatusBadgeVariant(candidate.reviewStatus)}>
                          {candidate.reviewStatus}
                        </Badge>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedReasonsId(isReasonsExpanded ? null : candidate.id)
                          }
                          className="flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono transition-colors"
                          title="Click to view explainable score breakdown"
                        >
                          <span>Score: {candidate.detectionScore}</span>
                          <span className="text-slate-400">{isReasonsExpanded ? '▲' : '▼'}</span>
                        </button>
                      </div>

                      <div className="flex items-center space-x-3 text-[11px] text-slate-400 font-mono">
                        {candidate.pageNumber && <span>Page {candidate.pageNumber}</span>}
                        {candidate.lineStart && (
                          <span>
                            Lines {candidate.lineStart}–{candidate.lineEnd}
                          </span>
                        )}
                        {candidate.sectionPath && (
                          <span
                            className="text-slate-400 truncate max-w-xs"
                            title={candidate.sectionPath}
                          >
                            {candidate.sectionPath}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expandable Explainable Score Breakdown */}
                    {isReasonsExpanded && (
                      <div className="p-2.5 bg-slate-950/80 rounded border border-slate-800 space-y-1.5">
                        <p className="text-[11px] font-semibold text-slate-300">
                          Detection Reasons & Score Breakdown:
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {candidate.detectionReasons.map((reason, rIdx) => (
                            <span
                              key={rIdx}
                              className="inline-flex items-center space-x-1 px-2 py-0.5 bg-slate-800 text-slate-200 rounded text-[11px]"
                            >
                              <span className="text-blue-400 font-semibold">+{reason.score}</span>
                              <span>{reason.description}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Warnings */}
                    {candidate.warnings.length > 0 && (
                      <div className="space-y-1">
                        {candidate.warnings.map((w, wIdx) => (
                          <div
                            key={wIdx}
                            className="px-2.5 py-1 bg-amber-950/40 border border-amber-800/60 rounded text-amber-300 text-[11px]"
                          >
                            ⚠️ {w.message}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Text Body */}
                    {isEditing ? (
                      <div className="space-y-2 pt-1">
                        <textarea
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          rows={3}
                          className="w-full p-2.5 bg-slate-950 border border-blue-500 rounded text-xs text-white focus:outline-none"
                        />
                        <div className="flex justify-end space-x-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setEditingCandidateId(null);
                              setEditText('');
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={!editText.trim()}
                            onClick={() => void handleSaveEdit(candidate.id)}
                          >
                            Save Edit
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-slate-100 leading-relaxed font-sans text-xs">
                          {candidate.reviewedText || candidate.sourceText}
                        </p>
                        {candidate.reviewedText &&
                          candidate.reviewedText !== candidate.sourceText && (
                            <p className="text-[11px] text-slate-500 italic">
                              Source: &ldquo;{candidate.sourceText}&rdquo;
                            </p>
                          )}
                      </div>
                    )}

                    {/* Candidate Action Buttons */}
                    {!isEditing && !isArchivedProject && candidate.reviewStatus !== 'IMPORTED' && (
                      <div className="flex items-center justify-end space-x-2 pt-1 border-t border-slate-800/60">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCandidateId(candidate.id);
                            setEditText(candidate.reviewedText || candidate.sourceText);
                          }}
                          className="px-2 py-1 text-slate-400 hover:text-white transition-colors"
                        >
                          Edit Text
                        </button>

                        {candidate.reviewStatus !== 'APPROVED' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void handleSetStatus([candidate.id], 'APPROVED')}
                          >
                            Approve
                          </Button>
                        )}

                        {candidate.reviewStatus !== 'REJECTED' && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => void handleSetStatus([candidate.id], 'REJECTED')}
                          >
                            Reject
                          </Button>
                        )}

                        {candidate.reviewStatus !== 'PENDING' && (
                          <button
                            type="button"
                            onClick={() => void handleSetStatus([candidate.id], 'PENDING')}
                            className="px-2 py-1 text-slate-400 hover:text-slate-200 transition-colors"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    )}

                    {candidate.reviewStatus === 'IMPORTED' && candidate.importedRequirementId && (
                      <div className="pt-1 text-[11px] text-blue-400">
                        ✓ Imported as Requirement (ID: {candidate.importedRequirementId})
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Dialog>

      {/* Import Confirmation Dialog */}
      <Dialog
        open={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        title="Import Approved Requirement Candidates"
        className="max-w-md"
      >
        <div className="space-y-4 text-xs text-slate-300">
          <p>
            You are about to import{' '}
            <strong className="text-white font-semibold">{counts.approvedCount}</strong> approved
            candidate(s) into your project as <strong className="text-emerald-400">DRAFT</strong>{' '}
            requirements.
          </p>

          <div className="p-3 bg-slate-900 rounded border border-slate-800 space-y-1.5 text-[11px]">
            <p className="font-semibold text-slate-200">Import Guarantees:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li>Atomic key sequence allocation (REQ-xxx).</li>
              <li>Linked to source document: {document.originalFileName}.</li>
              <li>Original source text preserved.</li>
              <li>Candidates marked as Imported.</li>
            </ul>
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={isImporting}
              onClick={() => setShowImportDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={isImporting || counts.approvedCount === 0}
              onClick={() => void handleImportApproved()}
            >
              {isImporting ? (
                <span className="flex items-center space-x-1.5">
                  <Spinner size="sm" />
                  <span>Importing...</span>
                </span>
              ) : (
                `Confirm Import (${counts.approvedCount})`
              )}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
