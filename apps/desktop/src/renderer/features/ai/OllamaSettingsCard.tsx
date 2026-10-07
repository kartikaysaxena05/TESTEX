/**
 * @file apps/desktop/src/renderer/features/ai/OllamaSettingsCard.tsx
 * Desktop UI Component for V9 Phase 127: Ollama Connection & Health Detection.
 * Allows monitoring Ollama health, endpoint configuration, checking connection status,
 * saving endpoints, and retrying.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  OllamaStatusDto,
  OllamaHealthDiagnosticDto,
  OllamaConfigDto,
} from '@ai-quality/contracts';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  type BadgeVariant,
  Button,
  Input,
  FormField,
  Alert,
} from '../../ui/index.js';

export interface OllamaSettingsCardProps {
  readonly projectId?: string | null;
}

export function OllamaSettingsCard({ projectId }: OllamaSettingsCardProps): React.JSX.Element {
  const [status, setStatus] = useState<OllamaStatusDto | null>(null);
  const [endpointInput, setEndpointInput] = useState<string>('http://127.0.0.1:11434');
  const [connectionTimeoutInput, setConnectionTimeoutInput] = useState<number>(10000);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!window.desktop?.ollama?.getStatus) return;
    setIsLoading(true);
    setFeedback(null);
    try {
      const res = await window.desktop.ollama.getStatus({ projectId });
      if (res.ok) {
        setStatus(res.data);
        setEndpointInput(res.data.endpoint);
        setConnectionTimeoutInput(res.data.connectionTimeout);
      } else {
        setFeedback({
          type: 'error',
          message: res.error.message || 'Unable to retrieve Ollama status.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to query Ollama status.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const handleCheckConnection = async () => {
    if (!window.desktop?.ollama?.healthCheck) return;
    setIsChecking(true);
    setFeedback(null);
    try {
      const res = await window.desktop.ollama.healthCheck({
        projectId,
        endpoint: endpointInput.trim(),
        timeoutMs: connectionTimeoutInput,
      });

      if (res.ok) {
        const diag: OllamaHealthDiagnosticDto = res.data;
        if (diag.state === 'AVAILABLE') {
          setFeedback({
            type: 'success',
            message: `Ollama is connected and healthy! Latency: ${diag.latencyMs ?? 0}ms`,
          });
        } else {
          setFeedback({
            type: 'error',
            message: diag.message || 'Unable to connect to the configured Ollama endpoint.',
          });
        }
        void fetchStatus();
      } else {
        setFeedback({
          type: 'error',
          message: res.error.message || 'Health check failed.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unexpected health check failure.',
      });
    } finally {
      setIsChecking(false);
    }
  };

  const handleSaveEndpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.desktop?.ollama?.setConfig) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      const res = await window.desktop.ollama.setConfig({
        projectId,
        endpoint: endpointInput.trim(),
        connectionTimeout: Number(connectionTimeoutInput) || 10000,
        enabled: true,
      });

      if (res.ok) {
        setFeedback({
          type: 'success',
          message: 'Ollama endpoint configuration saved successfully.',
        });
        void fetchStatus();
      } else {
        setFeedback({
          type: 'error',
          message: res.error.message || 'Failed to save Ollama configuration.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save configuration.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const isConnected = status?.isConnected ?? false;
  const healthState = status?.health?.state ?? 'UNKNOWN';
  const installationState = status?.installation?.state ?? 'UNKNOWN';

  const getHealthBadgeVariant = (state: string): BadgeVariant => {
    switch (state) {
      case 'AVAILABLE':
        return 'success';
      case 'UNAVAILABLE':
      case 'TIMEOUT':
      case 'INVALID_ENDPOINT':
      case 'UNAUTHORIZED':
      case 'ERROR':
        return 'danger';
      case 'NOT_CONFIGURED':
      default:
        return 'neutral';
    }
  };

  const getHumanReadableReason = (): string | null => {
    if (isConnected) return null;
    if (status?.health?.message) return status.health.message;

    switch (installationState) {
      case 'INSTALLED_AND_STOPPED':
        return 'Ollama is installed on this system but is not running.';
      case 'NOT_INSTALLED':
        return 'Ollama does not appear to be installed on standard system paths.';
      case 'CUSTOM_ENDPOINT':
        return 'Custom endpoint configured, but Ollama is not responding.';
      default:
        return 'Unable to connect to the configured Ollama endpoint.';
    }
  };

  const humanReason = getHumanReadableReason();

  return (
    <Card variant="default" data-testid="ollama-settings-card">
      <CardHeader>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <CardTitle level={2}>Ollama Local AI Provider</CardTitle>
            <CardDescription>
              Local AI engine connectivity, health detection, and endpoint configuration.
            </CardDescription>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Badge
              variant={isConnected ? 'success' : 'danger'}
              dot={isConnected}
              data-testid="ollama-connection-badge"
            >
              {isConnected ? 'Connected' : 'Not Connected'}
            </Badge>
            <Badge
              variant={getHealthBadgeVariant(healthState)}
              data-testid="ollama-health-badge"
            >
              {healthState}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {feedback && (
          <div style={{ marginBottom: '1rem' }}>
            <Alert
              variant={feedback.type === 'error' ? 'danger' : feedback.type}
              data-testid="ollama-feedback-alert"
            >
              {feedback.message}
            </Alert>
          </div>
        )}

        {humanReason && !isConnected && (
          <div style={{ marginBottom: '1rem' }}>
            <Alert variant="warning" data-testid="ollama-human-reason">
              <strong>Connection Notice:</strong> {humanReason}
            </Alert>
          </div>
        )}

        <form onSubmit={handleSaveEndpoint} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: '1rem' }}>
            <FormField
              label="Ollama Endpoint"
              htmlFor="ollama-endpoint-input"
              description="Default local endpoint: http://127.0.0.1:11434"
            >
              <Input
                id="ollama-endpoint-input"
                type="text"
                value={endpointInput}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEndpointInput(e.target.value)}
                placeholder="http://127.0.0.1:11434"
                disabled={isSaving || isChecking}
                data-testid="ollama-endpoint-input"
              />
            </FormField>

            <FormField
              label="Timeout (ms)"
              htmlFor="ollama-timeout-input"
              description="Min: 1000ms"
            >
              <Input
                id="ollama-timeout-input"
                type="number"
                min={1000}
                max={600000}
                step={500}
                value={connectionTimeoutInput}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setConnectionTimeoutInput(Number(e.target.value))
                }
                disabled={isSaving || isChecking}
                data-testid="ollama-timeout-input"
              />
            </FormField>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              fontSize: '0.85rem',
              padding: '0.75rem',
              backgroundColor: 'var(--bg-subtle, rgba(255, 255, 255, 0.03))',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
              <span style={{ fontWeight: 600, color: isConnected ? 'var(--color-success)' : 'var(--color-danger)' }}>
                {isConnected ? 'Connected' : 'Not Connected'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Configured Endpoint:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                {status?.endpoint || endpointInput}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Health:</span>
              <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                {status?.health?.state || 'Unknown'} {status?.health?.latencyMs !== undefined ? `(${status.health.latencyMs}ms)` : ''}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Installation State:</span>
              <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                {installationState}
              </span>
            </div>
            {status?.lastCheckedAt && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Last Checked:</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  {new Date(status.lastCheckedAt).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </form>
      </CardContent>

      <CardFooter>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              variant="secondary"
              size="sm"
              loading={isChecking}
              disabled={isSaving || isLoading}
              onClick={() => void handleCheckConnection()}
              data-testid="ollama-check-btn"
            >
              Check Connection
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={isLoading}
              disabled={isChecking || isSaving}
              onClick={() => void fetchStatus()}
              data-testid="ollama-retry-btn"
            >
              Retry
            </Button>
          </div>

          <Button
            variant="primary"
            size="sm"
            loading={isSaving}
            disabled={isChecking || isLoading}
            onClick={(e: React.MouseEvent) => void handleSaveEndpoint(e as unknown as React.FormEvent)}
            data-testid="ollama-save-btn"
          >
            Save Endpoint
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
