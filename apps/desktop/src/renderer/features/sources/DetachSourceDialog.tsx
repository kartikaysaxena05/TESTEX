/**
 * @file apps/desktop/src/renderer/features/sources/DetachSourceDialog.tsx
 * Confirmation dialog for detaching a local project source.
 */

import React from 'react';
import { Dialog, Button, Alert } from '../../ui/index.js';

export interface DetachSourceDialogProps {
  readonly isOpen: boolean;
  readonly isSubmitting?: boolean;
  readonly sourceName: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function DetachSourceDialog({
  isOpen,
  isSubmitting = false,
  sourceName,
  onConfirm,
  onCancel,
}: DetachSourceDialogProps): React.JSX.Element {
  return (
    <Dialog
      open={isOpen}
      onClose={onCancel}
      title="Detach Source Project"
      description={`Are you sure you want to detach "${sourceName}" from this QA project?`}
      footer={
        <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={isSubmitting}>
            Detach Project
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <Alert variant="info" title="Filesystem Safety Guarantee">
          Detaching this source will only remove the association in the platform. No source code,
          git histories, or files on your disk will be modified or deleted.
        </Alert>
        <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
          You can re-attach this directory or connect a different project at any time.
        </p>
      </div>
    </Dialog>
  );
}
