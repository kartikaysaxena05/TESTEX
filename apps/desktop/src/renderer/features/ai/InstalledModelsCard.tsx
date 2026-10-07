/**
 * @file apps/desktop/src/renderer/features/ai/InstalledModelsCard.tsx
 * Desktop UI Component for V9 Phase 128: Installed Model Discovery.
 * Displays discovered local and configured AI models, normalized metadata,
 * size, parameters, family, quantization, and allows manual cache refresh.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  AiModelDto,
  ModelCapabilitiesProfileDto,
  ModelSelectionResultDto,
  ModelCapabilityType,
} from '@ai-quality/contracts';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  Button,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Alert,
  Spinner,
  EmptyState,
} from '../../ui/index.js';

export interface InstalledModelsCardProps {
  readonly projectId?: string | null;
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const clampedIndex = Math.min(i, units.length - 1);
  const size = bytes / Math.pow(1024, clampedIndex);
  return `${size.toFixed(1)} ${units[clampedIndex]}`;
}

function formatDate(isoDate?: string | null): string {
  if (!isoDate) return '—';
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

const DISPLAY_CAPABILITIES: readonly { key: ModelCapabilityType; label: string }[] = [
  { key: 'TEXT_GENERATION', label: 'Text' },
  { key: 'CHAT', label: 'Chat' },
  { key: 'STREAMING', label: 'Stream' },
  { key: 'JSON_OUTPUT', label: 'JSON' },
  { key: 'TOOL_CALLING', label: 'Tools' },
  { key: 'CODE_GENERATION', label: 'Code' },
  { key: 'VISION', label: 'Vision' },
];

export function InstalledModelsCard({ projectId }: InstalledModelsCardProps): React.JSX.Element {
  const [models, setModels] = useState<readonly AiModelDto[]>([]);
  const [capabilitiesMap, setCapabilitiesMap] = useState<Record<string, ModelCapabilitiesProfileDto>>({});
  const [currentSelection, setCurrentSelection] = useState<ModelSelectionResultDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [probingModelId, setProbingModelId] = useState<string | null>(null);
  const [selectingModelId, setSelectingModelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const fetchCapabilitiesAndSelection = useCallback(
    async (fetchedModels: readonly AiModelDto[]) => {
      const desktop = window.desktop;
      if (!desktop?.aiModels) return;

      // Fetch capabilities in parallel for all models
      const capPromises = fetchedModels.map(async (m) => {
        try {
          const capRes = await desktop.aiModels.getCapabilities({
            projectId,
            modelId: m.id,
          });
          if (capRes.ok) {
            return { modelId: m.id, profile: capRes.data };
          }
        } catch {
          // Ignore individual capability load failure
        }
        return null;
      });

      const capResults = await Promise.all(capPromises);
      const newCapMap: Record<string, ModelCapabilitiesProfileDto> = {};
      for (const res of capResults) {
        if (res) {
          newCapMap[res.modelId] = res.profile;
        }
      }
      setCapabilitiesMap(newCapMap);

      // Fetch current project selection if project is specified
      if (projectId) {
        try {
          const selRes = await desktop.aiModels.getSelection({
            projectId,
            selectionType: 'DEFAULT',
          });
          if (selRes.ok) {
            setCurrentSelection(selRes.data);
          }
        } catch {
          // Ignore selection fetch error
        }
      }
    },
    [projectId],
  );

  const fetchModels = useCallback(async (forceRefresh = false) => {
    if (!window.desktop?.aiModels) {
      setIsLoading(false);
      return;
    }

    if (forceRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);
    setActionMessage(null);

    try {
      const res = forceRefresh
        ? await window.desktop.aiModels.refresh({ projectId })
        : await window.desktop.aiModels.list({ projectId });

      if (res.ok) {
        setModels(res.data.models);
        setLastRefreshedAt(new Date(res.data.refreshedAt));
        void fetchCapabilitiesAndSelection(res.data.models);
      } else {
        setError(res.error.message || 'Failed to discover installed models.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error during model discovery.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [projectId, fetchCapabilitiesAndSelection]);

  useEffect(() => {
    void fetchModels(false);
  }, [fetchModels]);

  const handleRefresh = () => {
    void fetchModels(true);
  };

  const handleVerifyCapabilities = async (modelId: string) => {
    if (!window.desktop?.aiModels) return;
    setProbingModelId(modelId);
    setError(null);
    setActionMessage(null);

    try {
      const res = await window.desktop.aiModels.verifyCapabilities({
        projectId,
        modelId,
      });
      if (res.ok) {
        setCapabilitiesMap((prev) => ({
          ...prev,
          [modelId]: res.data,
        }));
        setActionMessage(`Verified capabilities for ${res.data.modelName}.`);
      } else {
        setError(res.error.message || 'Capability verification probe failed.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Capability verification probe failed.');
    } finally {
      setProbingModelId(null);
    }
  };

  const handleSelectDefault = async (modelId: string) => {
    if (!window.desktop?.aiModels || !projectId) return;
    setSelectingModelId(modelId);
    setError(null);
    setActionMessage(null);

    try {
      const res = await window.desktop.aiModels.select({
        projectId,
        selectionType: 'DEFAULT',
        modelId,
      });
      if (res.ok) {
        setCurrentSelection(res.data);
        setActionMessage(`Set ${res.data.selectedModel.name} as the default model.`);
      } else {
        setError(res.error.message || 'Failed to select model.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select model.');
    } finally {
      setSelectingModelId(null);
    }
  };

  return (
    <Card variant="default">
      <CardHeader>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <CardTitle level={2}>Installed AI Models & Capabilities</CardTitle>
            <CardDescription>
              Discovered local and configured provider models with capability detection and project assignment.
            </CardDescription>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {error ? (
              <Badge variant="danger" dot>
                Unavailable
              </Badge>
            ) : isLoading ? (
              <Badge variant="neutral" dot>
                Discovering...
              </Badge>
            ) : (
              <Badge variant={models.length > 0 ? 'success' : 'neutral'} dot>
                {models.length} {models.length === 1 ? 'Model' : 'Models'}
              </Badge>
            )}
            <Button
              variant="secondary"
              size="sm"
              loading={isLoading || isRefreshing}
              onClick={handleRefresh}
              aria-label="Refresh installed models"
            >
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {actionMessage && (
          <div style={{ marginBottom: '1rem' }}>
            <Alert variant="info" title="AI Model Status">
              {actionMessage}
            </Alert>
          </div>
        )}
        {isLoading && !isRefreshing ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2rem 1rem',
              gap: '0.75rem',
              color: 'var(--text-secondary)',
            }}
          >
            <Spinner size="md" />
            <span>Discovering installed AI models...</span>
          </div>
        ) : error ? (
          <Alert variant="danger" title="Model Operation Failed">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span>{error}</span>
              <div>
                <Button variant="secondary" size="sm" onClick={handleRefresh}>
                  Retry Discovery
                </Button>
              </div>
            </div>
          </Alert>
        ) : models.length === 0 ? (
          <EmptyState
            title="No AI Models Installed"
            description="No local models were discovered. Run 'ollama pull <model>' (for example, 'ollama pull llama3.2') in your terminal to download models."
            action={
              <Button variant="secondary" size="sm" onClick={handleRefresh}>
                Check Again
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model Name</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Parameters</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Capabilities</TableHead>
                <TableHead>Selection</TableHead>
                <TableHead style={{ textAlign: 'right' }}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.map((model) => {
                const profile = capabilitiesMap[model.id];
                const isSelected = currentSelection?.selectedModel.id === model.id;
                const isProbing = probingModelId === model.id;
                const isSelecting = selectingModelId === model.id;

                return (
                  <TableRow key={model.id}>
                    <TableCell style={{ fontWeight: 600 }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span>{model.name}</span>
                          {isSelected && (
                            <Badge variant="success" dot>
                              Project Default
                            </Badge>
                          )}
                        </div>
                        {model.digest && (
                          <span
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--text-tertiary)',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {model.digest.slice(0, 12)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral">{model.provider}</Badge>
                    </TableCell>
                    <TableCell>
                      {model.parameters || model.family || '—'}
                    </TableCell>
                    <TableCell style={{ fontFamily: 'var(--font-mono)' }}>
                      {formatBytes(model.size)}
                    </TableCell>
                    <TableCell>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', maxWidth: '280px' }}>
                        {DISPLAY_CAPABILITIES.map((cap) => {
                          const capDetail = profile?.capabilities[cap.key];
                          const status = capDetail?.status ?? 'UNKNOWN';

                          if (status === 'SUPPORTED') {
                            return (
                              <Badge
                                key={cap.key}
                                variant="success"
                                title={`${cap.key}: Supported (${capDetail?.source ?? 'inferred'})`}
                              >
                                {cap.label}
                              </Badge>
                            );
                          }
                          if (status === 'UNSUPPORTED') {
                            return null;
                          }
                          return (
                            <Badge
                              key={cap.key}
                              variant="neutral"
                              title={`${cap.key}: Unverified (${capDetail?.source ?? 'unknown'})`}
                            >
                              ? {cap.label}
                            </Badge>
                          );
                        })}
                      </div>
                    </TableCell>
                    <TableCell>
                      {isSelected ? (
                        <span style={{ fontSize: '0.85rem', color: 'var(--color-success-text, #10b981)', fontWeight: 500 }}>
                          Active Default
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                          Available
                        </span>
                      )}
                    </TableCell>
                    <TableCell style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={isProbing}
                          disabled={isProbing || isSelecting}
                          onClick={() => void handleVerifyCapabilities(model.id)}
                          title="Run safe capability probes (text, streaming, JSON, tools)"
                        >
                          Verify
                        </Button>
                        {projectId && !isSelected && (
                          <Button
                            variant="primary"
                            size="sm"
                            loading={isSelecting}
                            disabled={isProbing || isSelecting}
                            onClick={() => void handleSelectDefault(model.id)}
                          >
                            Set Default
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <CardFooter>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            width: '100%',
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
          }}
        >
          <span>
            {lastRefreshedAt
              ? `Last refreshed: ${lastRefreshedAt.toLocaleTimeString()}`
              : 'Discovery pending'}
          </span>
          <span>Discovery cached for 30s. Click Refresh to force reload.</span>
        </div>
      </CardFooter>
    </Card>
  );
}
