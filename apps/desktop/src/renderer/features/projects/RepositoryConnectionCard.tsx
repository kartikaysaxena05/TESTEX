/**
 * @file apps/desktop/src/renderer/features/projects/RepositoryConnectionCard.tsx
 * Card component displaying a connected Git repository, provider badge, branch/revision,
 * connection/import status, and lifecycle management actions.
 *
 * CRITICAL INVARIANTS:
 * 1. Truthful connection & import status (no simulated states).
 * 2. Active repository toggle with clear visual indicator.
 * 3. Preflight verification with live feedback.
 * 4. Safe disconnection with user confirmation.
 */

import React, { useState } from 'react';
import type {
  RepositoryConnectionSummary,
  RepositoryVerificationResultDto,
  RepositoryImportResultDto,
} from '@ai-quality/contracts';
import { Badge } from '../../ui/Badge.js';
import { Button } from '../../ui/Button.js';
import { Alert } from '../../ui/Alert.js';
import { Spinner } from '../../ui/Spinner.js';

export interface RepositoryConnectionCardProps {
  readonly connection: RepositoryConnectionSummary;
  readonly isActive: boolean;
  readonly onSetActive: (connectionId: string) => Promise<void>;
  readonly onVerify: (connectionId: string) => Promise<RepositoryVerificationResultDto>;
  readonly onImport: (connectionId: string) => Promise<RepositoryImportResultDto>;
  readonly onDelete: (connectionId: string) => Promise<void>;
}

export function RepositoryConnectionCard({
  connection,
  isActive,
  onSetActive,
  onVerify,
  onImport,
  onDelete,
}: RepositoryConnectionCardProps): React.JSX.Element {
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<RepositoryVerificationResultDto | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<RepositoryImportResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSettingActive, setIsSettingActive] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Status badge styling
  const getStatusBadgeVariant = (status: string): 'success' | 'warning' | 'danger' | 'neutral' => {
    switch (status) {
      case 'IMPORTED':
      case 'ACCESSIBLE':
      case 'CONNECTED':
        return 'success';
      case 'IMPORTING':
      case 'CONFIGURED':
        return 'neutral';
      case 'UNREACHABLE':
      case 'UNAUTHORIZED':
      case 'BLOCKED':
      case 'FAILED':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  const handleVerify = async () => {
    setIsVerifying(true);
    setError(null);
    setVerifyResult(null);
    try {
      const res = await onVerify(connection.id);
      setVerifyResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleImport = async () => {
    setIsImporting(true);
    setError(null);
    setImportResult(null);
    try {
      const res = await onImport(connection.id);
      setImportResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleSetActive = async () => {
    if (isActive || isSettingActive) return;
    setIsSettingActive(true);
    setError(null);
    try {
      await onSetActive(connection.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to set active repository.');
    } finally {
      setIsSettingActive(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await onDelete(connection.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect repository.');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div
      className="repository-connection-card"
      data-testid={`repo-card-${connection.id}`}
      style={{
        padding: '16px 20px',
        borderRadius: '10px',
        backgroundColor: 'var(--color-bg-secondary, #1f2937)',
        border: isActive
          ? '1.5px solid var(--color-primary, #3b82f6)'
          : '1px solid var(--color-border, #374151)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {/* Top Header Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ color: 'var(--color-text-primary, #ffffff)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--color-text-primary, #ffffff)' }}>
              {connection.owner}/{connection.repositoryName}
            </h4>
            <a
              href={connection.repositoryUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '0.8rem', color: 'var(--color-primary, #3b82f6)', textDecoration: 'none' }}
            >
              {connection.repositoryUrl}
            </a>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isActive && (
            <Badge variant="success">
              Active Source
            </Badge>
          )}
          <Badge variant={getStatusBadgeVariant(connection.connectionStatus)}>
            {connection.connectionStatus}
          </Badge>
          <Badge variant="neutral">
            {connection.provider}
          </Badge>
        </div>
      </div>

      {/* Meta Row: Branch, Revision, Import Status */}
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
        <div>
          Branch: <strong style={{ color: 'var(--color-text-primary, #ffffff)' }}>{connection.selectedBranch}</strong>
        </div>
        {connection.selectedRevision && (
          <div>
            Revision:{' '}
            <code style={{ color: 'var(--color-primary, #93c5fd)', backgroundColor: 'rgba(59, 130, 246, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
              {connection.selectedRevision.slice(0, 7)}
            </code>
          </div>
        )}
        <div>
          Visibility: <span style={{ textTransform: 'capitalize' }}>{connection.visibility.toLowerCase()}</span>
        </div>
        <div>
          Import:{' '}
          <Badge variant={connection.importStatus === 'IMPORTED' ? 'success' : connection.importStatus === 'IMPORTING' ? 'neutral' : 'warning'}>
            {connection.importStatus}
          </Badge>
        </div>
        {connection.lastVerifiedAt && (
          <div style={{ marginLeft: 'auto', fontSize: '0.75rem' }}>
            Verified: {new Date(connection.lastVerifiedAt).toLocaleString()}
          </div>
        )}
      </div>

      {/* Feedback Messages */}
      {error && (
        <Alert variant="danger" title="Error">
          {error}
        </Alert>
      )}

      {verifyResult && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            backgroundColor: verifyResult.accessible ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${verifyResult.accessible ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            fontSize: '0.85rem',
            color: verifyResult.accessible ? '#6ee7b7' : '#fca5a5',
          }}
        >
          {verifyResult.accessible ? 'Repository is accessible' : (verifyResult.errorMessage || 'Repository is inaccessible')} &bull; Status: {verifyResult.status}
        </div>
      )}

      {importResult && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            backgroundColor: importResult.status === 'IMPORTED' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${importResult.status === 'IMPORTED' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            fontSize: '0.85rem',
            color: importResult.status === 'IMPORTED' ? '#6ee7b7' : '#fca5a5',
          }}
        >
          {importResult.status === 'IMPORTED'
            ? `Import completed: ${importResult.fileCount} files (${(importResult.totalSizeBytes / 1024).toFixed(1)} KB) imported in ${importResult.durationMs}ms.`
            : `Import ${importResult.status.toLowerCase()}: ${importResult.errorMessage || 'No details provided'}`}
        </div>
      )}

      {/* Delete Confirmation Alert */}
      {showDeleteConfirm && (
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
        >
          <span style={{ fontSize: '0.85rem', color: '#fca5a5' }}>
            Are you sure you want to disconnect this repository?
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? <Spinner size="sm" /> : 'Confirm Disconnect'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
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
        {!isActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSetActive}
            disabled={isSettingActive}
          >
            {isSettingActive ? <Spinner size="sm" /> : 'Set Active'}
          </Button>
        )}

        <Button
          variant="secondary"
          size="sm"
          onClick={handleVerify}
          disabled={isVerifying || isImporting}
        >
          {isVerifying ? <Spinner size="sm" /> : 'Verify Access'}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={handleImport}
          disabled={isImporting || isVerifying}
        >
          {isImporting ? <Spinner size="sm" /> : 'Import Source'}
        </Button>

        {!showDeleteConfirm && (
          <Button
            variant="danger"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isDeleting || isImporting}
          >
            Disconnect
          </Button>
        )}
      </div>
    </div>
  );
}
