/**
 * @file apps/desktop/src/renderer/features/sources/ChangeSourceDialog.tsx
 * Confirmation dialog for replacing an attached project source with a new directory.
 */

import React from 'react';
import { Dialog, Button, Alert } from '../../ui/index.js';

export interface ChangeSourceDialogProps {
  readonly isOpen: boolean;
  readonly isSubmitting?: boolean;
  readonly currentPath: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ChangeSourceDialog({
  isOpen,
  isSubmitting = false,
  currentPath,
  onConfirm,
  onCancel,
}: ChangeSourceDialogProps): React.JSX.Element {
  return (
    <Dialog
      open={isOpen}
      onClose={onCancel}
      title="Change Source Project Directory"
      description="Selecting a new folder will replace the currently attached project directory."
      footer={
        <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} loading={isSubmitting}>
            Choose New Folder
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <Alert variant="info" title="Current Attachment">
          Currently attached path:{' '}
          <code style={{ wordBreak: 'break-all', fontFamily: 'var(--font-mono)' }}>
            {currentPath}
          </code>
        </Alert>
        <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
          Clicking &quot;Choose New Folder&quot; will open the native folder picker. If you cancel
          the selection, the existing project attachment will remain unchanged.
        </p>
      </div>
    </Dialog>
  );
}
