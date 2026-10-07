/**
 * @file apps/desktop/src/renderer/features/projects/ConnectLocalFolderModal.tsx
 * Modal dialog for selecting and connecting a local project directory to a V8 project.
 *
 * CRITICAL INVARIANTS:
 * 1. Native folder selection via trusted electron dialog (`pickDirectory`).
 * 2. Real path validation and server-side canonical root containment.
 * 3. Clear feedback on access/permission/validation errors.
 * 4. Audit violation notification and zero simulated paths.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { LocalFolderConnectionDto } from '@ai-quality/contracts';
import { Button } from '../../ui/Button.js';
import { Alert } from '../../ui/Alert.js';
import { Spinner } from '../../ui/Spinner.js';

export interface ConnectLocalFolderModalProps {
  readonly isOpen: boolean;
  readonly projectId: string;
  readonly projectName: string;
  readonly initialFolderPath?: string;
  readonly onClose: () => void;
  readonly onSuccess: (connection: LocalFolderConnectionDto) => void;
}

export function ConnectLocalFolderModal({
  isOpen,
  projectId,
  projectName,
  initialFolderPath = '',
  onClose,
  onSuccess,
}: ConnectLocalFolderModalProps): React.JSX.Element | null {
  const [folderPath, setFolderPath] = useState(initialFolderPath);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFolderPath(initialFolderPath);
      setIsBrowsing(false);
      setIsSubmitting(false);
      setError(null);
    }
  }, [isOpen, initialFolderPath]);

  // Escape key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting && !isBrowsing) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, isBrowsing, onClose]);

  const handleBrowse = useCallback(async () => {
    if (!window.desktop?.sources?.pickDirectory) {
      setError('Native folder picker is unavailable in this environment.');
      return;
    }

    setIsBrowsing(true);
    setError(null);

    try {
      const result = await window.desktop.sources.pickDirectory();
      if (!result.ok) {
        setError(result.error.message || 'Failed to select directory.');
        return;
      }

      if (!result.data.cancelled && result.data.directoryPath) {
        setFolderPath(result.data.directoryPath);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error launching directory dialog.');
    } finally {
      setIsBrowsing(false);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedPath = folderPath.trim();
    if (!trimmedPath) {
      setError('Please select or specify a valid local directory path.');
      return;
    }

    if (!window.desktop?.localFolder?.connect) {
      setError('Local folder connection IPC service is unavailable.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await window.desktop.localFolder.connect({
        projectId,
        directoryPath: trimmedPath,
      });

      if (!res.ok) {
        setError(res.error.message);
        return;
      }

      onSuccess(res.data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect local directory.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="modal-overlay"
      data-testid="connect-local-folder-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={e => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div
        className="modal-dialog"
        data-testid="connect-local-folder-modal"
        role="dialog"
        aria-labelledby="connect-local-folder-title"
        aria-modal="true"
        style={{
          backgroundColor: 'var(--color-bg-primary, #111827)',
          border: '1px solid var(--color-border, #374151)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '560px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.3)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <h2
              id="connect-local-folder-title"
              data-testid="connect-local-folder-title"
              style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-text-primary, #ffffff)', margin: 0 }}
            >
              Connect Local Project Folder
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary, #9ca3af)', marginTop: '4px' }}>
              Select a local workspace directory on your machine for <strong>{projectName}</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            data-testid="connect-folder-close-btn"
            disabled={isSubmitting}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-muted, #6b7280)',
              cursor: 'pointer',
              fontSize: '1.25rem',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Security Boundary Notice */}
        <div
          style={{
            padding: '12px 14px',
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: '8px',
            fontSize: '0.825rem',
            color: '#93c5fd',
            lineHeight: '1.4',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
          }}
        >
          <span style={{ fontSize: '1.1rem' }}>🛡️</span>
          <div>
            <strong>Strict Project Root Isolation:</strong> Platform intelligence and test agents are strictly bounded
            to this folder. Directory traversal (<code>../</code>) and symlink escapes outside the project root are
            prohibited and audited.
          </div>
        </div>

        {error && (
          <Alert variant="danger" data-testid="connect-folder-error">
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Folder Path Input & Browse Button */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label
              htmlFor="folder-path-input"
              style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-primary, #ffffff)' }}
            >
              Directory Path <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                id="folder-path-input"
                data-testid="folder-path-input"
                type="text"
                value={folderPath}
                onChange={e => setFolderPath(e.target.value)}
                placeholder="/path/to/my-project"
                disabled={isSubmitting}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border, #374151)',
                  backgroundColor: 'var(--color-bg-secondary, #1f2937)',
                  color: 'var(--color-text-primary, #ffffff)',
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                }}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleBrowse}
                disabled={isSubmitting || isBrowsing}
                data-testid="browse-folder-btn"
              >
                {isBrowsing ? <Spinner size="sm" /> : 'Browse...'}
              </Button>
            </div>
          </div>

          {/* Action Buttons */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '8px',
              paddingTop: '16px',
              borderTop: '1px solid var(--color-border, #374151)',
            }}
          >
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isSubmitting}
              data-testid="cancel-connect-folder-btn"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting || !folderPath.trim()}
              data-testid="submit-connect-folder-btn"
            >
              {isSubmitting ? (
                <>
                  <Spinner size="sm" />
                  <span style={{ marginLeft: '6px' }}>Connecting...</span>
                </>
              ) : (
                'Connect Folder'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
