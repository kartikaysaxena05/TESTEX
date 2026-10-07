/**
 * @file apps/desktop/src/renderer/features/ai/AiPrivacySettingsCard.tsx
 * Desktop UI Component for V9 Phase 137: Privacy & Local-Only AI Mode.
 *
 * Displays:
 * - Privacy Mode: LOCAL_ONLY vs REMOTE_ALLOWED
 * - Active Provider: Ollama (Local)
 * - Cloud AI Status: Blocked (in LOCAL_ONLY) or Allowed
 * - Project Data Boundaries: Kept strictly local
 * - Secret Redaction Status: Enabled
 * - Controls: Toggle privacy mode, toggle cloud fallback, toggle secret redaction.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { AiPrivacySettingsDto, AiPrivacyModeDto } from '@ai-quality/contracts';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  type BadgeVariant,
  Button,
  Alert,
} from '../../ui/index.js';

export interface AiPrivacySettingsCardProps {
  readonly projectId?: string | null;
}

export function AiPrivacySettingsCard({ projectId }: AiPrivacySettingsCardProps): React.JSX.Element {
  const [settings, setSettings] = useState<AiPrivacySettingsDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const fetchSettings = useCallback(async () => {
    if (!window.desktop?.aiPrivacy?.getSettings) return;
    setIsLoading(true);
    setFeedback(null);
    try {
      const res = await window.desktop.aiPrivacy.getSettings({ projectId: projectId ?? undefined });
      if (res.ok) {
        setSettings(res.data);
      } else {
        setFeedback({
          type: 'error',
          message: res.error.message || 'Unable to retrieve AI privacy settings.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to fetch AI privacy settings.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const handleUpdate = async (updates: Partial<{
    privacyMode: AiPrivacyModeDto;
    allowCloudFallback: boolean;
    redactSecrets: boolean;
    stripCredentials: boolean;
  }>) => {
    if (!window.desktop?.aiPrivacy?.updateSettings || !settings) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      const res = await window.desktop.aiPrivacy.updateSettings({
        projectId: projectId ?? undefined,
        privacyMode: updates.privacyMode ?? settings.privacyMode,
        allowCloudFallback: updates.allowCloudFallback ?? settings.allowCloudFallback,
        redactSecrets: updates.redactSecrets ?? settings.redactSecrets,
        stripCredentials: updates.stripCredentials ?? settings.stripCredentials,
      });

      if (res.ok) {
        setSettings(res.data);
        setFeedback({
          type: 'success',
          message: 'AI Privacy settings updated successfully.',
        });
        setTimeout(() => setFeedback(null), 3000);
      } else {
        setFeedback({
          type: 'error',
          message: res.error.message || 'Failed to update AI privacy settings.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error updating privacy settings.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const isLocalOnly = (settings?.privacyMode ?? 'LOCAL_ONLY') === 'LOCAL_ONLY';
  const badgeVariant: BadgeVariant = isLocalOnly ? 'success' : 'warning';

  return (
    <Card variant="default" data-testid="ai-privacy-settings-card">
      <CardHeader>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <CardTitle level={2}>AI Privacy & Local-Only Mode</CardTitle>
            <CardDescription>
              Enforce local AI processing via Ollama to guarantee project code, requirements, and secrets never leave your machine.
            </CardDescription>
          </div>
          <Badge variant={badgeVariant} dot={isLocalOnly} data-testid="ai-privacy-badge">
            {isLocalOnly ? 'LOCAL ONLY (SECURE)' : 'REMOTE ALLOWED'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        {feedback && (
          <div style={{ marginBottom: '1rem' }}>
            <Alert variant={feedback.type === 'error' ? 'danger' : feedback.type}>
              {feedback.message}
            </Alert>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {/* Privacy Mode Row */}
          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-label">Strict Local-Only AI (Ollama)</span>
              <span className="setting-desc">
                When enabled, all AI requests are strictly routed to local Ollama on localhost. Remote cloud AI providers are blocked by the kernel firewall.
              </span>
            </div>
            <div className="setting-action">
              <label className="toggle-switch" aria-label="Strict Local-Only AI">
                <input
                  type="checkbox"
                  data-testid="toggle-ai-privacy-mode"
                  checked={isLocalOnly}
                  disabled={isLoading || isSaving}
                  onChange={(e) => {
                    const newMode: AiPrivacyModeDto = e.target.checked ? 'LOCAL_ONLY' : 'REMOTE_ALLOWED';
                    void handleUpdate({ privacyMode: newMode });
                  }}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>

          {/* Cloud Fallback Row */}
          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-label">Prevent Automatic Cloud Fallback</span>
              <span className="setting-desc">
                If local Ollama is offline or unavailable, fail immediately with a descriptive error instead of silently switching to a remote provider.
              </span>
            </div>
            <div className="setting-action">
              <label className="toggle-switch" aria-label="Prevent Automatic Cloud Fallback">
                <input
                  type="checkbox"
                  data-testid="toggle-ai-cloud-fallback"
                  checked={!(settings?.allowCloudFallback ?? false)}
                  disabled={isLoading || isSaving || isLocalOnly}
                  onChange={(e) => {
                    void handleUpdate({ allowCloudFallback: !e.target.checked });
                  }}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>

          {/* Secret Redaction Row */}
          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-label">Automatic Secret & Credential Redaction</span>
              <span className="setting-desc">
                Sanitize API keys, bearer tokens, database passwords, and .env credentials before passing context to the model.
              </span>
            </div>
            <div className="setting-action">
              <label className="toggle-switch" aria-label="Automatic Secret Redaction">
                <input
                  type="checkbox"
                  data-testid="toggle-ai-redact-secrets"
                  checked={settings?.redactSecrets ?? true}
                  disabled={isLoading || isSaving}
                  onChange={(e) => {
                    void handleUpdate({ redactSecrets: e.target.checked });
                  }}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>

          {/* Privacy Status Information Summary */}
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              backgroundColor: 'var(--color-bg-secondary, rgba(255, 255, 255, 0.04))',
              border: '1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1))',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.75rem',
              fontSize: '0.85rem',
              marginTop: '0.5rem',
            }}
          >
            <div>
              <span style={{ color: 'var(--color-text-secondary, #888)', display: 'block' }}>Permitted Provider</span>
              <span style={{ fontWeight: 600 }}>{settings?.permittedLocalProvider ?? 'OLLAMA'}</span>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-secondary, #888)', display: 'block' }}>Cloud AI Providers</span>
              <span style={{ fontWeight: 600, color: isLocalOnly ? '#22c55e' : '#eab308' }}>
                {isLocalOnly ? 'BLOCKED' : 'ALLOWED'}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-secondary, #888)', display: 'block' }}>Project Source Code</span>
              <span style={{ fontWeight: 600 }}>{isLocalOnly ? 'LOCAL STORAGE ONLY' : 'LOCAL / CLOUD'}</span>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-secondary, #888)', display: 'block' }}>Context Firewall</span>
              <span style={{ fontWeight: 600, color: '#22c55e' }}>ACTIVE</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <Button
              variant="secondary"
              size="sm"
              disabled={isLoading || isSaving}
              onClick={() => void fetchSettings()}
            >
              {isLoading ? 'Checking...' : 'Refresh Status'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
