/**
 * @file apps/desktop/src/renderer/features/environments/TargetEnvironmentCard.tsx
 * Card component displaying the active Target Environment, browser execution settings,
 * authentication configuration, and quick test action triggers (Phase 122).
 */

import React, { useState } from 'react';
import type {
  TargetEnvironmentConfigDto,
  TargetConnectionTestResultDto,
  TargetAuthTestResultDto,
} from '@ai-quality/contracts';
import { Badge } from '../../ui/Badge.js';
import { Button } from '../../ui/Button.js';
import { Alert } from '../../ui/Alert.js';
import { Spinner } from '../../ui/Spinner.js';

export interface TargetEnvironmentCardProps {
  readonly projectId: string;
  readonly activeEnvironment: TargetEnvironmentConfigDto | null;
  readonly environments: readonly TargetEnvironmentConfigDto[];
  readonly onConfigure: (environmentId?: string) => void;
  readonly onEnvironmentSwitched?: (env: TargetEnvironmentConfigDto) => void;
  readonly onRefresh?: () => void;
}

export function TargetEnvironmentCard({
  projectId,
  activeEnvironment,
  environments,
  onConfigure,
  onEnvironmentSwitched,
  onRefresh,
}: TargetEnvironmentCardProps): React.JSX.Element {
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isTestingAuth, setIsTestingAuth] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [connectionResult, setConnectionResult] = useState<TargetConnectionTestResultDto | null>(null);
  const [authResult, setAuthResult] = useState<TargetAuthTestResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const env = activeEnvironment ?? environments.find(e => e.isDefault) ?? environments[0] ?? null;

  const handleTestConnection = async () => {
    if (!env?.baseUrl) {
      setError('No target URL configured for this environment.');
      return;
    }
    if (!window.desktop?.targetEnvironment?.testConnection) {
      setError('Desktop targetEnvironment bridge unavailable');
      return;
    }
    setIsTestingConnection(true);
    setConnectionResult(null);
    setError(null);
    try {
      const res = await window.desktop.targetEnvironment.testConnection({
        projectId,
        environmentId: env.id,
        url: env.baseUrl,
      });
      if (res.ok) {
        setConnectionResult(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network test failed');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleTestAuth = async () => {
    if (!env?.id) {
      setError('No target environment selected.');
      return;
    }
    if (!window.desktop?.targetEnvironment?.testAuth) {
      setError('Desktop targetEnvironment bridge unavailable');
      return;
    }
    setIsTestingAuth(true);
    setAuthResult(null);
    setError(null);
    try {
      const res = await window.desktop.targetEnvironment.testAuth({
        projectId,
        environmentId: env.id,
        browserEngine: env.browserEngine,
        headless: env.headless,
      });
      if (res.ok) {
        setAuthResult(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication test failed');
    } finally {
      setIsTestingAuth(false);
    }
  };

  const handleSwitchEnvironment = async (newEnvId: string) => {
    if (newEnvId === env?.id) return;
    if (!window.desktop?.targetEnvironment?.setActive) {
      setError('Desktop targetEnvironment bridge unavailable');
      return;
    }
    setIsSwitching(true);
    setError(null);
    setConnectionResult(null);
    setAuthResult(null);
    try {
      const res = await window.desktop.targetEnvironment.setActive({
        projectId,
        environmentId: newEnvId,
      });
      if (res.ok) {
        onEnvironmentSwitched?.(res.data);
        onRefresh?.();
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch active environment');
    } finally {
      setIsSwitching(false);
    }
  };

  if (!env) {
    return (
      <div
        className="target-env-card-empty"
        data-testid="target-env-card-empty"
        style={{
          border: '1px dashed var(--color-border, #374151)',
          borderRadius: '8px',
          padding: '20px',
          textAlign: 'center',
          backgroundColor: 'var(--color-bg-secondary, #1f2937)',
        }}
      >
        <p style={{ margin: '0 0 12px 0', color: 'var(--color-text-secondary, #9ca3af)' }}>
          No target environment configured yet. Set up your target application URL and browser runtime.
        </p>
        <Button variant="primary" size="sm" onClick={() => onConfigure()}>
          Configure Target Environment
        </Button>
      </div>
    );
  }

  const hasAuth = env.auth && env.auth.strategy !== 'NONE';

  return (
    <div
      className="target-env-card"
      data-testid="target-environment-card"
      style={{
        border: '1px solid var(--color-border, #374151)',
        borderRadius: '8px',
        padding: '16px',
        backgroundColor: 'var(--color-bg-secondary, #1f2937)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {/* Header with Active Badge & Environment Switcher */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-text-primary, #f9fafb)' }}>
            {env.name}
          </span>
          <Badge variant={env.type === 'PRODUCTION' ? 'warning' : 'neutral'}>
            {env.type}
          </Badge>
          {env.isDefault && <Badge variant="success">ACTIVE TARGET</Badge>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {environments.length > 1 && (
            <select
              aria-label="Switch Environment"
              value={env.id}
              onChange={e => void handleSwitchEnvironment(e.target.value)}
              disabled={isSwitching}
              style={{
                fontSize: '0.85rem',
                padding: '4px 8px',
                borderRadius: '4px',
                backgroundColor: 'var(--color-bg-primary, #111827)',
                color: 'var(--color-text-primary, #f9fafb)',
                border: '1px solid var(--color-border, #374151)',
              }}
            >
              {environments.map(e => (
                <option key={e.id} value={e.id}>
                  Switch to: {e.name} ({e.type}){e.isDefault ? ' *' : ''}
                </option>
              ))}
            </select>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={() => onConfigure(env.id)}
            data-testid="configure-target-env-btn"
          >
            Configure
          </Button>
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {/* Target Details Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          padding: '12px',
          backgroundColor: 'var(--color-bg-primary, #111827)',
          borderRadius: '6px',
          fontSize: '0.875rem',
        }}
      >
        <div>
          <div style={{ color: 'var(--color-text-muted, #6b7280)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
            Application Base URL
          </div>
          <div style={{ fontWeight: 600, color: 'var(--color-text-primary, #f9fafb)', wordBreak: 'break-all' }}>
            {env.baseUrl || <span style={{ color: '#ef4444' }}>Not Configured</span>}
          </div>
          {env.apiUrl && (
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #9ca3af)', marginTop: '2px' }}>
              API: {env.apiUrl}
            </div>
          )}
        </div>

        <div>
          <div style={{ color: 'var(--color-text-muted, #6b7280)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
            Browser Runtime
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            <Badge variant="neutral">{env.browserEngine.toUpperCase()}</Badge>
            <span style={{ color: 'var(--color-text-secondary, #9ca3af)' }}>
              {env.headless ? 'Headless' : 'Headed'} ({env.viewportWidth}x{env.viewportHeight})
            </span>
          </div>
        </div>

        <div>
          <div style={{ color: 'var(--color-text-muted, #6b7280)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
            Authentication
          </div>
          <div style={{ marginTop: '2px' }}>
            {hasAuth ? (
              <Badge variant="success">
                {env.auth?.strategy === 'FORM_LOGIN' && 'Form Login'}
                {env.auth?.strategy === 'HTTP_BASIC' && 'HTTP Basic'}
                {env.auth?.strategy === 'STORAGE_STATE' && 'Storage State'}
              </Badge>
            ) : (
              <Badge variant="neutral">None (Public)</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Quick Action Test Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleTestConnection}
          disabled={isTestingConnection || !env.baseUrl}
          data-testid="test-target-connection-btn"
        >
          {isTestingConnection ? <Spinner size="sm" /> : 'Test Connection'}
        </Button>

        {hasAuth && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleTestAuth}
            disabled={isTestingAuth || !env.baseUrl}
            data-testid="test-target-auth-btn"
          >
            {isTestingAuth ? <Spinner size="sm" /> : 'Test Auth Flow'}
          </Button>
        )}
      </div>

      {/* Connectivity Test Diagnostics */}
      {connectionResult && (
        <div
          data-testid="connection-result-box"
          style={{
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '0.85rem',
            backgroundColor: connectionResult.reachable ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${connectionResult.reachable ? '#10b981' : '#ef4444'}`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600 }}>
              {connectionResult.reachable ? '✓ Connection Verified' : '✗ Connection Failed'}
            </span>
            <span>{connectionResult.responseTimeMs}ms</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #9ca3af)', marginTop: '2px' }}>
            HTTP {connectionResult.statusCode ?? '—'} | Redirects: {connectionResult.redirectCount}
            {connectionResult.errorMessage && ` | ${connectionResult.errorMessage}`}
          </div>
        </div>
      )}

      {/* Authentication Test Diagnostics */}
      {authResult && (
        <div
          data-testid="auth-result-box"
          style={{
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '0.85rem',
            backgroundColor: authResult.authenticated ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${authResult.authenticated ? '#10b981' : '#ef4444'}`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600 }}>
              {authResult.authenticated ? '✓ Authentication Succeeded' : '✗ Authentication Failed'}
            </span>
            <span>{authResult.durationMs}ms</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #9ca3af)', marginTop: '2px' }}>
            Final URL: {authResult.finalUrl ?? '—'}
            {authResult.errorMessage && ` | Failure: ${authResult.errorMessage}`}
          </div>
        </div>
      )}
    </div>
  );
}
