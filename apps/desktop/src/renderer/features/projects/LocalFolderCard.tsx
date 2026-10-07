/**
 * @file apps/desktop/src/renderer/features/projects/LocalFolderCard.tsx
 * Card component displaying the connected local project folder, filesystem status,
 * Git metadata, and lifecycle management actions (Validate, Change, Disconnect).
 *
 * CRITICAL INVARIANTS:
 * 1. Truthful filesystem connection status (CONNECTED, DISCONNECTED, MISSING, PERMISSION_DENIED).
 * 2. Real-time validation button with live status refresh.
 * 3. Safe folder disconnection with user confirmation.
 * 4. Zero path leakage beyond the canonical project root.
 */

import React, { useState } from 'react';
import type { LocalFolderConnectionDto, LocalFolderStatus } from '@ai-quality/contracts';
import { Badge } from '../../ui/Badge.js';
import { Button } from '../../ui/Button.js';
import { Alert } from '../../ui/Alert.js';
import { Spinner } from '../../ui/Spinner.js';

export interface LocalFolderCardProps {
  readonly localFolder: LocalFolderConnectionDto;
  readonly onValidate: () => Promise<LocalFolderConnectionDto>;
  readonly onChangeFolder: () => void;
  readonly onDisconnect: () => Promise<void>;
}

export function LocalFolderCard({
  localFolder,
  onValidate,
  onChangeFolder,
  onDisconnect,
}: LocalFolderCardProps): React.JSX.Element {
  const [isValidating, setIsValidating] = useState(false);
  const [validatedData, setValidatedData] = useState<LocalFolderConnectionDto | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentFolder = validatedData ?? localFolder;

  const getStatusBadgeVariant = (
    status: LocalFolderStatus,
  ): 'success' | 'warning' | 'danger' | 'neutral' => {
    switch (status) {
      case 'CONNECTED':
        return 'success';
      case 'DISCONNECTED':
        return 'neutral';
      case 'MISSING':
      case 'PERMISSION_DENIED':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  const getStatusLabel = (status: LocalFolderStatus): string => {
    switch (status) {
      case 'CONNECTED':
        return 'Connected';
      case 'DISCONNECTED':
        return 'Disconnected';
      case 'MISSING':
        return 'Folder Missing';
      case 'PERMISSION_DENIED':
        return 'Permission Denied';
      default:
        return status;
    }
  };

  const handleValidate = async () => {
    setIsValidating(true);
    setError(null);
    try {
      const refreshed = await onValidate();
      setValidatedData(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    setError(null);
    try {
      await onDisconnect();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect folder.');
    } finally {
      setIsDisconnecting(false);
      setShowDisconnectConfirm(false);
    }
  };

  const isHealthy = currentFolder.status === 'CONNECTED';

  return (
    <div
      className="local-folder-card"
      data-testid="local-folder-card"
      style={{
        padding: '16px 20px',
        borderRadius: '10px',
        backgroundColor: 'var(--color-bg-secondary, #1f2937)',
        border: isHealthy
          ? '1.5px solid var(--color-primary, #3b82f6)'
          : '1.5px solid rgba(239, 68, 68, 0.4)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {/* Top Header Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ color: 'var(--color-primary, #3b82f6)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div>
            <h4
              style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--color-text-primary, #ffffff)' }}
              data-testid="local-folder-title"
            >
              Connected Local Project Folder
            </h4>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                color: isHealthy ? 'var(--color-text-secondary, #9ca3af)' : '#fca5a5',
                wordBreak: 'break-all',
              }}
              data-testid="local-folder-path"
            >
              {currentFolder.rootPath}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Badge variant={getStatusBadgeVariant(currentFolder.status)} data-testid="local-folder-status-badge">
            {getStatusLabel(currentFolder.status)}
          </Badge>
          {currentFolder.isGitRepository && (
            <Badge variant="info">
              Git Repo
            </Badge>
          )}
        </div>
      </div>

      {/* Meta Row: Git branch, commit sha, last validated */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          fontSize: '0.85rem',
          color: 'var(--color-text-secondary, #9ca3af)',
          flexWrap: 'wrap',
        }}
      >
        {currentFolder.isGitRepository && currentFolder.currentBranch && (
          <div>
            Branch: <strong style={{ color: 'var(--color-text-primary, #ffffff)' }}>{currentFolder.currentBranch}</strong>
          </div>
        )}
        {currentFolder.isGitRepository && currentFolder.headCommit && (
          <div>
            Commit:{' '}
            <code style={{ color: 'var(--color-primary, #93c5fd)', backgroundColor: 'rgba(59, 130, 246, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
              {currentFolder.headCommit.slice(0, 7)}
            </code>
          </div>
        )}
        {currentFolder.displayName && (
          <div>
            Folder: <strong style={{ color: 'var(--color-text-primary, #ffffff)' }}>{currentFolder.displayName}</strong>
          </div>
        )}
        <div style={{ marginLeft: 'auto', fontSize: '0.75rem' }}>
          Last Checked:{' '}
          {currentFolder.lastValidatedAt ? new Date(currentFolder.lastValidatedAt).toLocaleString() : 'Never'}
        </div>
      </div>

      {/* Warning Callout for Missing/Permission Denied States */}
      {!isHealthy && (
        <Alert
          variant="danger"
          title={currentFolder.status === 'MISSING' ? 'Directory Not Found' : 'Permission Denied'}
          data-testid="local-folder-error-alert"
        >
          {currentFolder.status === 'MISSING'
            ? 'The configured project directory cannot be found at the specified path on this machine.'
            : currentFolder.status === 'PERMISSION_DENIED'
            ? 'The application lacks read permissions to access the configured directory path.'
            : 'The configured directory path is disconnected or inaccessible.'}
        </Alert>
      )}

      {error && (
        <Alert variant="danger" title="Operation Error">
          {error}
        </Alert>
      )}

      {/* Disconnect Confirmation Alert */}
      {showDisconnectConfirm && (
        <div
          style={{
            padding: '12px',
            borderRadius: '8px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
          data-testid="disconnect-confirm-box"
        >
          <span style={{ fontSize: '0.85rem', color: '#fca5a5' }}>
            Are you sure you want to disconnect this local directory? Platform services will lose access to local files.
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              data-testid="confirm-disconnect-btn"
            >
              {isDisconnecting ? <Spinner size="sm" /> : 'Confirm Disconnect'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDisconnectConfirm(false)}
              disabled={isDisconnecting}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Action Buttons Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '8px',
          paddingTop: '6px',
          borderTop: '1px solid var(--color-border, #374151)',
        }}
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={handleValidate}
          disabled={isValidating || isDisconnecting}
          data-testid="validate-folder-btn"
        >
          {isValidating ? <Spinner size="sm" /> : 'Validate Access'}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={onChangeFolder}
          disabled={isValidating || isDisconnecting}
          data-testid="change-folder-btn"
        >
          Change Folder
        </Button>

        {!showDisconnectConfirm && (
          <Button
            variant="danger"
            size="sm"
            onClick={() => setShowDisconnectConfirm(true)}
            disabled={isDisconnecting || isValidating}
            data-testid="disconnect-folder-btn"
          >
            Disconnect
          </Button>
        )}
      </div>
    </div>
  );
}
