/**
 * @file apps/desktop/src/renderer/features/sources/RunConfigurationCard.tsx
 * UI Card for application run configuration, startup candidate selection, and target URL management.
 */

import React, { useState } from 'react';
import type { RunConfigurationProfileDto } from '@ai-quality/contracts';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  Badge,
  Button,
  Input,
} from '../../ui/index.js';

export interface RunConfigurationCardProps {
  readonly profile: RunConfigurationProfileDto | null;
  readonly isLoading?: boolean;
  readonly onDetect?: () => void;
  readonly onSelectCandidate?: (candidateId: string) => void;
  readonly onUpdateTargetUrl?: (targetUrl: string | null) => void;
}

export function RunConfigurationCard({
  profile,
  isLoading = false,
  onDetect,
  onSelectCandidate,
  onUpdateTargetUrl,
}: RunConfigurationCardProps): React.JSX.Element {
  const [targetUrlInput, setTargetUrlInput] = useState<string>(profile?.targetUrl ?? '');
  const [isEditingUrl, setIsEditingUrl] = useState<boolean>(false);

  const selected = profile?.selectedConfiguration;

  const handleSaveUrl = () => {
    if (onUpdateTargetUrl) {
      onUpdateTargetUrl(targetUrlInput.trim() || null);
      setIsEditingUrl(false);
    }
  };

  if (!profile || (!selected && profile.candidates.length === 0)) {
    return (
      <Card className="card-run-configuration">
        <CardHeader>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
            }}
          >
            <CardTitle>Application Run &amp; Startup Configuration</CardTitle>
            <Badge variant="neutral">Not Configured</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div
            style={{
              padding: 'var(--space-md)',
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            No startup configuration detected. Run configuration discovery to determine working
            directory, executable tooling, and development startup candidates.
          </div>
        </CardContent>
        {onDetect && (
          <CardFooter>
            <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
              <Button variant="primary" size="sm" onClick={onDetect} disabled={isLoading}>
                {isLoading ? 'Detecting...' : 'Detect Run Configuration'}
              </Button>
            </div>
          </CardFooter>
        )}
      </Card>
    );
  }

  return (
    <Card className="card-run-configuration">
      <CardHeader>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
          }}
        >
          <div>
            <CardTitle>Application Run &amp; Startup Configuration</CardTitle>
            <div
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                marginTop: '2px',
              }}
            >
              Structured non-shell execution candidate metadata (shell: false)
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            {selected && (
              <Badge variant={selected.safety === 'SAFE_STRUCTURE' ? 'success' : 'warning'}>
                {selected.safety === 'SAFE_STRUCTURE' ? 'Safe Structure' : 'Requires Review'}
              </Badge>
            )}
            <Badge variant={selected ? 'info' : 'neutral'}>
              {selected?.source === 'USER_SELECTED' ? 'User Configured' : 'Detected'}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Active Configuration Details */}
        {selected ? (
          <div
            style={{
              padding: 'var(--space-md)',
              background: 'var(--color-bg-subtle, #f8fafc)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-subtle)',
              marginBottom: 'var(--space-md)',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 'var(--space-md)',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-muted)',
                    fontWeight: 600,
                  }}
                >
                  Executable &amp; Arguments
                </div>
                <div style={{ marginTop: '2px' }}>
                  <code style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                    {`${selected.executable} ${selected.args.join(' ')}`}
                  </code>
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-muted)',
                    fontWeight: 600,
                  }}
                >
                  Working Directory
                </div>
                <div style={{ marginTop: '2px', fontSize: 'var(--font-size-sm)' }}>
                  <code>{selected.workingDirectory}</code>
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-muted)',
                    fontWeight: 600,
                  }}
                >
                  Runtime &amp; Package Manager
                </div>
                <div
                  style={{
                    marginTop: '2px',
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {selected.runtime ?? 'Unknown'} • {selected.packageManager ?? 'None'}
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-muted)',
                    fontWeight: 600,
                  }}
                >
                  Execution Safety
                </div>
                <div style={{ marginTop: '2px', fontSize: 'var(--font-size-sm)' }}>
                  <span
                    style={{
                      color:
                        selected.safety === 'SAFE_STRUCTURE'
                          ? 'var(--color-success, #16a34a)'
                          : 'var(--color-warning, #d97706)',
                    }}
                  >
                    {selected.safety}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-muted)',
              marginBottom: 'var(--space-md)',
            }}
          >
            No active candidate selected. Choose a candidate below.
          </div>
        )}

        {/* Target URL Configuration */}
        <div style={{ marginBottom: 'var(--space-md)' }}>
          <div
            style={{
              fontSize: 'var(--font-size-xs)',
              fontWeight: 600,
              color: 'var(--color-text-secondary)',
              marginBottom: 'var(--space-xs)',
            }}
          >
            Target Application URL (HTTP / HTTPS)
          </div>
          {isEditingUrl ? (
            <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
              <Input
                value={targetUrlInput}
                onChange={e => setTargetUrlInput(e.target.value)}
                placeholder="http://localhost:3000"
                style={{ maxWidth: '360px' }}
              />
              <Button variant="primary" size="sm" onClick={handleSaveUrl}>
                Save
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setIsEditingUrl(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
              <code style={{ fontSize: 'var(--font-size-sm)' }}>
                {profile.targetUrl ?? 'Not configured (null)'}
              </code>
              {onUpdateTargetUrl && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setTargetUrlInput(profile.targetUrl ?? '');
                    setIsEditingUrl(true);
                  }}
                >
                  Configure URL
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Startup Candidates List */}
        {profile.candidates.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 'var(--font-size-xs)',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                marginBottom: 'var(--space-xs)',
              }}
            >
              Discovered Startup Candidates
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
              {profile.candidates.map(c => {
                const isCurrent =
                  selected?.executable === c.executable &&
                  selected.args.join(' ') === c.args.join(' ') &&
                  selected.workingDirectory === c.workingDirectory;
                return (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 'var(--space-sm) var(--space-md)',
                      borderRadius: 'var(--radius-md)',
                      border: isCurrent
                        ? '2px solid var(--color-primary, #3b82f6)'
                        : '1px solid var(--color-border-subtle)',
                      background: isCurrent ? 'var(--color-bg-subtle, #eff6ff)' : 'transparent',
                    }}
                  >
                    <div>
                      <code>
                        {c.executable} {c.args.join(' ')}
                      </code>
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--color-text-muted)',
                          marginLeft: '8px',
                        }}
                      >
                        (cwd: {c.workingDirectory})
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                      <Badge variant={c.safety === 'SAFE_STRUCTURE' ? 'success' : 'warning'}>
                        {c.safety}
                      </Badge>
                      {onSelectCandidate && !isCurrent && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onSelectCandidate(c.id)}
                        >
                          Select
                        </Button>
                      )}
                      {isCurrent && <Badge variant="info">Active</Badge>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
          }}
        >
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Target execution deferred to future process runner (0 target processes launched in Phase
            26)
          </div>
          {onDetect && (
            <Button variant="secondary" size="sm" onClick={onDetect} disabled={isLoading}>
              {isLoading ? 'Detecting...' : 'Re-detect Configuration'}
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
