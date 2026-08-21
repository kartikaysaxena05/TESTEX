/**
 * @file apps/desktop/src/renderer/features/sources/RepositorySnapshotsCard.tsx
 * UI Card displaying repository snapshot baselines, fingerprints, and baseline management.
 */

import React, { useState } from 'react';
import type { RepositorySnapshotDto } from '@ai-quality/contracts';
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

export interface RepositorySnapshotsCardProps {
  readonly snapshots: readonly RepositorySnapshotDto[];
  readonly isLoading?: boolean;
  readonly onCreateSnapshot?: (label?: string | null) => void;
  readonly onSetBaseline?: (snapshotId: string) => void;
  readonly onDeleteSnapshot?: (snapshotId: string) => void;
}

export function RepositorySnapshotsCard({
  snapshots,
  isLoading = false,
  onCreateSnapshot,
  onSetBaseline,
  onDeleteSnapshot,
}: RepositorySnapshotsCardProps): React.JSX.Element {
  const [newLabel, setNewLabel] = useState<string>('');
  const [isCreating, setIsCreating] = useState<boolean>(false);

  const handleCreate = () => {
    if (onCreateSnapshot) {
      onCreateSnapshot(newLabel.trim() || null);
      setNewLabel('');
      setIsCreating(false);
    }
  };

  const activeBaseline = snapshots.find(s => s.isBaseline);

  return (
    <Card className="card-repository-snapshots">
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
            <CardTitle>Repository Snapshots &amp; Baselines</CardTitle>
            <div
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                marginTop: '2px',
              }}
            >
              Immutable captures of repository state for change detection
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <Badge variant={activeBaseline ? 'success' : 'warning'}>
              {activeBaseline
                ? `Baseline: ${activeBaseline.label ?? 'Active'}`
                : 'No Active Baseline'}
            </Badge>
            <Badge variant="neutral">{snapshots.length} Snapshots</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {isCreating ? (
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
                fontSize: 'var(--font-size-xs)',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                marginBottom: 'var(--space-xs)',
              }}
            >
              Create Snapshot from Current Index Run
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
              <Input
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="Baseline label (e.g. Sprint 12 Baseline, Initial Import)"
                style={{ maxWidth: '400px' }}
              />
              <Button variant="primary" size="sm" onClick={handleCreate} disabled={isLoading}>
                {isLoading ? 'Creating...' : 'Capture Baseline'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setIsCreating(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {snapshots.length === 0 ? (
          <div
            style={{
              padding: 'var(--space-md)',
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            No snapshots recorded yet. Capture a baseline snapshot to establish a fixed reference
            point for change detection.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--color-border-subtle)',
                    textAlign: 'left',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  <th style={{ padding: 'var(--space-xs) var(--space-sm)' }}>Label</th>
                  <th style={{ padding: 'var(--space-xs) var(--space-sm)' }}>Fingerprint</th>
                  <th style={{ padding: 'var(--space-xs) var(--space-sm)' }}>Files</th>
                  <th style={{ padding: 'var(--space-xs) var(--space-sm)' }}>Status</th>
                  <th style={{ padding: 'var(--space-xs) var(--space-sm)' }}>Created</th>
                  <th style={{ padding: 'var(--space-xs) var(--space-sm)', textAlign: 'right' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map(s => (
                  <tr
                    key={s.id}
                    style={{
                      borderBottom: '1px solid var(--color-border-subtle)',
                      background: s.isBaseline ? 'var(--color-bg-subtle, #eff6ff)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: 'var(--space-sm)' }}>
                      <strong>{s.label ?? 'Snapshot'}</strong>
                      {s.isBaseline && (
                        <Badge variant="success" style={{ marginLeft: '6px' }}>
                          Active Baseline
                        </Badge>
                      )}
                    </td>
                    <td
                      style={{
                        padding: 'var(--space-sm)',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                      }}
                    >
                      {s.fingerprint.substring(0, 12)}...
                    </td>
                    <td style={{ padding: 'var(--space-sm)' }}>
                      {`${s.fileCount} (${s.sourceFileCount} src, ${s.testFileCount} test)`}
                    </td>
                    <td style={{ padding: 'var(--space-sm)' }}>
                      <Badge variant={s.status === 'COMPLETE' ? 'neutral' : 'warning'}>
                        {s.status}
                      </Badge>
                    </td>
                    <td
                      style={{
                        padding: 'var(--space-sm)',
                        color: 'var(--color-text-muted)',
                        fontSize: '12px',
                      }}
                    >
                      {new Date(s.createdAt).toLocaleDateString()}{' '}
                      {new Date(s.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td style={{ padding: 'var(--space-sm)', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 'var(--space-xs)' }}>
                        {onSetBaseline && !s.isBaseline && (
                          <Button variant="secondary" size="sm" onClick={() => onSetBaseline(s.id)}>
                            Set Baseline
                          </Button>
                        )}
                        {onDeleteSnapshot && (
                          <Button variant="danger" size="sm" onClick={() => onDeleteSnapshot(s.id)}>
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
            Zero source code stored in database (file paths &amp; hashes only)
          </div>
          {onCreateSnapshot && !isCreating && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsCreating(true)}
              disabled={isLoading}
            >
              Capture Baseline Snapshot
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
