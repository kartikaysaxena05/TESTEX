/**
 * @file apps/desktop/src/renderer/features/projects/WebsiteTargetCard.tsx
 * Target Card component displaying a connected website target, environment badge,
 * connectivity status, Production Safe Mode indicator, and management actions.
 *
 * CRITICAL INVARIANTS (V8 Phase 119 Section 31):
 * 1. Displays target name, URL, environment badge, connection status, and safe mode state.
 * 2. Visual warning indicator for live PRODUCTION targets.
 * 3. Preflight connection testing button with live latency feedback.
 * 4. Active target indicator and toggle action.
 * 5. Safe deletion with user confirmation.
 */

import React, { useState } from 'react';
import type {
  WebsiteTargetSummary,
  ConnectivityCheckResultDto,
} from '@ai-quality/contracts';
import { Badge } from '../../ui/Badge.js';
import { Button } from '../../ui/Button.js';
import { Alert } from '../../ui/Alert.js';

export interface WebsiteTargetCardProps {
  readonly target: WebsiteTargetSummary;
  readonly isActive: boolean;
  readonly onSetActive: (targetId: string) => Promise<void>;
  readonly onTestConnection: (targetId: string) => Promise<ConnectivityCheckResultDto>;
  readonly onDelete: (targetId: string) => Promise<void>;
  readonly onEdit?: (target: WebsiteTargetSummary) => void;
}

export function WebsiteTargetCard({
  target,
  isActive,
  onSetActive,
  onTestConnection,
  onDelete,
  onEdit,
}: WebsiteTargetCardProps): React.JSX.Element {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectivityCheckResultDto | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSettingActive, setIsSettingActive] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      const result = await onTestConnection(target.id);
      setTestResult(result);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Connection test failed.');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSetActive = async () => {
    if (isActive || isSettingActive) return;
    setIsSettingActive(true);
    try {
      await onSetActive(target.id);
    } finally {
      setIsSettingActive(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(target.id);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const isProduction = target.environmentType === 'PRODUCTION';

  return (
    <div
      className="website-target-card"
      data-testid={`website-target-card-${target.id}`}
      style={{
        padding: '18px 20px',
        borderRadius: '10px',
        backgroundColor: 'var(--color-bg-secondary, #1e222b)',
        border: isActive
          ? '1.5px solid var(--color-primary, #3b82f6)'
          : isProduction
          ? '1px solid rgba(239, 68, 68, 0.4)'
          : '1px solid var(--color-border, #2d3342)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        transition: 'border-color 0.15s ease',
      }}
    >
      {/* Top Header Row: Target Name, Badges, Active Switch */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h4
              style={{
                fontSize: '1.05rem',
                fontWeight: 600,
                color: 'var(--color-text-primary, #ffffff)',
                margin: 0,
              }}
              data-testid={`target-name-${target.id}`}
            >
              {target.name}
            </h4>

            {/* Environment Badge */}
            <Badge
              variant={
                isProduction
                  ? 'danger'
                  : target.environmentType === 'STAGING'
                  ? 'warning'
                  : target.environmentType === 'DEVELOPMENT'
                  ? 'info'
                  : 'neutral'
              }
            >
              {target.environmentType}
            </Badge>

            {/* Active Status Badge */}
            {isActive && (
              <Badge variant="success" dot>
                ACTIVE TARGET
              </Badge>
            )}

            {/* Safe Mode Badge */}
            {target.safeModeEnabled ? (
              <Badge variant="info">
                🛡️ Safe Mode ON
              </Badge>
            ) : (
              <Badge variant="warning">
                ⚠️ Safe Mode OFF
              </Badge>
            )}

            {/* Auth Required Badge */}
            {target.requiresAuth && (
              <Badge variant="neutral">
                🔒 Auth Required
              </Badge>
            )}
          </div>

          {/* URL Display */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                color: isProduction ? '#fca5a5' : 'var(--color-text-secondary, #9ca3af)',
                wordBreak: 'break-all',
              }}
              data-testid={`target-url-${target.id}`}
            >
              {target.baseUrl}
            </span>
          </div>
        </div>

        {/* Set Active / Active Switch */}
        <div>
          {!isActive && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleSetActive()}
              disabled={isSettingActive}
              data-testid={`target-set-active-btn-${target.id}`}
            >
              {isSettingActive ? 'Activating...' : 'Set Active'}
            </Button>
          )}
        </div>
      </div>

      {/* Production Warning Callout if Production */}
      {isProduction && (
        <div
          style={{
            padding: '8px 12px',
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '6px',
            fontSize: '0.8rem',
            color: '#fca5a5',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
          data-testid={`production-warning-${target.id}`}
        >
          <span>⚠️</span>
          <span>
            <strong>Live Production Target:</strong> Destructive mutations, purchases, and state modifications are blocked by Safe Mode.
          </span>
        </div>
      )}

      {/* Connectivity Status & Last Checked Info */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.825rem',
          color: 'var(--color-text-secondary, #9ca3af)',
          borderTop: '1px solid var(--color-border, #2d3342)',
          paddingTop: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>Status:</span>
          <Badge
            variant={
              target.connectionStatus === 'VERIFIED_REACHABLE'
                ? 'success'
                : target.connectionStatus === 'UNREACHABLE'
                ? 'danger'
                : target.connectionStatus === 'BLOCKED'
                ? 'danger'
                : 'neutral'
            }
          >
            {target.connectionStatus === 'VERIFIED_REACHABLE'
              ? 'Reachable'
              : target.connectionStatus === 'UNREACHABLE'
              ? 'Unreachable'
              : target.connectionStatus === 'BLOCKED'
              ? 'Blocked'
              : 'Configured'}
          </Badge>
          {target.lastCheckedAt && (
            <span style={{ fontSize: '0.775rem' }}>
              Checked: {new Date(target.lastCheckedAt).toLocaleTimeString()}
            </span>
          )}
        </div>

        {/* Action Buttons: Test Connection, Edit, Delete */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleTestConnection()}
            disabled={isTesting}
            data-testid={`target-test-btn-${target.id}`}
          >
            {isTesting ? 'Testing...' : 'Test Connection'}
          </Button>

          {onEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(target)}
              data-testid={`target-edit-btn-${target.id}`}
            >
              Edit
            </Button>
          )}

          {!showDeleteConfirm ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              style={{ color: '#ef4444' }}
              data-testid={`target-delete-btn-${target.id}`}
            >
              Delete
            </Button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.75rem', color: '#f87171' }}>Confirm delete?</span>
              <Button
                variant="danger"
                size="sm"
                onClick={() => void handleDelete()}
                disabled={isDeleting}
                data-testid={`target-confirm-delete-btn-${target.id}`}
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete'}
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
          )}
        </div>
      </div>

      {/* Inline Connection Test Results */}
      {testResult && (
        <Alert
          variant={testResult.status === 'VERIFIED_REACHABLE' ? 'success' : 'danger'}
          title={testResult.status === 'VERIFIED_REACHABLE' ? 'Connection Successful' : 'Connection Failed'}
        >
          <div style={{ fontSize: '0.825rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span>{testResult.message}</span>
            <span>
              HTTP {testResult.statusCode ?? '—'} &bull; Latency: {testResult.responseTimeMs}ms
              {testResult.redirectCount > 0 ? ` &bull; Redirects: ${testResult.redirectCount}` : ''}
            </span>
          </div>
        </Alert>
      )}

      {testError && (
        <Alert variant="danger" title="Connection Test Error">
          <span style={{ fontSize: '0.825rem' }}>{testError}</span>
        </Alert>
      )}
    </div>
  );
}
