/**
 * @file apps/desktop/src/renderer/features/project-context/ProjectContextCard.tsx
 * Authoritative Project Context & Source Detection dashboard card for V8 Desktop Shell.
 *
 * CRITICAL REQUIREMENTS (Phase 123):
 * 1. Displays connected sources (Website, Git, Local Folder) and connection statuses.
 * 2. Displays detected framework, programming language, package manager, and entry points.
 * 3. Displays target environment, browser configuration, and authentication status.
 * 4. Displays context lifecycle state (CONNECTED, PARTIAL, STALE, INVALID, ERROR) and freshness.
 * 5. Provides explicit actions: Refresh, Run Detection, Invalidate Stale Context, View Details.
 * 6. ZERO secrets or credentials displayed. All passwords redacted.
 */

import React, { useState } from 'react';
import type { ProjectContextDto, ProjectContextLifecycleState } from '@ai-quality/contracts';
import { Card, CardContent } from '../../ui/Card.js';
import { Badge } from '../../ui/Badge.js';
import { Button } from '../../ui/Button.js';
import { Spinner } from '../../ui/Spinner.js';
import { Alert } from '../../ui/Alert.js';
import { useProjectContext } from './useProjectContext.js';

export interface ProjectContextCardProps {
  readonly projectId: string;
  readonly initialContext?: ProjectContextDto | null;
  readonly defaultExpanded?: boolean;
  readonly onContextChanged?: (context: ProjectContextDto) => void;
}

export function ProjectContextCard({
  projectId,
  initialContext,
  defaultExpanded = false,
  onContextChanged,
}: ProjectContextCardProps): React.JSX.Element {
  const {
    context: liveContext,
    isLoading,
    isRefreshing,
    isDetecting,
    error,
    refresh,
    detect,
    invalidate,
  } = useProjectContext(projectId);

  const [showSafeDetails, setShowSafeDetails] = useState<boolean>(defaultExpanded);
  const context = liveContext ?? initialContext;

  const getLifecycleBadgeVariant = (
    state: ProjectContextLifecycleState,
  ): 'success' | 'warning' | 'danger' | 'neutral' => {
    switch (state) {
      case 'CONNECTED':
        return 'success';
      case 'PARTIAL':
      case 'STALE':
        return 'warning';
      case 'INVALID':
      case 'ERROR':
        return 'danger';
      case 'REFRESHING':
      default:
        return 'neutral';
    }
  };

  const handleRefresh = async () => {
    await refresh();
    if (liveContext && onContextChanged) {
      onContextChanged(liveContext);
    }
  };

  const handleDetect = async () => {
    await detect();
    if (liveContext && onContextChanged) {
      onContextChanged(liveContext);
    }
  };

  const handleInvalidate = async () => {
    await invalidate('Manual invalidation from desktop dashboard');
    if (liveContext && onContextChanged) {
      onContextChanged(liveContext);
    }
  };

  if (isLoading && !context) {
    return (
      <Card className="codex-card project-context-card" data-testid="project-context-card-loading">
        <CardContent className="flex items-center justify-center p-6 gap-3">
          <Spinner size="md" />
          <span className="text-sm text-muted">Loading unified project context...</span>
        </CardContent>
      </Card>
    );
  }

  if (!context) {
    return (
      <Card className="codex-card project-context-card" data-testid="project-context-card-empty">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-primary">Unified Project Context</h3>
              <p className="text-xs text-muted mt-1">No unified context found for this project.</p>
            </div>
            <Button size="sm" variant="primary" onClick={handleDetect} disabled={isDetecting}>
              {isDetecting ? <Spinner size="sm" /> : 'Detect Sources'}
            </Button>
          </div>
          {error && (
            <Alert variant="danger" className="mt-3">
              {error}
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  }

  const { sources, target, authentication, detectedTechnology, freshness, lifecycleState } =
    context;

  const connectedSourcesCount = [
    Boolean(sources.website),
    Boolean(sources.git),
    Boolean(sources.localFolder),
  ].filter(Boolean).length;

  return (
    <Card
      className="codex-card project-context-card"
      data-testid="project-context-card"
      data-lifecycle-state={lifecycleState}
    >
      <CardContent className="p-5">
        {/* HEADER SECTION */}
        <div className="flex items-center justify-between pb-4 border-b border-subtle">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-subtle flex items-center justify-center text-primary font-bold">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-primary">Unified Project Context</h3>
                <Badge
                  variant={getLifecycleBadgeVariant(lifecycleState)}
                  data-testid="project-context-lifecycle-badge"
                >
                  {lifecycleState}
                </Badge>
                {freshness.isStale && (
                  <Badge variant="warning" data-testid="project-context-stale-badge">
                    STALE
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted mt-0.5">
                {`${connectedSourcesCount} ${connectedSourcesCount === 1 ? 'source' : 'sources'} connected • Last refreshed ${new Date(freshness.lastRefreshedAt).toLocaleTimeString()}`}
              </p>
            </div>
          </div>

          {/* ACTIONS */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowSafeDetails(!showSafeDetails)}
              data-testid="toggle-context-details-btn"
            >
              {showSafeDetails ? 'Hide Details' : 'View Details'}
            </Button>
            {!freshness.isStale && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleInvalidate}
                title="Mark context as stale to trigger re-sync"
                data-testid="invalidate-context-btn"
              >
                Mark Stale
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={handleDetect}
              disabled={isDetecting || isRefreshing}
              data-testid="detect-sources-btn"
            >
              {isDetecting ? (
                <>
                  <Spinner size="sm" className="mr-1" /> Detecting...
                </>
              ) : (
                'Run Detection'
              )}
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleRefresh}
              disabled={isRefreshing || isDetecting}
              data-testid="refresh-context-btn"
            >
              {isRefreshing ? (
                <>
                  <Spinner size="sm" className="mr-1" /> Refreshing...
                </>
              ) : (
                'Refresh Context'
              )}
            </Button>
          </div>
        </div>

        {/* WARNINGS & STALE REASONS */}
        {freshness.staleReasons.length > 0 && (
          <Alert
            variant="warning"
            className="mt-3 text-xs"
            data-testid="context-stale-reasons-alert"
          >
            <span className="font-semibold">Context is stale:</span>{' '}
            {freshness.staleReasons.join(', ')}
          </Alert>
        )}

        {context.warnings.length > 0 && (
          <Alert variant="warning" className="mt-3 text-xs" data-testid="context-warnings-alert">
            <span className="font-semibold">Warnings:</span> {context.warnings.join(' • ')}
          </Alert>
        )}

        {context.errors.length > 0 && (
          <Alert variant="danger" className="mt-3 text-xs" data-testid="context-errors-alert">
            <span className="font-semibold">Errors:</span> {context.errors.join(' • ')}
          </Alert>
        )}

        {/* SUMMARY GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          {/* CONNECTED SOURCES */}
          <div className="p-3 bg-subtle rounded-md border border-subtle">
            <span className="text-xs font-semibold text-secondary uppercase tracking-wider block mb-2">
              Connected Sources
            </span>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted">Website Target:</span>
                {sources.website ? (
                  <Badge variant="success">{sources.website.connectionStatus}</Badge>
                ) : (
                  <span className="text-muted italic">Not configured</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Git Repository:</span>
                {sources.git ? (
                  <Badge variant="success">
                    {sources.git.repositoryName} ({sources.git.selectedBranch ?? 'main'})
                  </Badge>
                ) : (
                  <span className="text-muted italic">Not configured</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Local Folder:</span>
                {sources.localFolder ? (
                  <Badge variant={sources.localFolder.isAvailable ? 'success' : 'danger'}>
                    {sources.localFolder.isAvailable ? 'Available' : 'Missing'}
                  </Badge>
                ) : (
                  <span className="text-muted italic">Not configured</span>
                )}
              </div>
            </div>
          </div>

          {/* DETECTED TECH */}
          <div className="p-3 bg-subtle rounded-md border border-subtle">
            <span className="text-xs font-semibold text-secondary uppercase tracking-wider block mb-2">
              Detected Stack
            </span>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted">Primary Language:</span>
                <span className="font-medium text-primary">
                  {detectedTechnology?.primaryLanguage ?? 'Undetected'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Frameworks:</span>
                <span className="font-medium text-primary truncate max-w-[150px]">
                  {detectedTechnology?.frameworks && detectedTechnology.frameworks.length > 0
                    ? detectedTechnology.frameworks.join(', ')
                    : 'None detected'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Test Framework:</span>
                <span className="font-medium text-primary">
                  {detectedTechnology?.testFramework ?? 'None detected'}
                </span>
              </div>
            </div>
          </div>

          {/* TARGET & AUTH */}
          <div className="p-3 bg-subtle rounded-md border border-subtle">
            <span className="text-xs font-semibold text-secondary uppercase tracking-wider block mb-2">
              Target & Authentication
            </span>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted">Target URL:</span>
                <span
                  className="font-mono text-primary truncate max-w-[150px]"
                  title={target.baseUrl ?? ''}
                >
                  {target.baseUrl ?? 'Not set'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Browser Target:</span>
                <span className="font-medium text-primary">
                  {target.browser?.browserEngine ?? 'chromium'} (
                  {target.browser?.headless ? 'headless' : 'windowed'})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Auth Configuration:</span>
                <div className="flex items-center gap-1.5">
                  {authentication.profiles[0]?.username && (
                    <span className="text-xs text-secondary font-mono">
                      {authentication.profiles[0].username}
                    </span>
                  )}
                  <Badge variant={authentication.status === 'VERIFIED' ? 'success' : 'neutral'}>
                    {authentication.status} ({authentication.profiles.length})
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* EXPANDABLE SAFE DETAILS DRAWER */}
        {showSafeDetails && (
          <div
            className="mt-4 pt-4 border-t border-subtle space-y-3"
            data-testid="context-details-drawer"
          >
            <h4 className="text-xs font-semibold text-secondary uppercase tracking-wider">
              Authoritative Provenance Details (Redacted & Read-Only)
            </h4>

            {/* Entry Points & Config Files */}
            {detectedTechnology && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 bg-background rounded border border-subtle">
                  <span className="font-semibold block mb-1">Likely Entry Points:</span>
                  {detectedTechnology.likelyEntryPoints.length > 0 ? (
                    <ul className="list-disc list-inside space-y-0.5 font-mono text-muted">
                      {detectedTechnology.likelyEntryPoints.map(ep => (
                        <li key={ep} className="truncate">
                          {ep}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-muted italic">None detected</span>
                  )}
                </div>

                <div className="p-2.5 bg-background rounded border border-subtle">
                  <span className="font-semibold block mb-1">Configuration & Test Dirs:</span>
                  <div className="space-y-1 font-mono text-muted">
                    <div>
                      <span className="text-secondary">Configs:</span>{' '}
                      {detectedTechnology.configurationFiles.join(', ') || 'None'}
                    </div>
                    <div>
                      <span className="text-secondary">Tests:</span>{' '}
                      {detectedTechnology.testDirectories.join(', ') || 'None'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Configured Auth Profiles (Safely Masked) */}
            {authentication.profiles.length > 0 && (
              <div className="p-2.5 bg-background rounded border border-subtle text-xs">
                <span className="font-semibold block mb-1.5">
                  Authentication Profiles (Passwords Redacted):
                </span>
                <div className="space-y-1">
                  {authentication.profiles.map(p => (
                    <div key={p.id} className="flex items-center justify-between py-0.5">
                      <span className="font-medium text-primary">
                        {p.name} ({p.strategy})
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted">{p.username ?? 'No username'}</span>
                        <span className="font-mono text-muted">••••••••</span>
                        <Badge variant={p.status === 'VALID' ? 'success' : 'neutral'}>
                          {p.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
