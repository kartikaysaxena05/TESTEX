/**
 * @file apps/desktop/src/renderer/features/requirements/DeleteRequirementDialog.tsx
 * Confirmation dialog for permanently deleting a manually entered requirement.
 */

import React, { useState } from 'react';
import type { RequirementDto } from '@ai-quality/contracts';
import { Button } from '../../ui/index.js';

interface DeleteRequirementDialogProps {
  readonly isOpen: boolean;
  readonly requirement: RequirementDto | null;
  readonly onClose: () => void;
  readonly onConfirmDelete: (requirementId: string) => Promise<{ ok: boolean; error?: string }>;
}

export function DeleteRequirementDialog({
  isOpen,
  requirement,
  onClose,
  onConfirmDelete,
}: DeleteRequirementDialogProps): React.JSX.Element | null {
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!isOpen || !requirement) return null;

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);

    const res = await onConfirmDelete(requirement.id);
    if (res.ok) {
      setIsDeleting(false);
      onClose();
    } else {
      setDeleteError(res.error || 'Failed to delete requirement.');
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-requirement-title"
    >
      <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden p-6 space-y-4">
        <h2 id="delete-requirement-title" className="text-lg font-semibold text-rose-400">
          Delete Requirement
        </h2>

        <p className="text-sm text-neutral-300">
          Are you sure you want to permanently delete requirement{' '}
          <strong className="text-white font-mono">{requirement.requirementKey}</strong> (
          <em>{requirement.title}</em>)?
        </p>

        <p className="text-xs text-neutral-400">
          This operation is permanent and removes the requirement from this project.
        </p>

        {deleteError && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-sm text-rose-400">
            {deleteError}
          </div>
        )}

        <div className="pt-3 border-t border-neutral-800 flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete Permanently'}
          </Button>
        </div>
      </div>
    </div>
  );
}
