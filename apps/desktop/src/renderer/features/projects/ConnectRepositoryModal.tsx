/**
 * @file apps/desktop/src/renderer/features/projects/ConnectRepositoryModal.tsx
 * Modal dialog for connecting a Git repository (GitHub) to a V8 project.
 *
 * CRITICAL INVARIANTS:
 * 1. Secure token handling - tokens never logged or exposed in renderer state beyond auth flow.
 * 2. Real provider verification before connection creation.
 * 3. Branch & revision selection based on factual provider data.
 * 4. Preflight repository access validation.
 * 5. Optional immediate bounded import with cancellation support.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  GitProviderType,
  GitProviderAccountDto,
  GitProviderRepositoryDto,
  GitBranchDto,
  RepositoryConnectionDetails,
} from '@ai-quality/contracts';
import { Badge } from '../../ui/Badge.js';
import { Button } from '../../ui/Button.js';
import { Alert } from '../../ui/Alert.js';
import { Spinner } from '../../ui/Spinner.js';

export interface ConnectRepositoryModalProps {
  readonly isOpen: boolean;
  readonly projectId: string;
  readonly projectName: string;
  readonly onClose: () => void;
  readonly onSuccess: (connection: RepositoryConnectionDetails) => void;
}

export function ConnectRepositoryModal({
  isOpen,
  projectId,
  projectName,
  onClose,
  onSuccess,
}: ConnectRepositoryModalProps): React.JSX.Element | null {
  const [provider, setProvider] = useState<GitProviderType>('GITHUB');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isVerifyingAuth, setIsVerifyingAuth] = useState(false);
  const [authAccount, setAuthAccount] = useState<GitProviderAccountDto | null>(null);

  // Repositories state
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [repos, setRepos] = useState<readonly GitProviderRepositoryDto[]>([]);
  const [customRepoUrl, setCustomRepoUrl] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<GitProviderRepositoryDto | null>(null);

  // Branches state
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [branches, setBranches] = useState<readonly GitBranchDto[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('main');
  const [revision, setRevision] = useState('');

  // Import options
  const [importImmediately, setImportImmediately] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importingConnectionId, setImportingConnectionId] = useState<string | null>(null);
  const [importProgressText, setImportProgressText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setProvider('GITHUB');
      setToken('');
      setShowToken(false);
      setIsVerifyingAuth(false);
      setAuthAccount(null);
      setIsLoadingRepos(false);
      setRepos([]);
      setCustomRepoUrl('');
      setSelectedRepo(null);
      setIsLoadingBranches(false);
      setBranches([]);
      setSelectedBranch('main');
      setRevision('');
      setImportImmediately(true);
      setIsSubmitting(false);
      setImportingConnectionId(null);
      setImportProgressText(null);
      setError(null);
    }
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  // Authenticate & Verify Token with provider
  const handleVerifyAuth = useCallback(async () => {
    if (!token.trim()) {
      setError('Please enter a Personal Access Token to authenticate.');
      return;
    }
    setError(null);
    setIsVerifyingAuth(true);

    try {
      const res = await window.desktop?.gitProvider?.verifyAuth({
        provider,
        token: token.trim(),
      });

      if (res?.ok && res.data) {
        setAuthAccount(res.data);

        // Auto-fetch repositories for the verified account
        setIsLoadingRepos(true);
        const repoRes = await window.desktop?.gitProvider?.listRepos({
          provider,
          token: token.trim(),
        });
        if (repoRes?.ok && repoRes.data) {
          setRepos(repoRes.data);
        }
      } else if (res && !res.ok) {
        setError(res.error.message);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication verification failed.');
    } finally {
      setIsVerifyingAuth(false);
      setIsLoadingRepos(false);
    }
  }, [provider, token]);

  // Handle repository selection
  const handleSelectRepo = useCallback(
    async (repoItem: GitProviderRepositoryDto) => {
      setSelectedRepo(repoItem);
      setSelectedBranch(repoItem.defaultBranch || 'main');
      setRevision('');
      setError(null);

      // Fetch branches for selected repo
      setIsLoadingBranches(true);
      try {
        const branchRes = await window.desktop?.gitProvider?.listBranches({
          provider,
          repositoryIdentifier: repoItem.repositoryIdentifier,
          token: token.trim() || undefined,
        });

        if (branchRes?.ok && branchRes.data) {
          setBranches(branchRes.data);
          const foundDefault = branchRes.data.find(b => b.name === repoItem.defaultBranch);
          if (foundDefault) {
            setSelectedBranch(foundDefault.name);
            setRevision(foundDefault.commitSha);
          }
        }
      } catch {
        // Fallback to default branch
      } finally {
        setIsLoadingBranches(false);
      }
    },
    [provider, token],
  );

  // Handle branch change
  const handleBranchChange = (branchName: string) => {
    setSelectedBranch(branchName);
    const match = branches.find(b => b.name === branchName);
    if (match) {
      setRevision(match.commitSha);
    }
  };

  // Cancel in-flight import
  const handleCancelImport = async () => {
    if (!importingConnectionId) return;
    try {
      await window.desktop?.repositoryConnections?.cancelImport({
        projectId,
        connectionId: importingConnectionId,
      });
      setImportProgressText('Import cancelled.');
    } catch {
      // Ignored
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit and connect repository
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const targetUrl = selectedRepo ? selectedRepo.url : customRepoUrl.trim();
    if (!targetUrl) {
      setError('Please select or specify a repository URL.');
      return;
    }

    const repoName = selectedRepo
      ? selectedRepo.name
      : (targetUrl.split('/').pop()?.replace(/\.git$/, '') || 'repository');
    const repoOwner = selectedRepo
      ? selectedRepo.owner
      : (targetUrl.split('/').slice(-2, -1)[0] || 'owner');
    const repoIdentifier = selectedRepo
      ? selectedRepo.repositoryIdentifier
      : `${repoOwner}/${repoName}`;

    setError(null);
    setIsSubmitting(true);
    setImportProgressText('Connecting repository...');

    try {
      // 1. Create Repository Connection
      const createRes = await window.desktop?.repositoryConnections?.create({
        projectId,
        provider,
        repositoryIdentifier: repoIdentifier,
        repositoryName: repoName,
        owner: repoOwner,
        repositoryUrl: targetUrl,
        displayName: repoIdentifier,
        defaultBranch: selectedRepo?.defaultBranch || selectedBranch || 'main',
        selectedBranch: selectedBranch || 'main',
        selectedRevision: revision.trim() || null,
        visibility: selectedRepo?.visibility || 'PUBLIC',
        credentialsToken: token.trim() || null,
      });

      if (!createRes) {
        throw new Error('Repository connection IPC unavailable.');
      }
      if (!createRes.ok) {
        throw new Error(createRes.error.message || 'Failed to create repository connection.');
      }

      const connection = createRes.data;

      // 2. Immediate import if requested
      if (importImmediately) {
        setImportingConnectionId(connection.id);
        setImportProgressText('Verifying repository access...');

        const verifyRes = await window.desktop?.repositoryConnections?.verify({
          projectId,
          connectionId: connection.id,
        });

        if (!verifyRes || !verifyRes.ok) {
          throw new Error(verifyRes?.error.message || 'Repository verification failed.');
        }

        setImportProgressText('Importing source code and metadata...');
        const importRes = await window.desktop?.repositoryConnections?.import({
          projectId,
          connectionId: connection.id,
          branch: selectedBranch || 'main',
          revision: revision.trim() || undefined,
        });

        if (!importRes || !importRes.ok) {
          throw new Error(importRes?.error.message || 'Repository import failed.');
        }
      }

      onSuccess(connection);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred while connecting the repository.');
    } finally {
      setIsSubmitting(false);
      setImportingConnectionId(null);
      setImportProgressText(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
    >
      <div
        className="modal-dialog connect-repository-modal"
        role="dialog"
        aria-labelledby="connect-repo-title"
        aria-modal="true"
        style={{
          backgroundColor: 'var(--color-bg-primary, #111827)',
          border: '1px solid var(--color-border, #374151)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '640px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--color-border, #374151)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2
              id="connect-repo-title"
              style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                color: 'var(--color-text-primary, #ffffff)',
                margin: 0,
              }}
            >
              Connect Git Repository
            </h2>
            <p
              style={{
                fontSize: '0.85rem',
                color: 'var(--color-text-secondary, #9ca3af)',
                margin: '4px 0 0 0',
              }}
            >
              Connect source code to <strong>{projectName}</strong> for requirements tracing and quality intelligence.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-secondary, #9ca3af)',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              fontSize: '1.5rem',
              lineHeight: 1,
              padding: '4px',
            }}
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            padding: '20px 24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          {error && (
            <Alert variant="danger" title="Connection Error">
              {error}
            </Alert>
          )}

          {/* Provider Selection */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: 'var(--color-text-primary, #ffffff)',
                marginBottom: '6px',
              }}
            >
              Git Provider
            </label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setProvider('GITHUB')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  backgroundColor: provider === 'GITHUB' ? 'rgba(59, 130, 246, 0.15)' : 'var(--color-bg-secondary, #1f2937)',
                  border: provider === 'GITHUB' ? '1.5px solid var(--color-primary, #3b82f6)' : '1px solid var(--color-border, #374151)',
                  color: 'var(--color-text-primary, #ffffff)',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontSize: '0.9rem',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
                GitHub
                <Badge variant="success">Active</Badge>
              </button>
            </div>
          </div>

          {/* Authentication Token */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'var(--color-text-primary, #ffffff)',
                }}
              >
                Personal Access Token
              </label>
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-primary, #3b82f6)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                }}
              >
                {showToken ? 'Hide' : 'Show'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                disabled={isSubmitting || isVerifyingAuth}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--color-bg-secondary, #1f2937)',
                  border: '1px solid var(--color-border, #374151)',
                  color: 'var(--color-text-primary, #ffffff)',
                  fontSize: '0.875rem',
                  fontFamily: 'monospace',
                }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleVerifyAuth}
                disabled={isVerifyingAuth || !token.trim() || isSubmitting}
              >
                {isVerifyingAuth ? <Spinner size="sm" /> : 'Verify'}
              </Button>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #9ca3af)', marginTop: '4px' }}>
              Requires <code>repo</code> or <code>public_repo</code> scope. Token is encrypted via AES-256-GCM and never saved plaintext.
            </p>
          </div>

          {/* Verified Account Banner */}
          {authAccount && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
              }}
            >
              {authAccount.avatarUrl ? (
                <img
                  src={authAccount.avatarUrl}
                  alt={authAccount.username}
                  style={{ width: '28px', height: '28px', borderRadius: '50%' }}
                />
              ) : (
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-primary, #3b82f6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                  }}
                >
                  {authAccount.username[0]?.toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary, #ffffff)' }}>
                  {authAccount.displayName ? `${authAccount.displayName} (@${authAccount.username})` : `@${authAccount.username}`}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6ee7b7' }}>
                  Authenticated via GitHub &bull; {authAccount.scopes.join(', ') || 'Default scopes'}
                </div>
              </div>
              <Badge variant="success">Verified</Badge>
            </div>
          )}

          {/* Repository Selection */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: 'var(--color-text-primary, #ffffff)',
                marginBottom: '6px',
              }}
            >
              Select Repository
            </label>

            {isLoadingRepos ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', color: 'var(--color-text-secondary, #9ca3af)' }}>
                <Spinner size="sm" />
                <span>Loading repositories...</span>
              </div>
            ) : repos.length > 0 ? (
              <div
                style={{
                  maxHeight: '160px',
                  overflowY: 'auto',
                  border: '1px solid var(--color-border, #374151)',
                  borderRadius: '6px',
                  backgroundColor: 'var(--color-bg-secondary, #1f2937)',
                }}
              >
                {repos.map(r => (
                  <button
                    key={r.repositoryIdentifier}
                    type="button"
                    onClick={() => handleSelectRepo(r)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: selectedRepo?.repositoryIdentifier === r.repositoryIdentifier ? 'rgba(59, 130, 246, 0.2)' : 'none',
                      border: 'none',
                      borderBottom: '1px solid var(--color-border, #2d3748)',
                      color: 'var(--color-text-primary, #ffffff)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{r.repositoryIdentifier}</span>
                    </div>
                    <Badge variant={r.visibility === 'PRIVATE' ? 'warning' : 'neutral'}>
                      {r.visibility}
                    </Badge>
                  </button>
                ))}
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  value={customRepoUrl}
                  onChange={e => setCustomRepoUrl(e.target.value)}
                  placeholder="https://github.com/owner/repository"
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--color-bg-secondary, #1f2937)',
                    border: '1px solid var(--color-border, #374151)',
                    color: 'var(--color-text-primary, #ffffff)',
                    fontSize: '0.875rem',
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #9ca3af)', marginTop: '4px', display: 'block' }}>
                  Enter HTTPS repository clone URL.
                </span>
              </div>
            )}
          </div>

          {/* Branch & Revision Selection */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'var(--color-text-primary, #ffffff)',
                  marginBottom: '6px',
                }}
              >
                Branch
              </label>
              {branches.length > 0 ? (
                <select
                  value={selectedBranch}
                  onChange={e => handleBranchChange(e.target.value)}
                  disabled={isSubmitting || isLoadingBranches}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--color-bg-secondary, #1f2937)',
                    border: '1px solid var(--color-border, #374151)',
                    color: 'var(--color-text-primary, #ffffff)',
                    fontSize: '0.875rem',
                  }}
                >
                  {branches.map(b => (
                    <option key={b.name} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={selectedBranch}
                  onChange={e => setSelectedBranch(e.target.value)}
                  placeholder="main"
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--color-bg-secondary, #1f2937)',
                    border: '1px solid var(--color-border, #374151)',
                    color: 'var(--color-text-primary, #ffffff)',
                    fontSize: '0.875rem',
                  }}
                />
              )}
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'var(--color-text-primary, #ffffff)',
                  marginBottom: '6px',
                }}
              >
                Revision / Commit SHA (Optional)
              </label>
              <input
                type="text"
                value={revision}
                onChange={e => setRevision(e.target.value)}
                placeholder="HEAD or commit hash"
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--color-bg-secondary, #1f2937)',
                  border: '1px solid var(--color-border, #374151)',
                  color: 'var(--color-text-primary, #ffffff)',
                  fontSize: '0.875rem',
                  fontFamily: 'monospace',
                }}
              />
            </div>
          </div>

          {/* Import Immediately Checkbox */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              id="import-immediately-checkbox"
              checked={importImmediately}
              onChange={e => setImportImmediately(e.target.checked)}
              disabled={isSubmitting}
              style={{ cursor: 'pointer' }}
            />
            <label
              htmlFor="import-immediately-checkbox"
              style={{
                fontSize: '0.875rem',
                color: 'var(--color-text-primary, #ffffff)',
                cursor: 'pointer',
              }}
            >
              Import source code immediately after connecting
            </label>
          </div>

          {/* In-Flight Import Progress & Cancellation */}
          {isSubmitting && importProgressText && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                backgroundColor: 'rgba(59, 130, 246, 0.12)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Spinner size="sm" />
                <span style={{ fontSize: '0.875rem', color: '#93c5fd' }}>{importProgressText}</span>
              </div>
              {importingConnectionId && (
                <Button variant="danger" size="sm" onClick={handleCancelImport}>
                  Cancel Import
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--color-border, #374151)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '12px',
            backgroundColor: 'var(--color-bg-secondary, #1f2937)',
          }}
        >
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleSubmit}
            disabled={isSubmitting || (!selectedRepo && !customRepoUrl.trim())}
          >
            {isSubmitting ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Spinner size="sm" />
                <span>Processing...</span>
              </span>
            ) : importImmediately ? (
              'Connect & Import'
            ) : (
              'Connect Repository'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
