/**
 * @file apps/desktop/src/renderer/features/ai/AiFallbackSettingsCard.tsx
 * Desktop UI Component for V9 Phase 138: Provider Switching & Fallback.
 *
 * Displays:
 * - Provider Registry: Status, health, capabilities, models, priority, local vs remote.
 * - Current Fallback Policy: DISABLED | LOCAL_ONLY | CONFIGURED_PROVIDERS | ANY_ALLOWED_PROVIDER
 * - Policy controls: Preferred Provider, Preferred Model, Fallback Policy dropdown, Fallback Priority, Retries, Timeout.
 * - Real-time policy indicators and warnings (e.g. cloud fallback blocked when privacy is LOCAL_ONLY).
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  AiFallbackSettingsDto,
  AiFallbackPolicyDto,
  AiProviderRegistryItemDto,
  AiPrivacySettingsDto,
} from '@ai-quality/contracts';
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

export interface AiFallbackSettingsCardProps {
  readonly projectId?: string | null;
}

export function AiFallbackSettingsCard({ projectId }: AiFallbackSettingsCardProps): React.JSX.Element {
  const [settings, setSettings] = useState<AiFallbackSettingsDto | null>(null);
  const [registry, setRegistry] = useState<readonly AiProviderRegistryItemDto[]>([]);
  const [privacySettings, setPrivacySettings] = useState<AiPrivacySettingsDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'danger' | 'info';
    message: string;
  } | null>(null);

  // Form states
  const [preferredProvider, setPreferredProvider] = useState<string>('ollama');
  const [preferredModel, setPreferredModel] = useState<string>('');
  const [fallbackPolicy, setFallbackPolicy] = useState<AiFallbackPolicyDto>('LOCAL_ONLY');
  const [maxRetries, setMaxRetries] = useState<number>(2);
  const [requestTimeoutMs, setRequestTimeoutMs] = useState<number>(60000);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      // 1. Fetch fallback policy & settings
      if (window.desktop?.aiRouter?.getFallbackSettings) {
        const res = await window.desktop.aiRouter.getFallbackSettings({ projectId: projectId ?? undefined });
        if (res.ok) {
          setSettings(res.data);
          setPreferredProvider(res.data.preferredProvider);
          setPreferredModel(res.data.preferredModel ?? '');
          setFallbackPolicy(res.data.fallbackPolicy);
          setMaxRetries(res.data.maxRetries);
          setRequestTimeoutMs(res.data.requestTimeoutMs);
        } else {
          setFeedback({
            type: 'danger',
            message: res.error.message || 'Unable to retrieve AI fallback settings.',
          });
        }
      }

      // 2. Fetch provider registry
      if (window.desktop?.aiRouter?.listProviders) {
        const regRes = await window.desktop.aiRouter.listProviders();
        if (regRes.ok) {
          setRegistry(regRes.data);
        }
      }

      // 3. Fetch privacy settings to show alignment
      if (window.desktop?.aiPrivacy?.getSettings) {
        const privRes = await window.desktop.aiPrivacy.getSettings({ projectId: projectId ?? undefined });
        if (privRes.ok) {
          setPrivacySettings(privRes.data);
        }
      }
    } catch (err) {
      setFeedback({
        type: 'danger',
        message: err instanceof Error ? err.message : 'Failed to fetch AI router settings.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveSettings = async () => {
    if (!window.desktop?.aiRouter?.updateFallbackSettings) return;
    setIsSaving(true);
    setFeedback(null);

    try {
      const res = await window.desktop.aiRouter.updateFallbackSettings({
        projectId: projectId ?? undefined,
        preferredProvider,
        preferredModel: preferredModel.trim() || undefined,
        fallbackPolicy,
        maxRetries,
        requestTimeoutMs,
      });

      if (res.ok) {
        setSettings(res.data);
        setFeedback({
          type: 'success',
          message: 'AI provider routing & fallback settings updated successfully.',
        });
      } else {
        setFeedback({
          type: 'danger',
          message: res.error.message || 'Failed to update fallback settings.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'danger',
        message: err instanceof Error ? err.message : 'Unexpected error updating settings.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getPolicyBadgeVariant = (policy: AiFallbackPolicyDto): BadgeVariant => {
    switch (policy) {
      case 'LOCAL_ONLY':
        return 'success';
      case 'CONFIGURED_PROVIDERS':
        return 'info';
      case 'ANY_ALLOWED_PROVIDER':
        return 'warning';
      case 'DISABLED':
      default:
        return 'neutral';
    }
  };

  const isLocalOnlyEnforced = privacySettings?.privacyMode === 'LOCAL_ONLY';

  return (
    <Card className="v9-ai-fallback-card border shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <span>🤖 AI Provider Switching & Fallback</span>
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground mt-1">
              Configure deterministic provider selection, retry bounds, and multi-provider fallback routing.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {settings && (
              <Badge variant={getPolicyBadgeVariant(settings.fallbackPolicy)} className="px-3 py-1 font-semibold text-xs">
                Policy: {settings.fallbackPolicy}
              </Badge>
            )}
            {isLocalOnlyEnforced && (
              <Badge variant="success" className="px-2 py-0.5 text-xs">
                🔒 Privacy: LOCAL_ONLY
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-2">
        {feedback && (
          <Alert
            variant={feedback.type}
            className="text-sm"
          >
            {feedback.message}
          </Alert>
        )}

        {isLocalOnlyEnforced && fallbackPolicy !== 'LOCAL_ONLY' && fallbackPolicy !== 'DISABLED' && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md text-amber-900 dark:text-amber-200 text-xs">
            ⚠️ <strong>Privacy Guard Active:</strong> The project is currently configured in <code>LOCAL_ONLY</code> mode. Any external remote fallback targets will be blocked at runtime.
          </div>
        )}

        {/* Available Providers Section */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Registered AI Providers</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {registry.length === 0 ? (
              <div className="text-xs text-muted-foreground col-span-2 p-2 border rounded">
                No providers registered or registry empty.
              </div>
            ) : (
              registry.map((item) => (
                <div
                  key={item.providerId}
                  className={`p-3 rounded-lg border text-sm flex flex-col justify-between ${
                    item.available ? 'bg-card border-border' : 'bg-muted/40 border-muted text-muted-foreground'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{item.displayName}</span>
                    <div className="flex items-center gap-1.5">
                      {item.isLocal ? (
                        <Badge variant="neutral" className="text-[10px] uppercase">Local</Badge>
                      ) : (
                        <Badge variant="info" className="text-[10px] uppercase">Remote</Badge>
                      )}
                      <Badge variant={item.available ? 'success' : 'danger'} className="text-[10px]">
                        {item.health.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground space-y-1">
                    <div>Priority: <span className="font-mono">{item.priority}</span></div>
                    <div>Models: <span className="font-mono">{item.models.length > 0 ? item.models.map(m => m.name).join(', ') : 'None detected'}</span></div>
                    <div>Capabilities: <span className="font-mono text-[11px]">{[
                      item.capabilities.streaming ? 'stream' : null,
                      item.capabilities.textGeneration ? 'text' : null,
                      item.capabilities.systemMessages ? 'system' : null,
                    ].filter(Boolean).join(', ') || 'basic'}</span></div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Configuration Form */}
        <div className="space-y-4 pt-2 border-t">
          <h4 className="text-sm font-semibold">Routing & Fallback Configuration</h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Preferred Provider */}
            <div>
              <label htmlFor="preferred-provider-select" className="block text-xs font-medium mb-1">
                Preferred Primary Provider
              </label>
              <select
                id="preferred-provider-select"
                className="w-full text-sm border rounded-md p-2 bg-background"
                value={preferredProvider}
                onChange={(e) => setPreferredProvider(e.target.value)}
                disabled={isLoading || isSaving}
              >
                {registry.map((p) => (
                  <option key={p.providerId} value={p.providerId}>
                    {p.displayName} ({p.isLocal ? 'Local' : 'Remote'})
                  </option>
                ))}
              </select>
            </div>

            {/* Preferred Model */}
            <div>
              <label htmlFor="preferred-model-input" className="block text-xs font-medium mb-1">
                Preferred Model (Optional Override)
              </label>
              <input
                id="preferred-model-input"
                type="text"
                placeholder="e.g. qwen2.5-coder:7b"
                className="w-full text-sm border rounded-md p-2 bg-background font-mono"
                value={preferredModel}
                onChange={(e) => setPreferredModel(e.target.value)}
                disabled={isLoading || isSaving}
              />
            </div>

            {/* Fallback Policy */}
            <div>
              <label htmlFor="fallback-policy-select" className="block text-xs font-medium mb-1">
                Fallback Policy
              </label>
              <select
                id="fallback-policy-select"
                className="w-full text-sm border rounded-md p-2 bg-background font-semibold"
                value={fallbackPolicy}
                onChange={(e) => setFallbackPolicy(e.target.value as AiFallbackPolicyDto)}
                disabled={isLoading || isSaving}
              >
                <option value="LOCAL_ONLY">LOCAL_ONLY (Local fallback only - safest)</option>
                <option value="CONFIGURED_PROVIDERS">CONFIGURED_PROVIDERS (Configured providers only)</option>
                <option value="ANY_ALLOWED_PROVIDER">ANY_ALLOWED_PROVIDER (Any compliant allowed provider)</option>
                <option value="DISABLED">DISABLED (Fail immediately without fallback)</option>
              </select>
            </div>

            {/* Max Retries */}
            <div>
              <label htmlFor="max-retries-input" className="block text-xs font-medium mb-1">
                Max Retries on Transient Error (per provider)
              </label>
              <input
                id="max-retries-input"
                type="number"
                min={0}
                max={5}
                className="w-full text-sm border rounded-md p-2 bg-background font-mono"
                value={maxRetries}
                onChange={(e) => setMaxRetries(parseInt(e.target.value, 10) || 0)}
                disabled={isLoading || isSaving}
              />
            </div>

            {/* Request Timeout */}
            <div>
              <label htmlFor="request-timeout-input" className="block text-xs font-medium mb-1">
                Request Timeout (milliseconds)
              </label>
              <input
                id="request-timeout-input"
                type="number"
                min={5000}
                max={300000}
                step={5000}
                className="w-full text-sm border rounded-md p-2 bg-background font-mono"
                value={requestTimeoutMs}
                onChange={(e) => setRequestTimeoutMs(parseInt(e.target.value, 10) || 60000)}
                disabled={isLoading || isSaving}
              />
            </div>
          </div>

          <div className="flex justify-end pt-3">
            <Button
              type="button"
              variant="primary"
              onClick={handleSaveSettings}
              disabled={isLoading || isSaving}
            >
              {isSaving ? 'Saving Policy...' : 'Save Routing Settings'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
