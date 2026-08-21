/**
 * @file apps/desktop/src/renderer/features/requirements/RequirementDocumentsList.tsx
 * Component for viewing attached requirement documents (SRS files), metadata, and secure file ingestion.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { RequirementDocumentDto } from '@ai-quality/contracts';
import { Button, Badge, Spinner, EmptyState, Dialog, type BadgeVariant } from '../../ui/index.js';
import { DocumentExtractionModal } from './DocumentExtractionModal.js';
import { RequirementCandidatesModal } from './RequirementCandidatesModal.js';

interface RequirementDocumentsListProps {
  readonly projectId: string;
  readonly isArchivedProject?: boolean;
}

export function RequirementDocumentsList({
  projectId,
  isArchivedProject = false,
}: RequirementDocumentsListProps): React.JSX.Element {
  const [documents, setDocuments] = useState<readonly RequirementDocumentDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isIngesting, setIsIngesting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingDoc, setDeletingDoc] = useState<RequirementDocumentDto | null>(null);
  const [extractingDoc, setExtractingDoc] = useState<RequirementDocumentDto | null>(null);
  const [candidatesDoc, setCandidatesDoc] = useState<RequirementDocumentDto | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const fetchDocuments = useCallback(async (): Promise<void> => {
    if (!projectId) {
      setDocuments([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (!window.desktop?.requirementDocuments?.list) {
        throw new Error('Desktop requirement documents API is not available.');
      }

      const res = await window.desktop.requirementDocuments.list({ projectId });
      if (res.ok) {
        setDocuments(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load requirement documents.');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleSelectAndIngest = async (): Promise<void> => {
    if (isArchivedProject || isIngesting) {
      return;
    }

    setError(null);
    setIsIngesting(true);

    try {
      if (!window.desktop?.requirementDocuments?.selectAndIngest) {
        throw new Error('Desktop requirement documents API is not available.');
      }

      const res = await window.desktop.requirementDocuments.selectAndIngest({ projectId });
      if (!res.ok) {
        setError(res.error.message);
      } else if (!res.data.canceled) {
        await fetchDocuments();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to ingest requirement document.');
    } finally {
      setIsIngesting(false);
    }
  };

  const handleConfirmDelete = async (): Promise<void> => {
    if (!deletingDoc) return;

    setIsDeleting(true);
    setError(null);

    try {
      if (!window.desktop?.requirementDocuments?.delete) {
        throw new Error('Desktop requirement documents API is not available.');
      }

      const res = await window.desktop.requirementDocuments.delete({
        projectId,
        documentId: deletingDoc.id,
      });

      if (!res.ok) {
        setError(res.error.message);
      } else {
        setDeletingDoc(null);
        await fetchDocuments();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete requirement document.');
    } finally {
      setIsDeleting(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getFormatBadgeVariant = (format: string): BadgeVariant => {
    switch (format.toLowerCase()) {
      case 'pdf':
        return 'danger';
      case 'docx':
        return 'info';
      case 'md':
        return 'success';
      case 'txt':
      default:
        return 'neutral';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-neutral-200">
              Attached Requirement Documents
            </h2>
            <Badge variant="info">{documents.length}</Badge>
          </div>
          <p className="text-xs text-neutral-400 mt-0.5">
            Ingested SRS and requirement specifications stored securely in platform-managed storage.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchDocuments()}
            disabled={isLoading || isIngesting}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSelectAndIngest}
            disabled={isArchivedProject || isIngesting}
          >
            {isIngesting ? 'Ingesting...' : '+ Attach Document'}
          </Button>
        </div>
      </div>

      {/* Format tip banner */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 text-xs text-neutral-400 flex items-center justify-between">
        <span>
          Supported document types: <code className="text-blue-300">.pdf</code>,{' '}
          <code className="text-blue-300">.docx</code>, <code className="text-blue-300">.txt</code>,{' '}
          <code className="text-blue-300">.md</code> (Max 25 MB). Files are copied to
          application-managed storage; your original file is never modified.
        </span>
      </div>

      {/* Error alert */}
      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 p-3.5 text-xs text-rose-300 flex items-center justify-between">
          <span>⚠️ {error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-200 font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="p-12 flex flex-col items-center justify-center space-y-3">
          <Spinner size="md" />
          <p className="text-xs text-neutral-400">Loading requirement documents...</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && documents.length === 0 && (
        <div className="p-8 bg-neutral-900/40 border border-neutral-800 rounded-xl">
          <EmptyState
            screenId="requirement-documents-empty"
            title="No Requirement Documents Attached"
            description="Attach SRS documents (PDF, DOCX, TXT, MD) to this project to securely maintain specification evidence and establish requirement provenance."
            icon={
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            }
            action={
              !isArchivedProject ? (
                <Button variant="primary" onClick={handleSelectAndIngest} disabled={isIngesting}>
                  {isIngesting ? 'Ingesting...' : '+ Attach Document'}
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      {/* Documents table */}
      {!isLoading && documents.length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-950/60 text-xs font-semibold uppercase text-neutral-400">
                  <th className="py-3 px-4">Document Name</th>
                  <th className="py-3 px-4">Format</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4">SHA-256 Hash</th>
                  <th className="py-3 px-4">Attached At</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {documents.map(doc => (
                  <tr key={doc.id} className="hover:bg-neutral-800/30 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-neutral-200">
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-400">📄</span>
                        <span className="truncate max-w-xs">{doc.originalFileName}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <Badge variant={getFormatBadgeVariant(doc.fileExtension)}>
                        {doc.fileExtension.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-xs text-neutral-400">
                      {formatFileSize(doc.fileSize)}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap font-mono text-[11px] text-neutral-400">
                      <span title={doc.sha256}>
                        {doc.sha256.slice(0, 12)}...{doc.sha256.slice(-6)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-xs text-neutral-500">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setExtractingDoc(doc)}>
                          Extract & View
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setCandidatesDoc(doc)}>
                          Candidates
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setDeletingDoc(doc)}
                          disabled={isArchivedProject || isDeleting}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Document Extraction Modal */}
      <DocumentExtractionModal
        isOpen={Boolean(extractingDoc)}
        projectId={projectId}
        document={extractingDoc}
        onClose={() => setExtractingDoc(null)}
      />

      {/* Requirement Candidates Modal */}
      <RequirementCandidatesModal
        isOpen={Boolean(candidatesDoc)}
        projectId={projectId}
        document={candidatesDoc}
        isArchivedProject={isArchivedProject}
        onClose={() => setCandidatesDoc(null)}
        onImportSuccess={() => fetchDocuments()}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deletingDoc)}
        onClose={() => setDeletingDoc(null)}
        title="Delete Requirement Document"
        description="Are you sure you want to remove this attached requirement document?"
      >
        <div className="space-y-4 pt-2">
          {deletingDoc && (
            <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-lg text-xs text-neutral-300 space-y-1">
              <div>
                <span className="text-neutral-500">Document: </span>
                <span className="font-semibold text-white">{deletingDoc.originalFileName}</span>
              </div>
              <div>
                <span className="text-neutral-500">SHA-256: </span>
                <span className="font-mono text-neutral-400">{deletingDoc.sha256}</span>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-300">
            Removing this document deletes the managed application copy and database reference. Your
            original external file will <strong>not</strong> be modified or deleted.
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setDeletingDoc(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete Document'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
