/**
 * @file apps/desktop/src/renderer/features/projects/AddWebsiteTargetModal.tsx
 * Modal dialog for connecting a Web Application Target (Local / Staging / Production).
 *
 * CRITICAL INVARIANTS:
 * 1. Explicit environment type selection (LOCAL, DEVELOPMENT, STAGING, PRODUCTION).
 * 2. Production Warning displayed prominently whenever PRODUCTION is selected.
 * 3. Production Safe Mode defaults to ON.
 * 4. Target authorization acknowledgment required before connecting non-local targets.
 * 5. Integrated preflight connectivity check with semantic feedback.
 * 6. Double-click creation guard prevents duplicate submissions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  EnvironmentType,
  WebsiteTargetDetails,
  ConnectivityCheckResultDto,
} from '@ai-quality/contracts';
import { Badge } from '../../ui/Badge.js';
import { Button } from '../../ui/Button.js';
import { Alert } from '../../ui/Alert.js';

export interface AddWebsiteTargetModalProps {
  readonly isOpen: boolean;
  readonly projectId: string;
  readonly projectName: string;
  readonly onClose: () => void;
  readonly onSuccess: (target: WebsiteTargetDetails) => void;
}

export function AddWebsiteTargetModal({
  isOpen,
  projectId,
  projectName,
  onClose,
  onSuccess,
}: AddWebsiteTargetModalProps): React.JSX.Element | null {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [environmentType, setEnvironmentType] = useState<EnvironmentType>('LOCAL');
  const [safeModeEnabled, setSafeModeEnabled] = useState(true);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [notes, setNotes] = useState('');

  // Authorization acknowledgments
  const [confirmedOwnership, setConfirmedOwnership] = useState(false);
  const [confirmedProductionRisk, setConfirmedProductionRisk] = useState(false);

  // Connectivity test state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectivityCheckResultDto | null>(null);

  // Form submit state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setUrl('');
      setName('');
      setEnvironmentType('LOCAL');
      setSafeModeEnabled(true);
      setRequiresAuth(false);
      setNotes('');
      setConfirmedOwnership(false);
      setConfirmedProductionRisk(false);
      setIsTesting(false);
      setTestResult(null);
      setIsSubmitting(false);
      setError(null);
    }
  }, [isOpen]);

  // Adjust defaults when environment changes
  useEffect(() => {
    if (environmentType === 'PRODUCTION') {
      setSafeModeEnabled(true);
    }
    setTestResult(null);
  }, [environmentType]);

  // Escape key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting && !isTesting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, isTesting, onClose]);

  const handleTestConnection = useCallback(async () => {
    if (!url.trim()) {
      setError('Please enter a website URL before testing connectivity.');
      return;
    }
    setError(null);
    setIsTesting(true);

    try {
      const res = await window.desktop?.websiteTargets?.testConnection({
        projectId,
        url: url.trim(),
        environmentType,
        timeoutMs: 5000,
      });

      if (res?.ok && res.data) {
        setTestResult(res.data);
      } else if (res && !res.ok) {
        setError(res.error.message);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Connectivity check failed.');
    } finally {
      setIsTesting(false);
    }
  }, [projectId, url, environmentType]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSubmitting) return;

      const trimmedUrl = url.trim();
      const trimmedName = name.trim() || trimmedUrl;

      if (!trimmedUrl) {
        setError('Website URL is required.');
        return;
      }

      // Check required authorization acknowledgments
      if (environmentType !== 'LOCAL' && !confirmedOwnership) {
        setError('You must confirm ownership or authorization before connecting non-local targets.');
        return;
      }

      if (environmentType === 'PRODUCTION' && !confirmedProductionRisk) {
        setError('You must acknowledge production testing risks for live production targets.');
        return;
      }

      setIsSubmitting(true);
      setError(null);

      try {
        const res = await window.desktop?.websiteTargets?.create({
          projectId,
          url: trimmedUrl,
          name: trimmedName,
          environmentType,
          safeModeEnabled,
          requiresAuth,
          confirmedOwnership,
          confirmedProductionRisk,
          notes: notes.trim() || null,
        });

        if (res?.ok && res.data) {
          onSuccess(res.data);
          onClose();
        } else if (res && !res.ok) {
          setError(res.error.message);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to connect website target.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      isSubmitting,
      url,
      name,
      environmentType,
      confirmedOwnership,
      confirmedProductionRisk,
      projectId,
      safeModeEnabled,
      requiresAuth,
      notes,
      onSuccess,
      onClose,
    ],
  );

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      data-testid="add-website-target-backdrop"
      onClick={e => {
        if (e.target === e.currentTarget && !isSubmitting && !isTesting) {
          onClose();
        }
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
    >
      <div
        className="modal-dialog add-website-target-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-target-title"
        data-testid="add-website-target-dialog"
        style={{
          backgroundColor: 'var(--color-bg-primary, #11141b)',
          border: '1px solid var(--color-border, #2d3342)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2
              id="add-target-title"
              data-testid="add-target-title"
              style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-text-primary, #ffffff)', margin: 0 }}
            >
              Connect Website Target
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary, #9ca3af)', marginTop: '4px' }}>
              Connect a web application URL to <strong>{projectName}</strong> for autonomous browser testing.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            data-testid="add-target-close-btn"
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

        {error && (
          <Alert variant="danger" data-testid="add-target-error">
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Target URL */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label
              htmlFor="target-url-input"
              style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-primary, #ffffff)' }}
            >
              Website URL <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              id="target-url-input"
              data-testid="target-url-input"
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="e.g. http://localhost:3000 or https://staging.example.com"
              required
              disabled={isSubmitting}
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--color-border, #2d3342)',
                backgroundColor: 'var(--color-bg-secondary, #1a1f2c)',
                color: 'var(--color-text-primary, #ffffff)',
                fontSize: '0.9rem',
              }}
            />
          </div>

          {/* Environment Type */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label
              htmlFor="target-env-select"
              style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-primary, #ffffff)' }}
            >
              Target Environment <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
              id="target-env-select"
              data-testid="target-env-select"
              value={environmentType}
              onChange={e => setEnvironmentType(e.target.value as EnvironmentType)}
              disabled={isSubmitting}
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--color-border, #2d3342)',
                backgroundColor: 'var(--color-bg-secondary, #1a1f2c)',
                color: 'var(--color-text-primary, #ffffff)',
                fontSize: '0.9rem',
              }}
            >
              <option value="LOCAL">LOCAL (e.g. http://localhost:3000)</option>
              <option value="DEVELOPMENT">DEVELOPMENT (e.g. https://dev.example.com)</option>
              <option value="STAGING">STAGING (e.g. https://staging.example.com)</option>
              <option value="PRODUCTION">PRODUCTION (Live / Production System)</option>
            </select>
          </div>

          {/* Display Name */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label
              htmlFor="target-name-input"
              style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-primary, #ffffff)' }}
            >
              Display Name
            </label>
            <input
              id="target-name-input"
              data-testid="target-name-input"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Staging Customer Portal (optional)"
              disabled={isSubmitting}
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--color-border, #2d3342)',
                backgroundColor: 'var(--color-bg-secondary, #1a1f2c)',
                color: 'var(--color-text-primary, #ffffff)',
                fontSize: '0.9rem',
              }}
            />
          </div>

          {/* Section 12: Production Warning Banner */}
          {environmentType === 'PRODUCTION' && (
            <div
              className="production-target-warning"
              data-testid="production-target-warning"
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                fontSize: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <strong>Production website warning:</strong>
              <span>
                Testing actions can modify real data or trigger real external services. Production Safe Mode will restrict
                destructive and high-risk actions.
              </span>
            </div>
          )}

          {/* Production Safe Mode & Auth Required Toggles */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              padding: '12px',
              backgroundColor: 'var(--color-bg-secondary, #1a1f2c)',
              borderRadius: '8px',
              border: '1px solid var(--color-border, #2d3342)',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '0.875rem',
                color: 'var(--color-text-primary, #ffffff)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                data-testid="safe-mode-toggle"
                checked={safeModeEnabled}
                onChange={e => setSafeModeEnabled(e.target.checked)}
                disabled={isSubmitting}
              />
              <span>
                <strong>Production Safe Mode (Recommended)</strong> — Restricts destructive deletions, real payments, and
                bulk mutations.
              </span>
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '0.875rem',
                color: 'var(--color-text-primary, #ffffff)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                data-testid="requires-auth-checkbox"
                checked={requiresAuth}
                onChange={e => setRequiresAuth(e.target.checked)}
                disabled={isSubmitting}
              />
              <span>Target requires user authentication / session login</span>
            </label>
          </div>

          {/* Target Authorization Acknowledgments */}
          {environmentType !== 'LOCAL' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                padding: '12px',
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                borderRadius: '8px',
                border: '1px solid rgba(59, 130, 246, 0.25)',
              }}
            >
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#93c5fd' }}>
                Target Authorization & Permission
              </span>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '0.85rem',
                  color: 'var(--color-text-primary, #ffffff)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  data-testid="confirm-ownership-checkbox"
                  checked={confirmedOwnership}
                  onChange={e => setConfirmedOwnership(e.target.checked)}
                  disabled={isSubmitting}
                  required
                />
                <span>I own this application or have explicit permission to test it.</span>
              </label>

              {environmentType === 'PRODUCTION' && (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '0.85rem',
                    color: '#fca5a5',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    data-testid="confirm-production-risk-checkbox"
                    checked={confirmedProductionRisk}
                    onChange={e => setConfirmedProductionRisk(e.target.checked)}
                    disabled={isSubmitting}
                    required
                  />
                  <span>
                    I understand this is a live production system. Safe Mode will enforce non-destructive test constraints.
                  </span>
                </label>
              )}
            </div>
          )}

          {/* Connectivity Test Section */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              padding: '12px',
              backgroundColor: 'var(--color-bg-secondary, #1a1f2c)',
              borderRadius: '8px',
              border: '1px solid var(--color-border, #2d3342)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-primary, #ffffff)' }}>
                Preflight Connectivity Test
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                data-testid="test-connection-btn"
                onClick={handleTestConnection}
                disabled={isTesting || isSubmitting || !url.trim()}
              >
                {isTesting ? 'Testing...' : 'Test Connection'}
              </Button>
            </div>

            {testResult && (
              <div
                className="connectivity-result-banner"
                data-testid="connectivity-result-banner"
                style={{
                  marginTop: '6px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor:
                    testResult.status === 'VERIFIED_REACHABLE'
                      ? 'rgba(16, 185, 129, 0.12)'
                      : 'rgba(239, 68, 68, 0.12)',
                  border: `1px solid ${
                    testResult.status === 'VERIFIED_REACHABLE'
                      ? 'rgba(16, 185, 129, 0.3)'
                      : 'rgba(239, 68, 68, 0.3)'
                  }`,
                  fontSize: '0.825rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Badge variant={testResult.status === 'VERIFIED_REACHABLE' ? 'success' : 'danger'}>
                    {testResult.status === 'VERIFIED_REACHABLE' ? 'Connected' : testResult.status}
                  </Badge>
                  <span style={{ color: 'var(--color-text-muted, #9ca3af)', fontSize: '0.75rem' }}>
                    {testResult.responseTimeMs}ms • {testResult.redirectCount} redirects
                  </span>
                </div>
                <span
                  style={{
                    color:
                      testResult.status === 'VERIFIED_REACHABLE' ? '#6ee7b7' : '#fca5a5',
                  }}
                >
                  {testResult.message}
                </span>
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
              data-testid="add-target-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting || isTesting}
              data-testid="add-target-submit-btn"
            >
              {isSubmitting ? 'Connecting...' : 'Connect Website'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
